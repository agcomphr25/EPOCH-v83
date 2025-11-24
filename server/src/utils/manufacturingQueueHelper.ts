import { db } from '../../db';
import { inventoryItems, manufacturingQueue } from '../../schema';
import { insertManufacturingQueueSchema } from '../../schema';
import { eq, and, or } from 'drizzle-orm';

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
