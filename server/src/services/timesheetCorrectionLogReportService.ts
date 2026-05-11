import { pgPool } from '../../db';

export interface TimesheetCorrectionLogReportFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  risk?: string;
}

type Severity = 'info' | 'warning' | 'critical';

export interface TimesheetCorrectionLogReport {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    status: string | null;
    risk: string | null;
  };
  summary: {
    totalCorrections: number;
    pending: number;
    approved: number;
    rejected: number;
    completeEvidence: number;
    incompleteEvidence: number;
    missingAuditLedgerRows: number;
    postPayrollCorrections: number;
    selfReviewedCorrections: number;
    criticalExceptions: number;
    warningExceptions: number;
  };
  corrections: Array<{
    id: number;
    timesheetId: number;
    employeeId: number;
    employeeCode: string | null;
    employeeName: string;
    periodStart: string;
    periodEnd: string;
    timesheetStatus: string;
    totalHours: number;
    requestedByEmployeeId: number;
    requestedByName: string | null;
    requestedAt: string;
    reviewedByUserId: number | null;
    reviewedByName: string | null;
    reviewerEmployeeId: number | null;
    reviewedAt: string | null;
    status: string;
    reason: string;
    reviewerNote: string | null;
    originalSnapshot: unknown;
    proposedChanges: unknown;
    afterSnapshot: unknown;
    beforeAfterSummary: Array<{
      field: string;
      before: unknown;
      after: unknown;
    }>;
    exportedBatchIds: number[];
    auditLedgerRows: Array<{
      id: number;
      action: string;
      entityType: string | null;
      entityId: string | null;
      subjectType: string | null;
      subjectId: string | null;
      sequenceNumber: number | null;
      rowHash: string | null;
      occurredAt: string | null;
      actorName: string | null;
    }>;
    flags: string[];
    severity: Severity;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    correctionId: number;
    timesheetId: number;
  }>;
}

function parseDateFilter(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

function parseStatus(value: string | undefined): string | undefined {
  if (!value || value === 'all') return undefined;
  const normalized = value.toLowerCase();
  if (!['pending', 'approved', 'rejected'].includes(normalized)) {
    throw new Error('status is invalid');
  }
  return normalized;
}

function parseRisk(value: string | undefined): string | undefined {
  if (!value || value === 'all') return undefined;
  const normalized = value.toUpperCase();
  if (!['CRITICAL', 'WARNING', 'INFO'].includes(normalized)) {
    throw new Error('risk is invalid');
  }
  return normalized.toLowerCase();
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

function displayUser(row: { username?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null } | null): string | null {
  if (!row) return null;
  const fullName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
  return fullName || row.email || row.username || null;
}

function normalizeIdArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter((item) => Number.isInteger(item));
}

function normalizeAuditRows(value: unknown): TimesheetCorrectionLogReport['corrections'][number]['auditLedgerRows'] {
  if (!Array.isArray(value)) return [];
  return value.map((row: any) => ({
    id: Number(row.id),
    action: String(row.action ?? ''),
    entityType: row.entityType ?? null,
    entityId: row.entityId ?? null,
    subjectType: row.subjectType ?? null,
    subjectId: row.subjectId ?? null,
    sequenceNumber: row.sequenceNumber == null ? null : Number(row.sequenceNumber),
    rowHash: row.rowHash ?? null,
    occurredAt: toIso(row.occurredAt ?? null),
    actorName: row.actorName ?? null,
  })).filter((row) => Number.isInteger(row.id));
}

function summarizeBeforeAfter(original: unknown, proposed: unknown, after: unknown): TimesheetCorrectionLogReport['corrections'][number]['beforeAfterSummary'] {
  const summary: TimesheetCorrectionLogReport['corrections'][number]['beforeAfterSummary'] = [];
  const proposedObj = proposed && typeof proposed === 'object' ? proposed as Record<string, unknown> : {};
  const afterObj = after && typeof after === 'object' ? after as Record<string, unknown> : {};
  const originalObj = original && typeof original === 'object' ? original as Record<string, unknown> : {};

  for (const key of ['mode', 'description', 'status', 'totalHours', 'regularHours', 'overtimeHours']) {
    const before = originalObj[key];
    const proposedValue = proposedObj[key];
    const afterValue = afterObj[key];
    if (before !== undefined || proposedValue !== undefined || afterValue !== undefined) {
      summary.push({ field: key, before: before ?? null, after: afterValue ?? proposedValue ?? null });
    }
  }

  const punchEdits = Array.isArray(proposedObj.punchEdits) ? proposedObj.punchEdits as any[] : [];
  punchEdits.slice(0, 8).forEach((edit, index) => {
    summary.push({
      field: `punchEdits[${index}].${edit?.field ?? 'field'}`,
      before: edit?.oldValue ?? null,
      after: edit?.newValue ?? null,
    });
  });

  if (summary.length === 0 && Object.keys(proposedObj).length > 0) {
    summary.push({ field: 'proposedChanges', before: original ?? null, after: proposed ?? null });
  }
  return summary.slice(0, 12);
}

function buildFlags(row: {
  status: string;
  reason: string | null;
  reviewerNote: string | null;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  afterSnapshot: unknown;
  originalSnapshot: unknown;
  proposedChanges: unknown;
  requestedByEmployeeId: number;
  reviewerEmployeeId: number | null;
  auditLedgerRows: unknown[];
  exportedBatchIds: number[];
}): string[] {
  const flags: string[] = [];
  if (!row.reason || row.reason.trim().length < 5) flags.push('MISSING_REASON');
  if (!row.originalSnapshot) flags.push('MISSING_BEFORE_SNAPSHOT');
  if (!row.proposedChanges) flags.push('MISSING_PROPOSED_CHANGES');
  if (['approved', 'rejected'].includes(row.status) && (!row.reviewedByUserId || !row.reviewedAt)) flags.push('MISSING_REVIEW_EVIDENCE');
  if (['approved', 'rejected'].includes(row.status) && (!row.reviewerNote || row.reviewerNote.trim().length < 3)) flags.push('MISSING_REVIEWER_NOTE');
  if (row.status === 'approved' && !row.afterSnapshot) flags.push('APPROVED_MISSING_AFTER_SNAPSHOT');
  if (row.status === 'pending') flags.push('PENDING_REVIEW');
  if (row.reviewerEmployeeId && row.reviewerEmployeeId === row.requestedByEmployeeId) flags.push('SELF_REVIEW');
  if (row.auditLedgerRows.length === 0) flags.push('MISSING_AUDIT_LEDGER_LINK');
  if (row.exportedBatchIds.length > 0) flags.push('POST_PAYROLL_CORRECTION');
  return flags;
}

function severityFor(flags: string[]): Severity {
  if (flags.some((flag) => ['APPROVED_MISSING_AFTER_SNAPSHOT', 'SELF_REVIEW', 'MISSING_BEFORE_SNAPSHOT'].includes(flag))) return 'critical';
  if (flags.some((flag) => ['MISSING_REVIEW_EVIDENCE', 'MISSING_AUDIT_LEDGER_LINK', 'POST_PAYROLL_CORRECTION'].includes(flag))) return 'warning';
  if (flags.length > 0) return 'warning';
  return 'info';
}

export async function getTimesheetCorrectionLogReport(
  filters: TimesheetCorrectionLogReportFilters = {},
): Promise<TimesheetCorrectionLogReport> {
  const startDate = parseDateFilter(filters.startDate, 'startDate');
  const endDate = parseDateFilter(filters.endDate, 'endDate');
  const status = parseStatus(filters.status);
  const risk = parseRisk(filters.risk);

  const params: unknown[] = [];
  const clauses: string[] = [];
  if (startDate) {
    params.push(startDate);
    clauses.push(`tc.requested_at >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    clauses.push(`tc.requested_at < ($${params.length}::date + INTERVAL '1 day')`);
  }
  if (status) {
    params.push(status);
    clauses.push(`LOWER(tc.status) = $${params.length}::text`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const result = await pgPool.query(`
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
    )
    SELECT
      tc.id,
      tc.timesheet_id,
      tc.requested_by_employee_id,
      tc.requested_at,
      tc.reason,
      tc.original_snapshot,
      tc.proposed_changes,
      tc.status,
      tc.reviewed_by_user_id,
      tc.reviewed_at,
      tc.reviewer_note,
      tc.after_snapshot,
      ts.employee_id,
      ts.period_start,
      ts.period_end,
      ts.status AS timesheet_status,
      ts.total_hours,
      e.employee_code,
      e.name AS employee_name,
      req.name AS requested_by_name,
      ru.username AS reviewer_username,
      ru.first_name AS reviewer_first_name,
      ru.last_name AS reviewer_last_name,
      ru.email AS reviewer_email,
      ru.employee_id AS reviewer_employee_id,
      COALESCE(ex.batch_ids, '[]'::jsonb) AS exported_batch_ids,
      COALESCE(audit_rows.rows, '[]'::jsonb) AS audit_rows
    FROM timekeeping.timesheet_corrections tc
    JOIN timekeeping.timesheets ts ON ts.id = tc.timesheet_id
    JOIN employees e ON e.id = ts.employee_id
    LEFT JOIN employees req ON req.id = tc.requested_by_employee_id
    LEFT JOIN users ru ON ru.id = tc.reviewed_by_user_id
    LEFT JOIN exported ex ON ex.timesheet_id = tc.timesheet_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ae.id,
          'action', ae.action,
          'entityType', ae.entity_type,
          'entityId', ae.entity_id,
          'subjectType', ae.subject_type,
          'subjectId', ae.subject_id,
          'sequenceNumber', ae.sequence_number,
          'rowHash', ae.row_hash,
          'occurredAt', COALESCE(ae.occurred_at, ae.timestamp, ae.created_at),
          'actorName', ae.actor_name
        )
        ORDER BY COALESCE(ae.occurred_at, ae.timestamp, ae.created_at) DESC NULLS LAST, ae.id DESC
      ) AS rows
      FROM audit_events ae
      WHERE (
        (ae.subject_type IN ('timesheet_correction', 'timekeeping.timesheet_corrections') AND ae.subject_id = tc.id::text)
        OR (ae.entity_type IN ('timesheet_correction', 'timekeeping.timesheet_corrections') AND ae.entity_id = tc.id::text)
        OR (ae.subject_type IN ('timesheet', 'timekeeping.timesheets') AND ae.subject_id = tc.timesheet_id::text AND ae.action ILIKE '%CORRECTION%')
        OR (ae.entity_type IN ('timesheet', 'time_entry') AND ae.entity_id = tc.timesheet_id::text AND ae.action IN ('LABOR_CORRECTION', 'TIMESHEET_CORRECTION', 'PUNCH_EDITED', 'PUNCH_MODIFIED', 'TIME_ENTRY_EDITED', 'ENTRY_UPDATED'))
      )
    ) audit_rows ON true
    ${where}
    ORDER BY tc.requested_at DESC, tc.id DESC;
  `, params);

  let corrections = result.rows.map((row) => {
    const auditLedgerRows = normalizeAuditRows(row.audit_rows);
    const exportedBatchIds = normalizeIdArray(row.exported_batch_ids);
    const correction = {
      id: Number(row.id),
      timesheetId: Number(row.timesheet_id),
      employeeId: Number(row.employee_id),
      employeeCode: row.employee_code ?? null,
      employeeName: row.employee_name ?? `Employee ${row.employee_id}`,
      periodStart: toDateText(row.period_start),
      periodEnd: toDateText(row.period_end),
      timesheetStatus: row.timesheet_status ?? '',
      totalHours: round2(toNumber(row.total_hours)),
      requestedByEmployeeId: Number(row.requested_by_employee_id),
      requestedByName: row.requested_by_name ?? null,
      requestedAt: toIso(row.requested_at) ?? '',
      reviewedByUserId: row.reviewed_by_user_id == null ? null : Number(row.reviewed_by_user_id),
      reviewedByName: displayUser({
        username: row.reviewer_username,
        first_name: row.reviewer_first_name,
        last_name: row.reviewer_last_name,
        email: row.reviewer_email,
      }),
      reviewerEmployeeId: row.reviewer_employee_id == null ? null : Number(row.reviewer_employee_id),
      reviewedAt: toIso(row.reviewed_at),
      status: String(row.status ?? '').toLowerCase(),
      reason: row.reason ?? '',
      reviewerNote: row.reviewer_note ?? null,
      originalSnapshot: row.original_snapshot ?? null,
      proposedChanges: row.proposed_changes ?? null,
      afterSnapshot: row.after_snapshot ?? null,
      beforeAfterSummary: summarizeBeforeAfter(row.original_snapshot, row.proposed_changes, row.after_snapshot),
      exportedBatchIds,
      auditLedgerRows,
      flags: [] as string[],
      severity: 'info' as Severity,
    };
    correction.flags = buildFlags(correction);
    correction.severity = severityFor(correction.flags);
    return correction;
  });

  if (risk) {
    corrections = corrections.filter((row) => row.severity === risk);
  }

  const exceptions: TimesheetCorrectionLogReport['exceptions'] = [];
  for (const row of corrections) {
    for (const flag of row.flags) {
      exceptions.push({
        severity: severityFor([flag]),
        exceptionType: flag,
        message: `Correction ${row.id} for timesheet ${row.timesheetId} has ${flag.replaceAll('_', ' ').toLowerCase()}.`,
        correctionId: row.id,
        timesheetId: row.timesheetId,
      });
    }
  }

  const completeEvidence = corrections.filter((row) => {
    const terminal = ['approved', 'rejected'].includes(row.status);
    const approvedOk = row.status !== 'approved' || row.afterSnapshot != null;
    return terminal
      && row.reason.trim()
      && row.originalSnapshot
      && row.proposedChanges
      && row.reviewedByUserId
      && row.reviewedAt
      && row.reviewerNote?.trim()
      && approvedOk;
  }).length;

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      status: status ?? null,
      risk: risk ?? null,
    },
    summary: {
      totalCorrections: corrections.length,
      pending: corrections.filter((row) => row.status === 'pending').length,
      approved: corrections.filter((row) => row.status === 'approved').length,
      rejected: corrections.filter((row) => row.status === 'rejected').length,
      completeEvidence,
      incompleteEvidence: corrections.length - completeEvidence,
      missingAuditLedgerRows: corrections.filter((row) => row.auditLedgerRows.length === 0).length,
      postPayrollCorrections: corrections.filter((row) => row.exportedBatchIds.length > 0).length,
      selfReviewedCorrections: corrections.filter((row) => row.flags.includes('SELF_REVIEW')).length,
      criticalExceptions: exceptions.filter((row) => row.severity === 'critical').length,
      warningExceptions: exceptions.filter((row) => row.severity === 'warning').length,
    },
    corrections,
    exceptions,
  };
}
