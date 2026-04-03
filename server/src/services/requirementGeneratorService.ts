import { db } from '../../db';
import {
  allocationRequirements,
  manufacturingQueue,
  inventoryItems,
  partRoutings,
  routingDependencies,
} from '../../schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { evaluateQueueReadiness } from './queueReadinessService';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GenerateResult {
  queueId: number;
  routingId: string | null;
  created: number;
  skipped: number;
  requirements: { id: string; requiredPartNumber: string; requirementType: string }[];
}

// Dependency types that represent physical materials needing allocation tracking.
// TRAVELER, DOCUMENT, CERTIFICATION are process gates — not material allocations.
const ALLOCATABLE_TYPES = ['MATERIAL', 'CHILD_PART', 'SUB_ASSEMBLY', 'KIT'] as const;
type AllocatableDependencyType = typeof ALLOCATABLE_TYPES[number];

function toRequirementType(depType: AllocatableDependencyType): string {
  const map: Record<AllocatableDependencyType, string> = {
    MATERIAL: 'MATERIAL',
    CHILD_PART: 'COMPONENT',
    SUB_ASSEMBLY: 'SUBASSEMBLY',
    KIT: 'KIT_ITEM',
  };
  return map[depType];
}

// ── Core generator ─────────────────────────────────────────────────────────────

/**
 * Reads routingDependencies for a queue item's part routing and creates
 * allocationRequirements rows automatically.
 *
 * Lookup chain:
 *   1. If partRoutingId supplied → use it directly.
 *   2. Otherwise find the active partRouting for the queue item's inventory item
 *      (by inventoryItemId string match, then fallback by agPartNumber).
 *
 * Dependency filter: MATERIAL | CHILD_PART | SUB_ASSEMBLY | KIT
 * Skips: TRAVELER | DOCUMENT | CERTIFICATION (process gates, not material).
 * Skip duplicates: any row already linked via routingDependencyId is skipped.
 *
 * isCritical = mustBeAllocated (mustBeIssued contributes to staging, not allocation gate).
 *
 * Non-fatal: if no routing is found the function returns gracefully with 0 created.
 */
export async function generateRequirementsFromRouting(
  queueId: number,
  partRoutingId?: string | null
): Promise<GenerateResult> {
  // ── 1. Load queue item ────────────────────────────────────────────────────
  const [queueItem] = await db
    .select()
    .from(manufacturingQueue)
    .where(eq(manufacturingQueue.id, queueId))
    .limit(1);

  if (!queueItem) {
    throw new Error(`generateRequirementsFromRouting: queue item ${queueId} not found`);
  }

  // ── 2. Load inventory item ────────────────────────────────────────────────
  const [invItem] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, queueItem.inventoryItemId))
    .limit(1);

  if (!invItem) {
    return { queueId, routingId: null, created: 0, skipped: 0, requirements: [] };
  }

  // ── 3. Resolve part routing ───────────────────────────────────────────────
  let resolvedRoutingId: string | null = partRoutingId ?? null;

  if (!resolvedRoutingId) {
    // Primary: match by inventoryItemId (stored as text in partRoutings)
    const byItemId = await db
      .select({ id: partRoutings.id })
      .from(partRoutings)
      .where(
        and(
          eq(partRoutings.inventoryItemId, String(invItem.id)),
          eq(partRoutings.isActive, true)
        )
      )
      .orderBy(desc(partRoutings.routingRevision))
      .limit(1);

    if (byItemId.length > 0) {
      resolvedRoutingId = byItemId[0].id;
    } else if (invItem.agPartNumber) {
      // Fallback: match by part number
      const byPartNum = await db
        .select({ id: partRoutings.id })
        .from(partRoutings)
        .where(
          and(
            eq(partRoutings.partNumber, invItem.agPartNumber),
            eq(partRoutings.isActive, true)
          )
        )
        .orderBy(desc(partRoutings.routingRevision))
        .limit(1);

      if (byPartNum.length > 0) {
        resolvedRoutingId = byPartNum[0].id;
      }
    }
  }

  if (!resolvedRoutingId) {
    // No routing found — nothing to generate, silently succeed
    return { queueId, routingId: null, created: 0, skipped: 0, requirements: [] };
  }

  // ── 4. Fetch routing dependencies (allocatable types only) ────────────────
  const deps = await db
    .select()
    .from(routingDependencies)
    .where(
      and(
        eq(routingDependencies.partRoutingId, resolvedRoutingId),
        inArray(routingDependencies.dependencyType, ALLOCATABLE_TYPES as unknown as string[])
      )
    );

  if (deps.length === 0) {
    return { queueId, routingId: resolvedRoutingId, created: 0, skipped: 0, requirements: [] };
  }

  // ── 5. Load existing requirements to avoid duplicates ─────────────────────
  const existing = await db
    .select({ routingDependencyId: allocationRequirements.routingDependencyId })
    .from(allocationRequirements)
    .where(eq(allocationRequirements.manufacturingQueueId, queueId));

  const existingDepIds = new Set(existing.map(r => r.routingDependencyId).filter(Boolean));

  // ── 6. Build insert values ────────────────────────────────────────────────
  const toInsert: typeof allocationRequirements.$inferInsert[] = [];
  let skipped = 0;

  for (const dep of deps) {
    if (existingDepIds.has(dep.id)) {
      skipped++;
      continue;
    }

    if (!dep.requiredPartNumber) {
      // Skip rows without a part number — can't track allocation without identity
      skipped++;
      continue;
    }

    const depType = dep.dependencyType as AllocatableDependencyType;

    toInsert.push({
      manufacturingQueueId: queueId,
      requiredItemId: dep.requiredItemId ?? null,
      requiredPartNumber: dep.requiredPartNumber,
      requiredPartName: dep.requiredDescription ?? null,
      requirementType: toRequirementType(depType),
      unitOfMeasure: 'EA',
      requiredQty: String(dep.requiredQty ?? 1),
      allocatedQty: '0',
      stagedQty: '0',
      consumedQty: '0',
      allocationStatus: 'OPEN',
      isCritical: dep.mustBeAllocated ?? false,
      routingDependencyId: dep.id,
      sourceType: 'routing_dependency',
      notes: dep.notes ?? null,
    });
  }

  if (toInsert.length === 0) {
    return {
      queueId,
      routingId: resolvedRoutingId,
      created: 0,
      skipped,
      requirements: [],
    };
  }

  // ── 7. Insert requirements ────────────────────────────────────────────────
  const inserted = await db
    .insert(allocationRequirements)
    .values(toInsert)
    .returning();

  // ── 8. Re-evaluate readiness ──────────────────────────────────────────────
  await evaluateQueueReadiness(queueId).catch(err =>
    console.warn(`[requirementGenerator] readiness eval failed for queue ${queueId}:`, err.message)
  );

  console.log(
    `✅ generateRequirementsFromRouting: created ${inserted.length} requirement(s) for queue ${queueId} from routing ${resolvedRoutingId} (${skipped} skipped)`
  );

  return {
    queueId,
    routingId: resolvedRoutingId,
    created: inserted.length,
    skipped,
    requirements: inserted.map(r => ({
      id: r.id,
      requiredPartNumber: r.requiredPartNumber,
      requirementType: r.requirementType,
    })),
  };
}
