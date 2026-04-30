/**
 * Tests that guarantee the date-formatting contract for purchase order item
 * storage methods.  Each test seeds the DB mock with raw JavaScript Date
 * objects in the date column and asserts that the storage method converts them
 * to "YYYY-MM-DD" strings before returning — verifying that the formatDates()
 * call cannot be silently removed.
 *
 * Date columns: dueDate
 *
 * Covered methods:
 *   - getPurchaseOrderItems
 *   - createPurchaseOrderItem
 *   - updatePurchaseOrderItem
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

/** select().from().where().orderBy() → resolves to rows (getPurchaseOrderItems) */
interface OrderByChain {
  orderBy: (col: unknown) => Promise<Record<string, unknown>[]>;
}
interface WhereChainWithOrderBy {
  where: (cond: unknown) => OrderByChain;
}
interface FromChainWithWhereOrderBy {
  from: (table: unknown) => WhereChainWithOrderBy;
}

/** select().from().where() → resolves to rows (read current item in updatePurchaseOrderItem) */
interface SimpleWhereChain {
  where: (cond: unknown) => Promise<Record<string, unknown>[]>;
}
interface SimpleFromChain {
  from: (table: unknown) => SimpleWhereChain;
}

/** insert → values → returning */
interface InsertReturningChain {
  returning: () => Promise<Record<string, unknown>[]>;
}
interface InsertValuesChain {
  values: (data: unknown) => InsertReturningChain;
}

/** update → set → where → returning */
interface UpdateReturningChain {
  returning: () => Promise<Record<string, unknown>[]>;
}
interface UpdateWhereChain {
  where: (cond: unknown) => UpdateReturningChain;
}
interface UpdateSetChain {
  set: (data: unknown) => UpdateWhereChain;
}

// ── Module mocks (hoisted by Vitest before any import) ───────────────────────

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  pool: { query: vi.fn() },
  pgPool: {},
  rawSql: vi.fn(),
}));

vi.mock('../src/utils/manufacturingQueueHelper', () => ({
  autoPopulateManufacturingQueue: vi.fn().mockResolvedValue(undefined),
  syncManufacturingQueueOnUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/orderTransitionValidator', () => ({
  TransitionValidationError: class TransitionValidationError extends Error {
    constructor(code: string, message: string) {
      super(message);
      this.name = 'TransitionValidationError';
    }
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Fixture ───────────────────────────────────────────────────────────────────

function makePOItemRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    poId: 10,
    itemName: 'Widget A',
    quantity: 5,
    unitPrice: 9.99,
    totalPrice: 49.95,
    stockStatus: null,
    dueDate: new Date('2024-07-15T00:00:00.000Z'),
    ...overrides,
  };
}

// ── Chain builder helpers ─────────────────────────────────────────────────────

function selectFromWhereOrderByChain(rows: Record<string, unknown>[]): FromChainWithWhereOrderBy {
  const orderByFn = vi.fn<(col: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => OrderByChain>()
    .mockReturnValue({ orderBy: orderByFn });
  const fromFn = vi.fn<(table: unknown) => WhereChainWithOrderBy>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

function simpleSelectFromWhereChain(rows: Record<string, unknown>[]): SimpleFromChain {
  const whereFn = vi.fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => SimpleWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

function insertValuesReturningChain(rows: Record<string, unknown>[]): InsertValuesChain {
  const returningFn = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const valuesFn = vi.fn<(data: unknown) => InsertReturningChain>()
    .mockReturnValue({ returning: returningFn });
  return { values: valuesFn };
}

function updateSetWhereReturningChain(rows: Record<string, unknown>[]): UpdateSetChain {
  const returningFn = vi.fn<() => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => UpdateReturningChain>()
    .mockReturnValue({ returning: returningFn });
  const setFn = vi.fn<(data: unknown) => UpdateWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { set: setFn };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('purchaseOrderItem storage — date formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── getPurchaseOrderItems ──────────────────────────────────────────────────

  describe('getPurchaseOrderItems', () => {
    it('converts a raw JS Date in dueDate to a YYYY-MM-DD string', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereOrderByChain([makePOItemRow()]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getPurchaseOrderItems(10);

      expect(results).toHaveLength(1);
      expect(typeof results[0].dueDate).toBe('string');
      expect(results[0].dueDate).toBe('2024-07-15');
      expect(results[0].dueDate).not.toBeInstanceOf(Date);
    });

    it('keeps dueDate as null when the DB returns null', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereOrderByChain([makePOItemRow({ dueDate: null })]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getPurchaseOrderItems(10);

      expect(results).toHaveLength(1);
      expect(results[0].dueDate).toBeNull();
    });

    it('returns an empty array when no items exist for the PO', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereOrderByChain([]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getPurchaseOrderItems(10);

      expect(results).toEqual([]);
    });
  });

  // ── createPurchaseOrderItem ────────────────────────────────────────────────

  describe('createPurchaseOrderItem', () => {
    it('converts a raw JS Date in dueDate to a YYYY-MM-DD string', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makePOItemRow()]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createPurchaseOrderItem({
        poId: 10,
        itemName: 'Widget A',
        quantity: 5,
        unitPrice: 9.99,
        totalPrice: 49.95,
      } as Parameters<typeof storage.createPurchaseOrderItem>[0]);

      expect(typeof result.dueDate).toBe('string');
      expect(result.dueDate).toBe('2024-07-15');
      expect(result.dueDate).not.toBeInstanceOf(Date);
    });

    it('keeps dueDate as null when the inserted row has null', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makePOItemRow({ dueDate: null })]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createPurchaseOrderItem({
        poId: 10,
        itemName: 'Widget B',
        quantity: 3,
        unitPrice: 5.00,
        totalPrice: 15.00,
      } as Parameters<typeof storage.createPurchaseOrderItem>[0]);

      expect(result.dueDate).toBeNull();
    });
  });

  // ── updatePurchaseOrderItem ────────────────────────────────────────────────

  describe('updatePurchaseOrderItem', () => {
    it('converts a raw JS Date in dueDate to a YYYY-MM-DD string', async () => {
      const currentItem = makePOItemRow({ dueDate: null });
      const updatedItem = makePOItemRow({ dueDate: new Date('2024-08-01T00:00:00.000Z') });

      vi.mocked(db.select).mockReturnValue(
        simpleSelectFromWhereChain([currentItem]) as ReturnType<typeof db.select>,
      );
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([updatedItem]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updatePurchaseOrderItem(1, { dueDate: '2024-08-01' });

      expect(typeof result.dueDate).toBe('string');
      expect(result.dueDate).toBe('2024-08-01');
      expect(result.dueDate).not.toBeInstanceOf(Date);
    });

    it('keeps dueDate as null when the updated row has null', async () => {
      const currentItem = makePOItemRow({ dueDate: null });
      const updatedItem = makePOItemRow({ dueDate: null });

      vi.mocked(db.select).mockReturnValue(
        simpleSelectFromWhereChain([currentItem]) as ReturnType<typeof db.select>,
      );
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([updatedItem]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updatePurchaseOrderItem(1, { quantity: 10 });

      expect(result.dueDate).toBeNull();
    });
  });
});
