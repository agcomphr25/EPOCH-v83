import { Router, type Request, type Response } from 'express';

import {
  requireAnyPermission,
  requirePermission,
} from '../../middleware/requirePermission';
import {
  structuredActorFromRequest,
  sendDesignControlStructuredError,
} from '../middleware/designControlProjectAccess';
import { DESIGN_CONTROL_AUTHORIZATION } from '../designControlAuthorization';
import {
  activateProjectAssignmentPolicy,
  addProjectAssignment,
  closeReviewAction,
  createReviewAction,
  createStructuredLink,
  createStructuredRecord,
  decideStructuredRecord,
  DesignControlStructuredError,
  getStructuredHistory,
  listProjectAssignments,
  listStructuredRecords,
  revokeProjectAssignment,
  reviseStructuredRecord,
  saveStructuredDraft,
  STRUCTURED_RECORD_TYPES,
  submitStructuredRecord,
  type StructuredRecordType,
} from '../services/designControlStructuredLifecycleService';
import {
  addFinalReviewException,
  calculateDesignControlTraceability,
  calculateFinalDesignReviewReadiness,
  createFinalDesignReviewSnapshot,
} from '../services/designControlTraceabilityService';

const router = Router({ mergeParams: true });
const requireView = requireAnyPermission(
  DESIGN_CONTROL_AUTHORIZATION.designControlView
);

function recordId(req: Request) {
  return String(req.params.id);
}

function typeFrom(value: string): StructuredRecordType {
  const normalized = value.toUpperCase() as StructuredRecordType;
  if (!STRUCTURED_RECORD_TYPES.includes(normalized)) {
    throw new DesignControlStructuredError(
      400,
      'INVALID_STRUCTURED_RECORD_TYPE',
      'Unsupported structured Design Control record type'
    );
  }
  return normalized;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function route(
  handler: (req: Request, res: Response) => Promise<void>,
  fallback: string
) {
  return async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendDesignControlStructuredError(res, error, fallback);
    }
  };
}

router.get(
  '/structured/:type',
  requireView,
  route(async (req, res) => {
    res.json({
      records: await listStructuredRecords(
        recordId(req),
        typeFrom(req.params.type),
        await structuredActorFromRequest(req)
      ),
    });
  }, 'Failed to load structured Design Control records')
);

router.post(
  '/structured/:type',
  requirePermission('design.control.edit'),
  route(async (req, res) => {
    const result = await createStructuredRecord({
      recordId: recordId(req),
      type: typeFrom(req.params.type),
      content: object(req.body?.content),
      changeReason:
        typeof req.body?.changeReason === 'string'
          ? req.body.changeReason
          : 'Initial draft',
      actor: await structuredActorFromRequest(req),
    });
    res.status(201).json(result);
  }, 'Failed to create structured Design Control record')
);

router.patch(
  '/structured/:type/:itemId',
  requirePermission('design.control.edit'),
  route(async (req, res) => {
    res.json(
      await saveStructuredDraft({
        recordId: recordId(req),
        type: typeFrom(req.params.type),
        itemId: req.params.itemId,
        expectedVersion: Number(req.body?.expectedVersion),
        content: object(req.body?.content),
        changeReason:
          typeof req.body?.changeReason === 'string'
            ? req.body.changeReason
            : 'Draft updated',
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to save structured Design Control draft')
);

router.post(
  '/structured/:type/:itemId/submit',
  requirePermission('design.control.submit'),
  route(async (req, res) => {
    res.json(
      await submitStructuredRecord({
        recordId: recordId(req),
        type: typeFrom(req.params.type),
        itemId: req.params.itemId,
        expectedVersion: Number(req.body?.expectedVersion),
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to submit structured Design Control record')
);

router.post(
  '/structured/:type/:itemId/decision',
  requirePermission('design.control.approve'),
  route(async (req, res) => {
    const decision = String(req.body?.decision ?? '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'RETURNED'].includes(decision))
      throw new DesignControlStructuredError(
        400,
        'INVALID_DECISION',
        'Decision must be approved, rejected, or returned'
      );
    res.json(
      await decideStructuredRecord({
        recordId: recordId(req),
        type: typeFrom(req.params.type),
        itemId: req.params.itemId,
        versionId: String(req.body?.versionId ?? ''),
        decision: decision as 'APPROVED' | 'REJECTED' | 'RETURNED',
        comment:
          typeof req.body?.comment === 'string' ? req.body.comment : undefined,
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to decide structured Design Control record')
);

router.post(
  '/structured/:type/:itemId/revise',
  requirePermission('design.control.edit'),
  route(async (req, res) => {
    res.json(
      await reviseStructuredRecord({
        recordId: recordId(req),
        type: typeFrom(req.params.type),
        itemId: req.params.itemId,
        expectedVersion: Number(req.body?.expectedVersion),
        changeReason: String(req.body?.changeReason ?? ''),
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to revise structured Design Control record')
);

router.get(
  '/structured/:type/:itemId/history',
  requireView,
  route(async (req, res) => {
    res.json(
      await getStructuredHistory(
        recordId(req),
        typeFrom(req.params.type),
        req.params.itemId,
        await structuredActorFromRequest(req)
      )
    );
  }, 'Failed to load structured Design Control history')
);

router.post(
  '/structured/:type/:itemId/links',
  requirePermission('design.control.edit'),
  route(async (req, res) => {
    res.status(201).json(
      await createStructuredLink({
        recordId: recordId(req),
        type: typeFrom(req.params.type),
        itemId: req.params.itemId,
        targetType: String(req.body?.targetType ?? '').toUpperCase(),
        targetId: String(req.body?.targetId ?? ''),
        relationType: String(
          req.body?.relationType ?? 'TRACES_TO'
        ).toUpperCase(),
        targetRevision:
          typeof req.body?.targetRevision === 'string'
            ? req.body.targetRevision
            : undefined,
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to create authoritative traceability link')
);

router.post(
  '/reviews/:reviewId/actions',
  requirePermission('design.control.edit'),
  route(async (req, res) => {
    res.status(201).json(
      await createReviewAction({
        recordId: recordId(req),
        reviewId: req.params.reviewId,
        actionNumber: String(req.body?.actionNumber ?? ''),
        description: String(req.body?.description ?? ''),
        ownerUserId: Number.isInteger(req.body?.ownerUserId)
          ? req.body.ownerUserId
          : undefined,
        ownerDisplayName: String(req.body?.ownerDisplayName ?? ''),
        dueDate: String(req.body?.dueDate ?? ''),
        mandatory: req.body?.mandatory !== false,
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to create Design Review action')
);

router.post(
  '/review-actions/:actionId/close',
  requirePermission('design.control.approve'),
  route(async (req, res) => {
    res.json(
      await closeReviewAction({
        recordId: recordId(req),
        actionId: req.params.actionId,
        expectedVersion: Number(req.body?.expectedVersion),
        closureEvidence: object(req.body?.closureEvidence),
        excepted: req.body?.excepted === true,
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to close Design Review action')
);

router.get(
  '/project-team',
  requireView,
  route(async (req, res) => {
    res.json(
      await listProjectAssignments(
        recordId(req),
        await structuredActorFromRequest(req)
      )
    );
  }, 'Failed to load Design Control project team')
);

router.post(
  '/project-team/activate',
  requirePermission('design.control.admin'),
  route(async (req, res) => {
    res.status(201).json(
      await activateProjectAssignmentPolicy({
        recordId: recordId(req),
        actor: await structuredActorFromRequest(req),
        reason: String(req.body?.reason ?? ''),
      })
    );
  }, 'Failed to activate Design Control project assignments')
);

router.post(
  '/project-team/assignments',
  requirePermission('design.control.admin'),
  route(async (req, res) => {
    res.status(201).json(
      await addProjectAssignment({
        recordId: recordId(req),
        userId: Number(req.body?.userId),
        projectRole: String(req.body?.projectRole ?? ''),
        responsibilityClass: String(req.body?.responsibilityClass ?? ''),
        capabilities: Array.isArray(req.body?.capabilities)
          ? req.body.capabilities.map(String)
          : [],
        effectiveAt:
          typeof req.body?.effectiveAt === 'string'
            ? req.body.effectiveAt
            : undefined,
        reason: String(req.body?.reason ?? ''),
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to add Design Control project assignment')
);

router.post(
  '/project-team/assignments/:assignmentId/revoke',
  requirePermission('design.control.admin'),
  route(async (req, res) => {
    res.json(
      await revokeProjectAssignment({
        recordId: recordId(req),
        assignmentId: req.params.assignmentId,
        expectedVersion: Number(req.body?.expectedVersion),
        reason: String(req.body?.reason ?? ''),
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to revoke Design Control project assignment')
);

router.get(
  '/traceability',
  requireView,
  route(async (req, res) => {
    res.json(
      await calculateDesignControlTraceability(
        recordId(req),
        await structuredActorFromRequest(req)
      )
    );
  }, 'Failed to calculate Design Control traceability')
);

router.get(
  '/final-review/readiness',
  requireView,
  route(async (req, res) => {
    res.json(
      await calculateFinalDesignReviewReadiness(
        recordId(req),
        await structuredActorFromRequest(req)
      )
    );
  }, 'Failed to calculate Final Design Review readiness')
);

router.post(
  '/final-review/exceptions',
  requirePermission('design.control.approve'),
  route(async (req, res) => {
    res.status(201).json(
      await addFinalReviewException({
        recordId: recordId(req),
        requirementKey: String(req.body?.requirementKey ?? ''),
        justification: String(req.body?.justification ?? ''),
        risk: String(req.body?.risk ?? ''),
        effectiveAt: String(req.body?.effectiveAt ?? ''),
        expiresAt:
          typeof req.body?.expiresAt === 'string'
            ? req.body.expiresAt
            : undefined,
        followUpAction:
          typeof req.body?.followUpAction === 'string'
            ? req.body.followUpAction
            : undefined,
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to approve Final Design Review exception')
);

router.post(
  '/final-review/snapshot',
  requirePermission('design.control.approve'),
  route(async (req, res) => {
    res.status(201).json(
      await createFinalDesignReviewSnapshot({
        recordId: recordId(req),
        reviewRecordId: String(req.body?.reviewRecordId ?? ''),
        reviewVersionId: String(req.body?.reviewVersionId ?? ''),
        actor: await structuredActorFromRequest(req),
      })
    );
  }, 'Failed to lock Final Design Review snapshot')
);

export default router;
