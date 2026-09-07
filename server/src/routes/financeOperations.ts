import { Router } from 'express';

import { requireAdminOrOwner } from '../../middleware/auth';
import {
  getFinanceOperationsCapabilityState,
  requireFinancePilotUser,
} from '../lib/financeOperationsPolicy';
import {
  buildFinanceSyntheticPilotScenario,
  parseFinanceSyntheticVariant,
} from '../services/financeSyntheticPilot.service';

const router = Router();

router.use(...requireAdminOrOwner, requireFinancePilotUser);

router.get('/capabilities', (_req, res) => {
  res.json(getFinanceOperationsCapabilityState());
});

router.get('/pilot-scenarios/syn-p2-001', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(
    buildFinanceSyntheticPilotScenario(
      parseFinanceSyntheticVariant(req.query.variant)
    )
  );
});

export default router;
