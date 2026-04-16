import { storage } from '../../storage';
import { db } from '../../db';
import { travelerAuthorizations, travelerMaterialConsumption } from '../../schema';
import { eq, and } from 'drizzle-orm';

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Evaluate all gates that must pass before an operator can START a traveler step.
 *
 * Checks (in order):
 *  1. Sequence   — previous step must be COMPLETED
 *  2. Training   — employee must have an active authorization record for the traveler's part
 *  3. Material   — a lot/ICN must be allocated to the traveler
 *
 * @param travelerId   UUID of the traveler
 * @param stepId       UUID of the step being started
 * @param employeeId   Integer PK of the employee (from employees table) — optional; skips training gate when absent
 * @param employeeName Display name for error messages
 */
export async function evaluateTravelerStartGates(
  travelerId: string,
  stepId: string,
  options: { employeeId?: number; employeeName?: string } = {}
): Promise<GateResult> {
  const traveler = await storage.getTraveler(travelerId);
  if (!traveler) {
    return { allowed: false, reason: 'Traveler not found.' };
  }

  const step = await storage.getTravelerStep(stepId);
  if (!step) {
    return { allowed: false, reason: 'Step not found.' };
  }

  // Gate 1: Sequence — the previous step (by stepNumber order) must be COMPLETED
  const allSteps = await storage.getTravelerSteps(travelerId);
  const currentIndex = allSteps.findIndex((s) => s.id === stepId);
  if (currentIndex > 0) {
    const previousStep = allSteps[currentIndex - 1];
    if (previousStep.status !== 'COMPLETED') {
      return {
        allowed: false,
        reason: `Step ${previousStep.stepNumber} (${previousStep.departmentName}) must be completed before this step can be started.`,
      };
    }
  }

  // Gate 2: Training — when the traveler has a partNumber, employee identity is required
  // and they must have an active authorization record for that part.
  if (traveler.partNumber) {
    if (!options.employeeId) {
      return {
        allowed: false,
        reason: `Employee identity could not be verified for part ${traveler.partNumber}. Scan a valid badge or enter a recognized employee code before starting this step.`,
      };
    }

    const [auth] = await db
      .select({ id: travelerAuthorizations.id })
      .from(travelerAuthorizations)
      .where(
        and(
          eq(travelerAuthorizations.employeeId, options.employeeId),
          eq(travelerAuthorizations.partNumber, traveler.partNumber),
          eq(travelerAuthorizations.isActive, true)
        )
      )
      .limit(1);

    if (!auth) {
      const name = options.employeeName || `Employee #${options.employeeId}`;
      return {
        allowed: false,
        reason: `${name} does not have a training authorization for part ${traveler.partNumber}. An authorization record must be created before work can begin.`,
      };
    }
  }

  // Gate 3: Material — a lot/ICN must be allocated to the traveler
  const hasMaterialOnTraveler = !!(traveler.lotNumber || traveler.internalControlNumber);
  if (!hasMaterialOnTraveler) {
    const [consumption] = await db
      .select({ id: travelerMaterialConsumption.id })
      .from(travelerMaterialConsumption)
      .where(eq(travelerMaterialConsumption.travelerId, travelerId))
      .limit(1);

    if (!consumption) {
      return {
        allowed: false,
        reason: 'No material (lot number or ICN) has been allocated to this traveler. Assign material before starting.',
      };
    }
  }

  return { allowed: true };
}

/**
 * Evaluate all gates that must pass before an operator can FINISH/SIGN a traveler step.
 *
 * Checks:
 *  1. Required QC tasks — all required QC tasks on the step must be COMPLETED
 *
 * @param stepId UUID of the step being finished
 */
export async function evaluateTravelerFinishGates(stepId: string): Promise<GateResult> {
  const tasks = await storage.getTravelerTasks(stepId);

  const isCompletionGate = (t: { taskType: string }) =>
    t.taskType === 'END_GATE' || t.taskType === 'SIGNATURE';

  const incompleteRequiredQcTasks = tasks.filter(
    (t) =>
      t.taskType === 'QC' &&
      t.required &&
      t.status !== 'COMPLETED' &&
      !isCompletionGate(t)
  );

  if (incompleteRequiredQcTasks.length > 0) {
    const titles = incompleteRequiredQcTasks.map((t) => t.title).join(', ');
    return {
      allowed: false,
      reason: `The following required QC tasks must be completed before signing off: ${titles}.`,
    };
  }

  return { allowed: true };
}
