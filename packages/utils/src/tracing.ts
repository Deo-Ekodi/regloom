// // apps/backend/src/middlewares/tracing.ts
// // Global request ID + AsyncLocalStorage tracing middleware
// // Propagates X-Request-ID (or generates one) across all services via headers
// // Used by logger, event-bus, axios, Temporal activities, synth-gen, rule-engine

// import { Request, Response, NextFunction } from 'express';
// import { v4 as uuidv4 } from 'uuid';
// import { runInContext, getRequestId, logger } from '@regloom/utils';

// export default function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
//     const requestId = req.header('X-Request-ID') || uuidv4();
//     const userId = (req as any).user?.userId;

//     // Set response header early
//     res.setHeader('X-Request-ID', requestId);

//     // Store in AsyncLocalStorage for logger + axios interceptor
//     // Use the correctly imported 'runInContext' function
//     runInContext(
//         { requestId, userId, source: 'api' },
//         () => {
//             // Use the correctly imported 'getRequestId' function
//             res.setHeader('X-Request-ID', getRequestId());
//             logger.debug('New request context created', { requestId: getRequestId(), path: req.path, method: req.method });
//             next();
//         }
//     );
// }

// packages/utils/src/tracing.ts
// Middleware for request tracing: generates a unique request ID (or uses client-provided),
// propagates it via AsyncLocalStorage for logging context, and sets it in response headers.
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import asyncLocalStorage from './asyncLocalStorage';
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