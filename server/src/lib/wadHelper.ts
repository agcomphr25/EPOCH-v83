import { storage } from '../../storage';

/**
 * Ensures a project has at least one Production Work Order (WAD).
 * If none exist, creates one with status PLANNED.
 * If one already exists, silently skips — no duplicates are ever created.
 */
export async function ensureProjectHasWAD(
  projectId: string,
  options: {
    projectName?: string;
    totalBudgetHours?: string | null;
  } = {}
): Promise<void> {
  const existing = await storage.getWorkOrdersByProject(projectId);
  if (existing.length > 0) {
    return;
  }

  const workOrderNumber = `WAD-${Date.now()}`;

  await storage.createProductionWorkOrder({
    workOrderNumber,
    projectId,
    partNumber: 'TBD',
    quantity: 1,
    status: 'PLANNED',
    description: options.projectName ? `Auto-created WAD for ${options.projectName}` : null,
    totalBudgetHours: options.totalBudgetHours ?? null,
  });

  console.log(`[WAD] Auto-created ${workOrderNumber} for project ${projectId}`);
}
