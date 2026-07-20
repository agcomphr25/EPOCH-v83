/**
 * RC-3 regression guard: the schedule endpoint must not create duplicate production orders.
 *
 * Prior to the RC-3 fix, a second call with the same PO item could create additional
 * production orders because the guard relied on the cached `order_count` column, which
 * could drift when partial failures occurred. The fix reads the live COUNT from
 * `production_orders` (excluding CANCELLED) before releasing any units, and uses
 * ON CONFLICT DO NOTHING to skip already-existing order IDs.
 *
 * These tests verify:
 *   1. Pre-release guard: when realOrderCount >= requested quantity, the item is skipped
 *      entirely and reported in the `warnings` array (not in `orderIds`).
 *   2. ON CONFLICT skip: when all_orders INSERT hits ON CONFLICT DO NOTHING (returns no
 *      rows), each conflicting order ID is tracked in the `skippedOrders` array.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import type { POProductSelection } from '../schema';

// ---------------------------------------------------------------------------
// Hoist mutable mock references so they're available inside vi.mock() factories
// ---------------------------------------------------------------------------

const { mockPoolQuery, mockClientQuery, mockClientRelease, mockPoolConnect } = vi.hoisted(() => {
  const mockClientQuery = vi.fn();
  const mockClientRelease = vi.fn();
  const mockPoolConnect = vi.fn().mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
  const mockPoolQuery = vi.fn();
  return { mockPoolQuery, mockClientQuery, mockClientRelease, mockPoolConnect };
});

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that pull these modules
// ---------------------------------------------------------------------------

vi.mock('../middleware/idempotency', () => ({
  idempotencyMiddleware: vi.fn(
    () => (_req: Request, _res: Response, next: NextFunction) => next()
  ),
  logIdempotencyEvent: vi.fn(),
}));

vi.mock('../middleware/routeAuthorization', () => ({
  authorizeApiRoute: vi.fn(
    () => (_req: Request, _res: Response, next: NextFunction) => next()
  ),
}));

vi.mock('../storage', () => ({
  storage: {
    getPOProductSelections: vi.fn<(batchId: string) => Promise<POProductSelection[]>>(),
    createPOProductSelection: vi.fn(),
    getMoldAvailability: vi.fn(),
    getP1POQueueGrouped: vi.fn(),
    getOpenP1PurchaseOrders: vi.fn(),
    syncP1OrdersToProductionQueue:
      vi.fn<() => Promise<{ synced: number; message: string }>>(),
  },
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

vi.mock('../src/utils/resolveItemDisplayName', () => ({
  resolveItemDisplayName: vi.fn((name: string) => name),
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
  },
  pool: {
    query: mockPoolQuery,
    connect: mockPoolConnect,
  },
}));

vi.mock('@shared/schema', () => ({
  insertPOProductSelectionSchema: {
    parse: vi.fn((data: unknown) => data),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { storage } from '../storage';
import { isMetalAccessorySku } from '../src/routes/p1POQueue';

// ---------------------------------------------------------------------------
// Local row types for test fixtures
// ---------------------------------------------------------------------------

interface MockPoItemRow {
  id: number;
  item_name: string;
  item_type: string;
  item_id: string;
  po_id: number;
  po_number: string;
  customer_name: string;
  customer_id: string;
  specifications: Record<string, string>;
  due_date: string;
  order_count: number;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const BATCH_ID = 'batch_test_001';
const PO_ITEM_ID = 42;
const PO_NUMBER = 'PO-2026-001';
const QUANTITY = 1;

function makeSelection(): POProductSelection {
  return {
    id: 1,
    poProductId: PO_ITEM_ID,
    selectionBatchId: BATCH_ID,
    quantitySelected: QUANTITY,
    selectionSource: 'p1',
    createdAt: new Date('2026-01-01'),
  };
}

function makePoItemRow(overrides: Partial<MockPoItemRow> = {}): MockPoItemRow {
  return {
    id: PO_ITEM_ID,
    item_name: 'Stock Rifle M700',
    item_type: 'stock_model',
    item_id: 'M700',
    po_id: 10,
    po_number: PO_NUMBER,
    customer_name: 'Acme Corp',
    customer_id: 'cust-1',
    specifications: { stockModel: 'M700' },
    due_date: '2026-12-31',
    order_count: 0,
    quantity: QUANTITY,
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  return app;
}

// ---------------------------------------------------------------------------
// POST /schedule — RC-3 double-scheduling guard tests
// ---------------------------------------------------------------------------

describe('POST /api/p1-po-queue/schedule — RC-3: double-scheduling guard', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(storage.syncP1OrdersToProductionQueue).mockResolvedValue({
      synced: 0,
      message: 'ok',
    });

    app = buildApp();
    const p1POQueueRouter = (await import('../src/routes/p1POQueue')).default;
    app.use('/api/p1-po-queue', p1POQueueRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns warnings and empty orderIds when realOrderCount >= quantity (RC-3 pre-release guard)', async () => {
    vi.mocked(storage.getPOProductSelections).mockResolvedValue([makeSelection()]);

    // pool.query call 1: PO item lookup → returns the item
    // pool.query call 2: pre-release real count → count=1, quantity=1, so item is skipped
    mockPoolQuery
      .mockResolvedValueOnce([makePoItemRow()])
      .mockResolvedValueOnce([{ cnt: '1' }]);

    const res = await request(app)
      .post('/api/p1-po-queue/schedule')
      .send({ batchId: BATCH_ID, targetWeek: '2026-06-01' });

    expect(res.status).toBe(200);

    // No orders should have been created
    expect(res.body.scheduledCount).toBe(0);
    expect(res.body.orderIds).toHaveLength(0);

    // The item must appear in warnings (pre-release guard, not a silent skip)
    expect(res.body.warnings).toBeDefined();
    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0].poProductId).toBe(PO_ITEM_ID);
    expect(res.body.warnings[0].warning).toMatch(/already fully released/i);

    // No ON CONFLICT skips — the item was blocked before any insert was attempted
    expect(res.body.skippedCount).toBe(0);
  });

  it('tracks skippedOrders when ON CONFLICT DO NOTHING fires on a duplicate order ID (RC-3)', async () => {
    vi.mocked(storage.getPOProductSelections).mockResolvedValue([makeSelection()]);

    // pool.query call 1: PO item lookup
    // pool.query call 2: pre-release count → 0, so we proceed to the transaction
    mockPoolQuery
      .mockResolvedValueOnce([makePoItemRow()])
      .mockResolvedValueOnce([{ cnt: '0' }]);

    // Transaction client calls:
    //   BEGIN, INSERT all_orders (conflict → empty rows), recompute count, UPDATE, COMMIT
    mockClientQuery
      .mockResolvedValueOnce(undefined)          // BEGIN
      .mockResolvedValueOnce({ rows: [] })       // all_orders INSERT → ON CONFLICT DO NOTHING
      .mockResolvedValueOnce([{ cnt: '0' }])     // recompute order_count
      .mockResolvedValueOnce(undefined)          // UPDATE purchase_order_items
      .mockResolvedValueOnce(undefined);         // COMMIT

    const res = await request(app)
      .post('/api/p1-po-queue/schedule')
      .send({ batchId: BATCH_ID, targetWeek: '2026-06-01' });

    expect(res.status).toBe(200);

    // No new orders scheduled
    expect(res.body.scheduledCount).toBe(0);
    expect(res.body.orderIds).toHaveLength(0);

    // The conflict should be explicitly tracked in skippedOrders
    expect(res.body.skippedCount).toBe(1);
    expect(res.body.skippedOrders).toBeDefined();
    expect(res.body.skippedOrders).toHaveLength(1);
    expect(res.body.skippedOrders[0].reason).toBe('already_exists');
  });

  it('returns 404 when no selections exist for the batch', async () => {
    vi.mocked(storage.getPOProductSelections).mockResolvedValue([]);

    const res = await request(app)
      .post('/api/p1-po-queue/schedule')
      .send({ batchId: BATCH_ID });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/No selections found/i);
  });

  it('returns 400 when batchId is missing', async () => {
    const res = await request(app)
      .post('/api/p1-po-queue/schedule')
      .send({ targetWeek: '2026-06-01' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Batch ID is required/i);
  });
});

describe('POST /api/p1-po-queue/progress — progress existing pending units', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = buildApp();
    const p1POQueueRouter = (await import('../src/routes/p1POQueue')).default;
    app.use('/api/p1-po-queue', p1POQueueRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('moves the selected pending production row to Barcode without inserting a replacement', async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [makePoItemRow()] }) // locked PO item
      .mockResolvedValueOnce({ rows: [{ order_id: 'PO-EXISTING-1' }] }) // pending unit
      .mockResolvedValueOnce(undefined) // all_orders upsert
      .mockResolvedValueOnce(undefined) // production_orders update
      .mockResolvedValueOnce(undefined); // COMMIT

    const res = await request(app)
      .post('/api/p1-po-queue/progress')
      .send({ selections: [{ poProductId: PO_ITEM_ID, quantity: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.orderIds).toEqual(['PO-EXISTING-1']);
    expect(res.body.itemsProgressed).toBe(1);

    const sqlCalls = mockClientQuery.mock.calls.map(([query]) => String(query));
    expect(sqlCalls.some((query) => /UPDATE production_orders/.test(query))).toBe(true);
    expect(sqlCalls.some((query) => /INSERT INTO production_orders/.test(query))).toBe(false);
  });

  it('rolls back when fewer pending units exist than the selected quantity', async () => {
    mockClientQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [makePoItemRow({ quantity: 2 })] })
      .mockResolvedValueOnce({ rows: [{ order_id: 'PO-EXISTING-1' }] })
      .mockResolvedValueOnce(undefined); // ROLLBACK

    const res = await request(app)
      .post('/api/p1-po-queue/progress')
      .send({ selections: [{ poProductId: PO_ITEM_ID, quantity: 2 }] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/only 1 pending unit/i);
    expect(mockClientQuery.mock.calls.some(([query]) => String(query) === 'ROLLBACK')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /schedule — RC-4: order_count recompute guard tests
// ---------------------------------------------------------------------------

describe('POST /api/p1-po-queue/schedule — RC-4: order_count recompute guard', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(storage.syncP1OrdersToProductionQueue).mockResolvedValue({
      synced: 0,
      message: 'ok',
    });

    app = buildApp();
    const p1POQueueRouter = (await import('../src/routes/p1POQueue')).default;
    app.use('/api/p1-po-queue', p1POQueueRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('sets order_count to the live COUNT(*), not old_order_count + inserted, after a successful schedule run (RC-4)', async () => {
    vi.mocked(storage.getPOProductSelections).mockResolvedValue([makeSelection()]);

    // Simulate drift: purchase_order_items.order_count = 5 (stale from a prior partial
    // failure), but the live COUNT(*) from production_orders is 0 (no committed rows).
    // After inserting 1 new order the recompute returns 1.
    //
    // Additive approach:  order_count = 5 + 1 = 6  ← WRONG
    // RC-4 recompute:     order_count = COUNT(*)  = 1  ← CORRECT
    const STALE_ORDER_COUNT = 5;

    // pool.query 1: PO item lookup — row carries the stale order_count value.
    // pool.query 2: pre-release live COUNT → 0, so the guard lets us proceed.
    mockPoolQuery
      .mockResolvedValueOnce([makePoItemRow({ order_count: STALE_ORDER_COUNT })])
      .mockResolvedValueOnce([{ cnt: '0' }]);

    // Transaction client calls (full happy path, 1 new order):
    //   BEGIN
    //   INSERT all_orders RETURNING id    → new row
    //   INSERT admin_audit_log            → ok
    //   INSERT production_orders          → ok
    //   INSERT layup_schedule             → ok
    //   SELECT COUNT(*) recompute         → cnt = 1  (just the row we inserted)
    //   UPDATE purchase_order_items       → ok
    //   COMMIT
    mockClientQuery
      .mockResolvedValueOnce(undefined)                      // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 999 }] })        // INSERT all_orders → new row
      .mockResolvedValueOnce(undefined)                      // INSERT admin_audit_log
      .mockResolvedValueOnce(undefined)                      // INSERT production_orders
      .mockResolvedValueOnce(undefined)                      // INSERT layup_schedule
      .mockResolvedValueOnce({ rows: [{ cnt: '1' }] })       // SELECT COUNT(*) recompute
      .mockResolvedValueOnce(undefined)                      // UPDATE purchase_order_items
      .mockResolvedValueOnce(undefined);                     // COMMIT

    const res = await request(app)
      .post('/api/p1-po-queue/schedule')
      .send({ batchId: BATCH_ID, targetWeek: '2026-06-01' });

    expect(res.status).toBe(200);
    expect(res.body.scheduledCount).toBe(1);

    // Assert the recompute SELECT COUNT(*) query was actually executed inside the
    // transaction, filtering on the correct po_item_id and excluding CANCELLED rows.
    const recomputeCall = mockClientQuery.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('SELECT COUNT(*)') &&
        args[0].includes('production_orders') &&
        args[0].includes("production_status != 'CANCELLED'")
    );
    expect(recomputeCall).toBeDefined();
    expect(recomputeCall![1][0]).toBe(PO_ITEM_ID);

    // The UPDATE must use the live COUNT result (1) — NOT stale_count + inserted = 5+1 = 6.
    const updateCall = mockClientQuery.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('UPDATE purchase_order_items') &&
        args[0].includes('order_count')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1][0]).toBe(1);           // live COUNT result, not 5+1
    expect(updateCall![1][0]).not.toBe(STALE_ORDER_COUNT + 1); // explicitly not additive
    expect(updateCall![1][1]).toBe(PO_ITEM_ID);
  });

  it('recomputes order_count from live COUNT on retry after a mid-transaction rollback, not from the stale cached value (RC-4)', async () => {
    // Simulate drift: purchase_order_items.order_count = 5 (stale).
    // The live pre-release COUNT from production_orders is 0 for both the first
    // (failed) attempt and the retry, because the first transaction was rolled back.
    //
    // Additive approach on retry:  order_count = 5 + 1 = 6  ← WRONG
    // RC-4 recompute on retry:     order_count = COUNT(*)  = 1  ← CORRECT
    const STALE_ORDER_COUNT = 5;

    vi.mocked(storage.getPOProductSelections).mockResolvedValue([makeSelection()]);

    // First attempt pool queries: PO item (stale order_count=5) + pre-release count=0.
    mockPoolQuery
      .mockResolvedValueOnce([makePoItemRow({ order_count: STALE_ORDER_COUNT })])
      .mockResolvedValueOnce([{ cnt: '0' }]);

    // First transaction rolls back at production_orders INSERT.
    // The ROLLBACK means order_count stays at 5 (stale) in the real DB.
    mockClientQuery
      .mockResolvedValueOnce(undefined)                             // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 100 }] })              // INSERT all_orders → row
      .mockResolvedValueOnce(undefined)                             // INSERT admin_audit_log
      .mockRejectedValueOnce(new Error('production_orders_fail'))  // INSERT production_orders throws
      .mockResolvedValueOnce(undefined);                            // ROLLBACK

    const res1 = await request(app)
      .post('/api/p1-po-queue/schedule')
      .send({ batchId: BATCH_ID, targetWeek: '2026-06-01' });

    expect(res1.status).toBe(200);
    expect(res1.body.scheduledCount).toBe(0);
    expect(res1.body.errors).toHaveLength(1);

    // Re-build the app for the retry so the router module is fresh.
    vi.resetModules();
    vi.clearAllMocks();

    vi.mocked(storage.syncP1OrdersToProductionQueue).mockResolvedValue({
      synced: 0,
      message: 'ok',
    });
    vi.mocked(storage.getPOProductSelections).mockResolvedValue([makeSelection()]);

    // Retry pool queries: stale order_count=5 is still in the row; live COUNT is still 0
    // because the first transaction rolled back (no committed production_orders rows).
    mockPoolQuery
      .mockResolvedValueOnce([makePoItemRow({ order_count: STALE_ORDER_COUNT })])
      .mockResolvedValueOnce([{ cnt: '0' }]);

    // Retry transaction succeeds end-to-end.
    // Recompute COUNT returns 1 (the one row inserted in this transaction).
    mockClientQuery
      .mockResolvedValueOnce(undefined)                      // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 101 }] })        // INSERT all_orders → new row
      .mockResolvedValueOnce(undefined)                      // INSERT admin_audit_log
      .mockResolvedValueOnce(undefined)                      // INSERT production_orders
      .mockResolvedValueOnce(undefined)                      // INSERT layup_schedule
      .mockResolvedValueOnce({ rows: [{ cnt: '1' }] })       // SELECT COUNT(*) recompute
      .mockResolvedValueOnce(undefined)                      // UPDATE purchase_order_items
      .mockResolvedValueOnce(undefined);                     // COMMIT

    const retryApp = buildApp();
    const p1POQueueRouter = (await import('../src/routes/p1POQueue')).default;
    retryApp.use('/api/p1-po-queue', p1POQueueRouter);

    const res2 = await request(retryApp)
      .post('/api/p1-po-queue/schedule')
      .send({ batchId: BATCH_ID, targetWeek: '2026-06-01' });

    expect(res2.status).toBe(200);
    expect(res2.body.scheduledCount).toBe(1);

    // Assert the recompute SELECT COUNT(*) query ran in the retry transaction.
    const recomputeCall = mockClientQuery.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('SELECT COUNT(*)') &&
        args[0].includes('production_orders') &&
        args[0].includes("production_status != 'CANCELLED'")
    );
    expect(recomputeCall).toBeDefined();
    expect(recomputeCall![1][0]).toBe(PO_ITEM_ID);

    // UPDATE must use the live COUNT (1), NOT the stale cached value + inserted = 5+1 = 6.
    const updateCall = mockClientQuery.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('UPDATE purchase_order_items') &&
        args[0].includes('order_count')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1][0]).toBe(1);                       // live COUNT result
    expect(updateCall![1][0]).not.toBe(STALE_ORDER_COUNT + 1); // explicitly not 5+1=6
    expect(updateCall![1][1]).toBe(PO_ITEM_ID);
  });
});

// ---------------------------------------------------------------------------
// isMetalAccessorySku — unit tests for the guard function
// ---------------------------------------------------------------------------

describe('isMetalAccessorySku — routing guard', () => {
  it('returns true for a custom_model item type regardless of name or id', () => {
    expect(isMetalAccessorySku('', '', 'custom_model')).toBe(true);
    expect(isMetalAccessorySku('SomeRifle', 'SR100', 'custom_model')).toBe(true);
  });

  it('returns true for any non-stock_model item type', () => {
    expect(isMetalAccessorySku('', '', 'service')).toBe(true);
    expect(isMetalAccessorySku('Widget', 'W1', 'accessory')).toBe(true);
  });

  it('returns true when itemName starts with a known metal prefix (AGBM)', () => {
    expect(isMetalAccessorySku('AGBM-001', '', 'stock_model')).toBe(true);
    expect(isMetalAccessorySku('agbm_rifle', '', 'stock_model')).toBe(true);
  });

  it('returns true when itemName starts with AGBDL prefix', () => {
    expect(isMetalAccessorySku('AGBDL-receiver', '', 'stock_model')).toBe(true);
  });

  it('returns true when itemName starts with AGM5 prefix', () => {
    expect(isMetalAccessorySku('AGM5-barrel', '', 'stock_model')).toBe(true);
  });

  it('returns true when itemName starts with AGPIC prefix', () => {
    expect(isMetalAccessorySku('AGPIC-mount', '', 'stock_model')).toBe(true);
  });

  it('returns true when itemName starts with AGARCA prefix', () => {
    expect(isMetalAccessorySku('AGARCA-base', '', 'stock_model')).toBe(true);
    expect(isMetalAccessorySku('AGARCA08', '', 'stock_model')).toBe(true);
  });

  it('recognizes the production SKUs shown on bottom-metal PO lines', () => {
    expect(isMetalAccessorySku('AGMS5AA01', 'AGMS5AA01', 'stock_model')).toBe(true);
    expect(isMetalAccessorySku('AGBDLSA01', 'AGBDLSA01', 'stock_model')).toBe(true);
    expect(isMetalAccessorySku('AGARCA08', 'AGARCA08', 'stock_model')).toBe(true);
  });

  it('returns true when itemId (not itemName) starts with a metal prefix', () => {
    expect(isMetalAccessorySku('', 'AGM5-002', 'stock_model')).toBe(true);
    expect(isMetalAccessorySku('StandardRifle', 'AGBM-009', 'stock_model')).toBe(true);
  });

  it('returns false for a stock_model with no metal prefix in name or id', () => {
    expect(isMetalAccessorySku('Stock Rifle M700', 'M700', 'stock_model')).toBe(false);
    expect(isMetalAccessorySku('SR-100', 'SR100', 'stock_model')).toBe(false);
  });

  it('returns false when itemType is explicitly stock_model and no metal prefix matches', () => {
    expect(isMetalAccessorySku('Premier Model', 'PM-001', 'stock_model')).toBe(false);
  });

  it('ignores dashes and underscores when matching metal prefixes', () => {
    expect(isMetalAccessorySku('AG-BM-receiver', '', 'stock_model')).toBe(true);
    expect(isMetalAccessorySku('AG_BM_part', '', 'stock_model')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /schedule — custom_model metal accessory routing path
// ---------------------------------------------------------------------------

describe('POST /api/p1-po-queue/schedule — custom_model routes to bottom_metal_demands', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(storage.syncP1OrdersToProductionQueue).mockResolvedValue({
      synced: 0,
      message: 'ok',
    });

    app = buildApp();
    const p1POQueueRouter = (await import('../src/routes/p1POQueue')).default;
    app.use('/api/p1-po-queue', p1POQueueRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('routes a custom_model item to bottom_metal_demands and does NOT create production queue entries', async () => {
    vi.mocked(storage.getPOProductSelections).mockResolvedValue([makeSelection()]);

    const metalItem = makePoItemRow({ item_type: 'custom_model', item_name: 'AGBM-receiver' });

    mockPoolQuery.mockResolvedValueOnce([metalItem]);

    mockClientQuery
      .mockResolvedValueOnce(undefined)         // BEGIN
      .mockResolvedValueOnce({ rows: [] })      // INSERT into bottom_metal_demands
      .mockResolvedValueOnce({ rows: [] })      // INSERT into admin_audit_log
      .mockResolvedValueOnce(undefined)         // UPDATE purchase_order_items
      .mockResolvedValueOnce(undefined);        // COMMIT

    const res = await request(app)
      .post('/api/p1-po-queue/schedule')
      .send({ batchId: BATCH_ID, targetWeek: '2026-06-01' });

    expect(res.status).toBe(200);

    expect(res.body.metalDemandCount).toBe(1);
    expect(res.body.metalDemandOrderIds).toBeDefined();
    expect(res.body.metalDemandOrderIds).toHaveLength(1);
    expect(res.body.metalDemandOrderIds[0]).toBe(`PO-${PO_NUMBER}-${PO_ITEM_ID}`);

    expect(res.body.scheduledCount).toBe(0);
    expect(res.body.orderIds).toHaveLength(0);

    const bottomMetalInsertCall = mockClientQuery.mock.calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('bottom_metal_demands')
    );
    expect(bottomMetalInsertCall).toBeDefined();

    const productionOrdersCall = mockPoolQuery.mock.calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('production_orders')
    );
    expect(productionOrdersCall).toBeUndefined();

    const layupScheduleCall = mockClientQuery.mock.calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('layup_schedule')
    );
    expect(layupScheduleCall).toBeUndefined();
  });

  it('includes the metal SKU from the item name in the bottom_metal_demands insert', async () => {
    vi.mocked(storage.getPOProductSelections).mockResolvedValue([makeSelection()]);

    const metalItem = makePoItemRow({ item_type: 'custom_model', item_name: 'AGARCA-base-unit' });

    mockPoolQuery.mockResolvedValueOnce([metalItem]);

    mockClientQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/p1-po-queue/schedule')
      .send({ batchId: BATCH_ID, targetWeek: '2026-06-01' });

    expect(res.status).toBe(200);
    expect(res.body.metalDemandCount).toBe(1);

    const bottomMetalCall = mockClientQuery.mock.calls.find(
      (args: unknown[]) => typeof args[0] === 'string' && args[0].includes('bottom_metal_demands')
    );
    expect(bottomMetalCall).toBeDefined();
    expect(bottomMetalCall![1]).toContain('AGARCA-base-unit');
  });
});
