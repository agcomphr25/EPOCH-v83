/**
 * resolveChargeCode — WAD-based charge code resolver (Task #1235)
 *
 * Resolves the correct charge code for a traveler-driven labor session.
 * projectId is always derived server-side; never accepted from client input.
 *
 * Resolution priority (deterministic, WAD-scoped — no silent defaults):
 *   1. WAD's defaultChargeCodeId (WAD-level, most authoritative)
 *   2. Traveler's defaultChargeCodeId (traveler-level, WAD-scoped)
 *   3. Active charge code whose `department` matches the step department (dept-level fallback)
 *   4. Error — never silently default to an arbitrary charge code
 */

import { db } from '../../db';
import {
  productionWorkOrders,
  chargeCodes,
  travelers,
  trainingCertifications,
  travelerSteps,
  routingOperations,
} from '../../schema';
import { eq, and, sql } from 'drizzle-orm';
import { storage } from '../../storage';

export type CertificationStatus = 'VALID' | 'EXPIRED' | 'MISSING';

export interface ResolvedChargeCode {
  chargeCodeId: number;
  chargeCode: string;
  resolvedFrom: 'wad_default' | 'traveler_default' | 'wad_department' | 'department_match' | 'wad_wizard';
}

export interface ResolveChargeCodeError {
  error: string;
  resolvedFrom: 'none';
}

export type ResolveChargeCodeResult = ResolvedChargeCode | ResolveChargeCodeError;

type WadWizardChargeCodeRow = {
  department?: unknown;
  operation?: unknown;
  chargeCode?: unknown;
  classification?: unknown;
};

const WAD_DEPARTMENT_LABELS: Record<string, string> = {
  CUTTING_KITTING: 'Cutting / Kitting',
  LAYUP: 'Layup',
  CURE: 'Cure',
  CNC: 'CNC',
  SUB_ASSEMBLY: 'Sub Assembly',
  ASSEMBLY: 'Assembly',
  FINISH: 'Finish',
  PAINT: 'Paint',
  QC: 'Quality Control',
  SHIPPING: 'Shipping',
};

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function isQcDepartment(value: unknown): boolean {
  const normalized = normalizeToken(value);
  return normalized === 'qc' || normalized === 'qualitycontrol' || normalized === 'finalqc';
}

function getWizardChargeCodeRows(wizardData: unknown): WadWizardChargeCodeRow[] {
  if (!wizardData || typeof wizardData !== 'object') return [];
  const step4 = (wizardData as { step4?: unknown }).step4;
  if (!step4 || typeof step4 !== 'object') return [];
  const chargeCodes = (step4 as { chargeCodes?: unknown }).chargeCodes;
  if (!Array.isArray(chargeCodes)) return [];
  return chargeCodes.filter((row): row is WadWizardChargeCodeRow => !!row && typeof row === 'object');
}

export function pickWizardChargeCode(
  wizardData: unknown,
  department: string | null,
  operation: string | null = null,
): string | null {
  const rows = getWizardChargeCodeRows(wizardData)
    .map((row) => ({
      row,
      code: typeof row.chargeCode === 'string' ? row.chargeCode.trim() : '',
      departmentKey: normalizeToken(row.department),
      departmentLabel: normalizeToken(WAD_DEPARTMENT_LABELS[String(row.department ?? '')]),
      operation: normalizeToken(row.operation),
    }))
    .filter((row) => row.code.length > 0);

  if (rows.length === 0) return null;

  const targetDepartment = normalizeToken(department);
  const targetOperation = normalizeToken(operation);

  const exactDepartmentMatch = rows.find(
    (row) => targetDepartment && (row.departmentKey === targetDepartment || row.departmentLabel === targetDepartment),
  );
  if (exactDepartmentMatch) return exactDepartmentMatch.code;

  const exactOperationMatch = rows.find((row) => targetOperation && row.operation === targetOperation);
  if (exactOperationMatch) return exactOperationMatch.code;

  const nonQcRows = rows.filter((row) => !isQcDepartment(row.row.department));
  if (!isQcDepartment(department) && nonQcRows.length === 1) {
    return nonQcRows[0].code;
  }

  return null;
}

const DEPARTMENT_ALIASES: Record<string, string[]> = {
  QC: ['QC', 'Quality Control'],
  QUALITYCONTROL: ['Quality Control', 'QC'],
  FINALQC: ['Final QC', 'QC', 'Quality Control'],
};

function departmentKey(department: string): string {
  return department.trim().replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function sqlList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

export function getDepartmentChargeCodeCandidates(department: string | null | undefined): string[] {
  if (!department) return [];

  const trimmed = department.trim();
  if (!trimmed) return [];

  const aliases = DEPARTMENT_ALIASES[departmentKey(trimmed)] ?? [];
  return Array.from(new Set([trimmed, ...aliases]));
}

export function getDepartmentChargeCodeCandidateKeys(department: string | null | undefined): string[] {
  return Array.from(new Set(getDepartmentChargeCodeCandidates(department).map(departmentKey)));
}

interface WadChargeCodeRow {
  department?: unknown;
  chargeCode?: unknown;
}

export function findWadDepartmentChargeCode(
  wizardData: unknown,
  department: string | null | undefined
): string | null {
  const departmentCandidates = getDepartmentChargeCodeCandidates(department).map(departmentKey);
  if (departmentCandidates.length === 0 || !wizardData || typeof wizardData !== 'object') return null;

  const step4 = (wizardData as { step4?: unknown }).step4;
  if (!step4 || typeof step4 !== 'object') return null;

  const rows = (step4 as { chargeCodes?: unknown }).chargeCodes;
  if (!Array.isArray(rows)) return null;

  for (const row of rows as WadChargeCodeRow[]) {
    const rowDepartment = typeof row.department === 'string' ? row.department.trim() : '';
    const rowChargeCode = typeof row.chargeCode === 'string' ? row.chargeCode.trim() : '';
    if (!rowDepartment || !rowChargeCode) continue;
    if (departmentCandidates.includes(departmentKey(rowDepartment))) {
      return rowChargeCode;
    }
  }

  return null;
}

/**
 * Resolve a charge code for a traveler-driven labor session.
 *
 * Resolution is deterministic and WAD-context-driven:
 *   1. WAD's defaultChargeCodeId — explicit WAD-level assignment (most authoritative)
 *   2. Traveler's defaultChargeCodeId — explicit traveler-level assignment (WAD-scoped)
 *   3. Active charge code whose `department` matches the routing operation's departmentName —
 *      the department is resolved from the travelerStepId → routing operation when available,
 *      so the match is operation-scoped.  charge_codes has no projectId column but the
 *      operation-derived department keeps the match contextually WAD-scoped.  Fallback of last resort.
 *   4. Error — fail-closed; callers must check for 'error' in result when WAD is linked.
 *
 * Charge code override: auto-resolution is the only valid path; any manual charge-code
 * override for a traveler session requires supervisor authorization via the laborApprovalId
 * path and is enforced by the caller (not inside this utility).
 *
 * @param productionWorkOrderId  UUID of the WAD (production_work_orders row)
 * @param travelerId             Optional traveler UUID for traveler-level fallback
 * @param travelerStepId         Optional traveler step UUID; used to resolve the routing
 *                               operation's departmentName for operation-scoped dept fallback
 * @param department             Fallback department string if travelerStepId is absent
 */
export async function resolveChargeCode(params: {
  productionWorkOrderId: string | null;
  travelerId?: string | null;
  travelerStepId?: string | null;
  department: string | null;
}): Promise<ResolveChargeCodeResult> {
  const { productionWorkOrderId, travelerId, travelerStepId, department } = params;

  // Resolve the effective department: prefer routing operation's departmentName
  // (operation-level, derived via travelerStepId → routing operation) over the
  // caller-supplied department string.
  let effectiveDepartment = department;
  let effectiveOperation: string | null = null;
  if (travelerStepId) {
    try {
      const [step] = await db
        .select({
          stepNumber: travelerSteps.stepNumber,
          travelerId: travelerSteps.travelerId,
          departmentName: travelerSteps.departmentName,
        })
        .from(travelerSteps)
        .where(eq(travelerSteps.id, travelerStepId))
        .limit(1);

      if (step) {
        // Try to find the routing operation for this step to get its canonical departmentName
        const [traveler] = await db
          .select({ partRoutingId: travelers.partRoutingId })
          .from(travelers)
          .where(eq(travelers.id, step.travelerId))
          .limit(1);

        if (traveler?.partRoutingId) {
          const [routingOp] = await db
            .select({
              departmentName: routingOperations.departmentName,
              operationName: routingOperations.operationName,
            })
            .from(routingOperations)
            .where(
              and(
                eq(routingOperations.partRoutingId, traveler.partRoutingId),
                eq(routingOperations.stepNumber, step.stepNumber)
              )
            )
            .limit(1);

          if (routingOp?.departmentName) {
            effectiveDepartment = routingOp.departmentName;
          }
          if (routingOp?.operationName) {
            effectiveOperation = routingOp.operationName;
          }
        }
        // Use the step's own departmentName if routing op not found
        if (!effectiveDepartment && step.departmentName) {
          effectiveDepartment = step.departmentName;
        }
      }
    } catch {
      // Non-fatal: fall through to caller-supplied department
    }
  }

  if (!productionWorkOrderId) {
    return { error: 'No production work order linked to this traveler. A WAD is required to resolve a charge code.', resolvedFrom: 'none' };
  }

  const [wad] = await db
    .select({
      defaultChargeCodeId: productionWorkOrders.defaultChargeCodeId,
      wizardData: productionWorkOrders.wizardData,
    })
    .from(productionWorkOrders)
    .where(eq(productionWorkOrders.id, productionWorkOrderId))
    .limit(1);

  if (!wad) {
    return { error: `Production work order '${productionWorkOrderId}' not found.`, resolvedFrom: 'none' };
  }

  // Priority 1: WAD's defaultChargeCodeId
  if (wad.defaultChargeCodeId != null) {
    const [cc] = await db
      .select({ id: chargeCodes.id, code: chargeCodes.code })
      .from(chargeCodes)
      .where(and(eq(chargeCodes.id, wad.defaultChargeCodeId), eq(chargeCodes.active, true)))
      .limit(1);

    if (cc) {
      return { chargeCodeId: cc.id, chargeCode: cc.code, resolvedFrom: 'wad_default' };
    }
    // WAD's default charge code is inactive — fall through to traveler-level
  }

  // Priority 2: Traveler's defaultChargeCodeId (traveler-level, WAD-scoped)
  if (travelerId) {
    const [traveler] = await db
      .select({ defaultChargeCodeId: travelers.defaultChargeCodeId })
      .from(travelers)
      .where(eq(travelers.id, travelerId))
      .limit(1);

    if (traveler?.defaultChargeCodeId != null) {
      const [cc] = await db
        .select({ id: chargeCodes.id, code: chargeCodes.code })
        .from(chargeCodes)
        .where(and(eq(chargeCodes.id, traveler.defaultChargeCodeId), eq(chargeCodes.active, true)))
        .limit(1);

      if (cc) {
        return { chargeCodeId: cc.id, chargeCode: cc.code, resolvedFrom: 'traveler_default' };
      }
    }
  }

  // Priority 3: WAD-authored Step 4 charge-code row for this department.
  // This is the direct WAD source of truth when the routing says "Quality Control"
  // and the WAD row carries the active code "QC".
  const wadDepartmentChargeCode = findWadDepartmentChargeCode(wad.wizardData, effectiveDepartment);
  if (wadDepartmentChargeCode) {
    const wadChargeCodeKeys = getDepartmentChargeCodeCandidateKeys(wadDepartmentChargeCode);
    const [cc] = await db
      .select({ id: chargeCodes.id, code: chargeCodes.code })
      .from(chargeCodes)
      .where(and(
        sql`upper(regexp_replace(coalesce(${chargeCodes.code}, ''), '[^a-zA-Z0-9]', '', 'g')) in (${sqlList(wadChargeCodeKeys)})`,
        eq(chargeCodes.active, true)
      ))
      .orderBy(sql`case when upper(regexp_replace(coalesce(${chargeCodes.code}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${departmentKey(wadDepartmentChargeCode)} then 0 else 1 end`)
      .limit(1);

    if (cc) {
      return { chargeCodeId: cc.id, chargeCode: cc.code, resolvedFrom: 'wad_department' };
    }
  }

  // Priority 4: Active charge code whose department matches the routing operation's
  // departmentName (operation-scoped via effectiveDepartment resolved from travelerStepId,
  // or caller-supplied department as fallback).
  const departmentCandidates = getDepartmentChargeCodeCandidates(effectiveDepartment);
  const departmentCandidateKeys = getDepartmentChargeCodeCandidateKeys(effectiveDepartment);
  if (departmentCandidateKeys.length > 0) {
    const [deptCc] = await db
      .select({ id: chargeCodes.id, code: chargeCodes.code })
      .from(chargeCodes)
      .where(and(
        sql`upper(regexp_replace(coalesce(${chargeCodes.department}, ''), '[^a-zA-Z0-9]', '', 'g')) in (${sqlList(departmentCandidateKeys)})`,
        eq(chargeCodes.active, true)
      ))
      .orderBy(sql`case when upper(regexp_replace(coalesce(${chargeCodes.department}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${departmentKey(departmentCandidates[0])} then 0 else 1 end`)
      .limit(1);

    if (deptCc) {
      return { chargeCodeId: deptCc.id, chargeCode: deptCc.code, resolvedFrom: 'department_match' };
    }

    const [codeCc] = await db
      .select({ id: chargeCodes.id, code: chargeCodes.code })
      .from(chargeCodes)
      .where(and(
        sql`upper(regexp_replace(coalesce(${chargeCodes.code}, ''), '[^a-zA-Z0-9]', '', 'g')) in (${sqlList(departmentCandidateKeys)})`,
        eq(chargeCodes.active, true)
      ))
      .orderBy(sql`case when upper(regexp_replace(coalesce(${chargeCodes.code}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${departmentKey(departmentCandidates[0])} then 0 else 1 end`)
      .limit(1);

    if (codeCc) {
      return { chargeCodeId: codeCc.id, chargeCode: codeCc.code, resolvedFrom: 'department_match' };
    }
  }

  // Priority 4: WAD wizard Step 4 charge code rows. The wizard stores these in
  // wizardData; older WADs may be fully approved without default_charge_code_id.
  const wizardChargeCode = pickWizardChargeCode(wad.wizardData, effectiveDepartment, effectiveOperation);
  if (wizardChargeCode) {
    const [wizardCc] = await db
      .select({ id: chargeCodes.id, code: chargeCodes.code })
      .from(chargeCodes)
      .where(and(eq(chargeCodes.code, wizardChargeCode), eq(chargeCodes.active, true)))
      .limit(1);

    if (wizardCc) {
      return { chargeCodeId: wizardCc.id, chargeCode: wizardCc.code, resolvedFrom: 'wad_wizard' };
    }
  }

  return {
    error: `No charge code resolved for WAD '${productionWorkOrderId}'. Set a default charge code on the production work order or the traveler, create an active charge code for department '${effectiveDepartment ?? department ?? 'unknown'}', or assign a matching active charge code in WAD Step 4.`,
    resolvedFrom: 'none',
  };
}

/**
 * Derive projectId from a production work order.
 * projectId must always be derived server-side — never trusted from client.
 */
export async function deriveProjectId(productionWorkOrderId: string | null): Promise<string | null> {
  if (!productionWorkOrderId) return null;
  const [wad] = await db
    .select({ projectId: productionWorkOrders.projectId })
    .from(productionWorkOrders)
    .where(eq(productionWorkOrders.id, productionWorkOrderId))
    .limit(1);
  return wad?.projectId ?? null;
}

/**
 * Resolve certification status for an employee/step combination.
 *
 * Rules (phase 1):
 *   - No cert requirement on this step → VALID
 *   - Employee holds a valid, non-expired cert for the requirement → VALID
 *   - Employee has a cert record but it is expired → EXPIRED
 *   - No cert record found at all → MISSING
 *
 * @param travelerId   UUID of the traveler
 * @param stepId       UUID of the step being started
 * @param employeeId   Integer PK from public.employees
 */
export async function resolveCertificationStatus(params: {
  travelerId: string;
  stepId: string;
  employeeId: number | null;
}): Promise<{ status: CertificationStatus; certificationName: string | null; reason: string | null }> {
  const { travelerId, stepId, employeeId } = params;

  if (!employeeId) {
    return { status: 'MISSING', certificationName: null, reason: 'Employee identity not resolved — cannot verify certification.' };
  }

  const traveler = await storage.getTraveler(travelerId);
  const step = await storage.getTravelerStep(stepId);

  if (!traveler || !step) {
    return { status: 'MISSING', certificationName: null, reason: 'Traveler or step not found.' };
  }

  // Resolve the routing operation's certificationId for this step
  let certificationId: number | null = null;
  if (traveler.partRoutingId) {
    const routingOp = await storage.getRoutingOperationForTravelerStep(
      traveler.partRoutingId,
      step.stepNumber
    );
    if (routingOp?.certificationId) {
      certificationId = routingOp.certificationId;
    }
  }

  // No cert requirement for this step → treat as VALID for phase 1
  if (certificationId === null) {
    return { status: 'VALID', certificationName: null, reason: null };
  }

  const cert = await storage.getCertificationById(certificationId);
  const certName = cert?.name ?? `Certification #${certificationId}`;

  // Check for a valid (active + non-expired) cert
  const hasValidCert = await storage.checkEmployeeHasValidTrainingCertificationForCert(
    employeeId,
    certificationId
  );

  if (hasValidCert) {
    return { status: 'VALID', certificationName: certName, reason: null };
  }

  // Check if there is an expired cert record (exists but past expiresAt)
  const [expiredRow] = await db
    .select({ id: trainingCertifications.id, expiresAt: trainingCertifications.expiresAt })
    .from(trainingCertifications)
    .where(
      and(
        eq(trainingCertifications.traineeId, employeeId),
        eq(trainingCertifications.certificationId, certificationId)
      )
    )
    .limit(1);

  if (expiredRow) {
    return {
      status: 'EXPIRED',
      certificationName: certName,
      reason: `Certification '${certName}' is expired or no longer valid. Renewal required before this step can be considered compliant.`,
    };
  }

  return {
    status: 'MISSING',
    certificationName: certName,
    reason: `No certification record found for '${certName}'. Employee must complete the certification program before this step can be considered compliant.`,
  };
}

/**
 * Compute budget overrun state for a labor session at session/step start.
 * Returns isOverrun + overrunReason + nearlyExhausted based on WAD budget consumption.
 *
 * Phase 1 WARN policy: BLOCKED status does NOT block session creation.
 * It is recorded and flagged for supervisor review.
 */
export async function resolveBudgetOverrunState(params: {
  productionWorkOrderId: string | null;
  department: string | null;
}): Promise<{ isOverrun: boolean; nearlyExhausted: boolean; overrunReason: string | null; percentUsed: number | null }> {
  const { productionWorkOrderId, department } = params;

  if (!productionWorkOrderId) {
    return { isOverrun: false, nearlyExhausted: false, overrunReason: null, percentUsed: null };
  }

  const { evaluateWorkOrderLaborStatus } = await import('../helpers/laborBudgetHelper');
  const laborStatus = await evaluateWorkOrderLaborStatus(productionWorkOrderId, department);

  const scope = laborStatus.departmentPercentUsed != null && laborStatus.departmentBudget != null
    ? `${laborStatus.departmentPercentUsed}% of ${department} department budget consumed`
    : laborStatus.percentUsed != null
      ? `${laborStatus.percentUsed}% of total budget consumed`
      : 'budget data unavailable';

  if (laborStatus.status === 'BLOCKED') {
    return {
      isOverrun: true,
      nearlyExhausted: false,
      overrunReason: `Labor budget exhausted (${scope}). Session recorded under WARN policy — supervisor approval required.`,
      percentUsed: laborStatus.departmentPercentUsed ?? laborStatus.percentUsed ?? null,
    };
  }

  if (laborStatus.status === 'WARNING') {
    return {
      isOverrun: false,
      nearlyExhausted: true,
      overrunReason: `Approaching budget limit (${scope}).`,
      percentUsed: laborStatus.departmentPercentUsed ?? laborStatus.percentUsed ?? null,
    };
  }

  return {
    isOverrun: false,
    nearlyExhausted: false,
    overrunReason: null,
    percentUsed: laborStatus.departmentPercentUsed ?? laborStatus.percentUsed ?? null,
  };
}
