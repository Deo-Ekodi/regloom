// apps/rule-engine/src/index.ts
// Entry point for RegLoom rule-engine microservice.
// Sets up Express server, endpoints for evaluation/health.
// Prod-grade: JSON parsing, async handlers, error middleware, graceful shutdown.
// Integrates with Dapr sidecar if enabled (via env).

import express, { Application, Request, Response, NextFunction } from 'express';
import { logger } from '@regloom/utils';
import { evaluateCompliance } from './drools_adapter';
import { WeaveInput } from '@regloom/types';

const app: Application = express();
app.use(express.json({ limit: '10mb' })); // Handle larger payloads

const PORT = process.env.RULE_ENGINE_PORT || 4001;

// Health check (for k8s probes/Dapr)
app.get('/health', (_req, res) => {
  // logger.info('Health check endpoint accessed.');
  // logger.debug('Health check endpoint accessed.');
  res.status(200).json({
    status: 'healthy',
    service: 'regloom-rule-engine',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Main evaluation endpoint
app.post('/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  const input: WeaveInput = req.body;
  logger.info('Received evaluation request.'); // INFO: Request start
  logger.debug('Evaluation input payload:', { keys: Object.keys(req.body) }); // DEBUG: Input inspection

  if (!Array.isArray(input.data) || !Array.isArray(input.regulations)) {
    logger.warn('Invalid evaluation input: Missing expected arrays.', { body: req.body }); // WARN: Invalid input data
    return res.status(400).json({ error: 'Invalid input: data (array) and regulations (array) required' });
  }

  try {
    logger.debug(`Starting compliance evaluation for ${input.data.length} records.`); // DEBUG: Pre-computation step
    const report = await evaluateCompliance(input);
    logger.info('Evaluation completed successfully.'); // INFO: Success
    res.json(report);
  } catch (err) {
    // Note: The global error handler below catches this and logs the ERROR level.
    // We are adding an EMERGENCE level log if this service is absolutely critical 
    // and evaluation failure is considered a catastrophic event for the business logic.
    logger.emerg('Evaluation process failed catastrophically.'); // EMERG: Critical failure log
    next(err); // Pass to global error handler
  }
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // logger.error is already here, fulfilling the requirement for error logging.
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  logger.info(`Rule Engine running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  if (process.env.DAPR_RULE_ENGINE_HTTP_PORT) {
    logger.info(`Dapr sidecar enabled on port ${process.env.DAPR_RULE_ENGINE_HTTP_PORT}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.warn('Received SIGTERM signal.'); // WARN: Start of shutdown process
  logger.info('SIGTERM received: shutting down');
  server.close(() => {
    logger.info('Server closed');
    logger.emerg('Rule Engine process terminated.'); // EMERG: Final status before exit
    process.exit(0);
  });
});