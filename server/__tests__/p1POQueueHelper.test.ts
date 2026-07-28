import { describe, it, expect } from 'vitest';
import {
  isProductionOrderFulfilled,
  buildFulfillmentMap,
  isPoItemFullyFulfilled,
  computeP1Queue,
  type ProductionOrderRow,
  type RawPurchaseOrder,
  type RawPurchaseOrderItem,
} from '../src/helpers/p1POQueueHelper';

// ---------------------------------------------------------------------------
// Helpers for building minimal fixture objects
// ---------------------------------------------------------------------------

function makePO(overrides: Partial<RawPurchaseOrder> = {}): RawPurchaseOrder {
  return {
    id: 1,
    poNumber: 'PO-001',
    customerName: 'Acme Corp',
    customerId: 100,
    poDate: null,
    expectedDelivery: null,
    ...overrides,
  };
}

function makeItem(overrides: Partial<RawPurchaseOrderItem> = {}): RawPurchaseOrderItem {
  return {
    id: 10,
    itemName: 'Stock Rifle',
    itemType: 'stock_model',
    specifications: { stockModel: 'M700' },
    quantity: 2,
    orderCount: 0,
    stockStatus: 'pending',
    notes: null,
    productionNotes: null,
    dueDate: null,
    ...overrides,
  };
}

function makeProdRow(overrides: Partial<ProductionOrderRow> = {}): ProductionOrderRow {
  return {
    po_id: 1,
    po_item_id: 10,
    production_status: 'In Progress',
    current_department: 'Assembly',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isProductionOrderFulfilled
// ---------------------------------------------------------------------------

describe('isProductionOrderFulfilled', () => {
  it('returns true when production_status is Shipped', () => {
    expect(isProductionOrderFulfilled(makeProdRow({ production_status: 'Shipped', current_department: null }))).toBe(true);
  });

  it('returns true when production_status is Completed', () => {
    expect(isProductionOrderFulfilled(makeProdRow({ production_status: 'Completed', current_department: null }))).toBe(true);
  });

  it('normalizes uppercase database terminal statuses', () => {
    expect(isProductionOrderFulfilled(makeProdRow({ production_status: 'SHIPPED' }))).toBe(true);
    expect(isProductionOrderFulfilled(makeProdRow({ production_status: 'COMPLETED' }))).toBe(true);
  });

  // RC-5 FIX: Shipping QC must NOT count as fulfilled — if QC rejects a unit
  // it goes back for rework and must remain releasable in the P1 queue.
  it('returns false when current_department is Shipping QC (RC-5)', () => {
    expect(isProductionOrderFulfilled(makeProdRow({ production_status: 'In Progress', current_department: 'Shipping QC' }))).toBe(false);
  });

  it('returns false when order is still in a production department', () => {
    expect(isProductionOrderFulfilled(makeProdRow({ production_status: 'In Progress', current_department: 'Machining' }))).toBe(false);
  });

  it('returns false when both fields are null', () => {
    expect(isProductionOrderFulfilled(makeProdRow({ production_status: null, current_department: null }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildFulfillmentMap
// ---------------------------------------------------------------------------

describe('buildFulfillmentMap', () => {
  it('returns an empty map when given no rows', () => {
    expect(buildFulfillmentMap([]).size).toBe(0);
  });

  it('correctly counts total and fulfilled orders for a single PO item', () => {
    const rows: ProductionOrderRow[] = [
      makeProdRow({ production_status: 'Shipped', current_department: null }),
      makeProdRow({ production_status: 'In Progress', current_department: 'Machining' }),
    ];
    const stats = buildFulfillmentMap(rows).get(1)!.get(10)!;
    expect(stats.total).toBe(2);
    expect(stats.fulfilled).toBe(1);
  });

  // RC-5 FIX: Shipping QC is NOT a terminal state — units may be rejected and
  // sent back for rework. They must not be counted as fulfilled.
  it('does NOT count orders in Shipping QC department as fulfilled (RC-5)', () => {
    const rows: ProductionOrderRow[] = [
      makeProdRow({ production_status: 'In Progress', current_department: 'Shipping QC' }),
      makeProdRow({ production_status: 'In Progress', current_department: 'Shipping QC' }),
    ];
    const stats = buildFulfillmentMap(rows).get(1)!.get(10)!;
    expect(stats.total).toBe(2);
    expect(stats.fulfilled).toBe(0);
  });

  it('only counts Shipped and Completed orders as fulfilled', () => {
    const rows: ProductionOrderRow[] = [
      makeProdRow({ production_status: 'Shipped', current_department: null }),
      makeProdRow({ production_status: 'Completed', current_department: null }),
      makeProdRow({ production_status: 'In Progress', current_department: 'Shipping QC' }),
      makeProdRow({ production_status: 'In Progress', current_department: 'Assembly' }),
    ];
    const stats = buildFulfillmentMap(rows).get(1)!.get(10)!;
    expect(stats.total).toBe(4);
    expect(stats.fulfilled).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// isPoItemFullyFulfilled
// ---------------------------------------------------------------------------

describe('isPoItemFullyFulfilled', () => {
  it('returns true when all production orders are fulfilled', () => {
    expect(isPoItemFullyFulfilled({ total: 3, active: 3, fulfilled: 3, activeP1Queue: 0 })).toBe(true);
  });

  it('returns false when some production orders remain unfulfilled', () => {
    expect(isPoItemFullyFulfilled({ total: 3, active: 3, fulfilled: 2, activeP1Queue: 0 })).toBe(false);
  });

  it('returns false when there are no production orders', () => {
    expect(isPoItemFullyFulfilled({ total: 0, active: 0, fulfilled: 0, activeP1Queue: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeP1Queue — Shipping QC fulfillment rule (RC-5)
// ---------------------------------------------------------------------------

describe('computeP1Queue — Shipping QC fulfillment rule (RC-5)', () => {
  it('excludes a PO whose production units are all in Shipping QC', () => {
    const po = makePO();
    const item = makeItem();
    const itemsByPoId = new Map([[po.id, [item]]]);
    const prodRows: ProductionOrderRow[] = [
      makeProdRow({ production_status: 'In Progress', current_department: 'Shipping QC' }),
      makeProdRow({ production_status: 'In Progress', current_department: 'Shipping QC' }),
    ];

    const result = computeP1Queue([po], itemsByPoId, prodRows);

    expect(result).toHaveLength(0);
  });

  it('excludes a PO whose production units are all downstream of P1', () => {
    const po = makePO();
    const item = makeItem();
    const itemsByPoId = new Map([[po.id, [item]]]);
    const prodRows: ProductionOrderRow[] = [
      makeProdRow({ production_status: 'In Progress', current_department: 'Shipping QC' }),
      makeProdRow({ production_status: 'In Progress', current_department: 'Assembly' }),
    ];

    const result = computeP1Queue([po], itemsByPoId, prodRows);

    expect(result).toHaveLength(0);
  });

  it('excludes a PO when all production orders are Shipped or Completed (baseline)', () => {
    const po = makePO();
    const item = makeItem();
    const itemsByPoId = new Map([[po.id, [item]]]);
    const prodRows: ProductionOrderRow[] = [
      makeProdRow({ production_status: 'Shipped', current_department: null }),
      makeProdRow({ production_status: 'Completed', current_department: null }),
    ];

    const result = computeP1Queue([po], itemsByPoId, prodRows);

    expect(result).toHaveLength(0);
  });

  it('does not expose ungenerated PO demand as progressable queue units', () => {
    const po = makePO();
    const item = makeItem();
    const itemsByPoId = new Map([[po.id, [item]]]);

    const result = computeP1Queue([po], itemsByPoId, []);

    expect(result).toHaveLength(0);
  });

  it('handles multiple POs — excludes only the fully fulfilled one', () => {
    const poA = makePO({ id: 1, poNumber: 'PO-001', customerName: 'Alpha' });
    const poB = makePO({ id: 2, poNumber: 'PO-002', customerName: 'Beta', customerId: 200 });
    const itemA = makeItem({ id: 10 });
    const itemB = makeItem({ id: 20 });
    const itemsByPoId = new Map([
      [1, [itemA]],
      [2, [itemB]],
    ]);
    const prodRows: ProductionOrderRow[] = [
      { po_id: 1, po_item_id: 10, production_status: 'Shipped', current_department: null },
      { po_id: 1, po_item_id: 10, production_status: 'Completed', current_department: null },
      { po_id: 2, po_item_id: 20, production_status: 'PENDING', current_department: 'P1 Production Queue' },
    ];

    const result = computeP1Queue([poA, poB], itemsByPoId, prodRows);

    expect(result).toHaveLength(1);
    expect(result[0].customerName).toBe('Beta');
    expect(result[0].purchaseOrders[0].poNumber).toBe('PO-002');
  });

  it('exposes exact existing P1 units as progressable quantity', () => {
    const poA = makePO({ id: 1, poNumber: 'PO-001', customerName: 'Alpha' });
    const poB = makePO({ id: 2, poNumber: 'PO-002', customerName: 'Beta', customerId: 200 });
    const itemA = makeItem({ id: 10 });
    const itemB = makeItem({ id: 20 });
    const itemsByPoId = new Map([
      [1, [itemA]],
      [2, [itemB]],
    ]);
    const prodRows: ProductionOrderRow[] = [
      { po_id: 1, po_item_id: 10, production_status: 'PENDING', current_department: 'P1 Production Queue' },
      { po_id: 2, po_item_id: 20, production_status: 'PENDING', current_department: 'P1 Production Queue' },
    ];

    const result = computeP1Queue([poA, poB], itemsByPoId, prodRows);

    expect(result).toHaveLength(2);
    expect(result[0].purchaseOrders[0].items[0]).toMatchObject({
      quantity: 1,
      availableQuantity: 1,
      departmentStatuses: { 'P1 Production Queue': 1 },
    });
    expect(result[1].purchaseOrders[0].items[0]).toMatchObject({
      quantity: 1,
      availableQuantity: 1,
      departmentStatuses: { 'P1 Production Queue': 1 },
    });
  });

  it('removes the PO from the P1 queue after its last unit progresses', () => {
    const po = makePO();
    const item = makeItem({ quantity: 1 });
    const itemsByPoId = new Map([[po.id, [item]]]);

    const result = computeP1Queue([po], itemsByPoId, [
      makeProdRow({ production_status: 'IN_PROGRESS', current_department: 'Barcode' }),
    ]);

    expect(result).toHaveLength(0);
  });

  it('filters out items that are not stock_model type', () => {
    const po = makePO();
    const item = makeItem({ itemType: 'custom_model' });
    const itemsByPoId = new Map([[po.id, [item]]]);

    const result = computeP1Queue([po], itemsByPoId, []);

    expect(result).toHaveLength(0);
  });

  it('ignores stale cached order_count when no production rows exist', () => {
    const po = makePO();
    const item = makeItem({ quantity: 2, orderCount: 2 });
    const itemsByPoId = new Map([[po.id, [item]]]);

    const result = computeP1Queue([po], itemsByPoId, []);

    expect(result).toHaveLength(0);
  });

  it('shows an existing pending production unit as selectable PO progress', () => {
    const po = makePO({ poNumber: 'P18261' });
    const item = makeItem({
      id: 18,
      itemName: 'AG-CRB-PV105-ER',
      specifications: { stockModel: 'AG-CRB-PV105-ER' },
      quantity: 1,
      orderCount: 1,
    });
    const itemsByPoId = new Map([[po.id, [item]]]);
    const prodRows: ProductionOrderRow[] = [
      makeProdRow({
        po_item_id: 18,
        production_status: 'PENDING',
        current_department: 'P1 Production Queue',
      }),
    ];

    const result = computeP1Queue([po], itemsByPoId, prodRows);

    expect(result).toHaveLength(1);
    expect(result[0].purchaseOrders[0].items[0]).toMatchObject({
      id: 18,
      quantity: 1,
      availableQuantity: 1,
      status: 'generated',
      departmentStatuses: { 'P1 Production Queue': 1 },
    });
  });

  it('uses real pending queue rows instead of a stale cached order count', () => {
    const po = makePO();
    const item = makeItem({ quantity: 3, orderCount: 3 });
    const itemsByPoId = new Map([[po.id, [item]]]);

    const result = computeP1Queue([po], itemsByPoId, [
      makeProdRow({ production_status: 'PENDING', current_department: 'P1 Production Queue' }),
    ]);

    expect(result[0].purchaseOrders[0].items[0].quantity).toBe(1);
  });

  it('exposes only the units still in P1 when the line also has downstream units', () => {
    const po = makePO({ poNumber: '58608945' });
    const item = makeItem({ quantity: 8 });
    const itemsByPoId = new Map([[po.id, [item]]]);
    const prodRows: ProductionOrderRow[] = [
      ...Array.from({ length: 4 }, () =>
        makeProdRow({ production_status: 'PENDING', current_department: 'P1 Production Queue' })),
      ...Array.from({ length: 3 }, () =>
        makeProdRow({ production_status: 'IN_PROGRESS', current_department: 'Barcode' })),
      makeProdRow({ production_status: 'SHIPPED', current_department: 'Shipping' }),
    ];

    const result = computeP1Queue([po], itemsByPoId, prodRows);

    expect(result[0].purchaseOrders[0].items[0]).toMatchObject({
      orderedQuantity: 8,
      quantity: 4,
      availableQuantity: 4,
      departmentStatuses: {
        'P1 Production Queue': 4,
        Barcode: 3,
        Shipping: 1,
      },
    });
  });

  it('returns empty when given no POs', () => {
    const result = computeP1Queue([], new Map(), []);
    expect(result).toHaveLength(0);
  });

  it('prefers purchase_order_items.stock_model_id over specification labels', () => {
    const po = makePO();
    const item = makeItem({
      stockModelId: '84',
      specifications: { stockModel: 'stale-label' },
    });
    const result = computeP1Queue(
      [po],
      new Map([[po.id, [item]]]),
      [makeProdRow({ production_status: 'PENDING', current_department: 'P1 Production Queue' })],
    );

    expect(result[0].purchaseOrders[0].items[0]).toMatchObject({
      stockModel: '84',
      stockModelId: '84',
    });
  });
});
