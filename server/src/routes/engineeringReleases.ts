import { Router, type Request, type Response } from 'express';

import {
  generateEngineeringPackage,
  getEngineeringPackagePreview,
} from '../services/engineeringPackageService';

const router = Router();

function actorFromRequest(req: Request) {
  const user = (req as any).user;
  return user?.displayName ?? user?.username ?? user?.email ?? 'system';
}

router.get('/:releaseId/package-preview', async (req: Request, res: Response) => {
  try {
    const preview = await getEngineeringPackagePreview(req.params.releaseId);
    if (!preview) {
      res.status(404).json({ message: 'Engineering Release not found' });
      return;
    }

    res.json({ preview });
  } catch (error) {
    console.error('[engineering-releases] Failed to compute package preview', error);
    res.status(500).json({ message: 'Failed to compute engineering package preview' });
  }
});

router.post('/:releaseId/generate-package', async (req: Request, res: Response) => {
  try {
    const result = await generateEngineeringPackage({
      releaseId: req.params.releaseId,
      actor: actorFromRequest(req),
    });

    if (result.status === 'not_found') {
      res.status(404).json({ message: 'Engineering Release not found' });
      return;
    }

    if (result.status === 'blocked') {
      res.status(422).json({
        message: 'Engineering Package is not ready',
        missingItems: result.missingItems,
        preview: result.preview,
      });
      return;
    }

    res.status(result.status === 'existing' ? 200 : 201).json(result);
  } catch (error) {
    console.error('[engineering-releases] Failed to generate package', error);
    res.status(500).json({ message: 'Failed to generate engineering package' });
  }
});

export default router;
