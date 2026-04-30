/**
 * Tests that guarantee the date-formatting contract for vendor PO item storage
 * methods.  Each test seeds the DB mock with a raw JavaScript Date object in
 * the `receivedDate` column and asserts that the storage method converts it to
 * a "YYYY-MM-DD" string before returning — verifying that the formatDates()
 * call is present in every return path and cannot be silently removed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

/** getVendorPOItems: select → from → leftJoin → where → orderBy */
interface OrderByChain {
  orderBy: (col: unknown) => Promise<Record<string, unknown>[]>;
}
interface GetItemsWhereChain {
  where: (cond: unknown) => OrderByChain;
}
interface LeftJoinChain {
  leftJoin: (table: unknown, cond: unknown) => GetItemsWhereChain;
}
interface GetItemsFromChain {
  from: (table: unknown) => LeftJoinChain;
}

/** updateVendorPOItem (read old item): select → from → where */
interface OldItemWhereChain {
  where: (cond: unknown) => Promise<Record<string, unknown>[]>;
}
interface OldItemFromChain {
  from: (table: unknown) => OldItemWhereChain;
}

/** updateVendorPOItem (write): update → set → where → returning */
interface ReturningChain {
  returning: () => Promise<Record<string, unknown>[]>;
}
interface UpdateWhereChain {
  where: (cond: unknown) => ReturningChain;
}
interface UpdateSetChain {
  set: (data: unknown) => UpdateWhereChain;
}

// ── Module mocks (hoisted by Vitest before any import) ───────────────────────

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  pool: {},
  pgPool: {},
}));

vi.mock('../src/utils/manufacturingQueueHelper', () => ({
  autoPopulateManufacturingQueue: vi.fn().mockResolvedValue(undefined),
  syncManufacturingQueueOnUpdate: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a `getVendorPOItems` select chain:
 * db.select() → from → leftJoin → where → orderBy → resolves to rows.
 */
function getItemsSelectChain(rows: Record<string, unknown>[]): GetItemsFromChain {
  const orderByFn = vi.fn<(col: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => OrderByChain>()
    .mockReturnValue({ orderBy: orderByFn });
  const leftJoinFn = vi.fn<(table: unknown, cond: unknown) => GetItemsWhereChain>()
    .mockReturnValue({ where: whereFn });
  const fromFn = vi.fn<(table: unknown) => LeftJoinChain>()
    .mockReturnValue({ leftJoin: leftJoinFn });
  return { from: fromFn };
}

/**
 * Build the `updateVendorPOItem` "read old item" select chain:
 * db.select() → from → where → resolves to rows.
 */
function oldItemSelectChain(rows: Record<string, unknown>[]): OldItemFromChain {
  const whereFn = vi.fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => OldItemWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

/**
 * Build the `updateVendorPOItem` update chain:
 * db.update() → set → where → returning → resolves to rows.
 */
function updateReturningChain(rows: Record<string, unknown>[]): UpdateSetChain {
  const returningFn = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => ReturningChain>()
    .mockReturnValue({ returning: returningFn });
  const setFn = vi.fn<(data: unknown) => UpdateWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { set: setFn };
}

/**
 * Build a fake `tx` object for createVendorPOItem's transaction callback.
 * The insert chain resolves to [insertedItem].
 */
function makeTx(insertedItem: Record<string, unknown>) {
  const forFn = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue([{ id: insertedItem.vendorPoId }]);
  const txSelectWhere = vi.fn().mockReturnValue({ for: forFn });
  const txSelectFrom = vi.fn().mockReturnValue({ where: txSelectWhere });
  const txSelect = vi.fn().mockReturnValue({ from: txSelectFrom });

  const txExecute = vi.fn().mockResolvedValue({ rows: [{ next_line_number: 1 }] });

  const txInsertReturning = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue([insertedItem]);
  const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

  return { select: txSelect, execute: txExecute, insert: txInsert };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('vendorPOItem storage — receivedDate formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── getVendorPOItems ───────────────────────────────────────────────────────

  describe('getVendorPOItems', () => {
    it('converts a raw JS Date in receivedDate to a YYYY-MM-DD string', async () => {
      const rawRow = {
        vendor_po_items: {
          id: 1,
          vendorPoId: 10,
          agPartNumber: 'PART-001',
          lineNumber: 1,
          receivedDate: new Date('2024-03-15T00:00:00.000Z'),
          vendorUnit: null,
          purchaseUnit: null,
        },
        inventory_items: null,
      };

      vi.mocked(db.select).mockReturnValue(
        getItemsSelectChain([rawRow]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getVendorPOItems(10);

      expect(result).toHaveLength(1);
      expect(typeof result[0].receivedDate).toBe('string');
      expect(result[0].receivedDate).toBe('2024-03-15');
      expect(result[0].receivedDate).not.toBeInstanceOf(Date);
    });

    it('keeps receivedDate as null when the DB returns null', async () => {
      const rawRow = {
        vendor_po_items: {
          id: 2,
          vendorPoId: 10,
          agPartNumber: 'PART-002',
          lineNumber: 2,
          receivedDate: null,
          vendorUnit: null,
          purchaseUnit: null,
        },
        inventory_items: null,
      };

      vi.mocked(db.select).mockReturnValue(
        getItemsSelectChain([rawRow]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getVendorPOItems(10);

      expect(result[0].receivedDate).toBeNull();
    });

    it('returns an empty array without error when the PO has no items', async () => {
      vi.mocked(db.select).mockReturnValue(
        getItemsSelectChain([]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getVendorPOItems(10);

      expect(result).toEqual([]);
    });
  });

  // ── createVendorPOItem ─────────────────────────────────────────────────────

  describe('createVendorPOItem', () => {
    it('converts a raw JS Date in receivedDate to a YYYY-MM-DD string', async () => {
      const insertedItem: Record<string, unknown> = {
        id: 1,
        vendorPoId: 10,
        lineNumber: 1,
        agPartNumber: 'PART-001',
        receivedDate: new Date('2024-04-01T00:00:00.000Z'),
      };

      const mockTx = makeTx(insertedItem);
      vi.mocked(db.transaction).mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<Record<string, unknown>>) => cb(mockTx),
      );

      vi.spyOn(storage, 'getVendorPO').mockResolvedValue(
        { id: 10, status: 'Open' } as Awaited<ReturnType<typeof storage.getVendorPO>>,
      );

      const result = await storage.createVendorPOItem({
        vendorPoId: 10,
        agPartNumber: 'PART-001',
      });

      expect(typeof result.receivedDate).toBe('string');
      expect(result.receivedDate).toBe('2024-04-01');
      expect(result.receivedDate).not.toBeInstanceOf(Date);
    });

    it('keeps receivedDate as null when the inserted row has null', async () => {
      const insertedItem: Record<string, unknown> = {
        id: 2,
        vendorPoId: 10,
        lineNumber: 1,
        agPartNumber: 'PART-002',
        receivedDate: null,
      };

      const mockTx = makeTx(insertedItem);
      vi.mocked(db.transaction).mockImplementation(
        async (cb: (tx: typeof mockTx) => Promise<Record<string, unknown>>) => cb(mockTx),
      );

      vi.spyOn(storage, 'getVendorPO').mockResolvedValue(
        { id: 10, status: 'Open' } as Awaited<ReturnType<typeof storage.getVendorPO>>,
      );

      const result = await storage.createVendorPOItem({
        vendorPoId: 10,
        agPartNumber: 'PART-002',
      });

      expect(result.receivedDate).toBeNull();
    });
  });

  // ── updateVendorPOItem ─────────────────────────────────────────────────────

  describe('updateVendorPOItem', () => {
    it('converts a raw JS Date in receivedDate to a YYYY-MM-DD string', async () => {
      const oldItem: Record<string, unknown> = {
        id: 1, vendorPoId: 10, quantity: 5, lineNumber: 1, receivedDate: null,
      };
      const updatedItem: Record<string, unknown> = {
        id: 1, vendorPoId: 10, quantity: 5, lineNumber: 1,
        receivedDate: new Date('2024-06-15T00:00:00.000Z'),
      };

      vi.mocked(db.select).mockReturnValue(
        oldItemSelectChain([oldItem]) as ReturnType<typeof db.select>,
      );
      vi.mocked(db.update).mockReturnValue(
        updateReturningChain([updatedItem]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateVendorPOItem(1, { receivedDate: '2024-06-15' });

      expect(typeof result.receivedDate).toBe('string');
      expect(result.receivedDate).toBe('2024-06-15');
      expect(result.receivedDate).not.toBeInstanceOf(Date);
    });

    it('keeps receivedDate as null when the updated row has null', async () => {
      const oldItem: Record<string, unknown> = {
        id: 1, vendorPoId: 10, quantity: 5, lineNumber: 1, receivedDate: null,
      };
      const updatedItem: Record<string, unknown> = {
        id: 1, vendorPoId: 10, quantity: 5, lineNumber: 1, receivedDate: null,
      };

      vi.mocked(db.select).mockReturnValue(
        oldItemSelectChain([oldItem]) as ReturnType<typeof db.select>,
      );
      vi.mocked(db.update).mockReturnValue(
        updateReturningChain([updatedItem]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateVendorPOItem(1, { receivedDate: null });

      expect(result.receivedDate).toBeNull();
    });

    it('does not require receivedDate in the payload — non-date fields pass through unchanged', async () => {
      const oldItem: Record<string, unknown> = {
        id: 1, vendorPoId: 10, quantity: 5, lineNumber: 1, receivedDate: null,
      };
      const updatedItem: Record<string, unknown> = {
        id: 1, vendorPoId: 10, quantity: 8, lineNumber: 1,
        receivedDate: null, agPartNumber: 'PART-X',
      };

      vi.mocked(db.select).mockReturnValue(
        oldItemSelectChain([oldItem]) as ReturnType<typeof db.select>,
      );
      vi.mocked(db.update).mockReturnValue(
        updateReturningChain([updatedItem]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updateVendorPOItem(1, { quantity: 8 });

      expect(result.quantity).toBe(8);
      expect(result.agPartNumber).toBe('PART-X');
      expect(result.receivedDate).toBeNull();
    });
  });
});
