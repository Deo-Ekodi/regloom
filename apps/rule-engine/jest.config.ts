// apps/rule-engine/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
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
    extensionsToTreatAsEsm: [],
    globals: {
        'ts-jest': {
            useESM: false,
            astTransformers: {
                before: [],
            },
        },
    },
    verbose: true,
    injectGlobals: true,
};

export default config;