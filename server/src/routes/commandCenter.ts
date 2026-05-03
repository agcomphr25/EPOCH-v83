import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { getCommandCenterData } from '../lib/commandCenter';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const data = await getCommandCenterData(storage);
    return res.json(data);
  } catch (err: any) {
    console.error('[CommandCenter] Error building command center data:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load command center data' });
  }
});

export default router;
