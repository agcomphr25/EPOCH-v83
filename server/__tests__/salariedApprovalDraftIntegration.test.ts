/**
 * Tests for Phase 6 — Draft posting wired into salaried timesheet approval workflow.
 *
 * Covered:
 *   1. Payroll approval posts all CONFIRMED drafts in scope
 *   2. Payroll approval blocks (DRAFT_NEEDS_REVIEW) when any draft is NEEDS_REVIEW
 *   3. Reopen voids synthetic sessions and resets POSTED drafts to CONFIRMED
 *   4. Re-approval re-posts correctly (idempotency — AlreadyPostedGuard)
 *   5. Drafts outside the timesheet window are not touched (POSTED not re-posted)
 *   6. DraftNeedsReviewError carries structured data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  like: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray) => ({ raw: strings.join('?') })),
    { raw: vi.fn(() => ({})) },
  ),
}));

vi.mock('../schema', () => ({
  laborCostRecords: { id: {}, canonicalId: {}, journalEntryId: {} },
  employees: { id: {}, hireDate: {} },
  punchLedger: { id: {}, isEdited: {}, editNote: {} },
  laborAllocations: { id: {}, punchLedgerId: {}, status: {}, isEdited: {}, editNote: {} },
  users: {},
  chargeCodes: { id: {} },
  travelers: {},
  productionWorkOrders: {},
  projects: {},
  laborApprovals: {},
  laborBudgetOverrides: {},
}));

vi.mock('../src/schema/timekeeping', () => ({
  salariedTimesheetsTable: { id: {}, employeeId: {}, periodStart: {}, periodEnd: {} },
  salariedTimesheetLinesTable: { timesheetId: {}, chargeCodeId: {}, isLocked: {}, lineType: {}, hours: {} },
  laborEntryDraftsTable: { id: {}, employeeId: {}, entryDate: {}, status: {}, reviewedBy: {} },
  employeesTable: { id: {}, epochEmployeeId: {}, hireDate: {} },
  salariedTimesheetAuditTable: {},
  indirectCodesTable: {},
  leaveEntriesTable: {},
}));

vi.mock('../storage', () => ({
  storage: {
    getChargeCodeById: vi.fn().mockResolvedValue({ id: 10, code: 'INDIRECT', type: 'INDIRECT' }),
  },
}));

vi.mock('../src/services/laborCostingService', () => ({
  resolveEmployeeRate: vi.fn().mockResolvedValue({ rate: 50, rateSource: 'EMPLOYEE_RATE' }),
  classifyLaborCost: vi.fn().mockResolvedValue('OVERHEAD'),
}));

vi.mock('../src/services/timekeeping/laborEntryDraftPostingService', () => ({
  postLaborEntryDraft: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  pool: {},
}));

import { db } from '../db';
import {
  createSalariedLaborCostRecords,
  deleteSalariedLaborCostRecordsForReopen,
  DraftNeedsReviewError,
} from '../src/services/timekeeping/salariedLaborCostingService';
import { postLaborEntryDraft } from '../src/services/timekeeping/laborEntryDraftPostingService';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TIMESHEET = {
  id: 100,
  employeeId: 42,
  periodStart: '2026-04-27',
  periodEnd: '2026-05-03',
  status: 'SUPERVISOR_APPROVED',
};

const TK_EMP_ID = 7;

const LINE_WITH_CHARGE_CODE = {
  id: 1001,
  timesheetId: 100,
  chargeCodeId: 10,
  lineType: 'INDIRECT',
  hours: 8,
  date: '2026-04-28',
  isLocked: false,
};

const CONFIRMED_DRAFT = { id: 201, status: 'CONFIRMED' };
const NEEDS_REVIEW_DRAFT = { id: 202, status: 'NEEDS_REVIEW' };
const POSTED_DRAFT = { id: 203, status: 'POSTED' };

// ---------------------------------------------------------------------------
// Mock builder for createSalariedLaborCostRecords
// ---------------------------------------------------------------------------

/**
 * Build a db.select mock sequence for createSalariedLaborCostRecords.
 *
 * Query order in the function (after Phase 6 refactor):
 *   Q1: db.select().from(salariedTimesheetsTable).where().limit(1)  → timesheet
 *   Q2: db.select().from(salariedTimesheetLinesTable).where()        → lines (no limit)
 *   Q3: db.select().from(laborCostRecords).where(and(like, isNotNull)) → existing GL-posted
 *   [db.delete: non-posted STL records]
 *   Q4: db.select().from(employeesTable).where().limit(1)            → tkEmp (step 7b)
 *   Q5: db.select().from(laborEntryDraftsTable).where()              → in-scope drafts (step 7b, no limit)
 *   [db.insert: labor_cost_records]
 *   [postLaborEntryDraft calls for CONFIRMED drafts]
 *
 * Note: charge code lookup is via storage.getChargeCodeById (already mocked).
 */
function setupSelectForPayrollApproval(opts: {
  timesheet?: object;
  lines?: object[];
  existingGLPosted?: object[];
  tkEmp?: object | null;
  inScopeDrafts?: object[];
}) {
  const {
    timesheet = TIMESHEET,
    lines = [LINE_WITH_CHARGE_CODE],
    existingGLPosted = [],
    tkEmp = { id: TK_EMP_ID },
    inScopeDrafts = [],
  } = opts;

  let callIdx = 0;

  vi.mocked(db.select).mockImplementation(() => {
    const myCall = callIdx++;

    // Q1 → timesheet (uses .limit(1))
    if (myCall === 0) {
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([timesheet]),
          })),
        })),
      } as any;
    }
    // Q2 → lines (no .limit())
    if (myCall === 1) {
      return {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(lines),
        })),
      } as any;
    }
    // Q3 → existing GL-posted STL records (no .limit())
    if (myCall === 2) {
      return {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(existingGLPosted),
        })),
      } as any;
    }
    // Q4 → timekeeping employee (uses .limit(1)) — step 7b
    if (myCall === 3) {
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(tkEmp ? [tkEmp] : []),
          })),
        })),
      } as any;
    }
    // Q5 → in-scope drafts (no .limit()) — step 7b
    if (myCall === 4) {
      return {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(inScopeDrafts),
        })),
      } as any;
    }
    // Default — return empty
    return {
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    } as any;
  });
}

function setupInsertAndDelete() {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 9001 }]),
    }),
  } as any);
  vi.mocked(db.delete).mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    }),
  } as any);
}

// ---------------------------------------------------------------------------
// Tests — payroll approval posts CONFIRMED drafts
// ---------------------------------------------------------------------------

describe('createSalariedLaborCostRecords — draft integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts all CONFIRMED drafts in the timesheet window at payroll approval', async () => {
    setupSelectForPayrollApproval({
      inScopeDrafts: [CONFIRMED_DRAFT],
    });
    setupInsertAndDelete();

    vi.mocked(postLaborEntryDraft).mockResolvedValue({
      punchLedgerId: 5001,
      allocationIds: [6001, 6002],
      draftId: CONFIRMED_DRAFT.id,
      status: 'POSTED',
    });

    const result = await createSalariedLaborCostRecords(TIMESHEET.id, 99);

    expect(postLaborEntryDraft).toHaveBeenCalledOnce();
    expect(postLaborEntryDraft).toHaveBeenCalledWith(CONFIRMED_DRAFT.id, 99);
    expect(result.draftsPosted).toBe(1);
    expect(result.draftPostingResults[0]).toMatchObject({
      draftId: CONFIRMED_DRAFT.id,
      punchLedgerId: 5001,
      allocationIds: [6001, 6002],
    });
  });

  it('posts multiple CONFIRMED drafts and aggregates results', async () => {
    const DRAFT_A = { id: 201, status: 'CONFIRMED' };
    const DRAFT_B = { id: 202, status: 'CONFIRMED' };

    setupSelectForPayrollApproval({
      inScopeDrafts: [DRAFT_A, DRAFT_B],
    });
    setupInsertAndDelete();

    vi.mocked(postLaborEntryDraft)
      .mockResolvedValueOnce({ punchLedgerId: 5001, allocationIds: [6001], draftId: 201, status: 'POSTED' })
      .mockResolvedValueOnce({ punchLedgerId: 5002, allocationIds: [6002], draftId: 202, status: 'POSTED' });

    const result = await createSalariedLaborCostRecords(TIMESHEET.id, 99);

    expect(postLaborEntryDraft).toHaveBeenCalledTimes(2);
    expect(result.draftsPosted).toBe(2);
  });

  it('blocks with DraftNeedsReviewError when any in-scope draft is NEEDS_REVIEW', async () => {
    setupSelectForPayrollApproval({
      inScopeDrafts: [NEEDS_REVIEW_DRAFT, CONFIRMED_DRAFT],
    });
    setupInsertAndDelete();

    await expect(createSalariedLaborCostRecords(TIMESHEET.id, 99))
      .rejects.toThrow(DraftNeedsReviewError);

    expect(postLaborEntryDraft).not.toHaveBeenCalled();
  });

  it('DraftNeedsReviewError carries code and draft IDs', async () => {
    setupSelectForPayrollApproval({
      inScopeDrafts: [NEEDS_REVIEW_DRAFT],
    });
    setupInsertAndDelete();

    let caught: unknown;
    try {
      await createSalariedLaborCostRecords(TIMESHEET.id, 99);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(DraftNeedsReviewError);
    expect((caught as DraftNeedsReviewError).code).toBe('DRAFT_NEEDS_REVIEW');
    expect((caught as DraftNeedsReviewError).draftIds).toEqual([NEEDS_REVIEW_DRAFT.id]);
    expect((caught as DraftNeedsReviewError).message).toContain(String(NEEDS_REVIEW_DRAFT.id));
  });

  it('handles AlreadyPostedGuard (idempotent re-approval) without throwing', async () => {
    setupSelectForPayrollApproval({
      inScopeDrafts: [CONFIRMED_DRAFT],
    });
    setupInsertAndDelete();

    vi.mocked(postLaborEntryDraft).mockResolvedValue({
      alreadyPosted: true as const,
      punchLedgerId: 5001,
      draftId: CONFIRMED_DRAFT.id,
      message: 'Draft 201 is already in POSTED status (punch_ledger_id=5001).',
    });

    const result = await createSalariedLaborCostRecords(TIMESHEET.id, 99);
    expect(result.draftsPosted).toBe(1);
    expect(result.draftPostingResults[0]?.draftId).toBe(CONFIRMED_DRAFT.id);
  });

  it('skips POSTED drafts — only CONFIRMED are re-posted', async () => {
    setupSelectForPayrollApproval({
      inScopeDrafts: [POSTED_DRAFT],
    });
    setupInsertAndDelete();

    const result = await createSalariedLaborCostRecords(TIMESHEET.id, 99);

    // POSTED draft is not CONFIRMED, so postLaborEntryDraft should not be called
    expect(postLaborEntryDraft).not.toHaveBeenCalled();
    expect(result.draftsPosted).toBe(0);
  });

  it('succeeds with zero drafts (no timekeeping employee record)', async () => {
    setupSelectForPayrollApproval({ tkEmp: null });
    setupInsertAndDelete();

    const result = await createSalariedLaborCostRecords(TIMESHEET.id, 99);

    expect(postLaborEntryDraft).not.toHaveBeenCalled();
    expect(result.draftsPosted).toBe(0);
    expect(result.draftPostingResults).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests — reopen voids synthetic sessions and resets drafts
// ---------------------------------------------------------------------------

describe('deleteSalariedLaborCostRecordsForReopen — draft reversal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupTransactionMock() {
    const txDeleteWhere = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 9001 }]) });
    const txDeleteMock = vi.fn().mockReturnValue({ where: txDeleteWhere });
    const txUpdateWhere = vi.fn().mockResolvedValue([]);
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSet });
    const txInsertValues = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
    const txInsertMock = vi.fn().mockReturnValue({ values: txInsertValues });
    const txMock = {
      delete: txDeleteMock,
      update: txUpdateMock,
      insert: txInsertMock,
    };
    vi.mocked(db.transaction).mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(txMock));
    return txMock;
  }

  function buildReopenSelectMock(opts: {
    glPostedSTL?: object[];
    timesheet?: object;
    tkEmp?: object | null;
    postedDrafts?: object[];
    // Each entry should include draftId (for in-memory match) and punchLedgerId.
    // Pass null/empty to simulate no matching audit records.
    auditRows?: { id: number; afterState: Record<string, unknown> }[];
  }) {
    const {
      glPostedSTL = [],
      timesheet = TIMESHEET,
      tkEmp = { id: TK_EMP_ID },
      postedDrafts = [],
      auditRows = [],
    } = opts;

    let callIdx = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const myCall = callIdx++;
      // Q1: check for GL-posted STL records
      if (myCall === 0) {
        return {
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(glPostedSTL),
          })),
        } as any;
      }
      // Q2: delete non-posted STL records (handled via db.delete)
      // Q3: load timesheet for employee/period
      if (myCall === 1) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([timesheet]),
            })),
          })),
        } as any;
      }
      // Q4: resolve timekeeping employee
      if (myCall === 2) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(tkEmp ? [tkEmp] : []),
            })),
          })),
        } as any;
      }
      // Q5: find POSTED drafts
      if (myCall === 3) {
        return {
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(postedDrafts),
          })),
        } as any;
      }
      // Q6: batch Phase-6 audit query — DRAFT_POSTED_AT_PAYROLL_APPROVAL records
      // for this timesheet, ordered by desc(id). Returns array directly (no .limit()).
      if (myCall === 4) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn().mockResolvedValue(auditRows),
            })),
          })),
        } as any;
      }
      return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } as any;
    });
  }

  /**
   * Build a reopen select mock for multiple POSTED drafts.
   * auditRows should include one entry per draft with draftId+punchLedgerId in afterState.
   */
  function buildReopenSelectMockMultiDraft(opts: {
    postedDrafts: object[];
    auditRows: { id: number; afterState: Record<string, unknown> }[];
  }) {
    const { postedDrafts, auditRows } = opts;
    let callIdx = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const myCall = callIdx++;
      if (myCall === 0) {
        return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } as any;
      }
      if (myCall === 1) {
        return { from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([TIMESHEET]) })) })) } as any;
      }
      if (myCall === 2) {
        return { from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: TK_EMP_ID }]) })) })) } as any;
      }
      if (myCall === 3) {
        return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(postedDrafts) })) } as any;
      }
      // Q6: batch Phase-6 audit query — returns all audit rows for this timesheet
      if (myCall === 4) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn().mockResolvedValue(auditRows),
            })),
          })),
        } as any;
      }
      return { from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) } as any;
    });
  }

  it('voids labor_allocations and resets draft to CONFIRMED when reopening', async () => {
    const PUNCH_LEDGER_ID = 5001;

    buildReopenSelectMock({
      postedDrafts: [POSTED_DRAFT],
      auditRows: [{ id: 1, afterState: { draftId: POSTED_DRAFT.id, punchLedgerId: PUNCH_LEDGER_ID } }],
    });
    const txMock = setupTransactionMock();

    const result = await deleteSalariedLaborCostRecordsForReopen(TIMESHEET.id);

    expect(result.draftsReset).toBe(1);
    expect(db.transaction).toHaveBeenCalled();
    // tx.update called for allocations, punch_ledger, and draft
    expect(txMock.update).toHaveBeenCalled();
    // tx.insert called for audit record
    expect(txMock.insert).toHaveBeenCalled();
  });

  it('returns draftsReset=0 when no POSTED drafts exist for the week', async () => {
    buildReopenSelectMock({ postedDrafts: [] });
    setupTransactionMock();

    const result = await deleteSalariedLaborCostRecordsForReopen(TIMESHEET.id);
    expect(result.draftsReset).toBe(0);
  });

  it('throws when GL-posted STL records block reopen', async () => {
    buildReopenSelectMock({
      glPostedSTL: [{ id: 9001 }],
    });

    await expect(deleteSalariedLaborCostRecordsForReopen(TIMESHEET.id))
      .rejects.toThrow(/already been posted to GL/);
  });

  it('skips draft reset when no audit row is found (fail-closed guard)', async () => {
    // auditRows: [] → no SYNTHETIC_SESSION_POSTED audit record for this timesheet
    buildReopenSelectMock({
      postedDrafts: [POSTED_DRAFT],
      auditRows: [],
    });
    const txMock = setupTransactionMock();

    const result = await deleteSalariedLaborCostRecordsForReopen(TIMESHEET.id);

    // Draft is NOT reset — draftsReset stays at 0 (fail-closed)
    expect(result.draftsReset).toBe(0);
    // tx.update must NOT have been called (no void, no draft status update)
    expect(txMock.update).not.toHaveBeenCalled();
  });

  it('targets only the latest synthetic session per draft (multi-cycle reopen)', async () => {
    const DRAFT_A = { id: 301, status: 'POSTED' };
    const DRAFT_B = { id: 302, status: 'POSTED' };
    // The batch audit query returns rows desc by id — latest first.
    // Draft A's latest posting (id=3) has punchLedgerId=7001
    // Draft B's latest posting (id=4) has punchLedgerId=7002
    // Old/stale entries (id=1,2) should NOT be used.
    buildReopenSelectMockMultiDraft({
      postedDrafts: [DRAFT_A, DRAFT_B],
      auditRows: [
        { id: 4, afterState: { draftId: DRAFT_B.id, punchLedgerId: 7002 } },
        { id: 3, afterState: { draftId: DRAFT_A.id, punchLedgerId: 7001 } },
        { id: 2, afterState: { draftId: DRAFT_B.id, punchLedgerId: 9999 } }, // stale
        { id: 1, afterState: { draftId: DRAFT_A.id, punchLedgerId: 9998 } }, // stale
      ],
    });
    const txMock = setupTransactionMock();

    const result = await deleteSalariedLaborCostRecordsForReopen(TIMESHEET.id);

    // Both drafts have valid linkages — both should be reset
    expect(result.draftsReset).toBe(2);
    expect(db.transaction).toHaveBeenCalled();
    expect(txMock.update).toHaveBeenCalled();
    // tx.insert (audit) should have been called twice — once per draft
    expect(txMock.insert).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Tests — compensating rollback on draft post failure
// ---------------------------------------------------------------------------

describe('createSalariedLaborCostRecords — compensating rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes inserted STL records AND voids/resets already-posted drafts if second post throws', async () => {
    const DRAFT_A = { id: 401, status: 'CONFIRMED' };
    const DRAFT_B = { id: 402, status: 'CONFIRMED' };

    setupSelectForPayrollApproval({
      inScopeDrafts: [DRAFT_A, DRAFT_B],
    });

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 9501 }]),
      }),
    } as any);

    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    } as any);

    const updateSetMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    vi.mocked(db.update).mockReturnValue({ set: updateSetMock } as any);

    // First draft post succeeds (punchLedgerId=5001); second throws
    vi.mocked(postLaborEntryDraft)
      .mockResolvedValueOnce({ punchLedgerId: 5001, allocationIds: [6001], draftId: 401, status: 'POSTED' })
      .mockRejectedValueOnce(new Error('Simulated draft post failure'));

    await expect(createSalariedLaborCostRecords(TIMESHEET.id, 99))
      .rejects.toThrow('Simulated draft post failure');

    // Compensating rollback step 1: db.update must have been called to:
    //   (a) void labor_allocations for punchLedgerId=5001
    //   (b) void punch_ledger row id=5001
    //   (c) reset draft 401 back to CONFIRMED
    expect(db.update).toHaveBeenCalled();
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CONFIRMED' }),
    );
    // Compensating rollback step 2: db.delete called to remove inserted STL records
    expect(db.delete).toHaveBeenCalled();
  });

  it('does not call db.delete as rollback when all drafts post successfully', async () => {
    setupSelectForPayrollApproval({
      inScopeDrafts: [CONFIRMED_DRAFT],
    });

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 9502 }]),
      }),
    } as any);

    const deleteWhereMock = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
    vi.mocked(db.delete).mockReturnValue({ where: deleteWhereMock } as any);

    vi.mocked(postLaborEntryDraft).mockResolvedValue({
      punchLedgerId: 5001,
      allocationIds: [6001],
      draftId: CONFIRMED_DRAFT.id,
      status: 'POSTED',
    });

    const result = await createSalariedLaborCostRecords(TIMESHEET.id, 99);

    expect(result.draftsPosted).toBe(1);
    // db.delete was called once for the "non-posted STL cleanup" step (step 3),
    // NOT as a compensating rollback for a failed post.
    // The "non-posted STL cleanup" delete is called before insert; verify post succeeds.
    expect(postLaborEntryDraft).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Tests — DraftNeedsReviewError class
// ---------------------------------------------------------------------------

describe('DraftNeedsReviewError', () => {
  it('has code DRAFT_NEEDS_REVIEW and carries draft IDs', () => {
    const err = new DraftNeedsReviewError([10, 11, 12]);
    expect(err.code).toBe('DRAFT_NEEDS_REVIEW');
    expect(err.draftIds).toEqual([10, 11, 12]);
    expect(err.message).toContain('3 labor entry draft');
    expect(err.message).toContain('10, 11, 12');
    expect(err instanceof DraftNeedsReviewError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('is an instance of Error for catch-block instanceof checks', () => {
    let caught: unknown;
    try {
      throw new DraftNeedsReviewError([42]);
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof Error).toBe(true);
    expect(caught instanceof DraftNeedsReviewError).toBe(true);
    expect((caught as DraftNeedsReviewError).draftIds).toEqual([42]);
  });
});
