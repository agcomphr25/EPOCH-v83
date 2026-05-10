import { createHash } from 'crypto';
import { pgPool } from '../../db';

export interface PayrollExportReconciliationFilters {
  periodStart?: string;
  periodEnd?: string;
}

type ReconciliationStatus = 'MATCHED' | 'MISSING_FROM_EXPORT' | 'HOURS_MISMATCH' | 'EXPORTED_NOT_CERTIFIED';
type Severity = 'info' | 'warning' | 'critical';

export interface PayrollExportReconciliationReport {
  generatedAt: string;
  filters: {
    periodStart: string;
    periodEnd: string;
  };
  selectedBatch: {
    id: number;
    revisionNumber: number;
    status: string;
    processedAt: string | null;
    csvChecksum: string;
  } | null;
  summary: {
    certifiedTimesheets: number;
    certifiedEmployees: number;
    exportedEmployees: number;
    missingFromExport: number;
    exportedNotCertified: number;
    hourMismatches: number;
    processedBatches: number;
    activeBatches: number;
    supersededBatches: number;
    voidedBatches: number;
    downloadEvents: number;
    checksumFailures: number;
    totalCertifiedRegularHours: number;
    totalCertifiedOvertimeHours: number;
    totalExportedRegularHours: number;
    totalExportedOvertimeHours: number;
  };
  employeeRows: Array<{
    employeeId: number;
    epochEmployeeId: number | null;
    employeeName: string;
    employeeNumber: string | null;
    department: string | null;
    jobTitle: string | null;
    certifiedTimesheetIds: number[];
    exportedTimesheetIds: number[];
    certifiedRegularHours: number;
    certifiedOvertimeHours: number;
    certifiedTotalHours: number;
    exportedRegularHours: number;
    exportedOvertimeHours: number;
    exportedDoubleOvertimeHours: number;
    exportedSickHours: number;
    exportedVacationHours: number;
    regularDifference: number;
    overtimeDifference: number;
    status: ReconciliationStatus;
  }>;
  timesheetRows: Array<{
    timesheetId: number;
    employeeId: number;
    employeeName: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    employeeAttested: boolean;
    attestedAt: string | null;
    certifiedByUserId: number | null;
    reviewedAt: string | null;
    reviewerEmail: string | null;
    includedInSelectedBatch: boolean;
    batchRevisions: string[];
    reconciliationStatus: ReconciliationStatus;
  }>;
  batches: Array<{
    id: number;
    revisionNumber: number;
    status: string;
    exportType: string;
    exportFormat: string;
    rowCount: number;
    employeeCount: number;
    totalRegularHours: number;
    totalOvertimeHours: number;
    totalSickHours: number;
    totalVacationHours: number;
    csvChecksum: string;
    recomputedChecksum: string | null;
    checksumVerified: boolean;
    sourceTimesheetCount: number;
    sourceLeaveEntryCount: number;
    supersedesBatchId: number | null;
    supersededReason: string | null;
    voidedReason: string | null;
    voidedAt: string | null;
    processedAt: string | null;
    processedBy: number | null;
    processedConfirmationNote: string | null;
    createdBy: number;
    createdAt: string | null;
  }>;
  events: Array<{
    id: number;
    batchId: number | null;
    batchRevisionNumber: number | null;
    eventType: string;
    actorId: number;
    actorEmail: string | null;
    actorRole: string | null;
    reason: string | null;
    metadata: unknown;
    ipAddress: string | null;
    createdAt: string | null;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    employeeId: number | null;
    employeeName: string | null;
    timesheetId: number | null;
    batchId: number | null;
  }>;
}

interface RawBatch {
  id: number;
  revision_number: number;
  status: string;
  export_type: string;
  export_format: string;
  csv_content: string | null;
  csv_checksum: string;
  row_count: number;
  employee_count: number;
  total_regular_hours: unknown;
  total_overtime_hours: unknown;
  total_sick_hours: unknown;
  total_vacation_hours: unknown;
  source_timesheet_ids: unknown;
  source_leave_entry_ids: unknown;
  supersedes_batch_id: number | null;
  superseded_reason: string | null;
  voided_reason: string | null;
  voided_at: Date | string | null;
  processed_at: Date | string | null;
  processed_by: number | null;
  processed_confirmation_note: string | null;
  created_by: number;
  created_at: Date | string | null;
}

interface RawPayrollRow {
  id: number;
  batch_id: number;
  employee_id: number;
  epoch_employee_id: number | null;
  employee_first_name_snapshot: string;
  employee_last_name_snapshot: string;
  employee_number_snapshot: string | null;
  employee_email_snapshot: string | null;
  regular_hours: unknown;
  overtime_hours: unknown;
  double_overtime_hours: unknown;
  sick_hours: unknown;
  vacation_hours: unknown;
  source_timesheet_ids: unknown;
  source_leave_entry_ids: unknown;
}

interface RawTimesheet {
  id: number;
  employee_id: number;
  period_start: string;
  period_end: string;
  status: string;
  total_hours: unknown;
  regular_hours: unknown;
  overtime_hours: unknown;
  employee_attested: boolean;
  attested_at: Date | string | null;
  certified_by_user_id: number | null;
  reviewed_at: Date | string | null;
  reviewer_email: string | null;
  tk_email: string | null;
  tk_department: string | null;
  tk_job_title: string | null;
  epoch_employee_id: number | null;
  employee_name: string | null;
  employee_code: string | null;
  public_department: string | null;
  public_job_title: string | null;
}

function parseRequiredDate(value: string | undefined, label: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateText(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function normalizeIdArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item))
    .sort((a, b) => a - b);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function employeeDisplayName(row: Pick<RawTimesheet, 'employee_name' | 'tk_email' | 'employee_id'>): string {
  return row.employee_name ?? row.tk_email ?? `Employee ${row.employee_id}`;
}

export async function getPayrollExportReconciliationReport(
  filters: PayrollExportReconciliationFilters = {},
): Promise<PayrollExportReconciliationReport> {
  const periodStart = parseRequiredDate(filters.periodStart, 'periodStart');
  const periodEnd = parseRequiredDate(filters.periodEnd, 'periodEnd');

  const timesheetsSql = `
    SELECT
      ts.id,
      ts.employee_id,
      ts.period_start,
      ts.period_end,
      ts.status,
      ts.total_hours,
      ts.regular_hours,
      ts.overtime_hours,
      ts.employee_attested,
      ts.attested_at,
      ts.certified_by_user_id,
      ts.reviewed_at,
      ts.reviewer_email,
      tke.email AS tk_email,
      tke.department AS tk_department,
      tke.job_title AS tk_job_title,
      tke.epoch_employee_id,
      emp.name AS employee_name,
      emp.employee_code,
      emp.department AS public_department,
      emp.job_title AS public_job_title
    FROM timekeeping.timesheets ts
    LEFT JOIN timekeeping.employees tke ON tke.id = ts.employee_id
    LEFT JOIN employees emp ON emp.id = tke.epoch_employee_id
    WHERE ts.period_start >= $1::text
      AND ts.period_end <= $2::text
    ORDER BY emp.name NULLS LAST, tke.email NULLS LAST, ts.id;
  `;

  const batchesSql = `
    SELECT *
    FROM timekeeping.payroll_export_batches
    WHERE period_start = $1::text
      AND period_end = $2::text
      AND export_type = 'regular_full_period'
    ORDER BY revision_number DESC, id DESC;
  `;

  const rowsSql = `
    SELECT r.*
    FROM timekeeping.payroll_export_rows r
    INNER JOIN timekeeping.payroll_export_batches b ON b.id = r.batch_id
    WHERE b.period_start = $1::text
      AND b.period_end = $2::text
      AND b.export_type = 'regular_full_period'
    ORDER BY b.revision_number DESC, r.employee_last_name_snapshot, r.employee_first_name_snapshot, r.id;
  `;

  const eventsSql = `
    SELECT
      e.id,
      e.batch_id,
      b.revision_number AS batch_revision_number,
      e.event_type,
      e.actor_id,
      e.actor_email,
      e.actor_role,
      e.reason,
      e.metadata,
      e.ip_address,
      e.created_at
    FROM timekeeping.payroll_export_events e
    LEFT JOIN timekeeping.payroll_export_batches b ON b.id = e.batch_id
    WHERE b.period_start = $1::text
      AND b.period_end = $2::text
      AND b.export_type = 'regular_full_period'
    ORDER BY e.created_at DESC, e.id DESC;
  `;

  const [timesheetsResult, batchesResult, rowsResult, eventsResult] = await Promise.all([
    pgPool.query<RawTimesheet>(timesheetsSql, [periodStart, periodEnd]),
    pgPool.query<RawBatch>(batchesSql, [periodStart, periodEnd]),
    pgPool.query<RawPayrollRow>(rowsSql, [periodStart, periodEnd]),
    pgPool.query(eventsSql, [periodStart, periodEnd]),
  ]);

  const timesheets = timesheetsResult.rows;
  const certifiedTimesheets = timesheets.filter((row) => row.status === 'certified' || row.status === 'locked');
  const batches = batchesResult.rows;
  const payrollRows = rowsResult.rows;

  const selectedRawBatch = batches.find((batch) => batch.status === 'processed')
    ?? batches.find((batch) => batch.status === 'active')
    ?? batches[0]
    ?? null;

  const selectedBatchId = selectedRawBatch?.id ?? null;
  const selectedPayrollRows = selectedBatchId == null
    ? []
    : payrollRows.filter((row) => row.batch_id === selectedBatchId);

  const timesheetById = new Map(timesheets.map((row) => [row.id, row]));
  const certifiedByEmployee = new Map<number, {
    regular: number;
    overtime: number;
    total: number;
    ids: number[];
    sample: RawTimesheet;
  }>();

  for (const ts of certifiedTimesheets) {
    const current = certifiedByEmployee.get(ts.employee_id) ?? {
      regular: 0,
      overtime: 0,
      total: 0,
      ids: [],
      sample: ts,
    };
    current.regular += toNumber(ts.regular_hours);
    current.overtime += toNumber(ts.overtime_hours);
    current.total += toNumber(ts.total_hours);
    current.ids.push(ts.id);
    certifiedByEmployee.set(ts.employee_id, current);
  }

  const exportedByEmployee = new Map<number, {
    epochEmployeeId: number | null;
    employeeName: string;
    employeeNumber: string | null;
    regular: number;
    overtime: number;
    doubleOvertime: number;
    sick: number;
    vacation: number;
    timesheetIds: number[];
  }>();

  for (const row of selectedPayrollRows) {
    const current = exportedByEmployee.get(row.employee_id) ?? {
      epochEmployeeId: row.epoch_employee_id,
      employeeName: `${row.employee_first_name_snapshot} ${row.employee_last_name_snapshot}`.trim() || `Employee ${row.employee_id}`,
      employeeNumber: row.employee_number_snapshot,
      regular: 0,
      overtime: 0,
      doubleOvertime: 0,
      sick: 0,
      vacation: 0,
      timesheetIds: [],
    };
    current.regular += toNumber(row.regular_hours);
    current.overtime += toNumber(row.overtime_hours);
    current.doubleOvertime += toNumber(row.double_overtime_hours);
    current.sick += toNumber(row.sick_hours);
    current.vacation += toNumber(row.vacation_hours);
    current.timesheetIds.push(...normalizeIdArray(row.source_timesheet_ids));
    exportedByEmployee.set(row.employee_id, current);
  }

  const batchRevisionByTimesheetId = new Map<number, string[]>();
  for (const row of payrollRows) {
    const batch = batches.find((item) => item.id === row.batch_id);
    const label = batch ? `Batch ${batch.id} rev ${batch.revision_number} (${batch.status})` : `Batch ${row.batch_id}`;
    for (const timesheetId of normalizeIdArray(row.source_timesheet_ids)) {
      const labels = batchRevisionByTimesheetId.get(timesheetId) ?? [];
      labels.push(label);
      batchRevisionByTimesheetId.set(timesheetId, labels);
    }
  }

  const selectedSourceTimesheetIds = new Set<number>();
  for (const row of selectedPayrollRows) {
    for (const timesheetId of normalizeIdArray(row.source_timesheet_ids)) {
      selectedSourceTimesheetIds.add(timesheetId);
    }
  }

  const exceptions: PayrollExportReconciliationReport['exceptions'] = [];
  if (!selectedRawBatch) {
    exceptions.push({
      severity: 'critical',
      exceptionType: 'NO_EXPORT_BATCH',
      message: 'No payroll export batch exists for this pay period.',
      employeeId: null,
      employeeName: null,
      timesheetId: null,
      batchId: null,
    });
  } else if (selectedRawBatch.status !== 'processed') {
    exceptions.push({
      severity: 'warning',
      exceptionType: 'PAYROLL_NOT_PROCESSED',
      message: `Batch ${selectedRawBatch.id} revision ${selectedRawBatch.revision_number} is selected but has not been marked processed.`,
      employeeId: null,
      employeeName: null,
      timesheetId: null,
      batchId: selectedRawBatch.id,
    });
  }

  const employeeIds = new Set<number>([
    ...Array.from(certifiedByEmployee.keys()),
    ...Array.from(exportedByEmployee.keys()),
  ]);
  const employeeRows = Array.from(employeeIds).map((employeeId) => {
    const certified = certifiedByEmployee.get(employeeId);
    const exported = exportedByEmployee.get(employeeId);
    const regularDifference = (exported?.regular ?? 0) - (certified?.regular ?? 0);
    const overtimeDifference = (exported?.overtime ?? 0) - (certified?.overtime ?? 0);
    const missing = !!certified && !exported;
    const notCertified = !!exported && !certified;
    const mismatch = Math.abs(regularDifference) > 0.01 || Math.abs(overtimeDifference) > 0.01;
    const sample = certified?.sample;
    const status: ReconciliationStatus = missing
      ? 'MISSING_FROM_EXPORT'
      : notCertified
        ? 'EXPORTED_NOT_CERTIFIED'
        : mismatch
          ? 'HOURS_MISMATCH'
          : 'MATCHED';

    if (status !== 'MATCHED') {
      exceptions.push({
        severity: status === 'HOURS_MISMATCH' ? 'critical' : 'warning',
        exceptionType: status,
        message: `${exported?.employeeName ?? (sample ? employeeDisplayName(sample) : `Employee ${employeeId}`)} is ${status.toLowerCase().replace(/_/g, ' ')}.`,
        employeeId,
        employeeName: exported?.employeeName ?? (sample ? employeeDisplayName(sample) : null),
        timesheetId: certified?.ids[0] ?? null,
        batchId: selectedBatchId,
      });
    }

    return {
      employeeId,
      epochEmployeeId: exported?.epochEmployeeId ?? sample?.epoch_employee_id ?? null,
      employeeName: exported?.employeeName ?? (sample ? employeeDisplayName(sample) : `Employee ${employeeId}`),
      employeeNumber: exported?.employeeNumber ?? sample?.employee_code ?? null,
      department: sample?.public_department ?? sample?.tk_department ?? null,
      jobTitle: sample?.public_job_title ?? sample?.tk_job_title ?? null,
      certifiedTimesheetIds: certified?.ids ?? [],
      exportedTimesheetIds: Array.from(new Set(exported?.timesheetIds ?? [])).sort((a, b) => a - b),
      certifiedRegularHours: round2(certified?.regular ?? 0),
      certifiedOvertimeHours: round2(certified?.overtime ?? 0),
      certifiedTotalHours: round2(certified?.total ?? 0),
      exportedRegularHours: round2(exported?.regular ?? 0),
      exportedOvertimeHours: round2(exported?.overtime ?? 0),
      exportedDoubleOvertimeHours: round2(exported?.doubleOvertime ?? 0),
      exportedSickHours: round2(exported?.sick ?? 0),
      exportedVacationHours: round2(exported?.vacation ?? 0),
      regularDifference: round2(regularDifference),
      overtimeDifference: round2(overtimeDifference),
      status,
    };
  }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  for (const timesheetId of Array.from(selectedSourceTimesheetIds)) {
    const ts = timesheetById.get(timesheetId);
    if (!ts || (ts.status !== 'certified' && ts.status !== 'locked')) {
      exceptions.push({
        severity: 'critical',
        exceptionType: 'EXPORTED_SOURCE_NOT_CERTIFIED',
        message: ts
          ? `Timesheet ${timesheetId} was exported in status ${ts.status}.`
          : `Export references timesheet ${timesheetId}, but that timesheet is not present in the selected pay period.`,
        employeeId: ts?.employee_id ?? null,
        employeeName: ts ? employeeDisplayName(ts) : null,
        timesheetId,
        batchId: selectedBatchId,
      });
    }
  }

  const reportBatches = batches.map((batch) => {
    const recomputedChecksum = batch.csv_content == null ? null : sha256Hex(batch.csv_content);
    const checksumVerified = recomputedChecksum === batch.csv_checksum;
    if (!checksumVerified) {
      exceptions.push({
        severity: 'critical',
        exceptionType: 'CHECKSUM_MISMATCH',
        message: `Batch ${batch.id} revision ${batch.revision_number} CSV checksum does not match the stored file content.`,
        employeeId: null,
        employeeName: null,
        timesheetId: null,
        batchId: batch.id,
      });
    }
    return {
      id: Number(batch.id),
      revisionNumber: Number(batch.revision_number),
      status: batch.status,
      exportType: batch.export_type,
      exportFormat: batch.export_format,
      rowCount: Number(batch.row_count),
      employeeCount: Number(batch.employee_count),
      totalRegularHours: round2(toNumber(batch.total_regular_hours)),
      totalOvertimeHours: round2(toNumber(batch.total_overtime_hours)),
      totalSickHours: round2(toNumber(batch.total_sick_hours)),
      totalVacationHours: round2(toNumber(batch.total_vacation_hours)),
      csvChecksum: batch.csv_checksum,
      recomputedChecksum,
      checksumVerified,
      sourceTimesheetCount: normalizeIdArray(batch.source_timesheet_ids).length,
      sourceLeaveEntryCount: normalizeIdArray(batch.source_leave_entry_ids).length,
      supersedesBatchId: batch.supersedes_batch_id == null ? null : Number(batch.supersedes_batch_id),
      supersededReason: batch.superseded_reason ?? null,
      voidedReason: batch.voided_reason ?? null,
      voidedAt: toIso(batch.voided_at),
      processedAt: toIso(batch.processed_at),
      processedBy: batch.processed_by == null ? null : Number(batch.processed_by),
      processedConfirmationNote: batch.processed_confirmation_note ?? null,
      createdBy: Number(batch.created_by),
      createdAt: toIso(batch.created_at),
    };
  });

  const timesheetRows = timesheets.map((ts) => {
    const includedInSelectedBatch = selectedSourceTimesheetIds.has(ts.id);
    const certified = ts.status === 'certified' || ts.status === 'locked';
    const reconciliationStatus: ReconciliationStatus = includedInSelectedBatch
      ? certified ? 'MATCHED' : 'EXPORTED_NOT_CERTIFIED'
      : certified ? 'MISSING_FROM_EXPORT' : 'EXPORTED_NOT_CERTIFIED';

    return {
      timesheetId: Number(ts.id),
      employeeId: Number(ts.employee_id),
      employeeName: employeeDisplayName(ts),
      periodStart: dateText(ts.period_start),
      periodEnd: dateText(ts.period_end),
      status: ts.status,
      totalHours: round2(toNumber(ts.total_hours)),
      regularHours: round2(toNumber(ts.regular_hours)),
      overtimeHours: round2(toNumber(ts.overtime_hours)),
      employeeAttested: Boolean(ts.employee_attested),
      attestedAt: toIso(ts.attested_at),
      certifiedByUserId: ts.certified_by_user_id == null ? null : Number(ts.certified_by_user_id),
      reviewedAt: toIso(ts.reviewed_at),
      reviewerEmail: ts.reviewer_email ?? null,
      includedInSelectedBatch,
      batchRevisions: batchRevisionByTimesheetId.get(ts.id) ?? [],
      reconciliationStatus,
    };
  });

  const events = eventsResult.rows.map((row) => ({
    id: Number(row.id),
    batchId: row.batch_id == null ? null : Number(row.batch_id),
    batchRevisionNumber: row.batch_revision_number == null ? null : Number(row.batch_revision_number),
    eventType: row.event_type,
    actorId: Number(row.actor_id),
    actorEmail: row.actor_email ?? null,
    actorRole: row.actor_role ?? null,
    reason: row.reason ?? null,
    metadata: row.metadata ?? null,
    ipAddress: row.ip_address ?? null,
    createdAt: toIso(row.created_at ?? null),
  }));

  const summary = {
    certifiedTimesheets: certifiedTimesheets.length,
    certifiedEmployees: certifiedByEmployee.size,
    exportedEmployees: exportedByEmployee.size,
    missingFromExport: employeeRows.filter((row) => row.status === 'MISSING_FROM_EXPORT').length,
    exportedNotCertified: employeeRows.filter((row) => row.status === 'EXPORTED_NOT_CERTIFIED').length
      + exceptions.filter((row) => row.exceptionType === 'EXPORTED_SOURCE_NOT_CERTIFIED').length,
    hourMismatches: employeeRows.filter((row) => row.status === 'HOURS_MISMATCH').length,
    processedBatches: reportBatches.filter((batch) => batch.status === 'processed').length,
    activeBatches: reportBatches.filter((batch) => batch.status === 'active').length,
    supersededBatches: reportBatches.filter((batch) => batch.status === 'superseded').length,
    voidedBatches: reportBatches.filter((batch) => batch.status === 'voided' || batch.voidedAt != null).length,
    downloadEvents: events.filter((event) => event.eventType === 'BATCH_DOWNLOADED').length,
    checksumFailures: reportBatches.filter((batch) => !batch.checksumVerified).length,
    totalCertifiedRegularHours: round2(employeeRows.reduce((sum, row) => sum + row.certifiedRegularHours, 0)),
    totalCertifiedOvertimeHours: round2(employeeRows.reduce((sum, row) => sum + row.certifiedOvertimeHours, 0)),
    totalExportedRegularHours: round2(employeeRows.reduce((sum, row) => sum + row.exportedRegularHours, 0)),
    totalExportedOvertimeHours: round2(employeeRows.reduce((sum, row) => sum + row.exportedOvertimeHours, 0)),
  };

  return {
    generatedAt: new Date().toISOString(),
    filters: { periodStart, periodEnd },
    selectedBatch: selectedRawBatch
      ? {
          id: Number(selectedRawBatch.id),
          revisionNumber: Number(selectedRawBatch.revision_number),
          status: selectedRawBatch.status,
          processedAt: toIso(selectedRawBatch.processed_at),
          csvChecksum: selectedRawBatch.csv_checksum,
        }
      : null,
    summary,
    employeeRows,
    timesheetRows,
    batches: reportBatches,
    events,
    exceptions,
  };
}
