import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getChargeCodeUsageReport } from '../services/chargeCodeUsageReportService';

const router = Router();

router.get('/charge-code-usage', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getChargeCodeUsageReport({
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build charge code usage report';
    const status = message.includes('YYYY-MM-DD') ? 400 : 500;
    console.error('[charge-code-usage-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
