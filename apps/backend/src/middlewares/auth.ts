// apps/backend/src/middlewares/auth.ts
// Authentication middleware for protecting routes.
// Verifies Supabase access_token from Authorization header and attaches user data to request.
// Handles unauthorized access with proper logging.
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@regloom/utils';

declare global {
    namespace Express {
        interface Request {
            user?: any;
        }
    }
}

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

export default async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Missing or invalid auth header');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        // Create client with token for verification
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
        });
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) throw error || new Error('User not found');
        req.user = user; // Attach to req for downstream use
        next();
    } catch (err) {
        logger.error(`Auth middleware error: ${(err as Error).message}`);
        res.status(401).json({ error: 'Invalid token' });
    }
}