import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({
  pool: {
    connect: vi.fn(),
    query: vi.fn(),
  },
}));
import {
  P1QuantityAdjustmentConflict,
  reconcileP1POLine,
  shouldCloseP1POFromReconciliation,
  validateP1QuantityAdjustment,
  type P1ProductionUnitRow,
} from '../src/services/p1POReconciliationService';

function unit(
  orderId: string,
  currentDepartment: string,
  overrides: Partial<P1ProductionUnitRow> = {}
): P1ProductionUnitRow {
  return {
    orderId,
    currentDepartment,
    productionStatus:
      currentDepartment === 'P1 Production Queue' ? 'PENDING' : 'IN_PROGRESS',
    isFulfilled: false,
    hasShipment: false,
    ...overrides,
  };
}

describe('P1 PO line reconciliation', () => {
  it('reconciles 12 active units into shipped, in-progress, and pending buckets', () => {
    const productionUnits = [
      unit('SHIP-1', 'Shipped', {
        hasShipment: true,
        productionStatus: 'SHIPPED',
      }),
      ...Array.from({ length: 4 }, (_, index) =>
        unit(`WIP-${index}`, index % 2 ? 'Finish QC' : 'Barcode')
      ),
      ...Array.from({ length: 7 }, (_, index) =>
        unit(`PENDING-${index}`, 'P1 Production Queue')
      ),
    ];
    const result = reconcileP1POLine({
      purchaseOrderItemId: 10,
      originalOrderedQuantity: 12,
      canceledDemandQuantity: 0,
      purchaseOrderStatus: 'OPEN',
      productionUnits,
    });

    expect(result).toMatchObject({
      activePoQuantity: 12,
      shippedQuantity: 1,
      workInProgressQuantity: 4,
      pendingQueueQuantity: 7,
      accountedQuantity: 12,
      variance: 0,
      availableToProgressQuantity: 0,
    });
    expect(result.inProgressDepartmentBreakdown).toEqual({
      Barcode: 2,
      'Finish QC': 2,
    });
  });

  it('uses explicit customer cancellation without changing original quantity', () => {
    const result = reconcileP1POLine({
      purchaseOrderItemId: 10,
      originalOrderedQuantity: 12,
      canceledDemandQuantity: 2,
      purchaseOrderStatus: 'OPEN',
      productionUnits: Array.from({ length: 10 }, (_, index) =>
        unit(`PENDING-${index}`, 'P1 Production Queue')
      ),
    });
    expect(result.originalOrderedQuantity).toBe(12);
    expect(result.activePoQuantity).toBe(10);
    expect(result.accountedQuantity).toBe(10);
    expect(result.variance).toBe(0);
  });

  it('excludes a canceled unit while counting its replacement once', () => {
    const result = reconcileP1POLine({
      purchaseOrderItemId: 10,
      originalOrderedQuantity: 2,
      canceledDemandQuantity: 0,
      purchaseOrderStatus: 'OPEN',
      productionUnits: [
        unit('UNIT-1', 'Barcode', { productionStatus: 'CANCELLED' }),
        unit('UNIT-1-R', 'Barcode'),
        unit('UNIT-2', 'P1 Production Queue'),
      ],
    });
    expect(result.activePoQuantity).toBe(2);
    expect(result.workInProgressQuantity).toBe(1);
    expect(result.pendingQueueQuantity).toBe(1);
    expect(result.variance).toBe(0);
  });

  it('deduplicates repeated joined rows by production order ID', () => {
    const repeated = unit('UNIT-1', 'Barcode');
    const result = reconcileP1POLine({
      purchaseOrderItemId: 10,
      originalOrderedQuantity: 1,
      canceledDemandQuantity: 0,
      purchaseOrderStatus: 'OPEN',
      productionUnits: [repeated, repeated, repeated],
    });
    expect(result.workInProgressQuantity).toBe(1);
    expect(result.variance).toBe(0);
  });

  it('requires shipment or fulfillment evidence rather than a status string alone', () => {
    const result = reconcileP1POLine({
      purchaseOrderItemId: 10,
      originalOrderedQuantity: 1,
      canceledDemandQuantity: 0,
      purchaseOrderStatus: 'OPEN',
      productionUnits: [
        unit('UNIT-1', 'Shipping QC', { productionStatus: 'SHIPPED' }),
      ],
    });
    expect(result.shippedQuantity).toBe(0);
    expect(result.workInProgressQuantity).toBe(1);
  });

  it('makes a fully canceled PO inactive and unavailable without mutating units', () => {
    const result = reconcileP1POLine({
      purchaseOrderItemId: 10,
      originalOrderedQuantity: 4,
      canceledDemandQuantity: 0,
      purchaseOrderStatus: 'CANCELED',
      productionUnits: [],
    });
    expect(result.activePoQuantity).toBe(0);
    expect(result.availableToProgressQuantity).toBe(0);
    expect(result.isCanceled).toBe(true);
  });
});

describe('P1 PO quantity-adjustment validation', () => {
  const current = reconcileP1POLine({
    purchaseOrderItemId: 10,
    originalOrderedQuantity: 12,
    canceledDemandQuantity: 2,
    purchaseOrderStatus: 'OPEN',
    productionUnits: Array.from({ length: 8 }, (_, index) =>
      unit(`PENDING-${index}`, 'P1 Production Queue')
    ),
  });

  it('allows cancel and restore quantities inside ledger bounds', () => {
    expect(validateP1QuantityAdjustment(current, 'CANCEL_QUANTITY', 2)).toBe(4);
    expect(validateP1QuantityAdjustment(current, 'RESTORE_QUANTITY', 1)).toBe(
      1
    );
  });

  it('rejects cancellation beyond original demand', () => {
    expect(() =>
      validateP1QuantityAdjustment(current, 'CANCEL_QUANTITY', 11)
    ).toThrow(P1QuantityAdjustmentConflict);
  });

  it('rejects restoration beyond net canceled demand', () => {
    expect(() =>
      validateP1QuantityAdjustment(current, 'RESTORE_QUANTITY', 3)
    ).toThrow('Restore quantity exceeds');
  });

  it('rejects cancellation that would orphan already-accounted units', () => {
    expect(() =>
      validateP1QuantityAdjustment(current, 'CANCEL_QUANTITY', 3)
    ).toThrow('below shipped, in-progress, and pending units');
  });
});

describe('P1 PO completion eligibility', () => {
  const reconciledLine = (quantity: number, shipped: number) =>
    reconcileP1POLine({
      purchaseOrderItemId: 10,
      originalOrderedQuantity: quantity,
      canceledDemandQuantity: 0,
      purchaseOrderStatus: 'OPEN',
      productionUnits: Array.from({ length: shipped }, (_, index) =>
        unit(`DIRECT-SHIP-${index}`, 'Shipped', {
          productionStatus: 'SHIPPED',
          hasShipment: true,
        })
      ),
    });

  it('closes a fully shipped direct-fulfillment PO without requiring production work', () => {
    expect(
      shouldCloseP1POFromReconciliation([
        reconciledLine(2, 2),
        reconciledLine(2, 2),
      ])
    ).toBe(true);
  });

  it('keeps a partially shipped PO open', () => {
    expect(
      shouldCloseP1POFromReconciliation([
        reconciledLine(2, 2),
        reconciledLine(2, 1),
      ])
    ).toBe(false);
  });

  it('does not close a PO with no active customer demand', () => {
    expect(shouldCloseP1POFromReconciliation([])).toBe(false);
  });
});
