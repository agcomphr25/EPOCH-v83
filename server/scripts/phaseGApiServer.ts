/**
 * Phase G — Temporary API server for flag=ON HTTP validation
 *
 * Starts a minimal Express HTTP server on the port given by PHASE_G_PORT
 * (default 5001) with USE_ALLOCATION_COSTING_READ=true pre-set in the
 * environment.  This file MUST be spawned as a child process whose env
 * has USE_ALLOCATION_COSTING_READ=true set before any imports run, so
 * featureFlags.ts captures the correct value at module load time.
 *
 * Routes exposed (matching the real server):
 *   POST /api/cost-accounting/calculate-labor-costs
 *   POST /api/cost-accounting/reconcile-labor-costs
 *
 * The server signals readiness by writing "READY\n" to stdout.
 * It will exit when sent SIGTERM.
 */

import express from 'express';
import { processLaborCosts } from '../src/services/laborCostingService';
import { reconcileLaborCostsInRange } from '../src/services/laborReconcileService';
import { z } from 'zod';

const PORT = parseInt(process.env.PHASE_G_PORT ?? '5001', 10);

const app = express();
app.use(express.json());

// POST /api/cost-accounting/calculate-labor-costs
app.post('/api/cost-accounting/calculate-labor-costs', async (req, res) => {
  try {
    const { year, month } = z.object({ year: z.number().int(), month: z.number().int() }).parse(req.body);
    const result = await processLaborCosts(year, month);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// POST /api/cost-accounting/reconcile-labor-costs
app.post('/api/cost-accounting/reconcile-labor-costs', async (req, res) => {
  try {
    const { year, month } = z.object({ year: z.number().int(), month: z.number().int() }).parse(req.body);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const result = await reconcileLaborCostsInRange(start, end);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

const server = app.listen(PORT, () => {
  // Signal readiness to the parent process
  process.stdout.write('READY\n');
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
