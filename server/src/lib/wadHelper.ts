import { storage } from '../../storage';
import type { QuoteLineItem } from '../../schema';

/**
 * Ensures a project has at least one Production Work Order (WAD).
 *
 * Idempotency: if a WAD already exists for the project, the call is a no-op.
 * This makes it safe to call from quote acceptance, project creation, or any
 * other trigger without risking duplicate work orders.
 *
 * Called automatically when a quote transitions to ACCEPTED status.
 * Part numbers are derived from the quote's line items (agPartNumber field,
 * with a fallback to the first line-item description).  Budget hours and
 * department budgets are optional — pass them when the quote carries that data.
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
 * Derives WAD seed data from a set of quote line items and calls
 * ensureProjectHasWAD.  Keeps WAD-derivation logic out of the route layer.
 *
 * - partNumber: all agPartNumber values joined (each capped at 40 chars),
 *   with a fallback to the sanitised first description when none are present.
 * - totalBudgetHours: sum of laborHours across all line items.
 * - departmentBudgets: laborHours aggregated per department.
 */
export async function createWadFromQuote(
  projectId: string,
  projectName: string,
  lineItems: Pick<QuoteLineItem, 'agPartNumber' | 'description' | 'laborHours' | 'department'>[]
): Promise<void> {
  // Part numbers: each individual part number is capped at 40 chars so that
  // the full set of part numbers is always preserved regardless of list length.
  const explicitPartNumbers = lineItems
    .map((li) => li.agPartNumber?.trim().slice(0, 40))
    .filter((pn): pn is string => Boolean(pn));

  let wadPartNumber: string | null = null;
  if (explicitPartNumbers.length > 0) {
    wadPartNumber = explicitPartNumbers.join(', ');
  } else if (lineItems.length > 0) {
    const firstDescription = lineItems[0].description?.trim() ?? '';
    if (firstDescription) {
      wadPartNumber = firstDescription
        .replace(/[^a-zA-Z0-9\-_/. ]/g, '')
        .trim()
        .slice(0, 40)
        .trim() || null;
    }
  }

  // Budget hours: sum laborHours across all line items.
  const totalLaborHours = lineItems.reduce((sum, li) => sum + (li.laborHours ?? 0), 0);
  const wadBudgetHours = totalLaborHours > 0 ? String(totalLaborHours) : null;

  // Department budgets: aggregate laborHours per department.
  const deptBudgets: Record<string, number> = {};
  for (const li of lineItems) {
    if (li.department && li.laborHours && li.laborHours > 0) {
      deptBudgets[li.department] = (deptBudgets[li.department] ?? 0) + li.laborHours;
    }
  }

  await ensureProjectHasWAD(projectId, {
    projectName,
    partNumber: wadPartNumber,
    totalBudgetHours: wadBudgetHours,
    departmentBudgets: Object.keys(deptBudgets).length > 0 ? deptBudgets : null,
  });
}
