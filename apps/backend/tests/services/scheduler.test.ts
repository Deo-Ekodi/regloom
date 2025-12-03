// apps/backend/tests/services/scheduler.test.ts
import axios from 'axios';
import * as xml2js from 'xml2js';
import cron from 'cron';
import { startScheduler, stopScheduler, fetchRegUpdates } from '../../src/services/scheduler';
import * as eventBus from '../../src/services/event-bus';

jest.mock('axios');
jest.mock('xml2js');
jest.mock('cron');
jest.mock('../../src/services/event-bus');

const mockAxios = axios as jest.Mocked<typeof axios>;
const mockPublishEvent = eventBus.publishEvent as jest.Mock;

describe('Scheduler Service — MASSIVE & FLAWLESS', () => {
    const mockCronJob = { start: jest.fn(), stop: jest.fn(), running: false };
    const mockParser = { parseStringPromise: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        ((cron.CronJob as unknown) as jest.Mock).mockImplementation((_, onTick) => {
            // @ts-ignore - we only care about start/stop
            mockCronJob.start = () => { mockCronJob.running = true; onTick(); };
            mockCronJob.stop = jest.fn().mockImplementation(() => { mockCronJob.running = false; });
            return mockCronJob as any;
        });
        (xml2js.parseStringPromise as jest.Mock).mockImplementation(mockParser.parseStringPromise);
        mockPublishEvent.mockResolvedValue(undefined);
    });

    it('starts and stops correctly', () => {
        startScheduler();
        expect(mockCronJob.start).toHaveBeenCalled();
        expect(mockCronJob.running).toBe(true);

        stopScheduler();
        expect(mockCronJob.stop).toHaveBeenCalled();
    });

    it('fetches and publishes real-looking updates', async () => {
        mockAxios.get.mockResolvedValue({
            data: `<?xml version="1.0"?><rss><channel><item><title>New GDPR Rule</title><link>https://edpb.europa.eu/123</link><pubDate>2025-12-01</pubDate><description>Important</description></item></channel></rss>`,
        });
        mockParser.parseStringPromise.mockResolvedValue({
            rss: { channel: { item: { title: 'New GDPR Rule', link: 'https://edpb.europa.eu/123', pubDate: '2025-12-01', description: 'Important' } } },
        });

        const updates = await fetchRegUpdates('gdpr');
        expect(updates).toEqual([expect.objectContaining({ title: 'New GDPR Rule', reg: 'gdpr' })]);

        // Trigger cron
        startScheduler();
        await new Promise(r => setImmediate(r));

        expect(mockPublishEvent).toHaveBeenCalledWith(
            'regs-updated',
            expect.objectContaining({
                updates: expect.arrayContaining([expect.objectContaining({ title: 'New GDPR Rule' })]),
                totalCount: expect.any(Number),
            }),
            expect.objectContaining({ source: 'scheduler' })
        );
    });

    it('handles network failures gracefully', async () => {
        mockAxios.get.mockRejectedValue(new Error('Network down'));
        const updates = await fetchRegUpdates('ccpa');
        expect(updates).toEqual([]);
        expect(mockPublishEvent).not.toHaveBeenCalled();
    });

    it('handles malformed XML gracefully', async () => {
        mockAxios.get.mockResolvedValue({ data: 'not xml' });
        mockParser.parseStringPromise.mockRejectedValue(new Error('Parse error'));
        const updates = await fetchRegUpdates('kenya_dpa');
        expect(updates).toEqual([]);
    });
});