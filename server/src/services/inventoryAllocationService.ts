import { db } from '../../db';
import { inventoryBalances, inventoryTransactions } from '../../schema';
import { eq, and, sql } from 'drizzle-orm';

// ── Shared param types ────────────────────────────────────────────────────────

interface AllocationParams {
  agPartNumber: string;
  quantity: number;
  locationId: string;
  referenceType?: string;
  referenceId?: string | number;
  performedBy?: string;
  notes?: string;
  allowPartial?: boolean;
}

interface AllocationResult {
  allocated: number;
  remaining: number;
  quantityOnHand: number;
  quantityAllocated: number;
  quantityAvailable: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function refId(val: string | number | undefined): string | null {
  return val != null ? String(val) : null;
}

// ── allocateInventory ─────────────────────────────────────────────────────────
// Reserves quantity from available stock.
// Increments quantity_allocated, recomputes quantity_available.
// Inserts an "allocation" transaction record.
// Throws if quantity_available < quantity (unless allowPartial is true).

export async function allocateInventory(params: AllocationParams): Promise<AllocationResult> {
  const {
    agPartNumber,
    quantity,
    locationId,
    referenceType,
    referenceId,
    performedBy = 'system',
    notes,
    allowPartial = false,
  } = params;

  if (quantity <= 0) {
    throw new Error(`allocateInventory: quantity must be positive, got ${quantity}`);
  }

  return db.transaction(async (tx) => {
    // Lock the row for update to prevent concurrent over-allocation
    const [row] = await tx
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.agPartNumber, agPartNumber),
          eq(inventoryBalances.locationId, locationId)
        )
      )
      .for('update');

    if (!row) {
      throw new Error(
        `allocateInventory: no balance record found for part ${agPartNumber} at location ${locationId}`
      );
    }

    const canAllocate = row.quantityAvailable ?? 0;

    if (canAllocate <= 0 && !allowPartial) {
      throw new Error(
        `allocateInventory: insufficient available stock for ${agPartNumber} at ${locationId}. ` +
          `Requested ${quantity}, available ${canAllocate}`
      );
    }

    if (canAllocate < quantity && !allowPartial) {
      throw new Error(
        `allocateInventory: insufficient available stock for ${agPartNumber} at ${locationId}. ` +
          `Requested ${quantity}, available ${canAllocate}`
      );
    }

    const toAllocate = allowPartial ? Math.min(quantity, Math.max(0, canAllocate)) : quantity;

    if (toAllocate === 0) {
      return {
        allocated: 0,
        remaining: quantity,
        quantityOnHand: row.quantityOnHand,
        quantityAllocated: row.quantityAllocated ?? 0,
        quantityAvailable: row.quantityAvailable ?? 0,
      };
    }

    // Update: allocated += toAllocate, available = on_hand - new_allocated
    const [updated] = await tx
      .update(inventoryBalances)
      .set({
        quantityAllocated: sql`${inventoryBalances.quantityAllocated} + ${toAllocate}`,
        quantityAvailable: sql`GREATEST(0, ${inventoryBalances.quantityOnHand} - (${inventoryBalances.quantityAllocated} + ${toAllocate}))`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryBalances.id, row.id))
      .returning();

    // Insert audit transaction
    await tx.insert(inventoryTransactions).values({
      agPartNumber,
      transactionType: 'allocation',
      quantity: toAllocate,
      fromLocation: null,
      toLocation: locationId,
      referenceType: referenceType ?? null,
      referenceId: refId(referenceId),
      performedBy,
      notes: notes ?? null,
      transactionDate: new Date(),
    });

    return {
      allocated: toAllocate,
      remaining: quantity - toAllocate,
      quantityOnHand: updated.quantityOnHand,
      quantityAllocated: updated.quantityAllocated ?? 0,
      quantityAvailable: updated.quantityAvailable ?? 0,
    };
  });
}

// ── deallocateInventory ───────────────────────────────────────────────────────
// Releases a previously allocated reservation.
// Decrements quantity_allocated, recomputes quantity_available.
// Inserts a "deallocation" transaction record.

export async function deallocateInventory(
  params: Omit<AllocationParams, 'allowPartial'>
): Promise<AllocationResult> {
  const {
    agPartNumber,
    quantity,
    locationId,
    referenceType,
    referenceId,
    performedBy = 'system',
    notes,
  } = params;

  if (quantity <= 0) {
    throw new Error(`deallocateInventory: quantity must be positive, got ${quantity}`);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.agPartNumber, agPartNumber),
          eq(inventoryBalances.locationId, locationId)
        )
      )
      .for('update');

    if (!row) {
      throw new Error(
        `deallocateInventory: no balance record found for part ${agPartNumber} at location ${locationId}`
      );
    }

    const currentAllocated = row.quantityAllocated ?? 0;

    if (currentAllocated < quantity) {
      throw new Error(
        `deallocateInventory: cannot release ${quantity} units for ${agPartNumber} — ` +
          `only ${currentAllocated} are currently allocated`
      );
    }

    const [updated] = await tx
      .update(inventoryBalances)
      .set({
        quantityAllocated: sql`${inventoryBalances.quantityAllocated} - ${quantity}`,
        quantityAvailable: sql`GREATEST(0, ${inventoryBalances.quantityOnHand} - (${inventoryBalances.quantityAllocated} - ${quantity}))`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryBalances.id, row.id))
      .returning();

    await tx.insert(inventoryTransactions).values({
      agPartNumber,
      transactionType: 'deallocation',
      quantity,
      fromLocation: locationId,
      toLocation: null,
      referenceType: referenceType ?? null,
      referenceId: refId(referenceId),
      performedBy,
      notes: notes ?? null,
      transactionDate: new Date(),
    });

    return {
      allocated: quantity,
      remaining: 0,
      quantityOnHand: updated.quantityOnHand,
      quantityAllocated: updated.quantityAllocated ?? 0,
      quantityAvailable: updated.quantityAvailable ?? 0,
    };
  });
}

// ── consumeAllocatedInventory ─────────────────────────────────────────────────
// Converts an existing allocation to actual consumption.
// Decrements both quantity_allocated AND quantity_on_hand.
// quantity_available remains unchanged (allocated and on_hand decrease equally).
// Inserts a "consumption" transaction record.
// Caller is responsible for ensuring allocation exists before calling.

export async function consumeAllocatedInventory(
  params: Omit<AllocationParams, 'allowPartial'>
): Promise<AllocationResult> {
  const {
    agPartNumber,
    quantity,
    locationId,
    referenceType,
    referenceId,
    performedBy = 'system',
    notes,
  } = params;

  if (quantity <= 0) {
    throw new Error(`consumeAllocatedInventory: quantity must be positive, got ${quantity}`);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.agPartNumber, agPartNumber),
          eq(inventoryBalances.locationId, locationId)
        )
      )
      .for('update');

    if (!row) {
      throw new Error(
        `consumeAllocatedInventory: no balance record found for part ${agPartNumber} at location ${locationId}`
      );
    }

    const currentAllocated = row.quantityAllocated ?? 0;
    const currentOnHand = row.quantityOnHand;

    if (currentAllocated < quantity) {
      throw new Error(
        `consumeAllocatedInventory: cannot consume ${quantity} units for ${agPartNumber} — ` +
          `only ${currentAllocated} are allocated (did you call allocateInventory first?)`
      );
    }

    if (currentOnHand < quantity) {
      throw new Error(
        `consumeAllocatedInventory: on_hand (${currentOnHand}) is less than consumption quantity (${quantity}) ` +
          `for ${agPartNumber} — data integrity issue`
      );
    }

    // Both on_hand and allocated decrease by the same amount.
    // quantity_available = (on_hand - qty) - (allocated - qty) = on_hand - allocated (unchanged)
    const [updated] = await tx
      .update(inventoryBalances)
      .set({
        quantityOnHand: sql`${inventoryBalances.quantityOnHand} - ${quantity}`,
        quantityAllocated: sql`${inventoryBalances.quantityAllocated} - ${quantity}`,
        quantityAvailable: sql`GREATEST(0, (${inventoryBalances.quantityOnHand} - ${quantity}) - (${inventoryBalances.quantityAllocated} - ${quantity}))`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryBalances.id, row.id))
      .returning();

    await tx.insert(inventoryTransactions).values({
      agPartNumber,
      transactionType: 'consumption',
      quantity: -quantity,
      fromLocation: locationId,
      toLocation: null,
      referenceType: referenceType ?? null,
      referenceId: refId(referenceId),
      performedBy,
      notes: notes ?? null,
      transactionDate: new Date(),
    });

    return {
      allocated: quantity,
      remaining: 0,
      quantityOnHand: updated.quantityOnHand,
      quantityAllocated: updated.quantityAllocated ?? 0,
      quantityAvailable: updated.quantityAvailable ?? 0,
    };
  });
}
