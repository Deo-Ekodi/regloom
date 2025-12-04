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
  logger.info('Health check endpoint accessed.');
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
  if (!Array.isArray(input.data) || !Array.isArray(input.regulations)) {
    logger.warn('Invalid evaluation input', { body: req.body });
    return res.status(400).json({ error: 'Invalid input: data (array) and regulations (array) required' });
  }
  try {
    const report = await evaluateCompliance(input);
    res.json(report);
  } catch (err) {
    next(err); // Pass to error handler
  }
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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
  logger.info('SIGTERM received: shutting down');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});