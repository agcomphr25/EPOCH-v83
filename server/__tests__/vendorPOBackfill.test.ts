/**
 * Tests for backfillVendorPOReceivingStatus (server/storage.ts).
 *
 * This function runs at startup to fix POs stuck in "Sent" status. For each
 * "Sent" PO it:
 *   1. Fetches all "Sent" POs.
 *   2. Fetches all their line items in one query.
 *   3. For each PO, derives the correct status:
 *        - no lines received         → skip (leave as "Sent")
 *        - some but not all received → update to "Partially Received"
 *        - every line satisfied      → update to "Fully Received"
 *
 * Tests follow the same DB-mock pattern as vendorPOReceiptStatus.test.ts.
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
 * Build the `db.update(table).set({}).where(cond)` chain mock and return the
 * spy on `.set()` so callers can assert the status value written.
 */
function makeUpdateSetSpy(): ReturnType<typeof vi.fn> {
  const setSpy = vi.fn<(data: unknown) => UpdateWhereChain>().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  vi.mocked(db.update).mockReturnValueOnce({ set: setSpy } as unknown as UpdateSetChain);
  return setSpy;
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('backfillVendorPOReceivingStatus', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it('corrects a PO to "Partially Received" when only some lines have been received', async () => {
    // Two "Sent" POs found; one has partial receipts, one has none.
    vi.mocked(db.select)
      .mockReturnValueOnce(selectWhere([{ id: 1 }]))           // sentPOs
      .mockReturnValueOnce(selectWhere([                        // lineItems
        { vendorPoId: 1, quantity: 10, receivedQuantity: 5 },  // partial
        { vendorPoId: 1, quantity: 10, receivedQuantity: 0 },  // nothing yet
      ]));

    const setSpy = makeUpdateSetSpy();

    await storage.backfillVendorPOReceivingStatus();

    expect(setSpy).toHaveBeenCalledOnce();
    const written = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(written.status).toBe('Partially Received');
  });

  it('corrects a PO to "Fully Received" when every line is completely received', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectWhere([{ id: 2 }]))
      .mockReturnValueOnce(selectWhere([
        { vendorPoId: 2, quantity: 10, receivedQuantity: 10 },
        { vendorPoId: 2, quantity: 5,  receivedQuantity: 5  },
      ]));

    const setSpy = makeUpdateSetSpy();

    await storage.backfillVendorPOReceivingStatus();

    expect(setSpy).toHaveBeenCalledOnce();
    const written = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(written.status).toBe('Fully Received');
  });

  it('does not issue any update when no lines have been received at all', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(selectWhere([{ id: 3 }]))
      .mockReturnValueOnce(selectWhere([
        { vendorPoId: 3, quantity: 10, receivedQuantity: 0 },
        { vendorPoId: 3, quantity: 5,  receivedQuantity: 0 },
      ]));

    await storage.backfillVendorPOReceivingStatus();

    expect(db.update).not.toHaveBeenCalled();
  });

  it('skips updating and does not throw when there are no "Sent" POs at all', async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectWhere([]));

    await expect(storage.backfillVendorPOReceivingStatus()).resolves.toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('skips a PO and does not throw when it has no line items on record', async () => {
    // PO 5 is "Sent" but vendorPOItems has no rows for it at all.
    // The function groups by PO id; byPo[5] will be undefined → lines = [].
    // lines.length === 0 should trigger `continue` with no db.update() call.
    vi.mocked(db.select)
      .mockReturnValueOnce(selectWhere([{ id: 5 }]))  // sentPOs
      .mockReturnValueOnce(selectWhere([]));           // lineItems — empty result set

    await expect(storage.backfillVendorPOReceivingStatus()).resolves.toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('handles multiple POs correctly, updating only those with received lines', async () => {
    // PO 10: partial receipts → "Partially Received"
    // PO 11: fully received   → "Fully Received"
    // PO 12: nothing received → no update
    vi.mocked(db.select)
      .mockReturnValueOnce(selectWhere([{ id: 10 }, { id: 11 }, { id: 12 }]))
      .mockReturnValueOnce(selectWhere([
        { vendorPoId: 10, quantity: 20, receivedQuantity: 10 },
        { vendorPoId: 11, quantity: 5,  receivedQuantity: 5  },
        { vendorPoId: 12, quantity: 8,  receivedQuantity: 0  },
      ]));

    const setSpy10 = makeUpdateSetSpy(); // first update call → PO 10
    const setSpy11 = makeUpdateSetSpy(); // second update call → PO 11

    await storage.backfillVendorPOReceivingStatus();

    expect(setSpy10).toHaveBeenCalledOnce();
    expect((setSpy10.mock.calls[0][0] as Record<string, unknown>).status).toBe('Partially Received');

    expect(setSpy11).toHaveBeenCalledOnce();
    expect((setSpy11.mock.calls[0][0] as Record<string, unknown>).status).toBe('Fully Received');

    expect(db.update).toHaveBeenCalledTimes(2);
  });
});
