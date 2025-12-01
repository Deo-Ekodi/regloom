// zkProof.test.ts
import { proveCompliance, verifyCompliance } from '../src/zkProof';

describe('ZK Proofs', () => {
    it('generates and verifies compliance proof', async () => {
        const a = 5n;
        const b = 6n;
        const c = 30n;
        const { proof, publicSignals } = await proveCompliance(a, b, c);
        expect(publicSignals[0]).toBe(c.toString());
        const res = await verifyCompliance(proof, publicSignals);
        expect(res).toBe(true);
    });
});