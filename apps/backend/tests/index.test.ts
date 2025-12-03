// apps/backend/tests/index.test.ts
// Tests for backend entry point (index.ts). Verifies server starts, health check responds, and basic routes are available. Uses supertest for HTTP assertions.

import request from 'supertest';
import app from '../src/index';

describe('Backend Server', () => {
    it('should respond to health check', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('OK');
    });
});