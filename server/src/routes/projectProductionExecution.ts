import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
import {
  completeProductionStage,
  createCompletionReview,
  decideProductionCompletion,
  getProductionDashboard,
  placeProductionHold,
  ProjectProductionExecutionError,
  recalculateProductionReadiness,
  releaseProductionHold,
  submitProductionCompletion,
  type ProductionActor,
} from '../services/projectProductionExecutionService';
import {
  ProjectPilotControlError,
  requireActivePilotForAction,
} from '../services/projectPilotControlService';

const router = Router({ mergeParams: true });
const expected = z.object({ expectedLockVersion: z.number().int().positive() });
const decision = expected.extend({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  signatureMeaning: z.string().min(1),
  reason: z.string().optional().default(''),
});
const hold = expected.extend({
  reason: z.string().min(1),
  scopeType: z.enum([
    'PROJECT',
    'PART',
    'PRODUCTION_ORDER',
    'TRAVELER',
    'QUANTITY',
  ]),
  scopeRecordId: z.string().optional(),
  affectedPartNumber: z.string().optional(),
  affectedQuantity: z.number().positive().optional(),
  requiredDisposition: z.string().min(1),
});
const releaseHold = expected.extend({ releaseReason: z.string().min(1) });
const pilotAction = expected.extend({
  pilotIdempotencyKey: z.string().min(8).max(200),
  pilotConfirmation: z.string().min(1),
});

function actor(req: Request): ProductionActor {
  if (!req.user?.id || !req.user.username || !req.user.role)
    throw new ProjectProductionExecutionError(
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
    throw new ProjectProductionExecutionError(
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
  if (error instanceof ProjectProductionExecutionError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  if (error instanceof ProjectPilotControlError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  console.error('P2 V2 Production Execution error:', error);
  return res.status(500).json({
    error: 'PRODUCTION_STAGE_ACTION_FAILED',
    message: 'The Production-stage action failed.',
  });
}
const projectId = (req: Request) => String(req.params.id);

router.get('/', async (req, res) => {
  try {
    res.json(await getProductionDashboard(projectId(req)));
  } catch (error) {
    fail(res, error);
  }
});
router.get('/evidence', async (req, res) => {
  try {
    const model = await getProductionDashboard(projectId(req));
    res.json({
      productionOrders: model.productionOrders,
      serializedItems: model.serializedItems,
      travelers: model.travelers,
      traceability: model.traceability,
      ncrs: model.ncrs,
      labor: model.labor,
      deferrals: model.deferrals,
    });
  } catch (error) {
    fail(res, error);
  }
});
router.get('/history', async (req, res) => {
  try {
    const model = await getProductionDashboard(projectId(req));
    res.json({
      history: model.history,
      approvals: model.approvals,
      holds: model.holds,
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/completion-reviews', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_stage.manage'
    );
    res.status(201).json(await createCompletionReview(projectId(req), user));
  } catch (error) {
    fail(res, error);
  }
});
router.post('/completion-reviews/current/recalculate', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_stage.manage'
    );
    const body = expected.parse(req.body);
    res.json(
      await recalculateProductionReadiness(
        projectId(req),
        body.expectedLockVersion,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/completion-reviews/current/submit', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_stage.manage'
    );
    const body = expected.parse(req.body);
    res.json(
      await submitProductionCompletion(
        projectId(req),
        body.expectedLockVersion,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
const decisions = [
  ['operations', 'OPERATIONS', 'projects.production_stage.operations_decide'],
  ['quality', 'QUALITY', 'projects.production_stage.quality_decide'],
  [
    'project-management',
    'PROJECT_MANAGEMENT',
    'projects.production_stage.pm_decide',
  ],
  [
    'manufacturing-engineering',
    'MANUFACTURING_ENGINEERING',
    'projects.production_stage.engineering_decide',
  ],
] as const;
for (const [path, type, capability] of decisions) {
  router.post(
    `/completion-reviews/current/decisions/${path}`,
    async (req, res) => {
      try {
        const user = await requireCapability(req, capability);
        const body = decision.parse(req.body);
        res.json(
          await decideProductionCompletion(
            projectId(req),
            body.expectedLockVersion,
            type,
            body.decision,
            body.signatureMeaning,
            body.reason,
            user
          )
        );
      } catch (error) {
        fail(res, error);
      }
    }
  );
}
router.post('/completion-reviews/current/complete', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_stage.manage'
    );
    const body = pilotAction.parse(req.body);
    await requireActivePilotForAction(
      projectId(req),
      'PRODUCTION_EXECUTION_COMPLETION',
      user,
      {
        idempotencyKey: body.pilotIdempotencyKey,
        confirmation: body.pilotConfirmation,
      }
    );
    res.json(
      await completeProductionStage(
        projectId(req),
        body.expectedLockVersion,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/holds', async (req, res) => {
  try {
    const user = await requireCapability(req, 'projects.production_stage.hold');
    const body = hold.parse(req.body);
    res
      .status(201)
      .json(
        await placeProductionHold(
          projectId(req),
          body.expectedLockVersion,
          body,
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/holds/:holdId/release', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_stage.release_hold'
    );
    const body = releaseHold.parse(req.body);
    res.json(
      await releaseProductionHold(
        projectId(req),
        req.params.holdId,
        body.expectedLockVersion,
        body.releaseReason,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});

export default router;
