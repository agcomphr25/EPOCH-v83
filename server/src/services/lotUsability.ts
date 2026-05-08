import { db } from '../../db';
import { materialLots, materialLotTransactions, type MaterialLot } from '../../schema';
import { eq } from 'drizzle-orm';

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
 * Computes effective accumulated out-time including any time elapsed since
 * lastOutAt while the lot is currentlyOutOfStorage. Does not mutate the lot.
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
 * Pure check — does NOT write to the DB. Returns whether a lot is usable
 * for issue/consume/reserve actions based on shelf-life rules.
 *
 * - status === 'LOCKED' → STATUS_LOCKED
 * - expirationDate in the past → EXPIRED
 * - effective out-time >= maxOutTimeMinutes → OUT_TIME_EXCEEDED
 */
export function checkLotUsability(lot: MaterialLot, now: Date = new Date()): LotUsabilityResult {
  if (lot.status === 'LOCKED') {
    return {
      usable: false,
      status: 'STATUS_LOCKED',
      message: lot.lockedReason ?? 'Lot is locked by shelf-life policy',
    };
  }
  if (lot.expirationDate && new Date(lot.expirationDate) < now) {
    return {
      usable: false,
      status: 'EXPIRED',
      message: `Material lot expired on ${new Date(lot.expirationDate).toLocaleDateString()}`,
    };
  }
  const effective = computeEffectiveOutTimeMinutes(lot);
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
 * Persists a LOCKED status onto the lot if usability check fails for a
 * reason other than STATUS_LOCKED. Best-effort — returns the (possibly
 * refreshed) lot and the usability result.
 */
export async function enforceAndLockIfNeeded(
  lot: MaterialLot,
  performedBy: string = 'system'
): Promise<{ lot: MaterialLot; usability: LotUsabilityResult }> {
  const usability = checkLotUsability(lot);
  if (usability.usable || usability.status === 'STATUS_LOCKED') {
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
