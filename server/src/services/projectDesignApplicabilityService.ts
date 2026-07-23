import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { recordAuditEvent, type AuditLedgerTx } from './auditLedgerService';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';
import { validateWorkflowInstanceIntegrity } from './projectWorkflowInstanceIntegrity';
import { evaluateCommercialBaseline } from './projectCommercialReviewService';
import {
  ProjectDesignApplicabilityError,
  validateDesignApplicabilityInput,
  type DesignInput,
} from './projectDesignApplicabilityValidation';

export {
  ProjectDesignApplicabilityError,
  validateDesignApplicabilityInput,
} from './projectDesignApplicabilityValidation';

type Executor = AuditLedgerTx;
// SQL rows are intentionally dynamic at this raw-query integration boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
export type DesignActor = {
  userId: number;
  employeeId?: number | null;
  username: string;
  displayName: string;
  role: string;
};

const resultRows = <T extends Row>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : ((value as { rows?: T[] } | null)?.rows ?? []);
const clean = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

async function context(projectId: string, tx: Executor, lock = false) {
  const projects = resultRows(
    await tx.execute(
      sql`SELECT id, workflow_version FROM projects WHERE id = ${projectId} ${lock ? sql`FOR UPDATE` : sql``}`
    )
  );
  if (!projects[0])
    throw new ProjectDesignApplicabilityError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  const version = resolveProjectWorkflowVersion(projects[0].workflow_version);
  if (version !== 'p2_v2')
    throw new ProjectDesignApplicabilityError(
      'P2_V2_REQUIRED',
      'Design Applicability mutations require an explicit p2_v2 project.',
      409,
      { effectiveWorkflowVersion: version }
    );
  const instances = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_instances WHERE project_id = ${projectId} AND workflow_version = 'p2_v2' AND status NOT IN ('SUPERSEDED','CANCELLED') ${lock ? sql`FOR UPDATE` : sql``}`
    )
  );
  if (!instances[0])
    throw new ProjectDesignApplicabilityError(
      'WORKFLOW_INSTANCE_REQUIRED',
      'An active P2 V2 workflow instance is required.',
      409
    );
  if (instances.length > 1)
    throw new ProjectDesignApplicabilityError(
      'DUPLICATE_ACTIVE_INSTANCES',
      'Multiple active workflow instances exist.',
      409
    );
  const steps = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_instances WHERE workflow_instance_id = ${instances[0].id} ORDER BY step_order`
    )
  );
  const issues = validateWorkflowInstanceIntegrity(instances[0], steps);
  if (issues.length)
    throw new ProjectDesignApplicabilityError(
      'WORKFLOW_INTEGRITY_FAILED',
      'The V2 workflow instance failed integrity validation.',
      409,
      { issues }
    );
  const step = steps.find((item) => item.step_type === 'design_applicability');
  if (!step)
    throw new ProjectDesignApplicabilityError(
      'DESIGN_APPLICABILITY_STAGE_REQUIRED',
      'The Design Applicability stage is missing.',
      409
    );
  return { instance: instances[0], step, steps };
}

async function current(projectId: string, tx: Executor) {
  return (
    resultRows(
      await tx.execute(
        sql`SELECT * FROM project_design_applicability_decisions WHERE project_id = ${projectId} AND status <> 'SUPERSEDED' ORDER BY revision_number DESC LIMIT 1`
      )
    )[0] ?? null
  );
}

async function releaseState(
  projectId: string,
  designProjectId: string | null,
  tx: Executor
) {
  if (!designProjectId)
    return {
      valid: false,
      released: false,
      blockers: ['A linked Design Project is required.'],
      designProject: null,
      release: null,
    };
  const designProject = resultRows(
    await tx.execute(sql`
    SELECT rp.id, rp.project_name, rp.status, rp.engineering_status, dcr.id AS design_control_record_id, dcr.status AS design_control_status
    FROM rd_projects rp
    LEFT JOIN design_control_records dcr ON dcr.rd_project_id = rp.id AND dcr.project_id = ${projectId}
    WHERE rp.id = ${designProjectId}
    ORDER BY dcr.created_at DESC NULLS LAST LIMIT 1`)
  )[0];
  if (!designProject)
    return {
      valid: false,
      released: false,
      blockers: ['The selected Design Project does not exist.'],
      designProject: null,
      release: null,
    };
  if (!designProject.design_control_record_id)
    return {
      valid: false,
      released: false,
      blockers: [
        'The selected Design Project is not linked to this P2 project through Design Control.',
      ],
      designProject,
      release: null,
    };
  const release =
    resultRows(
      await tx.execute(sql`
    SELECT id, release_number, release_revision, release_status, effective_date, released_at
    FROM engineering_releases
    WHERE rd_project_id = ${designProjectId} AND design_control_record_id = ${designProject.design_control_record_id} AND release_status = 'RELEASED'
    ORDER BY released_at DESC NULLS LAST, created_at DESC LIMIT 1`)
    )[0] ?? null;
  const openReviews = resultRows(
    await tx.execute(sql`
    SELECT id, title, status FROM design_control_reviews
    WHERE record_id = ${designProject.design_control_record_id}
      AND lower(status) NOT IN ('approved','complete','completed','closed','not_applicable','not applicable')`)
  );
  const blockers: string[] = [];
  const rdReleased = ['released', 'engineering_released'].includes(
    String(designProject.engineering_status ?? '').toLowerCase()
  );
  if (
    !release ||
    designProject.design_control_status !== 'engineering_released' ||
    !rdReleased
  )
    blockers.push(
      'The linked Design Project has not reached formal Engineering Release or has been reopened.'
    );
  if (openReviews.length)
    blockers.push(
      `${openReviews.length} Design Control review action(s) remain open.`
    );
  return {
    valid: true,
    released:
      Boolean(release) &&
      designProject.design_control_status === 'engineering_released' &&
      rdReleased &&
      openReviews.length === 0,
    blockers,
    designProject,
    release,
    openReviews,
  };
}

async function approvals(decisionId: string, stepId: string, tx: Executor) {
  return resultRows(
    await tx.execute(sql`
    SELECT * FROM project_workflow_step_approvals
    WHERE workflow_step_instance_id = ${stepId} AND evidence_snapshot->>'decisionId' = ${decisionId}
    ORDER BY decided_at`)
  );
}

async function readModel(projectId: string, tx: Executor) {
  const ctx = await context(projectId, tx);
  const decision = await current(projectId, tx);
  const history = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_design_applicability_decisions WHERE project_id = ${projectId} ORDER BY revision_number DESC`
    )
  );
  const decisionApprovals = decision
    ? await approvals(decision.id, ctx.step.id, tx)
    : [];
  const approvalHistory = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_approvals WHERE workflow_step_instance_id = ${ctx.step.id} AND approval_type IN ('DESIGN_APPLICABILITY_ENGINEERING','DESIGN_APPLICABILITY_QUALITY','DESIGN_APPLICABILITY') ORDER BY decided_at DESC`
    )
  );
  const links = resultRows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_links WHERE workflow_step_instance_id = ${ctx.step.id} ORDER BY linked_at DESC`
    )
  );
  const release = await releaseState(
    projectId,
    decision?.linked_design_project_id ?? null,
    tx
  );
  const blockers: string[] = [];
  const commercial = await evaluateCommercialBaseline(projectId, tx);
  blockers.push(...commercial.blockers);
  if (!decision) blockers.push('Create a Design Applicability decision.');
  else {
    if (decision.status !== 'APPROVED')
      blockers.push(
        `Decision revision ${decision.revision_number} is ${decision.status}.`
      );
    const eng = decisionApprovals.some(
      (a) =>
        a.approval_type === 'DESIGN_APPLICABILITY_ENGINEERING' &&
        a.decision === 'APPROVED' &&
        !a.superseded_at
    );
    const quality = decisionApprovals.some(
      (a) =>
        a.approval_type === 'DESIGN_APPLICABILITY_QUALITY' &&
        a.decision === 'APPROVED' &&
        !a.superseded_at
    );
    if (!eng) blockers.push('Engineering approval is required.');
    if (!quality) blockers.push('Quality approval is required.');
    if (decision.responsibility_type !== 'CUSTOMER_BUILD_TO_PRINT')
      blockers.push(...release.blockers);
  }
  const predecessors = ctx.steps.filter((s) => s.step_order < 4);
  const incomplete = predecessors.filter(
    (s) =>
      s.status !== 'COMPLETE' &&
      !(s.step_type === 'estimate_quote' && s.status === 'APPROVED')
  );
  if (incomplete.length)
    blockers.push(
      `Predecessor stages must complete: ${incomplete.map((s) => s.label_snapshot).join(', ')}.`
    );
  return {
    decision,
    history,
    approvals: decisionApprovals,
    approvalHistory,
    links,
    release,
    stage: ctx.step,
    readiness: { ready: blockers.length === 0, blockers },
  };
}

async function audit(
  eventType: string,
  decision: Row,
  actor: DesignActor,
  tx: Executor,
  reason?: string
) {
  await recordAuditEvent(
    {
      eventType,
      subjectType: 'project_design_applicability_decision',
      subjectId: decision.id,
      sourceService: 'projectDesignApplicabilityService',
      actor: { id: actor.userId, username: actor.username, role: actor.role },
      reason,
      payload: {
        projectId: decision.project_id,
        workflowInstanceId: decision.workflow_instance_id,
        workflowStepInstanceId: decision.workflow_step_instance_id,
        revisionNumber: decision.revision_number,
        responsibilityType: decision.responsibility_type,
      },
    },
    tx
  );
}

async function insertDecision(
  projectId: string,
  input: DesignInput,
  actor: DesignActor,
  tx: Executor,
  revision: number
) {
  const ctx = await context(projectId, tx, true);
  const needsDesignControl =
    input.responsibilityType !== 'CUSTOMER_BUILD_TO_PRINT';
  if (needsDesignControl) {
    const state = await releaseState(
      projectId,
      clean(input.linkedDesignProjectId),
      tx
    );
    if (!state.valid)
      throw new ProjectDesignApplicabilityError(
        'INVALID_DESIGN_PROJECT',
        state.blockers[0],
        400
      );
  }
  return resultRows(
    await tx.execute(sql`
    INSERT INTO project_design_applicability_decisions
      (project_id, workflow_instance_id, workflow_step_instance_id, revision_number, status, responsibility_type, ag_design_scope, customer_design_scope, responsibility_boundary, requirement_source, customer_drawing_number, customer_drawing_revision, customer_specifications, linked_design_project_id, design_control_required, justification, created_by, created_by_display_name)
    VALUES (${projectId}, ${ctx.instance.id}, ${ctx.step.id}, ${revision}, 'DRAFT', ${input.responsibilityType}, ${clean(input.agDesignScope) || null}, ${clean(input.customerDesignScope) || null}, ${clean(input.responsibilityBoundary) || null}, ${clean(input.requirementSource)}, ${clean(input.customerDrawingNumber) || null}, ${clean(input.customerDrawingRevision) || null}, ${JSON.stringify(input.customerSpecifications ?? [])}::jsonb, ${clean(input.linkedDesignProjectId) || null}, ${needsDesignControl}, ${clean(input.justification)}, ${actor.userId}, ${actor.displayName}) RETURNING *`)
  )[0];
}

export async function getCurrentDesignApplicability(
  projectId: string,
  tx: Executor = db
) {
  return readModel(projectId, tx);
}
export async function getDesignApplicabilityHistory(
  projectId: string,
  tx: Executor = db
) {
  await context(projectId, tx);
  return resultRows(
    await tx.execute(
      sql`SELECT * FROM project_design_applicability_decisions WHERE project_id = ${projectId} ORDER BY revision_number DESC`
    )
  );
}

export async function createDraft(
  projectId: string,
  input: DesignInput,
  actor: DesignActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    if (await current(projectId, tx))
      throw new ProjectDesignApplicabilityError(
        'CURRENT_DECISION_EXISTS',
        'Revise the current decision instead of creating another.',
        409
      );
    const decision = await insertDecision(projectId, input, actor, tx, 1);
    await audit(
      'P2_V2_DESIGN_APPLICABILITY_DRAFT_CREATED',
      decision,
      actor,
      tx
    );
    return readModel(projectId, tx);
  });
}

export async function updateDraft(
  projectId: string,
  decisionId: string,
  input: DesignInput,
  actor: DesignActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const decision = await current(projectId, tx);
    if (!decision || decision.id !== decisionId)
      throw new ProjectDesignApplicabilityError(
        'CURRENT_DECISION_NOT_FOUND',
        'Current decision not found.',
        404
      );
    if (decision.status !== 'DRAFT')
      throw new ProjectDesignApplicabilityError(
        'DRAFT_REQUIRED',
        'Only a draft decision can be edited.',
        409
      );
    if (input.responsibilityType !== 'CUSTOMER_BUILD_TO_PRINT') {
      const state = await releaseState(
        projectId,
        clean(input.linkedDesignProjectId),
        tx
      );
      if (!state.valid)
        throw new ProjectDesignApplicabilityError(
          'INVALID_DESIGN_PROJECT',
          state.blockers[0],
          400
        );
    }
    await tx.execute(
      sql`UPDATE project_design_applicability_decisions SET responsibility_type=${input.responsibilityType}, ag_design_scope=${clean(input.agDesignScope) || null}, customer_design_scope=${clean(input.customerDesignScope) || null}, responsibility_boundary=${clean(input.responsibilityBoundary) || null}, requirement_source=${clean(input.requirementSource)}, customer_drawing_number=${clean(input.customerDrawingNumber) || null}, customer_drawing_revision=${clean(input.customerDrawingRevision) || null}, customer_specifications=${JSON.stringify(input.customerSpecifications ?? [])}::jsonb, linked_design_project_id=${clean(input.linkedDesignProjectId) || null}, design_control_required=${input.responsibilityType !== 'CUSTOMER_BUILD_TO_PRINT'}, justification=${clean(input.justification)}, updated_at=now() WHERE id=${decisionId}`
    );
    await audit(
      'P2_V2_DESIGN_APPLICABILITY_DRAFT_UPDATED',
      decision,
      actor,
      tx
    );
    return readModel(projectId, tx);
  });
}

export async function submitForApproval(
  projectId: string,
  decisionId: string,
  actor: DesignActor
) {
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const decision = await current(projectId, tx);
    if (!decision || decision.id !== decisionId)
      throw new ProjectDesignApplicabilityError(
        'CURRENT_DECISION_NOT_FOUND',
        'Current decision not found.',
        404
      );
    if (decision.status !== 'DRAFT')
      throw new ProjectDesignApplicabilityError(
        'DRAFT_REQUIRED',
        'Only a draft can be submitted.',
        409
      );
    validateDesignApplicabilityInput({
      responsibilityType: decision.responsibility_type,
      agDesignScope: decision.ag_design_scope,
      customerDesignScope: decision.customer_design_scope,
      responsibilityBoundary: decision.responsibility_boundary,
      requirementSource: decision.requirement_source,
      customerDrawingNumber: decision.customer_drawing_number,
      customerDrawingRevision: decision.customer_drawing_revision,
      customerSpecifications: decision.customer_specifications,
      linkedDesignProjectId: decision.linked_design_project_id,
      justification: decision.justification,
    });
    if (decision.responsibility_type !== 'CUSTOMER_BUILD_TO_PRINT') {
      const state = await releaseState(
        projectId,
        decision.linked_design_project_id,
        tx
      );
      if (!state.valid)
        throw new ProjectDesignApplicabilityError(
          'INVALID_DESIGN_PROJECT',
          state.blockers[0],
          400
        );
      const oldLinks = resultRows(
        await tx.execute(
          sql`UPDATE project_workflow_step_links SET unlinked_at=now(), unlink_reason='Superseded by Design Applicability revision ' || ${String(decision.revision_number)}, updated_at=now() WHERE workflow_step_instance_id=${ctx.step.id} AND record_type='DESIGN_PROJECT' AND is_authoritative=true AND unlinked_at IS NULL AND record_id<>${decision.linked_design_project_id} RETURNING *`
        )
      );
      await tx.execute(
        sql`INSERT INTO project_workflow_step_links (workflow_step_instance_id, project_id, record_type, record_id, relationship_type, is_authoritative, linked_by, linked_by_display_name) SELECT ${ctx.step.id}, ${projectId}, 'DESIGN_PROJECT', ${decision.linked_design_project_id}, 'PRIMARY', true, ${actor.employeeId ?? null}, ${actor.displayName} WHERE NOT EXISTS (SELECT 1 FROM project_workflow_step_links WHERE workflow_step_instance_id=${ctx.step.id} AND record_type='DESIGN_PROJECT' AND is_authoritative=true AND unlinked_at IS NULL AND record_id=${decision.linked_design_project_id})`
      );
      void oldLinks;
    }
    await tx.execute(
      sql`UPDATE project_design_applicability_decisions SET status='PENDING_APPROVAL', submitted_by=${actor.userId}, submitted_by_display_name=${actor.displayName}, submitted_at=now(), updated_at=now() WHERE id=${decisionId}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='PENDING_APPROVAL', applicability='CONDITIONAL', blocked_reason=NULL, updated_at=now() WHERE id=${ctx.step.id}`
    );
    await audit('P2_V2_DESIGN_APPLICABILITY_SUBMITTED', decision, actor, tx);
    return readModel(projectId, tx);
  });
}

async function recordDecision(
  projectId: string,
  decisionId: string,
  capacity: 'ENGINEERING' | 'QUALITY',
  choice: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: DesignActor
) {
  if (!clean(signatureMeaning))
    throw new ProjectDesignApplicabilityError(
      'SIGNATURE_MEANING_REQUIRED',
      'Signature meaning is required.'
    );
  if (choice !== 'APPROVED' && !clean(reason))
    throw new ProjectDesignApplicabilityError(
      'REASON_REQUIRED',
      'A rejection/return reason is required.'
    );
  return db.transaction(async (tx) => {
    const ctx = await context(projectId, tx, true);
    const decision = await current(projectId, tx);
    if (!decision || decision.id !== decisionId)
      throw new ProjectDesignApplicabilityError(
        'CURRENT_DECISION_NOT_FOUND',
        'Current decision not found.',
        404
      );
    if (decision.status !== 'PENDING_APPROVAL')
      throw new ProjectDesignApplicabilityError(
        'PENDING_APPROVAL_REQUIRED',
        'The decision is not pending approval.',
        409
      );
    const existing = await approvals(decisionId, ctx.step.id, tx);
    if (
      existing.some(
        (a) => a.approval_type === `DESIGN_APPLICABILITY_${capacity}`
      )
    )
      throw new ProjectDesignApplicabilityError(
        'DECISION_ALREADY_RECORDED',
        `${capacity} already decided this revision.`,
        409
      );
    const other = existing.find(
      (a) =>
        a.approval_type !== `DESIGN_APPLICABILITY_${capacity}` &&
        a.decision === 'APPROVED'
    );
    if (other && other.actor_user_id === actor.userId)
      throw new ProjectDesignApplicabilityError(
        'SEGREGATION_OF_DUTIES',
        'The same user cannot provide both Engineering and Quality approvals.',
        403
      );
    await tx.execute(
      sql`INSERT INTO project_workflow_step_approvals (workflow_step_instance_id, project_id, approval_type, decision, signature_meaning, reason, actor_employee_id, actor_user_id, actor_display_name, actor_role, step_revision_snapshot, evidence_snapshot) VALUES (${ctx.step.id}, ${projectId}, ${`DESIGN_APPLICABILITY_${capacity}`}, ${choice}, ${clean(signatureMeaning)}, ${clean(reason) || null}, ${actor.employeeId ?? null}, ${actor.userId}, ${actor.displayName}, ${actor.role}, ${String(decision.revision_number)}, ${JSON.stringify({ decisionId, responsibilityType: decision.responsibility_type, capacity })}::jsonb)`
    );
    if (choice !== 'APPROVED') {
      await tx.execute(
        sql`UPDATE project_design_applicability_decisions SET status='REJECTED', updated_at=now() WHERE id=${decisionId}`
      );
      await tx.execute(
        sql`UPDATE project_workflow_step_instances SET status='BLOCKED', blocked_reason=${`${capacity} ${choice.toLowerCase()}: ${clean(reason)}`}, updated_at=now() WHERE id=${ctx.step.id}`
      );
    } else {
      const all = await approvals(decisionId, ctx.step.id, tx);
      const approved = ['ENGINEERING', 'QUALITY'].every((role) =>
        all.some(
          (a) =>
            a.approval_type === `DESIGN_APPLICABILITY_${role}` &&
            a.decision === 'APPROVED'
        )
      );
      if (approved)
        await tx.execute(
          sql`UPDATE project_design_applicability_decisions SET status='APPROVED', updated_at=now() WHERE id=${decisionId}`
        );
    }
    await audit(
      `P2_V2_DESIGN_APPLICABILITY_${capacity}_DECIDED`,
      decision,
      actor,
      tx,
      clean(reason) || undefined
    );
    await synchronizeDesignStageStatus(projectId, tx, actor);
    return readModel(projectId, tx);
  });
}

export const recordEngineeringDecision = (
  projectId: string,
  decisionId: string,
  choice: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: DesignActor
) =>
  recordDecision(
    projectId,
    decisionId,
    'ENGINEERING',
    choice,
    signatureMeaning,
    reason,
    actor
  );
export const recordQualityDecision = (
  projectId: string,
  decisionId: string,
  choice: 'APPROVED' | 'REJECTED' | 'RETURNED',
  signatureMeaning: string,
  reason: string,
  actor: DesignActor
) =>
  recordDecision(
    projectId,
    decisionId,
    'QUALITY',
    choice,
    signatureMeaning,
    reason,
    actor
  );

export async function reviseDecision(
  projectId: string,
  decisionId: string,
  input: DesignInput,
  actor: DesignActor
) {
  return db.transaction(async (tx) => {
    await context(projectId, tx, true);
    const prior = await current(projectId, tx);
    if (!prior || prior.id !== decisionId)
      throw new ProjectDesignApplicabilityError(
        'CURRENT_DECISION_NOT_FOUND',
        'Current decision not found.',
        404
      );
    if (!['APPROVED', 'REJECTED'].includes(prior.status))
      throw new ProjectDesignApplicabilityError(
        'REVISION_NOT_ALLOWED',
        'Only an approved or rejected decision can be revised.',
        409
      );
    await tx.execute(
      sql`UPDATE project_design_applicability_decisions SET status='SUPERSEDED', superseded_at=now(), updated_at=now() WHERE id=${prior.id}`
    );
    const next = await insertDecision(
      projectId,
      input,
      actor,
      tx,
      Number(prior.revision_number) + 1
    );
    await tx.execute(
      sql`UPDATE project_design_applicability_decisions SET superseded_by_decision_id=${next.id}, updated_at=now() WHERE id=${prior.id}`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_approvals SET superseded_at=now() WHERE workflow_step_instance_id=${prior.workflow_step_instance_id} AND evidence_snapshot->>'decisionId'=${prior.id} AND superseded_at IS NULL`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='IN_PROGRESS', applicability='CONDITIONAL', blocked_reason=NULL, completed_at=NULL, completed_by=NULL, completed_by_display_name=NULL, updated_at=now() WHERE id=${prior.workflow_step_instance_id}`
    );
    await audit('P2_V2_DESIGN_APPLICABILITY_REVISED', next, actor, tx);
    return readModel(projectId, tx);
  });
}

export async function evaluateDesignApplicabilityReadiness(
  projectId: string,
  tx: Executor = db
) {
  return (await readModel(projectId, tx)).readiness;
}

export async function synchronizeDesignStageStatus(
  projectId: string,
  tx: Executor = db,
  actor?: DesignActor
) {
  const model = await readModel(projectId, tx);
  const decision = model.decision;
  if (!decision || !['APPROVED'].includes(decision.status)) return model;
  const predecessorBlocked = model.readiness.blockers.some((b: string) =>
    b.startsWith('Predecessor stages')
  );
  const approvalBlocked = model.readiness.blockers.some((b: string) =>
    b.includes('approval is required')
  );
  const ready =
    !predecessorBlocked &&
    !approvalBlocked &&
    (decision.responsibility_type === 'CUSTOMER_BUILD_TO_PRINT' ||
      model.release.released);
  if (ready && decision.responsibility_type === 'CUSTOMER_BUILD_TO_PRINT') {
    await tx.execute(
      sql`INSERT INTO project_workflow_step_approvals (workflow_step_instance_id, project_id, approval_type, decision, signature_meaning, actor_user_id, actor_display_name, actor_role, step_revision_snapshot, evidence_snapshot) SELECT ${model.stage.id}, ${projectId}, 'DESIGN_APPLICABILITY', 'NOT_APPLICABLE_APPROVED', 'Approved determination that AS9100 design control is not applicable to customer-controlled build-to-print scope', ${actor?.userId ?? null}, ${actor?.displayName ?? 'System readiness evaluation'}, ${actor?.role ?? 'SYSTEM'}, ${String(decision.revision_number)}, ${JSON.stringify({ decisionId: decision.id, customerDrawingNumber: decision.customer_drawing_number, customerDrawingRevision: decision.customer_drawing_revision })}::jsonb WHERE NOT EXISTS (SELECT 1 FROM project_workflow_step_approvals WHERE workflow_step_instance_id=${model.stage.id} AND decision='NOT_APPLICABLE_APPROVED' AND evidence_snapshot->>'decisionId'=${decision.id})`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='NOT_APPLICABLE', applicability='NOT_APPLICABLE', applicability_reason=${decision.justification}, applicability_source='APPROVED_DESIGN_APPLICABILITY', applicability_decided_by=${actor?.employeeId ?? null}, applicability_decided_by_display_name=${actor?.displayName ?? null}, applicability_decided_at=now(), blocked_reason=NULL, completed_at=now(), completed_by=${actor?.employeeId ?? null}, completed_by_display_name=${actor?.displayName ?? null}, revision_reference=${decision.customer_drawing_revision}, effectivity_reference=${decision.customer_drawing_number}, updated_at=now() WHERE id=${model.stage.id}`
    );
  } else if (ready) {
    await tx.execute(
      sql`UPDATE project_workflow_step_links SET record_revision=${model.release.release.release_revision}, effectivity_reference=COALESCE(${model.release.release.effective_date}, ${model.release.release.release_number}), updated_at=now() WHERE workflow_step_instance_id=${model.stage.id} AND record_type='DESIGN_PROJECT' AND is_authoritative=true AND unlinked_at IS NULL`
    );
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='COMPLETE', applicability='REQUIRED', blocked_reason=NULL, completed_at=now(), completed_by=${actor?.employeeId ?? null}, completed_by_display_name=${actor?.displayName ?? null}, revision_reference=${model.release.release.release_revision}, effectivity_reference=COALESCE(${model.release.release.effective_date}, ${model.release.release.release_number}), updated_at=now() WHERE id=${model.stage.id}`
    );
  } else if (
    decision.responsibility_type !== 'CUSTOMER_BUILD_TO_PRINT' &&
    !model.release.released
  ) {
    await tx.execute(
      sql`UPDATE project_workflow_step_instances SET status='BLOCKED', blocked_reason=${model.release.blockers.join(' ')}, completed_at=NULL, completed_by=NULL, completed_by_display_name=NULL, updated_at=now() WHERE id=${model.stage.id}`
    );
  }
  return readModel(projectId, tx);
}
