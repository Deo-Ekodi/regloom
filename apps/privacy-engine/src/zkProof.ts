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

logger.debug(`ZK Artifacts directory: ${ARTIFACTS_DIR}`);
logger.debug(`WASM path: ${WASM_PATH}`);
logger.debug(`ZKEY path: ${ZKEY_PATH}`);

export async function proveCompliance(a: bigint, b: bigint, c: bigint): Promise<{ proof: any; publicSignals: string[] }> {
    logger.info('Starting ZK compliance proof generation.');
    logger.debug(`Input received: a=${a}, b=${b}, expected c=${c}`);
    try {
        const input = { a: a.toString(), b: b.toString() };
        logger.debug('Calling snarkjs.groth16.fullProve...');
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
        logger.debug('snarkjs.groth16.fullProve completed.');

        if (BigInt(publicSignals[0]) !== c) {
            logger.warn(`ZK proof public output mismatch. Output: ${publicSignals[0]}, Expected: ${c}`);
            logger.emerg(`Critical SNARK inconsistency detected in proof generation: a*b != c`);
            throw new Error(`Generated public signal ${publicSignals[0]} does not match expected c ${c}`);
        }

        logger.info('ZK compliance proof generated successfully.');
        logger.debug(`Generated Proof: ${JSON.stringify(proof).substring(0, 100)}...`);
        logger.debug(`Generated Public Signals: ${publicSignals.join(', ')}`);

        return { proof, publicSignals };
    } catch (err) {
        // The original logger.error already covers this. We can add a debug for the inputs.
        logger.error('Failed to generate ZK proof:', err);
        logger.debug(`Failed proof attempt inputs: a=${a}, b=${b}, c=${c}`);
        throw err;
    }
}

export async function verifyCompliance(proof: any, publicSignals: string[]): Promise<boolean> {
    logger.info('Starting ZK compliance proof verification.');
    logger.debug(`Public Signals for verification: ${publicSignals.join(', ')}`);
    try {
        logger.debug(`Reading verification key from ${VK_PATH}`);
        const vk = JSON.parse(await fs.readFile(VK_PATH, 'utf-8'));
        logger.debug('Verification key successfully parsed.');

        logger.debug('Calling snarkjs.groth16.verify...');
        const res = await snarkjs.groth16.verify(vk, publicSignals, proof);
        logger.debug('snarkjs.groth16.verify completed.');

        if (res === true) {
            logger.info(`ZK verification result: ${res}`);
        } else {
            logger.warn(`ZK verification failed! Proof is invalid.`);
        }

        return res;
    } catch (err) {
        // The original logger.error already covers this.
        logger.error('Failed to verify ZK proof:', err);
        throw err;
    }
}