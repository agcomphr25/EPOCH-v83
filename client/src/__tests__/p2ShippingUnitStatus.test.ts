import { describe, expect, it } from 'vitest';
import { isHistoricalP2InventoryUnit } from '../lib/p2ShippingUnitStatus';

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
