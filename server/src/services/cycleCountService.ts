/**
 * Cycle Count Service — Task #142
 *
 * Implements blind cycle counts with segregation of duties (counter ≠ approver
 * ≠ poster, unless ADMIN/OWNER) and posts approved variances through the
 * immutable inventory ledger via recordInventoryLedgerEntry().
 *
 * Status flow:
 *   SCHEDULED → IN_PROGRESS → PENDING_REVIEW → APPROVED → POSTED
 *                                            ↘
 *                                              CANCELLED
 *
 * Posting writes one COUNT_ADJUSTMENT ledger row per non-zero variance line
 * with source_module = 'cycle_count' and source_record_id = `${sessionId}:${lineId}`.
 */

import crypto from 'crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  cycleCountSessions,
  cycleCountLines,
  cycleCountVariancePolicies,
  inventoryItems,
  inventoryBalances,
  materialLots,
  type CycleCountSession,
  type CycleCountLine,
  type CycleCountVariancePolicy,
} from '../../schema';
import { recordInventoryLedgerEntry } from './inventoryTransactionLedgerService';

export type Actor = {
  userId: number | null;
  username: string;
  role?: string;
};

export type SessionWithLines = CycleCountSession & {
  lines: CycleCountLine[];
  variancePolicy?: CycleCountVariancePolicy | null;
};

const ELEVATED_ROLES = new Set(['ADMIN', 'OWNER']);

function isElevated(actor: Actor | undefined): boolean {
  return !!actor?.role && ELEVATED_ROLES.has(actor.role);
}

function makeSessionNumber(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CC-${stamp}-${suffix}`;
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function variancePassesTolerance(
  variance: number,
  expected: number,
  policy: CycleCountVariancePolicy | null,
): boolean {
  if (!policy) return variance === 0;
  const absVar = Math.abs(variance);
  const qtyTol = toNum(policy.qtyTolerance);
  const pctTol = toNum(policy.percentTolerance);
  if (absVar <= qtyTol) return true;
  if (expected > 0 && pctTol > 0) {
    const pct = (absVar / expected) * 100;
    if (pct <= pctTol) return true;
  }
  return false;
}

export async function getDefaultVariancePolicy(): Promise<CycleCountVariancePolicy | null> {
  const [p] = await db.select().from(cycleCountVariancePolicies).where(eq(cycleCountVariancePolicies.isDefault, true));
  return p ?? null;
}

export async function listVariancePolicies(): Promise<CycleCountVariancePolicy[]> {
  return db.select().from(cycleCountVariancePolicies).orderBy(asc(cycleCountVariancePolicies.name));
}

export async function createVariancePolicy(
  input: {
    name: string;
    description?: string;
    qtyTolerance: number;
    percentTolerance: number;
    autoApproveWithinTolerance?: boolean;
    requiresDualApproval?: boolean;
    isDefault?: boolean;
  },
  actor: Actor,
): Promise<CycleCountVariancePolicy> {
  const [policy] = await db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx.update(cycleCountVariancePolicies).set({ isDefault: false }).where(eq(cycleCountVariancePolicies.isDefault, true));
    }
    return tx.insert(cycleCountVariancePolicies).values({
      name: input.name,
      description: input.description ?? null,
      qtyTolerance: String(input.qtyTolerance),
      percentTolerance: String(input.percentTolerance),
      autoApproveWithinTolerance: input.autoApproveWithinTolerance ?? true,
      requiresDualApproval: input.requiresDualApproval ?? false,
      isDefault: input.isDefault ?? false,
      createdByUserId: actor.userId ?? null,
    }).returning();
  });
  return policy;
}

// ── Session lifecycle ──────────────────────────────────────────────────────

export type CreateSessionInput = {
  location: string;
  partFilter?: string | null;
  countType?: 'CYCLE' | 'FULL' | 'SPOT' | 'ABC';
  scheduledFor?: Date | null;
  blindCount?: boolean;
  variancePolicyId?: string | null;
  notes?: string | null;
};

export async function createSession(input: CreateSessionInput, actor: Actor): Promise<SessionWithLines> {
  if (!input.location?.trim()) throw httpErr(400, 'location is required');
  const countType = input.countType ?? 'CYCLE';

  const policy = input.variancePolicyId
    ? await db.select().from(cycleCountVariancePolicies).where(eq(cycleCountVariancePolicies.id, input.variancePolicyId)).then(r => r[0] ?? null)
    : await getDefaultVariancePolicy();

  type SeedLine = {
    lotId: string | null;
    agPartNumber: string;
    materialName: string | null;
    expectedQty: number;
    inventoryItemId: number | null;
  };

  const byPart = new Map<string, SeedLine>();

  if (countType === 'FULL') {
    const trimmedPartFilter = input.partFilter?.trim();
    const itemWhere = trimmedPartFilter
      ? and(sql`${inventoryItems.isActive} IS NOT FALSE`, eq(inventoryItems.agPartNumber, trimmedPartFilter))
      : sql`${inventoryItems.isActive} IS NOT FALSE`;
    const balanceWhere = input.location !== 'ALL'
      ? eq(inventoryBalances.locationId, input.location)
      : undefined;

    const balanceRows = await db
      .select({
        agPartNumber: inventoryBalances.agPartNumber,
        quantityOnHand: sql<string>`COALESCE(SUM(${inventoryBalances.quantityOnHand}), 0)`,
      })
      .from(inventoryBalances)
      .where(balanceWhere)
      .groupBy(inventoryBalances.agPartNumber);
    const balanceByPart = new Map(balanceRows.map(row => [row.agPartNumber, toNum(row.quantityOnHand)]));

    const itemRows = await db
      .select({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        onHand: inventoryItems.onHand,
        quantityInStock: inventoryItems.quantityInStock,
        available: inventoryItems.available,
      })
      .from(inventoryItems)
      .where(itemWhere)
      .orderBy(asc(inventoryItems.agPartNumber));

    for (const item of itemRows) {
      const balanceQty = balanceByPart.get(item.agPartNumber);
      const legacyQty = toNum(item.onHand ?? item.quantityInStock ?? item.available ?? 0);
      byPart.set(item.agPartNumber, {
        lotId: null,
        agPartNumber: item.agPartNumber,
        materialName: item.name,
        expectedQty: balanceQty ?? (input.location === 'ALL' ? legacyQty : 0),
        inventoryItemId: item.id,
      });
    }
  } else {

  // Pre-populate expected quantities from material_lots (active lots only) at the
  // requested location, optionally filtered by part number prefix.
  const activeStatuses = ['RECEIVED', 'ACCEPTED', 'ISSUED', 'QUARANTINE'];
  const conditions = [inArray(materialLots.status, activeStatuses)];
  if (input.location !== 'ALL') conditions.push(eq(materialLots.storageLocation, input.location));
  if (input.partFilter && input.partFilter.trim()) {
    conditions.push(eq(materialLots.materialPartNumber, input.partFilter.trim()));
  }

  // Group active lots per part to get expected qty rollup. We also track lot ids
  // (lowest-id lot used as the canonical lot for ledger linkage when posting).
  const lotRows = await db
    .select({
      lotId: materialLots.id,
      agPartNumber: materialLots.materialPartNumber,
      materialName: materialLots.materialName,
      remainingQty: materialLots.remainingQty,
      inventoryItemId: materialLots.inventoryItemId,
    })
    .from(materialLots)
    .where(and(...conditions))
    .orderBy(asc(materialLots.materialPartNumber), desc(materialLots.remainingQty));

  // Group by part — keep first (largest) lot id as canonical
  for (const l of lotRows) {
    const k = l.agPartNumber;
    const cur = byPart.get(k);
    const qty = toNum(l.remainingQty);
    if (cur) {
      cur.expectedQty += qty;
    } else {
      byPart.set(k, {
        lotId: l.lotId,
        agPartNumber: l.agPartNumber,
        materialName: l.materialName,
        expectedQty: qty,
        inventoryItemId: l.inventoryItemId,
      });
    }
  }
  }

  return await db.transaction(async (tx) => {
    const [session] = await tx.insert(cycleCountSessions).values({
      sessionNumber: makeSessionNumber(),
      status: input.scheduledFor ? 'SCHEDULED' : 'IN_PROGRESS',
      countType,
      location: input.location,
      partFilter: input.partFilter ?? null,
      scheduledFor: input.scheduledFor ?? null,
      blindCount: input.blindCount ?? true,
      variancePolicyId: policy?.id ?? null,
      notes: input.notes ?? null,
      createdBy: actor.username,
      createdByUserId: actor.userId ?? null,
    }).returning();

    const linesPayload = Array.from(byPart.values()).map(g => ({
      sessionId: session.id,
      inventoryItemId: g.inventoryItemId,
      lotId: g.lotId,
      agPartNumber: g.agPartNumber,
      materialName: g.materialName,
      expectedQty: g.expectedQty.toFixed(4),
      countedQty: null,
      varianceQty: null,
      approvalStatus: null,
      notes: null,
    }));

    const lines = linesPayload.length
      ? await tx.insert(cycleCountLines).values(linesPayload).returning()
      : [];

    return { ...session, lines, variancePolicy: policy };
  });
}

export async function listSessions(filter?: { status?: string }): Promise<CycleCountSession[]> {
  const where = filter?.status ? [eq(cycleCountSessions.status, filter.status)] : [];
  if (where.length) {
    return db.select().from(cycleCountSessions).where(and(...where)).orderBy(desc(cycleCountSessions.createdAt));
  }
  return db.select().from(cycleCountSessions).orderBy(desc(cycleCountSessions.createdAt));
}

/**
 * getSession enforces blind-count rules. When the session is in IN_PROGRESS and
 * blindCount is true, expectedQty is hidden from non-elevated callers UNLESS
 * `revealExpected` is explicitly true (e.g. for approvers/posters reviewing).
 */
export async function getSession(
  id: number,
  actor: Actor,
  opts?: { revealExpected?: boolean },
): Promise<SessionWithLines | null> {
  const [sess] = await db.select().from(cycleCountSessions).where(eq(cycleCountSessions.id, id));
  if (!sess) return null;
  const lines = await db.select().from(cycleCountLines).where(eq(cycleCountLines.sessionId, id));
  const policy = sess.variancePolicyId
    ? await db.select().from(cycleCountVariancePolicies).where(eq(cycleCountVariancePolicies.id, sess.variancePolicyId)).then(r => r[0] ?? null)
    : null;

  const blindActive = sess.blindCount && sess.status === 'IN_PROGRESS' && !opts?.revealExpected && !isElevated(actor);
  const safeLines = blindActive
    ? lines.map(l => ({ ...l, expectedQty: '0' as any, varianceQty: null }))
    : lines;

  return { ...sess, lines: safeLines, variancePolicy: policy };
}

export async function startSession(id: number, actor: Actor): Promise<SessionWithLines> {
  const [updated] = await db.update(cycleCountSessions)
    .set({
      status: 'IN_PROGRESS',
      performedByUserId: actor.userId ?? null,
      performedByDisplayName: actor.username,
      performedAt: new Date(),
    })
    .where(and(eq(cycleCountSessions.id, id), eq(cycleCountSessions.status, 'SCHEDULED')))
    .returning();
  if (!updated) throw httpErr(409, 'Session is not in SCHEDULED state');
  return (await getSession(id, actor, { revealExpected: false }))!;
}

export type RecordCountInput = { lineId: number; countedQty: number; notes?: string };

export async function recordCounts(sessionId: number, inputs: RecordCountInput[], actor: Actor): Promise<SessionWithLines> {
  return await db.transaction(async (tx) => {
    const [sess] = await tx.select().from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId)).for('update');
    if (!sess) throw httpErr(404, 'Session not found');
    if (sess.status === 'SCHEDULED') {
      // Auto-start when first count is recorded
      await tx.update(cycleCountSessions).set({
        status: 'IN_PROGRESS',
        performedByUserId: actor.userId ?? null,
        performedByDisplayName: actor.username,
        performedAt: new Date(),
      }).where(eq(cycleCountSessions.id, sessionId));
    } else if (sess.status !== 'IN_PROGRESS') {
      throw httpErr(409, `Cannot record counts in status ${sess.status}`);
    } else if (sess.performedByUserId == null) {
      // First counter claims the session
      await tx.update(cycleCountSessions).set({
        performedByUserId: actor.userId ?? null,
        performedByDisplayName: actor.username,
        performedAt: new Date(),
      }).where(eq(cycleCountSessions.id, sessionId));
    }

    const policy = sess.variancePolicyId
      ? await tx.select().from(cycleCountVariancePolicies).where(eq(cycleCountVariancePolicies.id, sess.variancePolicyId)).then(r => r[0] ?? null)
      : await tx.select().from(cycleCountVariancePolicies).where(eq(cycleCountVariancePolicies.isDefault, true)).then(r => r[0] ?? null);

    for (const u of inputs) {
      if (!Number.isFinite(u.countedQty) || u.countedQty < 0) {
        throw httpErr(400, `countedQty must be a non-negative finite number (line ${u.lineId})`);
      }
      const [line] = await tx.select().from(cycleCountLines).where(and(eq(cycleCountLines.id, u.lineId), eq(cycleCountLines.sessionId, sessionId)));
      if (!line) continue;
      const expected = toNum(line.expectedQty);
      const variance = u.countedQty - expected;
      const within = variancePassesTolerance(variance, expected, policy);
      const approvalStatus = within && policy?.autoApproveWithinTolerance ? 'AUTO_APPROVED' : (variance === 0 ? 'AUTO_APPROVED' : 'PENDING');
      await tx.update(cycleCountLines).set({
        countedQty: u.countedQty.toFixed(4),
        varianceQty: variance.toFixed(4),
        varianceWithinTolerance: within,
        approvalStatus,
        countedByUserId: actor.userId ?? null,
        countedByDisplayName: actor.username,
        countedAt: new Date(),
        notes: u.notes ?? line.notes,
      }).where(eq(cycleCountLines.id, u.lineId));
    }

    return (await getSessionInTx(tx, sessionId, actor, true))!;
  });
}

export async function submitForReview(sessionId: number, actor: Actor): Promise<SessionWithLines> {
  return await db.transaction(async (tx) => {
    const [sess] = await tx.select().from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId)).for('update');
    if (!sess) throw httpErr(404, 'Session not found');
    if (sess.status !== 'IN_PROGRESS') throw httpErr(409, 'Only IN_PROGRESS sessions can be submitted');

    const lines = await tx.select().from(cycleCountLines).where(eq(cycleCountLines.sessionId, sessionId));
    const counted = lines.filter(l => l.countedQty != null);
    if (counted.length === 0) throw httpErr(400, 'No counts have been recorded');

    await tx.update(cycleCountSessions).set({ status: 'PENDING_REVIEW' }).where(eq(cycleCountSessions.id, sessionId));
    return (await getSessionInTx(tx, sessionId, actor, true))!;
  });
}

export async function approveSession(sessionId: number, actor: Actor): Promise<SessionWithLines> {
  return await db.transaction(async (tx) => {
    const [sess] = await tx.select().from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId)).for('update');
    if (!sess) throw httpErr(404, 'Session not found');
    if (sess.status !== 'PENDING_REVIEW') throw httpErr(409, 'Only PENDING_REVIEW sessions can be approved');

    // Segregation of duties: approver ≠ counter (unless elevated)
    if (!isElevated(actor) && sess.performedByUserId != null && actor.userId != null && sess.performedByUserId === actor.userId) {
      throw httpErr(403, 'Segregation of duties: the approver cannot be the same person who performed the count');
    }

    await tx.update(cycleCountSessions).set({
      status: 'APPROVED',
      approvedByUserId: actor.userId ?? null,
      approvedByDisplayName: actor.username,
      approvedAt: new Date(),
    }).where(eq(cycleCountSessions.id, sessionId));

    // Mark all PENDING lines APPROVED on session approval
    await tx.update(cycleCountLines).set({ approvalStatus: 'APPROVED' })
      .where(and(eq(cycleCountLines.sessionId, sessionId), eq(cycleCountLines.approvalStatus, 'PENDING')));

    return (await getSessionInTx(tx, sessionId, actor, true))!;
  });
}

export async function cancelSession(sessionId: number, actor: Actor, reason?: string): Promise<CycleCountSession> {
  const [sess] = await db.select().from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId));
  if (!sess) throw httpErr(404, 'Session not found');
  if (sess.status === 'POSTED') throw httpErr(409, 'Posted sessions cannot be cancelled');
  const [updated] = await db.update(cycleCountSessions).set({
    status: 'CANCELLED',
    notes: reason ? `${sess.notes ?? ''}\n[CANCELLED by ${actor.username}]: ${reason}`.trim() : sess.notes,
  }).where(eq(cycleCountSessions.id, sessionId)).returning();
  return updated;
}

/**
 * postSession — posts approved variances to the immutable inventory ledger.
 * Each non-zero variance line emits one COUNT_ADJUSTMENT ledger entry with
 * source_module='cycle_count'. Material lot remaining_qty is updated atomically
 * with each entry within the same transaction.
 *
 * Segregation of duties: poster ≠ counter AND poster ≠ approver, unless
 * the actor holds an elevated role (ADMIN/OWNER).
 */
export async function postSession(sessionId: number, actor: Actor): Promise<SessionWithLines> {
  return await db.transaction(async (tx) => {
    const [sess] = await tx.select().from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId)).for('update');
    if (!sess) throw httpErr(404, 'Session not found');
    if (sess.status === 'POSTED') {
      // idempotent — return current
      return (await getSessionInTx(tx, sessionId, actor, true))!;
    }
    if (sess.status !== 'APPROVED') {
      throw httpErr(409, 'Session must be APPROVED before posting');
    }

    if (!isElevated(actor) && actor.userId != null) {
      if (sess.performedByUserId === actor.userId) {
        throw httpErr(403, 'Segregation of duties: the poster cannot be the same person who performed the count');
      }
      if (sess.approvedByUserId === actor.userId) {
        throw httpErr(403, 'Segregation of duties: the poster cannot be the same person who approved the session');
      }
    }

    const lines = await tx.select().from(cycleCountLines).where(eq(cycleCountLines.sessionId, sessionId));

    for (const line of lines) {
      if (line.countedQty == null) continue;
      const variance = toNum(line.varianceQty);
      if (variance === 0) continue;
      if (line.approvalStatus === 'REJECTED') continue;

      // Resolve canonical inventoryItemId (denormalized on line, fallback to lookup by ag_part_number)
      let itemId = line.inventoryItemId;
      if (itemId == null) {
        const [item] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.agPartNumber, line.agPartNumber));
        if (!item) throw httpErr(409, `Inventory item not found for part ${line.agPartNumber}`);
        itemId = item.id;
      }

      // Determine quantityBefore — prefer the lot remaining qty; else fall back to inventory_balances rollup.
      let qtyBefore = 0;
      let lotForLedger: string | null = line.lotId ?? null;
      if (lotForLedger) {
        const [lot] = await tx.select({ id: materialLots.id, remainingQty: materialLots.remainingQty }).from(materialLots).where(eq(materialLots.id, lotForLedger)).for('update');
        if (lot) {
          qtyBefore = toNum(lot.remainingQty);
        } else {
          lotForLedger = null;
        }
      }
      if (!lotForLedger) {
        const [bal] = await tx.select({ q: sql<number>`SUM(${inventoryBalances.quantityOnHand})` }).from(inventoryBalances).where(eq(inventoryBalances.agPartNumber, line.agPartNumber));
        qtyBefore = toNum(bal?.q as any);
      }

      const qtyAfter = qtyBefore + variance;
      if (qtyAfter < 0) {
        throw httpErr(409, `Cannot post: posting variance ${variance} for ${line.agPartNumber} would yield negative quantity (${qtyAfter})`);
      }

      const ledgerRow = await recordInventoryLedgerEntry({
        transactionType: 'COUNT_ADJUSTMENT',
        inventoryItemId: itemId,
        agPartNumber: line.agPartNumber,
        lotId: lotForLedger,
        locationId: sess.location && sess.location !== 'ALL' ? sess.location : null,
        quantityDelta: variance.toFixed(4),
        quantityBefore: qtyBefore.toFixed(4),
        quantityAfter: qtyAfter.toFixed(4),
        performedByUserId: actor.userId ?? null,
        performedByDisplayName: actor.username,
        approvedByUserId: sess.approvedByUserId ?? null,
        approvedByDisplayName: sess.approvedByDisplayName ?? null,
        reasonCode: 'CYCLE_COUNT',
        notes: `Cycle count session ${sess.sessionNumber ?? '#' + sess.id} line ${line.id}${line.notes ? ': ' + line.notes : ''}`,
        sourceModule: 'cycle_count',
        sourceRecordId: `${sessionId}:${line.id}`,
        metadata: {
          sessionId,
          lineId: line.id,
          countedBy: line.countedByDisplayName,
          expectedQty: toNum(line.expectedQty),
          countedQty: toNum(line.countedQty),
        },
      }, tx as any);

      // Update material lot remaining_qty if we have a lot
      if (lotForLedger) {
        await tx.update(materialLots).set({ remainingQty: qtyAfter.toFixed(4), updatedAt: new Date() }).where(eq(materialLots.id, lotForLedger));
      }

      // Persist ledger linkage on the line
      await tx.update(cycleCountLines).set({ ledgerEntryId: ledgerRow.id }).where(eq(cycleCountLines.id, line.id));
    }

    await tx.update(cycleCountSessions).set({
      status: 'POSTED',
      postedByUserId: actor.userId ?? null,
      postedByDisplayName: actor.username,
      postedAt: new Date(),
    }).where(eq(cycleCountSessions.id, sessionId));

    return (await getSessionInTx(tx, sessionId, actor, true))!;
  });
}

export async function listVarianceHistory(limit: number = 100): Promise<Array<CycleCountLine & { sessionNumber: string | null; postedAt: Date | null }>> {
  const rows = await db
    .select({
      line: cycleCountLines,
      sessionNumber: cycleCountSessions.sessionNumber,
      postedAt: cycleCountSessions.postedAt,
    })
    .from(cycleCountLines)
    .innerJoin(cycleCountSessions, eq(cycleCountLines.sessionId, cycleCountSessions.id))
    .where(eq(cycleCountSessions.status, 'POSTED'))
    .orderBy(desc(cycleCountSessions.postedAt))
    .limit(limit);
  return rows.map(r => ({ ...r.line, sessionNumber: r.sessionNumber, postedAt: r.postedAt }));
}

// ── Internals ──────────────────────────────────────────────────────────────

async function getSessionInTx(tx: any, id: number, actor: Actor, revealExpected: boolean): Promise<SessionWithLines | null> {
  const [sess] = await tx.select().from(cycleCountSessions).where(eq(cycleCountSessions.id, id));
  if (!sess) return null;
  const lines = await tx.select().from(cycleCountLines).where(eq(cycleCountLines.sessionId, id));
  const policy = sess.variancePolicyId
    ? await tx.select().from(cycleCountVariancePolicies).where(eq(cycleCountVariancePolicies.id, sess.variancePolicyId)).then((r: any[]) => r[0] ?? null)
    : null;
  const blindActive = sess.blindCount && sess.status === 'IN_PROGRESS' && !revealExpected && !isElevated(actor);
  const safeLines = blindActive
    ? lines.map((l: any) => ({ ...l, expectedQty: '0', varianceQty: null }))
    : lines;
  return { ...sess, lines: safeLines, variancePolicy: policy };
}

function httpErr(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
