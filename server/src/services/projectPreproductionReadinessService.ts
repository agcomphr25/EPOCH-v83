import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { storage } from '../../storage';
import { isP2V2ProductionLaunchEnabled } from '../lib/featureFlags';
import {
  jsonValuesEqual,
  recordAuditEvent,
  type AuditLedgerTx,
  type JsonValue,
} from './auditLedgerService';
import { evaluateCommercialBaseline } from './projectCommercialReviewService';
import { getCurrentProductionPlan } from './projectProductionPlanningService';
import { evaluateTechnicalConfigurationBaseline } from './projectTechnicalConfigurationReviewService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';
import { validateWorkflowInstanceIntegrity } from './projectWorkflowInstanceIntegrity';
import { getCurrentWadAuthorization } from './projectWadAuthorizationService';
import {
  assertProductionCountsMatchPlan,
  checklistBlockers,
  plannedProductionCounts,
  requiredPreproductionRoles,
  resolveFirstProductionDepartment,
  type ChecklistDecision,
} from './projectPreproductionRules';

type Executor = AuditLedgerTx;
// Raw-query records keep this additive feature out of the central schema surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type PreproductionActor = {
  userId: number;
  employeeId?: number | null;
  username: string;
  displayName: string;
  role: string;
};
export type PreproductionInput = {
  checklist: ChecklistDecision[];
  exceptions?: unknown[];
  risksAndControls?: Array<{ risk: string; owner: string; control: string }>;
  effectivityReference: string;
};
export type ProductionLaunchCertificationFault =
  | 'AFTER_SERIALIZED_ITEMS'
  | 'AFTER_FIRST_PRODUCTION_ORDER'
  | 'AFTER_ALL_PRODUCTION_ORDERS'
  | 'AFTER_STAGE_8_ACTIVATION'
  | 'AFTER_PROJECT_STATUS_UPDATE';

type ProductionLaunchDependencies = {
  fault?: (point: ProductionLaunchCertificationFault) => void | Promise<void>;
};

export class ProjectPreproductionError extends Error {
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

async function context(
  projectId: string,
  tx: Executor,
  lock = false,
  requirePredecessors = true
) {
  const project = resultRows(
    await tx.execute(sql`
      SELECT id,workflow_version,po_id,current_stage,status
      FROM projects WHERE id=${projectId} ${lock ? sql`FOR UPDATE` : sql``}`)
  )[0];
  if (!project)
    throw new ProjectPreproductionError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  let version;
  try {
    version = resolveProjectWorkflowVersion(project.workflow_version);
  } catch {
    throw new ProjectPreproductionError(
      'UNKNOWN_WORKFLOW_VERSION',
      'The project workflow version is not recognized.',
      409
    );
  }
  if (version !== 'p2_v2')
    throw new ProjectPreproductionError(
      'P2_V2_REQUIRED',
      'Preproduction Readiness requires an explicit p2_v2 project.',
      409,
      { effectiveWorkflowVersion: version }
    );
  const instances = resultRows(
    await tx.execute(sql`
      SELECT * FROM project_workflow_instances
      WHERE project_id=${projectId} AND workflow_version='p2_v2'
        AND status NOT IN ('SUPERSEDED','CANCELLED')
      ${lock ? sql`FOR UPDATE` : sql``}`)
  );
  if (instances.length !== 1)
    throw new ProjectPreproductionError(
      instances.length
        ? 'DUPLICATE_ACTIVE_INSTANCES'
        : 'WORKFLOW_INSTANCE_REQUIRED',
      instances.length
        ? 'Multiple active V2 workflow instances exist.'
        : 'An active V2 workflow instance is required.',
      409
    );
  if (![2, 3].includes(Number(instances[0].definition_version)))
    throw new ProjectPreproductionError(
      'PREPRODUCTION_DEFINITION_REQUIRED',
      'Preproduction Readiness requires a compatible p2_v2 definition.',
      409
    );
  const steps = resultRows(
    await tx.execute(sql`
      SELECT * FROM project_workflow_step_instances
      WHERE workflow_instance_id=${instances[0].id} ORDER BY step_order`)
  );
  const issues = validateWorkflowInstanceIntegrity(instances[0], steps);
  if (issues.length)
    throw new ProjectPreproductionError(
      'WORKFLOW_INTEGRITY_FAILED',
      'The V2 workflow failed integrity validation.',
      409,
      { issues }
    );
  const step = steps.find(
    (entry) => entry.step_type === 'preproduction_release'
  );
  if (!step)
    throw new ProjectPreproductionError(
      'PREPRODUCTION_STAGE_REQUIRED',
      'Preproduction Readiness stage is missing.',
      409
    );
  const requiredTypes = [
    'rfq_risk_assessment',
    'estimate_quote',
    'contract_review',
    'technical_configuration_review',
    'production_planning',
    'wad_authorization',
  ];
  const incomplete = requiredTypes.filter(
    (type) =>
      steps.find((entry) => entry.step_type === type)?.status !== 'COMPLETE'
  );
  if (requirePredecessors && incomplete.length)
    throw new ProjectPreproductionError(
      'PREDECESSORS_REQUIRED',
      'All commercial, technical, planning, and WAD predecessor stages must be complete.',
      409,
      { incompleteStages: incomplete }
    );
  return { project, instance: instances[0], step, steps };
}

async function sourceState(projectId: string, tx: Executor) {
  const commercial = await evaluateCommercialBaseline(projectId, tx);
  const technical = await evaluateTechnicalConfigurationBaseline(projectId, tx);
  const planning = await getCurrentProductionPlan(projectId, tx);
  const wad = await getCurrentWadAuthorization(projectId, tx);
  const blockers: string[] = [];
  const contractReview = resultRows(
    await tx.execute(sql`
      SELECT revision_number,requirements_snapshot FROM project_commercial_stage_reviews
      WHERE project_id=${projectId} AND stage_type='contract_review'
        AND status='COMPLETE'
      ORDER BY revision_number DESC LIMIT 1`)
  )[0];
  if (!commercial.valid)
    blockers.push(...commercial.blockers.map((b: string) => `Contract: ${b}`));
  if (!technical.valid)
    blockers.push(...technical.blockers.map((b: string) => `Technical: ${b}`));
  if (
    !planning.plan ||
    planning.plan.status !== 'RELEASED' ||
    !planning.readiness.ready
  )
    blockers.push(
      ...(planning.readiness.blockers.length
        ? planning.readiness.blockers.map((b: string) => `Planning: ${b}`)
        : ['Planning: a current RELEASED Production Plan is required.'])
    );
  if (
    !wad.authorization ||
    wad.authorization.status !== 'RELEASED' ||
    !wad.readiness.ready
  )
    blockers.push(
      ...(wad.readiness.blockers.length
        ? wad.readiness.blockers.map((b: string) => `WAD: ${b}`)
        : ['WAD: a current RELEASED authorization is required.'])
    );
  return {
    blockers: Array.from(new Set(blockers)),
    revisions: {
      commercial: contractReview?.revision_number ?? null,
      technical: technical.review?.revision_number ?? null,
      productionPlanning: planning.plan?.revision_number ?? null,
      wadAuthorization: wad.authorization?.revision_number ?? null,
    },
    technical,
    planning,
    wad,
    supplyChainRequired:
      Boolean(technical.review?.supply_chain_required) ||
      planning.items.some(
        (item: Row) =>
          item.make_buy === 'BUY' ||
          (Array.isArray(item.special_process_requirements) &&
            item.special_process_requirements.length > 0)
      ),
    financeRequired: Boolean(
      contractReview?.requirements_snapshot?.financeRequired
    ),
  };
}

function recommendedChecklist(source: Awaited<ReturnType<typeof sourceState>>) {
  const planningItems = source.planning.items as Row[];
  const entries: Array<[string, string, string, boolean]> = [
    [
      'accepted-order',
      'Project and contract',
      'Accepted customer PO/order is current',
      true,
    ],
    [
      'contract-current',
      'Project and contract',
      'Contract Review is approved and current',
      source.blockers.length === 0,
    ],
    [
      'risks-controlled',
      'Project and contract',
      'Applicable risks have owners and controls',
      false,
    ],
    [
      'technical-released',
      'Technical/configuration',
      'Drawings and specifications are released/current',
      source.technical.valid,
    ],
    [
      'configuration-released',
      'Technical/configuration',
      'BOM/configuration baseline and effectivity are released',
      source.technical.valid,
    ],
    [
      'routing-complete',
      'Manufacturing planning',
      'Manufactured item tree and approved routings are complete',
      source.planning.readiness.ready,
    ],
    [
      'first-department',
      'Manufacturing planning',
      'First department and department sequence are resolved',
      planningItems
        .filter((item) => item.is_manufactured)
        .every((item) => Boolean(item.routing_id)),
    ],
    [
      'traveler-decision',
      'Manufacturing planning',
      'Traveler type or approved no-traveler exception is decided',
      planningItems
        .filter((item) => item.is_manufactured)
        .every((item) => Boolean(item.traveler_requirement)),
    ],
    [
      'instructions-released',
      'Manufacturing planning',
      'Required work instructions and specifications are released',
      source.planning.readiness.ready,
    ],
    [
      'tooling-programs',
      'Manufacturing planning',
      'Required tooling, fixtures, gauges, and CNC programs are available',
      source.planning.readiness.ready,
    ],
    [
      'inspection-defined',
      'Quality planning',
      'Inspection points and final acceptance criteria are defined',
      source.planning.readiness.ready,
    ],
    [
      'sampling-fai',
      'Quality planning',
      'Inspection extent, sampling, FAI, and test requirements are decided',
      source.planning.readiness.ready,
    ],
    [
      'traceability-certification',
      'Quality planning',
      'Traceability, certification, and C of C requirements are defined',
      source.planning.readiness.ready,
    ],
    [
      'material-availability',
      'Materials and supply chain',
      'Material availability, shortages, and planned supply are evaluated',
      !source.supplyChainRequired || source.planning.readiness.ready,
    ],
    [
      'supplier-approval',
      'Materials and supply chain',
      'Applicable suppliers and outside-process sources are approved',
      !source.supplyChainRequired || source.planning.readiness.ready,
    ],
    [
      'schedule-capacity',
      'Resources',
      'Department capacity and schedule are approved/current',
      source.planning.readiness.ready,
    ],
    [
      'qualified-resources',
      'Resources',
      'Required employee qualifications and calibrated equipment are current',
      false,
    ],
    [
      'budgets-active',
      'Resources',
      'Charge codes, labor, material, and outside-processing budgets are active',
      source.wad.readiness.ready,
    ],
    [
      'safety-controls',
      'Resources',
      'Applicable safety, FOD, and environmental controls are identified',
      false,
    ],
    [
      'wad-current',
      'Project and contract',
      'Released WAD authorization is current',
      source.wad.readiness.ready,
    ],
  ];
  return entries.map(([key, category, label, satisfied]) => ({
    key,
    category,
    label,
    applicability:
      (key === 'supplier-approval' || key === 'material-availability') &&
      !source.supplyChainRequired
        ? ('NOT_REQUIRED' as const)
        : ('REQUIRED' as const),
    satisfied,
    evidence: [],
  }));
}

async function current(projectId: string, tx: Executor) {
  return (
    resultRows(
      await tx.execute(sql`
      SELECT * FROM project_preproduction_readiness_reviews
      WHERE project_id=${projectId} AND status IN ('DRAFT','PENDING_APPROVAL','COMPLETE')
      ORDER BY revision_number DESC LIMIT 1`)
    )[0] ?? null
  );
}
async function history(projectId: string, tx: Executor) {
  return resultRows(
    await tx.execute(sql`
      SELECT * FROM project_preproduction_readiness_reviews
      WHERE project_id=${projectId} ORDER BY revision_number DESC`)
  );
}
async function approvals(review: Row, tx: Executor) {
  return resultRows(
    await tx.execute(sql`
      SELECT * FROM project_workflow_step_approvals
      WHERE workflow_step_instance_id=${review.workflow_step_instance_id}
        AND evidence_snapshot->>'preproductionReadinessId'=${review.id}
      ORDER BY decided_at`)
  );
}
async function readiness(projectId: string, review: Row | null, tx: Executor) {
  if (!review)
    return {
      state: 'NOT_READY',
      ready: false,
      blockers: ['Create a readiness revision.'],
      stale: false,
    };
  const source = await sourceState(projectId, tx);
  const stale = !jsonValuesEqual(
    review.source_stage_revisions as JsonValue,
    source.revisions as JsonValue
  );
  const blockers = [
    ...source.blockers,
    ...checklistBlockers(review.checklist_snapshot ?? []),
  ];
  if (stale)
    blockers.unshift(
      'Source stage revisions changed; create a new readiness revision.'
    );
  const state = stale
    ? 'STALE'
    : source.blockers.length
      ? 'BLOCKED'
      : blockers.length
        ? 'NOT_READY'
        : 'READY';
  return {
    state,
    ready: state === 'READY',
    blockers: Array.from(new Set(blockers)),
    stale,
    source,
  };
}

async function readModel(projectId: string, tx: Executor = db) {
  const ctx = await context(projectId, tx, false, false);
  const review = await current(projectId, tx);
  const release =
    resultRows(
      await tx.execute(sql`
      SELECT * FROM project_production_releases WHERE project_id=${projectId}
      ORDER BY approved_at DESC LIMIT 1`)
    )[0] ?? null;
  const launch =
    resultRows(
      await tx.execute(sql`
      SELECT * FROM project_production_launches WHERE project_id=${projectId}
      ORDER BY launched_at DESC LIMIT 1`)
    )[0] ?? null;
  return {
    review,
    history: await history(projectId, tx),
    approvals: review ? await approvals(review, tx) : [],
    requiredApprovals: review ? requiredPreproductionRoles(review) : [],
    readiness: await readiness(projectId, review, tx),
    release,
    launch,
    recommendedChecklist: review
      ? recommendedChecklist((await readiness(projectId, review, tx)).source!)
      : recommendedChecklist(await sourceState(projectId, tx)),
    stage: ctx.step,
    projectStatus: ctx.project.current_stage,
    productionLaunchEnabled: isP2V2ProductionLaunchEnabled(),
  };
}
export const getPreproductionReadiness = (
  projectId: string,
  tx: Executor = db
) => readModel(projectId, tx);

async function insertRevision(
  projectId: string,
  input: PreproductionInput,
  actor: PreproductionActor,
  tx: Executor,
  revision: number
) {
  const ctx = await context(projectId, tx, true);
  const source = await sourceState(projectId, tx);
  if (source.blockers.length)
    throw new ProjectPreproductionError(
      'PREDECESSOR_EVIDENCE_INVALID',
      'Current predecessor evidence is required.',
      409,
      { blockers: source.blockers }
    );
  const checklist =
    input.checklist.length > 0 ? input.checklist : recommendedChecklist(source);
  const blockers = checklistBlockers(checklist);
  const [row] = resultRows(
    await tx.execute(sql`
      INSERT INTO project_preproduction_readiness_reviews
        (project_id,workflow_instance_id,workflow_step_instance_id,revision_number,
         readiness_state,source_stage_revisions,checklist_snapshot,blockers,exceptions,
         risks_and_controls,supply_chain_required,finance_required,effectivity_reference,
         created_by,created_by_display_name)
      VALUES (${projectId},${ctx.instance.id},${ctx.step.id},${revision},
        ${blockers.length ? 'NOT_READY' : 'READY'},${JSON.stringify(source.revisions)}::jsonb,
        ${JSON.stringify(checklist)}::jsonb,${JSON.stringify(blockers)}::jsonb,
        ${JSON.stringify(input.exceptions ?? [])}::jsonb,
        ${JSON.stringify(input.risksAndControls ?? [])}::jsonb,
        ${source.supplyChainRequired},${source.financeRequired},
        ${clean(input.effectivityReference)},${actor.userId},${actor.displayName})
      RETURNING *`)
  );
  await tx.execute(sql`
    UPDATE project_workflow_step_instances
    SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),blocked_reason=NULL,updated_at=now()
    WHERE id=${ctx.step.id}`);
  await audit('P2_V2_PREPRODUCTION_REVISION_CREATED', row, actor, tx);
  return row;
}

async function audit(
  eventType: string,
  review: Row,
  actor: PreproductionActor,
  tx: Executor
) {
  await recordAuditEvent(
    {
      eventType,
      subjectType: 'project_preproduction_readiness',
      subjectId: review.id,
      sourceService: 'projectPreproductionReadinessService',
      actor: { id: actor.userId, username: actor.username, role: actor.role },
      payload: {
        projectId: review.project_id,
        revision: Number(review.revision_number),
        status: review.status,
      },
    },
    tx
  );
}

export async function createPreproductionReadiness(
  projectId: string,
  input: PreproductionInput,
  actor: PreproductionActor
) {
  return db.transaction(async (tx) => {
    if (await current(projectId, tx))
      throw new ProjectPreproductionError(
        'ACTIVE_REVISION_EXISTS',
        'An active readiness revision already exists.',
        409
      );
    await insertRevision(projectId, input, actor, tx, 1);
    return readModel(projectId, tx);
  });
}

export async function updatePreproductionDraft(
  projectId: string,
  reviewId: string,
  expectedLockVersion: number,
  input: PreproductionInput,
  actor: PreproductionActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedLockVersion
    )
      throw new ProjectPreproductionError(
        'STALE_REVISION',
        'The readiness revision changed; reload before saving.',
        409
      );
    if (review.status !== 'DRAFT')
      throw new ProjectPreproductionError(
        'DRAFT_REQUIRED',
        'Only a draft may be edited.',
        409
      );
    const source = await sourceState(projectId, tx);
    const blockers = [
      ...source.blockers,
      ...checklistBlockers(input.checklist),
    ];
    await tx.execute(sql`
      UPDATE project_preproduction_readiness_reviews SET
        lock_version=lock_version+1,readiness_state=${source.blockers.length ? 'BLOCKED' : blockers.length ? 'NOT_READY' : 'READY'},
        source_stage_revisions=${JSON.stringify(source.revisions)}::jsonb,
        checklist_snapshot=${JSON.stringify(input.checklist)}::jsonb,
        blockers=${JSON.stringify(blockers)}::jsonb,exceptions=${JSON.stringify(input.exceptions ?? [])}::jsonb,
        risks_and_controls=${JSON.stringify(input.risksAndControls ?? [])}::jsonb,
        supply_chain_required=${source.supplyChainRequired},
        finance_required=${source.financeRequired},
        effectivity_reference=${clean(input.effectivityReference)},updated_at=now()
      WHERE id=${review.id}`);
    await audit('P2_V2_PREPRODUCTION_DRAFT_UPDATED', review, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function recalculatePreproduction(
  projectId: string,
  reviewId: string,
  expectedLockVersion: number,
  actor: PreproductionActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedLockVersion
    )
      throw new ProjectPreproductionError(
        'STALE_REVISION',
        'The readiness revision changed; reload before recalculation.',
        409
      );
    if (review.status !== 'DRAFT')
      throw new ProjectPreproductionError(
        'DRAFT_REQUIRED',
        'Only a draft may be recalculated.',
        409
      );
    const state = await readiness(projectId, review, tx);
    if (!state.source)
      throw new ProjectPreproductionError(
        'READINESS_SOURCE_REQUIRED',
        'Current predecessor evidence is required.',
        409
      );
    await tx.execute(sql`
      UPDATE project_preproduction_readiness_reviews SET lock_version=lock_version+1,
        readiness_state=${state.state},blockers=${JSON.stringify(state.blockers)}::jsonb,
        source_stage_revisions=${JSON.stringify(state.source.revisions)}::jsonb,updated_at=now()
      WHERE id=${review.id}`);
    await audit('P2_V2_PREPRODUCTION_RECALCULATED', review, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function submitPreproduction(
  projectId: string,
  reviewId: string,
  expectedLockVersion: number,
  actor: PreproductionActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedLockVersion
    )
      throw new ProjectPreproductionError(
        'STALE_REVISION',
        'The readiness revision changed; reload before submitting.',
        409
      );
    if (review.status !== 'DRAFT')
      throw new ProjectPreproductionError(
        'DRAFT_REQUIRED',
        'Only a draft may be submitted.',
        409
      );
    const state = await readiness(projectId, review, tx);
    if (!state.ready)
      throw new ProjectPreproductionError(
        'PREPRODUCTION_NOT_READY',
        'Readiness has blockers.',
        409,
        { blockers: state.blockers }
      );
    await tx.execute(sql`
      UPDATE project_preproduction_readiness_reviews
      SET status='PENDING_APPROVAL',readiness_state='READY',submitted_at=now(),
          lock_version=lock_version+1,updated_at=now() WHERE id=${review.id}`);
    await tx.execute(sql`
      UPDATE project_workflow_step_instances SET status='PENDING_APPROVAL',updated_at=now()
      WHERE id=${review.workflow_step_instance_id}`);
    await audit('P2_V2_PREPRODUCTION_SUBMITTED', review, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function decidePreproduction(
  projectId: string,
  reviewId: string,
  expectedLockVersion: number,
  capacity: string,
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: PreproductionActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedLockVersion
    )
      throw new ProjectPreproductionError(
        'STALE_REVISION',
        'The readiness revision changed; reload before deciding.',
        409
      );
    if (review.status !== 'PENDING_APPROVAL')
      throw new ProjectPreproductionError(
        'PENDING_APPROVAL_REQUIRED',
        'The revision is not pending approval.',
        409
      );
    if (!requiredPreproductionRoles(review).includes(capacity))
      throw new ProjectPreproductionError(
        'APPROVAL_NOT_REQUIRED',
        `${capacity} approval is not required.`,
        409
      );
    const evidence = await approvals(review, tx);
    if (
      evidence.some(
        (entry) => entry.approval_type === `PREPRODUCTION_${capacity}`
      )
    )
      throw new ProjectPreproductionError(
        'DECISION_ALREADY_RECORDED',
        `${capacity} already decided this revision.`,
        409
      );
    if (
      evidence.some(
        (entry) =>
          Number(entry.actor_user_id) === actor.userId &&
          entry.decision === 'APPROVED'
      )
    )
      throw new ProjectPreproductionError(
        'SEGREGATION_OF_DUTIES',
        'One actor cannot approve multiple required functions.',
        403
      );
    if (!clean(signatureMeaning) || (decision !== 'APPROVED' && !clean(reason)))
      throw new ProjectPreproductionError(
        'DECISION_EVIDENCE_REQUIRED',
        'Signature meaning and rejection/return reason are required.'
      );
    await tx.execute(sql`
      INSERT INTO project_workflow_step_approvals
        (workflow_step_instance_id,project_id,approval_type,decision,signature_meaning,
         reason,actor_employee_id,actor_user_id,actor_display_name,actor_role,
         step_revision_snapshot,evidence_snapshot)
      VALUES (${review.workflow_step_instance_id},${projectId},${`PREPRODUCTION_${capacity}`},
        ${decision},${signatureMeaning},${clean(reason) || null},${actor.employeeId ?? null},
        ${actor.userId},${actor.displayName},${actor.role},${String(review.revision_number)},
        ${JSON.stringify({ preproductionReadinessId: review.id, revision: review.revision_number, invalidated: false })}::jsonb)`);
    await tx.execute(sql`
      UPDATE project_preproduction_readiness_reviews SET
        status=${decision === 'APPROVED' ? 'PENDING_APPROVAL' : 'REJECTED'},
        lock_version=lock_version+1,updated_at=now() WHERE id=${review.id}`);
    if (decision !== 'APPROVED')
      await tx.execute(sql`
        UPDATE project_workflow_step_instances SET status='BLOCKED',
          blocked_reason=${`${capacity} ${decision.toLowerCase()}: ${clean(reason)}`},updated_at=now()
        WHERE id=${review.workflow_step_instance_id}`);
    await audit(`P2_V2_PREPRODUCTION_${capacity}_DECIDED`, review, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function completePreproduction(
  projectId: string,
  reviewId: string,
  expectedLockVersion: number,
  actor: PreproductionActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedLockVersion
    )
      throw new ProjectPreproductionError(
        'STALE_REVISION',
        'The readiness revision changed; reload before completing.',
        409
      );
    const state = await readiness(projectId, review, tx);
    if (review.status !== 'PENDING_APPROVAL' || !state.ready)
      throw new ProjectPreproductionError(
        'PREPRODUCTION_NOT_READY',
        'The submitted revision is not ready.',
        409,
        { blockers: state.blockers }
      );
    const evidence = await approvals(review, tx);
    const missing = requiredPreproductionRoles(review).filter(
      (role) =>
        !evidence.some(
          (entry) =>
            entry.approval_type === `PREPRODUCTION_${role}` &&
            entry.decision === 'APPROVED'
        )
    );
    if (missing.length)
      throw new ProjectPreproductionError(
        'APPROVALS_REQUIRED',
        'Required independent approvals are missing.',
        409,
        { missingApprovals: missing }
      );
    await tx.execute(sql`
      UPDATE project_preproduction_readiness_reviews
      SET status='COMPLETE',readiness_state='READY',completed_at=now(),
          lock_version=lock_version+1,updated_at=now() WHERE id=${review.id}`);
    await tx.execute(sql`
      UPDATE project_workflow_step_instances SET status='COMPLETE',completed_at=now(),
        completed_by=${actor.employeeId ?? null},completed_by_display_name=${actor.displayName},
        revision_reference=${String(review.revision_number)},
        effectivity_reference=${review.effectivity_reference},blocked_reason=NULL,updated_at=now()
      WHERE id=${review.workflow_step_instance_id}`);
    await tx.execute(sql`
      UPDATE projects SET current_stage='PREPRODUCTION_READINESS',
        stage_updated_at=now(),updated_at=now() WHERE id=${projectId}`);
    await audit('P2_V2_PREPRODUCTION_COMPLETED', review, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function revisePreproduction(
  projectId: string,
  reviewId: string,
  expectedLockVersion: number,
  input: PreproductionInput,
  actor: PreproductionActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const review = await current(projectId, tx);
    if (
      !review ||
      review.id !== reviewId ||
      Number(review.lock_version) !== expectedLockVersion
    )
      throw new ProjectPreproductionError(
        'STALE_REVISION',
        'The readiness revision changed; reload before revising.',
        409
      );
    if (
      !['COMPLETE', 'REJECTED', 'STALE', 'INVALIDATED'].includes(review.status)
    )
      throw new ProjectPreproductionError(
        'REVISION_NOT_ALLOWED',
        'This readiness revision cannot be superseded.',
        409
      );
    const launched = resultRows(
      await tx.execute(sql`
        SELECT id FROM project_production_launches
        WHERE project_id=${projectId} AND status='COMPLETE' LIMIT 1`)
    )[0];
    if (launched)
      throw new ProjectPreproductionError(
        'PRODUCTION_ALREADY_LAUNCHED',
        'Readiness cannot be revised after production launch.',
        409
      );
    await tx.execute(sql`
      UPDATE project_preproduction_readiness_reviews SET status='SUPERSEDED',
        superseded_at=now(),updated_at=now() WHERE id=${review.id}`);
    const next = await insertRevision(
      projectId,
      input,
      actor,
      tx,
      Number(review.revision_number) + 1
    );
    await tx.execute(sql`
      UPDATE project_preproduction_readiness_reviews SET superseded_by_review_id=${next.id}
      WHERE id=${review.id}`);
    await tx.execute(sql`
      UPDATE project_workflow_step_approvals SET superseded_at=now(),
        evidence_snapshot=jsonb_set(COALESCE(evidence_snapshot,'{}'::jsonb),'{invalidated}','true'::jsonb)
      WHERE evidence_snapshot->>'preproductionReadinessId'=${review.id} AND superseded_at IS NULL`);
    await tx.execute(sql`
      UPDATE project_production_releases SET status='INVALIDATED'
      WHERE project_id=${projectId} AND readiness_review_id=${review.id}
        AND status='APPROVED'`);
    if (ctx.project.current_stage === 'READY_FOR_P2_RELEASE') {
      await tx.execute(sql`
        UPDATE projects SET current_stage='PREPRODUCTION_READINESS',
          stage_updated_at=now(),updated_at=now() WHERE id=${projectId}`);
      if (ctx.project.po_id)
        await tx.execute(sql`
          UPDATE p2_purchase_orders SET status='READY_FOR_PRODUCTION',updated_at=now()
          WHERE id=${ctx.project.po_id}`);
    }
    return readModel(projectId, tx);
  });
}

async function validateRelease(projectId: string, tx: Executor, lock = true) {
  const ctx = await context(projectId, tx, lock);
  const review = await current(projectId, tx);
  const state = await readiness(projectId, review, tx);
  if (!review || review.status !== 'COMPLETE' || !state.ready)
    throw new ProjectPreproductionError(
      'COMPLETED_READINESS_REQUIRED',
      'A current completed Preproduction Readiness revision is required.',
      409,
      { blockers: state.blockers }
    );
  const evidence = await approvals(review, tx);
  const missing = requiredPreproductionRoles(review).filter(
    (role) =>
      !evidence.some(
        (entry) =>
          entry.approval_type === `PREPRODUCTION_${role}` &&
          entry.decision === 'APPROVED' &&
          !entry.superseded_at
      )
  );
  if (missing.length)
    throw new ProjectPreproductionError(
      'APPROVALS_REQUIRED',
      'Required readiness approvals are missing.',
      409,
      { missingApprovals: missing }
    );
  const source = state.source;
  if (!source)
    throw new ProjectPreproductionError(
      'RELEASE_BASELINE_REQUIRED',
      'Current release baseline evidence is required.',
      409
    );
  if (!source.planning.plan || !source.wad.authorization)
    throw new ProjectPreproductionError(
      'RELEASE_BASELINE_REQUIRED',
      'Released Production Plan and WAD are required.',
      409
    );
  return { ctx, review, source };
}

export async function approveProductionRelease(
  projectId: string,
  actor: PreproductionActor
) {
  return db.transaction(async (tx) => {
    const { ctx, review, source } = await validateRelease(projectId, tx);
    const existing = resultRows(
      await tx.execute(
        sql`SELECT * FROM project_production_releases WHERE project_id=${projectId} AND status='APPROVED'`
      )
    )[0];
    if (existing) {
      if (existing.readiness_review_id === review.id)
        return readModel(projectId, tx);
      throw new ProjectPreproductionError(
        'CONFLICTING_RELEASE',
        'A different active production release exists.',
        409
      );
    }
    if (ctx.project.current_stage !== 'PREPRODUCTION_READINESS')
      throw new ProjectPreproductionError(
        'INVALID_PROJECT_STATUS',
        'Project is not in the permitted preproduction status.',
        409
      );
    const plan = source.planning.plan;
    const wad = source.wad.authorization;
    const [release] = resultRows(
      await tx.execute(sql`
        INSERT INTO project_production_releases
          (project_id,workflow_instance_id,readiness_review_id,readiness_revision,
           wad_authorization_id,wad_revision,production_plan_id,production_plan_revision,
           configuration_baseline_id,effectivity_reference,approved_by,
           approved_by_display_name,evidence_snapshot)
        VALUES (${projectId},${ctx.instance.id},${review.id},${Number(review.revision_number)},
          ${wad.id},${Number(wad.wad_revision)},${plan.id},${Number(plan.revision_number)},
          ${String(plan.configuration_baseline_id)},${review.effectivity_reference},
          ${actor.userId},${actor.displayName},
          ${JSON.stringify({ sourceRevisions: review.source_stage_revisions, approvals: (await approvals(review, tx)).map((a) => ({ type: a.approval_type, actor: a.actor_display_name, decidedAt: a.decided_at })) })}::jsonb)
        RETURNING *`)
    );
    await tx.execute(sql`
      UPDATE projects SET current_stage='READY_FOR_P2_RELEASE',stage_updated_at=now(),updated_at=now()
      WHERE id=${projectId}`);
    if (ctx.project.po_id)
      await tx.execute(sql`
        UPDATE p2_purchase_orders SET status='READY_FOR_P2_RELEASE',updated_at=now()
        WHERE id=${ctx.project.po_id}`);
    await recordAuditEvent(
      {
        eventType: 'P2_V2_PRODUCTION_RELEASE_APPROVED',
        subjectType: 'project_production_release',
        subjectId: release.id,
        sourceService: 'projectPreproductionReadinessService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          readinessRevision: Number(review.revision_number),
          wadRevision: Number(wad.wad_revision),
        },
      },
      tx
    );
    return readModel(projectId, tx);
  });
}

async function launchProductionWithDependencies(
  projectId: string,
  idempotencyKey: string,
  actor: PreproductionActor,
  dependencies: ProductionLaunchDependencies
) {
  if (!clean(idempotencyKey))
    throw new ProjectPreproductionError(
      'IDEMPOTENCY_KEY_REQUIRED',
      'An idempotency key is required.'
    );
  if (!isP2V2ProductionLaunchEnabled()) {
    try {
      await recordAuditEvent({
        eventType: 'P2_V2_PRODUCTION_LAUNCH_BLOCKED',
        subjectType: 'project',
        subjectId: projectId,
        sourceService: 'projectPreproductionReadinessService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          reason: 'DEPLOYMENT_VALIDATION_PENDING',
        },
      });
    } catch (auditError) {
      console.error(
        'Failed to record blocked P2 V2 production launch attempt:',
        auditError
      );
    }
    throw new ProjectPreproductionError(
      'P2_V2_PRODUCTION_LAUNCH_DISABLED',
      'V2 Production Launch is awaiting deployment validation.',
      503
    );
  }
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`p2-v2-launch:${projectId}`}))`
      );
      const priorLaunch = resultRows(
        await tx.execute(sql`
          SELECT * FROM project_production_launches
          WHERE project_id=${projectId} AND status='COMPLETE'
          ORDER BY launched_at DESC LIMIT 1 FOR UPDATE`)
      )[0];
      if (priorLaunch) {
        if (priorLaunch.idempotency_key === idempotencyKey)
          return readModel(projectId, tx);
        throw new ProjectPreproductionError(
          'PRODUCTION_ALREADY_LAUNCHED',
          'Production has already been launched for this project.',
          409
        );
      }
      const { ctx, review, source } = await validateRelease(projectId, tx);
      if (ctx.project.current_stage !== 'READY_FOR_P2_RELEASE')
        throw new ProjectPreproductionError(
          'PRODUCTION_RELEASE_REQUIRED',
          'Project must be READY_FOR_P2_RELEASE.',
          409
        );
      const release = resultRows(
        await tx.execute(sql`
          SELECT * FROM project_production_releases
          WHERE project_id=${projectId} AND status='APPROVED' FOR UPDATE`)
      )[0];
      if (!release || release.readiness_review_id !== review.id)
        throw new ProjectPreproductionError(
          'CURRENT_RELEASE_REQUIRED',
          'The approved production release is missing or stale.',
          409
        );
      const poId = Number(ctx.project.po_id);
      if (!Number.isInteger(poId))
        throw new ProjectPreproductionError(
          'LINKED_PO_REQUIRED',
          'A linked P2 customer PO is required.',
          409
        );
      const items = resultRows(
        await tx.execute(
          sql`SELECT id,quantity,part_number FROM p2_purchase_order_items WHERE po_id=${poId} ORDER BY id`
        )
      );
      if (!items.length)
        throw new ProjectPreproductionError(
          'PO_ITEMS_REQUIRED',
          'The linked P2 PO has no line items.',
          409
        );
      const planItems = resultRows(
        await tx.execute(sql`
          SELECT ppi.*,pr.department_sequence,
                 pr.routing_revision live_routing_revision,
                 pr.is_active live_routing_is_active,
                 pct.approval_status live_routing_approval_status
          FROM project_production_plan_items ppi
          JOIN part_routings pr ON pr.id=ppi.routing_id
          JOIN production_control_templates pct ON pct.id=pr.created_from_template_id
          WHERE ppi.production_plan_id=${release.production_plan_id}
            AND ppi.project_id=${projectId}
            AND ppi.is_manufactured=true
            AND ppi.make_buy='MAKE'
          ORDER BY ppi.assembly_path
          FOR SHARE OF ppi,pr,pct`)
      );
      if (!planItems.length)
        throw new ProjectPreproductionError(
          'MANUFACTURED_PLAN_REQUIRED',
          'The released Production Plan has no manufactured items.',
          409
        );
      const changedRouting = planItems.find(
        (item) =>
          !item.live_routing_is_active ||
          item.live_routing_approval_status !== 'APPROVED' ||
          String(item.live_routing_revision ?? '') !==
            String(item.routing_revision ?? '')
      );
      if (changedRouting)
        throw new ProjectPreproductionError(
          'RELEASED_ROUTING_STALE',
          `${changedRouting.part_number} routing changed after production release.`,
          409
        );
      let plannedCounts: Map<string, number>;
      try {
        plannedCounts = plannedProductionCounts(
          planItems.map((item) => ({
            part_number: String(item.part_number ?? ''),
            extended_project_quantity: item.extended_project_quantity,
            routing_id: item.routing_id,
            routing_release_status: item.routing_release_status,
            department_sequence: item.department_sequence,
          }))
        );
      } catch (error) {
        throw new ProjectPreproductionError(
          'RELEASED_ROUTING_INVALID',
          error instanceof Error
            ? error.message
            : 'The released routing baseline is invalid.',
          409
        );
      }
      const existingOrders = resultRows(
        await tx.execute(
          sql`SELECT id FROM p2_production_orders WHERE p2_po_id=${poId}`
        )
      );
      if (existingOrders.length)
        throw new ProjectPreproductionError(
          'PREEXISTING_PRODUCTION_RECORDS',
          'Production records already exist outside this V2 launch. Resolve them before retrying.',
          409
        );
      const existingSerialized = resultRows(
        await tx.execute(
          sql`SELECT id FROM p2_serialized_items WHERE po_id=${poId} LIMIT 1`
        )
      );
      if (existingSerialized.length)
        throw new ProjectPreproductionError(
          'PREEXISTING_SERIALIZED_RECORDS',
          'Serialized records already exist outside this V2 launch. Resolve them before retrying.',
          409
        );
      const createdSerialIds: string[] = [];
      for (const item of items) {
        const plannedTopLevel = planItems.find(
          (entry) =>
            entry.part_number === item.part_number &&
            !clean(entry.parent_part_number)
        );
        if (!plannedTopLevel?.serialization_required) continue;
        const countRow = resultRows(
          await tx.execute(
            sql`SELECT count(*)::int count FROM p2_serialized_items WHERE po_item_id=${item.id}`
          )
        )[0];
        const missing = Math.max(
          0,
          Number(item.quantity) - Number(countRow?.count ?? 0)
        );
        if (missing)
          createdSerialIds.push(
            ...(
              await storage.addP2SerializedItemsForPoItem(
                Number(item.id),
                missing,
                tx
              )
            ).map((entry) => entry.id)
          );
      }
      await dependencies.fault?.('AFTER_SERIALIZED_ITEMS');
      const productionOrders = await storage.generateP2ProductionOrders(
        poId,
        undefined,
        tx,
        () => dependencies.fault?.('AFTER_FIRST_PRODUCTION_ORDER')
      );
      await dependencies.fault?.('AFTER_ALL_PRODUCTION_ORDERS');
      try {
        assertProductionCountsMatchPlan(
          plannedCounts,
          productionOrders.map((entry) => entry.sku)
        );
      } catch (error) {
        throw new ProjectPreproductionError(
          'GENERATED_RECORDS_MISMATCH',
          error instanceof Error
            ? error.message
            : 'Generated production records do not match the released plan.',
          409
        );
      }
      const routeByPart = new Map<
        string,
        { department: string; routingId: string; routingRevision: unknown }
      >();
      for (const planItem of planItems) {
        const department = resolveFirstProductionDepartment(
          planItem.department_sequence,
          true
        );
        const prior = routeByPart.get(planItem.part_number);
        if (
          !department ||
          (prior &&
            (prior.department !== department ||
              prior.routingId !== planItem.routing_id))
        )
          throw new ProjectPreproductionError(
            'AMBIGUOUS_RELEASED_ROUTING',
            `${planItem.part_number} does not resolve to one released first department.`,
            409
          );
        routeByPart.set(planItem.part_number, {
          department,
          routingId: planItem.routing_id,
          routingRevision: planItem.routing_revision,
        });
      }
      for (const order of productionOrders) {
        const route = routeByPart.get(order.sku);
        if (!route)
          throw new ProjectPreproductionError(
            'PRODUCTION_ORDER_NOT_PLANNED',
            `Generated production order ${order.id} is not in the released plan.`,
            409
          );
        await tx.execute(sql`
          UPDATE p2_production_orders
          SET department=${route.department},updated_at=now()
          WHERE id=${order.id}`);
      }
      const schedulable = resultRows(
        await tx.execute(sql`
           SELECT si.id,si.po_item_id,si.part_number,si.part_routing_id,
                  pr.department_sequence
           FROM p2_serialized_items si
           LEFT JOIN part_routings pr ON pr.id::text=si.part_routing_id
          WHERE si.po_id=${poId} AND si.status='ACTIVE'
            AND si.current_department='Pending Layup'`)
      );
      const routed: Row[] = [];
      const unresolved: Row[] = [];
      for (const item of schedulable) {
        const department = resolveFirstProductionDepartment(
          item.department_sequence,
          Boolean(item.part_routing_id)
        );
        if (!department) {
          unresolved.push(item);
          continue;
        }
        const updated = resultRows(
          await tx.execute(sql`
            UPDATE p2_serialized_items SET current_department=${department},
              current_stage_index=0,updated_at=now()
            WHERE id=${item.id} AND current_department='Pending Layup'
            RETURNING id,po_item_id,part_routing_id,current_department`)
        )[0];
        if (updated) routed.push(updated);
      }
      if (unresolved.length)
        throw new ProjectPreproductionError(
          'FIRST_DEPARTMENT_UNRESOLVED',
          'One or more routed items have no valid first production department.',
          409,
          { items: unresolved }
        );
      const productionStep = ctx.steps.find(
        (entry) => entry.step_type === 'production_quality'
      );
      if (!productionStep)
        throw new ProjectPreproductionError(
          'PRODUCTION_STAGE_REQUIRED',
          'Production stage is missing.',
          409
        );
      await tx.execute(sql`
        UPDATE project_workflow_step_instances SET status='IN_PROGRESS',
          started_at=COALESCE(started_at,now()),blocked_reason=NULL,updated_at=now()
        WHERE id=${productionStep.id}`);
      await dependencies.fault?.('AFTER_STAGE_8_ACTIVATION');
      await tx.execute(sql`
        UPDATE projects SET current_stage='IN_PRODUCTION',stage_updated_at=now(),updated_at=now()
        WHERE id=${projectId}`);
      await dependencies.fault?.('AFTER_PROJECT_STATUS_UPDATE');
      await tx.execute(sql`
        UPDATE p2_purchase_orders SET status='IN_PRODUCTION',updated_at=now() WHERE id=${poId}`);
      const [launch] = resultRows(
        await tx.execute(sql`
          INSERT INTO project_production_launches
            (project_id,production_release_id,idempotency_key,status,production_evidence,
             launched_by,launched_by_display_name)
          VALUES (${projectId},${release.id},${idempotencyKey},'COMPLETE',
            ${JSON.stringify({
              poId,
              productionPlanId: source.planning.plan!.id,
              wadAuthorizationId: source.wad.authorization!.id,
              createdSerializedItemIds: createdSerialIds,
              createdProductionOrderIds: productionOrders.map(
                (entry) => entry.id
              ),
              routedItems: routed,
              releasedRoutingBaselines: Array.from(routeByPart.entries()).map(
                ([partNumber, value]) => ({ partNumber, ...value })
              ),
              travelersCreated: 0,
              inventoryDemandsCreated: 0,
              reservationsCreated: 0,
              shippingRecordsCreated: 0,
              closingRecordsCreated: 0,
            })}::jsonb,${actor.userId},${actor.displayName}) RETURNING *`)
      );
      await recordAuditEvent(
        {
          eventType: 'P2_V2_PRODUCTION_LAUNCHED',
          subjectType: 'project_production_launch',
          subjectId: launch.id,
          sourceService: 'projectPreproductionReadinessService',
          actor: {
            id: actor.userId,
            username: actor.username,
            role: actor.role,
          },
          payload: {
            projectId,
            poId,
            serializedItemsCreated: createdSerialIds.length,
            productionOrdersCreated: productionOrders.length,
            itemsRouted: routed.length,
          },
        },
        tx
      );
      return readModel(projectId, tx);
    });
  } catch (error) {
    try {
      await recordAuditEvent({
        eventType: 'P2_V2_PRODUCTION_LAUNCH_FAILED',
        subjectType: 'project',
        subjectId: projectId,
        sourceService: 'projectPreproductionReadinessService',
        actor: { id: actor.userId, username: actor.username, role: actor.role },
        payload: {
          projectId,
          // Do not persist the caller's potentially sensitive opaque key.
          idempotencyKeyPresent: Boolean(clean(idempotencyKey)),
          errorCode:
            error instanceof ProjectPreproductionError
              ? error.code
              : 'PRODUCTION_LAUNCH_FAILED',
        },
      });
    } catch (auditError) {
      console.error('Failed to record P2 V2 launch failure audit:', auditError);
    }
    throw error;
  }
}

export const launchProduction = (
  projectId: string,
  idempotencyKey: string,
  actor: PreproductionActor
) => launchProductionWithDependencies(projectId, idempotencyKey, actor, {});

/**
 * Direct-call certification seam. It changes no runtime behavior and is not
 * reachable from HTTP; PostgreSQL certification uses it only to throw at
 * transaction boundaries that cannot otherwise be observed externally.
 */
export const launchProductionForCertification = (
  projectId: string,
  idempotencyKey: string,
  actor: PreproductionActor,
  fault: NonNullable<ProductionLaunchDependencies['fault']>
) =>
  launchProductionWithDependencies(projectId, idempotencyKey, actor, { fault });
