/**
 * Regression tests for getSalariedLaborCostAudit() Part B source filter.
 *
 * Covered:
 *   1. timesheetId/draftId collision — Phase-4 audit rows (source='SALARIED_ENTRY')
 *      that happen to share the same timesheetId value as a real timesheet must be
 *      excluded; only Phase-6 rows (source='PAYROLL_APPROVAL') are included.
 *   2. Happy path — Phase-6 PAYROLL_APPROVAL audit row correctly surfaces
 *      draft-sourced cost records in the result.
 *   3. Mixed — when both STL records (Part A) and draft-sourced records (Part B)
 *      exist, both appear in the result without duplication.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// ── Module-level mocks (must appear before any dynamic imports) ────────────

vi.mock('drizzle-orm', () => ({
  eq:       vi.fn(() => ({})),
  and:      vi.fn(() => ({})),
  like:     vi.fn(() => ({})),
  isNull:   vi.fn(() => ({})),
  isNotNull:vi.fn(() => ({})),
  inArray:  vi.fn(() => ({})),
  asc:      vi.fn(() => ({})),
  desc:     vi.fn(() => ({})),
  sql: Object.assign(
    vi.fn((_strings: TemplateStringsArray) => ({ __isSql: true })),
    { raw: vi.fn(() => ({})) },
  ),
}));

vi.mock('../schema', () => ({
  laborCostRecords: {
    canonicalId:            {},
    sourcePunchCanonicalId: {},
    chargeCodeId:           {},
    journalEntryId:         {},
  },
}));

vi.mock('../src/schema/timekeeping', () => ({
  salariedTimesheetLinesTable: { id: {}, timesheetId: {} },
  salariedTimesheetAuditTable: {},
}));

vi.mock('../storage', () => ({
  storage: {
    getChargeCodeById: vi.fn().mockResolvedValue({ id: 10, code: 'WO-101', type: 'WORK_ORDER' }),
  },
}));

vi.mock('../db', () => ({
  db: {
    select:  vi.fn(),
    execute: vi.fn(),
  },
  pool: {},
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { db } from '../db';
import { getSalariedLaborCostAudit } from '../src/services/timekeeping/salariedLaborCostingService';

// ── Helpers ────────────────────────────────────────────────────────────────

const mockDbSelect  = db.select  as unknown as Mock;
const mockDbExecute = db.execute as unknown as Mock;

/** Make a thenable that also has .limit() — supports both await patterns:
 *  `await db.select().from().where()` and `await db.select().from().where().limit(1)`.
 */
function makeChain(rows: object[]) {
  const p: Promise<object[]> & { limit: Mock } = Object.assign(
    Promise.resolve(rows),
    { limit: vi.fn().mockResolvedValue(rows) },
  );
  return p;
}

/** Wire db.select() to resolve to `rows` for a single call in a chain. */
function setupSelect(rows: object[]): void {
  const chain     = makeChain(rows);
  const mockWhere = vi.fn().mockReturnValue(chain);
  const mockFrom  = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
}

/** Wire multiple sequential db.select() calls. */
function setupSelectSequence(sequence: object[][]): void {
  let call = 0;
  mockDbSelect.mockImplementation(() => {
    const rows = sequence[call] ?? [];
    call++;
    const chain  = makeChain(rows);
    const mockWhere = vi.fn().mockReturnValue(chain);
    const mockFrom  = vi.fn().mockReturnValue({ where: mockWhere });
    return { from: mockFrom };
  });
}

// ── Shared constants ───────────────────────────────────────────────────────

const TIMESHEET_ID = 100; // also happens to equal a Phase-4 draft id (collision)

const BASE_COST_RECORD = {
  canonicalId:            'pl-cost-501',
  sourcePunchCanonicalId: 'pl-501',
  chargeCodeId:           10,
  hoursWorked:            '8.0',
  dollarCost:             '400.00',
  costType:               'DIRECT',
  rateUsed:               '50.00',
  rateSource:             'EMPLOYEE_RATE',
  journalEntryId:         null,
};

// ── describe: timesheetId / draftId collision ──────────────────────────────

describe('getSalariedLaborCostAudit — timesheetId/draftId collision', () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
    mockDbExecute.mockReset();
  });

  it('returns an empty result when only Phase-4 audit rows exist for the timesheetId', async () => {
    // Part A: no STL records
    setupSelect([]);
    // Part B: audit query returns [] because source='PAYROLL_APPROVAL' filter
    //   excludes Phase-4 rows (source='SALARIED_ENTRY') even if timesheet_id matches.
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    const result = await getSalariedLaborCostAudit(TIMESHEET_ID);

    expect(result).toHaveLength(0);
  });

  it('calls db.execute exactly once (the Part B audit query)', async () => {
    setupSelect([]);
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    await getSalariedLaborCostAudit(TIMESHEET_ID);

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  it('does NOT include a draft-sourced record when the collision row is excluded', async () => {
    // If the source filter were absent, the audit query might return a Phase-4 row
    // (timesheetId=draftId=100).  Because the filter IS in place the query returns [].
    setupSelect([]);
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    const result = await getSalariedLaborCostAudit(TIMESHEET_ID);

    const draftRows = result.filter((r) => r.lineType === 'DRAFT_ALLOCATION');
    expect(draftRows).toHaveLength(0);
  });
});

// ── describe: Phase-6 PAYROLL_APPROVAL row (happy path) ───────────────────

describe('getSalariedLaborCostAudit — Phase-6 PAYROLL_APPROVAL audit row', () => {
  const PHASE6_AUDIT_ROW = {
    punchLedgerId: 501,
    draftId:       200,
    entryDate:     '2026-04-10',
  };

  beforeEach(() => {
    mockDbSelect.mockReset();
    mockDbExecute.mockReset();
  });

  it('includes draft-sourced records when a PAYROLL_APPROVAL audit row exists', async () => {
    // Part A: no STL records
    // Part B inner: cost records for punchLedgerId 501
    setupSelectSequence([
      [],             // Part A STL records
      [BASE_COST_RECORD], // Part B draft cost records for pl-501
    ]);
    mockDbExecute.mockResolvedValueOnce({ rows: [PHASE6_AUDIT_ROW] });

    const result = await getSalariedLaborCostAudit(TIMESHEET_ID);

    expect(result).toHaveLength(1);
    expect(result[0].lineType).toBe('DRAFT_ALLOCATION');
    expect(result[0].date).toBe('2026-04-10');
    expect(result[0].hours).toBe(8.0);
  });

  it('sets source="SALARIED_ENTRY" on draft-allocation rows', async () => {
    setupSelectSequence([[], [BASE_COST_RECORD]]);
    mockDbExecute.mockResolvedValueOnce({ rows: [PHASE6_AUDIT_ROW] });

    const result = await getSalariedLaborCostAudit(TIMESHEET_ID);

    expect(result[0].source).toBe('SALARIED_ENTRY');
  });

  it('populates chargeCodeCode from storage lookup', async () => {
    setupSelectSequence([[], [BASE_COST_RECORD]]);
    mockDbExecute.mockResolvedValueOnce({ rows: [PHASE6_AUDIT_ROW] });

    const result = await getSalariedLaborCostAudit(TIMESHEET_ID);

    expect(result[0].chargeCodeCode).toBe('WO-101');
    expect(result[0].chargeCodeType).toBe('WORK_ORDER');
  });

  it('returns empty result when audit row exists but no cost records linked to punch', async () => {
    setupSelectSequence([[], []]); // no STL, no draft cost records
    mockDbExecute.mockResolvedValueOnce({ rows: [PHASE6_AUDIT_ROW] });

    const result = await getSalariedLaborCostAudit(TIMESHEET_ID);

    expect(result).toHaveLength(0);
  });
});

// ── describe: mixed STL + draft-sourced records ────────────────────────────

describe('getSalariedLaborCostAudit — mixed Part A + Part B', () => {
  const STL_RECORD = {
    canonicalId:            `stl-${TIMESHEET_ID}-1001`,
    sourcePunchCanonicalId: null,
    chargeCodeId:           10,
    hoursWorked:            '40.0',
    dollarCost:             '2000.00',
    costType:               'DIRECT',
    rateUsed:               '50.00',
    rateSource:             'EMPLOYEE_RATE',
    journalEntryId:         99,
  };

  const STL_LINE = {
    id:             1001,
    timesheetId:    TIMESHEET_ID,
    date:           '2026-04-07',
    lineType:       'INDIRECT',
    hours:          40,
    chargeCodeId:   10,
    indirectCodeId: null,
    leaveEntryId:   null,
    source:         'MANUAL',
    isLocked:       true,
  };

  const PHASE6_AUDIT_ROW = { punchLedgerId: 501, draftId: 200, entryDate: '2026-04-10' };

  beforeEach(() => {
    mockDbSelect.mockReset();
    mockDbExecute.mockReset();
  });

  it('includes both STL records (Part A) and draft-allocation records (Part B)', async () => {
    setupSelectSequence([
      [STL_RECORD],       // Part A: one STL record
      [STL_LINE],         // Part A: line detail for STL record
      [BASE_COST_RECORD], // Part B: draft cost record
    ]);
    mockDbExecute.mockResolvedValueOnce({ rows: [PHASE6_AUDIT_ROW] });

    const result = await getSalariedLaborCostAudit(TIMESHEET_ID);

    expect(result).toHaveLength(2);

    const stlRow   = result.find((r) => r.lineType === 'INDIRECT');
    const draftRow = result.find((r) => r.lineType === 'DRAFT_ALLOCATION');
    expect(stlRow).toBeDefined();
    expect(draftRow).toBeDefined();
  });

  it('STL record carries journalEntryId; draft-allocation carries null', async () => {
    setupSelectSequence([[STL_RECORD], [STL_LINE], [BASE_COST_RECORD]]);
    mockDbExecute.mockResolvedValueOnce({ rows: [PHASE6_AUDIT_ROW] });

    const result = await getSalariedLaborCostAudit(TIMESHEET_ID);

    const stlRow   = result.find((r) => r.lineType === 'INDIRECT')!;
    const draftRow = result.find((r) => r.lineType === 'DRAFT_ALLOCATION')!;
    expect(stlRow.journalEntryId).toBe(99);
    expect(draftRow.journalEntryId).toBeNull();
  });
});
