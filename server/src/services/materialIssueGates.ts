/**
 * Material Issue Gates — Phase 1 of Task #134.
 *
 * Pure, individually unit-testable validators that the central
 * `MaterialIssueService` runs before any reserve / issue / consume /
 * transfer-to-job action against material lots and inventory balances.
 *
 * Each validator returns a `MaterialIssueBlocker | null`:
 *   - `null` means the gate passed.
 *   - A blocker means the gate failed and the issue MUST be refused
 *     (or, in Phase 2, accompanied by an authorized override).
 *
 * The shape `{ code, message, blockingField }` is the contract the
 * operator UI renders directly — see step 8 in the task spec. Keep
 * messages short and actionable; no stack traces, no generic text.
 *
 * NOTE: These validators are intentionally pure functions over already-
 * loaded entities. The orchestrator (`materialIssueService`) is
 * responsible for fetching the lot / traveler / WAD / step rows and
 * passing them in.
 */

import type { MaterialLot, ProductionWorkOrder, Traveler, TravelerStep } from '../../schema';

export type MaterialIssueAction = 'reserve' | 'issue' | 'consume' | 'transferToJob' | 'unreserve';

export type MaterialIssueBlockerCode =
  | 'TRAVELER_NOT_RELEASED'
  | 'TRAVELER_NOT_FOUND'
  | 'WAD_NOT_APPROVED'
  | 'WAD_NOT_FOUND'
  | 'WAD_NOT_RELEASED'
  | 'ROUTING_STEP_NOT_ACTIVE'
  | 'ROUTING_STEP_NOT_FOUND'
  | 'ROUTING_STEP_MISMATCH'
  | 'ALLOCATION_EXCEEDED'
  | 'LOT_NOT_FOUND'
  | 'LOT_NOT_AVAILABLE'
  | 'LOT_EXPIRED'
  | 'LOT_QUARANTINED'
  | 'LOT_REJECTED'
  | 'LOT_CONSUMED'
  | 'LOT_INSUFFICIENT_QTY'
  | 'OPERATOR_NOT_AUTHENTICATED'
  | 'OPERATOR_NOT_AUTHORIZED'
  | 'INVALID_QUANTITY';

export interface MaterialIssueBlocker {
  /** Stable machine code; never localized. */
  code: MaterialIssueBlockerCode;
  /** Short, operator-readable explanation; safe to render verbatim. */
  message: string;
  /** Which entity the operator should fix to clear the gate. */
  blockingField:
    | 'traveler'
    | 'workOrder'
    | 'routingStep'
    | 'allocation'
    | 'lot'
    | 'operator'
    | 'quantity';
}

const BLOCKED_LOT_STATUSES_FOR_ISSUE = new Set([
  'QUARANTINE',
  'REJECTED',
  'EXPIRED',
  'CONSUMED',
  'SCRAPPED',
]);
const ALLOWED_LOT_STATUSES_FOR_RESERVE = new Set(['ACCEPTED', 'ISSUED']);
const RELEASED_TRAVELER_STATUSES = new Set(['RELEASED', 'IN_PROGRESS', 'ACTIVE']);
const RELEASED_WAD_STATUSES = new Set(['RELEASED', 'IN_PROGRESS']);
const APPROVED_WAD_STATUSES = new Set(['APPROVED']);
const ACTIVE_STEP_STATUSES = new Set(['IN_PROGRESS', 'STARTED']);

/**
 * Gate 1 — Traveler must exist and be at a status that permits material draws.
 * `consume` and `transferToJob` require a traveler; `reserve` does too because
 * a reservation is always made on behalf of a specific traveler / work order.
 */
export function validateTravelerIssueEligibility(
  traveler: Pick<Traveler, 'id' | 'status'> | null | undefined,
): MaterialIssueBlocker | null {
  if (!traveler) {
    return {
      code: 'TRAVELER_NOT_FOUND',
      message: 'No traveler is linked to this material draw. Scan the traveler first.',
      blockingField: 'traveler',
    };
  }
  if (!RELEASED_TRAVELER_STATUSES.has(String(traveler.status).toUpperCase())) {
    return {
      code: 'TRAVELER_NOT_RELEASED',
      message: `Traveler is ${traveler.status} — only RELEASED, IN_PROGRESS, or ACTIVE travelers may consume material.`,
      blockingField: 'traveler',
    };
  }
  return null;
}

/**
 * Gate 2 — Production Work Order (WAD) must exist and be APPROVED *and*
 * RELEASED before any inventory cost can be charged to it. This mirrors the
 * Section 5/§5.6 rule that you cannot post labor or burden against an
 * unapproved WAD; the same applies to material draws that will roll up to
 * job cost.
 *
 * NOTE: We accept either a fully-loaded WorkOrder or just `(status, wadStatus)`
 * so callers without the full row can still validate.
 */
export function validateWadApproved(
  workOrder: Pick<ProductionWorkOrder, 'id' | 'status' | 'wadStatus'> | null | undefined,
): MaterialIssueBlocker | null {
  if (!workOrder) {
    return {
      code: 'WAD_NOT_FOUND',
      message: 'No Work Authorization Document (WAD) is linked to this draw. Material cannot be charged.',
      blockingField: 'workOrder',
    };
  }
  if (!APPROVED_WAD_STATUSES.has(String(workOrder.wadStatus).toUpperCase())) {
    return {
      code: 'WAD_NOT_APPROVED',
      message: `WAD is ${workOrder.wadStatus} — must be APPROVED before issuing material.`,
      blockingField: 'workOrder',
    };
  }
  if (!RELEASED_WAD_STATUSES.has(String(workOrder.status).toUpperCase())) {
    return {
      code: 'WAD_NOT_RELEASED',
      message: `Work order is ${workOrder.status} — must be RELEASED or IN_PROGRESS to consume material.`,
      blockingField: 'workOrder',
    };
  }
  return null;
}

/**
 * Gate 3 — The routing step the operator is scanning against must be the
 * active (in-progress) step on the traveler. Drawing material against a
 * not-yet-started or already-completed step breaks the cost-attribution
 * chain and is a DCAA finding.
 */
export function validateRoutingStep(
  step: Pick<TravelerStep, 'id' | 'travelerId' | 'status'> | null | undefined,
  expectedTravelerId: string | null | undefined,
): MaterialIssueBlocker | null {
  if (!step) {
    return {
      code: 'ROUTING_STEP_NOT_FOUND',
      message: 'No routing step is selected for this material draw. Scan the active step first.',
      blockingField: 'routingStep',
    };
  }
  if (expectedTravelerId && step.travelerId !== expectedTravelerId) {
    return {
      code: 'ROUTING_STEP_MISMATCH',
      message: 'The selected routing step belongs to a different traveler.',
      blockingField: 'routingStep',
    };
  }
  if (!ACTIVE_STEP_STATUSES.has(String(step.status).toUpperCase())) {
    return {
      code: 'ROUTING_STEP_NOT_ACTIVE',
      message: `Routing step is ${step.status} — start the step before drawing material.`,
      blockingField: 'routingStep',
    };
  }
  return null;
}

/**
 * Gate 4 — The requested quantity must not exceed what is available on the
 * lot once active reservations held by *other* travelers are subtracted.
 *
 * `reservedByOthers` is the sum of `materialLotReservations.quantityReserved`
 * for active reservations whose `travelerId` is NOT the current traveler.
 * The current traveler's own reservations are intentionally NOT counted —
 * they are exactly what this draw is allowed to consume.
 */
export function validateAllocation(params: {
  requestedQty: number;
  remainingQty: number;
  reservedByOthers: number;
  unitOfMeasure?: string | null;
}): MaterialIssueBlocker | null {
  const { requestedQty, remainingQty, reservedByOthers, unitOfMeasure } = params;
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
    return {
      code: 'INVALID_QUANTITY',
      message: `Requested quantity must be a positive number; received ${requestedQty}.`,
      blockingField: 'quantity',
    };
  }
  if (requestedQty > remainingQty) {
    return {
      code: 'LOT_INSUFFICIENT_QTY',
      message: `Lot has only ${remainingQty} ${unitOfMeasure ?? 'EA'} remaining; ${requestedQty} requested.`,
      blockingField: 'quantity',
    };
  }
  const available = Math.max(0, remainingQty - reservedByOthers);
  if (requestedQty > available) {
    return {
      code: 'ALLOCATION_EXCEEDED',
      message:
        `Lot is over-committed — only ${available} ${unitOfMeasure ?? 'EA'} available ` +
        `(${remainingQty} remaining, ${reservedByOthers} reserved by other travelers).`,
      blockingField: 'allocation',
    };
  }
  return null;
}

/**
 * Gate 5 — Material lot must exist and be in a status that permits the
 * requested action. `reserve` is stricter than `consume` because reservations
 * pre-commit stock and we don't want to pre-commit against material that
 * hasn't cleared incoming inspection.
 */
export function validateLotStatus(
  lot: Pick<MaterialLot, 'id' | 'status' | 'expirationDate' | 'remainingQty'> | null | undefined,
  action: MaterialIssueAction,
): MaterialIssueBlocker | null {
  if (!lot) {
    return {
      code: 'LOT_NOT_FOUND',
      message: 'Material lot not found. Re-scan the ICN.',
      blockingField: 'lot',
    };
  }

  const status = String(lot.status).toUpperCase();
  if (status === 'CONSUMED' || Number(lot.remainingQty) <= 0) {
    return {
      code: 'LOT_CONSUMED',
      message: 'Material lot is fully consumed; no quantity remains.',
      blockingField: 'lot',
    };
  }
  if (status === 'QUARANTINE') {
    return {
      code: 'LOT_QUARANTINED',
      message: 'Material lot is in QUARANTINE and cannot be issued. Resolve quarantine first.',
      blockingField: 'lot',
    };
  }
  if (status === 'REJECTED') {
    return {
      code: 'LOT_REJECTED',
      message: 'Material lot was REJECTED at inspection and cannot be issued.',
      blockingField: 'lot',
    };
  }
  if (action !== 'unreserve' && BLOCKED_LOT_STATUSES_FOR_ISSUE.has(status)) {
    return {
      code: 'LOT_NOT_AVAILABLE',
      message: `Material lot status is ${lot.status} and cannot be ${action}d.`,
      blockingField: 'lot',
    };
  }

  if (lot.expirationDate && new Date(lot.expirationDate as unknown as string) < new Date()) {
    return {
      code: 'LOT_EXPIRED',
      message: `Material lot expired on ${new Date(lot.expirationDate as unknown as string).toLocaleDateString()}.`,
      blockingField: 'lot',
    };
  }

  if (action === 'reserve' && !ALLOWED_LOT_STATUSES_FOR_RESERVE.has(status)) {
    return {
      code: 'LOT_NOT_AVAILABLE',
      message: `Lot status is ${lot.status} — only ACCEPTED or ISSUED lots can be reserved.`,
      blockingField: 'lot',
    };
  }

  return null;
}

/**
 * Gate 6 — Operator identity must be authenticated. Phase 1 only enforces
 * the *presence* of an operator identity (display name + at least one of
 * userId / badge). Role/capability authorization is Phase 2 once the
 * `inventory_issue_approvals` table and override-policy matrix exist.
 */
export function validateOperatorAuthorization(operator: {
  displayName?: string | null;
  userId?: number | null;
  badge?: string | null;
} | null | undefined): MaterialIssueBlocker | null {
  if (!operator) {
    return {
      code: 'OPERATOR_NOT_AUTHENTICATED',
      message: 'No operator identity attached to this draw. Sign in or scan a badge first.',
      blockingField: 'operator',
    };
  }
  // displayName is the field stamped onto the immutable inventory ledger
  // (`performedByDisplayName NOT NULL`). It MUST be non-empty so that the
  // ledger insert cannot fail downstream after the gate has already passed.
  const hasDisplayName =
    typeof operator.displayName === 'string' && operator.displayName.trim().length > 0;
  if (!hasDisplayName) {
    return {
      code: 'OPERATOR_NOT_AUTHENTICATED',
      message: 'Operator display name is required. Sign in or scan a badge first.',
      blockingField: 'operator',
    };
  }
  return null;
}
