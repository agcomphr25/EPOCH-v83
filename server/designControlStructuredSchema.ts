import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { designControlRecords, employees, rdProjects, users } from './schema';

export const designControlProjectAccessPolicies = pgTable(
  'design_control_project_access_policies',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    designControlRecordId: uuid('design_control_record_id')
      .notNull()
      .references(() => designControlRecords.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('ACTIVE'),
    rowVersion: integer('row_version').notNull().default(1),
    activatedByUserId: integer('activated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    activatedByDisplayName: text('activated_by_display_name').notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'dc_project_access_policy_status_ck',
      sql`${table.status} IN ('ACTIVE', 'DISABLED')`
    ),
    projectRecordUnique: uniqueIndex(
      'dc_project_access_policy_record_project_uq'
    ).on(table.rdProjectId, table.designControlRecordId),
    activeProjectUnique: uniqueIndex('dc_project_access_policy_active_uq')
      .on(table.rdProjectId)
      .where(sql`${table.status} = 'ACTIVE'`),
  })
);

export const designControlProjectAssignments = pgTable(
  'design_control_project_assignments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    policyId: uuid('policy_id')
      .notNull()
      .references(() => designControlProjectAccessPolicies.id, {
        onDelete: 'restrict',
      }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    employeeId: integer('employee_id').references(() => employees.id, {
      onDelete: 'restrict',
    }),
    projectRole: text('project_role').notNull(),
    responsibilityClass: text('responsibility_class').notNull(),
    capabilities: jsonb('capabilities')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('ACTIVE'),
    rowVersion: integer('row_version').notNull().default(1),
    assignedByUserId: integer('assigned_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedByDisplayName: text('assigned_by_display_name').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveAt: timestamp('effective_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: integer('revoked_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    revokedByDisplayName: text('revoked_by_display_name'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    roleCheck: check(
      'dc_project_assignment_role_ck',
      sql`${table.projectRole} IN ('DESIGN_AUTHORITY','PROJECT_MANAGER','QUALITY','MANUFACTURING','REVIEWER','CONTRIBUTOR','AUDITOR')`
    ),
    statusCheck: check(
      'dc_project_assignment_status_ck',
      sql`${table.status} IN ('ACTIVE','REVOKED','EXPIRED')`
    ),
    revocationCheck: check(
      'dc_project_assignment_revocation_ck',
      sql`(${table.status} = 'ACTIVE' AND ${table.revokedAt} IS NULL) OR (${table.status} <> 'ACTIVE' AND ${table.revokedAt} IS NOT NULL)`
    ),
    activeUserUnique: uniqueIndex('dc_project_assignment_active_user_uq')
      .on(table.rdProjectId, table.userId)
      .where(sql`${table.status} = 'ACTIVE'`),
    projectIdx: index('dc_project_assignment_project_idx').on(
      table.rdProjectId,
      table.status
    ),
  })
);

export const designControlProjectAssignmentEvents = pgTable(
  'design_control_project_assignment_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => designControlProjectAssignments.id, {
        onDelete: 'restrict',
      }),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    actorUserId: integer('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    actorDisplayName: text('actor_display_name').notNull(),
    roleSnapshot: text('role_snapshot').notNull(),
    capabilitiesSnapshot: jsonb('capabilities_snapshot')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    reason: text('reason').notNull(),
    priorState: jsonb('prior_state').$type<Record<string, unknown>>(),
    resultingState: jsonb('resulting_state')
      .$type<Record<string, unknown>>()
      .notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventTypeCheck: check(
      'dc_project_assignment_event_type_ck',
      sql`${table.eventType} IN ('ASSIGNED','ROLE_CHANGED','REVOKED','ADMIN_OVERRIDE')`
    ),
  })
);

export const designControlStructuredRecordVersions = pgTable(
  'design_control_structured_record_versions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    designControlRecordId: uuid('design_control_record_id')
      .notNull()
      .references(() => designControlRecords.id, { onDelete: 'restrict' }),
    recordType: text('record_type').notNull(),
    structuredRecordId: uuid('structured_record_id').notNull(),
    version: integer('version').notNull(),
    lifecycleStatus: text('lifecycle_status').notNull().default('DRAFT'),
    contentSnapshot: jsonb('content_snapshot')
      .$type<Record<string, unknown>>()
      .notNull(),
    contentChecksum: text('content_checksum').notNull(),
    changeReason: text('change_reason').notNull(),
    createdByUserId: integer('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdByDisplayName: text('created_by_display_name').notNull(),
    createdByRoleSnapshot: text('created_by_role_snapshot').notNull(),
    createdByCapabilitiesSnapshot: jsonb('created_by_capabilities_snapshot')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedByUserId: integer('submitted_by_user_id').references(
      () => users.id,
      { onDelete: 'restrict' }
    ),
    submittedBySnapshot: jsonb('submitted_by_snapshot').$type<
      Record<string, unknown>
    >(),
    supersedesVersionId: uuid('supersedes_version_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    recordTypeCheck: check(
      'dc_structured_version_type_ck',
      sql`${table.recordType} IN ('REQUIREMENT','RISK','REVIEW','VERIFICATION','VALIDATION')`
    ),
    lifecycleStatusCheck: check(
      'dc_structured_version_status_ck',
      sql`${table.lifecycleStatus} IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','RETURNED','SUPERSEDED')`
    ),
    versionCheck: check(
      'dc_structured_version_number_ck',
      sql`${table.version} > 0`
    ),
    recordVersionUnique: uniqueIndex('dc_structured_version_record_uq').on(
      table.recordType,
      table.structuredRecordId,
      table.version
    ),
    projectIdx: index('dc_structured_version_project_idx').on(
      table.rdProjectId,
      table.recordType,
      table.lifecycleStatus
    ),
    parentIdx: index('dc_structured_version_parent_idx').on(
      table.structuredRecordId,
      table.version
    ),
  })
);

export const designControlStructuredRecordDecisions = pgTable(
  'design_control_structured_record_decisions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    versionId: uuid('version_id')
      .notNull()
      .references(() => designControlStructuredRecordVersions.id, {
        onDelete: 'restrict',
      }),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    decision: text('decision').notNull(),
    approvalRoleSnapshot: text('approval_role_snapshot').notNull(),
    actorUserId: integer('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    actorDisplayNameSnapshot: text('actor_display_name_snapshot').notNull(),
    actorRoleSnapshot: text('actor_role_snapshot').notNull(),
    actorCapabilitiesSnapshot: jsonb('actor_capabilities_snapshot')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    decisionComment: text('decision_comment'),
    signedAt: timestamp('signed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    decisionCheck: check(
      'dc_structured_decision_value_ck',
      sql`${table.decision} IN ('APPROVED','REJECTED','RETURNED')`
    ),
    reasonCheck: check(
      'dc_structured_decision_reason_ck',
      sql`${table.decision} = 'APPROVED' OR coalesce(length(btrim(${table.decisionComment})), 0) > 0`
    ),
    actorDecisionUnique: uniqueIndex('dc_structured_decision_actor_uq').on(
      table.versionId,
      table.actorUserId,
      table.decision
    ),
    projectIdx: index('dc_structured_decision_project_idx').on(
      table.rdProjectId,
      table.signedAt
    ),
  })
);

export const designControlStructuredRecordLinks = pgTable(
  'design_control_structured_record_links',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    designControlRecordId: uuid('design_control_record_id')
      .notNull()
      .references(() => designControlRecords.id, { onDelete: 'restrict' }),
    sourceRecordType: text('source_record_type').notNull(),
    sourceRecordId: uuid('source_record_id').notNull(),
    targetRecordType: text('target_record_type').notNull(),
    targetRecordId: text('target_record_id').notNull(),
    relationType: text('relation_type').notNull(),
    targetRevision: text('target_revision'),
    targetStatusSnapshot: text('target_status_snapshot'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdByUserId: integer('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdByDisplayName: text('created_by_display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceTypeCheck: check(
      'dc_structured_link_source_type_ck',
      sql`${table.sourceRecordType} IN ('REQUIREMENT','RISK','REVIEW','VERIFICATION','VALIDATION')`
    ),
    targetTypeCheck: check(
      'dc_structured_link_target_type_ck',
      sql`${table.targetRecordType} IN ('REQUIREMENT','RISK','REVIEW','REVIEW_ACTION','DESIGN_OUTPUT','CONFIGURATION_ITEM','PART_REVISION','VERIFICATION','VALIDATION','NCR','ECR','ECN','ENGINEERING_RELEASE')`
    ),
    linkUnique: uniqueIndex('dc_structured_link_uq').on(
      table.sourceRecordType,
      table.sourceRecordId,
      table.targetRecordType,
      table.targetRecordId,
      table.relationType
    ),
    projectIdx: index('dc_structured_link_project_idx').on(
      table.rdProjectId,
      table.sourceRecordType
    ),
  })
);

export const designControlReviewActions = pgTable(
  'design_control_review_actions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    designControlRecordId: uuid('design_control_record_id')
      .notNull()
      .references(() => designControlRecords.id, { onDelete: 'restrict' }),
    reviewRecordId: uuid('review_record_id').notNull(),
    actionNumber: text('action_number').notNull(),
    description: text('description').notNull(),
    ownerUserId: integer('owner_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    ownerDisplayName: text('owner_display_name').notNull(),
    dueDate: date('due_date').notNull(),
    status: text('status').notNull().default('OPEN'),
    mandatory: boolean('mandatory').notNull().default(true),
    rowVersion: integer('row_version').notNull().default(1),
    closureEvidence: jsonb('closure_evidence')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    closureApprovedByUserId: integer('closure_approved_by_user_id').references(
      () => users.id,
      { onDelete: 'restrict' }
    ),
    closureApprovedByDisplayName: text('closure_approved_by_display_name'),
    closureApprovedAt: timestamp('closure_approved_at', { withTimezone: true }),
    exceptionVersionId: uuid('exception_version_id').references(
      () => designControlStructuredRecordVersions.id,
      { onDelete: 'restrict' }
    ),
    createdByUserId: integer('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdByDisplayName: text('created_by_display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'dc_review_action_status_ck',
      sql`${table.status} IN ('OPEN','IN_PROGRESS','CLOSED','EXCEPTED')`
    ),
    actionNumberUnique: uniqueIndex('dc_review_action_number_uq').on(
      table.reviewRecordId,
      table.actionNumber
    ),
    projectIdx: index('dc_review_action_project_idx').on(
      table.rdProjectId,
      table.status
    ),
  })
);

export const designControlTraceabilitySnapshots = pgTable(
  'design_control_traceability_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    designControlRecordId: uuid('design_control_record_id')
      .notNull()
      .references(() => designControlRecords.id, { onDelete: 'restrict' }),
    snapshotStatus: text('snapshot_status').notNull().default('LOCKED'),
    matrixSnapshot: jsonb('matrix_snapshot')
      .$type<Record<string, unknown>>()
      .notNull(),
    matrixChecksum: text('matrix_checksum').notNull(),
    capturedByUserId: integer('captured_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    capturedByDisplayName: text('captured_by_display_name').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'dc_trace_snapshot_status_ck',
      sql`${table.snapshotStatus} = 'LOCKED'`
    ),
  })
);

export const designControlFinalReviewExceptions = pgTable(
  'design_control_final_review_exceptions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    designControlRecordId: uuid('design_control_record_id')
      .notNull()
      .references(() => designControlRecords.id, { onDelete: 'restrict' }),
    requirementKey: text('requirement_key').notNull(),
    justification: text('justification').notNull(),
    riskStatement: text('risk_statement').notNull(),
    approvingAuthorityUserId: integer('approving_authority_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    approvingAuthorityDisplayName: text(
      'approving_authority_display_name'
    ).notNull(),
    approvingRoleSnapshot: text('approving_role_snapshot').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    followUpAction: text('follow_up_action'),
    status: text('status').notNull().default('APPROVED'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'dc_final_review_exception_status_ck',
      sql`${table.status} IN ('APPROVED','EXPIRED','REVOKED')`
    ),
  })
);

export const designControlFinalReviewSnapshots = pgTable(
  'design_control_final_review_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rdProjectId: text('rd_project_id')
      .notNull()
      .references(() => rdProjects.id, { onDelete: 'restrict' }),
    designControlRecordId: uuid('design_control_record_id')
      .notNull()
      .references(() => designControlRecords.id, { onDelete: 'restrict' }),
    traceabilitySnapshotId: uuid('traceability_snapshot_id')
      .notNull()
      .references(() => designControlTraceabilitySnapshots.id, {
        onDelete: 'restrict',
      }),
    reviewRecordId: uuid('review_record_id').notNull(),
    reviewVersionId: uuid('review_version_id')
      .notNull()
      .references(() => designControlStructuredRecordVersions.id, {
        onDelete: 'restrict',
      }),
    readinessStatus: text('readiness_status').notNull(),
    readinessSnapshot: jsonb('readiness_snapshot')
      .$type<Record<string, unknown>>()
      .notNull(),
    readinessChecksum: text('readiness_checksum').notNull(),
    approvedByUserId: integer('approved_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    approvedByDisplayName: text('approved_by_display_name').notNull(),
    approvedRoleSnapshot: text('approved_role_snapshot').notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusCheck: check(
      'dc_final_review_snapshot_status_ck',
      sql`${table.readinessStatus} = 'COMPLETE'`
    ),
    reviewVersionUnique: uniqueIndex('dc_final_review_snapshot_review_uq').on(
      table.reviewVersionId
    ),
    recordIdx: index('dc_final_review_snapshot_record_idx').on(
      table.designControlRecordId,
      table.approvedAt
    ),
  })
);
