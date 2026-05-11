import { storage } from '../../storage';
import { db } from '../../db';
import {
  productionWorkOrders,
  projects,
  quotes,
  quoteLineItems,
  p2PurchaseOrders,
  p2PurchaseOrderItems,
  bomDefinitions,
  bomItems,
  partRoutings,
  type ProductionWorkOrder,
  type QuoteLineItem,
} from '../../schema';
import { and, eq, desc, sql } from 'drizzle-orm';

export interface WadSeedData {
  partNumber: string | null;
  totalBudgetHours: string | null;
  departmentBudgets: Record<string, number> | null;
  description: string | null;
  quantity: number | null;
  dueDate: string | null;
  sources: {
    quoteId: string | null;
    poId: number | null;
    bomDefinitionId: string | null;
    routingId: string | null;
    quoteLineItemCount: number;
    poLineItemCount: number;
    bomItemCount: number;
    routingDepartmentCount: number;
  };
}

/**
 * Routing-derived seed: when neither quote nor BOM provides labor hours,
 * the routing's `departmentSequence` still tells us which departments the
 * part flows through. We seed those as zero-hour budgets so Step 2/3/4 get
 * pre-populated rows and the user only needs to fill in hours.
 */
export function deriveWadSeedFromRouting(
  routing: Pick<typeof partRoutings.$inferSelect, 'id' | 'departmentSequence'> | null
): { routingId: string | null; departments: string[] } {
  if (!routing) return { routingId: null, departments: [] };
  const seq = routing.departmentSequence;
  const departments: string[] = Array.isArray(seq)
    ? seq.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    : [];
  return { routingId: routing.id, departments };
}

/**
 * Derives department budgets and a representative part name from BOM items.
 * Labor items contribute their `laborHours` to `firstDept` budgets; non-labor
 * items contribute their `partName` as a candidate seed description.
 */
export function deriveWadSeedFromBomItems(
  items: Pick<typeof bomItems.$inferSelect, 'partName' | 'firstDept' | 'itemType' | 'laborHours' | 'quantity'>[]
): { partNumber: string | null; totalBudgetHours: string | null; departmentBudgets: Record<string, number> | null; quantity: number | null } {
  const deptBudgets: Record<string, number> = {};
  let totalLaborHours = 0;
  for (const it of items) {
    if (it.itemType === 'labor' && it.firstDept && it.laborHours && it.laborHours > 0) {
      const hrs = (it.laborHours ?? 0) * (it.quantity ?? 1);
      deptBudgets[it.firstDept] = (deptBudgets[it.firstDept] ?? 0) + hrs;
      totalLaborHours += hrs;
    }
  }
  const departmentBudgets = Object.keys(deptBudgets).length > 0 ? deptBudgets : null;
  const totalBudgetHours = totalLaborHours > 0 ? String(totalLaborHours) : null;

  const manufacturedNames = items
    .filter((i) => i.itemType !== 'labor' && i.itemType !== 'material' && i.partName)
    .map((i) => i.partName!.trim())
    .filter(Boolean);
  const partNumber = manufacturedNames.length > 0 ? manufacturedNames[0].slice(0, 40) : null;

  return { partNumber, totalBudgetHours, departmentBudgets, quantity: null };
}

export interface EnsureWadResult {
  workOrder: ProductionWorkOrder;
  created: boolean;
  seedData: WadSeedData | null;
}

/**
 * Ensures a project has at least one Production Work Order (WAD).
 *
 * Idempotency: if a WAD already exists for the project, the call is a no-op.
 * This makes it safe to call from quote acceptance, project creation, or any
 * other trigger without risking duplicate work orders.
 */
export async function ensureProjectHasWAD(
  projectId: string,
  options: {
    projectName?: string;
    totalBudgetHours?: string | null;
    departmentBudgets?: Record<string, unknown> | null;
    partNumber?: string | null;
  } = {}
): Promise<void> {
  const existing = await storage.getWorkOrdersByProject(projectId);
  if (existing.length > 0) {
    console.log(`[WAD] WAD already exists for project ${projectId} — skipping auto-create`);
    return;
  }

  const workOrderNumber = `WAD-${Date.now()}`;

  await storage.createProductionWorkOrder({
    workOrderNumber,
    projectId,
    partNumber: options.partNumber || 'TBD',
    quantity: 1,
    status: 'PLANNED',
    description: options.projectName ? `Auto-created WAD for ${options.projectName}` : null,
    totalBudgetHours: options.totalBudgetHours ?? null,
    ...(options.departmentBudgets ? { departmentBudgets: options.departmentBudgets } : {}),
  });

  console.log(`[WAD] Auto-created ${workOrderNumber} for project ${projectId}`);
}

/**
 * Derives WAD seed data from a set of quote line items.
 */
export function deriveWadSeedFromLineItems(
  lineItems: Pick<QuoteLineItem, 'agPartNumber' | 'description' | 'laborHours' | 'department' | 'quantity'>[]
): { partNumber: string | null; totalBudgetHours: string | null; departmentBudgets: Record<string, number> | null; quantity: number | null } {
  const explicitPartNumbers = lineItems
    .map((li) => li.agPartNumber?.trim().slice(0, 40))
    .filter((pn): pn is string => Boolean(pn));

  let partNumber: string | null = null;
  if (explicitPartNumbers.length > 0) {
    partNumber = explicitPartNumbers.join(', ');
  } else if (lineItems.length > 0) {
    const firstDescription = lineItems[0].description?.trim() ?? '';
    if (firstDescription) {
      partNumber = firstDescription
        .replace(/[^a-zA-Z0-9\-_/. ]/g, '')
        .trim()
        .slice(0, 40)
        .trim() || null;
    }
  }

  const totalLaborHours = lineItems.reduce((sum, li) => sum + (li.laborHours ?? 0), 0);
  const totalBudgetHours = totalLaborHours > 0 ? String(totalLaborHours) : null;

  const deptBudgets: Record<string, number> = {};
  for (const li of lineItems) {
    if (li.department && li.laborHours && li.laborHours > 0) {
      deptBudgets[li.department] = (deptBudgets[li.department] ?? 0) + li.laborHours;
    }
  }
  const departmentBudgets = Object.keys(deptBudgets).length > 0 ? deptBudgets : null;

  const totalQty = lineItems.reduce((s, li) => s + (li.quantity ?? 0), 0);
  const quantity = totalQty > 0 ? Math.round(totalQty) : null;

  return { partNumber, totalBudgetHours, departmentBudgets, quantity };
}

/**
 * Backwards-compatible wrapper retained for the quote-accepted trigger.
 */
export async function createWadFromQuote(
  projectId: string,
  projectName: string,
  lineItems: Pick<QuoteLineItem, 'agPartNumber' | 'description' | 'laborHours' | 'department' | 'quantity'>[]
): Promise<void> {
  const seed = deriveWadSeedFromLineItems(lineItems);
  await ensureProjectHasWAD(projectId, {
    projectName,
    partNumber: seed.partNumber,
    totalBudgetHours: seed.totalBudgetHours,
    departmentBudgets: seed.departmentBudgets,
  });
}

/**
 * Resolves seed data from quote line items + P2 PO line items and dispatches
 * to storage.createProductionWorkOrder. Serialized per-project via
 * pg_advisory_xact_lock so concurrent callers cannot duplicate the PWO.
 */
export async function ensureProjectHasWADFromCanonicalSources(
  projectId: string
): Promise<EnsureWadResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`);

    const existingRows = await tx
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.projectId, projectId))
      .orderBy(desc(productionWorkOrders.createdAt));
    if (existingRows.length > 0) {
      const target =
        existingRows.find((w) => w.wadStatus !== 'APPROVED') ?? existingRows[0];
      return { workOrder: target, created: false, seedData: null };
    }

    const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Source 1: originating quote line items (preferred — has laborHours + department).
    let quoteId: string | null = null;
    let quoteLines: QuoteLineItem[] = [];
    const linkedQuotes = await tx
      .select()
      .from(quotes)
      .where(eq(quotes.projectId, projectId))
      .orderBy(desc(quotes.createdAt))
      .limit(1);
    if (linkedQuotes.length > 0) {
      quoteId = linkedQuotes[0].id;
      quoteLines = await tx
        .select()
        .from(quoteLineItems)
        .where(eq(quoteLineItems.quoteId, quoteId));
    }

    // Source 2: P2 PO line items (part number / qty / due date).
    let poId: number | null = null;
    let poLines: { partNumber: string; partName: string | null; quantity: number }[] = [];
    let poExpectedDelivery: string | null = null;
    if (project.poId != null) {
      poId = project.poId;
      const [po] = await tx
        .select({
          expectedDelivery: p2PurchaseOrders.expectedDelivery,
        })
        .from(p2PurchaseOrders)
        .where(eq(p2PurchaseOrders.id, project.poId))
        .limit(1);
      poExpectedDelivery = po?.expectedDelivery ?? null;
      poLines = await tx
        .select({
          partNumber: p2PurchaseOrderItems.partNumber,
          partName: p2PurchaseOrderItems.partName,
          quantity: p2PurchaseOrderItems.quantity,
        })
        .from(p2PurchaseOrderItems)
        .where(eq(p2PurchaseOrderItems.poId, project.poId));
    }

    // Source 3: BOM items linked to the project (labor lines drive dept budgets).
    let bomDefinitionId: string | null = null;
    let bomItemRows: (typeof bomItems.$inferSelect)[] = [];
    if (project.bomDefinitionId) {
      const [bd] = await tx
        .select({ id: bomDefinitions.id })
        .from(bomDefinitions)
        .where(eq(bomDefinitions.id, project.bomDefinitionId))
        .limit(1);
      if (bd) {
        bomDefinitionId = bd.id;
        bomItemRows = await tx
          .select()
          .from(bomItems)
          .where(and(eq(bomItems.bomId, bd.id), eq(bomItems.isActive, true)));
      }
    }

    // Source 4: part routing for the part number we're about to seed.
    const routingPartNumber = poLines[0]?.partNumber ?? null;
    let routingRow: typeof partRoutings.$inferSelect | null = null;
    if (routingPartNumber) {
      const [r] = await tx
        .select()
        .from(partRoutings)
        .where(and(eq(partRoutings.partNumber, routingPartNumber), eq(partRoutings.isActive, true)))
        .orderBy(desc(partRoutings.routingRevision))
        .limit(1);
      routingRow = r ?? null;
    }

    const quoteSeed = deriveWadSeedFromLineItems(quoteLines);
    const bomSeed = deriveWadSeedFromBomItems(bomItemRows);
    const routingSeed = deriveWadSeedFromRouting(routingRow);
    const partNumber =
      quoteSeed.partNumber
      ?? poLines[0]?.partNumber
      ?? bomSeed.partNumber
      ?? project.projectCode
      ?? 'TBD';
    const quantity =
      quoteSeed.quantity
      ?? (poLines[0]?.quantity && poLines[0].quantity > 0 ? poLines[0].quantity : 1);
    const description =
      poLines[0]?.partName
      ?? quoteLines[0]?.description
      ?? (project.projectName
        ? `Auto-created WAD for ${project.projectCode ?? project.projectName}`
        : null);
    const dueDate = poExpectedDelivery ?? project.targetShipDate ?? null;

    // Precedence for hour budgets: quote line items → BOM labor items.
    // Routing (zero-hour department list) is only used when neither has data,
    // so the wizard still gets pre-populated department rows from the routing.
    const totalBudgetHours = quoteSeed.totalBudgetHours ?? bomSeed.totalBudgetHours;
    let departmentBudgets = quoteSeed.departmentBudgets ?? bomSeed.departmentBudgets;
    if (!departmentBudgets && routingSeed.departments.length > 0) {
      departmentBudgets = Object.fromEntries(routingSeed.departments.map((d) => [d, 0]));
    }

    const seedData: WadSeedData = {
      partNumber,
      totalBudgetHours,
      departmentBudgets,
      description,
      quantity,
      dueDate,
      sources: {
        quoteId,
        poId,
        bomDefinitionId,
        routingId: routingSeed.routingId,
        quoteLineItemCount: quoteLines.length,
        poLineItemCount: poLines.length,
        bomItemCount: bomItemRows.length,
        routingDepartmentCount: routingSeed.departments.length,
      },
    };

    const workOrderNumber = `WAD-${(project.projectCode || 'PROJ').replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-6)}`;

    // Re-use the canonical creation path — same one quote-acceptance hits.
    const wo = await storage.createProductionWorkOrder({
      workOrderNumber,
      projectId,
      partNumber,
      quantity,
      status: 'PLANNED',
      description,
      dueDate,
      totalBudgetHours: seedData.totalBudgetHours,
      ...(seedData.departmentBudgets ? { departmentBudgets: seedData.departmentBudgets } : {}),
    });

    return { workOrder: wo, created: true, seedData };
  });
}
