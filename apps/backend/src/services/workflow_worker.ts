// apps/backend/src/services/workflow_worker.ts
import { Worker, NativeConnection } from '@temporalio/worker';
import { logger } from '@regloom/utils';
import { activities } from './activities';
import path from 'path';

const workflowsPath = path.resolve(__dirname, 'workflows.ts');

async function runWorker() {
    const connection = await NativeConnection.connect({
        address: process.env.TEMPORAL_ADDRESS || 'temporal:7233',
    });

    const worker = await Worker.create({
        connection,
        namespace: 'default',
        taskQueue: 'weave-queue',
        workflowsPath,
        activities,
    });

    logger.info('Temporal worker starting → polling weave-queue');
    await worker.run();
}

runWorker().catch((err) => {
    logger.error('Temporal worker crashed', {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
});