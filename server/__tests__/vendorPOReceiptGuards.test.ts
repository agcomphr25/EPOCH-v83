/**
 * Tests for the guard clauses inside recordVendorPOReceipt that prevent
 * silent data loss when a receipt references a missing line item or a
 * missing parent vendor PO.
 *
 * These tests intercept the DB layer so no real database connection is
 * required.  The mock structure mirrors vendorPOReceiptStatus.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

interface WhereChain {
  where: (cond: unknown) => Promise<Record<string, unknown>[]>;
}
interface FromChain {
  from: (table: unknown) => WhereChain;
}

// ── Module mocks (hoisted by Vitest before any import) ───────────────────────

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
  pool: {},
}));

vi.mock('../src/services/inventoryEventService.js', () => ({
  createInventoryEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/utils/manufacturingQueueHelper', () => ({
  autoPopulateManufacturingQueue: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Fixture helpers ──────────────────────────────────────────────────────────

const PO_ID = 42;
const LINE_ITEM_ID = 7;
const VENDOR_ID = 3;
const AG_PART = 'AG-WIDGET-001';
const PAST_DATE = new Date('2025-12-01T00:00:00Z');

/** Minimal PO line item row — includes agPartNumber so the COGS guard is bypassed. */
const basePOLineItem: Record<string, unknown> = {
  id: LINE_ITEM_ID,
  agPartNumber: AG_PART,
  unitPrice: null,
  vendorPoId: PO_ID,
};

/** Minimal vendorPO row. */
const baseVendorPO: Record<string, unknown> = { vendorId: VENDOR_ID };

/**
 * Build the `db.select().from(table).where(cond)` chain mock that resolves
 * to the given rows.
 */
function selectWhere(rows: Record<string, unknown>[]): FromChain {
  const whereFn = vi.fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => WhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('recordVendorPOReceipt — missing-reference guards', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it('throws a "not found" error when the poLineItemId does not exist', async () => {
    // The first db.select() call returns an empty array — no line item.
    vi.mocked(db.select).mockReturnValueOnce(selectWhere([]));

    await expect(
      storage.recordVendorPOReceipt({
        poLineItemId: LINE_ITEM_ID,
        receivedQuantity: 5,
        receivedDate: PAST_DATE,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('throws a "not found" error when the line item exists but its parent vendor PO does not', async () => {
    // First call: line item is found.
    // Second call: parent vendor PO is missing.
    vi.mocked(db.select)
      .mockReturnValueOnce(selectWhere([basePOLineItem]))
      .mockReturnValueOnce(selectWhere([]));

    await expect(
      storage.recordVendorPOReceipt({
        poLineItemId: LINE_ITEM_ID,
        receivedQuantity: 5,
        receivedDate: PAST_DATE,
      }),
    ).rejects.toThrow(/not found/i);
  });
});
