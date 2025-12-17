import { Router, Request, Response } from 'express';
import { detectDrift, StepInstance } from '../../../shared/pattern-awareness-layer/signals/driftLogic';

const router = Router();

interface CheckDriftBody {
  stepId: string;
  instances: StepInstance[];
}

router.post('/check-drift', (req: Request<{}, {}, CheckDriftBody>, res: Response) => {
  const { stepId, instances } = req.body;

  if (!stepId || !instances || !Array.isArray(instances)) {
    return res.status(400).json({ error: 'Invalid input. Required: stepId (string), instances (array)' });
  }

  const result = detectDrift(instances);

  if (result.isDrifting) {
    return res.json({
      detected: true,
      message: result.message,
      subtext: result.subtext,
      stepId,
      stats: result.stats
    });
  } else {
    return res.json({ 
      detected: false,
      message: 'No drift detected.',
      stepId
    });
  }
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'pattern-signals' });
});

export default router;
