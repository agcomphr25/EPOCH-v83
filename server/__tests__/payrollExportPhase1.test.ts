/**
 * Phase 1 payroll export tests.
 *
 * These tests exercise the corrected Phase 1 contract:
 * - create runs through a transaction client
 * - superseding requires a human reason
 * - 23505 active-batch conflicts surface as 409, not silent retry
 * - downloads serve stored bytes with checksum verification
 * - superseded/voided batches require evidenceOnly=true
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const harness = vi.hoisted(() => {
  interface Store {
    batches: any[];
    rows: any[];
    events: any[];
  }

  type TableKey = 'batches' | 'rows' | 'events';
  type ColumnRef = { __col: string };

  const store: Store = { batches: [], rows: [], events: [] };
  const nextId = { batches: 1, rows: 1, events: 1 };
  const writes = { global: 0, tx: 0 };
  const txOptions: any[] = [];
  const insertBehaviors = {
    batchesThrow: null as string | null,
    rowsThrow: null as string | null,
    eventsThrow: null as string | null,
  };

  function col(name: string): ColumnRef {
    return { __col: name };
  }

  function makeTable(key: TableKey, columns: string[]) {
    return Object.assign({ __t: key }, Object.fromEntries(columns.map((c) => [c, col(c)])));
  }

  const TBatches = makeTable('batches', [
    'id', 'periodStart', 'periodEnd', 'exportType', 'revisionNumber', 'status', 'createdAt',
  ]);
  const TRows = makeTable('rows', ['id', 'batchId', 'employeeId']);
  const TEvents = makeTable('events', ['id', 'batchId', 'eventType', 'adjustmentId']);

  const ignoredTable = Object.assign({ __t: 'ignored' }, {
    id: col('id'), employeeId: col('employeeId'), epochEmployeeId: col('epochEmployeeId'),
    regularHours: col('regularHours'), overtimeHours: col('overtimeHours'), status: col('status'),
    periodStart: col('periodStart'), periodEnd: col('periodEnd'), leaveType: col('leaveType'),
    hours: col('hours'), date: col('date'), voidedAt: col('voidedAt'), sourceRequestId: col('sourceRequestId'),
    name: col('name'), email: col('email'), employeeCode: col('employeeCode'),
  });

  function evalCond(row: any, cond: any): boolean {
    if (!cond) return true;
    if (cond.type === 'eq') return row[cond.col.__col] === cond.value;
    if (cond.type === 'and') return cond.args.every((c: any) => evalCond(row, c));
    if (cond.type === 'or') return cond.args.some((c: any) => evalCond(row, c));
    if (cond.type === 'inArray') return cond.values.includes(row[cond.col.__col]);
    return true;
  }

  function rowsFor(table: any): any[] {
    if (table.__t === 'batches') return store.batches;
    if (table.__t === 'rows') return store.rows;
    if (table.__t === 'events') return store.events;
    return [];
  }

  function makeSelectChain(table: any) {
    let result = rowsFor(table).slice();
    const chain: any = {
      where: (cond: any) => {
        result = result.filter((r) => evalCond(r, cond));
        return chain;
      },
      orderBy: () => {
        if (table.__t === 'batches') {
          result = result.slice().sort((a, b) => (b.revisionNumber ?? 0) - (a.revisionNumber ?? 0));
        }
        return chain;
      },
      limit: (n: number) => Promise.resolve(result.slice(0, n)),
      then: (resolveFn: any, rejectFn: any) => Promise.resolve(result).then(resolveFn, rejectFn),
    };
    return chain;
  }

  function pgError(code: string): any {
    const err: any = new Error(`mock pg error ${code}`);
    err.code = code;
    return err;
  }

  function createDb(label: 'global' | 'tx') {
    return {
      select: () => ({ from: (t: any) => makeSelectChain(t) }),
      insert: (t: any) => ({
        values: (data: any) => {
          const tableKey = t.__t as TableKey;
          const configured = insertBehaviors[`${tableKey}Throw` as keyof typeof insertBehaviors];
          if (configured) {
            return {
              returning: () => Promise.reject(pgError(configured)),
              then: (_res: any, rej: any) => Promise.reject(pgError(configured)).catch(rej),
            };
          }
          writes[label]++;
          const arr = Array.isArray(data) ? data : [data];
          const inserted = arr.map((d) => {
            const id = nextId[tableKey]++;
            const row = { id, createdAt: new Date(), ...d };
            store[tableKey].push(row);
            return row;
          });
          return {
            returning: () => Promise.resolve(inserted),
            then: (resolveFn: any, rejectFn: any) => Promise.resolve(undefined).then(resolveFn, rejectFn),
          };
        },
      }),
      update: (t: any) => ({
        set: (changes: any) => ({
          where: (cond: any) => {
            writes[label]++;
            const tableKey = t.__t as TableKey;
            const updated: any[] = [];
            for (const row of store[tableKey]) {
              if (evalCond(row, cond)) {
                Object.assign(row, changes);
                updated.push(row);
              }
            }
            return {
              returning: () => Promise.resolve(updated),
              then: (resolveFn: any, rejectFn: any) => Promise.resolve(undefined).then(resolveFn, rejectFn),
            };
          },
        }),
      }),
    };
  }

  const mockDb: any = createDb('global');
  mockDb.transaction = async (fn: any, opts: any) => {
    txOptions.push(opts);
    const snapshot = JSON.parse(JSON.stringify(store));
    const ids = { ...nextId };
    try {
      return await fn(createDb('tx'));
    } catch (err) {
      store.batches = snapshot.batches;
      store.rows = snapshot.rows;
      store.events = snapshot.events;
      nextId.batches = ids.batches;
      nextId.rows = ids.rows;
      nextId.events = ids.events;
      throw err;
    }
  };

  function reset() {
    store.batches = [];
    store.rows = [];
    store.events = [];
    nextId.batches = 1;
    nextId.rows = 1;
    nextId.events = 1;
    writes.global = 0;
    writes.tx = 0;
    txOptions.length = 0;
    insertBehaviors.batchesThrow = null;
    insertBehaviors.rowsThrow = null;
    insertBehaviors.eventsThrow = null;
  }

  return {
    store, writes, txOptions, insertBehaviors, mockDb, TBatches, TRows, TEvents, ignoredTable, reset,
  };
});

vi.mock('drizzle-orm', () => ({
  and: (...args: any[]) => ({ type: 'and', args }),
  or: (...args: any[]) => ({ type: 'or', args }),
  eq: (col: any, value: any) => ({ type: 'eq', col, value }),
  gte: (col: any, value: any) => ({ type: 'gte', col, value }),
  lte: (col: any, value: any) => ({ type: 'lte', col, value }),
  inArray: (col: any, values: any[]) => ({ type: 'inArray', col, values }),
  desc: (col: any) => ({ type: 'desc', col }),
  sql: () => ({ type: 'sql' }),
}));

vi.mock('../db', () => ({ db: harness.mockDb }));

vi.mock('../src/schema/timekeeping', () => ({
  payrollExportBatchesTable: harness.TBatches,
  payrollExportRowsTable: harness.TRows,
  payrollExportEventsTable: harness.TEvents,
  timesheetsTable: harness.ignoredTable,
  leaveEntriesTable: harness.ignoredTable,
  employeesTable: harness.ignoredTable,
  timeOffRequestsTable: harness.ignoredTable,
}));

vi.mock('../schema', () => ({ employees: harness.ignoredTable }));

import * as svc from '../src/services/timekeeping/payrollExport.service';

const ACTOR = { id: 999, email: 'admin@example.com', role: 'OWNER', ip: '127.0.0.1' };
const PERIOD_START = '2026-01-05';
const PERIOD_END = '2026-01-11';

function source(overrides?: Partial<svc.PayrollSnapshotDataSource>): svc.PayrollSnapshotDataSource {
  return {
    fetchTimesheets: vi.fn().mockResolvedValue([
      { id: 11, employeeId: 1, regularHours: 40, overtimeHours: 0 },
      { id: 12, employeeId: 2, regularHours: 35, overtimeHours: 5 },
    ]),
    fetchLeaveEntries: vi.fn().mockResolvedValue([
      { id: 21, employeeId: 2, leaveType: 'sick', hours: 2 },
      { id: 22, employeeId: 2, leaveType: 'pto', hours: 8 },
    ]),
    fetchEmployees: vi.fn().mockResolvedValue([
      { timekeepingId: 1, epochEmployeeId: 101, firstName: 'Alice', lastName: 'Adams', employeeCode: 'E001', email: 'alice@example.com' },
      { timekeepingId: 2, epochEmployeeId: 102, firstName: 'Bob', lastName: 'Brown', employeeCode: 'E002', email: 'bob@example.com' },
    ]),
    ...overrides,
  };
}

async function createBatch(extra: Partial<svc.CreateRegularFullPeriodBatchInput> = {}) {
  return svc.createRegularFullPeriodBatch({
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    actor: ACTOR,
    dataSourceOverride: source(),
    ...extra,
  });
}

describe('payrollExport.service - Phase 1', () => {
  beforeEach(() => harness.reset());

  it('creates active revision 1 using a serializable transaction client', async () => {
    const result = await createBatch();

    expect(result.revisionNumber).toBe(1);
    expect(result.supersededBatchId).toBeNull();
    expect(result.rowCount).toBe(2);
    expect(result.csvChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(harness.txOptions[0]).toMatchObject({ isolationLevel: 'serializable' });
    expect(harness.writes.tx).toBeGreaterThan(0);
    expect(harness.writes.global).toBe(0);

    const batch = harness.store.batches[0];
    expect(batch.status).toBe('active');
    expect(batch.exportType).toBe('regular_full_period');
    expect(batch.csvContent).toContain('first_name,last_name,regular_hours');
    expect(batch.csvContent).toContain('Alice,Adams,40,0,0,0,0');
  });

  it('captures employee snapshot fields and source ids on rows and batch', async () => {
    await createBatch();

    const alice = harness.store.rows.find((r) => r.employeeFirstNameSnapshot === 'Alice');
    const bob = harness.store.rows.find((r) => r.employeeFirstNameSnapshot === 'Bob');
    expect(alice).toMatchObject({
      employeeId: 1,
      epochEmployeeId: 101,
      employeeLastNameSnapshot: 'Adams',
      employeeNumberSnapshot: 'E001',
      employeeEmailSnapshot: 'alice@example.com',
      sourceTimesheetIds: [11],
      sourceLeaveEntryIds: [],
    });
    expect(bob).toMatchObject({ sourceTimesheetIds: [12], sourceLeaveEntryIds: [21, 22] });
    expect(harness.store.batches[0].sourceTimesheetIds).toEqual([11, 12]);
    expect(harness.store.batches[0].sourceLeaveEntryIds).toEqual([21, 22]);
  });

  it('requires a human supersedeReason before replacing an active batch', async () => {
    const first = await createBatch();

    await expect(createBatch()).rejects.toMatchObject({
      name: 'SupersedeReasonRequiredError',
      httpStatus: 400,
    });
    expect(harness.store.batches).toHaveLength(1);
    expect(harness.store.batches[0].id).toBe(first.batchId);
    expect(harness.store.batches[0].status).toBe('active');
  });

  it('supersedes revision 1 and creates revision 2 when a reason is supplied', async () => {
    const first = await createBatch();
    const second = await createBatch({ supersedeReason: 'Correcting late-approved hours before payroll processing' });

    expect(second.revisionNumber).toBe(2);
    expect(second.supersededBatchId).toBe(first.batchId);
    const oldBatch = harness.store.batches.find((b) => b.id === first.batchId);
    const newBatch = harness.store.batches.find((b) => b.id === second.batchId);
    expect(oldBatch).toMatchObject({
      status: 'superseded',
      supersededReason: 'Correcting late-approved hours before payroll processing',
    });
    expect(newBatch).toMatchObject({ status: 'active', supersedesBatchId: first.batchId });

    const supersededEvent = harness.store.events.find((e) => e.eventType === 'BATCH_SUPERSEDED');
    expect(supersededEvent).toMatchObject({
      batchId: first.batchId,
      reason: 'Correcting late-approved hours before payroll processing',
      actorId: ACTOR.id,
    });
  });

  it('rolls back the supersede and new batch when row insert fails', async () => {
    await createBatch();
    harness.insertBehaviors.rowsThrow = 'XX999';

    await expect(
      createBatch({ supersedeReason: 'Retry after row insert failure' }),
    ).rejects.toThrow(/mock pg error XX999/);

    expect(harness.store.batches).toHaveLength(1);
    expect(harness.store.batches[0].status).toBe('active');
    expect(harness.store.events.map((e) => e.eventType)).toEqual(['BATCH_CREATED']);
  });

  it('surfaces active-batch unique conflicts as 409 instead of silently superseding', async () => {
    harness.insertBehaviors.batchesThrow = '23505';

    await expect(createBatch()).rejects.toMatchObject({
      name: 'ConcurrentExportConflictError',
      httpStatus: 409,
    });
    expect(harness.store.batches).toHaveLength(0);
  });

  it('does not allow a processed batch to be superseded', async () => {
    const first = await createBatch();
    await svc.markBatchProcessed({ batchId: first.batchId, confirmationNote: 'Submitted to Gusto run 123', actor: ACTOR });

    await expect(
      createBatch({ supersedeReason: 'Should not replace processed payroll evidence' }),
    ).rejects.toMatchObject({ name: 'ProcessedBatchImmutableError', httpStatus: 409 });
  });

  it('throws when a source employee cannot be resolved', async () => {
    await expect(
      createBatch({
        dataSourceOverride: source({ fetchEmployees: vi.fn().mockResolvedValue([]) }),
      }),
    ).rejects.toMatchObject({ name: 'UnresolvableEmployeeError', httpStatus: 422 });
    expect(harness.store.batches).toHaveLength(0);
  });

  it('blocks payroll export when readiness controls are unresolved', async () => {
    await expect(
      createBatch({
        dataSourceOverride: source({
          fetchPayrollReadinessBlockers: vi.fn().mockResolvedValue([
            {
              code: 'MISSING_EMPLOYEE_ATTESTATION',
              employeeId: 1,
              timesheetId: 11,
              status: 'certified',
              message: 'Certified/locked timesheet is missing employee attestation evidence.',
            },
            {
              code: 'OPEN_TIMESHEET_CORRECTION',
              employeeId: 2,
              timesheetId: 12,
              status: 'locked',
              message: 'Timesheet has an unresolved correction request.',
            },
          ]),
        }),
      }),
    ).rejects.toMatchObject({
      name: 'PayrollExportReadinessError',
      httpStatus: 422,
      details: {
        blockers: [
          { code: 'MISSING_EMPLOYEE_ATTESTATION', employeeId: 1, timesheetId: 11 },
          { code: 'OPEN_TIMESHEET_CORRECTION', employeeId: 2, timesheetId: 12 },
        ],
      },
    });

    expect(harness.store.batches).toHaveLength(0);
    expect(harness.store.rows).toHaveLength(0);
    expect(harness.store.events).toHaveLength(0);
  });

  it('reports payroll readiness blockers without mutating export evidence', async () => {
    const readiness = await svc.getPayrollExportReadiness(
      PERIOD_START,
      PERIOD_END,
      source({
        fetchPayrollReadinessBlockers: vi.fn().mockResolvedValue([
          {
            code: 'MISSING_SUPERVISOR_APPROVAL',
            employeeId: 2,
            timesheetId: 12,
            status: 'certified',
            message: 'Certified/locked timesheet is missing supervisor review evidence.',
          },
        ]),
      }),
    );

    expect(readiness).toMatchObject({
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      ready: false,
      blockerCount: 1,
      blockers: [{ code: 'MISSING_SUPERVISOR_APPROVAL', employeeId: 2, timesheetId: 12 }],
    });
    expect(harness.store.batches).toHaveLength(0);
    expect(harness.store.rows).toHaveLength(0);
    expect(harness.store.events).toHaveLength(0);
  });

  it('uses employee ids rather than names, so duplicate and compound names stay distinct', async () => {
    const ds = source({
      fetchTimesheets: vi.fn().mockResolvedValue([
        { id: 31, employeeId: 10, regularHours: 8, overtimeHours: 0 },
        { id: 32, employeeId: 11, regularHours: 7, overtimeHours: 1 },
      ]),
      fetchLeaveEntries: vi.fn().mockResolvedValue([]),
      fetchEmployees: vi.fn().mockResolvedValue([
        { timekeepingId: 10, epochEmployeeId: 201, firstName: 'Mary Jane', lastName: 'Smith', employeeCode: 'E201', email: 'mj@example.com' },
        { timekeepingId: 11, epochEmployeeId: 202, firstName: 'Mary Jane', lastName: 'Smith', employeeCode: 'E202', email: 'mj2@example.com' },
      ]),
    });

    await createBatch({ dataSourceOverride: ds });
    expect(harness.store.rows).toHaveLength(2);
    expect(harness.store.rows.map((r) => r.employeeId).sort()).toEqual([10, 11]);
    expect(harness.store.rows.map((r) => r.sourceTimesheetIds[0]).sort()).toEqual([31, 32]);
  });

  it('rejects NaN, Infinity, and negative hour values before rendering CSV', async () => {
    await expect(createBatch({
      dataSourceOverride: source({
        fetchTimesheets: vi.fn().mockResolvedValue([{ id: 41, employeeId: 1, regularHours: Number.NaN, overtimeHours: 0 }]),
      }),
    })).rejects.toMatchObject({ name: 'InvalidHourValueError', httpStatus: 422 });

    await expect(createBatch({
      dataSourceOverride: source({
        fetchTimesheets: vi.fn().mockResolvedValue([{ id: 42, employeeId: 1, regularHours: 1, overtimeHours: Infinity }]),
      }),
    })).rejects.toMatchObject({ name: 'InvalidHourValueError', httpStatus: 422 });

    await expect(createBatch({
      dataSourceOverride: source({
        fetchLeaveEntries: vi.fn().mockResolvedValue([{ id: 43, employeeId: 1, leaveType: 'pto', hours: -1 }]),
      }),
    })).rejects.toMatchObject({ name: 'InvalidHourValueError', httpStatus: 422 });
  });

  it('download returns exact stored CSV and logs a download event', async () => {
    const created = await createBatch();
    const originalCsv = harness.store.batches[0].csvContent;
    harness.store.batches[0].csvContent = originalCsv;

    const dl = await svc.downloadBatchCsv({ batchId: created.batchId, actor: ACTOR });

    expect(dl.csvContent).toBe(originalCsv);
    expect(harness.store.events.map((e) => e.eventType)).toContain('BATCH_DOWNLOADED');
    expect(harness.store.events.find((e) => e.eventType === 'BATCH_DOWNLOADED')).toMatchObject({
      metadata: { evidenceOnly: false, batchStatus: 'active' },
    });
  });

  it('rejects tampered CSV content with checksum mismatch', async () => {
    const created = await createBatch();
    harness.store.batches[0].csvContent = 'tampered,csv,content';

    await expect(svc.downloadBatchCsv({ batchId: created.batchId, actor: ACTOR })).rejects.toMatchObject({
      name: 'ChecksumMismatchError',
      httpStatus: 500,
    });
  });

  it('blocks superseded or voided downloads unless evidenceOnly=true', async () => {
    const first = await createBatch();
    await createBatch({ supersedeReason: 'Replacing with corrected revision' });

    await expect(svc.downloadBatchCsv({ batchId: first.batchId, actor: ACTOR })).rejects.toMatchObject({
      name: 'BatchNotDownloadableError',
      httpStatus: 409,
    });

    const evidence = await svc.downloadBatchCsv({ batchId: first.batchId, actor: ACTOR, evidenceOnly: true });
    expect(evidence.evidenceOnly).toBe(true);
    expect(harness.store.events.find((e) => e.eventType === 'BATCH_DOWNLOADED' && e.batchId === first.batchId))
      .toMatchObject({ metadata: { evidenceOnly: true, batchStatus: 'superseded' } });
  });

  it('marks an active batch processed and prevents re-processing', async () => {
    const created = await createBatch();
    const processed = await svc.markBatchProcessed({
      batchId: created.batchId,
      confirmationNote: 'Submitted to Gusto run 123',
      actor: ACTOR,
    });

    expect(processed.status).toBe('processed');
    expect(processed.processedBy).toBe(ACTOR.id);
    expect(processed.processedConfirmationNote).toBe('Submitted to Gusto run 123');

    await expect(svc.markBatchProcessed({
      batchId: created.batchId,
      confirmationNote: 'Second attempt',
      actor: ACTOR,
    })).rejects.toMatchObject({ name: 'ProcessedBatchImmutableError', httpStatus: 409 });
  });

  it('finds active batches for the legacy GET shim without writing', async () => {
    expect(await svc.getActiveBatchForPeriod(PERIOD_START, PERIOD_END)).toBeNull();
    const created = await createBatch();
    const writesAfterCreate = { ...harness.writes };

    const found = await svc.getActiveBatchForPeriod(PERIOD_START, PERIOD_END);
    expect(found?.id).toBe(created.batchId);
    expect(harness.writes).toEqual(writesAfterCreate);
  });
});

describe('payrollExport routes - static guards', () => {
  it('every Phase 1 payroll route is guarded by ADMIN/OWNER', () => {
    const routeFile = readFileSync(resolve(__dirname, '../src/routes/timekeeping/payrollExport.ts'), 'utf8');
    const routeMatches = routeFile.match(/router\.(get|post|put|patch|delete)\(/g) ?? [];
    const guardedMatches = routeFile.match(
      /authenticateToken,\s*requireRole\(\s*["']ADMIN["']\s*,\s*["']OWNER["']\s*\)/g,
    ) ?? [];
    expect(routeMatches.length).toBeGreaterThan(0);
    expect(guardedMatches.length).toBe(routeMatches.length);
  });

  it('legacy Gusto GET does not create or supersede batches', () => {
    const routeFile = readFileSync(resolve(__dirname, '../src/routes/timekeeping/timesheets.ts'), 'utf8');
    const gustoRoute = routeFile.slice(routeFile.indexOf('router.get("/admin/export/gusto"'));
    expect(gustoRoute).toContain('getActiveBatchForPeriod');
    expect(gustoRoute).toContain('downloadBatchCsv');
    expect(gustoRoute).not.toContain('createRegularFullPeriodBatch');
  });

  it('exposes a read-only admin payroll readiness route', () => {
    const routeFile = readFileSync(resolve(__dirname, '../src/routes/timekeeping/payrollExport.ts'), 'utf8');
    const readinessStart = routeFile.indexOf('router.get(\n  "/admin/payroll/readiness"');
    expect(readinessStart).toBeGreaterThan(-1);
    const readinessRoute = routeFile.slice(
      readinessStart,
      routeFile.indexOf('/**\n * POST /admin/payroll/batches', readinessStart),
    );

    expect(readinessRoute).toContain('requireRole("ADMIN", "OWNER")');
    expect(readinessRoute).toContain('getPayrollExportReadiness');
    expect(readinessRoute).not.toContain('createRegularFullPeriodBatch');
    expect(readinessRoute).not.toContain('importTimeTrakGoGustoCsvBatch');
  });

  it('batch creation checks DCAA readiness blockers before mutating payroll export tables', () => {
    const serviceFile = readFileSync(resolve(__dirname, '../src/services/timekeeping/payrollExport.service.ts'), 'utf8');
    const createFn = serviceFile.slice(serviceFile.indexOf('export async function createRegularFullPeriodBatch'));

    expect(serviceFile).toContain('MISSING_EMPLOYEE_ATTESTATION');
    expect(serviceFile).toContain('MISSING_SUPERVISOR_APPROVAL');
    expect(serviceFile).toContain('OPEN_TIMESHEET_CORRECTION');
    expect(serviceFile).toContain('timekeeping.timesheet_corrections');
    expect(createFn.indexOf('await assertPayrollExportReady')).toBeGreaterThan(-1);
    expect(createFn.indexOf('await assertPayrollExportReady')).toBeLessThan(
      createFn.indexOf('.from(payrollExportBatchesTable)'),
    );
  });

  it('TimeTrakGo imports check DCAA readiness blockers before mutating payroll export tables', () => {
    const serviceFile = readFileSync(resolve(__dirname, '../src/services/timekeeping/payrollExport.service.ts'), 'utf8');
    const importFn = serviceFile.slice(serviceFile.indexOf('export async function importTimeTrakGoGustoCsvBatch'));

    expect(importFn.indexOf('await assertPayrollExportReady')).toBeGreaterThan(-1);
    expect(importFn.indexOf('await assertPayrollExportReady')).toBeLessThan(
      importFn.indexOf('.from(payrollExportBatchesTable)'),
    );
  });
});

describe('CSV helpers', () => {
  it('renderGustoCsv produces canonical Gusto columns', () => {
    const csv = svc.renderGustoCsv([
      {
        employeeId: 1,
        epochEmployeeId: 101,
        employeeFirstNameSnapshot: 'Alice',
        employeeLastNameSnapshot: 'Adams',
        employeeNumberSnapshot: 'E001',
        employeeEmailSnapshot: 'a@example.com',
        regularHours: 40,
        overtimeHours: 0,
        doubleOvertimeHours: 0,
        sickHours: 0,
        vacationHours: 0,
        sourceTimesheetIds: [1],
        sourceLeaveEntryIds: [],
      },
    ]);
    expect(csv.split('\n')[0]).toBe('first_name,last_name,regular_hours,overtime_hours,double_overtime_hours,sick_hours,vacation_hours');
    expect(csv.split('\n')[1]).toBe('Alice,Adams,40,0,0,0,0');
  });

  it('sha256Hex is deterministic', () => {
    expect(svc.sha256Hex('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(svc.sha256Hex('hello')).not.toBe(svc.sha256Hex('hello!'));
  });

  it('parseTimeTrakGoGustoCsv accepts Gusto-style TimeTrakGo columns', () => {
    const rows = svc.parseTimeTrakGoGustoCsv([
      'first_name,last_name,ssn,gusto_employee_id,regular_hours,overtime_hours,double_overtime_hours,sick_hours,vacation_hours',
      'Alice,Adams,,e28940,40,2,,0,8',
    ].join('\n'));

    expect(rows).toEqual([
      {
        rowNumber: 2,
        firstName: 'Alice',
        lastName: 'Adams',
        ssn: null,
        gustoEmployeeId: 'e28940',
        employeeNumber: null,
        email: null,
        regularHours: 40,
        overtimeHours: 2,
        doubleOvertimeHours: 0,
        sickHours: 0,
        vacationHours: 8,
      },
    ]);
  });

  it('parseTimeTrakGoGustoCsv rejects invalid hour values', () => {
    expect(() => svc.parseTimeTrakGoGustoCsv([
      'first_name,last_name,regular_hours',
      'Alice,Adams,-1',
    ].join('\n'))).toThrow(/regular hours/);
  });

  it('renderTimeTrakGoGustoCsv preserves the TimeTrakGo upload columns for Gusto', () => {
    const csv = svc.renderTimeTrakGoGustoCsv([
      {
        rowNumber: 2,
        firstName: 'Darlene',
        lastName: 'Bearden',
        ssn: null,
        gustoEmployeeId: 'e28940',
        employeeNumber: null,
        email: null,
        regularHours: 75.24,
        overtimeHours: 0,
        doubleOvertimeHours: 0,
        sickHours: 0,
        vacationHours: 0.5,
      },
    ]);

    expect(csv.split('\n')[0]).toBe('first_name,last_name,ssn,gusto_employee_id,regular_hours,overtime_hours,double_overtime_hours,sick_hours,vacation_hours');
    expect(csv.split('\n')[1]).toBe('Darlene,Bearden,,e28940,75.24,0,0,0,0.5');
  });
});
