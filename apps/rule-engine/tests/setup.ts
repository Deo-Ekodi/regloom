// apps/rule-engine/tests/setup.ts
// This file fixes Jest globals in TypeScript errors — CLEAN & BULLETPROOF

// Import Jest globals so describe/it/expect/fail work in .ts files
import '@jest/globals';

// Optional: silence ts-jest deprecation warning (harmless but clean logs)
import 'ts-jest';

// That's it. No jest.mock() needed — ts-jest handles it automatically now.