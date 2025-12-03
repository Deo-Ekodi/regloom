import type { JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    modulePaths: ['<rootDir>/src'],
    moduleNameMapper: {
        '^@regloom/(.*)$': '<rootDir>/../../packages/$1/src',
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', { useESM: false }],
    },
    verbose: true,
    clearMocks: true,
    collectCoverage: false,
    coverageDirectory: '<rootDir>/coverage',
    coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
};

export default config;