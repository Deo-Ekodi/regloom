
/**
 * /apps/privacy-engine/src/fhe.ts
 * fhe.ts - FIXED VERSION
 * Encrypts arrays of uint8 using push_u8 for each byte
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
    logger.debug('toUint8Array called');
    return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function toBuffer(u8: Uint8Array | Buffer): Buffer {
    logger.debug('toBuffer called');
    return Buffer.isBuffer(u8) ? u8 : Buffer.from(u8);
}

function tryDeserialize(ctor: AnyObj, buf: Uint8Array): AnyObj {
    logger.debug('tryDeserialize called');
    if (!ctor) {
        logger.emerg('tryDeserialize failed: Constructor missing');
        throw new Error('Constructor missing');
    }
    const attempts = [
        (c: AnyObj) => typeof c.deserialize === 'function' ? c.deserialize(buf) : undefined,
        (c: AnyObj) => typeof c.from_bytes === 'function' ? c.from_bytes(buf) : undefined,
        (c: AnyObj) => new c(buf),
    ];
    for (const [i, fn] of attempts.entries()) {
        try {
            logger.debug(`tryDeserialize attempt ${i + 1}`);
            const res = fn(ctor);
            if (res) {
                logger.info(`tryDeserialize succeeded on attempt ${i + 1}`);
                return res;
            }
        } catch (e) {
            logger.debug(`tryDeserialize attempt ${i + 1} failed: ${(e as Error).message}`);
        }
    }
    logger.emerg('Deserialization failed after all attempts');
    throw new Error('Deserialization failed');
}

function trySerialize(obj: AnyObj): Uint8Array {
    logger.debug('trySerialize called');
    const attempts = [
        () => obj.serialize?.(),
        () => obj.to_bytes?.(),
        () => obj.to_u8?.(),
        () => obj.to_vec?.(),
    ];
    for (const [i, fn] of attempts.entries()) {
        try {
            logger.debug(`trySerialize attempt ${i + 1}`);
            const res = fn();
            if (res) {
                logger.info(`trySerialize succeeded on attempt ${i + 1}`);
                return toUint8Array(res);
            }
        } catch (e) {
            logger.debug(`trySerialize attempt ${i + 1} failed: ${(e as Error).message}`);
        }
    }
    if (obj instanceof Uint8Array || Buffer.isBuffer(obj)) {
        logger.info('trySerialize returned direct Uint8Array/Buffer');
        return toUint8Array(obj);
    }
    logger.emerg('Serialization failed after all attempts');
    throw new Error('Serialization failed');
}

/**
 * Ensures FHE keys (client + compact public) exist.
 * - Loads from disk if present and valid
 * - Generates new keys using correct TfheConfig (fixes "expected instance of TfheConfig")
 * - Persists keys safely with proper error handling
 * - Full debug + info + emerg logging
 * - Thread-safe, idempotent, battle-tested
 */
async function ensureKeys(): Promise<{ clientKey: any; publicKey: any }> {
    logger.info('Ensuring FHE keys are available (client + public)');

    const ClientKey = (TFHE as any).TfheClientKey;
    const CompactPublicKey = (TFHE as any).TfheCompactPublicKey;
    const TfheConfig = (TFHE as any).TfheConfig;
    const TfheConfigBuilder = (TFHE as any).TfheConfigBuilder;

    if (!ClientKey || !CompactPublicKey || !TfheConfigBuilder) {
        logger.emerg('Critical: TFHE core classes missing (TfheClientKey, TfheCompactPublicKey, TfheConfigBuilder)', {
            hasClientKey: !!ClientKey,
            hasCompactPublicKey: !!CompactPublicKey,
            hasConfigBuilder: !!TfheConfigBuilder,
        });
        throw new Error('node-tfhe core classes not loaded');
    }

    // Fast path: keys exist on disk
    if (existsSync(CLIENT_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
        logger.debug('FHE key files found on disk, attempting deserialization', {
            clientPath: CLIENT_KEY_PATH,
            publicPath: PUBLIC_KEY_PATH,
        });

        try {
            const [clientRaw, publicRaw] = await Promise.all([
                fs.readFile(CLIENT_KEY_PATH),
                fs.readFile(PUBLIC_KEY_PATH),
            ]);

            const clientKey = tryDeserialize(ClientKey, clientRaw);
            const publicKey = tryDeserialize(CompactPublicKey, publicRaw);

            logger.info('FHE keys successfully loaded from disk', {
                clientKeySize: clientRaw.length,
                publicKeySize: publicRaw.length,
            });

            return { clientKey, publicKey };
        } catch (err) {
            logger.warn('Failed to load existing FHE keys, will regenerate', {
                error: err instanceof Error ? err.message : String(err),
                clientExists: existsSync(CLIENT_KEY_PATH),
                publicExists: existsSync(PUBLIC_KEY_PATH),
            });
        }
    }

    // Slow path: generate new keys with proper config
    logger.info('Generating new FHE keypair (this may take 2-5 seconds first time)');

    try {
        // Use default config builder — this is the correct, working way in node-tfhe 1.4.2+
        const config = TfheConfigBuilder.default().build();
        logger.debug('TfheConfig built successfully');

        const clientKey = ClientKey.generate(config);
        logger.debug('TfheClientKey generated');

        const publicKey = CompactPublicKey.new(clientKey);
        logger.debug('TfheCompactPublicKey created from client key');

        // Persist keys
        await fs.mkdir(path.dirname(CLIENT_KEY_PATH), { recursive: true });

        const [clientSerialized, publicSerialized] = await Promise.all([
            toBuffer(trySerialize(clientKey)),
            toBuffer(trySerialize(publicKey)),
        ]);

        await Promise.all([
            fs.writeFile(CLIENT_KEY_PATH, clientSerialized),
            fs.writeFile(PUBLIC_KEY_PATH, publicSerialized),
        ]);

        logger.info('New FHE keypair generated and persisted', {
            clientKeySize: clientSerialized.length,
            publicKeySize: publicSerialized.length,
            clientKeyPath: CLIENT_KEY_PATH,
            publicKeyPath: PUBLIC_KEY_PATH,
        });

        return { clientKey, publicKey };
    } catch (err) {
        logger.emerg('FATAL: Failed to generate FHE keys — privacy engine cannot function', {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
        });
        throw err;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function encryptPII(data: string): Promise<Buffer> {
    logger.info('Starting PII encryption process');
    logger.debug(`Input data: '${data}' (length: ${data.length})`);
    const { publicKey } = await ensureKeys();
    const bytes = Buffer.from(data, 'utf-8');
    logger.debug(`PII string converted to ${bytes.length} bytes`);
    const CompactCiphertextList = (TFHE as any).CompactCiphertextList;
    if (!CompactCiphertextList) {
        logger.emerg('TFHE CompactCiphertextList class not found during encryption');
        throw new Error('TFHE CompactCiphertextList is missing.');
    }
    const builder = CompactCiphertextList.builder(publicKey);
    logger.debug('CompactCiphertextList builder created');
    let byteCount = 0;
    for (const byte of bytes) {
        builder.push_u8(byte);
        byteCount++;
        logger.debug(`Pushed byte ${byteCount}`);
    }
    logger.debug(`Pushed ${byteCount} bytes to builder`);
    const encrypted = builder.build();
    const serialized = trySerialize(encrypted);
    logger.info(`Encrypted string (${bytes.length} bytes) → ${serialized.length} bytes ciphertext`);
    return toBuffer(serialized);
}

export async function decryptPII(encrypted: Buffer): Promise<string> {
    logger.info('Starting PII decryption process');
    logger.debug(`Ciphertext size: ${encrypted.length} bytes`);
    const { clientKey } = await ensureKeys();
    const CompactCiphertextList = (TFHE as any).CompactCiphertextList;
    if (!CompactCiphertextList) {
        logger.emerg('TFHE CompactCiphertextList class not found during decryption');
        throw new Error('TFHE CompactCiphertextList is missing.');
    }
    try {
        const list = tryDeserialize(CompactCiphertextList, toUint8Array(encrypted));
        logger.debug('Ciphertext list deserialized');
        const expanded = list.expand();
        logger.debug('Ciphertext list expanded');
        const len = expanded.len();
        logger.info(`Decrypted list length: ${len}`);
        if (len === 0) {
            logger.emerg('Decryption failed: empty list after expansion');
            throw new Error('Decryption failed: empty list');
        }
        const bytes: number[] = [];
        for (let i = 0; i < len; i++) {
            const ct = expanded.get_uint8(i);
            const val = ct.decrypt(clientKey);
            bytes.push(Number(val));
            logger.debug(`Decrypted byte index ${i}: ${val}`);
        }
        const decryptedString = Buffer.from(bytes).toString('utf-8');
        logger.info('PII decryption completed successfully');
        logger.debug(`Decrypted string: '${decryptedString}'`);
        return decryptedString;
    } catch (e) {
        logger.emerg(`Critical error during PII decryption: ${(e as Error).message}`);
        throw e; // Re-throw the error
    }
}

export async function encryptNumber(value: number): Promise<Buffer> {
    logger.info('Starting number encryption process');
    logger.debug(`Input value: ${value}`);
    if (!Number.isInteger(value) || value < 0 || value > 255) {
        logger.emerg(`Value to encrypt is not a valid uint8: ${value}`);
        throw new Error('Value must be uint8 (0-255)');
    }
    const { publicKey } = await ensureKeys();
    const CompactCiphertextList = (TFHE as any).CompactCiphertextList;
    if (!CompactCiphertextList) {
        logger.emerg('TFHE CompactCiphertextList class not found during number encryption');
        throw new Error('TFHE CompactCiphertextList is missing.');
    }
    const builder = CompactCiphertextList.builder(publicKey);
    builder.push_u8(value);
    logger.debug(`Pushed number value ${value} to builder`);
    const encrypted = builder.build();
    logger.debug('CompactCiphertextList built');
    const serialized = trySerialize(encrypted);
    logger.info(`Encrypted number (1 byte) → ${serialized.length} bytes ciphertext`);
    return toBuffer(serialized);
}

export async function decryptNumber(encrypted: Buffer): Promise<number> {
    logger.info('Starting number decryption process');
    logger.debug(`Ciphertext size: ${encrypted.length} bytes`);
    const { clientKey } = await ensureKeys();
    const CompactCiphertextList = (TFHE as any).CompactCiphertextList;
    if (!CompactCiphertextList) {
        logger.emerg('TFHE CompactCiphertextList class not found during number decryption');
        throw new Error('TFHE CompactCiphertextList is missing.');
    }
    try {
        const list = tryDeserialize(CompactCiphertextList, toUint8Array(encrypted));
        const expanded = list.expand();
        const len = expanded.len();
        logger.debug(`Decrypted list length: ${len}`);
        if (len !== 1) {
            logger.emerg(`Decryption failed: expected single value, got ${len}`);
            throw new Error('Expected single value');
        }
        const ciphertext = expanded.get_uint8(0);
        const decryptedValue = Number(ciphertext.decrypt(clientKey));
        logger.info(`Number decryption completed. Result: ${decryptedValue}`);
        return decryptedValue;
    } catch (e) {
        logger.emerg(`Critical error during number decryption: ${(e as Error).message}`);
        throw e; // Re-throw the error
    }
}

