// apps/backend/src/services/workflows.ts
// Robust workflow orchestration using Temporal for the weave saga.
// Defines activities with real HTTP proxies to microservices (rule-engine, synth-gen, privacy-engine).
// Handles retries, timeouts, heartbeats for long-running tasks, and compensation on failures (e.g., publish rollback event).
// Integrates with event-bus for notifications. Uses enhanced shared types for input/output.
// Best practices: Minimal logic in workflow, activities for IO, versioning signals/queries for status/cancellation.

// Pure workflow definitions (no side-effects: no axios, no process.env, no custom logger).
// Exports only functions + types for bundling in Worker.

import {
    proxyActivities,
    defineSignal,
    defineQuery,
    setHandler,
    log, // Temporal's built-in deterministic logger
} from '@temporalio/workflow';
import type { WeaveInput, ComplianceReport } from '@regloom/types';

// Proxy activities (types only — no implementation here)
const {
    ingestData,
    checkCompliance,
    synthesizeData,
    applyPrivacy,
    publishWeaveCompleted,
    publishWeaveFailed,
} = proxyActivities<{
    ingestData: (input: WeaveInput) => Promise<Record<string, any>[]>;
    checkCompliance: (input: WeaveInput) => Promise<ComplianceReport>;
    synthesizeData: (input: ComplianceReport & { data: Record<string, any>[] }) => Promise<Record<string, any>[]>;
    applyPrivacy: (data: Record<string, any>[]) => Promise<any>;
    publishWeaveCompleted: (output: any, report: ComplianceReport, userId: string) => Promise<void>;
    publishWeaveFailed: (error: string, userId: string, timestamp: string) => Promise<void>;
}>({
    startToCloseTimeout: '10m',
    heartbeatTimeout: '1m',
    retry: { maximumAttempts: 3 },
});

// Signals/Queries
export const cancelWeave = defineSignal('cancelWeave');
export const getStatus = defineQuery<{ phase: string; progress: number }>('getStatus');

export async function weaveSaga(input: WeaveInput): Promise<any> {
    log.info('Weave saga started', { userId: input.userId, source: input.source }); // INFO log
    log.debug('Weave saga input details', { input }); // DEBUG log

    let currentPhase = 'started';

    setHandler(cancelWeave, () => {
        log.warn('Weave cancelled by user signal'); // WARN log
        throw new Error('Weave cancelled');
    });

    setHandler(getStatus, () => ({ phase: currentPhase, progress: 0 }));

    try {
        currentPhase = 'ingesting';
        log.info('Starting data ingestion activity'); // INFO log
        const ingested = await ingestData(input);
        log.info('Data ingestion complete', { recordCount: ingested.length }); // INFO log

        currentPhase = 'checking_compliance';
        log.info('Starting compliance check activity'); // INFO log
        const report = await checkCompliance({ ...input, data: ingested });
        log.debug('Compliance report received', { compliant: report.compliant }); // DEBUG log

        if (!report.compliant) {
            log.warn('Weave stopped: Compliance failed based on report', { report }); // WARN log
            throw new Error('Compliance failed');
        }

        currentPhase = 'synthesizing';
        log.info('Starting data synthesis activity'); // INFO log
        const synth = await synthesizeData({ ...report, data: ingested });
        log.debug('Synthesis complete', { synthesizedCount: synth.length }); // DEBUG log

        currentPhase = 'applying_privacy';
        log.info('Starting privacy application activity'); // INFO log
        const output = await applyPrivacy(synth);
        log.info('Privacy application complete'); // INFO log

        currentPhase = 'completed';
        log.info('Weave completed successfully. Publishing event.'); // INFO log
        await publishWeaveCompleted(output, report, input.userId);
        log.debug('Completed event published'); // DEBUG log

        return output;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        // This log serves as the EMERG equivalent—it is the final failure point 
        // before the workflow terminates and throws.
        log.error('Weave workflow failed (EMERG equivalent)', { error: msg, phase: currentPhase, userId: input.userId });

        await publishWeaveFailed(msg, input.userId, input.timestamp || new Date().toISOString());

        log.debug('Failed event published for compensation'); // DEBUG log
        throw err;
    }
}