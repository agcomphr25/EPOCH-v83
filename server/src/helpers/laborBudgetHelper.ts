import { db } from '../../db';
import { productionWorkOrders } from '../../schema';
import { eq } from 'drizzle-orm';
import { storage } from '../../storage';

export type LaborStatus = 'OK' | 'WARNING' | 'BLOCKED';

export interface WorkOrderLaborStatusResult {
  totalHours: number;
  departmentHours: number | null;
  totalBudget: number | null;
  departmentBudget: number | null;
  percentUsed: number | null;
  departmentPercentUsed: number | null;
  status: LaborStatus;
}

const WARNING_THRESHOLD = 0.8;
const BLOCKED_THRESHOLD = 1.0;

function toStatus(ratio: number | null): LaborStatus {
  if (ratio == null) return 'OK';
  if (ratio >= BLOCKED_THRESHOLD) return 'BLOCKED';
  if (ratio >= WARNING_THRESHOLD) return 'WARNING';
  return 'OK';
}

const STATUS_RANK: Record<LaborStatus, number> = { OK: 0, WARNING: 1, BLOCKED: 2 };

function worstStatus(a: LaborStatus, b: LaborStatus): LaborStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

export async function evaluateWorkOrderLaborStatus(
  workOrderId: string,
  department?: string | null
): Promise<WorkOrderLaborStatusResult> {
  const [wad] = await db
    .select()
    .from(productionWorkOrders)
    .where(eq(productionWorkOrders.id, workOrderId))
    .limit(1);

  const totalBudget = wad?.totalBudgetHours != null ? parseFloat(String(wad.totalBudgetHours)) : null;
  const departmentBudgets = (wad?.departmentBudgets as Record<string, number> | null) ?? null;
  const departmentBudget =
    department && departmentBudgets && departmentBudgets[department] != null
      ? Number(departmentBudgets[department])
      : null;

  const totalHours = await storage.getLaborHoursByWorkOrder(workOrderId);
  const departmentHours =
    department
      ? await storage.getLaborHoursByWorkOrderAndDepartment(workOrderId, department)
      : null;

  const totalRatio = totalBudget != null && totalBudget > 0 ? totalHours / totalBudget : null;
  const deptRatio =
    departmentHours != null && departmentBudget != null && departmentBudget > 0
      ? departmentHours / departmentBudget
      : null;

  const totalStatus = toStatus(totalRatio);
  const deptStatus = toStatus(deptRatio);
  const status = worstStatus(totalStatus, deptStatus);

  const percentUsed = totalRatio != null ? Math.round(totalRatio * 10000) / 100 : null;
  const departmentPercentUsed = deptRatio != null ? Math.round(deptRatio * 10000) / 100 : null;

  return {
    totalHours,
    departmentHours,
    totalBudget,
    departmentBudget,
    percentUsed,
    departmentPercentUsed,
    status,
  };
}
