/**
 * escalationService — Task #148 (Approval Escalation Engine, Phase 3)
 *
 * Single entry point for opening, approving, rejecting, and time-advancing
 * generalized approval requests. Override approvals, NCR dispositions,
 * scrap-over-threshold, quarantine release, and high-severity anomaly
 * approvals all call `openRequest()` to enter the chain. A scheduled job
 * (registered in server/index.ts) calls `escalateExpired(now)` once per
 * minute to advance any request whose level deadline has passed.
 *
 * Notification dispatch is pluggable: in-app via `notificationManager`,
 * email + SMS as no-op stubs that log. Replace those stubs with real
 * transports in a follow-up without touching this file.
 *
 * IMPORTANT — backstop policy: if the backstop level expires without a
 * decision, the request transitions to `EXPIRED` (NOT auto-approved). The
 * originating operation must treat EXPIRED as a structured rejection.
 */

import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  approvalRequestHistory,
  approvalRequests,
  approvalSignatureEvidence,
  escalationPolicies,
  users,
  type ApprovalRequest,
  type EscalationChainLevel,
  type EscalationPolicy,
} from '../../schema';
import { recordAuditEvent } from './auditLedgerService';
import { notificationManager } from './notificationManager';

const SOURCE = 'escalationService';

// ─── Notifier (pluggable) ────────────────────────────────────────────────────

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS';

export interface ApprovalNotification {
  approvalRequestId: string;
  requestType: string;
  level: number;
  approverRole: string | null;
  approverUserId: number | null;
  subjectType: string | null;
  subjectId: string | null;
  title: string;
  message: string;
  channels: NotificationChannel[];
  metadata?: Record<string, unknown>;
}

async function dispatchNotification(n: ApprovalNotification): Promise<void> {
  if (n.channels.includes('IN_APP')) {
    const targetUserIds = await resolveTargetUserIds(n.approverRole, n.approverUserId);
    notificationManager.sendToUsers(targetUserIds, {
      type: 'APPROVAL_REQUEST',
      title: n.title,
      message: n.message,
      data: {
        approvalRequestId: n.approvalRequestId,
        requestType: n.requestType,
        level: n.level,
        subjectType: n.subjectType,
        subjectId: n.subjectId,
        ...(n.metadata ?? {}),
      },
      timestamp: new Date().toISOString(),
    });
  }
  if (n.channels.includes('EMAIL')) {
    // Stub — wire to existing email infra in a follow-up. Logged so the
    // delivery attempt is traceable in dev / staging.
    console.log(
      `[escalationService] EMAIL notify (stub): role=${n.approverRole ?? '-'} ` +
        `user=${n.approverUserId ?? '-'} req=${n.approvalRequestId} "${n.title}"`,
    );
  }
  if (n.channels.includes('SMS')) {
    console.log(
      `[escalationService] SMS notify (stub): role=${n.approverRole ?? '-'} ` +
        `user=${n.approverUserId ?? '-'} req=${n.approvalRequestId} "${n.title}"`,
    );
  }
}

async function resolveTargetUserIds(
  role: string | null,
  pinnedUserId: number | null,
): Promise<number[]> {
  if (pinnedUserId != null) return [pinnedUserId];
  if (!role) return [];
  // Match users.role (the only currently-reliable mapping). The
  // previous perm_roles fallback was an uncorrelated join that
  // returned every active user whenever the role name existed in
  // perm_roles — that would broadcast approval notifications to
  // unauthorized recipients. When a richer role-membership table
  // (e.g. perm_user_roles) lands, extend this query to UNION on it.
  const direct = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, role)));
  return direct.map((r) => r.id);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface OpenRequestInput {
  requestType: string;
  payload?: Record<string, unknown>;
  subjectType?: string | null;
  subjectId?: string | null;
  requestedByUserId?: number | null;
  requestedByDisplayName: string;
  /** Optional summary for notifications. Defaults to a generic one-liner. */
  summary?: string;
}

export interface DecisionInput {
  approvalRequestId: string;
  approver: {
    userId?: number | null;
    displayName: string;
    /**
     * All roles the actor holds. The decision is allowed iff the actor is
     * the pinned `currentApproverUserId` OR one of these roles matches the
     * pinned `currentApproverRole` on the request. Passing the empty list
     * (or omitting) means the actor must be the pinned user.
     */
    roles?: string[];
    /**
     * If true, bypasses the approver role/user check. Reserved for
     * trusted internal callers (admin override, system jobs). Routes
     * MUST NOT set this from a request body; only set in code paths
     * that have already verified privilege.
     */
    isPrivilegedOverride?: boolean;
  };
  notes?: string | null;
  reasonCode?: string | null;
  signature?: string | null;
  signatureMeaning?: string | null;
  signatureReason?: string | null;
  signerUsername?: string | null;
  signerRole?: string | null;
  linkedObjectType?: string | null;
  linkedObjectId?: string | null;
  digitalSignatureId?: string | null;
}

interface ApprovalRequestRow {
  id: string;
  request_type: string;
  policy_id: number | null;
  status: string;
  current_approver_role: string | null;
  current_approver_user_id: number | null;
  escalation_level: number;
  current_level_deadline: Date | string | null;
  subject_type: string | null;
  subject_id: string | null;
  requested_by_user_id: number | null;
}

export class EscalationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'EscalationError';
  }
}

export async function openRequest(input: OpenRequestInput): Promise<ApprovalRequest> {
  if (!input.requestType) throw new EscalationError('INVALID', 'requestType required');
  if (!input.requestedByDisplayName)
    throw new EscalationError('INVALID', 'requestedByDisplayName required');

  const policy = await loadActivePolicy(input.requestType);
  if (!policy) {
    throw new EscalationError(
      'NO_POLICY',
      `No active escalation_policies row for requestType "${input.requestType}"`,
    );
  }
  const chain = parseChain(policy);
  if (chain.length === 0) {
    throw new EscalationError(
      'EMPTY_CHAIN',
      `Escalation policy for "${input.requestType}" has an empty chain`,
    );
  }

  const level0 = chain[0];
  const deadline = new Date(Date.now() + level0.slaSeconds * 1000);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(approvalRequests)
      .values({
        requestType: input.requestType,
        requestPayload: (input.payload ?? {}) as Record<string, unknown>,
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        requestedByUserId: input.requestedByUserId ?? null,
        requestedByDisplayName: input.requestedByDisplayName,
        status: 'PENDING',
        currentApproverRole: level0.role,
        currentApproverUserId: null,
        escalationLevel: 0,
        currentLevelDeadline: deadline,
        policyId: policy.id,
      })
      .returning();

    await tx.insert(approvalRequestHistory).values({
      approvalRequestId: created.id,
      event: 'OPENED',
      toLevel: 0,
      toStatus: 'PENDING',
      actorUserId: input.requestedByUserId ?? null,
      actorDisplayName: input.requestedByDisplayName,
      notes: input.summary ?? null,
      metadata: { role: level0.role, slaSeconds: level0.slaSeconds, deadline: deadline.toISOString() },
    });

    await recordAuditEvent(
      {
        eventType: 'APPROVAL_REQUEST_OPENED',
        subjectType: 'approval_request',
        subjectId: created.id,
        sourceService: SOURCE,
        actor: {
          id: input.requestedByUserId ?? null,
          username: input.requestedByDisplayName,
        },
        payload: {
          requestType: input.requestType,
          policyId: policy.id,
          subjectType: input.subjectType ?? null,
          subjectId: input.subjectId ?? null,
          firstApproverRole: level0.role,
          deadline: deadline.toISOString(),
        },
      },
      tx,
    );

    return created;
  }).then(async (created) => {
    await dispatchNotification({
      approvalRequestId: created.id,
      requestType: created.requestType,
      level: 0,
      approverRole: created.currentApproverRole,
      approverUserId: created.currentApproverUserId,
      subjectType: created.subjectType,
      subjectId: created.subjectId,
      title: `Approval needed: ${policy.displayName}`,
      message: input.summary ?? `New ${policy.displayName.toLowerCase()} request awaiting your review.`,
      channels: defaultChannelsForLevel(policy, 0),
    });
    return created;
  });
}

export async function approve(input: DecisionInput): Promise<ApprovalRequest> {
  return resolveDecision(input, 'APPROVED');
}

export async function reject(input: DecisionInput): Promise<ApprovalRequest> {
  return resolveDecision(input, 'REJECTED');
}

async function resolveDecision(
  input: DecisionInput,
  toStatus: 'APPROVED' | 'REJECTED',
): Promise<ApprovalRequest> {
  if (!input.approver?.displayName)
    throw new EscalationError('INVALID', 'approver.displayName required');

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, input.approvalRequestId))
      .for('update');
    if (!row) throw new EscalationError('NOT_FOUND', 'approval request not found');
    if (row.status !== 'PENDING') {
      throw new EscalationError(
        'NOT_PENDING',
        `approval request is ${row.status}, cannot be ${toStatus.toLowerCase()}d`,
      );
    }

    assertActorMayDecide(row, input.approver);

    const policy = row.policyId ? await loadPolicyById(row.policyId) : null;
    if (policy?.requiresSignature && toStatus === 'APPROVED' && !input.signature) {
      throw new EscalationError(
        'SIGNATURE_REQUIRED',
        `Policy "${row.requestType}" requires a signature on approval`,
      );
    }

    const now = new Date();
    const signatureMeaning =
      input.signatureMeaning?.trim() ||
      (toStatus === 'APPROVED'
        ? 'I approve this action and accept responsibility for the linked business object.'
        : 'I reject this action and record the reason for the linked business object.');
    const signatureReason =
      input.signatureReason?.trim() ||
      input.reasonCode?.trim() ||
      input.notes?.trim() ||
      `${row.requestType} ${toStatus.toLowerCase()} decision`;
    const signerUsername =
      input.signerUsername?.trim() ||
      input.approver.displayName;
    const signerRole =
      input.signerRole?.trim() ||
      row.currentApproverRole ||
      input.approver.roles?.[0] ||
      'APPROVER';
    const linkedObjectType =
      input.linkedObjectType?.trim() ||
      row.subjectType ||
      'approval_request';
    const linkedObjectId =
      input.linkedObjectId?.trim() ||
      row.subjectId ||
      row.id;

    const [updated] = await tx
      .update(approvalRequests)
      .set({
        status: toStatus,
        resolvedAt: now,
        resolvedByUserId: input.approver.userId ?? null,
        resolvedByDisplayName: input.approver.displayName,
        resolutionNotes: input.notes ?? null,
        resolutionReasonCode: input.reasonCode ?? null,
        resolutionSignature: input.signature ?? null,
        signatureMeaning,
        signatureReason,
        signerUsername,
        signerRole,
        signatureLinkedObjectType: linkedObjectType,
        signatureLinkedObjectId: linkedObjectId,
        digitalSignatureId: input.digitalSignatureId ?? null,
        updatedAt: now,
      })
      .where(eq(approvalRequests.id, row.id))
      .returning();

    await tx.insert(approvalSignatureEvidence).values({
      approvalRequestId: row.id,
      decisionStatus: toStatus,
      signatureMeaning,
      signatureReason,
      signerUserId: input.approver.userId ?? null,
      signerUsername,
      signerRole,
      linkedObjectType,
      linkedObjectId,
      digitalSignatureId: input.digitalSignatureId ?? null,
      recordedAt: now,
    });

    await tx.insert(approvalRequestHistory).values({
      approvalRequestId: row.id,
      event: toStatus,
      fromLevel: row.escalationLevel,
      toLevel: row.escalationLevel,
      fromStatus: row.status,
      toStatus,
      actorUserId: input.approver.userId ?? null,
      actorDisplayName: input.approver.displayName,
      notes: input.notes ?? null,
      metadata: {
        reasonCode: input.reasonCode ?? null,
        hasSignature: !!input.signature,
        signatureMeaning,
        signatureReason,
        signerUsername,
        signerRole,
        linkedObjectType,
        linkedObjectId,
        digitalSignatureId: input.digitalSignatureId ?? null,
      },
    });

    await recordAuditEvent(
      {
        eventType: toStatus === 'APPROVED' ? 'APPROVAL_REQUEST_APPROVED' : 'APPROVAL_REQUEST_REJECTED',
        subjectType: 'approval_request',
        subjectId: row.id,
        sourceService: SOURCE,
        actor: {
          id: input.approver.userId ?? null,
          username: signerUsername,
          role: signerRole,
        },
        reason: input.notes ?? null,
        payload: {
          requestType: row.requestType,
          level: row.escalationLevel,
          reasonCode: input.reasonCode ?? null,
          signature: {
            meaning: signatureMeaning,
            reason: signatureReason,
            signerUsername,
            signerRole,
            signedAt: now.toISOString(),
            digitalSignatureId: input.digitalSignatureId ?? null,
          },
          linkedObject: {
            type: linkedObjectType,
            id: linkedObjectId,
          },
        },
      },
      tx,
    );

    return updated;
  });
}

export async function cancel(
  approvalRequestId: string,
  by: {
    userId?: number | null;
    displayName: string;
    isPrivilegedOverride?: boolean;
  },
  notes?: string,
): Promise<ApprovalRequest> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approvalRequestId))
      .for('update');
    if (!row) throw new EscalationError('NOT_FOUND', 'approval request not found');
    if (row.status !== 'PENDING') {
      throw new EscalationError('NOT_PENDING', `approval is ${row.status}; cannot cancel`);
    }
    // Default-deny: a request may only be cancelled by a privileged
    // caller (admin/owner — gated at the route layer) OR by the
    // original requester whose identity we can prove. If either side
    // is missing (anonymous actor or pre-portal request without a
    // requestedByUserId) we refuse rather than allow.
    if (!by.isPrivilegedOverride) {
      if (by.userId == null || row.requestedByUserId == null) {
        throw new EscalationError(
          'FORBIDDEN',
          'cancel requires a privileged caller or a verifiable original requester',
        );
      }
      if (row.requestedByUserId !== by.userId) {
        throw new EscalationError(
          'FORBIDDEN',
          'only the original requester may cancel this approval',
        );
      }
    }
    const now = new Date();
    const [updated] = await tx
      .update(approvalRequests)
      .set({
        status: 'CANCELLED',
        resolvedAt: now,
        resolvedByUserId: by.userId ?? null,
        resolvedByDisplayName: by.displayName,
        resolutionNotes: notes ?? null,
        updatedAt: now,
      })
      .where(eq(approvalRequests.id, row.id))
      .returning();
    await tx.insert(approvalRequestHistory).values({
      approvalRequestId: row.id,
      event: 'CANCELLED',
      fromStatus: row.status,
      toStatus: 'CANCELLED',
      fromLevel: row.escalationLevel,
      toLevel: row.escalationLevel,
      actorUserId: by.userId ?? null,
      actorDisplayName: by.displayName,
      notes: notes ?? null,
    });
    return updated;
  });
}

/**
 * Advance any PENDING request whose current level's deadline has elapsed.
 * Returns counts for observability. Idempotent: if no row is overdue it
 * returns zeros; safe to run from multiple instances because each row is
 * locked `FOR UPDATE SKIP LOCKED`.
 */
export async function escalateExpired(now: Date = new Date()): Promise<{
  examined: number;
  escalated: number;
  expired: number;
}> {
  const candidates = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.status, 'PENDING'),
        lte(approvalRequests.currentLevelDeadline, now),
      ),
    )
    .limit(500);

  let escalated = 0;
  let expired = 0;
  for (const { id } of candidates) {
    const result = await advanceOne(id, now);
    if (result === 'ESCALATED') escalated += 1;
    else if (result === 'EXPIRED') expired += 1;
  }
  return { examined: candidates.length, escalated, expired };
}

async function advanceOne(
  approvalRequestId: string,
  now: Date,
): Promise<'ESCALATED' | 'EXPIRED' | 'NOOP'> {
  return db.transaction(async (tx) => {
    // Re-read under FOR UPDATE SKIP LOCKED so concurrent schedulers do not
    // double-advance the same row.
    const locked = await tx.execute<ApprovalRequestRow>(sql`
      SELECT * FROM approval_requests
       WHERE id = ${approvalRequestId}
         AND status = 'PENDING'
         AND current_level_deadline <= ${now}
       FOR UPDATE SKIP LOCKED
    `);
    // node-postgres returns { rows }; some drizzle drivers return the array
    // directly. Handle both shapes with a typed view rather than `any`.
    const lockedRows: ApprovalRequestRow[] = Array.isArray(locked)
      ? (locked as ApprovalRequestRow[])
      : ((locked as { rows?: ApprovalRequestRow[] }).rows ?? []);
    const row = lockedRows[0];
    if (!row) return 'NOOP';

    const policy = row.policy_id ? await loadPolicyById(row.policy_id) : null;
    const chain = policy ? parseChain(policy) : [];
    const currentLevel = Number(row.escalation_level ?? 0);
    const nextLevel = currentLevel + 1;
    const next = chain[nextLevel];
    const wasBackstop = chain[currentLevel]?.isBackstop === true;

    if (!next || wasBackstop) {
      // No further levels (or we just timed out the backstop). Mark EXPIRED.
      await tx
        .update(approvalRequests)
        .set({
          status: 'EXPIRED',
          resolvedAt: now,
          resolutionNotes: wasBackstop
            ? 'Backstop approver did not act within SLA — request expired'
            : 'Escalation chain exhausted — request expired',
          updatedAt: now,
        })
        .where(eq(approvalRequests.id, approvalRequestId));
      await tx.insert(approvalRequestHistory).values({
        approvalRequestId,
        event: 'EXPIRED',
        fromLevel: currentLevel,
        toLevel: currentLevel,
        fromStatus: 'PENDING',
        toStatus: 'EXPIRED',
        actorDisplayName: 'system:escalationJob',
        notes: wasBackstop ? 'backstop expired' : 'chain exhausted',
      });
      await recordAuditEvent(
        {
          eventType: 'APPROVAL_REQUEST_EXPIRED',
          subjectType: 'approval_request',
          subjectId: approvalRequestId,
          sourceService: SOURCE,
          actor: { username: 'system:escalationJob', role: 'system' },
          payload: { requestType: row.request_type, level: currentLevel, wasBackstop },
        },
        tx,
      );
      // Notify the requester so the originating operation can react.
      if (row.requested_by_user_id != null) {
        notificationManager.sendToUser(Number(row.requested_by_user_id), {
          type: 'APPROVAL_REQUEST_EXPIRED',
          title: 'Approval request expired',
          message: `Your ${row.request_type} request was not actioned in time and has been rejected.`,
          data: { approvalRequestId },
          timestamp: now.toISOString(),
        });
      }
      return 'EXPIRED';
    }

    // Advance to the next level.
    const newDeadline = new Date(now.getTime() + next.slaSeconds * 1000);
    await tx
      .update(approvalRequests)
      .set({
        escalationLevel: nextLevel,
        currentApproverRole: next.role,
        currentApproverUserId: null,
        currentLevelDeadline: newDeadline,
        updatedAt: now,
      })
      .where(eq(approvalRequests.id, approvalRequestId));

    await tx.insert(approvalRequestHistory).values({
      approvalRequestId,
      event: 'ESCALATED',
      fromLevel: currentLevel,
      toLevel: nextLevel,
      fromStatus: 'PENDING',
      toStatus: 'PENDING',
      actorDisplayName: 'system:escalationJob',
      notes: `Auto-escalated to level ${nextLevel} (${next.role})`,
      metadata: {
        previousRole: chain[currentLevel]?.role ?? null,
        newRole: next.role,
        slaSeconds: next.slaSeconds,
        deadline: newDeadline.toISOString(),
        isBackstop: !!next.isBackstop,
      },
    });

    await recordAuditEvent(
      {
        eventType: 'APPROVAL_REQUEST_ESCALATED',
        subjectType: 'approval_request',
        subjectId: approvalRequestId,
        sourceService: SOURCE,
        actor: { username: 'system:escalationJob', role: 'system' },
        payload: {
          requestType: row.request_type,
          fromLevel: currentLevel,
          toLevel: nextLevel,
          newRole: next.role,
          deadline: newDeadline.toISOString(),
          isBackstop: !!next.isBackstop,
        },
      },
      tx,
    );

    // Fire notification AFTER tx commits — we do it here pre-commit in this
    // simple model; the scheduled job tolerates duplicate notifications.
    void dispatchNotification({
      approvalRequestId,
      requestType: row.request_type,
      level: nextLevel,
      approverRole: next.role,
      approverUserId: null,
      subjectType: row.subject_type ?? null,
      subjectId: row.subject_id ?? null,
      title: next.isBackstop
        ? `BACKSTOP approval needed: ${policy?.displayName ?? row.request_type}`
        : `Escalated approval: ${policy?.displayName ?? row.request_type}`,
      message: `Request escalated to level ${nextLevel} (${next.role}) after no decision at the prior level.`,
      channels: defaultChannelsForLevel(policy, nextLevel),
    });

    if (row.requested_by_user_id != null) {
      notificationManager.sendToUser(Number(row.requested_by_user_id), {
        type: 'APPROVAL_REQUEST_ESCALATED',
        title: 'Approval request escalated',
        message: `Your ${row.request_type} request is now waiting on ${next.role}.`,
        data: { approvalRequestId, level: nextLevel },
        timestamp: now.toISOString(),
      });
    }

    return 'ESCALATED';
  });
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listInboxFor(opts: {
  userId?: number | null;
  roles?: string[];
  status?: string;
  limit?: number;
}) {
  const status = opts.status ?? 'PENDING';
  const conds = [eq(approvalRequests.status, status)];
  const userOrRole: any[] = [];
  if (opts.userId != null) {
    userOrRole.push(eq(approvalRequests.currentApproverUserId, opts.userId));
  }
  if (opts.roles && opts.roles.length > 0) {
    userOrRole.push(inArray(approvalRequests.currentApproverRole, opts.roles));
  }
  if (userOrRole.length > 0) {
    conds.push(or(...userOrRole)!);
  }
  const limit = Math.min(opts.limit ?? 200, 500);
  return db
    .select()
    .from(approvalRequests)
    .where(and(...conds))
    .orderBy(asc(approvalRequests.currentLevelDeadline))
    .limit(limit);
}

export async function getRequest(id: string) {
  const [row] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id));
  if (!row) return null;
  const history = await db
    .select()
    .from(approvalRequestHistory)
    .where(eq(approvalRequestHistory.approvalRequestId, id))
    .orderBy(asc(approvalRequestHistory.occurredAt));
  const policy = row.policyId ? await loadPolicyById(row.policyId) : null;
  return { request: row, history, policy };
}

export async function listPolicies(): Promise<EscalationPolicy[]> {
  return db.select().from(escalationPolicies).orderBy(asc(escalationPolicies.requestType));
}

export async function upsertPolicy(input: {
  id?: number;
  requestType: string;
  displayName: string;
  description?: string | null;
  chain: EscalationChainLevel[];
  requiresSignature?: boolean;
  reasonCodes?: string[];
  isActive?: boolean;
  actor: { userId?: number | null; displayName: string };
}): Promise<EscalationPolicy> {
  if (!input.chain.length) throw new EscalationError('INVALID', 'chain must not be empty');
  return db.transaction(async (tx) => {
    let row: EscalationPolicy;
    if (input.id) {
      const [updated] = await tx
        .update(escalationPolicies)
        .set({
          requestType: input.requestType,
          displayName: input.displayName,
          description: input.description ?? null,
          chain: input.chain,
          requiresSignature: input.requiresSignature ?? false,
          reasonCodes: input.reasonCodes ?? [],
          isActive: input.isActive ?? true,
          updatedAt: new Date(),
        })
        .where(eq(escalationPolicies.id, input.id))
        .returning();
      row = updated;
    } else {
      const [inserted] = await tx
        .insert(escalationPolicies)
        .values({
          requestType: input.requestType,
          displayName: input.displayName,
          description: input.description ?? null,
          chain: input.chain,
          requiresSignature: input.requiresSignature ?? false,
          reasonCodes: input.reasonCodes ?? [],
          isActive: input.isActive ?? true,
        })
        .returning();
      row = inserted;
    }
    await recordAuditEvent(
      {
        eventType: input.id ? 'ESCALATION_POLICY_UPDATED' : 'ESCALATION_POLICY_CREATED',
        subjectType: 'escalation_policy',
        subjectId: String(row.id),
        sourceService: SOURCE,
        actor: { id: input.actor.userId ?? null, username: input.actor.displayName },
        payload: {
          requestType: row.requestType,
          chain: input.chain,
          requiresSignature: input.requiresSignature ?? false,
          reasonCodes: input.reasonCodes ?? [],
          isActive: input.isActive ?? true,
        },
      },
      tx,
    );
    return row;
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadActivePolicy(requestType: string): Promise<EscalationPolicy | null> {
  const [row] = await db
    .select()
    .from(escalationPolicies)
    .where(and(eq(escalationPolicies.requestType, requestType), eq(escalationPolicies.isActive, true)))
    .limit(1);
  return row ?? null;
}

async function loadPolicyById(id: number): Promise<EscalationPolicy | null> {
  const [row] = await db.select().from(escalationPolicies).where(eq(escalationPolicies.id, id)).limit(1);
  return row ?? null;
}

/**
 * Throws FORBIDDEN unless the actor is the pinned approver user OR holds
 * the role assigned to the request's current level. Reserved override
 * (`isPrivilegedOverride`) bypasses the check; routes must never set this
 * from request bodies.
 */
function assertActorMayDecide(
  row: ApprovalRequest,
  approver: DecisionInput['approver'],
): void {
  if (approver.isPrivilegedOverride) return;
  if (
    row.currentApproverUserId != null &&
    approver.userId != null &&
    row.currentApproverUserId === approver.userId
  ) {
    return;
  }
  if (row.currentApproverRole && approver.roles && approver.roles.length > 0) {
    if (approver.roles.includes(row.currentApproverRole)) return;
  }
  throw new EscalationError(
    'FORBIDDEN',
    `actor ${approver.displayName} is not the assigned approver (role=${row.currentApproverRole ?? '-'})`,
  );
}

export function parseChain(policy: EscalationPolicy): EscalationChainLevel[] {
  const raw = policy.chain;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((level: any) => ({
      role: String(level?.role ?? ''),
      slaSeconds: Number(level?.slaSeconds ?? 0),
      isBackstop: !!level?.isBackstop,
    }))
    .filter((l) => l.role && l.slaSeconds > 0);
}

function defaultChannelsForLevel(
  policy: EscalationPolicy | null,
  level: number,
): NotificationChannel[] {
  const channels: NotificationChannel[] = ['IN_APP', 'EMAIL'];
  // High-severity requests escalate fast → SMS once we hit level 2+.
  if (policy?.requestType === 'ANOMALY_HIGH_SEVERITY' && level >= 1) {
    channels.push('SMS');
  }
  return channels;
}
