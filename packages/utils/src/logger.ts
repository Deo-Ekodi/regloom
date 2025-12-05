// packages/utils/src/logger.ts
import winston, { format, transports, Logger as WinstonLogger, Logform } from 'winston';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';

export const asyncLocalStorage = new AsyncLocalStorage<{ requestId?: string }>();

// 1. ENVIRONMENT CONFIG
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const isDev = !isProd && !isTest;

// 2. LEVEL SETUP
const DEFAULT_DEV_LEVEL = 'debug';
const DEFAULT_PROD_LEVEL = 'info';
const logLevel = process.env.LOG_LEVEL || (isDev ? DEFAULT_DEV_LEVEL : DEFAULT_PROD_LEVEL);

// 3. FILE SETUP
const LOG_DIR = process.env.LOG_DIR || '/logs';
const service = process.env.SERVICE_NAME || 'app';
const filename = path.join(LOG_DIR, `${service}-regloom.log`);

// 4. FORMATS
const requestIdFormat = format((info: Logform.TransformableInfo) => {
    const store = asyncLocalStorage.getStore();
    if (store?.requestId) {
        info.requestId = store.requestId;
    }
    return info;
});

// Standard JSON format for files/prod
const jsonFormat = format.combine(
    requestIdFormat(),
    format.uncolorize(),
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: true }),
    format.label({ label: service }),
    format.json()
);

// Readable format for local dev console
const devFormat = format.combine(
    requestIdFormat(),
    format.colorize({ all: true }),
    format.timestamp({ format: 'HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.label({ label: service }),
    format.printf((info: Logform.TransformableInfo) => {
        const label = `[${(info.label as string).toUpperCase()}]`;
        const requestId = info.requestId ? `[${info.requestId}] ` : '';
        const stack = info.stack ? `\n${info.stack}` : '';
        return `${info.timestamp} ${label} ${info.level}: ${requestId}${info.message}${stack}`;
    })
);

// 5. TRANSPORTS
const transportList: winston.transport[] = [
    new transports.Console({
        format: isDev ? devFormat : format.simple(),
        silent: isTest && !process.env.FORCE_LOGS_ON_TESTS,
        level: logLevel,
    })
];

if (!isTest) {
    transportList.push(
        new transports.File({
            filename,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
            tailable: true,
            level: logLevel,
            format: jsonFormat,
        })
    );
}

// 6. LOGGER INSTANCE
const logger: WinstonLogger = winston.createLogger({
    level: logLevel,
    transports: transportList,
});

// Startup Log
if (!isTest) {
    logger.info(`Logger initialized - ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode (level: ${logLevel})`);
    logger.info(`Logs → ${filename}`);
}

export { logger, WinstonLogger };