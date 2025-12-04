// apps/privacy-engine/src/index.ts
// Privacy Engine entry point — production-grade Express server.
// Exposes endpoints for FHE encryption/decryption, ZK proof gen/verify, full process (encrypt + prove), validation.
// Robust: Async handlers, timeouts, input validation, error middleware, graceful shutdown, logging.
// Scalable: Ready for clustering (Node cluster) or PM2.
// Integrates Dapr if DAPR_PRIVACY_ENGINE_HTTP_PORT set.
// No auth/middleware — assume backend or Dapr handles security.

import express, { Application, Request, Response, NextFunction } from 'express';
import { logger } from '@regloom/utils';
import { encryptPII, decryptPII, encryptNumber, decryptNumber } from './fhe';
import { proveCompliance, verifyCompliance } from './zkProof';
import { validateWeave } from './audit_oracle';

const app: Application = express();
app.use(express.json({ limit: '50mb' })); // Handle large payloads (e.g., batch data)
app.use(express.urlencoded({ extended: true }));
logger.debug('Express middleware configured: JSON parser and URL-encoded body parser.'); // Added debug

const PORT = process.env.PRIVACY_ENGINE_PORT || 4002;

// Health check — for probes/Dapr/lb
app.get('/health', (_req, res) => {
    // logger.info('Health check endpoint accessed.');
    // logger.debug('Responding to health check request.');
    res.status(200).json({
        status: 'healthy',
        service: 'regloom-privacy-engine',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// Full process: Encrypt + Generate ZK proof
app.post('/process', async (req: Request, res: Response, next: NextFunction) => {
    logger.debug('POST /process: Starting full privacy process.'); // Added debug
    const { data, a, b, c } = req.body; // data: string/buffer for FHE; a/b/c: bigints for ZK example
    if (!data || typeof a !== 'bigint' || typeof b !== 'bigint' || typeof c !== 'bigint') {
        logger.warn('POST /process: Input validation failed: Missing/invalid data, a, b, or c.'); // Added warning
        return res.status(400).json({ error: 'Missing/invalid data, a, b, or c' });
    }
    try {
        logger.debug('POST /process: Encrypting PII.'); // Added debug
        const encrypted = await encryptPII(data);
        logger.debug('POST /process: Generating ZK proof.'); // Added debug
        const { proof, publicSignals } = await proveCompliance(a, b, c);
        logger.info('Privacy process completed');
        res.json({ encrypted: encrypted.toString('hex'), proof, publicSignals });
    } catch (err) {
        logger.error(`POST /process: Failed to complete privacy process.`, { error: (err as Error).message }); // Added error
        next(err);
    }
});

// Encrypt string PII
app.post('/encrypt/pii', async (req: Request, res: Response, next: NextFunction) => {
    logger.debug('POST /encrypt/pii: Starting PII encryption.'); // Added debug
    const { data } = req.body;
    if (typeof data !== 'string') {
        logger.warn('POST /encrypt/pii: Input validation failed: data must be string.'); // Added warning
        return res.status(400).json({ error: 'data must be string' });
    }
    try {
        const encrypted = await encryptPII(data);
        logger.info('POST /encrypt/pii: Encryption completed.'); // Added info
        res.json({ encrypted: encrypted.toString('hex') });
    } catch (err) {
        logger.error(`POST /encrypt/pii: Encryption failed.`, { error: (err as Error).message }); // Added error
        next(err);
    }
});

// Decrypt PII
app.post('/decrypt/pii', async (req: Request, res: Response, next: NextFunction) => {
    logger.debug('POST /decrypt/pii: Starting PII decryption.'); // Added debug
    const { encrypted } = req.body;
    if (typeof encrypted !== 'string') {
        logger.warn('POST /decrypt/pii: Input validation failed: encrypted must be hex string.'); // Added warning
        return res.status(400).json({ error: 'encrypted must be hex string' });
    }
    try {
        const buffer = Buffer.from(encrypted, 'hex');
        const decrypted = await decryptPII(buffer);
        logger.info('POST /decrypt/pii: Decryption completed.'); // Added info
        res.json({ decrypted });
    } catch (err) {
        logger.error(`POST /decrypt/pii: Decryption failed.`, { error: (err as Error).message }); // Added error
        next(err);
    }
});

// Encrypt number (uint8 example)
app.post('/encrypt/number', async (req: Request, res: Response, next: NextFunction) => {
    logger.debug('POST /encrypt/number: Starting number encryption.'); // Added debug
    const { value } = req.body;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
        logger.warn('POST /encrypt/number: Input validation failed: value must be uint8 (0-255).'); // Added warning
        return res.status(400).json({ error: 'value must be uint8 (0-255)' });
    }
    try {
        const encrypted = await encryptNumber(value);
        logger.info('POST /encrypt/number: Encryption completed.'); // Added info
        res.json({ encrypted: encrypted.toString('hex') });
    } catch (err) {
        logger.error(`POST /encrypt/number: Encryption failed.`, { error: (err as Error).message }); // Added error
        next(err);
    }
});

// Decrypt number
app.post('/decrypt/number', async (req: Request, res: Response, next: NextFunction) => {
    logger.debug('POST /decrypt/number: Starting number decryption.'); // Added debug
    const { encrypted } = req.body;
    if (typeof encrypted !== 'string') {
        logger.warn('POST /decrypt/number: Input validation failed: encrypted must be hex string.'); // Added warning
        return res.status(400).json({ error: 'encrypted must be hex string' });
    }
    try {
        const buffer = Buffer.from(encrypted, 'hex');
        const value = await decryptNumber(buffer);
        logger.info('POST /decrypt/number: Decryption completed.'); // Added info
        res.json({ value });
    } catch (err) {
        logger.error(`POST /decrypt/number: Decryption failed.`, { error: (err as Error).message }); // Added error
        next(err);
    }
});

// Generate ZK proof
app.post('/prove', async (req: Request, res: Response, next: NextFunction) => {
    logger.debug('POST /prove: Starting ZK proof generation.'); // Added debug
    const { a, b, c } = req.body;
    if (typeof a !== 'bigint' || typeof b !== 'bigint' || typeof c !== 'bigint') {
        logger.warn('POST /prove: Input validation failed: a, b, c must be bigints.'); // Added warning
        return res.status(400).json({ error: 'a, b, c must be bigints' });
    }
    try {
        const { proof, publicSignals } = await proveCompliance(a, b, c);
        logger.info('POST /prove: Proof generation completed.'); // Added info
        res.json({ proof, publicSignals });
    } catch (err) {
        logger.error(`POST /prove: Proof generation failed.`, { error: (err as Error).message }); // Added error
        next(err);
    }
});

// Verify ZK proof
app.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
    logger.debug('POST /verify: Starting ZK proof verification.'); // Added debug
    const { proof, publicSignals } = req.body;
    if (!proof || !Array.isArray(publicSignals)) {
        logger.warn('POST /verify: Input validation failed: proof and publicSignals (array) required.'); // Added warning
        return res.status(400).json({ error: 'proof and publicSignals (array) required' });
    }
    try {
        const valid = await verifyCompliance(proof, publicSignals);
        logger.info(`POST /verify: Verification completed (Result: ${valid}).`); // Added info
        res.json({ valid });
    } catch (err) {
        logger.error(`POST /verify: Verification failed.`, { error: (err as Error).message }); // Added error
        next(err);
    }
});

// Validate weave (audit)
app.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
    logger.debug('POST /validate: Starting weave validation process.'); // Added debug
    const { encryptedData, proof, publicSignals, performDecryption } = req.body;
    if (!encryptedData || !proof || !Array.isArray(publicSignals)) {
        logger.warn('POST /validate: Input validation failed: encryptedData (hex), proof, publicSignals required.'); // Added warning
        return res.status(400).json({ error: 'encryptedData (hex), proof, publicSignals required' });
    }
    try {
        const buffer = Buffer.from(encryptedData, 'hex');
        const valid = await validateWeave(buffer, proof, publicSignals, !!performDecryption);
        logger.info(`POST /validate: Validation completed (Result: ${valid}).`); // Added info
        res.json({ valid });
    } catch (err) {
        logger.error(`POST /validate: Validation failed.`, { error: (err as Error).message }); // Added error
        next(err);
    }
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // This acts as a catch-all for severe errors (like Emerg), reporting the stack trace.
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
});

// Server
const server = app.listen(PORT, () => {
    logger.info(`Privacy Engine running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    if (process.env.DAPR_PRIVACY_ENGINE_HTTP_PORT) {
        logger.info(`Dapr sidecar enabled on port ${process.env.DAPR_PRIVACY_ENGINE_HTTP_PORT}`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    // The SIGTERM signal itself is a critical event, handled with informative logging.
    logger.info('SIGTERM received: shutting down');
    server.close(() => {
        // Log the final status before exit (can be considered an Info/Emerg boundary)
        logger.info('Server closed');
        process.exit(0);
    });
});