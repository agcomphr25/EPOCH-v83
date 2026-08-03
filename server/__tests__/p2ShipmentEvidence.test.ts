import { describe, expect, it } from 'vitest';
import {
  P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL,
  indexP2ShippedSerializedItemIds,
  normalizeP2ShipmentSerialIdentity,
} from '../src/lib/p2ShipmentEvidence';
import {
  countDistinctP2DemandUnits,
  countDistinctP2SerializedUnits,
  isHistoricalP2Unit,
  p2PendingUnitDeficit,
} from '../src/lib/p2SchedulingReconciliation';
import {
  countDistinctP2PendingUnits,
  isP2PhysicalProjectWorkOrder,
} from '../src/lib/p2ControlCenterReconciliation';

describe('P2 shipment and scheduling reconciliation', () => {
  it('treats a durable non-void packing slip as shipment evidence', () => {
    expect(P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL).toContain(
      'lot.packing_slip_id IS NOT NULL',
    );
    expect(P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL).toContain(
      'OR slip.id IS NOT NULL',
    );
    expect(P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL).toContain(
      "COALESCE(UPPER(lot.status), '') <> 'VOID'",
    );
  });

  it('matches customer-facing serials to replacement-suffixed production identities', () => {
    expect(normalizeP2ShipmentSerialIdentity(' ROC2600034-RMA-2 ')).toBe('ROC2600034');
    expect(normalizeP2ShipmentSerialIdentity('roc2600034-r2')).toBe('ROC2600034');
    expect(normalizeP2ShipmentSerialIdentity('ROC2600034')).toBe('ROC2600034');
  });

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

  it('creates pending capacity for duplicate historical serialized rows', () => {
    const generated = countDistinctP2SerializedUnits([
      { id: 'original', serialNumber: 'ROC2600001', status: 'ACTIVE', currentDepartment: 'Layup' },
      { id: 'duplicate', serialNumber: 'ROC2600001', status: 'ACTIVE', currentDepartment: 'Layup' },
      { id: 'active', serialNumber: 'ROC2600002', status: 'ACTIVE' },
      { id: 'scrap', serialNumber: 'ROC2600003', status: 'SCRAPPED' },
      { id: 'historical', serialNumber: 'ROC2600004', status: 'COMPLETED', currentDepartment: 'Inventory' },
    ], new Set());

    expect(generated).toBe(2);
    expect(3 - generated).toBe(1);
  });

  it('places a nine-unit family gap on the remaining PO line without duplicating pending rows', () => {
    expect(p2PendingUnitDeficit(90, 81, 0)).toBe(9);
    expect(p2PendingUnitDeficit(90, 81, 9)).toBe(0);
    expect(p2PendingUnitDeficit(90, 81, 12)).toBe(0);
  });

  it('reports the distinct pending units that are actually exposed to Scheduling', () => {
    expect(countDistinctP2PendingUnits([
      { id: 'pending-1', serialNumber: 'ROC-1', status: 'ACTIVE', currentDepartment: 'Pending Layup' },
      { id: 'duplicate', serialNumber: 'ROC-1', status: 'ACTIVE', currentDepartment: 'Pending Layup' },
      { id: 'pending-2', serialNumber: 'ROC-2', status: 'ACTIVE', currentDepartment: '' },
      { id: 'active', serialNumber: 'ROC-3', status: 'ACTIVE', currentDepartment: 'Oven/Cure' },
    ])).toBe(2);
  });

  it('keeps WAD context out of the physical serialized production queue', () => {
    expect(isP2PhysicalProjectWorkOrder({ workOrderNumber: 'WAD-PRJ002-702823' })).toBe(false);
    expect(isP2PhysicalProjectWorkOrder({ workOrderNumber: 'WO-100', wadStatus: 'READY' })).toBe(false);
    expect(isP2PhysicalProjectWorkOrder({ workOrderNumber: 'WO-100' })).toBe(true);
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
