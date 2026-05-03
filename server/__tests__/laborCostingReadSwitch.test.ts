/**
 * Tests for the Phase F feature-flagged allocation costing read switch.
 *
 * Covers four scenarios:
 *   1. Flag OFF  → legacy punch_ledger path runs, readModel: 'LEGACY'
 *   2. Flag ON   → allocation path runs and produces correct totals, readModel: 'ALLOCATION'
 *   3. Flag ON + allocation query throws → fallback to legacy, readModel: 'LEGACY_FALLBACK'
 *   4. Flag ON + allocation query returns 0 rows (period has closed punches) → fallback, readModel: 'LEGACY_FALLBACK'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mutable flag state ────────────────────────────────────────────────────────
// vi.hoisted ensures the object is created before vi.mock factories run,
// so the reference is valid when the mock factory executes.

const mockFlags = vi.hoisted(() => ({
  useAllocationCostingRead: false,
  laborAllocationsEnabled: false,
}));

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

vi.mock('../src/lib/featureFlags', () => mockFlags);

const mockGetEmployee = vi.fn();
const mockGetEstimatingDefaultsFirst = vi.fn();
const mockGetChargeCodeById = vi.fn();
const mockGetCostCenterByCode = vi.fn();
const mockGetLaborPostingRunByPeriod = vi.fn();
const mockDeleteLaborCostRecordsByPeriod = vi.fn();
const mockCreateLaborPostingRun = vi.fn();
const mockBulkInsertLaborCostRecords = vi.fn();

vi.mock('../storage', () => ({
  storage: {
    getEmployee: (...args: unknown[]) => mockGetEmployee(...args),
    getEstimatingDefaultsFirst: (...args: unknown[]) => mockGetEstimatingDefaultsFirst(...args),
    getChargeCodeById: (...args: unknown[]) => mockGetChargeCodeById(...args),
    getCostCenterByCode: (...args: unknown[]) => mockGetCostCenterByCode(...args),
    getLaborPostingRunByPeriod: (...args: unknown[]) => mockGetLaborPostingRunByPeriod(...args),
    deleteLaborCostRecordsByPeriod: (...args: unknown[]) =>
      mockDeleteLaborCostRecordsByPeriod(...args),
    createLaborPostingRun: (...args: unknown[]) => mockCreateLaborPostingRun(...args),
    bulkInsertLaborCostRecords: (...args: unknown[]) =>
      mockBulkInsertLaborCostRecords(...args),
  },
}));

const mockListSessions = vi.fn();

vi.mock('../src/lib/punchLedger', () => ({
  listSessions: (...args: unknown[]) => mockListSessions(...args),
}));

const mockDbExecute = vi.fn();

vi.mock('../db', () => ({
  db: {
    execute: (...args: unknown[]) => mockDbExecute(...args),
  },
  pool: {},
}));

vi.mock('drizzle-orm', () => ({
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, __sql: true }),
    {
      get: (_target, prop) => {
        if (prop === 'raw') return (s: string) => ({ __sql: true, raw: s });
        return undefined;
      },
    },
  ),
}));

import { processLaborCosts } from '../src/services/laborCostingService';

// ── Local shape type for inserted cost records ────────────────────────────────

interface InsertedRecord {
  canonicalId: string;
  sourcePunchCanonicalId: string;
  dollarCost: string;
  hoursWorked: string;
  postingRunId: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const YEAR = 2026;
const MONTH = 4;

const CLOCK_IN = new Date('2026-04-15T08:00:00Z');
const CLOCK_OUT = new Date('2026-04-15T16:00:00Z'); // 8 hours

const CLOSED_SESSION = {
  id: 101,
  employeeId: 1,
  clockIn: CLOCK_IN,
  clockOut: CLOCK_OUT,
  laborClass: 'REGULAR',
  chargeCodeId: null,
  chargeCode: null,
  department: null,
  productionWorkOrderId: null,
  projectId: null,
  travelerId: null,
  source: 'KIOSK',
};

const ALLOC_ROW_RESULT = {
  rows: [
    {
      id: 201,
      punchLedgerId: 101,
      employeeId: 1,
      allocationStart: '2026-04-15T08:00:00Z',
      allocationEnd: '2026-04-15T16:00:00Z',
      chargeCodeId: null,
      department: null,
      productionWorkOrderId: null,
      projectId: null,
      travelerId: null,
      laborClass: 'REGULAR',
      status: 'CLOSED',
      sequenceOrder: 1,
    },
  ],
};

const POSTING_RUN = { id: 9, periodYear: YEAR, periodMonth: MONTH, status: 'CALCULATED' };

function setupCommonMocks() {
  mockGetLaborPostingRunByPeriod.mockResolvedValue(null);
  mockCreateLaborPostingRun.mockResolvedValue(POSTING_RUN);
  mockDeleteLaborCostRecordsByPeriod.mockResolvedValue(undefined);
  mockBulkInsertLaborCostRecords.mockResolvedValue(undefined);
  mockGetEmployee.mockResolvedValue(null);
  mockGetEstimatingDefaultsFirst.mockResolvedValue({ defaultLaborRate: '50.00' });
  mockGetChargeCodeById.mockResolvedValue(null);
  mockGetCostCenterByCode.mockResolvedValue(null);
}

/** Pull the first batch of inserted records from the bulk insert mock. */
function firstInsertedRecords(): InsertedRecord[] {
  return mockBulkInsertLaborCostRecords.mock.calls[0][0] as InsertedRecord[];
}

/** Find the first insert call that contains at least one record. */
function firstNonEmptyInsertRecords(): InsertedRecord[] | undefined {
  for (const call of mockBulkInsertLaborCostRecords.mock.calls) {
    const records = call[0] as InsertedRecord[];
    if (records.length > 0) return records;
  }
  return undefined;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Flag OFF — legacy punch_ledger path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlags.useAllocationCostingRead = false;
    setupCommonMocks();
    mockListSessions.mockResolvedValue([CLOSED_SESSION]);
    // db.execute should NOT be called (no WAD sessions, flag is off)
    mockDbExecute.mockResolvedValue({ rows: [] });
  });

  it('returns readModel LEGACY', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.readModel).toBe('LEGACY');
  });

  it('inserts a cost record using punch_ledger session (canonicalId pl-{sessionId})', async () => {
    await processLaborCosts(YEAR, MONTH);

    expect(mockBulkInsertLaborCostRecords).toHaveBeenCalledOnce();
    const records = firstInsertedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].canonicalId).toBe('pl-101');
  });

  it('computes correct cost (8h × $50 = $400)', async () => {
    await processLaborCosts(YEAR, MONTH);

    const records = firstInsertedRecords();
    expect(Number(records[0].dollarCost)).toBeCloseTo(400, 1);
    expect(Number(records[0].hoursWorked)).toBeCloseTo(8, 2);
  });

  it('does NOT call db.execute (no WAD sessions, no allocation query)', async () => {
    await processLaborCosts(YEAR, MONTH);
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  it('returns correct recordCount and totalsByType', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.recordCount).toBe(1);
    expect(result.totalsByType.OVERHEAD).toBeCloseTo(400, 1);
    expect(result.totalsByType.DIRECT).toBe(0);
    expect(result.totalsByType.G_AND_A).toBe(0);
  });

  it('does not include fallbackReason in the response', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.fallbackReason).toBeUndefined();
  });
});

describe('Flag ON — allocation path success', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlags.useAllocationCostingRead = true;
    setupCommonMocks();
    // listSessions returns the closed session (used only for fallback comparison)
    mockListSessions.mockResolvedValue([CLOSED_SESSION]);
    // db.execute returns allocation rows (one call: the allocation SELECT)
    mockDbExecute.mockResolvedValue(ALLOC_ROW_RESULT);
  });

  it('returns readModel ALLOCATION', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.readModel).toBe('ALLOCATION');
  });

  it('inserts a cost record using allocation row (canonicalId la-{allocationId})', async () => {
    await processLaborCosts(YEAR, MONTH);

    expect(mockBulkInsertLaborCostRecords).toHaveBeenCalledOnce();
    const records = firstInsertedRecords();
    expect(records).toHaveLength(1);
    expect(records[0].canonicalId).toBe('la-201');
  });

  it('sets sourcePunchCanonicalId to pl-{punchLedgerId}', async () => {
    await processLaborCosts(YEAR, MONTH);

    const records = firstInsertedRecords();
    expect(records[0].sourcePunchCanonicalId).toBe('pl-101');
  });

  it('computes correct cost from allocation segment (8h × $50 = $400)', async () => {
    await processLaborCosts(YEAR, MONTH);

    const records = firstInsertedRecords();
    expect(Number(records[0].dollarCost)).toBeCloseTo(400, 1);
    expect(Number(records[0].hoursWorked)).toBeCloseTo(8, 2);
  });

  it('returns correct recordCount and totalsByType', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.recordCount).toBe(1);
    expect(result.totalsByType.OVERHEAD).toBeCloseTo(400, 1);
  });

  it('does not include fallbackReason in the response', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.fallbackReason).toBeUndefined();
  });
});

describe('Flag ON + allocation query throws → fallback to legacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlags.useAllocationCostingRead = true;
    setupCommonMocks();
    mockListSessions.mockResolvedValue([CLOSED_SESSION]);
    // db.execute throws on first call (allocation query), not needed after that (no WAD sessions)
    mockDbExecute.mockRejectedValueOnce(new Error('DB connection timeout'));
  });

  it('returns readModel LEGACY_FALLBACK', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.readModel).toBe('LEGACY_FALLBACK');
  });

  it('includes a fallbackReason describing the error', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(typeof result.fallbackReason).toBe('string');
    expect(result.fallbackReason).toContain('DB connection timeout');
  });

  it('still inserts cost records via the legacy path (canonicalId pl-{sessionId})', async () => {
    await processLaborCosts(YEAR, MONTH);

    const records = firstNonEmptyInsertRecords();
    expect(records).toBeDefined();
    expect(records![0].canonicalId).toBe('pl-101');
  });

  it('clears partial allocation inserts before falling back (deleteLaborCostRecordsByPeriod called again)', async () => {
    await processLaborCosts(YEAR, MONTH);
    expect(mockDeleteLaborCostRecordsByPeriod).toHaveBeenCalledWith(YEAR, MONTH);
  });

  it('computes correct totals via fallback legacy path', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.recordCount).toBe(1);
    expect(result.totalsByType.OVERHEAD).toBeCloseTo(400, 1);
  });

  it('does NOT fallback for APPROVAL_BYPASS_IN_POSTING_PIPELINE (business-rule error is rethrown)', async () => {
    const approvalError = Object.assign(new Error('Labor posting blocked'), {
      code: 'APPROVAL_BYPASS_IN_POSTING_PIPELINE',
    });
    mockDbExecute.mockReset();
    mockDbExecute.mockRejectedValueOnce(approvalError);

    await expect(processLaborCosts(YEAR, MONTH)).rejects.toThrow('Labor posting blocked');
  });
});

describe('Flag ON + allocation query returns 0 rows for period with closed punches → fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlags.useAllocationCostingRead = true;
    setupCommonMocks();
    // Period has one closed session
    mockListSessions.mockResolvedValue([CLOSED_SESSION]);
    // db.execute returns empty allocation rows
    mockDbExecute.mockResolvedValue({ rows: [] });
  });

  it('returns readModel LEGACY_FALLBACK', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.readModel).toBe('LEGACY_FALLBACK');
  });

  it('includes a fallbackReason mentioning zero records', async () => {
    const result = await processLaborCosts(YEAR, MONTH);
    expect(typeof result.fallbackReason).toBe('string');
    expect(result.fallbackReason!.toLowerCase()).toContain('0 records');
  });

  it('still inserts cost records via the legacy path', async () => {
    await processLaborCosts(YEAR, MONTH);

    const records = firstNonEmptyInsertRecords();
    expect(records).toBeDefined();
    expect(records![0].canonicalId).toBe('pl-101');
  });

  it('does NOT fallback when period has NO closed punches (allocation returning 0 is fine)', async () => {
    // Reset: no closed sessions in the period
    mockListSessions.mockResolvedValue([]);

    const result = await processLaborCosts(YEAR, MONTH);
    // 0 allocations AND 0 sessions → not a fallback trigger
    expect(result.readModel).toBe('ALLOCATION');
    expect(result.recordCount).toBe(0);
  });
});
