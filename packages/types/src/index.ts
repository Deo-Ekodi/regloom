// packages/types/src/index.ts
// Shared types across RegLoom monorepo. Defines core interfaces for inputs and outputs with enhanced robustness.
// Includes timestamps, user context, and detailed violation structures for better traceability and error handling.

export interface WeaveInput {
    data: Record<string, any>[]; // Raw data records to evaluate (array for batch processing, e.g., CSV rows)
    regulations: string[]; // Array of regulation codes (e.g., ['gdpr', 'ccpa', 'kenya_dpa'])
    userId: string; // User initiating the weave for auditing
    timestamp: string; // ISO timestamp of input submission
    source: string; // Data source identifier (e.g., 'direct', 'csv', 'hubspot')
    connectorParams?: Record<string, any>; // Optional parameters for connectors (e.g., { filePath: 'uploads/data.csv' } for CSV, or { objectType: 'contacts', properties: ['email'] } for HubSpot)
    options?: {
        maxRows?: number; // Optional limit for large datasets
        dryRun?: boolean; // Simulate without actual processing
    };
}

export interface ViolationDetail {
    regulation: string; // Specific reg violated (e.g., 'gdpr')
    ruleId: string; // Internal rule identifier
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string; // Human-readable explanation
    affectedFields: string[]; // Data fields involved (e.g., ['email', 'phone'])
    remediation: string; // Suggested fix (e.g., 'Anonymize PII')
    recordIndex?: number; // Index of violating record in batch
}

export interface ComplianceReport {
    compliant: boolean; // Overall compliance status
    violations: ViolationDetail[]; // Detailed array of issues
    checkedAt: string; // ISO timestamp of check
    score: number; // Compliance score (0-100)
    recommendations?: string[]; // Optional overall suggestions
}