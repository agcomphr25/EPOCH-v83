/**
 * Unit tests for laborAllocationService delegation to laborAllocationDualWrite.
 *
 * Verifies that each service function is a thin pass-through to the underlying
 * dual-write helper, so the service → helper chain cannot silently decouple.
 *
 * Covered:
 *   - openAllocation delegates to dualWriteOpenAllocation
 *   - closeAllocation delegates to dualWriteCloseAllocation
 *   - switchAllocation delegates to dualWriteSwitchAllocation (end-to-end, not
 *     a no-op stub) — this is the critical regression guard for the switch path
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
}));

vi.mock('../schema', () => ({
  laborAllocations: {},
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
  },
  pool: {},
}));

vi.mock('../src/lib/laborAllocationDualWrite', () => ({
  dualWriteOpenAllocation: vi.fn().mockResolvedValue(undefined),
  dualWriteCloseAllocation: vi.fn().mockResolvedValue(undefined),
  dualWriteSwitchAllocation: vi.fn().mockResolvedValue(undefined),
}));

import * as dualWrite from '../src/lib/laborAllocationDualWrite';
import {
  openAllocation,
  closeAllocation,
  switchAllocation,
} from '../src/services/laborAllocationService';

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

const CLOSED_ENTRY = { ...OPEN_ENTRY, clockOut: CLOCK_OUT };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dualWrite.dualWriteOpenAllocation).mockResolvedValue(undefined);
  vi.mocked(dualWrite.dualWriteCloseAllocation).mockResolvedValue(undefined);
  vi.mocked(dualWrite.dualWriteSwitchAllocation).mockResolvedValue(undefined);
});

describe('openAllocation delegation', () => {
  it('calls dualWriteOpenAllocation with the punch_ledger entry', async () => {
    await openAllocation(OPEN_ENTRY);

    expect(vi.mocked(dualWrite.dualWriteOpenAllocation)).toHaveBeenCalledOnce();
    expect(vi.mocked(dualWrite.dualWriteOpenAllocation)).toHaveBeenCalledWith(OPEN_ENTRY);
  });

  it('does NOT call dualWriteCloseAllocation or dualWriteSwitchAllocation', async () => {
    await openAllocation(OPEN_ENTRY);

    expect(vi.mocked(dualWrite.dualWriteCloseAllocation)).not.toHaveBeenCalled();
    expect(vi.mocked(dualWrite.dualWriteSwitchAllocation)).not.toHaveBeenCalled();
  });

  it('propagates errors from dualWriteOpenAllocation to the caller', async () => {
    vi.mocked(dualWrite.dualWriteOpenAllocation).mockRejectedValue(new Error('insert failed'));

    await expect(openAllocation(OPEN_ENTRY)).rejects.toThrow('insert failed');
  });
});

describe('closeAllocation delegation', () => {
  it('calls dualWriteCloseAllocation with the closed punch_ledger entry', async () => {
    await closeAllocation(CLOSED_ENTRY);

    expect(vi.mocked(dualWrite.dualWriteCloseAllocation)).toHaveBeenCalledOnce();
    expect(vi.mocked(dualWrite.dualWriteCloseAllocation)).toHaveBeenCalledWith(CLOSED_ENTRY);
  });

  it('does NOT call dualWriteOpenAllocation or dualWriteSwitchAllocation', async () => {
    await closeAllocation(CLOSED_ENTRY);

    expect(vi.mocked(dualWrite.dualWriteOpenAllocation)).not.toHaveBeenCalled();
    expect(vi.mocked(dualWrite.dualWriteSwitchAllocation)).not.toHaveBeenCalled();
  });

  it('propagates errors from dualWriteCloseAllocation to the caller', async () => {
    vi.mocked(dualWrite.dualWriteCloseAllocation).mockRejectedValue(new Error('update failed'));

    await expect(closeAllocation(CLOSED_ENTRY)).rejects.toThrow('update failed');
  });
});

describe('switchAllocation delegation', () => {
  it('calls dualWriteSwitchAllocation with the punch_ledger entry', async () => {
    await switchAllocation(OPEN_ENTRY);

    expect(vi.mocked(dualWrite.dualWriteSwitchAllocation)).toHaveBeenCalledOnce();
    expect(vi.mocked(dualWrite.dualWriteSwitchAllocation)).toHaveBeenCalledWith(OPEN_ENTRY);
  });

  it('does NOT call dualWriteOpenAllocation or dualWriteCloseAllocation', async () => {
    await switchAllocation(OPEN_ENTRY);

    expect(vi.mocked(dualWrite.dualWriteOpenAllocation)).not.toHaveBeenCalled();
    expect(vi.mocked(dualWrite.dualWriteCloseAllocation)).not.toHaveBeenCalled();
  });

  it('propagates errors from dualWriteSwitchAllocation to the caller', async () => {
    vi.mocked(dualWrite.dualWriteSwitchAllocation).mockRejectedValue(new Error('switch update failed'));

    await expect(switchAllocation(OPEN_ENTRY)).rejects.toThrow('switch update failed');
  });

  it('passes through attribution changes on the entry to dualWriteSwitchAllocation', async () => {
    const entryWithNewAttribution = {
      ...OPEN_ENTRY,
      travelerId: 'TRAV-NEW',
      chargeCodeId: 99,
      department: 'PAINT',
      operation: 'Paint',
    };

    await switchAllocation(entryWithNewAttribution);

    expect(vi.mocked(dualWrite.dualWriteSwitchAllocation)).toHaveBeenCalledWith(
      expect.objectContaining({
        travelerId: 'TRAV-NEW',
        chargeCodeId: 99,
        department: 'PAINT',
        operation: 'Paint',
      }),
    );
  });
});
