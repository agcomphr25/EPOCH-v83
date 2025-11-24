import { db } from '../../db';
import { inventoryItems, manufacturingQueue, boms, bomRevisions, bomLines } from '../../schema';
import { insertManufacturingQueueSchema } from '../../schema';
import { eq, and, or, desc } from 'drizzle-orm';

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
    if (params.vendorPoId && params.vendorPoLineNumber !== undefined) {
      duplicateConditions.push(
        and(
          eq(manufacturingQueue.vendorPoId, params.vendorPoId),
          eq(manufacturingQueue.vendorPoLineNumber, params.vendorPoLineNumber)
        )
      );
    }
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

    // Build notes based on PO type
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
      p2PoId: params.p2PoId || null,
      p2PoItemId: params.p2PoItemId || null,
      department: inventoryItem.manufacturingDepartment,
      quantityRequested: params.quantity,
      quantityCompleted: 0,
      status: 'PENDING',
      priority: 50, // Default medium priority
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
    
    return newQueueItem;
  } catch (error) {
    // Log error but don't throw - we don't want to fail PO creation if queue population fails
    console.error('❌ Failed to auto-populate manufacturing queue:', error);
    return null;
  }
}

/**
 * Updates manufacturing queue quantities when a vendor PO item is updated
 * 
 * @param poItemId - The vendor PO item ID
 * @param oldQuantity - The previous quantity
 * @param newQuantity - The new quantity
 * @param vendorPoId - The vendor PO ID
 * @param lineNumber - The line number
 */
export async function syncManufacturingQueueOnUpdate(
  poItemId: number,
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

    // Find the related queue entry using proper foreign key columns
    const matchingEntry = await db.query.manufacturingQueue.findFirst({
      where: and(
        eq(manufacturingQueue.vendorPoId, vendorPoId),
        eq(manufacturingQueue.vendorPoLineNumber, lineNumber),
        or(
          eq(manufacturingQueue.status, 'PENDING'),
          eq(manufacturingQueue.status, 'IN_PROGRESS')
        )
      ),
    });

    if (matchingEntry) {
      // Update the requested quantity
      await db
        .update(manufacturingQueue)
        .set({ 
          quantityRequested: newQuantity,
          updatedAt: new Date()
        })
        .where(eq(manufacturingQueue.id, matchingEntry.id));

      console.log(`✅ Synced manufacturing queue (Queue ID: ${matchingEntry.id}, PO #${vendorPoId} Line #${lineNumber}) quantity from ${oldQuantity} to ${newQuantity}`);
    } else {
      console.log(`⚠️ No active queue entry found for PO #${vendorPoId} Line #${lineNumber} to sync`);
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
        // Calculate required quantity: P2 PO quantity × BOM qty_per
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

        // Create manufacturing queue entry
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
