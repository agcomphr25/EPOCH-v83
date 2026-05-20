/**
 * Task #174 — One-shot remediation for material lots that were wrongly
 * auto-locked by the validate-route lock writer.
 *
 * Background: prior to this task, GET /api/material-lots/validate/:icn would
 * call enforceAndLockIfNeeded with persist:true, which writes status='LOCKED'
 * onto the row.  Two underlying bugs caused false positives:
 *
 *   1. computeEffectiveOutTimeMinutes accumulated (now − lastOutAt) whenever
 *      currentlyOutOfStorage=true, so any lot that had a return-to-storage
 *      event silently fail (leaving the flag set) would rack up in-flight
 *      minutes on every scan and eventually trip OUT_TIME_EXCEEDED.
 *   2. Sentinel/garbage expirationDate values (epoch 1970, year 0001) made
 *      lots auto-EXPIRE.
 *
 * After Task #174:
 *   - The validate route no longer persists LOCKED.
 *   - lotUsability uses computeEffectiveOutTimeMinutesSafe + sentinel guard.
 *
 * This script finds lots whose status='LOCKED' and whose lockedReason is
 * EXPIRED or OUT_TIME_EXCEEDED, re-evaluates them under the new safe logic,
 * and restores the ones that are actually usable.  An UNLOCK transaction is
 * written for each restored lot so DCAA evidence is preserved.
 *
 * Usage:
 *   npx tsx server/scripts/restoreFalseLockedMaterialLots.ts            # dry run
 *   npx tsx server/scripts/restoreFalseLockedMaterialLots.ts --apply    # write changes
 *   npx tsx server/scripts/restoreFalseLockedMaterialLots.ts --apply --icn mfg-18-721-1
 *   npx tsx server/scripts/restoreFalseLockedMaterialLots.ts --output ./report.json
 */

import { db } from '../db';
import { materialLots, materialLotTransactions } from '../schema';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { checkLotUsabilitySafe } from '../src/services/lotUsability';
import * as fs from 'fs';

/**
 * Inspect transaction history to figure out what status the lot held just
 * before the LOCK transaction was written.  We map status-bearing transaction
 * types back to the lifecycle status they represent and pick the most recent
 * one prior to LOCK.  Falls back to ACCEPTED for empty history (lot was QC'd
 * and idle) and CONSUMED if the remaining qty is now zero.
 */
async function derivePriorStatus(
  lotId: string,
  remainingQty: number,
  lockedAt: Date | null
): Promise<'ACCEPTED' | 'ISSUED' | 'CONSUMED' | 'RECEIVED'> {
  if (remainingQty <= 0) return 'CONSUMED';

  const cutoff = lockedAt ?? new Date();
  const rows = await db
    .select({
      transactionType: materialLotTransactions.transactionType,
      createdAt: materialLotTransactions.createdAt,
    })
    .from(materialLotTransactions)
    .where(
      and(
        eq(materialLotTransactions.materialLotId, lotId),
        sql`${materialLotTransactions.createdAt} < ${cutoff}`,
        inArray(materialLotTransactions.transactionType, [
          'ACCEPT', 'ISSUE', 'RETURN', 'OUT_END', 'OUT_START', 'RECEIVE', 'PAUSE', 'RESUME',
        ])
      )
    )
    .orderBy(desc(materialLotTransactions.createdAt))
    .limit(1);

  const last = rows[0]?.transactionType;
  switch (last) {
    case 'ISSUE':
    case 'OUT_START':
    case 'RESUME':
      return 'ISSUED';
    case 'RETURN':
    case 'OUT_END':
    case 'PAUSE':
    case 'ACCEPT':
      return 'ACCEPTED';
    case 'RECEIVE':
      return 'RECEIVED';
    default:
      return 'ACCEPTED';
  }
}

interface RestoreEntry {
  lotId: string;
  internalControlNumber: string;
  prevStatus: 'LOCKED';
  newStatus: string;
  prevLockedReason: string | null;
  decision: 'restored' | 'still_locked' | 'skipped';
  reason?: string;
  effectiveOutTimeMinutes?: number;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const icnArg = (() => {
    const i = args.indexOf('--icn');
    return i !== -1 ? args[i + 1] : null;
  })();
  const outputArg = (() => {
    const i = args.indexOf('--output');
    return i !== -1 ? args[i + 1] : null;
  })();

  console.log(`[restoreFalseLockedMaterialLots] mode=${apply ? 'APPLY' : 'DRY-RUN'}${icnArg ? ` icn=${icnArg}` : ''}`);

  // Find LOCKED lots whose lock reason was a shelf-life trigger.  We match on
  // the human message stored in locked_reason ("Out-time exceeded: …",
  // "Material lot expired on …") as well as the bare enum strings, since the
  // field has always been free-text.
  let query = db
    .select()
    .from(materialLots)
    .where(
      and(
        eq(materialLots.status, 'LOCKED'),
        isNotNull(materialLots.lockedReason),
        sql`(${materialLots.lockedReason} ILIKE '%out-time%'
          OR ${materialLots.lockedReason} ILIKE '%out_time%'
          OR ${materialLots.lockedReason} ILIKE '%expired%'
          OR ${materialLots.lockedReason} = 'OUT_TIME_EXCEEDED'
          OR ${materialLots.lockedReason} = 'EXPIRED')`
      )
    );

  const candidates = await query;
  let scoped = candidates;
  if (icnArg) {
    scoped = candidates.filter(
      (l) => l.internalControlNumber.toLowerCase() === icnArg.toLowerCase()
    );
  }

  console.log(`[restoreFalseLockedMaterialLots] candidates=${candidates.length}${icnArg ? ` (filtered to ${scoped.length} for ICN=${icnArg})` : ''}`);

  const report: RestoreEntry[] = [];

  for (const lot of scoped) {
    // Re-evaluate under the safe logic, but first temporarily un-LOCK the
    // status so the LOCKED short-circuit doesn't fire.  We're not writing
    // anything yet — this is just an in-memory copy.
    const evalLot = { ...lot, status: 'ACCEPTED' as const };
    const usability = await checkLotUsabilitySafe(evalLot);

    if (!usability.usable) {
      report.push({
        lotId: lot.id,
        internalControlNumber: lot.internalControlNumber,
        prevStatus: 'LOCKED',
        newStatus: 'LOCKED',
        prevLockedReason: lot.lockedReason ?? null,
        decision: 'still_locked',
        reason: usability.message ?? usability.status,
        effectiveOutTimeMinutes: usability.effectiveOutTimeMinutes,
      });
      continue;
    }

    // Restore to the prior valid status (ACCEPTED / ISSUED / CONSUMED /
    // RECEIVED) inferred from the transaction history before the LOCK.  This
    // preserves lifecycle semantics — a lot that was ISSUED at lock-time
    // returns to ISSUED rather than being silently demoted to ACCEPTED.
    const remaining = parseFloat(lot.remainingQty);
    const targetStatus = await derivePriorStatus(lot.id, remaining, lot.lockedAt);

    const entry: RestoreEntry = {
      lotId: lot.id,
      internalControlNumber: lot.internalControlNumber,
      prevStatus: 'LOCKED',
      newStatus: targetStatus,
      prevLockedReason: lot.lockedReason ?? null,
      decision: 'restored',
      effectiveOutTimeMinutes: usability.effectiveOutTimeMinutes,
    };

    if (apply) {
      await db.transaction(async (tx) => {
        // Only clear the currentlyOutOfStorage / lastOutAt flags when the
        // restored status is NOT ISSUED.  Lots being restored to ISSUED were
        // legitimately out of storage at the time the false lock was written;
        // their out-of-storage state must be preserved (and the in-flight
        // accumulator is now defended against stale flags by the safe check).
        const update: Record<string, unknown> = {
          status: targetStatus,
          lockedReason: null,
          lockedAt: null,
          updatedAt: new Date(),
        };
        if (targetStatus !== 'ISSUED') {
          update.currentlyOutOfStorage = false;
          update.lastOutAt = null;
        }
        await tx
          .update(materialLots)
          .set(update)
          .where(eq(materialLots.id, lot.id));

        await tx.insert(materialLotTransactions).values({
          materialLotId: lot.id,
          internalControlNumber: lot.internalControlNumber,
          // 'UNLOCK' is not in the existing transactionType union but the
          // column is free-text TEXT.  We keep the audit type explicit so
          // downstream queries can distinguish bug-fix reversals from
          // legitimate operator unlocks (Task #174).
          transactionType: 'UNLOCK',
          qtyBefore: lot.remainingQty,
          qtyAfter: lot.remainingQty,
          performedBy: 'system:task-174-restore',
          reason: `Reversal of false-positive lock (${lot.lockedReason ?? 'unknown'})`,
          notes:
            'Restored by server/scripts/restoreFalseLockedMaterialLots.ts after re-evaluation under fixed shelf-life logic (Task #174).',
          wasOverride: false,
        });
      });
    }

    report.push(entry);
  }

  const summary = {
    mode: apply ? 'APPLY' : 'DRY-RUN',
    candidatesScanned: scoped.length,
    restored: report.filter((r) => r.decision === 'restored').length,
    stillLocked: report.filter((r) => r.decision === 'still_locked').length,
    icnFilter: icnArg ?? null,
    timestamp: new Date().toISOString(),
    entries: report,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (outputArg) {
    fs.writeFileSync(outputArg, JSON.stringify(summary, null, 2));
    console.log(`[restoreFalseLockedMaterialLots] wrote report to ${outputArg}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[restoreFalseLockedMaterialLots] FAILED:', err);
  process.exit(1);
});
