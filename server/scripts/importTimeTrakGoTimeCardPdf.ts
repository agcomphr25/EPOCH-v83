import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import { and, eq, isNull } from 'drizzle-orm';
import {
  parseTimeTrakGoTimeCardText,
  type TimeTrakGoTimeCardRow,
} from '../src/services/timekeeping/timeTrakGoTimeCardParser';

interface Args {
  pdf: string;
  apply: boolean;
  outDir: string;
  actorEmployeeId: number | null;
  reason: string;
  timezoneOffsetMinutes: number;
  includeMissing: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    pdf: '',
    apply: false,
    outDir: process.cwd(),
    actorEmployeeId: null,
    reason: 'Historical TimeTrakGO PDF punch import',
    timezoneOffsetMinutes: -300,
    includeMissing: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') args.apply = true;
    else if (token === '--pdf') args.pdf = argv[++i] ?? '';
    else if (token === '--out-dir') args.outDir = argv[++i] ?? args.outDir;
    else if (token === '--actor-employee-id') args.actorEmployeeId = Number(argv[++i]);
    else if (token === '--reason') args.reason = argv[++i] ?? args.reason;
    else if (token === '--timezone-offset-minutes') args.timezoneOffsetMinutes = Number(argv[++i]);
    else if (token === '--include-missing') args.includeMissing = true;
  }

  if (!args.pdf) {
    throw new Error('Usage: tsx server/scripts/importTimeTrakGoTimeCardPdf.ts --pdf <file.pdf> [--apply --actor-employee-id <id>] [--timezone-offset-minutes -300]');
  }
  if (args.apply && !args.actorEmployeeId) {
    throw new Error('--apply requires --actor-employee-id so imported rows have an accountable actor.');
  }
  if (!Number.isFinite(args.timezoneOffsetMinutes)) {
    throw new Error('--timezone-offset-minutes must be a finite number.');
  }
  return args;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function csvField(value: unknown): string {
  const raw = value == null ? '' : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function renderCsv(rows: TimeTrakGoTimeCardRow[]): string {
  const header = [
    'employee',
    'work_date',
    'clock_in',
    'clock_out',
    'clock_in_iso',
    'clock_out_iso',
    'hours',
    'day_total',
    'row_type',
    'flags',
    'source_line',
  ];
  const lines = rows.map((row) => [
    row.employeeName,
    row.workDate,
    row.clockIn ?? '',
    row.clockOut ?? '',
    row.clockInIso ?? '',
    row.clockOutIso ?? '',
    row.hours,
    row.dayTotal ?? '',
    row.rowType,
    row.flags.join(';'),
    row.sourceLine,
  ].map(csvField).join(','));
  return [header.join(','), ...lines].join('\n');
}

async function loadDbModules(): Promise<{
  db: typeof import('../db').db;
  auditEvents: typeof import('../schema').auditEvents;
  employees: typeof import('../schema').employees;
  punchLedger: typeof import('../schema').punchLedger;
  createClosedHistoricalSession: typeof import('../src/lib/punchLedger').createClosedHistoricalSession;
  openSession: typeof import('../src/lib/punchLedger').openSession;
}> {
  const dbModule = await import('../db');
  const schema = await import('../schema');
  const ledger = await import('../src/lib/punchLedger');
  return {
    db: dbModule.db,
    auditEvents: schema.auditEvents,
    employees: schema.employees,
    punchLedger: schema.punchLedger,
    createClosedHistoricalSession: ledger.createClosedHistoricalSession,
    openSession: ledger.openSession,
  };
}

async function loadEmployeeMap(
  db: Awaited<ReturnType<typeof loadDbModules>>['db'],
  employees: Awaited<ReturnType<typeof loadDbModules>>['employees'],
): Promise<Map<string, { id: number; name: string }[]>> {
  const rows = await db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.isActive, true));
  const byName = new Map<string, { id: number; name: string }[]>();
  for (const row of rows) {
    const key = normalizeName(row.name ?? '');
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  return byName;
}

type ImportableRow = TimeTrakGoTimeCardRow & {
  employeeId: number;
  importMode: 'complete_pair' | 'missing_out_open_session' | 'missing_in_inferred_pair';
  importClockIn: Date;
  importClockOut: Date | null;
};

function toImportableRow(row: TimeTrakGoTimeCardRow, employeeId: number, includeMissing: boolean): ImportableRow | null {
  if (row.rowType !== 'punch_pair') return null;
  if (row.clockInIso && row.clockOutIso) {
    return {
      ...row,
      employeeId,
      importMode: 'complete_pair',
      importClockIn: new Date(row.clockInIso),
      importClockOut: new Date(row.clockOutIso),
    };
  }
  if (!includeMissing) return null;
  if (row.clockInIso && !row.clockOutIso && row.flags.includes('MISSING_OUT')) {
    return {
      ...row,
      employeeId,
      importMode: 'missing_out_open_session',
      importClockIn: new Date(row.clockInIso),
      importClockOut: null,
    };
  }
  if (!row.clockInIso && row.clockOutIso && row.flags.includes('MISSING_IN')) {
    const out = new Date(row.clockOutIso);
    return {
      ...row,
      employeeId,
      importMode: 'missing_in_inferred_pair',
      importClockIn: new Date(out.getTime() - row.hours * 3_600_000),
      importClockOut: out,
    };
  }
  return null;
}

async function findExistingImport(
  db: Awaited<ReturnType<typeof loadDbModules>>['db'],
  punchLedger: Awaited<ReturnType<typeof loadDbModules>>['punchLedger'],
  row: ImportableRow,
): Promise<number | null> {
  const duplicateWhere = row.importClockOut
    ? and(
        eq(punchLedger.employeeId, row.employeeId),
        eq(punchLedger.clockIn, row.importClockIn),
        eq(punchLedger.clockOut, row.importClockOut),
        eq(punchLedger.source, 'TIMETRAKGO_IMPORT'),
      )
    : and(
        eq(punchLedger.employeeId, row.employeeId),
        eq(punchLedger.clockIn, row.importClockIn),
        isNull(punchLedger.clockOut),
        eq(punchLedger.source, 'TIMETRAKGO_IMPORT'),
      );
  const [existing] = await db.select({ id: punchLedger.id }).from(punchLedger).where(duplicateWhere).limit(1);
  return existing?.id ?? null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const pdfBuffer = await fs.readFile(args.pdf);
  const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const pdfParser = new PDFParse({ data: pdfBuffer });
  const parsedPdf = await pdfParser.getText();
  await pdfParser.destroy();
  const parsed = parseTimeTrakGoTimeCardText(parsedPdf.text, {
    timezoneOffsetMinutes: args.timezoneOffsetMinutes,
  });

  await fs.mkdir(args.outDir, { recursive: true });
  const stem = path.basename(args.pdf).replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_');
  const normalizedPath = path.join(args.outDir, `${stem}.normalized.csv`);
  const reviewPath = path.join(args.outDir, `${stem}.review.csv`);
  await fs.writeFile(normalizedPath, renderCsv(parsed.rows), 'utf8');
  await fs.writeFile(reviewPath, renderCsv(parsed.reviewRows), 'utf8');

  let dbModules: Awaited<ReturnType<typeof loadDbModules>> | null = null;
  try {
    dbModules = await loadDbModules();
  } catch (err) {
    if (args.apply) throw err;
  }

  const byName = dbModules ? await loadEmployeeMap(dbModules.db, dbModules.employees) : new Map();
  const importable: ImportableRow[] = [];
  const matchErrors: Array<{ employeeName: string; sourceLine: string; reason: string }> = [];

  if (dbModules) {
    for (const row of parsed.rows) {
      if (row.rowType !== 'punch_pair') continue;
      if (!args.includeMissing && (!row.clockInIso || !row.clockOutIso)) continue;
      const candidates = byName.get(normalizeName(row.employeeName)) ?? [];
      if (candidates.length !== 1) {
        matchErrors.push({
          employeeName: row.employeeName,
          sourceLine: row.sourceLine,
          reason: candidates.length === 0 ? 'No active EPOCH employee matched this name' : 'Multiple active EPOCH employees matched this name',
        });
        continue;
      }
      const converted = toImportableRow(row, candidates[0]!.id, args.includeMissing);
      if (converted) importable.push(converted);
    }
  }

  let inserted = 0;
  let duplicates = 0;
  if (dbModules) {
    const {
      db,
      auditEvents,
      punchLedger,
      createClosedHistoricalSession,
      openSession,
    } = dbModules!;
    for (const row of importable) {
      const existing = await findExistingImport(db, punchLedger, row);
      if (existing) {
        duplicates += 1;
        continue;
      }
      if (!args.apply) continue;

      const commonNote = `[TimeTrakGO import] ${args.reason}; mode=${row.importMode}; sourcePdfSha256=${pdfHash}; source="${row.sourceLine}"`;
      const created = row.importClockOut
        ? await createClosedHistoricalSession({
            employeeId: row.employeeId,
            source: 'TIMETRAKGO_IMPORT',
            laborClass: 'REGULAR',
            clockIn: row.importClockIn,
            clockOut: row.importClockOut,
            approvalStatus: 'PENDING_APPROVAL',
            createdBy: args.actorEmployeeId,
            createdByDisplayName: 'TimeTrakGO historical import',
            editNote: row.importMode === 'missing_in_inferred_pair'
              ? `${commonNote}; clockIn inferred from TimeTrakGO hours because source row was missing IN punch`
              : commonNote,
          })
        : await openSession({
            employeeId: row.employeeId,
            source: 'TIMETRAKGO_IMPORT',
            laborClass: 'REGULAR',
            clockIn: row.importClockIn,
            approvalStatus: 'PENDING_APPROVAL',
            createdBy: args.actorEmployeeId,
            createdByDisplayName: 'TimeTrakGO historical import',
            overrideReason: commonNote,
          });
      inserted += 1;

      await db.insert(auditEvents).values({
        entityType: 'time_entry',
        entityId: String(created.id),
        action: 'HISTORICAL_PUNCH_IMPORTED',
        actorId: args.actorEmployeeId,
        actorName: 'TimeTrakGO historical import',
        actorRole: 'ADMIN',
        reason: args.reason,
        fieldsChanged: null,
        meta: {
          source: 'TIMETRAKGO_IMPORT',
          importMode: row.importMode,
          sourcePdfSha256: pdfHash,
          sourceLine: row.sourceLine,
          parsedHours: row.hours,
          missingBoundaryFlags: row.flags,
          importedClockIn: row.importClockIn.toISOString(),
          importedClockOut: row.importClockOut?.toISOString() ?? null,
        },
      } as any);
    }
  }

  console.log(JSON.stringify({
    mode: args.apply ? 'apply' : 'dry-run',
    pdf: args.pdf,
    pdfHash,
    totalRows: parsed.rows.length,
    completePunchPairs: parsed.completePunchPairs.length,
    reviewRows: parsed.reviewRows.length,
    includeMissing: args.includeMissing,
    dbAvailable: dbModules != null,
    importableRows: importable.length,
    importableCompletePairs: importable.filter((row) => row.importMode === 'complete_pair').length,
    importableMissingOutOpenSessions: importable.filter((row) => row.importMode === 'missing_out_open_session').length,
    importableMissingInInferredPairs: importable.filter((row) => row.importMode === 'missing_in_inferred_pair').length,
    matchErrors: matchErrors.length,
    inserted,
    duplicates,
    normalizedPath,
    reviewPath,
    reportTotal: parsed.reportTotal,
    matchErrorsSample: matchErrors.slice(0, 10),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
