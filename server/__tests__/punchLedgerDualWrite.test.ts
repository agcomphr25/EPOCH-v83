/**
 * Unit tests for the punch_ledger → labor_allocations dual-write (Phase C).
 *
 * Architecture under test:
 *   punchLedger.ts  →  laborAllocationService.ts  →  laborAllocationDualWrite.ts
 *
 * These tests target the punchLedger layer, mocking laborAllocationService at
 * the boundary it actually uses. The feature flag (laborAllocationsEnabled) is
 * set to TRUE for all tests in this file so the dual-write paths execute
 * deterministically.
 *
 * Feature flag OFF tests live in punchLedgerFlagOff.test.ts.
 * SQL payload / DB write behavior tests live in laborAllocationDualWrite.test.ts.
 *
 * Verifies that:
 *   - openSession calls openAllocation with the created entry
 *   - closeSession calls closeAllocation with the closed entry
 *   - closeSessionById calls closeAllocation with the closed entry
 *   - switchAssignment calls switchAllocation with the updated entry
 *   - Dual-write failures are swallowed (warn-only) and never throw
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

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
  laborAllocationsEnabled: true,
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
  chargeCodeId: 5,
  chargeCode: 'WO-SWITCHED',
  department: 'WELD',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(allocationService.openAllocation).mockResolvedValue(undefined);
  vi.mocked(allocationService.closeAllocation).mockResolvedValue(undefined);
  vi.mocked(allocationService.switchAllocation).mockResolvedValue(undefined);

  vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as ReturnType<typeof db.select>);
  vi.mocked(db.insert).mockReturnValue(makeInsertChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.insert>);
  vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.update>);
});

describe('openSession dual-write', () => {
  it('calls openAllocation with the created punch_ledger entry when the flag is on', async () => {
    vi.mocked(db.insert).mockReturnValue(makeInsertChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.insert>);

    const result = await openSession({ employeeId: 42, source: 'KIOSK' });

    expect(vi.mocked(allocationService.openAllocation)).toHaveBeenCalledOnce();
    expect(vi.mocked(allocationService.openAllocation)).toHaveBeenCalledWith(result);
  });

  it('returns the created entry even after openAllocation runs', async () => {
    vi.mocked(db.insert).mockReturnValue(makeInsertChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.insert>);

    const result = await openSession({ employeeId: 42, source: 'KIOSK' });

    expect(result.id).toBe(FAKE_OPEN_ENTRY.id);
    expect(result.employeeId).toBe(FAKE_OPEN_ENTRY.employeeId);
  });

  it('does NOT throw when openAllocation rejects', async () => {
    vi.mocked(db.insert).mockReturnValue(makeInsertChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.insert>);
    vi.mocked(allocationService.openAllocation).mockRejectedValue(new Error('DB connection lost'));

    await expect(openSession({ employeeId: 42, source: 'KIOSK' })).resolves.toBeDefined();
  });

  it('still returns the entry when openAllocation fails', async () => {
    vi.mocked(db.insert).mockReturnValue(makeInsertChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.insert>);
    vi.mocked(allocationService.openAllocation).mockRejectedValue(new Error('timeout'));

    const result = await openSession({ employeeId: 42, source: 'KIOSK' });

    expect(result.id).toBe(FAKE_OPEN_ENTRY.id);
  });

  it('does NOT call closeAllocation or switchAllocation during openSession', async () => {
    vi.mocked(db.insert).mockReturnValue(makeInsertChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.insert>);

    await openSession({ employeeId: 42, source: 'KIOSK' });

    expect(vi.mocked(allocationService.closeAllocation)).not.toHaveBeenCalled();
    expect(vi.mocked(allocationService.switchAllocation)).not.toHaveBeenCalled();
  });
});

describe('closeSession dual-write', () => {
  it('calls closeAllocation with the closed punch_ledger entry when the flag is on', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.select>);
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);

    const result = await closeSession(42);

    expect(vi.mocked(allocationService.closeAllocation)).toHaveBeenCalledOnce();
    expect(vi.mocked(allocationService.closeAllocation)).toHaveBeenCalledWith(result);
  });

  it('returns the closed entry with a clockOut timestamp', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.select>);
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);

    const result = await closeSession(42);

    expect(result).not.toBeNull();
    expect(result!.clockOut).toBeDefined();
  });

  it('does NOT call closeAllocation when no open session exists', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as ReturnType<typeof db.select>);

    const result = await closeSession(42);

    expect(result).toBeNull();
    expect(vi.mocked(allocationService.closeAllocation)).not.toHaveBeenCalled();
  });

  it('does NOT throw when closeAllocation rejects', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.select>);
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);
    vi.mocked(allocationService.closeAllocation).mockRejectedValue(new Error('mirror table unavailable'));

    await expect(closeSession(42)).resolves.toBeDefined();
  });

  it('still returns the closed entry when closeAllocation fails', async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([FAKE_OPEN_ENTRY]) as ReturnType<typeof db.select>);
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);
    vi.mocked(allocationService.closeAllocation).mockRejectedValue(new Error('mirror table unavailable'));

    const result = await closeSession(42);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(FAKE_CLOSED_ENTRY.id);
  });
});

describe('closeSessionById dual-write', () => {
  it('calls closeAllocation with the closed entry when the flag is on', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);

    const result = await closeSessionById(1);

    expect(vi.mocked(allocationService.closeAllocation)).toHaveBeenCalledOnce();
    expect(vi.mocked(allocationService.closeAllocation)).toHaveBeenCalledWith(result);
  });

  it('returns the closed entry', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);

    const result = await closeSessionById(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(FAKE_CLOSED_ENTRY.id);
  });

  it('does NOT call closeAllocation when the update returns no rows', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as ReturnType<typeof db.update>);

    const result = await closeSessionById(999);

    expect(result).toBeNull();
    expect(vi.mocked(allocationService.closeAllocation)).not.toHaveBeenCalled();
  });

  it('does NOT throw when closeAllocation rejects (closeById path)', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);
    vi.mocked(allocationService.closeAllocation).mockRejectedValue(new Error('network timeout'));

    await expect(closeSessionById(1)).resolves.toBeDefined();
  });

  it('still returns the closed entry when the closeById dual-write fails', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_CLOSED_ENTRY]) as ReturnType<typeof db.update>);
    vi.mocked(allocationService.closeAllocation).mockRejectedValue(new Error('timeout'));

    const result = await closeSessionById(1);

    expect(result!.id).toBe(FAKE_CLOSED_ENTRY.id);
  });
});

describe('switchAssignment dual-write', () => {
  it('calls switchAllocation with the updated punch_ledger entry when the flag is on', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_SWITCHED_ENTRY]) as ReturnType<typeof db.update>);

    const result = await switchAssignment({ entryId: 1, travelerId: 'TRAV-001' });

    expect(vi.mocked(allocationService.switchAllocation)).toHaveBeenCalledOnce();
    expect(vi.mocked(allocationService.switchAllocation)).toHaveBeenCalledWith(result);
  });

  it('returns the updated entry with new attribution fields', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_SWITCHED_ENTRY]) as ReturnType<typeof db.update>);

    const result = await switchAssignment({ entryId: 1, travelerId: 'TRAV-001' });

    expect(result).not.toBeNull();
    expect(result!.travelerId).toBe('TRAV-001');
  });

  it('does NOT call switchAllocation when the update returns no rows', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([]) as ReturnType<typeof db.update>);

    const result = await switchAssignment({ entryId: 999 });

    expect(result).toBeNull();
    expect(vi.mocked(allocationService.switchAllocation)).not.toHaveBeenCalled();
  });

  it('does NOT throw when switchAllocation rejects', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_SWITCHED_ENTRY]) as ReturnType<typeof db.update>);
    vi.mocked(allocationService.switchAllocation).mockRejectedValue(new Error('allocation table locked'));

    await expect(
      switchAssignment({ entryId: 1, travelerId: 'TRAV-001' }),
    ).resolves.toBeDefined();
  });

  it('still returns the updated entry when the switch dual-write fails', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_SWITCHED_ENTRY]) as ReturnType<typeof db.update>);
    vi.mocked(allocationService.switchAllocation).mockRejectedValue(new Error('timeout'));

    const result = await switchAssignment({ entryId: 1, travelerId: 'TRAV-001' });

    expect(result!.id).toBe(FAKE_SWITCHED_ENTRY.id);
  });

  it('does NOT call openAllocation or closeAllocation during switchAssignment', async () => {
    vi.mocked(db.update).mockReturnValue(makeUpdateChain([FAKE_SWITCHED_ENTRY]) as ReturnType<typeof db.update>);

    await switchAssignment({ entryId: 1 });

    expect(vi.mocked(allocationService.openAllocation)).not.toHaveBeenCalled();
    expect(vi.mocked(allocationService.closeAllocation)).not.toHaveBeenCalled();
  });
});

describe('@dual-write-sync coupling guard', () => {
  const ROOT = path.resolve(process.cwd());

  it('punchLedger.ts imports openAllocation from laborAllocationService', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/lib/punchLedger.ts'),
      'utf8',
    );
    expect(src).toMatch(/import[^;]+openAllocation[^;]+laborAllocationService/);
  });

  it('punchLedger.ts imports closeAllocation from laborAllocationService', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/lib/punchLedger.ts'),
      'utf8',
    );
    expect(src).toMatch(/import[^;]+closeAllocation[^;]+laborAllocationService/);
  });

  it('punchLedger.ts imports switchAllocation from laborAllocationService', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/lib/punchLedger.ts'),
      'utf8',
    );
    expect(src).toMatch(/import[^;]+switchAllocation[^;]+laborAllocationService/);
  });

  it('punchLedger.ts gates each dual-write call on laborAllocationsEnabled', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/lib/punchLedger.ts'),
      'utf8',
    );
    expect(src).toContain('laborAllocationsEnabled');
    const occurrences = (src.match(/laborAllocationsEnabled/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it('laborAllocationService.ts delegates openAllocation to dualWriteOpenAllocation', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/services/laborAllocationService.ts'),
      'utf8',
    );
    expect(src).toContain('dualWriteOpenAllocation');
    expect(src).toContain('export async function openAllocation');
  });

  it('laborAllocationService.ts delegates closeAllocation to dualWriteCloseAllocation', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/services/laborAllocationService.ts'),
      'utf8',
    );
    expect(src).toContain('dualWriteCloseAllocation');
    expect(src).toContain('export async function closeAllocation');
  });

  it('laborAllocationService.ts switchAllocation delegates to dualWriteSwitchAllocation (not a stub)', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/services/laborAllocationService.ts'),
      'utf8',
    );
    expect(src).toContain('export async function switchAllocation');
    expect(src).toContain('dualWriteSwitchAllocation');
  });

  it('laborAllocationDualWrite.ts exports all three core dual-write functions', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'server/src/lib/laborAllocationDualWrite.ts'),
      'utf8',
    );
    expect(src).toContain('export async function dualWriteOpenAllocation');
    expect(src).toContain('export async function dualWriteCloseAllocation');
    expect(src).toContain('export async function dualWriteSwitchAllocation');
  });
});
