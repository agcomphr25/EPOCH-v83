import { storage } from '../../storage';

export type ReadinessStatus = 'BLOCKED' | 'PARTIAL' | 'READY';

export interface ReadinessResult {
  status: ReadinessStatus;
  reason?: string;
}

export async function evaluateWorkOrderReadiness(workOrderId: string): Promise<ReadinessResult> {
  const travelers = await storage.getTravelersByProductionWorkOrderId(workOrderId);

  if (!travelers.length) {
    return { status: 'BLOCKED', reason: 'No travelers created for this work order' };
  }

  const materialsReady = await storage.checkWorkOrderMaterialAvailability(workOrderId);
  if (!materialsReady) {
    return { status: 'PARTIAL', reason: 'Materials not fully allocated — insufficient inventory for one or more BOM lines' };
  }

  const trainingReady = await storage.checkWorkOrderTrainingCoverage(workOrderId);
  if (!trainingReady) {
    return { status: 'PARTIAL', reason: 'Training gaps exist — required certifications not satisfied for this work order routing' };
  }

  return { status: 'READY' };
}
