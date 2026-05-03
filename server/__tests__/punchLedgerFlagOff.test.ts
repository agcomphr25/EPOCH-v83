/**
 * Tests verifying that dual-write allocation calls are skipped when
 * the LABOR_ALLOCATIONS_ENABLED feature flag is false (the default).
 *
 * Uses a separate file so vi.mock can return laborAllocationsEnabled = false
 * at module-load time without interfering with punchLedgerDualWrite.test.ts
 * (which sets the flag to true).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock('../schema', () => ({
  punchLedger: {},
  employees: {},
  chargeCodes: {},
  laborAllocations: {},
}));

vi.mock('../db', () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
  pool: {},
}));

vi.mock('../src/services/laborAllocationService', () => ({
  openAllocation: vi.fn().mockResolvedValue(undefined),
  closeAllocation: vi.fn().mockResolvedValue(undefined),
  switchAllocation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/featureFlags', () => ({
  laborAllocationsEnabled: false,
}));

import { db } from '../db';
import * as allocationService from '../src/services/laborAllocationService';
import {
  openSession,
  closeSession,
  closeSessionById,
  switchAssignment,
} from '../src/lib/punchLedger';

function makeInsertChain(returning: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returning),
    }),
  };
}

function makeUpdateChain(returning: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(returning),
      }),
    }),
  };
}

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'orderBy']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain['limit'] = vi.fn().mockResolvedValue(result);
  return chain;
}

const FAKE_OPEN_ENTRY = {
  id: 1,
  employeeId: 42,
  clockIn: new Date('2026-04-24T08:00:00Z'),
  clockOut: null,
  source: 'KIOSK',
  laborClass: 'REGULAR',
  travelerId: null,
  productionWorkOrderId: null,
  chargeCodeId: null,
  chargeCode: null,
  department: null,
  operation: null,
  projectId: null,
  travelerStepId: null,
  certificationStatus: null,
  isOverrun: false,
  overrunReason: null,
  overrideReason: null,
  approvalStatus: 'AUTO',
  laborApprovalId: null,
  laborBudgetOverrideId: null,
  createdBy: null,
  createdByDisplayName: null,
  isEdited: false,
  updatedAt: new Date('2026-04-24T08:00:00Z'),
  createdAt: new Date('2026-04-24T08:00:00Z'),
  updatedBy: null,
  updatedByDisplayName: null,
};

const FAKE_CLOSED_ENTRY = {
  ...FAKE_OPEN_ENTRY,
  clockOut: new Date('2026-04-24T17:00:00Z'),
};

const FAKE_SWITCHED_ENTRY = {
  ...FAKE_OPEN_ENTRY,
  travelerId: 'TRAV-001',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as ReturnType<typeof db.select>);
  vi.mocked(db.insert).mockReturnValue(makeInsertChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.insert>);
  vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.update>);
});

describe('feature flag OFF — openSession does not call openAllocation', () => {
  it('openSession returns the created entry without calling openAllocation', async () => {
    vi.mocked(db.insert).mockReturnValue(makeInsertChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.insert>);

    const result = await openSession({ employeeId: 42, source: 'KIOSK' });

    expect(result.id).toBe(FAKE_OPEN_ENTRY.id);
    expect(vi.mocked(allocationService.openAllocation)).not.toHaveBeenCalled();
  });

  it('openSession does not call closeAllocation or switchAllocation either', async () => {
    vi.mocked(db.insert).mockReturnValue(makeInsertChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.insert>);

    await openSession({ employeeId: 42, source: 'KIOSK' });

    expect(vi.mocked(allocationService.closeAllocation)).not.toHaveBeenCalled();
    expect(vi.mocked(allocationService.switchAllocation)).not.toHaveBeenCalled();
  });
});

describe('feature flag OFF — closeSession does not call closeAllocation', () => {
  it('closeSession returns the closed entry without calling closeAllocation', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.select>);
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);

    const result = await closeSession(42);

    expect(result).not.toBeNull();
    expect(vi.mocked(allocationService.closeAllocation)).not.toHaveBeenCalled();
  });
});

describe('feature flag OFF — closeSessionById does not call closeAllocation', () => {
  it('closeSessionById returns the closed entry without calling closeAllocation', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);

    const result = await closeSessionById(1);

    expect(result).not.toBeNull();
    expect(vi.mocked(allocationService.closeAllocation)).not.toHaveBeenCalled();
  });
});

describe('feature flag OFF — switchAssignment does not call switchAllocation', () => {
  it('switchAssignment returns the updated entry without calling switchAllocation', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_SWITCHED_ENTRY]) as ReturnType<typeof db.update>);

    const result = await switchAssignment({ entryId: 1, travelerId: 'TRAV-001' });

    expect(result).not.toBeNull();
    expect(vi.mocked(allocationService.switchAllocation)).not.toHaveBeenCalled();
  });
});
