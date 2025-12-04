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

const PORT = process.env.PRIVACY_ENGINE_PORT || 4002;

// Health check — for probes/Dapr/lb
app.get('/health', (_req, res) => {
    logger.info('Health check endpoint accessed.');
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
    const { data, a, b, c } = req.body; // data: string/buffer for FHE; a/b/c: bigints for ZK example
    if (!data || typeof a !== 'bigint' || typeof b !== 'bigint' || typeof c !== 'bigint') {
        return res.status(400).json({ error: 'Missing/invalid data, a, b, or c' });
    }
    try {
        const encrypted = await encryptPII(data);
        const { proof, publicSignals } = await proveCompliance(a, b, c);
        logger.info('Privacy process completed');
        res.json({ encrypted: encrypted.toString('hex'), proof, publicSignals });
    } catch (err) {
        next(err);
    }
});

// Encrypt string PII
app.post('/encrypt/pii', async (req: Request, res: Response, next: NextFunction) => {
    const { data } = req.body;
    if (typeof data !== 'string') return res.status(400).json({ error: 'data must be string' });
    try {
        const encrypted = await encryptPII(data);
        res.json({ encrypted: encrypted.toString('hex') });
    } catch (err) {
        next(err);
    }
});

// Decrypt PII
app.post('/decrypt/pii', async (req: Request, res: Response, next: NextFunction) => {
    const { encrypted } = req.body;
    if (typeof encrypted !== 'string') return res.status(400).json({ error: 'encrypted must be hex string' });
    try {
        const buffer = Buffer.from(encrypted, 'hex');
        const decrypted = await decryptPII(buffer);
        res.json({ decrypted });
    } catch (err) {
        next(err);
    }
});

// Encrypt number (uint8 example)
app.post('/encrypt/number', async (req: Request, res: Response, next: NextFunction) => {
    const { value } = req.body;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
        return res.status(400).json({ error: 'value must be uint8 (0-255)' });
    }
    try {
        const encrypted = await encryptNumber(value);
        res.json({ encrypted: encrypted.toString('hex') });
    } catch (err) {
        next(err);
    }
});

// Decrypt number
app.post('/decrypt/number', async (req: Request, res: Response, next: NextFunction) => {
    const { encrypted } = req.body;
    if (typeof encrypted !== 'string') return res.status(400).json({ error: 'encrypted must be hex string' });
    try {
        const buffer = Buffer.from(encrypted, 'hex');
        const value = await decryptNumber(buffer);
        res.json({ value });
    } catch (err) {
        next(err);
    }
});

// Generate ZK proof
app.post('/prove', async (req: Request, res: Response, next: NextFunction) => {
    const { a, b, c } = req.body;
    if (typeof a !== 'bigint' || typeof b !== 'bigint' || typeof c !== 'bigint') {
        return res.status(400).json({ error: 'a, b, c must be bigints' });
    }
    try {
        const { proof, publicSignals } = await proveCompliance(a, b, c);
        res.json({ proof, publicSignals });
    } catch (err) {
        next(err);
    }
});

// Verify ZK proof
app.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
    const { proof, publicSignals } = req.body;
    if (!proof || !Array.isArray(publicSignals)) {
        return res.status(400).json({ error: 'proof and publicSignals (array) required' });
    }
    try {
        const valid = await verifyCompliance(proof, publicSignals);
        res.json({ valid });
    } catch (err) {
        next(err);
    }
});

// Validate weave (audit)
app.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
    const { encryptedData, proof, publicSignals, performDecryption } = req.body;
    if (!encryptedData || !proof || !Array.isArray(publicSignals)) {
        return res.status(400).json({ error: 'encryptedData (hex), proof, publicSignals required' });
    }
    try {
        const buffer = Buffer.from(encryptedData, 'hex');
        const valid = await validateWeave(buffer, proof, publicSignals, !!performDecryption);
        res.json({ valid });
    } catch (err) {
        next(err);
    }
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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
    logger.info('SIGTERM received: shutting down');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});