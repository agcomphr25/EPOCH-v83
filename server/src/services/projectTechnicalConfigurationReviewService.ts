import { createHash } from 'crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  jsonValuesEqual,
  recordAuditEvent,
  type AuditLedgerTx,
  type JsonValue,
} from './auditLedgerService';
import { evaluateCommercialBaseline } from './projectCommercialReviewService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';
import { validateWorkflowInstanceIntegrity } from './projectWorkflowInstanceIntegrity';

type Executor = AuditLedgerTx;
// Additive raw-query rows avoid expanding the central schema surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type TechnicalReviewActor = {
  userId: number;
  employeeId?: number | null;
  username: string;
  displayName: string;
  role: string;
};
export type TechnicalEvidence = {
  recordType: 'CONTROLLED_DOCUMENT' | 'BOM_REVISION' | 'ENGINEERING_RELEASE';
  recordId: string;
  revision?: string | null;
  effectivity?: string | null;
};
export type TechnicalReviewInput = {
  technicalBaseline: {
    partRequirements?: Array<{
      partNumber?: string;
      quantity?: number;
      drawingNumber?: string;
      drawingRevision?: string;
      specifications?: unknown[];
      technicalDataException?: string;
    }>;
    configurationReferences?: unknown[];
    qualityClauses?: unknown[];
    specialRequirements?: unknown[];
    keyCharacteristics?: unknown[];
    criticalItems?: unknown[];
    materialRequirements?: unknown[];
    certificationRequirements?: unknown[];
    testReportRequirements?: unknown[];
    faiRequirements?: unknown[];
    sourceInspectionRequirements?: unknown[];
    specialProcesses?: unknown[];
    traceabilityRequirements?: unknown[];
    preservationPackagingRequirements?: unknown[];
    acceptanceCriteria?: unknown[];
    counterfeitPreventionRequirements?: unknown[];
    customerProperty?: unknown[];
    regulatoryRequirements?: unknown[];
    deviationsWaivers?: unknown[];
  };
  releasedEvidence?: TechnicalEvidence[];
  conflicts?: Array<{
    description?: string;
    resolution?: string;
    resolved?: boolean;
  }>;
  missingInformation?: unknown[];
  risks?: Array<{ description?: string; owner?: string; control?: string }>;
  sufficientlyDefined?: boolean;
  supplyChainRequired?: boolean;
  effectivityReference: string;
};
export class ProjectTechnicalConfigurationReviewError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}
const rows = <T extends Row>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : ((value as { rows?: T[] } | null)?.rows ?? []);
const clean = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const technicalSnapshotForComparison = (value: Row) => {
  const { status: _status, updated_at: _updatedAt, ...po } = value?.po ?? {};
  return { ...value, po } as JsonValue;
};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function context(
  projectId: string,
  tx: Executor,
  lock = false,
  requirePredecessors = true
) {
  const project = rows(
    await tx.execute(
      sql`SELECT id,workflow_version,po_id FROM projects WHERE id=${projectId} ${lock ? sql`FOR UPDATE` : sql``}`
    )
  )[0];
  if (!project)
    throw new ProjectTechnicalConfigurationReviewError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  let workflowVersion: ReturnType<typeof resolveProjectWorkflowVersion>;
  try {
    workflowVersion = resolveProjectWorkflowVersion(project.workflow_version);
  } catch {
    throw new ProjectTechnicalConfigurationReviewError(
      'UNKNOWN_WORKFLOW_VERSION',
      'The project workflow version is not recognized.',
      409
    );
  }
  if (workflowVersion !== 'p2_v2')
    throw new ProjectTechnicalConfigurationReviewError(
      'P2_V2_REQUIRED',
      'Technical & Configuration Review requires an explicit p2_v2 project.',
      409,
      { effectiveWorkflowVersion: workflowVersion }
    );
  const instances = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_instances WHERE project_id=${projectId} AND workflow_version='p2_v2' AND status NOT IN ('SUPERSEDED','CANCELLED') ${lock ? sql`FOR UPDATE` : sql``}`
    )
  );
  if (instances.length !== 1)
    throw new ProjectTechnicalConfigurationReviewError(
      instances.length
        ? 'DUPLICATE_ACTIVE_INSTANCES'
        : 'WORKFLOW_INSTANCE_REQUIRED',
      instances.length
        ? 'Multiple active V2 workflow instances exist.'
        : 'An active V2 workflow instance is required.',
      409
    );
  if (Number(instances[0].definition_version) !== 2)
    throw new ProjectTechnicalConfigurationReviewError(
      'TECHNICAL_REVIEW_DEFINITION_REQUIRED',
      'Technical & Configuration Review is available only to p2_v2 definition version 2.',
      409
    );
  const steps = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_instances WHERE workflow_instance_id=${instances[0].id} ORDER BY step_order`
    )
  );
  const issues = validateWorkflowInstanceIntegrity(instances[0], steps);
  if (issues.length)
    throw new ProjectTechnicalConfigurationReviewError(
      'WORKFLOW_INTEGRITY_FAILED',
      'The V2 workflow failed integrity validation.',
      409,
      { issues }
    );
  const step = steps.find(
    (entry) => entry.step_type === 'technical_configuration_review'
  );
  if (!step)
    throw new ProjectTechnicalConfigurationReviewError(
      'TECHNICAL_REVIEW_STAGE_REQUIRED',
      'Technical & Configuration Review stage is missing.',
      409
    );
  const required = ['rfq_risk_assessment', 'estimate_quote', 'contract_review'];
  const incomplete = required.filter(
    (type) =>
      steps.find((entry) => entry.step_type === type)?.status !== 'COMPLETE'
  );
  if (requirePredecessors && incomplete.length)
    throw new ProjectTechnicalConfigurationReviewError(
      'COMMERCIAL_PREDECESSORS_REQUIRED',
      'RFQ Review, Estimate & Quote, and Contract Review must be complete.',
      409,
      { incompleteStages: incomplete }
    );
  if (requirePredecessors) {
    const commercial = await evaluateCommercialBaseline(projectId, tx);
    if (!commercial.valid)
      throw new ProjectTechnicalConfigurationReviewError(
        'COMMERCIAL_BASELINE_INVALID',
        'The approved commercial baseline is incomplete or stale.',
        409,
        { blockers: commercial.blockers }
      );
  }
  return { project, instance: instances[0], step, steps };
}

async function sourceSnapshot(
  projectId: string,
  projectPoId: number | null,
  tx: Executor
) {
  const po = rows(
    await tx.execute(sql`
      WITH selected AS (
        SELECT COALESCE(parent_po_id,id) root_id
        FROM p2_purchase_orders WHERE id=${projectPoId}
      )
      SELECT po.* FROM p2_purchase_orders po
      LEFT JOIN selected s ON true
      WHERE (po.project_id=${projectId} OR po.id=s.root_id OR po.parent_po_id=s.root_id)
        AND po.is_current_revision=true
      ORDER BY po.revision_number DESC,po.updated_at DESC LIMIT 1`)
  )[0];
  if (!po)
    throw new ProjectTechnicalConfigurationReviewError(
      'CURRENT_PO_REQUIRED',
      'A current customer PO revision is required.',
      409
    );
  const items = rows(
    await tx.execute(sql`
      SELECT poi.*,ii.ag_part_number,ii.name inventory_name,ii.item_type,ii.type,
             ii.manufacturing_level,ii.traceability_required,ii.requires_coc,
             ii.requires_test_report,ii.has_tds,ii.tds_file_path
      FROM p2_purchase_order_items poi
      LEFT JOIN inventory_items ii ON ii.id=poi.inventory_item_id
      WHERE poi.po_id=${po.id}
      ORDER BY poi.id`)
  );
  const configurations = rows(
    await tx.execute(sql`
      SELECT poi.id po_item_id,COALESCE(ii.ag_part_number,poi.part_number) part_number,
             b.id bom_id,br.id bom_revision_id,br.rev_code bom_revision,
             br.is_released bom_is_released,br.updated_at bom_updated_at
      FROM p2_purchase_order_items poi
      LEFT JOIN inventory_items ii ON ii.id=poi.inventory_item_id
      LEFT JOIN LATERAL (
        SELECT value.* FROM boms value
        WHERE value.parent_part_ag_number=COALESCE(ii.ag_part_number,poi.part_number)
          AND value.is_active=true
        ORDER BY value.updated_at DESC LIMIT 1
      ) b ON true
      LEFT JOIN LATERAL (
        SELECT value.* FROM bom_revisions value WHERE value.bom_id=b.id
        ORDER BY value.is_released DESC,value.effective_from DESC NULLS LAST,value.created_at DESC
        LIMIT 1
      ) br ON true
      WHERE poi.po_id=${po.id}
      ORDER BY poi.id`)
  );
  const snapshot = { po, items, configurations };
  return {
    po,
    items,
    configurations,
    snapshot,
    revision: `${po.revision_number}:${hash(snapshot)}`,
  };
}

async function validateEvidence(evidence: TechnicalEvidence[], tx: Executor) {
  const values: string[] = [];
  const snapshots: Row[] = [];
  for (const item of evidence) {
    let record: Row | undefined;
    if (item.recordType === 'CONTROLLED_DOCUMENT')
      record = rows(
        await tx.execute(
          sql`SELECT id,document_number,revision,status,updated_at FROM controlled_documents WHERE id::text=${item.recordId} OR document_number=${item.recordId} ORDER BY updated_at DESC LIMIT 1`
        )
      )[0];
    if (item.recordType === 'BOM_REVISION')
      record = rows(
        await tx.execute(
          sql`SELECT id,rev_code revision,is_released status,updated_at FROM bom_revisions WHERE id::text=${item.recordId} LIMIT 1`
        )
      )[0];
    if (item.recordType === 'ENGINEERING_RELEASE')
      record = rows(
        await tx.execute(
          sql`SELECT id,release_revision revision,release_status status,released_at updated_at FROM engineering_releases WHERE id::text=${item.recordId} LIMIT 1`
        )
      )[0];
    if (!record) {
      values.push(`${item.recordType} ${item.recordId} was not found.`);
      continue;
    }
    const approved =
      item.recordType === 'BOM_REVISION'
        ? Boolean(record.status)
        : ['approved', 'released', 'complete', 'completed'].includes(
            String(record.status).toLowerCase()
          );
    if (!approved)
      values.push(
        `${item.recordType} ${item.recordId} is not released/approved.`
      );
    if (
      clean(item.revision) &&
      clean(record.revision) &&
      clean(item.revision) !== clean(record.revision)
    )
      values.push(`${item.recordType} ${item.recordId} revision changed.`);
    snapshots.push({
      ...item,
      authoritativeRevision: record.revision ?? null,
      authoritativeStatus: record.status,
      authoritativeUpdatedAt: record.updated_at,
    });
  }
  return { blockers: values, snapshots };
}

async function current(projectId: string, tx: Executor) {
  return (
    rows(
      await tx.execute(
        sql`SELECT * FROM project_technical_configuration_reviews WHERE project_id=${projectId} AND status IN ('DRAFT','PENDING_APPROVAL','COMPLETE','REJECTED','STALE','INVALIDATED') ORDER BY revision_number DESC LIMIT 1`
      )
    )[0] ?? null
  );
}
async function history(projectId: string, tx: Executor) {
  return rows(
    await tx.execute(
      sql`SELECT * FROM project_technical_configuration_reviews WHERE project_id=${projectId} ORDER BY revision_number DESC`
    )
  );
}
async function approvals(review: Row, tx: Executor) {
  return rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_approvals WHERE workflow_step_instance_id=${review.workflow_step_instance_id} AND evidence_snapshot->>'technicalReviewId'=${review.id} ORDER BY decided_at`
    )
  );
}
export const requiredTechnicalReviewRoles = (supplyChainRequired = false) => [
  'PROJECT_MANAGEMENT',
  'ENGINEERING',
  'QUALITY',
  'OPERATIONS',
  ...(supplyChainRequired ? ['SUPPLY_CHAIN'] : []),
];

async function readiness(projectId: string, review: Row | null, tx: Executor) {
  if (!review)
    return {
      ready: false,
      stale: false,
      blockers: ['Create a Technical & Configuration Review draft.'],
      differences: [],
    };
  const ctx = await context(projectId, tx, false, false);
  const source = await sourceSnapshot(projectId, ctx.project.po_id, tx);
  const evidence = await validateEvidence(review.released_evidence ?? [], tx);
  const blockers = [...evidence.blockers];
  const differences: string[] = [];
  const sourceRevisionChanged = source.revision !== review.source_revision;
  const technicalSnapshotUnchanged = jsonValuesEqual(
    technicalSnapshotForComparison(review.source_snapshot),
    technicalSnapshotForComparison(source.snapshot)
  );
  if (sourceRevisionChanged && !technicalSnapshotUnchanged) {
    differences.push(
      'Customer PO, line-item, or BOM/configuration revision changed.'
    );
    blockers.push(
      'The technical baseline source changed; create a new review revision.'
    );
  }
  const commercial = await evaluateCommercialBaseline(projectId, tx);
  blockers.push(...commercial.blockers);
  differences.push(...commercial.differences);
  if (!review.sufficiently_defined)
    blockers.push(
      'The technical baseline must be marked complete and unambiguous.'
    );
  if (!clean(review.effectivity_reference))
    blockers.push('Delivery/configuration effectivity is required.');
  const requirements = review.technical_baseline?.partRequirements ?? [];
  const sourceRequirementsByPart = new Map<string, number>();
  for (const item of source.items) {
    const partNumber = clean(item.ag_part_number) || clean(item.part_number);
    sourceRequirementsByPart.set(
      partNumber,
      (sourceRequirementsByPart.get(partNumber) ?? 0) + Number(item.quantity)
    );
  }
  for (const [partNumber, sourceQuantity] of sourceRequirementsByPart) {
    const captured = requirements.find(
      (entry: Row) => clean(entry.partNumber) === partNumber
    );
    if (!captured) {
      blockers.push(`${partNumber}: technical part requirement is missing.`);
      continue;
    }
    if (Number(captured.quantity) !== sourceQuantity)
      blockers.push(
        `${partNumber}: reviewed quantity does not match the customer PO.`
      );
    if (
      (!clean(captured.drawingNumber) || !clean(captured.drawingRevision)) &&
      !clean(captured.technicalDataException)
    )
      blockers.push(
        `${partNumber}: released drawing/specification revision or approved exception is required.`
      );
  }
  if (
    (review.conflicts ?? []).some(
      (entry: Row) => !entry.resolved || !clean(entry.resolution)
    )
  )
    blockers.push(
      'Every technical/configuration conflict requires a resolution.'
    );
  if ((review.missing_information ?? []).length)
    blockers.push('Required technical information remains missing.');
  if (
    (review.risks ?? []).some(
      (entry: Row) =>
        !clean(entry.description) ||
        !clean(entry.owner) ||
        !clean(entry.control)
    )
  )
    blockers.push('Every technical risk requires an owner and control.');
  return {
    ready: blockers.length === 0,
    stale: differences.length > 0,
    blockers: Array.from(new Set(blockers)),
    differences: Array.from(new Set(differences)),
    currentSourceRevision: source.revision,
    evidenceSnapshots: evidence.snapshots,
  };
}

async function readModel(projectId: string, tx: Executor) {
  await context(projectId, tx, false, false);
  const review = await current(projectId, tx);
  const state = await readiness(projectId, review, tx);
  const reviewApprovals = review ? await approvals(review, tx) : [];
  return {
    review:
      review && state.stale && review.status === 'COMPLETE'
        ? { ...review, status: 'STALE', detected_status: 'STALE' }
        : review,
    history: await history(projectId, tx),
    approvals: state.stale
      ? reviewApprovals.map((entry) => ({
          ...entry,
          invalidated: true,
          invalidation_reason: 'Technical source revision changed.',
        }))
      : reviewApprovals,
    requiredApprovals: review
      ? requiredTechnicalReviewRoles(Boolean(review.supply_chain_required))
      : requiredTechnicalReviewRoles(false),
    readiness: state,
  };
}
export const getTechnicalConfigurationReview = (
  projectId: string,
  tx: Executor = db
) => readModel(projectId, tx);

async function audit(
  eventType: string,
  review: Row,
  actor: TechnicalReviewActor,
  tx: Executor,
  reason?: string
) {
  await recordAuditEvent(
    {
      eventType,
      subjectType: 'project_technical_configuration_review',
      subjectId: review.id,
      sourceService: 'projectTechnicalConfigurationReviewService',
      actor: { id: actor.userId, username: actor.username, role: actor.role },
      reason,
      payload: {
        projectId: review.project_id,
        reviewRevision: review.revision_number,
        poId: review.po_id,
        poRevision: review.po_revision_number,
      },
    },
    tx
  );
}

async function insertRevision(
  projectId: string,
  input: TechnicalReviewInput,
  actor: TechnicalReviewActor,
  tx: Executor,
  revisionNumber: number
) {
  const ctx = await context(projectId, tx, true);
  const source = await sourceSnapshot(projectId, ctx.project.po_id, tx);
  const evidence = await validateEvidence(input.releasedEvidence ?? [], tx);
  const review = rows(
    await tx.execute(sql`
      INSERT INTO project_technical_configuration_reviews
        (project_id,workflow_instance_id,workflow_step_instance_id,revision_number,status,
         po_id,po_revision_number,source_revision,source_snapshot,technical_baseline,
         released_evidence,conflicts,missing_information,risks,sufficiently_defined,
         supply_chain_required,effectivity_reference,owner_user_id,owner_display_name,
         created_by,created_by_display_name)
      VALUES
        (${projectId},${ctx.instance.id},${ctx.step.id},${revisionNumber},'DRAFT',
         ${source.po.id},${source.po.revision_number},${source.revision},${JSON.stringify(source.snapshot)}::jsonb,
         ${JSON.stringify(input.technicalBaseline)}::jsonb,${JSON.stringify(evidence.snapshots)}::jsonb,
         ${JSON.stringify(input.conflicts ?? [])}::jsonb,${JSON.stringify(input.missingInformation ?? [])}::jsonb,
         ${JSON.stringify(input.risks ?? [])}::jsonb,${Boolean(input.sufficientlyDefined)},
         ${Boolean(input.supplyChainRequired)},${clean(input.effectivityReference)},${actor.userId},
         ${actor.displayName},${actor.userId},${actor.displayName})
      RETURNING *`)
  )[0];
  await tx.execute(
    sql`UPDATE project_workflow_step_instances SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),blocked_reason=NULL,updated_at=now() WHERE id=${ctx.step.id}`
  );
  await audit('P2_V2_TECHNICAL_REVIEW_DRAFT_CREATED', review, actor, tx);
  return review;
}

export async function createTechnicalConfigurationReview(
  projectId: string,
  input: TechnicalReviewInput,
  actor: TechnicalReviewActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    if (await current(projectId, tx))
      throw new ProjectTechnicalConfigurationReviewError(
        'CURRENT_REVIEW_EXISTS',
        'A current Technical & Configuration Review revision already exists.',
        409
      );
    await insertRevision(projectId, input, actor, tx, 1);
    return readModel(projectId, tx);
  });
}

export async function updateTechnicalConfigurationDraft(
  projectId: string,
  reviewId: string,
  expectedRevision: number,
  input: TechnicalReviewInput,
  actor: TechnicalReviewActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedRevision
    )
      throw new ProjectTechnicalConfigurationReviewError(
        'STALE_REVISION',
        'The review changed; reload before saving.',
        409
      );
    if (review.status !== 'DRAFT')
      throw new ProjectTechnicalConfigurationReviewError(
        'DRAFT_REQUIRED',
        'Submitted and completed review revisions are immutable.',
        409
      );
    const source = await sourceSnapshot(projectId, ctx.project.po_id, tx);
    const evidence = await validateEvidence(input.releasedEvidence ?? [], tx);
    await tx.execute(sql`
      UPDATE project_technical_configuration_reviews SET
        po_id=${source.po.id},po_revision_number=${source.po.revision_number},
        source_revision=${source.revision},source_snapshot=${JSON.stringify(source.snapshot)}::jsonb,
        technical_baseline=${JSON.stringify(input.technicalBaseline)}::jsonb,
        released_evidence=${JSON.stringify(evidence.snapshots)}::jsonb,
        conflicts=${JSON.stringify(input.conflicts ?? [])}::jsonb,
        missing_information=${JSON.stringify(input.missingInformation ?? [])}::jsonb,
        risks=${JSON.stringify(input.risks ?? [])}::jsonb,
        sufficiently_defined=${Boolean(input.sufficientlyDefined)},
        supply_chain_required=${Boolean(input.supplyChainRequired)},
        effectivity_reference=${clean(input.effectivityReference)},
        lock_version=lock_version+1,updated_at=now()
      WHERE id=${reviewId} AND lock_version=${expectedRevision} AND status='DRAFT'`);
    await audit('P2_V2_TECHNICAL_REVIEW_DRAFT_UPDATED', review, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function submitTechnicalConfigurationReview(
  projectId: string,
  reviewId: string,
  expectedRevision: number,
  actor: TechnicalReviewActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedRevision
    )
      throw new ProjectTechnicalConfigurationReviewError(
        'STALE_REVISION',
        'The review changed; reload before submitting.',
        409
      );
    if (review.status !== 'DRAFT')
      throw new ProjectTechnicalConfigurationReviewError(
        'DRAFT_REQUIRED',
        'Only a draft may be submitted.',
        409
      );
    const state = await readiness(projectId, review, tx);
    if (!state.ready)
      throw new ProjectTechnicalConfigurationReviewError(
        'TECHNICAL_REVIEW_NOT_READY',
        'Technical & Configuration Review has blockers.',
        409,
        { blockers: state.blockers }
      );
    await tx.execute(
      sql`UPDATE project_technical_configuration_reviews SET status='PENDING_APPROVAL',submitted_at=now(),lock_version=lock_version+1,updated_at=now() WHERE id=${reviewId}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='PENDING_APPROVAL',updated_at=now() WHERE id=${ctx.step.id}`
    );
    await audit('P2_V2_TECHNICAL_REVIEW_SUBMITTED', review, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function decideTechnicalConfigurationReview(
  projectId: string,
  reviewId: string,
  expectedRevision: number,
  capacity:
    | 'PROJECT_MANAGEMENT'
    | 'ENGINEERING'
    | 'QUALITY'
    | 'OPERATIONS'
    | 'SUPPLY_CHAIN',
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: TechnicalReviewActor
) {
  if (!clean(signatureMeaning))
    throw new ProjectTechnicalConfigurationReviewError(
      'SIGNATURE_REQUIRED',
      'Signature meaning is required.'
    );
  if (decision !== 'APPROVED' && !clean(reason))
    throw new ProjectTechnicalConfigurationReviewError(
      'REASON_REQUIRED',
      'A rejection or return requires a comment.'
    );
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedRevision
    )
      throw new ProjectTechnicalConfigurationReviewError(
        'STALE_REVISION',
        'The review changed; reload before deciding.',
        409
      );
    if (review.status !== 'PENDING_APPROVAL')
      throw new ProjectTechnicalConfigurationReviewError(
        'PENDING_APPROVAL_REQUIRED',
        'The review is not pending functional approval.',
        409
      );
    if (
      !requiredTechnicalReviewRoles(
        Boolean(review.supply_chain_required)
      ).includes(capacity)
    )
      throw new ProjectTechnicalConfigurationReviewError(
        'APPROVAL_NOT_REQUIRED',
        `${capacity} approval is not required.`,
        409
      );
    const existing = await approvals(review, tx);
    if (
      existing.some(
        (entry) => entry.approval_type === `TECHNICAL_CONFIGURATION_${capacity}`
      )
    )
      throw new ProjectTechnicalConfigurationReviewError(
        'DECISION_ALREADY_RECORDED',
        `${capacity} already decided this revision.`,
        409
      );
    if (
      existing.some(
        (entry) =>
          Number(entry.actor_user_id) === actor.userId &&
          entry.decision === 'APPROVED'
      )
    )
      throw new ProjectTechnicalConfigurationReviewError(
        'SEGREGATION_OF_DUTIES',
        'One actor cannot represent multiple required manufacturing functions.',
        403
      );
    await tx.execute(sql`
      INSERT INTO project_workflow_step_approvals
        (workflow_step_instance_id,project_id,approval_type,decision,signature_meaning,
         reason,actor_employee_id,actor_user_id,actor_display_name,actor_role,
         step_revision_snapshot,evidence_snapshot)
      VALUES
        (${ctx.step.id},${projectId},${`TECHNICAL_CONFIGURATION_${capacity}`},${decision},
         ${signatureMeaning},${clean(reason) || null},${actor.employeeId ?? null},${actor.userId},
         ${actor.displayName},${actor.role},${String(review.revision_number)},
         ${JSON.stringify({
           technicalReviewId: review.id,
           revision: review.revision_number,
           sourceRevision: review.source_revision,
           invalidated: false,
         })}::jsonb)`);
    if (decision === 'APPROVED')
      await tx.execute(
        sql`UPDATE project_technical_configuration_reviews SET lock_version=lock_version+1,updated_at=now() WHERE id=${review.id}`
      );
    else {
      await tx.execute(
        sql`UPDATE project_technical_configuration_reviews SET status='REJECTED',lock_version=lock_version+1,updated_at=now() WHERE id=${review.id}`
      );
      await tx.execute(
        sql`UPDATE project_workflow_step_instances SET status='BLOCKED',blocked_reason=${`${capacity} ${decision.toLowerCase()}: ${clean(reason)}`},updated_at=now() WHERE id=${ctx.step.id}`
      );
    }
    await audit(
      `P2_V2_TECHNICAL_${capacity}_DECIDED`,
      review,
      actor,
      tx,
      clean(reason) || undefined
    );
    return readModel(projectId, tx);
  });
}

export async function completeTechnicalConfigurationReview(
  projectId: string,
  reviewId: string,
  expectedRevision: number,
  actor: TechnicalReviewActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedRevision
    )
      throw new ProjectTechnicalConfigurationReviewError(
        'STALE_REVISION',
        'The review changed; reload before completion.',
        409
      );
    if (review.status !== 'PENDING_APPROVAL')
      throw new ProjectTechnicalConfigurationReviewError(
        'PENDING_APPROVAL_REQUIRED',
        'Submit the review before completion.',
        409
      );
    const state = await readiness(projectId, review, tx);
    if (!state.ready)
      throw new ProjectTechnicalConfigurationReviewError(
        'TECHNICAL_REVIEW_NOT_READY',
        'Technical & Configuration Review has blockers.',
        409,
        { blockers: state.blockers }
      );
    const evidence = await approvals(review, tx);
    const missing = requiredTechnicalReviewRoles(
      Boolean(review.supply_chain_required)
    ).filter(
      (role) =>
        !evidence.some(
          (entry) =>
            entry.approval_type === `TECHNICAL_CONFIGURATION_${role}` &&
            entry.decision === 'APPROVED'
        )
    );
    if (missing.length)
      throw new ProjectTechnicalConfigurationReviewError(
        'APPROVALS_REQUIRED',
        'Required independent functional approvals are missing.',
        409,
        { missingApprovals: missing }
      );
    await tx.execute(
      sql`UPDATE project_technical_configuration_reviews SET status='COMPLETE',completed_at=now(),lock_version=lock_version+1,updated_at=now() WHERE id=${review.id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='COMPLETE',completed_at=now(),completed_by=${actor.employeeId ?? null},completed_by_display_name=${actor.displayName},blocked_reason=NULL,revision_reference=${String(review.revision_number)},effectivity_reference=${review.effectivity_reference},updated_at=now() WHERE id=${ctx.step.id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_links SET unlinked_at=now(),unlink_reason='Superseded technical/configuration review evidence',updated_at=now() WHERE workflow_step_instance_id=${ctx.step.id} AND unlinked_at IS NULL`
    );
    await tx.execute(sql`
      INSERT INTO project_workflow_step_links
        (workflow_step_instance_id,project_id,record_type,record_id,relationship_type,
         is_authoritative,record_revision,effectivity_reference,linked_by,linked_by_display_name)
      VALUES
        (${ctx.step.id},${projectId},'TECHNICAL_CONFIGURATION_REVIEW',${review.id},'PRIMARY',
         true,${String(review.revision_number)},${review.effectivity_reference},
         ${actor.employeeId ?? null},${actor.displayName})`);
    await audit('P2_V2_TECHNICAL_REVIEW_COMPLETED', review, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function reviseTechnicalConfigurationReview(
  projectId: string,
  reviewId: string,
  expectedRevision: number,
  input: TechnicalReviewInput,
  actor: TechnicalReviewActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const prior = await current(projectId, tx);
    if (
      !prior ||
      prior.id !== reviewId ||
      Number(prior.lock_version) !== expectedRevision
    )
      throw new ProjectTechnicalConfigurationReviewError(
        'STALE_REVISION',
        'The review changed; reload before revision.',
        409
      );
    if (
      !['COMPLETE', 'REJECTED', 'STALE', 'INVALIDATED'].includes(prior.status)
    )
      throw new ProjectTechnicalConfigurationReviewError(
        'REVISION_NOT_ALLOWED',
        'Only completed, rejected, stale, or invalidated reviews may be revised.',
        409
      );
    await tx.execute(
      sql`UPDATE project_technical_configuration_reviews SET status='SUPERSEDED',superseded_at=now(),updated_at=now() WHERE id=${prior.id}`
    );
    const next = await insertRevision(
      projectId,
      input,
      actor,
      tx,
      Number(prior.revision_number) + 1
    );
    await tx.execute(
      sql`UPDATE project_technical_configuration_reviews SET superseded_by_review_id=${next.id} WHERE id=${prior.id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_approvals SET superseded_at=now(),evidence_snapshot=jsonb_set(COALESCE(evidence_snapshot,'{}'::jsonb),'{invalidated}','true'::jsonb) WHERE workflow_step_instance_id=${prior.workflow_step_instance_id} AND evidence_snapshot->>'technicalReviewId'=${prior.id} AND superseded_at IS NULL`
    );
    await audit('P2_V2_TECHNICAL_REVIEW_REVISED', next, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function evaluateTechnicalConfigurationBaseline(
  projectId: string,
  tx: Executor = db
) {
  const review = await current(projectId, tx);
  if (!review || review.status !== 'COMPLETE')
    return {
      valid: false,
      stale: false,
      blockers: ['Technical & Configuration Review is not complete.'],
      differences: [],
      review: review ?? null,
    };
  try {
    const state = await readiness(projectId, review, tx);
    return { valid: state.ready, ...state, review };
  } catch (error) {
    if (!(error instanceof ProjectTechnicalConfigurationReviewError))
      throw error;
    return {
      valid: false,
      stale: true,
      blockers: [error.message],
      differences: [error.message],
      review,
    };
  }
}
