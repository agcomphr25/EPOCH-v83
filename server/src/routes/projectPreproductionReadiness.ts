import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
import {
  approveProductionRelease,
  completePreproduction,
  createPreproductionReadiness,
  decidePreproduction,
  getPreproductionReadiness,
  launchProduction,
  ProjectPreproductionError,
  recalculatePreproduction,
  revisePreproduction,
  submitPreproduction,
  updatePreproductionDraft,
  type PreproductionActor,
} from '../services/projectPreproductionReadinessService';
import {
  ProjectPilotControlError,
  requireActivePilotForAction,
} from '../services/projectPilotControlService';

const router = Router({ mergeParams: true });
const checklistItem = z.object({
  key: z.string().min(1),
  category: z.string().min(1),
  label: z.string().min(1),
  applicability: z.enum(['REQUIRED', 'NOT_REQUIRED', 'NOT_APPLICABLE']),
  satisfied: z.boolean(),
  evidence: z
    .array(
      z.object({
        recordType: z.string().min(1),
        recordId: z.string().min(1),
        revision: z.string().optional(),
      })
    )
    .optional(),
  justification: z.string().optional(),
  approvedJustification: z.boolean().optional(),
});
const readinessInput = z.object({
  checklist: z.array(checklistItem),
  exceptions: z.array(z.unknown()).optional(),
  risksAndControls: z
    .array(
      z.object({
        risk: z.string().min(1),
        owner: z.string().min(1),
        control: z.string().min(1),
      })
    )
    .optional(),
  effectivityReference: z.string().min(1),
});
const expected = z.object({ expectedLockVersion: z.number().int().positive() });
const decision = expected.extend({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  signatureMeaning: z.string().min(1),
  reason: z.string().optional().default(''),
});
const pilotAction = z.object({
  pilotIdempotencyKey: z.string().min(8).max(200),
  pilotConfirmation: z.string().min(1),
});

function actor(req: Request): PreproductionActor {
  if (!req.user?.id || !req.user.username || !req.user.role)
    throw new ProjectPreproductionError(
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
async function requireCapability(req: Request, capability: string) {
  const value = actor(req);
  const { permissionSet } = await getUserPermissions(value.userId, value.role);
  if (!permissionSet.has(capability))
    throw new ProjectPreproductionError(
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
  if (error instanceof ProjectPreproductionError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  if (error instanceof ProjectPilotControlError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  console.error('P2 V2 Preproduction Readiness error:', error);
  return res.status(500).json({
    error: 'PREPRODUCTION_ACTION_FAILED',
    message: 'The Preproduction Readiness action failed.',
  });
}
const projectId = (req: Request) => String(req.params.id);

router.get('/', async (req, res) => {
  try {
    res.json(await getPreproductionReadiness(projectId(req)));
  } catch (error) {
    fail(res, error);
  }
});
router.get('/history', async (req, res) => {
  try {
    const model = await getPreproductionReadiness(projectId(req));
    res.json({
      history: model.history,
      approvals: model.approvals,
      release: model.release,
      launch: model.launch,
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/', async (req, res) => {
  try {
    const user = await requireCapability(req, 'projects.preproduction.manage');
    res
      .status(201)
      .json(
        await createPreproductionReadiness(
          projectId(req),
          readinessInput.parse(req.body),
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.patch('/:reviewId', async (req, res) => {
  try {
    const user = await requireCapability(req, 'projects.preproduction.manage');
    const body = readinessInput.and(expected).parse(req.body);
    res.json(
      await updatePreproductionDraft(
        projectId(req),
        req.params.reviewId,
        body.expectedLockVersion,
        body,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:reviewId/recalculate', async (req, res) => {
  try {
    const user = await requireCapability(req, 'projects.preproduction.manage');
    const body = expected.parse(req.body);
    res.json(
      await recalculatePreproduction(
        projectId(req),
        req.params.reviewId,
        body.expectedLockVersion,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:reviewId/submit', async (req, res) => {
  try {
    const user = await requireCapability(req, 'projects.preproduction.manage');
    const body = expected.parse(req.body);
    res.json(
      await submitPreproduction(
        projectId(req),
        req.params.reviewId,
        body.expectedLockVersion,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
const decisions = [
  ['pm', 'PROJECT_MANAGEMENT', 'projects.preproduction.pm_decide'],
  ['engineering', 'ENGINEERING', 'projects.preproduction.engineering_decide'],
  ['quality', 'QUALITY', 'projects.preproduction.quality_decide'],
  ['operations', 'OPERATIONS', 'projects.preproduction.operations_decide'],
  [
    'supply-chain',
    'SUPPLY_CHAIN',
    'projects.preproduction.supply_chain_decide',
  ],
  ['finance', 'FINANCE', 'projects.preproduction.finance_decide'],
] as const;
for (const [path, capacity, capability] of decisions) {
  router.post(`/:reviewId/${path}-decision`, async (req, res) => {
    try {
      const user = await requireCapability(req, capability);
      const body = decision.parse(req.body);
      res.json(
        await decidePreproduction(
          projectId(req),
          req.params.reviewId,
          body.expectedLockVersion,
          capacity,
          body.decision,
          body.signatureMeaning,
          body.reason,
          user
        )
      );
    } catch (error) {
      fail(res, error);
    }
  });
}
router.post('/:reviewId/complete', async (req, res) => {
  try {
    const user = await requireCapability(req, 'projects.preproduction.manage');
    const body = expected.parse(req.body);
    res.json(
      await completePreproduction(
        projectId(req),
        req.params.reviewId,
        body.expectedLockVersion,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:reviewId/revise', async (req, res) => {
  try {
    const user = await requireCapability(req, 'projects.preproduction.manage');
    const body = readinessInput.and(expected).parse(req.body);
    res
      .status(201)
      .json(
        await revisePreproduction(
          projectId(req),
          req.params.reviewId,
          body.expectedLockVersion,
          body,
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/release/approve', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_release.approve'
    );
    const pilot = pilotAction.parse(req.body);
    await requireActivePilotForAction(
      projectId(req),
      'PRODUCTION_RELEASE',
      user,
      {
        idempotencyKey: pilot.pilotIdempotencyKey,
        confirmation: pilot.pilotConfirmation,
      }
    );
    res.json(await approveProductionRelease(projectId(req), user));
  } catch (error) {
    fail(res, error);
  }
});
router.post('/launch', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_launch.launch'
    );
    const body = z
      .object({
        idempotencyKey: z.string().min(8).max(200),
        expectedPreviewDigest: z.string().regex(/^[0-9a-f]{64}$/),
        signatureMeaning: z.string().min(1),
        pilotConfirmation: z.string().min(1),
      })
      .parse(req.body);
    await requireActivePilotForAction(
      projectId(req),
      'PRODUCTION_LAUNCH',
      user,
      {
        idempotencyKey: body.idempotencyKey,
        confirmation: body.pilotConfirmation,
      }
    );
    res.json(
      await launchProduction(projectId(req), body.idempotencyKey, user, {
        expectedPreviewDigest: body.expectedPreviewDigest,
        signatureMeaning: body.signatureMeaning,
      })
    );
  } catch (error) {
    fail(res, error);
  }
});

export default router;
