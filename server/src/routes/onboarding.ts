import express, { Request, Response } from 'express';

const router = express.Router();

router.get('/paths', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding paths API coming soon'
  });
});

router.post('/paths', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding paths API coming soon'
  });
});

router.get('/forms', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding forms API coming soon'
  });
});

router.post('/forms', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding forms API coming soon'
  });
});

router.get('/sessions', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding sessions API coming soon'
  });
});

router.post('/sessions', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding sessions API coming soon'
  });
});

router.get('/sessions/:id', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding sessions API coming soon'
  });
});

export default router;
