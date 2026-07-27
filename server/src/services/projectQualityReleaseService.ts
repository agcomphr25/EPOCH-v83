import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { recordAuditEvent, type AuditLedgerTx } from './auditLedgerService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';
import {
  evaluateQualityReadiness,
  validateReleaseSelection,
} from './projectQualityReleaseRules';
import type { ProductionActor } from './projectProductionExecutionService';

type Executor = AuditLedgerTx;
// Raw SQL intentionally reads existing authoritative Quality tables without taking ownership.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const rows = <T extends Row>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : ((value as { rows?: T[] } | null)?.rows ?? []);
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class ProjectQualityReleaseError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

async function context(projectId: string, tx: Executor, lock = false) {
  const project = rows(
    await tx.execute(sql`
    SELECT p.id,p.workflow_version,p.po_id,p.current_stage,p.status,po.po_number,po.customer_name
    FROM projects p LEFT JOIN p2_purchase_orders po ON po.id=p.po_id
    WHERE p.id=${projectId} ${lock ? sql`FOR UPDATE OF p` : sql``}`)
  )[0];
  if (!project)
    throw new ProjectQualityReleaseError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  let version;
  try {
    version = resolveProjectWorkflowVersion(project.workflow_version);
  } catch {
    throw new ProjectQualityReleaseError(
      'UNKNOWN_WORKFLOW_VERSION',
      'The project workflow version is not recognized.',
      409
    );
  }
  if (version !== 'p2_v2')
    throw new ProjectQualityReleaseError(
      'P2_V2_REQUIRED',
      'Quality Product Release requires an explicit p2_v2 project.',
      409
    );
  const instance = rows(
    await tx.execute(sql`
    SELECT * FROM project_workflow_instances WHERE project_id=${projectId}
      AND workflow_version='p2_v2' AND status NOT IN ('SUPERSEDED','CANCELLED')
    ${lock ? sql`FOR UPDATE` : sql``}`)
  );
  if (instance.length !== 1)
    throw new ProjectQualityReleaseError(
      'WORKFLOW_INSTANCE_REQUIRED',
      'Exactly one active p2_v2 workflow is required.',
      409
    );
  const steps = rows(
    await tx.execute(sql`
    SELECT * FROM project_workflow_step_instances WHERE workflow_instance_id=${instance[0].id} ORDER BY step_order`)
  );
  const productionStep = steps.find(
    (entry) => entry.step_type === 'production_quality'
  );
  const qualityStep = steps.find(
    (entry) => entry.step_type === 'final_release_shipping'
  );
  if (!productionStep || productionStep.status !== 'COMPLETE')
    throw new ProjectQualityReleaseError(
      'CURRENT_PRODUCTION_COMPLETION_REQUIRED',
      'Stage 8 Production must be complete before Quality review.',
      409
    );
  if (!qualityStep)
    throw new ProjectQualityReleaseError(
      'QUALITY_STAGE_REQUIRED',
      'Stage 9 Quality is missing.',
      409
    );
  const productionReview = rows(
    await tx.execute(sql`
    SELECT * FROM project_production_stage_reviews WHERE project_id=${projectId}
      AND status='COMPLETE' ORDER BY revision_number DESC LIMIT 1`)
  )[0];
  if (!productionReview)
    throw new ProjectQualityReleaseError(
      'CURRENT_PRODUCTION_COMPLETION_REQUIRED',
      'Immutable Production completion evidence is required.',
      409
    );
  return {
    project,
    instance: instance[0],
    productionStep,
    qualityStep,
    productionReview,
  };
}

async function evidence(projectId: string, tx: Executor) {
  const ctx = await context(projectId, tx);
  const production = ctx.productionReview.evidence_snapshot ?? {};
  const items = rows(
    await tx.execute(sql`
    SELECT si.id,si.serial_number,si.part_number,si.status,si.final_qc_completed_at,
      si.po_item_id,COALESCE(si.customer_serial_number,si.serial_number) AS release_serial,
      fir.id AS inspection_id,fir.overall_result,fir.inspection_type,
      fir.non_conformance_ids,fir.qa_mgr_approval
    FROM p2_serialized_items si
    LEFT JOIN LATERAL (
      SELECT f.* FROM p2_final_inspection_results f WHERE f.serialized_item_id=si.id
      ORDER BY f.inspection_date DESC LIMIT 1
    ) fir ON true
    WHERE si.po_id=${ctx.project.po_id} ORDER BY si.part_number,si.sequence_number`)
  );
  const ncrs = rows(
    await tx.execute(sql`
    SELECT id,serial_number,quantity,status,disposition,disposition_approved_at,
      effectiveness_status FROM nonconformance_records
    WHERE po_number=${ctx.project.po_number} AND COALESCE(status,'Open') NOT IN ('Resolved','Closed')`)
  );
  const releases = rows(
    await tx.execute(sql`
    SELECT * FROM project_product_releases WHERE project_id=${projectId} ORDER BY released_at DESC`)
  );
  const holds = rows(
    await tx.execute(sql`
    SELECT h.* FROM project_product_release_holds h WHERE h.project_id=${projectId} ORDER BY placed_at DESC`)
  );
  const currentReleased = releases
    .filter((r) => !['HELD', 'REVOKED'].includes(r.release_decision))
    .reduce((sum, r) => sum + Number(r.released_quantity), 0);
  const accepted = items.filter(
    (item) =>
      item.status !== 'SCRAPPED' &&
      item.overall_result === 'PASS' &&
      item.final_qc_completed_at
  ).length;
  const activeHold = holds.some((hold) => hold.status === 'ACTIVE');
  const review =
    rows(
      await tx.execute(sql`
    SELECT * FROM project_quality_reviews WHERE project_id=${projectId}
      AND status NOT IN ('INVALIDATED','SUPERSEDED') ORDER BY revision_number DESC LIMIT 1`)
    )[0] ?? null;
  const approvals = review
    ? rows(
        await tx.execute(sql`
    SELECT * FROM project_quality_review_approvals WHERE quality_review_id=${review.id} ORDER BY decided_at`)
      )
    : [];
  const documentManifest = Array.isArray(production.documentManifest)
    ? production.documentManifest
    : [];
  const rules = evaluateQualityReadiness({
    productionComplete: true,
    productionCurrent: ctx.productionReview.status === 'COMPLETE',
    acceptedQuantity: accepted,
    scrappedQuantity: items.filter((item) => item.status === 'SCRAPPED').length,
    previouslyReleasedQuantity: currentReleased,
    finalInspectionRequired: true,
    finalInspectionComplete:
      items.length > 0 &&
      items
        .filter((item) => item.status !== 'SCRAPPED')
        .every(
          (item) => item.final_qc_completed_at && item.overall_result === 'PASS'
        ),
    fullInspectionRequired: Boolean(production.fullInspectionRequired),
    allCharacteristicsAccepted: !items.some(
      (item) => item.overall_result !== 'PASS'
    ),
    samplingRequired: Boolean(production.samplingRequired),
    samplingPlanApproved: production.samplingPlanApproved === true,
    samplePassed: production.samplePassed === true,
    faiRequired: Boolean(production.faiRequired),
    faiApproved: production.faiApproved === true,
    testsRequired: Boolean(production.testsRequired),
    testsPassed: production.testsPassed === true,
    certificatesRequired: Boolean(production.certificatesRequired),
    certificatesCurrent:
      !production.certificatesRequired || documentManifest.length > 0,
    traceabilityComplete: items.every((item) => item.release_serial),
    openNcrQuantity: ncrs.reduce(
      (sum, ncr) => sum + Number(ncr.quantity ?? 1),
      0
    ),
    reworkPendingReinspection: items.some(
      (item) => item.status === 'REWORK' && item.overall_result !== 'PASS'
    ),
    activeHold,
    configurationCurrent: true,
  });
  return {
    ctx,
    items,
    ncrs,
    releases,
    holds,
    review,
    approvals,
    documentManifest,
    production,
    readiness: rules,
  };
}

export async function getQualityDashboard(
  projectId: string,
  tx: Executor = db
) {
  return evidence(projectId, tx);
}

export async function createQualityReview(
  projectId: string,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const model = await evidence(projectId, tx);
    if (model.review && !['COMPLETE', 'STALE'].includes(model.review.status))
      throw new ProjectQualityReleaseError(
        'QUALITY_REVIEW_EXISTS',
        'A current Quality review already exists.',
        409
      );
    const revision = Number(model.review?.revision_number ?? 0) + 1;
    const inserted = rows(
      await tx.execute(sql`
      INSERT INTO project_quality_reviews(project_id,workflow_instance_id,workflow_step_instance_id,
        production_review_id,revision_number,status,production_completion_revision,
        production_plan_revision,wad_revision,configuration_baseline_id,effectivity_reference,
        evidence_snapshot,document_manifest,blockers,warnings,created_by,created_by_display_name)
      VALUES (${projectId},${model.ctx.instance.id},${model.ctx.qualityStep.id},${model.ctx.productionReview.id},
        ${revision},${model.readiness.blockers.length ? 'BLOCKED' : 'IN_PROGRESS'},${model.ctx.productionReview.revision_number},
        ${model.ctx.productionReview.production_plan_revision},${model.ctx.productionReview.wad_revision},
        ${model.ctx.productionReview.configuration_baseline_id},${model.ctx.productionReview.effectivity_reference},
        ${JSON.stringify({ items: model.items, ncrs: model.ncrs, production: model.production })}::jsonb,
        ${JSON.stringify(model.documentManifest)}::jsonb,${JSON.stringify(model.readiness.blockers)}::jsonb,
        '[]'::jsonb,${actor.userId},${actor.displayName}) RETURNING *`)
    )[0];
    await tx.execute(sql`UPDATE project_workflow_step_instances SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),
      updated_at=now() WHERE id=${model.ctx.qualityStep.id}
        AND status IN ('NOT_STARTED','NOT_APPLICABLE')`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_QUALITY_REVIEW_CREATED',
        subjectType: 'project_quality_review',
        subjectId: inserted.id,
        sourceService: 'projectQualityReleaseService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          revision,
          productionCompletionRevision:
            model.ctx.productionReview.revision_number,
        },
      },
      tx
    );
    return getQualityDashboard(projectId, tx);
  });
}

export async function submitQualityReview(
  projectId: string,
  expectedLockVersion: number,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const model = await evidence(projectId, tx);
    if (
      !model.review ||
      !['IN_PROGRESS', 'BLOCKED'].includes(model.review.status)
    )
      throw new ProjectQualityReleaseError(
        'QUALITY_REVIEW_NOT_SUBMITTABLE',
        'A current in-progress Quality review is required.',
        409
      );
    if (Number(model.review.lock_version) !== expectedLockVersion)
      throw new ProjectQualityReleaseError(
        'STALE_WRITE',
        'The Quality review is stale.',
        409
      );
    if (model.readiness.blockers.length)
      throw new ProjectQualityReleaseError(
        'QUALITY_READINESS_BLOCKED',
        'Quality evidence blockers must be resolved before submission.',
        409,
        { blockers: model.readiness.blockers }
      );
    await tx.execute(sql`UPDATE project_quality_reviews
      SET status='READY_FOR_REVIEW',submitted_at=now(),lock_version=lock_version+1,
        evidence_snapshot=${JSON.stringify({ items: model.items, ncrs: model.ncrs, production: model.production })}::jsonb,
        document_manifest=${JSON.stringify(model.documentManifest)}::jsonb,
        blockers='[]'::jsonb,updated_at=now()
      WHERE id=${model.review.id} AND lock_version=${expectedLockVersion}`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_QUALITY_REVIEW_SUBMITTED',
        subjectType: 'project_quality_review',
        subjectId: model.review.id,
        sourceService: 'projectQualityReleaseService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, revision: model.review.revision_number },
      },
      tx
    );
    return getQualityDashboard(projectId, tx);
  });
}

export async function decideQualityReview(
  projectId: string,
  expectedLockVersion: number,
  approvalType: string,
  decision: string,
  signatureMeaning: string,
  reason: string,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const model = await evidence(projectId, tx);
    if (!model.review)
      throw new ProjectQualityReleaseError(
        'QUALITY_REVIEW_REQUIRED',
        'Create a Quality review first.',
        409
      );
    if (model.review.status !== 'READY_FOR_REVIEW')
      throw new ProjectQualityReleaseError(
        'QUALITY_REVIEW_NOT_PENDING_APPROVAL',
        'Submit the Quality review before recording approvals.',
        409
      );
    if (Number(model.review.lock_version) !== expectedLockVersion)
      throw new ProjectQualityReleaseError(
        'STALE_WRITE',
        'The Quality review is stale.',
        409
      );
    await tx.execute(sql`INSERT INTO project_quality_review_approvals(project_id,quality_review_id,
      quality_review_revision,approval_type,decision,signature_meaning,reason,evidence_snapshot_hash,
      actor_user_id,actor_employee_id,actor_display_name,actor_role)
      VALUES(${projectId},${model.review.id},${model.review.revision_number},${approvalType},${decision},
      ${signatureMeaning},${reason},${digest(model.review.evidence_snapshot)},${actor.userId},${actor.employeeId ?? null},
      ${actor.displayName},${actor.role})
      ON CONFLICT(quality_review_id,approval_type) DO UPDATE SET decision=EXCLUDED.decision,
      signature_meaning=EXCLUDED.signature_meaning,reason=EXCLUDED.reason,
      actor_user_id=EXCLUDED.actor_user_id,actor_employee_id=EXCLUDED.actor_employee_id,
      actor_display_name=EXCLUDED.actor_display_name,actor_role=EXCLUDED.actor_role,decided_at=now()`);
    await tx.execute(sql`UPDATE project_quality_reviews
      SET lock_version=lock_version+1,updated_at=now()
      WHERE id=${model.review.id} AND lock_version=${expectedLockVersion}`);
    return getQualityDashboard(projectId, tx);
  });
}

export async function completeQualityReview(
  projectId: string,
  expectedLockVersion: number,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const model = await evidence(projectId, tx);
    if (!model.review || model.review.status !== 'READY_FOR_REVIEW')
      throw new ProjectQualityReleaseError(
        'QUALITY_REVIEW_NOT_PENDING_APPROVAL',
        'A submitted Quality review is required.',
        409
      );
    if (Number(model.review.lock_version) !== expectedLockVersion)
      throw new ProjectQualityReleaseError(
        'STALE_WRITE',
        'The Quality review is stale.',
        409
      );
    if (model.readiness.blockers.length)
      throw new ProjectQualityReleaseError(
        'QUALITY_EVIDENCE_STALE',
        'Authoritative Quality evidence no longer supports release.',
        409,
        { blockers: model.readiness.blockers }
      );
    const missing = ['QUALITY', 'OPERATIONS', 'PROJECT_MANAGEMENT'].filter(
      (type) =>
        !model.approvals.some(
          (entry) =>
            entry.approval_type === type && entry.decision === 'APPROVED'
        )
    );
    if (missing.length)
      throw new ProjectQualityReleaseError(
        'QUALITY_APPROVALS_REQUIRED',
        'All required functional approvals must be recorded.',
        409,
        { missingApprovals: missing }
      );
    await tx.execute(sql`UPDATE project_quality_reviews
      SET status='READY_FOR_RELEASE',completed_at=now(),lock_version=lock_version+1,updated_at=now()
      WHERE id=${model.review.id} AND lock_version=${expectedLockVersion}`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_QUALITY_REVIEW_COMPLETED',
        subjectType: 'project_quality_review',
        subjectId: model.review.id,
        sourceService: 'projectQualityReleaseService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, revision: model.review.revision_number },
      },
      tx
    );
    return getQualityDashboard(projectId, tx);
  });
}

export type ReleaseInput = {
  expectedLockVersion: number;
  idempotencyKey: string;
  poLineId?: number;
  partNumber: string;
  partRevision?: string;
  quantity: number;
  serialNumbers: string[];
  batchLots: string[];
  signatureMeaning: string;
  certificationFailurePoint?: 'AFTER_RELEASE' | 'AFTER_ALLOCATIONS';
};

export async function releaseProduct(
  projectId: string,
  input: ReleaseInput,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`p2-v2-release:${projectId}`}))`
    );
    const model = await evidence(projectId, tx);
    const requestHash = digest(input);
    const prior = rows(
      await tx.execute(sql`SELECT * FROM project_product_releases
      WHERE project_id=${projectId} AND idempotency_key=${input.idempotencyKey}`)
    )[0];
    if (prior) {
      if (prior.request_hash !== requestHash)
        throw new ProjectQualityReleaseError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was already used for another release.',
          409
        );
      return { release: prior, dashboard: model, idempotentReplay: true };
    }
    if (
      !model.review ||
      !['READY_FOR_RELEASE', 'PARTIALLY_RELEASED'].includes(model.review.status)
    )
      throw new ProjectQualityReleaseError(
        'READY_FOR_RELEASE_REQUIRED',
        'The Quality review is not READY_FOR_RELEASE.',
        409
      );
    if (Number(model.review.lock_version) !== input.expectedLockVersion)
      throw new ProjectQualityReleaseError(
        'STALE_WRITE',
        'The Quality review is stale.',
        409
      );
    try {
      validateReleaseSelection({
        requestedQuantity: input.quantity,
        eligibleQuantity: model.readiness.eligibleQuantity,
        serialNumbers: input.serialNumbers,
        batchLots: input.batchLots,
      });
    } catch (error) {
      throw new ProjectQualityReleaseError(
        (error as Error).message,
        'The selected release quantity or identity is not eligible.',
        409
      );
    }
    const eligibleSerials = new Set(
      model.items
        .filter(
          (item) => item.overall_result === 'PASS' && item.status !== 'SCRAPPED'
        )
        .map((item) => String(item.release_serial))
    );
    if (input.serialNumbers.some((serial) => !eligibleSerials.has(serial)))
      throw new ProjectQualityReleaseError(
        'SERIAL_NOT_ELIGIBLE',
        'One or more serials are not accepted and eligible.',
        409
      );
    const releaseNumber = `PR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${digest([projectId, input.idempotencyKey]).slice(0, 8).toUpperCase()}`;
    const release = rows(
      await tx.execute(sql`INSERT INTO project_product_releases(
      release_number,project_id,workflow_instance_id,quality_review_id,quality_review_revision,
      production_completion_revision,customer_po_id,customer_po_line_id,part_number,part_revision,
      released_quantity,serial_numbers,batch_lots,configuration_baseline_id,effectivity_reference,
      evidence_snapshot,document_manifest,signature_meaning,released_by,released_by_employee_id,
      released_by_display_name,released_by_role,idempotency_key,request_hash)
      VALUES(${releaseNumber},${projectId},${model.ctx.instance.id},${model.review.id},${model.review.revision_number},
      ${model.ctx.productionReview.revision_number},${model.ctx.project.po_id},${input.poLineId ?? null},
      ${input.partNumber},${input.partRevision ?? null},${input.quantity},${JSON.stringify(input.serialNumbers)}::jsonb,
      ${JSON.stringify(input.batchLots)}::jsonb,${model.ctx.productionReview.configuration_baseline_id},
      ${model.ctx.productionReview.effectivity_reference},${JSON.stringify(model.review.evidence_snapshot)}::jsonb,
      ${JSON.stringify(model.documentManifest)}::jsonb,${input.signatureMeaning},${actor.userId},
      ${actor.employeeId ?? null},${actor.displayName},${actor.role},${input.idempotencyKey},${requestHash}) RETURNING *`)
    )[0];
    if (
      input.certificationFailurePoint === 'AFTER_RELEASE' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectQualityReleaseError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after release insert.',
        409
      );
    for (const serial of input.serialNumbers)
      await tx.execute(sql`INSERT INTO project_product_release_allocations(
      product_release_id,project_id,po_line_id,part_number,serial_number,quantity)
      VALUES(${release.id},${projectId},${input.poLineId ?? null},${input.partNumber},${serial},1)`);
    for (const batch of input.batchLots)
      await tx.execute(sql`INSERT INTO project_product_release_allocations(
      product_release_id,project_id,po_line_id,part_number,batch_lot,quantity)
      VALUES(${release.id},${projectId},${input.poLineId ?? null},${input.partNumber},${batch},
      ${input.quantity / Math.max(1, input.batchLots.length)})`);
    if (
      input.certificationFailurePoint === 'AFTER_ALLOCATIONS' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectQualityReleaseError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after allocation insert.',
        409
      );
    const remainingQuantity = Math.max(
      0,
      model.readiness.eligibleQuantity - input.quantity
    );
    const reviewStatus =
      remainingQuantity === 0 ? 'COMPLETE' : 'PARTIALLY_RELEASED';
    await tx.execute(sql`UPDATE project_quality_reviews SET status=${reviewStatus},
      lock_version=lock_version+1,updated_at=now() WHERE id=${model.review.id}`);
    if (reviewStatus === 'COMPLETE')
      await tx.execute(sql`UPDATE project_workflow_step_instances
        SET status='COMPLETE',completed_at=now(),completed_by=${actor.userId},
          completed_by_display_name=${actor.displayName},updated_at=now()
        WHERE id=${model.ctx.qualityStep.id} AND status='IN_PROGRESS'`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCT_RELEASED',
        subjectType: 'project_product_release',
        subjectId: release.id,
        sourceService: 'projectQualityReleaseService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          releaseNumber,
          quantity: input.quantity,
          serialNumbers: input.serialNumbers,
          batchLots: input.batchLots,
          shipmentCreated: false,
          remainingQuantity,
          stage9Complete: reviewStatus === 'COMPLETE',
        },
      },
      tx
    );
    return {
      release,
      dashboard: await getQualityDashboard(projectId, tx),
      idempotentReplay: false,
    };
  });
}

export async function placeReleaseHold(
  projectId: string,
  releaseId: string,
  reason: string,
  quantity: number,
  serials: string[],
  batches: string[],
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const release = rows(
      await tx.execute(sql`SELECT * FROM project_product_releases
      WHERE id=${releaseId} AND project_id=${projectId} FOR UPDATE`)
    )[0];
    if (!release)
      throw new ProjectQualityReleaseError(
        'PRODUCT_RELEASE_NOT_FOUND',
        'Product Release not found.',
        404
      );
    const hold = rows(
      await tx.execute(sql`INSERT INTO project_product_release_holds(project_id,
      product_release_id,reason,affected_serials,affected_batches,affected_quantity,placed_by,placed_by_display_name)
      VALUES(${projectId},${releaseId},${reason},${JSON.stringify(serials)}::jsonb,${JSON.stringify(batches)}::jsonb,
      ${quantity},${actor.userId},${actor.displayName}) RETURNING *`)
    )[0];
    await tx.execute(
      sql`UPDATE project_product_releases SET release_decision='HELD',shipping_status='BLOCKED' WHERE id=${releaseId}`
    );
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCT_RELEASE_HELD',
        subjectType: 'project_product_release_hold',
        subjectId: hold.id,
        sourceService: 'projectQualityReleaseService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, releaseId, reason, quantity },
      },
      tx
    );
    return getQualityDashboard(projectId, tx);
  });
}

export async function releaseProductHold(
  projectId: string,
  releaseId: string,
  holdId: string,
  releaseReason: string,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const hold = rows(
      await tx.execute(sql`SELECT * FROM project_product_release_holds
        WHERE id=${holdId} AND product_release_id=${releaseId}
          AND project_id=${projectId} AND status='ACTIVE' FOR UPDATE`)
    )[0];
    if (!hold)
      throw new ProjectQualityReleaseError(
        'ACTIVE_RELEASE_HOLD_NOT_FOUND',
        'Active Product Release hold not found.',
        404
      );
    await tx.execute(sql`UPDATE project_product_release_holds SET status='RELEASED',
      released_by=${actor.userId},released_by_display_name=${actor.displayName},
      release_reason=${releaseReason},released_at=now() WHERE id=${holdId}`);
    const remaining = rows(
      await tx.execute(sql`SELECT id FROM project_product_release_holds
        WHERE product_release_id=${releaseId} AND status='ACTIVE' LIMIT 1`)
    );
    if (!remaining.length)
      await tx.execute(sql`UPDATE project_product_releases
        SET release_decision='RELEASED',shipping_status='AVAILABLE'
        WHERE id=${releaseId} AND project_id=${projectId}`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCT_RELEASE_HOLD_RELEASED',
        subjectType: 'project_product_release_hold',
        subjectId: holdId,
        sourceService: 'projectQualityReleaseService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, releaseId, releaseReason },
      },
      tx
    );
    return getQualityDashboard(projectId, tx);
  });
}
