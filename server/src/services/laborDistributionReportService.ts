import { pgPool } from '../../db';

export interface LaborDistributionReportFilters {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
  chargeCodeId?: string;
  classification?: string;
}

type Severity = 'info' | 'warning' | 'critical';

export interface LaborDistributionReport {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    employeeId: number | null;
    chargeCodeId: number | null;
    classification: string | null;
  };
  summary: {
    rowCount: number;
    employeeCount: number;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    correctionHours: number;
    totalLaborDollars: number;
    directLaborDollars: number;
    indirectLaborDollars: number;
    certifiedTimesheetHours: number;
    distributedHoursVariance: number;
    payrollExportHours: number;
    payrollHoursVariance: number;
    payrollProcessedBatches: number;
    glPostedDollars: number;
    glUnpostedDollars: number;
    glJournalDebitDollars: number;
    glVariance: number;
    jobCostLinkedDollars: number;
    jobCostUnlinkedDollars: number;
    exceptionsCount: number;
  };
  rows: Array<{
    id: number;
    employeeId: number | null;
    employeeCode: string | null;
    employeeName: string;
    department: string | null;
    laborClass: string | null;
    workDate: string;
    payPeriod: string;
    accountingPeriod: string;
    chargeCodeId: number | null;
    chargeCode: string | null;
    chargeCodeDescription: string | null;
    chargeCodeActive: boolean | null;
    directIndirect: string;
    costHandling: string | null;
    workOrderNumber: string | null;
    projectCode: string | null;
    projectName: string | null;
    contractNumber: string | null;
    glAccountId: number | null;
    glAccountName: string | null;
    glStatus: string;
    regularHours: number;
    overtimeHours: number;
    correctionHours: number;
    totalHours: number;
    rateUsed: number;
    totalLaborDollars: number;
    rateSource: string;
    source: string;
    canonicalId: string | null;
    payrollBatchIds: number[];
    journalEntryId: number | null;
    certifiedAt: string | null;
    payrollApprovedAt: string | null;
    flags: string[];
  }>;
  reconciliation: Array<{
    area: string;
    systemOfRecord: string;
    sourceAmount: number;
    distributedAmount: number;
    variance: number;
    status: 'PASS' | 'WARN' | 'FAIL';
    note: string;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    laborCostRecordId: number | null;
    employeeName: string | null;
  }>;
}

function parseDateFilter(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

function parsePositiveInt(value: string | undefined, label: string): number | undefined {
  if (!value || value === 'all') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseClassification(value: string | undefined): string | undefined {
  if (!value || value === 'all') return undefined;
  const normalized = value.toUpperCase();
  if (!['DIRECT', 'INDIRECT'].includes(normalized)) {
    throw new Error('classification is invalid');
  }
  return normalized;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDate(value: Date | string | null): string {
  if (!value) return '';
  return value instanceof Date ? value.toISOString().slice(0, 10) : new Date(value).toISOString().slice(0, 10);
}

function varianceStatus(variance: number): 'PASS' | 'WARN' | 'FAIL' {
  const abs = Math.abs(variance);
  if (abs < 0.005) return 'PASS';
  if (abs < 1) return 'WARN';
  return 'FAIL';
}

function inferSource(canonicalId: string | null): string {
  if (!canonicalId) return 'LABOR_COST_RECORD';
  if (canonicalId.startsWith('stl-')) return 'SALARIED_TIMESHEET';
  if (canonicalId.startsWith('pl-')) return 'PUNCH_LEDGER';
  return 'LABOR_COST_RECORD';
}

function buildFlags(row: LaborDistributionReport['rows'][number]): string[] {
  const flags: string[] = [];
  if (!row.chargeCodeId || !row.chargeCode) flags.push('MISSING_CHARGE_CODE');
  if (row.chargeCodeActive === false) flags.push('INACTIVE_CHARGE_CODE');
  if (row.directIndirect === 'DIRECT' && !row.workOrderNumber && !row.projectCode) flags.push('DIRECT_LABOR_MISSING_JOB_COST_LINK');
  if (!row.glAccountId) flags.push('MISSING_GL_ACCOUNT_MAPPING');
  if (!row.journalEntryId) flags.push('NOT_POSTED_TO_GL');
  if (row.totalHours < 0 || row.totalLaborDollars < 0) flags.push('NEGATIVE_LABOR');
  if (row.totalHours > 24) flags.push('IMPOSSIBLE_DAILY_HOURS');
  if (row.source === 'SALARIED_TIMESHEET' && !row.payrollApprovedAt) flags.push('MISSING_PAYROLL_APPROVAL_TRACE');
  return flags;
}

export async function getLaborDistributionReport(
  filters: LaborDistributionReportFilters = {},
): Promise<LaborDistributionReport> {
  const startDate = parseDateFilter(filters.startDate, 'startDate');
  const endDate = parseDateFilter(filters.endDate, 'endDate');
  const employeeId = parsePositiveInt(filters.employeeId, 'employeeId');
  const chargeCodeId = parsePositiveInt(filters.chargeCodeId, 'chargeCodeId');
  const classification = parseClassification(filters.classification);

  const params: unknown[] = [];
  const clauses: string[] = [];
  if (startDate) {
    params.push(startDate);
    clauses.push(`lcr.clock_in::date >= $${params.length}::date`);
  }
  if (endDate) {
    params.push(endDate);
    clauses.push(`lcr.clock_in::date <= $${params.length}::date`);
  }
  if (employeeId) {
    params.push(employeeId);
    clauses.push(`lcr.epoch_employee_id = $${params.length}::int`);
  }
  if (chargeCodeId) {
    params.push(chargeCodeId);
    clauses.push(`lcr.charge_code_id = $${params.length}::int`);
  }
  if (classification) {
    params.push(classification);
    clauses.push(`CASE WHEN COALESCE(cc.type, lcr.cost_type) = 'DIRECT' THEN 'DIRECT' ELSE 'INDIRECT' END = $${params.length}::text`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rowsSql = `
    WITH payroll_batches AS (
      SELECT
        jsonb_array_elements_text(source_timesheet_ids)::int AS timesheet_id,
        jsonb_agg(id ORDER BY revision_number) AS batch_ids
      FROM timekeeping.payroll_export_batches
      WHERE status IN ('active', 'processed')
      GROUP BY 1
    ),
    gl_debits AS (
      SELECT journal_entry_id, SUM(COALESCE(debit_amount, 0))::numeric AS debit_total
      FROM journal_lines
      GROUP BY journal_entry_id
    )
    SELECT
      lcr.id,
      lcr.epoch_employee_id,
      e.employee_code,
      e.name AS employee_name,
      COALESCE(lcr.department_code, e.department) AS department,
      e.job_title AS labor_class,
      lcr.clock_in,
      lcr.period_year,
      lcr.period_month,
      lcr.charge_code_id,
      cc.code AS charge_code,
      cc.description AS charge_code_description,
      cc.active AS charge_code_active,
      COALESCE(cc.type, lcr.cost_type) AS charge_code_type,
      cc.cost_handling,
      pwo.work_order_number,
      COALESCE(p.project_code, wp.project_code) AS project_code,
      COALESCE(p.project_name, wp.project_name) AS project_name,
      cc.contract_reference,
      coa.id AS gl_account_id,
      coa.account_name AS gl_account_name,
      je.status AS gl_status,
      lcr.hours_worked,
      lcr.rate_used,
      lcr.dollar_cost,
      lcr.rate_source,
      lcr.cost_type,
      lcr.canonical_id,
      lcr.journal_entry_id,
      gl_debits.debit_total,
      st.id AS salaried_timesheet_id,
      st.period_start AS salaried_period_start,
      st.period_end AS salaried_period_end,
      st.certified_at,
      st.payroll_approved_at,
      pb.batch_ids
    FROM labor_cost_records lcr
    LEFT JOIN employees e ON e.id = lcr.epoch_employee_id
    LEFT JOIN charge_codes cc ON cc.id = lcr.charge_code_id
    LEFT JOIN production_work_orders pwo ON pwo.id = lcr.production_work_order_id
    LEFT JOIN projects p ON p.id = lcr.project_id
    LEFT JOIN projects wp ON wp.id = pwo.project_id
    LEFT JOIN labor_account_config lac ON true
    LEFT JOIN chart_of_accounts coa ON coa.id = CASE
      WHEN lcr.cost_type = 'DIRECT' THEN lac.direct_labor_account_id
      WHEN lcr.cost_type = 'OVERHEAD' THEN lac.overhead_labor_account_id
      WHEN lcr.cost_type = 'G_AND_A' THEN lac.ga_labor_account_id
      ELSE NULL
    END
    LEFT JOIN journal_entries je ON je.id = lcr.journal_entry_id
    LEFT JOIN gl_debits ON gl_debits.journal_entry_id = lcr.journal_entry_id
    LEFT JOIN timekeeping.salaried_timesheet_lines stl
      ON lcr.canonical_id = ('stl-' || stl.timesheet_id || '-' || stl.id)
    LEFT JOIN timekeeping.salaried_timesheets st ON st.id = stl.timesheet_id
    LEFT JOIN payroll_batches pb ON pb.timesheet_id = st.id
    ${where}
    ORDER BY lcr.clock_in DESC, e.name NULLS LAST, cc.code NULLS LAST, lcr.id DESC;
  `;

  const result = await pgPool.query(rowsSql, params);
  const rows = result.rows.map((row) => {
    const totalHours = round4(toNumber(row.hours_worked));
    const totalLaborDollars = round2(toNumber(row.dollar_cost));
    const directIndirect = row.charge_code_type === 'DIRECT' ? 'DIRECT' : 'INDIRECT';
    const source = inferSource(row.canonical_id ?? null);
    const payPeriod = row.salaried_period_start && row.salaried_period_end
      ? `${row.salaried_period_start} to ${row.salaried_period_end}`
      : `${row.period_year}-${String(row.period_month).padStart(2, '0')}`;
    const batchIds = Array.isArray(row.batch_ids)
      ? row.batch_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id))
      : [];
    const mapped = {
      id: Number(row.id),
      employeeId: row.epoch_employee_id == null ? null : Number(row.epoch_employee_id),
      employeeCode: row.employee_code ?? null,
      employeeName: row.employee_name ?? 'Unknown employee',
      department: row.department ?? null,
      laborClass: row.labor_class ?? null,
      workDate: toDate(row.clock_in),
      payPeriod,
      accountingPeriod: `${row.period_year}-${String(row.period_month).padStart(2, '0')}`,
      chargeCodeId: row.charge_code_id == null ? null : Number(row.charge_code_id),
      chargeCode: row.charge_code ?? null,
      chargeCodeDescription: row.charge_code_description ?? null,
      chargeCodeActive: row.charge_code_active == null ? null : Boolean(row.charge_code_active),
      directIndirect,
      costHandling: row.cost_handling ?? null,
      workOrderNumber: row.work_order_number ?? null,
      projectCode: row.project_code ?? null,
      projectName: row.project_name ?? null,
      contractNumber: row.contract_reference ?? null,
      glAccountId: row.gl_account_id == null ? null : Number(row.gl_account_id),
      glAccountName: row.gl_account_name ?? null,
      glStatus: row.gl_status ?? 'UNPOSTED',
      regularHours: totalHours,
      overtimeHours: 0,
      correctionHours: 0,
      totalHours,
      rateUsed: round2(toNumber(row.rate_used)),
      totalLaborDollars,
      rateSource: row.rate_source,
      source,
      canonicalId: row.canonical_id ?? null,
      payrollBatchIds: batchIds,
      journalEntryId: row.journal_entry_id == null ? null : Number(row.journal_entry_id),
      certifiedAt: toIso(row.certified_at ?? null),
      payrollApprovedAt: toIso(row.payroll_approved_at ?? null),
      flags: [] as string[],
    };
    mapped.flags = buildFlags(mapped);
    return mapped;
  });

  const timeParams: unknown[] = [];
  const timeClauses: string[] = [];
  if (startDate) {
    timeParams.push(startDate);
    timeClauses.push(`stl.date >= $${timeParams.length}::text`);
  }
  if (endDate) {
    timeParams.push(endDate);
    timeClauses.push(`stl.date <= $${timeParams.length}::text`);
  }
  if (employeeId) {
    timeParams.push(employeeId);
    timeClauses.push(`st.employee_id = $${timeParams.length}::int`);
  }
  if (chargeCodeId) {
    timeParams.push(chargeCodeId);
    timeClauses.push(`stl.charge_code_id = $${timeParams.length}::int`);
  }
  const timeWhere = timeClauses.length ? `AND ${timeClauses.join(' AND ')}` : '';
  const certifiedResult = await pgPool.query(`
    SELECT COALESCE(SUM(stl.hours), 0)::numeric AS hours
    FROM timekeeping.salaried_timesheet_lines stl
    JOIN timekeeping.salaried_timesheets st ON st.id = stl.timesheet_id
    WHERE st.status IN ('CERTIFIED', 'APPROVED', 'PAYROLL_APPROVED', 'LOCKED')
      ${timeWhere};
  `, timeParams);
  const certifiedTimesheetHours = round4(toNumber(certifiedResult.rows[0]?.hours));

  const payrollParams: unknown[] = [];
  const payrollClauses: string[] = [`peb.status IN ('active', 'processed')`];
  if (startDate) {
    payrollParams.push(startDate);
    payrollClauses.push(`peb.period_end >= $${payrollParams.length}::text`);
  }
  if (endDate) {
    payrollParams.push(endDate);
    payrollClauses.push(`peb.period_start <= $${payrollParams.length}::text`);
  }
  if (employeeId) {
    payrollParams.push(employeeId);
    payrollClauses.push(`per.epoch_employee_id = $${payrollParams.length}::int`);
  }
  const payrollResult = await pgPool.query(`
    SELECT
      COALESCE(SUM(per.regular_hours + per.overtime_hours + per.double_overtime_hours + per.sick_hours + per.vacation_hours), 0)::numeric AS hours,
      COUNT(DISTINCT CASE WHEN peb.status = 'processed' THEN peb.id ELSE NULL END)::int AS processed_batches
    FROM timekeeping.payroll_export_rows per
    JOIN timekeeping.payroll_export_batches peb ON peb.id = per.batch_id
    WHERE ${payrollClauses.join(' AND ')};
  `, payrollParams);
  const payrollExportHours = round4(toNumber(payrollResult.rows[0]?.hours));
  const payrollProcessedBatches = Number(payrollResult.rows[0]?.processed_batches ?? 0);

  const totalHours = round4(rows.reduce((sum, row) => sum + row.totalHours, 0));
  const totalLaborDollars = round2(rows.reduce((sum, row) => sum + row.totalLaborDollars, 0));
  const glDebitByJournalEntry = new Map<number, number>();
  for (const row of result.rows) {
    if (row.journal_entry_id != null) {
      glDebitByJournalEntry.set(Number(row.journal_entry_id), toNumber(row.debit_total));
    }
  }
  const glJournalDebitDollars = round2(Array.from(glDebitByJournalEntry.values()).reduce((sum, amount) => sum + amount, 0));
  const directLaborDollars = round2(rows.filter((row) => row.directIndirect === 'DIRECT').reduce((sum, row) => sum + row.totalLaborDollars, 0));
  const indirectLaborDollars = round2(totalLaborDollars - directLaborDollars);
  const glPostedDollars = round2(rows.filter((row) => row.journalEntryId).reduce((sum, row) => sum + row.totalLaborDollars, 0));
  const glUnpostedDollars = round2(totalLaborDollars - glPostedDollars);
  const jobCostLinkedDollars = round2(rows.filter((row) => row.directIndirect === 'DIRECT' && (row.workOrderNumber || row.projectCode)).reduce((sum, row) => sum + row.totalLaborDollars, 0));
  const jobCostUnlinkedDollars = round2(directLaborDollars - jobCostLinkedDollars);

  const exceptions: LaborDistributionReport['exceptions'] = [];
  for (const row of rows) {
    for (const flag of row.flags) {
      const critical = ['INACTIVE_CHARGE_CODE', 'NEGATIVE_LABOR', 'IMPOSSIBLE_DAILY_HOURS'].includes(flag);
      exceptions.push({
        severity: critical ? 'critical' : 'warning',
        exceptionType: flag,
        message: `${row.employeeName} has ${flag.replaceAll('_', ' ').toLowerCase()} on ${row.workDate}.`,
        laborCostRecordId: row.id,
        employeeName: row.employeeName,
      });
    }
  }

  const distributedHoursVariance = round4(certifiedTimesheetHours - totalHours);
  const payrollHoursVariance = round4(payrollExportHours - totalHours);
  const glVariance = round2(glJournalDebitDollars - glPostedDollars);

  const reconciliation: LaborDistributionReport['reconciliation'] = [
    {
      area: 'Certified timesheets to distributed hours',
      systemOfRecord: 'timekeeping.salaried_timesheets',
      sourceAmount: certifiedTimesheetHours,
      distributedAmount: totalHours,
      variance: distributedHoursVariance,
      status: varianceStatus(distributedHoursVariance),
      note: 'Compares certified/locked salaried timesheet line hours to labor cost record hours in scope.',
    },
    {
      area: 'Payroll export to distributed hours',
      systemOfRecord: 'timekeeping.payroll_export_batches',
      sourceAmount: payrollExportHours,
      distributedAmount: totalHours,
      variance: payrollHoursVariance,
      status: varianceStatus(payrollHoursVariance),
      note: 'Payroll export rows currently provide hours, not payroll dollars; dollar tie-out uses labor costing and GL.',
    },
    {
      area: 'Labor distribution to GL debit lines',
      systemOfRecord: 'journal_entries / journal_lines',
      sourceAmount: glJournalDebitDollars,
      distributedAmount: glPostedDollars,
      variance: glVariance,
      status: varianceStatus(glVariance),
      note: 'Compares posted labor records to debit totals on linked journal entries.',
    },
    {
      area: 'Direct labor to job cost',
      systemOfRecord: 'production_work_orders / projects',
      sourceAmount: jobCostLinkedDollars,
      distributedAmount: directLaborDollars,
      variance: round2(jobCostLinkedDollars - directLaborDollars),
      status: varianceStatus(jobCostLinkedDollars - directLaborDollars),
      note: 'Direct labor should carry a work order or project link for job-cost traceability.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      employeeId: employeeId ?? null,
      chargeCodeId: chargeCodeId ?? null,
      classification: classification ?? null,
    },
    summary: {
      rowCount: rows.length,
      employeeCount: new Set(rows.map((row) => row.employeeId).filter(Boolean)).size,
      totalHours,
      regularHours: totalHours,
      overtimeHours: 0,
      correctionHours: 0,
      totalLaborDollars,
      directLaborDollars,
      indirectLaborDollars,
      certifiedTimesheetHours,
      distributedHoursVariance,
      payrollExportHours,
      payrollHoursVariance,
      payrollProcessedBatches,
      glPostedDollars,
      glUnpostedDollars,
      glJournalDebitDollars,
      glVariance,
      jobCostLinkedDollars,
      jobCostUnlinkedDollars,
      exceptionsCount: exceptions.length,
    },
    rows,
    reconciliation,
    exceptions,
  };
}
