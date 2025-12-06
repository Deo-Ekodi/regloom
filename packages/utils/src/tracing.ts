// packages/utils/src/tracing.ts
import { Request, Response, NextFunction } from 'express';
import { runInContext, getRequestId } from './asyncLocalStorage';
import { logger } from '@regloom/utils';

export default function tracingMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const incomingId = req.header('X-Request-ID');

    // Extract userId safely — works with your auth middleware
    // Supports: req.user?.userId, req.user?.id, req.user?.sub, etc.
    const userId = (
        (req as any).user?.userId ||
        (req as any).user?.id ||
        (req as any).user?.sub ||
        (req as any).user
    );

    runInContext(
        {
            requestId: incomingId,     // undefined → generates new
            userId: userId ? String(userId) : undefined,
            source: 'api',
        },
        () => {
            const finalId = getRequestId();
            res.setHeader('X-Request-ID', finalId);

            logger.debug('AsyncLocalStorage context created/inherited', {
                requestId: finalId,
                userId: userId ? String(userId) : undefined,
                inherited: !!incomingId,
                depth: incomingId ? 'child' : 'root',
                source: 'api',
                path: req.path,
                method: req.method,
            });

            next();
        }
    );
}