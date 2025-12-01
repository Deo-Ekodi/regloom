// src/fhe.ts (Fixed)

/**
 * fhe.ts
 * FHE encryption wrappers using Zama's node-tfhe library.
 * Handles key generation/persistence, encryption, and decryption of PII.
 * Supports strings (as UTF-8 bytes) and small numbers (uint8).
 * Keys are persisted to files via env paths for reuse.
 * Errors are logged and thrown for handling upstream.
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import * as TFHE from 'node-tfhe'; // import whole module and detect shapes at runtime
import { logger } from '@regloom/utils';

const CLIENT_KEY_PATH =
    process.env.FHE_CLIENT_KEY_PATH || path.join(__dirname, '../../keys/client.key');
const PUBLIC_KEY_PATH =
    process.env.FHE_PUBLIC_KEY_PATH || path.join(__dirname, '../../keys/public.key');

type AnyObj = any;

/**
 * Helper conversions and runtime API detection.
 */
function toUint8Array(data: Buffer | Uint8Array): Uint8Array {
    if (data instanceof Uint8Array) return data;
    return new Uint8Array(data);
}
function toBuffer(u8: Uint8Array | Buffer): Buffer {
    if (Buffer.isBuffer(u8)) return u8;
    return Buffer.from(u8);
}

/**
 * Deserialize helper that tries common method names used by tfhe-wasm wrappers.
 * Returns the deserialized object or throws if not possible.
 */
function tryDeserialize(ctor: AnyObj, buf: Uint8Array): AnyObj {
    // Try common function names in order (deserialize, from_bytes, from_u8_slice, from)
    if (!ctor) throw new Error('No constructor provided to tryDeserialize');

    const attempts = [
        // wasm bindings sometimes export `deserialize` as static fn
        (c: AnyObj) => (typeof c.deserialize === 'function' ? c.deserialize(buf) : undefined),
        // or from_bytes / from
        (c: AnyObj) => (typeof c.from_bytes === 'function' ? c.from_bytes(buf) : undefined),
        (c: AnyObj) => (typeof c.from === 'function' ? c.from(buf) : undefined),
        (c: AnyObj) => (typeof c['from_u8_slice'] === 'function' ? c['from_u8_slice'](buf) : undefined),
        // sometimes the API expects a normal constructor that accepts bytes
        (c: AnyObj) => {
            try {
                return new c(buf);
            } catch {
                return undefined;
            }
        },
    ];

    for (const attempt of attempts) {
        try {
            const res = attempt(ctor);
            if (res !== undefined && res !== null) return res;
        } catch (err) {
            // continue to next attempt
        }
    }

    throw new Error(`Could not deserialize with provided constructor: ${ctor?.name || 'unknown'}`);
}

/**
 * Serialize helper. Tries common method names (.serialize(), .to_bytes(), .to_u8(), .to_vec()).
 */
function trySerialize(obj: AnyObj): Uint8Array {
    if (!obj) throw new Error('No object provided to trySerialize');

    const attempts = [
        (o: AnyObj) => (typeof o.serialize === 'function' ? o.serialize() : undefined),
        (o: AnyObj) => (typeof o.to_bytes === 'function' ? o.to_bytes() : undefined),
        (o: AnyObj) => (typeof o.to_u8 === 'function' ? o.to_u8() : undefined),
        (o: AnyObj) => (typeof o.to_vec === 'function' ? o.to_vec() : undefined),
    ];

    for (const attempt of attempts) {
        try {
            const res = attempt(obj);
            if (res !== undefined && res !== null) return toUint8Array(res);
        } catch {
            // continue
        }
    }

    // As last resort: if the object is already a Uint8Array/Buffer
    if (obj instanceof Uint8Array) return obj;
    if (Buffer.isBuffer(obj)) return new Uint8Array(obj);

    throw new Error('Could not serialize object: no known serializer found.');
}

/**
 * Try to call a builder and push bytes. This is defensive: different tfhe versions
 * use different builder/push method names.
 */
function buildCompactListFromBytes(publicKey: AnyObj, bytes: Uint8Array): AnyObj {
    if (!publicKey) throw new Error('publicKey is required for building compact list');

    const CompactCiphertextListCtor = (TFHE as AnyObj).CompactCiphertextList || (TFHE as AnyObj).CompactFheUint8List;

    if (!CompactCiphertextListCtor) {
        // Some bindings expose a factory function instead of a ctor
        const maybeCtor = (TFHE as AnyObj).CompactFheUint8List || (TFHE as AnyObj).CompactCiphertextList;
        if (!maybeCtor) throw new Error('CompactCiphertextList constructor not found in TFHE module');
    }

    // Try the builder static method first
    let builder: AnyObj | undefined;
    const CCL = CompactCiphertextListCtor as AnyObj;

    if (typeof CCL.builder === 'function') {
        builder = CCL.builder(publicKey);
    } else {
        // Some APIs provide a `new CompactCiphertextList.Builder(publicKey)` or `new CompactCiphertextList(publicKey)`
        try {
            builder = (CCL as any).Builder ? new (CCL as any).Builder(publicKey) : undefined;
        } catch {
            builder = undefined;
        }
    }

    if (!builder) {
        // fallback: maybe we can directly construct a CompactCiphertextList and call push on it
        try {
            const list = new CCL(publicKey);
            // push bytes later on
            builder = list;
        } catch (err) {
            throw new Error('Could not create builder for CompactCiphertextList: ' + String(err));
        }
    }

    // decide method name to push a byte or integer
    const pushMethods = ['push_u256', 'push_u32', 'push', 'push_u8', 'push_u64'];

    for (const b of bytes) {
        let pushed = false;
        for (const m of pushMethods) {
            try {
                if (typeof builder[m] === 'function') {
                    // Most wasm bindings expect BigInt for wide pushes; use BigInt for numbers
                    const arg = m.includes('u') && m.includes('256') ? BigInt(b) : b;
                    builder[m](arg);
                    pushed = true;
                    break;
                }
            } catch {
                // ignore and try next method name
            }
        }
        if (!pushed) {
            // maybe builder has a generic 'push' that expects a Uint8Array chunk
            if (typeof builder.push === 'function') {
                builder.push(b);
            } else {
                throw new Error('No builder push method available for CompactCiphertextList builder');
            }
        }
    }

    // build/finish
    if (typeof builder.build === 'function') {
        return builder.build();
    }
    if (typeof builder.finish === 'function') {
        return builder.finish();
    }
    // maybe builder is already the final object
    return builder;
}

/**
 * Expand a compact ciphertext list into an iterable expander.
 */
function expandCompactList(compactList: AnyObj): AnyObj {
    if (!compactList) throw new Error('compactList required for expandCompactList');
    if (typeof compactList.expand === 'function') return compactList.expand();
    if (typeof compactList.to_expanded === 'function') return compactList.to_expanded();
    // fallback: maybe compactList itself is already expanded
    return compactList;
}

/**
 * Try to get length of an expander
 */
function expanderLen(expanded: AnyObj): number {
    if (typeof expanded.len === 'function') return expanded.len();
    if (typeof expanded.length === 'number') return expanded.length;
    if (Array.isArray(expanded)) return expanded.length;
    throw new Error('Cannot determine length of expanded CompactCiphertextList');
}

/**
 * Try to get item i from expander
 */
function expanderGet(expanded: AnyObj, i: number): AnyObj {
    if (typeof expanded.get === 'function') return expanded.get(i);
    if (Array.isArray(expanded)) return expanded[i];
    if (typeof expanded.item === 'function') return expanded.item(i);
    throw new Error('Cannot get item from expanded list');
}

/**
 * Try decrypting a ciphertext object with available methods.
 */
function tryDecryptCiphertext(ct: AnyObj, clientKey: AnyObj): bigint | number {
    // common method: ct.decrypt(clientKey)
    if (ct === undefined || ct === null) throw new Error('ciphertext is null');
    if (typeof ct.decrypt === 'function') {
        // some bindings return BigInt or number
        try {
            return ct.decrypt(clientKey);
        } catch {
            // fallthrough
        }
    }

    // alternate: clientKey.decrypt(ct)
    if (clientKey && typeof clientKey.decrypt === 'function') {
        return clientKey.decrypt(ct);
    }

    // last resort: try ct.to_plaintext or ct.plaintext
    if (typeof ct.to_plaintext === 'function') return ct.to_plaintext();

    throw new Error('No decrypt function available for ciphertext');
}

/**
 * Ensures tfhe keys exist (read from disk or generate new).
 * We are defensive about exported names: some versions call things TfheClientKey, ClientKey, etc.
 */
async function ensureKeys(): Promise<{ clientKey: AnyObj; publicKey: AnyObj }> {
    // find client/public key types from module
    const ClientKeyCtor = (TFHE as AnyObj).TfheClientKey || (TFHE as AnyObj).ClientKey || (TFHE as AnyObj).TfheClientKey;
    const CompactPublicKeyCtor =
        (TFHE as AnyObj).TfheCompactPublicKey || (TFHE as AnyObj).CompactPublicKey || (TFHE as AnyObj).TfheCompactPublicKey;
    const ConfigBuilderCtor =
        (TFHE as AnyObj).TfheConfigBuilder || (TFHE as AnyObj).ConfigBuilder || (TFHE as AnyObj).TfheConfigBuilder;
    const ShortintParametersName = (TFHE as AnyObj).ShortintParametersName || (TFHE as AnyObj).ShortintParametersName;

    // if key files exist, try to read and deserialize
    if (existsSync(CLIENT_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
        try {
            const clientKeyBuf = await fs.readFile(CLIENT_KEY_PATH);
            const publicKeyBuf = await fs.readFile(PUBLIC_KEY_PATH);
            const clientKeyU8 = toUint8Array(clientKeyBuf);
            const publicKeyU8 = toUint8Array(publicKeyBuf);

            const clientKey = tryDeserialize(ClientKeyCtor, clientKeyU8);
            const publicKey = tryDeserialize(CompactPublicKeyCtor, publicKeyU8);
            logger.info('FHE keys loaded from files.');
            return { clientKey, publicKey };
        } catch (err) {
            logger.warn('Failed to load existing FHE keys, will attempt to generate. Reason:', err);
            // fallthrough to generation
        }
    }

    // Generate new keys
    logger.info('Generating new FHE keys (this may be slow)...');

    // detect param name or parameter constructor
    let blockParams: AnyObj | undefined;
    try {
        // prefer a common stable param name
        blockParams =
            ShortintParametersName?.PARAM_MESSAGE_8_CARRY_0_KS_PBS ||
            ShortintParametersName?.V1_1_PARAM_MESSAGE_2_CARRY_2_COMPACT_PK_PBS_KS_GAUSSIAN_2M64 ||
            ShortintParametersName?.DEFAULT;
    } catch {
        blockParams = undefined;
    }

    // build config
    let config: AnyObj;
    try {
        if (ConfigBuilderCtor && typeof ConfigBuilderCtor.default === 'function') {
            config = ConfigBuilderCtor.default_with_shortint_params
                ? ConfigBuilderCtor.default_with_shortint_params(blockParams).build()
                : ConfigBuilderCtor.default().build();
        } else if (typeof (TFHE as AnyObj).TfheConfigBuilder === 'function') {
            config = (TFHE as AnyObj).TfheConfigBuilder.default_with_shortint_params
                ? (TFHE as AnyObj).TfheConfigBuilder.default_with_shortint_params(blockParams).build()
                : (TFHE as AnyObj).TfheConfigBuilder.default().build();
        } else {
            // If no config builder, pass undefined to generation (some apis don't require config)
            config = undefined;
        }
    } catch (err) {
        logger.warn('Config builder not available or failed to build: ' + String(err));
        config = undefined;
    }

    // Key generation: try common names
    const generatorCandidates = [
        (TFHE as AnyObj).TfheClientKey,
        (TFHE as AnyObj).ClientKey,
        (TFHE as AnyObj).TfheClientKey, // duplicate intentionally to show search
    ].filter(Boolean);

    let clientKey: AnyObj | undefined;
    for (const ctor of generatorCandidates) {
        try {
            if (ctor && typeof ctor.generate === 'function') {
                clientKey = ctor.generate(config);
                break;
            }
            // sometimes generation is static factory on module
            if (TFHE && typeof (TFHE as AnyObj).generate_client_key === 'function') {
                clientKey = (TFHE as AnyObj).generate_client_key(config);
                break;
            }
        } catch {
            // try next
        }
    }

    if (!clientKey) {
        throw new Error('Unable to generate client key: no generation API found on installed node-tfhe/tfhe package.');
    }

    // build public key from client key (common name: TfheCompactPublicKey.new(clientKey))
    let publicKey: AnyObj | undefined;
    const PublicCtor = CompactPublicKeyCtor;
    try {
        if (PublicCtor && typeof PublicCtor.new === 'function') {
            publicKey = PublicCtor.new(clientKey);
        } else if ((TFHE as AnyObj).TfheCompactPublicKey && typeof (TFHE as AnyObj).TfheCompactPublicKey.new === 'function') {
            publicKey = (TFHE as AnyObj).TfheCompactPublicKey.new(clientKey);
        } else if (typeof (TFHE as AnyObj).CompactPublicKey_from_client === 'function') {
            publicKey = (TFHE as AnyObj).CompactPublicKey_from_client(clientKey);
        } else {
            // fallback: maybe constructor accepts clientKey
            publicKey = new PublicCtor(clientKey);
        }
    } catch (err) {
        logger.warn('Could not build compact public key by standard method: ' + String(err));
        publicKey = undefined;
    }

    if (!publicKey) {
        throw new Error('Could not create compact public key from client key with detected API.');
    }

    // persist keys to disk (serialize)
    try {
        await fs.mkdir(path.dirname(CLIENT_KEY_PATH), { recursive: true });
        const clientBytes = trySerialize(clientKey);
        const publicBytes = trySerialize(publicKey);

        await fs.writeFile(CLIENT_KEY_PATH, toBuffer(clientBytes));
        await fs.writeFile(PUBLIC_KEY_PATH, toBuffer(publicBytes));
        logger.info('FHE keys generated and saved.');
    } catch (err) {
        logger.error('Failed to serialize and save FHE keys:', err);
        throw err;
    }

    return { clientKey, publicKey };
}

/**
 * Encrypt a UTF-8 string into a compact ciphertext list (serialized).
 */
export async function encryptPII(data: string): Promise<Buffer> {
    const { publicKey } = await ensureKeys();
    const uint8Array = new Uint8Array(Buffer.from(data, 'utf-8'));

    const compactList = buildCompactListFromBytes(publicKey, uint8Array);
    const serialized = trySerialize(compactList);
    return toBuffer(serialized);
}

/**
 * Decrypt a compact ciphertext list (serialized) into string.
 */
export async function decryptPII(encrypted: Buffer): Promise<string> {
    const { clientKey } = await ensureKeys();
    const compactListBuf = toUint8Array(encrypted);

    // Try deserialize
    const CompactCiphertextListCtor = (TFHE as AnyObj).CompactCiphertextList || (TFHE as AnyObj).CompactFheUint8List;
    const compactList = tryDeserialize(CompactCiphertextListCtor, compactListBuf);

    const expanded = expandCompactList(compactList);

    const len = expanderLen(expanded);
    const bytes: number[] = [];
    for (let i = 0; i < len; i++) {
        const ct = expanderGet(expanded, i);
        const dec = tryDecryptCiphertext(ct, clientKey);
        // dec might be BigInt or number
        const n = typeof dec === 'bigint' ? Number(dec) : Number(dec);
        bytes.push(n & 0xff);
    }

    return Buffer.from(bytes).toString('utf-8');
}

/**
 * Encrypt a single number (uint8) into a compact ciphertext list (serialized).
 */
export async function encryptNumber(value: number): Promise<Buffer> {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error('Value must be uint8 (0-255)');
    }
    const { publicKey } = await ensureKeys();
    const byte = new Uint8Array([value]);

    const compactList = buildCompactListFromBytes(publicKey, byte);
    const serialized = trySerialize(compactList);
    return toBuffer(serialized);
}

/**
 * Decrypt a single-number compact ciphertext list.
 */
export async function decryptNumber(encrypted: Buffer): Promise<number> {
    const { clientKey } = await ensureKeys();
    const CompactCiphertextListCtor = (TFHE as AnyObj).CompactCiphertextList || (TFHE as AnyObj).CompactFheUint8List;
    const compactList = tryDeserialize(CompactCiphertextListCtor, toUint8Array(encrypted));
    const expanded = expandCompactList(compactList);

    const len = expanderLen(expanded);
    if (len !== 1) {
        throw new Error('Expected single uint8 ciphertext');
    }

    const ct = expanderGet(expanded, 0);
    const decrypted = tryDecryptCiphertext(ct, clientKey);
    return typeof decrypted === 'bigint' ? Number(decrypted) : Number(decrypted);
}
