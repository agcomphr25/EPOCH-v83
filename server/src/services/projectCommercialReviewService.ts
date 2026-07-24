import { createHash } from 'crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  jsonValuesEqual,
  recordAuditEvent,
  type AuditLedgerTx,
  type JsonValue,
} from './auditLedgerService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';
import { validateWorkflowInstanceIntegrity } from './projectWorkflowInstanceIntegrity';
import {
  commercialQuoteEligibility,
  requiredCommercialApprovalRoles,
} from './projectCommercialReviewRules';

export type CommercialStage =
  | 'rfq_risk_assessment'
  | 'estimate_quote'
  | 'contract_review';
type Executor = AuditLedgerTx;
// Additive raw-query rows avoid expanding the central schema surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type CommercialActor = {
  userId: number;
  employeeId?: number | null;
  username: string;
  displayName: string;
  role: string;
};
export type CommercialDraftInput = {
  sourceRecordType: string;
  sourceRecordId: string;
  secondarySourceId?: string | null;
  requirements?: Record<string, unknown>;
  assumptions?: unknown[];
  exclusions?: unknown[];
  differences?: Array<{
    description?: string;
    resolution?: string;
    resolved?: boolean;
  }>;
  risks?: Array<{ description?: string; owner?: string; control?: string }>;
  unresolvedInformationRequests?: unknown[];
  sufficientlyDefined?: boolean;
  differencesResolved?: boolean;
  effectivityReference?: string | null;
  financeRequired?: boolean;
};
export class ProjectCommercialReviewError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}
const resultRows = <T extends Row>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : ((value as { rows?: T[] } | null)?.rows ?? []);
const clean = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const contractSnapshotForComparison = (value: Row) => {
  const { secondarySourceId: _secondarySourceId, ...snapshot } = value ?? {};
  const { po_updated_at: _poUpdatedAt, ...contract } =
    snapshot.contract ?? {};
  return { ...snapshot, contract } as JsonValue;
};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function context(
  projectId: string,
  stage: CommercialStage,
  tx: Executor,
  lock = false,
  requirePredecessors = true
) {
  const project = resultRows(
    await tx.execute(
      sql`SELECT id,workflow_version,po_id FROM projects WHERE id=${projectId} ${lock ? sql`FOR UPDATE` : sql``}`
    )
  )[0];
  if (!project)
    throw new ProjectCommercialReviewError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  let version: ReturnType<typeof resolveProjectWorkflowVersion>;
  try {
    version = resolveProjectWorkflowVersion(project.workflow_version);
  } catch {
    throw new ProjectCommercialReviewError(
      'UNKNOWN_WORKFLOW_VERSION',
      'The project workflow version is not recognized.',
      409
    );
  }
  if (version !== 'p2_v2')
    throw new ProjectCommercialReviewError(
      'P2_V2_REQUIRED',
      'Commercial review requires an explicit p2_v2 project.',
      409,
      { effectiveWorkflowVersion: version }
    );
  const instances = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_instances WHERE project_id=${projectId} AND workflow_version='p2_v2' AND status NOT IN ('SUPERSEDED','CANCELLED') ${lock ? sql`FOR UPDATE` : sql``}`
    )
  );
  if (instances.length !== 1)
    throw new ProjectCommercialReviewError(
      instances.length
        ? 'DUPLICATE_ACTIVE_INSTANCES'
        : 'WORKFLOW_INSTANCE_REQUIRED',
      instances.length
        ? 'Multiple active V2 workflow instances exist.'
        : 'An active V2 workflow instance is required.',
      409
    );
  const steps = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_instances WHERE workflow_instance_id=${instances[0].id} ORDER BY step_order`
    )
  );
  const integrity = validateWorkflowInstanceIntegrity(instances[0], steps);
  if (integrity.length)
    throw new ProjectCommercialReviewError(
      'WORKFLOW_INTEGRITY_FAILED',
      'The V2 workflow failed integrity validation.',
      409,
      { issues: integrity }
    );
  const step = steps.find((entry) => entry.step_type === stage);
  if (!step)
    throw new ProjectCommercialReviewError(
      'COMMERCIAL_STAGE_REQUIRED',
      `The ${stage} workflow stage is missing.`,
      409
    );
  const predecessorTypes =
    stage === 'rfq_risk_assessment'
      ? []
      : stage === 'estimate_quote'
        ? ['rfq_risk_assessment']
        : ['rfq_risk_assessment', 'estimate_quote'];
  const incomplete = predecessorTypes.filter(
    (type) =>
      steps.find((entry) => entry.step_type === type)?.status !== 'COMPLETE'
  );
  if (requirePredecessors && incomplete.length)
    throw new ProjectCommercialReviewError(
      'PREDECESSOR_REQUIRED',
      'Required commercial predecessor stages are not complete.',
      409,
      { incompleteStages: incomplete }
    );
  return { project, instance: instances[0], step, steps };
}

async function sourceSnapshot(
  projectId: string,
  stage: CommercialStage,
  input: Pick<
    CommercialDraftInput,
    'sourceRecordType' | 'sourceRecordId' | 'secondarySourceId'
  >,
  tx: Executor
) {
  if (stage === 'rfq_risk_assessment') {
    if (input.sourceRecordType === 'estimating_rfq') {
      const rfq = resultRows(
        await tx.execute(
          sql`SELECT * FROM estimating_rfqs WHERE id=${input.sourceRecordId}::uuid`
        )
      )[0];
      if (!rfq)
        throw new ProjectCommercialReviewError(
          'RFQ_NOT_FOUND',
          'Authoritative estimating RFQ not found.',
          404
        );
      const parts = resultRows(
        await tx.execute(
          sql`SELECT * FROM estimating_rfq_parts WHERE rfq_id=${rfq.id} ORDER BY line_number`
        )
      );
      const assumptions = resultRows(
        await tx.execute(
          sql`SELECT * FROM estimate_assumptions WHERE rfq_id=${rfq.id} ORDER BY created_at`
        )
      );
      const snapshot = { rfq, parts, assumptions };
      return {
        snapshot,
        requirements: { parts, requestedDueDate: rfq.requested_due_date },
        sourceRevision: clean(rfq.revision) || hash(snapshot),
        sourceUpdatedAt: rfq.updated_at,
        eligibilityBlockers: parts.length
          ? []
          : ['Authoritative RFQ has no requested parts/services.'],
      };
    }
    if (input.sourceRecordType === 'rfq_risk_assessment') {
      const rfq = resultRows(
        await tx.execute(
          sql`SELECT * FROM rfq_risk_assessments WHERE id=${Number(input.sourceRecordId)}`
        )
      )[0];
      if (!rfq)
        throw new ProjectCommercialReviewError(
          'RFQ_NOT_FOUND',
          'Authoritative RFQ risk assessment not found.',
          404
        );
      const snapshot = { rfq };
      const blockers = [];
      if (String(rfq.status).toLowerCase() !== 'submitted')
        blockers.push('RFQ risk assessment is not submitted.');
      if (String(rfq.bid_decision).toLowerCase() !== 'bid')
        blockers.push('RFQ does not have an approved Bid decision.');
      return {
        snapshot,
        requirements: rfq.form_data ?? {},
        sourceRevision: hash(snapshot),
        sourceUpdatedAt: rfq.updated_at,
        eligibilityBlockers: blockers,
      };
    }
    throw new ProjectCommercialReviewError(
      'INVALID_RFQ_SOURCE',
      'RFQ source must be estimating_rfq or rfq_risk_assessment.'
    );
  }
  if (stage === 'estimate_quote') {
    if (input.sourceRecordType !== 'quote')
      throw new ProjectCommercialReviewError(
        'INVALID_QUOTE_SOURCE',
        'Estimate & Quote source must be quote.'
      );
    const quote = resultRows(
      await tx.execute(
        sql`SELECT * FROM quotes WHERE id=${input.sourceRecordId}::uuid`
      )
    )[0];
    if (!quote)
      throw new ProjectCommercialReviewError(
        'QUOTE_NOT_FOUND',
        'Authoritative quote not found.',
        404
      );
    const quoteSnapshot = resultRows(
      await tx.execute(
        sql`SELECT * FROM quote_snapshots WHERE quote_id=${quote.id} ORDER BY revision_number DESC LIMIT 1`
      )
    )[0];
    const lines = quoteSnapshot
      ? resultRows(
          await tx.execute(
            sql`SELECT * FROM quote_line_snapshots WHERE quote_snapshot_id=${quoteSnapshot.id} ORDER BY line_number`
          )
        )
      : [];
    const estimate = input.secondarySourceId
      ? resultRows(
          await tx.execute(
            sql`SELECT ev.*,er.rfq_number,er.id AS rfq_id FROM estimate_versions ev JOIN estimating_rfqs er ON er.id=ev.rfq_id WHERE ev.id=${input.secondarySourceId}::uuid`
          )
        )[0]
      : null;
    const estimateApprovals = estimate
      ? resultRows(
          await tx.execute(
            sql`SELECT * FROM estimating_approvals WHERE estimate_version_id=${estimate.id} ORDER BY approval_role`
          )
        )
      : [];
    const estimateLines = estimate
      ? resultRows(
          await tx.execute(
            sql`SELECT * FROM estimate_line_versions WHERE estimate_version_id=${estimate.id} ORDER BY line_number NULLS LAST,created_at`
          )
        )
      : [];
    const estimateAssumptions = estimate
      ? resultRows(
          await tx.execute(
            sql`SELECT * FROM estimate_assumptions WHERE rfq_id=${estimate.rfq_id} ORDER BY created_at`
          )
        )
      : [];
    const tooling = estimate
      ? resultRows(
          await tx.execute(
            sql`SELECT * FROM estimating_tooling WHERE rfq_id=${estimate.rfq_id} ORDER BY created_at`
          )
        )
      : [];
    const processRows = estimate
      ? resultRows(
          await tx.execute(
            sql`SELECT * FROM estimating_process_rows WHERE rfq_id=${estimate.rfq_id} ORDER BY created_at`
          )
        )
      : [];
    const shipping = estimate
      ? resultRows(
          await tx.execute(
            sql`SELECT * FROM estimating_shipping WHERE rfq_id=${estimate.rfq_id} ORDER BY created_at`
          )
        )
      : [];
    const snapshot = {
      quote,
      quoteSnapshot,
      lines,
      estimate,
      estimateLines,
      estimateAssumptions,
      tooling,
      processRows,
      shipping,
      estimateApprovals,
    };
    const blockers = commercialQuoteEligibility({
      quoteStatus: String(quote.status),
      validUntil: quote.valid_until,
      hasReleasedSnapshot: Boolean(quoteSnapshot),
      estimateStatus: estimate?.status ? String(estimate.status) : null,
      estimateApprovalStatuses: estimateApprovals.map((entry) =>
        String(entry.approval_status)
      ),
    });
    return {
      snapshot,
      requirements: {
        lines,
        pricing: quoteSnapshot?.total_amount,
        validity: quoteSnapshot?.valid_until,
        assumptions: {
          bom: quoteSnapshot?.bom_assumptions,
          labor: quoteSnapshot?.labor_assumptions,
          leadTimes: quoteSnapshot?.lead_times,
          estimate: estimateAssumptions,
        },
        estimateLines,
        tooling,
        processRows,
        shipping,
        exclusions: quoteSnapshot?.exclusions,
      },
      sourceRevision: quoteSnapshot
        ? String(quoteSnapshot.revision_number)
        : hash(snapshot),
      sourceUpdatedAt: quote.updated_at,
      eligibilityBlockers: blockers,
    };
  }
  if (input.sourceRecordType !== 'contract_review_instance')
    throw new ProjectCommercialReviewError(
      'INVALID_CONTRACT_SOURCE',
      'Contract Review source must be contract_review_instance.'
    );
  const contract = resultRows(
    await tx.execute(
      sql`SELECT cri.*,prc.status AS purchase_review_status,prc.form_data AS purchase_review_data,po.po_number,po.revision_number AS po_revision_number,po.is_current_revision,po.source_quote_id,po.updated_at AS po_updated_at
          FROM contract_review_checklist_instances cri
          LEFT JOIN purchase_review_checklists prc ON prc.id=cri.purchase_review_checklist_id
          LEFT JOIN p2_purchase_orders po ON po.id=cri.p2_purchase_order_id
          WHERE cri.id=${input.sourceRecordId}::uuid AND cri.project_id=${projectId}`
    )
  )[0];
  if (!contract)
    throw new ProjectCommercialReviewError(
      'CONTRACT_REVIEW_NOT_FOUND',
      'Authoritative contract review not found for this project.',
      404
    );
  const poItems = contract.p2_purchase_order_id
    ? resultRows(
        await tx.execute(
          sql`SELECT * FROM p2_purchase_order_items WHERE po_id=${contract.p2_purchase_order_id} ORDER BY id`
        )
      )
    : [];
  const reconciliation = contract.p2_purchase_order_id
    ? resultRows(
        await tx.execute(
          sql`SELECT * FROM quote_po_reconciliations WHERE p2_purchase_order_id=${contract.p2_purchase_order_id} ORDER BY checked_at DESC LIMIT 1`
        )
      )[0]
    : null;
  const snapshot = { contract, poItems, reconciliation };
  const blockers: string[] = [];
  if (String(contract.status).toLowerCase() !== 'approved')
    blockers.push('Authoritative contract review is not approved.');
  if (
    contract.purchase_review_checklist_id &&
    contract.purchase_review_status !== 'APPROVED'
  )
    blockers.push('Purchase review checklist is not approved.');
  if (!contract.p2_purchase_order_id || !contract.is_current_revision)
    blockers.push('Current accepted customer PO revision is required.');
  if (!poItems.length) blockers.push('Accepted customer PO has no line items.');
  if (!reconciliation || reconciliation.status !== 'MATCH')
    blockers.push('Accepted PO does not have a matching quote reconciliation.');
  return {
    snapshot,
    requirements: {
      acceptedPo: {
        id: contract.p2_purchase_order_id,
        number: contract.po_number,
        revision: contract.po_revision_number,
      },
      poItems,
      contractResponses: contract.responses,
      reviewAreas: contract.review_area_status,
      purchaseReview: contract.purchase_review_data,
      reconciliation,
    },
    sourceRevision: `${contract.po_revision_number}:${hash(snapshot)}`,
    sourceUpdatedAt: contract.po_updated_at ?? contract.updated_at,
    eligibilityBlockers: blockers,
  };
}

async function current(
  projectId: string,
  stage: CommercialStage,
  tx: Executor
) {
  return (
    resultRows(
      await tx.execute(
        sql`SELECT * FROM project_commercial_stage_reviews WHERE project_id=${projectId} AND stage_type=${stage} AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED','COMPLETE','REJECTED','STALE','INVALIDATED') ORDER BY revision_number DESC LIMIT 1`
      )
    )[0] ?? null
  );
}
async function reviewHistory(
  projectId: string,
  stage: CommercialStage,
  tx: Executor
) {
  return resultRows(
    await tx.execute(
      sql`SELECT * FROM project_commercial_stage_reviews WHERE project_id=${projectId} AND stage_type=${stage} ORDER BY revision_number DESC`
    )
  );
}
async function approvals(review: Row, tx: Executor) {
  return resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_approvals WHERE workflow_step_instance_id=${review.workflow_step_instance_id} AND evidence_snapshot->>'commercialReviewId'=${review.id} ORDER BY decided_at`
    )
  );
}
const requiredRoles = (review: Row) =>
  requiredCommercialApprovalRoles(
    review.stage_type,
    Boolean(review.requirements_snapshot?.financeRequired)
  );

async function blockers(
  projectId: string,
  stage: CommercialStage,
  review: Row | null,
  tx: Executor
) {
  if (!review)
    return {
      ready: false,
      stale: false,
      blockers: ['A commercial review draft is required.'],
      differences: [],
    };
  const source = await sourceSnapshot(
    projectId,
    stage,
    {
      sourceRecordType: review.source_record_type,
      sourceRecordId: review.source_record_id,
      secondarySourceId: review.source_snapshot?.secondarySourceId,
    },
    tx
  );
  const values = [...source.eligibilityBlockers];
  const differences: string[] = [];
  const sourceRevisionChanged =
    source.sourceRevision !== review.source_revision;
  const contractSnapshotUnchanged =
    stage === 'contract_review' &&
    jsonValuesEqual(
      contractSnapshotForComparison(review.source_snapshot),
      contractSnapshotForComparison(source.snapshot)
    );
  if (sourceRevisionChanged && !contractSnapshotUnchanged) {
    differences.push('Authoritative source revision changed.');
    values.push('Review source is stale and requires a new revision.');
  }
  if (stage === 'rfq_risk_assessment') {
    if (!review.sufficiently_defined)
      values.push('RFQ must be marked sufficiently defined.');
    if (!(review.requirements_snapshot?.parts ?? []).length)
      values.push('Part/service and quantity requirements are required.');
    if (
      !review.requirements_snapshot?.requestedDueDate &&
      !review.requirements_snapshot?.deliveryException
    )
      values.push(
        'Requested delivery or approved delivery exception is required.'
      );
    if (review.unresolved_information_requests?.length)
      values.push('Blocking RFQ information requests remain unresolved.');
  }
  if (stage === 'estimate_quote') {
    const rfq = await current(projectId, 'rfq_risk_assessment', tx);
    if (!rfq || rfq.status !== 'COMPLETE')
      values.push('Current RFQ review is not complete.');
    if (
      review.requirements_snapshot?.rfqReviewId !== rfq?.id ||
      Number(review.requirements_snapshot?.rfqReviewRevision) !==
        Number(rfq?.revision_number)
    )
      values.push(
        'Estimate & Quote basis does not match the current RFQ review.'
      );
    if (
      rfq?.source_record_type === 'estimating_rfq' &&
      review.source_snapshot?.estimate?.rfq_id !== rfq.source_record_id
    )
      values.push(
        'Authoritative estimate does not originate from the reviewed RFQ.'
      );
  }
  if (stage === 'contract_review') {
    for (const predecessor of [
      'rfq_risk_assessment',
      'estimate_quote',
    ] as const) {
      const item = await current(projectId, predecessor, tx);
      if (!item || item.status !== 'COMPLETE')
        values.push(`${predecessor} review is not complete and current.`);
    }
    const rfq = await current(projectId, 'rfq_risk_assessment', tx);
    const estimateQuote = await current(projectId, 'estimate_quote', tx);
    if (
      review.requirements_snapshot?.rfqReviewId !== rfq?.id ||
      Number(review.requirements_snapshot?.rfqReviewRevision) !==
        Number(rfq?.revision_number)
    )
      values.push('Contract basis does not match the current RFQ review.');
    if (
      review.requirements_snapshot?.estimateQuoteReviewId !==
        estimateQuote?.id ||
      Number(review.requirements_snapshot?.estimateQuoteReviewRevision) !==
        Number(estimateQuote?.revision_number)
    )
      values.push(
        'Contract basis does not match the current Estimate & Quote review.'
      );
    if (
      review.source_snapshot?.reconciliation?.quote_id &&
      review.source_snapshot.reconciliation.quote_id !==
        estimateQuote?.source_record_id
    )
      values.push(
        'Accepted PO reconciliation does not match the reviewed quote.'
      );
    if (!review.differences_resolved)
      values.push('Contract differences must be resolved.');
    if (
      review.differences?.some(
        (entry: Row) => !entry.resolved || !clean(entry.resolution)
      )
    )
      values.push(
        'Every contract difference requires a documented resolution.'
      );
    if (
      review.risks?.some(
        (entry: Row) =>
          !clean(entry.description) ||
          !clean(entry.owner) ||
          !clean(entry.control)
      )
    )
      values.push('Every contract risk requires an owner and control.');
  }
  return {
    ready: values.length === 0,
    stale: differences.length > 0,
    blockers: Array.from(new Set(values)),
    differences,
  };
}

async function readModel(
  projectId: string,
  stage: CommercialStage,
  tx: Executor
) {
  await context(projectId, stage, tx, false, false);
  const review = await current(projectId, stage, tx);
  const readiness = await blockers(projectId, stage, review, tx);
  const reviewApprovals = review ? await approvals(review, tx) : [];
  return {
    review:
      review && readiness.stale && review.status === 'COMPLETE'
        ? { ...review, status: 'STALE', detected_status: 'STALE' }
        : review,
    history: await reviewHistory(projectId, stage, tx),
    approvals: readiness.stale
      ? reviewApprovals.map((entry) => ({
          ...entry,
          invalidated: true,
          invalidation_reason: 'Authoritative source revision changed.',
        }))
      : reviewApprovals,
    requiredApprovals: review ? requiredRoles(review) : [],
    readiness,
  };
}
export const getCommercialReview = (
  projectId: string,
  stage: CommercialStage,
  tx: Executor = db
) => readModel(projectId, stage, tx);

async function audit(
  eventType: string,
  review: Row,
  actor: CommercialActor,
  tx: Executor,
  reason?: string
) {
  await recordAuditEvent(
    {
      eventType,
      subjectType: 'project_commercial_stage_review',
      subjectId: review.id,
      sourceService: 'projectCommercialReviewService',
      actor: {
        id: actor.userId,
        username: actor.displayName,
        role: actor.role,
      },
      reason,
      payload: {
        projectId: review.project_id,
        stage: review.stage_type,
        revision: review.revision_number,
        sourceRecordType: review.source_record_type,
        sourceRecordId: review.source_record_id,
      },
    },
    tx
  );
}

async function insertRevision(
  projectId: string,
  stage: CommercialStage,
  input: CommercialDraftInput,
  actor: CommercialActor,
  tx: Executor,
  revision: number
) {
  const ctx = await context(projectId, stage, tx, true);
  const source = await sourceSnapshot(projectId, stage, input, tx);
  const rfqBasis =
    stage === 'rfq_risk_assessment'
      ? null
      : await current(projectId, 'rfq_risk_assessment', tx);
  const estimateQuoteBasis =
    stage === 'contract_review'
      ? await current(projectId, 'estimate_quote', tx)
      : null;
  const requirements = {
    ...source.requirements,
    ...(input.requirements ?? {}),
    ...(stage === 'estimate_quote'
      ? {
          rfqReviewId: rfqBasis?.id,
          rfqReviewRevision: rfqBasis?.revision_number,
        }
      : {}),
    ...(stage === 'contract_review'
      ? {
          rfqReviewId: rfqBasis?.id,
          rfqReviewRevision: rfqBasis?.revision_number,
          estimateQuoteReviewId: estimateQuoteBasis?.id,
          estimateQuoteReviewRevision: estimateQuoteBasis?.revision_number,
          financeRequired: Boolean(input.financeRequired),
        }
      : {}),
  };
  const review = resultRows(
    await tx.execute(
      sql`INSERT INTO project_commercial_stage_reviews (project_id,workflow_instance_id,workflow_step_instance_id,stage_type,revision_number,status,source_record_type,source_record_id,source_revision,source_updated_at,source_snapshot,requirements_snapshot,assumptions,exclusions,differences,blockers,risks,unresolved_information_requests,sufficiently_defined,differences_resolved,effectivity_reference,owner_user_id,owner_display_name,created_by,created_by_display_name)
          VALUES (${projectId},${ctx.instance.id},${ctx.step.id},${stage},${revision},'DRAFT',${input.sourceRecordType},${input.sourceRecordId},${source.sourceRevision},${source.sourceUpdatedAt},${JSON.stringify({ ...source.snapshot, secondarySourceId: input.secondarySourceId ?? null })}::jsonb,${JSON.stringify(requirements)}::jsonb,${JSON.stringify(input.assumptions ?? [])}::jsonb,${JSON.stringify(input.exclusions ?? [])}::jsonb,${JSON.stringify(input.differences ?? [])}::jsonb,${JSON.stringify(source.eligibilityBlockers)}::jsonb,${JSON.stringify(input.risks ?? [])}::jsonb,${JSON.stringify(input.unresolvedInformationRequests ?? [])}::jsonb,${input.sufficientlyDefined ?? null},${Boolean(input.differencesResolved)},${clean(input.effectivityReference) || null},${actor.userId},${actor.displayName},${actor.userId},${actor.displayName}) RETURNING *`
    )
  )[0];
  await tx.execute(
    sql`UPDATE project_workflow_step_instances SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),blocked_reason=NULL,updated_at=now() WHERE id=${ctx.step.id}`
  );
  await audit('P2_V2_COMMERCIAL_REVIEW_DRAFT_CREATED', review, actor, tx);
  return review;
}

export async function createCommercialReview(
  projectId: string,
  stage: CommercialStage,
  input: CommercialDraftInput,
  actor: CommercialActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, stage, tx, true);
    if (await current(projectId, stage, tx))
      throw new ProjectCommercialReviewError(
        'CURRENT_REVIEW_EXISTS',
        'A current review revision already exists.',
        409
      );
    await insertRevision(projectId, stage, input, actor, tx, 1);
    return readModel(projectId, stage, tx);
  });
}

export async function updateCommercialDraft(
  projectId: string,
  stage: CommercialStage,
  reviewId: string,
  expectedRevision: number,
  input: CommercialDraftInput,
  actor: CommercialActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, stage, tx, true);
    const review = await current(projectId, stage, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedRevision
    )
      throw new ProjectCommercialReviewError(
        'STALE_REVISION',
        'The review revision changed; reload before saving.',
        409
      );
    if (review.status !== 'DRAFT')
      throw new ProjectCommercialReviewError(
        'DRAFT_REQUIRED',
        'Submitted/released review snapshots are immutable.',
        409
      );
    const source = await sourceSnapshot(projectId, stage, input, tx);
    await tx.execute(
      sql`UPDATE project_commercial_stage_reviews SET source_record_type=${input.sourceRecordType},source_record_id=${input.sourceRecordId},source_revision=${source.sourceRevision},source_updated_at=${source.sourceUpdatedAt},source_snapshot=${JSON.stringify({ ...source.snapshot, secondarySourceId: input.secondarySourceId ?? null })}::jsonb,requirements_snapshot=${JSON.stringify({ ...source.requirements, ...(input.requirements ?? {}), ...(review.requirements_snapshot?.rfqReviewId ? { rfqReviewId: review.requirements_snapshot.rfqReviewId, rfqReviewRevision: review.requirements_snapshot.rfqReviewRevision } : {}), ...(review.requirements_snapshot?.estimateQuoteReviewId ? { estimateQuoteReviewId: review.requirements_snapshot.estimateQuoteReviewId, estimateQuoteReviewRevision: review.requirements_snapshot.estimateQuoteReviewRevision } : {}), ...(stage === 'contract_review' ? { financeRequired: Boolean(input.financeRequired) } : {}) })}::jsonb,assumptions=${JSON.stringify(input.assumptions ?? [])}::jsonb,exclusions=${JSON.stringify(input.exclusions ?? [])}::jsonb,differences=${JSON.stringify(input.differences ?? [])}::jsonb,risks=${JSON.stringify(input.risks ?? [])}::jsonb,unresolved_information_requests=${JSON.stringify(input.unresolvedInformationRequests ?? [])}::jsonb,sufficiently_defined=${input.sufficientlyDefined ?? null},differences_resolved=${Boolean(input.differencesResolved)},effectivity_reference=${clean(input.effectivityReference) || null},lock_version=lock_version+1,updated_at=now() WHERE id=${reviewId} AND lock_version=${expectedRevision} AND status='DRAFT'`
    );
    await audit('P2_V2_COMMERCIAL_REVIEW_DRAFT_UPDATED', review, actor, tx);
    return readModel(projectId, stage, tx);
  });
}

export async function submitCommercialReview(
  projectId: string,
  stage: CommercialStage,
  reviewId: string,
  expectedRevision: number,
  actor: CommercialActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, stage, tx, true);
    const review = await current(projectId, stage, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedRevision
    )
      throw new ProjectCommercialReviewError(
        'STALE_REVISION',
        'The active review revision changed.',
        409
      );
    if (review.status !== 'DRAFT')
      throw new ProjectCommercialReviewError(
        'DRAFT_REQUIRED',
        'Only a draft may be submitted.',
        409
      );
    const readiness = await blockers(projectId, stage, review, tx);
    if (!readiness.ready)
      throw new ProjectCommercialReviewError(
        'REVIEW_NOT_READY',
        'Commercial review has blockers.',
        409,
        { blockers: readiness.blockers }
      );
    await tx.execute(
      sql`UPDATE project_commercial_stage_reviews SET status='PENDING_APPROVAL',submitted_at=now(),lock_version=lock_version+1,updated_at=now() WHERE id=${reviewId}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='PENDING_APPROVAL',updated_at=now() WHERE id=${ctx.step.id}`
    );
    await audit('P2_V2_COMMERCIAL_REVIEW_SUBMITTED', review, actor, tx);
    return readModel(projectId, stage, tx);
  });
}

export async function decideCommercialReview(
  projectId: string,
  stage: CommercialStage,
  reviewId: string,
  expectedRevision: number,
  capacity:
    | 'PROJECT_MANAGEMENT'
    | 'ENGINEERING'
    | 'QUALITY'
    | 'OPERATIONS'
    | 'FINANCE',
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: CommercialActor
) {
  if (!clean(signatureMeaning))
    throw new ProjectCommercialReviewError(
      'SIGNATURE_REQUIRED',
      'Signature meaning is required.'
    );
  if (decision !== 'APPROVED' && !clean(reason))
    throw new ProjectCommercialReviewError(
      'REASON_REQUIRED',
      'Rejection/return reason is required.'
    );
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, stage, tx, true);
    const review = await current(projectId, stage, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedRevision
    )
      throw new ProjectCommercialReviewError(
        'STALE_REVISION',
        'The active review revision changed.',
        409
      );
    if (review.status !== 'PENDING_APPROVAL')
      throw new ProjectCommercialReviewError(
        'PENDING_APPROVAL_REQUIRED',
        'Review is not pending approval.',
        409
      );
    if (!requiredRoles(review).includes(capacity))
      throw new ProjectCommercialReviewError(
        'APPROVAL_NOT_REQUIRED',
        `${capacity} approval is not required.`,
        409
      );
    const existing = await approvals(review, tx);
    if (
      existing.some((entry) => entry.approval_type === `COMMERCIAL_${capacity}`)
    )
      throw new ProjectCommercialReviewError(
        'DECISION_ALREADY_RECORDED',
        `${capacity} already decided this revision.`,
        409
      );
    if (
      existing.some(
        (entry) =>
          entry.actor_user_id === actor.userId && entry.decision === 'APPROVED'
      )
    )
      throw new ProjectCommercialReviewError(
        'SEGREGATION_OF_DUTIES',
        'One user cannot represent multiple required commercial functions.',
        403
      );
    await tx.execute(
      sql`INSERT INTO project_workflow_step_approvals (workflow_step_instance_id,project_id,approval_type,decision,signature_meaning,reason,actor_employee_id,actor_user_id,actor_display_name,actor_role,step_revision_snapshot,evidence_snapshot)
          VALUES (${ctx.step.id},${projectId},${`COMMERCIAL_${capacity}`},${decision},${signatureMeaning},${clean(reason) || null},${actor.employeeId ?? null},${actor.userId},${actor.displayName},${actor.role},${String(review.revision_number)},${JSON.stringify({ commercialReviewId: review.id, stage, revision: review.revision_number, sourceRecordType: review.source_record_type, sourceRecordId: review.source_record_id, sourceRevision: review.source_revision, invalidated: false })}::jsonb)`
    );
    if (decision !== 'APPROVED') {
      await tx.execute(
        sql`UPDATE project_commercial_stage_reviews SET status='REJECTED',lock_version=lock_version+1,updated_at=now() WHERE id=${review.id}`
      );
    } else {
      await tx.execute(
        sql`UPDATE project_commercial_stage_reviews SET lock_version=lock_version+1,updated_at=now() WHERE id=${review.id}`
      );
      await tx.execute(
        sql`UPDATE project_workflow_step_instances SET status='BLOCKED',blocked_reason=${`${capacity} ${decision.toLowerCase()}: ${clean(reason)}`},updated_at=now() WHERE id=${ctx.step.id}`
      );
    }
    await audit(
      `P2_V2_COMMERCIAL_${capacity}_DECIDED`,
      review,
      actor,
      tx,
      clean(reason) || undefined
    );
    return readModel(projectId, stage, tx);
  });
}

export async function completeCommercialReview(
  projectId: string,
  stage: CommercialStage,
  reviewId: string,
  expectedRevision: number,
  actor: CommercialActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, stage, tx, true);
    const review = await current(projectId, stage, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedRevision
    )
      throw new ProjectCommercialReviewError(
        'STALE_REVISION',
        'The active review revision changed.',
        409
      );
    if (review.status !== 'PENDING_APPROVAL')
      throw new ProjectCommercialReviewError(
        'PENDING_APPROVAL_REQUIRED',
        'Review must be submitted before completion.',
        409
      );
    const readiness = await blockers(projectId, stage, review, tx);
    if (!readiness.ready)
      throw new ProjectCommercialReviewError(
        'REVIEW_NOT_READY',
        'Commercial review changed or has blockers.',
        409,
        { blockers: readiness.blockers }
      );
    const evidence = await approvals(review, tx);
    const missing = requiredRoles(review).filter(
      (role) =>
        !evidence.some(
          (entry) =>
            entry.approval_type === `COMMERCIAL_${role}` &&
            entry.decision === 'APPROVED'
        )
    );
    if (missing.length)
      throw new ProjectCommercialReviewError(
        'APPROVALS_REQUIRED',
        'Required functional approvals are missing.',
        409,
        { missingApprovals: missing }
      );
    await tx.execute(
      sql`UPDATE project_commercial_stage_reviews SET status='COMPLETE',completed_at=now(),lock_version=lock_version+1,updated_at=now() WHERE id=${review.id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='COMPLETE',completed_at=now(),completed_by=${actor.employeeId ?? null},completed_by_display_name=${actor.displayName},blocked_reason=NULL,revision_reference=${String(review.revision_number)},effectivity_reference=${review.effectivity_reference},updated_at=now() WHERE id=${ctx.step.id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_links SET unlinked_at=now(),unlink_reason='Superseded commercial review evidence' WHERE workflow_step_instance_id=${ctx.step.id} AND is_authoritative=true AND unlinked_at IS NULL`
    );
    await tx.execute(
      sql`INSERT INTO project_workflow_step_links (workflow_step_instance_id,project_id,record_type,record_id,relationship_type,is_authoritative,record_revision,effectivity_reference,linked_by,linked_by_display_name)
          VALUES (${ctx.step.id},${projectId},${review.source_record_type},${review.source_record_id},'PRIMARY',true,${review.source_revision},${review.effectivity_reference},${actor.employeeId ?? null},${actor.displayName})`
    );
    await audit('P2_V2_COMMERCIAL_REVIEW_COMPLETED', review, actor, tx);
    return readModel(projectId, stage, tx);
  });
}

export async function reviseCommercialReview(
  projectId: string,
  stage: CommercialStage,
  reviewId: string,
  expectedRevision: number,
  input: CommercialDraftInput,
  actor: CommercialActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, stage, tx, true);
    const prior = await current(projectId, stage, tx);
    if (
      !prior ||
      prior.id !== reviewId ||
      Number(prior.lock_version) !== expectedRevision
    )
      throw new ProjectCommercialReviewError(
        'STALE_REVISION',
        'The active review revision changed.',
        409
      );
    if (
      !['COMPLETE', 'REJECTED', 'STALE', 'INVALIDATED'].includes(prior.status)
    )
      throw new ProjectCommercialReviewError(
        'REVISION_NOT_ALLOWED',
        'Only complete or rejected reviews may be revised.',
        409
      );
    await tx.execute(
      sql`UPDATE project_commercial_stage_reviews SET status='SUPERSEDED',superseded_at=now(),updated_at=now() WHERE id=${prior.id}`
    );
    const next = await insertRevision(
      projectId,
      stage,
      input,
      actor,
      tx,
      Number(prior.revision_number) + 1
    );
    await tx.execute(
      sql`UPDATE project_commercial_stage_reviews SET superseded_by_review_id=${next.id} WHERE id=${prior.id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_approvals SET superseded_at=now(),evidence_snapshot=jsonb_set(COALESCE(evidence_snapshot,'{}'::jsonb),'{invalidated}','true'::jsonb) WHERE workflow_step_instance_id=${prior.workflow_step_instance_id} AND evidence_snapshot->>'commercialReviewId'=${prior.id} AND superseded_at IS NULL`
    );
    await audit('P2_V2_COMMERCIAL_REVIEW_REVISED', next, actor, tx);
    return readModel(projectId, stage, tx);
  });
}

export async function evaluateCommercialBaseline(
  projectId: string,
  tx: Executor = db
) {
  const values: string[] = [];
  const differences: string[] = [];
  for (const stage of [
    'rfq_risk_assessment',
    'estimate_quote',
    'contract_review',
  ] as const) {
    const review = await current(projectId, stage, tx);
    if (!review || review.status !== 'COMPLETE') {
      values.push(`${stage} commercial review is not complete.`);
      continue;
    }
    try {
      const state = await blockers(projectId, stage, review, tx);
      if (state.stale) differences.push(...state.differences);
      if (state.stale || state.blockers.length)
        values.push(...state.blockers.map((item) => `${stage}: ${item}`));
    } catch (error) {
      if (!(error instanceof ProjectCommercialReviewError)) throw error;
      const difference = `${stage}: authoritative source is unavailable or ineligible (${error.message})`;
      values.push(difference);
      differences.push(difference);
    }
  }
  return {
    valid: values.length === 0,
    blockers: Array.from(new Set(values)),
    differences: Array.from(new Set(differences)),
  };
}
