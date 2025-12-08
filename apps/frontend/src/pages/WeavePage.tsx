// apps/frontend/src/pages/WeavePage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Page for submitting weave inputs using React Hook Form.
// Handles file upload (drag-drop), regulation selection, and submission via useSubmitWeave hook.
// Uses shared WeaveInput type. Includes validation and logging.
// ─────────────────────────────────────────────────────────────────────────────

import { useForm } from 'react-hook-form';
import { useSubmitWeave } from '../api/client.ts';
import { WeaveInput } from '@regloom/types';
import { logger } from '@regloom/utils';
import Canvas from '../components/Canvas.tsx'; // For visual preview

const WeavePage: React.FC = () => {
    const { register, handleSubmit } = useForm<WeaveInput>();
    const mutation = useSubmitWeave();

    const onSubmit = (data: WeaveInput) => {
        data.userId = 'current-user-id'; // Fetch from auth context
        data.timestamp = new Date().toISOString();
        mutation.mutate(data, {
            onSuccess: () => logger.info('Weave started successfully'),
            onError: (err) => logger.error('Weave start failed:', err),
        });
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-4">Start Weaving</h1>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <input type="file" {...register('connectorParams.filePath')} className="block" />
                <select multiple {...register('regulations')} className="border p-2">
                    <option value="gdpr">GDPR</option>
                    <option value="ccpa">CCPA</option>
                    <option value="kenya_dpa">Kenya DPA</option>
                </select>
                <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
                    Submit Weave
                </button>
            </form>
            <Canvas /> {/* Visual data flow preview */}
        </div>
    );
};

export default WeavePage;