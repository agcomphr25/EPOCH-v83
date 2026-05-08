/**
 * Unit tests for the inventory_transaction_ledger backfill script (Task #183).
 *
 * Exercises the pure mappers that translate historical source rows into the
 * canonical `recordInventoryLedgerEntry` payload. The DB-touching code paths
 * are integration-tested separately; this suite locks in the field mapping,
 * quantity math, idempotency keys, and traveler attribution.
 */

import { describe, expect, it } from 'vitest';
import {
  SOURCE_MODULE,
  buildConsumptionPayload,
  buildMltPayload,
  buildReservationPayload,
  mapMltToLedgerType,
} from '../scripts/backfillInventoryTransactionLedger';
import type {
  materialLotReservations,
  materialLotTransactions,
  travelerMaterialConsumption,
} from '../schema';

const lot = {
  id: 'lot-uuid-1',
  inventoryItemId: 42,
  materialPartNumber: 'AG-100',
  unitOfMeasure: 'EA',
};

describe('mapMltToLedgerType', () => {
  it.each([
    ['RECEIVE', 'RECEIVE'],
    ['MOVE', 'MOVE'],
    ['ISSUE', 'ISSUE'],
    ['SCRAP', 'SCRAP'],
    ['QUARANTINE', 'QUARANTINE'],
    ['EXPIRE', 'EXPIRE'],
    ['ACCEPT', 'STATUS_CHANGE'],
    ['REJECT', 'STATUS_CHANGE'],
    ['HOLD', 'STATUS_CHANGE'],
    ['OUT_START', 'STATUS_CHANGE'],
    ['OUT_END', 'STATUS_CHANGE'],
  ])('maps %s → %s', (input, expected) => {
    expect(mapMltToLedgerType(input)).toBe(expected);
  });

  it('falls back to STATUS_CHANGE for unknown source types', () => {
    expect(mapMltToLedgerType('SOMETHING_NEW')).toBe('STATUS_CHANGE');
  });
});

describe('buildMltPayload', () => {
  const baseRow: typeof materialLotTransactions.$inferSelect = {
    id: 'mlt-1',
    materialLotId: 'lot-uuid-1',
    internalControlNumber: 'ICN-MAT-1',
    transactionType: 'ISSUE',
    qtyBefore: '10',
    qtyChange: '-3',
    qtyAfter: '7',
    fromLocation: 'STAGE',
    toLocation: null,
    referenceType: 'TRAVELER',
    referenceId: 'trav-uuid-9',
    receiptId: null,
    performedBy: 'glennj',
    performedAt: new Date('2025-06-01T12:00:00Z'),
    reason: 'kitting',
    notes: null,
    wasOverride: false,
    overrideApprovedBy: null,
    overrideReason: null,
    createdAt: new Date('2025-06-01T12:00:00Z'),
  };

  it('preserves qty math when source qty_after matches before+delta', () => {
    const p = buildMltPayload(baseRow, lot);
    expect(p.transactionType).toBe('ISSUE');
    expect(p.quantityBefore).toBe(10);
    expect(p.quantityDelta).toBe(-3);
    expect(p.quantityAfter).toBe(7);
  });

  it('repairs qty math when source qty_after drifts (legacy data)', () => {
    const p = buildMltPayload({ ...baseRow, qtyAfter: '99' }, lot);
    // Drift detected; writer-safe value before+delta is used instead.
    expect(p.quantityAfter).toBe(7);
  });

  it('attributes to traveler when reference_type=TRAVELER', () => {
    const p = buildMltPayload(baseRow, lot);
    expect(p.travelerId).toBe('trav-uuid-9');
  });

  it('does NOT set travelerId for non-traveler references', () => {
    const p = buildMltPayload({ ...baseRow, referenceType: 'WORK_ORDER' }, lot);
    expect(p.travelerId).toBeNull();
  });

  it('uses the historical performed_at as createdAtOverride', () => {
    const p = buildMltPayload(baseRow, lot);
    expect(p.createdAtOverride?.toISOString()).toBe('2025-06-01T12:00:00.000Z');
  });

  it('keys idempotency to (backfill:material_lot_transactions, row.id)', () => {
    const p = buildMltPayload(baseRow, lot);
    expect(p.sourceModule).toBe(SOURCE_MODULE.mlt);
    expect(p.sourceRecordId).toBe('mlt-1');
  });

  it('falls back performedByDisplayName to system:backfill if missing', () => {
    const p = buildMltPayload({ ...baseRow, performedBy: '' }, lot);
    expect(p.performedByDisplayName).toBe('system:backfill');
  });
});

describe('buildConsumptionPayload', () => {
  const baseRow: typeof travelerMaterialConsumption.$inferSelect = {
    id: 'con-1',
    travelerId: 'trav-uuid-9',
    travelerStepId: 'step-uuid-2',
    travelerTaskId: null,
    materialLotId: 'lot-uuid-1',
    internalControlNumber: 'ICN-MAT-1',
    materialPartNumber: 'AG-100',
    materialName: 'Carbon Sheet',
    qtyUsed: '4',
    unitOfMeasure: 'EA',
    validationStatus: 'VALID',
    validationDetails: null,
    scannedBy: 'op-jane',
    scannedAt: new Date('2025-06-02T08:00:00Z'),
    badgeScan: null,
    wasOverride: false,
    overrideApprovedBy: null,
    overrideReason: null,
    receivedUnitId: null,
    notes: null,
    createdAt: new Date('2025-06-02T08:00:00Z'),
  };

  it('emits a CONSUME entry with negative delta and chained running balance', () => {
    const p = buildConsumptionPayload(baseRow, lot, 10);
    expect(p.transactionType).toBe('CONSUME');
    expect(p.quantityBefore).toBe(10);
    expect(p.quantityDelta).toBe(-4);
    expect(p.quantityAfter).toBe(6);
  });

  it('attributes to traveler + step + scannedBy', () => {
    const p = buildConsumptionPayload(baseRow, lot, 0);
    expect(p.travelerId).toBe('trav-uuid-9');
    expect(p.travelerStepId).toBe('step-uuid-2');
    expect(p.performedByDisplayName).toBe('op-jane');
  });

  it('keys idempotency to (backfill:traveler_material_consumption, row.id)', () => {
    const p = buildConsumptionPayload(baseRow, lot, 0);
    expect(p.sourceModule).toBe(SOURCE_MODULE.consumption);
    expect(p.sourceRecordId).toBe('con-1');
  });
});

describe('buildReservationPayload', () => {
  const baseRow: typeof materialLotReservations.$inferSelect = {
    id: 17,
    materialLotId: 'lot-uuid-1',
    receivedUnitId: null,
    travelerId: 'trav-uuid-9',
    workOrderId: null,
    quantityReserved: '5',
    unitOfMeasure: 'EA',
    status: 'active',
    intendedRoutingStepId: 'step-1',
    notes: null,
    createdBy: 'glennj',
    createdAt: new Date('2025-05-30T00:00:00Z'),
    updatedAt: new Date('2025-05-30T00:00:00Z'),
  };

  it('emits a RESERVE entry with 0/0/0 qty math (no on-hand change)', () => {
    const p = buildReservationPayload(baseRow, lot);
    expect(p.transactionType).toBe('RESERVE');
    expect(p.quantityBefore).toBe(0);
    expect(p.quantityDelta).toBe(0);
    expect(p.quantityAfter).toBe(0);
  });

  it('emits UNRESERVE for cancelled reservations', () => {
    const p = buildReservationPayload({ ...baseRow, status: 'cancelled' }, lot);
    expect(p.transactionType).toBe('UNRESERVE');
  });

  it('stashes the reserved quantity in metadata for audit', () => {
    const p = buildReservationPayload(baseRow, lot);
    expect((p.metadata as Record<string, unknown>).reservedQuantity).toBe('5');
  });

  it('keys idempotency to (backfill:material_lot_reservations, row.id-as-string)', () => {
    const p = buildReservationPayload(baseRow, lot);
    expect(p.sourceModule).toBe(SOURCE_MODULE.reservations);
    expect(p.sourceRecordId).toBe('17');
  });
});
