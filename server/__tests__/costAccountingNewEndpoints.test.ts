/**
 * Route-level tests for the two new cost-accounting endpoints added in Phase 7:
 *   GET /api/cost-accounting/labor-source-summary
 *   GET /api/cost-accounting/salaried-allocation-audit
 *
 * Each test mounts a minimal express app with the real router (auth bypassed),
 * stubs db.execute, and verifies response shape + aggregated values.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Module-level mocks (must appear before imports) ────────────────────────

vi.mock('drizzle-orm', () => ({
  eq:  vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  sql: Object.assign(
    vi.fn((_strings: TemplateStringsArray) => ({ __isSql: true })),
    { raw: vi.fn(() => ({})) },
  ),
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn(
    (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  ),
  requireRole: vi.fn(
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  ),
}));

vi.mock('../middleware/routeAuthorization', () => ({
  requireAdminAccess: vi.fn(
    (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  ),
}));

vi.mock('../schema', () => ({
  insertAccountCategorySchema: { parse: vi.fn() },
  insertAccountSchema:         { parse: vi.fn() },
  insertMonthlyAccountEntrySchema: { parse: vi.fn() },
  insertAllocationRuleSchema:  { parse: vi.fn() },
  insertAllocationResultSchema:{ parse: vi.fn() },
  journalEntries:              { id: {}, status: {}, exportedAt: {} },
  auditEvents:                 {},
}));

vi.mock('../db', () => ({
  db: {
    select:  vi.fn(),
    insert:  vi.fn(),
    update:  vi.fn(),
    delete:  vi.fn(),
    execute: vi.fn(),
  },
  pool: {},
}));

vi.mock('../storage', () => ({
  storage: { getChargeCodeById: vi.fn() },
}));

vi.mock('../src/services/laborCostingService', () => ({
  processLaborCosts: vi.fn(),
}));

vi.mock('../src/services/laborPostingService', () => ({
  postLaborToGL:    vi.fn(),
  voidLaborPosting: vi.fn(),
}));

vi.mock('../src/services/laborReconcileService', () => ({
  reconcileLaborCosts: vi.fn(),
}));

vi.mock('../src/services/timekeeping/laborEntryDraftPostingService', () => ({
  reconcileSalariedDrafts: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { db }               from '../db';
import costAccountingRouter from '../src/routes/costAccounting';

// ── Test app ───────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cost-accounting', costAccountingRouter);
  return app;
}

const mockDbExecute = db.execute as unknown as Mock;

// ══════════════════════════════════════════════════════════════════════════
// GET /api/cost-accounting/labor-source-summary
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/cost-accounting/labor-source-summary', () => {
  const SEEDED_ROWS = [
    { source: 'CONVERSATIONAL_ENTRY', allocationCount: 3,  totalHours: '24.0', totalEstimatedCost: '1200.00' },
    { source: 'LIVE',                 allocationCount: 40, totalHours: '160.0', totalEstimatedCost: '8000.00' },
    { source: 'SALARIED_ENTRY',       allocationCount: 5,  totalHours: '40.0', totalEstimatedCost: '2000.00' },
  ];

  beforeEach(() => {
    mockDbExecute.mockReset();
    mockDbExecute.mockResolvedValueOnce({ rows: SEEDED_ROWS });
  });

  it('returns 200 with correct envelope fields', async () => {
    const res = await request(buildApp())
      .get('/api/cost-accounting/labor-source-summary?year=2026&month=4');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('year', 2026);
    expect(res.body).toHaveProperty('month', 4);
    expect(res.body).toHaveProperty('bySource');
  });

  it('returns one row per source from the DB result', async () => {
    const res = await request(buildApp())
      .get('/api/cost-accounting/labor-source-summary?year=2026&month=4');

    expect(res.body.bySource).toHaveLength(3);
  });

  it('preserves source labels in the response', async () => {
    const res = await request(buildApp())
      .get('/api/cost-accounting/labor-source-summary?year=2026&month=4');

    const sources = res.body.bySource.map((r: { source: string }) => r.source);
    expect(sources).toContain('SALARIED_ENTRY');
    expect(sources).toContain('CONVERSATIONAL_ENTRY');
    expect(sources).toContain('LIVE');
  });

  it('SALARIED_ENTRY row carries correct allocationCount and totalHours', async () => {
    const res = await request(buildApp())
      .get('/api/cost-accounting/labor-source-summary?year=2026&month=4');

    const salariedRow = res.body.bySource.find(
      (r: { source: string }) => r.source === 'SALARIED_ENTRY',
    );
    expect(salariedRow.allocationCount).toBe(5);
    expect(Number(salariedRow.totalHours)).toBeCloseTo(40.0, 1);
    expect(Number(salariedRow.totalEstimatedCost)).toBeCloseTo(2000.0, 1);
  });

  it('returns 400 when year is missing', async () => {
    mockDbExecute.mockReset();
    const res = await request(buildApp())
      .get('/api/cost-accounting/labor-source-summary?month=4');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when month is out of range', async () => {
    mockDbExecute.mockReset();
    const res = await request(buildApp())
      .get('/api/cost-accounting/labor-source-summary?year=2026&month=13');

    expect(res.status).toBe(400);
  });

  it('calls db.execute exactly once per request', async () => {
    await request(buildApp())
      .get('/api/cost-accounting/labor-source-summary?year=2026&month=4');

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/cost-accounting/salaried-allocation-audit
// ══════════════════════════════════════════════════════════════════════════

describe('GET /api/cost-accounting/salaried-allocation-audit', () => {
  const SEEDED_AUDIT_ROWS = [
    {
      allocationId:    10,
      source:          'SALARIED_ENTRY',
      employeeId:      1,
      employeeName:    'Alice Smith',
      allocationStart: '2026-04-07T08:00:00Z',
      allocationEnd:   '2026-04-07T17:00:00Z',
      allocationStatus:'CLOSED',
      chargeCodeId:    20,
      chargeCodeCode:  'WO-999',
      chargeCodeType:  'WORK_ORDER',
      punchLedgerId:   501,
      draftId:         100,
      draftStatus:     'POSTED',
      draftPostedAt:   '2026-04-30T12:00:00Z',
      laborCostRecordId: 77,
      journalEntryId:  null,
      glStatus:        null,
      glExportedAt:    null,
    },
    {
      allocationId:    11,
      source:          'CONVERSATIONAL_ENTRY',
      employeeId:      2,
      employeeName:    'Bob Jones',
      allocationStart: '2026-04-08T09:00:00Z',
      allocationEnd:   '2026-04-08T13:00:00Z',
      allocationStatus:'CLOSED',
      chargeCodeId:    21,
      chargeCodeCode:  'WO-1000',
      chargeCodeType:  'WORK_ORDER',
      punchLedgerId:   502,
      draftId:         101,
      draftStatus:     'POSTED',
      draftPostedAt:   '2026-04-30T12:05:00Z',
      laborCostRecordId: 78,
      journalEntryId:  55,
      glStatus:        'POSTED',
      glExportedAt:    '2026-05-01T08:00:00Z',
    },
  ];

  beforeEach(() => {
    mockDbExecute.mockReset();
    mockDbExecute.mockResolvedValueOnce({ rows: SEEDED_AUDIT_ROWS });
  });

  it('returns 200 with envelope fields year, month, rowCount, and rows', async () => {
    const res = await request(buildApp())
      .get('/api/cost-accounting/salaried-allocation-audit?year=2026&month=4');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('year', 2026);
    expect(res.body).toHaveProperty('month', 4);
    expect(res.body).toHaveProperty('rowCount', 2);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows).toHaveLength(2);
  });

  it('includes both SALARIED_ENTRY and CONVERSATIONAL_ENTRY rows', async () => {
    const res = await request(buildApp())
      .get('/api/cost-accounting/salaried-allocation-audit?year=2026&month=4');

    const sources = res.body.rows.map((r: { source: string }) => r.source);
    expect(sources).toContain('SALARIED_ENTRY');
    expect(sources).toContain('CONVERSATIONAL_ENTRY');
  });

  it('row fields include employeeName, chargeCodeCode, draftStatus, and glStatus', async () => {
    const res = await request(buildApp())
      .get('/api/cost-accounting/salaried-allocation-audit?year=2026&month=4');

    const row = res.body.rows[0];
    expect(row).toHaveProperty('employeeName', 'Alice Smith');
    expect(row).toHaveProperty('chargeCodeCode', 'WO-999');
    expect(row).toHaveProperty('draftStatus', 'POSTED');
    expect(row).toHaveProperty('glStatus', null);
  });

  it('GL-posted row carries journalEntryId and glExportedAt', async () => {
    const res = await request(buildApp())
      .get('/api/cost-accounting/salaried-allocation-audit?year=2026&month=4');

    const glRow = res.body.rows.find((r: { journalEntryId: number | null }) => r.journalEntryId !== null);
    expect(glRow).toBeDefined();
    expect(glRow.journalEntryId).toBe(55);
    expect(glRow.glStatus).toBe('POSTED');
    expect(glRow.glExportedAt).toBeTruthy();
  });

  it('returns 400 when month is missing', async () => {
    mockDbExecute.mockReset();
    const res = await request(buildApp())
      .get('/api/cost-accounting/salaried-allocation-audit?year=2026');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for an invalid year (pre-2000)', async () => {
    mockDbExecute.mockReset();
    const res = await request(buildApp())
      .get('/api/cost-accounting/salaried-allocation-audit?year=1999&month=4');

    expect(res.status).toBe(400);
  });

  it('calls db.execute exactly once per request', async () => {
    await request(buildApp())
      .get('/api/cost-accounting/salaried-allocation-audit?year=2026&month=4');

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  it('returns rowCount=0 and empty rows array when no allocations exist for the period', async () => {
    mockDbExecute.mockReset();
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp())
      .get('/api/cost-accounting/salaried-allocation-audit?year=2026&month=4');

    expect(res.status).toBe(200);
    expect(res.body.rowCount).toBe(0);
    expect(res.body.rows).toHaveLength(0);
  });
});
