import winston, { format, transports, Logger as WinstonLogger, Logform } from 'winston';
import path from 'path';
import fs from 'fs';
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const isDev = !isProd && !isTest;
const DEFAULT_DEV_LEVEL = 'debug';
const DEFAULT_PROD_LEVEL = 'info';
const logLevel = process.env.LOG_LEVEL || (isDev ? DEFAULT_DEV_LEVEL : DEFAULT_PROD_LEVEL);
// -------------------------------
// LOG DIRECTORY SETUP (SKIPPED ON TESTS)
// -------------------------------
const LOG_DIR = process.env.LOG_DIR || './logs';
let filename;
if (!isTest) {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
    } catch (err) {
        console.error('Failed to create log directory:', LOG_DIR, err);
    }
    filename = path.join(LOG_DIR, `${process.env.SERVICE_NAME ? process.env.SERVICE_NAME + '-' : ''}regloom.log`);
}
// -------------------------------
// FORMATS
// -------------------------------
const jsonFormat = format.combine(
    format.uncolorize(),
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: true }),
    format.label({ label: process.env.SERVICE_NAME || 'APP' }),
    format.json()
);
const devFormat = format.combine(
    format.colorize({ all: true }),
    format.timestamp({ format: 'HH:mm:ss.SSS' }),
    format.errors({ stack: true }),
    format.label({ label: process.env.SERVICE_NAME || 'APP' }),
    format.printf((info: Logform.TransformableInfo) => {
        const label = `[${(info.label as string).toUpperCase()}]`;
        const stack = info.stack ? `\n${info.stack}` : '';
        return `${info.timestamp} ${label} ${info.level}: ${info.message}${stack}`;
    })
);
// -------------------------------
// TRANSPORTS
// -------------------------------
const consoleTransport = new transports.Console({
    format: isDev ? devFormat : format.simple(),
    silent: isTest && !process.env.FORCE_LOGS_ON_TESTS,
    level: logLevel,
});
const fileTransport = !isTest ? new transports.File({
    filename,
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
    tailable: true,
    level: 'info',
    format: jsonFormat,
}) : null;
// -------------------------------
// LOGGER
// -------------------------------
const logger: WinstonLogger = winston.createLogger({
    level: logLevel,
    format: jsonFormat,
    silent: false,
    transports: [
        consoleTransport,
        ...(fileTransport ? [fileTransport] : []),
    ],
});
// Only show startup logs outside Jest
if (!isTest) {
    logger.info(`Logger initialized – ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} mode (level: ${logLevel})`);
    logger.info(`Logs → ${filename}`);
}
export { logger, WinstonLogger };