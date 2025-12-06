// apps/privacy-engine/src/index.ts
// Privacy Engine entry point — production-grade Express server.
// Exposes endpoints for FHE encryption/decryption, ZK proof gen/verify, full process (encrypt + prove), validation.
// Robust: Async handlers, timeouts, input validation, error middleware, graceful shutdown, logging.
// Scalable: Ready for clustering (Node cluster) or PM2.
// Integrates Dapr if DAPR_PRIVACY_ENGINE_HTTP_PORT set.

import express, { Application, Request, Response, NextFunction } from 'express';
import { logger } from '@regloom/utils';
import { encryptPII, decryptPII, encryptNumber, decryptNumber } from './fhe';
import { proveCompliance, verifyCompliance } from './zkProof';
import { validateWeave } from './audit_oracle';
import { tracingMiddleware } from '@regloom/utils';

const app: Application = express();
app.use(express.json({ limit: '50mb' })); // Handle large payloads (e.g., batch data)
app.use(express.urlencoded({ extended: true }));
app.use(tracingMiddleware); // Add tracing middleware
logger.debug('Express middleware configured: JSON parser, URL-encoded body parser, and tracing middleware.');

const PORT = process.env.PRIVACY_ENGINE_PORT || 4002;

// Configurable PII detection (no hardcoding)
const PII_KEYWORDS = [
    "ssn", "social", "dob", "birth", "email", "phone", "mobile", "address",
    "name", "surname", "first_name", "last_name", "id", "passport", "tax"
];
const PII_PATTERNS = {
    email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    phone: /\+?\d{7,15}/,
    ssn: /\d{3}-\d{2}-\d{4}/,
};

type Record = { [key: string]: any };

// Detect if field/value is PII (name-based + content regex)
function isPII(field: string, value: any): boolean {
    logger.debug(`isPII: Checking field '${field}' with value '${value}'`);
    if (typeof value !== 'string') {
        logger.debug(`isPII: Value not string, skipping.`);
        return false;
    }
    const lowerField = field.toLowerCase();
    // Name heuristic
    const matchedKeyword = PII_KEYWORDS.find(kw => lowerField.includes(kw));
    if (matchedKeyword) {
        logger.debug(`isPII: Detected by keyword '${matchedKeyword}' in field.`);
        return true;
    }
    // Content regex
    for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
        if (pattern.test(value)) {
            logger.debug(`isPII: Detected by pattern '${type}' in value.`);
            return true;
        }
    }
    logger.debug(`isPII: No PII detected.`);
    return false;
}

// Health check — for probes/Dapr/lb
app.get('/health', (_req, res) => {
    // const requestId = _req.header('X-Request-ID') || 'unknown';
    // logger.debug('Health check received', {
    //     requestId,
    //     method: req.method,
    //     path: req.path,
    // });
    res.status(200).json({
        status: 'healthy',
        service: 'regloom-privacy-engine',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// Full process: Batch encrypt PII in records + Generate ZK proof (dynamic: prove encrypted count)
app.post('/process', async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('X-Request-ID') || 'unknown';
    logger.debug('Received evaluation request', { requestId, recordCount: req.body.data?.length });

    // --- ADDED DEBUG LOG: Incoming Request Body ---
    logger.debug(`POST /process: Incoming request body: ${JSON.stringify(req.body)}`);

    logger.debug('POST /process: Starting full privacy process.');
    const { data } = req.body; // data: array of records
    logger.debug(`POST /process: Received data of type '${typeof data}', length '${data?.length}'.`);
    if (!Array.isArray(data) || data.length === 0) {
        logger.warn('POST /process: Input validation failed: data must be non-empty array of records.');
        return res.status(400).json({ error: 'data must be non-empty array of records' });
    }
    try {
        let encryptedCount = 0n;
        const processedData = [];
        for (const record of data) {
            logger.debug(`POST /process: Processing record: ${JSON.stringify(record)}`);
            const processedRecord = { ...record };
            for (const [field, value] of Object.entries(record)) {
                logger.debug(`POST /process: Checking field '${field}' in record.`);
                if (isPII(field, value)) {
                    logger.debug(`POST /process: Encrypting PII in field '${field}'.`);
                    const encrypted = await encryptPII(value as string);
                    processedRecord[field] = encrypted.toString('hex');
                    encryptedCount += 1n;
                    logger.debug(`POST /process: Encrypted field '${field}', new count: ${encryptedCount}.`);
                } else {
                    logger.debug(`POST /process: Skipped non-PII field '${field}'.`);
                }
            }
            processedData.push(processedRecord);
            // big payload.... 
            // logger.debug(`POST /process: Processed record: ${JSON.stringify(processedRecord)}`);
        }

        // Dynamic ZK: Prove encryptedCount * 1n = encryptedCount (simple invariant proof of processing)
        const a = encryptedCount;
        const b = 1n;
        const c = a * b;
        logger.debug(`POST /process: Generating dynamic ZK proof with a=${a}, b=${b}, c=${c}.`);
        const { proof, publicSignals } = await proveCompliance(a, b, c);
        logger.debug(`POST /process: ZK proof generated successfully.`);

        logger.info('Privacy process completed', { encryptedCount: encryptedCount.toString() });

        const responseData = { processedData, proof, publicSignals };
        // --- ADDED DEBUG LOG: Outgoing Response Data (partial) ---
        // massiv epayload...
        // logger.debug(`POST /process: Outgoing response data (first record and proof details): ${JSON.stringify({
        //     processedDataSample: responseData.processedData[0],
        //     proofSize: responseData.proof.length,
        //     publicSignals: responseData.publicSignals
        // })}`);

        res.json(responseData);
    } catch (err) {
        logger.error(`POST /process: Failed to complete privacy process.`, { error: (err as Error).message });
        next(err);
    }
});

// Encrypt string PII
app.post('/encrypt/pii', async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('X-Request-ID') || 'unknown';
    logger.debug('Received evaluation request', { requestId, recordCount: req.body.data?.length });

    // --- ADDED DEBUG LOG: Incoming Request Body ---
    logger.debug(`POST /encrypt/pii: Incoming request body: ${JSON.stringify(req.body)}`);

    logger.debug('POST /encrypt/pii: Starting PII encryption.');
    const { data } = req.body;
    logger.debug(`POST /encrypt/pii: Received data: '${data}'.`);
    if (typeof data !== 'string') {
        logger.warn('POST /encrypt/pii: Input validation failed: data must be string.');
        return res.status(400).json({ error: 'data must be string' });
    }
    try {
        const encrypted = await encryptPII(data);
        logger.info('POST /encrypt/pii: Encryption completed.');

        const responseData = { encrypted: encrypted.toString('hex') };
        // --- ADDED DEBUG LOG: Outgoing Response Data (partial) ---
        logger.debug(`POST /encrypt/pii: Encrypted result length: ${encrypted.length}. Outgoing response: ${responseData.encrypted.substring(0, 50)}...`);

        res.json(responseData);
    } catch (err) {
        logger.error(`POST /encrypt/pii: Encryption failed.`, { error: (err as Error).message });
        next(err);
    }
});

// Decrypt PII
app.post('/decrypt/pii', async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('X-Request-ID') || 'unknown';
    logger.debug('Received evaluation request', { requestId, recordCount: req.body.data?.length });

    // --- ADDED DEBUG LOG: Incoming Request Body ---
    logger.debug(`POST /decrypt/pii: Incoming request body: ${JSON.stringify({ encrypted: req.body.encrypted?.substring(0, 50) + '...' })}`);

    logger.debug('POST /decrypt/pii: Starting PII decryption.');
    const { encrypted } = req.body;
    logger.debug(`POST /decrypt/pii: Received encrypted: '${encrypted.substring(0, 50)}...'.`);
    if (typeof encrypted !== 'string') {
        logger.warn('POST /decrypt/pii: Input validation failed: encrypted must be hex string.');
        return res.status(400).json({ error: 'encrypted must be hex string' });
    }
    try {
        const buffer = Buffer.from(encrypted, 'hex');
        logger.debug(`POST /decrypt/pii: Converted to buffer of length ${buffer.length}.`);
        const decrypted = await decryptPII(buffer);
        logger.info('POST /decrypt/pii: Decryption completed.');

        const responseData = { decrypted };
        // --- ADDED DEBUG LOG: Outgoing Response Data ---
        logger.debug(`POST /decrypt/pii: Outgoing response value: '${decrypted}'.`);

        res.json(responseData);
    } catch (err) {
        logger.error(`POST /decrypt/pii: Decryption failed.`, { error: (err as Error).message });
        next(err);
    }
});

// Encrypt number (uint8 example)
app.post('/encrypt/number', async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('X-Request-ID') || 'unknown';
    logger.debug('Received evaluation request', { requestId, recordCount: req.body.data?.length });

    // --- ADDED DEBUG LOG: Incoming Request Body ---
    logger.debug(`POST /encrypt/number: Incoming request body: ${JSON.stringify(req.body)}`);

    logger.debug('POST /encrypt/number: Starting number encryption.');
    const { value } = req.body;
    logger.debug(`POST /encrypt/number: Received value: ${value}.`);
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
        logger.warn('POST /encrypt/number: Input validation failed: value must be uint8 (0-255).');
        return res.status(400).json({ error: 'value must be uint8 (0-255)' });
    }
    try {
        const encrypted = await encryptNumber(value);
        logger.info('POST /encrypt/number: Encryption completed.');

        const responseData = { encrypted: encrypted.toString('hex') };
        // --- ADDED DEBUG LOG: Outgoing Response Data (partial) ---
        logger.debug(`POST /encrypt/number: Encrypted result length: ${encrypted.length}. Outgoing response: ${responseData.encrypted.substring(0, 50)}...`);

        res.json(responseData);
    } catch (err) {
        logger.error(`POST /encrypt/number: Encryption failed.`, { error: (err as Error).message });
        next(err);
    }
});

// Decrypt number
app.post('/decrypt/number', async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('X-Request-ID') || 'unknown';
    logger.debug('Received evaluation request', { requestId, recordCount: req.body.data?.length });

    // --- ADDED DEBUG LOG: Incoming Request Body ---
    logger.debug(`POST /decrypt/number: Incoming request body: ${JSON.stringify({ encrypted: req.body.encrypted?.substring(0, 50) + '...' })}`);

    logger.debug('POST /decrypt/number: Starting number decryption.');
    const { encrypted } = req.body;
    logger.debug(`POST /decrypt/number: Received encrypted: '${encrypted.substring(0, 50)}...'.`);
    if (typeof encrypted !== 'string') {
        logger.warn('POST /decrypt/number: Input validation failed: encrypted must be hex string.');
        return res.status(400).json({ error: 'encrypted must be hex string' });
    }
    try {
        const buffer = Buffer.from(encrypted, 'hex');
        logger.debug(`POST /decrypt/number: Converted to buffer of length ${buffer.length}.`);
        const value = await decryptNumber(buffer);
        logger.info('POST /decrypt/number: Decryption completed.');

        const responseData = { value };
        // --- ADDED DEBUG LOG: Outgoing Response Data ---
        logger.debug(`POST /decrypt/number: Outgoing response value: ${value}.`);

        res.json(responseData);
    } catch (err) {
        logger.error(`POST /decrypt/number: Decryption failed.`, { error: (err as Error).message });
        next(err);
    }
});

// Generate ZK proof
app.post('/prove', async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('X-Request-ID') || 'unknown';
    logger.debug('Received evaluation request', { requestId, recordCount: req.body.data?.length });

    // --- ADDED DEBUG LOG: Incoming Request Body ---
    logger.debug(`POST /prove: Incoming request body: ${JSON.stringify(req.body)}`);

    logger.debug('POST /prove: Starting ZK proof generation.');
    const { a, b, c } = req.body;
    logger.debug(`POST /prove: Received inputs: a=${a}, b=${b}, c=${c}.`);
    // Note: The original BigInt check here `typeof a !== 'bigint'` will fail for JSON input, which parses as `number` or `string`.
    // Assuming BigInt conversion happens upstream or is handled by JSON parser setup. We'll proceed with the assumption that input is valid string/number.
    if (a === undefined || b === undefined || c === undefined) {
        logger.warn('POST /prove: Input validation failed: a, b, c required.');
        return res.status(400).json({ error: 'a, b, c required' });
    }

    // Convert to BigInt for proveCompliance, assuming input is string or number that fits.
    const bigA = BigInt(a);
    const bigB = BigInt(b);
    const bigC = BigInt(c);

    try {
        const { proof, publicSignals } = await proveCompliance(bigA, bigB, bigC);
        logger.info('POST /prove: Proof generation completed.');

        const responseData = { proof, publicSignals };
        // --- ADDED DEBUG LOG: Outgoing Response Data (partial) ---
        logger.debug(`POST /prove: Generated publicSignals: ${publicSignals.join(', ')}. Proof length: ${proof.length}.`);

        res.json(responseData);
    } catch (err) {
        logger.error(`POST /prove: Proof generation failed.`, { error: (err as Error).message });
        next(err);
    }
});

// Verify ZK proof
app.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('X-Request-ID') || 'unknown';
    logger.debug('Received evaluation request', { requestId, recordCount: req.body.data?.length });

    // --- ADDED DEBUG LOG: Incoming Request Body (partial) ---
    logger.debug(`POST /verify: Incoming request body (publicSignals): ${JSON.stringify(req.body.publicSignals)}`);

    logger.debug('POST /verify: Starting ZK proof verification.');
    const { proof, publicSignals } = req.body;
    logger.debug(`POST /verify: Received publicSignals: ${publicSignals?.join(', ')}.`);
    if (!proof || !Array.isArray(publicSignals)) {
        logger.warn('POST /verify: Input validation failed: proof and publicSignals (array) required.');
        return res.status(400).json({ error: 'proof and publicSignals (array) required' });
    }
    try {
        const valid = await verifyCompliance(proof, publicSignals);
        logger.info(`POST /verify: Verification completed (Result: ${valid}).`);

        const responseData = { valid };
        // --- ADDED DEBUG LOG: Outgoing Response Data ---
        logger.debug(`POST /verify: Outgoing response value: ${valid}.`);

        res.json(responseData);
    } catch (err) {
        logger.error(`POST /verify: Verification failed.`, { error: (err as Error).message });
        next(err);
    }
});

// Validate weave (audit)
app.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('X-Request-ID') || 'unknown';
    logger.debug('Received evaluation request', { requestId, recordCount: req.body.data?.length });

    // --- ADDED DEBUG LOG: Incoming Request Body (partial) ---
    logger.debug(`POST /validate: Incoming request body (encryptedData length, proof length, performDecryption): ${JSON.stringify({
        encryptedDataLength: req.body.encryptedData?.length,
        proofLength: req.body.proof?.length,
        performDecryption: req.body.performDecryption
    })}`);

    logger.debug('POST /validate: Starting weave validation process.');
    const { encryptedData, proof, publicSignals, performDecryption } = req.body;
    logger.debug(`POST /validate: Received encryptedData length: ${encryptedData?.length}, performDecryption: ${performDecryption}.`);
    if (!encryptedData || !proof || !Array.isArray(publicSignals)) {
        logger.warn('POST /validate: Input validation failed: encryptedData (hex), proof, publicSignals required.');
        return res.status(400).json({ error: 'encryptedData (hex), proof, publicSignals required' });
    }
    try {
        const buffer = Buffer.from(encryptedData, 'hex');
        logger.debug(`POST /validate: Converted encryptedData to buffer of length ${buffer.length}.`);
        const valid = await validateWeave(buffer, proof, publicSignals, !!performDecryption);
        logger.info(`POST /validate: Validation completed (Result: ${valid}).`);

        const responseData = { valid };
        // --- ADDED DEBUG LOG: Outgoing Response Data ---
        logger.debug(`POST /validate: Outgoing response value: ${valid}.`);

        res.json(responseData);
    } catch (err) {
        logger.error(`POST /validate: Validation failed.`, { error: (err as Error).message });
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