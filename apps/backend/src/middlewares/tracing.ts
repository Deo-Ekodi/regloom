// apps/backend/src/middlewares/tracing.ts
// Middleware for request tracing: generates a unique request ID (or uses client-provided), 
// propagates it via AsyncLocalStorage for logging context, and sets it in response headers.
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncLocalStorage } from '@regloom/utils';

export default function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
    // Use client-provided ID if available, otherwise generate a new UUID
    const requestId = req.header('X-Request-ID') || uuidv4();

    // Set in response header for client traceability
    res.setHeader('X-Request-ID', requestId);

    // Run the request in context with requestId for automatic logging
    asyncLocalStorage.run({ requestId }, () => {
        next();
    });
}