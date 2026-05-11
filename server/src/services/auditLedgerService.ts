/**
 * auditLedgerService — Task #85
 *
 * Unified, append-only, tamper-evident audit ledger.
 *
 * All compliance-relevant events (labor approvals, corrections,
 * certifications, period close, payroll export, burden application,
 * GL posting, procurement approvals, policy acknowledgments, etc.)
 * MUST flow through `recordAuditEvent()`.
 *
 * `recordAuditEvent()` writes to `public.audit_events` and:
 *   - takes a transactional advisory lock to serialize chain inserts,
 *   - looks up the previous chain head,
 *   - computes payload_hash, row_hash, sequence_number,
 *   - persists the row.
 *
 * The DB-level append-only trigger (see migration 0099) blocks any
 * UPDATE / DELETE on `audit_events` and records the tamper attempt.
 */

import crypto from 'crypto';
import { db } from '../../db';
import {
  auditEvents,
  auditAnchors,
  auditObjectRetentionPolicies,
  auditRetentionPolicies,
} from '../../schema';
import { sql, eq, desc, and, gte, lte, inArray, asc } from 'drizzle-orm';

/**
 * Minimal subset of `db` we use inside the chain writer; satisfied by both
 * the top-level `db` instance and a Drizzle transaction handle, so callers
 * inside a domain transaction can pass their `tx` and the audit row is
 * committed/rolled-back atomically with their domain writes.
 */
export type AuditLedgerTx = Pick<typeof db, 'execute' | 'select' | 'insert'>;

// Stable advisory-lock key — any constant int4 will do; we use a project tag.
const CHAIN_LOCK_KEY = 0x4544524c; // "EDRL"

/** Canonical-JSON-serializable values accepted by the ledger. */
export type AuditPayloadValue =
  | string
  | number
  | boolean
  | null
  | Date
  | AuditPayloadValue[]
  | { [k: string]: AuditPayloadValue };
export type AuditPayload = { [k: string]: AuditPayloadValue };

export type AuditEventInput = {
  /** Required: machine-readable event type (e.g. 'PAYROLL_EXPORT_CREATED'). */
  eventType: string;
  /** What the event is about (table name, domain noun). */
  subjectType: string;
  /** Identifier of the subject record. */
  subjectId: string;
  /** Service that emitted the event (e.g. 'payrollExport.service'). */
  sourceService: string;
  /** Optional actor performing the action. */
  actor?: { id?: number | null; username?: string | null; role?: string | null };
  /** When it occurred. Defaults to now(). */
  occurredAt?: Date;
  /** Free-form structured payload — included in the chain hash. */
  payload?: AuditPayload;
  /** Optional reason / justification text. */
  reason?: string | null;
  /** IP / user-agent context. */
  ipAddress?: string | null;
  userAgent?: string | null;
  /**
   * Legacy entity_type/entity_id mirrors. If omitted, falls back to
   * subjectType/subjectId so older read APIs keep working.
   */
  entityType?: string;
  entityId?: string;
  /** Legacy fields-changed map (for compat with logFieldChanges callers). */
  fieldsChanged?: Record<string, { before: unknown; after: unknown }> | null;
  /** Legacy meta blob (kept for back-compat read paths). */
  meta?: AuditPayload | null;
};

export type RecordedAuditEvent = {
  id: number;
  sequenceNumber: number;
  rowHash: string;
  prevHash: string;
  payloadHash: string;
};

/**
 * Canonicalize JSON to make hashes deterministic regardless of key order
 * (sorts object keys recursively; arrays preserved in order). Dates are
 * encoded as their ISO-8601 string.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') +
    '}'
  );
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

const GENESIS_HASH = '0'.repeat(64);

/**
 * Insert one event into the unified ledger with hash-chaining.
 *
 * `tx` is optional. When omitted, this function opens its own transaction.
 * **When called from inside a domain transaction (e.g. payroll export),
 * the caller MUST pass its `tx` handle** so the ledger row is committed
 * or rolled back atomically with the domain writes — there is no
 * orphan-evidence window.
 */
export async function recordAuditEvent(
  input: AuditEventInput,
  tx?: AuditLedgerTx,
): Promise<RecordedAuditEvent> {
  if (!input.eventType) throw new Error('AUDIT LEDGER: eventType required');
  if (!input.subjectType) throw new Error('AUDIT LEDGER: subjectType required');
  if (!input.subjectId) throw new Error('AUDIT LEDGER: subjectId required');
  if (!input.sourceService) throw new Error('AUDIT LEDGER: sourceService required');

  if (tx) return writeChainRow(input, tx);
  return await db.transaction(async (innerTx) => writeChainRow(input, innerTx));
}

async function writeChainRow(
  input: AuditEventInput,
  tx: AuditLedgerTx,
): Promise<RecordedAuditEvent> {
  const occurredAt = input.occurredAt ?? new Date();
  const payload: AuditPayload = input.payload ?? {};
  const payloadCanonical = canonicalize(payload);
  const payloadHash = sha256Hex(payloadCanonical);

  // Serialize chain inserts so prev_hash / sequence_number are monotonic.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`);

  const headRows = await tx
    .select({
      rowHash: auditEvents.rowHash,
      sequenceNumber: auditEvents.sequenceNumber,
    })
    .from(auditEvents)
    .where(sql`${auditEvents.sequenceNumber} IS NOT NULL`)
    .orderBy(desc(auditEvents.sequenceNumber))
    .limit(1);

  const prevHash = headRows[0]?.rowHash ?? GENESIS_HASH;
  const sequenceNumber = (headRows[0]?.sequenceNumber ?? 0) + 1;

  const rowHash = sha256Hex(
    [
      prevHash,
      payloadHash,
      occurredAt.toISOString(),
      input.eventType,
      input.subjectType,
      input.subjectId,
      String(sequenceNumber),
    ].join('|'),
  );

  const inserted = await tx
    .insert(auditEvents)
    .values({
      // legacy mirrors keep existing read paths working
      entityType: input.entityType ?? input.subjectType,
      entityId: input.entityId ?? input.subjectId,
      action: input.eventType,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.username ?? null,
      actorRole: input.actor?.role ?? null,
      reason: input.reason ?? null,
      fieldsChanged: input.fieldsChanged ?? null,
      meta: input.meta ?? {},
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      // unified ledger columns
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      payloadJson: payload,
      payloadHash,
      prevHash,
      rowHash,
      occurredAt,
      recordedAt: new Date(),
      sourceService: input.sourceService,
      sequenceNumber,
    })
    .returning({ id: auditEvents.id });

  if (!inserted[0]?.id) {
    throw new Error('AUDIT LEDGER: insert returned no id');
  }

  return {
    id: inserted[0].id,
    sequenceNumber,
    rowHash,
    prevHash,
    payloadHash,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Chain verifier
// ─────────────────────────────────────────────────────────────────────

export type ChainVerificationResult = {
  startSequence: number;
  endSequence: number;
  rowsChecked: number;
  ok: boolean;
  firstMismatchSequence?: number;
  firstMismatchEventId?: number;
  message?: string;
  headRowHash?: string;
};

/**
 * Walk a contiguous segment of the chain and recompute every row_hash.
 * Returns ok=false on first mismatch.
 *
 * If `fromSequence` is omitted the verifier starts at the beginning.
 * If `toSequence` is omitted it walks to the current head.
 */
export async function verifyChainSegment(
  fromSequence?: number,
  toSequence?: number,
  pageSize: number = 1000,
): Promise<ChainVerificationResult> {
  // Establish lower bound: previous row's hash (or GENESIS).
  // Anchor-aware: if the row immediately before `fromSequence` has been
  // archived, fall back to the most recent `audit_anchors` row at or below
  // `fromSequence - 1`.  This lets verification resume across archive gaps
  // without falsely reporting hash mismatches.
  let prevHash = GENESIS_HASH;
  let startSeq = 1;

  if (fromSequence && fromSequence > 1) {
    const lower = await db
      .select({ rowHash: auditEvents.rowHash, sequenceNumber: auditEvents.sequenceNumber })
      .from(auditEvents)
      .where(eq(auditEvents.sequenceNumber, fromSequence - 1))
      .limit(1);
    if (lower[0]?.rowHash) {
      prevHash = lower[0].rowHash;
      startSeq = fromSequence;
    } else {
      const anchor = await db
        .select({
          headRowHash: auditAnchors.headRowHash,
          headSequence: auditAnchors.headSequence,
        })
        .from(auditAnchors)
        .where(lte(auditAnchors.headSequence, fromSequence - 1))
        .orderBy(desc(auditAnchors.headSequence))
        .limit(1);
      if (anchor[0]?.headRowHash && anchor[0]?.headSequence != null) {
        prevHash = anchor[0].headRowHash;
        startSeq = anchor[0].headSequence + 1;
      }
    }
  }

  let cursor = startSeq;
  let rowsChecked = 0;
  let lastSeq = startSeq - 1;
  let lastRowHash = prevHash;

  while (true) {
    const upperCondition =
      toSequence != null
        ? and(
            gte(auditEvents.sequenceNumber, cursor),
            lte(auditEvents.sequenceNumber, toSequence),
          )
        : gte(auditEvents.sequenceNumber, cursor);

    const batch = await db
      .select({
        id: auditEvents.id,
        sequenceNumber: auditEvents.sequenceNumber,
        prevHash: auditEvents.prevHash,
        rowHash: auditEvents.rowHash,
        payloadHash: auditEvents.payloadHash,
        payloadJson: auditEvents.payloadJson,
        eventType: auditEvents.action,
        subjectType: auditEvents.subjectType,
        subjectId: auditEvents.subjectId,
        occurredAt: auditEvents.occurredAt,
      })
      .from(auditEvents)
      .where(upperCondition)
      .orderBy(asc(auditEvents.sequenceNumber))
      .limit(pageSize);

    if (batch.length === 0) break;

    for (const row of batch) {
      if (row.sequenceNumber == null) continue;
      const payloadForHash: AuditPayload =
        row.payloadJson && typeof row.payloadJson === 'object' && !Array.isArray(row.payloadJson)
          ? (row.payloadJson as AuditPayload)
          : {};
      const expectedPayloadHash = sha256Hex(canonicalize(payloadForHash));
      const occurredAtRaw: Date | string | null = row.occurredAt;
      const occurredAtDate =
        occurredAtRaw instanceof Date
          ? occurredAtRaw
          : occurredAtRaw != null
            ? new Date(occurredAtRaw)
            : new Date(0);
      const expectedRowHash = sha256Hex(
        [
          prevHash,
          expectedPayloadHash,
          occurredAtDate.toISOString(),
          row.eventType ?? '',
          row.subjectType ?? '',
          row.subjectId ?? '',
          String(row.sequenceNumber),
        ].join('|'),
      );

      if (
        expectedPayloadHash !== row.payloadHash ||
        expectedRowHash !== row.rowHash ||
        prevHash !== row.prevHash
      ) {
        return {
          startSequence: startSeq,
          endSequence: lastSeq,
          rowsChecked,
          ok: false,
          firstMismatchSequence: row.sequenceNumber,
          firstMismatchEventId: row.id,
          message: `Hash mismatch at sequence ${row.sequenceNumber}`,
          headRowHash: lastRowHash,
        };
      }

      prevHash = row.rowHash!;
      lastRowHash = row.rowHash!;
      lastSeq = row.sequenceNumber;
      rowsChecked += 1;
    }

    cursor = lastSeq + 1;
    if (batch.length < pageSize) break;
    if (toSequence != null && cursor > toSequence) break;
  }

  return {
    startSequence: startSeq,
    endSequence: lastSeq,
    rowsChecked,
    ok: true,
    headRowHash: lastRowHash,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Anchors
// ─────────────────────────────────────────────────────────────────────

/**
 * Persist a chain-head anchor — a tamper-evident checkpoint of the
 * current ledger head. Returns the inserted anchor record.
 */
export async function writeAnchor(opts: {
  notes?: string;
  createdBy?: string;
  exportedTo?: string;
} = {}) {
  const head = await db
    .select({
      id: auditEvents.id,
      rowHash: auditEvents.rowHash,
      sequenceNumber: auditEvents.sequenceNumber,
    })
    .from(auditEvents)
    .where(sql`${auditEvents.sequenceNumber} IS NOT NULL`)
    .orderBy(desc(auditEvents.sequenceNumber))
    .limit(1);

  const countRow = await db
    .select({ c: sql<number>`count(*)::bigint` })
    .from(auditEvents);

  const inserted = await db
    .insert(auditAnchors)
    .values({
      headEventId: head[0]?.id ?? null,
      headRowHash: head[0]?.rowHash ?? GENESIS_HASH,
      headSequence: head[0]?.sequenceNumber ?? 0,
      eventCount: Number(countRow[0]?.c ?? 0),
      notes: opts.notes ?? null,
      exportedTo: opts.exportedTo ?? null,
      createdBy: opts.createdBy ?? null,
    })
    .returning();

  return inserted[0];
}

export async function listAnchors(limit: number = 50) {
  return db
    .select()
    .from(auditAnchors)
    .orderBy(desc(auditAnchors.anchoredAt))
    .limit(limit);
}

// ─────────────────────────────────────────────────────────────────────
// Tamper-attempt drainer
// ─────────────────────────────────────────────────────────────────────

/**
 * Move undrained `audit_dml_attempts` rows into the unified hash-chained
 * ledger as `AUDIT_DML_BLOCKED` events. The attempts table is the durable
 * forensic sink (written via dblink from the trigger so it survives the
 * statement-aborting RAISE); the ledger row is the integrity-verifiable
 * mirror with sequence + hash. Idempotent: only undrained rows are touched
 * and `drained_at` is one-shot at the DB layer.
 */
export async function drainTamperAttempts(limit: number = 100): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT id, attempted_at, op, db_role, session_user_n, client_addr,
           application_nm, target_id, target_seq, payload
      FROM public.audit_dml_attempts
     WHERE drained_at IS NULL
     ORDER BY id ASC
     LIMIT ${limit}
  `)) as unknown as { rows: Array<Record<string, unknown>> };

  const list = (rows as { rows?: Array<Record<string, unknown>> }).rows
    ?? (rows as unknown as Array<Record<string, unknown>>);

  let drained = 0;
  for (const r of list) {
    const attemptId = Number(r.id);
    const attemptedAt = r.attempted_at instanceof Date
      ? r.attempted_at
      : new Date(String(r.attempted_at));

    const recorded = await recordAuditEvent({
      eventType: 'AUDIT_DML_BLOCKED',
      subjectType: 'audit_events',
      subjectId: r.target_id != null ? String(r.target_id) : 'unknown',
      sourceService: 'audit_trigger',
      occurredAt: attemptedAt,
      actor: {
        username: String(r.db_role ?? 'unknown'),
        role: 'db_role',
      },
      reason: `Tamper attempt blocked: ${String(r.op)} on audit_events`,
      ipAddress: r.client_addr != null ? String(r.client_addr) : null,
      payload: {
        attemptId,
        op: r.op,
        dbRole: r.db_role,
        sessionUser: r.session_user_n,
        applicationName: r.application_nm,
        targetId: r.target_id,
        targetSequence: r.target_seq,
        triggerPayload: r.payload,
      },
    });

    await db.execute(sql`
      UPDATE public.audit_dml_attempts
         SET drained_at = NOW(),
             drained_event_id = ${recorded.id}
       WHERE id = ${attemptId}
         AND drained_at IS NULL
    `);
    drained += 1;
  }
  return drained;
}

// ─────────────────────────────────────────────────────────────────────
// Scheduled chain verification
// ─────────────────────────────────────────────────────────────────────

export interface RecentChainVerification extends ChainVerificationResult {
  verifiedAt: Date;
  windowSize: number;
}

/**
 * Verify the most recent `windowSize` ledger entries (anchor-aware) and
 * return the verification result. Intended for scheduled use; callers
 * should alert (log + recordAuditEvent) when `ok === false`.
 */
export async function verifyRecentChain(
  windowSize: number = 5000,
): Promise<RecentChainVerification> {
  const head = await db
    .select({ seq: auditEvents.sequenceNumber })
    .from(auditEvents)
    .where(sql`${auditEvents.sequenceNumber} IS NOT NULL`)
    .orderBy(desc(auditEvents.sequenceNumber))
    .limit(1);

  const headSeq = head[0]?.seq ?? 0;
  const fromSeq = Math.max(1, headSeq - windowSize + 1);
  const result = await verifyChainSegment(fromSeq);
  return { ...result, verifiedAt: new Date(), windowSize };
}

// ─────────────────────────────────────────────────────────────────────
// Retention
// ─────────────────────────────────────────────────────────────────────

export async function getRetentionPolicies() {
  return db.select().from(auditRetentionPolicies);
}

export async function getObjectRetentionPolicies() {
  return db.select().from(auditObjectRetentionPolicies);
}

/** Default DCAA-aligned floor (years 7) in days. */
export const DCAA_RETENTION_FLOOR_DAYS = 2555;

/** Resolve retention floor for an event type, applying the global '*' default. */
export async function getRetentionFloorDays(eventType: string): Promise<number> {
  const rows = await db
    .select()
    .from(auditRetentionPolicies)
    .where(inArray(auditRetentionPolicies.eventType, [eventType, '*']));
  const specific = rows.find((r) => r.eventType === eventType);
  const def = rows.find((r) => r.eventType === '*');
  return Math.max(
    specific?.minRetentionDays ?? 0,
    def?.minRetentionDays ?? DCAA_RETENTION_FLOOR_DAYS,
  );
}

/** Resolve retention by governed object type (contract/cert/traveler/etc.). */
export async function getObjectRetentionFloorDays(objectType: string): Promise<number> {
  const rows = await db
    .select()
    .from(auditObjectRetentionPolicies)
    .where(eq(auditObjectRetentionPolicies.objectType, objectType));
  return Math.max(rows[0]?.minRetentionDays ?? 0, DCAA_RETENTION_FLOOR_DAYS);
}
