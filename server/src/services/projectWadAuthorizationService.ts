import { randomUUID } from 'crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { areP2WadTravelerDecisionWritesEnabled } from '../lib/featureFlags';
import { recordAuditEvent, type AuditLedgerTx } from './auditLedgerService';
import { getCurrentProductionPlan } from './projectProductionPlanningService';
import { evaluateCommercialBaseline } from './projectCommercialReviewService';
import { evaluateTechnicalConfigurationBaseline } from './projectTechnicalConfigurationReviewService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';
import { validateWorkflowInstanceIntegrity } from './projectWorkflowInstanceIntegrity';
import {
  inheritedRequirementBlockers,
  wadBudgetBlockers,
  type WadBudgetInput,
} from './projectWadAuthorizationValidation';
import { wadTravelerDecisionBlockers } from './p2WadTravelerDecisionService';

type Executor = AuditLedgerTx;
// Raw-query rows keep the additive bridge isolated from the central schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type WadAuthorizationActor = {
  userId: number;
  employeeId?: number | null;
  username: string;
  displayName: string;
  role: string;
};
export type WadDraftInput = {
  budget: WadBudgetInput;
  financeRequired?: boolean;
  executiveRequired?: boolean;
  confirmation?: string;
};
export class ProjectWadAuthorizationError extends Error {
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

async function context(
  projectId: string,
  tx: Executor,
  lock = false,
  requirePrerequisites = true
) {
  const project = rows(
    await tx.execute(
      sql`SELECT id,project_code AS project_number,project_name,customer_name_snapshot AS customer_name,workflow_version,po_id FROM projects WHERE id=${projectId} ${lock ? sql`FOR UPDATE` : sql``}`
    )
  )[0];
  if (!project)
    throw new ProjectWadAuthorizationError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  const version = resolveProjectWorkflowVersion(project.workflow_version);
  if (version !== 'p2_v2')
    throw new ProjectWadAuthorizationError(
      'P2_V2_REQUIRED',
      'WAD Authorization requires an explicit p2_v2 project.',
      409,
      { effectiveWorkflowVersion: version }
    );
  const instances = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_instances WHERE project_id=${projectId} AND workflow_version='p2_v2' AND status NOT IN ('SUPERSEDED','CANCELLED') ${lock ? sql`FOR UPDATE` : sql``}`
    )
  );
  if (instances.length !== 1)
    throw new ProjectWadAuthorizationError(
      instances.length
        ? 'DUPLICATE_ACTIVE_INSTANCES'
        : 'WORKFLOW_INSTANCE_REQUIRED',
      instances.length
        ? 'Multiple active V2 instances exist.'
        : 'An active V2 workflow instance is required.',
      409
    );
  const steps = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_instances WHERE workflow_instance_id=${instances[0].id} ORDER BY step_order`
    )
  );
  const issues = validateWorkflowInstanceIntegrity(instances[0], steps);
  if (issues.length)
    throw new ProjectWadAuthorizationError(
      'WORKFLOW_INTEGRITY_FAILED',
      'The V2 workflow failed integrity validation.',
      409,
      { issues }
    );
  const step = steps.find((entry) => entry.step_type === 'wad_authorization');
  const compatibilityDefinition = Number(instances[0].definition_version) === 1;
  const technical = steps.find((entry) =>
    compatibilityDefinition
      ? entry.step_type === 'design_applicability'
      : entry.step_type === 'technical_configuration_review'
  );
  const contract = steps.find((entry) => entry.step_type === 'contract_review');
  const planning = steps.find(
    (entry) => entry.step_type === 'production_planning'
  );
  if (!step)
    throw new ProjectWadAuthorizationError(
      'WAD_AUTHORIZATION_STAGE_REQUIRED',
      'WAD Authorization stage is missing.',
      409
    );
  if (
    requirePrerequisites &&
    (!technical ||
      !(compatibilityDefinition
        ? ['COMPLETE', 'NOT_APPLICABLE'].includes(technical.status)
        : technical.status === 'COMPLETE'))
  )
    throw new ProjectWadAuthorizationError(
      'TECHNICAL_CONFIGURATION_REVIEW_REQUIRED',
      'Technical & Configuration Review must remain complete and current.',
      409
    );
  if (requirePrerequisites && (!contract || contract.status !== 'COMPLETE'))
    throw new ProjectWadAuthorizationError(
      'CONTRACT_REVIEW_REQUIRED',
      'Contract Review must remain complete and current.',
      409
    );
  if (requirePrerequisites && (!planning || planning.status !== 'COMPLETE'))
    throw new ProjectWadAuthorizationError(
      'PRODUCTION_PLANNING_REQUIRED',
      'Production Planning must be complete.',
      409
    );
  return {
    project,
    instance: instances[0],
    step,
    technical,
    planning,
    compatibilityDefinition,
  };
}

async function currentAuthorization(projectId: string, tx: Executor) {
  return (
    rows(
      await tx.execute(
        sql`SELECT * FROM project_wad_authorizations WHERE project_id=${projectId} AND status<>'SUPERSEDED' ORDER BY wad_revision DESC LIMIT 1`
      )
    )[0] ?? null
  );
}
async function history(projectId: string, tx: Executor) {
  return rows(
    await tx.execute(
      sql`SELECT * FROM project_wad_authorizations WHERE project_id=${projectId} ORDER BY wad_revision DESC`
    )
  );
}
async function approvals(authorization: Row, tx: Executor) {
  return rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_approvals WHERE workflow_step_instance_id=${authorization.workflow_step_instance_id} AND evidence_snapshot->>'authorizationId'=${authorization.id} ORDER BY decided_at`
    )
  );
}
const requiredRoles = (authorization: Row) => [
  'PROJECT_MANAGEMENT',
  'ENGINEERING',
  'QUALITY',
  'OPERATIONS',
  ...(authorization.finance_required ? ['FINANCE'] : []),
  ...(authorization.executive_required ? ['EXECUTIVE'] : []),
];

async function audit(
  eventType: string,
  authorization: Row,
  actor: WadAuthorizationActor,
  tx: Executor,
  reason?: string
) {
  await recordAuditEvent(
    {
      eventType,
      subjectType: 'project_wad_authorization',
      subjectId: authorization.id,
      sourceService: 'projectWadAuthorizationService',
      actor: {
        id: actor.userId,
        username: actor.displayName,
        role: actor.role,
      },
      reason,
      payload: {
        projectId: authorization.project_id,
        wadId: authorization.wad_work_order_id,
        wadRevision: authorization.wad_revision,
        productionPlanId: authorization.production_plan_id,
        productionPlanRevision: authorization.production_plan_revision,
      },
    },
    tx
  );
}

function inheritedSnapshot(ctx: Row, planModel: Row) {
  const manufactured = planModel.items.filter(
    (item: Row) => item.is_manufactured
  );
  return {
    source: 'RELEASED_P2_V2_PRODUCTION_PLAN',
    project: {
      id: ctx.project.id,
      code: ctx.project.project_number,
      name: ctx.project.project_name,
      customer: ctx.project.customer_name,
    },
    po: {
      id: planModel.plan.po_id,
      number: planModel.plan.po_number,
      revision: planModel.plan.po_revision_number,
    },
    productionPlan: {
      id: planModel.plan.id,
      revision: planModel.plan.revision_number,
      configurationBaselineId: planModel.plan.configuration_baseline_id,
      configurationRevision: planModel.plan.configuration_revision,
      designReleaseId: planModel.plan.design_release_id,
      designReleaseRevision: planModel.plan.design_release_revision,
      effectivityReference: planModel.plan.effectivity_reference,
      requirementSource: planModel.plan.requirement_source,
    },
    manufacturedItems: manufactured,
    sourceAttribution:
      'Each manufacturing requirement is inherited from the released P2 V2 Production Plan item snapshot.',
  };
}

async function readiness(
  projectId: string,
  authorization: Row | null,
  tx: Executor
) {
  const blockers: string[] = [];
  const differences: string[] = [];
  const commercial = await evaluateCommercialBaseline(projectId, tx);
  blockers.push(...commercial.blockers);
  differences.push(...commercial.differences);
  if (!authorization)
    return {
      ready: false,
      stale: differences.length > 0,
      blockers: Array.from(new Set([...blockers, 'A WAD draft is required.'])),
      differences,
    };
  const ctx = await context(projectId, tx, false, false);
  if (
    !(ctx.compatibilityDefinition
      ? ['COMPLETE', 'NOT_APPLICABLE'].includes(ctx.technical?.status ?? '')
      : ctx.technical?.status === 'COMPLETE')
  ) {
    blockers.push('Technical & Configuration Review is no longer valid.');
    differences.push('Technical/configuration baseline changed.');
  }
  if (!ctx.compatibilityDefinition) {
    const technical = await evaluateTechnicalConfigurationBaseline(
      projectId,
      tx
    );
    blockers.push(...technical.blockers);
    differences.push(...technical.differences);
  }
  if (ctx.planning?.status !== 'COMPLETE') {
    blockers.push('Production Planning is no longer complete.');
    differences.push('Production Planning stage is no longer complete.');
  }
  const planModel = await getCurrentProductionPlan(projectId, tx);
  if (!planModel.plan || planModel.plan.status !== 'RELEASED')
    blockers.push('The current Production Plan must be RELEASED.');
  if (planModel.readiness.stale) {
    blockers.push(...planModel.readiness.differences);
    differences.push(...planModel.readiness.differences);
  }
  if (planModel.plan?.id !== authorization.production_plan_id) {
    differences.push('Production Plan revision changed.');
    blockers.push('WAD source Production Plan is no longer current.');
  }
  if (
    Number(planModel.plan?.po_revision_number) !==
    Number(authorization.po_revision_number)
  ) {
    differences.push('Customer PO revision changed.');
    blockers.push(
      'WAD PO revision does not match the current Production Plan.'
    );
  }
  if (
    planModel.plan?.configuration_revision !==
    authorization.configuration_revision
  ) {
    differences.push('Configuration baseline changed.');
    blockers.push('WAD configuration baseline is stale.');
  }
  const snapshot = authorization.inherited_requirements_snapshot ?? {};
  blockers.push(
    ...inheritedRequirementBlockers(snapshot.manufacturedItems ?? [])
  );
  blockers.push(...wadBudgetBlockers(authorization.budget_snapshot ?? {}));
  const departments = authorization.budget_snapshot?.departments ?? [];
  for (const department of departments) {
    if (!department.chargeCodeId) continue;
    const active = rows(
      await tx.execute(
        sql`SELECT id FROM charge_codes WHERE id=${department.chargeCodeId} AND active=true LIMIT 1`
      )
    );
    if (!active.length)
      blockers.push(
        `${department.department || 'Department'}: charge code is missing or inactive.`
      );
  }
  const wad = rows(
    await tx.execute(
      sql`SELECT * FROM production_work_orders WHERE id=${authorization.wad_work_order_id} AND project_id=${projectId}`
    )
  )[0];
  if (!wad)
    blockers.push(
      'The authoritative Work Authorization Document (WAD) is missing.'
    );
  const wadMeta = wad?.wizard_data?.__p2V2Authorization;
  if (wadMeta?.authorizationId !== authorization.id)
    blockers.push(
      'The authoritative WAD does not contain the matching V2 authorization source snapshot.'
    );
  if (authorization.status === 'RELEASED' && wad?.wad_status !== 'APPROVED')
    blockers.push('The authoritative WAD is no longer approved.');
  return {
    ready: blockers.length === 0,
    stale: differences.length > 0,
    blockers: Array.from(new Set(blockers)),
    differences: Array.from(new Set(differences)),
    currentPlanId: planModel.plan?.id ?? null,
    stage: ctx.step,
  };
}

async function readModel(projectId: string, tx: Executor) {
  const ctx = await context(projectId, tx, false, false);
  const authorization = await currentAuthorization(projectId, tx);
  const wad = authorization
    ? (rows(
        await tx.execute(
          sql`SELECT id,work_order_number,project_id,part_number,description,quantity,status,wad_status,department_budgets,total_budget_hours,material_budget_amount,start_date,due_date,warning_threshold,blocked_threshold,wizard_data,created_at,updated_at FROM production_work_orders WHERE id=${authorization.wad_work_order_id}`
        )
      )[0] ?? null)
    : null;
  return {
    authorization,
    wad,
    history: await history(projectId, tx),
    approvals: authorization ? await approvals(authorization, tx) : [],
    requiredApprovals: authorization ? requiredRoles(authorization) : [],
    readiness: await readiness(projectId, authorization, tx),
    stage: ctx.step,
  };
}
export const getCurrentWadAuthorization = (
  projectId: string,
  tx: Executor = db
) => readModel(projectId, tx);

function departmentBudgetObject(budget: WadBudgetInput) {
  return Object.fromEntries(
    (budget.departments ?? []).map((entry) => [
      clean(entry.department),
      {
        hours: entry.hours,
        chargeCodeId: entry.chargeCodeId,
        zeroBudgetJustification: clean(entry.zeroBudgetJustification) || null,
      },
    ])
  );
}

async function createRevision(
  projectId: string,
  input: WadDraftInput,
  actor: WadAuthorizationActor,
  tx: Executor,
  revision: number,
  existingWadId?: string
) {
  const ctx = await context(projectId, tx, true);
  const planModel = await getCurrentProductionPlan(projectId, tx);
  if (
    !planModel.plan ||
    planModel.plan.status !== 'RELEASED' ||
    planModel.readiness.stale
  )
    throw new ProjectWadAuthorizationError(
      'RELEASED_PLAN_REQUIRED',
      'A current, non-stale RELEASED Production Plan is required.',
      409,
      { blockers: planModel.readiness.blockers }
    );
  const inherited = inheritedSnapshot(ctx, planModel);
  const inheritedBlockers = inheritedRequirementBlockers(
    inherited.manufacturedItems
  );
  if (inheritedBlockers.length)
    throw new ProjectWadAuthorizationError(
      'INHERITANCE_INCOMPLETE',
      'Released plan inheritance is incomplete.',
      409,
      { blockers: inheritedBlockers }
    );
  const root = inherited.manufacturedItems[0];
  const totalHours = (input.budget.departments ?? []).reduce(
    (sum, entry) => sum + Number(entry.hours ?? 0),
    0
  );
  let wad: Row;
  if (existingWadId) {
    wad = rows(
      await tx.execute(
        sql`SELECT * FROM production_work_orders WHERE id=${existingWadId} AND project_id=${projectId} FOR UPDATE`
      )
    )[0];
    if (!wad)
      throw new ProjectWadAuthorizationError(
        'WAD_OWNERSHIP_MISMATCH',
        'Existing WAD does not belong to this project.',
        409
      );
    const meta = wad.wizard_data?.__p2V2Authorization;
    if (
      meta &&
      (meta.productionPlanId !== planModel.plan.id ||
        Number(meta.productionPlanRevision) !==
          Number(planModel.plan.revision_number))
    )
      throw new ProjectWadAuthorizationError(
        'WAD_BASELINE_MISMATCH',
        'Existing WAD does not match the current released Production Plan.',
        409,
        {
          differences: [
            'Production Plan ID or revision differs from the current baseline.',
          ],
        }
      );
  } else {
    const wadNumber = `WAD-${clean(ctx.project.project_number) || 'P2V2'}-${revision}-${randomUUID().slice(0, 8).toUpperCase()}`;
    wad = rows(
      await tx.execute(
        sql`INSERT INTO production_work_orders (work_order_number,project_id,part_number,description,quantity,status,wad_status,department_budgets,total_budget_hours,material_budget_amount,start_date,due_date,warning_threshold,blocked_threshold,wizard_data,created_at,updated_at)
            VALUES (${wadNumber},${projectId},${root.part_number},${`P2 V2 WAD authorization for ${ctx.project.project_name ?? ctx.project.project_number}`},${Math.ceil(Number(root.extended_project_quantity ?? 1))},'PLANNED','DRAFT',${JSON.stringify(departmentBudgetObject(input.budget))}::jsonb,${String(totalHours)},${String(input.budget.materialBudget ?? 0)},${input.budget.startDate ?? null},${input.budget.dueDate ?? null},${input.budget.warningThreshold == null ? null : String(input.budget.warningThreshold)},${input.budget.blockingThreshold == null ? null : String(input.budget.blockingThreshold)},${JSON.stringify({})}::jsonb,now(),now()) RETURNING *`
      )
    )[0];
  }
  const authorization = rows(
    await tx.execute(
      sql`INSERT INTO project_wad_authorizations (project_id,workflow_instance_id,workflow_step_instance_id,production_plan_id,production_plan_revision,wad_work_order_id,wad_number,wad_revision,status,po_id,po_revision_number,configuration_revision,effectivity_reference,inherited_requirements_snapshot,budget_snapshot,finance_required,executive_required,created_by,created_by_display_name)
          VALUES (${projectId},${ctx.instance.id},${ctx.step.id},${planModel.plan.id},${planModel.plan.revision_number},${wad.id},${wad.work_order_number},${revision},'DRAFT',${planModel.plan.po_id},${planModel.plan.po_revision_number},${planModel.plan.configuration_revision},${planModel.plan.effectivity_reference},${JSON.stringify(inherited)}::jsonb,${JSON.stringify(input.budget)}::jsonb,${Boolean(input.financeRequired)},${Boolean(input.executiveRequired)},${actor.userId},${actor.displayName}) RETURNING *`
    )
  )[0];
  const wizardData = {
    ...(wad.wizard_data ?? {}),
    currentRevision: revision,
    revisionStatus: 'DRAFT',
    approvals: [],
    __p2V2Authorization: {
      authorizationId: authorization.id,
      productionPlanId: planModel.plan.id,
      productionPlanRevision: planModel.plan.revision_number,
      poId: planModel.plan.po_id,
      poRevision: planModel.plan.po_revision_number,
      configurationRevision: planModel.plan.configuration_revision,
      effectivityReference: planModel.plan.effectivity_reference,
      inheritedRequirements: inherited,
      budget: input.budget,
      source: 'P2 V2 WAD Authorization',
    },
  };
  await tx.execute(
    sql`UPDATE production_work_orders SET wizard_data=${JSON.stringify(wizardData)}::jsonb,updated_at=now() WHERE id=${wad.id}`
  );
  await tx.execute(
    sql`UPDATE project_workflow_step_instances SET status='IN_PROGRESS',blocked_reason=NULL,started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=${ctx.step.id}`
  );
  await audit('P2_V2_WAD_DRAFT_CREATED', authorization, actor, tx);
  return authorization;
}

export async function createWadDraft(
  projectId: string,
  input: WadDraftInput,
  actor: WadAuthorizationActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    if (await currentAuthorization(projectId, tx))
      throw new ProjectWadAuthorizationError(
        'CURRENT_AUTHORIZATION_EXISTS',
        'A current WAD authorization already exists.',
        409
      );
    const existingWad = rows(
      await tx.execute(
        sql`SELECT id,work_order_number,wad_status,status FROM production_work_orders WHERE project_id=${projectId} AND status NOT IN ('COMPLETE','CLOSED','CANCELLED','CANCELED') ORDER BY created_at DESC LIMIT 1`
      )
    )[0];
    if (existingWad)
      throw new ProjectWadAuthorizationError(
        'EXISTING_WAD_REQUIRES_LINK',
        'An existing WAD must be reviewed and linked; a duplicate was not created.',
        409,
        {
          wadId: existingWad.id,
          wadNumber: existingWad.work_order_number,
          wadStatus: existingWad.wad_status,
          workOrderStatus: existingWad.status,
        }
      );
    await createRevision(projectId, input, actor, tx, 1);
    return readModel(projectId, tx);
  });
}

export async function linkExistingWad(
  projectId: string,
  wadId: string,
  input: WadDraftInput,
  actor: WadAuthorizationActor
) {
  if (input.confirmation !== 'LINK_MATCHING_BASELINE')
    throw new ProjectWadAuthorizationError(
      'CONFIRMATION_REQUIRED',
      'Controlled baseline-match confirmation is required.'
    );
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    if (await currentAuthorization(projectId, tx))
      throw new ProjectWadAuthorizationError(
        'CURRENT_AUTHORIZATION_EXISTS',
        'A current WAD authorization already exists.',
        409
      );
    await createRevision(projectId, input, actor, tx, 1, wadId);
    return readModel(projectId, tx);
  });
}

export async function submitWadAuthorization(
  projectId: string,
  authorizationId: string,
  actor: WadAuthorizationActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const authorization = await currentAuthorization(projectId, tx);
    if (!authorization || authorization.id !== authorizationId)
      throw new ProjectWadAuthorizationError(
        'CURRENT_AUTHORIZATION_NOT_FOUND',
        'Current WAD authorization not found.',
        404
      );
    if (authorization.status !== 'DRAFT')
      throw new ProjectWadAuthorizationError(
        'DRAFT_REQUIRED',
        'Only a draft WAD authorization may be submitted.',
        409
      );
    const state = await readiness(projectId, authorization, tx);
    if (areP2WadTravelerDecisionWritesEnabled())
      state.blockers.push(
        ...(await wadTravelerDecisionBlockers(projectId, authorizationId))
      );
    state.ready = state.blockers.length === 0;
    if (!state.ready)
      throw new ProjectWadAuthorizationError(
        'WAD_NOT_READY',
        'WAD authorization has readiness blockers.',
        409,
        { blockers: state.blockers }
      );
    await tx.execute(
      sql`UPDATE project_wad_authorizations SET status='PENDING_APPROVAL',updated_at=now() WHERE id=${authorizationId}`
    );
    await tx.execute(
      sql`UPDATE production_work_orders SET wad_status='PENDING_APPROVAL',wizard_data=jsonb_set(COALESCE(wizard_data,'{}'::jsonb),'{revisionStatus}','"IN_REVIEW"'::jsonb),updated_at=now() WHERE id=${authorization.wad_work_order_id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='PENDING_APPROVAL',updated_at=now() WHERE id=${ctx.step.id}`
    );
    await audit('P2_V2_WAD_SUBMITTED', authorization, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function recordWadDecision(
  projectId: string,
  authorizationId: string,
  capacity:
    | 'PROJECT_MANAGEMENT'
    | 'ENGINEERING'
    | 'QUALITY'
    | 'OPERATIONS'
    | 'FINANCE'
    | 'EXECUTIVE',
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: WadAuthorizationActor
) {
  if (!clean(signatureMeaning))
    throw new ProjectWadAuthorizationError(
      'SIGNATURE_MEANING_REQUIRED',
      'Signature meaning is required.'
    );
  if (decision !== 'APPROVED' && !clean(reason))
    throw new ProjectWadAuthorizationError(
      'REASON_REQUIRED',
      'Rejection/return reason is required.'
    );
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const authorization = await currentAuthorization(projectId, tx);
    if (!authorization || authorization.id !== authorizationId)
      throw new ProjectWadAuthorizationError(
        'CURRENT_AUTHORIZATION_NOT_FOUND',
        'Current WAD authorization not found.',
        404
      );
    if (authorization.status !== 'PENDING_APPROVAL')
      throw new ProjectWadAuthorizationError(
        'PENDING_APPROVAL_REQUIRED',
        'WAD authorization is not pending approval.',
        409
      );
    if (!requiredRoles(authorization).includes(capacity))
      throw new ProjectWadAuthorizationError(
        'APPROVAL_NOT_REQUIRED',
        `${capacity} approval is not required for this revision.`,
        409
      );
    if (authorization.created_by === actor.userId)
      throw new ProjectWadAuthorizationError(
        'SEGREGATION_OF_DUTIES',
        'The WAD creator cannot approve the same controlled revision.',
        403
      );
    const existing = await approvals(authorization, tx);
    if (existing.some((entry) => entry.approval_type === `WAD_${capacity}`))
      throw new ProjectWadAuthorizationError(
        'DECISION_ALREADY_RECORDED',
        `${capacity} already decided this WAD revision.`,
        409
      );
    if (
      existing.some(
        (entry) =>
          entry.actor_user_id === actor.userId && entry.decision === 'APPROVED'
      )
    )
      throw new ProjectWadAuthorizationError(
        'SEGREGATION_OF_DUTIES',
        'One user cannot provide multiple functional WAD approvals.',
        403
      );
    await tx.execute(
      sql`INSERT INTO project_workflow_step_approvals (workflow_step_instance_id,project_id,approval_type,decision,signature_meaning,reason,actor_employee_id,actor_user_id,actor_display_name,actor_role,step_revision_snapshot,evidence_snapshot)
          VALUES (${ctx.step.id},${projectId},${`WAD_${capacity}`},${decision},${signatureMeaning},${clean(reason) || null},${actor.employeeId ?? null},${actor.userId},${actor.displayName},${actor.role},${String(authorization.wad_revision)},${JSON.stringify({ authorizationId, wadId: authorization.wad_work_order_id, wadRevision: authorization.wad_revision, productionPlanId: authorization.production_plan_id, productionPlanRevision: authorization.production_plan_revision, poId: authorization.po_id, poRevision: authorization.po_revision_number, configurationRevision: authorization.configuration_revision, capacity })}::jsonb)`
    );
    if (decision !== 'APPROVED') {
      await tx.execute(
        sql`UPDATE project_wad_authorizations SET status='REJECTED',updated_at=now() WHERE id=${authorizationId}`
      );
      await tx.execute(
        sql`UPDATE production_work_orders SET wad_status='DRAFT',updated_at=now() WHERE id=${authorization.wad_work_order_id}`
      );
      await tx.execute(
        sql`UPDATE project_workflow_step_instances SET status='BLOCKED',blocked_reason=${`${capacity} ${decision.toLowerCase()}: ${clean(reason)}`},updated_at=now() WHERE id=${ctx.step.id}`
      );
    }
    await audit(
      `P2_V2_WAD_${capacity}_DECIDED`,
      authorization,
      actor,
      tx,
      clean(reason) || undefined
    );
    return readModel(projectId, tx);
  });
}

async function releaseLinks(
  authorization: Row,
  actor: WadAuthorizationActor,
  tx: Executor
) {
  await tx.execute(
    sql`UPDATE project_workflow_step_links SET unlinked_at=now(),unlink_reason='Superseded by released WAD authorization revision' WHERE workflow_step_instance_id=${authorization.workflow_step_instance_id} AND is_authoritative=true AND unlinked_at IS NULL`
  );
  for (const link of [
    [
      'production_work_order',
      authorization.wad_work_order_id,
      String(authorization.wad_revision),
      'PRIMARY',
    ],
    [
      'project_production_plan',
      authorization.production_plan_id,
      String(authorization.production_plan_revision),
      'EVIDENCE',
    ],
    [
      'p2_purchase_order',
      String(authorization.po_id),
      String(authorization.po_revision_number),
      'EVIDENCE',
    ],
    [
      'configuration_baseline',
      authorization.configuration_revision,
      authorization.configuration_revision,
      'EVIDENCE',
    ],
  ]) {
    await tx.execute(
      sql`INSERT INTO project_workflow_step_links (workflow_step_instance_id,project_id,record_type,record_id,relationship_type,is_authoritative,record_revision,effectivity_reference,linked_by,linked_by_display_name)
          VALUES (${authorization.workflow_step_instance_id},${authorization.project_id},${link[0]},${link[1]},${link[3]},true,${link[2]},${authorization.effectivity_reference},${actor.employeeId ?? null},${actor.displayName})`
    );
  }
}

export async function releaseWadAuthorization(
  projectId: string,
  authorizationId: string,
  signatureMeaning: string,
  actor: WadAuthorizationActor
) {
  if (!clean(signatureMeaning))
    throw new ProjectWadAuthorizationError(
      'SIGNATURE_MEANING_REQUIRED',
      'Release signature meaning is required.'
    );
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const authorization = await currentAuthorization(projectId, tx);
    if (!authorization || authorization.id !== authorizationId)
      throw new ProjectWadAuthorizationError(
        'CURRENT_AUTHORIZATION_NOT_FOUND',
        'Current WAD authorization not found.',
        404
      );
    if (authorization.status !== 'PENDING_APPROVAL')
      throw new ProjectWadAuthorizationError(
        'PENDING_APPROVAL_REQUIRED',
        'WAD authorization is not pending approval.',
        409
      );
    const state = await readiness(projectId, authorization, tx);
    if (areP2WadTravelerDecisionWritesEnabled())
      state.blockers.push(
        ...(await wadTravelerDecisionBlockers(projectId, authorizationId))
      );
    state.ready = state.blockers.length === 0;
    if (!state.ready)
      throw new ProjectWadAuthorizationError(
        'WAD_NOT_READY',
        'WAD authorization has readiness blockers.',
        409,
        { blockers: state.blockers }
      );
    const evidence = await approvals(authorization, tx);
    const missing = requiredRoles(authorization).filter(
      (role) =>
        !evidence.some(
          (entry) =>
            entry.approval_type === `WAD_${role}` &&
            entry.decision === 'APPROVED'
        )
    );
    if (missing.length)
      throw new ProjectWadAuthorizationError(
        'APPROVALS_REQUIRED',
        'All required WAD approvals must be recorded.',
        409,
        { missingApprovals: missing }
      );
    if (
      authorization.created_by === actor.userId ||
      evidence.some((entry) => entry.actor_user_id === actor.userId)
    )
      throw new ProjectWadAuthorizationError(
        'SEGREGATION_OF_DUTIES',
        'WAD release requires an independent employee who neither created nor approved the revision.',
        403
      );
    const wizardApprovals = evidence.map((entry) => ({
      role: String(entry.approval_type).replace(/^WAD_/, '').toLowerCase(),
      userId: entry.actor_user_id,
      displayName: entry.actor_display_name,
      decision: entry.decision,
      comments: entry.reason,
      signature: entry.actor_display_name,
      signatureMeaning: entry.signature_meaning,
      signedAt: entry.decided_at,
      source: 'P2 V2 WAD Authorization',
    }));
    await tx.execute(
      sql`UPDATE production_work_orders SET wad_status='APPROVED',status='RELEASED',wizard_data=jsonb_set(jsonb_set(COALESCE(wizard_data,'{}'::jsonb),'{approvals}',${JSON.stringify(wizardApprovals)}::jsonb),'{revisionStatus}','"APPROVED"'::jsonb),updated_at=now() WHERE id=${authorization.wad_work_order_id} AND project_id=${projectId}`
    );
    await tx.execute(
      sql`UPDATE project_wad_authorizations SET status='RELEASED',approval_snapshot=${JSON.stringify(wizardApprovals)}::jsonb,authorized_at=now(),authorized_by=${actor.userId},authorized_by_display_name=${actor.displayName},updated_at=now() WHERE id=${authorizationId}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='COMPLETE',completed_at=now(),completed_by=${actor.employeeId ?? null},completed_by_display_name=${actor.displayName},blocked_reason=NULL,revision_reference=${String(authorization.wad_revision)},effectivity_reference=${authorization.effectivity_reference},updated_at=now() WHERE id=${ctx.step.id}`
    );
    await releaseLinks(authorization, actor, tx);
    await audit(
      'P2_V2_WAD_RELEASED',
      authorization,
      actor,
      tx,
      signatureMeaning
    );
    return readModel(projectId, tx);
  });
}

export async function reviseWadAuthorization(
  projectId: string,
  authorizationId: string,
  input: WadDraftInput,
  actor: WadAuthorizationActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const prior = await currentAuthorization(projectId, tx);
    if (!prior || prior.id !== authorizationId)
      throw new ProjectWadAuthorizationError(
        'CURRENT_AUTHORIZATION_NOT_FOUND',
        'Current WAD authorization not found.',
        404
      );
    if (!['RELEASED', 'REJECTED', 'BLOCKED'].includes(prior.status))
      throw new ProjectWadAuthorizationError(
        'REVISION_NOT_ALLOWED',
        'Only released, rejected or blocked WAD authorizations may be revised.',
        409
      );
    const nextRevision = Number(prior.wad_revision) + 1;
    await tx.execute(
      sql`UPDATE project_wad_authorizations SET status='SUPERSEDED',superseded_at=now(),updated_at=now() WHERE id=${prior.id}`
    );
    const next = await createRevision(
      projectId,
      input,
      actor,
      tx,
      nextRevision
    );
    await tx.execute(
      sql`UPDATE project_wad_authorizations SET superseded_by_authorization_id=${next.id} WHERE id=${prior.id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_approvals SET superseded_at=now() WHERE workflow_step_instance_id=${ctx.step.id} AND evidence_snapshot->>'authorizationId'=${prior.id} AND superseded_at IS NULL`
    );
    await audit('P2_V2_WAD_REVISED', next, actor, tx);
    return readModel(projectId, tx);
  });
}
