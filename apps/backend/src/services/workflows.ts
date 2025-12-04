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
    let currentPhase = 'started';

    setHandler(cancelWeave, () => {
        log.info('Weave cancelled by user');
        throw new Error('Weave cancelled');
    });

    setHandler(getStatus, () => ({ phase: currentPhase, progress: 0 }));

    try {
        currentPhase = 'ingesting';
        const ingested = await ingestData(input);

        currentPhase = 'checking_compliance';
        const report = await checkCompliance({ ...input, data: ingested });

        if (!report.compliant) throw new Error('Compliance failed');

        currentPhase = 'synthesizing';
        const synth = await synthesizeData({ ...report, data: ingested });

        currentPhase = 'applying_privacy';
        const output = await applyPrivacy(synth);

        currentPhase = 'completed';
        await publishWeaveCompleted(output, report, input.userId);

        return output;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('Weave workflow failed', { error: msg });
        await publishWeaveFailed(msg, input.userId, input.timestamp || new Date().toISOString());
        throw err;
    }
}