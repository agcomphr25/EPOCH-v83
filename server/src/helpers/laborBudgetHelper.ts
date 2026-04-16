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
  warningThreshold: number;
  blockedThreshold: number;
}

const DEFAULT_WARNING_THRESHOLD = 0.8;
const DEFAULT_BLOCKED_THRESHOLD = 1.0;

function toStatus(ratio: number | null, warningThreshold: number, blockedThreshold: number): LaborStatus {
  if (ratio == null) return 'OK';
  if (ratio >= blockedThreshold) return 'BLOCKED';
  if (ratio >= warningThreshold) return 'WARNING';
  return 'OK';
}

const STATUS_RANK: Record<LaborStatus, number> = { OK: 0, WARNING: 1, BLOCKED: 2 };

function worstStatus(a: LaborStatus, b: LaborStatus): LaborStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

async function resolveThresholds(wad: { warningThreshold?: string | null; blockedThreshold?: string | null } | null): Promise<{ warningThreshold: number; blockedThreshold: number }> {
  if (
    wad?.warningThreshold != null &&
    wad?.blockedThreshold != null
  ) {
    return {
      warningThreshold: parseFloat(String(wad.warningThreshold)),
      blockedThreshold: parseFloat(String(wad.blockedThreshold)),
    };
  }

  const systemSettings = await storage.getLaborThresholdSettings();
  if (systemSettings) {
    return {
      warningThreshold: parseFloat(String(systemSettings.warningThreshold)),
      blockedThreshold: parseFloat(String(systemSettings.blockedThreshold)),
    };
  }

  return {
    warningThreshold: DEFAULT_WARNING_THRESHOLD,
    blockedThreshold: DEFAULT_BLOCKED_THRESHOLD,
  };
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

  const { warningThreshold, blockedThreshold } = await resolveThresholds(wad ?? null);

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

  const totalStatus = toStatus(totalRatio, warningThreshold, blockedThreshold);
  const deptStatus = toStatus(deptRatio, warningThreshold, blockedThreshold);
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
    warningThreshold,
    blockedThreshold,
  };
}
