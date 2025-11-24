import { db } from '../../db';
import { inventoryItems, manufacturingQueue } from '../../schema';
import { insertManufacturingQueueSchema } from '../../schema';
import { eq, and, or } from 'drizzle-orm';

/**
 * Auto-populates manufacturing queue when a vendor PO item is created for a manufactured part
 * 
 * @param poItemData - The vendor PO item data containing agPartNumber, quantity, vendorPoId, lineNumber
 * @param vendorPO - The vendor PO object (optional, for extracting due date)
 * @returns The created queue item or null if not applicable
 */
export async function autoPopulateManufacturingQueue(
  poItemData: {
    agPartNumber: string | null;
    quantity: number;
    vendorPoId: number;
    lineNumber: number;
  },
  vendorPO?: {
    expectedDeliveryDate?: string | null;
  } | null
): Promise<any | null> {
  try {
    // Skip if no part number
    if (!poItemData.agPartNumber) {
      return null;
    }

    // Query inventory item to check if it's manufactured
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.agPartNumber, poItemData.agPartNumber),
    });

    // Only proceed if item is manufactured and has a manufacturing department
    if (!inventoryItem || 
        inventoryItem.type !== 'Manufactured' || 
        !inventoryItem.manufacturingDepartment) {
      return null;
    }

    // Check for existing queue entries for this PO line to prevent duplicates
    // Look for entries that reference this PO and are not cancelled/completed
    const existingQueueEntry = await db.query.manufacturingQueue.findFirst({
      where: and(
        eq(manufacturingQueue.inventoryItemId, inventoryItem.id),
        or(
          eq(manufacturingQueue.status, 'PENDING'),
          eq(manufacturingQueue.status, 'IN_PROGRESS')
        ),
        // Match by notes containing the PO reference (not ideal but works for now)
        // TODO: Add vendorPoId and lineNumber columns to manufacturingQueue table for better tracking
      ),
    });

    if (existingQueueEntry) {
      console.log(`Skipping duplicate queue entry for ${inventoryItem.agPartNumber} - existing entry found (ID: ${existingQueueEntry.id})`);
      return null;
    }

    // Create manufacturing queue entry
    const queueData = insertManufacturingQueueSchema.parse({
      inventoryItemId: inventoryItem.id,
      department: inventoryItem.manufacturingDepartment,
      quantityRequested: poItemData.quantity,
      quantityCompleted: 0,
      status: 'PENDING',
      priority: 50, // Default medium priority
      dueDate: vendorPO?.expectedDeliveryDate || null,
      assignedTo: null,
      notes: `Auto-generated from Vendor PO #${poItemData.vendorPoId}, Line #${poItemData.lineNumber}`,
    });

    const [newQueueItem] = await db
      .insert(manufacturingQueue)
      .values(queueData)
      .returning();

    console.log(`✅ Auto-created manufacturing queue entry for ${inventoryItem.agPartNumber} in ${inventoryItem.manufacturingDepartment} (Queue ID: ${newQueueItem.id})`);
    
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

    // Find the related queue entry by notes (contains PO reference)
    // TODO: Improve this with proper foreign key relationships
    const queueEntries = await db.query.manufacturingQueue.findMany({
      where: or(
        eq(manufacturingQueue.status, 'PENDING'),
        eq(manufacturingQueue.status, 'IN_PROGRESS')
      ),
    });

    // Filter by notes containing the PO reference
    const matchingEntry = queueEntries.find(entry => 
      entry.notes?.includes(`Vendor PO #${vendorPoId}`) && 
      entry.notes?.includes(`Line #${lineNumber}`)
    );

    if (matchingEntry) {
      // Update the requested quantity
      await db
        .update(manufacturingQueue)
        .set({ 
          quantityRequested: newQuantity,
          updatedAt: new Date()
        })
        .where(eq(manufacturingQueue.id, matchingEntry.id));

      console.log(`✅ Synced manufacturing queue (ID: ${matchingEntry.id}) quantity from ${oldQuantity} to ${newQuantity}`);
    }
  } catch (error) {
    console.error('❌ Failed to sync manufacturing queue on PO update:', error);
  }
}
