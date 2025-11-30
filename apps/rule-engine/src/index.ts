// index.ts: Entry point for the rule-engine microservice.
// Sets up an Express server exposing API endpoints for rule evaluation.
// Loads .env for configuration; uses shared logger for monitoring.
// Production-grade: JSON body parsing, error handling, async support.
// Runs on configurable port; integrable with other services via HTTP.
import 'dotenv/config';
import express, { Request, Response } from 'express';
import { logger } from '@regloom/utils';
import { evaluateCompliance } from './drools_adapter';
import { WeaveInput } from '@regloom/types';


const app = express();
app.use(express.json());

const PORT = process.env.RULE_ENGINE_PORT || 4001;

app.get('/', (req: Request, res: Response) => {
  res.send('Rule Engine service is alive!');
});

app.post('/evaluate', async (req: Request, res: Response) => {
  const input: WeaveInput = req.body;
  if (!input.data || !Array.isArray(input.regulations)) {
    logger.warn('Invalid input for evaluation');
    return res.status(400).json({ error: 'Invalid input: data and regulations required' });
  }
  try {
    const report = await evaluateCompliance(input);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: 'Evaluation failed' });
  }
});

app.listen(PORT, () => {
  logger.info(`Rule Engine service is running on port ${PORT}`);
});