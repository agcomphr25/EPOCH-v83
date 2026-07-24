import { Router, type Request, type Response } from 'express';

import { requirePermission } from '../../middleware/requirePermission';
import {
  ChangeReleaseError,
  computeChangeReleaseReadiness,
  createChangeEngineeringRelease,
  getChangeRelease,
  reopenAffectedStepGenerations,
  type ReleaseActor,
} from '../services/postReleaseEngineeringReleaseService';
import {
  assertPostReleaseSchemaReady,
  PostReleaseSchemaNotReadyError,
  requiredPostReleaseMigration,
} from '../services/postReleaseSchemaReadiness';

const router = Router();
const actor = (req: Request): ReleaseActor => {
  const user = (req as any).user;
  return {
    id: Number(user.id),
    username: user.username,
    displayName:
      user.displayName ??
      [user.first_name, user.last_name].filter(Boolean).join(' ') ??
      user.username,
    role: user.role,
    capabilities: user.capabilities ?? user.permissions ?? [],
  };
};
const schemaReady = async (_req: Request, res: Response, next: () => void) => {
  try {
    await assertPostReleaseSchemaReady();
    next();
  } catch (error) {
    if (error instanceof PostReleaseSchemaNotReadyError)
      return res.status(503).json({
        error: error.code,
        message: error.message,
        missingObjects: error.missingObjects,
        requiredMigration: requiredPostReleaseMigration,
      });
    throw error;
  }
};
const failure = (res: Response, error: unknown) => {
  if (error instanceof ChangeReleaseError)
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...error.details,
    });
  console.error('[post-release-engineering-release]', error);
  return res.status(500).json({ error: 'ENGINEERING_RELEASE_FAILED' });
};

router.use(schemaReady);

router.get(
  '/readiness',
  requirePermission('engineering.release.preview'),
  async (req, res) => {
    try {
      res.json(
        await computeChangeReleaseReadiness({
          projectId: String(req.query.projectId),
          recordId: String(req.query.recordId),
          ecnId: req.query.ecnId ? String(req.query.ecnId) : null,
          proposedRevision: req.query.proposedRevision
            ? String(req.query.proposedRevision)
            : null,
        })
      );
    } catch (error) {
      failure(res, error);
    }
  }
);

router.get(
  '/:id/change-authorization',
  requirePermission('engineering.release.view'),
  async (req, res) => {
    const result = await getChangeRelease(req.params.id);
    res.json(result.changeAuthorization);
  }
);
router.get(
  '/:id/baseline',
  requirePermission('engineering.release.view'),
  async (req, res) => {
    const result = await getChangeRelease(req.params.id);
    res.json(result.baseline);
  }
);
router.get(
  '/:id',
  requirePermission('engineering.release.view'),
  async (req, res) => {
    const result = await getChangeRelease(req.params.id);
    if (!result.release) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(result);
  }
);

router.post(
  '/ecns/:ecnId/reopen-affected-steps',
  requirePermission('engineering.release.create'),
  async (req, res) => {
    try {
      res.json(
        await reopenAffectedStepGenerations(req.params.ecnId, actor(req))
      );
    } catch (error) {
      failure(res, error);
    }
  }
);
router.post(
  '/ecns/:ecnId/release-readiness',
  requirePermission('engineering.release.preview'),
  async (req, res) => {
    try {
      res.json(
        await computeChangeReleaseReadiness({
          projectId: req.body.projectId,
          recordId: req.body.recordId,
          ecnId: req.params.ecnId,
          proposedRevision: req.body.proposedRevision,
        })
      );
    } catch (error) {
      failure(res, error);
    }
  }
);
router.post(
  '/ecns/:ecnId/create-engineering-release',
  requirePermission('engineering.release.create'),
  requirePermission('engineering.release.approve'),
  async (req, res) => {
    try {
      const result = await createChangeEngineeringRelease(
        {
          projectId: req.body.projectId,
          recordId: req.body.recordId,
          ecnId: req.params.ecnId,
          proposedRevision: req.body.proposedRevision,
          idempotencyKey: String(req.headers['idempotency-key'] ?? ''),
          reason: req.body.reason,
        },
        actor(req)
      );
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (error) {
      failure(res, error);
    }
  }
);

export default router;
