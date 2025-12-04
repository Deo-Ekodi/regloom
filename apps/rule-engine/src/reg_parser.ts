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
logger.debug(`Rules directory set to: ${RULES_DIR}`); // DEBUG: Log configured directory

// Cache for loaded rules (regCode -> Rule[])
const ruleCache = new Map<string, Rule[]>();

// Validate rule JSON structure
function validateRuleJson(ruleJson: any): boolean {
    logger.debug(`Validating rule JSON structure.`); // DEBUG: Start validation check
    const isValid = ruleJson.conditions && ruleJson.event && typeof ruleJson.event.type === 'string' && ruleJson.event.params;
    if (!isValid) {
        logger.warn(`Rule structure validation failed for: ${JSON.stringify(ruleJson).substring(0, 50)}...`); // WARN: Validation failure
    }
    return isValid;
}

// Parse single JSON file to Rule objects
async function parseRegFile(regCode: string): Promise<Rule[]> {
    if (ruleCache.has(regCode)) {
        logger.debug(`Cache hit for regulation: ${regCode}`); // DEBUG: Cache hit
        return ruleCache.get(regCode)!;
    }
    logger.debug(`Cache miss for regulation: ${regCode}. Attempting file load.`); // DEBUG: Cache miss

    const filePath = path.join(RULES_DIR, `${regCode.toLowerCase()}.json`);
    logger.debug(`Attempting to read file: ${filePath}`); // DEBUG: File path check

    try {
        const content = await fs.readFile(filePath, 'utf-8');
        logger.debug(`Successfully read content for ${regCode}.json`); // DEBUG: File read success
        const parsed = JSON.parse(content);

        if (!Array.isArray(parsed.rules)) {
            const errMsg = `Invalid format in ${regCode}.json: Expect { "rules": [...] }`;
            logger.error(`Failed parsing ${regCode}: ${errMsg}`); // ERROR: Invalid format
            throw new Error(errMsg);
        }

        const rules: Rule[] = parsed.rules.map((ruleJson: any) => {
            if (!validateRuleJson(ruleJson)) {
                const errMsg = `Invalid rule structure in ${regCode}.json`;
                logger.error(errMsg); // ERROR: Invalid rule structure
                throw new Error(errMsg);
            }
            return new Rule(ruleJson);
        });

        ruleCache.set(regCode, rules);
        logger.info(`Loaded ${rules.length} rules for ${regCode}`); // INFO: Successful load
        return rules;
    } catch (err) {
        // If file read fails (e.g., ENOENT), or JSON parsing fails, or internal rule validation fails
        const errorMsg = (err as Error).message;
        logger.error(`Failed parsing ${regCode}: ${errorMsg}`); // ERROR: Failed parsing
        if (errorMsg.includes('no such file or directory')) {
            logger.warn(`Rule file not found for ${regCode} at ${filePath}`); // WARN: File not found
        }
        if (errorMsg.includes('Rules load failed for')) {
            logger.emerg(`Critical startup failure: Rule loading failed for ${regCode}`); // EMERG: If error escalates to critical startup block
        }
        throw new Error(`Rules load failed for ${regCode}`);
    }
}

// Load rules for multiple regulations (concat all)
export async function loadRules(regulations: string[]): Promise<Rule[]> {
    logger.info(`Starting rule loading process for regulations: [${regulations.join(', ')}]`); // INFO: Start batch load
    const allRules: Rule[] = [];
    for (const reg of regulations) {
        logger.debug(`Processing regulation: ${reg}`); // DEBUG: Process individual regulation
        const rules = await parseRegFile(reg);
        allRules.push(...rules);
    }
    logger.info(`Completed rule loading. Total rules loaded: ${allRules.length}`); // INFO: Total rules loaded
    return allRules;
}

// Dev hot-reload: Watch rules dir and invalidate cache on change
if (process.env.NODE_ENV === 'development') {
    logger.debug(`Development mode enabled. Initializing chokidar for hot-reload.`); // DEBUG: Hot-reload init
    import('chokidar').then((chokidar) => {
        chokidar.watch(RULES_DIR).on('change', (changedPath) => {
            const regCode = path.basename(changedPath, '.json').toLowerCase();
            ruleCache.delete(regCode);
            logger.info(`Hot-reloaded rules for ${regCode}`); // INFO: Hot-reload success
        });
    }).catch((err) => {
        const errorMsg = (err as Error).message;
        logger.warn(`Hot-reload failed: ${errorMsg}. Install chokidar?`); // WARN: Hot-reload dependency missing
        logger.debug(`Hot-reload error details: ${errorMsg}`); // DEBUG: Hot-reload error details
    });
}