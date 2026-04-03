import { db } from '../../db';
import { allocationRequirements, manufacturingQueue } from '../../schema';
import { eq, sql } from 'drizzle-orm';

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
  }[];
}

/**
 * Evaluates readiness for a manufacturing queue item based on its allocationRequirements.
 * Writes readinessStatus, percentReady, and blockedReason back to manufacturingQueue.
 * NEVER writes to manufacturingQueue.status (that drives the existing lifecycle).
 */
export async function evaluateQueueReadiness(queueId: number): Promise<ReadinessResult> {
  const requirements = await db
    .select()
    .from(allocationRequirements)
    .where(eq(allocationRequirements.manufacturingQueueId, queueId));

  if (requirements.length === 0) {
    const result: ReadinessResult = {
      readinessStatus: 'NOT_READY',
      percentReady: 0,
      blocking: [],
    };

    await db
      .update(manufacturingQueue)
      .set({
        readinessStatus: result.readinessStatus,
        percentReady: String(result.percentReady),
        blockedReason: 'No allocation requirements defined',
        updatedAt: new Date(),
      })
      .where(eq(manufacturingQueue.id, queueId));

    return result;
  }

  const blocking: ReadinessResult['blocking'] = [];
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
  }

  const percentReady = totalRequiredQty > 0
    ? Math.min(100, Math.round((totalCoveredQty / totalRequiredQty) * 100))
    : 0;

  const criticalBlocking = blocking.filter(b => b.isCritical);
  let readinessStatus: ReadinessResult['readinessStatus'];

  if (blocking.length === 0) {
    readinessStatus = 'READY';
  } else if (criticalBlocking.length > 0) {
    readinessStatus = percentReady === 0 ? 'NOT_READY' : 'PARTIAL';
  } else {
    readinessStatus = percentReady > 0 ? 'PARTIAL' : 'NOT_READY';
  }

  const blockedReason = blocking.length > 0
    ? blocking
        .slice(0, 3)
        .map(b => `${b.requiredPartNumber}: need ${b.requiredQty}, have ${b.allocatedQty} allocated`)
        .join('; ') + (blocking.length > 3 ? ` (+${blocking.length - 3} more)` : '')
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

  return { readinessStatus, percentReady, blocking };
}
