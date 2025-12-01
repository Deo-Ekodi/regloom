// apps/privacy-engine/tests/fhe.test.ts
import { encryptPII, decryptPII, encryptNumber, decryptNumber } from '../src/fhe';

describe('FHE Encryption/Decryption', () => {
    afterEach(async () => {
        jest.resetModules();
    });

    it('encrypts and decrypts string PII', async () => {
        const pii = 'user@example.com';
        const encrypted = await encryptPII(pii);
        const decrypted = await decryptPII(encrypted);
        expect(decrypted).toBe(pii);
    });

    it('encrypts and decrypts number PII', async () => {
        const pii = 123;
        const encrypted = await encryptNumber(pii);
        const decrypted = await decryptNumber(encrypted);
        expect(decrypted).toBe(pii);
    });
});