import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getPayrollExportReconciliationReport } from '../services/payrollExportReconciliationReportService';

const router = Router();

router.get('/payroll-export-reconciliation', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getPayrollExportReconciliationReport({
      periodStart: typeof req.query.periodStart === 'string' ? req.query.periodStart : undefined,
      periodEnd: typeof req.query.periodEnd === 'string' ? req.query.periodEnd : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build payroll export reconciliation report';
    const status = message.includes('YYYY-MM-DD') ? 400 : 500;
    console.error('[payroll-export-reconciliation-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
