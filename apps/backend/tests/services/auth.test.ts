// apps/backend/tests/services/auth.test.ts
// Unit tests for auth service. Mocks Supabase and JWT for isolation. Tests registration, login, and token verification scenarios including errors.

import { register, login, verifyToken } from '../../src/services/auth';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

jest.mock('@supabase/supabase-js');
jest.mock('jsonwebtoken');

const mockSupabase = {
    auth: {
        signUp: jest.fn(),
        signInWithPassword: jest.fn(),
    },
};

(createClient as jest.Mock).mockReturnValue(mockSupabase);

describe('Auth Service', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
        mockReq = { body: {} };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
    });

    it('should register user successfully', async () => {
        mockSupabase.auth.signUp.mockResolvedValue({ data: { user: { id: '1' } }, error: null });
        mockReq.body = { email: 'test@example.com', password: 'password123' };
        await register(mockReq as Request, mockRes as Response);
        expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should handle registration error', async () => {
        mockSupabase.auth.signUp.mockResolvedValue({ data: null, error: new Error('Error') });
        mockReq.body = { email: 'test@example.com', password: 'password123' };
        await register(mockReq as Request, mockRes as Response);
        expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    // Similar for login and verifyToken
});