import crypto from 'crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  designControlRecords,
  designControlStepApprovalAssignments,
  designControlStepApprovals,
  designControlStepContentVersions,
  designControlSteps,
  employees,
  users,
} from '../../schema';
import {
  DESIGN_CONTROL_WORKFLOW,
  workflowItemLookupKeys,
  type DesignControlWorkflowItem,
} from '../../../shared/designControlWorkflow';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { getUserPermissions } from './permissionService';
import { resolveDesignControlAuthority } from './designControlAuthorityService';
import { recordAuditEvent } from './auditLedgerService';
import { getDesignManufacturingEvidence } from './designManufacturingEvidenceService';

type Client = typeof db;

export type DesignControlApprovalActor = {
  id: number;
  username: string;
  role: string;
};

export type DesignControlRequestMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type DesignControlApprovalSelection = {
  approvalKey: string;
  employeeId: number;
  userId: number;
};

async function verifiedApprover(
  selection: DesignControlApprovalSelection,
  slot: DesignControlWorkflowItem,
  client: Client
) {
  const [candidate] = await client
    .select({
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      employeeName: employees.name,
      jobTitle: employees.jobTitle,
      department: employees.department,
      userId: users.id,
      username: users.username,
      userRole: users.role,
      accessStatus: users.accessStatus,
    })
    .from(users)
    .innerJoin(employees, eq(employees.id, users.employeeId))
    .where(
      and(
        eq(users.id, selection.userId),
        eq(users.employeeId, selection.employeeId),
        eq(users.isActive, true),
        eq(users.accessStatus, 'ACTIVE'),
        eq(employees.isActive, true),
        eq(employees.employmentStatus, 'ACTIVE')
      )
    )
    .limit(1);
  if (!candidate)
    throw new DesignControlApprovalError(
      422,
      'APPROVER_NOT_ACTIVE_OR_LINKED',
      'Each approver must be an active employee with an active linked EPOCH account'
    );
  if (candidate.userRole === 'ADMIN' || candidate.userRole === 'OWNER')
    throw new DesignControlApprovalError(
      422,
      'ADMIN_APPROVAL_BYPASS_FORBIDDEN',
      'Administrative account status does not confer Design Control approval authority'
    );
  const permissions = await getUserPermissions(
    candidate.userId,
    candidate.userRole
  );
  if (!permissions.permissionSet.has(slot.requiredCapability!))
    throw new DesignControlApprovalError(
      422,
      'APPROVER_NOT_AUTHORIZED',
      `${candidate.employeeName} is not authorized for ${slot.label}`
    );
  return candidate;
}

export async function listEligibleDesignControlApprovers(
  recordId: string,
  stepKey: string,
  client: Client = db
) {
  const context = await loadStepContext(recordId, stepKey, client, false);
  const rows = await client
    .select({
      employeeId: employees.id,
      employeeCode: employees.employeeCode,
      displayName: employees.name,
      jobTitle: employees.jobTitle,
      department: employees.department,
      userId: users.id,
      username: users.username,
      accountRole: users.role,
      accountStatus: users.accessStatus,
    })
    .from(users)
    .innerJoin(employees, eq(employees.id, users.employeeId))
    .where(
      and(
        eq(users.isActive, true),
        eq(users.accessStatus, 'ACTIVE'),
        eq(employees.isActive, true),
        eq(employees.employmentStatus, 'ACTIVE')
      )
    );
  const candidates = await Promise.all(
    rows
      .filter(
        (row) => row.accountRole !== 'ADMIN' && row.accountRole !== 'OWNER'
      )
      .map(async (row) => {
        const permissions = await getUserPermissions(
          row.userId,
          row.accountRole
        );
        return {
          ...row,
          eligibleApprovalKeys: context.definition.approvals
            .filter((slot) =>
              permissions.permissionSet.has(slot.requiredCapability!)
            )
            .map((slot) => slot.key),
          eligibleApprovalRoles: context.definition.approvals
            .filter((slot) =>
              permissions.permissionSet.has(slot.requiredCapability!)
            )
            .map((slot) => slot.label),
        };
      })
  );
  return {
    approvalSlots: context.definition.approvals,
    employees: candidates.filter(
      (candidate) => candidate.eligibleApprovalKeys.length > 0
    ),
  };
}

export class DesignControlApprovalError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export type MaterialStepContent = {
  formData: Record<string, unknown>;
  checklist: Record<string, unknown>;
  attachments: unknown[];
};

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeAttachments(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function canonicalizeDesignControlValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeDesignControlValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeDesignControlValue(entry)])
    );
  }
  return value === undefined ? null : value;
}

export function canonicalDesignControlContent(
  content: MaterialStepContent
): string {
  return JSON.stringify(canonicalizeDesignControlValue(content));
}

export function checksumDesignControlContent(
  content: MaterialStepContent
): string {
  return crypto
    .createHash('sha256')
    .update(canonicalDesignControlContent(content))
    .digest('hex');
}

export function materialStepContent(input: {
  formData?: unknown;
  checklist?: unknown;
  attachments?: unknown;
}): MaterialStepContent {
  return {
    formData: normalizeObject(input.formData),
    checklist: normalizeObject(input.checklist),
    attachments: normalizeAttachments(input.attachments),
  };
}

function valueForWorkflowItem(
  values: Record<string, unknown>,
  item: DesignControlWorkflowItem
) {
  for (const key of workflowItemLookupKeys(item)) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
    const normalized = key.trim().toLowerCase();
    const match = Object.entries(values).find(
      ([candidate]) => candidate.trim().toLowerCase() === normalized
    );
    if (match) return match[1];
  }
  return undefined;
}

export function missingDesignControlStepEvidence(
  stepKey: string,
  content: MaterialStepContent,
  options: { includeChecklist?: boolean } = {}
) {
  const definition = DESIGN_CONTROL_WORKFLOW.find(
    (step) => step.key === stepKey
  );
  if (!definition) {
    throw new DesignControlApprovalError(
      400,
      'INVALID_STEP',
      `Unknown Design Control step ${stepKey}`
    );
  }
  const includeChecklist = options.includeChecklist ?? true;
  return {
    fields: definition.fields
      .filter(
        (item) =>
          String(valueForWorkflowItem(content.formData, item) ?? '').trim()
            .length === 0
      )
      .map((item) => item.label),
    checklist: includeChecklist
      ? definition.checklist
          .filter(
            (item) => valueForWorkflowItem(content.checklist, item) !== true
          )
          .map((item) => item.label)
      : [],
  };
}

export function assertExpectedDesignControlVersion(
  expectedContentVersionId: string | null | undefined,
  currentContentVersionId: string | null
) {
  if (
    expectedContentVersionId !== undefined &&
    expectedContentVersionId !== currentContentVersionId
  ) {
    throw new DesignControlApprovalError(
      409,
      'STALE_CONTENT_VERSION',
      'The step content version changed before this action'
    );
  }
}

export function requireDesignControlDecisionComment(
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION',
  comment?: string
) {
  const normalized = comment?.trim() ?? '';
  if (decision !== 'APPROVED' && !normalized) {
    throw new DesignControlApprovalError(
      422,
      'DECISION_COMMENT_REQUIRED',
      'A reason is required when rejecting or returning a Design Control step'
    );
  }
  return normalized || undefined;
}

async function actorEvidence(actor: DesignControlApprovalActor) {
  if (!Number.isInteger(actor.id) || actor.id <= 0) {
    throw new DesignControlApprovalError(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authenticated user identity is required'
    );
  }
  const snapshot = await resolveUserSnapshot(actor.id);
  const permissions = await getUserPermissions(actor.id, actor.role);
  return {
    snapshot: {
      userId: actor.id,
      username: actor.username,
      displayName: snapshot.displayName,
      role: actor.role,
    },
    capabilities:
      actor.role === 'ADMIN' || actor.role === 'OWNER'
        ? permissions.permissions
        : permissions.permissions,
    permissionSet: permissions.permissionSet,
  };
}

async function loadStepContext(
  recordId: string,
  stepKey: string,
  client: Client,
  enforceAuthority = true
) {
  const [record] = await client
    .select()
    .from(designControlRecords)
    .where(eq(designControlRecords.id, recordId))
    .limit(1);
  if (!record || !record.rdProjectId) {
    throw new DesignControlApprovalError(
      404,
      'DESIGN_CONTROL_NOT_FOUND',
      'Design Control record not found'
    );
  }
  const authority = await resolveDesignControlAuthority(
    record.rdProjectId,
    client
  );
  if (
    enforceAuthority &&
    (!authority ||
      authority.state !== 'AUTHORITATIVE' ||
      authority.authoritativeRecord?.id !== record.id)
  ) {
    throw new DesignControlApprovalError(
      409,
      'DESIGN_CONTROL_NOT_AUTHORITATIVE',
      'Only the authoritative Design Control record may be edited, submitted, or approved',
      { authorityState: authority?.state ?? 'INVALID_STATE' }
    );
  }
  const [step] = await client
    .select()
    .from(designControlSteps)
    .where(
      and(
        eq(designControlSteps.recordId, recordId),
        eq(designControlSteps.stepKey, stepKey)
      )
    )
    .limit(1);
  if (!step) {
    throw new DesignControlApprovalError(
      404,
      'DESIGN_CONTROL_STEP_NOT_FOUND',
      'Design Control step not found'
    );
  }
  const definition = DESIGN_CONTROL_WORKFLOW.find(
    (candidate) => candidate.key === stepKey
  );
  if (!definition) {
    throw new DesignControlApprovalError(
      400,
      'INVALID_STEP',
      `Unknown Design Control step ${stepKey}`
    );
  }
  return { record, step, definition, authority };
}

async function requireActorCapability(
  actor: DesignControlApprovalActor,
  requiredCapability: string
) {
  const evidence = await actorEvidence(actor);
  const bypass = actor.role === 'ADMIN' || actor.role === 'OWNER';
  if (!bypass && !evidence.permissionSet.has(requiredCapability)) {
    throw new DesignControlApprovalError(
      403,
      'FORBIDDEN',
      `Capability ${requiredCapability} is required`,
      {
        requiredCapability,
      }
    );
  }
  return evidence;
}

async function createContentVersion(
  context: Awaited<ReturnType<typeof loadStepContext>>,
  content: MaterialStepContent,
  actor: DesignControlApprovalActor,
  actorSnapshot: Record<string, unknown>,
  changeReason: string,
  client: Client,
  force = false
) {
  const checksum = checksumDesignControlContent(content);
  const [current] = context.step.currentContentVersionId
    ? await client
        .select()
        .from(designControlStepContentVersions)
        .where(
          eq(
            designControlStepContentVersions.id,
            context.step.currentContentVersionId
          )
        )
        .limit(1)
    : [];

  if (!force && current?.contentChecksum === checksum) return current;

  const nextVersion =
    Math.max(context.step.contentVersion ?? 0, current?.contentVersion ?? 0) +
    1;
  const [created] = await client
    .insert(designControlStepContentVersions)
    .values({
      rdProjectId: context.record.rdProjectId!,
      designControlRecordId: context.record.id,
      designControlStepId: context.step.id,
      stepKey: context.step.stepKey,
      contentVersion: nextVersion,
      contentChecksum: checksum,
      contentSnapshot: content,
      status: 'DRAFT',
      createdByUserId: actor.id,
      createdBySnapshot: actorSnapshot,
      changeReason,
      metadata: {
        canonicalization: 'sorted-object-keys-v1',
        checksumAlgorithm: 'sha256',
      },
    })
    .returning();

  if (current) {
    await client
      .update(designControlStepContentVersions)
      .set({ status: 'SUPERSEDED', supersededByVersionId: created.id })
      .where(eq(designControlStepContentVersions.id, current.id));
    await client
      .update(designControlStepApprovals)
      .set({
        status: 'SUPERSEDED',
        invalidatedAt: new Date(),
        invalidatedByUserId: actor.id,
        invalidatedBySnapshot: actorSnapshot,
        invalidationReason: changeReason,
        supersedingContentVersionId: created.id,
      })
      .where(
        and(
          eq(designControlStepApprovals.stepContentVersionId, current.id),
          eq(designControlStepApprovals.status, 'VALID')
        )
      );
  }
  return created;
}

function auditBase(
  context: Awaited<ReturnType<typeof loadStepContext>>,
  actor: DesignControlApprovalActor,
  requestMetadata: DesignControlRequestMetadata,
  version?: { id: string; contentChecksum: string } | null
) {
  return {
    subjectType: 'design_control_step',
    subjectId: context.step.id,
    sourceService: 'designControlApprovalService',
    actor,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
    payload: {
      rdProjectId: context.record.rdProjectId!,
      designControlRecordId: context.record.id,
      designControlStepId: context.step.id,
      stepKey: context.step.stepKey,
      contentVersionId: version?.id ?? null,
      contentChecksum: version?.contentChecksum ?? null,
    },
  };
}

export async function saveDesignControlStepDraft(
  input: {
    recordId: string;
    stepKey: string;
    formData?: unknown;
    checklist?: unknown;
    attachments?: unknown;
    metadata?: unknown;
    expectedContentVersionId?: string | null;
    changeReason: string;
    actor: DesignControlApprovalActor;
    requestMetadata?: DesignControlRequestMetadata;
  },
  client: Client = db
) {
  const actorInfo = await requireActorCapability(
    input.actor,
    'design.control.edit'
  );
  return client.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.recordId}:${input.stepKey}`}))`
    );
    const context = await loadStepContext(
      input.recordId,
      input.stepKey,
      tx as Client
    );
    assertExpectedDesignControlVersion(
      input.expectedContentVersionId,
      context.step.currentContentVersionId
    );
    if (context.step.status === 'submitted_for_approval') {
      throw new DesignControlApprovalError(
        409,
        'STEP_UNDER_REVIEW',
        'Submitted content is read-only while under review'
      );
    }
    const content = materialStepContent(input);
    const beforeVersionId = context.step.currentContentVersionId;
    const version = await createContentVersion(
      context,
      content,
      input.actor,
      actorInfo.snapshot,
      input.changeReason,
      tx as Client
    );
    const materialChanged = beforeVersionId !== version.id;
    const [step] = await tx
      .update(designControlSteps)
      .set({
        formData: content.formData,
        checklist: content.checklist,
        attachments: content.attachments,
        metadata: normalizeObject(input.metadata),
        status: materialChanged ? 'draft' : context.step.status,
        approvalMode: 'AUTHENTICATED_VERSIONED',
        currentContentVersionId: version.id,
        contentVersion: version.contentVersion,
        submittedAt: materialChanged ? null : context.step.submittedAt,
        submittedByUserId: materialChanged
          ? null
          : context.step.submittedByUserId,
        submittedBySnapshot: materialChanged
          ? null
          : context.step.submittedBySnapshot,
        approvedAt: materialChanged ? null : context.step.approvedAt,
        updatedAt: new Date(),
      })
      .where(eq(designControlSteps.id, context.step.id))
      .returning();

    await recordAuditEvent(
      {
        ...auditBase(
          context,
          input.actor,
          input.requestMetadata ?? {},
          version
        ),
        eventType: materialChanged
          ? 'DESIGN_CONTROL_STEP_VERSION_CREATED'
          : 'DESIGN_CONTROL_STEP_DRAFT_SAVED',
        reason: input.changeReason,
        fieldsChanged: {
          contentVersionId: { before: beforeVersionId, after: version.id },
          status: {
            before: context.step.status,
            after: materialChanged ? 'draft' : context.step.status,
          },
        },
        payload: {
          ...auditBase(
            context,
            input.actor,
            input.requestMetadata ?? {},
            version
          ).payload,
          materialChanged,
          priorApprovalsInvalidated:
            materialChanged && Boolean(beforeVersionId),
        },
      },
      tx
    );
    return { step, version, materialChanged };
  });
}

export async function submitDesignControlStep(
  input: {
    recordId: string;
    stepKey: string;
    expectedContentVersionId?: string | null;
    actor: DesignControlApprovalActor;
    requestMetadata?: DesignControlRequestMetadata;
    assignments: DesignControlApprovalSelection[];
  },
  client: Client = db
) {
  const actorInfo = await requireActorCapability(
    input.actor,
    'design.control.submit'
  );
  return client.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.recordId}:${input.stepKey}`}))`
    );
    const context = await loadStepContext(
      input.recordId,
      input.stepKey,
      tx as Client
    );
    if (context.step.status === 'submitted_for_approval') {
      return getDesignControlStepApprovalState(
        input.recordId,
        input.stepKey,
        tx as Client
      );
    }
    assertExpectedDesignControlVersion(
      input.expectedContentVersionId,
      context.step.currentContentVersionId
    );
    const content = materialStepContent(context.step);
    const version = await createContentVersion(
      context,
      content,
      input.actor,
      actorInfo.snapshot,
      'Initial authenticated approval submission',
      tx as Client
    );
    const missing = missingDesignControlStepEvidence(input.stepKey, content, {
      includeChecklist: input.stepKey !== '12',
    });
    const missingItems = [...missing.fields, ...missing.checklist];
    if (input.stepKey === '12') {
      const manufacturing = await getDesignManufacturingEvidence({
        rdProjectId: context.record.rdProjectId,
        designControlRecordId: context.record.id,
      });
      missingItems.push(...manufacturing.missingItems);
    }
    if (missingItems.length > 0) {
      throw new DesignControlApprovalError(
        422,
        'STEP_INCOMPLETE',
        'Complete all required evidence before submission',
        {
          missingItems,
        }
      );
    }
    const now = new Date();
    const selections = new Map(
      input.assignments.map((assignment) => [
        assignment.approvalKey,
        assignment,
      ])
    );
    if (selections.size !== context.definition.approvals.length)
      throw new DesignControlApprovalError(
        422,
        'APPROVAL_ASSIGNMENTS_REQUIRED',
        'Select one verified employee account for every required approval role'
      );
    const assignedUserIds = new Set<number>();
    for (const slot of context.definition.approvals) {
      const selection = selections.get(slot.key);
      if (!selection)
        throw new DesignControlApprovalError(
          422,
          'APPROVAL_ASSIGNMENTS_REQUIRED',
          `Select an approver for ${slot.label}`
        );
      if (
        slot.requiresIndependentReviewer &&
        selection.userId === input.actor.id
      )
        throw new DesignControlApprovalError(
          409,
          'INDEPENDENCE_REQUIRED',
          'The submitter cannot be assigned to an independent approval'
        );
      if (
        slot.requiresIndependentReviewer &&
        assignedUserIds.has(selection.userId)
      )
        throw new DesignControlApprovalError(
          409,
          'SEGREGATION_OF_DUTIES',
          'One employee cannot satisfy multiple independent approvals'
        );
      const candidate = await verifiedApprover(selection, slot, tx as Client);
      assignedUserIds.add(candidate.userId);
      await tx.insert(designControlStepApprovalAssignments).values({
        rdProjectId: context.record.rdProjectId!,
        designControlRecordId: context.record.id,
        designControlStepId: context.step.id,
        stepContentVersionId: version.id,
        approvalKey: slot.key,
        approvalRoleSnapshot: slot.label,
        employeeId: candidate.employeeId,
        userId: candidate.userId,
        employeeCodeSnapshot: candidate.employeeCode,
        approverNameSnapshot: candidate.employeeName,
        jobTitleSnapshot: candidate.jobTitle,
        departmentSnapshot: candidate.department,
        accountStatusSnapshot: candidate.accessStatus,
        requiredCapabilitySnapshot: slot.requiredCapability!,
        assignedByUserId: input.actor.id,
        metadata: {
          evidenceHash: version.contentChecksum,
          provenance: 'VERIFIED_EMPLOYEE_ACCOUNT_ASSIGNMENT',
        },
      });
    }
    await tx
      .update(designControlStepContentVersions)
      .set({
        status: 'SUBMITTED',
        submittedAt: now,
        submittedByUserId: input.actor.id,
        submittedBySnapshot: actorInfo.snapshot,
      })
      .where(eq(designControlStepContentVersions.id, version.id));
    await tx
      .update(designControlSteps)
      .set({
        status: 'submitted_for_approval',
        approvalMode: 'AUTHENTICATED_VERSIONED',
        currentContentVersionId: version.id,
        contentVersion: version.contentVersion,
        submittedAt: now,
        submittedByUserId: input.actor.id,
        submittedBySnapshot: actorInfo.snapshot,
        approvedAt: null,
        updatedAt: now,
      })
      .where(eq(designControlSteps.id, context.step.id));

    await recordAuditEvent(
      {
        ...auditBase(
          context,
          input.actor,
          input.requestMetadata ?? {},
          version
        ),
        eventType: 'DESIGN_CONTROL_STEP_SUBMITTED',
        reason: 'Submitted exact content version for authenticated approval',
        fieldsChanged: {
          status: {
            before: context.step.status,
            after: 'submitted_for_approval',
          },
          contentVersionId: {
            before: context.step.currentContentVersionId,
            after: version.id,
          },
        },
        payload: {
          ...auditBase(
            context,
            input.actor,
            input.requestMetadata ?? {},
            version
          ).payload,
          requestedApprovalKeys: context.definition.approvals.map(
            (slot) => slot.key
          ),
          submitterCapabilities: actorInfo.capabilities,
        },
      },
      tx
    );
    return getDesignControlStepApprovalState(
      input.recordId,
      input.stepKey,
      tx as Client
    );
  });
}

export async function decideDesignControlStepApproval(
  input: {
    recordId: string;
    stepKey: string;
    contentVersionId: string;
    approvalKey: string;
    decision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
    comment?: string;
    actor: DesignControlApprovalActor;
    requestMetadata?: DesignControlRequestMetadata;
  },
  client: Client = db
) {
  const decisionComment = requireDesignControlDecisionComment(
    input.decision,
    input.comment
  );
  return client.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.recordId}:${input.stepKey}`}))`
    );
    const context = await loadStepContext(
      input.recordId,
      input.stepKey,
      tx as Client
    );
    if (
      context.step.status !== 'submitted_for_approval' ||
      context.step.currentContentVersionId !== input.contentVersionId
    ) {
      throw new DesignControlApprovalError(
        409,
        'STALE_CONTENT_VERSION',
        'Decision does not match the submitted content version'
      );
    }
    const slot = context.definition.approvals.find(
      (candidate) => candidate.key === input.approvalKey
    );
    if (!slot?.requiredCapability) {
      throw new DesignControlApprovalError(
        400,
        'INVALID_APPROVAL_SLOT',
        'Unknown approval slot'
      );
    }
    const actorInfo = await requireActorCapability(
      input.actor,
      slot.requiredCapability
    );
    const [assignment] = await tx
      .select()
      .from(designControlStepApprovalAssignments)
      .where(
        and(
          eq(
            designControlStepApprovalAssignments.stepContentVersionId,
            input.contentVersionId
          ),
          eq(
            designControlStepApprovalAssignments.approvalKey,
            input.approvalKey
          ),
          eq(designControlStepApprovalAssignments.userId, input.actor.id),
          eq(designControlStepApprovalAssignments.status, 'PENDING')
        )
      )
      .limit(1);
    if (!assignment)
      throw new DesignControlApprovalError(
        403,
        'APPROVER_NOT_ASSIGNED',
        'The authenticated user is not assigned to this approval role'
      );
    await verifiedApprover(
      {
        approvalKey: assignment.approvalKey,
        employeeId: assignment.employeeId,
        userId: assignment.userId,
      },
      slot,
      tx as Client
    );
    const [version] = await tx
      .select()
      .from(designControlStepContentVersions)
      .where(eq(designControlStepContentVersions.id, input.contentVersionId))
      .limit(1);
    if (!version || version.status !== 'SUBMITTED') {
      throw new DesignControlApprovalError(
        409,
        'STALE_CONTENT_VERSION',
        'Submitted content version is no longer current'
      );
    }
    if (
      slot.requiresIndependentReviewer &&
      version.submittedByUserId === input.actor.id
    ) {
      throw new DesignControlApprovalError(
        409,
        'INDEPENDENCE_REQUIRED',
        'The submitter cannot satisfy this independent approval slot'
      );
    }
    if (slot.incompatibleRoleGroup) {
      const existing = await tx
        .select()
        .from(designControlStepApprovals)
        .where(
          and(
            eq(designControlStepApprovals.stepContentVersionId, version.id),
            eq(designControlStepApprovals.actorUserId, input.actor.id),
            eq(designControlStepApprovals.decision, 'APPROVED'),
            eq(designControlStepApprovals.status, 'VALID')
          )
        );
      const incompatibleKeys = new Set(
        context.definition.approvals
          .filter(
            (candidate) =>
              candidate.incompatibleRoleGroup === slot.incompatibleRoleGroup
          )
          .map((candidate) => candidate.key)
      );
      if (
        existing.some((approval) => incompatibleKeys.has(approval.approvalKey))
      ) {
        throw new DesignControlApprovalError(
          409,
          'SEGREGATION_OF_DUTIES',
          'One actor may not satisfy multiple incompatible release approval roles'
        );
      }
    }
    const [decision] = await tx
      .insert(designControlStepApprovals)
      .values({
        rdProjectId: context.record.rdProjectId!,
        designControlRecordId: context.record.id,
        designControlStepId: context.step.id,
        stepKey: context.step.stepKey,
        stepContentVersionId: version.id,
        approvedContentChecksum: version.contentChecksum,
        approvalKey: slot.key,
        approvalLabelSnapshot: slot.label,
        requiredCapabilitySnapshot: slot.requiredCapability,
        requiredRolesSnapshot: [...(slot.allowedRoles ?? [])],
        decision: input.decision,
        signatureMeaning:
          slot.signatureMeaning ?? 'Authenticated Design Control decision',
        decisionComment: decisionComment ?? null,
        actorUserId: input.actor.id,
        actorUsernameSnapshot: input.actor.username,
        actorDisplayNameSnapshot: actorInfo.snapshot.displayName,
        actorRoleSnapshot: input.actor.role,
        actorCapabilitiesSnapshot: actorInfo.capabilities,
        status: 'VALID',
        metadata: { provenance: 'AUTHENTICATED_VERSION_BOUND_APPROVAL' },
      })
      .returning();
    await tx
      .update(designControlStepApprovalAssignments)
      .set({
        status:
          input.decision === 'APPROVED'
            ? 'APPROVED'
            : input.decision === 'REJECTED'
              ? 'REJECTED'
              : 'RETURNED',
        decisionId: decision.id,
        metadata: {
          ...(assignment.metadata ?? {}),
          decidedEvidenceHash: version.contentChecksum,
        },
      })
      .where(eq(designControlStepApprovalAssignments.id, assignment.id));

    const approvals = await tx
      .select()
      .from(designControlStepApprovals)
      .where(
        and(
          eq(designControlStepApprovals.stepContentVersionId, version.id),
          eq(designControlStepApprovals.status, 'VALID')
        )
      )
      .orderBy(asc(designControlStepApprovals.createdAt));
    const approvedKeys = new Set(
      approvals
        .filter((approval) => approval.decision === 'APPROVED')
        .map((approval) => approval.approvalKey)
    );
    const fullyApproved =
      input.decision === 'APPROVED' &&
      context.definition.approvals.every((required) =>
        approvedKeys.has(required.key)
      );
    const nextStatus = fullyApproved
      ? 'approved'
      : input.decision === 'REJECTED'
        ? 'rejected'
        : input.decision === 'RETURNED_FOR_REVISION'
          ? 'returned_for_revision'
          : 'submitted_for_approval';
    if (fullyApproved) {
      await tx
        .update(designControlStepContentVersions)
        .set({ status: 'APPROVED' })
        .where(eq(designControlStepContentVersions.id, version.id));
    }
    await tx
      .update(designControlSteps)
      .set({
        status: nextStatus,
        approvedAt: fullyApproved ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(designControlSteps.id, context.step.id));

    await recordAuditEvent(
      {
        ...auditBase(
          context,
          input.actor,
          input.requestMetadata ?? {},
          version
        ),
        eventType:
          input.decision === 'APPROVED'
            ? 'DESIGN_CONTROL_APPROVAL_GRANTED'
            : input.decision === 'REJECTED'
              ? 'DESIGN_CONTROL_APPROVAL_REJECTED'
              : 'DESIGN_CONTROL_RETURNED_FOR_REVISION',
        reason: decisionComment || input.decision,
        fieldsChanged: {
          status: { before: context.step.status, after: nextStatus },
          approvalDecision: { before: null, after: input.decision },
        },
        payload: {
          ...auditBase(
            context,
            input.actor,
            input.requestMetadata ?? {},
            version
          ).payload,
          approvalKey: slot.key,
          actorRole: input.actor.role,
          actorCapabilities: actorInfo.capabilities,
          decisionId: decision.id,
        },
      },
      tx
    );
    return getDesignControlStepApprovalState(
      input.recordId,
      input.stepKey,
      tx as Client
    );
  });
}

export async function reassignDesignControlStepApprover(
  input: {
    recordId: string;
    stepKey: string;
    contentVersionId: string;
    approvalKey: string;
    employeeId: number;
    userId: number;
    reason: string;
    actor: DesignControlApprovalActor;
    requestMetadata?: DesignControlRequestMetadata;
  },
  client: Client = db
) {
  if (!input.reason.trim())
    throw new DesignControlApprovalError(
      422,
      'REASSIGNMENT_REASON_REQUIRED',
      'Authorized reassignment requires a reason'
    );
  await requireActorCapability(input.actor, 'design.control.admin');
  return client.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.recordId}:${input.stepKey}`}))`
    );
    const context = await loadStepContext(
      input.recordId,
      input.stepKey,
      tx as Client
    );
    if (
      context.step.status !== 'submitted_for_approval' ||
      context.step.currentContentVersionId !== input.contentVersionId
    )
      throw new DesignControlApprovalError(
        409,
        'STALE_CONTENT_VERSION',
        'Reassignment must target the exact pending submitted version'
      );
    const slot = context.definition.approvals.find(
      (candidate) => candidate.key === input.approvalKey
    );
    if (!slot?.requiredCapability)
      throw new DesignControlApprovalError(
        400,
        'INVALID_APPROVAL_SLOT',
        'Unknown approval slot'
      );
    const [prior] = await tx
      .select()
      .from(designControlStepApprovalAssignments)
      .where(
        and(
          eq(
            designControlStepApprovalAssignments.stepContentVersionId,
            input.contentVersionId
          ),
          eq(
            designControlStepApprovalAssignments.approvalKey,
            input.approvalKey
          ),
          eq(designControlStepApprovalAssignments.status, 'PENDING')
        )
      )
      .limit(1);
    if (!prior)
      throw new DesignControlApprovalError(
        409,
        'ASSIGNMENT_NOT_PENDING',
        'Only a pending assignment may be reassigned'
      );
    const candidate = await verifiedApprover(
      {
        approvalKey: input.approvalKey,
        employeeId: input.employeeId,
        userId: input.userId,
      },
      slot,
      tx as Client
    );
    await tx
      .update(designControlStepApprovalAssignments)
      .set({
        status: 'REASSIGNED',
        metadata: {
          ...(prior.metadata ?? {}),
          reassignedByUserId: input.actor.id,
          reassignedAt: new Date().toISOString(),
          reassignmentReason: input.reason.trim(),
        },
      })
      .where(eq(designControlStepApprovalAssignments.id, prior.id));
    const [replacement] = await tx
      .insert(designControlStepApprovalAssignments)
      .values({
        rdProjectId: context.record.rdProjectId!,
        designControlRecordId: context.record.id,
        designControlStepId: context.step.id,
        stepContentVersionId: input.contentVersionId,
        approvalKey: slot.key,
        approvalRoleSnapshot: slot.label,
        employeeId: candidate.employeeId,
        userId: candidate.userId,
        employeeCodeSnapshot: candidate.employeeCode,
        approverNameSnapshot: candidate.employeeName,
        jobTitleSnapshot: candidate.jobTitle,
        departmentSnapshot: candidate.department,
        accountStatusSnapshot: candidate.accessStatus,
        requiredCapabilitySnapshot: slot.requiredCapability,
        assignedByUserId: input.actor.id,
        metadata: {
          evidenceHash: prior.metadata?.evidenceHash,
          provenance: 'AUDITED_AUTHORIZED_REASSIGNMENT',
          priorAssignmentId: prior.id,
          reason: input.reason.trim(),
        },
      })
      .returning();
    await recordAuditEvent(
      {
        ...auditBase(context, input.actor, input.requestMetadata ?? {}),
        eventType: 'DESIGN_CONTROL_APPROVER_REASSIGNED',
        reason: input.reason.trim(),
        fieldsChanged: {
          assignedUserId: { before: prior.userId, after: replacement.userId },
        },
        payload: {
          approvalKey: slot.key,
          contentVersionId: input.contentVersionId,
          employeeId: replacement.employeeId,
          userId: replacement.userId,
          priorAssignmentId: prior.id,
        },
      },
      tx
    );
    return replacement;
  });
}

export async function reopenDesignControlStep(
  input: {
    recordId: string;
    stepKey: string;
    reason: string;
    actor: DesignControlApprovalActor;
    requestMetadata?: DesignControlRequestMetadata;
  },
  client: Client = db
) {
  const actorInfo = await requireActorCapability(
    input.actor,
    'design.control.edit'
  );
  return client.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.recordId}:${input.stepKey}`}))`
    );
    const context = await loadStepContext(
      input.recordId,
      input.stepKey,
      tx as Client
    );
    const version = await createContentVersion(
      context,
      materialStepContent(context.step),
      input.actor,
      actorInfo.snapshot,
      input.reason,
      tx as Client,
      true
    );
    const [step] = await tx
      .update(designControlSteps)
      .set({
        status: 'draft',
        currentContentVersionId: version.id,
        contentVersion: version.contentVersion,
        submittedAt: null,
        submittedByUserId: null,
        submittedBySnapshot: null,
        approvedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(designControlSteps.id, context.step.id))
      .returning();
    await recordAuditEvent(
      {
        ...auditBase(
          context,
          input.actor,
          input.requestMetadata ?? {},
          version
        ),
        eventType: 'DESIGN_CONTROL_STEP_REOPENED',
        reason: input.reason,
        fieldsChanged: {
          status: { before: context.step.status, after: 'draft' },
          contentVersionId: {
            before: context.step.currentContentVersionId,
            after: version.id,
          },
        },
      },
      tx
    );
    return { step, version };
  });
}

export async function getDesignControlStepApprovalState(
  recordId: string,
  stepKey: string,
  client: Client = db
) {
  const context = await loadStepContext(recordId, stepKey, client, false);
  const versions = await client
    .select()
    .from(designControlStepContentVersions)
    .where(
      eq(designControlStepContentVersions.designControlStepId, context.step.id)
    )
    .orderBy(asc(designControlStepContentVersions.contentVersion));
  const approvals = await client
    .select()
    .from(designControlStepApprovals)
    .where(eq(designControlStepApprovals.designControlStepId, context.step.id))
    .orderBy(asc(designControlStepApprovals.createdAt));
  const assignments = context.step.currentContentVersionId
    ? await client
        .select()
        .from(designControlStepApprovalAssignments)
        .where(
          eq(
            designControlStepApprovalAssignments.stepContentVersionId,
            context.step.currentContentVersionId
          )
        )
    : [];
  const currentApprovals = approvals.filter(
    (approval) =>
      approval.stepContentVersionId === context.step.currentContentVersionId &&
      approval.status === 'VALID'
  );
  const approvedKeys = new Set(
    currentApprovals
      .filter((approval) => approval.decision === 'APPROVED')
      .map((approval) => approval.approvalKey)
  );
  return {
    step: context.step,
    currentContentVersion:
      versions.find(
        (version) => version.id === context.step.currentContentVersionId
      ) ?? null,
    versions,
    approvals,
    assignments,
    approvalSlots: context.definition.approvals.map((slot) => ({
      key: slot.key,
      label: slot.label,
      requiredCapability: slot.requiredCapability,
      allowedRoles: slot.allowedRoles ?? [],
      signatureMeaning: slot.signatureMeaning,
      requiresIndependentReviewer: slot.requiresIndependentReviewer ?? false,
      status: approvedKeys.has(slot.key) ? 'APPROVED' : 'PENDING',
      decision:
        currentApprovals.find(
          (approval) => approval.approvalKey === slot.key
        ) ?? null,
      assignment:
        assignments.find((assignment) => assignment.approvalKey === slot.key) ??
        null,
    })),
    legacyEvidence: {
      provenance: 'LEGACY_UNVERIFIED_APPROVAL_EVIDENCE',
      values: context.step.approvals,
      satisfiesAuthenticatedGate: false,
    },
  };
}

export async function getRecordAuthenticatedApprovalReadiness(
  recordId: string,
  client: Client = db
) {
  const [record] = await client
    .select()
    .from(designControlRecords)
    .where(eq(designControlRecords.id, recordId))
    .limit(1);
  if (!record)
    return { ready: false, missingItems: ['Design Control record not found'] };
  const steps = await client
    .select()
    .from(designControlSteps)
    .where(eq(designControlSteps.recordId, recordId));
  const missingItems: string[] = [];
  for (const definition of DESIGN_CONTROL_WORKFLOW) {
    const step = steps.find(
      (candidate) => candidate.stepKey === definition.key
    );
    if (!step || step.status !== 'approved' || !step.currentContentVersionId) {
      missingItems.push(
        `Step ${definition.key} requires authenticated current-version approval`
      );
      continue;
    }
    const approvals = await client
      .select()
      .from(designControlStepApprovals)
      .where(
        and(
          eq(
            designControlStepApprovals.stepContentVersionId,
            step.currentContentVersionId
          ),
          eq(designControlStepApprovals.status, 'VALID'),
          eq(designControlStepApprovals.decision, 'APPROVED')
        )
      );
    const approvedKeys = new Set(
      approvals.map((approval) => approval.approvalKey)
    );
    for (const slot of definition.approvals) {
      if (!approvedKeys.has(slot.key)) {
        missingItems.push(
          `Step ${definition.key}: ${slot.label} requires authenticated approval`
        );
      }
    }
  }
  return { ready: missingItems.length === 0, missingItems };
}

export async function getRecordAuthenticatedApprovalEvidence(
  recordId: string,
  client: Client = db
) {
  return client
    .select()
    .from(designControlStepApprovals)
    .where(
      and(
        eq(designControlStepApprovals.designControlRecordId, recordId),
        eq(designControlStepApprovals.status, 'VALID'),
        eq(designControlStepApprovals.decision, 'APPROVED')
      )
    )
    .orderBy(
      asc(designControlStepApprovals.stepKey),
      asc(designControlStepApprovals.createdAt)
    );
}
