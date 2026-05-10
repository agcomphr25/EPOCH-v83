import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getIndirectCostBurdenRateReport } from '../services/indirectCostBurdenRateReportService';

const router = Router();

router.get('/indirect-cost-burden-rates', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getIndirectCostBurdenRateReport({
      asOfDate: typeof req.query.asOfDate === 'string' ? req.query.asOfDate : undefined,
      rateType: typeof req.query.rateType === 'string' ? req.query.rateType : undefined,
      year: typeof req.query.year === 'string' ? req.query.year : undefined,
      month: typeof req.query.month === 'string' ? req.query.month : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build indirect cost burden rate report';
    const status = message.includes('must be') || message.includes('supplied together') ? 400 : 500;
    console.error('[indirect-cost-burden-rate-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
