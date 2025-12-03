// apps/backend/src/index.ts
// Entry point for the RegLoom backend service. Sets up the Express server, configures middleware, routes, and starts listening on the specified port. Integrates shared logger and handles graceful shutdown.
// Import necessary modules
import express, { Application } from 'express';
import { logger } from '@regloom/utils'; // Shared logger
import apiGateway from './services/api-gateway'; // Routing and validation setup
import tracingMiddleware from './middlewares/tracing'; // Request tracing middleware
const app: Application = express();
const PORT = process.env.PORT || 4000;
// Middleware setup
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(tracingMiddleware); // Add tracing for request IDs (must be before routes)

apiGateway(app);

// Error handling middleware (basic, expand as needed)
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
export default app; // For testing purposes