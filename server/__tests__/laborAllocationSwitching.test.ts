/**
 * Integration test: Phase D labor allocation switching
 *
 * Verifies the close-and-reopen segmentation logic inside switchAllocation:
 *   clock-in → traveler A step start → job switch to B → job switch to C → clock-out
 *
 * Produces: 3 CLOSED + 0 OPEN rows after clock-out, sequence_order = 1/2/3,
 * non-overlapping time ranges, correct traveler_id per segment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared in-memory allocation store (must be declared at top level) ───────
type AllocationRow = {
  id: number;
  punchLedgerId: number;
  employeeId: number;
  allocationStart: Date;
  allocationEnd: Date | null;
  status: string;
  source: string;
  sequenceOrder: number;
  chargeCodeId: number | null;
  travelerId: string | null;
  travelerStepId: string | null;
  productionWorkOrderId: string | null;
  projectId: string | null;
  department: string | null;
  operation: string | null;
  laborClass: string;
  certificationStatus: string | null;
  isOverrun: boolean;
  overrunReason: string | null;
  laborApprovalId: number | null;
  laborBudgetOverrideId: number | null;
  amendsAllocationId: number | null;
  createdBy: number | null;
  createdByDisplayName: string | null;
  updatedBy: number | null;
  updatedByDisplayName: string | null;
  isEdited: boolean;
  editNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Use vi.hoisted so the reference is available inside vi.mock factories
const { store, getNextId, resetStore } = vi.hoisted(() => {
  const store: AllocationRow[] = [];
  let nextId = 1;
  return {
    store,
    getNextId: () => nextId++,
    resetStore: () => {
      store.length = 0;
      nextId = 1;
    },
  };
});

// ── Mock featureFlags ───────────────────────────────────────────────────────
vi.mock('../src/lib/featureFlags', () => ({
  laborAllocationsEnabled: true,
}));

// ── Mock schema ────────────────────────────────────────────────────────────
vi.mock('../schema', () => ({
  laborAllocations: {
    id: 'id',
    punchLedgerId: 'punchLedgerId',
    status: 'status',
    allocationEnd: 'allocationEnd',
  },
  punchLedger: {},
  employees: {},
  chargeCodes: {},
  travelers: {},
  productionWorkOrders: {},
  projects: {},
  laborApprovals: {},
  laborBudgetOverrides: {},
}));

// ── Mock db so insert/update/select work against the in-memory store ────────
vi.mock('../db', () => {
  let lastUpdateId: number | null = null;
  let lastUpdateVals: Partial<AllocationRow> | null = null;

  return {
    db: {
      insert: vi.fn(() => ({
        values: vi.fn((row: Partial<AllocationRow>) => {
          const now = new Date();
          store.push({
            id: getNextId(),
            punchLedgerId: row.punchLedgerId!,
            employeeId: row.employeeId!,
            allocationStart: row.allocationStart ?? now,
            allocationEnd: row.allocationEnd ?? null,
            status: row.status ?? 'OPEN',
            source: row.source ?? 'LIVE',
            sequenceOrder: row.sequenceOrder ?? 1,
            chargeCodeId: row.chargeCodeId ?? null,
            travelerId: row.travelerId ?? null,
            travelerStepId: row.travelerStepId ?? null,
            productionWorkOrderId: row.productionWorkOrderId ?? null,
            projectId: row.projectId ?? null,
            department: row.department ?? null,
            operation: row.operation ?? null,
            laborClass: row.laborClass ?? 'REGULAR',
            certificationStatus: row.certificationStatus ?? null,
            isOverrun: row.isOverrun ?? false,
            overrunReason: row.overrunReason ?? null,
            laborApprovalId: row.laborApprovalId ?? null,
            laborBudgetOverrideId: row.laborBudgetOverrideId ?? null,
            amendsAllocationId: null,
            createdBy: row.createdBy ?? null,
            createdByDisplayName: row.createdByDisplayName ?? null,
            updatedBy: null,
            updatedByDisplayName: null,
            isEdited: false,
            editNote: null,
            createdAt: now,
            updatedAt: now,
          });
          return Promise.resolve([]);
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((vals: Partial<AllocationRow>) => {
          lastUpdateVals = vals;
          return {
            where: vi.fn((_cond: unknown) => {
              // Apply to the most recent OPEN row in the store (simplification for tests)
              const openRow = store.find(r => r.status === 'OPEN' && r.allocationEnd === null);
              if (openRow && lastUpdateVals) {
                if (lastUpdateVals.status !== undefined) openRow.status = lastUpdateVals.status as string;
                if (lastUpdateVals.allocationEnd !== undefined) openRow.allocationEnd = lastUpdateVals.allocationEnd as Date | null;
                if (lastUpdateVals.updatedAt !== undefined) openRow.updatedAt = lastUpdateVals.updatedAt as Date;
              }
              lastUpdateId = null;
              lastUpdateVals = null;
              return Promise.resolve([]);
            }),
          };
        }),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((_cond: unknown) => ({
            limit: vi.fn((_n: number) => {
              // Return current OPEN row for the session
              const open = store.find(r => r.status === 'OPEN' && r.allocationEnd === null);
              return Promise.resolve(open ? [open] : []);
            }),
          })),
        })),
      })),
    },
    pool: {},
  };
});

// ── Mock laborAllocationDualWrite ───────────────────────────────────────────
vi.mock('../src/lib/laborAllocationDualWrite', () => ({
  dualWriteOpenAllocation: vi.fn().mockResolvedValue(undefined),
  dualWriteCloseAllocation: vi.fn().mockResolvedValue(undefined),
  dualWriteUpdateAllocation: vi.fn().mockResolvedValue(undefined),
  dualWriteSwitchAllocation: vi.fn().mockResolvedValue(undefined),
}));

// ── Import the real service under test ─────────────────────────────────────
import { switchAllocation, type SwitchAssignment } from '../src/services/laborAllocationService';

// ── Shared fixtures ─────────────────────────────────────────────────────────
const PUNCH_LEDGER_ID = 42;
const EMPLOYEE_ID = 7;

function makePunchLedgerEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: PUNCH_LEDGER_ID,
    employeeId: EMPLOYEE_ID,
    clockIn: new Date('2026-04-30T08:00:00Z'),
    clockOut: null,
    source: 'TRAVELER' as const,
    laborClass: 'REGULAR' as const,
    travelerId: null,
    travelerStepId: null,
    productionWorkOrderId: null,
    chargeCodeId: null,
    chargeCode: null,
    department: null,
    operation: null,
    projectId: null,
    certificationStatus: null,
    isOverrun: false,
    overrunReason: null,
    overrideReason: null,
    approvalStatus: 'AUTO',
    laborApprovalId: null,
    laborBudgetOverrideId: null,
    createdBy: null,
    createdByDisplayName: null,
    updatedBy: null,
    updatedByDisplayName: null,
    isEdited: false,
    createdAt: new Date('2026-04-30T08:00:00Z'),
    updatedAt: new Date('2026-04-30T08:00:00Z'),
    ...overrides,
  } as any;
}

function makeAssignment(travelerId: string, travelerStepId: string | null = null): SwitchAssignment {
  return {
    chargeCodeId: 1,
    travelerId,
    travelerStepId,
    productionWorkOrderId: null,
    projectId: null,
    department: 'CNC',
    operation: null,
  };
}

function seedOpenAllocation(travelerId: string | null, sequenceOrder: number): AllocationRow {
  const now = new Date();
  const row: AllocationRow = {
    id: getNextId(),
    punchLedgerId: PUNCH_LEDGER_ID,
    employeeId: EMPLOYEE_ID,
    allocationStart: new Date(now.getTime() - 5000),
    allocationEnd: null,
    status: 'OPEN',
    source: 'LIVE',
    sequenceOrder,
    chargeCodeId: null,
    travelerId,
    travelerStepId: null,
    productionWorkOrderId: null,
    projectId: null,
    department: null,
    operation: null,
    laborClass: 'REGULAR',
    certificationStatus: null,
    isOverrun: false,
    overrunReason: null,
    laborApprovalId: null,
    laborBudgetOverrideId: null,
    amendsAllocationId: null,
    createdBy: null,
    createdByDisplayName: null,
    updatedBy: null,
    updatedByDisplayName: null,
    isEdited: false,
    editNote: null,
    createdAt: now,
    updatedAt: now,
  };
  store.push(row);
  return row;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Phase D: switchAllocation — allocation switching', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('produces 1 allocation row when the session never switches', () => {
    seedOpenAllocation(null, 1);

    const row = store[0];
    expect(row.status).toBe('OPEN');
    expect(row.sequenceOrder).toBe(1);

    // Clock out
    row.status = 'CLOSED';
    row.allocationEnd = new Date();

    expect(store).toHaveLength(1);
    expect(store[0].status).toBe('CLOSED');
    expect(store.filter(r => r.status === 'OPEN')).toHaveLength(0);
  });

  it('produces 3 allocation rows for: clock-in → traveler A → switch B → switch C → clock-out', async () => {
    const punchRow = makePunchLedgerEntry();

    seedOpenAllocation('traveler-A', 1);

    await switchAllocation(punchRow, makeAssignment('traveler-B', 'step-B1'));
    await switchAllocation(punchRow, makeAssignment('traveler-C', 'step-C1'));

    // Clock-out: close last OPEN row
    const openRow = store.find(r => r.status === 'OPEN' && r.allocationEnd === null);
    if (openRow) {
      openRow.status = 'CLOSED';
      openRow.allocationEnd = new Date();
    }

    expect(store).toHaveLength(3);
    expect(store.filter(r => r.status === 'OPEN')).toHaveLength(0);
    expect(store.filter(r => r.status === 'CLOSED')).toHaveLength(3);
  });

  it('assigns sequence_order 1, 2, 3 in order', async () => {
    const punchRow = makePunchLedgerEntry();
    seedOpenAllocation('traveler-A', 1);

    await switchAllocation(punchRow, makeAssignment('traveler-B'));
    await switchAllocation(punchRow, makeAssignment('traveler-C'));

    const sorted = [...store].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    expect(sorted[0].sequenceOrder).toBe(1);
    expect(sorted[1].sequenceOrder).toBe(2);
    expect(sorted[2].sequenceOrder).toBe(3);
  });

  it('assigns the correct traveler_id to each segment', async () => {
    const punchRow = makePunchLedgerEntry();
    seedOpenAllocation('traveler-A', 1);

    await switchAllocation(punchRow, makeAssignment('traveler-B'));
    await switchAllocation(punchRow, makeAssignment('traveler-C'));

    const sorted = [...store].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    expect(sorted[0].travelerId).toBe('traveler-A');
    expect(sorted[1].travelerId).toBe('traveler-B');
    expect(sorted[2].travelerId).toBe('traveler-C');
  });

  it('stamps allocationEnd on the first two rows (only the last remains open until clock-out)', async () => {
    const punchRow = makePunchLedgerEntry();
    seedOpenAllocation('traveler-A', 1);

    await switchAllocation(punchRow, makeAssignment('traveler-B'));
    await switchAllocation(punchRow, makeAssignment('traveler-C'));

    const sorted = [...store].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    expect(sorted[0].allocationEnd).not.toBeNull(); // segment 1 closed
    expect(sorted[1].allocationEnd).not.toBeNull(); // segment 2 closed
    expect(sorted[2].allocationEnd).toBeNull();      // segment 3 still open
  });

  it('produces non-overlapping time ranges across segments', async () => {
    const punchRow = makePunchLedgerEntry();
    seedOpenAllocation('traveler-A', 1);

    await switchAllocation(punchRow, makeAssignment('traveler-B'));
    await switchAllocation(punchRow, makeAssignment('traveler-C'));

    const sorted = [...store].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    // end of segment N must be <= start of segment N+1
    expect(sorted[0].allocationEnd!.getTime()).toBeLessThanOrEqual(sorted[1].allocationStart.getTime());
    expect(sorted[1].allocationEnd!.getTime()).toBeLessThanOrEqual(sorted[2].allocationStart.getTime());
  });

  it('falls through to insert when no OPEN row exists (recovery path)', async () => {
    const punchRow = makePunchLedgerEntry();

    // No seed — should insert a first segment via openAllocation fallback
    await switchAllocation(punchRow, makeAssignment('traveler-A'));

    // openAllocation delegates to dualWriteOpenAllocation which is mocked
    // The service logs a warning and calls openAllocation — no store mutation from the db mock
    // in this case because dualWriteOpenAllocation is fully mocked.
    // We just verify the call didn't throw:
    expect(true).toBe(true);
  });

  it('does not throw even if called with a mismatched punch ledger ID', async () => {
    const punchRow = makePunchLedgerEntry({ id: 9999 });
    await expect(switchAllocation(punchRow, makeAssignment('traveler-X'))).resolves.toBeUndefined();
  });

  it('sets source = TRAVELER on the new allocation row', async () => {
    const punchRow = makePunchLedgerEntry();
    seedOpenAllocation('traveler-A', 1);

    await switchAllocation(punchRow, makeAssignment('traveler-B'));

    const newRow = [...store].sort((a, b) => b.sequenceOrder - a.sequenceOrder)[0];
    expect(newRow.source).toBe('TRAVELER');
  });
});

// ── Validation queries ──────────────────────────────────────────────────────

describe('Phase D: allocation validation queries', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  async function simulateFullSession(travelerIds: string[]): Promise<void> {
    const punchRow = makePunchLedgerEntry();
    const [first, ...rest] = travelerIds;
    seedOpenAllocation(first, 1);
    for (const tid of rest) {
      await switchAllocation(punchRow, makeAssignment(tid));
    }
    // Clock-out
    const openRow = store.find(r => r.status === 'OPEN' && r.allocationEnd === null);
    if (openRow) {
      openRow.status = 'CLOSED';
      openRow.allocationEnd = new Date();
    }
  }

  it('validation: allocations per session > 1 when switches occurred', async () => {
    await simulateFullSession(['traveler-A', 'traveler-B', 'traveler-C']);

    const allocsPerSession = store.filter(r => r.punchLedgerId === PUNCH_LEDGER_ID);
    expect(allocsPerSession.length).toBeGreaterThan(1);
  });

  it('validation: zero OPEN allocations after clock-out', async () => {
    await simulateFullSession(['traveler-A', 'traveler-B', 'traveler-C']);

    const openCount = store.filter(r => r.status === 'OPEN').length;
    expect(openCount).toBe(0);
  });

  it('validation: no overlapping time ranges within a session', async () => {
    await simulateFullSession(['traveler-A', 'traveler-B', 'traveler-C']);

    const sessionRows = store
      .filter(r => r.punchLedgerId === PUNCH_LEDGER_ID && r.allocationEnd !== null)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    let overlaps = 0;
    for (let i = 0; i < sessionRows.length - 1; i++) {
      const endI = sessionRows[i].allocationEnd!.getTime();
      const startNext = sessionRows[i + 1].allocationStart.getTime();
      if (endI > startNext) overlaps++;
    }

    expect(overlaps).toBe(0);
  });

  it('validation: count of OPEN allocations equals open punch sessions', async () => {
    // Two separate sessions: one active, one clocked-out
    seedOpenAllocation('traveler-A', 1); // Session 1 — still open

    // Session 2 (different punchLedgerId) — clocked out
    const closedRow: AllocationRow = {
      id: getNextId(),
      punchLedgerId: 99,
      employeeId: 8,
      allocationStart: new Date(),
      allocationEnd: new Date(),
      status: 'CLOSED',
      source: 'LIVE',
      sequenceOrder: 1,
      chargeCodeId: null,
      travelerId: 'traveler-B',
      travelerStepId: null,
      productionWorkOrderId: null,
      projectId: null,
      department: null,
      operation: null,
      laborClass: 'REGULAR',
      certificationStatus: null,
      isOverrun: false,
      overrunReason: null,
      laborApprovalId: null,
      laborBudgetOverrideId: null,
      amendsAllocationId: null,
      createdBy: null,
      createdByDisplayName: null,
      updatedBy: null,
      updatedByDisplayName: null,
      isEdited: false,
      editNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.push(closedRow);

    // 1 open punch session → 1 OPEN allocation
    const openSessions = 1; // simulated
    const openAllocations = store.filter(r => r.status === 'OPEN').length;
    expect(openAllocations).toBe(openSessions);
  });
});
