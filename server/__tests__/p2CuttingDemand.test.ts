import { describe, expect, it } from 'vitest';
import { reconcileP2CuttingDemandWithShipmentLedger } from '../src/lib/p2CuttingDemand';

describe('P2 cutting demand shipment reconciliation', () => {
  it('removes a completed PO line when the shipment ledger accounts for every unit', () => {
    const rows = reconcileP2CuttingDemandWithShipmentLedger([{
      poItemId: 64,
      originalQuantity: 87,
      shippedQuantity: 0,
      committedQuantity: 0,
    }], new Map([[64, 87]]));

    expect(rows).toEqual([]);
  });

  it('leaves partially shipped demand to the existing line-level calculation', () => {
    const rows = reconcileP2CuttingDemandWithShipmentLedger([{
      poItemId: 64,
      originalQuantity: 87,
      shippedQuantity: 2,
      committedQuantity: 5,
    }], new Map([[64, 80]]));

    expect(rows).toEqual([{
      poItemId: 64,
      originalQuantity: 87,
      shippedQuantity: 2,
      committedQuantity: 5,
    }]);
  });
});
