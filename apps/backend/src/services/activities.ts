// apps/backend/src/services/activities.ts
// Separate file for activities to avoid bundling IO deps into workflow isolation bundle.
// All IO (network, FS) happens here. Retried/timeouted by Temporal.

import { Context } from '@temporalio/activity';
import { axios } from '@regloom/utils';
import * as AxiosModule from 'axios';
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
        logger.debug('Ingestion input received', { recordCount: input.data.length, regulations: input.regulations.join(',') });
        Context.current().heartbeat(50);

        if (input.options?.dryRun) {
            logger.warn('Dry run enabled, skipping actual ingestion logic.');
            // logger.emerg('Example EMERGENCY log for a catastrophic failure, e.g., disk full.', { code: 999 }); // Emergency example (placed here for demonstration)
        }

        return input.data; // In real, call ingestion.ts if needed
    },

    async checkCompliance(input: WeaveInput): Promise<ComplianceReport> {
        logger.info('Activity: Check compliance');
        Context.current().heartbeat(0);
        try {
            logger.debug(`Calling Rule Engine at ${RULE_ENGINE_URL} with timeout 300s.`);
            const response = await axios.post(RULE_ENGINE_URL, input, { timeout: 300000 });
            Context.current().heartbeat(100);
            logger.info('Compliance check succeeded.');
            return response.data as ComplianceReport;
        } catch (err) {
            logger.error('Compliance check failed', { error: (err as Error).message });

            if (AxiosModule.isAxiosError(err) && err.code === 'ECONNREFUSED') {
                logger.emerg('Rule Engine connection refused. Critical service failure detected.', { url: RULE_ENGINE_URL }); // EMERGENCY example on critical network failure
            } else {
                logger.warn('Compliance check threw a transient error (e.g., timeout or bad gateway). Temporal will retry.', { errorType: 'AxiosError' });
            }

            throw err;
        }
    },

    async synthesizeData(report: ComplianceReport & { data: Record<string, any>[] }): Promise<Record<string, any>[]> {
        if (!report.compliant) {
            logger.emerg('Attempted to synthesize non-compliant data. Workflow logic error.', { compliance: false, violations: report.violations.length }); // EMERGENCY example on logic failure
            throw new Error('Cannot synthesize non-compliant data');
        }

        logger.info('Activity: Synthesize data');
        Context.current().heartbeat(0);
        try {
            logger.debug(`Calling Synth Gen at ${SYNTH_GEN_URL} with data size ${report.data.length}.`);
            const response = await axios.post(SYNTH_GEN_URL, { data: report.data }, { timeout: 600000 });
            Context.current().heartbeat(100);
            logger.info('Data synthesis successful.');
            return response.data;
        } catch (err) {
            logger.error('Synthesis failed', { error: (err as Error).message });
            logger.warn('Synthesis step failed. Potential issue with large payload or service crash.', { stack: (err as Error).stack?.substring(0, 100) });
            throw err;
        }
    },

    async applyPrivacy(synthData: Record<string, any>[]): Promise<any> {
        logger.info('Activity: Apply privacy');
        Context.current().heartbeat(0);
        try {
            logger.debug(`Calling Privacy Engine at ${PRIVACY_ENGINE_URL} for ${synthData.length} records.`);
            const response = await axios.post(PRIVACY_ENGINE_URL, { data: synthData }, { timeout: 300000 });
            Context.current().heartbeat(100);
            logger.info('Privacy application successful.');
            return response.data;
        } catch (err) {
            logger.error('Privacy application failed', { error: (err as Error).message });
            logger.warn('Privacy step failed. Check for FHE key expiry or ZK proof resource limits.', { details: 'FHE/ZK Error' });
            throw err;
        }
    },

    async publishWeaveCompleted(output: any, report: ComplianceReport, userId: string): Promise<void> {
        logger.info('Activity: Publishing Weave Completed Event');
        logger.debug('Payload ready for event-bus.', { reportScore: report.score, userId });
        await publishEvent('weave-completed', { output, report, userId });
        logger.info('Weave Completed event published.');
    },

    async publishWeaveFailed(errorMessage: string, userId: string, timestamp: string): Promise<void> {
        logger.warn('Activity: Publishing Weave Failed Event', { reason: errorMessage });
        logger.debug('Attempting to notify user of workflow failure.');
        await publishEvent('weave-failed', {
            error: errorMessage,
            userId,
            timestamp,
        });
        logger.info('Weave Failed event published.');
    },
};