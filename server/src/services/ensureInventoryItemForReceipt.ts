/**
 * ensureInventoryItemForReceipt (Task #248)
 *
 * Helper for receiving entry points to guarantee an `inventory_items` row
 * exists for a given AG part number BEFORE writing to the
 * `inventory_transaction_ledger` (whose `inventory_item_id` FK is NOT NULL).
 *
 * Background: receiving previously contained "silent skip" branches that
 * `console.warn`'d and skipped the ITL write when no inventory_items row was
 * found. That allowed receipts (e.g. the Rock West `RCV-20260514-001` lot)
 * to land in `material_lots` / vendor PO state but never appear in the
 * Inventory Transactions list, breaking the receiving → ledger invariant.
 *
 * Behavior:
 *   - If a row with the given agPartNumber exists, return it (no write).
 *   - If none exists and an agPartNumber is supplied, INSERT a minimal
 *     placeholder row using the supplied fallback metadata and return it.
 *     The placeholder is fully editable by users in Parts Management later.
 *   - If agPartNumber is null/empty, throw — there is no part to track.
 *
 * Idempotency: the underlying SELECT happens first within the same
 * transaction; under concurrency the unique index on `ag_part_number`
 * guarantees one row, and a duplicate insert is retried as a fetch.
 */

import { eq } from 'drizzle-orm';
import { inventoryItems } from '../../schema';
import type { db as Db } from '../../db';

type Tx = Pick<typeof Db, 'select' | 'insert'>;

export interface EnsureInventoryItemArgs {
  agPartNumber: string;
  /** Display name fallback when creating; defaults to the part number. */
  fallbackName?: string | null;
  /** Optional source/vendor name for traceability. */
  source?: string | null;
  supplierPartNumber?: string | null;
  /** Optional vendor id to seed the primary vendor reference. */
  vendorId?: number | null;
  /** Where the auto-create was triggered (for notes audit). */
  createdBy?: string | null;
}

export interface EnsuredInventoryItem {
  id: number;
  agPartNumber: string;
  name: string;
  purchaseUnit: string | null;
  usageUnit: string | null;
  /** True if a new row was inserted by this call. */
  created: boolean;
}

export async function ensureInventoryItemForReceipt(
  tx: Tx,
  args: EnsureInventoryItemArgs,
): Promise<EnsuredInventoryItem> {
  const partNumber = (args.agPartNumber ?? '').trim();
  if (!partNumber) {
    throw new Error(
      'ensureInventoryItemForReceipt: agPartNumber is required — receipts without a part number cannot be ledgered',
    );
  }

  const existingRows = await tx
    .select({
      id: inventoryItems.id,
      agPartNumber: inventoryItems.agPartNumber,
      name: inventoryItems.name,
      purchaseUnit: inventoryItems.purchaseUnit,
      usageUnit: inventoryItems.usageUnit,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.agPartNumber, partNumber))
    .limit(1);

  if (existingRows[0]) {
    return { ...existingRows[0], created: false };
  }

  const name = (args.fallbackName ?? '').trim() || partNumber;
  const noteParts = [
    `Auto-created from receiving (Task #248).`,
    args.createdBy ? `Triggered by: ${args.createdBy}` : null,
    'Edit Parts Management to fill purchase/usage unit and other metadata.',
  ].filter(Boolean);

  try {
    const [inserted] = await tx
      .insert(inventoryItems)
      .values({
        agPartNumber: partNumber,
        name,
        source: args.source ?? null,
        supplierPartNumber: args.supplierPartNumber ?? null,
        vendorId: args.vendorId ?? null,
        notes: noteParts.join(' '),
        isActive: true,
      })
      .returning({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        purchaseUnit: inventoryItems.purchaseUnit,
        usageUnit: inventoryItems.usageUnit,
      });

    if (!inserted) {
      throw new Error('ensureInventoryItemForReceipt: insert returned no row');
    }
    return { ...inserted, created: true };
  } catch (err) {
    // Concurrent race: another transaction inserted first. Re-fetch.
    const retry = await tx
      .select({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        purchaseUnit: inventoryItems.purchaseUnit,
        usageUnit: inventoryItems.usageUnit,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.agPartNumber, partNumber))
      .limit(1);
    if (retry[0]) {
      return { ...retry[0], created: false };
    }
    throw err;
  }
}
