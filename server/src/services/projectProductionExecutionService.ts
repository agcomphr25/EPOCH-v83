import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  jsonValuesEqual,
  recordAuditEvent,
  type AuditLedgerTx,
  type JsonValue,
} from './auditLedgerService';
import { getCurrentProductionPlan } from './projectProductionPlanningService';
import { getCurrentWadAuthorization } from './projectWadAuthorizationService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';
import { validateWorkflowInstanceIntegrity } from './projectWorkflowInstanceIntegrity';
import {
  evaluateProductionCompletion,
  type ProductionEvidenceInput,
} from './projectProductionExecutionRules';

type Executor = AuditLedgerTx;
// Raw queries keep Phase 9A additive and preserve authoritative table ownership.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type ProductionActor = {
  userId: number;
  employeeId?: number | null;
  username: string;
  displayName: string;
  role: string;
};

export class ProjectProductionExecutionError extends Error {
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
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const intArray = (values: number[]) =>
  values.length
    ? sql`ARRAY[${sql.join(
        values.map((value) => sql`${value}`),
        sql`,`
      )}]::int[]`
    : sql`ARRAY[]::int[]`;
const uuidArray = (values: string[]) =>
  values.length
    ? sql`ARRAY[${sql.join(
        values.map((value) => sql`${value}`),
        sql`,`
      )}]::uuid[]`
    : sql`ARRAY[]::uuid[]`;
const textArray = (values: string[]) =>
  values.length
    ? sql`ARRAY[${sql.join(
        values.map((value) => sql`${value}`),
        sql`,`
      )}]::text[]`
    : sql`ARRAY[]::text[]`;

export async function getTravelerProductionExecutionGate(
  travelerId: string,
  tx: Executor = db
) {
  const linked = rows(
    await tx.execute(sql`
      SELECT t.id,COALESCE(t.project_id,pwo.project_id) AS project_id,
             p.workflow_version,p.current_stage
      FROM travelers t
      LEFT JOIN production_work_orders pwo ON pwo.id=t.production_work_order_id
      LEFT JOIN projects p ON p.id=COALESCE(t.project_id,pwo.project_id)
      WHERE t.id=${travelerId} LIMIT 1`)
  )[0];
  if (!linked?.project_id)
    return { allowed: true, appliesToV2: false, reason: null };
  return getProjectProductionExecutionGate(String(linked.project_id), tx);
}

export async function getProjectProductionExecutionGate(
  projectId: string,
  tx: Executor = db
) {
  const linked = rows(
    await tx.execute(sql`
      SELECT id,workflow_version,current_stage FROM projects
      WHERE id=${projectId} LIMIT 1`)
  )[0];
  if (!linked)
    return {
      allowed: false,
      appliesToV2: true,
      code: 'PROJECT_NOT_FOUND',
      reason: 'The linked project does not exist.',
    };
  let version;
  try {
    version = resolveProjectWorkflowVersion(linked.workflow_version);
  } catch {
    return {
      allowed: false,
      appliesToV2: true,
      code: 'UNKNOWN_WORKFLOW_VERSION',
      reason: 'The linked project workflow version is not recognized.',
    };
  }
  if (version !== 'p2_v2')
    return { allowed: true, appliesToV2: false, reason: null };
  const launch = rows(
    await tx.execute(sql`
      SELECT pl.id FROM project_production_launches pl
      JOIN project_production_releases pr ON pr.id=pl.production_release_id
        AND pr.project_id=pl.project_id AND pr.status='APPROVED'
      JOIN project_workflow_step_instances psi ON psi.project_id=pl.project_id
        AND psi.step_type='production_quality' AND psi.status='IN_PROGRESS'
      WHERE pl.project_id=${projectId} AND pl.status='COMPLETE'
      LIMIT 1`)
  )[0];
  if (!launch || linked.current_stage !== 'IN_PRODUCTION')
    return {
      allowed: false,
      appliesToV2: true,
      code: 'CERTIFIED_PRODUCTION_LAUNCH_REQUIRED',
      reason:
        'P2 V2 work cannot start before certified Production Launch activates Stage 8.',
    };
  return { allowed: true, appliesToV2: true, reason: null };
}

async function context(
  projectId: string,
  tx: Executor,
  lock = false,
  requireActive = true
) {
  const project = rows(
    await tx.execute(sql`
      SELECT p.id,p.workflow_version,p.po_id,p.current_stage,p.status,
             po.po_number,po.customer_name
      FROM projects p
      LEFT JOIN p2_purchase_orders po ON po.id=p.po_id
      WHERE p.id=${projectId} ${lock ? sql`FOR UPDATE OF p` : sql``}`)
  )[0];
  if (!project)
    throw new ProjectProductionExecutionError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  let version;
  try {
    version = resolveProjectWorkflowVersion(project.workflow_version);
  } catch {
    throw new ProjectProductionExecutionError(
      'UNKNOWN_WORKFLOW_VERSION',
      'The project workflow version is not recognized.',
      409
    );
  }
  if (version !== 'p2_v2')
    throw new ProjectProductionExecutionError(
      'P2_V2_REQUIRED',
      'Production-stage controls require an explicit p2_v2 project.',
      409
    );
  const instance = rows(
    await tx.execute(sql`
      SELECT * FROM project_workflow_instances
      WHERE project_id=${projectId} AND workflow_version='p2_v2'
        AND status NOT IN ('SUPERSEDED','CANCELLED')
      ${lock ? sql`FOR UPDATE` : sql``}`)
  );
  if (instance.length !== 1)
    throw new ProjectProductionExecutionError(
      instance.length
        ? 'DUPLICATE_ACTIVE_INSTANCES'
        : 'WORKFLOW_INSTANCE_REQUIRED',
      'Exactly one active p2_v2 workflow instance is required.',
      409
    );
  const steps = rows(
    await tx.execute(sql`
      SELECT * FROM project_workflow_step_instances
      WHERE workflow_instance_id=${instance[0].id} ORDER BY step_order`)
  );
  const issues = validateWorkflowInstanceIntegrity(instance[0], steps);
  if (issues.length)
    throw new ProjectProductionExecutionError(
      'WORKFLOW_INTEGRITY_FAILED',
      'The V2 workflow failed integrity validation.',
      409,
      { issues }
    );
  const step = steps.find((entry) => entry.step_type === 'production_quality');
  if (!step)
    throw new ProjectProductionExecutionError(
      'PRODUCTION_STAGE_REQUIRED',
      'Stage 8 Production is missing.',
      409
    );
  const launch = rows(
    await tx.execute(sql`
      SELECT pl.*,pr.production_plan_revision,pr.wad_revision,
             pr.configuration_baseline_id,pr.effectivity_reference
      FROM project_production_launches pl
      JOIN project_production_releases pr ON pr.id=pl.production_release_id
        AND pr.project_id=pl.project_id
      WHERE pl.project_id=${projectId} AND pl.status='COMPLETE'
      ORDER BY pl.launched_at DESC LIMIT 1`)
  )[0];
  if (!launch)
    throw new ProjectProductionExecutionError(
      'CERTIFIED_PRODUCTION_LAUNCH_REQUIRED',
      'Stage 8 can become active only through completed V2 Production Launch evidence.',
      409
    );
  if (
    project.current_stage !== 'IN_PRODUCTION' ||
    (requireActive
      ? step.status !== 'IN_PROGRESS'
      : !['IN_PROGRESS', 'COMPLETE'].includes(step.status))
  )
    throw new ProjectProductionExecutionError(
      'PRODUCTION_STAGE_NOT_ACTIVE',
      'The project and Stage 8 must have been activated by Production Launch.',
      409
    );
  if (!project.po_id)
    throw new ProjectProductionExecutionError(
      'PROJECT_PO_REQUIRED',
      'The project must retain its launched customer PO association.',
      409
    );
  return { project, instance: instance[0], steps, step, launch };
}

async function collectEvidence(
  projectId: string,
  tx: Executor,
  requireActive = true
) {
  const ctx = await context(projectId, tx, false, requireActive);
  const plan = await getCurrentProductionPlan(projectId, tx);
  const wad = await getCurrentWadAuthorization(projectId, tx);
  const launchEvidence = ctx.launch.production_evidence ?? {};
  const orderIds: number[] = Array.isArray(
    launchEvidence.createdProductionOrderIds
  )
    ? launchEvidence.createdProductionOrderIds
        .map(Number)
        .filter(Number.isFinite)
    : [];
  const serialIds: string[] = Array.isArray(
    launchEvidence.createdSerializedItemIds
  )
    ? launchEvidence.createdSerializedItemIds.map(String)
    : [];
  const productionOrders = rows(
    await tx.execute(sql`
      SELECT * FROM p2_production_orders
      WHERE p2_po_id=${ctx.project.po_id}
        AND id = ANY(${intArray(orderIds)})
      ORDER BY sku,id`)
  );
  const serializedItems = rows(
    await tx.execute(sql`
      SELECT * FROM p2_serialized_items
      WHERE po_id=${ctx.project.po_id}
        AND id = ANY(${uuidArray(serialIds)})
      ORDER BY part_number,sequence_number`)
  );
  const travelers = rows(
    await tx.execute(sql`
      SELECT t.*,
        count(ts.id)::int AS operation_count,
        count(ts.id) FILTER (WHERE ts.status='COMPLETED')::int AS completed_operation_count,
        count(ts.id) FILTER (WHERE ts.status='COMPLETED'
          AND (ts.completed_at IS NULL OR ts.completed_by IS NULL))::int AS unattributed_operation_count
      FROM travelers t
      LEFT JOIN traveler_steps ts ON ts.traveler_id=t.id
      WHERE t.production_work_order_id IN (
        SELECT id FROM production_work_orders WHERE project_id=${projectId})
        OR t.serial_number IN (
          SELECT serial_number FROM p2_serialized_items
          WHERE id=ANY(${uuidArray(serialIds)}))
      GROUP BY t.id ORDER BY t.created_at`)
  );
  const holds = rows(
    await tx.execute(sql`
      SELECT * FROM project_production_holds
      WHERE project_id=${projectId} ORDER BY placed_at DESC`)
  );
  const ncrs = rows(
    await tx.execute(sql`
      SELECT * FROM nonconformance_records
      WHERE p1_or_p2='P2' AND status<>'Resolved'
        AND (order_id=ANY(${textArray(
          productionOrders.map((entry) => String(entry.order_id))
        )})
          OR serial_number=ANY(${textArray(
            serializedItems.map((entry) => String(entry.serial_number))
          )}))
      ORDER BY created_at`)
  );
  const traceability = rows(
    await tx.execute(sql`
      SELECT tr.* FROM p2_serialized_item_traceability tr
      WHERE tr.serialized_item_id=ANY(${uuidArray(serialIds)})`)
  );
  const labor = rows(
    await tx.execute(sql`
      SELECT count(*)::int AS entry_count,
        count(*) FILTER (WHERE clock_out IS NULL)::int AS open_count,
        COALESCE(sum(EXTRACT(EPOCH FROM (clock_out-clock_in))/3600)
          FILTER (WHERE clock_out IS NOT NULL),0)::numeric AS actual_hours
      FROM time_clock_entries
      WHERE traveler_id=ANY(${uuidArray(
        travelers.map((entry) => String(entry.id))
      )})`)
  )[0] ?? { entry_count: 0, open_count: 0, actual_hours: 0 };
  const requiredManufacturedItems = plan.items.filter(
    (item: Row) => item.make_buy === 'MAKE'
  );
  const completedQuantity = productionOrders.reduce(
    (sum, entry) => sum + Number(entry.quantity_manufactured ?? 0),
    0
  );
  const scrappedQuantity = serializedItems.filter(
    (entry) => entry.status === 'SCRAPPED'
  ).length;
  const rejectedQuantity = serializedItems.filter(
    (entry) => entry.status === 'REJECTED'
  ).length;
  const acceptedQuantity = Math.max(
    0,
    completedQuantity - rejectedQuantity - scrappedQuantity
  );
  const baselineChanged =
    Number(ctx.launch.production_plan_revision) !==
      Number(plan.plan?.revision_number) ||
    Number(ctx.launch.wad_revision) !==
      Number(wad.authorization?.wad_revision) ||
    String(ctx.launch.configuration_baseline_id) !==
      String(plan.plan?.configuration_baseline_id);
  const travelerRequiredItems = requiredManufacturedItems.filter(
    (item: Row) => item.traveler_requirement === 'REQUIRED'
  );
  const travelerMode: ProductionEvidenceInput['travelerMode'] =
    travelerRequiredItems.length === 0
      ? 'NO_TRAVELER_EXCEPTION'
      : travelerRequiredItems.some(
            (item: Row) => item.traveler_type === 'INDIVIDUAL'
          )
        ? 'INDIVIDUAL'
        : 'BATCH';
  const noTravelerExceptionApproved = requiredManufacturedItems
    .filter(
      (item: Row) => item.traveler_requirement === 'NOT_REQUIRED_APPROVED'
    )
    .every(
      (item: Row) =>
        typeof item.traveler_not_required_reason === 'string' &&
        item.traveler_not_required_reason.trim().length > 0
    );
  const requiredTravelers = travelerRequiredItems.reduce(
    (sum: number, item: Row) =>
      sum +
      (item.traveler_type === 'INDIVIDUAL'
        ? Number(item.extended_project_quantity ?? 0)
        : 1),
    0
  );
  const evidence: ProductionEvidenceInput = {
    authorizedQuantity: productionOrders.reduce(
      (sum, entry) => sum + Number(entry.quantity ?? 0),
      0
    ),
    completedQuantity,
    acceptedQuantity,
    rejectedQuantity,
    scrappedQuantity,
    productionOrdersRequired: orderIds.length,
    productionOrdersComplete: productionOrders.filter(
      (entry) => entry.status === 'COMPLETED'
    ).length,
    travelerMode,
    requiredTravelers,
    currentTravelers: travelers.filter(
      (entry) => !['CANCELLED', 'SUPERSEDED'].includes(entry.status)
    ).length,
    incompleteTravelerSteps: travelers.reduce(
      (sum, entry) =>
        sum +
        Math.max(
          0,
          Number(entry.operation_count) -
            Number(entry.completed_operation_count)
        ),
      0
    ),
    missingTravelerActors: travelers.reduce(
      (sum, entry) => sum + Number(entry.unattributed_operation_count),
      0
    ),
    missingMaterialGenealogy: Math.max(
      0,
      serializedItems.length -
        new Set(traceability.map((entry) => entry.serialized_item_id)).size
    ),
    invalidMaterialConsumptions: traceability.filter((entry) =>
      ['EXPIRED', 'QUARANTINED', 'REJECTED'].includes(
        String(entry.material_status ?? '').toUpperCase()
      )
    ).length,
    openLaborEntries: Number(labor.open_count ?? 0),
    trainingGaps: 0,
    calibrationGaps: 0,
    incompleteInspections: travelers.reduce(
      (sum, entry) => sum + Number(entry.incomplete_inspection_count ?? 0),
      0
    ),
    incompleteTests: 0,
    incompleteSpecialProcesses: 0,
    openNcrs: ncrs.length,
    incompleteRework: ncrs.filter((entry) =>
      /rework|repair/i.test(String(entry.disposition ?? ''))
    ).length,
    activeHolds: holds.filter((entry) => entry.status === 'ACTIVE').length,
    baselineChanged,
    mixedConfiguration: serializedItems.some(
      (entry) =>
        entry.part_routing_revision != null &&
        productionOrders.some(
          (order) =>
            order.sku === entry.part_number &&
            Number(entry.part_routing_revision) !==
              Number(
                requiredManufacturedItems.find(
                  (item: Row) => item.part_number === order.sku
                )?.routing_revision
              )
        )
    ),
    noTravelerExceptionApproved,
    manufacturingEngineeringApprovalRequired:
      travelerMode === 'NO_TRAVELER_EXCEPTION' ||
      ncrs.some((entry) =>
        /rework|repair/i.test(String(entry.disposition ?? ''))
      ) ||
      baselineChanged,
  };
  const readiness = evaluateProductionCompletion(evidence);
  return {
    ctx,
    plan,
    wad,
    productionOrders,
    serializedItems,
    travelers,
    traceability,
    ncrs,
    holds,
    labor,
    evidence,
    readiness,
    deferrals: {
      finalProductRelease: true,
      shipping: true,
      projectClosing: true,
    },
  };
}

async function currentReview(projectId: string, tx: Executor) {
  return (
    rows(
      await tx.execute(sql`
      SELECT * FROM project_production_stage_reviews
      WHERE project_id=${projectId}
      ORDER BY revision_number DESC LIMIT 1`)
    )[0] ?? null
  );
}

export async function getProductionDashboard(
  projectId: string,
  tx: Executor = db
) {
  const model = await collectEvidence(projectId, tx, false);
  const review = await currentReview(projectId, tx);
  const approvals = review
    ? rows(
        await tx.execute(sql`
          SELECT * FROM project_production_stage_approvals
          WHERE production_stage_review_id=${review.id}
          ORDER BY decided_at`)
      )
    : [];
  const history = rows(
    await tx.execute(sql`
      SELECT * FROM project_production_stage_reviews
      WHERE project_id=${projectId} ORDER BY revision_number DESC`)
  );
  return { ...model, review, approvals, history };
}

export async function createCompletionReview(
  projectId: string,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const model = await collectEvidence(projectId, tx);
    const existing = await currentReview(projectId, tx);
    if (
      existing &&
      !['COMPLETE', 'STALE', 'INVALIDATED', 'SUPERSEDED'].includes(
        existing.status
      )
    )
      throw new ProjectProductionExecutionError(
        'ACTIVE_REVIEW_EXISTS',
        'An active Production completion review already exists.',
        409
      );
    const revision = Number(existing?.revision_number ?? 0) + 1;
    const [review] = rows(
      await tx.execute(sql`
        INSERT INTO project_production_stage_reviews
          (project_id,workflow_instance_id,workflow_step_instance_id,
           production_launch_id,production_release_id,revision_number,status,
           production_plan_revision,wad_revision,configuration_baseline_id,
           effectivity_reference,evidence_snapshot,blockers,warnings,
           created_by,created_by_display_name)
        VALUES (${projectId},${model.ctx.instance.id},${model.ctx.step.id},
          ${model.ctx.launch.id},${model.ctx.launch.production_release_id},${revision},
          ${model.readiness.state},${model.ctx.launch.production_plan_revision},
          ${model.ctx.launch.wad_revision},${model.ctx.launch.configuration_baseline_id},
          ${model.ctx.launch.effectivity_reference},${JSON.stringify(model.evidence)}::jsonb,
          ${JSON.stringify(model.readiness.blockers)}::jsonb,
          ${JSON.stringify(model.readiness.warnings)}::jsonb,
          ${actor.userId},${actor.displayName}) RETURNING *`)
    );
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCTION_COMPLETION_REVIEW_CREATED',
        subjectType: 'project_production_stage_review',
        subjectId: review.id,
        sourceService: 'projectProductionExecutionService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, revision, readiness: model.readiness.state },
      },
      tx
    );
    return getProductionDashboard(projectId, tx);
  });
}

export async function recalculateProductionReadiness(
  projectId: string,
  expectedLockVersion: number,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const model = await collectEvidence(projectId, tx);
    const [review] = rows(
      await tx.execute(sql`
        UPDATE project_production_stage_reviews
        SET evidence_snapshot=${JSON.stringify(model.evidence)}::jsonb,
          blockers=${JSON.stringify(model.readiness.blockers)}::jsonb,
          warnings=${JSON.stringify(model.readiness.warnings)}::jsonb,
          status=${model.readiness.state},lock_version=lock_version+1,updated_at=now()
        WHERE project_id=${projectId} AND lock_version=${expectedLockVersion}
          AND status IN ('IN_PROGRESS','BLOCKED','READY_FOR_COMPLETION_REVIEW')
        RETURNING *`)
    );
    if (!review)
      throw new ProjectProductionExecutionError(
        'STALE_WRITE',
        'The Production review changed; reload before retrying.',
        409
      );
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCTION_READINESS_RECALCULATED',
        subjectType: 'project_production_stage_review',
        subjectId: review.id,
        sourceService: 'projectProductionExecutionService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          revision: review.revision_number,
          state: review.status,
        },
      },
      tx
    );
    return getProductionDashboard(projectId, tx);
  });
}

export async function submitProductionCompletion(
  projectId: string,
  expectedLockVersion: number,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const model = await collectEvidence(projectId, tx);
    if (model.readiness.state !== 'READY_FOR_COMPLETION_REVIEW')
      throw new ProjectProductionExecutionError(
        'PRODUCTION_NOT_READY',
        'Production completion blockers must be resolved before submission.',
        409,
        { blockers: model.readiness.blockers }
      );
    const [review] = rows(
      await tx.execute(sql`
        UPDATE project_production_stage_reviews
        SET status='PENDING_APPROVAL',submitted_at=now(),
          evidence_snapshot=${JSON.stringify(model.evidence)}::jsonb,
          blockers='[]'::jsonb,warnings=${JSON.stringify(model.readiness.warnings)}::jsonb,
          lock_version=lock_version+1,updated_at=now()
        WHERE project_id=${projectId} AND lock_version=${expectedLockVersion}
          AND status='READY_FOR_COMPLETION_REVIEW'
        RETURNING *`)
    );
    if (!review)
      throw new ProjectProductionExecutionError(
        'STALE_WRITE',
        'The review is stale.',
        409
      );
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCTION_COMPLETION_SUBMITTED',
        subjectType: 'project_production_stage_review',
        subjectId: review.id,
        sourceService: 'projectProductionExecutionService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, revision: review.revision_number },
      },
      tx
    );
    return getProductionDashboard(projectId, tx);
  });
}

export async function decideProductionCompletion(
  projectId: string,
  expectedLockVersion: number,
  approvalType:
    | 'OPERATIONS'
    | 'QUALITY'
    | 'PROJECT_MANAGEMENT'
    | 'MANUFACTURING_ENGINEERING',
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const review = await currentReview(projectId, tx);
    if (!review || review.status !== 'PENDING_APPROVAL')
      throw new ProjectProductionExecutionError(
        'PENDING_REVIEW_REQUIRED',
        'A submitted completion review is required.',
        409
      );
    if (Number(review.lock_version) !== expectedLockVersion)
      throw new ProjectProductionExecutionError(
        'STALE_WRITE',
        'The review is stale.',
        409
      );
    const priorActor = rows(
      await tx.execute(sql`
        SELECT actor_user_id FROM project_production_stage_approvals
        WHERE production_stage_review_id=${review.id}`)
    );
    if (
      priorActor.some((entry) => Number(entry.actor_user_id) === actor.userId)
    )
      throw new ProjectProductionExecutionError(
        'SEGREGATION_OF_DUTIES',
        'One actor may not satisfy multiple Production completion functions.',
        409
      );
    await tx.execute(sql`
      INSERT INTO project_production_stage_approvals
        (project_id,production_stage_review_id,production_stage_revision,
         approval_type,decision,signature_meaning,reason,evidence_snapshot_hash,
         actor_user_id,actor_employee_id,actor_display_name,actor_role)
      VALUES (${projectId},${review.id},${review.revision_number},${approvalType},
        ${decision},${signatureMeaning},${reason},${hash(review.evidence_snapshot)},
        ${actor.userId},${actor.employeeId ?? null},${actor.displayName},${actor.role})
      ON CONFLICT (production_stage_review_id,approval_type) DO NOTHING`);
    await tx.execute(sql`
      UPDATE project_production_stage_reviews
      SET lock_version=lock_version+1,updated_at=now(),
        status=CASE WHEN ${decision}<>'APPROVED' THEN 'BLOCKED' ELSE status END
      WHERE id=${review.id} AND lock_version=${expectedLockVersion}`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCTION_COMPLETION_DECIDED',
        subjectType: 'project_production_stage_review',
        subjectId: review.id,
        sourceService: 'projectProductionExecutionService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          approvalType,
          decision,
          revision: review.revision_number,
        },
      },
      tx
    );
    return getProductionDashboard(projectId, tx);
  });
}

export async function placeProductionHold(
  projectId: string,
  expectedLockVersion: number,
  input: {
    reason: string;
    scopeType: string;
    scopeRecordId?: string;
    affectedPartNumber?: string;
    affectedQuantity?: number;
    requiredDisposition: string;
  },
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const review = await currentReview(projectId, tx);
    if (!review || Number(review.lock_version) !== expectedLockVersion)
      throw new ProjectProductionExecutionError(
        'STALE_WRITE',
        'The review is stale.',
        409
      );
    const [hold] = rows(
      await tx.execute(sql`
        INSERT INTO project_production_holds
          (project_id,production_stage_review_id,reason,scope_type,scope_record_id,
           affected_part_number,affected_quantity,required_disposition,
           placed_by,placed_by_display_name)
        VALUES (${projectId},${review.id},${input.reason},${input.scopeType},
          ${input.scopeRecordId ?? null},${input.affectedPartNumber ?? null},
          ${input.affectedQuantity ?? null},${input.requiredDisposition},
          ${actor.userId},${actor.displayName}) RETURNING *`)
    );
    await tx.execute(sql`
      UPDATE project_production_stage_reviews
      SET status='BLOCKED',lock_version=lock_version+1,updated_at=now()
      WHERE id=${review.id} AND lock_version=${expectedLockVersion}`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCTION_HOLD_PLACED',
        subjectType: 'project_production_hold',
        subjectId: hold.id,
        sourceService: 'projectProductionExecutionService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          scopeType: input.scopeType,
          scopeRecordId: input.scopeRecordId,
        },
      },
      tx
    );
    return getProductionDashboard(projectId, tx);
  });
}

export async function releaseProductionHold(
  projectId: string,
  holdId: string,
  expectedLockVersion: number,
  releaseReason: string,
  actor: ProductionActor
) {
  return db.transaction(async (tx) => {
    const review = await currentReview(projectId, tx);
    if (!review || Number(review.lock_version) !== expectedLockVersion)
      throw new ProjectProductionExecutionError(
        'STALE_WRITE',
        'The review is stale.',
        409
      );
    const [hold] = rows(
      await tx.execute(sql`
        UPDATE project_production_holds SET status='RELEASED',
          release_authorized_by=${actor.userId},
          release_authorized_by_display_name=${actor.displayName},
          release_reason=${releaseReason},released_at=now()
        WHERE id=${holdId} AND project_id=${projectId} AND status='ACTIVE'
        RETURNING *`)
    );
    if (!hold)
      throw new ProjectProductionExecutionError(
        'HOLD_NOT_FOUND',
        'Active hold not found.',
        404
      );
    await tx.execute(sql`
      UPDATE project_production_stage_reviews
      SET lock_version=lock_version+1,updated_at=now()
      WHERE id=${review.id} AND lock_version=${expectedLockVersion}`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCTION_HOLD_RELEASED',
        subjectType: 'project_production_hold',
        subjectId: hold.id,
        sourceService: 'projectProductionExecutionService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: { projectId, releaseReason },
      },
      tx
    );
    return getProductionDashboard(projectId, tx);
  });
}

export async function completeProductionStage(
  projectId: string,
  expectedLockVersion: number,
  actor: ProductionActor,
  certificationFailurePoint?: 'AFTER_COMPLETION'
) {
  return db.transaction(async (tx) => {
    const model = await collectEvidence(projectId, tx);
    const review = await currentReview(projectId, tx);
    if (!review || review.status !== 'PENDING_APPROVAL')
      throw new ProjectProductionExecutionError(
        'PENDING_REVIEW_REQUIRED',
        'A submitted Production completion review is required.',
        409
      );
    if (Number(review.lock_version) !== expectedLockVersion)
      throw new ProjectProductionExecutionError(
        'STALE_WRITE',
        'The review is stale.',
        409
      );
    if (
      !jsonValuesEqual(
        review.evidence_snapshot,
        model.evidence as unknown as JsonValue
      )
    )
      throw new ProjectProductionExecutionError(
        'PRODUCTION_EVIDENCE_STALE',
        'Authoritative manufacturing evidence changed after submission.',
        409
      );
    const approvals = rows(
      await tx.execute(sql`
        SELECT approval_type,decision FROM project_production_stage_approvals
        WHERE production_stage_review_id=${review.id} AND superseded_at IS NULL`)
    );
    const required = ['OPERATIONS', 'QUALITY', 'PROJECT_MANAGEMENT'];
    if (model.evidence.manufacturingEngineeringApprovalRequired)
      required.push('MANUFACTURING_ENGINEERING');
    const missing = required.filter(
      (type) =>
        !approvals.some(
          (entry) =>
            entry.approval_type === type && entry.decision === 'APPROVED'
        )
    );
    if (missing.length)
      throw new ProjectProductionExecutionError(
        'PRODUCTION_APPROVALS_REQUIRED',
        'All required functional approvals must be complete.',
        409,
        { missingApprovals: missing }
      );
    await tx.execute(sql`
      UPDATE project_production_stage_reviews
      SET status='COMPLETE',completed_at=now(),completed_by=${actor.userId},
        completed_by_display_name=${actor.displayName},
        lock_version=lock_version+1,updated_at=now()
      WHERE id=${review.id} AND lock_version=${expectedLockVersion}`);
    await tx.execute(sql`
      UPDATE project_workflow_step_instances
      SET status='COMPLETE',completed_at=now(),completed_by=${actor.userId},
        completed_by_display_name=${actor.displayName},updated_at=now()
      WHERE id=${model.ctx.step.id} AND status='IN_PROGRESS'`);
    // Intentionally no final product release, shipment, or project-close writes.
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCTION_STAGE_COMPLETED',
        subjectType: 'project_production_stage_review',
        subjectId: review.id,
        sourceService: 'projectProductionExecutionService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          revision: review.revision_number,
          finalProductReleased: false,
          shippingAuthorized: false,
        },
      },
      tx
    );
    if (
      certificationFailurePoint === 'AFTER_COMPLETION' &&
      process.env.NODE_ENV === 'test'
    )
      throw new ProjectProductionExecutionError(
        'CERTIFICATION_FORCED_ROLLBACK',
        'Forced certification rollback after Production completion.',
        409
      );
    return getProductionDashboard(projectId, tx);
  });
}
