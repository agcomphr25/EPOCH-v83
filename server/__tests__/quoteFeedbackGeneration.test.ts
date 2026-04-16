/**
 * Integration-style tests for DatabaseStorage.generateQuoteExecutionFeedback.
 *
 * The database layer is fully mocked so the tests run without a live Postgres
 * connection, but they exercise the real storage method — including data
 * loading, computation, upsert wiring, and summary string construction.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// All vi.mock factories must NOT reference module-level variables (hoisting).
// ---------------------------------------------------------------------------

// Use a Proxy so every schema table/constant access at module-init time in
// storage.ts returns a safe placeholder object without needing to enumerate
// every export in this enormous file.
// The `has` trap makes Vitest's named-export validation pass (it uses `in`).
vi.mock('../schema', () => {
  const tableStub = new Proxy(
    {},
    {
      get: (_t, prop) => (typeof prop === 'symbol' ? undefined : {}),
      has: () => true,
    }
  );
  const fixed = {
    insertWorkOrderSchema: { parse: () => ({}) },
    insertWorkOrderPartSchema: { parse: () => ({}) },
    insertWorkOrderAttachmentSchema: { parse: () => ({}) },
    insertProductionWorkOrderSchema: { parse: () => ({}) },
    insertQuoteExecutionFeedbackSchema: { parse: () => ({}) },
  };
  const schemaStub = new Proxy(fixed, {
    get(target, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop);
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop as keyof typeof fixed];
      return tableStub;
    },
    has: () => true,
  });
  return schemaStub;
});

interface SelectWhere { where: ReturnType<typeof vi.fn> }
interface SelectFrom  { from: ReturnType<typeof vi.fn> }

vi.mock('../db', () => ({
  db: {
    select: vi.fn<() => SelectFrom>(),
    insert: vi.fn<() => { values: ReturnType<typeof vi.fn> }>(),
    selectDistinct: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    })),
  },
  pool: {},
  rawSql: vi.fn(),
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — must come AFTER vi.mock calls
// ---------------------------------------------------------------------------
import { db } from '../db';
import { storage } from '../storage';
import type { QuoteExecutionFeedback } from '../schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PROJECT_ID  = '11111111-1111-1111-1111-111111111111';
const QUOTE_ID    = '22222222-2222-2222-2222-222222222222';
const WAD_ID_1    = '33333333-3333-3333-3333-333333333333';
const WAD_ID_2    = '44444444-4444-4444-4444-444444444444';
const FEEDBACK_ID = '55555555-5555-5555-5555-555555555555';

const MOCK_PROJECT = {
  id: PROJECT_ID,
  projectCode: 'PROJ-001',
  projectName: 'Test Project',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  actualShipDate: null as string | null,
  targetShipDate: null as string | null,
  status: 'OPEN',
};

const MOCK_QUOTE = { id: QUOTE_ID, quoteNumber: 'QT-100' };

const BASE_FEEDBACK: Partial<QuoteExecutionFeedback> = {
  id: FEEDBACK_ID,
  projectId: PROJECT_ID,
  quoteId: null,
  quotedLaborHours: null,
  actualLaborHours: null,
  laborHoursVariance: null,
  laborHoursVariancePct: null,
  actualDepartments: [],
  scheduleVarianceDays: null,
  isOverrun: null,
  summary: 'stub',
  keyRisks: null,
};

// ---------------------------------------------------------------------------
// Helper: set up db.select to return a sequence of responses, one per call.
// Each response is the rows array that .where() will resolve with.
// ---------------------------------------------------------------------------
function buildSelectSequence(responses: unknown[][]): void {
  let idx = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const rows = responses[idx++] ?? [];
    const where = vi.fn().mockResolvedValue(rows);
    const from  = vi.fn<() => SelectWhere>().mockReturnValue({ where });
    return { from } as unknown as SelectFrom;
  });
}

// Helper: set up the insert → values → onConflictDoUpdate → returning chain.
function buildInsertMock(returnRow: Partial<QuoteExecutionFeedback>): {
  capturedValues: () => Record<string, unknown>;
  capturedConflictArgs: () => Record<string, unknown>;
} {
  let capturedVals: Record<string, unknown> = {};
  let capturedConflict: Record<string, unknown> = {};

  const returning = vi.fn().mockResolvedValue([returnRow]);
  const onConflict = vi.fn((args: Record<string, unknown>) => {
    capturedConflict = args;
    return { returning };
  });
  const values = vi.fn((vals: Record<string, unknown>) => {
    capturedVals = vals;
    return { onConflictDoUpdate: onConflict };
  });

  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);

  return {
    capturedValues: () => capturedVals,
    capturedConflictArgs: () => capturedConflict,
  };
}

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------
let getProjectSpy: ReturnType<typeof vi.spyOn>;
let getWorkOrdersByProjectSpy: ReturnType<typeof vi.spyOn>;
let getProjectClosingByProjectIdSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();

  getProjectSpy = vi
    .spyOn(storage as never, 'getProject')
    .mockResolvedValue(MOCK_PROJECT as never);

  getWorkOrdersByProjectSpy = vi
    .spyOn(storage as never, 'getWorkOrdersByProject')
    .mockResolvedValue([] as never);

  getProjectClosingByProjectIdSpy = vi
    .spyOn(storage as never, 'getProjectClosingByProjectId')
    .mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: project-not-found guard
// ---------------------------------------------------------------------------
describe('generateQuoteExecutionFeedback — project not found', () => {
  it('throws when the project does not exist', async () => {
    getProjectSpy.mockResolvedValue(undefined as never);
    buildSelectSequence([]);
    buildInsertMock(BASE_FEEDBACK);

    await expect(
      storage.generateQuoteExecutionFeedback(PROJECT_ID)
    ).rejects.toThrow(/Project.*not found/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: no linked quote, no WADs
// ---------------------------------------------------------------------------
describe('generateQuoteExecutionFeedback — no linked quote, no WADs', () => {
  it('returns a feedback record with null labor fields', async () => {
    buildSelectSequence([[]]); // projectSteps → no quote step
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    const vals = capturedValues();
    expect(vals.quotedLaborHours).toBeNull();
    expect(vals.actualLaborHours).toBeNull();
    expect(vals.laborHoursVariance).toBeNull();
  });

  it('passes projectId as the upsert target', async () => {
    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().projectId).toBe(PROJECT_ID);
  });

  it('summary mentions no linked quote when none exists', async () => {
    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(String(capturedValues().summary)).toMatch(/no linked quote/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: labor hours summed from timeClockEntries
// ---------------------------------------------------------------------------
describe('generateQuoteExecutionFeedback — labor hours from timeClockEntries', () => {
  it('sums hours across multiple WADs and multiple entries', async () => {
    // selectSequence: [projectSteps, quotes, quoteLineItems, WAD_1 entries, WAD_2 entries]
    buildSelectSequence([
      [{ stepType: 'quote', linkedQuoteId: QUOTE_ID }], // projectSteps
      [MOCK_QUOTE],                                      // quotes
      [],                                                // quoteLineItems (no labor)
      [
        {
          clockIn: new Date('2026-02-01T08:00:00Z'),
          clockOut: new Date('2026-02-01T10:00:00Z'),
          department: 'WELD',
        },
      ],
      [
        {
          clockIn: new Date('2026-02-02T09:00:00Z'),
          clockOut: new Date('2026-02-02T12:00:00Z'),
          department: 'CNC',
        },
        // Incomplete entry — ignored
        { clockIn: new Date('2026-02-02T13:00:00Z'), clockOut: null, department: 'CNC' },
      ],
    ]);

    getWorkOrdersByProjectSpy.mockResolvedValue([
      { id: WAD_ID_1 },
      { id: WAD_ID_2 },
    ] as never);

    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);
    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().actualLaborHours).toBe(5); // 2 + 3 hours
  });

  it('ignores entries with null clockOut when computing hours', async () => {
    buildSelectSequence([
      [],
      [{ clockIn: new Date('2026-02-01T08:00:00Z'), clockOut: null, department: 'WELD' }],
    ]);
    getWorkOrdersByProjectSpy.mockResolvedValue([{ id: WAD_ID_1 }] as never);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().actualLaborHours).toBe(0);
  });

  it('sets actualLaborHours to null when there are no WADs', async () => {
    buildSelectSequence([[]]);
    getWorkOrdersByProjectSpy.mockResolvedValue([] as never);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().actualLaborHours).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: unique departments
// ---------------------------------------------------------------------------
describe('generateQuoteExecutionFeedback — unique departments', () => {
  it('derives sorted unique department list from all clock entries', async () => {
    buildSelectSequence([
      [],
      [
        { clockIn: new Date('2026-02-01T08:00:00Z'), clockOut: new Date('2026-02-01T10:00:00Z'), department: 'WELD' },
        { clockIn: new Date('2026-02-01T11:00:00Z'), clockOut: new Date('2026-02-01T12:00:00Z'), department: 'CNC' },
        { clockIn: new Date('2026-02-02T08:00:00Z'), clockOut: new Date('2026-02-02T09:00:00Z'), department: 'WELD' },
      ],
    ]);
    getWorkOrdersByProjectSpy.mockResolvedValue([{ id: WAD_ID_1 }] as never);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().actualDepartments).toEqual(['CNC', 'WELD']);
  });

  it('includes department names in the summary string', async () => {
    buildSelectSequence([
      [],
      [
        { clockIn: new Date('2026-02-01T08:00:00Z'), clockOut: new Date('2026-02-01T10:00:00Z'), department: 'PAINT' },
      ],
    ]);
    getWorkOrdersByProjectSpy.mockResolvedValue([{ id: WAD_ID_1 }] as never);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(String(capturedValues().summary)).toMatch(/PAINT/);
  });
});

// ---------------------------------------------------------------------------
// Tests: schedule variance
// ---------------------------------------------------------------------------
describe('generateQuoteExecutionFeedback — schedule variance', () => {
  it('computes schedule variance from actualShipDate vs targetShipDate', async () => {
    getProjectSpy.mockResolvedValue({
      ...MOCK_PROJECT,
      targetShipDate: '2026-04-01',
      actualShipDate: '2026-04-11', // 10 days late
    } as never);

    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().scheduleVarianceDays).toBe(10);
  });

  it('sets scheduleVarianceDays to null when no date information is available', async () => {
    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().scheduleVarianceDays).toBeNull();
  });

  it('uses actualShipDate over createdAt for lead time (priority 1)', async () => {
    getProjectSpy.mockResolvedValue({
      ...MOCK_PROJECT,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      actualShipDate: '2026-01-31', // 30 days after project creation
    } as never);

    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().actualLeadTimeDays).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Tests: quoted labor from line items
// ---------------------------------------------------------------------------
describe('generateQuoteExecutionFeedback — quoted labor from line items', () => {
  it('extracts quoted hours from labor keyword line items', async () => {
    buildSelectSequence([
      [{ stepType: 'quote', linkedQuoteId: QUOTE_ID }],
      [MOCK_QUOTE],
      [
        { description: 'Direct Labor', quantity: 8 },
        { description: 'Raw material', quantity: 100 },
      ],
    ]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().quotedLaborHours).toBe(8);
  });

  it('leaves quotedLaborHours null when no labor keywords match', async () => {
    buildSelectSequence([
      [{ stepType: 'quote', linkedQuoteId: QUOTE_ID }],
      [MOCK_QUOTE],
      [{ description: 'Shipping', quantity: 1 }],
    ]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().quotedLaborHours).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: upsert / id stability
// ---------------------------------------------------------------------------
describe('generateQuoteExecutionFeedback — upsert / id stability', () => {
  it('calls db.insert with the correct projectId on first generation', async () => {
    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(db.insert).toHaveBeenCalledOnce();
    expect(capturedValues().projectId).toBe(PROJECT_ID);
  });

  it('returns the same record id on a second call (upsert stable id)', async () => {
    // First generation
    buildSelectSequence([[]]);
    buildInsertMock({ ...BASE_FEEDBACK, id: FEEDBACK_ID });
    const first = await storage.generateQuoteExecutionFeedback(PROJECT_ID);
    expect(first.id).toBe(FEEDBACK_ID);

    // Second generation — DB still returns same row (upserted)
    buildSelectSequence([[]]);
    buildInsertMock({ ...BASE_FEEDBACK, id: FEEDBACK_ID, summary: 'regenerated' });
    const second = await storage.generateQuoteExecutionFeedback(PROJECT_ID);
    expect(second.id).toBe(FEEDBACK_ID);
    expect(first.id).toBe(second.id);
  });

  it('includes onConflictDoUpdate with target and set payload', async () => {
    buildSelectSequence([[]]);
    const { capturedConflictArgs } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    const conflict = capturedConflictArgs();
    expect(conflict).toHaveProperty('target');
    expect(conflict).toHaveProperty('set');

    const set = conflict.set as Record<string, unknown>;
    // These fields must be in the set payload so regeneration updates all computed values
    expect(set).toHaveProperty('generatedAt');
    expect(set).toHaveProperty('summary');
    expect(set).toHaveProperty('updatedAt');
    expect(set).toHaveProperty('actualLaborHours');
    expect(set).toHaveProperty('actualDepartments');
    expect(set).toHaveProperty('scheduleVarianceDays');
    expect(set).toHaveProperty('isOverrun');
  });
});

// ---------------------------------------------------------------------------
// Tests: null-field handling
// ---------------------------------------------------------------------------
describe('generateQuoteExecutionFeedback — null-field handling', () => {
  it('handles a project with null createdAt (no lead time computable)', async () => {
    getProjectSpy.mockResolvedValue({ ...MOCK_PROJECT, createdAt: null } as never);
    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().actualLeadTimeDays).toBeNull();
  });

  it('sets isOverrun to null when no variance is computable', async () => {
    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().isOverrun).toBeNull();
  });

  it('persists keyRisks from project closing whatWentWrong field', async () => {
    getProjectClosingByProjectIdSpy.mockResolvedValue({
      id: 1,
      whatWentWrong: 'Supplier delay\nTool breakage',
      strengths: null,
      opportunities: null,
      nextProjectRecommendations: null,
      approvedAt: null,
    } as never);

    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().keyRisks).toEqual(['Supplier delay', 'Tool breakage']);
  });

  it('sets keyRisks to null when closing has no whatWentWrong', async () => {
    getProjectClosingByProjectIdSpy.mockResolvedValue({
      id: 1,
      whatWentWrong: null,
      approvedAt: null,
    } as never);

    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    expect(capturedValues().keyRisks).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: schema coupling — fail fast if column mappings drift
// ---------------------------------------------------------------------------
describe('generateQuoteExecutionFeedback — schema coupling', () => {
  it('persists all expected columns to the database', async () => {
    buildSelectSequence([[]]);
    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);

    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    const vals = capturedValues();
    const required = [
      'quoteId',
      'projectId',
      'projectClosingId',
      'generatedAt',
      'quotedLaborHours',
      'actualLaborHours',
      'laborHoursVariance',
      'laborHoursVariancePct',
      'quotedDepartments',
      'actualDepartments',
      'quotedLeadTimeDays',
      'actualLeadTimeDays',
      'scheduleVarianceDays',
      'isOverrun',
      'summary',
      'keyRisks',
      'keyStrengths',
      'keyOpportunities',
      'recommendedQuotingNotes',
    ];
    for (const col of required) {
      expect(vals, `Column "${col}" is missing from the insert payload`).toHaveProperty(col);
    }
  });

  it('correctly wires computed values to the right columns', async () => {
    getProjectSpy.mockResolvedValue({
      ...MOCK_PROJECT,
      targetShipDate: '2026-04-01',
      actualShipDate: '2026-04-06', // 5 days late
    } as never);

    getWorkOrdersByProjectSpy.mockResolvedValue([{ id: WAD_ID_1 }] as never);

    buildSelectSequence([
      [{ stepType: 'quote', linkedQuoteId: QUOTE_ID }],
      [MOCK_QUOTE],
      [{ description: 'Assembly labor', quantity: 20 }],
      [
        {
          clockIn: new Date('2026-03-01T08:00:00Z'),
          clockOut: new Date('2026-03-01T10:00:00Z'),
          department: 'ASSEMBLY',
        },
      ],
    ]);

    const { capturedValues } = buildInsertMock(BASE_FEEDBACK);
    await storage.generateQuoteExecutionFeedback(PROJECT_ID);

    const vals = capturedValues();
    expect(vals.quotedLaborHours).toBe(20);
    expect(vals.actualLaborHours).toBe(2);
    expect(vals.laborHoursVariance).toBe(-18);        // 2 − 20
    expect(vals.laborHoursVariancePct).toBe(-90);     // −18/20 × 100
    expect(vals.actualDepartments).toEqual(['ASSEMBLY']);
    expect(vals.scheduleVarianceDays).toBe(5);        // targetShipDate → actualShipDate
    expect(vals.isOverrun).toBe(true);                // schedule overrun
    expect(String(vals.summary)).toMatch(/Quoted labor: 20\.00 hours/i);
  });
});
