/**
 * Tests that guarantee the date-formatting contract for purchase order storage
 * methods.  Each test seeds the DB mock with raw JavaScript Date objects in
 * the date columns and asserts that the storage method converts them to
 * "YYYY-MM-DD" strings before returning — verifying that the formatDates()
 * call cannot be silently removed.
 *
 * Date columns: poDate, expectedDelivery
 *
 * Covered methods:
 *   - getAllPurchaseOrders
 *   - getPurchaseOrder
 *   - createPurchaseOrder
 *   - updatePurchaseOrder
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Typed interfaces for the Drizzle ORM fluent-chain mocks ─────────────────

/** select().from().orderBy() → resolves to rows (getAllPurchaseOrders) */
interface OrderByChain {
  orderBy: (...args: unknown[]) => Promise<Record<string, unknown>[]>;
}
interface FromChainWithOrderBy {
  from: (table: unknown) => OrderByChain;
}

/** select().from().where().limit() → resolves to rows (getPurchaseOrder) */
interface LimitChain {
  limit: (n: number) => Promise<Record<string, unknown>[]>;
}
interface WhereChainWithLimit {
  where: (cond: unknown) => LimitChain;
}
interface FromChainWithWhereLimit {
  from: (table: unknown) => WhereChainWithLimit;
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

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { DatabaseStorage } from '../storage';
import { db } from '../db';

// ── Fixture ───────────────────────────────────────────────────────────────────

function makePurchaseOrderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    poNumber: 'PO-2024-001',
    status: 'OPEN',
    customerId: '100',
    customerName: 'Acme Corp',
    poDate: new Date('2024-04-01T00:00:00.000Z'),
    expectedDelivery: new Date('2024-04-30T00:00:00.000Z'),
    ...overrides,
  };
}

// ── Chain builder helpers ─────────────────────────────────────────────────────

function selectFromOrderByChain(rows: Record<string, unknown>[]): FromChainWithOrderBy {
  const orderByFn = vi.fn<(...args: unknown[]) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const fromFn = vi.fn<(table: unknown) => OrderByChain>()
    .mockReturnValue({ orderBy: orderByFn });
  return { from: fromFn };
}

function selectFromWhereLimitChain(rows: Record<string, unknown>[]): FromChainWithWhereLimit {
  const limitFn = vi.fn<(n: number) => Promise<Record<string, unknown>[]>>()
    .mockResolvedValue(rows);
  const whereFn = vi.fn<(cond: unknown) => LimitChain>()
    .mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn<(table: unknown) => WhereChainWithLimit>()
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

// ── Helper: assert date fields are YYYY-MM-DD strings ────────────────────────

function assertPurchaseOrderDates(
  row: Record<string, unknown>,
  expected: { poDate: string | null; expectedDelivery: string | null },
) {
  if (expected.poDate === null) {
    expect(row.poDate).toBeNull();
  } else {
    expect(typeof row.poDate).toBe('string');
    expect(row.poDate).toBe(expected.poDate);
    expect(row.poDate).not.toBeInstanceOf(Date);
  }
  if (expected.expectedDelivery === null) {
    expect(row.expectedDelivery).toBeNull();
  } else {
    expect(typeof row.expectedDelivery).toBe('string');
    expect(row.expectedDelivery).toBe(expected.expectedDelivery);
    expect(row.expectedDelivery).not.toBeInstanceOf(Date);
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('purchaseOrder storage — date formatting', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  // ── getAllPurchaseOrders ────────────────────────────────────────────────────

  describe('getAllPurchaseOrders', () => {
    it('converts raw JS Dates in both date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromOrderByChain([makePurchaseOrderRow()]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getAllPurchaseOrders();

      expect(results).toHaveLength(1);
      assertPurchaseOrderDates(results[0] as Record<string, unknown>, {
        poDate: '2024-04-01',
        expectedDelivery: '2024-04-30',
      });
    });

    it('keeps both date columns as null when the DB returns null', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromOrderByChain([makePurchaseOrderRow({ poDate: null, expectedDelivery: null })]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getAllPurchaseOrders();

      expect(results).toHaveLength(1);
      assertPurchaseOrderDates(results[0] as Record<string, unknown>, {
        poDate: null,
        expectedDelivery: null,
      });
    });

    it('returns an empty array when no purchase orders exist', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromOrderByChain([]) as ReturnType<typeof db.select>,
      );

      const results = await storage.getAllPurchaseOrders();

      expect(results).toEqual([]);
    });
  });

  // ── getPurchaseOrder ───────────────────────────────────────────────────────

  describe('getPurchaseOrder', () => {
    it('converts raw JS Dates to YYYY-MM-DD strings', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereLimitChain([makePurchaseOrderRow()]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getPurchaseOrder(1);

      expect(result).toBeDefined();
      assertPurchaseOrderDates(result as Record<string, unknown>, {
        poDate: '2024-04-01',
        expectedDelivery: '2024-04-30',
      });
    });

    it('returns undefined when no PO matches the given id', async () => {
      vi.mocked(db.select).mockReturnValue(
        selectFromWhereLimitChain([]) as ReturnType<typeof db.select>,
      );

      const result = await storage.getPurchaseOrder(999);

      expect(result).toBeUndefined();
    });
  });

  // ── createPurchaseOrder ────────────────────────────────────────────────────

  describe('createPurchaseOrder', () => {
    it('converts raw JS Dates in both date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makePurchaseOrderRow()]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createPurchaseOrder({
        poNumber: 'PO-2024-001',
        status: 'OPEN',
        customerId: '100',
        customerName: 'Acme Corp',
      } as Parameters<typeof storage.createPurchaseOrder>[0]);

      assertPurchaseOrderDates(result as Record<string, unknown>, {
        poDate: '2024-04-01',
        expectedDelivery: '2024-04-30',
      });
    });

    it('keeps both date columns as null when the inserted row has null dates', async () => {
      vi.mocked(db.insert).mockReturnValue(
        insertValuesReturningChain([makePurchaseOrderRow({ poDate: null, expectedDelivery: null })]) as ReturnType<typeof db.insert>,
      );

      const result = await storage.createPurchaseOrder({
        poNumber: 'PO-2024-002',
        status: 'OPEN',
        customerId: '100',
        customerName: 'Acme Corp',
      } as Parameters<typeof storage.createPurchaseOrder>[0]);

      assertPurchaseOrderDates(result as Record<string, unknown>, {
        poDate: null,
        expectedDelivery: null,
      });
    });
  });

  // ── updatePurchaseOrder ────────────────────────────────────────────────────

  describe('updatePurchaseOrder', () => {
    it('converts raw JS Dates in both date columns to YYYY-MM-DD strings', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makePurchaseOrderRow()]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updatePurchaseOrder(1, { status: 'CLOSED' });

      assertPurchaseOrderDates(result as Record<string, unknown>, {
        poDate: '2024-04-01',
        expectedDelivery: '2024-04-30',
      });
    });

    it('keeps both date columns as null when the updated row returns null dates', async () => {
      vi.mocked(db.update).mockReturnValue(
        updateSetWhereReturningChain([makePurchaseOrderRow({ poDate: null, expectedDelivery: null })]) as ReturnType<typeof db.update>,
      );

      const result = await storage.updatePurchaseOrder(1, { status: 'CLOSED' });

      assertPurchaseOrderDates(result as Record<string, unknown>, {
        poDate: null,
        expectedDelivery: null,
      });
    });
  });
});
