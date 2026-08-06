import { createHash } from 'node:crypto';

import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  designControlProjectAccessPolicies,
  designControlProjectAssignmentEvents,
  designControlProjectAssignments,
  designControlReviewActions,
  designControlStructuredRecordDecisions,
  designControlStructuredRecordLinks,
  designControlStructuredRecordVersions,
} from '../../designControlStructuredSchema';
import {
  designControlRecords,
  designControlRequirements,
  designControlReviews,
  designControlRisks,
  designControlSteps,
  designControlValidation,
  designControlVerification,
  designProjectConfigurationItems,
  designProjectPartRevisions,
  engineeringReleases,
  rdProjects,
  users,
} from '../../schema';

export const STRUCTURED_RECORD_TYPES = [
  'REQUIREMENT',
  'RISK',
  'REVIEW',
  'VERIFICATION',
  'VALIDATION',
] as const;
export type StructuredRecordType = (typeof STRUCTURED_RECORD_TYPES)[number];

export type StructuredActor = {
  id: number;
  displayName: string;
  role: string;
  capabilities: string[];
  adminOverrideReason?: string;
};

export class DesignControlStructuredError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().optional().nullable();

const schemas = {
  REQUIREMENT: z.object({
    requirementNumber: requiredText,
    category: requiredText,
    source: requiredText,
    sourceReference: requiredText,
    requirementStatement: requiredText,
    revision: optionalText,
    acceptanceCriterion: requiredText,
    verificationMethod: z.enum([
      'Inspection',
      'Analysis',
      'Demonstration',
      'Test',
      'Similarity',
      'Alternative calculation',
    ]),
    validationRequired: z.boolean(),
    criticality: z.enum(['NON_CRITICAL', 'CRITICAL', 'SAFETY_CRITICAL']),
    owner: requiredText,
    recordStatus: z
      .enum(['DRAFT', 'ACTIVE', 'SUPERSEDED', 'CLOSED'])
      .optional(),
    clarification: optionalText,
    resolution: optionalText,
  }),
  RISK: z.object({
    riskNumber: requiredText,
    hazardFailureMode: requiredText,
    cause: requiredText,
    effect: requiredText,
    severity: requiredText,
    likelihood: requiredText,
    detectability: optionalText,
    initialRating: requiredText,
    mitigation: requiredText,
    owner: requiredText,
    dueDate: requiredText,
    residualRating: requiredText,
    verificationEvidence: requiredText,
    acceptanceAuthority: requiredText,
  }),
  REVIEW: z.object({
    reviewNumber: requiredText,
    reviewType: z.enum(['PRELIMINARY', 'FINAL']),
    reviewDate: requiredText,
    attendees: z
      .array(z.object({ name: requiredText, role: requiredText }))
      .min(1),
    reviewedConfiguration: requiredText,
    decision: z.enum(['PROCEED', 'PROCEED_WITH_CONDITIONS', 'HOLD']),
    conditions: optionalText,
    minutesEvidence: requiredText,
    requiredApprovals: z.array(requiredText).min(1),
  }),
  VERIFICATION: z.object({
    verificationNumber: requiredText,
    requirementId: z.string().uuid(),
    method: z.enum([
      'Inspection',
      'Analysis',
      'Demonstration',
      'Test',
      'Similarity',
      'Alternative calculation',
    ]),
    procedureEvidence: requiredText,
    acceptanceCriterion: requiredText,
    plannedPerformer: requiredText,
    actualPerformer: requiredText,
    performedDate: requiredText,
    result: requiredText,
    passFail: z.enum(['PASS', 'FAIL']),
    exceptionDisposition: optionalText,
    reviewer: requiredText,
  }),
  VALIDATION: z.object({
    validationNumber: requiredText,
    intendedUseRequirementId: z.string().uuid(),
    objective: requiredText,
    method: requiredText,
    environment: requiredText,
    testedConfiguration: requiredText,
    partSoftwareRevisions: z.array(requiredText).min(1),
    customerUserRepresentative: requiredText,
    acceptanceCriterion: requiredText,
    result: requiredText,
    deviation: optionalText,
    correctiveAction: optionalText,
    customerAcceptanceRequired: z.boolean(),
    customerAcceptance: optionalText,
    disposition: z
      .enum(['ACCEPTED', 'CORRECTION_REQUIRED', 'REJECTED'])
      .optional(),
  }),
} satisfies Record<StructuredRecordType, z.ZodType<Record<string, unknown>>>;

const draftSchemas = Object.fromEntries(
  Object.entries(schemas).map(([key, schema]) => [key, schema.partial()])
) as unknown as Record<
  StructuredRecordType,
  z.ZodType<Record<string, unknown>>
>;

const tableByType = {
  REQUIREMENT: designControlRequirements,
  RISK: designControlRisks,
  REVIEW: designControlReviews,
  VERIFICATION: designControlVerification,
  VALIDATION: designControlValidation,
} as const;

function stableChecksum(value: unknown) {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, sort(item)])
      );
    }
    return input;
  };
  return createHash('sha256')
    .update(JSON.stringify(sort(value)))
    .digest('hex');
}

function identity(actor: StructuredActor) {
  return {
    userId: actor.id,
    displayName: actor.displayName,
    role: actor.role,
    capabilities: actor.capabilities,
  };
}

function recordKey(
  type: StructuredRecordType,
  content: Record<string, unknown>
) {
  const field = {
    REQUIREMENT: 'requirementNumber',
    RISK: 'riskNumber',
    REVIEW: 'reviewNumber',
    VERIFICATION: 'verificationNumber',
    VALIDATION: 'validationNumber',
  }[type];
  return String(content[field] ?? '').trim() || `${type}-DRAFT`;
}

function titleFor(
  type: StructuredRecordType,
  content: Record<string, unknown>
) {
  const field = {
    REQUIREMENT: 'requirementStatement',
    RISK: 'hazardFailureMode',
    REVIEW: 'reviewType',
    VERIFICATION: 'result',
    VALIDATION: 'objective',
  }[type];
  return String(content[field] ?? recordKey(type, content)).trim();
}

function baseInsert(
  type: StructuredRecordType,
  recordId: string,
  rdProjectId: string,
  content: Record<string, unknown>
) {
  const common = {
    recordId,
    rdProjectId,
    title: titleFor(type, content),
    status: 'draft',
    formData: content,
  };
  if (type === 'REQUIREMENT')
    return { ...common, requirementKey: recordKey(type, content) };
  if (type === 'RISK') return { ...common, riskKey: recordKey(type, content) };
  if (type === 'REVIEW')
    return {
      ...common,
      reviewType: String(content.reviewType ?? ''),
      title: titleFor(type, content),
    };
  if (type === 'VERIFICATION')
    return { ...common, verificationKey: recordKey(type, content) };
  return { ...common, validationKey: recordKey(type, content) };
}

async function loadRecord(recordId: string, client: typeof db = db) {
  const [record] = await client
    .select()
    .from(designControlRecords)
    .where(eq(designControlRecords.id, recordId))
    .limit(1);
  if (!record?.rdProjectId)
    throw new DesignControlStructuredError(
      404,
      'DESIGN_CONTROL_RECORD_NOT_FOUND',
      'Design Control record or R&D project ownership was not found'
    );
  return record;
}

const mutationRoles = new Set([
  'DESIGN_AUTHORITY',
  'PROJECT_MANAGER',
  'QUALITY',
  'CONTRIBUTOR',
]);
const approvalRoles: Record<StructuredRecordType, Set<string>> = {
  REQUIREMENT: new Set(['DESIGN_AUTHORITY', 'QUALITY', 'REVIEWER']),
  RISK: new Set(['DESIGN_AUTHORITY', 'QUALITY']),
  REVIEW: new Set(['DESIGN_AUTHORITY', 'QUALITY', 'PROJECT_MANAGER']),
  VERIFICATION: new Set(['QUALITY', 'DESIGN_AUTHORITY', 'REVIEWER']),
  VALIDATION: new Set(['QUALITY', 'DESIGN_AUTHORITY', 'REVIEWER']),
};

export async function assertStructuredProjectAccess(
  input: {
    rdProjectId: string;
    actor: StructuredActor;
    action: 'READ' | 'MUTATE' | 'APPROVE' | 'ADMIN';
    recordType?: StructuredRecordType;
  },
  client: typeof db = db
) {
  const [policy] = await client
    .select()
    .from(designControlProjectAccessPolicies)
    .where(
      and(
        eq(designControlProjectAccessPolicies.rdProjectId, input.rdProjectId),
        eq(designControlProjectAccessPolicies.status, 'ACTIVE')
      )
    )
    .limit(1);
  if (!policy)
    return { mode: 'LEGACY_NOT_ACTIVATED' as const, assignment: null };

  const [assignment] = await client
    .select()
    .from(designControlProjectAssignments)
    .where(
      and(
        eq(designControlProjectAssignments.rdProjectId, input.rdProjectId),
        eq(designControlProjectAssignments.userId, input.actor.id),
        eq(designControlProjectAssignments.status, 'ACTIVE'),
        sql`${designControlProjectAssignments.effectiveAt} <= now()`,
        sql`${designControlProjectAssignments.revokedAt} IS NULL`
      )
    )
    .limit(1);
  if (
    !assignment &&
    (input.actor.role === 'ADMIN' || input.actor.role === 'OWNER')
  ) {
    const reason = input.actor.adminOverrideReason?.trim();
    if (!reason)
      throw new DesignControlStructuredError(
        403,
        'ADMIN_OVERRIDE_REASON_REQUIRED',
        'An explicit audited administrator override reason is required'
      );
    const [anchor] = await client
      .select()
      .from(designControlProjectAssignments)
      .where(
        and(
          eq(designControlProjectAssignments.rdProjectId, input.rdProjectId),
          eq(designControlProjectAssignments.status, 'ACTIVE')
        )
      )
      .limit(1);
    if (!anchor)
      throw new DesignControlStructuredError(
        403,
        'PROJECT_ASSIGNMENT_REQUIRED',
        'Administrator override requires an active project assignment anchor'
      );
    await client.insert(designControlProjectAssignmentEvents).values({
      assignmentId: anchor.id,
      rdProjectId: input.rdProjectId,
      eventType: 'ADMIN_OVERRIDE',
      actorUserId: input.actor.id,
      actorDisplayName: input.actor.displayName,
      roleSnapshot: input.actor.role,
      capabilitiesSnapshot: input.actor.capabilities,
      reason,
      resultingState: {
        action: input.action,
        recordType: input.recordType ?? null,
        overrideActorUserId: input.actor.id,
      },
    });
    return { mode: 'ADMIN_OVERRIDE' as const, assignment: null };
  }
  if (!assignment)
    throw new DesignControlStructuredError(
      403,
      'PROJECT_ASSIGNMENT_REQUIRED',
      'An active assignment to this R&D Design Project is required'
    );
  if (input.action === 'READ') return { mode: 'ASSIGNED' as const, assignment };
  if (assignment.projectRole === 'AUDITOR')
    throw new DesignControlStructuredError(
      403,
      'PROJECT_ASSIGNMENT_READ_ONLY',
      'This project assignment is read-only'
    );
  if (
    input.action === 'ADMIN' &&
    !['DESIGN_AUTHORITY', 'PROJECT_MANAGER'].includes(assignment.projectRole)
  )
    throw new DesignControlStructuredError(
      403,
      'PROJECT_ASSIGNMENT_ROLE_REQUIRED',
      'Design Authority or Project Manager assignment is required'
    );
  if (input.action === 'MUTATE' && !mutationRoles.has(assignment.projectRole))
    throw new DesignControlStructuredError(
      403,
      'PROJECT_ASSIGNMENT_ROLE_REQUIRED',
      'The assigned project role does not permit record changes'
    );
  if (
    input.action === 'APPROVE' &&
    input.recordType &&
    !approvalRoles[input.recordType].has(assignment.projectRole)
  )
    throw new DesignControlStructuredError(
      403,
      'PROJECT_APPROVAL_ROLE_REQUIRED',
      'The assigned project role is not authorized for this approval'
    );
  return { mode: 'ASSIGNED' as const, assignment };
}

export async function listStructuredRecords(
  recordId: string,
  type: StructuredRecordType,
  actor: StructuredActor
) {
  const record = await loadRecord(recordId);
  await assertStructuredProjectAccess({
    rdProjectId: record.rdProjectId!,
    actor,
    action: 'READ',
    recordType: type,
  });
  const table = tableByType[type];
  const rows = await db
    .select()
    .from(table)
    .where(eq(table.recordId, record.id))
    .orderBy(desc(table.updatedAt));
  const versions = await db
    .select()
    .from(designControlStructuredRecordVersions)
    .where(
      and(
        eq(
          designControlStructuredRecordVersions.designControlRecordId,
          record.id
        ),
        eq(designControlStructuredRecordVersions.recordType, type)
      )
    )
    .orderBy(desc(designControlStructuredRecordVersions.version));
  const currentById = new Map<string, (typeof versions)[number]>();
  for (const version of versions)
    if (!currentById.has(version.structuredRecordId))
      currentById.set(version.structuredRecordId, version);
  const actions =
    type === 'REVIEW'
      ? await db
          .select()
          .from(designControlReviewActions)
          .where(
            eq(designControlReviewActions.designControlRecordId, record.id)
          )
          .orderBy(desc(designControlReviewActions.createdAt))
      : [];
  return rows.map((row) => ({
    ...row,
    currentVersion: currentById.get(row.id) ?? null,
    reviewActions: actions.filter((action) => action.reviewRecordId === row.id),
  }));
}

export async function createStructuredRecord(input: {
  recordId: string;
  type: StructuredRecordType;
  content: Record<string, unknown>;
  changeReason: string;
  actor: StructuredActor;
}) {
  const parsed = draftSchemas[input.type].safeParse(input.content);
  if (!parsed.success)
    throw new DesignControlStructuredError(
      400,
      'INVALID_STRUCTURED_RECORD',
      'Draft content is invalid',
      { issues: parsed.error.issues }
    );
  return db.transaction(async (tx) => {
    const record = await loadRecord(input.recordId, tx as unknown as typeof db);
    await assertStructuredProjectAccess(
      {
        rdProjectId: record.rdProjectId!,
        actor: input.actor,
        action: 'MUTATE',
        recordType: input.type,
      },
      tx as unknown as typeof db
    );
    const table = tableByType[input.type];
    const [created] = await tx
      .insert(table)
      .values(
        baseInsert(input.type, record.id, record.rdProjectId!, parsed.data)
      )
      .returning();
    const [version] = await tx
      .insert(designControlStructuredRecordVersions)
      .values({
        rdProjectId: record.rdProjectId!,
        designControlRecordId: record.id,
        recordType: input.type,
        structuredRecordId: created.id,
        version: 1,
        lifecycleStatus: 'DRAFT',
        contentSnapshot: parsed.data,
        contentChecksum: stableChecksum(parsed.data),
        changeReason: input.changeReason.trim() || 'Initial draft',
        createdByUserId: input.actor.id,
        createdByDisplayName: input.actor.displayName,
        createdByRoleSnapshot: input.actor.role,
        createdByCapabilitiesSnapshot: input.actor.capabilities,
      })
      .returning();
    return { record: created, version };
  });
}

async function currentVersion(
  type: StructuredRecordType,
  itemId: string,
  client: typeof db = db
) {
  const [version] = await client
    .select()
    .from(designControlStructuredRecordVersions)
    .where(
      and(
        eq(designControlStructuredRecordVersions.recordType, type),
        eq(designControlStructuredRecordVersions.structuredRecordId, itemId)
      )
    )
    .orderBy(desc(designControlStructuredRecordVersions.version))
    .limit(1);
  if (!version)
    throw new DesignControlStructuredError(
      404,
      'STRUCTURED_RECORD_NOT_FOUND',
      'Structured Design Control record was not found'
    );
  return version;
}

export async function saveStructuredDraft(input: {
  recordId: string;
  type: StructuredRecordType;
  itemId: string;
  expectedVersion: number;
  content: Record<string, unknown>;
  changeReason: string;
  actor: StructuredActor;
}) {
  const parsed = draftSchemas[input.type].safeParse(input.content);
  if (!parsed.success)
    throw new DesignControlStructuredError(
      400,
      'INVALID_STRUCTURED_RECORD',
      'Draft content is invalid',
      { issues: parsed.error.issues }
    );
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM design_control_structured_record_versions WHERE record_type = ${input.type} AND structured_record_id = ${input.itemId} ORDER BY version DESC LIMIT 1 FOR UPDATE`
    );
    const current = await currentVersion(
      input.type,
      input.itemId,
      tx as unknown as typeof db
    );
    if (current.designControlRecordId !== input.recordId)
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_RECORD_REJECTED',
        'The structured record does not belong to this Design Control record'
      );
    if (current.version !== input.expectedVersion)
      throw new DesignControlStructuredError(
        409,
        'STALE_STRUCTURED_RECORD_VERSION',
        'The record changed after it was loaded',
        {
          expectedVersion: input.expectedVersion,
          currentVersion: current.version,
        }
      );
    if (!['DRAFT', 'RETURNED', 'REJECTED'].includes(current.lifecycleStatus))
      throw new DesignControlStructuredError(
        409,
        'STRUCTURED_RECORD_NOT_EDITABLE',
        'Only draft, returned, or rejected records can be edited'
      );
    await assertStructuredProjectAccess(
      {
        rdProjectId: current.rdProjectId,
        actor: input.actor,
        action: 'MUTATE',
        recordType: input.type,
      },
      tx as unknown as typeof db
    );
    const nextVersion = current.version + 1;
    const [version] = await tx
      .insert(designControlStructuredRecordVersions)
      .values({
        rdProjectId: current.rdProjectId,
        designControlRecordId: current.designControlRecordId,
        recordType: input.type,
        structuredRecordId: input.itemId,
        version: nextVersion,
        lifecycleStatus: 'DRAFT',
        contentSnapshot: parsed.data,
        contentChecksum: stableChecksum(parsed.data),
        changeReason: input.changeReason.trim() || 'Draft updated',
        createdByUserId: input.actor.id,
        createdByDisplayName: input.actor.displayName,
        createdByRoleSnapshot: input.actor.role,
        createdByCapabilitiesSnapshot: input.actor.capabilities,
        supersedesVersionId: current.id,
      })
      .returning();
    await tx
      .update(designControlStructuredRecordVersions)
      .set({ lifecycleStatus: 'SUPERSEDED', supersededAt: new Date() })
      .where(eq(designControlStructuredRecordVersions.id, current.id));
    const table = tableByType[input.type];
    const [updated] = await tx
      .update(table)
      .set({
        ...baseInsert(
          input.type,
          current.designControlRecordId,
          current.rdProjectId,
          parsed.data
        ),
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(table.id, input.itemId),
          eq(table.recordId, input.recordId),
          eq(table.rdProjectId, current.rdProjectId)
        )
      )
      .returning();
    if (!updated)
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_RECORD_REJECTED',
        'The structured record project ownership did not match'
      );
    return { record: updated, version };
  });
}

export async function submitStructuredRecord(input: {
  recordId: string;
  type: StructuredRecordType;
  itemId: string;
  expectedVersion: number;
  actor: StructuredActor;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM design_control_structured_record_versions WHERE record_type = ${input.type} AND structured_record_id = ${input.itemId} ORDER BY version DESC LIMIT 1 FOR UPDATE`
    );
    const current = await currentVersion(
      input.type,
      input.itemId,
      tx as unknown as typeof db
    );
    if (
      current.designControlRecordId !== input.recordId ||
      current.version !== input.expectedVersion
    )
      throw new DesignControlStructuredError(
        409,
        'STALE_OR_CROSS_PROJECT_RECORD',
        'The record is stale or belongs to another Design Control record'
      );
    await assertStructuredProjectAccess(
      {
        rdProjectId: current.rdProjectId,
        actor: input.actor,
        action: 'MUTATE',
        recordType: input.type,
      },
      tx as unknown as typeof db
    );
    const parsed = schemas[input.type].safeParse(current.contentSnapshot);
    if (!parsed.success)
      throw new DesignControlStructuredError(
        422,
        'STRUCTURED_RECORD_INCOMPLETE',
        'Required evidence is missing',
        {
          missingFields: parsed.error.issues.map((issue) =>
            issue.path.join('.')
          ),
        }
      );
    if (
      input.type === 'VERIFICATION' &&
      current.contentSnapshot.passFail === 'FAIL' &&
      !String(current.contentSnapshot.exceptionDisposition ?? '').trim()
    )
      throw new DesignControlStructuredError(
        422,
        'FAILED_VERIFICATION_DISPOSITION_REQUIRED',
        'Failed verification requires an authorized disposition or linked action'
      );
    if (
      input.type === 'VALIDATION' &&
      current.contentSnapshot.customerAcceptanceRequired === true &&
      !String(current.contentSnapshot.customerAcceptance ?? '').trim()
    )
      throw new DesignControlStructuredError(
        422,
        'CUSTOMER_ACCEPTANCE_REQUIRED',
        'Customer acceptance evidence is required for this validation'
      );
    await tx
      .update(designControlStructuredRecordVersions)
      .set({
        lifecycleStatus: 'SUBMITTED',
        submittedAt: new Date(),
        submittedByUserId: input.actor.id,
        submittedBySnapshot: identity(input.actor),
      })
      .where(eq(designControlStructuredRecordVersions.id, current.id));
    const table = tableByType[input.type];
    await tx
      .update(table)
      .set({ status: 'submitted', updatedAt: new Date() })
      .where(
        and(
          eq(table.id, input.itemId),
          eq(table.recordId, input.recordId),
          eq(table.rdProjectId, current.rdProjectId)
        )
      );
    return { ...current, lifecycleStatus: 'SUBMITTED' as const };
  });
}

export async function decideStructuredRecord(input: {
  recordId: string;
  type: StructuredRecordType;
  itemId: string;
  versionId: string;
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED';
  comment?: string;
  actor: StructuredActor;
}) {
  if (input.decision !== 'APPROVED' && !input.comment?.trim())
    throw new DesignControlStructuredError(
      400,
      'DECISION_REASON_REQUIRED',
      'Rejection and return decisions require a reason'
    );
  return db.transaction(async (tx) => {
    const [version] = await tx
      .select()
      .from(designControlStructuredRecordVersions)
      .where(
        and(
          eq(designControlStructuredRecordVersions.id, input.versionId),
          eq(designControlStructuredRecordVersions.recordType, input.type),
          eq(
            designControlStructuredRecordVersions.structuredRecordId,
            input.itemId
          ),
          eq(
            designControlStructuredRecordVersions.designControlRecordId,
            input.recordId
          )
        )
      )
      .limit(1);
    if (!version)
      throw new DesignControlStructuredError(
        404,
        'STRUCTURED_RECORD_VERSION_NOT_FOUND',
        'The requested record version was not found'
      );
    if (version.lifecycleStatus !== 'SUBMITTED')
      throw new DesignControlStructuredError(
        409,
        'STRUCTURED_RECORD_NOT_SUBMITTED',
        'Only the current submitted version can receive a decision'
      );
    const current = await currentVersion(
      input.type,
      input.itemId,
      tx as unknown as typeof db
    );
    if (current.id !== version.id)
      throw new DesignControlStructuredError(
        409,
        'STALE_STRUCTURED_RECORD_VERSION',
        'A newer record version exists'
      );
    const access = await assertStructuredProjectAccess(
      {
        rdProjectId: version.rdProjectId,
        actor: input.actor,
        action: 'APPROVE',
        recordType: input.type,
      },
      tx as unknown as typeof db
    );
    if (version.submittedByUserId === input.actor.id)
      throw new DesignControlStructuredError(
        403,
        'REVIEWER_INDEPENDENCE_REQUIRED',
        'The person who submitted this record cannot approve, reject, or return it'
      );
    if (input.type === 'REVIEW' && input.decision === 'APPROVED') {
      const openActions = await tx
        .select()
        .from(designControlReviewActions)
        .where(
          and(
            eq(designControlReviewActions.reviewRecordId, input.itemId),
            eq(designControlReviewActions.mandatory, true),
            sql`${designControlReviewActions.status} NOT IN ('CLOSED', 'EXCEPTED')`
          )
        );
      if (openActions.length > 0)
        throw new DesignControlStructuredError(
          422,
          'MANDATORY_REVIEW_ACTIONS_OPEN',
          'A Design Review cannot close while mandatory actions remain unresolved',
          {
            actions: openActions.map((action) => ({
              id: action.id,
              actionNumber: action.actionNumber,
              owner: action.ownerDisplayName,
            })),
          }
        );
    }
    const approvalRole = access.assignment?.projectRole ?? input.actor.role;
    const [decision] = await tx
      .insert(designControlStructuredRecordDecisions)
      .values({
        versionId: version.id,
        rdProjectId: version.rdProjectId,
        decision: input.decision,
        approvalRoleSnapshot: approvalRole,
        actorUserId: input.actor.id,
        actorDisplayNameSnapshot: input.actor.displayName,
        actorRoleSnapshot: input.actor.role,
        actorCapabilitiesSnapshot: input.actor.capabilities,
        decisionComment: input.comment?.trim() || null,
      })
      .returning();
    const status = input.decision === 'APPROVED' ? 'APPROVED' : input.decision;
    await tx
      .update(designControlStructuredRecordVersions)
      .set({ lifecycleStatus: status })
      .where(eq(designControlStructuredRecordVersions.id, version.id));
    const table = tableByType[input.type];
    await tx
      .update(table)
      .set({ status: status.toLowerCase(), updatedAt: new Date() })
      .where(
        and(
          eq(table.id, input.itemId),
          eq(table.recordId, input.recordId),
          eq(table.rdProjectId, version.rdProjectId)
        )
      );
    return { decision, status };
  });
}

export async function reviseStructuredRecord(input: {
  recordId: string;
  type: StructuredRecordType;
  itemId: string;
  expectedVersion: number;
  changeReason: string;
  actor: StructuredActor;
}) {
  if (!input.changeReason.trim())
    throw new DesignControlStructuredError(
      400,
      'REVISION_REASON_REQUIRED',
      'A controlled revision requires a reason'
    );
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM design_control_structured_record_versions WHERE record_type = ${input.type} AND structured_record_id = ${input.itemId} ORDER BY version DESC LIMIT 1 FOR UPDATE`
    );
    const current = await currentVersion(
      input.type,
      input.itemId,
      tx as unknown as typeof db
    );
    if (
      current.designControlRecordId !== input.recordId ||
      current.version !== input.expectedVersion
    )
      throw new DesignControlStructuredError(
        409,
        'STALE_OR_CROSS_PROJECT_RECORD',
        'The record is stale or belongs to another project'
      );
    if (current.lifecycleStatus !== 'APPROVED')
      throw new DesignControlStructuredError(
        409,
        'APPROVED_RECORD_REQUIRED',
        'Only an approved record can start a controlled revision'
      );
    await assertStructuredProjectAccess(
      {
        rdProjectId: current.rdProjectId,
        actor: input.actor,
        action: 'MUTATE',
        recordType: input.type,
      },
      tx as unknown as typeof db
    );
    const [version] = await tx
      .insert(designControlStructuredRecordVersions)
      .values({
        rdProjectId: current.rdProjectId,
        designControlRecordId: current.designControlRecordId,
        recordType: input.type,
        structuredRecordId: input.itemId,
        version: current.version + 1,
        lifecycleStatus: 'DRAFT',
        contentSnapshot: current.contentSnapshot,
        contentChecksum: current.contentChecksum,
        changeReason: input.changeReason.trim(),
        createdByUserId: input.actor.id,
        createdByDisplayName: input.actor.displayName,
        createdByRoleSnapshot: input.actor.role,
        createdByCapabilitiesSnapshot: input.actor.capabilities,
        supersedesVersionId: current.id,
      })
      .returning();
    await tx
      .update(designControlStructuredRecordVersions)
      .set({ lifecycleStatus: 'SUPERSEDED', supersededAt: new Date() })
      .where(eq(designControlStructuredRecordVersions.id, current.id));
    const table = tableByType[input.type];
    await tx
      .update(table)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(
        and(
          eq(table.id, input.itemId),
          eq(table.recordId, input.recordId),
          eq(table.rdProjectId, current.rdProjectId)
        )
      );
    return { version };
  });
}

export async function getStructuredHistory(
  recordId: string,
  type: StructuredRecordType,
  itemId: string,
  actor: StructuredActor
) {
  const record = await loadRecord(recordId);
  await assertStructuredProjectAccess({
    rdProjectId: record.rdProjectId!,
    actor,
    action: 'READ',
    recordType: type,
  });
  const versions = await db
    .select()
    .from(designControlStructuredRecordVersions)
    .where(
      and(
        eq(
          designControlStructuredRecordVersions.designControlRecordId,
          recordId
        ),
        eq(designControlStructuredRecordVersions.recordType, type),
        eq(designControlStructuredRecordVersions.structuredRecordId, itemId)
      )
    )
    .orderBy(desc(designControlStructuredRecordVersions.version));
  const decisions = await db
    .select()
    .from(designControlStructuredRecordDecisions)
    .where(
      eq(
        designControlStructuredRecordDecisions.rdProjectId,
        record.rdProjectId!
      )
    )
    .orderBy(desc(designControlStructuredRecordDecisions.signedAt));
  const versionIds = new Set(versions.map((version) => version.id));
  return {
    versions,
    decisions: decisions.filter((decision) =>
      versionIds.has(decision.versionId)
    ),
  };
}

const structuredTargetTypes = new Set([
  'REQUIREMENT',
  'RISK',
  'REVIEW',
  'VERIFICATION',
  'VALIDATION',
]);

async function assertLinkTargetProject(
  targetType: string,
  targetId: string,
  rdProjectId: string,
  designControlRecordId: string,
  client: typeof db
) {
  if (structuredTargetTypes.has(targetType)) {
    const [target] = await client
      .select()
      .from(designControlStructuredRecordVersions)
      .where(
        and(
          eq(designControlStructuredRecordVersions.recordType, targetType),
          eq(designControlStructuredRecordVersions.structuredRecordId, targetId)
        )
      )
      .orderBy(desc(designControlStructuredRecordVersions.version))
      .limit(1);
    if (!target || target.rdProjectId !== rdProjectId)
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_LINK_REJECTED',
        'The linked structured record does not belong to this R&D project'
      );
    return target.lifecycleStatus;
  }
  if (targetType === 'CONFIGURATION_ITEM') {
    const [target] = await client
      .select()
      .from(designProjectConfigurationItems)
      .where(
        and(
          eq(designProjectConfigurationItems.id, targetId),
          eq(designProjectConfigurationItems.rdProjectId, rdProjectId)
        )
      )
      .limit(1);
    if (!target)
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_LINK_REJECTED',
        'The configuration item does not belong to this R&D project'
      );
    return target.lifecycleStatus;
  }
  if (targetType === 'PART_REVISION') {
    const [target] = await client
      .select({
        state: designProjectPartRevisions.lifecycleState,
        projectId: designProjectConfigurationItems.rdProjectId,
      })
      .from(designProjectPartRevisions)
      .innerJoin(
        designProjectConfigurationItems,
        eq(
          designProjectConfigurationItems.id,
          designProjectPartRevisions.configurationItemId
        )
      )
      .where(
        and(
          eq(designProjectPartRevisions.id, targetId),
          eq(designProjectConfigurationItems.rdProjectId, rdProjectId)
        )
      )
      .limit(1);
    if (!target)
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_LINK_REJECTED',
        'The part revision does not belong to this R&D project'
      );
    return target.state;
  }
  if (targetType === 'DESIGN_OUTPUT') {
    const [target] = await client
      .select()
      .from(designControlSteps)
      .where(
        and(
          eq(designControlSteps.id, targetId),
          eq(designControlSteps.recordId, designControlRecordId),
          eq(designControlSteps.stepKey, '6')
        )
      )
      .limit(1);
    if (!target)
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_LINK_REJECTED',
        'The Design Output does not belong to this Design Control record'
      );
    return target.status;
  }
  if (targetType === 'ECN') {
    const result = await client.execute(sql`
      SELECT status
      FROM engineering_change_orders
      WHERE id = ${targetId}::uuid
        AND rd_project_id = ${rdProjectId}
      LIMIT 1
    `);
    const rows = ((result as unknown as { rows?: Array<{ status: string }> })
      .rows ?? result) as Array<{ status: string }>;
    if (!rows[0])
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_LINK_REJECTED',
        'The ECN does not belong to this R&D project'
      );
    return rows[0].status;
  }
  if (targetType === 'ENGINEERING_RELEASE') {
    const [target] = await client
      .select()
      .from(engineeringReleases)
      .where(
        and(
          eq(engineeringReleases.id, targetId),
          eq(engineeringReleases.rdProjectId, rdProjectId),
          eq(engineeringReleases.designControlRecordId, designControlRecordId)
        )
      )
      .limit(1);
    if (!target)
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_LINK_REJECTED',
        'The Engineering Release does not belong to this R&D project'
      );
    return target.releaseStatus;
  }
  if (targetType === 'ECR') {
    const result = await client.execute(sql`
      SELECT lifecycle_status
      FROM engineering_change_requests
      WHERE id = ${targetId}::uuid
        AND rd_project_id = ${rdProjectId}
        AND design_control_record_id = ${designControlRecordId}
      LIMIT 1
    `);
    const rows = ((
      result as unknown as { rows?: Array<{ lifecycle_status: string }> }
    ).rows ?? result) as Array<{ lifecycle_status: string }>;
    if (!rows[0])
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_LINK_REJECTED',
        'The ECR does not belong to this R&D project'
      );
    return rows[0].lifecycle_status;
  }
  if (targetType === 'NCR')
    throw new DesignControlStructuredError(
      422,
      'NCR_PROJECT_LINK_REQUIRED',
      'This NCR has no authoritative R&D project ownership link and cannot be used as Design Control evidence'
    );
  throw new DesignControlStructuredError(
    400,
    'UNSUPPORTED_TRACEABILITY_TARGET',
    'Unsupported authoritative traceability target type'
  );
}

export async function createStructuredLink(input: {
  recordId: string;
  type: StructuredRecordType;
  itemId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  targetRevision?: string;
  actor: StructuredActor;
}) {
  return db.transaction(async (tx) => {
    const source = await currentVersion(
      input.type,
      input.itemId,
      tx as unknown as typeof db
    );
    if (source.designControlRecordId !== input.recordId)
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_RECORD_REJECTED',
        'The source record belongs to another Design Control project'
      );
    await assertStructuredProjectAccess(
      {
        rdProjectId: source.rdProjectId,
        actor: input.actor,
        action: 'MUTATE',
        recordType: input.type,
      },
      tx as unknown as typeof db
    );
    const targetStatus = await assertLinkTargetProject(
      input.targetType,
      input.targetId,
      source.rdProjectId,
      source.designControlRecordId,
      tx as unknown as typeof db
    );
    const [link] = await tx
      .insert(designControlStructuredRecordLinks)
      .values({
        rdProjectId: source.rdProjectId,
        designControlRecordId: source.designControlRecordId,
        sourceRecordType: input.type,
        sourceRecordId: input.itemId,
        targetRecordType: input.targetType,
        targetRecordId: input.targetId,
        relationType: input.relationType,
        targetRevision: input.targetRevision ?? null,
        targetStatusSnapshot: targetStatus,
        createdByUserId: input.actor.id,
        createdByDisplayName: input.actor.displayName,
      })
      .returning();
    return link;
  });
}

export async function createReviewAction(input: {
  recordId: string;
  reviewId: string;
  actionNumber: string;
  description: string;
  ownerUserId?: number;
  ownerDisplayName: string;
  dueDate: string;
  mandatory: boolean;
  actor: StructuredActor;
}) {
  return db.transaction(async (tx) => {
    const review = await currentVersion(
      'REVIEW',
      input.reviewId,
      tx as unknown as typeof db
    );
    if (review.designControlRecordId !== input.recordId)
      throw new DesignControlStructuredError(
        403,
        'CROSS_PROJECT_RECORD_REJECTED',
        'The review belongs to another project'
      );
    await assertStructuredProjectAccess(
      {
        rdProjectId: review.rdProjectId,
        actor: input.actor,
        action: 'MUTATE',
        recordType: 'REVIEW',
      },
      tx as unknown as typeof db
    );
    if (
      ![
        input.actionNumber,
        input.description,
        input.ownerDisplayName,
        input.dueDate,
      ].every((value) => value.trim())
    )
      throw new DesignControlStructuredError(
        400,
        'REVIEW_ACTION_FIELDS_REQUIRED',
        'Action number, description, owner, and due date are required'
      );
    const [action] = await tx
      .insert(designControlReviewActions)
      .values({
        rdProjectId: review.rdProjectId,
        designControlRecordId: review.designControlRecordId,
        reviewRecordId: input.reviewId,
        actionNumber: input.actionNumber.trim(),
        description: input.description.trim(),
        ownerUserId: input.ownerUserId ?? null,
        ownerDisplayName: input.ownerDisplayName.trim(),
        dueDate: input.dueDate,
        mandatory: input.mandatory,
        createdByUserId: input.actor.id,
        createdByDisplayName: input.actor.displayName,
      })
      .returning();
    return action;
  });
}

export async function closeReviewAction(input: {
  recordId: string;
  actionId: string;
  expectedVersion: number;
  closureEvidence: Record<string, unknown>;
  excepted: boolean;
  actor: StructuredActor;
}) {
  return db.transaction(async (tx) => {
    const [action] = await tx
      .select()
      .from(designControlReviewActions)
      .where(
        and(
          eq(designControlReviewActions.id, input.actionId),
          eq(designControlReviewActions.designControlRecordId, input.recordId),
          eq(designControlReviewActions.rowVersion, input.expectedVersion)
        )
      )
      .limit(1);
    if (!action)
      throw new DesignControlStructuredError(
        409,
        'STALE_OR_CROSS_PROJECT_REVIEW_ACTION',
        'Review action is stale or belongs to another project'
      );
    await assertStructuredProjectAccess(
      {
        rdProjectId: action.rdProjectId,
        actor: input.actor,
        action: 'APPROVE',
        recordType: 'REVIEW',
      },
      tx as unknown as typeof db
    );
    if (Object.keys(input.closureEvidence).length === 0)
      throw new DesignControlStructuredError(
        422,
        'CLOSURE_EVIDENCE_REQUIRED',
        'Review action closure requires evidence'
      );
    if (input.excepted && !action.exceptionVersionId)
      throw new DesignControlStructuredError(
        422,
        'AUTHORIZED_EXCEPTION_REQUIRED',
        'An authorized exception is required to except a mandatory action'
      );
    const [updated] = await tx
      .update(designControlReviewActions)
      .set({
        status: input.excepted ? 'EXCEPTED' : 'CLOSED',
        closureEvidence: input.closureEvidence,
        closureApprovedByUserId: input.actor.id,
        closureApprovedByDisplayName: input.actor.displayName,
        closureApprovedAt: new Date(),
        rowVersion: action.rowVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(designControlReviewActions.id, action.id))
      .returning();
    return updated;
  });
}

export async function activateProjectAssignmentPolicy(input: {
  recordId: string;
  actor: StructuredActor;
  reason: string;
}) {
  if (!input.reason.trim())
    throw new DesignControlStructuredError(
      400,
      'ACTIVATION_REASON_REQUIRED',
      'Assignment policy activation requires a reason'
    );
  return db.transaction(async (tx) => {
    const record = await loadRecord(input.recordId, tx as unknown as typeof db);
    const [existing] = await tx
      .select()
      .from(designControlProjectAccessPolicies)
      .where(
        and(
          eq(
            designControlProjectAccessPolicies.rdProjectId,
            record.rdProjectId!
          ),
          eq(designControlProjectAccessPolicies.status, 'ACTIVE')
        )
      )
      .limit(1);
    if (existing) return existing;
    const [policy] = await tx
      .insert(designControlProjectAccessPolicies)
      .values({
        rdProjectId: record.rdProjectId!,
        designControlRecordId: record.id,
        activatedByUserId: input.actor.id,
        activatedByDisplayName: input.actor.displayName,
        reason: input.reason.trim(),
      })
      .returning();
    const [assignment] = await tx
      .insert(designControlProjectAssignments)
      .values({
        rdProjectId: record.rdProjectId!,
        policyId: policy.id,
        userId: input.actor.id,
        projectRole: 'DESIGN_AUTHORITY',
        responsibilityClass: 'ENGINEERING',
        capabilities: input.actor.capabilities,
        assignedByUserId: input.actor.id,
        assignedByDisplayName: input.actor.displayName,
        reason:
          'Initial Design Authority created atomically with assignment-policy activation',
      })
      .returning();
    await tx.insert(designControlProjectAssignmentEvents).values({
      assignmentId: assignment.id,
      rdProjectId: record.rdProjectId!,
      eventType: 'ASSIGNED',
      actorUserId: input.actor.id,
      actorDisplayName: input.actor.displayName,
      roleSnapshot: input.actor.role,
      capabilitiesSnapshot: input.actor.capabilities,
      reason: assignment.reason,
      resultingState: assignment,
    });
    return policy;
  });
}

export async function listProjectAssignments(
  recordId: string,
  actor: StructuredActor
) {
  const record = await loadRecord(recordId);
  const [policy] = await db
    .select()
    .from(designControlProjectAccessPolicies)
    .where(
      and(
        eq(designControlProjectAccessPolicies.rdProjectId, record.rdProjectId!),
        eq(designControlProjectAccessPolicies.status, 'ACTIVE')
      )
    )
    .limit(1);
  if (!policy)
    return { activated: false, policy: null, assignments: [], history: [] };
  await assertStructuredProjectAccess({
    rdProjectId: record.rdProjectId!,
    actor,
    action: 'READ',
  });
  const assignments = await db
    .select({
      id: designControlProjectAssignments.id,
      userId: designControlProjectAssignments.userId,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      projectRole: designControlProjectAssignments.projectRole,
      responsibilityClass: designControlProjectAssignments.responsibilityClass,
      capabilities: designControlProjectAssignments.capabilities,
      status: designControlProjectAssignments.status,
      rowVersion: designControlProjectAssignments.rowVersion,
      effectiveAt: designControlProjectAssignments.effectiveAt,
      revokedAt: designControlProjectAssignments.revokedAt,
      reason: designControlProjectAssignments.reason,
    })
    .from(designControlProjectAssignments)
    .innerJoin(users, eq(users.id, designControlProjectAssignments.userId))
    .where(eq(designControlProjectAssignments.rdProjectId, record.rdProjectId!))
    .orderBy(desc(designControlProjectAssignments.assignedAt));
  const history = await db
    .select()
    .from(designControlProjectAssignmentEvents)
    .where(
      eq(designControlProjectAssignmentEvents.rdProjectId, record.rdProjectId!)
    )
    .orderBy(desc(designControlProjectAssignmentEvents.occurredAt));
  return { activated: true, policy, assignments, history };
}

export async function addProjectAssignment(input: {
  recordId: string;
  userId: number;
  projectRole: string;
  responsibilityClass: string;
  capabilities: string[];
  effectiveAt?: string;
  reason: string;
  actor: StructuredActor;
}) {
  if (!input.reason.trim())
    throw new DesignControlStructuredError(
      400,
      'ASSIGNMENT_REASON_REQUIRED',
      'Assignment requires a reason'
    );
  return db.transaction(async (tx) => {
    const record = await loadRecord(input.recordId, tx as unknown as typeof db);
    const access = await assertStructuredProjectAccess(
      { rdProjectId: record.rdProjectId!, actor: input.actor, action: 'ADMIN' },
      tx as unknown as typeof db
    );
    const [policy] = await tx
      .select()
      .from(designControlProjectAccessPolicies)
      .where(
        and(
          eq(
            designControlProjectAccessPolicies.rdProjectId,
            record.rdProjectId!
          ),
          eq(designControlProjectAccessPolicies.status, 'ACTIVE')
        )
      )
      .limit(1);
    if (!policy)
      throw new DesignControlStructuredError(
        409,
        'ASSIGNMENT_POLICY_NOT_ACTIVE',
        'Activate the prospective assignment policy first'
      );
    const [targetUser] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.isActive, true)))
      .limit(1);
    if (!targetUser)
      throw new DesignControlStructuredError(
        404,
        'ASSIGNEE_NOT_FOUND',
        'The active user was not found'
      );
    const [assignment] = await tx
      .insert(designControlProjectAssignments)
      .values({
        rdProjectId: record.rdProjectId!,
        policyId: policy.id,
        userId: input.userId,
        employeeId: targetUser.employeeId,
        projectRole: input.projectRole,
        responsibilityClass: input.responsibilityClass,
        capabilities: input.capabilities,
        effectiveAt: input.effectiveAt
          ? new Date(input.effectiveAt)
          : new Date(),
        assignedByUserId: input.actor.id,
        assignedByDisplayName: input.actor.displayName,
        reason: input.reason.trim(),
      })
      .returning();
    await tx.insert(designControlProjectAssignmentEvents).values({
      assignmentId: assignment.id,
      rdProjectId: record.rdProjectId!,
      eventType: 'ASSIGNED',
      actorUserId: input.actor.id,
      actorDisplayName: input.actor.displayName,
      roleSnapshot: access.assignment?.projectRole ?? input.actor.role,
      capabilitiesSnapshot: input.actor.capabilities,
      reason: input.reason.trim(),
      resultingState: assignment,
    });
    return assignment;
  });
}

export async function revokeProjectAssignment(input: {
  recordId: string;
  assignmentId: string;
  expectedVersion: number;
  reason: string;
  actor: StructuredActor;
}) {
  if (!input.reason.trim())
    throw new DesignControlStructuredError(
      400,
      'REVOCATION_REASON_REQUIRED',
      'Revocation requires a reason'
    );
  return db.transaction(async (tx) => {
    const record = await loadRecord(input.recordId, tx as unknown as typeof db);
    await assertStructuredProjectAccess(
      { rdProjectId: record.rdProjectId!, actor: input.actor, action: 'ADMIN' },
      tx as unknown as typeof db
    );
    const [prior] = await tx
      .select()
      .from(designControlProjectAssignments)
      .where(
        and(
          eq(designControlProjectAssignments.id, input.assignmentId),
          eq(designControlProjectAssignments.rdProjectId, record.rdProjectId!),
          eq(designControlProjectAssignments.status, 'ACTIVE'),
          eq(designControlProjectAssignments.rowVersion, input.expectedVersion)
        )
      )
      .limit(1);
    if (!prior)
      throw new DesignControlStructuredError(
        409,
        'STALE_OR_CROSS_PROJECT_ASSIGNMENT',
        'Assignment is stale, inactive, or belongs to another project'
      );
    const now = new Date();
    const [assignment] = await tx
      .update(designControlProjectAssignments)
      .set({
        status: 'REVOKED',
        revokedAt: now,
        revokedByUserId: input.actor.id,
        revokedByDisplayName: input.actor.displayName,
        rowVersion: prior.rowVersion + 1,
        updatedAt: now,
      })
      .where(eq(designControlProjectAssignments.id, prior.id))
      .returning();
    await tx.insert(designControlProjectAssignmentEvents).values({
      assignmentId: assignment.id,
      rdProjectId: record.rdProjectId!,
      eventType: 'REVOKED',
      actorUserId: input.actor.id,
      actorDisplayName: input.actor.displayName,
      roleSnapshot: input.actor.role,
      capabilitiesSnapshot: input.actor.capabilities,
      reason: input.reason.trim(),
      priorState: prior,
      resultingState: assignment,
    });
    return assignment;
  });
}

export async function verifyRdProjectIdentity(
  recordId: string,
  rdProjectId: string
) {
  const [record] = await db
    .select()
    .from(designControlRecords)
    .innerJoin(rdProjects, eq(rdProjects.id, designControlRecords.rdProjectId))
    .where(
      and(
        eq(designControlRecords.id, recordId),
        eq(designControlRecords.rdProjectId, rdProjectId)
      )
    )
    .limit(1);
  if (!record)
    throw new DesignControlStructuredError(
      403,
      'RD_PROJECT_IDENTITY_MISMATCH',
      'R&D text project identity did not match the Design Control record'
    );
}

export { stableChecksum };
