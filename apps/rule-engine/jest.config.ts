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
    // THIS IS THE NUCLEAR FIX
    extensionsToTreatAsEsm: [],
    // Add this to force Jest to recognize Jest globals in TS
    globals: {
        'ts-jest': {
            useESM: false,
            astTransformers: {
                before: [],
            },
        },
    },
    // Remove setupFilesAfterEnv completely — it's the source of evil
    // setupFilesAfterEnv: [],
    verbose: true,
    // THIS IS THE KEY: Force Jest to inject globals
    injectGlobals: true,
};

export default config;