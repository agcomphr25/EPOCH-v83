import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import {
  getAccountingEventMatrix,
  summarizeAccountingEventMatrix,
} from '../services/accountingEventMatrix';

const router = Router();

router.use(authenticateToken);
router.use(requirePermission('finance.view'));

router.get('/', (_req, res) => {
  const events = getAccountingEventMatrix();
  res.json({
    summary: summarizeAccountingEventMatrix(events),
    events,
  });
});

export default router;
