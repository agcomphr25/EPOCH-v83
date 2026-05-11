import { db } from '../../db';
import { travelers, travelerSteps, travelerTasks, productionWorkOrders } from '../../schema';
import { eq, asc } from 'drizzle-orm';

export interface ChargeContext {
  travelerId: string;
  travelerNumber: string;
  wadId: string;
  wadNumber: string;
  projectId: string;
  chargeCode: string;
  department: string | null;
  operation: string | null;
}

export interface ResolveError {
  code: 'NOT_FOUND' | 'MALFORMED' | 'NO_WAD_LINK';
  message: string;
}

export type ResolveResult =
  | { ok: true; context: ChargeContext }
  | { ok: false; error: ResolveError };

// Traveler barcodes/numbers must be 2–100 printable ASCII characters.
// Control characters or excessively long strings are considered malformed.
const VALID_BARCODE_RE = /^[\x20-\x7E]{2,100}$/;

// UUID v4 pattern — barcodes that encode the traveler's internal ID
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateScanValue(value: string): { valid: boolean; normalized: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, normalized: '' };
  }
  if (!VALID_BARCODE_RE.test(trimmed)) {
    return { valid: false, normalized: trimmed };
  }
  return { valid: true, normalized: trimmed };
}

function deriveChargeCode(workOrderNumber: string): string {
  return workOrderNumber.trim().toUpperCase();
}

async function lookupTraveler(normalized: string) {
  // Primary lookup: by traveler number (the canonical barcode payload)
  const [byNumber] = await db
    .select()
    .from(travelers)
    .where(eq(travelers.travelerNumber, normalized))
    .limit(1);
  if (byNumber) return byNumber;

  // Secondary lookup: if the scan value is a UUID, try matching by traveler ID
  // (supports barcodes that encode the traveler's internal UUID)
  if (UUID_RE.test(normalized)) {
    const [byId] = await db
      .select()
      .from(travelers)
      .where(eq(travelers.id, normalized))
      .limit(1);
    if (byId) return byId;
  }

  return undefined;
}

/**
 * Build a ChargeContext from a fully-loaded traveler row.
 * Loads the linked WAD, the active traveler step, and active task to derive
 * department / operation. Used by both `resolveTravelerBarcode` (barcode scan path)
 * and `resolveTravelerById` (P2 Traveler auto-punch path — Task #188) so that
 * downstream gates and punch_ledger writes see identical context regardless of
 * how the traveler was located.
 */
export async function buildChargeContextFromTraveler(
  traveler: { id: string; travelerNumber: string; productionWorkOrderId: string | null },
): Promise<ResolveResult> {
  if (!traveler.productionWorkOrderId) {
    return {
      ok: false,
      error: {
        code: 'NO_WAD_LINK',
        message: `Traveler ${traveler.travelerNumber} is not linked to a Production Work Order`,
      },
    };
  }

  const [wad] = await db
    .select()
    .from(productionWorkOrders)
    .where(eq(productionWorkOrders.id, traveler.productionWorkOrderId))
    .limit(1);

  if (!wad) {
    return {
      ok: false,
      error: {
        code: 'NO_WAD_LINK',
        message: `Production Work Order ${traveler.productionWorkOrderId} not found for traveler ${traveler.travelerNumber}`,
      },
    };
  }

  const steps = await db
    .select()
    .from(travelerSteps)
    .where(eq(travelerSteps.travelerId, traveler.id))
    .orderBy(asc(travelerSteps.stepNumber));

  // Active step: prefer IN_PROGRESS, then first NOT_STARTED, then last step as fallback
  const activeStep =
    steps.find((s) => s.status === 'IN_PROGRESS') ||
    steps.find((s) => s.status === 'NOT_STARTED') ||
    (steps.length > 0 ? steps[steps.length - 1] : undefined);

  const department: string | null = activeStep?.departmentName ?? null;
  let operation: string | null = null;

  if (activeStep) {
    const tasks = await db
      .select()
      .from(travelerTasks)
      .where(eq(travelerTasks.travelerStepId, activeStep.id))
      .orderBy(asc(travelerTasks.sortOrder));

    const activeTask =
      tasks.find((t) => t.status === 'IN_PROGRESS') ||
      tasks.find((t) => t.status === 'NOT_STARTED');

    operation = activeTask?.title ?? null;
  }

  const chargeCode = deriveChargeCode(wad.workOrderNumber);

  return {
    ok: true,
    context: {
      travelerId: traveler.id,
      travelerNumber: traveler.travelerNumber,
      wadId: wad.id,
      wadNumber: wad.workOrderNumber,
      projectId: wad.projectId,
      chargeCode,
      department,
      operation,
    },
  };
}

/**
 * Resolve a traveler context directly from a traveler row id.
 * Used by the P2 Traveler auto-punch helper (Task #188) where the traveler is
 * located via the serialized item / part chain rather than a barcode scan.
 */
export async function resolveTravelerById(travelerId: string): Promise<ResolveResult> {
  if (!travelerId || typeof travelerId !== 'string' || !travelerId.trim()) {
    return {
      ok: false,
      error: { code: 'MALFORMED', message: 'Traveler id must not be empty' },
    };
  }
  const [traveler] = await db
    .select()
    .from(travelers)
    .where(eq(travelers.id, travelerId.trim()))
    .limit(1);
  if (!traveler) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `No traveler found for id: ${travelerId}` },
    };
  }
  return buildChargeContextFromTraveler(traveler);
}

export async function resolveTravelerBarcode(scanValue: string): Promise<ResolveResult> {
  const { valid, normalized } = validateScanValue(scanValue || '');

  if (!normalized) {
    return {
      ok: false,
      error: { code: 'MALFORMED', message: 'Scan value must not be empty' },
    };
  }

  if (!valid) {
    return {
      ok: false,
      error: {
        code: 'MALFORMED',
        message: `Scan value contains invalid characters or exceeds length limits: "${normalized.slice(0, 30)}"`,
      },
    };
  }

  const traveler = await lookupTraveler(normalized);

  if (!traveler) {
    return {
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: `No traveler found for scan value: ${normalized}`,
      },
    };
  }

  return buildChargeContextFromTraveler(traveler);
}
