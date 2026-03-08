import { db } from '../../db';
import { inventoryItems, inventoryTransactions, inventoryBalances } from '../../schema';
import { eq, and, sql } from 'drizzle-orm';

export const RECEIVING_LOCATION = 'RECEIVING';
export const MAIN_WAREHOUSE_LOCATION = 'WAREHOUSE-MAIN';

export type InventoryEventType =
  | 'receipt'
  | 'receipt_pending'
  | 'putaway'
  | 'consumption'
  | 'transfer'
  | 'adjustment'
  | 'return'
  | 'issue';

export interface InventoryEventParams {
  agPartNumber: string;
  eventType: InventoryEventType;
  quantity: number;
  unitOfMeasure?: string;
  fromLocation?: string | null;
  toLocation?: string | null;
  referenceType?: string;
  referenceId?: number | string;
  costPerUnit?: number;
  performedBy?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  transactionDate?: Date;
}

export async function createInventoryEvent(params: InventoryEventParams): Promise<void> {
  const {
    agPartNumber,
    eventType,
    quantity,
    unitOfMeasure,
    fromLocation,
    toLocation,
    referenceType,
    referenceId,
    costPerUnit,
    performedBy,
    notes,
    metadata,
    transactionDate,
  } = params;

  if (quantity === 0) {
    throw new Error(`Inventory event quantity cannot be zero for part ${agPartNumber}`);
  }

  const isDeduction = eventType === 'consumption' || eventType === 'issue';
  if (quantity < 0 && !isDeduction && eventType !== 'adjustment') {
    throw new Error(
      `Negative quantity only allowed for consumption, issue, or adjustment. Got eventType=${eventType} qty=${quantity}`
    );
  }

  const [item] = await db
    .select({ agPartNumber: inventoryItems.agPartNumber })
    .from(inventoryItems)
    .where(eq(inventoryItems.agPartNumber, agPartNumber));

  if (!item) {
    throw new Error(`Part number ${agPartNumber} not found in inventory_items`);
  }

  const totalCost =
    costPerUnit != null ? String((costPerUnit * Math.abs(quantity)).toFixed(2)) : null;

  await db.insert(inventoryTransactions).values({
    agPartNumber,
    transactionType: eventType,
    quantity,
    unitOfMeasure: unitOfMeasure ?? null,
    fromLocation: fromLocation ?? null,
    toLocation: toLocation ?? null,
    referenceType: referenceType ?? null,
    referenceId: referenceId != null ? String(referenceId) : null,
    costPerUnit: costPerUnit != null ? String(costPerUnit.toFixed(2)) : null,
    totalCost,
    notes: notes ?? null,
    performedBy: performedBy ?? 'system',
    metadata: metadata ?? null,
    transactionDate: transactionDate ?? new Date(),
  });

  console.info('Inventory Event', {
    part: agPartNumber,
    type: eventType,
    qty: quantity,
    location: toLocation || fromLocation,
  });

  if (eventType === 'receipt_pending') {
    return;
  }

  if (eventType === 'transfer') {
    if (fromLocation) {
      await upsertBalance(agPartNumber, fromLocation, -Math.abs(quantity));
    }
    if (toLocation) {
      await upsertBalance(agPartNumber, toLocation, Math.abs(quantity));
    }
    return;
  }

  if (eventType === 'receipt' || eventType === 'putaway' || eventType === 'adjustment') {
    const location = toLocation || fromLocation || MAIN_WAREHOUSE_LOCATION;
    await upsertBalance(agPartNumber, location, quantity);
    return;
  }

  if (eventType === 'consumption' || eventType === 'issue') {
    const location = fromLocation || MAIN_WAREHOUSE_LOCATION;
    await upsertBalance(agPartNumber, location, -Math.abs(quantity));
    return;
  }

  if (eventType === 'return') {
    const location = toLocation || MAIN_WAREHOUSE_LOCATION;
    await upsertBalance(agPartNumber, location, Math.abs(quantity));
    return;
  }
}

export async function putAwayInventory(params: {
  agPartNumber: string;
  quantity: number;
  fromLocation?: string;
  toLocation: string;
  performedBy?: string;
  notes?: string;
  referenceType?: string;
  referenceId?: number | string;
}): Promise<void> {
  const { agPartNumber, quantity, fromLocation = RECEIVING_LOCATION, toLocation, performedBy, notes, referenceType, referenceId } = params;

  await createInventoryEvent({
    agPartNumber,
    eventType: 'putaway',
    quantity,
    fromLocation,
    toLocation,
    performedBy,
    notes,
    referenceType,
    referenceId,
  });

  await upsertBalance(agPartNumber, fromLocation, -Math.abs(quantity));
}

async function upsertBalance(
  agPartNumber: string,
  locationId: string,
  delta: number
): Promise<void> {
  const [existing] = await db
    .select({ id: inventoryBalances.id })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.agPartNumber, agPartNumber),
        eq(inventoryBalances.locationId, locationId)
      )
    );

  if (existing) {
    await db
      .update(inventoryBalances)
      .set({
        quantityOnHand: sql`${inventoryBalances.quantityOnHand} + ${delta}`,
        quantityAvailable: sql`GREATEST(0, (${inventoryBalances.quantityOnHand} + ${delta}) - ${inventoryBalances.quantityAllocated})`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryBalances.id, existing.id));
  } else {
    const onHand = Math.max(0, delta);
    await db.insert(inventoryBalances).values({
      agPartNumber,
      locationId,
      quantityOnHand: onHand,
      quantityAllocated: 0,
      quantityAvailable: onHand,
    });
  }
}
