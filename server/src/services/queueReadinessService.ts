import { db } from '../../db';
import { allocationRequirements, manufacturingQueue, materialLots } from '../../schema';
import { eq, inArray } from 'drizzle-orm';
import { computeEffectiveOutTimeMinutesSafe, isSentinelExpirationDate } from './lotUsability';

export interface ReadinessResult {
  readinessStatus: 'NOT_READY' | 'PARTIAL' | 'READY' | 'BLOCKED';
  percentReady: number;
  blocking: {
    requirementId: string;
    requiredPartNumber: string;
    requiredQty: number;
    allocatedQty: number;
    stagedQty: number;
    isCritical: boolean;
    shortfall: number;
    complianceViolations?: string[];
  }[];
}

/**
 * Evaluates readiness for a manufacturing queue item based on its allocationRequirements.
 * Writes readinessStatus, percentReady, and blockedReason back to manufacturingQueue.
 * NEVER writes to manufacturingQueue.status (that drives the existing lifecycle).
 *
 * For queueType=LAYUP, requirements that have a reserved/linked material lot are additionally
 * checked for: (a) expired expirationDate; (b) totalOutTimeMinutes >= maxOutTimeMinutes.
 * Requirements with no reserved lot fall back to quantity/allocation logic only.
 */
export async function evaluateQueueReadiness(queueId: number): Promise<ReadinessResult> {
  const [queueRow] = await db
    .select({ queueType: manufacturingQueue.queueType })
    .from(manufacturingQueue)
    .where(eq(manufacturingQueue.id, queueId))
    .limit(1);

  const isLayup = queueRow?.queueType === 'LAYUP' || queueRow?.queueType === 'CUTTING_TABLE';

  const requirements = await db
    .select()
    .from(allocationRequirements)
    .where(eq(allocationRequirements.manufacturingQueueId, queueId));

  if (requirements.length === 0) {
    const result: ReadinessResult = {
      readinessStatus: 'READY',
      percentReady: 100,
      blocking: [],
    };

    await db
      .update(manufacturingQueue)
      .set({
        readinessStatus: result.readinessStatus,
        percentReady: String(result.percentReady),
        blockedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(manufacturingQueue.id, queueId));

    return result;
  }

  // For LAYUP: fetch lots for any requirement that has a materialLotId linked
  let lotMap: Map<string, typeof materialLots.$inferSelect> = new Map();
  if (isLayup) {
    const lotIds = requirements
      .map((r) => r.materialLotId)
      .filter((id): id is string => id != null);
    if (lotIds.length > 0) {
      const lots = await db
        .select()
        .from(materialLots)
        .where(inArray(materialLots.id, lotIds));
      for (const lot of lots) {
        lotMap.set(lot.id, lot);
      }
    }
  }

  const now = new Date();
  const blocking: ReadinessResult['blocking'] = [];
  const complianceBlocking: ReadinessResult['blocking'] = [];
  let totalRequiredQty = 0;
  let totalCoveredQty = 0;

  for (const req of requirements) {
    const required = parseFloat(String(req.requiredQty));
    const allocated = parseFloat(String(req.allocatedQty ?? '0'));
    const staged = parseFloat(String(req.stagedQty ?? '0'));

    const covered = Math.max(allocated, staged);
    totalRequiredQty += required;
    totalCoveredQty += Math.min(covered, required);

    if (covered < required) {
      blocking.push({
        requirementId: req.id,
        requiredPartNumber: req.requiredPartNumber,
        requiredQty: required,
        allocatedQty: allocated,
        stagedQty: staged,
        isCritical: req.isCritical ?? true,
        shortfall: required - covered,
      });
    }

    // LAYUP compliance: only check when a lot is linked
    if (isLayup && req.materialLotId) {
      const lot = lotMap.get(req.materialLotId);
      if (lot) {
        const violations: string[] = [];

        // (a) Lock check (Task #165) — explicit LOCKED status takes precedence
        if (lot.status === 'LOCKED') {
          violations.push(
            `lot ${lot.internalControlNumber ?? req.materialLotId.slice(0, 8)} is LOCKED${lot.lockedReason ? ` (${lot.lockedReason})` : ''}`
          );
        }

        // (b) Expiration check — sentinel/garbage dates don't count (Task #174)
        if (lot.expirationDate) {
          const expDate = new Date(lot.expirationDate);
          if (!isSentinelExpirationDate(expDate) && expDate < now) {
            violations.push(`lot ${lot.internalControlNumber ?? req.materialLotId.slice(0, 8)} is EXPIRED`);
          }
        }

        // (c) Out-time check — uses the defensive compute so a stale
        // currentlyOutOfStorage flag with no matching open OUT_START
        // transaction does not silently accumulate minutes (Task #174).
        if (lot.maxOutTimeMinutes != null && lot.maxOutTimeMinutes > 0) {
          const effective = await computeEffectiveOutTimeMinutesSafe(lot, now);
          if (effective >= lot.maxOutTimeMinutes) {
            violations.push(
              `out-time exceeded (${effective}/${lot.maxOutTimeMinutes} min)`
            );
          }
        }

        if (violations.length > 0) {
          complianceBlocking.push({
            requirementId: req.id,
            requiredPartNumber: req.requiredPartNumber,
            requiredQty: required,
            allocatedQty: allocated,
            stagedQty: staged,
            isCritical: true,
            shortfall: 0,
            complianceViolations: violations,
          });
        }
      }
    }
  }

  const percentReady = totalRequiredQty > 0
    ? Math.min(100, Math.round((totalCoveredQty / totalRequiredQty) * 100))
    : 0;

  const allBlocking = [...blocking, ...complianceBlocking];
  const criticalBlocking = allBlocking.filter(b => b.isCritical);
  let readinessStatus: ReadinessResult['readinessStatus'];

  if (complianceBlocking.length > 0) {
    // Compliance violations always result in BLOCKED regardless of quantity coverage
    readinessStatus = 'BLOCKED';
  } else if (allBlocking.length === 0) {
    readinessStatus = 'READY';
  } else if (criticalBlocking.length > 0) {
    readinessStatus = percentReady === 0 ? 'NOT_READY' : 'PARTIAL';
  } else {
    readinessStatus = percentReady > 0 ? 'PARTIAL' : 'NOT_READY';
  }

  const quantityReasons = blocking
    .slice(0, 3)
    .map(b => `${b.requiredPartNumber}: need ${b.requiredQty}, have ${b.allocatedQty} allocated`);

  const complianceReasons = complianceBlocking
    .slice(0, 3)
    .map(b => `${b.requiredPartNumber}: ${b.complianceViolations?.join(', ')}`);

  const allReasons = [...complianceReasons, ...quantityReasons];
  const totalCount = blocking.length + complianceBlocking.length;
  const shownCount = allReasons.length;
  const remainder = totalCount - shownCount;

  const blockedReason = allReasons.length > 0
    ? allReasons.join('; ') + (remainder > 0 ? ` (+${remainder} more)` : '')
    : null;

  await db
    .update(manufacturingQueue)
    .set({
      readinessStatus,
      percentReady: String(percentReady),
      blockedReason,
      updatedAt: new Date(),
    })
    .where(eq(manufacturingQueue.id, queueId));

  return { readinessStatus, percentReady, blocking: allBlocking };
}
