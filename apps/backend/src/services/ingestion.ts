// apps/backend/src/services/ingestion.ts
// Upgraded data ingestion service for RegLoom backend.
// Supports modular connectors (e.g., CSV, HubSpot) via a registry for easy extension.
// Handles large datasets streaming, security (path traversal prevention), data cleaning, limits.
// Logs progress/errors. Scalable: Add new connectors by registering functions.
// Uses csv-parse for CSV, @hubspot/api-client for HubSpot with pagination.
// Prod-grade: Type-safe, async, error classes, env-configurable.

import * as fs from 'fs'; // For createReadStream
import fsp from 'fs/promises'; // For access/unlink
import path from 'path';
import { parse } from 'csv-parse';
// import { Client as HubSpotClient } from '@hubspot/api-client';
import { logger } from '@regloom/utils';
import { WeaveInput } from '@regloom/types';

// Custom error classes for classification/logging
class IngestionError extends Error {
    constructor(message: string, public cause?: Error) {
        super(message);
        this.name = this.constructor.name;
    }
}

class FileAccessError extends IngestionError { }
class ParsingError extends IngestionError { }
class LimitExceededError extends IngestionError { }
class ConnectorError extends IngestionError { }

// Env-configurable defaults
const INGEST_DIR = process.env.INGEST_DIR || path.resolve(__dirname, '../../../uploads');
const DEFAULT_MAX_ROWS = parseInt(process.env.MAX_INGEST_ROWS || '1000000', 10);
const HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

// Security: Resolve safe path to prevent traversal
function getSafePath(filePath: string): string {
    const baseName = path.basename(filePath);
    const resolved = path.resolve(INGEST_DIR, baseName);
    if (!resolved.startsWith(INGEST_DIR)) {
        logger.warn(`Path traversal attempt: ${filePath}`);
        throw new IngestionError('Invalid file path');
    }
    logger.debug(`Resolved safe path for file: ${resolved}`); // DEBUG: Path resolution
    return resolved;
}

// Connector type: Function taking params, returning data array
type Connector = (params: Record<string, any>, options?: { maxRows?: number }) => Promise<Record<string, any>[]>;

// Registry for connectors (easy to add new ones, e.g., 'salesforce', 'google_sheets')
const connectors = new Map<string, Connector>();
logger.info(`Ingestion service initialized. Default MAX_ROWS: ${DEFAULT_MAX_ROWS}`); // INFO: Initialization

// Register CSV connector
connectors.set('csv', async (params, options = {}) => {
    logger.debug('Attempting to register CSV connector'); // DEBUG: Registration
    const { filePath, delimiter } = params;
    if (!filePath) {
        const error = new ConnectorError('filePath required for CSV');
        logger.error(error.message); // ERROR: Missing parameter
        throw error;
    }
    const safeFilePath = getSafePath(filePath);
    const startTime = Date.now();
    logger.debug(`CSV ingestion starting: ${safeFilePath}`, { options });

    const effectiveMaxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
    const data: Record<string, any>[] = [];
    let rowCount = 0;

    try {
        await fsp.access(safeFilePath, fs.constants.R_OK);

        const parser = parse({
            columns: true,
            skip_empty_lines: true,
            bom: true,
            relax_quotes: true,
            relax_column_count: true,
            trim: true,
            delimiter: delimiter || ',',
        });

        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(safeFilePath)
                .pipe(parser)
                .on('data', (row) => {
                    rowCount++;
                    if (rowCount > effectiveMaxRows) {
                        const err = new LimitExceededError(`Max rows: ${effectiveMaxRows}`);
                        logger.warn(err.message, { safeFilePath, rowCount }); // WARN: Limit exceeded
                        stream.destroy(err);
                        return reject(err);
                    }
                    data.push(row);
                    if (rowCount % 1000 === 0) logger.debug(`Processed ${rowCount} rows`); // DEBUG: Progress log
                })
                .on('end', () => {
                    const duration = (Date.now() - startTime) / 1000;
                    logger.info(`CSV ingested: ${rowCount} rows in ${duration}s`, { safeFilePath }); // INFO: Completion
                    resolve(data);
                })
                .on('error', (err) => {
                    logger.error(`CSV parse error: ${err.message}`, { stack: err.stack }); // ERROR: Parsing failure
                    reject(new ParsingError(`Parse failed: ${err.message}`, err));
                });
        });
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            const accessErr = new FileAccessError(`File inaccessible: ${safeFilePath}`, err as Error);
            logger.error(accessErr.message, { cause: accessErr.cause?.message }); // ERROR: File access
            throw accessErr;
        }
        // This catch block handles unexpected pre-ingest errors (e.g., config/setup issues)
        logger.emerg(`CSV pre-ingest FATAL error: ${(err as Error).message}`); // EMERG: Unexpected fatal error
        throw new IngestionError(`Ingestion failed: ${(err as Error).message}`, err as Error);
    }
});

// Register HubSpot connector (uses private app token for auth)
// connectors.set('hubspot', async (params, options = {}) => {
//     const { objectType = 'contacts', properties = [] } = params;
//     if (!HUBSPOT_ACCESS_TOKEN) {
//         const error = new ConnectorError('HUBSPOT_ACCESS_TOKEN env required');
//         logger.error(error.message); // ERROR: Missing token
//         throw error;
//     }
//     if (!objectType) {
//         const error = new ConnectorError('objectType required for HubSpot');
//         logger.error(error.message); // ERROR: Missing object type
//         throw error;
//     }

//     const hubspot = new HubSpotClient({ accessToken: HUBSPOT_ACCESS_TOKEN });
//     const effectiveMaxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
//     const data: Record<string, any>[] = [];
//     let after: string | undefined;
//     let fetched = 0;

//     logger.debug(`HubSpot ingestion starting for: ${objectType}`, { properties }); // DEBUG: Starting HubSpot

//     try {
//         while (true) {
//             logger.debug(`HubSpot fetching next page, fetched: ${fetched}, after: ${after}`); // DEBUG: Pagination

//             const response = await hubspot.crm[objectType].basicApi.getPage(100, after, properties, undefined, false);
//             const results = response.results || [];

//             for (const item of results) {
//                 if (fetched >= effectiveMaxRows) {
//                     logger.warn(`HubSpot limit hit: ${effectiveMaxRows}`); // WARN: Limit hit
//                     throw new LimitExceededError(`Max rows: ${effectiveMaxRows}`);
//                 }
//                 data.push(item.properties); // Extract properties as flat record
//                 fetched++;
//             }

//             if (!response.paging?.next?.after) break;
//             after = response.paging.next.after;
//         }

//         logger.info(`HubSpot ingested: ${fetched} records from ${objectType}`); // INFO: Completion
//         return data;
//     } catch (err) {
//         if (err instanceof LimitExceededError) throw err; // Re-throw limit error

//         logger.error(`HubSpot API error: ${(err as Error).message}`, { stack: (err as Error).stack }); // ERROR: API failure
//         throw new ConnectorError(`HubSpot failed: ${(err as Error).message}`, err as Error);
//     }
// });

// Main ingestion function (dispatches to connector)

export async function ingest(source: string, params: Record<string, any>, options?: { maxRows?: number }): Promise<Record<string, any>[]> {
    logger.info(`Starting ingestion for source: ${source}`); // INFO: Dispatch start
    const connector = connectors.get(source.toLowerCase());
    if (!connector) {
        const error = new ConnectorError(`Unsupported source: ${source}. Available: ${Array.from(connectors.keys()).join(', ')}`);
        logger.error(error.message); // ERROR: Unsupported source
        throw error;
    }
    try {
        const result = await connector(params, options);
        logger.debug(`Ingestion dispatch complete for ${source}`); // DEBUG: Dispatch complete
        return result;
    } catch (err) {
        // Re-log the general failure at the dispatch level
        logger.emerg(`Ingestion failed at dispatch level: ${(err as Error).message}`); // EMERG: Top-level failure
        throw err;
    }
}

// Usage example (for docs):
// await ingest('csv', { filePath: 'data.csv' });
// await ingest('hubspot', { objectType: 'contacts', properties: ['email', 'firstname'] });`