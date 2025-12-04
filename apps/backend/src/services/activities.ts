// apps/backend/src/services/activities.ts
// Separate file for activities to avoid bundling IO deps into workflow isolation bundle.
// All IO (network, FS) happens here. Retried/timeouted by Temporal.

import { Context } from '@temporalio/activity';
import axios from 'axios';
import { logger } from '@regloom/utils';
import { publishEvent } from './event-bus';
import { WeaveInput, ComplianceReport } from '@regloom/types';

// Service URLs from env (free self-hosted Temporal uses these for activities)
const RULE_ENGINE_BASE_URL = process.env.RULE_ENGINE_BASE_URL || 'http://localhost:4001';
const PRIVACY_ENGINE_BASE_URL = process.env.PRIVACY_ENGINE_BASE_URL || 'http://localhost:4002';
const SYNTH_GEN_BASE_URL = process.env.SYNTH_GEN_BASE_URL || 'http://localhost:4003';

// Full endpoints
const RULE_ENGINE_URL = `${RULE_ENGINE_BASE_URL}/evaluate`;
const PRIVACY_ENGINE_URL = `${PRIVACY_ENGINE_BASE_URL}/process`;
const SYNTH_GEN_URL = `${SYNTH_GEN_BASE_URL}/synthesize`;

export const activities = {
    async ingestData(input: WeaveInput): Promise<Record<string, any>[]> {
        logger.info('Activity: Ingest data', { userId: input.userId, source: input.source });
        Context.current().heartbeat(50);
        return input.data; // In real, call ingestion.ts if needed
    },

    async checkCompliance(input: WeaveInput): Promise<ComplianceReport> {
        logger.info('Activity: Check compliance');
        Context.current().heartbeat(0);
        try {
            const response = await axios.post(RULE_ENGINE_URL, input, { timeout: 300000 });
            Context.current().heartbeat(100);
            return response.data as ComplianceReport;
        } catch (err) {
            logger.error('Compliance check failed', { error: (err as Error).message });
            throw err;
        }
    },

    async synthesizeData(report: ComplianceReport & { data: Record<string, any>[] }): Promise<Record<string, any>[]> {
        if (!report.compliant) throw new Error('Cannot synthesize non-compliant data');
        logger.info('Activity: Synthesize data');
        Context.current().heartbeat(0);
        try {
            const response = await axios.post(SYNTH_GEN_URL, { data: report.data }, { timeout: 600000 });
            Context.current().heartbeat(100);
            return response.data;
        } catch (err) {
            logger.error('Synthesis failed', { error: (err as Error).message });
            throw err;
        }
    },

    async applyPrivacy(synthData: Record<string, any>[]): Promise<any> {
        logger.info('Activity: Apply privacy');
        Context.current().heartbeat(0);
        try {
            const response = await axios.post(PRIVACY_ENGINE_URL, { data: synthData }, { timeout: 300000 });
            Context.current().heartbeat(100);
            return response.data;
        } catch (err) {
            logger.error('Privacy application failed', { error: (err as Error).message });
            throw err;
        }
    },

    async publishWeaveCompleted(output: any, report: ComplianceReport, userId: string): Promise<void> {
        await publishEvent('weave-completed', { output, report, userId });
    },

    async publishWeaveFailed(errorMessage: string, userId: string, timestamp: string): Promise<void> {
        await publishEvent('weave-failed', {
            error: errorMessage,
            userId,
            timestamp,
        });
    },
};