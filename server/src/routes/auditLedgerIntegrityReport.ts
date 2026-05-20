import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getAuditLedgerIntegrityReport } from '../services/auditLedgerIntegrityReportService';

const router = Router();

router.get('/audit-ledger-integrity', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getAuditLedgerIntegrityReport({
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      windowSize: typeof req.query.windowSize === 'string' ? req.query.windowSize : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build audit ledger integrity report';
    const status = message.includes('YYYY-MM-DD') || message.includes('invalid') || message.includes('windowSize') ? 400 : 500;
    console.error('[audit-ledger-integrity-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
