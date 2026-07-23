import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
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

function actor(req: Request): WadAuthorizationActor {
  if (!req.user?.id || !req.user?.username || !req.user?.role)
    throw new ProjectWadAuthorizationError(
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
  console.error('P2 V2 WAD Authorization error:', error);
  return res.status(500).json({
    error: 'WAD_AUTHORIZATION_FAILED',
    message: 'WAD Authorization action failed.',
  });
}
const projectId = (req: Request) => String(req.params.id);

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
      .extend({ wadId: z.string().uuid() })
      .parse(req.body);
    res
      .status(201)
      .json(await linkExistingWad(projectId(req), body.wadId, body, user));
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
