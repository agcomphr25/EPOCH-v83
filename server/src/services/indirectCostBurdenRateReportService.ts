import { pgPool } from '../../db';

export interface IndirectCostBurdenRateReportFilters {
  asOfDate?: string;
  rateType?: string;
  year?: string;
  month?: string;
}

type Severity = 'info' | 'warning' | 'critical';

export interface IndirectCostBurdenRateReport {
  generatedAt: string;
  filters: {
    asOfDate: string;
    rateType: string;
    year: number | null;
    month: number | null;
  };
  summary: {
    totalPools: number;
    activePools: number;
    inactivePools: number;
    activeBases: number;
    poolsMissingCurrentRate: number;
    completedRuns: number;
    selectedRunId: number | null;
    appliedRecordCount: number;
    totalBaseAmount: number;
    totalBurdenAmount: number;
    trueUpAmount: number;
  };
  pools: Array<{
    poolId: number;
    poolCode: string;
    poolName: string;
    poolType: string;
    poolDescription: string | null;
    isActive: boolean;
    applyOrder: number;
    baseId: number | null;
    baseCode: string | null;
    baseName: string | null;
    baseDescription: string | null;
    resolverKind: string | null;
    accountMappingStatus: 'PENDING_ACCOUNT_MAPPING';
    currentRateId: number | null;
    currentRateType: string | null;
    currentRate: number | null;
    currentEffectiveFrom: string | null;
    currentNotes: string | null;
    currentCreatedBy: string | null;
    currentCreatedAt: string | null;
  }>;
  rates: Array<{
    rateId: number;
    poolId: number;
    poolCode: string;
    poolName: string;
    rateType: string;
    rate: number;
    effectiveFrom: string;
    notes: string | null;
    createdBy: string;
    createdAt: string | null;
    isCurrentForSelectedType: boolean;
  }>;
  runs: Array<{
    runId: number;
    periodYear: number;
    periodMonth: number;
    runType: string;
    rateType: string;
    status: string;
    supersedesRunId: number | null;
    appliedBy: string;
    recordCount: number;
    totalBurden: number;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  poolApplicationSummary: Array<{
    poolId: number;
    poolCode: string;
    poolName: string;
    rateType: string;
    rateUsed: number;
    rateEffectiveFrom: string;
    sourceRecordCount: number;
    totalBaseAmount: number;
    totalBurdenAmount: number;
    trueUpAmount: number;
  }>;
  appliedCalculations: Array<{
    appliedId: number;
    runId: number;
    sourceRecordId: number;
    employeeName: string | null;
    employeeCode: string | null;
    departmentCode: string | null;
    jobCode: string | null;
    costType: string;
    hoursWorked: number;
    dollarCost: number;
    poolCode: string;
    poolName: string;
    rateType: string;
    rateEffectiveFrom: string;
    baseAmount: number;
    rateUsed: number;
    burdenAmount: number;
    isTrueUp: boolean;
    priorAmount: number | null;
    appliedAt: string | null;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    poolId: number | null;
    runId: number | null;
  }>;
}

const RATE_TYPES = new Set(['PROVISIONAL', 'BILLING', 'FINAL']);

function parseDate(value: string | undefined): string {
  const date = value || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('asOfDate must be in YYYY-MM-DD format');
  }
  return date;
}

function parseRateType(value: string | undefined): string {
  const rateType = (value || 'PROVISIONAL').toUpperCase();
  if (!RATE_TYPES.has(rateType)) {
    throw new Error('rateType must be PROVISIONAL, BILLING, or FINAL');
  }
  return rateType;
}

function parsePeriodNumber(value: string | undefined, label: string, min: number, max: number): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return num;
}

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateText(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export async function getIndirectCostBurdenRateReport(
  filters: IndirectCostBurdenRateReportFilters = {},
): Promise<IndirectCostBurdenRateReport> {
  const asOfDate = parseDate(filters.asOfDate);
  const rateType = parseRateType(filters.rateType);
  const year = parsePeriodNumber(filters.year, 'year', 2000, 2100);
  const month = parsePeriodNumber(filters.month, 'month', 1, 12);
  if ((year == null) !== (month == null)) {
    throw new Error('year and month must be supplied together');
  }

  const poolsSql = `
    SELECT
      p.id AS pool_id,
      p.code AS pool_code,
      p.name AS pool_name,
      p.pool_type,
      p.description AS pool_description,
      p.is_active,
      p.apply_order,
      b.id AS base_id,
      b.code AS base_code,
      b.name AS base_name,
      b.description AS base_description,
      b.resolver_kind,
      b.is_active AS base_is_active,
      r.id AS current_rate_id,
      r.rate_type AS current_rate_type,
      r.rate AS current_rate,
      r.effective_from AS current_effective_from,
      r.notes AS current_notes,
      r.created_by AS current_created_by,
      r.created_at AS current_created_at
    FROM indirect_cost_pools p
    LEFT JOIN allocation_bases b ON b.id = p.allocation_base_id
    LEFT JOIN LATERAL (
      SELECT ir.*
      FROM indirect_rates ir
      WHERE ir.pool_id = p.id
        AND ir.rate_type = $2::text
        AND ir.effective_from <= $1::date
      ORDER BY ir.effective_from DESC, ir.id DESC
      LIMIT 1
    ) r ON true
    ORDER BY p.apply_order, p.code;
  `;

  const ratesSql = `
    WITH current_rates AS (
      SELECT DISTINCT ON (pool_id, rate_type)
        id,
        pool_id,
        rate_type
      FROM indirect_rates
      WHERE effective_from <= $1::date
      ORDER BY pool_id, rate_type, effective_from DESC, id DESC
    )
    SELECT
      r.id AS rate_id,
      r.pool_id,
      p.code AS pool_code,
      p.name AS pool_name,
      r.rate_type,
      r.rate,
      r.effective_from,
      r.notes,
      r.created_by,
      r.created_at,
      (cr.id IS NOT NULL AND r.rate_type = $2::text) AS is_current_for_selected_type
    FROM indirect_rates r
    INNER JOIN indirect_cost_pools p ON p.id = r.pool_id
    LEFT JOIN current_rates cr ON cr.id = r.id
    ORDER BY p.apply_order, p.code, r.rate_type, r.effective_from DESC, r.id DESC;
  `;

  const runsSql = year == null || month == null
    ? `
      SELECT *
      FROM burden_application_runs
      ORDER BY period_year DESC, period_month DESC, id DESC
      LIMIT 25;
    `
    : `
      SELECT *
      FROM burden_application_runs
      WHERE period_year = $1::int
        AND period_month = $2::int
      ORDER BY id DESC;
    `;

  const [poolsResult, ratesResult, runsResult] = await Promise.all([
    pgPool.query(poolsSql, [asOfDate, rateType]),
    pgPool.query(ratesSql, [asOfDate, rateType]),
    pgPool.query(runsSql, year == null || month == null ? [] : [year, month]),
  ]);

  const runs = runsResult.rows.map((row) => ({
    runId: Number(row.id),
    periodYear: Number(row.period_year),
    periodMonth: Number(row.period_month),
    runType: row.run_type,
    rateType: row.rate_type,
    status: row.status,
    supersedesRunId: row.supersedes_run_id == null ? null : Number(row.supersedes_run_id),
    appliedBy: row.applied_by,
    recordCount: Number(row.record_count ?? 0),
    totalBurden: round4(toNumber(row.total_burden)),
    errorMessage: row.error_message ?? null,
    startedAt: toIso(row.started_at ?? null),
    completedAt: toIso(row.completed_at ?? null),
  }));

  const selectedRun = year == null || month == null
    ? null
    : runs.find((run) => run.status === 'COMPLETED' && run.rateType === rateType)
      ?? runs.find((run) => run.status === 'COMPLETED')
      ?? null;

  const [summaryResult, appliedResult] = selectedRun
    ? await Promise.all([
        pgPool.query(
          `
            SELECT
              p.id AS pool_id,
              p.code AS pool_code,
              p.name AS pool_name,
              r.rate_type,
              aba.rate_used,
              r.effective_from AS rate_effective_from,
              COUNT(DISTINCT aba.source_record_id)::int AS source_record_count,
              COALESCE(SUM(aba.base_amount), 0)::float AS total_base_amount,
              COALESCE(SUM(aba.burden_amount), 0)::float AS total_burden_amount,
              COALESCE(SUM(CASE WHEN aba.is_true_up THEN aba.burden_amount ELSE 0 END), 0)::float AS true_up_amount
            FROM applied_burden_amounts aba
            INNER JOIN indirect_cost_pools p ON p.id = aba.pool_id
            INNER JOIN indirect_rates r ON r.id = aba.rate_id
            WHERE aba.application_run_id = $1::int
            GROUP BY p.id, p.code, p.name, r.rate_type, aba.rate_used, r.effective_from, p.apply_order
            ORDER BY p.apply_order, p.code;
          `,
          [selectedRun.runId],
        ),
        pgPool.query(
          `
            SELECT
              aba.id AS applied_id,
              aba.application_run_id AS run_id,
              aba.source_record_id,
              emp.name AS employee_name,
              emp.employee_code,
              lcr.department_code,
              lcr.job_code,
              lcr.cost_type,
              lcr.hours_worked,
              lcr.dollar_cost,
              p.code AS pool_code,
              p.name AS pool_name,
              r.rate_type,
              r.effective_from AS rate_effective_from,
              aba.base_amount,
              aba.rate_used,
              aba.burden_amount,
              aba.is_true_up,
              aba.prior_amount,
              aba.applied_at
            FROM applied_burden_amounts aba
            INNER JOIN labor_cost_records lcr ON lcr.id = aba.source_record_id
            LEFT JOIN employees emp ON emp.id = lcr.epoch_employee_id
            INNER JOIN indirect_cost_pools p ON p.id = aba.pool_id
            INNER JOIN indirect_rates r ON r.id = aba.rate_id
            WHERE aba.application_run_id = $1::int
            ORDER BY p.apply_order, emp.name NULLS LAST, lcr.id, aba.id
            LIMIT 1000;
          `,
          [selectedRun.runId],
        ),
      ])
    : [{ rows: [] }, { rows: [] }];

  const pools = poolsResult.rows.map((row) => ({
    poolId: Number(row.pool_id),
    poolCode: row.pool_code,
    poolName: row.pool_name,
    poolType: row.pool_type,
    poolDescription: row.pool_description ?? null,
    isActive: Boolean(row.is_active),
    applyOrder: Number(row.apply_order),
    baseId: row.base_id == null ? null : Number(row.base_id),
    baseCode: row.base_code ?? null,
    baseName: row.base_name ?? null,
    baseDescription: row.base_description ?? null,
    resolverKind: row.resolver_kind ?? null,
    accountMappingStatus: 'PENDING_ACCOUNT_MAPPING' as const,
    currentRateId: row.current_rate_id == null ? null : Number(row.current_rate_id),
    currentRateType: row.current_rate_type ?? null,
    currentRate: row.current_rate == null ? null : round4(toNumber(row.current_rate)),
    currentEffectiveFrom: dateText(row.current_effective_from ?? null),
    currentNotes: row.current_notes ?? null,
    currentCreatedBy: row.current_created_by ?? null,
    currentCreatedAt: toIso(row.current_created_at ?? null),
  }));

  const rates = ratesResult.rows.map((row) => ({
    rateId: Number(row.rate_id),
    poolId: Number(row.pool_id),
    poolCode: row.pool_code,
    poolName: row.pool_name,
    rateType: row.rate_type,
    rate: round4(toNumber(row.rate)),
    effectiveFrom: dateText(row.effective_from) ?? '',
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at ?? null),
    isCurrentForSelectedType: Boolean(row.is_current_for_selected_type),
  }));

  const poolApplicationSummary = summaryResult.rows.map((row) => ({
    poolId: Number(row.pool_id),
    poolCode: row.pool_code,
    poolName: row.pool_name,
    rateType: row.rate_type,
    rateUsed: round4(toNumber(row.rate_used)),
    rateEffectiveFrom: dateText(row.rate_effective_from) ?? '',
    sourceRecordCount: Number(row.source_record_count ?? 0),
    totalBaseAmount: round4(toNumber(row.total_base_amount)),
    totalBurdenAmount: round4(toNumber(row.total_burden_amount)),
    trueUpAmount: round4(toNumber(row.true_up_amount)),
  }));

  const appliedCalculations = appliedResult.rows.map((row) => ({
    appliedId: Number(row.applied_id),
    runId: Number(row.run_id),
    sourceRecordId: Number(row.source_record_id),
    employeeName: row.employee_name ?? null,
    employeeCode: row.employee_code ?? null,
    departmentCode: row.department_code ?? null,
    jobCode: row.job_code ?? null,
    costType: row.cost_type,
    hoursWorked: round4(toNumber(row.hours_worked)),
    dollarCost: round4(toNumber(row.dollar_cost)),
    poolCode: row.pool_code,
    poolName: row.pool_name,
    rateType: row.rate_type,
    rateEffectiveFrom: dateText(row.rate_effective_from) ?? '',
    baseAmount: round4(toNumber(row.base_amount)),
    rateUsed: round4(toNumber(row.rate_used)),
    burdenAmount: round4(toNumber(row.burden_amount)),
    isTrueUp: Boolean(row.is_true_up),
    priorAmount: row.prior_amount == null ? null : round4(toNumber(row.prior_amount)),
    appliedAt: toIso(row.applied_at ?? null),
  }));

  const exceptions: IndirectCostBurdenRateReport['exceptions'] = [];
  for (const pool of pools) {
    if (pool.isActive && pool.currentRateId == null) {
      exceptions.push({
        severity: 'critical',
        exceptionType: 'MISSING_CURRENT_RATE',
        message: `Active pool ${pool.poolCode} has no ${rateType} rate effective on or before ${asOfDate}.`,
        poolId: pool.poolId,
        runId: null,
      });
    }
    if (pool.isActive && !pool.baseId) {
      exceptions.push({
        severity: 'critical',
        exceptionType: 'MISSING_ALLOCATION_BASE',
        message: `Active pool ${pool.poolCode} is not tied to an allocation base.`,
        poolId: pool.poolId,
        runId: null,
      });
    }
  }
  if (year != null && month != null && !selectedRun) {
    exceptions.push({
      severity: 'warning',
      exceptionType: 'NO_COMPLETED_APPLICATION_RUN',
      message: `No completed burden application run was found for ${year}-${String(month).padStart(2, '0')}.`,
      poolId: null,
      runId: null,
    });
  }

  const activePools = pools.filter((pool) => pool.isActive);
  const summary = {
    totalPools: pools.length,
    activePools: activePools.length,
    inactivePools: pools.length - activePools.length,
    activeBases: new Set(pools.filter((pool) => pool.baseId != null).map((pool) => pool.baseId)).size,
    poolsMissingCurrentRate: pools.filter((pool) => pool.isActive && pool.currentRateId == null).length,
    completedRuns: runs.filter((run) => run.status === 'COMPLETED').length,
    selectedRunId: selectedRun?.runId ?? null,
    appliedRecordCount: selectedRun?.recordCount ?? 0,
    totalBaseAmount: round4(poolApplicationSummary.reduce((sum, row) => sum + row.totalBaseAmount, 0)),
    totalBurdenAmount: round4(poolApplicationSummary.reduce((sum, row) => sum + row.totalBurdenAmount, 0)),
    trueUpAmount: round4(poolApplicationSummary.reduce((sum, row) => sum + row.trueUpAmount, 0)),
  };

  return {
    generatedAt: new Date().toISOString(),
    filters: { asOfDate, rateType, year, month },
    summary,
    pools,
    rates,
    runs,
    poolApplicationSummary,
    appliedCalculations,
    exceptions,
  };
}
