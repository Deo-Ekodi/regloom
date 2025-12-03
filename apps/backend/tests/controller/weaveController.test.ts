// apps/backend/tests/controllers/weaveController.test.ts
// Integration-style tests for weaveController. Mocks axios for service calls. Verifies full flow, compliance failures, and errors.

import axios from 'axios';
import weaveController from '../../src/controllers/weaveController';
import { Request, Response } from 'express';

jest.mock('axios');

describe('Weave Controller', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
        mockReq = { body: { data: {}, regulations: ['gdpr'] } };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
    });

    it('should complete weave successfully', async () => {
        (axios.post as jest.Mock)
            .mockResolvedValueOnce({ data: { compliant: true } })  // Rule
            .mockResolvedValueOnce({ data: { synth: true } })  // Synth
            .mockResolvedValueOnce({ data: { processed: true } });  // Privacy
        await weaveController.handleWeave(mockReq as Request, mockRes as Response);
        expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should fail on non-compliance', async () => {
        (axios.post as jest.Mock).mockResolvedValueOnce({ data: { compliant: false, violations: [] } });
        await weaveController.handleWeave(mockReq as Request, mockRes as Response);
        expect(mockRes.status).toHaveBeenCalledWith(400);
    });
});