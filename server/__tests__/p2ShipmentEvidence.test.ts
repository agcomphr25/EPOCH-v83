import { describe, expect, it } from 'vitest';
import { indexP2ShippedSerializedItemIds } from '../src/lib/p2ShipmentEvidence';
import {
  countDistinctP2DemandUnits,
  isHistoricalP2Unit,
} from '../src/lib/p2SchedulingReconciliation';

describe('P2 shipment and scheduling reconciliation', () => {
  it('deduplicates recovered shipment membership by PO and item id', () => {
    const indexed = indexP2ShippedSerializedItemIds([
      { poId: 14332, serializedItemId: 'ABC' },
      { poId: '14332', serializedItemId: ' abc ' },
      { poId: 14332, serializedItemId: 'DEF' },
      { poId: null, serializedItemId: null },
    ]);

    expect([...indexed.get(14332)!]).toEqual(['abc', 'def']);
  });

  it('does not let historical scrap consume ordered demand', () => {
    expect(isHistoricalP2Unit({ status: 'SCRAPPED' })).toBe(true);
    expect(countDistinctP2DemandUnits([
      { id: 'scrap-1', serialNumber: 'S-001', status: 'SCRAPPED' },
      { id: 'remake-1', serialNumber: 'S-002', status: 'COMPLETED' },
    ], new Set())).toBe(1);
  });

  it('counts shipped, finalization, active, and scheduled units once by serial', () => {
    const rows = [
      { id: 'ship-1', serialNumber: 'S-001', status: 'ACTIVE', currentDepartment: 'Inventory' },
      { id: 'ship-duplicate', serialNumber: 'S-001', status: 'COMPLETED' },
      { id: 'final-1', serialNumber: 'S-002', status: 'ACTIVE', finalizedAt: new Date() },
      { id: 'active-1', serialNumber: 'S-003', status: 'ACTIVE', currentDepartment: 'Oven/Cure' },
      { id: 'scheduled-1', serialNumber: 'S-004', status: 'ACTIVE', currentDepartment: 'Layup' },
      { id: 'pending-1', serialNumber: 'S-005', status: 'ACTIVE', currentDepartment: 'Pending Layup' },
    ];

    expect(countDistinctP2DemandUnits(rows, new Set(['ship-1']))).toBe(4);
  });

  it('leaves nine schedulable units for the accepted PO014332-RA counts', () => {
    const ordered = 390;
    const consumed = 336 + 4 + 34 + 7;
    expect(ordered - consumed).toBe(9);
  });
});
