import { pgPool } from '../../db';

export interface ChargeCodeUsageReportFilters {
  startDate?: string;
  endDate?: string;
}

export interface ChargeCodeUsageReport {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
  };
  summary: {
    totalChargeCodes: number;
    activeChargeCodes: number;
    inactiveChargeCodes: number;
    usedChargeCodes: number;
    totalLaborEntries: number;
    totalLaborHours: number;
    directLaborHours: number;
    indirectLaborHours: number;
    invalidLaborEntries: number;
    inactiveLaborEntries: number;
    approvalExceptionEntries: number;
  };
  masterRows: Array<{
    id: number | null;
    code: string;
    description: string | null;
    active: boolean;
    type: string;
    costHandling: string;
    requiresApproval: boolean;
    billable: boolean;
    department: string | null;
    contractReference: string | null;
    usageCount: number;
    totalHours: number;
    lastUsedAt: string | null;
    exceptionCount: number;
  }>;
  distributionRows: Array<{
    employeeName: string | null;
    employeeId: string;
    indexCode: string;
    accountCode: string | null;
    position: string | null;
    suffix: string;
    positionTitle: string | null;
    hiringOrg: string | null;
    distributionPercent: number;
    jobStartDate: string | null;
    jobEndDate: string | null;
    laborDistStartDate: string | null;
    laborDistEndDate: string | null;
    totalHours: number;
    chargeCodeStatus: 'ACTIVE' | 'INACTIVE' | 'INVALID';
  }>;
  exceptions: Array<{
    entryId: number;
    exceptionType: 'INVALID_CODE' | 'INACTIVE_CODE' | 'APPROVAL_REQUIRED';
    workDate: string;
    employeeId: string;
    employeeName: string | null;
    chargeCode: string | null;
    hours: number;
    clockIn: string | null;
    clockOut: string | null;
    department: string | null;
    operation: string | null;
    approvalStatus: string | null;
    laborApprovalId: number | null;
  }>;
}

function parseDateFilter(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

function buildDateClause(filters: ChargeCodeUsageReportFilters, paramOffset = 0) {
  const params: string[] = [];
  const clauses: string[] = [];
  const startDate = parseDateFilter(filters.startDate, 'startDate');
  const endDate = parseDateFilter(filters.endDate, 'endDate');

  if (startDate) {
    params.push(startDate);
    clauses.push(`t.date >= $${paramOffset + params.length}::date`);
  }

  if (endDate) {
    params.push(endDate);
    clauses.push(`t.date <= $${paramOffset + params.length}::date`);
  }

  return {
    params,
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    startDate: startDate ?? null,
    endDate: endDate ?? null,
  };
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export async function getChargeCodeUsageReport(
  filters: ChargeCodeUsageReportFilters = {},
): Promise<ChargeCodeUsageReport> {
  const dateClause = buildDateClause(filters);

  const usageSql = `
    WITH labor_entries AS (
      SELECT
        t.id,
        t.employee_id,
        t.date,
        t.clock_in,
        t.clock_out,
        t.department,
        t.operation,
        NULLIF(BTRIM(t.charge_code), '') AS charge_code,
        t.approval_status,
        t.labor_approval_id,
        CASE
          WHEN t.clock_in IS NOT NULL AND t.clock_out IS NOT NULL
            THEN GREATEST(EXTRACT(EPOCH FROM (t.clock_out - t.clock_in)) / 3600.0, 0)
          ELSE 0
        END AS hours
      FROM time_clock_entries t
      ${dateClause.where}
    ),
    usage_by_code AS (
      SELECT
        charge_code,
        COUNT(*)::int AS usage_count,
        COALESCE(SUM(hours), 0)::float AS total_hours,
        MAX(COALESCE(clock_out, clock_in)) AS last_used_at
      FROM labor_entries
      WHERE charge_code IS NOT NULL
      GROUP BY charge_code
    ),
    exception_by_code AS (
      SELECT
        le.charge_code,
        COUNT(*)::int AS exception_count
      FROM labor_entries le
      LEFT JOIN charge_codes cc ON cc.code = le.charge_code
      WHERE le.charge_code IS NOT NULL
        AND (
          cc.id IS NULL
          OR cc.active = false
          OR (
            cc.requires_approval = true
            AND le.labor_approval_id IS NULL
            AND COALESCE(le.approval_status, '') NOT IN ('APPROVED', 'AUTO_APPROVED')
          )
        )
      GROUP BY le.charge_code
    )
    SELECT
      cc.id,
      cc.code,
      cc.description,
      cc.active,
      cc.type,
      COALESCE(cc.cost_handling, 'DIRECT_CONTRACT') AS cost_handling,
      cc.requires_approval,
      cc.billable,
      cc.department,
      cc.contract_reference,
      COALESCE(u.usage_count, 0)::int AS usage_count,
      COALESCE(u.total_hours, 0)::float AS total_hours,
      u.last_used_at,
      COALESCE(e.exception_count, 0)::int AS exception_count
    FROM charge_codes cc
    LEFT JOIN usage_by_code u ON u.charge_code = cc.code
    LEFT JOIN exception_by_code e ON e.charge_code = cc.code
    UNION ALL
    SELECT
      NULL::int AS id,
      u.charge_code AS code,
      'Invalid or unmapped labor charge code' AS description,
      false AS active,
      'UNKNOWN' AS type,
      'UNMAPPED' AS cost_handling,
      false AS requires_approval,
      false AS billable,
      NULL::text AS department,
      NULL::text AS contract_reference,
      u.usage_count,
      u.total_hours,
      u.last_used_at,
      COALESCE(e.exception_count, u.usage_count)::int AS exception_count
    FROM usage_by_code u
    LEFT JOIN charge_codes cc ON cc.code = u.charge_code
    LEFT JOIN exception_by_code e ON e.charge_code = u.charge_code
    WHERE cc.id IS NULL
    ORDER BY code;
  `;

  const exceptionsSql = `
    WITH labor_entries AS (
      SELECT
        t.id,
        t.employee_id,
        t.date,
        t.clock_in,
        t.clock_out,
        t.department,
        t.operation,
        NULLIF(BTRIM(t.charge_code), '') AS charge_code,
        t.approval_status,
        t.labor_approval_id,
        CASE
          WHEN t.clock_in IS NOT NULL AND t.clock_out IS NOT NULL
            THEN GREATEST(EXTRACT(EPOCH FROM (t.clock_out - t.clock_in)) / 3600.0, 0)
          ELSE 0
        END AS hours
      FROM time_clock_entries t
      ${dateClause.where}
    )
    SELECT
      le.id AS entry_id,
      CASE
        WHEN cc.id IS NULL THEN 'INVALID_CODE'
        WHEN cc.active = false THEN 'INACTIVE_CODE'
        ELSE 'APPROVAL_REQUIRED'
      END AS exception_type,
      le.date AS work_date,
      le.employee_id,
      emp.name AS employee_name,
      le.charge_code,
      le.hours::float AS hours,
      le.clock_in,
      le.clock_out,
      le.department,
      le.operation,
      le.approval_status,
      le.labor_approval_id
    FROM labor_entries le
    LEFT JOIN charge_codes cc ON cc.code = le.charge_code
    LEFT JOIN employees emp ON emp.employee_code = le.employee_id OR emp.id::text = le.employee_id
    WHERE le.charge_code IS NOT NULL
      AND (
        cc.id IS NULL
        OR cc.active = false
        OR (
          cc.requires_approval = true
          AND le.labor_approval_id IS NULL
          AND COALESCE(le.approval_status, '') NOT IN ('APPROVED', 'AUTO_APPROVED')
        )
      )
    ORDER BY le.date DESC, le.id DESC
    LIMIT 500;
  `;

  const exceptionCountsSql = `
    WITH labor_entries AS (
      SELECT
        NULLIF(BTRIM(t.charge_code), '') AS charge_code,
        t.approval_status,
        t.labor_approval_id
      FROM time_clock_entries t
      ${dateClause.where}
    )
    SELECT
      COUNT(*) FILTER (WHERE cc.id IS NULL)::int AS invalid_labor_entries,
      COUNT(*) FILTER (WHERE cc.id IS NOT NULL AND cc.active = false)::int AS inactive_labor_entries,
      COUNT(*) FILTER (
        WHERE cc.id IS NOT NULL
          AND cc.active = true
          AND cc.requires_approval = true
          AND le.labor_approval_id IS NULL
          AND COALESCE(le.approval_status, '') NOT IN ('APPROVED', 'AUTO_APPROVED')
      )::int AS approval_exception_entries
    FROM labor_entries le
    LEFT JOIN charge_codes cc ON cc.code = le.charge_code
    WHERE le.charge_code IS NOT NULL;
  `;

  const distributionSql = `
    WITH labor_entries AS (
      SELECT
        t.employee_id,
        t.date,
        NULLIF(BTRIM(t.charge_code), '') AS charge_code,
        CASE
          WHEN t.clock_in IS NOT NULL AND t.clock_out IS NOT NULL
            THEN GREATEST(EXTRACT(EPOCH FROM (t.clock_out - t.clock_in)) / 3600.0, 0)
          ELSE 0
        END AS hours
      FROM time_clock_entries t
      ${dateClause.where}
    ),
    employee_totals AS (
      SELECT employee_id, COALESCE(SUM(hours), 0)::float AS employee_hours
      FROM labor_entries
      WHERE charge_code IS NOT NULL
      GROUP BY employee_id
    )
    SELECT
      le.employee_id,
      emp.name AS employee_name,
      le.charge_code AS index_code,
      cc.code AS matched_charge_code,
      cc.active AS charge_code_active,
      cc.type AS charge_code_type,
      COALESCE(cc.cost_handling, 'UNMAPPED') AS cost_handling,
      emp.job_title AS position_title,
      emp.department AS employee_department,
      emp.hire_date,
      MIN(le.date) AS labor_dist_start_date,
      MAX(le.date) AS labor_dist_end_date,
      COALESCE(SUM(le.hours), 0)::float AS total_hours,
      CASE
        WHEN et.employee_hours > 0
          THEN ROUND(((COALESCE(SUM(le.hours), 0) / et.employee_hours) * 100)::numeric, 2)::float
        ELSE 0
      END AS distribution_percent
    FROM labor_entries le
    LEFT JOIN charge_codes cc ON cc.code = le.charge_code
    LEFT JOIN employees emp ON emp.employee_code = le.employee_id OR emp.id::text = le.employee_id
    LEFT JOIN employee_totals et ON et.employee_id = le.employee_id
    WHERE le.charge_code IS NOT NULL
    GROUP BY
      le.employee_id,
      emp.name,
      le.charge_code,
      cc.code,
      cc.active,
      cc.type,
      cc.cost_handling,
      emp.job_title,
      emp.department,
      emp.hire_date,
      et.employee_hours
    ORDER BY emp.name NULLS LAST, le.employee_id, le.charge_code;
  `;

  const [masterResult, exceptionsResult, exceptionCountsResult, distributionResult] = await Promise.all([
    pgPool.query(usageSql, dateClause.params),
    pgPool.query(exceptionsSql, dateClause.params),
    pgPool.query(exceptionCountsSql, dateClause.params),
    pgPool.query(distributionSql, dateClause.params),
  ]);

  const masterRows = masterResult.rows.map((row) => ({
    id: row.id == null ? null : Number(row.id),
    code: row.code,
    description: row.description ?? null,
    active: Boolean(row.active),
    type: row.type,
    costHandling: row.cost_handling,
    requiresApproval: Boolean(row.requires_approval),
    billable: Boolean(row.billable),
    department: row.department ?? null,
    contractReference: row.contract_reference ?? null,
    usageCount: toNumber(row.usage_count),
    totalHours: toNumber(row.total_hours),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
    exceptionCount: toNumber(row.exception_count),
  }));

  const exceptions = exceptionsResult.rows.map((row) => ({
    entryId: Number(row.entry_id),
    exceptionType: row.exception_type,
    workDate: row.work_date instanceof Date ? row.work_date.toISOString().slice(0, 10) : String(row.work_date),
    employeeId: row.employee_id,
    employeeName: row.employee_name ?? null,
    chargeCode: row.charge_code ?? null,
    hours: toNumber(row.hours),
    clockIn: row.clock_in ? new Date(row.clock_in).toISOString() : null,
    clockOut: row.clock_out ? new Date(row.clock_out).toISOString() : null,
    department: row.department ?? null,
    operation: row.operation ?? null,
    approvalStatus: row.approval_status ?? null,
    laborApprovalId: row.labor_approval_id == null ? null : Number(row.labor_approval_id),
  }));

  const distributionRows = distributionResult.rows.map((row) => {
    const chargeCodeStatus: 'ACTIVE' | 'INACTIVE' | 'INVALID' = row.matched_charge_code == null
      ? 'INVALID'
      : row.charge_code_active === false
        ? 'INACTIVE'
        : 'ACTIVE';
    return {
      employeeName: row.employee_name ?? null,
      employeeId: row.employee_id,
      indexCode: row.index_code,
      accountCode: row.cost_handling ?? row.charge_code_type ?? null,
      position: null,
      suffix: '00',
      positionTitle: row.position_title ?? null,
      hiringOrg: row.employee_department ?? null,
      distributionPercent: toNumber(row.distribution_percent),
      jobStartDate: row.hire_date instanceof Date ? row.hire_date.toISOString().slice(0, 10) : row.hire_date ?? null,
      jobEndDate: null,
      laborDistStartDate: row.labor_dist_start_date instanceof Date ? row.labor_dist_start_date.toISOString().slice(0, 10) : row.labor_dist_start_date ?? null,
      laborDistEndDate: row.labor_dist_end_date instanceof Date ? row.labor_dist_end_date.toISOString().slice(0, 10) : row.labor_dist_end_date ?? null,
      totalHours: toNumber(row.total_hours),
      chargeCodeStatus,
    };
  });

  const summary = masterRows.reduce(
    (acc, row) => {
      if (row.id !== null) {
        acc.totalChargeCodes += 1;
        if (row.active) acc.activeChargeCodes += 1;
        else acc.inactiveChargeCodes += 1;
      }
      if (row.usageCount > 0) acc.usedChargeCodes += 1;
      acc.totalLaborEntries += row.usageCount;
      acc.totalLaborHours += row.totalHours;
      if (row.type === 'DIRECT') acc.directLaborHours += row.totalHours;
      else acc.indirectLaborHours += row.totalHours;
      return acc;
    },
    {
      totalChargeCodes: 0,
      activeChargeCodes: 0,
      inactiveChargeCodes: 0,
      usedChargeCodes: 0,
      totalLaborEntries: 0,
      totalLaborHours: 0,
      directLaborHours: 0,
      indirectLaborHours: 0,
      invalidLaborEntries: 0,
      inactiveLaborEntries: 0,
      approvalExceptionEntries: 0,
    },
  );

  const exceptionCounts = exceptionCountsResult.rows[0] ?? {};
  summary.invalidLaborEntries = toNumber(exceptionCounts.invalid_labor_entries);
  summary.inactiveLaborEntries = toNumber(exceptionCounts.inactive_labor_entries);
  summary.approvalExceptionEntries = toNumber(exceptionCounts.approval_exception_entries);

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate: dateClause.startDate,
      endDate: dateClause.endDate,
    },
    summary: {
      ...summary,
      totalLaborHours: Number(summary.totalLaborHours.toFixed(2)),
      directLaborHours: Number(summary.directLaborHours.toFixed(2)),
      indirectLaborHours: Number(summary.indirectLaborHours.toFixed(2)),
    },
    masterRows: masterRows.map((row) => ({ ...row, totalHours: Number(row.totalHours.toFixed(2)) })),
    distributionRows: distributionRows.map((row) => ({
      ...row,
      distributionPercent: Number(row.distributionPercent.toFixed(2)),
      totalHours: Number(row.totalHours.toFixed(2)),
    })),
    exceptions: exceptions.map((row) => ({ ...row, hours: Number(row.hours.toFixed(2)) })),
  };
}
