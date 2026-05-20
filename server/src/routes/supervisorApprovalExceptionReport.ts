import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getSupervisorApprovalExceptionReport } from '../services/supervisorApprovalExceptionReportService';

const router = Router();

router.get('/supervisor-approval-exceptions', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getSupervisorApprovalExceptionReport({
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      recordType: typeof req.query.recordType === 'string' ? req.query.recordType : undefined,
      exceptionType: typeof req.query.exceptionType === 'string' ? req.query.exceptionType : undefined,
      staleDays: typeof req.query.staleDays === 'string' ? req.query.staleDays : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build supervisor approval exception report';
    const status = message.includes('YYYY-MM-DD') || message.includes('invalid') || message.includes('staleDays') ? 400 : 500;
    console.error('[supervisor-approval-exception-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
