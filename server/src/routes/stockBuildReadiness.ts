import { Router } from 'express';

import { authenticateToken } from '../../middleware/auth';
import { listActiveManufacturedStockBuildParts } from '../services/stockBuildReadinessService';

const router = Router();

router.get('/parts', authenticateToken, async (_req, res) => {
  try {
    res.json({ parts: await listActiveManufacturedStockBuildParts() });
  } catch (error) {
    console.error('[stock-build-readiness]', error);
    res.status(500).json({ error: 'STOCK_BUILD_READINESS_FAILED' });
  }
});

export default router;
