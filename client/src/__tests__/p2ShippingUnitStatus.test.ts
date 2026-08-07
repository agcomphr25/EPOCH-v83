import { describe, expect, it } from 'vitest';
import { isCompletedP2ShippingUnit, isHistoricalP2InventoryUnit } from '../lib/p2ShippingUnitStatus';

describe('isCompletedP2ShippingUnit', () => {
  it('recognizes a durable completed status when the legacy timestamp is missing', () => {
    expect(isCompletedP2ShippingUnit({ status: 'complete', completedAt: null })).toBe(true);
    expect(isCompletedP2ShippingUnit({ status: ' COMPLETED ', completedAt: null })).toBe(true);
    expect(isCompletedP2ShippingUnit({ status: 'CLOSED', completedAt: null })).toBe(true);
  });

  it('keeps active units in production and accepts the legacy completion timestamp', () => {
    expect(isCompletedP2ShippingUnit({ status: 'ACTIVE', completedAt: null })).toBe(false);
    expect(isCompletedP2ShippingUnit({ status: 'ACTIVE', completedAt: '2026-08-07T12:00:00Z' })).toBe(true);
  });
});

describe('isHistoricalP2InventoryUnit', () => {
  it('excludes completed non-finalized inventory records from active production', () => {
    expect(isHistoricalP2InventoryUnit({
      status: 'COMPLETED',
      currentDepartment: 'Inventory',
      finalizedAt: null,
    })).toBe(true);
  });

  it('keeps active QC and finalized inventory out of the historical bucket', () => {
    expect(isHistoricalP2InventoryUnit({
      status: 'ACTIVE',
      currentDepartment: 'Quality Control',
      finalizedAt: null,
    })).toBe(false);
    expect(isHistoricalP2InventoryUnit({
      status: 'COMPLETED',
      currentDepartment: 'Inventory',
      finalizedAt: '2026-07-31T12:00:00Z',
    })).toBe(false);
  });
});
