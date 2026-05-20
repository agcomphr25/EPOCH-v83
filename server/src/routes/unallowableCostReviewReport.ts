import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getUnallowableCostReviewReport } from '../services/unallowableCostReviewReportService';

const router = Router();

router.get('/unallowable-cost-review', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getUnallowableCostReviewReport({
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      dcaaStatus: typeof req.query.dcaaStatus === 'string' ? req.query.dcaaStatus : undefined,
      allowabilityStatus: typeof req.query.allowabilityStatus === 'string' ? req.query.allowabilityStatus : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build unallowable cost review report';
    const status = message.includes('YYYY-MM-DD') || message.includes('invalid') ? 400 : 500;
    console.error('[unallowable-cost-review-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
