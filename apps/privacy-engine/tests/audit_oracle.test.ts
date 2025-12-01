// audit_oracle.test.ts
import { validateWeave } from '../src/audit_oracle';
import { proveCompliance } from '../src/zkProof';
import { encryptPII } from '../src/fhe';

describe('Audit Oracle', () => {
    it('validates weave with valid proof (no decryption)', async () => {
        const encrypted = await encryptPII('test data');
        const { proof, publicSignals } = await proveCompliance(5n, 6n, 30n);
        const res = await validateWeave(encrypted, proof, publicSignals);
        expect(res).toBe(true);
    });

    it('detects drift with invalid proof', async () => {
        const encrypted = await encryptPII('test data');
        const { proof, publicSignals } = await proveCompliance(5n, 6n, 30n);
        publicSignals[0] = '31';  // Tamper to simulate drift
        const res = await validateWeave(encrypted, proof, publicSignals);
        expect(res).toBe(false);
    });
});