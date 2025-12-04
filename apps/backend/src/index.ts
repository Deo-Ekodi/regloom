// apps/backend/src/index.ts
// Entry point for the RegLoom backend service. 
// Sets up the Express server, configures middleware, routes, and starts listening on the specified port. 
// Integrates shared logger and handles graceful shutdown.

import express, { Application } from 'express';
import { logger } from '@regloom/utils'; // Shared logger
import apiGateway from './services/api-gateway'; // Routing and validation setup
import tracingMiddleware from './middlewares/tracing'; // Request tracing middleware
import './services/workflow_worker';

// Log start of application file processing
logger.debug('Starting backend service initialization...');

const app: Application = express();
const PORT = process.env.PORT || 4000;

// Middleware setup
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(tracingMiddleware); // Add tracing for request IDs (must be before routes)
logger.info('Express middleware configured (JSON, URL-encoded, Tracing).');

// Public health check — MUST be before auth middleware
app.get('/health', (_req, res) => {
  // logger.info('Health check endpoint accessed.');
  // logger.debug('Responding to health check request.');
  res.status(200).json({
    status: 'healthy',
    service: 'regloom-backend',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

apiGateway(app);

// Error handling middleware (basic, expand as needed)
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Use 'warn' for a high-level error and 'error' for the detailed report
  logger.warn(`API Gateway caught an unhandled request error.`);
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  logger.debug(`Backend server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  logger.info('Server startup complete.');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  // Log an emergency message before initiating shutdown, as SIGTERM is often a final command.
  logger.emerg('Initiating graceful shutdown due to SIGTERM signal.');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Log for critical unhandled exceptions that might prevent graceful shutdown
process.on('uncaughtException', (err) => {
  logger.emerg(`Uncaught Exception detected, forcing immediate shutdown. Error: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

export default app; // For testing purposes