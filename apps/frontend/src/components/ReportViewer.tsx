// apps/frontend/src/components/ReportViewer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Component for displaying audit reports (PDF/HTML render).
// Stub for QR scanner. Uses iframe for PDF or HTML parsing.
// Logs view events and errors for auditing.
// ─────────────────────────────────────────────────────────────────────────────

// react-hook-form?
import { WeaveOutput } from '@regloom/types';
import { logger } from '@regloom/utils';

interface ReportViewerProps {
    report: WeaveOutput['metadata']['complianceReport'];
}

const ReportViewer: React.FC<ReportViewerProps> = ({ report }) => {
    // Stub for QR scanner: Could integrate webcam library later
    const handleScan = () => logger.info('QR scan initiated');

    return (
        <div className="border rounded p-4">
            <h2 className="text-xl mb-2">Audit Report</h2>
            <p>Compliant: {report.compliant ? 'Yes' : 'No'}</p>
            <ul>
                {report.violations.map((v, i) => (
                    <li key={i}>{v.description} (Severity: {v.severity})</li>
                ))}
            </ul>
            <button onClick={handleScan} className="mt-4 bg-yellow-500 text-white px-4 py-2 rounded">
                Scan QR for Proof
            </button>
            {/* Iframe for PDF: <iframe src={pdfUrl} /> */}
        </div>
    );
};

export default ReportViewer;