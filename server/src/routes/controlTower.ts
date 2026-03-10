import { Router, Request, Response } from 'express';
import { getControlTowerSignals } from '../services/controlTowerService';

const router = Router();

router.get('/signals', async (_req: Request, res: Response) => {
  try {
    const signals = await getControlTowerSignals();
    res.json({ signals });
  } catch (error) {
    console.error('Control Tower signals error:', error);
    res.status(500).json({
      error: 'Failed to fetch control tower signals',
    });
  }
});

export default router;
