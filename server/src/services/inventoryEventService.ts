import { db } from '../../db';
import { inventoryItems, inventoryTransactions, inventoryBalances } from '../../schema';
import { eq, and, sql } from 'drizzle-orm';
import { isInventoryBalanceEligible, inventoryBalanceIneligibilityReason } from '@shared/inventoryBalanceEligibility';
import {
  recordInventoryBalanceLedgerChange,
  type InventoryLedgerTransactionType,
} from './inventoryTransactionLedgerService';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  lotId?: string | null;
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

function toLedgerTransactionType(eventType: InventoryEventType): InventoryLedgerTransactionType {
  switch (eventType) {
    case 'receipt':
    case 'receipt_pending':
      return 'RECEIVE';
    case 'putaway':
      return 'MOVE';
    case 'consumption':
      return 'CONSUME';
    case 'transfer':
      return 'TRANSFER';
    case 'adjustment':
      return 'ADJUST';
    case 'return':
      return 'RETURN';
    case 'issue':
      return 'ISSUE';
    default:
      return 'ADJUST';
  }
}

export async function createInventoryEvent(params: InventoryEventParams): Promise<void> {
  const {
    agPartNumber,
    eventType,
    quantity,
    lotId,
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

  await db.transaction(async (tx) => {
  const [item] = await tx
    .select({
      agPartNumber: inventoryItems.agPartNumber,
      utilizedInNonInventory: inventoryItems.utilizedInNonInventory,
      utilizedInServices: inventoryItems.utilizedInServices,
      type: inventoryItems.type,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.agPartNumber, agPartNumber));

  if (!item) {
    throw new Error(`Part number ${agPartNumber} not found in inventory_items`);
  }
  if (eventType !== 'receipt_pending' && !isInventoryBalanceEligible(item)) {
    const reason = inventoryBalanceIneligibilityReason(item);
    throw new Error(
      `${reason === 'NON_INVENTORY' ? 'Non-Inventory' : 'Service'} item ${agPartNumber} cannot create or change an inventory balance`
    );
  }

  const totalCost =
    costPerUnit != null ? String((costPerUnit * Math.abs(quantity)).toFixed(2)) : null;

  await tx.insert(inventoryTransactions).values({
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
      const change = await upsertBalance(agPartNumber, fromLocation, -Math.abs(quantity), tx);
      await recordInventoryBalanceLedgerChange({
        agPartNumber,
        transactionType: 'TRANSFER',
        lotId,
        locationId: fromLocation,
        quantityDelta: change.delta,
        quantityBefore: change.before,
        quantityAfter: change.after,
        unitOfMeasure,
        performedBy,
        referenceType,
        referenceId,
        notes,
        metadata,
      }, tx);
    }
    if (toLocation) {
      const change = await upsertBalance(agPartNumber, toLocation, Math.abs(quantity), tx);
      await recordInventoryBalanceLedgerChange({
        agPartNumber,
        transactionType: 'TRANSFER',
        lotId,
        locationId: toLocation,
        quantityDelta: change.delta,
        quantityBefore: change.before,
        quantityAfter: change.after,
        unitOfMeasure,
        performedBy,
        referenceType,
        referenceId,
        notes,
        metadata,
      }, tx);
    }
    return;
  }

  if (eventType === 'receipt' || eventType === 'putaway' || eventType === 'adjustment') {
    const location = toLocation || fromLocation || MAIN_WAREHOUSE_LOCATION;
    const change = await upsertBalance(agPartNumber, location, quantity, tx);
    await recordInventoryBalanceLedgerChange({
      agPartNumber,
      transactionType: toLedgerTransactionType(eventType),
      lotId,
      locationId: location,
      quantityDelta: change.delta,
      quantityBefore: change.before,
      quantityAfter: change.after,
      unitOfMeasure,
      performedBy,
      referenceType,
      referenceId,
      notes,
      metadata,
    }, tx);

    if (eventType === 'putaway' && fromLocation && fromLocation !== location) {
      const sourceChange = await upsertBalance(agPartNumber, fromLocation, -Math.abs(quantity), tx);
      await recordInventoryBalanceLedgerChange({
        agPartNumber,
        transactionType: 'MOVE',
        lotId,
        locationId: fromLocation,
        quantityDelta: sourceChange.delta,
        quantityBefore: sourceChange.before,
        quantityAfter: sourceChange.after,
        unitOfMeasure,
        performedBy,
        referenceType,
        referenceId,
        notes,
        metadata,
      }, tx);
    }
    return;
  }

  if (eventType === 'consumption' || eventType === 'issue') {
    const location = fromLocation || MAIN_WAREHOUSE_LOCATION;
    const change = await upsertBalance(agPartNumber, location, -Math.abs(quantity), tx);
    await recordInventoryBalanceLedgerChange({
      agPartNumber,
      transactionType: toLedgerTransactionType(eventType),
      lotId,
      locationId: location,
      quantityDelta: change.delta,
      quantityBefore: change.before,
      quantityAfter: change.after,
      unitOfMeasure,
      performedBy,
      referenceType,
      referenceId,
      notes,
      metadata,
    }, tx);
    return;
  }

  if (eventType === 'return') {
    const location = toLocation || MAIN_WAREHOUSE_LOCATION;
    const change = await upsertBalance(agPartNumber, location, Math.abs(quantity), tx);
    await recordInventoryBalanceLedgerChange({
      agPartNumber,
      transactionType: 'RETURN',
      lotId,
      locationId: location,
      quantityDelta: change.delta,
      quantityBefore: change.before,
      quantityAfter: change.after,
      unitOfMeasure,
      performedBy,
      referenceType,
      referenceId,
      notes,
      metadata,
    }, tx);
    return;
  }
  });
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

}

async function upsertBalance(
  agPartNumber: string,
  locationId: string,
  delta: number,
  runner: DbTransaction | typeof db = db,
): Promise<{ before: number; delta: number; after: number }> {
  const [existing] = await runner
    .select({ id: inventoryBalances.id, quantityOnHand: inventoryBalances.quantityOnHand })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.agPartNumber, agPartNumber),
        eq(inventoryBalances.locationId, locationId)
      )
    );

  if (existing) {
    const before = existing.quantityOnHand;
    const after = Math.max(0, before + delta);
    await runner
      .update(inventoryBalances)
      .set({
        quantityOnHand: sql`GREATEST(0, ${inventoryBalances.quantityOnHand} + ${delta})`,
        quantityAvailable: sql`GREATEST(0, GREATEST(0, ${inventoryBalances.quantityOnHand} + ${delta}) - ${inventoryBalances.quantityAllocated})`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryBalances.id, existing.id));
    return { before, delta: after - before, after };
  } else {
    const onHand = Math.max(0, delta);
    await runner.insert(inventoryBalances).values({
      agPartNumber,
      locationId,
      quantityOnHand: onHand,
      quantityAllocated: 0,
      quantityAvailable: onHand,
    });
    return { before: 0, delta: onHand, after: onHand };
  }
}
