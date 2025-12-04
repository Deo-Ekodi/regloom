import { DaprClient } from '@dapr/dapr';
import { v4 as uuidv4 } from 'uuid';
import { trace } from '@opentelemetry/api';
import { publishEvent, isEventBusHealthy, publishEvents } from '../../src/services/event-bus';

jest.mock('@dapr/dapr');
jest.mock('uuid');
jest.mock('@opentelemetry/api');

const mockPublish = jest.fn();
const mockHealth = { check: jest.fn() };

(DaprClient as unknown as jest.Mock).mockImplementation(() => ({
    pubsub: { publish: mockPublish },
    health: mockHealth,
}));

(uuidv4 as jest.Mock).mockReturnValue('fixed-uuid');

describe('Event Bus — MASSIVE', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.DAPR_HOST = 'http://localhost';
        process.env.DAPR_BACKEND_HTTP_PORT = '3500';
        mockHealth.check.mockResolvedValue(undefined);
    });

    it('connects to Dapr on first use', async () => {
        mockPublish.mockResolvedValue(undefined);
        await publishEvent('test', { hello: 'world' });
        expect(DaprClient).toHaveBeenCalled();
    });

    it('publishes with full metadata and succeeds', async () => {
        mockPublish.mockResolvedValue(undefined);
        await publishEvent('data-ingested', { filePath: 'x.csv' }, { source: 'ingestion' });

        expect(mockPublish).toHaveBeenCalledWith('regloom-pubsub', 'data-ingested', {
            data: { filePath: 'x.csv' },
            metadata: expect.objectContaining({
                eventId: 'fixed-uuid',
                correlationId: 'fixed-uuid',
                source: 'ingestion',
            }),
        });
    });

    it('retries 3 times then sends to DLQ', async () => {
        mockPublish
            .mockRejectedValueOnce(new Error('timeout'))
            .mockRejectedValueOnce(new Error('timeout'))
            .mockRejectedValueOnce(new Error('timeout'))
            .mockResolvedValueOnce(undefined); // DLQ succeeds

        await expect(publishEvent('test', {}, { maxRetries: 3 })).rejects.toThrow();

        expect(mockPublish).toHaveBeenCalledTimes(4);
        expect(mockPublish).toHaveBeenCalledWith('regloom-pubsub', 'test-dlq', expect.any(Object));
    });

    it('bulk publish handles mixed results', async () => {
        mockPublish.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));

        await publishEvents([
            { topic: 'ok', data: { x: 1 } },
            { topic: 'fail', data: { x: 2 } },
        ]);

        expect(mockPublish).toHaveBeenCalledTimes(2);
    });

    it('health check works', async () => {
        mockHealth.check.mockResolvedValue(undefined);
        expect(await isEventBusHealthy()).toBe(true);

        mockHealth.check.mockRejectedValue(new Error('nope'));
        expect(await isEventBusHealthy()).toBe(false);
    });
});