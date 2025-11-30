// drools_adapter.ts: Adapter mimicking Drools-style rule evaluation using json-rules-engine.
// Sets up an engine instance, loads selected regulation rules dynamically, evaluates input data.
// Returns a compliance report with violations (events triggered by failed conditions).
// Error-handled for robustness; modular for future enhancements like custom operators.
import { Engine } from 'json-rules-engine';
import { loadRegRules } from './reg_parser';
import { logger } from '@regloom/utils';
import { WeaveInput, ComplianceReport } from '@regloom/types';

export async function evaluateCompliance(input: WeaveInput): Promise<ComplianceReport> {
    const engine = new Engine();

    // Load and add rules for each selected regulation
    for (const reg of input.regulations) {
        const rules = loadRegRules(reg);
        if (rules.length === 0) {
            logger.warn(`No rules loaded for regulation: ${reg}`);
        }
        rules.forEach((rule) => {
            try {
                engine.addRule(rule);
            } catch (err) {
                logger.error(`Invalid rule for ${reg}: ${err}`);
            }
        });
    }

    try {
        const { events } = await engine.run(input.data);
        logger.info(`Evaluation complete: ${events.length} violations found`);
        return {
            compliant: events.length === 0,
            violations: events,
        };
    } catch (err) {
        logger.error(`Rule evaluation error: ${err}`);
        throw err; // Re-throw for API handling
    }
}