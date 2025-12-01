/**
 * zkProof.ts
 * SNARK generation for compliance proofs using snarkjs.
 * Uses precompiled multiplier circuit/artifacts for proof of knowledge (a * b = public c).
 * This demonstrates compliance (e.g., c as compliant metric); extensible to custom circuits.
 * Proofs are generated/verified with Groth16.
 */

import * as snarkjs from 'snarkjs';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '@regloom/utils';

const ARTIFACTS_DIR = path.join(__dirname, '../artifacts');
const WASM_PATH = path.join(ARTIFACTS_DIR, 'multiplier_js/multiplier.wasm');
const ZKEY_PATH = path.join(ARTIFACTS_DIR, 'multiplier_final.zkey');
const VK_PATH = path.join(ARTIFACTS_DIR, 'verification_key.json');

export async function proveCompliance(a: bigint, b: bigint, c: bigint): Promise<{ proof: any; publicSignals: string[] }> {
    try {
        const input = { a: a.toString(), b: b.toString() };
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
        if (BigInt(publicSignals[0]) !== c) {
            throw new Error(`Generated public signal ${publicSignals[0]} does not match expected c ${c}`);
        }
        logger.info('ZK compliance proof generated successfully.');
        return { proof, publicSignals };
    } catch (err) {
        logger.error('Failed to generate ZK proof:', err);
        throw err;
    }
}

export async function verifyCompliance(proof: any, publicSignals: string[]): Promise<boolean> {
    try {
        const vk = JSON.parse(await fs.readFile(VK_PATH, 'utf-8'));
        const res = await snarkjs.groth16.verify(vk, publicSignals, proof);
        logger.info(`ZK verification result: ${res}`);
        return res;
    } catch (err) {
        logger.error('Failed to verify ZK proof:', err);
        throw err;
    }
}