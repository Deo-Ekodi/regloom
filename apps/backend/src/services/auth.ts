// apps/backend/src/services/auth.ts
// Authentication service integrating with Supabase for user registration, login, and token management.
// Handles secure auth flows with error handling. Uses environment variables for Supabase URL and keys.
// Relies on Supabase's native access_token for auth, without custom JWT layering.
import { createClient } from '@supabase/supabase-js';
import { Request, Response } from 'express';
import { logger } from '@regloom/utils';
import { z } from 'zod';
// Supabase client setup (anon key for public auth actions)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);
// Schemas for validation (exported for api-gateway)
export const registerSchema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(8, 'Password too short'),
});
export const loginSchema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(8, 'Password too short'),
});
// Register handler
export async function register(req: Request, res: Response) {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        logger.info(`User registered: ${email}`);
        res.status(201).json({ user: data.user });
    } catch (err) {
        logger.error(`Registration error: ${(err as Error).message}`);
        res.status(400).json({ error: (err as Error).message });
    }
}
// Login handler
export async function login(req: Request, res: Response) {
    const { email, password } = req.body;
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        logger.info(`User logged in: ${email}`);
        res.status(200).json({ access_token: data.session?.access_token, user: data.user });
    } catch (err) {
        logger.error(`Login error: ${(err as Error).message}`);
        res.status(401).json({ error: 'Invalid credentials' });
    }
}
// Dev login handler (signs in test user; dev-only)
export async function devLogin(req: Request, res: Response) {
    if (process.env.NODE_ENV !== 'development') {
        logger.warn('Dev login attempted in non-dev environment');
        return res.status(403).json({ error: 'Forbidden: Dev endpoint only' });
    }
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: 'test@dev.com',
            password: 'devpassword123',
        });
        if (error) throw error;
        logger.info('Dev login successful');
        res.status(200).json({ access_token: data.session?.access_token, user: data.user });
    } catch (err) {
        logger.error(`Dev login error: ${(err as Error).message}`);
        res.status(500).json({ error: 'Dev login failed' });
    }
}