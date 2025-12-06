// packages/utils/src/logger.ts
import winston, { format, transports, Logger as WinstonLogger, Logform } from 'winston';
import path from 'path';

// ──────────────────────────────────────────────────────────────
// CRITICAL FIX: DO NOT IMPORT getContext/getRequestId HERE
// This file is loaded first → would cause circular dependency
// We'll inject requestId safely without triggering ALS
// ──────────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const isDev = !isProd && !isTest;

const DEFAULT_DEV_LEVEL = 'debug';
const DEFAULT_PROD_LEVEL = 'info';
const logLevel = process.env.LOG_LEVEL || (isDev ? DEFAULT_DEV_LEVEL : DEFAULT_PROD_LEVEL);

const LOG_DIR = process.env.LOG_DIR || '/logs';
const service = process.env.SERVICE_NAME || 'app';
const filename = path.join(LOG_DIR, `${service}-regloom.log`);

// ──────────────────────────────────────────────────────────────
// Safe requestId injection — NO getRequestId() call here!
// We'll use a direct, non-throwing check via raw ALS (import later)
// ──────────────────────────────────────────────────────────────
let getRequestIdSafe: () => string | undefined;

// We'll set this AFTER logger is created (breaks circle)
setTimeout(() => {
    try {
        const { getRequestId } = require('./asyncLocalStorage');
        getRequestIdSafe = () => {
            try {
                const id = getRequestId();
                return id.startsWith('fallback-') ? undefined : id;
            } catch {
                return undefined;
            }
        };
    } catch {
        getRequestIdSafe = () => undefined;
    }
}, 0);

const requestIdFormat = format((info: Logform.TransformableInfo) => {
    if (!getRequestIdSafe) return info;
    const requestId = getRequestIdSafe();
    if (requestId) {
        info.requestId = requestId;
    }
    return info;
});

// ──────────────────────────────────────────────────────────────
// Formats
// ──────────────────────────────────────────────────────────────
const jsonFormat = format.combine(
    requestIdFormat(),
    format.uncolorize(),
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: true }),
    format.label({ label: service }),
    format.json()
);

const devFormat = format.combine(
    requestIdFormat(),
    format.colorize({ all: true }),
    format.timestamp({ format: 'HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.label({ label: service }),
    format.printf((info) => {
        const label = `[${(info.label as string).toUpperCase()}]`;
        const requestId = info.requestId ? `[${info.requestId}] ` : '';
        const level = info.level.padEnd(7);
        const stack = info.stack ? `\n${info.stack}` : '';
        return `${info.timestamp} ${label} ${level}: ${requestId}${info.message}${stack}`;
    })
);

// ──────────────────────────────────────────────────────────────
// Transports — FIX: Use exact filename, no rotation suffix hell
// ──────────────────────────────────────────────────────────────
const transportList: winston.transport[] = [
    new transports.Console({
        format: isDev ? devFormat : format.simple(),
        silent: isTest && !process.env.FORCE_LOGS_ON_TESTS,
        level: logLevel,
    }),
];

if (!isTest) {
    transportList.push(
        new transports.File({
            filename: filename,                    // ← exact path
            maxsize: 10 * 1024 * 1024,
            maxFiles: 5,
            tailable: true,
            zippedArchive: false,
            level: logLevel,
            format: jsonFormat,
        })
    );
}

// ──────────────────────────────────────────────────────────────
// Logger instance
// ──────────────────────────────────────────────────────────────
const logger: WinstonLogger = winston.createLogger({
    level: logLevel,
    transports: transportList,
    exitOnError: false,
});

// ──────────────────────────────────────────────────────────────
// Startup logs — NOW SAFE: no context needed, no warning trigger
// ──────────────────────────────────────────────────────────────
if (!isTest) {
    // Use raw console.log() to avoid triggering requestIdFormat during boot
    console.log(`[LOGGER] ${service} → ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode (level: ${logLevel})`);
    console.log(`[LOGGER] Logs → ${filename}`);
}

// ──────────────────────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────────────────────
export type { WinstonLogger };
export { logger };

// ──────────────────────────────────────────────────────────────
// ONLY AFTER export: safe to import asyncLocalStorage
// This breaks the circular dependency
// ──────────────────────────────────────────────────────────────
try {
    const { getRequestId } = require('./asyncLocalStorage');
    getRequestIdSafe = () => {
        try {
            const id = getRequestId();
            return id.startsWith('fallback-') ? undefined : id;
        } catch {
            return undefined;
        }
    };
} catch (err) {
    // In tests or broken builds
    getRequestIdSafe = () => undefined;
}