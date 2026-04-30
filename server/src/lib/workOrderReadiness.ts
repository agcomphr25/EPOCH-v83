import { storage } from '../../storage';

export type ReadinessStatus = 'BLOCKED' | 'PARTIAL' | 'READY';

export interface ReadinessResult {
  status: ReadinessStatus;
  reason?: string;
}

export async function evaluateWorkOrderReadiness(workOrderId: string): Promise<ReadinessResult> {
  const travelers = await storage.getTravelersByProductionWorkOrderId(workOrderId);

  if (!travelers.length) {
    return {
      status: 'BLOCKED',
      reason: 'Travelers not yet set up — contact your supervisor to create a traveler before starting',
    };
  }

  const materialsReady = await storage.checkWorkOrderMaterialAvailability(workOrderId);
  if (!materialsReady) {
    const shortPart = await storage.getMaterialShortageDetail(workOrderId);
    const partDetail = shortPart ? ` (${shortPart} is short)` : '';
    return {
      status: 'PARTIAL',
      reason: `Not enough material on hand to fill this order${partDetail} — check inventory or ask your supervisor to expedite`,
    };
  }

  const trainingReady = await storage.checkWorkOrderTrainingCoverage(workOrderId);
  if (!trainingReady) {
    return {
      status: 'PARTIAL',
      reason: 'One or more required certifications are missing for this routing — contact your supervisor before starting work',
    };
  }

  return { status: 'READY' };
}
