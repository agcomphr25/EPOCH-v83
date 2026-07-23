import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
import {
  completeCommercialReview,
  createCommercialReview,
  decideCommercialReview,
  getCommercialReview,
  ProjectCommercialReviewError,
  reviseCommercialReview,
  submitCommercialReview,
  updateCommercialDraft,
  type CommercialActor,
} from '../services/projectCommercialReviewService';

const router = Router({ mergeParams: true });
const stages = z.enum([
  'rfq_risk_assessment',
  'estimate_quote',
  'contract_review',
]);
const differenceSchema = z.object({
  description: z.string().min(1),
  resolution: z.string().optional(),
  resolved: z.boolean().optional(),
});
const draftSchema = z.object({
  sourceRecordType: z.string().min(1),
  sourceRecordId: z.string().min(1),
  secondarySourceId: z.string().nullable().optional(),
  requirements: z.record(z.unknown()).optional(),
  assumptions: z.array(z.unknown()).optional(),
  exclusions: z.array(z.unknown()).optional(),
  differences: z.array(differenceSchema).optional(),
  risks: z
    .array(
      z.object({
        description: z.string().min(1),
        owner: z.string().min(1),
        control: z.string().min(1),
      })
    )
    .optional(),
  unresolvedInformationRequests: z.array(z.unknown()).optional(),
  sufficientlyDefined: z.boolean().optional(),
  differencesResolved: z.boolean().optional(),
  effectivityReference: z.string().nullable().optional(),
  financeRequired: z.boolean().optional(),
});
const revisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
});
const decisionSchema = revisionSchema.extend({
  decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
  signatureMeaning: z.string().min(1),
  reason: z.string().optional().default(''),
});

function actor(req: Request): CommercialActor {
  if (!req.user?.id || !req.user?.username || !req.user?.role)
    throw new ProjectCommercialReviewError(
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
    throw new ProjectCommercialReviewError(
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
  if (error instanceof ProjectCommercialReviewError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  console.error('P2 V2 commercial review error:', error);
  return res.status(500).json({
    error: 'COMMERCIAL_REVIEW_FAILED',
    message: 'Commercial review action failed.',
  });
}
const projectId = (req: Request) => String(req.params.id);
const stage = (req: Request) => stages.parse(req.params.stage);

router.get('/:stage', async (req, res) => {
  try {
    res.json(await getCommercialReview(projectId(req), stage(req)));
  } catch (error) {
    fail(res, error);
  }
});
router.get('/:stage/history', async (req, res) => {
  try {
    const model = await getCommercialReview(projectId(req), stage(req));
    res.json({
      history: model.history,
      approvals: model.approvals,
      readiness: model.readiness,
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:stage', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.commercial_review.manage'
    );
    res
      .status(201)
      .json(
        await createCommercialReview(
          projectId(req),
          stage(req),
          draftSchema.parse(req.body),
          user
        )
      );
  } catch (error) {
    fail(res, error);
  }
});
router.patch('/:stage/:reviewId', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.commercial_review.manage'
    );
    const body = draftSchema.and(revisionSchema).parse(req.body) as z.infer<
      typeof draftSchema
    > & {
      expectedRevision: number;
    };
    res.json(
      await updateCommercialDraft(
        projectId(req),
        stage(req),
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
router.post('/:stage/:reviewId/submit', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.commercial_review.manage'
    );
    const body = revisionSchema.parse(req.body);
    res.json(
      await submitCommercialReview(
        projectId(req),
        stage(req),
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
  ['pm', 'PROJECT_MANAGEMENT', 'projects.commercial_review.pm_decide'],
  [
    'engineering',
    'ENGINEERING',
    'projects.commercial_review.engineering_decide',
  ],
  ['quality', 'QUALITY', 'projects.commercial_review.quality_decide'],
  ['operations', 'OPERATIONS', 'projects.commercial_review.operations_decide'],
  ['finance', 'FINANCE', 'projects.commercial_review.finance_decide'],
] as const;
for (const [path, capacity, capability] of decisions) {
  router.post(`/:stage/:reviewId/${path}-decision`, async (req, res) => {
    try {
      const user = await requireCapability(req, capability);
      const body = decisionSchema.parse(req.body);
      res.json(
        await decideCommercialReview(
          projectId(req),
          stage(req),
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
router.post('/:stage/:reviewId/complete', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.commercial_review.manage'
    );
    const body = revisionSchema.parse(req.body);
    res.json(
      await completeCommercialReview(
        projectId(req),
        stage(req),
        req.params.reviewId,
        body.expectedRevision,
        user
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
router.post('/:stage/:reviewId/revise', async (req, res) => {
  try {
    const user = await requireCapability(
      req,
      'projects.commercial_review.manage'
    );
    const body = draftSchema.and(revisionSchema).parse(req.body) as z.infer<
      typeof draftSchema
    > & {
      expectedRevision: number;
    };
    res
      .status(201)
      .json(
        await reviseCommercialReview(
          projectId(req),
          stage(req),
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
