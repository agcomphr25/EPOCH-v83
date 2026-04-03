import { db } from '../../db';
import {
  inventoryItems,
  manufacturingQueue,
  boms,
  bomRevisions,
  bomLines,
  getSupplySourceDashboard,
  supplySourceDashboardToLegacyDept,
  insertManufacturingQueueSchema,
  type ManufacturedCategory,
  type ManufacturingQueue,
} from '../../schema';
import { eq, and, or, desc } from 'drizzle-orm';
import { generateRequirementsFromRouting } from '../services/requirementGeneratorService';

/**
 * Auto-populates manufacturing queue when a PO item is created for a manufactured part
 * Supports both Vendor POs and P2 POs
 *
 * @param params - Parameters object supporting both vendor and P2 POs
 * @returns The created queue item or null if not applicable
 */
export async function autoPopulateManufacturingQueue(
  params: {
    inventoryPartNumber: string | null;
    quantity: number;
    vendorPoId?: number;
    vendorPoLineNumber?: number;
    vendorPoItemId?: number;
    p2PoId?: number;
    p2PoItemId?: number;
    dueDate?: Date | null;
  }
): Promise<any | null> {
  try {
    // Skip if no part number
    if (!params.inventoryPartNumber) {
      return null;
    }

    // Query inventory item to check if it's manufactured
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.agPartNumber, params.inventoryPartNumber),
    });

    // Only proceed if item is manufactured and has a manufacturing department
    if (!inventoryItem ||
        inventoryItem.type !== 'Manufactured' ||
        !inventoryItem.manufacturingDepartment) {
      return null;
    }

    // Build duplicate detection conditions based on PO type
    const duplicateConditions = [];

    // Vendor PO: use FK identity when available, fall back to composite for legacy rows
    if (params.vendorPoItemId !== undefined) {
      duplicateConditions.push(
        eq(manufacturingQueue.vendorPoItemId, params.vendorPoItemId)
      );
    } else if (params.vendorPoId && params.vendorPoLineNumber !== undefined) {
      duplicateConditions.push(
        and(
          eq(manufacturingQueue.vendorPoId, params.vendorPoId),
          eq(manufacturingQueue.vendorPoLineNumber, params.vendorPoLineNumber)
        )
      );
    }

    // P2 PO: still uses composite (p2PoId + p2PoItemId)
    if (params.p2PoId && params.p2PoItemId) {
      duplicateConditions.push(
        and(
          eq(manufacturingQueue.p2PoId, params.p2PoId),
          eq(manufacturingQueue.p2PoItemId, params.p2PoItemId)
        )
      );
    }

    // Check for existing queue entries to prevent duplicates
    if (duplicateConditions.length > 0) {
      const existingQueueEntry = await db.query.manufacturingQueue.findFirst({
        where: and(
          or(...duplicateConditions),
          or(
            eq(manufacturingQueue.status, 'PENDING'),
            eq(manufacturingQueue.status, 'IN_PROGRESS')
          )
        ),
      });

      if (existingQueueEntry) {
        const poType = params.vendorPoId ? 'Vendor' : 'P2';
        const poId = params.vendorPoId || params.p2PoId;
        console.log(`⚠️ Skipping duplicate queue entry for ${poType} PO #${poId} - existing entry found (Queue ID: ${existingQueueEntry.id})`);
        return null;
      }
    }

    // Build notes based on PO type (vendorPoLineNumber kept for human-readable display)
    let notes = '';
    if (params.vendorPoId && params.vendorPoLineNumber !== undefined) {
      notes = `Auto-generated from Vendor PO #${params.vendorPoId}, Line #${params.vendorPoLineNumber}`;
    } else if (params.p2PoId && params.p2PoItemId) {
      notes = `Auto-generated from P2 PO #${params.p2PoId}, Item #${params.p2PoItemId}`;
    }

    const queueData = insertManufacturingQueueSchema.parse({
      inventoryItemId: inventoryItem.id,
      vendorPoId: params.vendorPoId || null,
      vendorPoLineNumber: params.vendorPoLineNumber ?? null,
      vendorPoItemId: params.vendorPoItemId ?? null,
      p2PoId: params.p2PoId || null,
      p2PoItemId: params.p2PoItemId || null,
      department: inventoryItem.manufacturingDepartment,
      quantityRequested: params.quantity,
      quantityCompleted: 0,
      status: 'PENDING',
      priority: 50,
      dueDate: params.dueDate || null,
      assignedTo: null,
      notes,
    });

    const [newQueueItem] = await db
      .insert(manufacturingQueue)
      .values(queueData)
      .returning();

    const poType = params.vendorPoId ? 'Vendor' : 'P2';
    const poId = params.vendorPoId || params.p2PoId;
    console.log(`✅ Auto-created manufacturing queue entry for ${inventoryItem.agPartNumber} in ${inventoryItem.manufacturingDepartment} (Queue ID: ${newQueueItem.id}, ${poType} PO #${poId})`);

    // Auto-generate allocation requirements from routing (best-effort, non-blocking)
    generateRequirementsFromRouting(newQueueItem.id).catch(err =>
      console.warn(`[autoPopulateManufacturingQueue] requirement generation failed for queue ${newQueueItem.id}:`, err.message)
    );

    return newQueueItem;
  } catch (error) {
    console.error('❌ Failed to auto-populate manufacturing queue:', error);
    return null;
  }
}

/**
 * Updates manufacturing queue quantities when a vendor PO item is updated.
 * Uses vendor_po_item_id FK for lookup (vendorPoId/lineNumber retained for display only).
 *
 * @param vendorPoItemId - The vendor_po_items.id FK (sole identity reference)
 * @param oldQuantity - The previous quantity
 * @param newQuantity - The new quantity
 * @param vendorPoId - The vendor PO ID (display/logging only)
 * @param lineNumber - The line number (display/logging only)
 */
export async function syncManufacturingQueueOnUpdate(
  vendorPoItemId: number,
  oldQuantity: number,
  newQuantity: number,
  vendorPoId: number,
  lineNumber: number
): Promise<void> {
  try {
    // Only proceed if quantity changed
    if (oldQuantity === newQuantity) {
      return;
    }

    // Look up the queue entry by FK identity
    const matchingEntry = await db.query.manufacturingQueue.findFirst({
      where: and(
        eq(manufacturingQueue.vendorPoItemId, vendorPoItemId),
        or(
          eq(manufacturingQueue.status, 'PENDING'),
          eq(manufacturingQueue.status, 'IN_PROGRESS')
        )
      ),
    });

    if (matchingEntry) {
      await db
        .update(manufacturingQueue)
        .set({
          quantityRequested: newQuantity,
          updatedAt: new Date()
        })
        .where(eq(manufacturingQueue.id, matchingEntry.id));

      console.log(`✅ Synced manufacturing queue (Queue ID: ${matchingEntry.id}, PO #${vendorPoId} Line #${lineNumber}) quantity from ${oldQuantity} to ${newQuantity}`);
    } else {
      console.log(`⚠️ No active queue entry found for vendor PO item ID ${vendorPoItemId} (PO #${vendorPoId} Line #${lineNumber}) to sync`);
    }
  } catch (error) {
    console.error('❌ Failed to sync manufacturing queue on PO update:', error);
  }
}

/**
 * Explodes BOM for a P2 PO item and creates manufacturing queue entries for all manufactured components
 *
 * @param params - P2 PO item data
 * @returns Array of created queue items
 */
export async function explodeBOMForManufacturing(params: {
  partNumber: string;
  quantity: number;
  p2PoId: number;
  p2PoItemId: number;
  dueDate?: Date | null;
}): Promise<any[]> {
  try {
    const createdQueueItems = [];

    // Step 1: Find the BOM for this part
    const bom = await db.query.boms.findFirst({
      where: eq(boms.parentPartAgNumber, params.partNumber),
    });

    if (!bom) {
      console.log(`ℹ️ No BOM found for part ${params.partNumber} - skipping BOM explosion`);
      return [];
    }

    // Step 2: Get the latest active BOM revision
    const latestRevision = await db.query.bomRevisions.findFirst({
      where: and(
        eq(bomRevisions.bomId, bom.id),
        eq(bomRevisions.isReleased, true)
      ),
      orderBy: [desc(bomRevisions.createdAt)],
    });

    if (!latestRevision) {
      console.log(`⚠️ No released BOM revision found for part ${params.partNumber}`);
      return [];
    }

    // Step 3: Get all BOM lines (components) for this revision
    const bomComponents = await db
      .select({
        childPartNumber: bomLines.childPartAgNumber,
        qtyPer: bomLines.qtyPer,
      })
      .from(bomLines)
      .where(eq(bomLines.revisionId, latestRevision.id));

    if (bomComponents.length === 0) {
      console.log(`ℹ️ BOM for part ${params.partNumber} has no components`);
      return [];
    }

    console.log(`🔍 Found ${bomComponents.length} components in BOM for part ${params.partNumber}`);

    // Step 4: For each component, check if it's manufactured and create queue entry
    for (const component of bomComponents) {
      const inventoryItem = await db.query.inventoryItems.findFirst({
        where: eq(inventoryItems.agPartNumber, component.childPartNumber),
      });

      // Only create queue entries for manufactured components
      if (inventoryItem?.type === 'Manufactured' && inventoryItem.manufacturingDepartment) {
        const requiredQty = params.quantity * parseFloat(component.qtyPer);

        // Check for duplicates
        const existingEntry = await db.query.manufacturingQueue.findFirst({
          where: and(
            eq(manufacturingQueue.p2PoId, params.p2PoId),
            eq(manufacturingQueue.p2PoItemId, params.p2PoItemId),
            eq(manufacturingQueue.inventoryItemId, inventoryItem.id),
            or(
              eq(manufacturingQueue.status, 'PENDING'),
              eq(manufacturingQueue.status, 'IN_PROGRESS')
            )
          ),
        });

        if (existingEntry) {
          console.log(`⚠️ Skipping duplicate queue entry for ${component.childPartNumber} from P2 PO #${params.p2PoId}`);
          continue;
        }

        const queueData = insertManufacturingQueueSchema.parse({
          inventoryItemId: inventoryItem.id,
          p2PoId: params.p2PoId,
          p2PoItemId: params.p2PoItemId,
          department: inventoryItem.manufacturingDepartment,
          quantityRequested: requiredQty,
          quantityCompleted: 0,
          status: 'PENDING',
          priority: 50,
          dueDate: params.dueDate || null,
          notes: `Auto-generated from P2 PO #${params.p2PoId} BOM explosion for ${params.partNumber} (${params.quantity} units × ${component.qtyPer} per unit)`,
        });

        const [newQueueItem] = await db
          .insert(manufacturingQueue)
          .values(queueData)
          .returning();

        createdQueueItems.push(newQueueItem);

        console.log(`✅ BOM explosion: Created queue entry for ${component.childPartNumber} in ${inventoryItem.manufacturingDepartment} (Qty: ${requiredQty}, Queue ID: ${newQueueItem.id})`);

        // Auto-generate allocation requirements from routing (best-effort, non-blocking)
        generateRequirementsFromRouting(newQueueItem.id).catch(err =>
          console.warn(`[explodeBOMForManufacturing] requirement generation failed for queue ${newQueueItem.id}:`, err.message)
        );
      }
    }

    if (createdQueueItems.length > 0) {
      console.log(`🎯 BOM explosion complete: Created ${createdQueueItems.length} manufacturing queue entries for P2 PO #${params.p2PoId}`);
    } else {
      console.log(`ℹ️ BOM explosion found no manufactured components for part ${params.partNumber}`);
    }

    return createdQueueItems;
  } catch (error) {
    console.error('❌ Failed to explode BOM for manufacturing queue:', error);
    return [];
  }
}

/**
 * DEMAND FLOW:
 *   inventory item (ASSEMBLY | SUB_ASSEMBLY)
 *     → BOM explosion (boms → bom_revisions[isReleased=true] → bom_lines)
 *     → demand record inserted into manufacturing_queue
 *         - department derived from child.manufacturedCategory via getSupplySourceDashboard()
 *         - parentProductionOrderId links back to the triggering order (traceable)
 *         - notes contain parentPartNumber and context for human readability
 *     → dashboard query reads manufacturing_queue.department
 *         - Cutting Table dashboard: department = 'Cutting Table'  (PACKET | KIT)
 *         - CNC queue:              department = 'CNC'             (MACHINED_PART)
 *         - Assembly queue:         department = 'Assembly'        (ASSEMBLY | SUB_ASSEMBLY)
 *         - Core queue:             department = 'Cores'           (CORE)
 *
 * Recursion: if a child item is ASSEMBLY or SUB_ASSEMBLY and has its own released BOM,
 * explodeBomDemand is called recursively for that child (depth-first).
 * Purchased items and items without BOMs are leaf nodes — no further explosion.
 *
 * @param parentPartNumber   AG part number of the item being manufactured
 * @param qty                Quantity required (propagated × qtyPer down the tree)
 * @param productionOrderId  The triggering production order ID (for lineage tracing)
 * @param depth              Current recursion depth (guards against cycles; max 10)
 * @returns Array of manufacturing_queue records created in this subtree
 */
export async function explodeBomDemand(
  parentPartNumber: string,
  qty: number,
  productionOrderId: string,
  depth = 0
): Promise<ManufacturingQueue[]> {
  if (depth > 10) {
    console.warn(`⚠️ BOM explosion depth limit reached for ${parentPartNumber} — possible cycle`);
    return [];
  }

  const created: ManufacturingQueue[] = [];

  try {
    const bom = await db.query.boms.findFirst({
      where: eq(boms.parentPartAgNumber, parentPartNumber),
    });

    if (!bom) {
      return [];
    }

    const releasedRevision = await db.query.bomRevisions.findFirst({
      where: and(
        eq(bomRevisions.bomId, bom.id),
        eq(bomRevisions.isReleased, true)
      ),
      orderBy: [desc(bomRevisions.createdAt)],
    });

    if (!releasedRevision) {
      console.log(`⚠️ No released BOM revision for ${parentPartNumber} — skipping demand explosion`);
      return [];
    }

    const lines = await db
      .select({
        childPartNumber: bomLines.childPartAgNumber,
        qtyPer: bomLines.qtyPer,
      })
      .from(bomLines)
      .where(eq(bomLines.revisionId, releasedRevision.id));

    if (lines.length === 0) {
      return [];
    }

    for (const line of lines) {
      const childItem = await db.query.inventoryItems.findFirst({
        where: eq(inventoryItems.agPartNumber, line.childPartNumber),
      });

      if (!childItem) {
        console.warn(`⚠️ BOM line child part ${line.childPartNumber} not found in inventory — skipping`);
        continue;
      }

      // Skip purchased/buy parts — they are leaf nodes with no BOM to explode.
      // Backward-compatible check: new itemType='PURCHASED' or legacy type field
      const legacyType = childItem.type?.toLowerCase();
      const isPurchased =
        childItem.itemType === 'PURCHASED' ||
        legacyType === 'purchased' ||
        legacyType === 'buy';
      if (isPurchased) {
        continue;
      }

      const category = childItem.manufacturedCategory as ManufacturedCategory | null;
      const dashboard = getSupplySourceDashboard(category);
      const legacyDept = supplySourceDashboardToLegacyDept(dashboard);

      if (!legacyDept) {
        const fallbackDept = childItem.manufacturingDepartment;
        if (!fallbackDept) {
          console.warn(`⚠️ Cannot determine department for ${line.childPartNumber} (no category, no manufacturingDepartment) — skipping`);
          continue;
        }
      }

      const department = legacyDept || childItem.manufacturingDepartment!;
      const requiredQty = qty * parseFloat(line.qtyPer || '1');

      const queueData = insertManufacturingQueueSchema.parse({
        inventoryItemId: childItem.id,
        department,
        quantityRequested: Math.ceil(requiredQty),
        quantityCompleted: 0,
        status: 'PENDING',
        priority: 50,
        parentProductionOrderId: productionOrderId,
        notes: JSON.stringify({
          source: 'BOM_EXPLOSION',
          parentPartNumber,
          childPartNumber: line.childPartNumber,
          qtyPer: line.qtyPer,
          supplySourceDashboard: dashboard,
        }),
      });

      const [newItem] = await db
        .insert(manufacturingQueue)
        .values(queueData)
        .returning();

      created.push(newItem);
      console.log(`✅ BOM demand: ${line.childPartNumber} → ${department} (qty ${Math.ceil(requiredQty)}, order ${productionOrderId})`);

      // Auto-generate allocation requirements from routing (best-effort, non-blocking)
      generateRequirementsFromRouting(newItem.id).catch(err =>
        console.warn(`[explodeBomDemand] requirement generation failed for queue ${newItem.id}:`, err.message)
      );

      if (category === 'ASSEMBLY' || category === 'SUB_ASSEMBLY') {
        const childCreated = await explodeBomDemand(
          line.childPartNumber,
          requiredQty,
          productionOrderId,
          depth + 1
        );
        created.push(...childCreated);
      }
    }
  } catch (error) {
    console.error(`❌ explodeBomDemand failed for ${parentPartNumber}:`, error);
  }

  return created;
}
