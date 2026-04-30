/**
 * Unit tests for laborAllocationDualWrite — the SQL layer of Phase C.
 *
 * These tests mock the DB at the query layer and assert the exact INSERT/UPDATE
 * payload shapes so regressions in field mapping are caught immediately.
 *
 * Verifies:
 *   - dualWriteOpenAllocation inserts with status='OPEN', source='LIVE',
 *     sequenceOrder=1, and correct field mapping from PunchLedgerEntry
 *   - dualWriteCloseAllocation updates to status='CLOSED' with allocationEnd
 *     matching the entry's clockOut value
 *   - dualWriteCloseAllocation is a no-op when clockOut is null (guard check)
 *   - dualWriteSwitchAllocation updates attribution fields (chargeCodeId,
 *     travelerId, department, operation, etc.) without touching status/allocationEnd
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val, op: 'eq' })),
  and: vi.fn((...args: unknown[]) => ({ args, op: 'and' })),
  isNull: vi.fn((col: unknown) => ({ col, op: 'isNull' })),
}));

vi.mock('../schema', () => ({
  laborAllocations: { punchLedgerId: 'punchLedgerId', allocationEnd: 'allocationEnd', status: 'status' },
}));

const mockInsertValues = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock('../db', () => ({
  db: {
    insert: vi.fn(() => ({ values: mockInsertValues })),
    update: vi.fn(() => ({ set: mockUpdateSet })),
  },
  pool: {},
}));

import { db } from '../db';
import {
  dualWriteOpenAllocation,
  dualWriteCloseAllocation,
  dualWriteSwitchAllocation,
} from '../src/lib/laborAllocationDualWrite';

const CLOCK_IN = new Date('2026-04-24T08:00:00Z');
const CLOCK_OUT = new Date('2026-04-24T17:00:00Z');

const OPEN_ENTRY = {
  id: 1,
  employeeId: 42,
  clockIn: CLOCK_IN,
  clockOut: null as Date | null,
  source: 'KIOSK' as const,
  laborClass: 'REGULAR' as const,
  travelerId: 'TRAV-001',
  productionWorkOrderId: 'WO-42',
  chargeCodeId: 7,
  chargeCode: 'WO-007',
  department: 'WELD',
  operation: 'Weld',
  projectId: 'PROJ-1',
  travelerStepId: 'STEP-A',
  certificationStatus: 'VALID',
  isOverrun: false,
  overrunReason: null as string | null,
  overrideReason: null as string | null,
  approvalStatus: 'AUTO',
  laborApprovalId: null as number | null,
  laborBudgetOverrideId: null as number | null,
  createdBy: 5,
  createdByDisplayName: 'Alice Smith',
  isEdited: false,
  updatedAt: CLOCK_IN,
  createdAt: CLOCK_IN,
  updatedBy: null as number | null,
  updatedByDisplayName: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
});

describe('dualWriteOpenAllocation', () => {
  it('inserts a row with status OPEN', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    expect(mockInsertValues).toHaveBeenCalledOnce();
    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({ status: 'OPEN' });
  });

  it('inserts with source LIVE', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({ source: 'LIVE' });
  });

  it('inserts with sequenceOrder 1', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({ sequenceOrder: 1 });
  });

  it('maps punchLedgerId from entry.id', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({ punchLedgerId: OPEN_ENTRY.id });
  });

  it('maps employeeId correctly', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({ employeeId: OPEN_ENTRY.employeeId });
  });

  it('maps allocationStart from clockIn', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({ allocationStart: CLOCK_IN });
  });

  it('maps chargeCodeId, travelerId, department, operation from entry', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({
      chargeCodeId: OPEN_ENTRY.chargeCodeId,
      travelerId: OPEN_ENTRY.travelerId,
      department: OPEN_ENTRY.department,
      operation: OPEN_ENTRY.operation,
    });
  });

  it('maps createdBy and createdByDisplayName from entry', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({
      createdBy: OPEN_ENTRY.createdBy,
      createdByDisplayName: OPEN_ENTRY.createdByDisplayName,
    });
  });

  it('maps isOverrun and certificationStatus from entry', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    const inserted = mockInsertValues.mock.calls[0][0];
    expect(inserted).toMatchObject({
      isOverrun: OPEN_ENTRY.isOverrun,
      certificationStatus: OPEN_ENTRY.certificationStatus,
    });
  });

  it('targets the laborAllocations table', async () => {
    await dualWriteOpenAllocation(OPEN_ENTRY);

    expect(vi.mocked(db.insert)).toHaveBeenCalledOnce();
  });
});

describe('dualWriteCloseAllocation', () => {
  it('updates to status CLOSED', async () => {
    const closed = { ...OPEN_ENTRY, clockOut: CLOCK_OUT };
    await dualWriteCloseAllocation(closed);

    expect(mockUpdateSet).toHaveBeenCalledOnce();
    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).toMatchObject({ status: 'CLOSED' });
  });

  it('sets allocationEnd to the entry\'s clockOut value', async () => {
    const closed = { ...OPEN_ENTRY, clockOut: CLOCK_OUT };
    await dualWriteCloseAllocation(closed);

    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).toMatchObject({ allocationEnd: CLOCK_OUT });
  });

  it('sets updatedAt to the entry\'s clockOut value', async () => {
    const closed = { ...OPEN_ENTRY, clockOut: CLOCK_OUT };
    await dualWriteCloseAllocation(closed);

    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).toMatchObject({ updatedAt: CLOCK_OUT });
  });

  it('is a no-op when clockOut is null (guard prevents any DB write)', async () => {
    const stillOpen = { ...OPEN_ENTRY, clockOut: null };
    await dualWriteCloseAllocation(stillOpen);

    expect(mockUpdateSet).not.toHaveBeenCalled();
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('targets the laborAllocations table', async () => {
    const closed = { ...OPEN_ENTRY, clockOut: CLOCK_OUT };
    await dualWriteCloseAllocation(closed);

    expect(vi.mocked(db.update)).toHaveBeenCalledOnce();
  });
});

describe('dualWriteSwitchAllocation', () => {
  it('updates chargeCodeId', async () => {
    const switched = { ...OPEN_ENTRY, chargeCodeId: 99 };
    await dualWriteSwitchAllocation(switched);

    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).toMatchObject({ chargeCodeId: 99 });
  });

  it('updates travelerId', async () => {
    const switched = { ...OPEN_ENTRY, travelerId: 'TRAV-NEW' };
    await dualWriteSwitchAllocation(switched);

    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).toMatchObject({ travelerId: 'TRAV-NEW' });
  });

  it('updates department and operation', async () => {
    const switched = { ...OPEN_ENTRY, department: 'PAINT', operation: 'Paint' };
    await dualWriteSwitchAllocation(switched);

    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).toMatchObject({ department: 'PAINT', operation: 'Paint' });
  });

  it('updates productionWorkOrderId and travelerStepId', async () => {
    const switched = { ...OPEN_ENTRY, productionWorkOrderId: 'WO-99', travelerStepId: 'STEP-Z' };
    await dualWriteSwitchAllocation(switched);

    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).toMatchObject({ productionWorkOrderId: 'WO-99', travelerStepId: 'STEP-Z' });
  });

  it('does NOT include status in the update payload (status must not change)', async () => {
    await dualWriteSwitchAllocation(OPEN_ENTRY);

    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).not.toHaveProperty('status');
  });

  it('does NOT include allocationEnd in the update payload', async () => {
    await dualWriteSwitchAllocation(OPEN_ENTRY);

    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).not.toHaveProperty('allocationEnd');
  });

  it('sets an updatedAt timestamp', async () => {
    await dualWriteSwitchAllocation(OPEN_ENTRY);

    const setPayload = mockUpdateSet.mock.calls[0][0];
    expect(setPayload).toHaveProperty('updatedAt');
    expect(setPayload.updatedAt).toBeInstanceOf(Date);
  });

  it('targets the laborAllocations table', async () => {
    await dualWriteSwitchAllocation(OPEN_ENTRY);

    expect(vi.mocked(db.update)).toHaveBeenCalledOnce();
  });
});
