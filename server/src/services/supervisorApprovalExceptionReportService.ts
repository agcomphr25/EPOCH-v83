import { pgPool } from '../../db';

export interface SupervisorApprovalExceptionReportFilters {
  startDate?: string;
  endDate?: string;
  recordType?: string;
  exceptionType?: string;
  staleDays?: string;
}

type Severity = 'info' | 'warning' | 'critical';

export interface SupervisorApprovalExceptionReport {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    recordType: string | null;
    exceptionType: string | null;
    staleDays: number;
  };
  policy: {
    certificationRequired: boolean;
    correctionApprovalRequired: boolean;
    lateSubmissionGraceDays: number | null;
    staleApprovalDaysUsed: number;
  };
  summary: {
    exceptionRows: number;
    affectedEmployees: number;
    lackingSupervisorApproval: number;
    staleApprovals: number;
    selfApprovals: number;
    unsignedFinalized: number;
    payrollExportedWithExceptions: number;
    totalHoursAtRisk: number;
    criticalExceptions: number;
    warningExceptions: number;
  };
  rows: Array<{
    recordType: 'HOURLY' | 'SALARIED';
    timesheetId: number;
    employeeId: number;
    employeeCode: string | null;
    employeeName: string;
    department: string | null;
    jobTitle: string | null;
    periodStart: string;
    periodEnd: string;
    status: string;
    totalHours: number;
    submittedAt: string | null;
    certifiedAt: string | null;
    certifiedBy: number | null;
    supervisorEmployeeId: number | null;
    supervisorName: string | null;
    supervisorApprovedAt: string | null;
    supervisorApprovedBy: number | null;
    reviewerEmail: string | null;
    employeeSigned: boolean;
    payrollApprovedAt: string | null;
    payrollApprovedBy: number | null;
    exportedBatchIds: number[];
    daysWaiting: number;
    flags: string[];
    severity: Severity;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    recordType: 'HOURLY' | 'SALARIED';
    timesheetId: number;
    employeeName: string;
  }>;
}

function parseDateFilter(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

function parseRecordType(value: string | undefined): string | undefined {
  if (!value || value === 'all') return undefined;
  const normalized = value.toUpperCase();
  if (!['HOURLY', 'SALARIED'].includes(normalized)) {
    throw new Error('recordType is invalid');
  }
  return normalized;
}

function parseExceptionType(value: string | undefined): string | undefined {
  if (!value || value === 'all') return undefined;
  const normalized = value.toUpperCase();
  if (!['MISSING_SUPERVISOR_APPROVAL', 'STALE_APPROVAL', 'SELF_APPROVAL', 'UNSIGNED_FINALIZED'].includes(normalized)) {
    throw new Error('exceptionType is invalid');
  }
  return normalized;
}

function parseStaleDays(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60) {
    throw new Error('staleDays must be an integer between 1 and 60');
  }
  return parsed;
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

function toDateText(value: Date | string | null): string {
  if (!value) return '';
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function normalizeIdArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter((item) => Number.isInteger(item));
}

function buildFlags(row: {
  supervisorApprovedAt: string | null;
  supervisorApprovedBy: number | null;
  submittedAt: string | null;
  certifiedAt: string | null;
  employeeSigned: boolean;
  employeeId: number;
  reviewerEmail: string | null;
  employeeEmail: string | null;
  payrollApprovedAt: string | null;
  exportedBatchIds: number[];
  status: string;
  daysWaiting: number;
}, staleDays: number): string[] {
  const flags: string[] = [];
  const finalized = ['APPROVED', 'CERTIFIED', 'FINALIZED', 'LOCKED', 'PAYROLL_APPROVED', 'SUPERVISOR_APPROVED', 'PROCESSED'].includes(row.status.toUpperCase())
    || Boolean(row.payrollApprovedAt)
    || row.exportedBatchIds.length > 0;

  if (finalized && (!row.supervisorApprovedAt || !row.supervisorApprovedBy)) {
    flags.push('MISSING_SUPERVISOR_APPROVAL');
  }
  if (!row.supervisorApprovedAt && row.daysWaiting >= staleDays) {
    flags.push('STALE_APPROVAL');
  }
  if (
    row.supervisorApprovedBy === row.employeeId
    || (row.reviewerEmail && row.employeeEmail && row.reviewerEmail.toLowerCase() === row.employeeEmail.toLowerCase())
  ) {
    flags.push('SELF_APPROVAL');
  }
  if (finalized && !row.employeeSigned) {
    flags.push('UNSIGNED_FINALIZED');
  }
  return flags;
}

function severityFor(flags: string[], exportedBatchIds: number[], payrollApprovedAt: string | null): Severity {
  if (flags.some((flag) => ['SELF_APPROVAL', 'UNSIGNED_FINALIZED'].includes(flag))) return 'critical';
  if (flags.includes('MISSING_SUPERVISOR_APPROVAL') && (exportedBatchIds.length > 0 || payrollApprovedAt)) return 'critical';
  if (flags.length > 0) return 'warning';
  return 'info';
}

export async function getSupervisorApprovalExceptionReport(
  filters: SupervisorApprovalExceptionReportFilters = {},
): Promise<SupervisorApprovalExceptionReport> {
  const startDate = parseDateFilter(filters.startDate, 'startDate');
  const endDate = parseDateFilter(filters.endDate, 'endDate');
  const recordType = parseRecordType(filters.recordType);
  const exceptionType = parseExceptionType(filters.exceptionType);

  const policyResult = await pgPool.query(`
    SELECT certification_required, correction_approval_required, late_submission_grace_days
    FROM timekeeping.policy_settings
    ORDER BY id
    LIMIT 1;
  `);
  const policyRow = policyResult.rows[0] ?? {};
  const policyStaleDays = Number.isInteger(Number(policyRow.late_submission_grace_days))
    ? Math.max(1, Number(policyRow.late_submission_grace_days))
    : 3;
  const staleDays = parseStaleDays(filters.staleDays, policyStaleDays);

  const params: unknown[] = [];
  const hourlyClauses: string[] = [];
  const salariedClauses: string[] = [];
  if (startDate) {
    params.push(startDate);
    hourlyClauses.push(`ts.period_end >= $${params.length}::text`);
    salariedClauses.push(`st.period_end >= $${params.length}::text`);
  }
  if (endDate) {
    params.push(endDate);
    hourlyClauses.push(`ts.period_start <= $${params.length}::text`);
    salariedClauses.push(`st.period_start <= $${params.length}::text`);
  }

  const hourlyWhere = hourlyClauses.length ? `WHERE ${hourlyClauses.join(' AND ')}` : '';
  const salariedWhere = salariedClauses.length ? `WHERE ${salariedClauses.join(' AND ')}` : '';

  const sql = `
    WITH exported AS (
      SELECT
        source.timesheet_id::int AS timesheet_id,
        jsonb_agg(peb.id ORDER BY peb.revision_number) AS batch_ids
      FROM timekeeping.payroll_export_batches peb
      CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(peb.source_timesheet_ids) = 'array' THEN peb.source_timesheet_ids
            ELSE '[]'::jsonb
          END
        ) AS source(timesheet_id)
      WHERE peb.status IN ('active', 'processed')
      GROUP BY 1
    ),
    hourly AS (
      SELECT
        'HOURLY'::text AS record_type,
        ts.id AS timesheet_id,
        ts.employee_id,
        e.employee_code,
        e.name AS employee_name,
        e.email AS employee_email,
        e.department,
        e.job_title,
        ts.period_start,
        ts.period_end,
        ts.status,
        ts.total_hours,
        ts.submitted_at,
        ts.attested_at AS certified_at,
        ts.certified_by_user_id AS certified_by,
        e.supervisor_employee_id,
        sup.name AS supervisor_name,
        ts.reviewed_at AS supervisor_approved_at,
        ts.reviewed_by AS supervisor_approved_by,
        ts.reviewer_email,
        ts.employee_attested AS employee_signed,
        NULL::timestamptz AS payroll_approved_at,
        NULL::int AS payroll_approved_by,
        COALESCE(ex.batch_ids, '[]'::jsonb) AS exported_batch_ids,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(ts.submitted_at, ts.updated_at, ts.created_at))) / 86400))::int AS days_waiting
      FROM timekeeping.timesheets ts
      JOIN employees e ON e.id = ts.employee_id
      LEFT JOIN employees sup ON sup.id = e.supervisor_employee_id
      LEFT JOIN exported ex ON ex.timesheet_id = ts.id
      ${hourlyWhere}
    ),
    salaried AS (
      SELECT
        'SALARIED'::text AS record_type,
        st.id AS timesheet_id,
        st.employee_id,
        e.employee_code,
        e.name AS employee_name,
        e.email AS employee_email,
        e.department,
        e.job_title,
        st.period_start,
        st.period_end,
        st.status,
        st.total_actual_hours AS total_hours,
        st.created_at AS submitted_at,
        st.certified_at,
        st.certified_by,
        st.supervisor_employee_id,
        sup.name AS supervisor_name,
        st.supervisor_approved_at,
        st.supervisor_approved_by,
        NULL::text AS reviewer_email,
        (st.certified_at IS NOT NULL AND st.certified_by IS NOT NULL) AS employee_signed,
        st.payroll_approved_at,
        st.payroll_approved_by,
        COALESCE(ex.batch_ids, '[]'::jsonb) AS exported_batch_ids,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(st.certified_at, st.updated_at, st.created_at))) / 86400))::int AS days_waiting
      FROM timekeeping.salaried_timesheets st
      JOIN employees e ON e.id = st.employee_id
      LEFT JOIN employees sup ON sup.id = st.supervisor_employee_id
      LEFT JOIN exported ex ON ex.timesheet_id = st.id
      ${salariedWhere}
    )
    SELECT *
    FROM (
      SELECT * FROM hourly
      UNION ALL
      SELECT * FROM salaried
    ) base
    ${recordType ? `WHERE record_type = $${params.push(recordType)}::text` : ''}
    ORDER BY days_waiting DESC, period_end DESC, employee_name ASC;
  `;

  const result = await pgPool.query(sql, params);
  let rows = result.rows.map((row) => {
    const exportedBatchIds = normalizeIdArray(row.exported_batch_ids);
    const normalized = {
      recordType: row.record_type as 'HOURLY' | 'SALARIED',
      timesheetId: Number(row.timesheet_id),
      employeeId: Number(row.employee_id),
      employeeCode: row.employee_code ?? null,
      employeeName: row.employee_name ?? `Employee ${row.employee_id}`,
      employeeEmail: row.employee_email ?? null,
      department: row.department ?? null,
      jobTitle: row.job_title ?? null,
      periodStart: toDateText(row.period_start),
      periodEnd: toDateText(row.period_end),
      status: String(row.status ?? '').toUpperCase(),
      totalHours: round2(toNumber(row.total_hours)),
      submittedAt: toIso(row.submitted_at ?? null),
      certifiedAt: toIso(row.certified_at ?? null),
      certifiedBy: row.certified_by == null ? null : Number(row.certified_by),
      supervisorEmployeeId: row.supervisor_employee_id == null ? null : Number(row.supervisor_employee_id),
      supervisorName: row.supervisor_name ?? null,
      supervisorApprovedAt: toIso(row.supervisor_approved_at ?? null),
      supervisorApprovedBy: row.supervisor_approved_by == null ? null : Number(row.supervisor_approved_by),
      reviewerEmail: row.reviewer_email ?? null,
      employeeSigned: Boolean(row.employee_signed),
      payrollApprovedAt: toIso(row.payroll_approved_at ?? null),
      payrollApprovedBy: row.payroll_approved_by == null ? null : Number(row.payroll_approved_by),
      exportedBatchIds,
      daysWaiting: Number(row.days_waiting ?? 0),
      flags: [] as string[],
      severity: 'info' as Severity,
    };
    normalized.flags = buildFlags(normalized, staleDays);
    normalized.severity = severityFor(normalized.flags, normalized.exportedBatchIds, normalized.payrollApprovedAt);
    return normalized;
  });

  rows = rows.filter((row) => row.flags.length > 0);
  if (exceptionType) {
    rows = rows.filter((row) => row.flags.includes(exceptionType));
  }

  const exceptions: SupervisorApprovalExceptionReport['exceptions'] = [];
  for (const row of rows) {
    for (const flag of row.flags) {
      exceptions.push({
        severity: severityFor([flag], row.exportedBatchIds, row.payrollApprovedAt),
        exceptionType: flag,
        message: `${row.employeeName} ${flag.replaceAll('_', ' ').toLowerCase()} for ${row.recordType.toLowerCase()} timesheet ${row.timesheetId}.`,
        recordType: row.recordType,
        timesheetId: row.timesheetId,
        employeeName: row.employeeName,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      recordType: recordType ?? null,
      exceptionType: exceptionType ?? null,
      staleDays,
    },
    policy: {
      certificationRequired: policyRow.certification_required ?? true,
      correctionApprovalRequired: policyRow.correction_approval_required ?? true,
      lateSubmissionGraceDays: policyRow.late_submission_grace_days == null ? null : Number(policyRow.late_submission_grace_days),
      staleApprovalDaysUsed: staleDays,
    },
    summary: {
      exceptionRows: rows.length,
      affectedEmployees: new Set(rows.map((row) => row.employeeId)).size,
      lackingSupervisorApproval: rows.filter((row) => row.flags.includes('MISSING_SUPERVISOR_APPROVAL')).length,
      staleApprovals: rows.filter((row) => row.flags.includes('STALE_APPROVAL')).length,
      selfApprovals: rows.filter((row) => row.flags.includes('SELF_APPROVAL')).length,
      unsignedFinalized: rows.filter((row) => row.flags.includes('UNSIGNED_FINALIZED')).length,
      payrollExportedWithExceptions: rows.filter((row) => row.exportedBatchIds.length > 0 || row.payrollApprovedAt).length,
      totalHoursAtRisk: round2(rows.reduce((sum, row) => sum + row.totalHours, 0)),
      criticalExceptions: exceptions.filter((row) => row.severity === 'critical').length,
      warningExceptions: exceptions.filter((row) => row.severity === 'warning').length,
    },
    rows,
    exceptions,
  };
}
