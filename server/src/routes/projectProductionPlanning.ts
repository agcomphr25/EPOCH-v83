import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
import {
  createDraftFromCurrentConfiguration,
  getCurrentProductionPlan,
  ProjectProductionPlanningError,
  recordEngineeringDecision,
  recordOperationsDecision,
  recordQualityDecision,
  refreshDraft,
  revisePlan,
  submitForApproval,
  updatePlanItemDecision,
  type PlanningActor,
} from '../services/projectProductionPlanningService';
import { getProductionLaunchPreview } from '../services/productionLaunchPreviewService';
import { persistProductionLaunch } from '../services/productionLaunchPersistenceService';
import {
  authorizeProductionExecution,
  ProductionExecutionAuthorizationError,
} from '../services/productionExecutionAuthorizationService';
import {
  provisionP2ProductionOrders,
  ProductionOrderProvisioningError,
} from '../services/productionOrderProvisioningService';
import {
  provisionP2SerializedUnits,
  SerializedUnitProvisioningError,
} from '../services/serializedUnitProvisioningService';
import {
  provisionP2DraftTravelers,
  TravelerProvisioningError,
} from '../services/travelerProvisioningService';
import {
  provisionP2WorkOrders,
  WorkOrderProvisioningError,
} from '../services/workOrderProvisioningService';

const router = Router({ mergeParams: true });
const headerSchema = z.object({
  requirementSource: z.string().min(1),
  planningBasis: z.string().min(1),
  effectivityType: z
    .enum(['PO_REVISION', 'DATE', 'SERIAL_RANGE', 'LOT', 'PROJECT'])
    .optional(),
  effectivityReference: z.string().optional(),
  notes: z.string().nullable().optional(),
});
const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  signatureMeaning: z.string().min(1),
  reason: z.string().optional().default(''),
});
const launchSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    expectedPreviewDigest: z.string().regex(/^[0-9a-f]{64}$/),
    signatureMeaning: z.string().trim().min(1).max(500),
  })
  .strict();
const executionAuthorizationSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    expectedLaunchDigest: z.string().regex(/^[0-9a-f]{64}$/),
    signatureMeaning: z.string().trim().min(1).max(500),
  })
  .strict();
const productionOrderProvisioningSchema = executionAuthorizationSchema;
const serializedUnitProvisioningSchema = executionAuthorizationSchema;
const travelerProvisioningSchema = executionAuthorizationSchema;
const workOrderProvisioningSchema = executionAuthorizationSchema;
const itemSchema = z
  .object({
    drawing_number: z.string().nullable().optional(),
    drawing_revision: z.string().nullable().optional(),
    specification_references: z.array(z.unknown()).optional(),
    routing_requirement: z
      .enum(['REQUIRED', 'NOT_REQUIRED_APPROVED'])
      .nullable()
      .optional(),
    routing_not_required_reason: z.string().nullable().optional(),
    traveler_requirement: z
      .enum(['REQUIRED', 'NOT_REQUIRED_APPROVED'])
      .nullable()
      .optional(),
    traveler_type: z.enum(['INDIVIDUAL', 'BATCH', 'LOT']).nullable().optional(),
    traveler_not_required_reason: z.string().nullable().optional(),
    work_instruction_requirement: z
      .enum(['REQUIRED', 'DRAWING_SPEC_SUFFICIENT', 'NOT_REQUIRED_APPROVED'])
      .nullable()
      .optional(),
    work_instruction_basis: z.string().nullable().optional(),
    work_instruction_references: z.array(z.unknown()).optional(),
    specification_sheet_requirement: z
      .enum(['REQUIRED', 'NOT_REQUIRED_APPROVED'])
      .nullable()
      .optional(),
    inspection_requirement: z
      .enum(['REQUIRED', 'NOT_REQUIRED_APPROVED'])
      .nullable()
      .optional(),
    in_process_inspection_required: z.boolean().nullable().optional(),
    final_inspection_required: z.boolean().nullable().optional(),
    inspection_extent: z
      .enum([
        'ONE_HUNDRED_PERCENT',
        'APPROVED_SAMPLING',
        'FINAL_ONLY',
        'IN_PROCESS_AND_FINAL',
      ])
      .nullable()
      .optional(),
    sampling_plan_id: z.string().nullable().optional(),
    sampling_plan_status: z.string().nullable().optional(),
    fai_requirement: z
      .enum(['FULL', 'PARTIAL', 'NOT_REQUIRED'])
      .nullable()
      .optional(),
    fai_reason: z.string().nullable().optional(),
    traceability_level: z
      .enum(['SERIAL', 'LOT', 'BATCH', 'STANDARD'])
      .nullable()
      .optional(),
    serialization_required: z.boolean().nullable().optional(),
    lot_traceability_required: z.boolean().nullable().optional(),
    special_process_source: z
      .enum(['INTERNAL', 'EXTERNAL_APPROVED_SUPPLIER', 'NONE'])
      .nullable()
      .optional(),
    special_process_requirements: z.array(z.unknown()).optional(),
    required_certifications: z.array(z.unknown()).optional(),
    required_test_records: z.array(z.unknown()).optional(),
    tooling_requirements: z.array(z.unknown()).optional(),
    cnc_program_requirements: z.array(z.unknown()).optional(),
    packaging_instruction_requirement: z
      .enum(['REQUIRED', 'NOT_REQUIRED_APPROVED'])
      .nullable()
      .optional(),
    packaging_instruction_reference: z.string().nullable().optional(),
    requirement_source: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

function actor(req: Request): PlanningActor {
  if (!req.user?.id || !req.user?.username || !req.user?.role)
    throw new ProjectProductionPlanningError(
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
async function requireCapability(req: Request, key: string) {
  const value = actor(req);
  const { permissionSet } = await getUserPermissions(value.userId, value.role);
  if (!permissionSet.has(key))
    throw new ProjectProductionPlanningError(
      'FORBIDDEN',
      `The ${key} capability is required.`,
      403
    );
  return value;
}
function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof ProjectProductionPlanningError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  if (error instanceof ProductionExecutionAuthorizationError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  if (error instanceof ProductionOrderProvisioningError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  if (error instanceof SerializedUnitProvisioningError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  if (error instanceof TravelerProvisioningError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  if (error instanceof WorkOrderProvisioningError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  console.error('P2 V2 Production Planning error:', error);
  return res.status(500).json({
    error: 'PRODUCTION_PLANNING_FAILED',
    message: 'Production Planning action failed.',
  });
}
const projectId = (req: Request) => String(req.params.id);

router.get('/', async (req, res) => {
  try {
    res.json(await getCurrentProductionPlan(projectId(req)));
  } catch (error) {
    fail(res, error);
  }
});
router.get('/launch-preview', async (req, res) => {
  try {
    await requireCapability(req, 'projects.production_planning.manage');
    res.json(await getProductionLaunchPreview(projectId(req)));
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
    const result = await persistProductionLaunch(
      projectId(req),
      launchSchema.parse(req.body),
      user
    );
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    fail(res, error);
  }
});
router.post('/launch/:launchId/authorize-execution', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_launch.launch'
    );
    const result = await authorizeProductionExecution(
      projectId(req),
      req.params.launchId,
      executionAuthorizationSchema.parse(req.body),
      user
    );
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    fail(res, error);
  }
});
router.post('/launch/:launchId/provision-p2-orders', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_launch.launch'
    );
    const result = await provisionP2ProductionOrders(
      projectId(req),
      req.params.launchId,
      productionOrderProvisioningSchema.parse(req.body),
      user
    );
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    fail(res, error);
  }
});
router.post(
  '/launch/:launchId/provision-serialized-units',
  async (req, res) => {
    try {
      const user = await requireCapability(
        req,
        'projects.production_launch.launch'
      );
      const result = await provisionP2SerializedUnits(
        projectId(req),
        req.params.launchId,
        serializedUnitProvisioningSchema.parse(req.body),
        user
      );
      res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      fail(res, error);
    }
  }
);
router.post('/launch/:launchId/provision-draft-travelers', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_launch.launch'
    );
    const result = await provisionP2DraftTravelers(
      projectId(req),
      req.params.launchId,
      travelerProvisioningSchema.parse(req.body),
      user
    );
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    fail(res, error);
  }
});
router.post('/launch/:launchId/provision-work-orders', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_launch.launch'
    );
    const result = await provisionP2WorkOrders(
      projectId(req),
      req.params.launchId,
      workOrderProvisioningSchema.parse(req.body),
      user
    );
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    fail(res, error);
  }
});
router.post(
  '/launch/:launchId/create-manufacturing-work-orders',
  async (req, res) => {
    try {
      const user = await requireCapability(
        req,
        'projects.production_launch.launch'
      );
      const input = workOrderProvisioningSchema.parse(req.body);
      const sharedInput = {
        ...input,
        idempotencyKey: `manufacturing-work-orders:${req.params.launchId}`,
      };
      await authorizeProductionExecution(
        projectId(req),
        req.params.launchId,
        sharedInput,
        user
      );
      await provisionP2ProductionOrders(
        projectId(req),
        req.params.launchId,
        sharedInput,
        user
      );
      const result = await provisionP2WorkOrders(
        projectId(req),
        req.params.launchId,
        sharedInput,
        user
      );
      res.status(result.replayed ? 200 : 201).json({
        ...result,
        message: result.replayed
          ? 'Manufacturing work orders already exist.'
          : 'Manufacturing work orders created.',
      });
    } catch (error) {
      fail(res, error);
    }
  }
);
router.post('/', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_planning.manage'
    );
    res
      .status(201)
      .json(
        await createDraftFromCurrentConfiguration(
          projectId(req),
          headerSchema.parse(req.body),
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:planId/refresh', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_planning.manage'
    );
    res.json(await refreshDraft(projectId(req), req.params.planId, user));
  } catch (error) {
    fail(res, error);
  }
});
router.patch('/:planId/items/:itemId', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_planning.manage'
    );
    res.json(
      await updatePlanItemDecision(
        projectId(req),
        req.params.planId,
        req.params.itemId,
        itemSchema.parse(req.body),
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:planId/submit', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_planning.manage'
    );
    res.json(await submitForApproval(projectId(req), req.params.planId, user));
  } catch (error) {
    fail(res, error);
  }
});
for (const [path, key, handler] of [
  [
    'engineering-decision',
    'projects.production_planning.engineering_decide',
    recordEngineeringDecision,
  ],
  [
    'quality-decision',
    'projects.production_planning.quality_decide',
    recordQualityDecision,
  ],
  [
    'operations-decision',
    'projects.production_planning.operations_decide',
    recordOperationsDecision,
  ],
] as const) {
  router.post(`/:planId/${path}`, async (req, res) => {
    try {
      const user = await requireCapability(req, key);
      const body = decisionSchema.parse(req.body);
      res.json(
        await handler(
          projectId(req),
          req.params.planId,
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
router.post('/:planId/revise', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.production_planning.manage'
    );
    res
      .status(201)
      .json(
        await revisePlan(
          projectId(req),
          req.params.planId,
          headerSchema.parse(req.body),
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});

export default router;
