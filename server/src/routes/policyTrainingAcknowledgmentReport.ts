import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdminOrOwner } from '../../middleware/auth';
import { getPolicyTrainingAcknowledgmentReport } from '../services/policyTrainingAcknowledgmentReportService';

const router = Router();

router.get('/policy-training-acknowledgment', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const report = await getPolicyTrainingAcknowledgmentReport({
      topic: typeof req.query.topic === 'string' ? req.query.topic : undefined,
      driftOnly: typeof req.query.driftOnly === 'string' ? req.query.driftOnly : undefined,
    });
    res.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build policy and training acknowledgment report';
    const status = message.includes('invalid') ? 400 : 500;
    console.error('[policy-training-acknowledgment-report]', message);
    res.status(status).json({ error: message });
  }
});

export default router;
