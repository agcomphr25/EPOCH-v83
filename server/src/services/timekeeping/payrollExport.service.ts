/**
 * payrollExport.service — Phase 1 of the revised payroll export design.
 *
 * Source of truth: docs/payroll-export-design.md
 *
 * Phase 1 scope:
 *   - createRegularFullPeriodBatch  → builds a Gusto CSV from certified/locked
 *     timesheets + approved leave entries, captures employee identity snapshots,
 *     stores csv_content + sha-256 checksum, supersedes any prior active batch
 *     for the same (period_start, period_end, 'regular_full_period') ONLY when
 *     the caller provides a human-readable supersedeReason.
 *   - getBatch                      → fetch a batch + its rows.
 *   - downloadBatchCsv              → return stored csv_content with checksum
 *     verification (no recalculation, ever) and log BATCH_DOWNLOADED.  Refuses
 *     to serve superseded/voided batches unless `evidenceOnly: true`.
 *   - markBatchProcessed            → terminal transition, writes confirmation
 *     note + processed_by/at, logs BATCH_PROCESSED.  Processed batches are
 *     immutable: any subsequent supersede attempt throws ProcessedBatchImmutable.
 *   - listBatchesForPeriod          → small read used by admin listings.
 *   - getActiveBatchForPeriod       → small read used by the legacy
 *     /admin/export/gusto delegate so it can serve the existing active batch
 *     without ever creating a new one.
 *
 * Concurrency / atomicity:
 *   createRegularFullPeriodBatch performs ALL reads and writes inside a single
 *   SERIALIZABLE Postgres transaction via withSerializableRetry.  The callback
 *   receives a tx client; using the module-level `db` inside the callback would
 *   leak queries onto the pool and break atomicity.  When the partial unique
 *   index `idx_export_batches_active_unique` rejects an insert (Postgres 23505),
 *   we surface ConcurrentExportConflictError(409) — we never silently retry by
 *   superseding another concurrent request's freshly-committed active batch.
 *   Genuine SERIALIZABLE serialization failures (40001) are retried up to 3
 *   times with linear backoff.
 *
 * Phase 1 only writes export_type = 'regular_full_period'.  payroll_adjustments
 * is NOT created in Phase 1; nullable forward-compat columns
 * (`includes_adjustments`, `adjustment_ids`) are left untouched here.
 */

import { createHash } from "crypto";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import Papa from "papaparse";
import { db } from "../../../db";
import {
  employeesTable,
  leaveEntriesTable,
  payrollExportBatchesTable,
  payrollExportEventsTable,
  payrollExportRowsTable,
  timeOffRequestsTable,
  timesheetsTable,
  type PayrollExportBatch,
  type PayrollExportRow,
} from "../../schema/timekeeping";
import { employees as publicEmployeesTable } from "../../../schema";
import { listResolvedEmployees, splitName } from "../../lib/timekeepingEmployeeResolver";
import type { AuditActor } from "./audit.service";
import { recordAuditEvent } from "../auditLedgerService";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ProcessedBatchImmutableError extends Error {
  readonly httpStatus = 409;
  constructor(batchId: number) {
    super(`Batch ${batchId} is processed and cannot be modified, superseded, voided, or recalculated.`);
    this.name = "ProcessedBatchImmutableError";
  }
}

export class BatchNotFoundError extends Error {
  readonly httpStatus = 404;
  constructor(batchId: number) {
    super(`Payroll export batch ${batchId} not found.`);
    this.name = "BatchNotFoundError";
  }
}

export class BatchNotActiveError extends Error {
  readonly httpStatus = 409;
  constructor(batchId: number, status: string) {
    super(`Batch ${batchId} is in status '${status}' and cannot be marked processed.`);
    this.name = "BatchNotActiveError";
  }
}

export class ChecksumMismatchError extends Error {
  readonly httpStatus = 500;
  constructor(batchId: number) {
    super(`Stored CSV for batch ${batchId} failed checksum verification.`);
    this.name = "ChecksumMismatchError";
  }
}

export class MissingActorError extends Error {
  readonly httpStatus = 401;
  constructor() {
    super("Payroll export operations require an authenticated actor with a user id.");
    this.name = "MissingActorError";
  }
}

export class ConcurrentExportConflictError extends Error {
  readonly httpStatus = 409;
  constructor(periodStart: string, periodEnd: string) {
    super(
      `Another active payroll export batch was created concurrently for ${periodStart}..${periodEnd}. ` +
        `Reload the active batch and decide whether to supersede it explicitly.`,
    );
    this.name = "ConcurrentExportConflictError";
  }
}

export class SupersedeReasonRequiredError extends Error {
  readonly httpStatus = 400;
  constructor(activeBatchId: number, activeBatchRevision: number) {
    super(
      `An active payroll export batch (id=${activeBatchId}, revision=${activeBatchRevision}) already exists for ` +
        `this period. Supply a non-empty supersedeReason to create a new revision.`,
    );
    this.name = "SupersedeReasonRequiredError";
  }
}

export class UnresolvableEmployeeError extends Error {
  readonly httpStatus = 422;
  constructor(employeeId: number, context: string) {
    super(
      `Cannot resolve employee identity for timekeeping.employees.id=${employeeId} (${context}). ` +
        `Refusing to create a payroll export batch with unresolved employee identity.`,
    );
    this.name = "UnresolvableEmployeeError";
  }
}

export class InvalidHourValueError extends Error {
  readonly httpStatus = 422;
  constructor(field: string, value: unknown, context: string) {
    super(
      `Invalid hour value for ${field}=${String(value)} (${context}). ` +
        `Hour fields must be finite, non-negative numbers.`,
    );
    this.name = "InvalidHourValueError";
  }
}

export class BatchNotDownloadableError extends Error {
  readonly httpStatus = 409;
  constructor(batchId: number, status: string) {
    super(
      `Batch ${batchId} is in status '${status}' and is not safe to download as a current payroll export. ` +
        `Use evidenceOnly=true to download the historical CSV as audit evidence only.`,
    );
    this.name = "BatchNotDownloadableError";
  }
}

export class PayrollImportParseError extends Error {
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
    this.name = "PayrollImportParseError";
  }
}

export class PayrollImportEmployeeMatchError extends Error {
  readonly httpStatus = 422;
  readonly details: unknown;
  constructor(message: string, details: unknown) {
    super(message);
    this.name = "PayrollImportEmployeeMatchError";
    this.details = details;
  }
}

export interface PayrollExportReadinessBlocker {
  code:
    | "TIMESHEET_NOT_READY"
    | "MISSING_EMPLOYEE_ATTESTATION"
    | "MISSING_SUPERVISOR_APPROVAL"
    | "OPEN_TIMESHEET_CORRECTION";
  employeeId: number;
  timesheetId: number;
  status?: string | null;
  message: string;
}

export class PayrollExportReadinessError extends Error {
  readonly httpStatus = 422;
  readonly details: { blockers: PayrollExportReadinessBlocker[] };

  constructor(blockers: PayrollExportReadinessBlocker[]) {
    super(
      `Payroll export is blocked by ${blockers.length} unresolved timekeeping control ` +
        `${blockers.length === 1 ? "issue" : "issues"}. Resolve certification, approval, and correction blockers before export.`,
    );
    this.name = "PayrollExportReadinessError";
    this.details = { blockers };
  }
}

// ---------------------------------------------------------------------------
// CSV building
// ---------------------------------------------------------------------------

/**
 * The Gusto CSV column order MUST match the legacy
 * GET /api/timekeeping/admin/export/gusto route output, byte-for-byte.
 * If this header changes, the legacy delegation wrapper's wire compatibility
 * is broken.
 */
const GUSTO_CSV_HEADER =
  "first_name,last_name,regular_hours,overtime_hours,double_overtime_hours,sick_hours,vacation_hours";
const TIMETRAKGO_GUSTO_CSV_HEADER =
  "first_name,last_name,ssn,gusto_employee_id,regular_hours,overtime_hours,double_overtime_hours,sick_hours,vacation_hours";

function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export interface PayrollExportRowSnapshot {
  /** timekeeping.employees.id (the same employee_id used elsewhere in this schema). */
  employeeId: number;
  /** public.employees.id, for cross-system identity resolution. */
  epochEmployeeId: number | null;
  employeeFirstNameSnapshot: string;
  employeeLastNameSnapshot: string;
  employeeNumberSnapshot: string | null;
  employeeEmailSnapshot: string | null;
  regularHours: number;
  overtimeHours: number;
  doubleOvertimeHours: number;
  sickHours: number;
  vacationHours: number;
  sourceTimesheetIds: number[];
  sourceLeaveEntryIds: number[];
}

// ---------------------------------------------------------------------------
// Snapshot data source — abstraction so tests can inject fakes and the
// production path can use the active SERIALIZABLE transaction client.
// ---------------------------------------------------------------------------

export interface PayrollSnapshotTimesheet {
  id: number;
  employeeId: number;
  regularHours: number;
  overtimeHours: number;
}
export interface PayrollSnapshotLeaveEntry {
  id: number;
  employeeId: number;
  leaveType: "pto" | "sick" | string;
  hours: number;
}
export interface PayrollSnapshotEmployee {
  /** timekeeping.employees.id */
  timekeepingId: number;
  /** public.employees.id */
  epochEmployeeId: number;
  firstName: string;
  lastName: string;
  employeeCode: string | null;
  email: string | null;
}

export interface PayrollSnapshotDataSource {
  fetchTimesheets(periodStart: string, periodEnd: string): Promise<PayrollSnapshotTimesheet[]>;
  fetchLeaveEntries(periodStart: string, periodEnd: string): Promise<PayrollSnapshotLeaveEntry[]>;
  fetchEmployees(employeeIds: number[]): Promise<PayrollSnapshotEmployee[]>;
  fetchPayrollReadinessBlockers?(
    periodStart: string,
    periodEnd: string,
  ): Promise<PayrollExportReadinessBlocker[]>;
}

/**
 * Drizzle / node-postgres implementation backed by a transaction client (or db).
 * MUST be called with the same `tx` used by the surrounding transaction so all
 * reads see the same snapshot as the inserts.
 */
type DbOrTx = typeof db;
function txDataSource(client: DbOrTx): PayrollSnapshotDataSource {
  return {
    async fetchTimesheets(periodStart, periodEnd) {
      const rows = await client
        .select({
          id: timesheetsTable.id,
          employeeId: timesheetsTable.employeeId,
          regularHours: timesheetsTable.regularHours,
          overtimeHours: timesheetsTable.overtimeHours,
        })
        .from(timesheetsTable)
        .where(
          and(
            or(eq(timesheetsTable.status, "certified"), eq(timesheetsTable.status, "locked")),
            gte(timesheetsTable.periodStart, periodStart),
            lte(timesheetsTable.periodEnd, periodEnd),
          ),
        );
      return rows.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        regularHours: Number(r.regularHours),
        overtimeHours: Number(r.overtimeHours),
      }));
    },
    async fetchLeaveEntries(periodStart, periodEnd) {
      const rows = await client
        .select({
          id: leaveEntriesTable.id,
          employeeId: leaveEntriesTable.employeeId,
          leaveType: leaveEntriesTable.leaveType,
          hours: leaveEntriesTable.hours,
        })
        .from(leaveEntriesTable)
        .innerJoin(
          timeOffRequestsTable,
          and(
            eq(timeOffRequestsTable.id, leaveEntriesTable.sourceRequestId),
            eq(timeOffRequestsTable.status, "approved"),
          ),
        )
        .where(
          and(
            gte(leaveEntriesTable.date, periodStart),
            lte(leaveEntriesTable.date, periodEnd),
            sql`${leaveEntriesTable.voidedAt} IS NULL`,
            inArray(leaveEntriesTable.leaveType, ["pto", "sick"]),
          ),
        );
      return rows.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        leaveType: r.leaveType,
        hours: Number(r.hours),
      }));
    },
    async fetchEmployees(employeeIds) {
      if (employeeIds.length === 0) return [];
      const tkRows = await client
        .select({
          id: employeesTable.id,
          epochEmployeeId: employeesTable.epochEmployeeId,
        })
        .from(employeesTable)
        .where(inArray(employeesTable.id, employeeIds));
      const epochIds = tkRows
        .map((r) => r.epochEmployeeId)
        .filter((v): v is number => typeof v === "number");
      if (epochIds.length === 0) return [];
      const pubRows = await client
        .select({
          id: publicEmployeesTable.id,
          name: publicEmployeesTable.name,
          email: publicEmployeesTable.email,
          employeeCode: publicEmployeesTable.employeeCode,
        })
        .from(publicEmployeesTable)
        .where(inArray(publicEmployeesTable.id, epochIds));
      const pubByEpochId = new Map(pubRows.map((p) => [p.id, p]));
      const out: PayrollSnapshotEmployee[] = [];
      for (const tk of tkRows) {
        if (tk.epochEmployeeId == null) continue;
        const pub = pubByEpochId.get(tk.epochEmployeeId);
        if (!pub) continue;
        const { firstName, lastName } = splitName(pub.name);
        out.push({
          timekeepingId: tk.id,
          epochEmployeeId: tk.epochEmployeeId,
          firstName,
          lastName,
          employeeCode: pub.employeeCode ?? null,
          email: pub.email ?? null,
        });
      }
      return out;
    },
    async fetchPayrollReadinessBlockers(periodStart, periodEnd) {
      const result = await client.execute(sql`
        WITH period_timesheets AS (
          SELECT
            id,
            employee_id,
            status,
            total_hours,
            employee_attested,
            attested_at,
            certification_statement,
            certification_version,
            reviewed_at,
            reviewed_by
          FROM timekeeping.timesheets
          WHERE period_start >= ${periodStart}
            AND period_end <= ${periodEnd}
        ),
        blockers AS (
          SELECT
            'TIMESHEET_NOT_READY'::text AS code,
            employee_id,
            id AS timesheet_id,
            status,
            'Timesheet has recorded hours but is not certified or locked.'::text AS message
          FROM period_timesheets
          WHERE status NOT IN ('certified', 'locked')
            AND COALESCE(total_hours, 0) > 0

          UNION ALL

          SELECT
            'MISSING_EMPLOYEE_ATTESTATION'::text AS code,
            employee_id,
            id AS timesheet_id,
            status,
            'Certified/locked timesheet is missing employee attestation evidence.'::text AS message
          FROM period_timesheets
          WHERE status IN ('certified', 'locked')
            AND (
              employee_attested IS DISTINCT FROM TRUE
              OR attested_at IS NULL
              OR certification_statement IS NULL
              OR BTRIM(certification_statement) = ''
              OR certification_version IS NULL
            )

          UNION ALL

          SELECT
            'MISSING_SUPERVISOR_APPROVAL'::text AS code,
            employee_id,
            id AS timesheet_id,
            status,
            'Certified/locked timesheet is missing supervisor review evidence.'::text AS message
          FROM period_timesheets
          WHERE status IN ('certified', 'locked')
            AND (reviewed_at IS NULL OR reviewed_by IS NULL)

          UNION ALL

          SELECT
            'OPEN_TIMESHEET_CORRECTION'::text AS code,
            pt.employee_id,
            pt.id AS timesheet_id,
            pt.status,
            'Timesheet has an unresolved correction request.'::text AS message
          FROM period_timesheets pt
          JOIN timekeeping.timesheet_corrections tc
            ON tc.timesheet_id = pt.id
          WHERE tc.status NOT IN ('approved', 'rejected')
        )
        SELECT code, employee_id, timesheet_id, status, message
        FROM blockers
        ORDER BY employee_id, timesheet_id, code
      `);
      const rows = ((result as { rows?: unknown[] }).rows ?? result) as Array<{
        code: PayrollExportReadinessBlocker["code"];
        employee_id: number;
        timesheet_id: number;
        status: string | null;
        message: string;
      }>;
      return rows.map((row) => ({
        code: row.code,
        employeeId: Number(row.employee_id),
        timesheetId: Number(row.timesheet_id),
        status: row.status,
        message: row.message,
      }));
    },
  };
}

function assertFiniteNonNegative(value: number, field: string, context: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new InvalidHourValueError(field, value, context);
  }
}

async function assertPayrollExportReady(
  dataSource: PayrollSnapshotDataSource,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const blockers = dataSource.fetchPayrollReadinessBlockers
    ? await dataSource.fetchPayrollReadinessBlockers(periodStart, periodEnd)
    : [];
  if (blockers.length > 0) {
    throw new PayrollExportReadinessError(blockers);
  }
}

/**
 * Build the per-employee snapshot rows for a full pay period.  Pulls timesheets,
 * leave entries, and employees through the supplied data source.  Every output
 * row is anchored to a real timekeeping.employees.id; an unresolved id throws
 * UnresolvableEmployeeError.  All hour values are validated finite + non-negative.
 */
export async function buildPayrollSnapshotForPeriod(
  dataSource: PayrollSnapshotDataSource,
  periodStart: string,
  periodEnd: string,
): Promise<{
  rows: PayrollExportRowSnapshot[];
  sourceTimesheetIds: number[];
  sourceLeaveEntryIds: number[];
}> {
  const [timesheets, leaveEntries] = await Promise.all([
    dataSource.fetchTimesheets(periodStart, periodEnd),
    dataSource.fetchLeaveEntries(periodStart, periodEnd),
  ]);

  // Aggregate worked hours and source ids by employee_id.
  const workedByEmployee = new Map<
    number,
    { regularHours: number; overtimeHours: number; tsIds: number[] }
  >();
  for (const ts of timesheets) {
    assertFiniteNonNegative(ts.regularHours, "regular_hours", `timesheet id=${ts.id}`);
    assertFiniteNonNegative(ts.overtimeHours, "overtime_hours", `timesheet id=${ts.id}`);
    const cur = workedByEmployee.get(ts.employeeId) ?? {
      regularHours: 0,
      overtimeHours: 0,
      tsIds: [],
    };
    cur.regularHours += ts.regularHours;
    cur.overtimeHours += ts.overtimeHours;
    cur.tsIds.push(ts.id);
    workedByEmployee.set(ts.employeeId, cur);
  }

  // Aggregate leave hours and source ids by employee_id.
  const leaveByEmployee = new Map<
    number,
    { sickHours: number; vacationHours: number; leaveIds: number[] }
  >();
  for (const le of leaveEntries) {
    assertFiniteNonNegative(le.hours, "leave_hours", `leave_entry id=${le.id}`);
    const cur = leaveByEmployee.get(le.employeeId) ?? {
      sickHours: 0,
      vacationHours: 0,
      leaveIds: [],
    };
    if (le.leaveType === "sick") cur.sickHours += le.hours;
    else if (le.leaveType === "pto") cur.vacationHours += le.hours;
    cur.leaveIds.push(le.id);
    leaveByEmployee.set(le.employeeId, cur);
  }

  // Resolve identities for every employee_id that appears in either map.
  const allEmployeeIds = Array.from(
    new Set<number>([...workedByEmployee.keys(), ...leaveByEmployee.keys()]),
  );
  const employees = await dataSource.fetchEmployees(allEmployeeIds);
  const employeeById = new Map<number, PayrollSnapshotEmployee>();
  for (const e of employees) employeeById.set(e.timekeepingId, e);

  const rows: PayrollExportRowSnapshot[] = [];
  for (const empId of allEmployeeIds) {
    const emp = employeeById.get(empId);
    if (!emp) {
      throw new UnresolvableEmployeeError(
        empId,
        `period ${periodStart}..${periodEnd}; no public.employees row joined via timekeeping.employees.id=${empId}`,
      );
    }
    const worked = workedByEmployee.get(empId) ?? { regularHours: 0, overtimeHours: 0, tsIds: [] };
    const leave = leaveByEmployee.get(empId) ?? { sickHours: 0, vacationHours: 0, leaveIds: [] };
    rows.push({
      employeeId: empId,
      epochEmployeeId: emp.epochEmployeeId,
      employeeFirstNameSnapshot: emp.firstName,
      employeeLastNameSnapshot: emp.lastName,
      employeeNumberSnapshot: emp.employeeCode,
      employeeEmailSnapshot: emp.email,
      regularHours: worked.regularHours,
      overtimeHours: worked.overtimeHours,
      doubleOvertimeHours: 0,
      sickHours: leave.sickHours,
      vacationHours: leave.vacationHours,
      sourceTimesheetIds: worked.tsIds.slice().sort((a, b) => a - b),
      sourceLeaveEntryIds: leave.leaveIds.slice().sort((a, b) => a - b),
    });
  }

  // Stable sort so CSV bytes are deterministic across runs.
  rows.sort((a, b) =>
    (a.employeeLastNameSnapshot + a.employeeFirstNameSnapshot).localeCompare(
      b.employeeLastNameSnapshot + b.employeeFirstNameSnapshot,
    ),
  );

  const allTsIds = Array.from(new Set(timesheets.map((t) => t.id))).sort((a, b) => a - b);
  const allLeaveIds = Array.from(new Set(leaveEntries.map((l) => l.id))).sort((a, b) => a - b);

  return { rows, sourceTimesheetIds: allTsIds, sourceLeaveEntryIds: allLeaveIds };
}

export function renderGustoCsv(rows: PayrollExportRowSnapshot[]): string {
  const lines = rows.map((r) =>
    [
      r.employeeFirstNameSnapshot,
      r.employeeLastNameSnapshot,
      r.regularHours,
      r.overtimeHours,
      r.doubleOvertimeHours,
      r.sickHours,
      r.vacationHours,
    ]
      .map(csvField)
      .join(","),
  );
  return [GUSTO_CSV_HEADER, ...lines].join("\n");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[#%]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readField(row: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    for (const [key, value] of Object.entries(row)) {
      if (normalizeHeader(key) === normalizedAlias && value != null) {
        return String(value).trim();
      }
    }
  }
  return "";
}

function parseHours(raw: string, field: string, rowNumber: number): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) {
    throw new PayrollImportParseError(
      `Invalid ${field} value "${raw}" on row ${rowNumber}. Hour values must be finite, non-negative numbers.`,
    );
  }
  return value;
}

function normalizeNamePart(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function splitUploadedName(row: Record<string, unknown>): { firstName: string; lastName: string } {
  const firstName = readField(row, ["first_name", "first name", "First Name"]);
  const lastName = readField(row, ["last_name", "last name", "Last Name"]);
  if (firstName || lastName) return { firstName, lastName };

  const fullName = readField(row, ["employee", "employee name", "name"]);
  if (!fullName) return { firstName: "", lastName: "" };
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: "", lastName: parts[0]! };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1]!,
  };
}

export interface TimeTrakGoImportPreviewRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  ssn: string | null;
  gustoEmployeeId: string | null;
  employeeNumber: string | null;
  email: string | null;
  regularHours: number;
  overtimeHours: number;
  doubleOvertimeHours: number;
  sickHours: number;
  vacationHours: number;
}

export function parseTimeTrakGoGustoCsv(csvContent: string): TimeTrakGoImportPreviewRow[] {
  const trimmed = csvContent.trim();
  if (!trimmed) throw new PayrollImportParseError("CSV content is required.");

  const parsed = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!;
    throw new PayrollImportParseError(`CSV parse failed near row ${first.row ?? "unknown"}: ${first.message}`);
  }

  const rows = parsed.data
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => Object.values(row).some((value) => String(value ?? "").trim().length > 0));

  if (rows.length === 0) throw new PayrollImportParseError("CSV contains no payroll rows.");

  return rows.map(({ row, rowNumber }) => {
    const { firstName, lastName } = splitUploadedName(row);
    if (!firstName || !lastName) {
      throw new PayrollImportParseError(
        `Row ${rowNumber} must include first/last name columns or an employee name column.`,
      );
    }

    return {
      rowNumber,
      firstName,
      lastName,
      ssn: readField(row, ["ssn", "social security number"]) || null,
      gustoEmployeeId: readField(row, ["gusto_employee_id", "gusto employee id", "gusto id"]) || null,
      employeeNumber: readField(row, [
        "employee_number",
        "employee number",
        "employee_id",
        "employee id",
        "employee code",
      ]) || null,
      email: readField(row, ["email", "employee email", "email address"]) || null,
      regularHours: parseHours(
        readField(row, ["regular_hours", "regular hours", "regular hrs", "regular"]),
        "regular hours",
        rowNumber,
      ),
      overtimeHours: parseHours(
        readField(row, ["overtime_hours", "overtime hours", "overtime hrs", "overtime", "ot hours", "ot hrs", "ot"]),
        "overtime hours",
        rowNumber,
      ),
      doubleOvertimeHours: parseHours(
        readField(row, ["double_overtime_hours", "double overtime hours", "double overtime hrs", "double overtime", "double ot hours", "double ot hrs", "dot"]),
        "double overtime hours",
        rowNumber,
      ),
      sickHours: parseHours(readField(row, ["sick_hours", "sick hours", "sick hrs", "sick"]), "sick hours", rowNumber),
      vacationHours: parseHours(
        readField(row, ["vacation_hours", "vacation hours", "vacation hrs", "vacation", "pto", "pto hours", "pto hrs"]),
        "vacation hours",
        rowNumber,
      ),
    };
  });
}

export function renderTimeTrakGoGustoCsv(rows: TimeTrakGoImportPreviewRow[]): string {
  const lines = rows.map((r) =>
    [
      r.firstName,
      r.lastName,
      r.ssn ?? "",
      r.gustoEmployeeId ?? "",
      r.regularHours,
      r.overtimeHours,
      r.doubleOvertimeHours,
      r.sickHours,
      r.vacationHours,
    ]
      .map(csvField)
      .join(","),
  );
  return [TIMETRAKGO_GUSTO_CSV_HEADER, ...lines].join("\n");
}

async function resolveImportedRows(
  rows: TimeTrakGoImportPreviewRow[],
): Promise<PayrollExportRowSnapshot[]> {
  const resolvedEmployees = (await listResolvedEmployees()).filter((e) => e.timekeepingId != null);
  const byCode = new Map<string, typeof resolvedEmployees>();
  const byEmail = new Map<string, typeof resolvedEmployees>();
  const byName = new Map<string, typeof resolvedEmployees>();

  function push(map: Map<string, typeof resolvedEmployees>, key: string | null | undefined, employee: typeof resolvedEmployees[number]) {
    const normalized = key?.trim().toLowerCase();
    if (!normalized) return;
    map.set(normalized, [...(map.get(normalized) ?? []), employee]);
  }

  for (const employee of resolvedEmployees) {
    push(byCode, employee.employeeCode, employee);
    push(byEmail, employee.email, employee);
    push(
      byName,
      `${normalizeNamePart(employee.firstName)}|${normalizeNamePart(employee.lastName)}`,
      employee,
    );
  }

  const errors: Array<{ rowNumber: number; employee: string; reason: string }> = [];
  const snapshots: PayrollExportRowSnapshot[] = [];

  for (const row of rows) {
    const candidates =
      (row.employeeNumber ? byCode.get(row.employeeNumber.trim().toLowerCase()) : undefined) ??
      (row.email ? byEmail.get(row.email.trim().toLowerCase()) : undefined) ??
      byName.get(`${normalizeNamePart(row.firstName)}|${normalizeNamePart(row.lastName)}`) ??
      [];

    if (candidates.length !== 1) {
      errors.push({
        rowNumber: row.rowNumber,
        employee: `${row.firstName} ${row.lastName}`,
        reason: candidates.length === 0 ? "No matching EPOCH timekeeping employee" : "Multiple matching employees",
      });
      continue;
    }

    const employee = candidates[0]!;
    snapshots.push({
      employeeId: employee.timekeepingId!,
      epochEmployeeId: employee.epochEmployeeId ?? null,
      employeeFirstNameSnapshot: employee.firstName,
      employeeLastNameSnapshot: employee.lastName,
      employeeNumberSnapshot: employee.employeeCode,
      employeeEmailSnapshot: employee.email,
      regularHours: row.regularHours,
      overtimeHours: row.overtimeHours,
      doubleOvertimeHours: row.doubleOvertimeHours,
      sickHours: row.sickHours,
      vacationHours: row.vacationHours,
      sourceTimesheetIds: [],
      sourceLeaveEntryIds: [],
    });
  }

  if (errors.length > 0) {
    throw new PayrollImportEmployeeMatchError(
      "One or more TimeTrakGo rows could not be matched to a unique EPOCH timekeeping employee.",
      errors,
    );
  }

  const seen = new Set<number>();
  const duplicates: string[] = [];
  for (const row of snapshots) {
    if (seen.has(row.employeeId)) {
      duplicates.push(`${row.employeeFirstNameSnapshot} ${row.employeeLastNameSnapshot}`);
    }
    seen.add(row.employeeId);
  }
  if (duplicates.length > 0) {
    throw new PayrollImportEmployeeMatchError(
      "The import contains duplicate payroll rows for the same EPOCH employee.",
      duplicates,
    );
  }

  snapshots.sort((a, b) =>
    (a.employeeLastNameSnapshot + a.employeeFirstNameSnapshot).localeCompare(
      b.employeeLastNameSnapshot + b.employeeFirstNameSnapshot,
    ),
  );
  return snapshots;
}

// ---------------------------------------------------------------------------
// SERIALIZABLE wrapper with retry on 40001
// ---------------------------------------------------------------------------

interface PgErrorLike {
  code?: string;
}

const SERIALIZATION_FAILURE = "40001";
const UNIQUE_VIOLATION = "23505";

/**
 * Run `fn` inside a SERIALIZABLE Postgres transaction.  The callback receives
 * the tx client and MUST use it for all queries — using the module-level `db`
 * inside the callback would leak queries onto the pool and break atomicity.
 *
 * Genuine serialization failures (Postgres 40001) are retried up to maxRetries
 * with linear backoff.  Any other error (including 23505 unique violations)
 * propagates immediately so callers can decide policy.
 */
async function withSerializableRetry<T>(
  fn: (tx: DbOrTx) => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.transaction((tx) => fn(tx as DbOrTx), { isolationLevel: "serializable" });
    } catch (err) {
      lastErr = err;
      const code = (err as PgErrorLike)?.code;
      if (code === SERIALIZATION_FAILURE && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 25 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CreateRegularFullPeriodBatchResult {
  batchId: number;
  revisionNumber: number;
  csvChecksum: string;
  rowCount: number;
  employeeCount: number;
  supersededBatchId: number | null;
}

export interface CreateRegularFullPeriodBatchInput {
  periodStart: string;
  periodEnd: string;
  actor: AuditActor;
  /**
   * Required when a prior unprocessed `active` batch exists for the period —
   * this becomes the supersede reason on both the old batch and the audit event.
   * Trimmed; if empty / missing, SupersedeReasonRequiredError is thrown.
   */
  supersedeReason?: string;
  /**
   * Test seam — if provided, used in place of the tx-derived data source.
   * Production callers should NOT pass this; the production path always builds
   * the data source from the active SERIALIZABLE transaction client.
   */
  dataSourceOverride?: PayrollSnapshotDataSource;
}

export interface ImportTimeTrakGoGustoCsvInput {
  periodStart: string;
  periodEnd: string;
  csvContent: string;
  actor: AuditActor;
  supersedeReason?: string;
  sourceFileName?: string | null;
  /**
   * Test seam for readiness gating. Production import callers should not pass
   * this; they always evaluate readiness from the transaction data source.
   */
  dataSourceOverride?: PayrollSnapshotDataSource;
}

function requireActorId(actor: AuditActor): number {
  if (actor.id == null) throw new MissingActorError();
  return actor.id;
}

/**
 * Phase 1 entry point — create a regular_full_period batch.  If an active batch
 * already exists for the same (period_start, period_end, 'regular_full_period'),
 * supersede it and bump the revision number — but ONLY when the caller provides
 * a non-empty supersedeReason.  If the prior batch is processed, throw
 * ProcessedBatchImmutableError (HTTP 409).  Concurrent active-batch insert
 * conflicts surface as ConcurrentExportConflictError (HTTP 409); they are NOT
 * silently retried by superseding the sibling concurrent request.
 */
export async function createRegularFullPeriodBatch(
  input: CreateRegularFullPeriodBatchInput,
): Promise<CreateRegularFullPeriodBatchResult> {
  const actorId = requireActorId(input.actor);
  const supersedeReasonTrimmed = input.supersedeReason?.trim() ?? "";

  return await withSerializableRetry(async (tx) => {
    // Build the snapshot data source from the tx so all reads see the same
    // SERIALIZABLE snapshot as the supersede + insert pair.
    const dataSource = input.dataSourceOverride ?? txDataSource(tx);
    await assertPayrollExportReady(dataSource, input.periodStart, input.periodEnd);

    // Look up prior batches for this (period, regular_full_period).  At most one
    // active or processed; many superseded revisions possible.
    const prior = await tx
      .select()
      .from(payrollExportBatchesTable)
      .where(
        and(
          eq(payrollExportBatchesTable.periodStart, input.periodStart),
          eq(payrollExportBatchesTable.periodEnd, input.periodEnd),
          eq(payrollExportBatchesTable.exportType, "regular_full_period"),
        ),
      )
      .orderBy(desc(payrollExportBatchesTable.revisionNumber));

    let supersededBatchId: number | null = null;
    let nextRevision = 1;

    if (prior.length > 0) {
      const top = prior[0];
      nextRevision = top.revisionNumber + 1;

      // Phase 1 immutability rule — a processed batch terminates this period.
      const processedBatch = prior.find((b) => b.status === "processed");
      if (processedBatch) {
        throw new ProcessedBatchImmutableError(processedBatch.id);
      }

      const activeBatch = prior.find((b) => b.status === "active") ?? null;
      if (activeBatch) {
        if (supersedeReasonTrimmed.length === 0) {
          throw new SupersedeReasonRequiredError(activeBatch.id, activeBatch.revisionNumber);
        }
        await tx
          .update(payrollExportBatchesTable)
          .set({ status: "superseded", supersededReason: supersedeReasonTrimmed })
          .where(eq(payrollExportBatchesTable.id, activeBatch.id));

        await tx.insert(payrollExportEventsTable).values({
          batchId: activeBatch.id,
          eventType: "BATCH_SUPERSEDED",
          actorId,
          actorEmail: input.actor.email,
          actorRole: input.actor.role,
          reason: supersedeReasonTrimmed,
          metadata: {
            supersededByRevision: nextRevision,
            previousRevision: activeBatch.revisionNumber,
          },
          ipAddress: input.actor.ip,
        });

        supersededBatchId = activeBatch.id;
      }
    }

    // Build snapshot, render, checksum — all inside the tx so source data is
    // consistent with the supersede + insert that happen in the same connection.
    const { rows, sourceTimesheetIds, sourceLeaveEntryIds } = await buildPayrollSnapshotForPeriod(
      dataSource,
      input.periodStart,
      input.periodEnd,
    );

    const csvContent = renderGustoCsv(rows);
    const csvChecksum = sha256Hex(csvContent);

    const totalRegularHours = rows.reduce((s, r) => s + r.regularHours, 0);
    const totalOvertimeHours = rows.reduce((s, r) => s + r.overtimeHours, 0);
    const totalSickHours = rows.reduce((s, r) => s + r.sickHours, 0);
    const totalVacationHours = rows.reduce((s, r) => s + r.vacationHours, 0);

    // Final paranoia check — rows might be empty (no certified timesheets) but
    // totals must still be finite + non-negative.
    assertFiniteNonNegative(totalRegularHours, "total_regular_hours", "batch totals");
    assertFiniteNonNegative(totalOvertimeHours, "total_overtime_hours", "batch totals");
    assertFiniteNonNegative(totalSickHours, "total_sick_hours", "batch totals");
    assertFiniteNonNegative(totalVacationHours, "total_vacation_hours", "batch totals");

    let inserted: PayrollExportBatch;
    try {
      const [row] = await tx
        .insert(payrollExportBatchesTable)
        .values({
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          exportType: "regular_full_period",
          revisionNumber: nextRevision,
          status: "active",
          exportFormat: "gusto_csv",
          csvContent,
          csvChecksum,
          rowCount: rows.length,
          employeeCount: rows.length,
          totalRegularHours,
          totalOvertimeHours,
          totalSickHours,
          totalVacationHours,
          includesAdjustments: false,
          adjustmentIds: null,
          sourceTimesheetIds,
          sourceLeaveEntryIds,
          supersedesBatchId: supersededBatchId,
          createdBy: actorId,
        })
        .returning();
      inserted = row;
    } catch (err) {
      // Partial unique index `idx_export_batches_active_unique` rejects a
      // concurrent active batch with 23505.  Surface as a 409 so the caller
      // can decide whether to fetch the winning sibling and supersede it
      // explicitly with a human reason — never silently supersede.
      if ((err as PgErrorLike)?.code === UNIQUE_VIOLATION) {
        throw new ConcurrentExportConflictError(input.periodStart, input.periodEnd);
      }
      throw err;
    }

    if (rows.length > 0) {
      await tx.insert(payrollExportRowsTable).values(
        rows.map((r) => ({
          batchId: inserted.id,
          employeeId: r.employeeId,
          epochEmployeeId: r.epochEmployeeId,
          employeeFirstNameSnapshot: r.employeeFirstNameSnapshot,
          employeeLastNameSnapshot: r.employeeLastNameSnapshot,
          employeeNumberSnapshot: r.employeeNumberSnapshot,
          employeeEmailSnapshot: r.employeeEmailSnapshot,
          regularHours: r.regularHours,
          overtimeHours: r.overtimeHours,
          doubleOvertimeHours: r.doubleOvertimeHours,
          sickHours: r.sickHours,
          vacationHours: r.vacationHours,
          sourceTimesheetIds: r.sourceTimesheetIds,
          sourceLeaveEntryIds: r.sourceLeaveEntryIds,
          adjustmentIds: null,
        })),
      );
    }

    await tx.insert(payrollExportEventsTable).values({
      batchId: inserted.id,
      eventType: "BATCH_CREATED",
      actorId,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      reason: supersededBatchId != null ? supersedeReasonTrimmed : null,
      metadata: {
        revisionNumber: nextRevision,
        supersededBatchId,
        rowCount: rows.length,
        csvChecksum,
      },
      ipAddress: input.actor.ip,
    });

    // Task #85: also emit through the unified, hash-chained audit ledger.
    // Fail-closed and transactionally coupled: we pass `tx` so the chain
    // row commits or rolls back atomically with the payroll batch row.
    // A ledger emit failure aborts the export — by design — because a
    // batch that lacks compliance evidence violates the constitution's
    // single-integrity-verifiable-timeline rule (constitution §8).
    await recordAuditEvent(
      {
        eventType: "PAYROLL_EXPORT_CREATED",
        subjectType: "payroll_export_batch",
        subjectId: String(inserted.id),
        sourceService: "payrollExport.service",
        actor: {
          id: actorId,
          username: input.actor.email,
          role: input.actor.role,
        },
        ipAddress: input.actor.ip ?? null,
        payload: {
          batchId: inserted.id,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          revisionNumber: nextRevision,
          supersededBatchId,
          rowCount: rows.length,
          csvChecksum,
        },
        reason: supersededBatchId != null ? supersedeReasonTrimmed : null,
      },
      tx as Parameters<typeof recordAuditEvent>[1],
    );

    return {
      batchId: inserted.id,
      revisionNumber: nextRevision,
      csvChecksum,
      rowCount: rows.length,
      employeeCount: rows.length,
      supersededBatchId,
    };
  });
}

export async function importTimeTrakGoGustoCsvBatch(
  input: ImportTimeTrakGoGustoCsvInput,
): Promise<CreateRegularFullPeriodBatchResult> {
  const actorId = requireActorId(input.actor);
  const supersedeReasonTrimmed = input.supersedeReason?.trim() ?? "";
  const parsedRows = parseTimeTrakGoGustoCsv(input.csvContent);
  const rows = await resolveImportedRows(parsedRows);

  return await withSerializableRetry(async (tx) => {
    const dataSource = input.dataSourceOverride ?? txDataSource(tx);
    await assertPayrollExportReady(dataSource, input.periodStart, input.periodEnd);

    const prior = await tx
      .select()
      .from(payrollExportBatchesTable)
      .where(
        and(
          eq(payrollExportBatchesTable.periodStart, input.periodStart),
          eq(payrollExportBatchesTable.periodEnd, input.periodEnd),
          eq(payrollExportBatchesTable.exportType, "regular_full_period"),
        ),
      )
      .orderBy(desc(payrollExportBatchesTable.revisionNumber));

    let supersededBatchId: number | null = null;
    let nextRevision = 1;

    if (prior.length > 0) {
      const top = prior[0];
      nextRevision = top.revisionNumber + 1;

      const processedBatch = prior.find((b) => b.status === "processed");
      if (processedBatch) throw new ProcessedBatchImmutableError(processedBatch.id);

      const activeBatch = prior.find((b) => b.status === "active") ?? null;
      if (activeBatch) {
        if (supersedeReasonTrimmed.length === 0) {
          throw new SupersedeReasonRequiredError(activeBatch.id, activeBatch.revisionNumber);
        }
        await tx
          .update(payrollExportBatchesTable)
          .set({ status: "superseded", supersededReason: supersedeReasonTrimmed })
          .where(eq(payrollExportBatchesTable.id, activeBatch.id));
        await tx.insert(payrollExportEventsTable).values({
          batchId: activeBatch.id,
          eventType: "BATCH_SUPERSEDED",
          actorId,
          actorEmail: input.actor.email,
          actorRole: input.actor.role,
          reason: supersedeReasonTrimmed,
          metadata: {
            supersededByRevision: nextRevision,
            previousRevision: activeBatch.revisionNumber,
            supersededByImportSource: "timetrakgo",
          },
          ipAddress: input.actor.ip,
        });
        supersededBatchId = activeBatch.id;
      }
    }

    const csvContent = renderTimeTrakGoGustoCsv(parsedRows);
    const csvChecksum = sha256Hex(csvContent);
    const totalRegularHours = rows.reduce((s, r) => s + r.regularHours, 0);
    const totalOvertimeHours = rows.reduce((s, r) => s + r.overtimeHours, 0);
    const totalSickHours = rows.reduce((s, r) => s + r.sickHours, 0);
    const totalVacationHours = rows.reduce((s, r) => s + r.vacationHours, 0);

    let inserted: PayrollExportBatch;
    try {
      const [row] = await tx
        .insert(payrollExportBatchesTable)
        .values({
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          exportType: "regular_full_period",
          revisionNumber: nextRevision,
          status: "active",
          exportFormat: "timetrakgo_gusto_csv",
          csvContent,
          csvChecksum,
          rowCount: rows.length,
          employeeCount: rows.length,
          totalRegularHours,
          totalOvertimeHours,
          totalSickHours,
          totalVacationHours,
          includesAdjustments: false,
          adjustmentIds: null,
          sourceTimesheetIds: [],
          sourceLeaveEntryIds: [],
          supersedesBatchId: supersededBatchId,
          createdBy: actorId,
        })
        .returning();
      inserted = row;
    } catch (err) {
      if ((err as PgErrorLike)?.code === UNIQUE_VIOLATION) {
        throw new ConcurrentExportConflictError(input.periodStart, input.periodEnd);
      }
      throw err;
    }

    await tx.insert(payrollExportRowsTable).values(
      rows.map((r) => ({
        batchId: inserted.id,
        employeeId: r.employeeId,
        epochEmployeeId: r.epochEmployeeId,
        employeeFirstNameSnapshot: r.employeeFirstNameSnapshot,
        employeeLastNameSnapshot: r.employeeLastNameSnapshot,
        employeeNumberSnapshot: r.employeeNumberSnapshot,
        employeeEmailSnapshot: r.employeeEmailSnapshot,
        regularHours: r.regularHours,
        overtimeHours: r.overtimeHours,
        doubleOvertimeHours: r.doubleOvertimeHours,
        sickHours: r.sickHours,
        vacationHours: r.vacationHours,
        sourceTimesheetIds: [],
        sourceLeaveEntryIds: [],
        adjustmentIds: null,
      })),
    );

    await tx.insert(payrollExportEventsTable).values({
      batchId: inserted.id,
      eventType: "BATCH_CREATED",
      actorId,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      reason: supersededBatchId != null ? supersedeReasonTrimmed : null,
      metadata: {
        revisionNumber: nextRevision,
        supersededBatchId,
        rowCount: rows.length,
        csvChecksum,
        importSource: "timetrakgo",
        sourceFileName: input.sourceFileName ?? null,
        uploadedRowNumbers: parsedRows.map((r) => r.rowNumber),
      },
      ipAddress: input.actor.ip,
    });

    await recordAuditEvent(
      {
        eventType: "PAYROLL_EXPORT_IMPORTED",
        subjectType: "payroll_export_batch",
        subjectId: String(inserted.id),
        sourceService: "payrollExport.service",
        actor: {
          id: actorId,
          username: input.actor.email,
          role: input.actor.role,
        },
        ipAddress: input.actor.ip ?? null,
        payload: {
          batchId: inserted.id,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          revisionNumber: nextRevision,
          supersededBatchId,
          rowCount: rows.length,
          csvChecksum,
          importSource: "timetrakgo",
          sourceFileName: input.sourceFileName ?? null,
        },
        reason: supersededBatchId != null ? supersedeReasonTrimmed : null,
      },
      tx as Parameters<typeof recordAuditEvent>[1],
    );

    return {
      batchId: inserted.id,
      revisionNumber: nextRevision,
      csvChecksum,
      rowCount: rows.length,
      employeeCount: rows.length,
      supersededBatchId,
    };
  });
}

export async function getBatch(batchId: number): Promise<{
  batch: PayrollExportBatch;
  rows: PayrollExportRow[];
} | null> {
  const [batch] = await db
    .select()
    .from(payrollExportBatchesTable)
    .where(eq(payrollExportBatchesTable.id, batchId))
    .limit(1);
  if (!batch) return null;
  const rows = await db
    .select()
    .from(payrollExportRowsTable)
    .where(eq(payrollExportRowsTable.batchId, batchId));
  return { batch, rows };
}

/**
 * Re-download a previously-stored CSV.  Verifies the SHA-256 checksum before
 * returning the bytes.  No recalculation; bytes are served from `csv_content`
 * exactly as they were at export time.
 *
 * Superseded and voided batches are NOT downloadable as current exports —
 * a payroll admin downloading an outdated CSV and uploading it to Gusto is a
 * real-money error.  Pass `evidenceOnly: true` to override and serve the
 * historical CSV as audit evidence; the audit event records the override.
 */
export async function downloadBatchCsv(input: {
  batchId: number;
  actor: AuditActor;
  evidenceOnly?: boolean;
}): Promise<{ batch: PayrollExportBatch; csvContent: string; evidenceOnly: boolean }> {
  const actorId = requireActorId(input.actor);
  const evidenceOnly = input.evidenceOnly === true;
  const [batch] = await db
    .select()
    .from(payrollExportBatchesTable)
    .where(eq(payrollExportBatchesTable.id, input.batchId))
    .limit(1);
  if (!batch) throw new BatchNotFoundError(input.batchId);

  if ((batch.status === "superseded" || batch.status === "voided") && !evidenceOnly) {
    throw new BatchNotDownloadableError(batch.id, batch.status);
  }

  const recomputed = sha256Hex(batch.csvContent);
  if (recomputed !== batch.csvChecksum) {
    throw new ChecksumMismatchError(batch.id);
  }

  await db.insert(payrollExportEventsTable).values({
    batchId: batch.id,
    eventType: "BATCH_DOWNLOADED",
    actorId,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    reason: null,
    metadata: { csvChecksum: batch.csvChecksum, evidenceOnly, batchStatus: batch.status },
    ipAddress: input.actor.ip,
  });

  return { batch, csvContent: batch.csvContent, evidenceOnly };
}

/**
 * Mark an active batch as processed.  Terminal transition — once processed, a
 * batch is permanent immutable evidence.  No supersede, void, recalculation,
 * or deletion is possible (Phase 1 rule).
 */
export async function markBatchProcessed(input: {
  batchId: number;
  confirmationNote: string;
  actor: AuditActor;
}): Promise<PayrollExportBatch> {
  const actorId = requireActorId(input.actor);
  if (!input.confirmationNote || input.confirmationNote.trim().length === 0) {
    throw new Error("confirmationNote is required when marking a batch processed");
  }
  const note = input.confirmationNote.trim();

  return await withSerializableRetry(async (tx) => {
    const [current] = await tx
      .select()
      .from(payrollExportBatchesTable)
      .where(eq(payrollExportBatchesTable.id, input.batchId))
      .limit(1);
    if (!current) throw new BatchNotFoundError(input.batchId);
    if (current.status !== "active") {
      if (current.status === "processed") {
        throw new ProcessedBatchImmutableError(current.id);
      }
      throw new BatchNotActiveError(current.id, current.status);
    }

    const [updated] = await tx
      .update(payrollExportBatchesTable)
      .set({
        status: "processed",
        processedAt: new Date(),
        processedBy: actorId,
        processedConfirmationNote: note,
      })
      .where(eq(payrollExportBatchesTable.id, current.id))
      .returning();

    await tx.insert(payrollExportEventsTable).values({
      batchId: current.id,
      eventType: "BATCH_PROCESSED",
      actorId,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      reason: note,
      metadata: { revisionNumber: current.revisionNumber },
      ipAddress: input.actor.ip,
    });

    return updated;
  });
}

export async function listBatchesForPeriod(
  periodStart: string,
  periodEnd: string,
): Promise<PayrollExportBatch[]> {
  return await db
    .select()
    .from(payrollExportBatchesTable)
    .where(
      and(
        eq(payrollExportBatchesTable.periodStart, periodStart),
        eq(payrollExportBatchesTable.periodEnd, periodEnd),
      ),
    )
    .orderBy(desc(payrollExportBatchesTable.createdAt));
}

/**
 * Find the most-recent active or processed batch for a (period, regular_full_period).
 * Returns the active batch when one exists; otherwise the latest processed batch;
 * otherwise null.  Read-only — performs no writes, no supersede, nothing.
 *
 * Used by the legacy GET /admin/export/gusto delegate to serve the existing
 * stored CSV without ever creating a new revision.
 */
export async function getActiveBatchForPeriod(
  periodStart: string,
  periodEnd: string,
): Promise<PayrollExportBatch | null> {
  const rows = await db
    .select()
    .from(payrollExportBatchesTable)
    .where(
      and(
        eq(payrollExportBatchesTable.periodStart, periodStart),
        eq(payrollExportBatchesTable.periodEnd, periodEnd),
        eq(payrollExportBatchesTable.exportType, "regular_full_period"),
      ),
    )
    .orderBy(desc(payrollExportBatchesTable.revisionNumber));

  return (
    rows.find((b) => b.status === "active") ??
    rows.find((b) => b.status === "processed") ??
    null
  );
}
