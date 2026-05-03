import type { P1POQueueCustomer, P1POQueueItem } from '../../schema';

// ---------------------------------------------------------------------------
// Low-level fulfillment helpers
// ---------------------------------------------------------------------------

export interface ProductionOrderRow {
  po_id: number;
  po_item_id: number;
  production_status: string | null;
  current_department: string | null;
}

export interface FulfillmentStats {
  total: number;
  fulfilled: number;
}

/**
 * Returns true when a production order row counts as fulfilled for P1 queue purposes.
 * An order is fulfilled only when it is Shipped or Completed.
 *
 * RC-5 FIX: Shipping QC has been intentionally removed from this check. Previously,
 * units arriving at Shipping QC were treated as fulfilled, which caused PO items to
 * disappear from the release list prematurely. If QC rejects a unit for rework, the
 * PO item must remain releasable — so only terminal shipped/completed states count.
 */
export function isProductionOrderFulfilled(row: ProductionOrderRow): boolean {
  return (
    row.production_status === 'Shipped' ||
    row.production_status === 'Completed'
  );
}

/**
 * Builds a nested fulfillment map from a flat list of production order rows.
 * Returns Map<poId, Map<poItemId, FulfillmentStats>>.
 */
export function buildFulfillmentMap(
  rows: ProductionOrderRow[],
): Map<number, Map<number, FulfillmentStats>> {
  const poFulfillmentMap = new Map<number, Map<number, FulfillmentStats>>();

  for (const row of rows) {
    const poId = row.po_id;
    const poItemId = row.po_item_id;

    if (!poFulfillmentMap.has(poId)) {
      poFulfillmentMap.set(poId, new Map());
    }
    const itemMap = poFulfillmentMap.get(poId)!;

    if (!itemMap.has(poItemId)) {
      itemMap.set(poItemId, { total: 0, fulfilled: 0 });
    }
    const stats = itemMap.get(poItemId)!;
    stats.total++;
    if (isProductionOrderFulfilled(row)) {
      stats.fulfilled++;
    }
  }

  return poFulfillmentMap;
}

/**
 * Returns true when all production orders for a given PO item are fulfilled,
 * meaning the item should be excluded from the P1 queue.
 */
export function isPoItemFullyFulfilled(stats: FulfillmentStats): boolean {
  return stats.total > 0 && stats.fulfilled === stats.total;
}

// ---------------------------------------------------------------------------
// Raw PO / item types (a subset of the DB row shapes used by this helper)
// ---------------------------------------------------------------------------

export interface RawPurchaseOrder {
  id: number;
  poNumber: string;
  poDate?: Date | string | null;
  expectedDelivery?: Date | string | null;
  customerId?: number | null;
  customerName: string;
}

export interface RawPurchaseOrderItem {
  id: number;
  itemName: string | null;
  itemType: string | null;
  specifications: Record<string, unknown> | null | unknown;
  quantity: number;
  orderCount: number | null;
  stockStatus: string | null;
  notes: string | null;
  productionNotes: string | null;
  dueDate?: Date | string | null;
}

// ---------------------------------------------------------------------------
// Queue computation — pure, testable, no DB access
// ---------------------------------------------------------------------------

/**
 * Given raw database rows (POs, their items, and production orders), applies
 * the P1 queue filtering rules — including the Shipping QC exclusion — and
 * returns the grouped customer/PO/item result.
 *
 * This is the core logic extracted from DatabaseStorage.getOpenP1PurchaseOrders
 * so it can be unit-tested without a real database.
 */
export function computeP1Queue(
  openPOs: RawPurchaseOrder[],
  itemsByPoId: Map<number, RawPurchaseOrderItem[]>,
  productionOrderRows: ProductionOrderRow[],
): P1POQueueCustomer[] {
  const poFulfillmentMap = buildFulfillmentMap(productionOrderRows);
  const customerMap = new Map<string, P1POQueueCustomer>();

  for (const po of openPOs) {
    const customerId = po.customerId?.toString() || po.customerName;
    let customer = customerMap.get(customerId);
    if (!customer) {
      customer = {
        customerId,
        customerName: po.customerName,
        purchaseOrders: [],
      };
      customerMap.set(customerId, customer);
    }

    const rawItems = itemsByPoId.get(po.id) ?? [];
    const itemFulfillmentMap = poFulfillmentMap.get(po.id) ?? new Map();

    const poItems: P1POQueueItem[] = rawItems
      .map((item) => {
        const specs = (item.specifications as Record<string, unknown>) || {};
        const stockModel =
          (specs.stockModel as string | null) ??
          (specs.stock_model as string | null) ??
          null;
        const orderCount = item.orderCount ?? 0;
        const remainingQuantity = item.quantity - orderCount;

        return {
          id: item.id,
          poNumber: po.poNumber,
          productName: item.itemName ?? '',
          stockModel,
          specifications:
            specs && Object.keys(specs).length > 0 ? specs : null,
          itemType: item.itemType ?? null,
          actionLength:
            (specs.actionLength as string | null) ??
            (specs.action_length as string | null) ??
            null,
          material: (specs.material as string | null) ?? null,
          handedness: (specs.handedness as string | null) ?? null,
          actionInlet:
            (specs.actionInlet as string | null) ??
            (specs.action_inlet as string | null) ??
            null,
          bottomMetal:
            (specs.bottomMetal as string | null) ??
            (specs.bottom_metal as string | null) ??
            null,
          barrelInlet:
            (specs.barrelInlet as string | null) ??
            (specs.barrel_inlet as string | null) ??
            null,
          qds: (specs.qds as string | null) ?? null,
          swivelStuds:
            (specs.swivelStuds as string | null) ??
            (specs.swivel_studs as string | null) ??
            null,
          paintOptions:
            (specs.paintOptions as string | null) ??
            (specs.paint_options as string | null) ??
            null,
          texture: (specs.texture as string | null) ?? null,
          flatTop:
            (specs.flatTop as boolean | null) ??
            (specs.flat_top as boolean | null) ??
            null,
          quantity: remainingQuantity,
          status: item.stockStatus ?? 'pending',
          notes: item.notes ?? item.productionNotes ?? null,
          dueDate: item.dueDate?.toString() ?? null,
          linkedOrderId: null,
        };
      })
      .filter((item) => {
        if (!item.itemType || item.itemType.toLowerCase() !== 'stock_model') {
          return false;
        }
        if (!item.stockModel || item.stockModel.trim() === '') {
          return false;
        }
        const lowerStockModel = item.stockModel.toLowerCase().trim();
        const hasValidStockModel =
          lowerStockModel !== 'no stock' &&
          lowerStockModel !== 'no_stock' &&
          lowerStockModel !== 'unknown';
        if (!hasValidStockModel) {
          return false;
        }
        const fulfillmentStats = itemFulfillmentMap.get(item.id);
        if (fulfillmentStats && isPoItemFullyFulfilled(fulfillmentStats)) {
          return false;
        }
        return item.quantity > 0;
      });

    if (poItems.length > 0) {
      customer.purchaseOrders.push({
        poNumber: po.poNumber,
        poDate: po.poDate?.toString() ?? null,
        expectedDelivery: po.expectedDelivery?.toString() ?? null,
        totalItems: poItems.reduce((sum, item) => sum + item.quantity, 0),
        items: poItems,
      });
    }
  }

  return Array.from(customerMap.values()).filter(
    (c) => c.purchaseOrders.length > 0,
  );
}
