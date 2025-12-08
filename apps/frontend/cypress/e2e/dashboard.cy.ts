// apps/frontend/cypress/e2e/dashboard.cy.ts
// ─────────────────────────────────────────────────────────────────────────────
// E2E test for Dashboard page.
// Verifies routing, component rendering, and backend connection (mocked if needed).
// Uses Cypress best practices for robustness.
// ─────────────────────────────────────────────────────────────────────────────

describe('Dashboard Page', () => {
    it('loads the dashboard and displays weaves list', () => {
        cy.visit('/');
        cy.contains('RegLoom Dashboard').should('be.visible');
        // Mock backend API if needed: cy.intercept('GET', '/api/weaves', { fixture: 'weaves.json' });
        cy.get('[data-testid="weaves-list"]').should('exist');
    });

    it('navigates to WeavePage', () => {
        cy.visit('/');
        cy.get('a[href="/weave"]').click();
        cy.url().should('include', '/weave');
        cy.contains('Start Weaving').should('be.visible');
    });
});