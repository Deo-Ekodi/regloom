// reg_parser.ts: Dynamically loads regulation-specific rules from JSON files in the rules directory.
// Rules are stored separately per regulation (e.g., gdpr.json) for modularity and easy extension.
// Each JSON file contains an array of rules in json-rules-engine format.
// This allows dynamic rule addition without hardcoding; future extension to DB loading.
import fs from 'fs';
import path from 'path';
import { logger } from '@regloom/utils';

const RULES_DIR = process.env.RULES_DIR || path.resolve(__dirname, 'rules');

export function loadRegRules(reg: string): any[] {
    try {
        const filePath = path.join(RULES_DIR, `${reg.toLowerCase()}.json`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Rules file not found for ${reg}`);
        }
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed.rules)) {
            throw new Error(`Invalid rules format in ${reg}.json`);
        }
        logger.info(`Loaded ${parsed.rules.length} rules for ${reg}`);
        return parsed.rules;
    } catch (err) {
        logger.error(`Failed to load rules for ${reg}: ${err}`);
        return [];
    }
}