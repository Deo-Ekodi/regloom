// apps/rule-engine/tests/drools_adapter.test.ts
// Expanded tests for drools_adapter.ts: Unit tests for compliance evaluation.
// Uses faker for random data; fixed cases for determinism.
// Covers pass/fail, multi-reg, errors, batch. Mocks reg_parser/loadRules.
// Run with `pnpm --filter @regloom/rule-engine test`.
// to be expanded!

// apps/rule-engine/tests/drools_adapter.test.ts
import { evaluateCompliance } from '../src/drools_adapter';
import { WeaveInput } from '@regloom/types';
import { loadRules } from '../src/reg_parser';
import { logger } from '@regloom/utils';
import { Faker, en } from '@faker-js/faker';
import { Rule, Engine } from 'json-rules-engine'; // <--- FIX: Import Engine


jest.mock('../src/reg_parser');

// <--- FIX: Return 'logger as any' to satisfy Winston's chaining interface (Logger type)
jest.spyOn(logger, 'info').mockImplementation(() => logger as any);
jest.spyOn(logger, 'warn').mockImplementation(() => logger as any);
jest.spyOn(logger, 'error').mockImplementation(() => logger as any);

const faker = new Faker({ locale: [en] });

describe('evaluateCompliance', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('returns compliant if no rules', async () => {
        (loadRules as jest.Mock).mockResolvedValue([]);
        const input: WeaveInput = {
            data: [{ test: 'data' }],
            regulations: ['ccpa'],
            userId: 'test',
            timestamp: '2023-01-01',
            source: 'test',
        };
        const report = await evaluateCompliance(input);
        expect(report.compliant).toBe(true);
        expect(report.violations).toEqual([]);
        expect(report.score).toBe(100);
        expect(logger.warn).toHaveBeenCalledWith('No rules loaded; assuming compliant');
    });

    it('detects violations in batch', async () => {
        const mockRules = [
            new Rule({
                conditions: { all: [{ fact: 'phone', operator: 'notEqual', value: null }, { fact: 'ccpa_opt_out', operator: 'equal', value: true }] },
                event: { type: 'violation', params: { regulation: 'ccpa', ruleId: 'phone_optout', severity: 'high', description: 'Phone opt-out violation', affectedFields: ['phone'], remediation: 'Remove phone' } },
            }),
        ];
        (loadRules as jest.Mock).mockResolvedValue(mockRules);

        const input: WeaveInput = {
            data: [
                { phone: '123', ccpa_opt_out: true }, // Violation
                { phone: null, ccpa_opt_out: true }, // Clean
                { phone: '456', ccpa_opt_out: false }, // Clean
            ],
            regulations: ['ccpa'],
            userId: 'test',
            timestamp: '2023-01-01',
            source: 'test',
        };
        const report = await evaluateCompliance(input);
        expect(report.compliant).toBe(false);
        expect(report.violations.length).toBe(1);
        expect(report.violations[0].recordIndex).toBe(0);
        expect(report.violations[0].description).toBe('Phone opt-out violation');
        expect(report.score).toBe(95);
        expect(report.recommendations).toBeDefined();
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Failed with 1 violations'));
    });

    it('handles evaluation error per record', async () => {
        const mockRules = [new Rule({ conditions: { all: [] }, event: { type: 'test' } })];
        (loadRules as jest.Mock).mockResolvedValue(mockRules);

        // <--- FIX: Explicitly type 'facts' as any and cast return value to satisfy TypeScript
        jest.spyOn(Engine.prototype, 'run').mockImplementation(async (facts: any) => {
            if (facts.phone === 'error') throw new Error('Simulated eval error');
            // Return minimal object satisfying EngineResult signature (casted as any)
            return { events: [] } as any;
        });

        const input: WeaveInput = {
            data: [{ phone: 'ok' }, { phone: 'error' }, { phone: 'ok' }],
            regulations: ['ccpa'],
            userId: 'test',
            timestamp: '2023-01-01',
            source: 'test',
        };
        const report = await evaluateCompliance(input);
        expect(report.compliant).toBe(false);
        expect(report.violations.length).toBe(1);
        expect(report.violations[0].regulation).toBe('system');
        expect(report.violations[0].ruleId).toBe('eval_error');
        expect(report.violations[0].description).toContain('Evaluation failed');
        expect(report.violations[0].recordIndex).toBe(1);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error evaluating record 1'));
    });

    it('multi-regulation merging', async () => {
        const ccpaRule = new Rule({ conditions: { all: [{ fact: 'ccpa_opt_out', operator: 'equal', value: true }] }, event: { type: 'ccpa_violation', params: { regulation: 'ccpa' } } });
        const gdprRule = new Rule({ conditions: { all: [{ fact: 'gdpr_consent', operator: 'equal', value: false }] }, event: { type: 'gdpr_violation', params: { regulation: 'gdpr' } } });
        (loadRules as jest.Mock).mockResolvedValue([ccpaRule, gdprRule]);

        const input: WeaveInput = {
            data: [{ ccpa_opt_out: true, gdpr_consent: false }],
            regulations: ['ccpa', 'gdpr'],
            userId: 'test',
            timestamp: '2023-01-01',
            source: 'test',
        };
        const report = await evaluateCompliance(input);
        expect(report.violations.length).toBe(2);
        expect(report.violations[0].regulation).toBe('ccpa');
        expect(report.violations[1].regulation).toBe('gdpr');
    });

    it('1000 random stress test (performance)', async () => {
        // Restore the original implementation of Engine.run for this test to ensure it actually runs logic
        jest.spyOn(Engine.prototype, 'run').mockRestore();

        const mockRule = new Rule({ conditions: { all: [{ fact: 'random', operator: 'greaterThan', value: 0.5 }] }, event: { type: 'random_violation', params: { regulation: 'test' } } });
        (loadRules as jest.Mock).mockResolvedValue([mockRule]);

        const input: WeaveInput = {
            data: Array.from({ length: 1000 }, () => ({ random: faker.number.float({ min: 0, max: 1 }) })),
            regulations: ['test'],
            userId: 'test',
            timestamp: '2023-01-01',
            source: 'test',
        };
        const start = Date.now();
        const report = await evaluateCompliance(input);
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(5000);
        expect(report.violations.length).toBeGreaterThan(400);
        expect(report.violations.length).toBeLessThan(600);
    });

    it('invalid regulation throws in load', async () => {
        (loadRules as jest.Mock).mockRejectedValue(new Error('Rules load failed'));
        const input: WeaveInput = {
            data: [{}],
            regulations: ['invalid'],
            userId: 'test',
            timestamp: '2023-01-01',
            source: 'test',
        };
        await expect(evaluateCompliance(input)).rejects.toThrow('Rules load failed');
    });
});