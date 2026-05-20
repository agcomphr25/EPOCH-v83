import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getTimesheetCorrectionLogReport } from '../services/timesheetCorrectionLogReportService';

const router = Router();

router.get('/timesheet-correction-log', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getTimesheetCorrectionLogReport({
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      risk: typeof req.query.risk === 'string' ? req.query.risk : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build timesheet correction log report';
    const status = message.includes('YYYY-MM-DD') || message.includes('invalid') ? 400 : 500;
    console.error('[timesheet-correction-log-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
