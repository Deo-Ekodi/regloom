// apps/backend/src/controllers/weaveController.ts
// Upgraded main controller for weave operation.
// Now integrates ingestion if source != 'direct'.
// Orchestrates compliance, synthesis, privacy via HTTP calls.
// Uses shared types. Handles full flow with error propagation.
// Prod-grade: Async, logged, status codes, event publishing.

import { Request, Response } from 'express';
import axios from 'axios';
import { WeaveInput, ComplianceReport } from '@regloom/types';
import { logger } from '@regloom/utils';
import { publishEvent } from '../services/event-bus';
import { ingest } from '../services/ingestion'; // Upgraded ingestion

const ruleEngineUrl = process.env.RULE_ENGINE_BASE_URL || 'http://localhost:4001';
const privacyEngineUrl = process.env.PRIVACY_ENGINE_BASE_URL || 'http://localhost:4002';
const synthGenUrl = process.env.SYNTH_GEN_BASE_URL || 'http://localhost:4003';

export async function handleWeave(req: Request, res: Response) {
    let input: WeaveInput = req.body;
    try {
        // Ingest if needed
        if (input.source !== 'direct') {
            logger.info(`Ingesting from source: ${input.source}`);
            input.data = await ingest(input.source, input.connectorParams || {}, input.options);
        }

        if (!input.data || input.data.length === 0) {
            throw new Error('No data provided or ingested');
        }

        // Compliance check
        const ruleResponse = await axios.post(`${ruleEngineUrl}/evaluate`, input, { timeout: 30000 });
        const report: ComplianceReport = ruleResponse.data;

        if (!report.compliant) {
            logger.warn('Compliance failed', { violations: report.violations });
            return res.status(400).json(report);
        }

        // Synthesize
        const synthResponse = await axios.post(`${synthGenUrl}/synthesize`, { data: input.data }, { timeout: 60000 });
        const synthData = synthResponse.data;

        // Apply privacy
        const privacyResponse = await axios.post(`${privacyEngineUrl}/process`, { data: synthData }, { timeout: 30000 });
        const processedData = privacyResponse.data;

        // Publish completion
        await publishEvent('weave-completed', { output: processedData, report, userId: input.userId });

        logger.info('Weave completed');
        res.status(200).json({ output: processedData, report });
    } catch (err) {
        const message = (err as Error).message;
        logger.error(`Weave error: ${message}`, { stack: (err as Error).stack });
        res.status(500).json({ error: message });
    }
}