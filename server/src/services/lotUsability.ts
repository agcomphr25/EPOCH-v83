import { db } from '../../db';
import { materialLots, materialLotTransactions, type MaterialLot } from '../../schema';
import { and, desc, eq, inArray } from 'drizzle-orm';

export type LotLockReason =
  | 'EXPIRED'
  | 'OUT_TIME_EXCEEDED'
  | 'STATUS_LOCKED';

export interface LotUsabilityResult {
  usable: boolean;
  status: 'OK' | LotLockReason;
  message?: string;
  effectiveOutTimeMinutes?: number;
}

/**
 * Sentinel/garbage date guard. Some legacy receiving rows and migration
 * defaults stamped placeholder dates (epoch 1970, year 0001, etc.).  Treat
 * any expirationDate before Y2K as a non-real value rather than auto-locking
 * the lot as expired — the lock would be a false positive driven by bad
 * source data, not a real shelf-life event.
 */
export function isSentinelExpirationDate(d: Date): boolean {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return true;
  return d.getUTCFullYear() < 2000;
}

/**
 * Synchronous, naive computation: adds (now − lastOutAt) to totalOutTimeMinutes
 * whenever currentlyOutOfStorage is true.  This is the legacy behavior and
 * is the source of false-positive OUT_TIME_EXCEEDED locks when a return-to-
 * storage event silently failed and left currentlyOutOfStorage=true.
 *
 * Prefer {@link computeEffectiveOutTimeMinutesSafe} on any code path that
 * makes a lock/usability decision.
 */
export function computeEffectiveOutTimeMinutes(lot: Pick<MaterialLot, 'totalOutTimeMinutes' | 'currentlyOutOfStorage' | 'lastOutAt'>): number {
  const base = lot.totalOutTimeMinutes ?? 0;
  if (lot.currentlyOutOfStorage && lot.lastOutAt) {
    const additional = Math.floor((Date.now() - new Date(lot.lastOutAt).getTime()) / 60000);
    return base + Math.max(0, additional);
  }
  return base;
}

/**
 * Returns true iff the most recent OUT_START / OUT_END transaction on this
 * lot is OUT_START — i.e. the lot is genuinely out of storage on a tracked
 * issue session.  Used to defend against stale `currentlyOutOfStorage=true`
 * flags left over from a return-to-storage path that crashed mid-write.
 */
export async function hasOpenOutTransaction(lotId: string): Promise<boolean> {
  const rows = await db
    .select({
      transactionType: materialLotTransactions.transactionType,
      createdAt: materialLotTransactions.createdAt,
    })
    .from(materialLotTransactions)
    .where(
      and(
        eq(materialLotTransactions.materialLotId, lotId),
        inArray(materialLotTransactions.transactionType, ['OUT_START', 'OUT_END'])
      )
    )
    .orderBy(desc(materialLotTransactions.createdAt))
    .limit(1);
  return rows[0]?.transactionType === 'OUT_START';
}

/**
 * Defensive variant of {@link computeEffectiveOutTimeMinutes}.  Only
 * accumulates in-flight minutes when there is a matching open OUT_START
 * transaction; otherwise we treat the `currentlyOutOfStorage=true` flag as
 * stale state from a failed return-to-storage write and ignore it.  This
 * is what the lock decision must use — without this guard a single failed
 * RETURN write turns into a permanent OUT_TIME_EXCEEDED lock the next time
 * an operator scans the lot.
 */
export async function computeEffectiveOutTimeMinutesSafe(
  lot: Pick<MaterialLot, 'id' | 'totalOutTimeMinutes' | 'currentlyOutOfStorage' | 'lastOutAt'>,
  now: Date = new Date()
): Promise<number> {
  const base = lot.totalOutTimeMinutes ?? 0;
  if (!lot.currentlyOutOfStorage || !lot.lastOutAt) return base;
  const open = await hasOpenOutTransaction(lot.id);
  if (!open) return base;
  const additional = Math.floor((now.getTime() - new Date(lot.lastOutAt).getTime()) / 60000);
  return base + Math.max(0, additional);
}

export interface CheckLotUsabilityOptions {
  now?: Date;
  /** Override for the effective out-time minutes. Pass the safe-computed value to avoid double work. */
  effectiveOutTimeMinutes?: number;
}

/**
 * Pure check — does NOT write to the DB and does NOT query the DB. Returns
 * whether a lot is usable for issue/consume/reserve actions based on
 * shelf-life rules.
 *
 * - status === 'LOCKED' → STATUS_LOCKED
 * - expirationDate in the past (and not a sentinel) → EXPIRED
 * - effective out-time >= maxOutTimeMinutes → OUT_TIME_EXCEEDED
 *
 * Callers that have read transaction history should pass
 * `effectiveOutTimeMinutes` from {@link computeEffectiveOutTimeMinutesSafe}.
 * Callers that haven't will fall back to the naive sync compute, which is
 * still safe but can yield false-positive OUT_TIME_EXCEEDED if the lot has
 * a stale currentlyOutOfStorage flag.
 */
export function checkLotUsability(
  lot: MaterialLot,
  opts: CheckLotUsabilityOptions | Date = {}
): LotUsabilityResult {
  // Backwards-compat: callers used to pass `now: Date` as the second arg.
  const options: CheckLotUsabilityOptions = opts instanceof Date ? { now: opts } : opts;
  const now = options.now ?? new Date();

  if (lot.status === 'LOCKED') {
    return {
      usable: false,
      status: 'STATUS_LOCKED',
      message: lot.lockedReason ?? 'Lot is locked by shelf-life policy',
    };
  }
  if (lot.expirationDate) {
    const expDate = new Date(lot.expirationDate);
    if (!isSentinelExpirationDate(expDate) && expDate < now) {
      return {
        usable: false,
        status: 'EXPIRED',
        message: `Material lot expired on ${expDate.toLocaleDateString()}`,
      };
    }
  }
  const effective = options.effectiveOutTimeMinutes ?? computeEffectiveOutTimeMinutes(lot);
  if (lot.maxOutTimeMinutes != null && lot.maxOutTimeMinutes > 0 && effective >= lot.maxOutTimeMinutes) {
    return {
      usable: false,
      status: 'OUT_TIME_EXCEEDED',
      message: `Out-time exceeded: ${effective} of ${lot.maxOutTimeMinutes} minutes used`,
      effectiveOutTimeMinutes: effective,
    };
  }
  return { usable: true, status: 'OK', effectiveOutTimeMinutes: effective };
}

/**
 * Async wrapper that uses {@link computeEffectiveOutTimeMinutesSafe} so the
 * lock decision is never driven by a stale currentlyOutOfStorage flag.
 * This is the function every lock-decision path should call.
 */
export async function checkLotUsabilitySafe(
  lot: MaterialLot,
  now: Date = new Date()
): Promise<LotUsabilityResult> {
  if (lot.status === 'LOCKED') return checkLotUsability(lot, { now });
  const effective = await computeEffectiveOutTimeMinutesSafe(lot, now);
  return checkLotUsability(lot, { now, effectiveOutTimeMinutes: effective });
}

export interface EnforceLockOptions {
  /**
   * When false (read paths), the function returns the usability decision
   * but does NOT persist `status='LOCKED'` to the lot row.  When true
   * (write paths — consume/issue/reserve), the lock is persisted as before.
   *
   * Persisting LOCKED on the validate read-path is the trap that turns a
   * transient miscalculation into a permanent block on the lot — see
   * Task #174.  The validate endpoint must always pass `persist: false`.
   */
  persist?: boolean;
}

/**
 * Persists a LOCKED status onto the lot if usability check fails for a
 * reason other than STATUS_LOCKED. Best-effort — returns the (possibly
 * refreshed) lot and the usability result.
 *
 * Pass `{ persist: false }` from read-only paths (e.g. /validate) so a
 * transient bad reading does not write a permanent LOCKED status.
 */
export async function enforceAndLockIfNeeded(
  lot: MaterialLot,
  performedBy: string = 'system',
  options: EnforceLockOptions = {}
): Promise<{ lot: MaterialLot; usability: LotUsabilityResult }> {
  const usability = await checkLotUsabilitySafe(lot);
  if (usability.usable || usability.status === 'STATUS_LOCKED') {
    return { lot, usability };
  }

  // Read-path callers must NOT persist LOCKED — the lock is decided
  // strictly by write paths (consume / issue / reserve) so a transient
  // misread on the validate endpoint cannot strand the lot. See Task #174.
  if (options.persist === false) {
    return { lot, usability };
  }

  // Capture additional out-time accumulated while currentlyOutOfStorage so
  // historical totals remain accurate after the lock.
  const effective = usability.effectiveOutTimeMinutes ?? lot.totalOutTimeMinutes ?? 0;

  const [updated] = await db
    .update(materialLots)
    .set({
      status: 'LOCKED',
      lockedReason: usability.message ?? usability.status,
      lockedAt: new Date(),
      totalOutTimeMinutes: effective,
      currentlyOutOfStorage: false,
      updatedAt: new Date(),
    })
    .where(eq(materialLots.id, lot.id))
    .returning();

  await db.insert(materialLotTransactions).values({
    materialLotId: lot.id,
    internalControlNumber: lot.internalControlNumber,
    transactionType: 'LOCK',
    qtyBefore: lot.remainingQty,
    qtyAfter: lot.remainingQty,
    performedBy,
    reason: usability.status,
    notes: usability.message ?? null,
    wasOverride: false,
  });

  return { lot: updated ?? lot, usability };
}
