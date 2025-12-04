// apps/backend/src/services/workflow_worker.ts
import { Worker, NativeConnection } from '@temporalio/worker';
import { logger } from '@regloom/utils';
import { activities } from './activities';
import path from 'path';

const workflowsPath = path.resolve(__dirname, 'workflows.ts');
logger.debug(`Workflow path resolved to: ${workflowsPath}`); // DEBUG: Log resolved path

async function runWorker() {
    const temporalAddress = process.env.TEMPORAL_ADDRESS || 'temporal:7233';
    logger.info(`Attempting to connect to Temporal at address: ${temporalAddress}`); // INFO: Connection attempt

    const connection = await NativeConnection.connect({
        address: temporalAddress,
    });
    logger.info('Temporal NativeConnection established successfully.'); // INFO: Connection success

    const worker = await Worker.create({
        connection,
        namespace: 'default',
        taskQueue: 'weave-queue',
        workflowsPath,
        activities,
    });
    logger.debug('Temporal Worker instance created.', { taskQueue: 'weave-queue' }); // DEBUG: Worker created

    logger.info('Temporal worker starting → polling weave-queue');
    await worker.run();
    logger.info('Temporal worker finished running.'); // INFO: Worker finished running (e.g., graceful shutdown)
}

runWorker().catch((err) => {
    // NOTE: In the context of a Node.js process crash, an 'error' level log is often equivalent to an 'emergency' state
    // because the process is exiting. We will use the defined 'logger.error'.
    logger.error('Temporal worker crashed', {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
    });
    logger.warn('Worker process exiting with code 1.'); // WARN: Log process exit
    process.exit(1);
});