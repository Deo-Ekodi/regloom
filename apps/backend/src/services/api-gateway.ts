// apps/backend/src/services/api-gateway.ts
// Central routing and validation service for the backend API.
// Defines Express routes for core endpoints like auth, ingestion, and weaving.
// Integrates authentication middleware and input validation using Zod schemas.
// Ensures all incoming requests are routed securely and validated before reaching controllers.
import { Application, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import authMiddleware from '../middlewares/auth';
import { handleWeave } from '../controllers/weaveController'; // Corrected import (named)
import { ingest } from './ingestion'; // Corrected import (named)
import { logger } from '@regloom/utils';

// Configure multer for file uploads (temp storage in secure dir)
const upload = multer({
    dest: process.env.INGEST_DIR || path.resolve(__dirname, '../../../uploads'),
    limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '104857600', 10) }, // Default 100MB limit
});

// Basic health check schema (example)
const healthSchema = z.object({});

// Auth schemas (imported or defined in auth.ts, referenced here)
import { loginSchema, registerSchema } from './auth';

// Ingestion schema (now includes the 'source' required for generic ingestion)
const ingestionSchema = z.object({
    source: z.string().min(1, 'Source required').default('csv'),
    regulations: z.array(z.string()).optional(), // Made optional as not directly used in ingest call
    // Note: Other connector-specific params (like 'delimiter' or 'objectType') would go here too
});

// Weave schema based on shared types (fully defined to match WeaveInput interface)
const weaveSchema = z.object({
    data: z.array(z.record(z.string(), z.any())), // Batch array of records
    regulations: z.array(z.string()),
    userId: z.string(),
    timestamp: z.string(),
    source: z.string(),
    connectorParams: z.record(z.string(), z.any()).optional(),
    options: z.object({
        maxRows: z.number().optional(),
        dryRun: z.boolean().optional(),
    }).optional(),
});

// Validation middleware factory
const validate = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
        schema.parse(req.body);
        next();
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger.warn(`Validation error: ${err.message}`, { issues: err.issues });
            return res.status(400).json({ error: 'Invalid input', details: err.issues });
        }
        next(err);
    }
};

export default function setupApiGateway(app: Application) {
    // Auth routes (public)
    app.post('/auth/register', validate(registerSchema), (req: Request, res: Response) => {
        // Call auth service register
        import('./auth').then(({ register }) => register(req, res));
    });
    app.post('/auth/login', validate(loginSchema), (req: Request, res: Response) => {
        // Call auth service login
        import('./auth').then(({ login }) => login(req, res));
    });
    app.post('/auth/dev-login', (req: Request, res: Response) => {
        // Call auth service devLogin (no validation needed)
        import('./auth').then(({ devLogin }) => devLogin(req, res));
    });

    // --- DAPR PUBLIC ROUTES (MUST BE UNPROTECTED) ---
    // This fixes the Dapr 401 subscription error
    app.get('/dapr/subscribe', (req: Request, res: Response) => {
        // Return an empty array if this service doesn't subscribe to any topic
        res.status(200).json([]);
    });

    // Protected routes with auth middleware
    app.use(authMiddleware);

    // Ingestion route (now handles file upload for 'csv' and uses generic 'ingest')
    app.post('/ingest', upload.single('file'), validate(ingestionSchema), async (req: Request, res: Response, next: NextFunction) => {
        // 1. Get validated body data
        const { source, regulations } = req.body;

        // 2. Check for required file if source is 'csv' (or similar file-based sources)
        // We assume file upload is only necessary for CSV for simplicity
        if (source === 'csv' && !req.file) {
            logger.warn(`No file uploaded for file-based ingestion: ${source}`);
            return res.status(400).json({ error: `File required for ${source} ingestion` });
        }

        // 3. Prepare parameters for the generic 'ingest' function
        const ingestionParams: Record<string, any> = { ...req.body };

        // Add filePath to params if a file was uploaded (for CSV connector)
        let filePath: string | undefined;
        if (req.file) {
            filePath = req.file.path;
            ingestionParams.filePath = filePath;
        }

        try {
            // 4. Call the generic 'ingest' function. 
            // The ingest function in ingestion.ts will look at 'source' to call the right connector.
            const ingestedData = await ingest(source, ingestionParams);

            // 5. Clean up temp file (only relevant for file uploads)
            if (filePath) {
                await fs.unlink(filePath);
            }

            res.status(200).json({
                ingested: {
                    source,
                    recordCount: ingestedData.length,
                    regulations: regulations || [], // Optional, so fallback to empty
                },
                dataSample: ingestedData.slice(0, 5) // Return a small sample
            });

        } catch (err) {
            logger.error(`Ingestion error: ${(err as Error).message}`, { stack: (err as Error).stack });

            // Attempt to clean up the file on failure
            if (filePath) {
                await fs.unlink(filePath).catch((unlinkErr) => logger.warn(`Failed to clean up file: ${unlinkErr.message}`));
            }

            res.status(500).json({ error: 'Ingestion failed', details: (err as Error).message });
        }
    });

    // Weave route
    app.post('/weave', validate(weaveSchema), (req: Request, res: Response) => {
        handleWeave(req, res);
    });

    logger.info('API Gateway routes configured');
}