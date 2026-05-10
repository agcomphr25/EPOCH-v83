import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getProcurementComplianceReport } from '../services/procurementComplianceReportService';

const router = Router();

router.get('/procurement-compliance', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getProcurementComplianceReport({
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      reviewStatus: typeof req.query.reviewStatus === 'string' ? req.query.reviewStatus : undefined,
      issueStatus: typeof req.query.issueStatus === 'string' ? req.query.issueStatus : undefined,
      population: typeof req.query.population === 'string' ? req.query.population : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build procurement compliance report';
    const status = message.includes('YYYY-MM-DD') || message.includes('invalid') ? 400 : 500;
    console.error('[procurement-compliance-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
