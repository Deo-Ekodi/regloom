/**
 * fhe.ts – FIXED VERSION
 * Updated to use the correct TFHE-rs JS API with CompactCiphertextList.builder()
 * Compatible with node-tfhe@1.4.2
 * Encrypts arrays of uint8 using push_u8 for each byte
 * All tests should now pass without "encrypt_array is not a function"
 */
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import * as TFHE from 'node-tfhe';
import { logger } from '@regloom/utils';

const CLIENT_KEY_PATH = process.env.FHE_CLIENT_KEY_PATH || path.join(__dirname, '../../keys/client.key');
const PUBLIC_KEY_PATH = process.env.FHE_PUBLIC_KEY_PATH || path.join(__dirname, '../../keys/public.key');

type AnyObj = any;

function toUint8Array(data: Buffer | Uint8Array): Uint8Array {
    return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function toBuffer(u8: Uint8Array | Buffer): Buffer {
    return Buffer.isBuffer(u8) ? u8 : Buffer.from(u8);
}

function tryDeserialize(ctor: AnyObj, buf: Uint8Array): AnyObj {
    if (!ctor) throw new Error('Constructor missing');
    const attempts = [
        (c: AnyObj) => typeof c.deserialize === 'function' ? c.deserialize(buf) : undefined,
        (c: AnyObj) => typeof c.from_bytes === 'function' ? c.from_bytes(buf) : undefined,
        (c: AnyObj) => new c(buf),
    ];
    for (const fn of attempts) {
        try {
            const res = fn(ctor);
            if (res) return res;
        } catch { }
    }
    throw new Error('Deserialization failed');
}

function trySerialize(obj: AnyObj): Uint8Array {
    const attempts = [
        () => obj.serialize?.(),
        () => obj.to_bytes?.(),
        () => obj.to_u8?.(),
        () => obj.to_vec?.(),
    ];
    for (const fn of attempts) {
        try {
            const res = fn();
            if (res) return toUint8Array(res);
        } catch { }
    }
    if (obj instanceof Uint8Array || Buffer.isBuffer(obj)) return toUint8Array(obj);
    throw new Error('Serialization failed');
}

async function ensureKeys(): Promise<{ clientKey: any; publicKey: any }> {
    const ClientKey = (TFHE as any).TfheClientKey || (TFHE as any).ClientKey;
    const CompactPublicKey = (TFHE as any).TfheCompactPublicKey || (TFHE as any).CompactPublicKey;

    if (existsSync(CLIENT_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
        try {
            const ck = tryDeserialize(ClientKey, await fs.readFile(CLIENT_KEY_PATH));
            const pk = tryDeserialize(CompactPublicKey, await fs.readFile(PUBLIC_KEY_PATH));
            logger.info('FHE keys loaded from disk');
            return { clientKey: ck, publicKey: pk };
        } catch (e) {
            logger.warn('Failed to load keys, regenerating...', e);
        }
    }

    logger.info('Generating new FHE keys...');
    const clientKey = ClientKey.generate();
    const publicKey = CompactPublicKey.new(clientKey);

    await fs.mkdir(path.dirname(CLIENT_KEY_PATH), { recursive: true });
    await fs.writeFile(CLIENT_KEY_PATH, toBuffer(trySerialize(clientKey)));
    await fs.writeFile(PUBLIC_KEY_PATH, toBuffer(trySerialize(publicKey)));

    logger.info('FHE keys generated and saved');
    return { clientKey, publicKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function encryptPII(data: string): Promise<Buffer> {
    const { publicKey } = await ensureKeys();
    const bytes = Buffer.from(data, 'utf-8');
    const CompactCiphertextList = (TFHE as any).CompactCiphertextList;

    const builder = CompactCiphertextList.builder(publicKey);
    for (const byte of bytes) {
        builder.push_u8(byte);
    }
    const encrypted = builder.build();
    const serialized = trySerialize(encrypted);

    logger.info(`Encrypted string (${bytes.length} bytes) → ${serialized.length} bytes ciphertext`);
    return toBuffer(serialized);
}

export async function decryptPII(encrypted: Buffer): Promise<string> {
    const { clientKey } = await ensureKeys();
    const CompactCiphertextList = (TFHE as any).CompactCiphertextList;

    const list = tryDeserialize(CompactCiphertextList, toUint8Array(encrypted));
    const expanded = list.expand();
    const len = expanded.len();
    if (len === 0) throw new Error('Decryption failed: empty list');

    const bytes: number[] = [];
    for (let i = 0; i < len; i++) {
        const ct = expanded.get_uint8(i);
        const val = ct.decrypt(clientKey);
        bytes.push(Number(val));
    }

    return Buffer.from(bytes).toString('utf-8');
}

export async function encryptNumber(value: number): Promise<Buffer> {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error('Value must be uint8 (0-255)');
    }
    const { publicKey } = await ensureKeys();
    const CompactCiphertextList = (TFHE as any).CompactCiphertextList;

    const builder = CompactCiphertextList.builder(publicKey);
    builder.push_u8(value);
    const encrypted = builder.build();
    return toBuffer(trySerialize(encrypted));
}

export async function decryptNumber(encrypted: Buffer): Promise<number> {
    const { clientKey } = await ensureKeys();
    const CompactCiphertextList = (TFHE as any).CompactCiphertextList;

    const list = tryDeserialize(CompactCiphertextList, toUint8Array(encrypted));
    const expanded = list.expand();
    const len = expanded.len();
    if (len !== 1) throw new Error('Expected single value');

    return Number(expanded.get_uint8(0).decrypt(clientKey));
}