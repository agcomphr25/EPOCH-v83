import { Router, Request, Response } from 'express';
import { detectDrift, StepInstance } from '../../../shared/pattern-awareness-layer/signals/driftLogic';
import { clearSuppression, getSuppressionRecord } from '../../../shared/pattern-awareness-layer/signals/suppressionStore';

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

  const result = detectDrift(stepId, instances);

  if (result) {
    return res.json({ 
      driftDetected: true, 
      ...result 
    });
  }

  return res.json({ driftDetected: false, message: 'No drift detected.' });
});

// Test route — not mounted in production
if (process.env.NODE_ENV !== 'production') {
  router.get('/test-drift', (_req: Request, res: Response) => {
    const testStepId = 'test-routing-step-001';
    
    clearSuppression(testStepId);
    
    const now = Date.now();
    const normalDuration = 30000;
    const driftedDuration = 50000;
    
    const instances: StepInstance[] = [];
    
    for (let i = 0; i < 10; i++) {
      const startTime = now - (20 - i) * 3600000;
      instances.push({
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(startTime + normalDuration + Math.random() * 5000).toISOString()
      });
    }
    
    for (let i = 0; i < 5; i++) {
      const startTime = now - (10 - i) * 3600000;
      instances.push({
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(startTime + driftedDuration + Math.random() * 10000).toISOString()
      });
    }
    
    console.log('\n========== PATTERN AWARENESS TEST ==========');
    console.log(`Testing step: ${testStepId}`);
    console.log(`Total instances: ${instances.length}`);
    console.log(`Baseline (first 10): ~30 seconds each`);
    console.log(`Recent (last 5): ~50 seconds each (drifted +67%)`);
    console.log('=============================================\n');
    
    const result = detectDrift(testStepId, instances);
    
    if (result) {
      return res.json({ 
        testPassed: true,
        testMessage: 'Drift detection working correctly!',
        ...result 
      });
    }
    
    const suppression = getSuppressionRecord(testStepId);
    if (suppression) {
      return res.json({ 
        testPassed: true,
        message: 'Drift was previously detected and is currently suppressed.',
        suppression
      });
    }

    return res.json({ 
      testPassed: false, 
      message: 'No drift detected - this is unexpected with test data.' 
    });
  });
}

router.post('/clear-suppression', (req: Request, res: Response) => {
  const { stepId, patternType } = req.body;
  
  if (!stepId) {
    return res.status(400).json({ error: 'stepId is required' });
  }
  
  clearSuppression(stepId, patternType || 'cycle-time-drift');
  
  return res.json({ 
    success: true, 
    message: `Suppression cleared for ${stepId}` 
  });
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'pattern-signals' });
});

export default router;
