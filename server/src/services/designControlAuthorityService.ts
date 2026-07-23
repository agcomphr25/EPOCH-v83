import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  designControlRecords,
  designControlReleaseGate,
  designControlSteps,
  rdProjects,
} from '../../schema';
import { DESIGN_CONTROL_WORKFLOW } from '../../../shared/designControlWorkflow';
import { recordAuditEvent } from './auditLedgerService';

export type DesignControlActor = {
  id?: number | null;
  username: string;
  role?: string | null;
};

type DesignControlRequestMetadata = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type DesignControlAuthorityState =
  | 'NOT_INITIALIZED'
  | 'AUTHORITATIVE'
  | 'RECONCILIATION_REQUIRED'
  | 'SUPERSEDED_ONLY'
  | 'INVALID_STATE';

type Client = typeof db;

export function deriveDesignControlAuthorityState(
  records: Array<{ authorityStatus: string }>
): DesignControlAuthorityState {
  const authoritativeCount = records.filter(
    (record) => record.authorityStatus === 'authoritative'
  ).length;
  const reconciliationCount = records.filter(
    (record) => record.authorityStatus === 'reconciliation_required'
  ).length;

  if (records.length === 0) return 'NOT_INITIALIZED';
  if (authoritativeCount === 1 && reconciliationCount === 0)
    return 'AUTHORITATIVE';
  if (
    authoritativeCount === 0 &&
    records.every((record) => record.authorityStatus === 'superseded')
  ) {
    return 'SUPERSEDED_ONLY';
  }
  if (
    authoritativeCount === 0 &&
    (records.length > 1 || reconciliationCount > 0)
  ) {
    return 'RECONCILIATION_REQUIRED';
  }
  return 'INVALID_STATE';
}

export async function resolveDesignControlAuthority(
  projectId: string,
  client: Client = db
) {
  const [project] = await client
    .select()
    .from(rdProjects)
    .where(eq(rdProjects.id, projectId))
    .limit(1);
  if (!project) return null;

  const records = await client
    .select()
    .from(designControlRecords)
    .where(eq(designControlRecords.rdProjectId, projectId))
    .orderBy(asc(designControlRecords.createdAt), asc(designControlRecords.id));

  const authoritative = records.filter(
    (record) => record.authorityStatus === 'authoritative'
  );
  const state = deriveDesignControlAuthorityState(records);

  return {
    project,
    state,
    authoritativeRecord: state === 'AUTHORITATIVE' ? authoritative[0] : null,
    records,
    historicalRecords: records.filter(
      (record) => record.authorityStatus !== 'authoritative'
    ),
    allowedActions: {
      initialize: state === 'NOT_INITIALIZED',
      designate: records.length > 0 && (state !== 'AUTHORITATIVE' || records.length > 1),
      viewHistory: records.length > 0,
    },
  };
}

export async function initializeDesignControlForProject(
  input: {
    projectId: string;
    actor: DesignControlActor;
    title?: string;
    requestMetadata?: DesignControlRequestMetadata;
  },
  client: Client = db
) {
  return client.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.projectId}))`
    );
    const resolution = await resolveDesignControlAuthority(
      input.projectId,
      tx as Client
    );
    if (!resolution) return { status: 'project_not_found' as const };
    if (resolution.state === 'AUTHORITATIVE') {
      return { status: 'existing' as const, resolution };
    }
    if (resolution.records.length > 0) {
      return { status: 'conflict' as const, resolution };
    }

    const now = new Date();
    const [record] = await tx
      .insert(designControlRecords)
      .values({
        title:
          input.title?.trim() ||
          `${resolution.project.projectName} Design Control`,
        status: 'draft',
        authorityStatus: 'authoritative',
        designatedAuthoritativeAt: now,
        designatedAuthoritativeBy: input.actor.username,
        rdProjectId: input.projectId,
        metadata: {
          source: 'rd-project-design-control-initialize',
          approvalEvidenceVersion: 1,
          approvalMode: 'legacy_boolean_pending_phase_2b',
        },
      })
      .returning();

    for (const step of DESIGN_CONTROL_WORKFLOW) {
      await tx.insert(designControlSteps).values({
        recordId: record.id,
        stepKey: step.key,
        title: step.title,
        status: 'incomplete',
        rdProjectId: input.projectId,
        formData: {},
        checklist: {},
        approvals: {},
        attachments: [],
        metadata: {
          source: 'shared-design-control-workflow',
          workflowOrder: step.order,
          approvalMode: 'legacy_boolean_pending_phase_2b',
        },
      });
    }

    await tx.insert(designControlReleaseGate).values({
      recordId: record.id,
      rdProjectId: input.projectId,
      gateStatus: 'not_ready',
      formData: {},
      checklist: {},
      approvals: {},
      attachments: [],
      metadata: { source: 'rd-project-design-control-initialize' },
    });

    await recordAuditEvent(
      {
        eventType: 'DESIGN_CONTROL_INITIALIZED',
        subjectType: 'rd_project',
        subjectId: input.projectId,
        sourceService: 'designControlAuthorityService',
        actor: input.actor,
        ipAddress: input.requestMetadata?.ipAddress,
        userAgent: input.requestMetadata?.userAgent,
        reason: 'Initialize authoritative Design Control',
        fieldsChanged: {
          authorityState: { before: 'NOT_INITIALIZED', after: 'AUTHORITATIVE' },
          authoritativeRecordId: { before: null, after: record.id },
        },
        payload: {
          projectId: input.projectId,
          designControlRecordId: record.id,
          priorAuthorityState: 'NOT_INITIALIZED',
          resultingAuthorityState: 'AUTHORITATIVE',
        },
      },
      tx
    );

    return {
      status: 'created' as const,
      resolution: await resolveDesignControlAuthority(
        input.projectId,
        tx as Client
      ),
    };
  });
}

export async function designateAuthoritativeDesignControl(
  input: {
    projectId: string;
    recordId: string;
    reason: string;
    actor: DesignControlActor;
    requestMetadata?: DesignControlRequestMetadata;
  },
  client: Client = db
) {
  return client.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${input.projectId}))`
    );
    const before = await resolveDesignControlAuthority(
      input.projectId,
      tx as Client
    );
    if (!before) return { status: 'project_not_found' as const };
    const selected = before.records.find(
      (record) => record.id === input.recordId
    );
    if (!selected)
      return { status: 'record_not_in_project' as const, resolution: before };
    if (
      before.state === 'AUTHORITATIVE' &&
      before.authoritativeRecord?.id === input.recordId
    ) {
      return { status: 'existing' as const, resolution: before };
    }

    const now = new Date();
    await tx
      .update(designControlRecords)
      .set({
        authorityStatus: 'superseded',
        supersededAt: now,
        supersededBy: input.actor.username,
        supersessionReason: input.reason,
        supersededByRecordId: input.recordId,
        recordVersion: sql`${designControlRecords.recordVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(designControlRecords.rdProjectId, input.projectId),
          ne(designControlRecords.id, input.recordId),
          ne(designControlRecords.authorityStatus, 'superseded')
        )
      );

    await tx
      .update(designControlRecords)
      .set({
        authorityStatus: 'authoritative',
        designatedAuthoritativeAt: now,
        designatedAuthoritativeBy: input.actor.username,
        supersededAt: null,
        supersededBy: null,
        supersessionReason: null,
        supersededByRecordId: null,
        recordVersion: sql`${designControlRecords.recordVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(designControlRecords.id, input.recordId),
          eq(designControlRecords.rdProjectId, input.projectId)
        )
      );

    const after = await resolveDesignControlAuthority(
      input.projectId,
      tx as Client
    );
    await recordAuditEvent(
      {
        eventType: before.authoritativeRecord
          ? 'DESIGN_CONTROL_AUTHORITY_REPLACED'
          : 'DESIGN_CONTROL_AUTHORITY_DESIGNATED',
        subjectType: 'rd_project',
        subjectId: input.projectId,
        sourceService: 'designControlAuthorityService',
        actor: input.actor,
        ipAddress: input.requestMetadata?.ipAddress,
        userAgent: input.requestMetadata?.userAgent,
        reason: input.reason,
        fieldsChanged: {
          authorityState: {
            before: before.state,
            after: after?.state ?? 'INVALID_STATE',
          },
          authoritativeRecordId: {
            before: before.authoritativeRecord?.id ?? null,
            after: input.recordId,
          },
        },
        payload: {
          projectId: input.projectId,
          selectedRecordId: input.recordId,
          priorRecordIds: before.records.map((record) => record.id),
          priorAuthorityState: before.state,
          resultingAuthorityState: after?.state ?? 'INVALID_STATE',
        },
      },
      tx
    );

    return { status: 'designated' as const, resolution: after };
  });
}

export function isAuthoritativeDesignControlRecord(
  record: typeof designControlRecords.$inferSelect
) {
  return (
    Boolean(record.rdProjectId) && record.authorityStatus === 'authoritative'
  );
}
