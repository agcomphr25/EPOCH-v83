import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
import {
  createQualityReview,
  completeQualityReview,
  decideQualityReview,
  getQualityDashboard,
  placeReleaseHold,
  ProjectQualityReleaseError,
  releaseProductHold,
  releaseProduct,
  submitQualityReview,
} from '../services/projectQualityReleaseService';
import type { ProductionActor } from '../services/projectProductionExecutionService';
import {
  ProjectPilotControlError,
  requireActivePilotForAction,
} from '../services/projectPilotControlService';

const router = Router({ mergeParams: true });
const expected = z.object({ expectedLockVersion: z.number().int().positive() });
const decision = expected.extend({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  signatureMeaning: z.string().min(1),
  pilotConfirmation: z.string().min(1),
  reason: z.string().optional().default(''),
});
const release = expected.extend({
  idempotencyKey: z.string().min(8).max(200),
  poLineId: z.number().int().positive().optional(),
  partNumber: z.string().min(1),
  partRevision: z.string().optional(),
  quantity: z.number().positive(),
  serialNumbers: z.array(z.string().min(1)).default([]),
  batchLots: z.array(z.string().min(1)).default([]),
  signatureMeaning: z.string().min(1),
});
const hold = z.object({
  reason: z.string().min(1),
  quantity: z.number().positive(),
  serialNumbers: z.array(z.string()).default([]),
  batchLots: z.array(z.string()).default([]),
});
const releaseHold = z.object({ releaseReason: z.string().min(1) });

function actor(req: Request): ProductionActor {
  if (!req.user?.id || !req.user.username || !req.user.role)
    throw new ProjectQualityReleaseError(
      'ACTOR_REQUIRED',
      'Authenticated actor identity is required.',
      401
    );
  return {
    userId: req.user.id,
    employeeId: req.user.employeeId ?? null,
    username: req.user.username,
    displayName: req.user.username,
    role: req.user.role,
  };
}
async function authorized(req: Request, capability: string) {
  const value = actor(req);
  const { permissionSet } = await getUserPermissions(value.userId, value.role);
  if (!permissionSet.has(capability))
    throw new ProjectQualityReleaseError(
      'FORBIDDEN',
      `The ${capability} capability is required.`,
      403
    );
  return value;
}
function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof ProjectQualityReleaseError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  if (error instanceof ProjectPilotControlError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  console.error('P2 V2 Quality Product Release error:', error);
  return res.status(500).json({
    error: 'QUALITY_RELEASE_ACTION_FAILED',
    message: 'The Quality Product Release action failed.',
  });
}
const id = (req: Request) => String(req.params.id);

router.get('/', async (req, res) => {
  try {
    res.json(await getQualityDashboard(id(req)));
  } catch (error) {
    fail(res, error);
  }
});
router.get('/evidence', async (req, res) => {
  try {
    const model = await getQualityDashboard(id(req));
    res.json({
      items: model.items,
      ncrs: model.ncrs,
      documentManifest: model.documentManifest,
      productionCompletion: model.ctx.productionReview,
    });
  } catch (error) {
    fail(res, error);
  }
});
router.get('/releases', async (req, res) => {
  try {
    const model = await getQualityDashboard(id(req));
    res.json({ releases: model.releases, holds: model.holds });
  } catch (error) {
    fail(res, error);
  }
});
router.get('/history', async (req, res) => {
  try {
    const model = await getQualityDashboard(id(req));
    res.json({
      review: model.review,
      approvals: model.approvals,
      releases: model.releases,
      holds: model.holds,
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/reviews', async (req, res) => {
  try {
    res
      .status(201)
      .json(
        await createQualityReview(
          id(req),
          await authorized(req, 'projects.quality_release.manage')
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/reviews/current/submit', async (req, res) => {
  try {
    const body = expected.parse(req.body);
    res.json(
      await submitQualityReview(
        id(req),
        body.expectedLockVersion,
        await authorized(req, 'projects.quality_release.manage')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
for (const [path, type, capability] of [
  ['quality', 'QUALITY', 'projects.quality_release.quality_decide'],
  ['operations', 'OPERATIONS', 'projects.quality_release.operations_decide'],
  [
    'project-management',
    'PROJECT_MANAGEMENT',
    'projects.quality_release.pm_decide',
  ],
] as const) {
  router.post(`/reviews/current/decisions/${path}`, async (req, res) => {
    try {
      const body = decision.parse(req.body);
      res.json(
        await decideQualityReview(
          id(req),
          body.expectedLockVersion,
          type,
          body.decision,
          body.signatureMeaning,
          body.reason,
          await authorized(req, capability)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  });
}
router.post('/reviews/current/complete', async (req, res) => {
  try {
    const body = expected.parse(req.body);
    res.json(
      await completeQualityReview(
        id(req),
        body.expectedLockVersion,
        await authorized(req, 'projects.quality_release.manage')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/releases', async (req, res) => {
  try {
    const body = release.parse(req.body);
    const user = await authorized(
      req,
      'projects.quality_release.release_product'
    );
    await requireActivePilotForAction(id(req), 'PRODUCT_RELEASE', user, {
      poLineId: body.poLineId,
      partNumber: body.partNumber,
      quantity: body.quantity,
      idempotencyKey: body.idempotencyKey,
      confirmation: body.pilotConfirmation,
    });
    res.status(201).json(await releaseProduct(id(req), body, user));
  } catch (error) {
    fail(res, error);
  }
});
router.post('/releases/:releaseId/holds', async (req, res) => {
  try {
    const body = hold.parse(req.body);
    res
      .status(201)
      .json(
        await placeReleaseHold(
          id(req),
          String(req.params.releaseId),
          body.reason,
          body.quantity,
          body.serialNumbers,
          body.batchLots,
          await authorized(req, 'projects.quality_release.hold')
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/releases/:releaseId/holds/:holdId/release', async (req, res) => {
  try {
    const body = releaseHold.parse(req.body);
    res.json(
      await releaseProductHold(
        id(req),
        String(req.params.releaseId),
        String(req.params.holdId),
        body.releaseReason,
        await authorized(req, 'projects.quality_release.release_hold')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});

export default router;
