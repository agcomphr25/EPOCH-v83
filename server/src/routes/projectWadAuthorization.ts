import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { AuthService } from '../../auth';
import { getUserPermissions } from '../services/permissionService';
import {
  areP2WadTravelerDecisionReadsEnabled,
  areP2WadTravelerDecisionWritesEnabled,
} from '../lib/featureFlags';
import {
  approveWadTravelerException,
  listWadTravelerDecisions,
  saveWadTravelerDecision,
  WadTravelerDecisionError,
} from '../services/p2WadTravelerDecisionService';
import {
  createWadDraft,
  getCurrentWadAuthorization,
  linkExistingWad,
  ProjectWadAuthorizationError,
  recordWadDecision,
  releaseWadAuthorization,
  reviseWadAuthorization,
  submitWadAuthorization,
  type WadAuthorizationActor,
} from '../services/projectWadAuthorizationService';

const router = Router({ mergeParams: true });
const budgetSchema = z.object({
  departments: z.array(
    z.object({
      department: z.string().min(1),
      hours: z.number().nonnegative(),
      chargeCodeId: z.number().int().positive().nullable(),
      zeroBudgetJustification: z.string().nullable().optional(),
    })
  ),
  materialBudget: z.number().nonnegative(),
  outsideProcessingBudget: z.number().nonnegative(),
  toolingNreBudget: z.number().nonnegative().nullable().optional(),
  warningThreshold: z.number().nonnegative().nullable().optional(),
  blockingThreshold: z.number().positive().nullable().optional(),
  startDate: z.string().min(1),
  dueDate: z.string().min(1),
  risks: z.array(
    z.object({
      description: z.string().min(1),
      owner: z.string().min(1),
      control: z.string().min(1),
    })
  ),
  responsibleOwners: z.array(z.string().min(1)),
});
const draftSchema = z.object({
  budget: budgetSchema,
  financeRequired: z.boolean().optional(),
  executiveRequired: z.boolean().optional(),
  confirmation: z.string().optional(),
});
const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  signatureMeaning: z.string().min(1),
  reason: z.string().optional().default(''),
});
const releaseSchema = z.object({ signatureMeaning: z.string().min(1) });
const travelerDecisionSchema = z.object({
  inventoryItemId: z.number().int().positive(),
  assemblyPathIdentity: z.string().min(1),
  requiredQuantity: z.number().positive(),
  batchApprovedQuantity: z.number().positive().nullable().optional(),
  batchCoverageScope: z.string().min(1).nullable().optional(),
  travelerRequirement: z.enum(['REQUIRED', 'NOT_REQUIRED_APPROVED']),
  travelerType: z.enum(['INDIVIDUAL', 'BATCH']).nullable().optional(),
  inspectionRequirements: z.record(z.unknown()),
  exceptionReason: z.string().nullable().optional(),
  exceptionEffectivity: z.record(z.unknown()).nullable().optional(),
  expectedVersion: z.number().int().positive().optional(),
});
const exceptionApprovalSchema = z.object({
  expectedVersion: z.number().int().positive(),
  signatureMeaning: z.string().min(1),
});

async function actor(req: Request): Promise<WadAuthorizationActor> {
  if (!req.user?.id)
    throw new ProjectWadAuthorizationError(
      'ACTOR_REQUIRED',
      'Authenticated actor identity is required.',
      401
    );

  // Resolve the actor from the authoritative users row for every controlled
  // request. Long-lived Express sessions and browser tokens may predate an
  // employee-link repair; trusting only the serialized session payload would
  // continue to reject an otherwise valid employee until the next login.
  const currentUser = await AuthService.getUserById(req.user.id);
  if (!currentUser?.username || !currentUser.role)
    throw new ProjectWadAuthorizationError(
      'ACTOR_REQUIRED',
      'Authenticated actor identity is required.',
      401
    );
  req.user = currentUser;

  if (!currentUser.employeeId)
    throw new ProjectWadAuthorizationError(
      'ACTOR_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required for controlled WAD actions.',
      403
    );
  return {
    userId: currentUser.id,
    employeeId: currentUser.employeeId,
    username: currentUser.username,
    displayName: currentUser.username,
    role: currentUser.role,
  };
}
async function requireCapability(req: Request, capability: string) {
  const value = await actor(req);
  const { permissionSet } = await getUserPermissions(value.userId, value.role);
  if (!permissionSet.has(capability))
    throw new ProjectWadAuthorizationError(
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
  if (error instanceof ProjectWadAuthorizationError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  if (error instanceof WadTravelerDecisionError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message });
  console.error('P2 V2 WAD Authorization error:', error);
  return res.status(500).json({
    error: 'WAD_AUTHORIZATION_FAILED',
    message: 'WAD Authorization action failed.',
  });
}
const projectId = (req: Request) => String(req.params.id);

router.get('/:authorizationId/traveler-decisions', async (req, res) => {
  try {
    if (!areP2WadTravelerDecisionReadsEnabled())
      throw new ProjectWadAuthorizationError(
        'FEATURE_DISABLED',
        'WAD traveler-decision reads are disabled.',
        404
      );
    await actor(req);
    res.json(
      await listWadTravelerDecisions(projectId(req), req.params.authorizationId)
    );
  } catch (error) {
    fail(res, error);
  }
});
router.put('/:authorizationId/traveler-decisions', async (req, res) => {
  try {
    if (!areP2WadTravelerDecisionWritesEnabled())
      throw new ProjectWadAuthorizationError(
        'FEATURE_DISABLED',
        'WAD traveler-decision writes are disabled.',
        404
      );
    const user = await requireCapability(
      req,
      'projects.wad_traveler_decisions.manage'
    );
    res.json(
      await saveWadTravelerDecision(
        {
          projectId: projectId(req),
          authorizationId: req.params.authorizationId,
          ...travelerDecisionSchema.parse(req.body),
        },
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post(
  '/:authorizationId/traveler-decisions/:decisionId/exception-approve',
  async (req, res) => {
    try {
      if (!areP2WadTravelerDecisionWritesEnabled())
        throw new ProjectWadAuthorizationError(
          'FEATURE_DISABLED',
          'WAD traveler-decision writes are disabled.',
          404
        );
      const user = await requireCapability(
        req,
        'projects.wad_traveler_decisions.exception_approve'
      );
      const body = exceptionApprovalSchema.parse(req.body);
      res.json(
        await approveWadTravelerException(
          projectId(req),
          req.params.authorizationId,
          req.params.decisionId,
          body.expectedVersion,
          body.signatureMeaning,
          user
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get('/', async (req, res) => {
  try {
    res.json(await getCurrentWadAuthorization(projectId(req)));
  } catch (error) {
    fail(res, error);
  }
});
router.post('/create-draft', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.wad_authorization.manage'
    );
    res
      .status(201)
      .json(
        await createWadDraft(projectId(req), draftSchema.parse(req.body), user)
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/link-existing', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.wad_authorization.manage'
    );
    const body = draftSchema
      .extend({
        wadReference: z.string().trim().min(1).optional(),
        wadId: z.string().trim().min(1).optional(),
      })
      .refine((value) => value.wadReference || value.wadId, {
        message: 'Existing WAD number or ID is required.',
        path: ['wadReference'],
      })
      .parse(req.body);
    res
      .status(201)
      .json(
        await linkExistingWad(
          projectId(req),
          body.wadReference || body.wadId!,
          body,
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:authorizationId/submit', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.wad_authorization.manage'
    );
    res.json(
      await submitWadAuthorization(
        projectId(req),
        req.params.authorizationId,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
const decisionRoutes = [
  ['pm-decision', 'PROJECT_MANAGEMENT', 'projects.wad_authorization.pm_decide'],
  [
    'engineering-decision',
    'ENGINEERING',
    'projects.wad_authorization.engineering_decide',
  ],
  ['quality-decision', 'QUALITY', 'projects.wad_authorization.quality_decide'],
  [
    'operations-decision',
    'OPERATIONS',
    'projects.wad_authorization.operations_decide',
  ],
  ['finance-decision', 'FINANCE', 'projects.wad_authorization.finance_decide'],
  [
    'executive-decision',
    'EXECUTIVE',
    'projects.wad_authorization.executive_decide',
  ],
] as const;
for (const [path, capacity, capability] of decisionRoutes) {
  router.post(`/:authorizationId/${path}`, async (req, res) => {
    try {
      const user = await requireCapability(req, capability);
      const body = decisionSchema.parse(req.body);
      res.json(
        await recordWadDecision(
          projectId(req),
          req.params.authorizationId,
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
router.post('/:authorizationId/release', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.wad_authorization.release'
    );
    const body = releaseSchema.parse(req.body);
    res.json(
      await releaseWadAuthorization(
        projectId(req),
        req.params.authorizationId,
        body.signatureMeaning,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:authorizationId/revise', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.wad_authorization.manage'
    );
    res
      .status(201)
      .json(
        await reviseWadAuthorization(
          projectId(req),
          req.params.authorizationId,
          draftSchema.parse(req.body),
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});

export default router;
