// apps/rule-engine/src/reg_parser.ts
// Regulation parser for RegLoom rule-engine.
// Loads JSON rule files from src/rules/ and converts to json-rules-engine Rule objects.
// Prod-grade: Async loading, validation, caching, hot-reload watch in dev.
// Handles multiple regs, merges if needed. Error if file missing.

import fs from 'fs/promises';
import path from 'path';
import { Rule } from 'json-rules-engine';
import { logger } from '@regloom/utils';

const RULES_DIR = process.env.RULES_DIR || path.join(__dirname, 'rules');

// Cache for loaded rules (regCode -> Rule[])
const ruleCache = new Map<string, Rule[]>();

// Validate rule JSON structure
function validateRuleJson(ruleJson: any): boolean {
    return ruleJson.conditions && ruleJson.event && typeof ruleJson.event.type === 'string' && ruleJson.event.params;
}

// Parse single JSON file to Rule objects
async function parseRegFile(regCode: string): Promise<Rule[]> {
    if (ruleCache.has(regCode)) return ruleCache.get(regCode)!;

    const filePath = path.join(RULES_DIR, `${regCode.toLowerCase()}.json`);
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(content);

        if (!Array.isArray(parsed.rules)) {
            throw new Error(`Invalid format in ${regCode}.json: Expect { "rules": [...] }`);
        }

        const rules: Rule[] = parsed.rules.map((ruleJson: any) => {
            if (!validateRuleJson(ruleJson)) {
                throw new Error(`Invalid rule structure in ${regCode}.json`);
            }
            return new Rule(ruleJson);
        });

        ruleCache.set(regCode, rules);
        logger.info(`Loaded ${rules.length} rules for ${regCode}`);
        return rules;
    } catch (err) {
        logger.error(`Failed parsing ${regCode}: ${(err as Error).message}`);
        throw new Error(`Rules load failed for ${regCode}`);
    }
}

// Load rules for multiple regulations (concat all)
export async function loadRules(regulations: string[]): Promise<Rule[]> {
    const allRules: Rule[] = [];
    for (const reg of regulations) {
        const rules = await parseRegFile(reg);
        allRules.push(...rules);
    }
    return allRules;
}

// Dev hot-reload: Watch rules dir and invalidate cache on change
if (process.env.NODE_ENV === 'development') {
    import('chokidar').then((chokidar) => {
        chokidar.watch(RULES_DIR).on('change', (changedPath) => {
            const regCode = path.basename(changedPath, '.json').toLowerCase();
            ruleCache.delete(regCode);
            logger.info(`Hot-reloaded rules for ${regCode}`);
        });
    }).catch((err) => logger.warn(`Hot-reload failed: ${err.message}. Install chokidar?`));
}