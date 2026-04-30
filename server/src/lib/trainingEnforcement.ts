import { storage } from '../../storage';
import type { TravelerTask } from '../../schema';

export interface TrainingGateResult {
  allowed: boolean;
  reason?: string;
  missingRequirement?: string;
  requirementType?: 'training_module' | 'part_certification' | 'traveler_authorization';
}

/**
 * Evaluate training and certification requirements before an employee can START a traveler step.
 *
 * Checks (in order):
 *  0. Identity — employee identity is always required before any step can begin.
 *  1. Traveler authorization — when the traveler has a partNumber, the employee must have
 *     an active, non-expired authorization record for that part.
 *  2. Part certification — if a p2_part_certifications record exists for the traveler's
 *     part number AND the step's department, the employee must have a completed
 *     p2_employee_part_certifications record with all three competency flags set.
 *  3. Operation cert — if the step's routing operation has a certificationId, the employee
 *     must hold a valid, non-expired trainingCertifications record for that cert. This check
 *     applies regardless of whether the traveler has a partNumber.
 *
 * Identity is mandatory for ALL travelers, including those without a part number or
 * operation cert. No-partNumber travelers skip the part-authorization and P2 cert
 * checks, but the employee still must scan a badge.
 *
 * @param travelerId   UUID of the traveler
 * @param stepId       UUID of the step being started
 * @param employeeId   Integer PK of the employee (from employees table)
 * @param employeeName Display name for error messages
 */
export async function evaluateTravelerTrainingGate(
  travelerId: string,
  stepId: string,
  employeeId: number | undefined,
  employeeName?: string
): Promise<TrainingGateResult> {
  const traveler = await storage.getTraveler(travelerId);
  if (!traveler) {
    return { allowed: false, reason: 'Traveler not found.' };
  }

  const step = await storage.getTravelerStep(stepId);
  if (!step) {
    return { allowed: false, reason: 'Step not found.' };
  }

  const hasPartNumber = !!traveler.partNumber;

  // Resolve the routing operation to check for operation-level cert requirement.
  let operationCertId: number | null = null;
  let operationCertName: string | null = null;
  if (traveler.partRoutingId) {
    const routingOp = await storage.getRoutingOperationForTravelerStep(
      traveler.partRoutingId,
      step.stepNumber
    );
    if (routingOp?.certificationId) {
      operationCertId = routingOp.certificationId;
      const cert = await storage.getCertificationById(routingOp.certificationId);
      operationCertName = cert?.name ?? `Certification #${routingOp.certificationId}`;
    }
  }

  // Check 0: Identity is required for ALL travelers regardless of training requirements.
  if (!employeeId) {
    if (hasPartNumber) {
      return {
        allowed: false,
        reason: `Employee identity is required to verify training qualifications for part ${traveler.partNumber}. Scan a valid badge before starting this step.`,
        missingRequirement: traveler.partNumber!,
        requirementType: 'traveler_authorization',
      };
    }
    if (operationCertId !== null) {
      return {
        allowed: false,
        reason: `Employee identity is required to verify the ${operationCertName} certification for this step. Scan a valid badge before starting.`,
        missingRequirement: `operation_cert:${operationCertId}`,
        requirementType: 'traveler_authorization',
      };
    }
    return {
      allowed: false,
      reason: `Employee identity is required before starting this step. Scan a valid badge before starting.`,
      missingRequirement: `identity:step:${stepId}`,
      requirementType: 'traveler_authorization',
    };
  }

  const name = employeeName || `Employee #${employeeId}`;

  // Check 1: Part-level traveler authorization (only when partNumber is set).
  // The check is enforced ONLY when at least one active authorization record exists for
  // this part number — i.e. the authorization system has been explicitly configured for it.
  // When no authorization records exist yet (table is new / part not yet configured),
  // the check is bypassed so existing work is not disrupted.
  if (hasPartNumber) {
    const authSystemActive = await storage.anyAuthorizationsExistForPart(traveler.partNumber!);
    if (authSystemActive) {
      const auth = await storage.getActiveTravelerAuthorizationForEmployee(employeeId, traveler.partNumber!);
      if (!auth) {
        return {
          allowed: false,
          reason: `${name} does not have a current traveler authorization for part ${traveler.partNumber}. Authorization must be active and not expired before work can begin.`,
          missingRequirement: traveler.partNumber!,
          requirementType: 'traveler_authorization',
        };
      }
    }

    // Check 2: P2 part certification (only when partNumber is set).
    const partCertReq = await storage.getP2PartCertificationForStep(
      traveler.partNumber!,
      step.departmentName
    );

    if (partCertReq) {
      const hasCert = await storage.checkEmployeeP2PartCertification(
        employeeId,
        traveler.partNumber!,
        step.departmentName
      );

      if (!hasCert) {
        return {
          allowed: false,
          reason: `${name} does not have a completed part certification for ${traveler.partNumber} in the ${step.departmentName} department. All three competency requirements (drawing knowledge, spec sheet understanding, and procedure completion) must be certified before starting this step.`,
          missingRequirement: `${traveler.partNumber}:${step.departmentName}`,
          requirementType: 'part_certification',
        };
      }
    }
  }

  // Check 3: Routing operation certification (applies to all travelers).
  if (operationCertId !== null) {
    const hasCert = await storage.checkEmployeeHasValidTrainingCertificationForCert(
      employeeId,
      operationCertId
    );
    if (!hasCert) {
      return {
        allowed: false,
        reason: `${name} does not hold a valid, non-expired ${operationCertName} certification required by this routing step. The certification must be current before starting this step.`,
        missingRequirement: `operation_cert:${operationCertId}`,
        requirementType: 'training_module',
      };
    }
  }

  return { allowed: true };
}

/**
 * Evaluate training requirements before an employee can SIGN OFF (finish) a traveler step.
 *
 * This gate activates only when the step has at least one task with requiresCertification set.
 * When active, the gate checks (in order):
 *  1. Traveler must have a part number (fail explicitly when requirement exists but part
 *     cannot be resolved — the requirement is configured but ambiguous).
 *  2. Signing employee must have an active, non-expired traveler authorization for the part.
 *  3. If a P2 part certification requirement exists for the part+department, the employee
 *     must hold a completed certification with all three competency flags set.
 *  4. If the step's routing operation has a certificationId, the employee must hold a
 *     valid, non-expired trainingCertifications record for that cert.
 *  5. The employee must have a current (not expired) training_certifications record with
 *     status='certified'. This represents program-level sign-off by a trainer.
 *
 * @param travelerId   UUID of the traveler
 * @param stepId       UUID of the step being signed
 * @param employeeId   Integer PK of the employee signing off
 * @param employeeName Display name for error messages
 */
export async function evaluateQcTrainingGate(
  travelerId: string,
  stepId: string,
  employeeId: number | undefined,
  employeeName?: string
): Promise<TrainingGateResult> {
  const tasks = await storage.getTravelerTasks(stepId);

  const hasRegulatedTask = tasks.some(
    (t: TravelerTask) => t.requiresCertification === true
  );

  if (!hasRegulatedTask) {
    return { allowed: true };
  }

  const traveler = await storage.getTraveler(travelerId);
  if (!traveler) {
    return { allowed: false, reason: 'Traveler not found.' };
  }

  const step = await storage.getTravelerStep(stepId);
  if (!step) {
    return { allowed: false, reason: 'Step not found.' };
  }

  // Resolve routing operation cert requirement.
  let operationCertId: number | null = null;
  let operationCertName: string | null = null;
  if (traveler.partRoutingId) {
    const routingOp = await storage.getRoutingOperationForTravelerStep(
      traveler.partRoutingId,
      step.stepNumber
    );
    if (routingOp?.certificationId) {
      operationCertId = routingOp.certificationId;
      const cert = await storage.getCertificationById(routingOp.certificationId);
      operationCertName = cert?.name ?? `Certification #${routingOp.certificationId}`;
    }
  }

  if (!traveler.partNumber) {
    return {
      allowed: false,
      reason: `This step requires certification, but no part number is configured on the traveler. The training requirement cannot be resolved. Contact an administrator to assign a part number before signing off.`,
      missingRequirement: `part_number:traveler:${travelerId}`,
      requirementType: 'part_certification',
    };
  }

  if (!employeeId) {
    return {
      allowed: false,
      reason: `Employee identity is required to verify training certification for part ${traveler.partNumber} on this regulated step. Scan a valid badge before signing off.`,
      missingRequirement: traveler.partNumber,
      requirementType: 'traveler_authorization',
    };
  }

  const name = employeeName || `Employee #${employeeId}`;

  // Same grandfather logic as the start gate: only enforce the authorization check
  // when at least one record has been explicitly configured for this part number.
  const authSystemActive = await storage.anyAuthorizationsExistForPart(traveler.partNumber);
  if (authSystemActive) {
    const auth = await storage.getActiveTravelerAuthorizationForEmployee(employeeId, traveler.partNumber);
    if (!auth) {
      return {
        allowed: false,
        reason: `${name} does not have a current traveler authorization for part ${traveler.partNumber}. Authorization must be active and not expired before signing off this regulated step.`,
        missingRequirement: traveler.partNumber,
        requirementType: 'traveler_authorization',
      };
    }
  }

  const partCertReq = await storage.getP2PartCertificationForStep(
    traveler.partNumber,
    step.departmentName
  );

  if (partCertReq) {
    const hasCert = await storage.checkEmployeeP2PartCertification(
      employeeId,
      traveler.partNumber,
      step.departmentName
    );

    if (!hasCert) {
      return {
        allowed: false,
        reason: `${name} does not have a completed part certification for ${traveler.partNumber} in the ${step.departmentName} department. All three competency requirements must be certified before signing off this regulated step.`,
        missingRequirement: `${traveler.partNumber}:${step.departmentName}`,
        requirementType: 'part_certification',
      };
    }
  }

  // Check routing operation certification.
  if (operationCertId !== null) {
    const hasCert = await storage.checkEmployeeHasValidTrainingCertificationForCert(
      employeeId,
      operationCertId
    );
    if (!hasCert) {
      return {
        allowed: false,
        reason: `${name} does not hold a valid, non-expired ${operationCertName} certification required by this routing step. The certification must be current before signing off this regulated step.`,
        missingRequirement: `operation_cert:${operationCertId}`,
        requirementType: 'training_module',
      };
    }
  }

  // Check #5: Training certification.
  // Guard: training_certifications is created by Drizzle schema push, not by a numbered
  // migration, so it may be absent on production databases seeded from an older snapshot.
  // If the query throws (relation does not exist), treat the training module as unconfigured
  // and skip the check — the same "no data → skip" pattern used for authorizations above.
  let trainingCert: Awaited<ReturnType<typeof storage.checkEmployeeHasValidTrainingCertification>>;
  try {
    trainingCert = await storage.checkEmployeeHasValidTrainingCertification(employeeId, traveler.partNumber);
  } catch (tableErr) {
    console.warn(
      '[trainingEnforcement] training_certifications unavailable — skipping check:',
      (tableErr as Error).message
    );
    return { allowed: true };
  }

  if (!trainingCert) {
    return {
      allowed: false,
      reason: `${name} does not have a current, valid training certification for part ${traveler.partNumber}. A trainer must complete the certification process (with trainer sign-off) and the certification must not be expired before signing off this regulated step.`,
      missingRequirement: `training_certification:part:${traveler.partNumber}:employee:${employeeId}`,
      requirementType: 'training_module',
    };
  }

  return { allowed: true };
}
