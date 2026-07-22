import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { recordAuditEvent, type AuditLedgerTx } from './auditLedgerService';
import {
  getInternalP2V2InitializationStages,
  P2_V2_DEFINITION_VERSION,
} from './projectWorkflowRegistry';
import { resolveProjectWorkflowVersion } from './projectWorkflowVersionService';
import { validateWorkflowInstanceIntegrity } from './projectWorkflowInstanceIntegrity';

type Executor = AuditLedgerTx;
type Actor = {
  id?: number | null;
  username?: string | null;
  displayName?: string | null;
  role?: string | null;
};
type Row = Record<string, unknown>;

const rows = <T extends Row>(result: unknown): T[] => {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === 'object' &&
    Array.isArray((result as { rows?: unknown }).rows)
  )
    return (result as { rows: T[] }).rows;
  return [];
};

export class ProjectWorkflowInstanceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ProjectWorkflowInstanceError';
  }
}

async function initialize(projectId: string, actor: Actor, executor: Executor) {
  const projectRows = rows(
    await executor.execute(
      sql`SELECT id, workflow_version, status, current_stage, current_step_type FROM projects WHERE id = ${projectId} FOR UPDATE`
    )
  );
  const project = projectRows[0];
  if (!project)
    throw new ProjectWorkflowInstanceError(
      'PROJECT_NOT_FOUND',
      'Project not found.'
    );
  const version = resolveProjectWorkflowVersion(project.workflow_version);
  if (version !== 'p2_v2')
    throw new ProjectWorkflowInstanceError(
      'P2_V2_REQUIRED',
      'Only an explicit p2_v2 project can receive a V2 workflow instance.',
      { effectiveVersion: version }
    );
  const existing = rows(
    await executor.execute(
      sql`SELECT id FROM project_workflow_instances WHERE project_id = ${projectId} AND workflow_version = 'p2_v2' AND status NOT IN ('SUPERSEDED','CANCELLED')`
    )
  );
  if (existing.length)
    throw new ProjectWorkflowInstanceError(
      'WORKFLOW_INSTANCE_EXISTS',
      'An active p2_v2 workflow instance already exists.'
    );

  const instance = rows(
    await executor.execute(sql`
    INSERT INTO project_workflow_instances (project_id, workflow_version, definition_version, status, initialized_by, initialized_by_display_name, activated_at)
    VALUES (${projectId}, 'p2_v2', ${P2_V2_DEFINITION_VERSION}, 'ACTIVE', ${actor.id ?? null}, ${actor.displayName ?? actor.username ?? null}, now())
    RETURNING *`)
  )[0];
  const stages = getInternalP2V2InitializationStages();
  for (const stage of stages) {
    await executor.execute(sql`
      INSERT INTO project_workflow_step_instances
        (workflow_instance_id, project_id, step_type, step_order, label_snapshot, description_snapshot, status, applicability, started_at)
      VALUES (${instance.id}, ${projectId}, ${stage.type}, ${stage.order}, ${stage.label}, ${stage.description},
        ${stage.order === 1 ? 'IN_PROGRESS' : 'NOT_STARTED'}, 'REQUIRED', ${stage.order === 1 ? new Date() : null})`);
  }
  await recordAuditEvent(
    {
      eventType: 'P2_V2_WORKFLOW_INITIALIZED',
      subjectType: 'project_workflow_instance',
      subjectId: instance.id,
      sourceService: 'projectWorkflowInstanceService',
      actor: {
        id: actor.id,
        username: actor.username ?? actor.displayName,
        role: actor.role,
      },
      payload: {
        projectId,
        workflowVersion: 'p2_v2',
        definitionVersion: P2_V2_DEFINITION_VERSION,
        stageTypes: stages.map((stage) => stage.type),
        source: 'internal_phase3_service',
      },
    },
    executor
  );
  return getWorkflowReadModel(instance.id, executor);
}

export async function initializeV2Workflow(
  projectId: string,
  actor: Actor,
  tx?: Executor
) {
  return tx
    ? initialize(projectId, actor, tx)
    : db.transaction((innerTx) => initialize(projectId, actor, innerTx));
}

export async function getWorkflowInstanceForProject(
  projectId: string,
  tx: Executor = db
) {
  const found = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_instances WHERE project_id = ${projectId} AND workflow_version = 'p2_v2' ORDER BY created_at DESC`
    )
  );
  if (
    found.length > 1 &&
    found.filter(
      (item) => !['SUPERSEDED', 'CANCELLED'].includes(String(item.status))
    ).length > 1
  )
    throw new ProjectWorkflowInstanceError(
      'DUPLICATE_ACTIVE_INSTANCES',
      'Multiple active p2_v2 instances exist.'
    );
  return found[0] ?? null;
}

export async function getActiveWorkflowInstanceForProject(
  projectId: string,
  tx: Executor = db
) {
  const active = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_instances WHERE project_id = ${projectId} AND workflow_version = 'p2_v2' AND status NOT IN ('SUPERSEDED','CANCELLED') ORDER BY created_at DESC`
    )
  );
  if (active.length > 1)
    throw new ProjectWorkflowInstanceError(
      'DUPLICATE_ACTIVE_INSTANCES',
      'Multiple active p2_v2 instances exist.'
    );
  return active[0] ?? null;
}

export async function getWorkflowStepInstances(
  workflowInstanceId: string,
  tx: Executor = db
) {
  return rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_instances WHERE workflow_instance_id = ${workflowInstanceId} ORDER BY step_order`
    )
  );
}

export async function getWorkflowStepByType(
  workflowInstanceId: string,
  stepType: string,
  tx: Executor = db
) {
  return (
    (await getWorkflowStepInstances(workflowInstanceId, tx)).find(
      (step) => step.step_type === stepType
    ) ?? null
  );
}

export async function getWorkflowReadModel(
  workflowInstanceId: string,
  tx: Executor = db
) {
  const instance = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_instances WHERE id = ${workflowInstanceId}`
    )
  )[0];
  if (!instance)
    throw new ProjectWorkflowInstanceError(
      'WORKFLOW_INSTANCE_NOT_FOUND',
      'Workflow instance not found.'
    );
  const steps = await getWorkflowStepInstances(workflowInstanceId, tx);
  const stepIds = steps.map((step) => step.id);
  const idList = `(${stepIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',')})`;
  const links = stepIds.length
    ? rows(
        await tx.execute(
          sql`SELECT * FROM project_workflow_step_links WHERE workflow_step_instance_id IN ${sql.raw(idList)} ORDER BY linked_at`
        )
      )
    : [];
  const approvals = stepIds.length
    ? rows(
        await tx.execute(
          sql`SELECT * FROM project_workflow_step_approvals WHERE workflow_step_instance_id IN ${sql.raw(idList)} ORDER BY decided_at`
        )
      )
    : [];
  const integrityIssues = validateWorkflowInstanceIntegrity(instance, steps);
  return {
    instance,
    steps: steps.map((step) => ({
      ...step,
      links: links.filter((link) => link.workflow_step_instance_id === step.id),
      approvals: approvals.filter(
        (approval) => approval.workflow_step_instance_id === step.id
      ),
    })),
    definitionVersion: instance.definition_version,
    integrity: { valid: integrityIssues.length === 0, issues: integrityIssues },
  };
}

async function requireStepProject(
  stepId: string,
  projectId: string,
  tx: Executor
) {
  const step = rows(
    await tx.execute(
      sql`SELECT * FROM project_workflow_step_instances WHERE id = ${stepId}`
    )
  )[0];
  if (!step)
    throw new ProjectWorkflowInstanceError(
      'WORKFLOW_STEP_NOT_FOUND',
      'Workflow step instance not found.'
    );
  if (step.project_id !== projectId)
    throw new ProjectWorkflowInstanceError(
      'PROJECT_MISMATCH',
      'Workflow evidence project does not match its step.'
    );
  return step;
}

export async function addWorkflowStepLink(
  input: {
    stepId: string;
    projectId: string;
    recordType: string;
    recordId: string;
    relationshipType: string;
    isAuthoritative?: boolean;
    actor?: Actor;
  },
  tx: Executor = db
) {
  await requireStepProject(input.stepId, input.projectId, tx);
  return rows(
    await tx.execute(
      sql`INSERT INTO project_workflow_step_links (workflow_step_instance_id, project_id, record_type, record_id, relationship_type, is_authoritative, linked_by, linked_by_display_name) VALUES (${input.stepId}, ${input.projectId}, ${input.recordType}, ${input.recordId}, ${input.relationshipType}, ${input.isAuthoritative ?? false}, ${input.actor?.id ?? null}, ${input.actor?.displayName ?? input.actor?.username ?? null}) RETURNING *`
    )
  )[0];
}

export async function supersedeWorkflowStepLink(
  linkId: string,
  reason: string,
  actor: Actor,
  tx: Executor = db
) {
  if (!reason.trim())
    throw new ProjectWorkflowInstanceError(
      'UNLINK_REASON_REQUIRED',
      'An unlink reason is required.'
    );
  return (
    rows(
      await tx.execute(
        sql`UPDATE project_workflow_step_links SET unlinked_at = now(), unlink_reason = ${reason}, updated_at = now() WHERE id = ${linkId} AND unlinked_at IS NULL RETURNING *`
      )
    )[0] ?? null
  );
}

export async function recordWorkflowStepApproval(
  input: {
    stepId: string;
    projectId: string;
    approvalType: string;
    decision: string;
    signatureMeaning: string;
    reason?: string;
    actor: Actor;
    evidence?: Record<string, unknown>;
  },
  tx: Executor = db
) {
  await requireStepProject(input.stepId, input.projectId, tx);
  if (!input.actor.displayName && !input.actor.username)
    throw new ProjectWorkflowInstanceError(
      'ACTOR_REQUIRED',
      'Approval actor display name is required.'
    );
  return rows(
    await tx.execute(
      sql`INSERT INTO project_workflow_step_approvals (workflow_step_instance_id, project_id, approval_type, decision, signature_meaning, reason, actor_employee_id, actor_display_name, actor_role, evidence_snapshot) VALUES (${input.stepId}, ${input.projectId}, ${input.approvalType}, ${input.decision}, ${input.signatureMeaning}, ${input.reason ?? null}, ${input.actor.id ?? null}, ${input.actor.displayName ?? input.actor.username!}, ${input.actor.role ?? null}, ${JSON.stringify(input.evidence ?? {})}::jsonb) RETURNING *`
    )
  )[0];
}
