// apps/backend/src/middlewares/validation.ts
// Reusable validation middleware using Zod schemas. 
// Factory function to create validators for specific routes. 
// Logs validation issues and responds with detailed errors. 
// Integrated in api-gateway for input sanitization.

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { logger } from '@regloom/utils';

export function validate(schema: ZodSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
        logger.debug(`Attempting validation for ${req.method} ${req.path}`);
        try {
            schema.parse(req.body);
            logger.info(`Validation successful for ${req.method} ${req.path}`);
            next();
        } catch (err) {
            if (err instanceof z.ZodError) {
                // Existing warning log for validation errors
                logger.warn(`Validation failed: ${err.message}`, { path: req.path, issues: err.issues });
                return res.status(400).json({ error: 'Validation error', details: err.issues });
            }

            // New emergency log for unexpected, non-Zod errors
            // Note: Since we don't know the exact error type, we use (err as Error).message for logging.
            logger.emerg(`Critical non-Zod error during validation on ${req.path}: ${(err as Error).message}`, {
                stack: (err as Error).stack,
                errorObject: err
            });
            next(err);
        }
    };
}