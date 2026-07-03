import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getLaborDistributionReport } from '../services/laborDistributionReportService';

const router = Router();

router.get('/labor-distribution', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getLaborDistributionReport({
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      employeeId: typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined,
      chargeCodeId: typeof req.query.chargeCodeId === 'string' ? req.query.chargeCodeId : undefined,
      classification: typeof req.query.classification === 'string' ? req.query.classification : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build labor distribution report';
    const status = message.includes('YYYY-MM-DD') || message.includes('invalid') || message.includes('positive integer') ? 400 : 500;
    console.error('[labor-distribution-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
