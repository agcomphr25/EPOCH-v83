/**
 * Tests for the PO status auto-promotion inside recordVendorPOReceipt.
 *
 * Each call to recordVendorPOReceipt runs a DB transaction that:
 *   1. Updates the received-quantity on the target line item.
 *   2. Re-reads ALL line items for the PO.
 *   3. Derives the new PO status:
 *        - none received        → "Sent"
 *        - some but not all     → "Partially Received"
 *        - every line satisfied → "Fully Received"
 *   4. Persists the derived status to the vendorPOs row.
 *
 * These tests intercept the DB layer so no real database connection is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

interface WhereChain {
  where: (cond: unknown) => Promise<Record<string, unknown>[]>;
}
interface FromChain {
  from: (table: unknown) => WhereChain;
}
interface UpdateWhereChain {
  where: (cond: unknown) => void | Promise<void>;
}
interface UpdateSetChain {
  set: (data: unknown) => UpdateWhereChain;
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

// Prevent dynamic imports inside recordVendorPOReceipt from failing.
// COGS calculation is only attempted when the inventory item has full config;
// we deliberately omit those fields so the block is skipped entirely.
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

/**
 * Build the `db.select().from(table).where(cond)` chain mock that resolves to
 * the given rows.
 */
function selectWhere(rows: Record<string, unknown>[]): FromChain {
  const whereFn = vi.fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => WhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

/**
 * Build the `db.update(table).set({}).where(cond)` chain mock.
 */
function updateWhere(): UpdateSetChain {
  const whereFn = vi.fn<(cond: unknown) => void>().mockResolvedValue(undefined);
  const setFn = vi.fn<(data: unknown) => UpdateWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { set: setFn };
}

/**
 * The minimal PO line item row returned by the first db.select() call.
 * Intentionally omits unitPrice so COGS is skipped.
 */
const basePOLineItem: Record<string, unknown> = {
  id: LINE_ITEM_ID,
  agPartNumber: AG_PART,
  unitPrice: null,
  vendorPoId: PO_ID,
};

/** Minimal vendorPO row (only vendorId is selected). */
const baseVendorPO: Record<string, unknown> = { vendorId: VENDOR_ID };

/**
 * Configure the three outer db.select() calls that happen before the
 * transaction:
 *   call 1 — fetch the PO line item
 *   call 2 — fetch the vendor PO
 *   call 3 — fetch the inventory item (we return an empty array so COGS
 *             config is treated as missing and the block is skipped)
 */
function setupOuterSelects(): void {
  vi.mocked(db.select)
    .mockReturnValueOnce(selectWhere([basePOLineItem]))  // PO line item
    .mockReturnValueOnce(selectWhere([baseVendorPO]))    // vendor PO
    .mockReturnValueOnce(selectWhere([]));               // inventory item (absent)
}

/**
 * Wire up db.transaction so it runs the callback immediately with a mock `tx`
 * object whose select chain returns `lineItemsAfterUpdate`.
 *
 * The tx.update calls (one for vendorPOItems, one for vendorPOs) are both
 * captured so we can assert on the value passed to tx.update(vendorPOs).set().
 */
function setupTransaction(
  lineItemsAfterUpdate: { quantity: number; receivedQuantity: number }[]
): { poStatusSpy: ReturnType<typeof vi.fn> } {
  // Spy to capture the argument passed to tx.update(vendorPOs).set(...)
  const poStatusSpy = vi.fn<(data: unknown) => UpdateWhereChain>();
  poStatusSpy.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

  // Spy for the line-item update — we don't assert on it, just let it pass.
  const lineItemSetFn = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  // tx.select().from().where() → lineItemsAfterUpdate
  const txSelectWhere = vi.fn<(cond: unknown) => Promise<typeof lineItemsAfterUpdate>>()
    .mockResolvedValue(lineItemsAfterUpdate);
  const txSelectFrom = vi.fn().mockReturnValue({ where: txSelectWhere });
  const txSelect = vi.fn().mockReturnValue({ from: txSelectFrom });

  // tx.update() is called twice: vendorPOItems first, vendorPOs second.
  const txUpdate = vi.fn()
    .mockReturnValueOnce({ set: lineItemSetFn })    // vendorPOItems update
    .mockReturnValueOnce({ set: poStatusSpy });     // vendorPOs status update

  const mockTx = { select: txSelect, update: txUpdate };

  vi.mocked(db.transaction).mockImplementation(async (cb: (tx: typeof mockTx) => Promise<void>) => {
    return cb(mockTx);
  });

  return { poStatusSpy };
}

// ── Test params ──────────────────────────────────────────────────────────────

const PAST_DATE = new Date('2025-12-01T00:00:00Z');

// ── Suite ────────────────────────────────────────────────────────────────────

describe('recordVendorPOReceipt — PO status auto-promotion', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it('sets PO status to "Partially Received" when only some lines are fully received', async () => {
    setupOuterSelects();

    // After recording qty 5 for line 1, the PO has two lines:
    //   line 1: qty=10, received=5  (partial)
    //   line 2: qty=10, received=0  (nothing received yet)
    const { poStatusSpy } = setupTransaction([
      { quantity: 10, receivedQuantity: 5 },
      { quantity: 10, receivedQuantity: 0 },
    ]);

    await storage.recordVendorPOReceipt({
      poLineItemId: LINE_ITEM_ID,
      receivedQuantity: 5,
      receivedDate: PAST_DATE,
    });

    expect(poStatusSpy).toHaveBeenCalledOnce();
    const setArg = poStatusSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.status).toBe('Partially Received');
  });

  it('sets PO status to "Fully Received" when every line has been received in full', async () => {
    setupOuterSelects();

    // After recording qty 10 for line 2, both lines are fully received.
    const { poStatusSpy } = setupTransaction([
      { quantity: 10, receivedQuantity: 10 },
      { quantity: 10, receivedQuantity: 10 },
    ]);

    await storage.recordVendorPOReceipt({
      poLineItemId: LINE_ITEM_ID,
      receivedQuantity: 10,
      receivedDate: PAST_DATE,
    });

    expect(poStatusSpy).toHaveBeenCalledOnce();
    const setArg = poStatusSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.status).toBe('Fully Received');
  });

  it('keeps PO status at "Sent" when no lines have been received after the update', async () => {
    setupOuterSelects();

    // Edge case: received quantity recorded as 0 leaves nothing received.
    const { poStatusSpy } = setupTransaction([
      { quantity: 10, receivedQuantity: 0 },
      { quantity: 5,  receivedQuantity: 0 },
    ]);

    await storage.recordVendorPOReceipt({
      poLineItemId: LINE_ITEM_ID,
      receivedQuantity: 0,
      receivedDate: PAST_DATE,
    });

    expect(poStatusSpy).toHaveBeenCalledOnce();
    const setArg = poStatusSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.status).toBe('Sent');
  });

  it('sets PO status to "Partially Received" for a single-line PO that has been partially fulfilled', async () => {
    setupOuterSelects();

    // Single line, qty=20, received=15 — not yet complete.
    const { poStatusSpy } = setupTransaction([
      { quantity: 20, receivedQuantity: 15 },
    ]);

    await storage.recordVendorPOReceipt({
      poLineItemId: LINE_ITEM_ID,
      receivedQuantity: 15,
      receivedDate: PAST_DATE,
    });

    expect(poStatusSpy).toHaveBeenCalledOnce();
    const setArg = poStatusSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.status).toBe('Partially Received');
  });

  it('sets PO status to "Fully Received" for a single-line PO once it is completely received', async () => {
    setupOuterSelects();

    // Single line, qty=20, received=20 — fully done.
    const { poStatusSpy } = setupTransaction([
      { quantity: 20, receivedQuantity: 20 },
    ]);

    await storage.recordVendorPOReceipt({
      poLineItemId: LINE_ITEM_ID,
      receivedQuantity: 20,
      receivedDate: PAST_DATE,
    });

    expect(poStatusSpy).toHaveBeenCalledOnce();
    const setArg = poStatusSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.status).toBe('Fully Received');
  });
});
