// apps/rule-engine/src/index.ts
// Entry point for RegLoom rule-engine microservice.
// Sets up Express server, endpoints for evaluation/health.
// Prod-grade: JSON parsing, async handlers, error middleware, graceful shutdown.
// Integrates with Dapr sidecar if enabled (via env).

import express, { Application, Request, Response, NextFunction } from 'express';
import { logger } from '@regloom/utils';
import { evaluateCompliance } from './drools_adapter';
import { WeaveInput, ComplianceReport } from '@regloom/types'; // Import ComplianceReport for type safety
import { tracingMiddleware } from '@regloom/utils';

const app: Application = express();
app.use(express.json({ limit: '10mb' })); // Handle larger payloads
app.use(tracingMiddleware); // Add tracing middleware

const PORT = process.env.RULE_ENGINE_PORT || 4001;

// Health check (for k8s probes/Dapr)
app.get('/health', (req, res) => {
  const requestId = req.header('X-Request-ID') || 'unknown';

  // ADDED: Log incoming health request details
  // logger.debug('Health check received', {
  //   requestId,
  //   method: req.method,
  //   path: req.path,
  // });

  const responseData = {
    status: 'healthy',
    service: 'regloom-rule-engine',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };

  // ADDED: Log outgoing health response
  logger.debug('Health check response sent', {
    requestId,
    status: 200,
    responseKeys: Object.keys(responseData)
  });

  res.status(200).json(responseData);
});

// Main evaluation endpoint
app.post('/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.header('X-Request-ID') || 'unknown';
  logger.debug('Received evaluation request', { requestId, recordCount: req.body.data?.length });
  const input: WeaveInput = req.body;
  logger.info('Received evaluation request.'); // INFO: Request start

  // ADDED: Debug log the entire incoming request body for full traceability
  logger.debug('Evaluation input payload: Full body', {
    requestId,
    inputBody: input
  });

  if (!Array.isArray(input.data) || !Array.isArray(input.regulations)) {
    logger.warn('Invalid evaluation input: Missing expected arrays.', { body: req.body }); // WARN: Invalid input data

    const errorResponse = { error: 'Invalid input: data (array) and regulations (array) required' };

    // ADDED: Log the invalid input output
    logger.debug('Invalid input response sent', {
      requestId,
      status: 400,
      response: errorResponse
    });

    return res.status(400).json(errorResponse);
  }

  try {
    logger.debug(`Starting compliance evaluation for ${input.data.length} records.`); // DEBUG: Pre-computation step
    const report: ComplianceReport = await evaluateCompliance(input);

    logger.info('Evaluation completed successfully.'); // INFO: Success

    // ADDED: Debug log the entire outgoing successful report
    logger.debug('Evaluation success response sent', {
      requestId,
      status: 200,
      compliant: report.compliant,
      violationsCount: report.violations.length,
      score: report.score,
      // Log the full report content
      fullReport: report
    });

    res.json(report);
  } catch (err) {
    logger.emerg('Evaluation process failed catastrophically.'); // EMERG: Critical failure log

    // ADDED: Log the critical error output before passing to global handler
    logger.debug('Evaluation failure dispatched to error handler', {
      requestId,
      errorType: (err as Error).name,
      errorMessage: (err as Error).message
    });

    next(err); // Pass to global error handler
  }
});

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = req.header('X-Request-ID') || 'unknown';
  const errorResponse = { error: 'Internal server error' };

  logger.error(`Unhandled error: ${err.message}`, {
    requestId,
    stack: err.stack,
    endpoint: req.path,
    method: req.method
  });

  // ADDED: Debug log the final 500 response
  logger.debug('Global error response sent', {
    requestId,
    status: 500,
    response: errorResponse
  });

  res.status(500).json(errorResponse);
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