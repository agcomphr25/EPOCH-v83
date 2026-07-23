import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
import {
  completeTechnicalConfigurationReview,
  createTechnicalConfigurationReview,
  decideTechnicalConfigurationReview,
  getTechnicalConfigurationReview,
  ProjectTechnicalConfigurationReviewError,
  reviseTechnicalConfigurationReview,
  submitTechnicalConfigurationReview,
  updateTechnicalConfigurationDraft,
  type TechnicalReviewActor,
} from '../services/projectTechnicalConfigurationReviewService';

const router = Router({ mergeParams: true });
const evidenceSchema = z.object({
  recordType: z.enum([
    'CONTROLLED_DOCUMENT',
    'BOM_REVISION',
    'ENGINEERING_RELEASE',
  ]),
  recordId: z.string().min(1),
  revision: z.string().nullable().optional(),
  effectivity: z.string().nullable().optional(),
});
const partRequirementSchema = z.object({
  partNumber: z.string().min(1),
  quantity: z.number().positive(),
  drawingNumber: z.string().optional(),
  drawingRevision: z.string().optional(),
  specifications: z.array(z.unknown()).optional(),
  technicalDataException: z.string().optional(),
});
const baselineSchema = z
  .object({
    partRequirements: z.array(partRequirementSchema).optional(),
    configurationReferences: z.array(z.unknown()).optional(),
    qualityClauses: z.array(z.unknown()).optional(),
    specialRequirements: z.array(z.unknown()).optional(),
    keyCharacteristics: z.array(z.unknown()).optional(),
    criticalItems: z.array(z.unknown()).optional(),
    materialRequirements: z.array(z.unknown()).optional(),
    certificationRequirements: z.array(z.unknown()).optional(),
    testReportRequirements: z.array(z.unknown()).optional(),
    faiRequirements: z.array(z.unknown()).optional(),
    sourceInspectionRequirements: z.array(z.unknown()).optional(),
    specialProcesses: z.array(z.unknown()).optional(),
    traceabilityRequirements: z.array(z.unknown()).optional(),
    preservationPackagingRequirements: z.array(z.unknown()).optional(),
    acceptanceCriteria: z.array(z.unknown()).optional(),
    counterfeitPreventionRequirements: z.array(z.unknown()).optional(),
    customerProperty: z.array(z.unknown()).optional(),
    regulatoryRequirements: z.array(z.unknown()).optional(),
    deviationsWaivers: z.array(z.unknown()).optional(),
  })
  .passthrough();
const reviewSchema = z.object({
  technicalBaseline: baselineSchema,
  releasedEvidence: z.array(evidenceSchema).optional(),
  conflicts: z
    .array(
      z.object({
        description: z.string().min(1),
        resolution: z.string().optional(),
        resolved: z.boolean().optional(),
      })
    )
    .optional(),
  missingInformation: z.array(z.unknown()).optional(),
  risks: z
    .array(
      z.object({
        description: z.string().min(1),
        owner: z.string().min(1),
        control: z.string().min(1),
      })
    )
    .optional(),
  sufficientlyDefined: z.boolean().optional(),
  supplyChainRequired: z.boolean().optional(),
  effectivityReference: z.string().min(1),
});
const revisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
});
const decisionSchema = revisionSchema.extend({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  signatureMeaning: z.string().min(1),
  reason: z.string().optional().default(''),
});

function actor(req: Request): TechnicalReviewActor {
  if (!req.user?.id || !req.user.username || !req.user.role)
    throw new ProjectTechnicalConfigurationReviewError(
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
    throw new ProjectTechnicalConfigurationReviewError(
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
  if (error instanceof ProjectTechnicalConfigurationReviewError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  console.error('P2 V2 Technical & Configuration Review error:', error);
  return res.status(500).json({
    error: 'TECHNICAL_CONFIGURATION_REVIEW_FAILED',
    message: 'Technical & Configuration Review action failed.',
  });
}
const projectId = (req: Request) => String(req.params.id);

router.get('/', async (req, res) => {
  try {
    res.json(await getTechnicalConfigurationReview(projectId(req)));
  } catch (error) {
    fail(res, error);
  }
});
router.get('/history', async (req, res) => {
  try {
    const model = await getTechnicalConfigurationReview(projectId(req));
    res.json({
      history: model.history,
      approvals: model.approvals,
      readiness: model.readiness,
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.technical_configuration.manage'
    );
    res
      .status(201)
      .json(
        await createTechnicalConfigurationReview(
          projectId(req),
          reviewSchema.parse(req.body),
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.patch('/:reviewId', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.technical_configuration.manage'
    );
    const body = reviewSchema.and(revisionSchema).parse(req.body);
    res.json(
      await updateTechnicalConfigurationDraft(
        projectId(req),
        req.params.reviewId,
        body.expectedRevision,
        body,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:reviewId/submit', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.technical_configuration.manage'
    );
    const body = revisionSchema.parse(req.body);
    res.json(
      await submitTechnicalConfigurationReview(
        projectId(req),
        req.params.reviewId,
        body.expectedRevision,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
const decisions = [
  ['pm', 'PROJECT_MANAGEMENT', 'projects.technical_configuration.pm_decide'],
  [
    'engineering',
    'ENGINEERING',
    'projects.technical_configuration.engineering_decide',
  ],
  ['quality', 'QUALITY', 'projects.technical_configuration.quality_decide'],
  [
    'operations',
    'OPERATIONS',
    'projects.technical_configuration.operations_decide',
  ],
  [
    'supply-chain',
    'SUPPLY_CHAIN',
    'projects.technical_configuration.supply_chain_decide',
  ],
] as const;
for (const [path, capacity, capability] of decisions) {
  router.post(`/:reviewId/${path}-decision`, async (req, res) => {
    try {
      const user = await requireCapability(req, capability);
      const body = decisionSchema.parse(req.body);
      res.json(
        await decideTechnicalConfigurationReview(
          projectId(req),
          req.params.reviewId,
          body.expectedRevision,
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
    const user = await requireCapability(
      req,
      'projects.technical_configuration.manage'
    );
    const body = revisionSchema.parse(req.body);
    res.json(
      await completeTechnicalConfigurationReview(
        projectId(req),
        req.params.reviewId,
        body.expectedRevision,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:reviewId/revise', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.technical_configuration.manage'
    );
    const body = reviewSchema.and(revisionSchema).parse(req.body);
    res
      .status(201)
      .json(
        await reviseTechnicalConfigurationReview(
          projectId(req),
          req.params.reviewId,
          body.expectedRevision,
          body,
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});

export default router;
