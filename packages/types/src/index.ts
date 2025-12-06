// packages/types/src/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// RegLoom Shared Types – Monorepo-wide contract
// Used by: backend, frontend, synth-gen, rule-engine, privacy-engine, Temporal workflows
// ─────────────────────────────────────────────────────────────────────────────

/** Core input for the entire weave saga – single source of truth */
export interface WeaveInput {
    /** Raw tabular records (CSV row, HubSpot contact, etc.) */
    data: Record<string, any>[];

    /** Regulation codes the dataset must comply with */
    regulations: string[]; // e.g. ['gdpr', 'ccpa', 'kenya_dpa']

    /** User who initiated the weave – mandatory for audit trail */
    userId: string;

    /** ISO-8601 timestamp of request submission */
    timestamp: string;

    /** Source identifier – used by ingestion service to pick connector */
    source: 'direct' | 'csv' | 'hubspot' | 'salesforce' | string;

    /** Connector-specific parameters (filePath, objectType, etc.) */
    connectorParams?: Record<string, any>;

    /** Optional overrides */
    options?: {
        /** Cap number of rows processed (default 1_000_000) */
        maxRows?: number;

        /** Simulate only – no side effects */
        dryRun?: boolean;

        /** Force number of synthetic rows (overrides 2× default) */
        numSamples?: number;

        /** Override CTGAN training params */
        epochs?: number;
        batchSize?: number;
    };

    /** Optional request ID for end-to-end tracing (X-Request-ID) */
    requestId?: string;
}

/** Detailed violation – one per rule breach */
export interface ViolationDetail {
    regulation: string;           // e.g. 'gdpr'
    ruleId: string;               // internal rule identifier
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;          // human readable
    affectedFields: string[];     // e.g. ['email', 'phone_number']
    remediation: string;          // suggested fix
    recordIndex?: number;         // row that violated (if applicable)
}

/** Compliance report returned by rule-engine */
export interface ComplianceReport {
    compliant: boolean;
    violations: ViolationDetail[];
    checkedAt: string;            // ISO-8601
    score: number;                // 0–100
    recommendations?: string[];
}

/** Exact shape synth-gen returns – used by backend + privacy-engine */
export interface SynthGenResponse {
    synthetic_data: Record<string, any>[];
    generated_count: number;
    pii_detected: boolean;
    pii_count: number;
    bias_scores: Record<string, number>;
    high_bias_violations: Record<string, number>;
    metadata: {
        generated_at: string;
        model: string;
        request_id: string;
    };
}

/** Final output after privacy-engine (FHE/ZK proof attached) */
export interface WeaveOutput {
    data: Record<string, any>[];
    proof?: {
        zk?: any;     // snarkjs proof + public signals
        fhe?: any;    // encrypted payload metadata
    };
    metadata: {
        weaveId: string;
        generatedAt: string;
        requestId: string;
        complianceReport: ComplianceReport;
    };
}

/** Event payloads – consumed by Dapr pub/sub */
export interface WeaveCompletedEvent {
    output: WeaveOutput;
    report: ComplianceReport;
    userId: string;
    requestId: string;
}

export interface WeaveFailedEvent {
    error: string;
    userId: string;
    requestId: string;
    timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export everything for convenience
// ─────────────────────────────────────────────────────────────────────────────
// export type {
//     WeaveInput,
//     ComplianceReport,
//     SynthGenResponse,
//     WeaveOutput,
//     WeaveCompletedEvent,
//     WeaveFailedEvent,
//     ViolationDetail,
// };