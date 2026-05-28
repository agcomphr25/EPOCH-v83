import { Express, Request, Response } from 'express';
import { db } from '../../db';
import { apiIntegrationKeys, epochExternalEvents, epochLaborFacts, employees } from '../../schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { authenticateToken, requireRole, optionalAuth } from '../../middleware/auth';
import { DEFAULT_LABOR_FACTS_LIMIT, DEFAULT_LABOR_FACTS_BY_RANGE_LIMIT, MAX_LABOR_FACTS_LIMIT } from '../constants/laborFacts';
import { DEFAULT_CONNECTOR_HEALTH_HISTORY_LIMIT, MAX_CONNECTOR_HEALTH_HISTORY_LIMIT } from '../constants/connectorHealth';
import { 
  getConnectorHealth, 
  listConnectorHealthByTenant, 
  getConnectorHealthHistory,
  startConnectorHealthEvaluator 
} from '../services/connectorHealthService';
import { resolveTravelerBarcode, type ChargeContext } from '../helpers/travelerBarcodeResolver';
import { storage } from '../../storage';
import { evaluateWorkOrderLaborStatus, type WorkOrderLaborStatusResult } from '../helpers/laborBudgetHelper';
import { evaluateWadReleaseGate, evaluateMaterialReadinessGate, buildGateErrorBody, buildTrainingGateErrorBody, AnyGateErrorBody } from '../lib/travelerGates';
import { evaluateTravelerTrainingGate } from '../lib/trainingEnforcement';
import { laborEntryAuditTable } from '../schema/timekeeping';
import { chargeCodes } from '../../schema';
import { eq as eqDrizzle, and as andDrizzle } from 'drizzle-orm';
import * as ledger from '../lib/punchLedger';
import type { PunchLedgerEntry } from '../lib/punchLedger';
import { resolveChargeCode, deriveProjectId, resolveBudgetOverrunState, resolveCertificationStatus } from '../lib/resolveChargeCode';
import { checkActivePTOForEmployee } from '../services/timekeeping/timeoff.service';

function laborBudgetConsumptionLabel(laborStatus: WorkOrderLaborStatusResult): string {
  const deptPct = laborStatus.departmentPercentUsed;
  const totalPct = laborStatus.percentUsed;
  if (deptPct != null && totalPct != null && deptPct > totalPct) {
    return `${deptPct}% of department budget consumed`;
  }
  if (totalPct != null) {
    return `${totalPct}% of total budget consumed`;
  }
  return 'over budget';
}

/**
 * Resolves a raw employee identifier (numeric DB id or employee code) to the
 * canonical numeric employees.id string used in labor_budget_overrides.
 * Returns null if no matching employee is found.
 */
async function resolveCanonicalEmployeeId(rawId: string): Promise<string | null> {
  const trimmed = rawId.trim();
  const isNumeric = /^\d+$/.test(trimmed);
  const [row] = await (isNumeric
    ? db.select({ id: employees.id }).from(employees).where(eq(employees.id, parseInt(trimmed, 10))).limit(1)
    : db.select({ id: employees.id }).from(employees).where(eq(employees.employeeCode, trimmed)).limit(1));
  return row ? String(row.id) : null;
}

/**
 * Validates that a charge code exists and is active in the native public.charge_codes registry.
 * Returns null when no code is provided (uncodified labor is permitted).
 * Returns an error object when the code is present but inactive or unknown.
 */
async function validateActiveChargeCode(
  chargeCode: string | null | undefined
): Promise<{ valid: true } | { valid: false; error: string; errorCode: string }> {
  if (!chargeCode || !chargeCode.trim()) return { valid: true };
  const normalized = chargeCode.trim();
  const [row] = await db
    .select({ id: chargeCodes.id })
    .from(chargeCodes)
    .where(andDrizzle(eqDrizzle(chargeCodes.code, normalized), eqDrizzle(chargeCodes.active, true)))
    .limit(1);
  if (!row) {
    return {
      valid: false,
      error: `Charge code '${normalized}' is not active in the charge code registry. A supervisor must activate it before labor can be recorded against it.`,
      errorCode: 'CHARGE_CODE_INACTIVE',
    };
  }
  return { valid: true };
}

interface JobSwitchResult {
  entry: PunchLedgerEntry;
  closedEntry?: PunchLedgerEntry | null;
  chargeContext: ChargeContext & { resolvedChargeCode?: string | null };
  warning?: string;
  laborStatus?: WorkOrderLaborStatusResult;
}

/**
 * Shared job-switch execution helper used by both the clock-in/traveler auto-switch
 * branch and the explicit switch-job/traveler route.
 *
 * Steps:
 *   1. Validate that the resolved charge code is active in the registry.
 *   2. Resolve string employeeId to public.employees.id (integer).
 *   3. Get open punch_ledger session (must exist for a switch).
 *   4. Run budget enforcement (BLOCKED / WARNING / override / approval).
 *   5. Close the current session and open a new TRAVELER session at the same timestamp.
 *   6. Consume any approved budget override.
 *   7. Write JOB_SWITCH audit event.
 */
async function executeJobSwitch(params: {
  employeeId: string;
  context: ChargeContext;
  parsedApprovalId: number | null;
}): Promise<{ ok: true; result: JobSwitchResult } | { ok: false; status: number; body: Record<string, unknown> }> {
  const { employeeId, context, parsedApprovalId } = params;

  // 2. Resolve string employeeId to public.employees.id (integer) for punch_ledger FK
  const canonicalStr = await resolveCanonicalEmployeeId(employeeId);
  const numericEmployeeId = canonicalStr != null ? parseInt(canonicalStr, 10) : null;
  if (numericEmployeeId == null || isNaN(numericEmployeeId)) {
    return {
      ok: false,
      status: 404,
      body: { error: 'EMPLOYEE_NOT_FOUND', message: `Employee '${employeeId}' not found in public.employees` },
    };
  }

  // 3. Require an open punch_ledger session for the switch
  const currentOpenEntry = await storage.getOpenPunchLedgerEntry(numericEmployeeId);

  if (!currentOpenEntry) {
    return {
      ok: false,
      status: 409,
      body: { error: 'NOT_CLOCKED_IN', message: 'Employee is not currently clocked in. A job switch requires an active session.' },
    };
  }

  // 4. Budget enforcement
  let switchApprovalId: number | null = null;
  let switchOverrideId: number | null = null;
  let warningMessage: string | null = null;
  let laborStatusForResponse: WorkOrderLaborStatusResult | null = null;

  if (context.wadId) {
    const laborStatus = await evaluateWorkOrderLaborStatus(context.wadId, context.department);

    if (laborStatus.status === 'BLOCKED') {
      const activeOverride = await storage.getApprovedActiveLaborBudgetOverride(context.wadId, canonicalStr!);
      if (activeOverride) {
        switchOverrideId = activeOverride.id;
        laborStatusForResponse = laborStatus;
      } else if (parsedApprovalId != null) {
        const approval = await storage.getLaborApprovalById(parsedApprovalId);
        if (
          !approval ||
          approval.productionWorkOrderId !== context.wadId ||
          approval.employeeId !== canonicalStr
        ) {
          return {
            ok: false,
            status: 403,
            body: {
              error: 'INVALID_LABOR_APPROVAL',
              message: 'The provided laborApprovalId is not valid for this employee and work order.',
            },
          };
        }
        switchApprovalId = approval.id;
        laborStatusForResponse = laborStatus;
      } else {
        // Phase 1 WARN: no override/approval → allow job switch through, stamp isOverrun=true
        laborStatusForResponse = laborStatus;
        // warningMessage will carry overrun context to response
        warningMessage = `Labor budget exhausted (${laborBudgetConsumptionLabel(laborStatus)}). Switch recorded under WARN policy — supervisor approval required.`;
      }
    }

    if (laborStatus.status === 'WARNING') {
      warningMessage = `Work order is approaching its labor budget limit (${laborBudgetConsumptionLabel(laborStatus)}).`;
      laborStatusForResponse = laborStatus;
    }
  }

  // 5. Resolve active traveler step first so travelerStepId can be passed into the
  //    charge code resolver for operation-scoped department fallback (Task #1235).
  const travelerStepsForSwitch = context.travelerId
    ? (await storage.getTravelerSteps(context.travelerId)).sort(
        (a, b) => ((a as any).stepNumber ?? 0) - ((b as any).stepNumber ?? 0)
      )
    : [];
  const activeStepForSwitch =
    travelerStepsForSwitch.find((s) => s.status === 'IN_PROGRESS') ||
    travelerStepsForSwitch.find((s) => s.status === 'NOT_STARTED') ||
    null;

  // 5b. Resolve chargeCodeId deterministically from WAD (Task #1235).
  // Fail-closed: if WAD is linked and resolution fails, abort the switch — never proceed
  // with a null charge code for traveler-driven sessions against a known WAD.
  let resolvedChargeCodeId: number | null = null;
  let resolvedChargeCode: string | null = null;
  const jobSwitchCcResult = await resolveChargeCode({
    productionWorkOrderId: context.wadId ?? null,
    travelerId: context.travelerId ?? null,
    travelerStepId: activeStepForSwitch?.id ?? null,
    department: context.department ?? null,
  });
  if (!('error' in jobSwitchCcResult)) {
    resolvedChargeCodeId = jobSwitchCcResult.chargeCodeId;
    resolvedChargeCode = jobSwitchCcResult.chargeCode;
  } else if (context.wadId) {
    // WAD is linked but no charge code could be resolved — block the switch
    return {
      ok: false,
      status: 400,
      body: {
        error: 'CHARGE_CODE_UNRESOLVED',
        message: jobSwitchCcResult.error,
        hint: 'Set a default charge code on the production work order or the traveler, or create an active charge code for this department.',
      },
    };
  }
  // If no wadId at all, proceed with null chargeCodeId

  const sessionChargeCode = resolvedChargeCode ?? context.chargeCode ?? null;
  const chargeValidation = await validateActiveChargeCode(sessionChargeCode);
  if (!chargeValidation.valid) {
    return {
      ok: false,
      status: 422,
      body: { error: chargeValidation.errorCode, message: chargeValidation.error },
    };
  }

  // Duplicate-session guard: reject a switch to the same traveler/charge code already active.
  // Compare against the resolved WAD charge-code identity, not the barcode context's
  // derived WAD/work-order number.
  const sameTraveler =
    currentOpenEntry.travelerId != null &&
    currentOpenEntry.travelerId === context.travelerId;
  const sameChargeCode =
    resolvedChargeCodeId != null && currentOpenEntry.chargeCodeId != null
      ? currentOpenEntry.chargeCodeId === resolvedChargeCodeId
      : currentOpenEntry.chargeCode === sessionChargeCode;
  if (sameTraveler && sameChargeCode && currentOpenEntry.laborClass !== 'BREAK') {
    return {
      ok: true,
      result: {
        entry: currentOpenEntry,
        closedEntry: null,
        chargeContext: { ...context, resolvedChargeCode: sessionChargeCode },
      },
    };
  }

  const [jobSwitchProjectId, jobSwitchBudget, jobSwitchCertResult] = await Promise.all([
    deriveProjectId(context.wadId ?? null),
    resolveBudgetOverrunState({ productionWorkOrderId: context.wadId ?? null, department: context.department ?? null }),
    context.travelerId && activeStepForSwitch && numericEmployeeId != null
      ? resolveCertificationStatus({
          travelerId: context.travelerId,
          stepId: activeStepForSwitch.id,
          employeeId: numericEmployeeId,
        })
      : Promise.resolve(null),
  ]);

  const switchBoundary = new Date();
  const approvalStatus = switchApprovalId != null || switchOverrideId != null ? 'APPROVED_OVERRUN' : 'PENDING_APPROVAL';
  const closedEntry = await ledger.closeSessionById(currentOpenEntry.id, numericEmployeeId, null, switchBoundary);

  if (!closedEntry) {
    return { ok: false, status: 500, body: { error: 'SWITCH_FAILED', message: 'Failed to close current labor session' } };
  }

  const newEntry = await ledger.openSession({
    employeeId: numericEmployeeId,
    source: 'TRAVELER',
    laborClass: 'REGULAR',
    clockIn: switchBoundary,
    travelerId: context.travelerId ?? null,
    productionWorkOrderId: context.wadId ?? null,
    chargeCodeId: resolvedChargeCodeId,
    department: context.department ?? null,
    operation: context.operation ?? null,
    projectId: jobSwitchProjectId,
    travelerStepId: activeStepForSwitch?.id ?? null,
    certificationStatus: jobSwitchCertResult?.status ?? null,
    isOverrun: jobSwitchBudget.isOverrun,
    overrunReason: jobSwitchBudget.overrunReason,
    approvalStatus,
    laborApprovalId: switchApprovalId,
    laborBudgetOverrideId: switchOverrideId,
    createdBy: numericEmployeeId,
  });

  // 6. Consume the override only after a successful switch
  if (switchOverrideId != null) {
    await storage.consumeLaborBudgetOverride(switchOverrideId);
  }

  // 7. Audit event for the automatic close+open traveler switch.
  if (context.travelerId) {
    try {
      await storage.createTravelerEvent({
        travelerId: context.travelerId,
        actor: String(numericEmployeeId),
        actorName: null,
        action: 'JOB_SWITCH',
        details: {
          closedEntryId: closedEntry.id,
          newEntryId: newEntry.id,
          previousTravelerId: currentOpenEntry.travelerId ?? null,
          previousChargeCode: currentOpenEntry.chargeCode ?? null,
          previousSource: currentOpenEntry.source ?? null,
          previousLaborClass: currentOpenEntry.laborClass ?? null,
          newTravelerId: context.travelerId,
          newChargeCode: sessionChargeCode,
          timestamp: switchBoundary.toISOString(),
          source: 'punch_ledger',
        },
      });
    } catch (auditErr) {
      console.error('[TimeClock] Failed to write JOB_SWITCH audit event:', auditErr);
    }
  }

  // 8. DCAA audit entry for the job switch
  try {
    await db.insert(laborEntryAuditTable).values({
      tableName: 'punch_ledger',
      recordId: newEntry.id,
      action: 'JOB_SWITCH',
      oldValues: {
        entryId: currentOpenEntry.id,
        travelerId: currentOpenEntry.travelerId ?? null,
        chargeCode: currentOpenEntry.chargeCode ?? null,
        productionWorkOrderId: currentOpenEntry.productionWorkOrderId ?? null,
        source: currentOpenEntry.source ?? null,
        laborClass: currentOpenEntry.laborClass ?? null,
        closedAt: switchBoundary.toISOString(),
      },
      newValues: {
        entryId: newEntry.id,
        travelerId: context.travelerId ?? null,
        chargeCode: sessionChargeCode,
        productionWorkOrderId: context.wadId ?? null,
        editReason: 'job switch via traveler scan',
        timestamp: switchBoundary.toISOString(),
      },
      actorId: numericEmployeeId,
      actorEmail: null,
      actorRole: null,
      ipAddress: null,
    });
  } catch (dcaaAuditErr) {
    console.error('[TimeClock] Failed to write JOB_SWITCH DCAA audit entry:', dcaaAuditErr);
  }

  const result: JobSwitchResult = {
    entry: newEntry,
    closedEntry,
    chargeContext: { ...context, resolvedChargeCode: sessionChargeCode },
  };
  if (warningMessage) result.warning = warningMessage;
  if (laborStatusForResponse) result.laborStatus = laborStatusForResponse;

  return { ok: true, result };
}

/**
 * Result type for executeTravelerAutoPunch.
 * `action` describes the punch_ledger transition that was performed:
 *   - 'clockedIn' — no open session existed; a new one was opened
 *   - 'switched'  — open session existed on a different traveler/charge code; closed+reopened as a new segment
 *   - 'unchanged' — open session was already on this traveler+chargeCode; no-op
 */
export type TravelerAutoPunchAction = 'clockedIn' | 'switched' | 'unchanged';

export type TravelerAutoPunchResult =
  | {
      ok: true;
      action: TravelerAutoPunchAction;
      entry: PunchLedgerEntry | null;
      closedEntry?: PunchLedgerEntry | null;
      chargeContext: ChargeContext & { resolvedChargeCode?: string | null };
      warning?: string;
      laborStatus?: WorkOrderLaborStatusResult;
      budgetOverrideId?: number | null;
      warnedOnOverrun?: boolean;
      overrunReason?: string | null;
    }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Open a fresh TRAVELER-source punch_ledger session for a traveler context.
 * Extracted from the kiosk /api/time-clock/clock-in/traveler route so the same
 * code path is reused by the P2 Traveler auto-punch helper (Task #188).
 *
 * Performs:
 *   1. Deterministic charge-code resolution (fail-closed when WAD has no resolvable code).
 *   2. Project id derivation from the WAD.
 *   3. Budget enforcement (BLOCKED → override / approval / FLAGGED with WARN; WARNING → PENDING_APPROVAL).
 *   4. ledger.openSession with the correct approvalStatus per §5.2 (Task #77).
 *
 * Caller is responsible for running entry gates and the PTO check.
 */
async function executeTravelerClockIn(params: {
  context: ChargeContext;
  numericEmployeeId: number;
  canonicalEmployeeIdStr: string;
  activeStepId: string | null;
  clockInCertStatus: string | null;
  parsedApprovalId: number | null;
}): Promise<TravelerAutoPunchResult> {
  const {
    context,
    numericEmployeeId,
    canonicalEmployeeIdStr,
    activeStepId,
    clockInCertStatus,
    parsedApprovalId,
  } = params;

  // Resolve chargeCodeId deterministically from WAD (Task #1235).
  // Fail-closed: if WAD is linked and resolution fails, return 400.
  let chargeCodeId: number | null = null;
  let wadResolvedChargeCode: string | null = null;
  const wadCcResult = await resolveChargeCode({
    productionWorkOrderId: context.wadId ?? null,
    travelerId: context.travelerId ?? null,
    travelerStepId: activeStepId ?? null,
    department: context.department ?? null,
  });
  if (!('error' in wadCcResult)) {
    chargeCodeId = wadCcResult.chargeCodeId;
    wadResolvedChargeCode = wadCcResult.chargeCode;
  } else if (context.wadId) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'CHARGE_CODE_UNRESOLVED',
        message: wadCcResult.error,
        hint: 'Set a default charge code on the production work order or the traveler, or create an active charge code for this department.',
      },
    };
  }

  const resolvedProjectId = await deriveProjectId(context.wadId ?? null);

  if (context.wadId) {
    const laborStatus = await evaluateWorkOrderLaborStatus(context.wadId, context.department);
    const overrunLabel = laborBudgetConsumptionLabel(laborStatus);
    const isOverrun = laborStatus.status === 'BLOCKED';
    const overrunReason = isOverrun
      ? `Labor budget exhausted (${overrunLabel}). Session recorded under WARN policy — supervisor approval required.`
      : null;

    if (laborStatus.status === 'BLOCKED') {
      const activeOverride = await storage.getApprovedActiveLaborBudgetOverride(
        context.wadId,
        canonicalEmployeeIdStr,
      );

      if (activeOverride) {
        const entry = await ledger.openSession({
          employeeId: numericEmployeeId,
          source: 'TRAVELER',
          laborClass: 'REGULAR',
          travelerId: context.travelerId ?? null,
          productionWorkOrderId: context.wadId ?? null,
          chargeCodeId,
          department: context.department ?? null,
          operation: context.operation ?? null,
          projectId: resolvedProjectId,
          travelerStepId: activeStepId,
          certificationStatus: clockInCertStatus,
          isOverrun,
          overrunReason,
          approvalStatus: 'APPROVED_OVERRUN',
          laborBudgetOverrideId: activeOverride.id,
        });
        await storage.consumeLaborBudgetOverride(activeOverride.id);
        return {
          ok: true,
          action: 'clockedIn',
          entry,
          chargeContext: { ...context, resolvedChargeCode: wadResolvedChargeCode },
          laborStatus,
          budgetOverrideId: activeOverride.id,
        };
      }

      if (parsedApprovalId == null) {
        const warnEntry = await ledger.openSession({
          employeeId: numericEmployeeId,
          source: 'TRAVELER',
          laborClass: 'REGULAR',
          travelerId: context.travelerId ?? null,
          productionWorkOrderId: context.wadId ?? null,
          chargeCodeId,
          department: context.department ?? null,
          operation: context.operation ?? null,
          projectId: resolvedProjectId,
          travelerStepId: activeStepId,
          certificationStatus: clockInCertStatus,
          isOverrun,
          overrunReason,
          approvalStatus: 'FLAGGED',
        });
        return {
          ok: true,
          action: 'clockedIn',
          entry: warnEntry,
          chargeContext: { ...context, resolvedChargeCode: wadResolvedChargeCode },
          laborStatus,
          warnedOnOverrun: true,
          overrunReason,
        };
      }

      const approval = await storage.getLaborApprovalById(parsedApprovalId);
      if (
        !approval ||
        approval.productionWorkOrderId !== context.wadId ||
        approval.employeeId !== canonicalEmployeeIdStr
      ) {
        return {
          ok: false,
          status: 403,
          body: {
            error: 'INVALID_LABOR_APPROVAL',
            message: 'The provided laborApprovalId is not valid for this employee and work order.',
          },
        };
      }
      const entry = await ledger.openSession({
        employeeId: numericEmployeeId,
        source: 'TRAVELER',
        laborClass: 'REGULAR',
        travelerId: context.travelerId ?? null,
        productionWorkOrderId: context.wadId ?? null,
        chargeCodeId,
        department: context.department ?? null,
        operation: context.operation ?? null,
        projectId: resolvedProjectId,
        travelerStepId: activeStepId,
        certificationStatus: clockInCertStatus,
        isOverrun,
        overrunReason,
        approvalStatus: 'APPROVED_OVERRUN',
        laborApprovalId: approval.id,
      });
      return {
        ok: true,
        action: 'clockedIn',
        entry,
        chargeContext: { ...context, resolvedChargeCode: wadResolvedChargeCode },
      };
    }

    if (laborStatus.status === 'WARNING') {
      const entry = await ledger.openSession({
        employeeId: numericEmployeeId,
        source: 'TRAVELER',
        laborClass: 'REGULAR',
        travelerId: context.travelerId ?? null,
        productionWorkOrderId: context.wadId ?? null,
        chargeCodeId,
        department: context.department ?? null,
        operation: context.operation ?? null,
        projectId: resolvedProjectId,
        travelerStepId: activeStepId,
        certificationStatus: clockInCertStatus,
        isOverrun: false,
        overrunReason: null,
        // §5.2 (Task #77): WAD-linked traveler sessions enter PENDING_APPROVAL,
        // even on the WARNING path — supervisor approval is still required.
        approvalStatus: 'PENDING_APPROVAL',
      });
      return {
        ok: true,
        action: 'clockedIn',
        entry,
        chargeContext: { ...context, resolvedChargeCode: wadResolvedChargeCode },
        warning: `Work order is approaching its labor budget limit (${overrunLabel}).`,
        laborStatus,
      };
    }
  }

  // No WAD linked — flag the session per Phase 1 WARN policy.
  const noWadLinked = !context.wadId && !!context.travelerId;
  const entry = await ledger.openSession({
    employeeId: numericEmployeeId,
    source: 'TRAVELER',
    laborClass: 'REGULAR',
    travelerId: context.travelerId ?? null,
    productionWorkOrderId: context.wadId ?? null,
    chargeCodeId,
    department: context.department ?? null,
    operation: context.operation ?? null,
    projectId: resolvedProjectId,
    travelerStepId: activeStepId,
    certificationStatus: clockInCertStatus,
    isOverrun: noWadLinked,
    overrunReason: noWadLinked
      ? 'NO_WAD_LINKED — traveler has no production work order; charge code and project traceability are incomplete. Supervisor review required.'
      : null,
    // §5.2 (Task #77): TRAVELER-source WAD-linked sessions enter PENDING_APPROVAL.
    // No-WAD traveler sessions are still FLAGGED for supervisor triage.
    approvalStatus: noWadLinked ? 'FLAGGED' : 'PENDING_APPROVAL',
  });

  return {
    ok: true,
    action: 'clockedIn',
    entry,
    chargeContext: { ...context, resolvedChargeCode: wadResolvedChargeCode },
  };
}

/**
 * Unified traveler auto-punch orchestrator (Task #188).
 *
 * Given a traveler ChargeContext and an employee identifier, ensures the
 * employee's open punch_ledger session is on the traveler's resolved charge
 * code:
 *   - no open session   → run `executeTravelerClockIn` (clock in fresh)
 *   - open same job     → no-op, return action='unchanged'
 *   - open different    → call `executeJobSwitch` (close current + open traveler segment)
 *
 * Reused by the kiosk barcode clock-in route AND the P2 Traveler start-task
 * route so both paths apply identical gates (WAD release, material readiness,
 * training, PTO, budget, charge-code activeness) and produce identical
 * punch_ledger writes.
 *
 * `ptoOverride` is supplied by the kiosk barcode flow so an authenticated
 * ADMIN/OWNER may force clock-in past an active PTO entry. The P2 Traveler
 * route does not pass it (no admin override path on the floor tablet).
 */
export async function executeTravelerAutoPunch(params: {
  context: ChargeContext;
  employeeIdString: string;
  parsedApprovalId: number | null;
  ptoOverride?: {
    requested: boolean;
    reason: string | null;
    user: Express.Request['user'] | null;
    ip: string | null;
  };
}): Promise<TravelerAutoPunchResult> {
  const { context, employeeIdString, parsedApprovalId, ptoOverride } = params;

  // Gates: WAD release, material readiness, training/cert.
  const clockInGate = await evaluateTravelerClockInGates(
    context.travelerId,
    context.wadId,
    employeeIdString,
  );
  if (clockInGate.gateError) {
    return { ok: false, status: 403, body: clockInGate.gateError as unknown as Record<string, unknown> };
  }

  // Resolve canonical employee id.
  const canonicalEmployeeIdStr = await resolveCanonicalEmployeeId(employeeIdString);
  const numericEmployeeId =
    canonicalEmployeeIdStr != null ? parseInt(canonicalEmployeeIdStr, 10) : null;
  if (numericEmployeeId == null || isNaN(numericEmployeeId)) {
    return {
      ok: false,
      status: 404,
      body: { error: 'EMPLOYEE_NOT_FOUND', message: `Employee '${employeeIdString}' not found` },
    };
  }

  // Stamp cert status on session for Task #1235 traceability.
  let clockInCertStatus: string | null = null;
  if (clockInGate.activeStepId) {
    const certRes = await resolveCertificationStatus({
      travelerId: context.travelerId,
      stepId: clockInGate.activeStepId,
      employeeId: numericEmployeeId,
    });
    clockInCertStatus = certRes.status;
  }

  const openEntry = await storage.getOpenPunchLedgerEntry(numericEmployeeId);

  if (openEntry) {
    // Resolve the charge code the way the write paths do (executeTravelerClockIn
    // / executeJobSwitch both call resolveChargeCode), so a "no-op" decision is
    // made against the same identity the next write would produce.
    const ccResolveForCompare = await resolveChargeCode({
      productionWorkOrderId: context.wadId ?? null,
      travelerId: context.travelerId ?? null,
      travelerStepId: clockInGate.activeStepId ?? null,
      department: context.department ?? null,
    });

    // Fail-closed when the WAD is linked but no charge code can be resolved.
    // Otherwise the open-session "unchanged" branch would silently bypass the
    // CHARGE_CODE_UNRESOLVED gate that the clock-in / switch paths enforce.
    if ('error' in ccResolveForCompare) {
      if (context.wadId) {
        return {
          ok: false,
          status: 400,
          body: {
            error: 'CHARGE_CODE_UNRESOLVED',
            message: ccResolveForCompare.error,
            hint: 'Set a default charge code on the production work order or the traveler, or create an active charge code for this department.',
          },
        };
      }
      // No WAD linked → fall through to switch path so existing behavior handles it.
    } else {
      const resolvedCompareChargeCodeId = ccResolveForCompare.chargeCodeId;
      const resolvedCompareChargeCode = ccResolveForCompare.chargeCode;

      // Validate that the resolved charge code is still active (matches the
      // gate enforced by clock-in / switch paths via openSession).
      const activenessCheck = await validateActiveChargeCode(resolvedCompareChargeCode);
      if (!activenessCheck.valid) {
        return {
          ok: false,
          status: 400,
          body: { error: activenessCheck.errorCode, message: activenessCheck.error },
        };
      }

      const sameTraveler =
        openEntry.travelerId != null && openEntry.travelerId === context.travelerId;
      const sameChargeCode =
        resolvedCompareChargeCodeId != null
          ? openEntry.chargeCodeId === resolvedCompareChargeCodeId
          : openEntry.chargeCode === resolvedCompareChargeCode;

      if (sameTraveler && sameChargeCode && openEntry.laborClass !== 'BREAK') {
        return {
          ok: true,
          action: 'unchanged',
          entry: openEntry,
          chargeContext: {
            ...context,
            resolvedChargeCode: resolvedCompareChargeCode ?? openEntry.chargeCode ?? null,
          },
        };
      }
    }
    // Otherwise switch in place.
    const switchResult = await executeJobSwitch({
      employeeId: employeeIdString,
      context,
      parsedApprovalId,
    });
    if (!switchResult.ok) return switchResult;
    return {
      ok: true,
      action: 'switched',
      entry: switchResult.result.entry,
      closedEntry: switchResult.result.closedEntry ?? null,
      chargeContext: {
        ...switchResult.result.chargeContext,
        resolvedChargeCode: switchResult.result.entry.chargeCode ?? null,
      },
      warning: switchResult.result.warning,
      laborStatus: switchResult.result.laborStatus,
    };
  }

  // No open session — PTO check before opening a fresh one.
  const tcToday = new Date().toISOString().slice(0, 10);
  const tcPtoBlock = await checkActivePTOForEmployee(numericEmployeeId, tcToday);
  if (tcPtoBlock) {
    const tcIsAdmin = ptoOverride?.user?.role === 'ADMIN' || ptoOverride?.user?.role === 'OWNER';
    if (ptoOverride?.requested && tcIsAdmin && ptoOverride.reason) {
      const { logAction: tcLogAction, actorFromUser: tcActorFromUser } = await import(
        '../services/timekeeping/audit.service'
      );
      await tcLogAction({
        tableName: 'leave_entries',
        recordId: tcPtoBlock.leaveEntryId,
        action: 'UPDATE',
        oldValues: null,
        newValues: {
          ptoClockInOverride: true,
          overrideActorId: ptoOverride.user?.id ?? null,
          overrideReason: ptoOverride.reason,
          overrideTimestamp: new Date().toISOString(),
          source: 'BARCODE',
        },
        actor: tcActorFromUser(ptoOverride.user ?? null, ptoOverride.ip ?? null),
      });
    } else {
      return {
        ok: false,
        status: 422,
        body: {
          error: 'PTO_DAY_BLOCK',
          message: 'This employee has approved PTO for today. Clock-in is not permitted.',
          leaveEntryId: tcPtoBlock.leaveEntryId,
        },
      };
    }
  }

  return executeTravelerClockIn({
    context,
    numericEmployeeId,
    canonicalEmployeeIdStr: canonicalEmployeeIdStr!,
    activeStepId: clockInGate.activeStepId,
    clockInCertStatus,
    parsedApprovalId,
  });
}

const VALID_EVENT_TYPES = [
  'TIME_PUNCH_IN',
  'TIME_PUNCH_OUT',
  'TIME_JOB_SWITCH',
  'TIME_PUNCH_EDITED',
  'TIME_BREAK_START',
  'TIME_BREAK_END',
];

// Project Time Clock event into labor fact (read-only traceability)
// This is append-only - never updates or deletes existing facts
async function projectToLaborFact(
  sourceEventId: string,
  tenantId: string,
  eventType: string,
  occurredAt: Date,
  payload: Record<string, any>
): Promise<void> {
  try {
    // Extract labor-relevant fields from payload
    const employeeId = payload.employeeId || payload.employee_id || payload.userId || payload.user_id;
    const employeeDisplayName = payload.employeeDisplayName || payload.employee_display_name || 
                                 payload.employeeName || payload.employee_name || payload.name;
    const role = payload.role || payload.position || payload.jobTitle || payload.job_title;
    const siteId = payload.siteId || payload.site_id || payload.locationId || payload.location_id;
    const jobId = payload.jobId || payload.job_id || payload.orderId || payload.order_id;
    const shiftDurationMinutes = payload.shiftDurationMinutes || payload.shift_duration_minutes ||
                                  payload.durationMinutes || payload.duration_minutes;
    const dayTotalMinutes = payload.dayTotalMinutes || payload.day_total_minutes ||
                             payload.totalMinutes || payload.total_minutes;

    if (!employeeId) {
      console.log(`[LaborFacts] Skipping projection - no employeeId in payload for event ${sourceEventId}`);
      return;
    }

    await db.insert(epochLaborFacts).values({
      tenantId,
      sourceEventId,
      sourceSystem: 'time_clock',
      eventType,
      occurredAt,
      employeeId: String(employeeId),
      employeeDisplayName: employeeDisplayName ? String(employeeDisplayName) : null,
      role: role ? String(role) : null,
      siteId: siteId ? String(siteId) : null,
      jobId: jobId ? String(jobId) : null,
      shiftDurationMinutes: shiftDurationMinutes ? parseInt(String(shiftDurationMinutes), 10) : null,
      dayTotalMinutes: dayTotalMinutes ? parseInt(String(dayTotalMinutes), 10) : null,
      payload,
    });

    console.log(`[LaborFacts] Projected event ${sourceEventId} -> labor fact (employee: ${employeeId})`);
  } catch (error) {
    // Log but don't fail - projection failures shouldn't block ingestion
    console.error(`[LaborFacts] Failed to project event ${sourceEventId}:`, error);
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    const dummy = crypto.createHash('sha256').update('dummy').digest('hex');
    crypto.timingSafeEqual(Buffer.from(dummy), Buffer.from(dummy));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function validateApiKey(
  authHeader: string | undefined,
  tenantId: string,
  sourceSystem: string,
  requiredPermission: string
): Promise<{ valid: boolean; error?: string; keyId?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.slice(7);
  if (!token || token.length < 32) {
    return { valid: false, error: 'Invalid API key format' };
  }

  const keyPrefix = token.slice(0, 8);
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');

  const [integration] = await db
    .select()
    .from(apiIntegrationKeys)
    .where(
      and(
        eq(apiIntegrationKeys.keyPrefix, keyPrefix),
        eq(apiIntegrationKeys.tenantId, tenantId),
        eq(apiIntegrationKeys.sourceSystem, sourceSystem),
        eq(apiIntegrationKeys.active, true)
      )
    )
    .limit(1);

  if (!integration) {
    return { valid: false, error: 'API key not found or inactive' };
  }

  if (integration.revokedAt) {
    return { valid: false, error: 'API key has been revoked' };
  }

  if (!timingSafeCompare(keyHash, integration.keyHash)) {
    return { valid: false, error: 'Invalid API key' };
  }

  if (!integration.permissions.includes(requiredPermission)) {
    return { valid: false, error: `Missing required permission: ${requiredPermission}` };
  }

  await db.update(apiIntegrationKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiIntegrationKeys.id, integration.id));

  return { valid: true, keyId: integration.id };
}

/**
 * Resolve a string employee identifier (employeeCode or badgeScanCode) to the
 * employees table integer PK and display name.  Used for training gate enforcement
 * on barcode-driven clock-in flows where the caller only provides a code string.
 * Returns null when no matching employee can be found (gates degrade gracefully).
 */
async function resolveEmployeeByCode(
  code: string
): Promise<{ id: number; name: string } | null> {
  const trimmed = code.trim();

  // Numeric input: treat as employees.id (Task #188 — P2 Traveler auto-punch
  // path passes the numeric employee id rather than a badge code).
  if (/^\d+$/.test(trimmed)) {
    const byId = await db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(eq(employees.id, parseInt(trimmed, 10)))
      .limit(1);
    if (byId.length > 0) return byId[0];
  }

  const byCode = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.employeeCode, trimmed))
    .limit(1);
  if (byCode.length > 0) return byCode[0];

  // Normalize: strip dashes so UUID badges resolve with or without hyphens
  const normalizedBadge = trimmed.replace(/-/g, '');
  const byBadge = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(sql`REPLACE(${employees.badgeScanCode}, '-', '') = ${normalizedBadge}`)
    .limit(1);
  if (byBadge.length > 0) return byBadge[0];

  return null;
}

/**
 * Run the traveler entry gates (WAD release, material readiness, training) that apply
 * to barcode-driven clock-in and job-switch flows.  Returns a non-null error body when
 * any gate fails, or null when all gates pass.
 *
 * These are the same gates enforced on the step-start route; applying them here ensures
 * clock-in via traveler barcode cannot bypass them.
 */
interface ClockInGateResult {
  gateError: AnyGateErrorBody | null;
  /** ID of the active (IN_PROGRESS or next NOT_STARTED) traveler step, if resolved. */
  activeStepId: string | null;
  /** True when a cert failure was detected but allowed through under Phase 1 WARN policy. */
  isCertWarn: boolean;
}

async function evaluateTravelerClockInGates(
  travelerId: string,
  wadId: string | null,
  employeeCode: string
): Promise<ClockInGateResult> {
  // Gate 1: WAD must be RELEASED or IN_PROGRESS (hard block)
  if (wadId) {
    const wadGate = await evaluateWadReleaseGate(wadId);
    if (!wadGate.allowed) {
      return {
        gateError: buildGateErrorBody(
          'wad_release',
          'Work order not released to floor',
          wadGate.reason ?? 'The linked work order is not in a state that permits labor charges.'
        ),
        activeStepId: null,
        isCertWarn: false,
      };
    }
  }

  // Gate 2: Traveler must have material allocated (hard block)
  const materialGate = await evaluateMaterialReadinessGate(travelerId);
  if (!materialGate.allowed) {
    return {
      gateError: buildGateErrorBody(
        'material_readiness',
        'Material not allocated to traveler',
        materialGate.reason ?? 'A lot number or ICN must be assigned to this traveler before work can begin.'
      ),
      activeStepId: null,
      isCertWarn: false,
    };
  }

  // Gate 3: Training / certification — best-effort employee resolution
  // Phase 1 WARN policy: operation-cert failures (training_module type) are allowed through
  // and flagged; part-training failures remain hard blocks.
  const emp = await resolveEmployeeByCode(employeeCode);
  const travelerSteps = (await storage.getTravelerSteps(travelerId)).sort(
    (a, b) => ((a as any).stepNumber ?? 0) - ((b as any).stepNumber ?? 0)
  );
  const activeStep =
    travelerSteps.find((s) => s.status === 'IN_PROGRESS') ||
    travelerSteps.find((s) => s.status === 'NOT_STARTED');

  let isCertWarn = false;
  if (activeStep) {
    const trainingGate = await evaluateTravelerTrainingGate(
      travelerId,
      activeStep.id,
      emp?.id,
      emp?.name
    );
    if (!trainingGate.allowed) {
      const isCertFailure =
        trainingGate.requirementType === 'training_module' &&
        (trainingGate.reason ?? '').toLowerCase().includes('cert');
      if (isCertFailure) {
        // Phase 1 WARN: cert failure is flagged, not blocked
        isCertWarn = true;
      } else {
        return {
          gateError: buildTrainingGateErrorBody(
            'Training requirement not met',
            trainingGate.reason ?? 'A training or certification requirement must be satisfied before clocking in to this traveler.',
            trainingGate.missingRequirement,
            trainingGate.requirementType,
          ),
          activeStepId: activeStep.id,
          isCertWarn: false,
        };
      }
    }
  }

  return { gateError: null, activeStepId: activeStep?.id ?? null, isCertWarn };
}

export function registerTimeClockRoutes(app: Express) {
  app.post('/api/connectors/time-clock/events', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string;
      const sourceSystem = req.headers['x-source-system'] as string;
      const schemaVersion = parseInt(req.headers['x-event-schema-version'] as string, 10) || 1;

      if (!tenantId) {
        return res.status(400).json({
          error: 'Missing required header',
          details: 'X-Tenant-Id header is required',
        });
      }

      if (sourceSystem !== 'time_clock') {
        return res.status(400).json({
          error: 'Invalid source system',
          details: 'X-Source-System must be "time_clock"',
        });
      }

      const authResult = await validateApiKey(authHeader, tenantId, 'time_clock', 'emit:labor_events');
      if (!authResult.valid) {
        const statusCode = authResult.error?.includes('permission') ? 403 : 401;
        return res.status(statusCode).json({
          error: 'Authentication failed',
          details: authResult.error,
        });
      }

      const payload = req.body;

      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({
          error: 'Invalid payload',
          details: 'Request body must be a valid JSON object',
        });
      }

      const eventType = payload.eventType || payload.event_type;
      const occurredAt = payload.occurredAt || payload.occurred_at || payload.timestamp;
      const eventId = payload.eventId || payload.event_id || payload.id;
      const deduplicationKey = payload.deduplicationKey || payload.deduplication_key || 
        (eventId ? `${tenantId}:${sourceSystem}:${eventId}` : null);

      if (!eventType) {
        return res.status(400).json({
          error: 'Invalid payload',
          details: 'eventType is required',
        });
      }

      if (!VALID_EVENT_TYPES.includes(eventType)) {
        console.log(`[TimeClock] Warning: Unknown event type "${eventType}" - accepting anyway`);
      }

      if (!occurredAt) {
        return res.status(400).json({
          error: 'Invalid payload',
          details: 'occurredAt timestamp is required',
        });
      }

      const occurredAtDate = new Date(occurredAt);
      if (isNaN(occurredAtDate.getTime())) {
        return res.status(400).json({
          error: 'Invalid payload',
          details: 'occurredAt must be a valid timestamp',
        });
      }

      if (deduplicationKey) {
        const [existing] = await db
          .select({ id: epochExternalEvents.id })
          .from(epochExternalEvents)
          .where(eq(epochExternalEvents.deduplicationKey, deduplicationKey))
          .limit(1);

        if (existing) {
          console.log(`[TimeClock] Duplicate event ignored: ${deduplicationKey}`);
          return res.status(202).json({
            status: 'accepted',
            message: 'Event already recorded (idempotent)',
            eventId: existing.id,
            duplicate: true,
          });
        }
      }

      const [inserted] = await db.insert(epochExternalEvents).values({
        tenantId,
        sourceSystem: 'time_clock',
        eventType,
        eventId,
        occurredAt: occurredAtDate,
        payload,
        schemaVersion,
        deduplicationKey,
      }).returning({ id: epochExternalEvents.id });

      console.log(`[TimeClock] Event recorded: ${eventType} (id: ${inserted.id}, tenant: ${tenantId})`);

      // Project to labor facts (async, non-blocking)
      projectToLaborFact(inserted.id, tenantId, eventType, occurredAtDate, payload);

      return res.status(202).json({
        status: 'accepted',
        message: 'Event recorded successfully',
        eventId: inserted.id,
      });
    } catch (error) {
      console.error('[TimeClock] Error processing event:', error);
      return res.status(500).json({
        error: 'Internal server error',
        details: 'Failed to process event',
      });
    }
  });

  app.post('/api/integrations/time-clock/keys', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
      const { tenantId, label } = req.body;

      if (!tenantId) {
        return res.status(400).json({ error: 'tenantId is required' });
      }

      const rawKey = crypto.randomBytes(32).toString('hex');
      const keyPrefix = rawKey.slice(0, 8);
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const username = (req as any).user?.username || 'system';

      const [created] = await db.insert(apiIntegrationKeys).values({
        tenantId,
        sourceSystem: 'time_clock',
        keyHash,
        keyPrefix,
        permissions: ['emit:labor_events'],
        label: label || `Time Clock Integration - ${tenantId}`,
        createdBy: username,
      }).returning();

      console.log(`[TimeClock] Created API key for tenant: ${tenantId} (prefix: ${keyPrefix})`);

      return res.status(201).json({
        id: created.id,
        tenantId: created.tenantId,
        keyPrefix: created.keyPrefix,
        label: created.label,
        permissions: created.permissions,
        apiKey: rawKey,
        warning: 'Store this API key securely. It will not be shown again.',
      });
    } catch (error) {
      console.error('[TimeClock] Error creating API key:', error);
      return res.status(500).json({ error: 'Failed to create API key' });
    }
  });

  app.get('/api/integrations/time-clock/keys', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
      const keys = await db
        .select({
          id: apiIntegrationKeys.id,
          tenantId: apiIntegrationKeys.tenantId,
          keyPrefix: apiIntegrationKeys.keyPrefix,
          label: apiIntegrationKeys.label,
          permissions: apiIntegrationKeys.permissions,
          active: apiIntegrationKeys.active,
          createdAt: apiIntegrationKeys.createdAt,
          createdBy: apiIntegrationKeys.createdBy,
          lastUsedAt: apiIntegrationKeys.lastUsedAt,
          revokedAt: apiIntegrationKeys.revokedAt,
        })
        .from(apiIntegrationKeys)
        .where(eq(apiIntegrationKeys.sourceSystem, 'time_clock'));

      return res.json(keys);
    } catch (error) {
      console.error('[TimeClock] Error fetching API keys:', error);
      return res.status(500).json({ error: 'Failed to fetch API keys' });
    }
  });

  app.delete('/api/integrations/time-clock/keys/:id', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [updated] = await db
        .update(apiIntegrationKeys)
        .set({ revokedAt: new Date(), active: false })
        .where(eq(apiIntegrationKeys.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'API key not found' });
      }

      console.log(`[TimeClock] Revoked API key: ${id} (tenant: ${updated.tenantId})`);

      return res.json({ success: true, revokedAt: updated.revokedAt });
    } catch (error) {
      console.error('[TimeClock] Error revoking API key:', error);
      return res.status(500).json({ error: 'Failed to revoke API key' });
    }
  });

  // ============================================================
  // READ-ONLY LABOR FACTS QUERIES
  // These endpoints are for observability only - no mutations
  // ============================================================

  // Query labor facts by employee
  app.get('/api/labor-facts/by-employee/:employeeId', async (req: Request, res: Response) => {
    try {
      const { employeeId } = req.params;
      const { startDate, endDate, limit = String(DEFAULT_LABOR_FACTS_LIMIT) } = req.query;

      const parsedLimit = parseInt(String(limit), 10);
      const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LABOR_FACTS_LIMIT)
        : DEFAULT_LABOR_FACTS_LIMIT;

      let query = db
        .select()
        .from(epochLaborFacts)
        .where(eq(epochLaborFacts.employeeId, employeeId))
        .orderBy(desc(epochLaborFacts.occurredAt))
        .limit(effectiveLimit);

      const facts = await query;

      // Filter by date range in application if provided
      let filtered = facts;
      if (startDate) {
        const start = new Date(String(startDate));
        filtered = filtered.filter(f => f.occurredAt >= start);
      }
      if (endDate) {
        const end = new Date(String(endDate));
        filtered = filtered.filter(f => f.occurredAt <= end);
      }

      return res.json({
        employeeId,
        count: filtered.length,
        facts: filtered,
      });
    } catch (error) {
      console.error('[LaborFacts] Error querying by employee:', error);
      return res.status(500).json({ error: 'Failed to query labor facts' });
    }
  });

  // Query labor facts by date range
  app.get('/api/labor-facts/by-date', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, limit = String(DEFAULT_LABOR_FACTS_BY_RANGE_LIMIT) } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const start = new Date(String(startDate));
      const end = new Date(String(endDate));

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }

      const parsedLimit = parseInt(String(limit), 10);
      const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LABOR_FACTS_LIMIT)
        : DEFAULT_LABOR_FACTS_BY_RANGE_LIMIT;

      const facts = await db
        .select()
        .from(epochLaborFacts)
        .where(and(
          gte(epochLaborFacts.occurredAt, start),
          lte(epochLaborFacts.occurredAt, end)
        ))
        .orderBy(desc(epochLaborFacts.occurredAt))
        .limit(effectiveLimit);

      return res.json({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        count: facts.length,
        facts,
      });
    } catch (error) {
      console.error('[LaborFacts] Error querying by date:', error);
      return res.status(500).json({ error: 'Failed to query labor facts' });
    }
  });

  // Query labor facts by job/order ID
  app.get('/api/labor-facts/by-job/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const { limit = String(DEFAULT_LABOR_FACTS_LIMIT) } = req.query;

      const parsedLimit = parseInt(String(limit), 10);
      const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LABOR_FACTS_LIMIT)
        : DEFAULT_LABOR_FACTS_LIMIT;

      const facts = await db
        .select()
        .from(epochLaborFacts)
        .where(eq(epochLaborFacts.jobId, jobId))
        .orderBy(desc(epochLaborFacts.occurredAt))
        .limit(effectiveLimit);

      return res.json({
        jobId,
        count: facts.length,
        facts,
      });
    } catch (error) {
      console.error('[LaborFacts] Error querying by job:', error);
      return res.status(500).json({ error: 'Failed to query labor facts' });
    }
  });

  // Query labor facts by site
  app.get('/api/labor-facts/by-site/:siteId', async (req: Request, res: Response) => {
    try {
      const { siteId } = req.params;
      const { startDate, endDate, limit = String(DEFAULT_LABOR_FACTS_BY_RANGE_LIMIT) } = req.query;

      const parsedLimit = parseInt(String(limit), 10);
      const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LABOR_FACTS_LIMIT)
        : DEFAULT_LABOR_FACTS_BY_RANGE_LIMIT;

      let facts = await db
        .select()
        .from(epochLaborFacts)
        .where(eq(epochLaborFacts.siteId, siteId))
        .orderBy(desc(epochLaborFacts.occurredAt))
        .limit(effectiveLimit);

      // Filter by date range in application if provided
      if (startDate) {
        const start = new Date(String(startDate));
        facts = facts.filter(f => f.occurredAt >= start);
      }
      if (endDate) {
        const end = new Date(String(endDate));
        facts = facts.filter(f => f.occurredAt <= end);
      }

      return res.json({
        siteId,
        count: facts.length,
        facts,
      });
    } catch (error) {
      console.error('[LaborFacts] Error querying by site:', error);
      return res.status(500).json({ error: 'Failed to query labor facts' });
    }
  });

  // Get labor fact summary (who worked, when, for how long)
  app.get('/api/labor-facts/summary', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const start = new Date(String(startDate));
      const end = new Date(String(endDate));

      // Get all facts in date range
      const facts = await db
        .select()
        .from(epochLaborFacts)
        .where(and(
          gte(epochLaborFacts.occurredAt, start),
          lte(epochLaborFacts.occurredAt, end)
        ))
        .orderBy(epochLaborFacts.employeeId, epochLaborFacts.occurredAt);

      // Group by employee - read-only observation, no calculations
      const byEmployee = new Map<string, {
        employeeId: string;
        displayName: string | null;
        eventCount: number;
        firstEvent: Date;
        lastEvent: Date;
        eventTypes: string[];
      }>();

      for (const fact of facts) {
        const existing = byEmployee.get(fact.employeeId);
        if (!existing) {
          byEmployee.set(fact.employeeId, {
            employeeId: fact.employeeId,
            displayName: fact.employeeDisplayName,
            eventCount: 1,
            firstEvent: fact.occurredAt,
            lastEvent: fact.occurredAt,
            eventTypes: [fact.eventType],
          });
        } else {
          existing.eventCount++;
          if (fact.occurredAt < existing.firstEvent) existing.firstEvent = fact.occurredAt;
          if (fact.occurredAt > existing.lastEvent) existing.lastEvent = fact.occurredAt;
          if (!existing.eventTypes.includes(fact.eventType)) {
            existing.eventTypes.push(fact.eventType);
          }
        }
      }

      return res.json({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        totalEvents: facts.length,
        uniqueEmployees: byEmployee.size,
        employees: Array.from(byEmployee.values()),
      });
    } catch (error) {
      console.error('[LaborFacts] Error generating summary:', error);
      return res.status(500).json({ error: 'Failed to generate summary' });
    }
  });

  // ============================================================
  // CONNECTOR HEALTH (QUIET OBSERVABILITY)
  // Read-only health status - no alerts, no dashboards
  // ============================================================

  // Get health for a specific connector
  app.get('/api/connector-health/:tenantId/:sourceSystem', async (req: Request, res: Response) => {
    try {
      const { tenantId, sourceSystem } = req.params;
      const health = await getConnectorHealth(tenantId, sourceSystem);
      
      if (!health) {
        return res.status(404).json({ 
          error: 'No health data found',
          tenantId,
          sourceSystem,
        });
      }
      
      return res.json(health);
    } catch (error) {
      console.error('[ConnectorHealth] Error fetching health:', error);
      return res.status(500).json({ error: 'Failed to fetch connector health' });
    }
  });

  // List all connector health for a tenant
  app.get('/api/connector-health/:tenantId', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const connectors = await listConnectorHealthByTenant(tenantId);
      
      return res.json({
        tenantId,
        count: connectors.length,
        connectors,
      });
    } catch (error) {
      console.error('[ConnectorHealth] Error listing health:', error);
      return res.status(500).json({ error: 'Failed to list connector health' });
    }
  });

  // Get health history for a connector
  app.get('/api/connector-health/:tenantId/:sourceSystem/history', async (req: Request, res: Response) => {
    try {
      const { tenantId, sourceSystem } = req.params;
      const { limit = String(DEFAULT_CONNECTOR_HEALTH_HISTORY_LIMIT) } = req.query;

      const parsedLimit = parseInt(String(limit), 10);
      const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_CONNECTOR_HEALTH_HISTORY_LIMIT)
        : DEFAULT_CONNECTOR_HEALTH_HISTORY_LIMIT;
      
      const history = await getConnectorHealthHistory(
        tenantId, 
        sourceSystem, 
        effectiveLimit
      );
      
      return res.json({
        tenantId,
        sourceSystem,
        count: history.length,
        history,
      });
    } catch (error) {
      console.error('[ConnectorHealth] Error fetching history:', error);
      return res.status(500).json({ error: 'Failed to fetch health history' });
    }
  });

  // ============================================================
  // BARCODE-DRIVEN TIME CHARGING — TRAVELER SCAN ENDPOINTS
  // ============================================================

  app.post('/api/time-clock/scan/traveler', async (req: Request, res: Response) => {
    try {
      const { scanValue, employeeId } = req.body;

      if (!scanValue || typeof scanValue !== 'string' || !scanValue.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'scanValue is required and must be a non-empty string',
        });
      }

      if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'employeeId is required and must be a non-empty string',
        });
      }

      const result = await resolveTravelerBarcode(scanValue);

      if (!result.ok) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(statusCode).json({
          error: result.error.code,
          message: result.error.message,
        });
      }

      return res.json({ chargeContext: result.context });
    } catch (error) {
      console.error('[TimeClock] Error scanning traveler barcode:', error);
      return res.status(500).json({ error: 'Internal server error', details: 'Failed to resolve traveler barcode' });
    }
  });

  app.post('/api/time-clock/clock-in/traveler', optionalAuth, async (req: Request, res: Response) => {
    try {
      const { scanValue, employeeId, laborApprovalId } = req.body;

      if (!scanValue || typeof scanValue !== 'string' || !scanValue.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'scanValue is required and must be a non-empty string',
        });
      }

      if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'employeeId is required and must be a non-empty string',
        });
      }

      const parsedApprovalId: number | null =
        laborApprovalId != null && !isNaN(parseInt(String(laborApprovalId), 10))
          ? parseInt(String(laborApprovalId), 10)
          : null;

      const result = await resolveTravelerBarcode(scanValue);

      if (!result.ok) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(statusCode).json({
          error: result.error.code,
          message: result.error.message,
        });
      }

      const { context } = result;

      const autoPunch = await executeTravelerAutoPunch({
        context,
        employeeIdString: employeeId.trim(),
        parsedApprovalId,
        ptoOverride: {
          requested: req.body?.adminPtoOverride === true,
          reason:
            typeof req.body?.adminOverrideReason === 'string'
              ? req.body.adminOverrideReason.trim()
              : null,
          user: req.user ?? null,
          ip: req.ip ?? null,
        },
      });

      if (!autoPunch.ok) {
        return res.status(autoPunch.status).json(autoPunch.body);
      }

      if (autoPunch.action === 'switched') {
        return res.status(201).json({
          switched: true,
          closed: autoPunch.closedEntry ?? null,
          created: autoPunch.entry,
          entry: autoPunch.entry,
          chargeContext: autoPunch.chargeContext,
          warning: autoPunch.warning,
          laborStatus: autoPunch.laborStatus,
        });
      }

      const clockInResponseBody: Record<string, unknown> = {
        entry: autoPunch.entry,
        chargeContext: autoPunch.chargeContext,
      };
      if (autoPunch.warning != null) clockInResponseBody.warning = autoPunch.warning;
      if (autoPunch.laborStatus != null) clockInResponseBody.laborStatus = autoPunch.laborStatus;
      if (autoPunch.budgetOverrideId != null) clockInResponseBody.budgetOverrideId = autoPunch.budgetOverrideId;
      if (autoPunch.warnedOnOverrun) {
        clockInResponseBody.warnedOnOverrun = true;
        clockInResponseBody.overrunReason = autoPunch.overrunReason ?? null;
      }
      return res.status(201).json(clockInResponseBody);
    } catch (error) {
      console.error('[TimeClock] Error clocking in via traveler barcode:', error);
      return res.status(500).json({ error: 'Internal server error', details: 'Failed to clock in via traveler barcode' });
    }
  });

  app.post('/api/time-clock/switch-job/traveler', async (req: Request, res: Response) => {
    try {
      const { scanValue, employeeId, laborApprovalId } = req.body;

      if (!scanValue || typeof scanValue !== 'string' || !scanValue.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'scanValue is required and must be a non-empty string',
        });
      }

      if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: 'employeeId is required and must be a non-empty string',
        });
      }

      const parsedApprovalId: number | null =
        laborApprovalId != null && !isNaN(parseInt(String(laborApprovalId), 10))
          ? parseInt(String(laborApprovalId), 10)
          : null;

      const result = await resolveTravelerBarcode(scanValue);

      if (!result.ok) {
        const statusCode = result.error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(statusCode).json({
          error: result.error.code,
          message: result.error.message,
        });
      }

      const { context } = result;

      // Traveler entry gates — enforce WAD release, material readiness, and training before job-switch.
      // Phase 1 WARN: cert failures allowed through (isCertWarn); only hard gates block.
      const { gateError: switchGateError } = await evaluateTravelerClockInGates(context.travelerId, context.wadId, employeeId.trim());
      if (switchGateError) {
        return res.status(403).json(switchGateError);
      }

      // Delegate to shared executeJobSwitch — validates charge code, enforces budget, writes audit events
      const switchResult = await executeJobSwitch({
        employeeId: employeeId.trim(),
        context,
        parsedApprovalId,
      });
      if (!switchResult.ok) {
        return res.status(switchResult.status).json(switchResult.body);
      }

      return res.status(201).json(switchResult.result);
    } catch (error) {
      console.error('[TimeClock] Error switching job via traveler barcode:', error);
      return res.status(500).json({ error: 'Internal server error', details: 'Failed to switch job via traveler barcode' });
    }
  });

  // Start the quiet health evaluator
  startConnectorHealthEvaluator();
}
