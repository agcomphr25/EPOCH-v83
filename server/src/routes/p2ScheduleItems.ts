/**
 * Standalone router for `POST /api/p2/schedule-items`.
 *
 * Extracted from `server/src/routes/index.ts` so the route can be mounted
 * independently in tests (without spinning up the full registerRoutes graph).
 *
 * Responsibilities:
 *   1. Move requested P2 serialized items from "Pending Layup" to the first
 *      department in their controlled part routing. Missing or ambiguous
 *      routing evidence fails closed; scheduling never falls back to Layup.
 *   2. Auto-sync cutting-table packet demand for the affected POs into
 *      grouped manufacturing_queue rows via `upsertGroupedCuttingQueueEntry`.
 *
 * The cutting-table grouping logic is unchanged from the original inline
 * implementation — see the helper for the per-bucket dedup / merge contract.
 */
import express, { type Request, type Response } from 'express';

type RoutingCandidate = {
  id: string;
  inventoryItemId: string;
  partNumber: string;
  routingRevision: number;
  departmentSequence: unknown;
};

type SchedulableItem = {
  id: string;
  poId: number;
  poItemId: number;
  partNumber: string;
  partRoutingId: string | null;
};

export function chooseP2ScheduleRouting(
  item: SchedulableItem,
  inventoryItemId: number | null,
  candidates: RoutingCandidate[]
) {
  const stamped = item.partRoutingId
    ? candidates.filter((candidate) => candidate.id === item.partRoutingId)
    : [];
  const inventoryMatches =
    inventoryItemId == null
      ? []
      : candidates.filter(
          (candidate) => candidate.inventoryItemId === String(inventoryItemId)
        );
  const normalizedPart = item.partNumber.trim().toLowerCase();
  const partMatches = candidates.filter(
    (candidate) => candidate.partNumber.trim().toLowerCase() === normalizedPart
  );
  const preferred = stamped.length
    ? stamped
    : inventoryMatches.length
      ? inventoryMatches
      : partMatches;
  if (preferred.length !== 1) return null;
  const sequence = Array.isArray(preferred[0].departmentSequence)
    ? preferred[0].departmentSequence.filter(
        (department): department is string =>
          typeof department === 'string' && department.trim().length > 0
      )
    : [];
  if (!sequence.length) return null;
  return {
    routingId: preferred[0].id,
    routingRevision: preferred[0].routingRevision,
    firstDepartment: sequence[0].trim(),
  };
}

const router = express.Router();

router.post(
  '/api/p2/reconcile-scheduled-routing',
  async (req: Request, res: Response) => {
    try {
      const poNumbers = Array.isArray(req.body?.poNumbers)
        ? [
            ...new Set(
              req.body.poNumbers
                .filter(
                  (value: unknown): value is string =>
                    typeof value === 'string' && value.trim().length > 0
                )
                .map((value: string) => value.trim())
            ),
          ]
        : [];
      if (!poNumbers.length) {
        return res
          .status(400)
          .json({ error: 'At least one PO number is required.' });
      }
      const { db } = await import('../../db');
      const {
        p2SerializedItems,
        p2PurchaseOrderItems,
        p2SerializedItemEvents,
        partRoutings,
      } = await import('../../schema');
      const { and, eq, inArray } = await import('drizzle-orm');
      const result = await db.transaction(async (tx) => {
        const items = await tx
          .select({
            id: p2SerializedItems.id,
            poId: p2SerializedItems.poId,
            poItemId: p2SerializedItems.poItemId,
            poNumber: p2SerializedItems.poNumber,
            partNumber: p2SerializedItems.partNumber,
            barcode: p2SerializedItems.barcode,
            partRoutingId: p2SerializedItems.partRoutingId,
          })
          .from(p2SerializedItems)
          .where(
            and(
              inArray(p2SerializedItems.poNumber, poNumbers),
              eq(p2SerializedItems.status, 'ACTIVE'),
              eq(p2SerializedItems.currentDepartment, 'Layup')
            )
          );
        if (!items.length) return { repaired: 0, departments: {} };
        const poItemIds = [...new Set(items.map((item) => item.poItemId))];
        const poItems = await tx
          .select({
            id: p2PurchaseOrderItems.id,
            inventoryItemId: p2PurchaseOrderItems.inventoryItemId,
          })
          .from(p2PurchaseOrderItems)
          .where(inArray(p2PurchaseOrderItems.id, poItemIds));
        const inventoryByPoItem = new Map(
          poItems.map((item) => [item.id, item.inventoryItemId] as const)
        );
        const candidates = await tx
          .select({
            id: partRoutings.id,
            inventoryItemId: partRoutings.inventoryItemId,
            partNumber: partRoutings.partNumber,
            routingRevision: partRoutings.routingRevision,
            departmentSequence: partRoutings.departmentSequence,
          })
          .from(partRoutings)
          .where(eq(partRoutings.isActive, true));
        const assignments = items.map((item) => ({
          item,
          assignment: chooseP2ScheduleRouting(
            item,
            inventoryByPoItem.get(item.poItemId) ?? null,
            candidates
          ),
        }));
        const unresolved = assignments.filter((entry) => !entry.assignment);
        if (unresolved.length) {
          const error = new Error(
            'P2_RECONCILIATION_ROUTING_REQUIRED'
          ) as Error & {
            itemIds?: string[];
          };
          error.itemIds = unresolved.map((entry) => entry.item.id);
          throw error;
        }
        const departments: Record<string, number> = {};
        for (const { item, assignment } of assignments) {
          if (!assignment) continue;
          const updated = await tx
            .update(p2SerializedItems)
            .set({
              currentDepartment: assignment.firstDepartment,
              currentStageIndex: 0,
              partRoutingId: assignment.routingId,
              partRoutingRevision: assignment.routingRevision,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(p2SerializedItems.id, item.id),
                eq(p2SerializedItems.status, 'ACTIVE'),
                eq(p2SerializedItems.currentDepartment, 'Layup')
              )
            )
            .returning({ id: p2SerializedItems.id });
          if (!updated.length) continue;
          departments[assignment.firstDepartment] =
            (departments[assignment.firstDepartment] ?? 0) + 1;
          await tx.insert(p2SerializedItemEvents).values({
            serializedItemId: item.id,
            barcode: item.barcode,
            eventType: 'ROUTING_RECONCILED',
            fromDepartment: 'Layup',
            toDepartment: assignment.firstDepartment,
            fromStageIndex: 0,
            toStageIndex: 0,
            performedBy:
              String(
                (req as Request & { user?: { username?: string } }).user
                  ?.username ?? ''
              ) || 'system-routing-reconciliation',
            notes:
              'Corrected scheduled department from the controlled part routing.',
            metadata: {
              poNumber: item.poNumber,
              routingId: assignment.routingId,
              routingRevision: assignment.routingRevision,
            },
          });
        }
        return {
          repaired: Object.values(departments).reduce(
            (sum, count) => sum + count,
            0
          ),
          departments,
        };
      });
      return res.json(result);
    } catch (error) {
      const routingError = error as Error & { itemIds?: string[] };
      if (routingError.message === 'P2_RECONCILIATION_ROUTING_REQUIRED') {
        return res.status(409).json({
          error: 'Repair blocked: controlled routing is missing or ambiguous.',
          code: 'P2_RECONCILIATION_ROUTING_REQUIRED',
          itemIds: routingError.itemIds ?? [],
        });
      }
      console.error('P2 scheduled-routing reconciliation error:', error);
      return res
        .status(500)
        .json({ error: 'Failed to reconcile scheduled routing.' });
    }
  }
);

router.post('/api/p2/schedule-items', async (req: Request, res: Response) => {
  try {
    const { itemIds } = req.body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'Item IDs array is required' });
    }

    const { ensureProductionWorkflowReadSchema } = await import(
      '../lib/productionWorkflowReadiness'
    );
    await ensureProductionWorkflowReadSchema();
    const { db } = await import('../../db');
    const {
      p2SerializedItems,
      p2ProductionOrders,
      p2PurchaseOrders,
      p2PurchaseOrderItems,
      partRoutings,
      inventoryItems,
      cuttingPacketBOMs,
    } = await import('../../schema');
    const { eq, inArray, and } = await import('drizzle-orm');
    const serializedItemIds = itemIds.filter(
      (id: unknown): id is string =>
        typeof id === 'string' && !id.startsWith('legacy-p2-production-order-')
    );
    const legacyProductionOrderIds = [
      ...new Set(
        itemIds
          .map((id: unknown) => {
            const match =
              typeof id === 'string'
                ? id.match(/^legacy-p2-production-order-(\d+)(?:-\d+)?$/)
                : null;
            return match ? Number(match[1]) : null;
          })
          .filter((id: number | null): id is number => Number.isInteger(id))
      ),
    ];

    const schedulableItems =
      serializedItemIds.length > 0
        ? await db
            .select({
              id: p2SerializedItems.id,
              poId: p2SerializedItems.poId,
              poItemId: p2SerializedItems.poItemId,
              partNumber: p2SerializedItems.partNumber,
              partRoutingId: p2SerializedItems.partRoutingId,
            })
            .from(p2SerializedItems)
            .where(
              and(
                inArray(p2SerializedItems.id, serializedItemIds),
                eq(p2SerializedItems.status, 'ACTIVE'),
                eq(p2SerializedItems.currentDepartment, 'Pending Layup')
              )
            )
        : [];

    const poItemIds = [
      ...new Set(schedulableItems.map((item) => item.poItemId)),
    ];
    const poItemRows = poItemIds.length
      ? await db
          .select({
            id: p2PurchaseOrderItems.id,
            inventoryItemId: p2PurchaseOrderItems.inventoryItemId,
          })
          .from(p2PurchaseOrderItems)
          .where(inArray(p2PurchaseOrderItems.id, poItemIds))
      : [];
    const inventoryItemIdByPoItemId = new Map(
      poItemRows.map((item) => [item.id, item.inventoryItemId] as const)
    );
    const routingRows = schedulableItems.length
      ? await db
          .select({
            id: partRoutings.id,
            inventoryItemId: partRoutings.inventoryItemId,
            partNumber: partRoutings.partNumber,
            routingRevision: partRoutings.routingRevision,
            departmentSequence: partRoutings.departmentSequence,
          })
          .from(partRoutings)
          .where(eq(partRoutings.isActive, true))
      : [];
    const itemIdsByAssignment = new Map<
      string,
      {
        routingId: string;
        routingRevision: number;
        department: string;
        ids: string[];
      }
    >();
    const unresolved: string[] = [];
    for (const item of schedulableItems) {
      const assignment = chooseP2ScheduleRouting(
        item,
        inventoryItemIdByPoItemId.get(item.poItemId) ?? null,
        routingRows
      );
      if (!assignment) {
        unresolved.push(item.id);
        continue;
      }
      const key = `${assignment.routingId}:${assignment.firstDepartment}`;
      const group = itemIdsByAssignment.get(key) || {
        routingId: assignment.routingId,
        routingRevision: assignment.routingRevision,
        department: assignment.firstDepartment,
        ids: [],
      };
      group.ids.push(item.id);
      itemIdsByAssignment.set(key, group);
    }
    if (unresolved.length) {
      return res.status(409).json({
        error:
          'Scheduling blocked: controlled routing is missing or ambiguous.',
        code: 'P2_SCHEDULE_ROUTING_REQUIRED',
        itemIds: unresolved,
      });
    }

    const result: Array<{ id: string; poId: number }> = [];
    for (const assignment of itemIdsByAssignment.values()) {
      const updated = await db
        .update(p2SerializedItems)
        .set({
          currentDepartment: assignment.department,
          currentStageIndex: 0,
          partRoutingId: assignment.routingId,
          partRoutingRevision: assignment.routingRevision,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(p2SerializedItems.id, assignment.ids),
            eq(p2SerializedItems.status, 'ACTIVE'),
            eq(p2SerializedItems.currentDepartment, 'Pending Layup')
          )
        )
        .returning({ id: p2SerializedItems.id, poId: p2SerializedItems.poId });
      result.push(...updated);
    }

    const legacyResult =
      legacyProductionOrderIds.length > 0
        ? await db
            .update(p2ProductionOrders)
            .set({
              scheduledLayupDate: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                inArray(p2ProductionOrders.id, legacyProductionOrderIds),
                eq(p2ProductionOrders.status, 'PENDING')
              )
            )
            .returning({
              id: p2ProductionOrders.id,
              poId: p2ProductionOrders.p2PoId,
            })
        : [];

    console.log(
      `Scheduled ${result.length + legacyResult.length} items for production`
    );

    // Auto-sync P2 cutting table demands for the affected POs.
    // All cutting orders for the affected POs are resolved to their actual packet
    // inventory item (looked up by SKU → inventory_items.agPartNumber, with name-
    // based CF/FG fallback for non-packet-classified rows), bucketed by
    // (inventoryItemId, due-date day), and upserted into a single grouped
    // manufacturing_queue row per bucket via the shared helper.
    // Re-runs are idempotent because the helper dedupes contributing PO entries
    // by p2PoItemId.
    let cuttingTableSynced = 0;
    try {
      const { ilike, or } = await import('drizzle-orm');
      const { upsertGroupedCuttingQueueEntry } = await import(
        '../utils/cuttingQueueGroupingHelper'
      );
      const affectedPoIds = [
        ...new Set([
          ...result.map((r) => r.poId),
          ...legacyResult.map((r) => r.poId),
        ]),
      ];

      // CF/FG packet items used as fallback when SKU lookup misses
      const cfPacketItem = await db
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.isPacket, true),
            ilike(inventoryItems.name, '%carbon fiber%')
          )
        )
        .limit(1)
        .then((r) => r[0] || null);
      const fgPacketItem = await db
        .select()
        .from(inventoryItems)
        .where(
          and(
            eq(inventoryItems.isPacket, true),
            or(
              ilike(inventoryItems.name, '%fiberglass%'),
              ilike(inventoryItems.name, '%fiber glass%')
            )
          )
        )
        .limit(1)
        .then((r) => r[0] || null);

      const isFgPart = (name: string) => {
        const n = name.toLowerCase();
        return (
          n.includes('fiberglass') ||
          n.includes('fibreglass') ||
          n.includes('fiber glass')
        );
      };

      type PacketInventoryItem = NonNullable<typeof cfPacketItem>;

      // SKU → packet inventory item cache (lookup by agPartNumber)
      const skuPacketCache: Record<string, PacketInventoryItem | null> = {};
      const resolvePacketBySku = async (
        sku: string | null
      ): Promise<PacketInventoryItem | null> => {
        if (!sku) return null;
        if (sku in skuPacketCache) return skuPacketCache[sku];
        const [item] = await db
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.agPartNumber, sku),
              eq(inventoryItems.isPacket, true)
            )
          )
          .limit(1);
        skuPacketCache[sku] = item || null;
        return skuPacketCache[sku];
      };

      // Derive a materialType label for BOM matching / display, given the resolved packet item name
      const materialTypeFromName = (
        name: string | null | undefined
      ): string => {
        const n = (name || '').toLowerCase();
        if (
          n.includes('fiberglass') ||
          n.includes('fibreglass') ||
          n.includes('fiber glass')
        )
          return 'fiberglass';
        if (n.includes('carbon')) return 'carbon_fiber';
        if (n.includes('mesa')) return 'mesa';
        if (n.includes('disruptor')) return 'p2_disruptor_packet';
        if (n.includes('antenna')) return 'p2_antenna_cover';
        return 'p2_packet';
      };

      // Cache PO numbers so we don't re-query for each order
      const poNumberCache: Record<number, string> = {};
      const fetchPoNumber = async (id: number): Promise<string> => {
        if (poNumberCache[id]) return poNumberCache[id];
        const [po] = await db
          .select()
          .from(p2PurchaseOrders)
          .where(eq(p2PurchaseOrders.id, id))
          .limit(1);
        poNumberCache[id] = po?.poNumber || `PO-${id}`;
        return poNumberCache[id];
      };

      // Bucket all cutting orders across all affected POs by (packet inventory item, due-date day)
      type Bucket = {
        materialType: string;
        packetItem: PacketInventoryItem;
        packetName: string;
        dueDate: Date | null;
        items: {
          poNumber: string;
          quantity: number;
          p2PoItemId: number;
          p2PoId: number;
        }[];
      };
      const buckets = new Map<string, Bucket>();

      for (const poId of affectedPoIds) {
        // Fetch all PENDING orders for this PO
        const p2Orders = await db
          .select()
          .from(p2ProductionOrders)
          .where(
            and(
              eq(p2ProductionOrders.status, 'PENDING'),
              eq(p2ProductionOrders.p2PoId, poId)
            )
          );

        // Filter to orders that need cutting — either explicitly 'Cutting Table'
        // or Layup orders that are ACTUAL packet items (by name/SKU), not just any CF/FG part
        const cuttingOrders = p2Orders.filter((o) => {
          if (o.department === 'Cutting Table') return true;
          if (o.department === 'Layup' || o.department === 'layup') {
            const name = (o.partName || '').toLowerCase();
            const sku = (o.sku || '').toLowerCase();
            return (
              name.includes('packet') ||
              sku.includes('packet') ||
              o.sku === 'P706' ||
              o.sku === 'P707'
            );
          }
          return false;
        });

        if (cuttingOrders.length === 0) continue;

        const poNumber = await fetchPoNumber(poId);

        for (const order of cuttingOrders) {
          // 1. Try to resolve the actual packet inventory item by SKU
          //    (this handles Disruptor, Antenna Cover, Mesa, and any other
          //    packet families beyond CF/FG)
          let packetItem = await resolvePacketBySku(order.sku);

          // 2. Fall back to CF/FG name-based classification when SKU lookup misses
          if (!packetItem) {
            packetItem = isFgPart(order.partName || '')
              ? fgPacketItem
              : cfPacketItem;
          }
          if (!packetItem) continue; // No packet inventory item configured at all

          const materialType = materialTypeFromName(packetItem.name);
          const dueDate = order.dueDate ? new Date(order.dueDate) : null;
          const dayKey = dueDate
            ? new Date(
                dueDate.getFullYear(),
                dueDate.getMonth(),
                dueDate.getDate()
              )
                .toISOString()
                .slice(0, 10)
            : 'null';
          const bucketKey = `${packetItem.id}|${dayKey}`;

          if (!buckets.has(bucketKey)) {
            buckets.set(bucketKey, {
              materialType,
              packetItem,
              packetName: packetItem.name || materialType,
              dueDate,
              items: [],
            });
          }
          buckets.get(bucketKey)!.items.push({
            poNumber,
            quantity: order.quantity || 1,
            p2PoItemId: order.p2PoItemId,
            p2PoId: order.p2PoId,
          });
        }
      }

      type CuttingPacketBom = typeof cuttingPacketBOMs.$inferSelect;
      for (const bucket of buckets.values()) {
        let matchingBom: CuttingPacketBom | null = null;
        if (bucket.packetItem.agPartNumber) {
          const [bom] = await db
            .select()
            .from(cuttingPacketBOMs)
            .where(
              eq(cuttingPacketBOMs.partNumber, bucket.packetItem.agPartNumber)
            )
            .limit(1);
          matchingBom = bom || null;
        }

        const upsertResult = await upsertGroupedCuttingQueueEntry({
          packetName: bucket.packetName,
          materialType: bucket.materialType,
          dueDate: bucket.dueDate,
          items: bucket.items,
          source: 'P2_SYNC',
          inventoryItemId: bucket.packetItem.id,
          bomId: matchingBom?.id || null,
        });

        if (
          upsertResult &&
          (upsertResult.created || upsertResult.addedQuantity > 0)
        ) {
          cuttingTableSynced++;
        }
      }

      if (cuttingTableSynced > 0) {
        console.log(
          `Auto-synced ${cuttingTableSynced} grouped cutting table packet work order(s) from P2 control center`
        );
      }
    } catch (syncError) {
      console.error(
        'Non-fatal: Failed to auto-sync cutting table demands:',
        syncError
      );
    }

    res.json({
      success: true,
      scheduled: result.length + legacyResult.length,
      cuttingTableDemands: cuttingTableSynced,
      message: `${result.length + legacyResult.length} items scheduled for production${cuttingTableSynced > 0 ? `, ${cuttingTableSynced} cutting table stock packet demands created` : ''}`,
    });
  } catch (_error) {
    console.error('P2 schedule-items error:', _error);
    res.status(500).json({ error: 'Failed to schedule items' });
  }
});

export default router;
