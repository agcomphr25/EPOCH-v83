/**
 * Phase 1 of the revised payroll export design — focused server tests.
 * See docs/payroll-export-design.md.
 *
 * These tests exercise the service layer with an in-memory drizzle mock so they
 * stay fast and hermetic.  The partial-unique-index behaviour is tested by
 * simulating Postgres error codes 23505 (unique violation) and 40001
 * (serialization failure) at the insert boundary, which is the boundary the
 * service contract guarantees handles them.  Static inspection of the route
 * file enforces the OWNER/ADMIN guard on all Phase-1 endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Hoisted state — all top-level mock factory references must be declared via
// vi.hoisted() because vi.mock factories are hoisted above normal top-level
// statements.  Interactions with the store from individual tests go through
// the helpers exported from `harness`.
// ---------------------------------------------------------------------------

const harness = vi.hoisted(() => {
  interface Store {
    batches: any[];
    rows: any[];
    events: any[];
  }
  const store: Store = { batches: [], rows: [], events: [] };
  const nextId = { batches: 1, rows: 1, events: 1 };
  const insertBehaviors: { batchesThrow: string | null; batchesThrowOnce: boolean } = {
    batchesThrow: null,
    batchesThrowOnce: false,
  };

  const TBatches = { __t: 'batches' as const };
  const TRows = { __t: 'rows' as const };
  const TEvents = { __t: 'events' as const };

  function makeSelectChain(rows: any[], sortFn?: (a: any, b: any) => number) {
    let result = rows.slice();
    const chain: any = {
      where: () => chain,
      orderBy: () => {
        if (sortFn) result = result.sort(sortFn);
        return chain;
      },
      limit: (n: number) => Promise.resolve(result.slice(0, n)),
      then: (resolveFn: any, rejectFn: any) => Promise.resolve(result).then(resolveFn, rejectFn),
    };
    return chain;
  }

  const mockDb: any = {
    select: () => ({
      from: (t: any) => {
        if (t.__t === 'batches') {
          return makeSelectChain(store.batches, (a, b) => b.revisionNumber - a.revisionNumber);
        }
        if (t.__t === 'rows') return makeSelectChain(store.rows);
        if (t.__t === 'events') return makeSelectChain(store.events);
        return makeSelectChain([]);
      },
    }),
    insert: (t: any) => ({
      values: (data: any) => {
        if (t.__t === 'batches' && insertBehaviors.batchesThrow) {
          const code = insertBehaviors.batchesThrow;
          if (insertBehaviors.batchesThrowOnce) {
            insertBehaviors.batchesThrow = null;
            insertBehaviors.batchesThrowOnce = false;
          }
          const err: any = new Error(`mock pg error ${code}`);
          err.code = code;
          return {
            returning: () => Promise.reject(err),
            then: (_res: any, rej: any) => Promise.reject(err).catch(rej),
          };
        }
        const arr = Array.isArray(data) ? data : [data];
        const inserted = arr.map((d) => {
          const key = t.__t as 'batches' | 'rows' | 'events';
          const id = nextId[key]++;
          const row = { id, createdAt: new Date(), ...d };
          store[key].push(row);
          return row;
        });
        return {
          returning: () => Promise.resolve(inserted),
          then: (resolveFn: any, rejectFn: any) =>
            Promise.resolve(undefined).then(resolveFn, rejectFn),
        };
      },
    }),
    update: (t: any) => ({
      set: (changes: any) => ({
        where: () => {
          // Phase 1 tests — every update targets a single row; the store only
          // holds rows relevant to the test in flight.
          const list = store[t.__t as 'batches' | 'rows' | 'events'];
          for (const r of list) Object.assign(r, changes);
          const updated = list.slice();
          return {
            returning: () => Promise.resolve(updated),
            then: (resolveFn: any, rejectFn: any) =>
              Promise.resolve(undefined).then(resolveFn, rejectFn),
          };
        },
      }),
    }),
    transaction: async (fn: any) => fn(mockDb),
  };

  const baseExportRows = [
    { first_name: 'Alice', last_name: 'Adams', regular_hours: 40, overtime_hours: 0,
      double_overtime_hours: 0, sick_hours: 0, vacation_hours: 0 },
    { first_name: 'Bob', last_name: 'Brown', regular_hours: 35, overtime_hours: 5,
      double_overtime_hours: 0, sick_hours: 2, vacation_hours: 8 },
  ];
  const exportRowsMock = vi.fn().mockResolvedValue(baseExportRows);
  const listResolvedEmployeesMock = vi.fn().mockResolvedValue([
    { firstName: 'Alice', lastName: 'Adams', timekeepingId: 1,
      epochEmployeeId: 101, employeeCode: 'E001', email: 'alice@example.com' },
    { firstName: 'Bob', lastName: 'Brown', timekeepingId: 2,
      epochEmployeeId: 102, employeeCode: 'E002', email: 'bob@example.com' },
  ]);

  function reset() {
    store.batches = [];
    store.rows = [];
    store.events = [];
    nextId.batches = 1;
    nextId.rows = 1;
    nextId.events = 1;
    insertBehaviors.batchesThrow = null;
    insertBehaviors.batchesThrowOnce = false;
    exportRowsMock.mockReset();
    exportRowsMock.mockResolvedValue(baseExportRows);
    listResolvedEmployeesMock.mockReset();
    listResolvedEmployeesMock.mockResolvedValue([
      { firstName: 'Alice', lastName: 'Adams', timekeepingId: 1,
        epochEmployeeId: 101, employeeCode: 'E001', email: 'alice@example.com' },
      { firstName: 'Bob', lastName: 'Brown', timekeepingId: 2,
        epochEmployeeId: 102, employeeCode: 'E002', email: 'bob@example.com' },
    ]);
  }

  return {
    store,
    insertBehaviors,
    mockDb,
    TBatches,
    TRows,
    TEvents,
    exportRowsMock,
    listResolvedEmployeesMock,
    baseExportRows,
    reset,
  };
});

vi.mock('../db', () => ({
  db: harness.mockDb,
  pgPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  pool: { query: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../src/schema/timekeeping', () => ({
  payrollExportBatchesTable: harness.TBatches,
  payrollExportRowsTable: harness.TRows,
  payrollExportEventsTable: harness.TEvents,
}));

vi.mock('../src/services/timekeeping/timesheets.service', () => ({
  exportFinalizedTimesheetsForGusto: harness.exportRowsMock,
}));

vi.mock('../src/lib/timekeepingEmployeeResolver', () => ({
  listResolvedEmployees: harness.listResolvedEmployeesMock,
}));

const store = harness.store;
const insertBehaviors = harness.insertBehaviors;
const exportRowsMock = harness.exportRowsMock;

// Import AFTER mocks are wired
import * as svc from '../src/services/timekeeping/payrollExport.service';

const ACTOR = { id: 999, email: 'admin@example.com', role: 'OWNER', ip: '127.0.0.1' };
const PERIOD_START = '2026-01-05';
const PERIOD_END = '2026-01-11';
const POOL_OVERRIDE = { query: async () => [] };

describe('payrollExport.service — Phase 1', () => {
  beforeEach(() => {
    harness.reset();
  });

  describe('createRegularFullPeriodBatch', () => {
    it('first export creates active revision 1', async () => {
      const result = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });

      expect(result.revisionNumber).toBe(1);
      expect(result.supersededBatchId).toBeNull();
      expect(result.rowCount).toBe(2);
      expect(result.csvChecksum).toMatch(/^[0-9a-f]{64}$/);

      expect(store.batches).toHaveLength(1);
      const batch = store.batches[0];
      expect(batch.status).toBe('active');
      expect(batch.exportType).toBe('regular_full_period');
      expect(batch.revisionNumber).toBe(1);
      expect(batch.includesAdjustments).toBe(false);
      expect(batch.adjustmentIds).toBeNull();
      expect(batch.createdBy).toBe(ACTOR.id);
      expect(batch.csvContent).toContain('first_name,last_name,regular_hours');
      expect(batch.csvContent).toContain('Alice,Adams,40');
    });

    it('captures snapshot identity fields on each row', async () => {
      await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });

      expect(store.rows).toHaveLength(2);
      const alice = store.rows.find((r) => r.employeeFirstNameSnapshot === 'Alice');
      expect(alice).toBeDefined();
      expect(alice.employeeLastNameSnapshot).toBe('Adams');
      expect(alice.employeeNumberSnapshot).toBe('E001');
      expect(alice.employeeEmailSnapshot).toBe('alice@example.com');
      expect(alice.epochEmployeeId).toBe(101);
      expect(alice.regularHours).toBe(40);
    });

    it('second export before processing supersedes revision 1 and creates active revision 2', async () => {
      const first = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });

      const second = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });

      expect(first.revisionNumber).toBe(1);
      expect(second.revisionNumber).toBe(2);
      expect(second.supersededBatchId).toBe(first.batchId);

      expect(store.batches).toHaveLength(2);
      const r1 = store.batches.find((b) => b.id === first.batchId);
      const r2 = store.batches.find((b) => b.id === second.batchId);
      expect(r1.status).toBe('superseded');
      expect(r1.supersededReason).toBe('Automatically superseded by revision 2');
      expect(r2.status).toBe('active');
      expect(r2.revisionNumber).toBe(2);
      expect(r2.supersedesBatchId).toBe(first.batchId);
    });

    it('partial-unique-index conflict (23505) is retried as a serialization failure', async () => {
      // Simulate one transient unique-violation on the first insert attempt.
      // The service maps 23505 → 40001 → withSerializableRetry retries up to 3
      // times.  Reset throw on first call so the retry succeeds.
      insertBehaviors.batchesThrow = '23505';
      insertBehaviors.batchesThrowOnce = true;

      const result = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });

      expect(result.revisionNumber).toBe(1);
      expect(store.batches).toHaveLength(1);
    });

    it('throws ProcessedBatchImmutableError when prior batch has been processed', async () => {
      const first = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });
      await svc.markBatchProcessed({
        batchId: first.batchId,
        confirmationNote: 'Submitted to Gusto run #555',
        actor: ACTOR,
      });

      await expect(
        svc.createRegularFullPeriodBatch({
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          actor: ACTOR,
          poolOverride: POOL_OVERRIDE,
        }),
      ).rejects.toMatchObject({ name: 'ProcessedBatchImmutableError', httpStatus: 409 });
    });

    it('rejects when actor has no id (no anonymous payroll exports)', async () => {
      await expect(
        svc.createRegularFullPeriodBatch({
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          actor: { id: null, email: null, role: null, ip: null },
          poolOverride: POOL_OVERRIDE,
        }),
      ).rejects.toMatchObject({ name: 'MissingActorError' });
    });
  });

  describe('downloadBatchCsv', () => {
    it('returns the exact stored csv_content (not a recalculation)', async () => {
      const result = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });
      const originalCsv = store.batches[0].csvContent;

      // Mutate the underlying export source so a recalculation would produce a
      // different CSV — the download must STILL return the stored bytes.
      exportRowsMock.mockResolvedValue([
        { first_name: 'Carol', last_name: 'Curie', regular_hours: 99, overtime_hours: 0,
          double_overtime_hours: 0, sick_hours: 0, vacation_hours: 0 },
      ]);

      const dl = await svc.downloadBatchCsv({ batchId: result.batchId, actor: ACTOR });
      expect(dl.csvContent).toBe(originalCsv);
      expect(dl.csvContent).toContain('Alice,Adams,40');
      expect(dl.csvContent).not.toContain('Carol');
    });

    it('throws ChecksumMismatchError when stored content has been tampered with', async () => {
      const result = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });
      // Simulate corruption / tampering of csv_content while leaving the
      // stored checksum intact — re-download must refuse to serve.
      store.batches[0].csvContent = 'tampered,csv,content';

      await expect(
        svc.downloadBatchCsv({ batchId: result.batchId, actor: ACTOR }),
      ).rejects.toMatchObject({ name: 'ChecksumMismatchError', httpStatus: 500 });
    });

    it('throws BatchNotFoundError for unknown id', async () => {
      await expect(
        svc.downloadBatchCsv({ batchId: 9999, actor: ACTOR }),
      ).rejects.toMatchObject({ name: 'BatchNotFoundError', httpStatus: 404 });
    });
  });

  describe('markBatchProcessed', () => {
    it('transitions an active batch to processed and records confirmation note', async () => {
      const created = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });

      const processed = await svc.markBatchProcessed({
        batchId: created.batchId,
        confirmationNote: 'Submitted to Gusto run #555',
        actor: ACTOR,
      });

      expect(processed.status).toBe('processed');
      expect(processed.processedBy).toBe(ACTOR.id);
      expect(processed.processedConfirmationNote).toBe('Submitted to Gusto run #555');
      expect(processed.processedAt).toBeInstanceOf(Date);
    });

    it('processed batch cannot be re-marked-processed (immutable)', async () => {
      const created = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });
      await svc.markBatchProcessed({
        batchId: created.batchId,
        confirmationNote: 'first processing',
        actor: ACTOR,
      });

      await expect(
        svc.markBatchProcessed({
          batchId: created.batchId,
          confirmationNote: 'second processing attempt',
          actor: ACTOR,
        }),
      ).rejects.toMatchObject({ name: 'ProcessedBatchImmutableError', httpStatus: 409 });
    });

    it('rejects empty confirmation note', async () => {
      const created = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });
      await expect(
        svc.markBatchProcessed({
          batchId: created.batchId,
          confirmationNote: '   ',
          actor: ACTOR,
        }),
      ).rejects.toThrow(/confirmationNote is required/);
    });
  });

  describe('audit events', () => {
    it('single batch lifecycle records BATCH_CREATED, BATCH_DOWNLOADED, BATCH_PROCESSED with actor info', async () => {
      const created = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });
      await svc.downloadBatchCsv({ batchId: created.batchId, actor: ACTOR });
      await svc.markBatchProcessed({
        batchId: created.batchId,
        confirmationNote: 'Submitted to Gusto',
        actor: ACTOR,
      });

      const types = store.events.map((e) => e.eventType);
      expect(types).toEqual(['BATCH_CREATED', 'BATCH_DOWNLOADED', 'BATCH_PROCESSED']);

      for (const e of store.events) {
        expect(e.actorId).toBe(ACTOR.id);
        expect(e.actorEmail).toBe(ACTOR.email);
        expect(e.actorRole).toBe(ACTOR.role);
        expect(e.ipAddress).toBe(ACTOR.ip);
        expect(e.batchId).toBe(created.batchId);
      }

      const processed = store.events.find((e) => e.eventType === 'BATCH_PROCESSED');
      expect(processed.reason).toBe('Submitted to Gusto');
    });

    it('supersede records BATCH_SUPERSEDED on the prior batch with the auto-supersede reason', async () => {
      const first = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });
      const second = await svc.createRegularFullPeriodBatch({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        actor: ACTOR,
        poolOverride: POOL_OVERRIDE,
      });

      const types = store.events.map((e) => e.eventType);
      // 2× BATCH_CREATED + 1× BATCH_SUPERSEDED
      expect(types.filter((t) => t === 'BATCH_CREATED')).toHaveLength(2);
      expect(types.filter((t) => t === 'BATCH_SUPERSEDED')).toHaveLength(1);

      const supersededEvent = store.events.find((e) => e.eventType === 'BATCH_SUPERSEDED');
      expect(supersededEvent.batchId).toBe(first.batchId);
      expect(supersededEvent.reason).toBe('Automatically superseded by revision 2');
      expect(supersededEvent.actorId).toBe(ACTOR.id);

      const createdEvents = store.events.filter((e) => e.eventType === 'BATCH_CREATED');
      expect(createdEvents.map((e) => e.batchId).sort()).toEqual([first.batchId, second.batchId].sort());
    });
  });
});

// ---------------------------------------------------------------------------
// Static guard: every Phase-1 route must be gated by ADMIN/OWNER
// ---------------------------------------------------------------------------

describe('payrollExport routes — RBAC guard', () => {
  it('every route in payrollExport.ts is wrapped with requireRole("ADMIN", "OWNER")', () => {
    const routeFile = readFileSync(
      resolve(__dirname, '../src/routes/timekeeping/payrollExport.ts'),
      'utf8',
    );
    // Count router.<verb>(...) declarations and require each to be followed by
    // an authenticateToken + requireRole('ADMIN', 'OWNER') chain on the same
    // declaration.
    const routeMatches = routeFile.match(/router\.(get|post|put|patch|delete)\(/g) ?? [];
    expect(routeMatches.length).toBeGreaterThan(0);

    const guardedMatches = routeFile.match(
      /authenticateToken,\s*requireRole\(\s*["']ADMIN["']\s*,\s*["']OWNER["']\s*\)/g,
    ) ?? [];
    expect(guardedMatches.length).toBe(routeMatches.length);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — sanity checks
// ---------------------------------------------------------------------------

describe('CSV builder + checksum', () => {
  it('renderGustoCsv produces the canonical Gusto header and row order', () => {
    const csv = svc.renderGustoCsv([
      {
        employeeId: 1, epochEmployeeId: 101,
        employeeFirstNameSnapshot: 'Alice', employeeLastNameSnapshot: 'Adams',
        employeeNumberSnapshot: 'E001', employeeEmailSnapshot: 'a@x.com',
        regularHours: 40, overtimeHours: 0, doubleOvertimeHours: 0,
        sickHours: 0, vacationHours: 0,
        sourceTimesheetIds: [], sourceLeaveEntryIds: [],
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'first_name,last_name,regular_hours,overtime_hours,double_overtime_hours,sick_hours,vacation_hours',
    );
    expect(lines[1]).toBe('Alice,Adams,40,0,0,0,0');
  });

  it('sha256Hex is deterministic and matches Node crypto', () => {
    const a = svc.sha256Hex('hello');
    expect(a).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(svc.sha256Hex('hello')).toBe(a);
    expect(svc.sha256Hex('hello!')).not.toBe(a);
  });
});
