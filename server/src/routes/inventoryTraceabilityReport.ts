import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getInventoryTraceabilityReport } from '../services/inventoryTraceabilityReportService';

const router = Router();

router.get('/inventory-traceability', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getInventoryTraceabilityReport({
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      exceptionOnly: typeof req.query.exceptionOnly === 'string' ? req.query.exceptionOnly : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build inventory traceability report';
    const status = message.includes('YYYY-MM-DD') || message.includes('invalid') ? 400 : 500;
    console.error('[inventory-traceability-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
