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
import { observeRealP2ArCandidates } from '../services/financeP2Observation.service';

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

router.get('/p2-candidates', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await observeRealP2ArCandidates(Number(req.query.limit ?? 100)));
  } catch (error) {
    console.error('[FinanceOperations] Failed to observe P2 candidates', error);
    res.status(500).json({ error: 'Failed to observe P2 invoice candidates' });
  }
});

export default router;
