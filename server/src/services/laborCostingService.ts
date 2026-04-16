import { storage } from '../../storage';
import { deriveLaborIntervals } from './laborSummary';
import type { InsertLaborCostRecord } from '../../schema';

export type CostType = 'DIRECT' | 'OVERHEAD' | 'G_AND_A';
export type RateSource = 'HOURLY_RATE' | 'SALARY' | 'DEFAULT_LABOR_RATE';

export interface ResolvedRate {
  rate: number;
  rateSource: RateSource;
}

/**
 * Resolve the effective hourly rate for an employee.
 * Priority: hourlyRate → salary / 2080 → defaultLaborRate fallback
 */
export async function resolveEmployeeRate(employeeId: number): Promise<ResolvedRate> {
  const employee = await storage.getEmployee(employeeId);

  if (employee) {
    const hourlyRate = employee.hourlyRate != null ? Number(employee.hourlyRate) : null;
    if (hourlyRate !== null && hourlyRate > 0) {
      return { rate: hourlyRate, rateSource: 'HOURLY_RATE' };
    }

    const salary = employee.salary != null ? Number(employee.salary) : null;
    if (salary !== null && salary > 0) {
      return { rate: salary / 2080, rateSource: 'SALARY' };
    }
  }

  const defaults = await storage.getEstimatingDefaultsFirst();
  const defaultRate = defaults ? Number(defaults.defaultLaborRate) : 0;
  return { rate: defaultRate, rateSource: 'DEFAULT_LABOR_RATE' };
}

/**
 * Determine cost type for an interval.
 * - jobCode present → DIRECT
 * - departmentCode → look up cost_center.type → OVERHEAD or G_AND_A
 * - fallback → OVERHEAD
 */
export async function classifyLaborCost(jobCode: string | null, departmentCode: string | null): Promise<CostType> {
  if (jobCode) return 'DIRECT';

  if (departmentCode) {
    const costCenter = await storage.getCostCenterByCode(departmentCode);
    if (costCenter) {
      const t = costCenter.type.toUpperCase();
      if (t === 'ADMINISTRATIVE') return 'G_AND_A';
      if (t === 'OVERHEAD') return 'OVERHEAD';
    }
  }

  return 'OVERHEAD';
}

/**
 * Process labor costs for a period (year, month).
 * - Loads all punch events in the period
 * - Derives intervals using existing deriveLaborIntervals
 * - Computes dollar costs and persists labor_cost_records
 * - Blocks if a POSTED run already exists for the period
 */
export async function processLaborCosts(year: number, month: number): Promise<{
  recordCount: number;
  totalsByType: Record<CostType, number>;
  runId: number;
}> {
  // Block if period is already posted
  const existingRun = await storage.getLaborPostingRunByPeriod(year, month);
  if (existingRun && existingRun.status === 'POSTED') {
    throw new Error(`Period ${year}-${month} is already posted. Re-calculation is not allowed.`);
  }

  // Define period date range
  const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

  // Load all punch events for the period
  const allPunches = await storage.getPunchEventsByDateRange(periodStart, periodEnd);

  // Group punches by canonicalId (employee identity)
  const byCanonical = new Map<string, typeof allPunches>();
  for (const punch of allPunches) {
    const key = punch.canonicalId;
    if (!byCanonical.has(key)) byCanonical.set(key, []);
    byCanonical.get(key)!.push(punch);
  }

  // Delete existing non-posted cost records for this period (idempotent re-calculation)
  if (existingRun) {
    await storage.deleteLaborCostRecordsByPeriod(year, month);
  }

  // Create or update the posting run
  let postingRun = existingRun;
  if (!postingRun) {
    postingRun = await storage.createLaborPostingRun({
      periodYear: year,
      periodMonth: month,
      status: 'CALCULATED',
    });
  }

  const toInsert: InsertLaborCostRecord[] = [];
  const totalsByType: Record<CostType, number> = { DIRECT: 0, OVERHEAD: 0, G_AND_A: 0 };

  for (const [canonicalId, punches] of byCanonical) {
    const intervals = deriveLaborIntervals(punches);
    const completedIntervals = intervals.filter(i => !i.isOpen && i.durationMinutes != null && i.durationMinutes > 0);

    for (const interval of completedIntervals) {
      const hoursWorked = (interval.durationMinutes ?? 0) / 60;

      // Resolve rate
      let resolvedRate: ResolvedRate;
      if (interval.epochEmployeeId != null) {
        resolvedRate = await resolveEmployeeRate(interval.epochEmployeeId);
      } else {
        resolvedRate = await resolveEmployeeRate(-1); // will fall through to default
      }

      const costType = await classifyLaborCost(interval.jobCode ?? null, interval.departmentCode ?? null);
      const dollarCost = hoursWorked * resolvedRate.rate;

      totalsByType[costType] += dollarCost;

      toInsert.push({
        postingRunId: postingRun.id,
        epochEmployeeId: interval.epochEmployeeId ?? null,
        canonicalId,
        jobCode: interval.jobCode ?? null,
        departmentCode: interval.departmentCode ?? null,
        periodYear: year,
        periodMonth: month,
        sourcePunchCanonicalId: canonicalId,
        clockIn: interval.clockIn,
        clockOut: interval.clockOut!,
        hoursWorked: hoursWorked.toFixed(4),
        rateUsed: resolvedRate.rate.toFixed(2),
        dollarCost: dollarCost.toFixed(2),
        costType,
        rateSource: resolvedRate.rateSource,
      });
    }
  }

  await storage.bulkInsertLaborCostRecords(toInsert);

  return {
    recordCount: toInsert.length,
    totalsByType,
    runId: postingRun.id,
  };
}
