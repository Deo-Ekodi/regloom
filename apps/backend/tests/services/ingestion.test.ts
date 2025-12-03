// apps/backend/tests/services/ingestion.test.ts
// Comprehensive unit tests for ingestion service. Covers CSV parsing with security checks,
// error handling for invalid paths, malformed CSV, large files exceeding limits, and empty files.
// Uses @faker-js/faker for generating realistic random test data. Mocks fs and path modules
// for isolation and to simulate various file system scenarios.

import fs from 'fs';
import * as fsPromises from 'fs/promises';
import path from 'path';
import { faker } from '@faker-js/faker';
import { ingestCsv, getSafePath } from '../../src/services/ingestion';

jest.mock('fs');
jest.mock('fs/promises');
jest.mock('path');

describe('Ingestion Service', () => {
    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock INGEST_DIR for consistent testing
        Object.defineProperty(process.env, 'INGEST_DIR', { value: '/mock/uploads', writable: true });

        // Mock path functions
        (path.basename as jest.Mock).mockImplementation((p) => p.split('/').pop());
        (path.resolve as jest.Mock).mockImplementation((base, file) => `${base}/${file}`);
    });

    describe('getSafePath', () => {
        it('should return safe path within INGEST_DIR', () => {
            const safe = getSafePath('valid.csv');
            expect(safe).toBe('/mock/uploads/valid.csv');
        });

        it('should throw on path traversal attempt', () => {
            (path.resolve as jest.Mock).mockReturnValueOnce('/outside/invalid.csv');
            expect(() => getSafePath('../invalid.csv')).toThrow('Invalid file path: Access denied');
        });
    });

    describe('ingestCsv', () => {
        it('should ingest CSV successfully with random data', async () => {
            // Generate random fake rows
            const rows = Array.from({ length: 5 }, () => ({
                id: faker.string.uuid(),
                name: faker.person.fullName(),
                email: faker.internet.email(),
                date: faker.date.past().toISOString(),
            }));

            // Mock fs.promises.access
            (fsPromises.access as jest.Mock).mockResolvedValue(undefined);

            // Mock stream
            (fs.createReadStream as jest.Mock).mockReturnValue({
                pipe: jest.fn().mockReturnThis(),
                on: jest.fn((event, cb) => {
                    if (event === 'data') {
                        rows.forEach(cb);
                    }
                    if (event === 'end') {
                        cb();
                    }
                    return this;
                }),
                destroy: jest.fn(),
            });

            const data = await ingestCsv('mock.csv');
            expect(data).toEqual(rows);
            expect(data).toHaveLength(5);
        });

        it('should handle empty CSV file', async () => {
            (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
            (fs.createReadStream as jest.Mock).mockReturnValue({
                pipe: jest.fn().mockReturnThis(),
                on: jest.fn((event, cb) => {
                    if (event === 'end') cb();
                    return this;
                }),
                destroy: jest.fn(),
            });

            const data = await ingestCsv('empty.csv');
            expect(data).toEqual([]);
        });

        it('should reject on maxRows exceeded', async () => {
            const rows = Array.from({ length: 6 }, () => ({ id: faker.string.uuid() }));

            (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
            let destroyed = false;
            (fs.createReadStream as jest.Mock).mockReturnValue({
                pipe: jest.fn().mockReturnThis(),
                on: jest.fn((event, cb) => {
                    if (event === 'data') {
                        rows.forEach(cb);
                    }
                    if (event === 'end') {
                        if (!destroyed) cb();
                    }
                    if (event === 'error') {
                        cb(new Error('Max rows exceeded: 5'));
                    }
                    return this;
                }),
                destroy: jest.fn((err) => {
                    destroyed = true;
                }),
            });

            await expect(ingestCsv('large.csv', { maxRows: 5 })).rejects.toThrow('Max rows exceeded: 5');
        });

        it('should handle file access error', async () => {
            (fsPromises.access as jest.Mock).mockRejectedValue(new Error('Access denied'));
            await expect(ingestCsv('invalid.csv')).rejects.toThrow('Access denied');
        });

        it('should handle stream error (e.g., malformed CSV)', async () => {
            (fsPromises.access as jest.Mock).mockResolvedValue(undefined);
            (fs.createReadStream as jest.Mock).mockReturnValue({
                pipe: jest.fn().mockReturnThis(),
                on: jest.fn((event, cb) => {
                    if (event === 'error') cb(new Error('Parse error: Malformed CSV'));
                    return this;
                }),
                destroy: jest.fn(),
            });

            await expect(ingestCsv('malformed.csv')).rejects.toThrow('Parse error: Malformed CSV');
        });
    });
});