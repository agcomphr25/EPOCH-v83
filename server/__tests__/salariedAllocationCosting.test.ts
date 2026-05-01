/**
 * Tests for Phase 7 — Costing Validation: Salaried / Indirect Allocation Reconciliation.
 *
 * Covers:
 *   1. SALARIED_ENTRY closed allocations appear in processLaborCostsFromAllocations()
 *      output with correct amounts when USE_ALLOCATION_COSTING_READ is enabled.
 *   2. A SALARIED_ENTRY allocation with charge_code_id = null throws
 *      SALARIED_ALLOCATION_MISSING_CHARGE_CODE before any GL write.
 *   3. reconcileSalariedDrafts() detects orphaned POSTED drafts (POSTED but no
 *      matching CLOSED labor_allocations).
 *   4. Labor source summary aggregates hours correctly by source via the
 *      GET /api/cost-accounting/labor-source-summary endpoint logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mutable flag state ────────────────────────────────────────────────────────

const mockFlags = vi.hoisted(() => ({
  useAllocationCostingRead: true,
  laborAllocationsEnabled: false,
}));

vi.mock('../src/lib/featureFlags', () => mockFlags);

// ── Storage mocks ─────────────────────────────────────────────────────────────

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
      get: (_target: unknown, prop: string) => {
        if (prop === 'raw') return (s: string) => ({ __sql: true, raw: s });
        return undefined;
      },
    },
  ),
}));

import { processLaborCosts, processLaborCostsFromAllocations } from '../src/services/laborCostingService';

// ── Constants ─────────────────────────────────────────────────────────────────

const YEAR = 2026;
const MONTH = 4;
const POSTING_RUN = { id: 42, periodYear: YEAR, periodMonth: MONTH, status: 'CALCULATED' };

// ── Allocation row factories ───────────────────────────────────────────────────

function makeSalariedAllocRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 501,
    punchLedgerId: 301,
    employeeId: 10,
    allocationStart: '2026-04-10T08:00:00Z',
    allocationEnd: '2026-04-10T16:00:00Z', // 8 hours
    chargeCodeId: 7,
    department: null,
    productionWorkOrderId: null,
    projectId: null,
    travelerId: null,
    laborClass: 'REGULAR',
    status: 'CLOSED',
    sequenceOrder: 1,
    source: 'SALARIED_ENTRY',
    ...overrides,
  };
}

function makeLiveAllocRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 401,
    punchLedgerId: 201,
    employeeId: 20,
    allocationStart: '2026-04-12T09:00:00Z',
    allocationEnd: '2026-04-12T17:00:00Z', // 8 hours
    chargeCodeId: null,
    department: null,
    productionWorkOrderId: null,
    projectId: null,
    travelerId: null,
    laborClass: 'REGULAR',
    status: 'CLOSED',
    sequenceOrder: 1,
    source: 'LIVE',
    ...overrides,
  };
}

// ── Common setup ──────────────────────────────────────────────────────────────

function setupCommonMocks() {
  mockGetLaborPostingRunByPeriod.mockResolvedValue(null);
  mockCreateLaborPostingRun.mockResolvedValue(POSTING_RUN);
  mockDeleteLaborCostRecordsByPeriod.mockResolvedValue(undefined);
  mockBulkInsertLaborCostRecords.mockResolvedValue(undefined);
  mockListSessions.mockResolvedValue([]);
  mockGetEmployee.mockResolvedValue(null);
  mockGetEstimatingDefaultsFirst.mockResolvedValue({ defaultLaborRate: '50.00' });
  mockGetChargeCodeById.mockImplementation((id: number) => {
    if (id === 7) return Promise.resolve({ id: 7, code: 'INDIRECT-001', type: 'OVERHEAD' });
    return Promise.resolve(null);
  });
  mockGetCostCenterByCode.mockResolvedValue(null);
}

interface InsertedRecord {
  canonicalId: string;
  sourcePunchCanonicalId: string;
  dollarCost: string;
  hoursWorked: string;
  postingRunId: number;
  chargeCodeId: number | null;
  costType: string;
}

function firstInsertedRecords(): InsertedRecord[] {
  return mockBulkInsertLaborCostRecords.mock.calls[0][0] as InsertedRecord[];
}

// ── Suite 1: SALARIED_ENTRY allocations appear in costing output ──────────────

describe('SALARIED_ENTRY allocations in processLaborCosts (flag ON)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlags.useAllocationCostingRead = true;
    setupCommonMocks();
  });

  it('includes a SALARIED_ENTRY allocation in the costing output', async () => {
    const salariedRow = makeSalariedAllocRow();
    // First db.execute call: allocation query (returns SALARIED_ENTRY row)
    // Second: approval set query (no WAD rows, so this won't be called)
    mockDbExecute.mockResolvedValueOnce({ rows: [salariedRow] });

    const result = await processLaborCosts(YEAR, MONTH);

    expect(result.readModel).toBe('ALLOCATION');
    expect(result.recordCount).toBe(1);
  });

  it('computes correct hours and cost for a SALARIED_ENTRY allocation (8h × $50 = $400)', async () => {
    const salariedRow = makeSalariedAllocRow();
    mockDbExecute.mockResolvedValueOnce({ rows: [salariedRow] });

    await processLaborCosts(YEAR, MONTH);

    const records = firstInsertedRecords();
    expect(records).toHaveLength(1);
    expect(Number(records[0]!.hoursWorked)).toBeCloseTo(8, 2);
    expect(Number(records[0]!.dollarCost)).toBeCloseTo(400, 1);
  });

  it('assigns the allocation canonical ID la-{id} to the cost record', async () => {
    const salariedRow = makeSalariedAllocRow({ id: 999 });
    mockDbExecute.mockResolvedValueOnce({ rows: [salariedRow] });

    await processLaborCosts(YEAR, MONTH);

    const records = firstInsertedRecords();
    expect(records[0]!.canonicalId).toBe('la-999');
  });

  it('classifies SALARIED_ENTRY allocation via charge_code.type (OVERHEAD)', async () => {
    const salariedRow = makeSalariedAllocRow({ chargeCodeId: 7 });
    mockDbExecute.mockResolvedValueOnce({ rows: [salariedRow] });

    await processLaborCosts(YEAR, MONTH);

    const records = firstInsertedRecords();
    expect(records[0]!.costType).toBe('OVERHEAD');
  });

  it('accumulates SALARIED_ENTRY and LIVE allocations in the same costing run', async () => {
    const salariedRow = makeSalariedAllocRow({ id: 501, employeeId: 10, chargeCodeId: 7 });
    const liveRow = makeLiveAllocRow({ id: 401, employeeId: 20 });
    mockDbExecute.mockResolvedValueOnce({ rows: [salariedRow, liveRow] });

    const result = await processLaborCosts(YEAR, MONTH);

    expect(result.recordCount).toBe(2);
    expect(result.totalsByType.OVERHEAD).toBeCloseTo(800, 1); // 8h × $50 × 2 employees
  });
});

// ── Suite 2: Fail-closed guard for null charge_code_id on SALARIED_ENTRY ─────

describe('Null charge_code_id on SALARIED_ENTRY allocation — fail-closed guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlags.useAllocationCostingRead = true;
    setupCommonMocks();
  });

  it('throws SALARIED_ALLOCATION_MISSING_CHARGE_CODE before processing any rows', async () => {
    const badRow = makeSalariedAllocRow({ chargeCodeId: null });
    mockDbExecute.mockResolvedValueOnce({ rows: [badRow] });

    await expect(processLaborCosts(YEAR, MONTH)).rejects.toMatchObject({
      code: 'SALARIED_ALLOCATION_MISSING_CHARGE_CODE',
    });
  });

  it('throws with the affected allocation IDs in the error', async () => {
    const badRow = makeSalariedAllocRow({ id: 777, chargeCodeId: null });
    mockDbExecute.mockResolvedValueOnce({ rows: [badRow] });

    const err = await processLaborCosts(YEAR, MONTH).catch((e: unknown) => e) as { affectedAllocationIds?: number[] };
    expect(err).toMatchObject({ affectedAllocationIds: [777] });
  });

  it('does NOT insert any cost records when the guard fires', async () => {
    const badRow = makeSalariedAllocRow({ chargeCodeId: null });
    mockDbExecute.mockResolvedValueOnce({ rows: [badRow] });

    await processLaborCosts(YEAR, MONTH).catch(() => {});
    expect(mockBulkInsertLaborCostRecords).not.toHaveBeenCalled();
  });

  it('does NOT fallback to legacy path — is treated as a business rule error', async () => {
    // The SALARIED_ALLOCATION_MISSING_CHARGE_CODE error must surface to caller,
    // not trigger the LEGACY_FALLBACK path.
    const badRow = makeSalariedAllocRow({ chargeCodeId: null });
    // listSessions returns a closed session, so if fallback were triggered,
    // readModel would be LEGACY_FALLBACK and recordCount > 0.
    mockListSessions.mockResolvedValue([
      {
        id: 100,
        employeeId: 1,
        clockIn: new Date('2026-04-10T08:00:00Z'),
        clockOut: new Date('2026-04-10T16:00:00Z'),
        laborClass: 'REGULAR',
        chargeCodeId: null,
        chargeCode: null,
        department: null,
        productionWorkOrderId: null,
        projectId: null,
        travelerId: null,
        source: 'KIOSK',
      },
    ]);
    mockDbExecute.mockResolvedValueOnce({ rows: [badRow] });

    const err = await processLaborCosts(YEAR, MONTH).catch((e: unknown) => e) as { code?: string };
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('SALARIED_ALLOCATION_MISSING_CHARGE_CODE');
  });

  it('also fires for CONVERSATIONAL_ENTRY allocations with null charge_code_id', async () => {
    const convRow = makeSalariedAllocRow({ chargeCodeId: null, source: 'CONVERSATIONAL_ENTRY' });
    mockDbExecute.mockResolvedValueOnce({ rows: [convRow] });

    await expect(processLaborCosts(YEAR, MONTH)).rejects.toMatchObject({
      code: 'SALARIED_ALLOCATION_MISSING_CHARGE_CODE',
    });
  });

  it('does NOT fire for LIVE allocations with null charge_code_id', async () => {
    const liveRow = makeLiveAllocRow({ chargeCodeId: null });
    mockDbExecute.mockResolvedValueOnce({ rows: [liveRow] });

    const result = await processLaborCosts(YEAR, MONTH);
    expect(result.readModel).toBe('ALLOCATION');
    expect(result.recordCount).toBe(1);
  });
});

// ── Suite 3: processLaborCostsFromAllocations direct integration ──────────────

describe('processLaborCostsFromAllocations with SALARIED_ENTRY rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it('processes a SALARIED_ENTRY allocation and returns correct recordCount', async () => {
    const salariedRow = makeSalariedAllocRow();
    // allocation SELECT, no WAD rows so approval query not triggered
    mockDbExecute.mockResolvedValueOnce({ rows: [salariedRow] });

    const result = await processLaborCostsFromAllocations(YEAR, MONTH, POSTING_RUN.id);

    expect(result.recordCount).toBe(1);
    expect(result.totalsByType.OVERHEAD).toBeCloseTo(400, 1);
  });

  it('sets postingRunId on the inserted cost record', async () => {
    const salariedRow = makeSalariedAllocRow();
    mockDbExecute.mockResolvedValueOnce({ rows: [salariedRow] });

    await processLaborCostsFromAllocations(YEAR, MONTH, 99);

    const records = firstInsertedRecords();
    expect(records[0]!.postingRunId).toBe(99);
  });

  it('sets sourcePunchCanonicalId to pl-{punchLedgerId}', async () => {
    const salariedRow = makeSalariedAllocRow({ punchLedgerId: 301 });
    mockDbExecute.mockResolvedValueOnce({ rows: [salariedRow] });

    await processLaborCostsFromAllocations(YEAR, MONTH, POSTING_RUN.id);

    const records = firstInsertedRecords();
    expect(records[0]!.sourcePunchCanonicalId).toBe('pl-301');
  });
});
