import { storage } from '../../storage';
import { db } from '../../db';
import {
  projects,
  customers,
  stockModels,
  p2PurchaseOrders,
  allOrders,
} from '../../schema';
import { inArray, eq } from 'drizzle-orm';
import { evaluateWorkOrderReadiness } from './workOrderReadiness';
import { evaluateWorkOrderLaborStatus } from '../helpers/laborBudgetHelper';
import type { ProductionWorkOrder } from '../../schema';

export type CommandCenterBucket = 'blocked' | 'atRisk' | 'ready' | 'inProgress' | 'late';

export interface CommandCenterCard {
  id: string;
  workOrderNumber: string;
  partNumber: string | null;
  partDescription: string | null;
  quantity: number | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  customerName: string | null;
  agOrderId: string | null;
  fbOrderNumber: string | null;
  status: string;
  percentUsed: number | null;
  hasLaborBudget: boolean;
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

interface EnrichmentMaps {
  projectById: Map<string, {
    id: string;
    projectCode: string | null;
    projectName: string | null;
    customerId: string | null;
    customerNameSnapshot: string | null;
    customersIntegerId: number | null;
    poId: number | null;
  }>;
  customerById: Map<number, string>;
  poById: Map<number, string>;
  stockModelById: Map<string, string>;
  orderByProjectCode: Map<string, { orderId: string; fbOrderNumber: string | null }>;
}

async function buildEnrichmentMaps(wads: ProductionWorkOrder[]): Promise<EnrichmentMaps> {
  const projectIds = Array.from(new Set(wads.map((w) => w.projectId).filter((v): v is string => !!v)));
  const partNumbers = Array.from(new Set(wads.map((w) => w.partNumber).filter((v): v is string => !!v)));

  const projectById = new Map<string, EnrichmentMaps['projectById'] extends Map<string, infer V> ? V : never>();
  const customerById = new Map<number, string>();
  const poById = new Map<number, string>();
  const stockModelById = new Map<string, string>();
  const orderByProjectCode = new Map<string, { orderId: string; fbOrderNumber: string | null }>();

  if (projectIds.length > 0) {
    const projectRows = await db
      .select({
        id: projects.id,
        projectCode: projects.projectCode,
        projectName: projects.projectName,
        customerId: projects.customerId,
        customerNameSnapshot: projects.customerNameSnapshot,
        customersIntegerId: projects.customersIntegerId,
        poId: projects.poId,
      })
      .from(projects)
      .where(inArray(projects.id, projectIds));

    for (const p of projectRows) {
      projectById.set(p.id, p);
    }

    const customerIntegerIds = Array.from(
      new Set(projectRows.map((p) => p.customersIntegerId).filter((v): v is number => v != null)),
    );
    if (customerIntegerIds.length > 0) {
      const custRows = await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(inArray(customers.id, customerIntegerIds));
      for (const c of custRows) customerById.set(c.id, c.name);
    }

    const poIds = Array.from(new Set(projectRows.map((p) => p.poId).filter((v): v is number => v != null)));
    if (poIds.length > 0) {
      const poRows = await db
        .select({ id: p2PurchaseOrders.id, poNumber: p2PurchaseOrders.poNumber })
        .from(p2PurchaseOrders)
        .where(inArray(p2PurchaseOrders.id, poIds));
      for (const po of poRows) poById.set(po.id, po.poNumber);
    }

    const projectCodes = projectRows.map((p) => p.projectCode).filter((v): v is string => !!v);
    if (projectCodes.length > 0) {
      const orderRows = await db
        .select({
          orderId: allOrders.orderId,
          fbOrderNumber: allOrders.fbOrderNumber,
        })
        .from(allOrders)
        .where(inArray(allOrders.orderId, projectCodes));
      for (const o of orderRows) {
        orderByProjectCode.set(o.orderId, { orderId: o.orderId, fbOrderNumber: o.fbOrderNumber ?? null });
      }
    }
  }

  if (partNumbers.length > 0) {
    const smRows = await db
      .select({ id: stockModels.id, displayName: stockModels.displayName })
      .from(stockModels)
      .where(inArray(stockModels.id, partNumbers));
    for (const sm of smRows) stockModelById.set(sm.id, sm.displayName);
  }

  return { projectById, customerById, poById, stockModelById, orderByProjectCode };
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

  let enrichment: EnrichmentMaps;
  try {
    enrichment = await buildEnrichmentMaps(allWads);
  } catch (err) {
    console.error('[CommandCenter] Failed to build enrichment maps; falling back to bare cards:', err);
    enrichment = {
      projectById: new Map(),
      customerById: new Map(),
      poById: new Map(),
      stockModelById: new Map(),
      orderByProjectCode: new Map(),
    };
  }

  await Promise.all(
    allWads.map(async (wad) => {
      const [readiness, labor] = await Promise.all([
        evaluateWorkOrderReadiness(wad.id),
        evaluateWorkOrderLaborStatus(wad.id),
      ]);

      // Enrichment is best-effort and must NEVER alter bucket classification.
      // If any enrichment lookup throws, log and fall back to the bare context
      // fields the page used to show, but still classify the WAD into its
      // proper bucket below.
      let projectCode: string | null = null;
      let projectName: string | null = null;
      let customerName: string | null = null;
      let agOrderId: string | null = null;
      let fbOrderNumber: string | null = null;
      let partDescription: string | null = wad.description ?? null;
      try {
        const project = wad.projectId ? enrichment.projectById.get(wad.projectId) : undefined;
        if (project) {
          projectCode = project.projectCode ?? null;
          projectName = project.projectName ?? null;
          customerName = project.customerNameSnapshot
            ?? (project.customersIntegerId != null
              ? enrichment.customerById.get(project.customersIntegerId) ?? null
              : null);
          const linkedAllOrder = project.projectCode
            ? enrichment.orderByProjectCode.get(project.projectCode)
            : undefined;
          agOrderId = linkedAllOrder?.orderId
            ?? (project.poId != null ? enrichment.poById.get(project.poId) ?? null : null);
          fbOrderNumber = linkedAllOrder?.fbOrderNumber ?? null;
        }
        if (wad.partNumber) {
          const stockName = enrichment.stockModelById.get(wad.partNumber);
          if (stockName) partDescription = stockName;
        }
      } catch (err) {
        console.error(`[CommandCenter] Enrichment lookup failed for WAD ${wad.id}; showing minimal context:`, err);
      }

      const card: CommandCenterCard = {
        id: wad.id,
        workOrderNumber: wad.workOrderNumber,
        partNumber: wad.partNumber ?? null,
        partDescription,
        quantity: wad.quantity ?? null,
        projectId: wad.projectId ?? null,
        projectCode,
        projectName,
        customerName,
        agOrderId,
        fbOrderNumber,
        status: wad.status,
        percentUsed: labor.percentUsed,
        hasLaborBudget: labor.percentUsed != null,
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
