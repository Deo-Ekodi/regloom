// packages/utils/src/logger.ts
import winston from 'winston';

// Detect if we're running under Jest
const isTest = process.env.JEST_WORKER_ID !== undefined ||
    process.argv.some(arg => arg.includes('jest') || arg.includes('test'));

// Force silent in tests, unless explicitly overridden
const effectiveLevel = isTest
    ? (process.env.FORCE_LOG_IN_TESTS ? process.env.LOG_LEVEL || 'debug' : 'emerg')
    : process.env.LOG_LEVEL || 'info';

const nodeEnv = process.env.NODE_ENV || 'development';

const logger = winston.createLogger({
    level: effectiveLevel,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        nodeEnv === 'production'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
    ),
    transports: [
        new winston.transports.Console({
            silent: isTest && effectiveLevel === 'emerg', // Completely silence in tests
        }),
    ],
    // Prevent any accidental leaks
    silent: isTest && effectiveLevel === 'emerg',
});

export { logger };