// apps/backend/src/services/workflow.ts
// Robust workflow orchestration using Temporal for the weave saga.
// Defines activities with real HTTP proxies to microservices (rule-engine, synth-gen, privacy-engine).
// Handles retries, timeouts, heartbeats for long-running tasks, and compensation on failures (e.g., publish rollback event).
// Integrates with event-bus for notifications. Uses enhanced shared types for input/output.
// Best practices: Minimal logic in workflow, activities for IO, versioning signals/queries for status/cancellation.

// apps/backend/src/services/workflow.ts
import {
    proxyActivities,
    defineSignal,
    defineQuery,
    setHandler,
    Workflow
} from '@temporalio/workflow';
import * as activity from '@temporalio/activity';
import axios from 'axios';
import { logger } from '@regloom/utils';
import { publishEvent } from './event-bus';
import { WeaveInput, ComplianceReport } from '@regloom/types';

// Service URLs
// Define BASE URL constants from environment or default to localhost
const RULE_ENGINE_BASE_URL = process.env.RULE_ENGINE_BASE_URL || 'http://localhost:4001';
const PRIVACY_ENGINE_BASE_URL = process.env.PRIVACY_ENGINE_BASE_URL || 'http://localhost:4002';
const SYNTH_GEN_BASE_URL = process.env.SYNTH_GEN_BASE_URL || 'http://localhost:4003';

// Construct the full, specific endpoint URLs
const RULE_ENGINE_URL = `${RULE_ENGINE_BASE_URL}/evaluate`;
const PRIVACY_ENGINE_URL = `${PRIVACY_ENGINE_BASE_URL}/apply`;
const SYNTH_GEN_URL = `${SYNTH_GEN_BASE_URL}/synthesize`;

// --- Activities Implementation ---
// In a larger app, move these to 'activities.ts' to keep the Workflow bundle small.
export const activities = {
    async ingestData(input: WeaveInput) {
        logger.info('Activity: Ingest data', { userId: input.userId, source: input.source });
        activity.Context.current().heartbeat(50); // Correct heartbeat usage
        return input.data;
    },

    async checkCompliance(data: Record<string, any>, regulations: string[]): Promise<ComplianceReport> {
        logger.info('Activity: Check compliance');
        activity.Context.current().heartbeat(0);
        try {
            const response = await axios.post(RULE_ENGINE_URL, { data, regulations }, { timeout: 300000 });
            activity.Context.current().heartbeat(100);
            return response.data as ComplianceReport;
        } catch (err) {
            logger.error('Compliance check failed', { error: (err as Error).message });
            throw err;
        }
    },

    async synthesizeData(report: ComplianceReport & { data: Record<string, any> }): Promise<Record<string, any>> {
        if (!report.compliant) throw new Error('Cannot synthesize non-compliant data');
        logger.info('Activity: Synthesize data');
        activity.Context.current().heartbeat(0);
        try {
            const response = await axios.post(SYNTH_GEN_URL, { data: report.data }, { timeout: 600000 });
            activity.Context.current().heartbeat(100);
            return response.data;
        } catch (err) {
            logger.error('Synthesis failed', { error: (err as Error).message });
            throw err;
        }
    },

    async applyPrivacy(synthData: Record<string, any>): Promise<any> {
        logger.info('Activity: Apply privacy');
        activity.Context.current().heartbeat(0);
        try {
            const response = await axios.post(PRIVACY_ENGINE_URL, { data: synthData }, { timeout: 300000 });
            activity.Context.current().heartbeat(100);
            return response.data;
        } catch (err) {
            logger.error('Privacy application failed', { error: (err as Error).message });
            throw err;
        }
    },
};

// --- Workflow Definition ---

// Proxy activities to ensure type safety and handle configuration
const { ingestData, checkCompliance, synthesizeData, applyPrivacy } = proxyActivities<typeof activities>({
    startToCloseTimeout: '10m',
    retry: { maximumAttempts: 3, backoffCoefficient: 2 },
    heartbeatTimeout: '1m',
});

// Signals & Queries
export const cancelWeave = defineSignal('cancelWeave');
export const getStatus = defineQuery<{ phase: string; progress: number }>('getStatus');

export async function weaveSaga(input: WeaveInput): Promise<any> {
    let output: any;
    let currentPhase = 'started';

    // Handle Signals
    setHandler(cancelWeave, () => {
        logger.info('Weave cancellation signal received');
        // Throwing a special error or using a flag is how you cancel logic inside the flow
        throw new Error('Weave cancelled by user');
    });

    // Handle Queries
    setHandler(getStatus, () => ({
        phase: currentPhase,
        progress: 0, // In real app, update this dynamically
    }));

    try {
        currentPhase = 'ingesting';
        const ingested = await ingestData(input);

        currentPhase = 'checking_compliance';
        const report = await checkCompliance(ingested, input.regulations);

        if (!report.compliant) {
            throw new Error('Compliance failed');
        }

        currentPhase = 'synthesizing';
        const synth = await synthesizeData({ ...report, data: ingested });

        currentPhase = 'applying_privacy';
        output = await applyPrivacy(synth);

        currentPhase = 'completed';

        // Use standard side-effect for external calls not via activity
        await publishEvent('weave-completed', { output, report, userId: input.userId });

        return output;
    } catch (err) {
        const errorMessage = (err as Error).message;
        logger.error('Weave workflow failed', { error: errorMessage, input });

        // Compensation
        await publishEvent('weave-failed', {
            error: errorMessage,
            userId: input.userId,
            timestamp: input.timestamp,
        });
        throw err;
    }
}