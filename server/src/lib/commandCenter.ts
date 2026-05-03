import { storage } from '../../storage';
import { evaluateWorkOrderReadiness } from './workOrderReadiness';
import { evaluateWorkOrderLaborStatus } from '../helpers/laborBudgetHelper';
import type { ProductionWorkOrder } from '../../schema';

export type CommandCenterBucket = 'blocked' | 'atRisk' | 'ready' | 'inProgress' | 'late';

export interface CommandCenterCard {
  id: string;
  workOrderNumber: string;
  partNumber: string | null;
  projectId: string | null;
  status: string;
  percentUsed: number | null;
  dueDate: string | null;
  lastUpdatedAt: string | null;
  reason?: string;
}

export interface CommandCenterData {
  blocked: CommandCenterCard[];
  atRisk: CommandCenterCard[];
  ready: CommandCenterCard[];
  inProgress: CommandCenterCard[];
  late: CommandCenterCard[];
}

function isLate(wad: ProductionWorkOrder): boolean {
  if (!wad.dueDate) return false;
  const due = new Date(wad.dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return due < now;
}

/**
 * Classification rules (highest priority first — each WAD lands in exactly one bucket):
 *
 *  1. BLOCKED  — labor at/over budget threshold, OR readiness is BLOCKED
 *  2. LATE     — due date has passed (even if the WAD is actively in progress)
 *  3. IN PROGRESS — WAD status is IN_PROGRESS and not overdue
 *  4. AT RISK  — labor budget at warning threshold, OR readiness is PARTIAL (material / training gaps)
 *  5. READY    — everything else
 */
export async function getCommandCenterData(storageInstance: typeof storage): Promise<CommandCenterData> {
  const allWads = await storageInstance.getAllProductionWorkOrders();

  const result: CommandCenterData = {
    blocked: [],
    atRisk: [],
    ready: [],
    inProgress: [],
    late: [],
  };

  await Promise.all(
    allWads.map(async (wad) => {
      const [readiness, labor] = await Promise.all([
        evaluateWorkOrderReadiness(wad.id),
        evaluateWorkOrderLaborStatus(wad.id),
      ]);

      const card: CommandCenterCard = {
        id: wad.id,
        workOrderNumber: wad.workOrderNumber,
        partNumber: wad.partNumber ?? null,
        projectId: wad.projectId ?? null,
        status: wad.status,
        percentUsed: labor.percentUsed,
        dueDate: wad.dueDate ?? null,
        lastUpdatedAt: wad.updatedAt ? wad.updatedAt.toISOString() : null,
      };

      // 1. BLOCKED — labor over threshold OR readiness hard-blocked
      if (labor.status === 'BLOCKED') {
        result.blocked.push({ ...card, reason: 'Labor budget reached its limit — supervisor approval is required before any more hours can be logged' });
        return;
      }
      if (readiness.status === 'BLOCKED') {
        result.blocked.push({ ...card, reason: readiness.reason ?? 'Work order is blocked' });
        return;
      }

      // 2. LATE — past due date (supersedes IN_PROGRESS so overdue work is always visible here)
      if (isLate(wad)) {
        result.late.push(card);
        return;
      }

      // 3. IN PROGRESS — actively being worked and not overdue
      if (wad.status === 'IN_PROGRESS') {
        result.inProgress.push(card);
        return;
      }

      // 4. AT RISK — labor budget approaching threshold, OR materials/training gaps (PARTIAL readiness)
      if (labor.status === 'WARNING') {
        result.atRisk.push({ ...card, reason: 'Labor hours are approaching the budget limit — notify your supervisor so they can review before it is exceeded' });
        return;
      }
      if (readiness.status === 'PARTIAL') {
        result.atRisk.push({ ...card, reason: readiness.reason ?? 'Materials or training not fully ready' });
        return;
      }

      // 5. READY — all clear
      result.ready.push(card);
    })
  );

  return result;
}
