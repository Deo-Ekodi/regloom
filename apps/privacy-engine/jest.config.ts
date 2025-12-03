// apps/privacy-engine/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    clearMocks: true,
    collectCoverage: false,
    coverageDirectory: '<rootDir>/coverage',
    coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    modulePaths: ['<rootDir>/src'],
    moduleNameMapper: {
        '^@regloom/(.*)$': '<rootDir>/../../packages/$1/src',
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', { useESM: false }],
    },
    extensionsToTreatAsEsm: [],
    globals: {
        'ts-jest': {
            useESM: false,
            tsconfig: '<rootDir>/../../tsconfig.json',
            isolatedModules: true,
            astTransformers: {
                before: [],
            },
        },
    },
    verbose: true,
    injectGlobals: true,
};

export default config;