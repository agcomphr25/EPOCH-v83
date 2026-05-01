/**
 * Tests for laborEntryDraftPostingService — Phase 4
 *
 * Covered:
 *   1. CONFIRMED draft creates one punch_ledger row with source='SALARIED_ENTRY'
 *   2. CONFIRMED draft creates correct allocation count and durations
 *   3. Total allocation duration equals synthetic session duration
 *   4. Posting a POSTED draft returns AlreadyPostedGuard with existing punch_ledger_id
 *   5. Non-CONFIRMED draft throws with statusCode 422
 *   6. Allocations have source='SALARIED_ENTRY', status='CLOSED' (allocation costing read compatible)
 *   7. Re-validation: overlapping segments are rejected before posting
 *   8. Re-validation: total duration mismatch between segments and draft.totalHours is rejected
 *   9. Indirect code segments resolve chargeCodeId via tx.select (transaction-scoped)
 *  10. Charge code existence is verified inside the transaction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted shared mock state
// ---------------------------------------------------------------------------

const mockDbState = vi.hoisted(() => ({
  txInsertCalls: [] as { table: string; values: Record<string, unknown> }[],
  txUpdateCalls: [] as { table: string; set: Record<string, unknown> }[],
}));

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ raw: strings.join('?'), values })),
}));

vi.mock('../schema', () => ({
  punchLedger: { id: {}, _: { name: 'punch_ledger' } },
  laborAllocations: { id: {}, _: { name: 'labor_allocations' } },
  users: { _: { name: 'users' } },
  employees: {},
  chargeCodes: { id: {}, _: { name: 'charge_codes' } },
  travelers: {},
  productionWorkOrders: {},
  projects: {},
  laborApprovals: {},
  laborBudgetOverrides: {},
}));

vi.mock('../src/schema/timekeeping', () => ({
  laborEntryDraftsTable: { _: { name: 'labor_entry_drafts' } },
  employeesTable: { _: { name: 'tk_employees' } },
  indirectCodesTable: { _: { name: 'indirect_codes' } },
  salariedTimesheetAuditTable: { _: { name: 'salaried_timesheet_audit' } },
  salariedTimesheetsTable: {},
  salariedTimesheetLinesTable: {},
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  pool: {},
}));

import { db } from '../db';
import { postLaborEntryDraft } from '../src/services/timekeeping/laborEntryDraftPostingService';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

const ENTRY_DATE = '2026-04-15';

const TWO_SEGMENT_DRAFT_FULL = {
  id: 1,
  employeeId: 10,
  entryDate: ENTRY_DATE,
  status: 'CONFIRMED',
  totalHours: '8.0000',
  parsedSegmentsJson: [
    { startTime: '08:00', endTime: '12:00', chargeCodeId: 5, indirectCodeId: null },
    { startTime: '13:00', endTime: '17:00', chargeCodeId: 7, indirectCodeId: null },
  ],
  source: 'MANUAL',
  rawInputText: null,
  confidenceScore: null,
  validationErrorsJson: null,
  createdBy: 99,
  reviewedBy: null,
  reviewedAt: null,
  postedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TK_EMPLOYEE = { epochEmployeeId: 42 };
const POSTER_USER = { employeeId: 77 };

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

/**
 * Build a tx mock for the happy-path: 2 direct-charge-code segments.
 * tx.select sequence:
 *   call 1 → full draft (CONFIRMED)
 *   call 2 → tkEmployee
 *   call 3 → poster user
 *   call 4 → charge code existence for segment 1 (id=5)
 *   call 5 → charge code existence for segment 2 (id=7)
 */
function makeHappyPathTx(
  segments: { chargeCodeId?: number | null; indirectCodeId?: number | null }[],
  draft: typeof TWO_SEGMENT_DRAFT_FULL = TWO_SEGMENT_DRAFT_FULL,
): Record<string, unknown> {
  let txSelectCount = 0;
  let txInsertSeq = 0;

  // Build per-segment resolution results
  const segResults = segments.map((seg) => {
    if (seg.chargeCodeId) return [{ id: seg.chargeCodeId }];
    if (seg.indirectCodeId) return [{ chargeCodeId: 99 }]; // indirect → 99
    return [];
  });

  return {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            txSelectCount++;
            if (txSelectCount === 1) return Promise.resolve([draft]);
            if (txSelectCount === 2) return Promise.resolve([TK_EMPLOYEE]);
            if (txSelectCount === 3) return Promise.resolve([POSTER_USER]);
            // 4+ → per-segment resolution results
            const segIdx = txSelectCount - 4;
            return Promise.resolve(segResults[segIdx] ?? []);
          }),
        }),
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        txInsertSeq++;
        let tableLabel: string;
        if (txInsertSeq === 1) tableLabel = 'punch_ledger';
        else if (txInsertSeq <= 1 + segments.length) tableLabel = 'labor_allocations';
        else tableLabel = 'audit';
        mockDbState.txInsertCalls.push({ table: tableLabel, values: vals });
        const id = txInsertSeq === 1 ? 1001 : 2000 + txInsertSeq;
        return { returning: vi.fn(() => Promise.resolve([{ id }])) };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((vals: Record<string, unknown>) => {
        mockDbState.txUpdateCalls.push({ table: 'labor_entry_drafts', set: vals });
        return { where: vi.fn(() => Promise.resolve([])) };
      }),
    })),
  };
}

/**
 * Set up db.select for the CONFIRMED path: 1 preflight call.
 */
function setupPreflightConfirmed(draft: typeof TWO_SEGMENT_DRAFT_FULL = TWO_SEGMENT_DRAFT_FULL) {
  vi.mocked(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ status: draft.status }]),
      }),
    }),
  }) as any);
}

/**
 * Set up db.select for the POSTED path:
 *   call 1 → preflight (status=POSTED)
 *   call 2 → audit recovery
 */
function setupPreflightPosted(auditAfterState?: Record<string, unknown>) {
  let callCount = 0;
  vi.mocked(db.select).mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve([{ status: 'POSTED' }]);
          if (callCount === 2 && auditAfterState !== undefined) {
            return Promise.resolve([{ afterState: auditAfterState }]);
          }
          return Promise.resolve([]);
        }),
      }),
    }),
  }) as any);
}

/**
 * Full happy-path setup for a 2-segment direct-charge-code draft.
 */
function setupHappyPath(draft: typeof TWO_SEGMENT_DRAFT_FULL = TWO_SEGMENT_DRAFT_FULL) {
  setupPreflightConfirmed(draft);
  const segs = draft.parsedSegmentsJson as { chargeCodeId?: number | null; indirectCodeId?: number | null }[];
  vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb(makeHappyPathTx(segs, draft));
  });
}

// ---------------------------------------------------------------------------
// Reset before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockDbState.txInsertCalls = [];
  mockDbState.txUpdateCalls = [];
});

// ---------------------------------------------------------------------------
// Tests: Happy path
// ---------------------------------------------------------------------------

describe('postLaborEntryDraft — CONFIRMED draft happy path', () => {
  it('creates one punch_ledger row with source SALARIED_ENTRY', async () => {
    setupHappyPath();

    const result = await postLaborEntryDraft(1, 99);

    expect(result).toMatchObject({ status: 'POSTED', draftId: 1 });
    const punchInsert = mockDbState.txInsertCalls.find((c) => c.table === 'punch_ledger');
    expect(punchInsert).toBeDefined();
    expect(punchInsert!.values.source).toBe('SALARIED_ENTRY');
    expect(punchInsert!.values.laborClass).toBe('REGULAR');
  });

  it('sets clock_in to entry_date at 08:00 UTC and clock_out = clock_in + total_hours', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const punchInsert = mockDbState.txInsertCalls.find((c) => c.table === 'punch_ledger');
    const clockIn = punchInsert!.values.clockIn as Date;
    const clockOut = punchInsert!.values.clockOut as Date;

    expect(clockIn.toISOString()).toBe('2026-04-15T08:00:00.000Z');
    expect(clockOut.toISOString()).toBe('2026-04-15T16:00:00.000Z');
  });

  it('creates one labor_allocations row per segment', async () => {
    setupHappyPath();

    const result = await postLaborEntryDraft(1, 99);
    const allocIds = (result as { allocationIds: number[] }).allocationIds;
    expect(allocIds).toHaveLength(2);

    const allocInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'labor_allocations');
    expect(allocInserts).toHaveLength(2);
  });

  it('allocations have source=SALARIED_ENTRY and status=CLOSED', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const allocInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'labor_allocations');
    for (const alloc of allocInserts) {
      expect(alloc.values.source).toBe('SALARIED_ENTRY');
      expect(alloc.values.status).toBe('CLOSED');
    }
  });

  it('allocations have correct sequence_order (1-based)', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const allocInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'labor_allocations');
    expect(allocInserts[0]!.values.sequenceOrder).toBe(1);
    expect(allocInserts[1]!.values.sequenceOrder).toBe(2);
  });

  it('allocation_start and allocation_end derived from segment HH:MM on entry_date (UTC)', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const allocInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'labor_allocations');

    expect((allocInserts[0]!.values.allocationStart as Date).toISOString()).toBe('2026-04-15T08:00:00.000Z');
    expect((allocInserts[0]!.values.allocationEnd as Date).toISOString()).toBe('2026-04-15T12:00:00.000Z');

    expect((allocInserts[1]!.values.allocationStart as Date).toISOString()).toBe('2026-04-15T13:00:00.000Z');
    expect((allocInserts[1]!.values.allocationEnd as Date).toISOString()).toBe('2026-04-15T17:00:00.000Z');
  });

  it('total allocation duration equals synthetic session duration', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const allocInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'labor_allocations');
    const totalAllocHours = allocInserts.reduce((sum, a) => {
      const start = (a.values.allocationStart as Date).getTime();
      const end = (a.values.allocationEnd as Date).getTime();
      return sum + (end - start) / 3_600_000;
    }, 0);

    expect(totalAllocHours).toBeCloseTo(8, 4);

    const punchInsert = mockDbState.txInsertCalls.find((c) => c.table === 'punch_ledger');
    const sessionHours =
      ((punchInsert!.values.clockOut as Date).getTime() - (punchInsert!.values.clockIn as Date).getTime())
      / 3_600_000;
    expect(sessionHours).toBeCloseTo(8, 4);
  });

  it('draft is updated to status POSTED with postedAt set', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const updateCall = mockDbState.txUpdateCalls.find((u) => u.set.status === 'POSTED');
    expect(updateCall).toBeDefined();
    expect(updateCall!.set.postedAt).toBeInstanceOf(Date);
  });

  it('writes one audit record to salaried_timesheet_audit with correct fields', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const auditInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'audit');
    expect(auditInserts).toHaveLength(1);

    const auditVals = auditInserts[0]!.values;
    expect(auditVals.action).toBe('SYNTHETIC_SESSION_POSTED');
    expect(auditVals.timesheetId).toBe(1);
    expect((auditVals.afterState as Record<string, unknown>).source).toBe('SALARIED_ENTRY');
    expect((auditVals.afterState as Record<string, unknown>).punchLedgerId).toBe(1001);
  });

  it('uses public employee ID (epochEmployeeId) in punch_ledger and allocations', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const punchInsert = mockDbState.txInsertCalls.find((c) => c.table === 'punch_ledger');
    expect(punchInsert!.values.employeeId).toBe(42);

    const allocInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'labor_allocations');
    for (const alloc of allocInserts) {
      expect(alloc.values.employeeId).toBe(42);
    }
  });

  it('sets chargeCodeId on each allocation from the segment direct charge code', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const allocInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'labor_allocations');
    expect(allocInserts[0]!.values.chargeCodeId).toBe(5);
    expect(allocInserts[1]!.values.chargeCodeId).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Tests: Idempotency
// ---------------------------------------------------------------------------

describe('postLaborEntryDraft — idempotency', () => {
  it('returns alreadyPosted=true without entering a transaction when draft is already POSTED', async () => {
    setupPreflightPosted({ punchLedgerId: 1001, source: 'SALARIED_ENTRY' });

    const result = await postLaborEntryDraft(1, 99);

    expect(result).toMatchObject({ alreadyPosted: true, draftId: 1 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('returns the existing punch_ledger_id from the audit trail on already-posted draft', async () => {
    setupPreflightPosted({ punchLedgerId: 9999, source: 'SALARIED_ENTRY' });

    const result = await postLaborEntryDraft(1, 99);

    expect((result as { punchLedgerId: number | null }).punchLedgerId).toBe(9999);
  });

  it('returns null for punchLedgerId when audit record is missing', async () => {
    setupPreflightPosted(undefined);

    const result = await postLaborEntryDraft(1, 99);

    expect((result as { punchLedgerId: number | null }).punchLedgerId).toBeNull();
  });

  it('message includes punch_ledger_id when available', async () => {
    setupPreflightPosted({ punchLedgerId: 1001 });

    const result = await postLaborEntryDraft(1, 99);

    expect((result as { message: string }).message).toContain('punch_ledger_id=1001');
  });
});

// ---------------------------------------------------------------------------
// Tests: Error cases
// ---------------------------------------------------------------------------

describe('postLaborEntryDraft — error cases', () => {
  it('throws 404 when draft is not found', async () => {
    vi.mocked(db.select).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) as any);

    await expect(postLaborEntryDraft(999, 99)).rejects.toMatchObject({
      message: expect.stringContaining('not found'),
      statusCode: 404,
    });
  });

  it('throws 422 when draft is in DRAFT status (not CONFIRMED)', async () => {
    vi.mocked(db.select).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ status: 'DRAFT' }]),
        }),
      }),
    }) as any);

    await expect(postLaborEntryDraft(1, 99)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when draft is in NEEDS_REVIEW status', async () => {
    vi.mocked(db.select).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ status: 'NEEDS_REVIEW' }]),
        }),
      }),
    }) as any);

    await expect(postLaborEntryDraft(1, 99)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when timekeeping employee has no linked public employee', async () => {
    setupPreflightConfirmed();

    // Inside the transaction: draft OK, tkEmployee has no epochEmployeeId
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      let txSelectCount = 0;
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                txSelectCount++;
                if (txSelectCount === 1) return Promise.resolve([TWO_SEGMENT_DRAFT_FULL]);
                if (txSelectCount === 2) return Promise.resolve([{ epochEmployeeId: null }]);
                return Promise.resolve([]);
              }),
            }),
          }),
        })),
        insert: vi.fn(),
        update: vi.fn(),
      };
      return cb(tx);
    });

    await expect(postLaborEntryDraft(1, 99)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('no linked public employee record'),
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Re-validation
// ---------------------------------------------------------------------------

describe('postLaborEntryDraft — re-validation before posting', () => {
  function setupRevalidationTest(overrides: Partial<typeof TWO_SEGMENT_DRAFT_FULL>) {
    const draft = { ...TWO_SEGMENT_DRAFT_FULL, ...overrides };
    vi.mocked(db.select).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ status: draft.status }]),
        }),
      }),
    }) as any);
    // Set up transaction but re-validation should throw before inserts
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      let txSelectCount = 0;
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                txSelectCount++;
                if (txSelectCount === 1) return Promise.resolve([draft]);
                return Promise.resolve([]);
              }),
            }),
          }),
        })),
        insert: vi.fn(),
        update: vi.fn(),
      };
      return cb(tx);
    });
  }

  it('rejects overlapping segments with 422', async () => {
    setupRevalidationTest({
      totalHours: '5.0000',
      parsedSegmentsJson: [
        { startTime: '08:00', endTime: '12:00', chargeCodeId: 5, indirectCodeId: null },
        { startTime: '11:00', endTime: '13:00', chargeCodeId: 7, indirectCodeId: null },
      ],
    });

    await expect(postLaborEntryDraft(1, 99)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('overlap'),
    });
    expect(mockDbState.txInsertCalls).toHaveLength(0);
  });

  it('rejects when segment total duration does not match draft totalHours', async () => {
    setupRevalidationTest({
      // Segments total 8h but totalHours says 6
      totalHours: '6.0000',
      parsedSegmentsJson: [
        { startTime: '08:00', endTime: '12:00', chargeCodeId: 5, indirectCodeId: null },
        { startTime: '13:00', endTime: '17:00', chargeCodeId: 7, indirectCodeId: null },
      ],
    });

    await expect(postLaborEntryDraft(1, 99)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('does not match draft total hours'),
    });
    expect(mockDbState.txInsertCalls).toHaveLength(0);
  });

  it('rejects a segment with no charge code or indirect code', async () => {
    setupRevalidationTest({
      totalHours: '4.0000',
      parsedSegmentsJson: [
        { startTime: '08:00', endTime: '12:00', chargeCodeId: null, indirectCodeId: null },
      ],
    });

    await expect(postLaborEntryDraft(1, 99)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('charge code or indirect code is required'),
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Allocation costing read compatibility
// ---------------------------------------------------------------------------

describe('postLaborEntryDraft — allocation costing read compatibility', () => {
  it('SALARIED_ENTRY allocations have allocationEnd IS NOT NULL', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const allocInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'labor_allocations');
    expect(allocInserts.length).toBeGreaterThan(0);
    for (const alloc of allocInserts) {
      expect(alloc.values.allocationEnd).toBeDefined();
      expect(alloc.values.allocationEnd).not.toBeNull();
      expect(alloc.values.allocationEnd).toBeInstanceOf(Date);
    }
  });

  it('SALARIED_ENTRY allocations have laborClass=REGULAR', async () => {
    setupHappyPath();

    await postLaborEntryDraft(1, 99);

    const allocInserts = mockDbState.txInsertCalls.filter((c) => c.table === 'labor_allocations');
    for (const alloc of allocInserts) {
      expect(alloc.values.laborClass).toBe('REGULAR');
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Charge code and indirect code resolution (tx-scoped)
// ---------------------------------------------------------------------------

describe('postLaborEntryDraft — charge code resolution via tx', () => {
  it('resolves chargeCodeId from indirect_codes via tx.select when indirectCodeId is set', async () => {
    const indirectSegmentDraft = {
      ...TWO_SEGMENT_DRAFT_FULL,
      parsedSegmentsJson: [
        { startTime: '08:00', endTime: '16:00', chargeCodeId: null, indirectCodeId: 3 },
      ],
      totalHours: '8.0000',
    };

    setupPreflightConfirmed(indirectSegmentDraft);
    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const segs = indirectSegmentDraft.parsedSegmentsJson as {
        chargeCodeId?: number | null; indirectCodeId?: number | null
      }[];
      return cb(makeHappyPathTx(segs, indirectSegmentDraft));
    });

    await postLaborEntryDraft(1, 99);

    const allocInsert = mockDbState.txInsertCalls.find((c) => c.table === 'labor_allocations');
    expect(allocInsert).toBeDefined();
    // 99 is what makeHappyPathTx returns for indirect code resolution
    expect(allocInsert!.values.chargeCodeId).toBe(99);
  });

  it('throws 422 when direct charge code no longer exists (caught inside tx)', async () => {
    setupPreflightConfirmed();

    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      let txSelectCount = 0;
      const tx = {
        execute: vi.fn().mockResolvedValue(undefined),
        select: vi.fn(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                txSelectCount++;
                if (txSelectCount === 1) return Promise.resolve([TWO_SEGMENT_DRAFT_FULL]);
                if (txSelectCount === 2) return Promise.resolve([TK_EMPLOYEE]);
                if (txSelectCount === 3) return Promise.resolve([POSTER_USER]);
                // Charge code lookup returns empty (code was deleted after confirm)
                return Promise.resolve([]);
              }),
            }),
          }),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: 1001 }])),
          })),
        })),
        update: vi.fn(),
      };
      return cb(tx);
    });

    await expect(postLaborEntryDraft(1, 99)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('no longer exists'),
    });
  });
});
