// apps/backend/src/services/api-gateway.ts
// Central routing and validation service for the backend API.
// Defines Express routes for core endpoints like auth, ingestion, and weaving.
// Integrates authentication middleware and input validation using Zod schemas.

import { Application, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import authMiddleware from '../middlewares/auth';
import { handleWeave } from '../controllers/weaveController'; // Corrected import (named)
import { ingest } from '../services/ingestion'; // Corrected import (named)
import { logger } from '@regloom/utils';
import { WeaveInput } from '@regloom/types';

// Configure multer for file uploads (temp storage in secure dir)
const upload = multer({
    dest: process.env.INGEST_DIR || path.resolve(__dirname, '../../../uploads'),
    limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || '104857600', 10) }, // Default 100MB limit
});

// Auth schemas (imported or defined in auth.ts, referenced here)
import { loginSchema, registerSchema } from './auth';

// Ingestion schema (now includes the 'source' required for generic ingestion)
const ingestionSchema = z.object({
    source: z.string().min(1, 'Source required').default('csv'),
    regulations: z.array(z.string()).optional(), // Made optional as not directly used in ingest call
    // Note: Other connector-specific params (like 'delimiter' or 'sheet' for sheet) would go here too
});

// Weave schema based on shared types (fully defined to match WeaveInput interface)
const weaveSchema = z.object({
    source: z.string(),
    connectorParams: z.record(z.string(), z.any()).optional(),
    regulations: z.array(z.string()),
    userId: z.string(),
    timestamp: z.string().optional().default(new Date().toISOString()),
    options: z.object({
        maxRows: z.number().optional(),
        dryRun: z.boolean().optional(),
    }).optional(),
});

// Validation middleware factory
const validate = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
        logger.debug(`Validating request body for route: ${req.path}`); // DEBUG: Start validation
        schema.parse(req.body);
        logger.debug(`Validation successful for route: ${req.path}`); // DEBUG: Validation success
        next();
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger.warn(`Validation error: ${err.message}`, { issues: err.issues, path: req.path }); // WARNING: Limit validation failure
            return res.status(400).json({ error: 'Invalid input', details: err.issues });
        }
        logger.error(`Unexpected validation middleware error: ${(err as Error).message}`, { stack: (err as Error).stack, path: req.path }); // ERROR: Unhandled exception in middleware
        next(err);
    }
};

export default function setupApiGateway(app: Application) {
    logger.info('Starting API Gateway setup...'); // INFO: Start setup

    // Auth routes (public)
    app.post('/auth/register', validate(registerSchema), (req: Request, res: Response) => {
        logger.debug('Route hit: /auth/register'); // DEBUG: Route hit
        // Call auth service register
        import('./auth').then(({ register }) => {
            logger.debug('Register service imported and called.'); // DEBUG: Service call
            register(req, res);
        });
    });
    app.post('/auth/login', validate(loginSchema), (req: Request, res: Response) => {
        logger.debug('Route hit: /auth/login'); // DEBUG: Route hit
        // Call auth service login
        import('./auth').then(({ login }) => {
            logger.debug('Login service imported and called.'); // DEBUG: Service call
            login(req, res);
        });
    });
    app.post('/auth/dev-login', (req: Request, res: Response) => {
        logger.warn('Route hit: /auth/dev-login (Development Login)'); // WARNING: Dev route usage
        // Call auth service devLogin (no validation needed)
        import('./auth').then(({ devLogin }) => devLogin(req, res));
    });

    // --- DAPR PUBLIC ROUTES (MUST BE UNPROTECTED) ---
    // This fixes the Dapr 401 subscription error
    app.get('/dapr/subscribe', (req: Request, res: Response) => {
        logger.debug('Route hit: /dapr/subscribe'); // DEBUG: Route hit
        // Return an empty array if this service doesn't subscribe to any topic
        res.status(200).json([]);
    });

    // Protected routes with auth middleware
    app.use(authMiddleware);
    logger.info('Auth middleware applied to subsequent routes.'); // INFO: Middleware applied

    // Ingestion route (handles file upload for 'csv'/'excel' and uses generic 'ingest')
    app.post('/ingest', upload.single('file'), validate(ingestionSchema), async (req: Request, res: Response, next: NextFunction) => {
        logger.info('Route hit: /ingest'); // INFO: Route hit
        // 1. Get validated body data
        const { source, regulations } = req.body;
        logger.debug(`Ingestion attempt initiated. Source: ${source}`); // DEBUG: Start ingestion

        // 2. Check for required file if source is 'csv' or 'excel'
        if (['csv', 'excel'].includes(source) && !req.file) {
            logger.warn(`No file uploaded for file-based ingestion: ${source}`); // WARNING: Limit missing file
            return res.status(400).json({ error: `File required for ${source} ingestion` });
        }

        // 3. Prepare parameters for the generic 'ingest' function
        const ingestionParams: Record<string, any> = { ...req.body };

        // Add filePath to params if a file was uploaded (for CSV/Excel connector)
        let filePath: string | undefined;
        if (req.file) {
            filePath = req.file.path;
            ingestionParams.filePath = filePath;
            logger.debug(`File uploaded successfully to: ${filePath}`); // DEBUG: File upload info
        }

        try {
            // 4. Call the generic 'ingest' function. 
            // The ingest function in ingestion.ts will look at 'source' to call the right connector.
            logger.debug(`Calling ingest function for source: ${source}`); // DEBUG: Function call
            const ingestedData = await ingest(source, ingestionParams);
            logger.info(`Ingestion successful. Source: ${source}, Records: ${ingestedData.length}`); // INFO: Success

            // 5. Clean up temp file (only relevant for file uploads)
            if (filePath) {
                await fs.unlink(filePath);
                logger.debug(`Cleaned up temporary file: ${filePath}`); // DEBUG: Cleanup success
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
            logger.error(`Ingestion error: ${(err as Error).message}`, { stack: (err as Error).stack }); // ERROR: Ingestion runtime failure

            // Attempt to clean up the file on failure
            if (filePath) {
                await fs.unlink(filePath).catch((unlinkErr) => logger.warn(`Failed to clean up file: ${unlinkErr.message}`));
            }

            res.status(500).json({ error: 'Ingestion failed', details: (err as Error).message });
        }
    });

    // Weave route (now supports multipart file upload if source is 'csv'/'excel')
    app.post('/weave', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
        logger.info('Route hit: /weave'); // INFO: Route hit
        // 1. Get validated body data
        let { source, regulations, userId, timestamp, connectorParams, options } = req.body;

        // 2. Parse JSON strings from multipart form-data
        try {
            if (typeof regulations === 'string') regulations = JSON.parse(regulations);
            if (typeof connectorParams === 'string') connectorParams = JSON.parse(connectorParams);
            if (typeof options === 'string') options = JSON.parse(options);
        } catch (err) {
            logger.warn(`Failed to parse JSON field: ${(err as Error).message}`);
            return res.status(400).json({ error: 'Invalid JSON in form field' });
        }

        logger.debug(`Weave attempt initiated. Source: ${source}`); // DEBUG: Start weave

        // 3. Check for required file if source is 'csv' or 'excel'
        if (['csv', 'excel'].includes(source) && !req.file) {
            logger.warn(`No file uploaded for file-based weave: ${source}`); // WARNING: Missing file
            return res.status(400).json({ error: `File required for ${source} weave` });
        }

        // 4. Validate parsed body with schema
        try {
            weaveSchema.parse({ source, connectorParams, regulations, userId, timestamp, options });
        } catch (err) {
            if (err instanceof z.ZodError) {
                logger.warn(`Validation error: ${err.message}`, { issues: err.issues });
                return res.status(400).json({ error: 'Invalid input', details: err.issues });
            }
            logger.error(`Unexpected validation error: ${(err as Error).message}`);
            return res.status(500).json({ error: 'Internal validation error' });
        }

        // 5. Prepare input for weave
        let input: WeaveInput = {
            source,
            regulations,
            userId,
            timestamp,
            connectorParams: connectorParams || {},
            options: options || {},
            data: [], // Will be populated if source != 'direct'
        };

        // 6. Ingest data if source != 'direct'
        if (source !== 'direct') {
            logger.debug('Ingesting data for weave...');
            if (req.file) {
                if (!input.connectorParams) input.connectorParams = {};
                input.connectorParams.filePath = req.file.path;
            }
            input.data = await ingest(source, input.connectorParams!, input.options!);
            logger.debug(`Ingested ${input.data.length} records for weave`);
        } else if (req.body.data) {
            // FIX HERE: Skip JSON.parse if the body was already parsed by express.json()
            if (Array.isArray(req.body.data)) {
                // Data is already a parsed array from the express.json() middleware
                input.data = req.body.data;
            } else if (typeof req.body.data === 'string') {
                // Fallback for multipart/form-data where 'data' might still be a JSON string
                try {
                    input.data = JSON.parse(req.body.data);
                } catch (err) {
                    logger.warn(`Failed to parse data field: ${(err as Error).message}`);
                    return res.status(400).json({ error: 'Invalid JSON in data field' });
                }
            } else {
                logger.warn('Direct source data is neither a parsed array nor a JSON string.', { dataType: typeof req.body.data });
                return res.status(400).json({ error: 'Invalid data format for direct source' });
            }
        }


        try {
            // 7. Call handleWeave with input
            await handleWeave({ body: input } as Request, res);
            logger.debug('Weave process dispatched to controller.');
        } catch (err) {
            if (req.file) {
                await fs.unlink(req.file.path).catch(() => { });
            }
            logger.error(`Weave error: ${(err as Error).message}`, { stack: (err as Error).stack });
            res.status(500).json({ error: 'Weave failed', details: (err as Error).message });
        }
    });

    logger.info('API Gateway routes configured');
}