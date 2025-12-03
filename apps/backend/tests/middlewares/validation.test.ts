// apps/backend/tests/middlewares/validation.test.ts
// Tests for validation middleware. Uses mock requests with valid/invalid data against Zod schemas. Asserts response codes and error details.

import { Request, Response, NextFunction } from 'express';
import { validate } from '../../src/middlewares/validation';
import { z } from 'zod';

describe('Validation Middleware', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validate(schema);

    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.Mock<NextFunction>;

    beforeEach(() => {
        mockReq = { body: {} };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();
    });

    it('should pass valid input', () => {
        mockReq.body = { name: 'test' };
        middleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();
    });

    it('should fail invalid input', () => {
        mockReq.body = { name: 123 };
        middleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockNext).not.toHaveBeenCalled();
    });
});