/**
 * Tests that guarantee the date-formatting contract for inventory item cost
 * history storage methods.  Each test seeds the DB mock with raw JavaScript
 * Date objects in the date column and asserts that the storage method converts
 * them to "YYYY-MM-DD" strings before returning — verifying that the
 * formatDates() call cannot be silently removed.
 *
 * Date columns: receivedDate
 *
 * Covered methods:
 *   - getInventoryItemCostHistory
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

/**
 * First select: select({...}).from().where() → resolves to rows.
 * Used to fetch the inventory item by agPartNumber.
 */
interface SimpleWhereChain {
  where: (cond: unknown) => Promise<Record<string, unknown>[]>;
}
interface SimpleFromChain {
  from: (table: unknown) => SimpleWhereChain;
}

/**
 * Second select: select({...}).from().leftJoin().where().orderBy() → resolves.
 * Used to fetch cost history records.
 */
interface HistoryOrderByChain {
  orderBy: (col: unknown) => Promise<Record<string, unknown>[]>;
}
interface HistoryWhereChain {
  where: (cond: unknown) => HistoryOrderByChain;
}
interface HistoryLeftJoinChain {
  leftJoin: (table: unknown, cond: unknown) => HistoryWhereChain;
}
interface HistoryFromChain {
  from: (table: unknown) => HistoryLeftJoinChain;
}

// ── Module mocks (hoisted by Vitest before any import) ───────────────────────

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
  },
  pool: { query: vi.fn() },
  pgPool: {},
  rawSql: vi.fn(),
}));

vi.mock('../src/utils/manufacturingQueueHelper', () => ({
  autoPopulateManufacturingQueue: vi.fn().mockResolvedValue(undefined),
  syncManufacturingQueueOnUpdate: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Fixture ───────────────────────────────────────────────────────────────────

const INVENTORY_ITEM = {
  id: 42,
  vendorUnit: 'each',
  purchaseUnit: 'each',
  purchaseQuantity: '1',
  consumptionRate: '1',
  usageUnit: 'each',
};

function makeCostHistoryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    inventoryItemId: 42,
    vendorId: 10,
    vendorName: 'ACME Supplies',
    receivedDate: new Date('2024-05-20T00:00:00.000Z'),
    purchaseUnitCost: '12.50',
    usageUnitCost: '12.50',
    currency: 'USD',
    poLineItemId: null,
    notes: null,
    createdAt: new Date('2024-05-20T10:00:00.000Z'),
    ...overrides,
  };
}

// ── Chain builder helpers ─────────────────────────────────────────────────────

function inventoryItemSelectChain(rows: Record<string, unknown>[]): SimpleFromChain {
  const whereFn = vi.fn<(cond: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => SimpleWhereChain>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

function costHistorySelectChain(rows: Record<string, unknown>[]): HistoryFromChain {
  const orderByFn = vi.fn<(col: unknown) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => HistoryOrderByChain>()
    .mockReturnValue({ orderBy: orderByFn });
  const leftJoinFn = vi.fn<(table: unknown, cond: unknown) => HistoryWhereChain>()
    .mockReturnValue({ where: whereFn });
  const fromFn = vi.fn<(table: unknown) => HistoryLeftJoinChain>()
    .mockReturnValue({ leftJoin: leftJoinFn });
  return { from: fromFn };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('inventoryItemCostHistory storage — date formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── getInventoryItemCostHistory ────────────────────────────────────────────

  describe('getInventoryItemCostHistory', () => {
    it('converts a raw JS Date in receivedDate to a YYYY-MM-DD string', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(inventoryItemSelectChain([INVENTORY_ITEM]) as ReturnType<typeof db.select>)
        .mockReturnValueOnce(costHistorySelectChain([makeCostHistoryRow()]) as ReturnType<typeof db.select>);

      const results = await storage.getInventoryItemCostHistory('PART-001');

      expect(results).toHaveLength(1);
      expect(typeof results[0].receivedDate).toBe('string');
      expect(results[0].receivedDate).toBe('2024-05-20');
      expect(results[0].receivedDate).not.toBeInstanceOf(Date);
    });

    it('keeps receivedDate as null when the DB returns null', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(inventoryItemSelectChain([INVENTORY_ITEM]) as ReturnType<typeof db.select>)
        .mockReturnValueOnce(costHistorySelectChain([makeCostHistoryRow({ receivedDate: null })]) as ReturnType<typeof db.select>);

      const results = await storage.getInventoryItemCostHistory('PART-001');

      expect(results).toHaveLength(1);
      expect(results[0].receivedDate).toBeNull();
    });

    it('converts multiple rows in the result set', async () => {
      const row1 = makeCostHistoryRow({ id: 1, receivedDate: new Date('2024-03-01T00:00:00.000Z') });
      const row2 = makeCostHistoryRow({ id: 2, receivedDate: new Date('2024-06-15T00:00:00.000Z') });

      vi.mocked(db.select)
        .mockReturnValueOnce(inventoryItemSelectChain([INVENTORY_ITEM]) as ReturnType<typeof db.select>)
        .mockReturnValueOnce(costHistorySelectChain([row1, row2]) as ReturnType<typeof db.select>);

      const results = await storage.getInventoryItemCostHistory('PART-001');

      expect(results).toHaveLength(2);
      expect(results[0].receivedDate).toBe('2024-03-01');
      expect(results[1].receivedDate).toBe('2024-06-15');
    });

    it('returns an empty array when the inventory item is not found', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(inventoryItemSelectChain([]) as ReturnType<typeof db.select>);

      const results = await storage.getInventoryItemCostHistory('PART-UNKNOWN');

      expect(results).toEqual([]);
    });
  });
});
