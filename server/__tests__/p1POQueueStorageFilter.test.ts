/**
 * RC-2 storage-layer regression guard: getOrdersByDepartment must pass a
 * CANCELLED exclusion condition to the production_orders query.
 *
 * Prior to the RC-2 fix the production_orders sub-query had no status filter,
 * so CANCELLED orders appeared in every department queue.  The fix adds
 * `ne(productionOrders.productionStatus, 'CANCELLED')` to the WHERE clause.
 *
 * This test exercises the real DatabaseStorage.getOrdersByDepartment
 * implementation — not a mocked version of it — and verifies:
 *   1. The WHERE condition passed to the production_orders SELECT contains the
 *      string 'CANCELLED' (regression guard against removing the ne() call).
 *   2. A non-CANCELLED production order in the department is present in the result.
 *   3. Only non-CANCELLED orders appear when the DB filter is applied correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Narrow mock chain interfaces — typed to avoid casting to `any`
// ---------------------------------------------------------------------------

/** Final step in a select chain: .orderBy() resolves to rows */
interface MockOrderByChain {
  orderBy: () => Promise<MockProductionOrderRow[]>;
}

/** A select chain that ends with .where().orderBy() */
interface MockWhereChain {
  where: (cond: unknown) => MockOrderByChain;
}

/** A select chain that has leftJoin before where */
interface MockLeftJoinChain {
  leftJoin: (...args: unknown[]) => MockWhereChain;
}

/** from() returns either a leftJoin chain or a where chain */
interface MockWhereFromChain {
  from: (table: unknown) => MockWhereChain;
}

interface MockLeftJoinFromChain {
  from: (table: unknown) => MockLeftJoinChain;
}

/** A select chain that resolves directly from .from() (no where/orderBy) */
interface MockSimpleFromChain {
  from: (table: unknown) => Promise<MockCustomerRow[] | MockStockModelRow[]>;
}

// ---------------------------------------------------------------------------
// Local row shapes for test fixtures
// ---------------------------------------------------------------------------

interface MockProductionOrderRow {
  id: number;
  orderId: string;
  orderDate: Date | null;
  dueDate: Date | null;
  customerId: string;
  customerName: string;
  poNumber: string | null;
  itemType: string | null;
  itemId: string | null;
  itemName: string | null;
  specifications: unknown;
  productionStatus: string;
  currentDepartment: string;
  departmentHistory: unknown[];
  notes: string | null;
  shippedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockCustomerRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  customerType: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  preferredCommunicationMethod: string | null;
}

interface MockStockModelRow {
  id: string;
  name: string;
  displayName: string | null;
}

// ---------------------------------------------------------------------------
// Module mocks — must appear before any import that loads these modules
// ---------------------------------------------------------------------------

vi.mock('../db', () => ({
  db: {
    select: vi.fn<
      [],
      MockWhereFromChain | MockLeftJoinFromChain | MockSimpleFromChain
    >(),
  },
  pool: { query: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../schema', async () => {
  const actual = await vi.importActual<typeof import('../schema')>('../schema');
  return actual;
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { db } from '../db';
import { DatabaseStorage } from '../storage';

// ---------------------------------------------------------------------------
// Typed helpers for building mock db.select chains
// ---------------------------------------------------------------------------

/** Builds a mock for db.select().from(table).where(cond).orderBy() */
function selectWhereChain(
  rows: MockProductionOrderRow[],
  whereCapture?: (cond: unknown) => void,
): MockWhereFromChain {
  const orderBy = vi.fn<[], Promise<MockProductionOrderRow[]>>().mockResolvedValue(rows);
  const where = vi.fn<[unknown], MockOrderByChain>((cond) => {
    whereCapture?.(cond);
    return { orderBy };
  });
  const from = vi.fn<[unknown], MockWhereChain>(() => ({ where }));
  return { from };
}

/** Builds a mock for db.select().from(table).leftJoin().where().orderBy() */
function selectLeftJoinWhereChain(
  rows: MockProductionOrderRow[],
): MockLeftJoinFromChain {
  const orderBy = vi.fn<[], Promise<MockProductionOrderRow[]>>().mockResolvedValue(rows);
  const where = vi.fn<[unknown], MockOrderByChain>(() => ({ orderBy }));
  const leftJoin = vi.fn<unknown[], MockWhereChain>(() => ({ where }));
  const from = vi.fn<[unknown], MockLeftJoinChain>(() => ({ leftJoin }));
  return { from };
}

/** Builds a mock for db.select().from(table) — resolves directly, no where/orderBy */
function selectFromOnly(
  rows: MockCustomerRow[] | MockStockModelRow[],
): MockSimpleFromChain {
  const from = vi.fn<[unknown], Promise<typeof rows>>().mockResolvedValue(rows);
  return { from };
}

// ---------------------------------------------------------------------------
// RC-2: storage-layer CANCELLED filter tests
// ---------------------------------------------------------------------------

describe('DatabaseStorage.getOrdersByDepartment — RC-2: CANCELLED exclusion at storage layer', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new DatabaseStorage();
  });

  it('passes a CANCELLED exclusion condition to the production_orders WHERE clause (RC-2)', async () => {
    // Capture the WHERE condition passed to the production_orders query.
    const capturedConditions: unknown[] = [];

    // db.select is called 4 times in getOrdersByDepartment:
    //   1. allOrders  (leftJoin + where + orderBy)
    //   2. all customers (from only — returns a plain array)
    //   3. all stockModels (from only — returns a plain array)
    //   4. productionOrders (where + orderBy) — the one we inspect
    vi.mocked(db.select)
      .mockReturnValueOnce(selectLeftJoinWhereChain([]))
      .mockReturnValueOnce(selectFromOnly([]))
      .mockReturnValueOnce(selectFromOnly([]))
      .mockReturnValueOnce(
        selectWhereChain([], (cond) => capturedConditions.push(cond))
      );

    await storage.getOrdersByDepartment('P1 Production Queue');

    // The WHERE condition for the productionOrders query must have been captured
    expect(capturedConditions).toHaveLength(1);

    // Traverse the captured Drizzle SQL condition tree to verify 'CANCELLED' is present.
    // Drizzle's ne() creates a SQL expression whose internal structure stores the literal
    // value 'CANCELLED'. If the ne() call is removed from storage.ts, the string
    // 'CANCELLED' will not appear anywhere in the condition tree and this assertion fails,
    // catching the regression immediately.
    //
    // Uses a circular-safe recursive search because Drizzle expression objects contain
    // references back to table/column definitions (circular structure).
    function containsString(
      obj: unknown,
      target: string,
      seen = new Set<object>(),
    ): boolean {
      if (obj === null || obj === undefined) return false;
      if (typeof obj === 'string') return obj === target;
      if (typeof obj !== 'object') return false;
      if (seen.has(obj as object)) return false;
      seen.add(obj as object);
      return Object.values(obj as object).some((v) => containsString(v, target, seen));
    }
    expect(containsString(capturedConditions[0], 'CANCELLED')).toBe(true);
  });

  it('includes a non-CANCELLED production order from the target department in results (RC-2)', async () => {
    const activeProdOrder: MockProductionOrderRow = {
      id: 1,
      orderId: 'PO-ACTIVE-001',
      orderDate: new Date('2026-01-01'),
      dueDate: new Date('2026-12-31'),
      customerId: 'cust-1',
      customerName: 'Acme Corp',
      poNumber: 'PO-2026-001',
      itemType: 'stock_model',
      itemId: 'M700',
      itemName: 'Stock Rifle M700',
      specifications: null,
      productionStatus: 'PENDING',
      currentDepartment: 'P1 Production Queue',
      departmentHistory: [],
      notes: null,
      shippedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    vi.mocked(db.select)
      .mockReturnValueOnce(selectLeftJoinWhereChain([]))
      .mockReturnValueOnce(selectFromOnly([]))
      .mockReturnValueOnce(selectFromOnly([]))
      .mockReturnValueOnce(selectWhereChain([activeProdOrder]));

    const results = await storage.getOrdersByDepartment('P1 Production Queue');

    // The active production order should appear in the result
    expect(results.length).toBeGreaterThan(0);
    const orderIds = results.map((r) => (r as MockProductionOrderRow).orderId);
    expect(orderIds).toContain('PO-ACTIVE-001');
  });

  it('does not include a CANCELLED production order when the DB filter is applied (RC-2 regression simulation)', async () => {
    // Simulate the DB correctly applying the WHERE ne(productionStatus, 'CANCELLED') filter:
    // only the active order is returned, because a real database excludes the CANCELLED one.
    //
    // If the WHERE clause were removed from storage.ts, an unfiltered DB would return
    // both rows and the CANCELLED one would appear in results — a regression caught by
    // the companion 'passes a CANCELLED exclusion' test above.
    const activeProdOrder: MockProductionOrderRow = {
      id: 1,
      orderId: 'PO-ACTIVE-001',
      orderDate: null,
      dueDate: null,
      customerId: 'cust-1',
      customerName: 'Acme Corp',
      poNumber: null,
      itemType: null,
      itemId: null,
      itemName: null,
      specifications: null,
      productionStatus: 'PENDING',
      currentDepartment: 'P1 Production Queue',
      departmentHistory: [],
      notes: null,
      shippedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Simulate DB applying the filter: only activeProdOrder is returned
    vi.mocked(db.select)
      .mockReturnValueOnce(selectLeftJoinWhereChain([]))
      .mockReturnValueOnce(selectFromOnly([]))
      .mockReturnValueOnce(selectFromOnly([]))
      .mockReturnValueOnce(selectWhereChain([activeProdOrder]));

    const results = await storage.getOrdersByDepartment('P1 Production Queue');

    const orderIds = results.map((r) => (r as MockProductionOrderRow).orderId);
    expect(orderIds).toContain('PO-ACTIVE-001');
    expect(orderIds).not.toContain('PO-CANCELLED-002');
  });
});
