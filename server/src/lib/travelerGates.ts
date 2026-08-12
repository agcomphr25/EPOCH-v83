import { storage } from '../../storage';
import { db } from '../../db';
import { calibrationAssets, calibrationUseLogs, productionWorkOrders, travelerAuthorizations, travelerMaterialConsumption } from '../../schema';
import { prospectiveAuthorizationEnforcementEnabled, requireApplicableAuthorization } from '../services/certificationAuthorizationService';
import { eq, and, inArray } from 'drizzle-orm';

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Structured gate error shape returned in every gate rejection response.
 * Frontend code should prefer `gate` + `message` + `detail` over the legacy `error`/`reason` fields.
 */
export interface GateError {
  gate: string;
  message: string;
  detail: string;
}

/** Core gate error body — always present in every gate rejection response. */
export type GateErrorBody = GateError & { error: string; reason: string };

/**
 * Extended gate error body that may carry training-gate metadata.
 * Used when the training or certification gate rejects the request.
 */
export type TrainingGateErrorBody = GateErrorBody & {
  missingRequirement?: string;
  requirementType?: string;
};

/**
 * Union of all gate error body shapes.  Use this as the return type whenever a function
 * may return either a base or training-extended gate error.
 */
export type AnyGateErrorBody = GateErrorBody | TrainingGateErrorBody;

/**
 * Build a consistent HTTP error body for a gate rejection.
 * Includes both the new structured fields and legacy `error`/`reason` aliases for backward compat.
 */
export function buildGateErrorBody(gate: string, message: string, detail: string): GateErrorBody {
  return { gate, message, detail, error: message, reason: detail };
}

/**
 * Build a training-specific gate error body that includes optional metadata
 * (`missingRequirement`, `requirementType`) on top of the base gate error shape.
 * Pass a custom `gate` key when the caller uses a variant gate name (e.g. `qc_training`).
 */
export function buildTrainingGateErrorBody(
  message: string,
  detail: string,
  missingRequirement?: string,
  requirementType?: string,
  gate = 'training',
): TrainingGateErrorBody {
  return {
    gate,
    message,
    detail,
    error: message,
    reason: detail,
    missingRequirement,
    requirementType,
  };
}

/**
 * Evaluate whether the linked production work order is in a state that permits new work.
 * Allowed states: RELEASED or IN_PROGRESS.
 *
 * @param wadId  UUID of the production_work_orders row
 */
export async function evaluateWadReleaseGate(wadId: string): Promise<GateResult> {
  const [wad] = await db
    .select({
      id: productionWorkOrders.id,
      status: productionWorkOrders.status,
      wadStatus: productionWorkOrders.wadStatus,
    })
    .from(productionWorkOrders)
    .where(eq(productionWorkOrders.id, wadId))
    .limit(1);
  if (!wad) {
    return { allowed: false, reason: 'The linked production work order could not be found.' };
  }

  const status = String(wad.status || '').trim().toUpperCase();
  const wadStatus = String(wad.wadStatus || '').trim().toUpperCase();

  if (status === 'RELEASED' || status === 'IN_PROGRESS') {
    return { allowed: true };
  }

  if (wadStatus === 'APPROVED') {
    await storage.updateWorkOrderStatus(wad.id, 'IN_PROGRESS');
    console.log(`[TravelerGate] Promoted approved WAD ${wad.id} from ${wad.status} to IN_PROGRESS at traveler start`);
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Work order must be RELEASED or IN_PROGRESS before work can begin. Current status: ${wad.status || 'UNKNOWN'}.`,
  };
}

/**
 * Evaluate whether a traveler has at least one material record allocated to it
 * (lot number, ICN on the traveler row, or a travelerMaterialConsumption entry).
 *
 * @param travelerId  UUID of the traveler
 */
export async function evaluateMaterialReadinessGate(travelerId: string): Promise<GateResult> {
  const traveler = await storage.getTraveler(travelerId);
  if (!traveler) {
    return { allowed: false, reason: 'Traveler not found.' };
  }
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

export interface GateCheckResult {
  key: string;
  label: string;
  passed: boolean;
  reason?: string;
}

function isCalibrationAssetUsable(asset: { status: string; calibrationDueDate: Date | string | null }): boolean {
  if (asset.status === 'locked_out' || asset.status === 'expired' || asset.status === 'retired') {
    return false;
  }
  if (!asset.calibrationDueDate) return false;
  const due = new Date(asset.calibrationDueDate);
  due.setHours(23, 59, 59, 999);
  return due >= new Date();
}

async function evaluateRequiredCalibrationAssets(
  requiredAssetTags: string[],
  context: {
    travelerId?: string;
    travelerStepId?: string;
    routingOperationId?: number;
    orderId?: string | null;
    employeeId?: number;
    employeeName?: string;
    logAccepted?: boolean;
    logBlocked?: boolean;
  } = {}
): Promise<GateResult> {
  const tags = Array.from(new Set(requiredAssetTags.map((tag) => tag.trim()).filter(Boolean)));
  if (tags.length === 0) return { allowed: true };

  const assets = await db
    .select()
    .from(calibrationAssets)
    .where(inArray(calibrationAssets.assetTag, tags));

  const byTag = new Map(assets.map((asset) => [asset.assetTag, asset]));
  const missing = tags.filter((tag) => !byTag.has(tag));
  const blocked = assets.filter((asset) => !isCalibrationAssetUsable(asset));

  if (missing.length > 0 || blocked.length > 0) {
    const blockedDetails = blocked.map((asset) => {
      const due = asset.calibrationDueDate ? ` due ${asset.calibrationDueDate}` : ' with no due date';
      return `${asset.assetTag} (${asset.status}${due})`;
    });
    const reason = [
      missing.length > 0 ? `Missing calibration asset(s): ${missing.join(', ')}` : null,
      blockedDetails.length > 0 ? `Unavailable calibration asset(s): ${blockedDetails.join(', ')}` : null,
    ].filter(Boolean).join('. ');

    if (context.logBlocked) {
      await db.insert(calibrationUseLogs).values(
        tags.map((tag) => ({
          assetId: byTag.get(tag)?.id ?? null,
          assetTag: tag,
          travelerId: context.travelerId ?? null,
          travelerStepId: context.travelerStepId ?? null,
          routingOperationId: context.routingOperationId ?? null,
          orderId: context.orderId ?? null,
          usedByUserId: context.employeeId ?? null,
          usedByDisplayName: context.employeeName ?? null,
          useStatus: 'blocked',
          gateMessage: reason,
        }))
      );
    }

    return {
      allowed: false,
      reason: `${reason}. Calibration evidence must be current before this operation can start.`,
    };
  }

  if (context.logAccepted) {
    await db.insert(calibrationUseLogs).values(
      tags.map((tag) => ({
        assetId: byTag.get(tag)?.id ?? null,
        assetTag: tag,
        travelerId: context.travelerId ?? null,
        travelerStepId: context.travelerStepId ?? null,
        routingOperationId: context.routingOperationId ?? null,
        orderId: context.orderId ?? null,
        usedByUserId: context.employeeId ?? null,
        usedByDisplayName: context.employeeName ?? null,
        useStatus: 'accepted',
        gateMessage: 'Calibration asset current at traveler start gate.',
      }))
    );
  }

  return { allowed: true };
}

/**
 * Evaluate all gates that must pass before an operator can START a traveler step.
 *
 * Checks (in order):
 *  1. Sequence   — previous step must be COMPLETED
 *  2.  Identity  — employee identity (badge scan) is required for ALL travelers,
 *                  regardless of whether the traveler has a partNumber.
 *  2a. Training  — when the traveler has a partNumber, the employee must have an
 *                  active authorization record for that part.
 *  2b. Operation cert — when the step's routing operation has a certificationId,
 *                  the employee must hold a valid, non-expired training certification
 *                  for that cert (regardless of whether the traveler has a partNumber).
 *  3. Material   — a lot/ICN must be allocated to the traveler
 *
 * @param travelerId   UUID of the traveler
 * @param stepId       UUID of the step being started
 * @param options      employeeId and employeeName — always required (identity is mandatory)
 */
export async function evaluateTravelerStartGates(
  travelerId: string,
  stepId: string,
  options: { employeeId?: number; employeeName?: string; skipOperationCertCheck?: boolean } = {}
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

  // Gate 2: Identity — required for ALL travelers regardless of part number or cert status.
  if (!options.employeeId) {
    if (traveler.partNumber) {
      return {
        allowed: false,
        reason: `Employee identity could not be verified for part ${traveler.partNumber}. Scan a valid badge or enter a recognized employee code before starting this step.`,
      };
    }
    return {
      allowed: false,
      reason: `Employee identity is required before starting this step. Scan a valid badge before starting.`,
    };
  }
  const verifiedEmployeeId = options.employeeId;

  // Gate 2a: Part authorization — when the traveler has a partNumber, the employee
  // must have an active authorization record for that part.
  // Grandfather: only enforce once at least one authorization has been set up for
  // this part (avoids blocking everyone when the system is newly deployed).
  if (traveler.partNumber) {
    if (prospectiveAuthorizationEnforcementEnabled()) {
      try {
        await requireApplicableAuthorization({
          employeeId: verifiedEmployeeId,
          type: 'WORK',
          program: 'P2',
          partNumber: traveler.partNumber,
          department: step.departmentName,
          operation: step.departmentName,
          actionType: 'TRAVELER_START',
          evidence: { travelerId, travelerStepId: stepId },
        });
      } catch (error: any) {
        return { allowed: false, reason: error.message };
      }
    } else {
    const [anyAuth] = await db
      .select({ id: travelerAuthorizations.id })
      .from(travelerAuthorizations)
      .where(
        and(
          eq(travelerAuthorizations.partNumber, traveler.partNumber),
          eq(travelerAuthorizations.isActive, true)
        )
      )
      .limit(1);

    if (anyAuth) {
      const [empAuth] = await db
        .select({ id: travelerAuthorizations.id })
        .from(travelerAuthorizations)
        .where(
          and(
            eq(travelerAuthorizations.employeeId, verifiedEmployeeId),
            eq(travelerAuthorizations.partNumber, traveler.partNumber),
            eq(travelerAuthorizations.isActive, true)
          )
        )
        .limit(1);

      if (!empAuth) {
        const name = options.employeeName || `Employee #${options.employeeId}`;
        return {
          allowed: false,
          reason: `${name} does not have a training authorization for part ${traveler.partNumber}. An authorization record must be created before work can begin.`,
        };
      }
    }
    }
  }

  // Gate 2b/2c/2d: Routing-operation gates (cert, machine-class, operation-type)
  // These checks all require a partRoutingId and a resolved routing operation.
  if (traveler.partRoutingId) {
    const routingOp = await storage.getRoutingOperationForTravelerStep(
      traveler.partRoutingId,
      step.stepNumber
    );
    if (routingOp) {
      // Gate 2b: Operation certification
      // Phase 1 WARN policy: when skipOperationCertCheck=true, the cert was already
      // evaluated by the training gate above and a WARN was recorded. Do not double-block here.
      if (routingOp.certificationId && !options.skipOperationCertCheck) {
        const cert = await storage.getCertificationById(routingOp.certificationId);
        const certName = cert?.name ?? `Certification #${routingOp.certificationId}`;
        const name = options.employeeName || `Employee #${options.employeeId}`;
        const hasCert = await storage.checkEmployeeHasValidTrainingCertificationForCert(
          verifiedEmployeeId,
          routingOp.certificationId
        );
        if (!hasCert) {
          return {
            allowed: false,
            reason: `${name} does not hold a valid, non-expired ${certName} certification required by this routing step. The certification must be current before starting.`,
          };
        }
      }

      // Load active qualifications once for both machine-class and operation-type checks.
      const activeQuals = await storage.getActiveEmployeeMachineQualificationsForEmployee(
        verifiedEmployeeId
      );

      // Gate 2c: Machine-class qualification — if the routing operation has a CNC
      // extension with a machineClass, the employee must hold an active, non-expired
      // MACHINE_CLASS qualification for that class.
      const cncOp = await storage.getRoutingCncOperationForRoutingOp(routingOp.id);
      if (cncOp?.machineClass) {
        const hasMachineQual = activeQuals.some(
          (q) => q.machineClass === cncOp.machineClass
        );
        if (!hasMachineQual) {
          const name = options.employeeName || `Employee #${options.employeeId}`;
          return {
            allowed: false,
            reason: `${name} does not have a valid machine-class qualification for "${cncOp.machineClass}". A qualification must be granted by an admin before starting this step.`,
          };
        }
      }

      // Gate 2d: Operation-type qualification — always enforced when the routing op
      // specifies an operationType.  The employee must hold an active, non-expired
      // qualification whose operationType matches.
      if (routingOp.operationType) {
        const hasOpTypeQual = activeQuals.some(
          (q) => q.operationType === routingOp.operationType
        );
        if (!hasOpTypeQual) {
          const name = options.employeeName || `Employee #${options.employeeId}`;
          return {
            allowed: false,
            reason: `${name} does not have a valid operation-type qualification for "${routingOp.operationType}". A qualification must be granted by an admin before starting this step.`,
          };
        }
      }

      const calibrationGate = await evaluateRequiredCalibrationAssets(
        routingOp.requiredCalibrationAssetTags ?? [],
        {
          travelerId,
          travelerStepId: stepId,
          routingOperationId: routingOp.id,
          orderId: traveler.workOrderId,
          employeeId: options.employeeId,
          employeeName: options.employeeName,
          logAccepted: true,
          logBlocked: true,
        }
      );
      if (!calibrationGate.allowed) return calibrationGate;
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
 * Evaluate all START gates individually and return per-gate results (for inline display).
 * Unlike evaluateTravelerStartGates, this runs every gate and collects all results
 * rather than returning on the first failure.
 */
export async function evaluateStartGatesDetailed(
  travelerId: string,
  stepId: string,
  options: { employeeId?: number; employeeName?: string } = {}
): Promise<GateCheckResult[]> {
  const results: GateCheckResult[] = [];

  const traveler = await storage.getTraveler(travelerId);
  if (!traveler) {
    return [{ key: 'traveler', label: 'Traveler', passed: false, reason: 'Traveler not found.' }];
  }

  const step = await storage.getTravelerStep(stepId);
  if (!step) {
    return [{ key: 'step', label: 'Step', passed: false, reason: 'Step not found.' }];
  }

  // Gate 1: Sequence
  const allSteps = await storage.getTravelerSteps(travelerId);
  const currentIndex = allSteps.findIndex((s) => s.id === stepId);
  if (currentIndex === 0) {
    results.push({ key: 'sequence', label: 'Previous step done', passed: true });
  } else {
    const previousStep = allSteps[currentIndex - 1];
    if (previousStep.status !== 'COMPLETED') {
      results.push({
        key: 'sequence',
        label: 'Previous step done',
        passed: false,
        reason: `Step ${previousStep.stepNumber} (${previousStep.departmentName}) must be completed first.`,
      });
    } else {
      results.push({ key: 'sequence', label: 'Previous step done', passed: true });
    }
  }

  // Gate 2: Identity — required for ALL travelers regardless of part number or cert status.
  if (!options.employeeId) {
    const identityReason = traveler.partNumber
      ? `Employee identity could not be verified for part ${traveler.partNumber}. Scan a valid badge before starting.`
      : `Employee identity is required before starting this step. Scan a valid badge before starting.`;
    results.push({
      key: 'identity',
      label: 'Employee identity',
      passed: false,
      reason: identityReason,
    });
    // Cannot evaluate part-auth or op-cert without identity; record them as pending.
    if (traveler.partNumber && prospectiveAuthorizationEnforcementEnabled()) {
      try {
        await requireApplicableAuthorization({ employeeId: options.employeeId, type: 'WORK', program: 'P2', partNumber: traveler.partNumber, department: step.departmentName, operation: step.departmentName, actionType: 'TRAVELER_START', evidence: { travelerId, travelerStepId: stepId } });
        results.push({ key: 'training', label: 'Work authorization', passed: true });
      } catch (error: any) {
        results.push({ key: 'training', label: 'Work authorization', passed: false, reason: error.message });
      }
    } else if (traveler.partNumber) {
      results.push({
        key: 'training',
        label: 'Training verified',
        passed: false,
        reason: 'Cannot verify training authorization — identity required first.',
      });
    }
  } else {
    results.push({ key: 'identity', label: 'Employee identity', passed: true });

    // Gate 2a: Part authorization (only when traveler has a partNumber).
    // Grandfather: only enforce when at least one authorization exists for this part.
    if (traveler.partNumber) {
      const [anyAuth] = await db
        .select({ id: travelerAuthorizations.id })
        .from(travelerAuthorizations)
        .where(
          and(
            eq(travelerAuthorizations.partNumber, traveler.partNumber),
            eq(travelerAuthorizations.isActive, true)
          )
        )
        .limit(1);

      if (anyAuth) {
        const [empAuth] = await db
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

        const name = options.employeeName || `Employee #${options.employeeId}`;
        if (!empAuth) {
          results.push({
            key: 'training',
            label: 'Training verified',
            passed: false,
            reason: `${name} does not have a training authorization for part ${traveler.partNumber}.`,
          });
        } else {
          results.push({ key: 'training', label: 'Training verified', passed: true });
        }
      }
    }
  }

  // Gate 2b/2c/2d: Routing-operation gates (cert, machine-class, operation-type)
  if (traveler.partRoutingId) {
    const routingOp = await storage.getRoutingOperationForTravelerStep(
      traveler.partRoutingId,
      step.stepNumber
    );
    if (routingOp) {
      // Gate 2b: Operation certification
      if (routingOp.certificationId) {
        const cert = await storage.getCertificationById(routingOp.certificationId);
        const certName = cert?.name ?? `Certification #${routingOp.certificationId}`;
        if (!options.employeeId) {
          results.push({
            key: 'operation_cert',
            label: `Operation cert: ${certName}`,
            passed: false,
            reason: `Employee identity is required to verify the ${certName} certification for this routing step.`,
          });
        } else {
          const name = options.employeeName || `Employee #${options.employeeId}`;
          const hasCert = await storage.checkEmployeeHasValidTrainingCertificationForCert(
            options.employeeId,
            routingOp.certificationId
          );
          if (!hasCert) {
            results.push({
              key: 'operation_cert',
              label: `Operation cert: ${certName}`,
              passed: false,
              reason: `${name} does not hold a valid, non-expired ${certName} certification required by this routing step.`,
            });
          } else {
            results.push({ key: 'operation_cert', label: `Operation cert: ${certName}`, passed: true });
          }
        }
      }

      if (options.employeeId) {
        const activeQuals = await storage.getActiveEmployeeMachineQualificationsForEmployee(
          options.employeeId
        );

        // Gate 2c: Machine-class qualification
        const cncOp = await storage.getRoutingCncOperationForRoutingOp(routingOp.id);
        if (cncOp?.machineClass) {
          const hasMachineQual = activeQuals.some((q) => q.machineClass === cncOp.machineClass);
          const name = options.employeeName || `Employee #${options.employeeId}`;
          results.push({
            key: 'machine_class',
            label: `Machine class: ${cncOp.machineClass}`,
            passed: hasMachineQual,
            reason: hasMachineQual
              ? undefined
              : `${name} does not have a valid machine-class qualification for "${cncOp.machineClass}".`,
          });
        }

        // Gate 2d: Operation-type qualification — always enforced when the routing op
        // specifies an operationType.
        if (routingOp.operationType) {
          {
            const hasOpTypeQual = activeQuals.some((q) => q.operationType === routingOp.operationType);
            const name = options.employeeName || `Employee #${options.employeeId}`;
            results.push({
              key: 'operation_type',
              label: `Operation type: ${routingOp.operationType}`,
              passed: hasOpTypeQual,
              reason: hasOpTypeQual
                ? undefined
                : `${name} does not have a valid operation-type qualification for "${routingOp.operationType}".`,
            });
          }
        }
      }

      const calibrationTags = routingOp.requiredCalibrationAssetTags ?? [];
      if (calibrationTags.length > 0) {
        const calibrationGate = await evaluateRequiredCalibrationAssets(
          calibrationTags,
          {
            travelerId,
            travelerStepId: stepId,
            routingOperationId: routingOp.id,
            orderId: traveler.workOrderId,
            employeeId: options.employeeId,
            employeeName: options.employeeName,
          }
        );
        results.push({
          key: 'calibration_assets',
          label: `Calibration current: ${calibrationTags.join(', ')}`,
          passed: calibrationGate.allowed,
          reason: calibrationGate.reason,
        });
      }
    }
  }

  // Gate 3: Material
  const hasMaterialOnTraveler = !!(traveler.lotNumber || traveler.internalControlNumber);
  if (!hasMaterialOnTraveler) {
    const [consumption] = await db
      .select({ id: travelerMaterialConsumption.id })
      .from(travelerMaterialConsumption)
      .where(eq(travelerMaterialConsumption.travelerId, travelerId))
      .limit(1);

    if (!consumption) {
      results.push({
        key: 'material',
        label: 'Material assigned',
        passed: false,
        reason: 'No material (lot number or ICN) has been allocated to this traveler.',
      });
    } else {
      results.push({ key: 'material', label: 'Material assigned', passed: true });
    }
  } else {
    results.push({ key: 'material', label: 'Material assigned', passed: true });
  }

  return results;
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
