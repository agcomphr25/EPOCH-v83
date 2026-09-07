import { Router } from 'express';

import { requireAdminOrOwner } from '../../middleware/auth';
import {
  getFinanceOperationsCapabilityState,
  requireFinancePilotUser,
} from '../lib/financeOperationsPolicy';

const router = Router();

router.use(...requireAdminOrOwner, requireFinancePilotUser);

router.get('/capabilities', (_req, res) => {
  res.json(getFinanceOperationsCapabilityState());
});

export default router;
