/**
 * Tests that guarantee the date-formatting contract for production order
 * storage methods.  Each test seeds the DB mock with raw JavaScript Date
 * objects in the date columns and asserts that the storage method converts
 * them to "YYYY-MM-DD" strings before returning — verifying that the
 * formatDates() call cannot be silently removed.
 *
 * Date columns: orderDate, dueDate
 *
 * Covered methods:
 *   - getProductionOrder
 *   - getProductionOrderByOrderId
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

/** select(cols).from().where().limit() → resolves to rows */
interface LimitChain {
  limit: (n: number) => Promise<Record<string, unknown>[]>;
}
interface WhereChainWithLimit {
  where: (cond: unknown) => LimitChain;
}
interface FromChainWithWhereLimit {
  from: (table: unknown) => WhereChainWithLimit;
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

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeProductionOrderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    orderId: 'ORD-001',
    poId: 10,
    customerName: 'Acme Corp',
    itemName: 'Widget A',
    productionStatus: 'Pending',
    orderDate: new Date('2024-02-10T00:00:00.000Z'),
    dueDate: new Date('2024-03-20T00:00:00.000Z'),
    ...overrides,
  };
}

// ── Chain builder helper ──────────────────────────────────────────────────────

function selectFromWhereLimitChain(rows: Record<string, unknown>[]): FromChainWithWhereLimit {
  const limitFn = vi.fn<(n: number) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => LimitChain>()
    .mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn<(table: unknown) => WhereChainWithLimit>()
    .mockReturnValue({ where: whereFn });
  return { from: fromFn };
}

// ── Helper: assert date fields are YYYY-MM-DD strings ────────────────────────

function assertProductionOrderDates(
  row: Record<string, unknown>,
  expected: { orderDate: string | null; dueDate: string | null },
) {
  if (expected.orderDate === null) {
    expect(row.orderDate).toBeNull();
  } else {
    expect(typeof row.orderDate).toBe('string');
    expect(row.orderDate).toBe(expected.orderDate);
    expect(row.orderDate).not.toBeInstanceOf(Date);
  }
  if (expected.dueDate === null) {
    expect(row.dueDate).toBeNull();
  } else {
    expect(typeof row.dueDate).toBe('string');
    expect(row.dueDate).toBe(expected.dueDate);
    expect(row.dueDate).not.toBeInstanceOf(Date);
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('productionOrder storage — date formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── getProductionOrder ─────────────────────────────────────────────────────

  describe('getProductionOrder', () => {
    it('converts raw JS Dates in both date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereLimitChain([makeProductionOrderRow()]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getProductionOrder(1);

      expect(result).toBeDefined();
      assertProductionOrderDates(result as Record<string, unknown>, {
        orderDate: '2024-02-10',
        dueDate: '2024-03-20',
      });
    });

    it('keeps both date columns as null when the DB returns null', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereLimitChain([makeProductionOrderRow({ orderDate: null, dueDate: null })]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getProductionOrder(1);

      expect(result).toBeDefined();
      assertProductionOrderDates(result as Record<string, unknown>, {
        orderDate: null,
        dueDate: null,
      });
    });

    it('returns undefined when no production order matches the given id', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereLimitChain([]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getProductionOrder(999);

      expect(result).toBeUndefined();
    });
  });

  // ── getProductionOrderByOrderId ────────────────────────────────────────────

  describe('getProductionOrderByOrderId', () => {
    it('converts raw JS Dates in both date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereLimitChain([makeProductionOrderRow()]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getProductionOrderByOrderId('ORD-001');

      expect(result).toBeDefined();
      assertProductionOrderDates(result as Record<string, unknown>, {
        orderDate: '2024-02-10',
        dueDate: '2024-03-20',
      });
    });

    it('returns undefined when no production order matches the given orderId', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereLimitChain([]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getProductionOrderByOrderId('ORD-UNKNOWN');

      expect(result).toBeUndefined();
    });
  });
});
