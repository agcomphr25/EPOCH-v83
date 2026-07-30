import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
import {
  addPilotEvidenceManifest,
  authorizePilot,
  closePilotIssue,
  createPilotDraft,
  decidePilotApproval,
  getPilotDashboard,
  PILOT_EVIDENCE_CATEGORIES,
  PILOT_READINESS_KEYS,
  PILOT_TRAINING_TOPICS,
  ProjectPilotControlError,
  recordPilotIssue,
  recordReadinessEvidence,
  recordTrainingAcknowledgment,
  submitPilotForApproval,
  transitionPilot,
  type PilotActor,
} from '../services/projectPilotControlService';

const router = Router({ mergeParams: true });
const expected = z.object({ expectedLockVersion: z.number().int().positive() });
const actionEvidence = expected.extend({
  meaning: z.string().min(1),
  reason: z.string().min(1),
  idempotencyKey: z.string().min(8).max(200),
});

const draft = z.object({
  environment: z.string().min(1),
  workflowInstanceId: z.string().uuid(),
  customerPoId: z.number().int().positive(),
  customerPoNumber: z.string().min(1),
  approvedPoLines: z
    .array(
      z.object({
        poLineId: z.number().int().positive(),
        partNumber: z.string().min(1),
        maximumQuantity: z.number().positive(),
      })
    )
    .min(1),
  configurationBaselineRevision: z.string().min(1),
  productionPlanRevision: z.number().int().positive(),
  wadRevision: z.number().int().positive(),
  authorizedParticipants: z
    .array(
      z.object({
        userId: z.number().int().positive(),
        functionalRole: z.string().min(1),
      })
    )
    .min(1),
  qualityApproverUserId: z.number().int().positive(),
  operationsApproverUserId: z.number().int().positive(),
  projectManagementApproverUserId: z.number().int().positive(),
  rolloutOwnerUserId: z.number().int().positive(),
  pilotStartDate: z.string().date(),
  reviewExpiresAt: z.string().datetime(),
  rollbackOwnerUserId: z.number().int().positive(),
  rollbackPlanReference: z.string().min(1),
  risksAndMitigations: z
    .array(
      z.object({
        risk: z.string().min(1),
        mitigation: z.string().min(1),
        ownerUserId: z.number().int().positive(),
      })
    )
    .min(1),
});

function actor(req: Request): PilotActor {
  if (!req.user?.id || !req.user.username || !req.user.role)
    throw new ProjectPilotControlError(
      'ACTOR_REQUIRED',
      'Authenticated pilot actor identity is required.',
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
    throw new ProjectPilotControlError(
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
  if (error instanceof ProjectPilotControlError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message, ...error.details });
  console.error('P2 V2 pilot control error:', error);
  return res.status(500).json({
    error: 'PILOT_CONTROL_ACTION_FAILED',
    message: 'The controlled-pilot action failed.',
  });
}

const projectId = (req: Request) => String(req.params.id);

router.get('/', async (req, res) => {
  try {
    await authorized(req, 'projects.pilot_v2.view');
    res.json(await getPilotDashboard(projectId(req)));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/framework', async (req, res) => {
  try {
    await authorized(req, 'projects.pilot_v2.view');
    res.json({
      states: [
        'DRAFT',
        'PENDING_READINESS',
        'PENDING_APPROVAL',
        'AUTHORIZED',
        'ACTIVE',
        'PAUSED',
        'COMPLETED',
        'CANCELLED',
        'EXPIRED',
      ],
      readinessKeys: PILOT_READINESS_KEYS,
      trainingTopics: PILOT_TRAINING_TOPICS,
      evidenceCategories: PILOT_EVIDENCE_CATEGORIES,
      activationBoundary: 'Pilot activation awaiting authorization',
    });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/', async (req, res) => {
  try {
    res
      .status(201)
      .json(
        await createPilotDraft(
          projectId(req),
          draft.parse(req.body),
          await authorized(req, 'projects.pilot_v2.manage')
        )
      );
  } catch (error) {
    fail(res, error);
  }
});

router.put('/readiness-evidence', async (req, res) => {
  try {
    const body = expected
      .extend({
        entries: z.array(
          z.object({
            checklistKey: z.enum(PILOT_READINESS_KEYS),
            status: z.enum([
              'CURRENT',
              'MISSING',
              'STALE',
              'REJECTED',
              'SUPERSEDED',
              'INCONSISTENT',
            ]),
            authoritativeRecordType: z.string().min(1),
            authoritativeRecordId: z.string().min(1),
            authoritativeRevision: z.string().min(1),
            evidenceReference: z.string().min(1),
            responsibleFunction: z.string().min(1),
            correctionLocation: z.string().min(1),
            explanation: z.string().min(1),
          })
        ),
      })
      .parse(req.body);
    res.json(
      await recordReadinessEvidence(
        projectId(req),
        body.entries,
        body.expectedLockVersion,
        await authorized(req, 'projects.pilot_v2.manage')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});

router.post('/training-acknowledgments', async (req, res) => {
  try {
    const body = z
      .object({
        userId: z.number().int().positive(),
        functionalRole: z.string().min(1),
        trainingVersion: z.string().min(1),
        completedAt: z.string().datetime(),
        expiresAt: z.string().datetime().optional(),
        trainerUserId: z.number().int().positive(),
        acknowledgmentMeaning: z.string().min(1),
        evidenceReference: z.string().min(1),
        topics: z.array(z.enum(PILOT_TRAINING_TOPICS)),
      })
      .parse(req.body);
    res
      .status(201)
      .json(
        await recordTrainingAcknowledgment(
          projectId(req),
          body,
          await authorized(req, 'projects.pilot_v2.training_record')
        )
      );
  } catch (error) {
    fail(res, error);
  }
});

router.post('/submit', async (req, res) => {
  try {
    const body = expected.parse(req.body);
    res.json(
      await submitPilotForApproval(
        projectId(req),
        body.expectedLockVersion,
        await authorized(req, 'projects.pilot_v2.manage')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});

for (const [path, type, capability] of [
  ['quality', 'QUALITY', 'projects.pilot_v2.quality_approve'],
  ['operations', 'OPERATIONS', 'projects.pilot_v2.operations_approve'],
  ['project-management', 'PROJECT_MANAGEMENT', 'projects.pilot_v2.pm_approve'],
  ['rollout-owner', 'ROLLOUT_OWNER', 'projects.pilot_v2.rollout_approve'],
] as const) {
  router.post(`/approvals/${path}`, async (req, res) => {
    try {
      const body = z
        .object({
          decision: z.enum(['APPROVED', 'REJECTED', 'RETURNED']),
          signatureMeaning: z.string().min(1),
          evidenceReference: z.string().min(1),
        })
        .parse(req.body);
      res.json(
        await decidePilotApproval(
          projectId(req),
          type,
          body,
          await authorized(req, capability)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  });
}

router.post('/authorize', async (req, res) => {
  try {
    const body = expected.parse(req.body);
    res.json(
      await authorizePilot(
        projectId(req),
        body.expectedLockVersion,
        await authorized(req, 'projects.pilot_v2.rollout_approve')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});

for (const [path, next, capability] of [
  ['activate', 'ACTIVE', 'projects.pilot_v2.rollout_approve'],
  ['pause', 'PAUSED', 'projects.pilot_v2.issue_manage'],
  ['complete', 'COMPLETED', 'projects.pilot_v2.rollout_approve'],
  ['cancel', 'CANCELLED', 'projects.pilot_v2.rollout_approve'],
  ['expire', 'EXPIRED', 'projects.pilot_v2.rollout_approve'],
] as const) {
  router.post(`/${path}`, async (req, res) => {
    try {
      res.json(
        await transitionPilot(
          projectId(req),
          next,
          actionEvidence.parse(req.body),
          await authorized(req, capability)
        )
      );
    } catch (error) {
      fail(res, error);
    }
  });
}

router.post('/issues', async (req, res) => {
  try {
    const body = z
      .object({
        workflowStage: z.string().min(1),
        severity: z.enum(['CRITICAL', 'MAJOR', 'MINOR']),
        category: z.enum([
          'COMPLIANCE_PRODUCT_SAFETY',
          'WORKFLOW_BLOCKER',
          'USABILITY',
          'TRAINING',
          'DATA_CONFIGURATION',
          'EXISTING_UNRELATED_DEFECT',
        ]),
        description: z.string().min(1),
        affectedRecordType: z.string().min(1),
        affectedRecordId: z.string().min(1),
        affectedRevision: z.string().min(1),
        containment: z.string().min(1),
        ownerUserId: z.number().int().positive(),
      })
      .parse(req.body);
    res
      .status(201)
      .json(
        await recordPilotIssue(
          projectId(req),
          body,
          await authorized(req, 'projects.pilot_v2.issue_manage')
        )
      );
  } catch (error) {
    fail(res, error);
  }
});

router.post('/issues/:issueId/close', async (req, res) => {
  try {
    const body = z
      .object({
        rootCause: z.string().min(1),
        correctiveAction: z.string().min(1),
        retestEvidence: z.string().min(1),
      })
      .parse(req.body);
    res.json(
      await closePilotIssue(
        projectId(req),
        req.params.issueId,
        body,
        await authorized(req, 'projects.pilot_v2.issue_manage')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});

router.post('/evidence-manifest', async (req, res) => {
  try {
    const body = z
      .object({
        entries: z.array(
          z.object({
            category: z.enum(PILOT_EVIDENCE_CATEGORIES),
            authoritativeRecordType: z.string().min(1),
            authoritativeRecordId: z.string().min(1),
            authoritativeRevision: z.string().min(1),
            evidenceReference: z.string().min(1),
            immutableHash: z.string().optional(),
          })
        ),
      })
      .parse(req.body);
    res.json(
      await addPilotEvidenceManifest(
        projectId(req),
        body.entries,
        await authorized(req, 'projects.pilot_v2.manage')
      )
    );
  } catch (error) {
    fail(res, error);
  }
});

export default router;
