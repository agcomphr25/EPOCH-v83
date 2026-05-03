import { Router, Request, Response } from 'express';

const router = Router();

// All punch_events endpoints have been retired.
// The public.punch_events table was dropped in migration 0048_drop_punch_events.sql
// (Phase 3 of the timekeeping migration). Punch recording and queries are now
// exclusively handled by the standalone Timekeeper module.

router.post('/webhook', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Use the Timekeeper module for punch recording.' });
});

router.post('/v2/webhook', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Use the Timekeeper module for punch recording.' });
});

router.get('/by-employee/:employeeId', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Query the Timekeeper module for employee punch history.' });
});

router.get('/by-canonical/:canonicalId', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Query the Timekeeper module for canonical punch history.' });
});

router.get('/by-date-range', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Query the Timekeeper module for date-range punch history.' });
});

router.get('/labor-summary/:employeeId', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'Retired. Query the Timekeeper module for labor summaries.' });
});

export default router;
