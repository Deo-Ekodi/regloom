// apps/privacy-engine/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
    testEnvironment: 'node',
    clearMocks: true,

    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],

    // THIS IS THE ONLY TRANSFORM JEST WILL USE
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            useESM: false,
            tsconfig: '<rootDir>/../../tsconfig.json',
            isolatedModules: true,
        }],
    },

    // Force CommonJS – critical
    extensionsToTreatAsEsm: [],

    moduleFileExtensions: ['ts', 'js', 'json', 'node'],

    moduleNameMapper: {
        '^@regloom/(.*)$': '<rootDir>/../../packages/$1/src',
    },

    // Optional but nice
    verbose: false,
    collectCoverage: false,
};

export default config;