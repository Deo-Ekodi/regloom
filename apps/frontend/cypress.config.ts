// apps/frontend/cypress.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cypress configuration for E2E testing of the frontend.
// Integrates with Vite dev server for hot reloading during tests.
// Covers milestones: Local dashboard runs, connects to backend.
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from 'cypress';

export default defineConfig({
    e2e: {
        baseUrl: 'http://localhost:3000',
        supportFile: false, // If no custom support needed
        setupNodeEvents(on, config) {
            // Optional: Integrate with Vite for component testing if needed
        },
    },
    video: false, // Disable for faster CI
    retries: {
        runMode: 2,
        openMode: 0,
    },
});