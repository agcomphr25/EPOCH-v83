/**
 * MaterialIssueService — Phase 1 of Task #134.
 *
 * Single, authoritative entry point for every material reserve / issue /
 * consume / transfer-to-job / unreserve action in EPOCH. Routes, jobs, and
 * admin tools should call THIS service rather than touching
 * `inventory_balances`, `inventoryAllocationService`, or `inventoryEventService`
 * directly.
 *
 * Phase 1 responsibilities (this file):
 *   1. Run the gate chain via `materialIssueGates.ts`.
 *   2. Return a structured `MaterialIssueResult` so the UI can render
 *      per-gate blocker reasons (no generic "failed" toasts).
 *   3. On success, atomically mutate the underlying material-lot state
 *      AND write the immutable ledger row, in a single db.transaction.
 *      For consume / issue / transferToJob this means decrementing
 *      `materialLots.remainingQty`, inserting a `materialLotTransactions`
 *      ISSUE row, and writing the ledger entry. For reserve / unreserve
 *      it means inserting / cancelling a `materialLotReservations` row
 *      and writing a RESERVE / UNRESERVE ledger entry.
 *   4. The ledger row carries operator context (userId, displayName,
 *      badge, workstation, deviceIp, authMethod), traveler, traveler step,
 *      WAD (`production_work_order_id`), charge code, lot, and before/
 *      after qty so audit can reconstruct the chain.
 *
 * Phase 2 (NOT in this file yet):
 *   - `override` payload + `inventory_issue_approvals` table (override
 *     reason, approver identity, digital signature).
 *   - Operator authorization matrix (which roles may override which gate).
 *   - Reconciliation with `inventoryBalances` (the existing
 *     materialLots/consume route already updates that table; the Phase 2
 *     wiring task will move that logic here so this service becomes the
 *     single writer).
 *
 * Phase 3 (NOT in this file yet):
 *   - Traceability viewer; reads only — no new writers.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { storage } from '../../storage';
import {
  materialLotReservations,
  materialLotTransactions,
  materialLots,
} from '../../schema';
import {
  recordInventoryLedgerEntry,
  type InventoryLedgerTransactionType,
} from './inventoryTransactionLedgerService';
import {
  validateAllocation,
  validateLotStatus,
  validateOperatorAuthorization,
  validateRoutingStep,
  validateTravelerIssueEligibility,
  validateWadApproved,
  type MaterialIssueAction,
  type MaterialIssueBlocker,
} from './materialIssueGates';

const SOURCE_MODULE = 'material-issue-service';

/**
 * Caller-supplied operator + device context. Persisted on the ledger row
 * so audit can reconstruct *who* drew material, *where*, and on *what
 * device*. `displayName` is non-empty by contract — the operator gate
 * enforces this so the ledger's `performedByDisplayName NOT NULL` invariant
 * cannot be tripped after gates pass. `userId`, `badge`, `workstation`,
 * `deviceIp`, and `authMethod` are optional in Phase 1; the Phase 2
 * badge-auth work will tighten them.
 */
export interface MaterialIssueOperator {
  userId?: number | null;
  /** Human-readable identity stamped onto the ledger. Required and non-empty. */
  displayName: string;
  badge?: string | null;
  workstation?: string | null;
  deviceIp?: string | null;
  authMethod?: 'BADGE' | 'PIN' | 'SSO' | 'API' | null;
}

export interface MaterialIssueRequest {
  /** Which logical action is being performed; routes the gate chain and ledger txn type. */
  action: MaterialIssueAction;
  /** Material lot the operator is drawing from. */
  materialLotId: string;
  /** Quantity in the lot's unit-of-measure. Always positive; sign is set by the action. */
  quantity: number;
  /** Operator + device context. Required. */
  operator: MaterialIssueOperator;
  /** Traveler the work belongs to. Required for issue / consume / transferToJob / reserve. */
  travelerId?: string | null;
  /** Active routing step on that traveler. Required for issue / consume / transferToJob. */
  travelerStepId?: string | null;
  /** Production WAD the cost rolls up to. Required for issue / consume / transferToJob. */
  productionWorkOrderId?: string | null;
  /** Charge code the cost rolls up to (for ledger trace + GL). Optional. */
  chargeCodeId?: number | null;
  /** Free-text reason for the draw (e.g. WAD#, packet ID). */
  reasonCode?: string | null;
  notes?: string | null;
  /** Optional location override; defaults to lot's storage location. */
  locationId?: string | null;
  /** Required for `unreserve`: which `materialLotReservations.id` to cancel. */
  reservationId?: number | null;
}

export type MaterialIssueResult =
  | {
      ok: true;
      ledgerEntryId: string;
      transactionNumber: string;
      newRemainingQty: number;
      reservationId?: number | null;
    }
  | {
      ok: false;
      blockers: MaterialIssueBlocker[];
    };

/**
 * Thrown when a caller misuses the service (missing required arguments,
 * negative quantity, etc.). Distinct from gate failures, which return a
 * structured `{ ok: false, blockers }` result.
 */
export class MaterialIssueError extends Error {
  constructor(message: string) {
    super(`MaterialIssueService: ${message}`);
    this.name = 'MaterialIssueError';
  }
}

const ACTION_TO_LEDGER_TYPE: Record<MaterialIssueAction, InventoryLedgerTransactionType> = {
  reserve: 'RESERVE',
  issue: 'ISSUE',
  consume: 'CONSUME',
  transferToJob: 'TRANSFER',
  unreserve: 'UNRESERVE',
};

const ACTION_TO_LOT_TXN_TYPE: Record<MaterialIssueAction, string> = {
  reserve: 'RESERVE',
  issue: 'ISSUE',
  consume: 'ISSUE',
  transferToJob: 'ISSUE',
  unreserve: 'UNRESERVE',
};

/**
 * Run the full Phase 1 gate chain for the given request without performing
 * any state mutation. Useful for pre-flight validation in the UI layer
 * (e.g. "show the operator the blocker before they hit Confirm").
 *
 * Returns ALL applicable blockers, in gate order, so the UI can render
 * everything the operator needs to fix in one pass. Note: failures while
 * loading reservation data fail CLOSED — they surface as an
 * `ALLOCATION_EXCEEDED` blocker rather than silently allowing the draw.
 */
export async function validateIssueEligibility(
  req: MaterialIssueRequest,
): Promise<MaterialIssueBlocker[]> {
  const blockers: MaterialIssueBlocker[] = [];

  // Gate 6 (operator) runs first because it's pure and cheap; if there is
  // no operator identity, nothing else matters.
  const operatorBlocker = validateOperatorAuthorization(req.operator);
  if (operatorBlocker) blockers.push(operatorBlocker);

  if (!req.materialLotId) {
    throw new MaterialIssueError('materialLotId is required');
  }
  if (!Number.isFinite(req.quantity) || req.quantity <= 0) {
    blockers.push({
      code: 'INVALID_QUANTITY',
      message: `Requested quantity must be a positive number; received ${req.quantity}.`,
      blockingField: 'quantity',
    });
    return blockers;
  }

  const lot = await storage.getMaterialLot(req.materialLotId);
  const lotBlocker = validateLotStatus(lot, req.action);
  if (lotBlocker) blockers.push(lotBlocker);

  // For unreserve we only need lot + operator + reservationId; skip
  // traveler/WAD chain because cancelling a reservation does not roll up
  // to job cost.
  if (req.action === 'unreserve') {
    if (req.reservationId == null) {
      blockers.push({
        code: 'INVALID_QUANTITY',
        message: 'unreserve requires a reservationId to cancel.',
        blockingField: 'allocation',
      });
    }
    return blockers;
  }

  // Traveler + WAD + step are required for every other action.
  const traveler = req.travelerId ? await storage.getTraveler(req.travelerId) : null;
  const travelerBlocker = validateTravelerIssueEligibility(traveler);
  if (travelerBlocker) blockers.push(travelerBlocker);

  // Resolve WAD: explicit > traveler.productionWorkOrderId.
  const resolvedWadId =
    req.productionWorkOrderId ?? (traveler?.productionWorkOrderId ?? null);
  const workOrder = resolvedWadId ? await storage.getWorkOrderById(resolvedWadId) : null;
  const wadBlocker = validateWadApproved(workOrder);
  if (wadBlocker) blockers.push(wadBlocker);

  // Routing step is required for issue/consume/transferToJob; reserve is
  // intentionally allowed without a step because reservations are made at
  // production-planning time before any step is in progress.
  if (req.action !== 'reserve') {
    const step = req.travelerStepId ? await storage.getTravelerStep(req.travelerStepId) : null;
    const stepBlocker = validateRoutingStep(step, req.travelerId ?? null);
    if (stepBlocker) blockers.push(stepBlocker);
  }

  // Allocation gate: quantity available after subtracting OTHER travelers'
  // reservations. Failures while reading reservations are NOT silently
  // ignored — they surface as a structured blocker so allocation control
  // fails closed.
  if (lot) {
    const remainingQty = parseFloat(String(lot.remainingQty));
    let reservedByOthers = 0;
    let reservationLookupOk = true;
    try {
      const allRes = await storage.getLotReservations(lot.id);
      reservedByOthers = allRes
        .filter(
          (r) =>
            r.status === 'active' && (!req.travelerId || r.travelerId !== req.travelerId),
        )
        .reduce((s, r) => s + parseFloat(String(r.quantityReserved)), 0);
    } catch (err: any) {
      reservationLookupOk = false;
      blockers.push({
        code: 'ALLOCATION_EXCEEDED',
        message:
          'Could not verify outstanding reservations on this lot — refusing the draw to fail closed. ' +
          `(reason: ${err?.message ?? 'unknown'})`,
        blockingField: 'allocation',
      });
    }
    if (reservationLookupOk) {
      const allocBlocker = validateAllocation({
        requestedQty: req.quantity,
        remainingQty,
        reservedByOthers,
        unitOfMeasure: lot.unitOfMeasure,
      });
      if (allocBlocker) blockers.push(allocBlocker);
    }
  }

  return blockers;
}

/**
 * Execute a controlled material draw. This is the single function that
 * routes / jobs / admin tools should call.
 *
 * On any gate failure: returns `{ ok: false, blockers }` with NO state
 * mutation.
 *
 * On success: opens a single `db.transaction` that
 *   - for consume/issue/transferToJob: updates `materialLots.remainingQty`
 *     + status, inserts a `materialLotTransactions` ISSUE row, then
 *     writes the immutable inventory ledger entry.
 *   - for reserve: inserts a `materialLotReservations` row, then writes
 *     a RESERVE ledger entry.
 *   - for unreserve: cancels the supplied `materialLotReservations` row,
 *     then writes an UNRESERVE ledger entry.
 *
 * Either every write commits or none do; the ledger cannot diverge from
 * lot state.
 */
export async function executeMaterialIssue(
  req: MaterialIssueRequest,
): Promise<MaterialIssueResult> {
  const blockers = await validateIssueEligibility(req);
  if (blockers.length > 0) {
    return { ok: false, blockers };
  }

  const lot = await storage.getMaterialLot(req.materialLotId);
  if (!lot) {
    return {
      ok: false,
      blockers: [
        {
          code: 'LOT_NOT_FOUND',
          message: 'Material lot not found.',
          blockingField: 'lot',
        },
      ],
    };
  }

  const locationId = req.locationId ?? lot.storageLocation ?? 'WAREHOUSE-MAIN';
  let createdReservationId: number | null = null;

  // Resolve the WAD once: caller-supplied takes precedence; otherwise
  // fall back to the WAD attached to the traveler. This canonical value
  // is what we stamp on the ledger so a caller that omits explicit
  // productionWorkOrderId still produces a fully traceable ledger row.
  let resolvedWadId: string | null = req.productionWorkOrderId ?? null;
  if (!resolvedWadId && req.travelerId) {
    const traveler = await storage.getTraveler(req.travelerId);
    resolvedWadId = traveler?.productionWorkOrderId ?? null;
  }

  return db.transaction(async (tx) => {
    // Defaults are overwritten in every branch below; the locked-row read
    // is the source of truth for ledger before/after, NOT the preflight
    // snapshot, so a concurrent mutation between gate validation and
    // execution cannot trip `assertQuantityMath`.
    let quantityDelta = 0;
    let lockedQuantityBefore = parseFloat(String(lot.remainingQty));
    let lockedStatusBefore = lot.status;
    let quantityAfter = lockedQuantityBefore;
    let statusAfter = lot.status;

    if (
      req.action === 'consume' ||
      req.action === 'issue' ||
      req.action === 'transferToJob'
    ) {
      // Re-read the lot under FOR UPDATE so the transaction sees the
      // latest remainingQty and another concurrent draw cannot race past
      // the allocation check.
      const [locked] = await tx
        .select()
        .from(materialLots)
        .where(eq(materialLots.id, lot.id))
        .for('update');
      if (!locked) {
        throw new MaterialIssueError(
          `lot ${lot.id} disappeared between gate validation and execution`,
        );
      }
      lockedQuantityBefore = parseFloat(String(locked.remainingQty));
      lockedStatusBefore = locked.status;
      const lockedRemaining = lockedQuantityBefore;
      if (req.quantity > lockedRemaining) {
        // Race detected — abort the transaction with a structured blocker
        // rather than corrupt the lot.
        throw new MaterialIssueRaceError({
          code: 'LOT_INSUFFICIENT_QTY',
          message:
            `Lot has only ${lockedRemaining} ${locked.unitOfMeasure ?? 'EA'} ` +
            `remaining (changed since validation); ${req.quantity} requested.`,
          blockingField: 'quantity',
        });
      }

      quantityDelta = -req.quantity;
      quantityAfter = Math.max(0, lockedRemaining + quantityDelta);
      statusAfter = quantityAfter <= 0 ? 'CONSUMED' : lockedStatusBefore;

      await tx
        .update(materialLots)
        .set({
          remainingQty: quantityAfter.toString(),
          status: statusAfter,
          updatedAt: new Date(),
        })
        .where(eq(materialLots.id, lot.id));

      await tx.insert(materialLotTransactions).values({
        materialLotId: lot.id,
        internalControlNumber: lot.internalControlNumber,
        transactionType: ACTION_TO_LOT_TXN_TYPE[req.action],
        qtyBefore: lockedRemaining.toString(),
        qtyChange: quantityDelta.toString(),
        qtyAfter: quantityAfter.toString(),
        referenceType: 'TRAVELER',
        referenceId: req.travelerId ?? null,
        performedBy: req.operator.displayName,
        notes:
          req.notes ??
          `material-issue-service ${req.action} for traveler ${req.travelerId ?? 'n/a'}` +
            (req.travelerStepId ? ` step ${req.travelerStepId}` : ''),
        wasOverride: false,
      });
    } else if (req.action === 'reserve') {
      const [reservation] = await tx
        .insert(materialLotReservations)
        .values({
          materialLotId: lot.id,
          travelerId: req.travelerId ?? null,
          quantityReserved: req.quantity.toString(),
          unitOfMeasure: lot.unitOfMeasure,
          status: 'active',
          notes: req.notes ?? null,
          createdBy: req.operator.displayName,
        })
        .returning();
      createdReservationId = reservation.id;
      // Reservations don't change physical remaining qty.
    } else if (req.action === 'unreserve') {
      if (req.reservationId == null) {
        throw new MaterialIssueError('unreserve requires reservationId');
      }
      // Cancel ONLY when the reservation belongs to the supplied lot AND
      // is still active. Cancelling by id alone would let a caller
      // accidentally (or maliciously) cancel a reservation against a
      // different lot while writing a ledger row against the wrong context.
      const [cancelled] = await tx
        .update(materialLotReservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(materialLotReservations.id, req.reservationId),
            eq(materialLotReservations.materialLotId, lot.id),
            eq(materialLotReservations.status, 'active'),
          ),
        )
        .returning();
      if (!cancelled) {
        throw new MaterialIssueRaceError({
          code: 'ALLOCATION_EXCEEDED',
          message:
            `Reservation ${req.reservationId} not found, not on lot ${lot.id}, ` +
            'or already fulfilled / cancelled.',
          blockingField: 'allocation',
        });
      }
      createdReservationId = cancelled.id;
    }

    const ledgerEntry = await recordInventoryLedgerEntry(
      {
        transactionType: ACTION_TO_LEDGER_TYPE[req.action],
        inventoryItemId: lot.inventoryItemId,
        agPartNumber: lot.materialPartNumber,
        lotId: lot.id,
        locationId,
        quantityDelta,
        quantityBefore: lockedQuantityBefore,
        quantityAfter,
        unitOfMeasure: lot.unitOfMeasure,
        statusBefore: lockedStatusBefore,
        statusAfter,
        performedByUserId: req.operator.userId ?? null,
        performedByDisplayName: req.operator.displayName,
        productionWorkOrderId: resolvedWadId,
        travelerId: req.travelerId ?? null,
        travelerStepId: req.travelerStepId ?? null,
        chargeCodeId: req.chargeCodeId ?? null,
        reasonCode: req.reasonCode ?? `MATERIAL_${req.action.toUpperCase()}`,
        notes: req.notes ?? null,
        sourceModule: SOURCE_MODULE,
        sourceRecordId: req.materialLotId,
        metadata: {
          action: req.action,
          requestedQty: req.quantity,
          reservationId: createdReservationId,
          operator: {
            userId: req.operator.userId ?? null,
            displayName: req.operator.displayName,
            badge: req.operator.badge ?? null,
            workstation: req.operator.workstation ?? null,
            deviceIp: req.operator.deviceIp ?? null,
            authMethod: req.operator.authMethod ?? null,
          },
        },
      },
      tx,
    );

    return {
      ok: true as const,
      ledgerEntryId: ledgerEntry.id,
      transactionNumber: ledgerEntry.transactionNumber,
      newRemainingQty: quantityAfter,
      reservationId: createdReservationId,
    };
  }).catch((err: unknown) => {
    // Race-condition aborts inside the transaction surface as structured
    // blockers, not as 500s.
    if (err instanceof MaterialIssueRaceError) {
      return { ok: false as const, blockers: [err.blocker] };
    }
    throw err;
  });
}

/** Internal: lets us abort a transaction with a structured blocker. */
class MaterialIssueRaceError extends Error {
  blocker: MaterialIssueBlocker;
  constructor(blocker: MaterialIssueBlocker) {
    super(blocker.message);
    this.name = 'MaterialIssueRaceError';
    this.blocker = blocker;
  }
}

/**
 * Convenience wrappers — equivalent to calling `executeMaterialIssue`
 * with a fixed `action`. Provided so callers can write
 * `MaterialIssueService.consume({...})` instead of
 * `executeMaterialIssue({ action: 'consume', ... })`.
 */
export const MaterialIssueService = {
  reserve: (req: Omit<MaterialIssueRequest, 'action'>) =>
    executeMaterialIssue({ ...req, action: 'reserve' }),
  issue: (req: Omit<MaterialIssueRequest, 'action'>) =>
    executeMaterialIssue({ ...req, action: 'issue' }),
  consume: (req: Omit<MaterialIssueRequest, 'action'>) =>
    executeMaterialIssue({ ...req, action: 'consume' }),
  transferToJob: (req: Omit<MaterialIssueRequest, 'action'>) =>
    executeMaterialIssue({ ...req, action: 'transferToJob' }),
  unreserve: (req: Omit<MaterialIssueRequest, 'action'>) =>
    executeMaterialIssue({ ...req, action: 'unreserve' }),
  validate: validateIssueEligibility,
};
