// Shared types across RegLoom monorepo. Defines core interfaces for inputs and outputs.
export interface WeaveInput {
    data: Record<string, any>; // Raw data to evaluate for compliance
    regulations: string[]; // Array of regulation names (e.g., ['gdpr', 'ccpa'])
}

export interface ComplianceReport {
    compliant: boolean; // True if no violations
    violations: any[]; // Array of violation events from the rule engine
}