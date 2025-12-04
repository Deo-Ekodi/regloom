// apps/rule-engine/src/drools_adapter.ts
// Adapter mimicking Drools-style rule evaluation using json-rules-engine.
// Loads rules dynamically, evaluates batch data (array of records).
// Aggregates violations across records with recordIndex.
// Returns detailed ComplianceReport. Prod-grade: Batch processing, error isolation per record.

import { Engine } from 'json-rules-engine';
import { loadRules } from './reg_parser';
import { logger } from '@regloom/utils';
import { WeaveInput, ComplianceReport, ViolationDetail } from '@regloom/types';

export async function evaluateCompliance(input: WeaveInput): Promise<ComplianceReport> {
    logger.debug('Starting compliance evaluation process');

    // Log initial parameters without exposing sensitive data
    logger.info(`Received evaluation request for ${input.data.length} records. Regulations: ${input.regulations.join(', ')}`);

    const rules = await loadRules(input.regulations);

    logger.debug(`Rule loading complete. Total rules loaded: ${rules.length}`);

    if (rules.length === 0) {
        logger.warn('No rules loaded; assuming compliant');
        return {
            compliant: true,
            violations: [],
            checkedAt: new Date().toISOString(),
            score: 100,
        };
    }

    const engine = new Engine(rules, { allowUndefinedFacts: true });

    const violations: ViolationDetail[] = [];
    for (let i = 0; i < input.data.length; i++) {
        const record = input.data[i];

        logger.debug(`Evaluating record index ${i}`);

        try {
            const { events } = await engine.run(record);

            logger.debug(`Record ${i} evaluation complete. Detected ${events.length} events.`);

            events.forEach((event) => {
                violations.push({
                    regulation: event.params?.regulation || 'unknown',
                    ruleId: event.params?.ruleId || event.type,
                    severity: event.params?.severity || 'medium',
                    description: event.params?.description || event.params?.message || 'Violation detected',
                    affectedFields: event.params?.affectedFields || [],
                    remediation: event.params?.remediation || 'Review and correct data',
                    recordIndex: i,
                });
            });
        } catch (err) {
            // Use 'error' level for execution failures that compromise the evaluation of a record.
            logger.error(`Error evaluating record ${i}: ${(err as Error).message}`, {
                recordIndex: i,
                errorDetail: (err as Error).stack
            });
            violations.push({
                regulation: 'system',
                ruleId: 'eval_error',
                severity: 'critical',
                description: `Evaluation failed for record: ${(err as Error).message}`,
                affectedFields: [],
                remediation: 'Check input data format',
                recordIndex: i,
            });
        }
    }

    const compliant = violations.length === 0;
    const score = Math.max(0, 100 - (violations.length * 5)); // Adjustable formula

    // Final summary log
    logger.info(`Compliance eval complete. Status: ${compliant ? 'Passed' : 'Failed'} with ${violations.length} violations (Score: ${score})`);

    return {
        compliant,
        violations,
        checkedAt: new Date().toISOString(),
        score,
        recommendations: compliant ? undefined : ['Address violations before proceeding'],
    };
}