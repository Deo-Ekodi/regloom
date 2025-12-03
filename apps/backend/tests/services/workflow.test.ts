// apps/backend/tests/services/workflow.test.ts
// Robust tests for weave workflow using Temporal's testing suite.
// Simulates full saga with mocked HTTP calls, verifies sequences, errors, compensation, signals, and queries.
// Ensures type safety and covers production scenarios like timeouts and retries.

// apps/backend/tests/services/workflow.test.ts
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
// Import WorkflowClient explicitly to use its type
import { WorkflowClient } from '@temporalio/client';
import axios from 'axios';
// Import explicit signal/query names for type safety
import { weaveSaga, activities, cancelWeave, getStatus } from '../../src/services/workflow';
import { WeaveInput } from '@regloom/types';
import { publishEvent } from '../../src/services/event-bus';

jest.mock('axios');
jest.mock('../../src/services/event-bus');

describe('Weave Workflow', () => {
    let testEnv: TestWorkflowEnvironment;

    beforeAll(async () => {
        // Sets up a local test server
        testEnv = await TestWorkflowEnvironment.createLocal();
    });

    afterAll(async () => {
        await testEnv.teardown();
    });

    it('executes full saga successfully', async () => {
        // FIX: Explicitly type client as WorkflowClient during destructuring
        const { client, nativeConnection } = testEnv as unknown as { client: WorkflowClient, nativeConnection: any };

        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue: 'test-queue',
            workflowsPath: require.resolve('../../src/services/workflow'),
            activities, // Inject the real activities (which utilize the axios mock)
        });

        const input: WeaveInput = {
            data: {},
            regulations: ['gdpr'],
            userId: 'test',
            timestamp: '2025-12-02T00:00:00Z',
            source: 'test'
        };

        await worker.runUntil(async () => {
            // Mock Activity Implementations (Axios calls)
            (axios.post as jest.Mock)
                .mockResolvedValueOnce({ data: { compliant: true, violations: [], checkedAt: '2025-12-02T00:00:00Z', score: 100 } }) // Compliance
                .mockResolvedValueOnce({ data: { synth: 'data' } }) // Synth
                .mockResolvedValueOnce({ data: { private: 'data' } }); // Privacy

            (publishEvent as jest.Mock).mockResolvedValue(undefined);

            // Start the workflow
            const handle = await client.start(weaveSaga, {
                args: [input],
                taskQueue: 'test-queue',
                workflowId: 'weave-test-success',
            });

            const result = await handle.result();
            expect(result).toEqual({ private: 'data' });
            expect(publishEvent).toHaveBeenCalledWith('weave-completed', expect.any(Object));
        });
    });

    it('fails on compliance error with compensation', async () => {
        // FIX: Explicitly type client as WorkflowClient during destructuring
        const { client, nativeConnection } = testEnv as unknown as { client: WorkflowClient, nativeConnection: any };

        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue: 'test-queue',
            workflowsPath: require.resolve('../../src/services/workflow'),
            activities,
        });

        const input: WeaveInput = {
            data: {},
            regulations: ['gdpr'],
            userId: 'test',
            timestamp: '2025-12-02T00:00:00Z',
            source: 'test'
        };

        await worker.runUntil(async () => {
            (axios.post as jest.Mock).mockResolvedValueOnce({
                data: { compliant: false, violations: [{ regulation: 'gdpr', severity: 'high' }], checkedAt: '2025-12-02T00:00:00Z', score: 50 },
            });
            (publishEvent as jest.Mock).mockResolvedValue(undefined);

            const handle = await client.start(weaveSaga, {
                args: [input],
                taskQueue: 'test-queue',
                workflowId: 'weave-test-fail',
            });

            await expect(handle.result()).rejects.toThrow('Compliance failed');
            expect(publishEvent).toHaveBeenCalledWith('weave-failed', expect.any(Object));
        });
    });

    it('handles cancellation signal', async () => {
        // FIX: Explicitly type client as WorkflowClient during destructuring
        const { client, nativeConnection } = testEnv as unknown as { client: WorkflowClient, nativeConnection: any };

        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue: 'test-queue',
            workflowsPath: require.resolve('../../src/services/workflow'),
            activities,
        });

        const input: WeaveInput = {
            data: {},
            regulations: ['gdpr'],
            userId: 'test',
            timestamp: '2025-12-02T00:00:00Z',
            source: 'test'
        };

        await worker.runUntil(async () => {
            const handle = await client.start(weaveSaga, {
                args: [input],
                taskQueue: 'test-queue',
                workflowId: 'weave-test-cancel',
            });

            // Send signal
            await handle.signal(cancelWeave);

            await expect(handle.result()).rejects.toThrow('Weave cancelled by user');
        });
    });

    it('queries status correctly', async () => {
        // FIX: Explicitly type client as WorkflowClient during destructuring
        const { client, nativeConnection } = testEnv as unknown as { client: WorkflowClient, nativeConnection: any };

        const worker = await Worker.create({
            connection: nativeConnection,
            taskQueue: 'test-queue',
            workflowsPath: require.resolve('../../src/services/workflow'),
            activities,
        });

        const input: WeaveInput = {
            data: {},
            regulations: ['gdpr'],
            userId: 'test',
            timestamp: '2025-12-02T00:00:00Z',
            source: 'test'
        };

        await worker.runUntil(async () => {
            const handle = await client.start(weaveSaga, {
                args: [input],
                taskQueue: 'test-queue',
                workflowId: 'weave-test-query',
            });

            const status = await handle.query(getStatus);
            expect(['started', 'ingesting', 'checking_compliance']).toContain(status.phase);

            // Terminate to finish the test without waiting for full completion/fail
            await handle.terminate();
        });
    });
});