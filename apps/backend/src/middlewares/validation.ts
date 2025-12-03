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
        try {
            schema.parse(req.body);
            next();
        } catch (err) {
            if (err instanceof z.ZodError) {
                logger.warn(`Validation failed: ${err.message}`, { path: req.path, issues: err.issues });
                return res.status(400).json({ error: 'Validation error', details: err.issues });
            }
            next(err);
        }
    };
}