// apps/backend/src/controllers/weaveController.ts
// Upgraded main controller for weave operation.
// Now integrates ingestion if source != 'direct'.
// Orchestrates compliance, synthesis, privacy via HTTP calls.
// Uses shared types. Handles full flow with error propagation.
// Prod-grade: Async, logged, status codes, event publishing.

import { Request, Response } from 'express';
import { axios } from '@regloom/utils';
import { WeaveInput, ComplianceReport, SynthGenResponse } from '@regloom/types';
// import { asyncLocalStorage, logger } from '@regloom/utils';
import { getRequestId, getUserId, logger } from '@regloom/utils';

import { publishEvent } from '../services/event-bus';
import { ingest } from '../services/ingestion';

const ruleEngineUrl = process.env.RULE_ENGINE_BASE_URL || 'http://localhost:4001';
const privacyEngineUrl = process.env.PRIVACY_ENGINE_BASE_URL || 'http://localhost:4002';
const synthGenUrl = process.env.SYNTH_GEN_BASE_URL || 'http://localhost:4003';

export async function handleWeave(req: Request, res: Response) {
    const requestId = getRequestId();
    const userId = getUserId();
    logger.info('Weave started', {
        requestId,
        userId,
        source: req.body.source,
    });

    let input: WeaveInput = req.body;

    try {
        // 1. Ingestion
        if (input.source !== 'direct') {
            logger.info('Ingesting data from source', { source: input.source, requestId });
            input.data = await ingest(input.source, input.connectorParams || {}, input.options);
        }

        if (!input.data?.length) {
            logger.warn('No data after ingestion', { requestId });
            return res.status(400).json({ error: 'No data provided or ingested' });
        }

        logger.info('Data ready for compliance check', { recordCount: input.data.length, requestId });

        // 2. Compliance Check
        const ruleResponse = await axios.post<ComplianceReport>(
            `${ruleEngineUrl}/evaluate`,
            input,
            { timeout: 300_000 }
        );
        const report = ruleResponse.data;

        logger.info('Compliance check completed', {
            requestId,
            compliant: report.compliant,
            violations: report.violations.length,
            score: report.score,
        });

        if (!report.compliant) {
            await publishEvent('weave-failed', {
                error: 'Compliance check failed',
                timestamp: new Date().toISOString(),
            });
            return res.status(400).json({ report });
        }

        // 3. Synthesis
        const synthResponse = await axios.post<SynthGenResponse>(
            `${synthGenUrl}/synthesize`,
            { data: input.data },
            { timeout: 600_000 }
        );
        const synthData = synthResponse.data.synthetic_data;

        logger.info('Synthesis completed', {
            requestId,
            generatedCount: synthResponse.data.generated_count,
            piiDetected: synthResponse.data.pii_detected,
        });

        // 4. Privacy Engine
        const privacyResponse = await axios.post(
            `${privacyEngineUrl}/process`,
            { data: synthData },
            { timeout: 300_000 }
        );
        const processedOutput = privacyResponse.data;

        logger.info('Privacy engine completed', { requestId });

        // 5. Publish Success
        await publishEvent('weave-completed', {
            output: processedOutput,
            report,
        });

        logger.info('Weave completed successfully', { requestId });
        res.json({ output: processedOutput, report });
    } catch (err: any) {
        const errorMsg = err.response?.data?.error || err.message || 'Unknown error';
        logger.error('Weave failed', {
            requestId,
            error: errorMsg,
            stack: err.stack,
        });

        await publishEvent('weave-failed', {
            error: errorMsg,
            timestamp: new Date().toISOString(),
        });

        res.status(err.response?.status || 500).json({ error: errorMsg });
    }
}

