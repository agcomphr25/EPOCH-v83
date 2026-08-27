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

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { storage } from '../../storage';
import {
  cuttingBuiltPackets,
  materialIssueApprovals,
  materialLotReservations,
  materialLotTransactions,
  materialLots,
  receivedUnits,
} from '../../schema';
import {
  recordInventoryLedgerEntry,
  type InventoryLedgerTransactionType,
} from './inventoryTransactionLedgerService';
import {
  validateAllocation,
  validateLotStatus,
  validateOperatorAuthorization,
  validateOperatorSession,
  validateRoutingStep,
  validateTravelerIssueEligibility,
  validateWadApproved,
  type MaterialIssueAction,
  type MaterialIssueBlocker,
  type MaterialIssueBlockerCode,
} from './materialIssueGates';
import {
  buildMaterialIssueSignaturePayload,
  classifyRequiredSignature,
  loadSignaturePolicy,
  type SignatureTransactionClass,
} from './digitalSignaturePayloads';
import { verifyAgainstPayload } from './digitalSignatureService';
import {
  getActiveRoutingStep,
  makeRoutingStepCache,
  type ActiveRoutingStep,
} from './routingStepService';
import {
  evaluateOverride,
  type MaterialIssueOverridePayload,
} from './materialIssueOverridePolicy';
import {
  HIGH_RISK_REAUTH_MAX_AGE_SECONDS,
  OperatorAuthError,
  validateAndTouchSession,
} from './operatorAuthService';
import type { OperatorAuthSession } from '../../schema';

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

/**
 * Phase 2 (Task #143). When an `operatorAuth.sessionToken` is present the
 * service resolves it to an `operator_auth_sessions` row and uses that row
 * as the source of truth for operator identity (overriding any conflicting
 * fields on `req.operator`).
 *
 * Whether the action requires a fresh re-auth is **policy-driven on the
 * server**, NOT a caller flag. The service classifies the request via
 * `req.highRiskClass` + `req.scrapValueUsd` in `isHighRiskRequest()` and
 * forces a fresh `lastReauthAt` within `HIGH_RISK_REAUTH_MAX_AGE_SECONDS`
 * for any of:
 *   - OVERRIDE          (any operator-initiated override of a gate)
 *   - EXPIRED_LOT_RELEASE
 *   - QUARANTINE_RELEASE
 *   - SCRAP             (when `scrapValueUsd > HIGH_RISK_SCRAP_USD_THRESHOLD`)
 *
 * Callers cannot opt OUT of this — they may only opt IN via additional
 * caller-classified high-risk semantics by setting `forceFreshReauth: true`.
 */
export type MaterialIssueHighRiskClass =
  | 'OVERRIDE'
  | 'EXPIRED_LOT_RELEASE'
  | 'QUARANTINE_RELEASE'
  | 'SCRAP';

export interface MaterialIssueOperatorAuth {
  sessionToken?: string | null;
  /** Caller-side opt-IN only. Cannot suppress server-derived requirements. */
  forceFreshReauth?: boolean;
}

export interface MaterialIssueRequest {
  /** Which logical action is being performed; routes the gate chain and ledger txn type. */
  action: MaterialIssueAction;
  /** Optional Phase 9 retry identity, enforced by a prospective unique ledger index. */
  p2MaterialConsumptionRequestKey?: string | null;
  p2MaterialConsumptionRequestHash?: string | null;
  /** Optional Phase 9 physical custody unit, decremented in the same transaction. */
  p2ReceivedUnitId?: number | null;
  /** Exact released BOM demand locked and incremented atomically for Phase 9. */
  p2MaterialRequirementId?: string | null;
  /**
   * Per-request cache for `getActiveRoutingStep`. Optional; when omitted a
   * fresh cache is created internally. Pass one when batching many draws
   * inside a single HTTP request so they share a single DB lookup per
   * traveler.
   */
  _activeStepCache?: Map<string, ActiveRoutingStep | null>;
  /** Material lot the operator is drawing from. */
  materialLotId: string;
  /** Quantity in the lot's unit-of-measure. Always positive; sign is set by the action. */
  quantity: number;
  /** Operator + device context. Required. */
  operator: MaterialIssueOperator;
  /**
   * Phase 2 operator session token presented by the shop-floor UI.
   * When omitted, the operator-session gate emits OPERATOR_NOT_AUTHENTICATED.
   */
  operatorAuth?: MaterialIssueOperatorAuth;
  /**
   * Server-evaluated high-risk classification (Task #143). Setting any
   * value here forces fresh-reauth enforcement; the caller cannot opt out.
   */
  highRiskClass?: MaterialIssueHighRiskClass | null;
  /** USD value of the material being scrapped — only consulted for SCRAP. */
  scrapValueUsd?: number | null;
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
  /**
   * Optional digital signature accompanying this request. Required when the
   * draw is classified as high-risk (override / scrap above threshold /
   * quarantine release / expired-lot use / large count adjustment). The
   * signature is re-verified against the canonical payload built from THIS
   * request — a signer who signed transaction A cannot submit it with
   * transaction B.
   */
  digitalSignature?: {
    signatureId: string;
  } | null;
  /**
   * Caller can explicitly mark the request as an override (e.g. an
   * authorized supervisor approving a draw that would otherwise be blocked).
   * Setting this true forces a signature requirement.
   */
  isOverride?: boolean;
  /**
   * Optional pre-built cutting packet being consumed. When supplied, the
   * service checks `cutting_built_packets.intended_routing_step_id` and
   * rejects the draw if it doesn't match the active routing step on the
   * traveler.
   */
  packetId?: string | null;
  /**
   * Optional intended routing step pin for NEW reservations. When the
   * action is `reserve`, this is stamped onto the new
   * `material_lot_reservations.intended_routing_step_id`. When the
   * action is `consume` / `issue` / `transferToJob` and an existing
   * reservation is being fulfilled, the service compares this against
   * the stored value and rejects on mismatch.
   */
  intendedRoutingStepId?: string | null;
  /**
   * Phase-2 override payload (Task #144). Supply only when the operator
   * has explicit approver authorization to bypass a routing-step or
   * lot-quarantine gate. Each override stamps `wasOverride=true`,
   * `overrideReason`, and the approver identity onto the inventory
   * ledger row for permanent audit evidence.
   */
  override?: MaterialIssueOverridePayload | null;
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
/**
 * Resolve `req.operatorAuth.sessionToken` to a session row (Phase 2,
 * Task #143). Returns the row plus a synthesized blocker on any failure
 * (token malformed, session expired/idle/revoked, fresh-reauth required
 * but stale). The session row, when valid, becomes the authoritative
 * source for operator identity in `executeMaterialIssue`.
 */
/**
 * Server-side, policy-driven high-risk classifier. The decision lives
 * here — NOT in callers — so a forgotten flag at one call site cannot
 * silently downgrade a high-risk action.
 */
export function isHighRiskRequest(req: MaterialIssueRequest): boolean {
  if (req.operatorAuth?.forceFreshReauth) return true;
  if (!req.highRiskClass) return false;
  if (req.highRiskClass === 'SCRAP') {
    return (req.scrapValueUsd ?? 0) > HIGH_RISK_SCRAP_USD_THRESHOLD;
  }
  return true; // OVERRIDE / EXPIRED_LOT_RELEASE / QUARANTINE_RELEASE always high-risk.
}

async function resolveOperatorSession(
  req: MaterialIssueRequest,
): Promise<{ session: OperatorAuthSession | null; blocker: MaterialIssueBlocker | null }> {
  const requireFresh = isHighRiskRequest(req);
  const token = req.operatorAuth?.sessionToken;
  if (!token) {
    return {
      session: null,
      blocker: validateOperatorSession(null, {
        requireFreshReauth: requireFresh,
        freshReauthMaxAgeSeconds: HIGH_RISK_REAUTH_MAX_AGE_SECONDS,
      }),
    };
  }
  try {
    // touch=false here: the gate-validation path is read-only and may be
    // called multiple times during a UI preflight. We bump lastActivityAt
    // ONLY when execution actually proceeds.
    const { session } = await validateAndTouchSession(token, { touch: false });
    const blocker = validateOperatorSession(session, {
      requireFreshReauth: requireFresh,
      freshReauthMaxAgeSeconds: HIGH_RISK_REAUTH_MAX_AGE_SECONDS,
    });
    return { session, blocker };
  } catch (err) {
    if (err instanceof OperatorAuthError) {
      return {
        session: null,
        blocker: {
          // Map auth errors to the closest blocker code so UIs can route
          // them to the same "re-scan badge" prompt.
          code:
            err.code === 'TOKEN_BAD_SIGNATURE' || err.code === 'TOKEN_MALFORMED'
              ? 'OPERATOR_NOT_AUTHENTICATED'
              : 'OPERATOR_NOT_AUTHENTICATED',
          message: err.message,
          blockingField: 'operator',
        },
      };
    }
    throw err;
  }
}

export async function validateIssueEligibility(
  req: MaterialIssueRequest,
): Promise<MaterialIssueBlocker[]> {
  const blockers: MaterialIssueBlocker[] = [];

  // Phase 2 (Task #143) gate 7 runs first: no valid operator session →
  // nothing else matters. We still preserve the legacy displayName/badge
  // shape check (gate 6) so callers that haven't migrated to session
  // tokens fail with the same well-known structured error.
  const { session, blocker: sessionBlocker } = await resolveOperatorSession(req);
  if (sessionBlocker) blockers.push(sessionBlocker);

  const legacyOperator = session
    ? { displayName: session.employeeDisplayName, userId: session.employeeId, badge: null }
    : req.operator;
  const operatorBlocker = validateOperatorAuthorization(legacyOperator);
  if (operatorBlocker && !sessionBlocker) blockers.push(operatorBlocker);

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
  // Phase-3 (Task #145) — LOT_QUARANTINED and LOT_EXPIRED are NOT hard
  // blockers when accompanied by a valid digital signature of the
  // matching transaction class. We hold the lot blocker aside and only
  // push it if the signature gate fails to authorize the bypass.
  let pendingLotBlocker: MaterialIssueBlocker | null = null;
  if (lotBlocker) {
    const isOverridableLotBlock =
      lotBlocker.code === 'LOT_QUARANTINED' || lotBlocker.code === 'LOT_EXPIRED';
    if (isOverridableLotBlock) {
      pendingLotBlocker = lotBlocker;
    } else if (lotBlocker.code === 'LOT_DOCUMENT_HELD') {
      const verified = await applyOverrideIfAuthorized(lotBlocker, req.override, {
        materialLotId: req.materialLotId,
        travelerId: req.travelerId ?? null,
      });
      if (verified) {
        (req as MaterialIssueRequest).override = verified;
        (req as MutableInternal)._overrideVerifiedForBlocker = true;
      } else {
        blockers.push(lotBlocker);
      }
    } else {
      blockers.push(lotBlocker);
    }
  }

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

  // If the caller is fulfilling an existing reservation (consume / issue /
  // transferToJob with a reservationId), load that reservation and pin
  // its `intendedRoutingStepId` as the floor for the routing-step gate.
  // This is the persisted-intent enforcement the review called out: a
  // caller cannot bypass reservation pinning by omitting intent.
  let reservationIntent: string | null = null;
  if (
    req.reservationId != null &&
    (req.action === 'consume' || req.action === 'issue' || req.action === 'transferToJob')
  ) {
    try {
      const [resv] = await db
        .select({
          id: materialLotReservations.id,
          materialLotId: materialLotReservations.materialLotId,
          travelerId: materialLotReservations.travelerId,
          status: materialLotReservations.status,
          intendedRoutingStepId: materialLotReservations.intendedRoutingStepId,
        })
        .from(materialLotReservations)
        .where(eq(materialLotReservations.id, req.reservationId))
        .limit(1);
      if (!resv) {
        blockers.push({
          code: 'ALLOCATION_EXCEEDED',
          message: `Reservation ${req.reservationId} not found.`,
          blockingField: 'allocation',
        });
      } else {
        if (resv.materialLotId !== req.materialLotId) {
          blockers.push({
            code: 'ALLOCATION_EXCEEDED',
            message:
              `Reservation ${req.reservationId} belongs to lot ${resv.materialLotId}, ` +
              `not ${req.materialLotId}.`,
            blockingField: 'allocation',
          });
        }
        if (req.travelerId && resv.travelerId && resv.travelerId !== req.travelerId) {
          blockers.push({
            code: 'ALLOCATION_EXCEEDED',
            message:
              `Reservation ${req.reservationId} is pinned to traveler ${resv.travelerId}, ` +
              `not ${req.travelerId}.`,
            blockingField: 'allocation',
          });
        }
        reservationIntent = resv.intendedRoutingStepId ?? null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown';
      blockers.push({
        code: 'ALLOCATION_EXCEEDED',
        message:
          'Could not load reservation to verify routing-step pin — refusing the draw to fail closed. ' +
          `(reason: ${message})`,
        blockingField: 'allocation',
      });
    }
  }

  // Phase-2: reserve actions MUST pin to the traveler's currently-active
  // routing step. Reserving for a downstream / non-active step would let
  // a planner stockpile material outside the operator's current scope and
  // defeat the single-source-of-truth contract; the gate is the same
  // active-step check used for issue/consume below.
  if (req.action === 'reserve') {
    const active = req.travelerId
      ? await getActiveRoutingStep(req.travelerId, req._activeStepCache)
      : null;
    if (!active?.inProgress) {
      const stepBlocker: MaterialIssueBlocker = {
        code: 'NO_ACTIVE_ROUTING_STEP',
        message:
          'Traveler has no active routing step. Start a step before reserving material.',
        blockingField: 'routingStep',
      };
      const verified = await applyOverrideIfAuthorized(stepBlocker, req.override, {
        materialLotId: req.materialLotId,
        travelerId: req.travelerId ?? null,
      });
      if (verified) {
        (req as MaterialIssueRequest).override = verified;
        (req as MutableInternal)._overrideVerifiedForBlocker = true;
        // Caller must supply an explicit pin if there is no active step
        // (the override authorizes pinning off-step under ROUTING_STEP_BYPASS).
        if (!req.intendedRoutingStepId) blockers.push(stepBlocker);
      } else {
        blockers.push(stepBlocker);
      }
    } else if (
      req.intendedRoutingStepId &&
      req.intendedRoutingStepId !== active.step.id
    ) {
      const stepBlocker: MaterialIssueBlocker = {
        code: 'WRONG_ROUTING_STEP',
        message:
          `Reserve must target the active routing step "${active.step.id}"; ` +
          `caller asserted "${req.intendedRoutingStepId}".`,
        blockingField: 'routingStep',
      };
      const verified = await applyOverrideIfAuthorized(stepBlocker, req.override, {
        materialLotId: req.materialLotId,
        travelerId: req.travelerId ?? null,
      });
      if (verified) {
        (req as MaterialIssueRequest).override = verified;
        (req as MutableInternal)._overrideVerifiedForBlocker = true;
      } else {
        blockers.push(stepBlocker);
      }
    } else {
      // Normalize: if caller omitted, pin to the active step so the
      // reservation row carries the correct intended_routing_step_id.
      (req as MaterialIssueRequest).intendedRoutingStepId =
        req.intendedRoutingStepId ?? active.step.id;
    }
  }

  // Routing step is required for issue/consume/transferToJob; reserve is
  // gated above by the pin requirement.
  if (req.action !== 'reserve') {
    // Phase-2 strengthening: the active step on the traveler is the
    // single source of truth. If the caller did not supply an explicit
    // step we auto-detect from `getActiveRoutingStep`. Either way we
    // pass `activeStep` into the gate so an operator who scans an
    // already-completed or not-yet-started step is rejected with
    // `WRONG_ROUTING_STEP`.
    let active: ActiveRoutingStep | null = null;
    if (req.travelerId) {
      active = await getActiveRoutingStep(req.travelerId, req._activeStepCache);
    }
    let stepId = req.travelerStepId ?? null;
    if (!stepId && active?.inProgress) {
      stepId = active.step.id;
      // Normalize the request so the auto-detected step is what the
      // ledger writer persists — single source of truth, no traceability
      // gap between gate and ledger.
      (req as MaterialIssueRequest).travelerStepId = stepId;
    }

    const step = stepId ? await storage.getTravelerStep(stepId) : null;

    // Resolve persisted intent. Order of precedence is strict:
    //   1. reservation.intended_routing_step_id (loaded earlier)
    //   2. cutting_built_packets.intended_routing_step_id (always loaded
    //      from DB when packetId is supplied — caller-asserted intent
    //      cannot soften or override the persisted packet pin)
    //   3. caller-supplied req.intendedRoutingStepId (only used as a
    //      fallback when neither of the persisted sources exists)
    // If a caller supplies req.intendedRoutingStepId AND the packet has a
    // persisted pin, the two are compared and a mismatch is rejected.
    let packetIntent: string | null = reservationIntent ?? null;
    if (req.packetId) {
      try {
        const [packet] = await db
          .select({ intendedRoutingStepId: cuttingBuiltPackets.intendedRoutingStepId })
          .from(cuttingBuiltPackets)
          .where(eq(cuttingBuiltPackets.id, req.packetId))
          .limit(1);
        const persistedPacketIntent = packet?.intendedRoutingStepId ?? null;
        if (persistedPacketIntent) {
          if (
            req.intendedRoutingStepId &&
            req.intendedRoutingStepId !== persistedPacketIntent
          ) {
            blockers.push({
              code: 'WRONG_ROUTING_STEP',
              message:
                `Caller asserted routing step ${req.intendedRoutingStepId} but ` +
                `packet ${req.packetId} is pinned to ${persistedPacketIntent}.`,
              blockingField: 'routingStep',
            });
          }
          packetIntent = packetIntent ?? persistedPacketIntent;
        }
      } catch {
        // Fail closed: any DB error here surfaces as WRONG_ROUTING_STEP.
        blockers.push({
          code: 'WRONG_ROUTING_STEP',
          message: `Could not load packet ${req.packetId} to verify routing-step pin.`,
          blockingField: 'routingStep',
        });
      }
    }
    // Caller-supplied intent only seeds the gate when no persisted
    // source provided one.
    if (!packetIntent && req.intendedRoutingStepId) {
      packetIntent = req.intendedRoutingStepId;
    }

    const stepBlocker = validateRoutingStep(
      step,
      req.travelerId ?? null,
      active?.inProgress ? active.step : active === null ? null : undefined,
      packetIntent,
    );
    if (stepBlocker) {
      const verified = await applyOverrideIfAuthorized(stepBlocker, req.override, {
        materialLotId: req.materialLotId,
        travelerId: req.travelerId ?? null,
      });
      if (verified) {
        // Replace the caller-asserted override on the request with the
        // server-verified payload so executeMaterialIssue stamps DB-resolved
        // approver identity onto the immutable ledger metadata. Mark the
        // override as actually used — executeMaterialIssue only consumes
        // the approval row when this flag is set, so a request that
        // happens to carry an override payload but didn't need it
        // (no blocker tripped) does not burn an approval.
        (req as MaterialIssueRequest).override = verified;
        (req as MutableInternal)._overrideVerifiedForBlocker = true;
      } else {
        blockers.push(stepBlocker);
      }
    }
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
    } catch (err: unknown) {
      reservationLookupOk = false;
      const message = err instanceof Error ? err.message : 'unknown';
      blockers.push({
        code: 'ALLOCATION_EXCEEDED',
        message:
          'Could not verify outstanding reservations on this lot — refusing the draw to fail closed. ' +
          `(reason: ${message})`,
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

  // Phase-3 (Task #145) — digital signature gate. The classifier inspects
  // the request + lot to decide whether this draw is "high-risk" and thus
  // requires a verifiable signature. If so, the request must carry a
  // `digitalSignature.signatureId` whose canonical bytes match a payload
  // built deterministically from THIS request. We re-verify cryptographically
  // here so a stale or tampered signature is rejected before any state change.
  const requiredClass = classifyRequiredSignatureForRequest(req, lot);
  if (requiredClass) {
    const sigBlocker = await validateSignatureGate(req, requiredClass);
    if (sigBlocker) {
      blockers.push(sigBlocker);
      // Signature failed → the held lot blocker (if any) stands.
      if (pendingLotBlocker) blockers.push(pendingLotBlocker);
    } else {
      // Signature valid for QUARANTINE_RELEASE / EXPIRED_LOT_USE → the
      // matching lot blocker is intentionally suppressed. Otherwise the
      // held blocker still applies.
      if (pendingLotBlocker) {
        const overrides =
          (pendingLotBlocker.code === 'LOT_QUARANTINED' && requiredClass === 'QUARANTINE_RELEASE') ||
          (pendingLotBlocker.code === 'LOT_EXPIRED' && requiredClass === 'EXPIRED_LOT_USE');
        if (!overrides) blockers.push(pendingLotBlocker);
      }
    }
  } else if (pendingLotBlocker) {
    // No signature required but lot is quarantined/expired → block as before.
    blockers.push(pendingLotBlocker);
  }

  return blockers;
}

function classifyRequiredSignatureForRequest(
  req: MaterialIssueRequest,
  lot: { status?: string | null; expirationDate?: Date | null } | null | undefined,
): SignatureTransactionClass | null {
  if (req.action === 'unreserve' || req.action === 'reserve') {
    // Reservations and their cancellations don't draw material; no signature
    // required even if the reason code looks override-y.
    if (!req.isOverride) return null;
  }
  const expiration = lot?.expirationDate ? new Date(lot.expirationDate as any) : null;
  const lotIsExpired = expiration ? expiration.getTime() < Date.now() : false;
  return classifyRequiredSignature(
    {
      action: req.action,
      reasonCode: req.reasonCode ?? null,
      quantity: req.quantity,
      lotStatus: lot?.status ?? null,
      lotIsExpired,
      isOverride: req.isOverride ?? false,
    },
    loadSignaturePolicy(),
  );
}

async function validateSignatureGate(
  req: MaterialIssueRequest,
  requiredClass: SignatureTransactionClass,
): Promise<MaterialIssueBlocker | null> {
  if (!req.digitalSignature?.signatureId) {
    return {
      code: 'MISSING_SIGNATURE',
      message: `This ${req.action} requires a digital signature (${requiredClass}). Have the authorizing party sign before submitting.`,
      blockingField: 'signature',
    };
  }
  const expected = buildMaterialIssueSignaturePayload(requiredClass, {
    action: req.action,
    materialLotId: req.materialLotId,
    quantity: req.quantity,
    unitOfMeasure: null,
    travelerId: req.travelerId ?? null,
    travelerStepId: req.travelerStepId ?? null,
    productionWorkOrderId: req.productionWorkOrderId ?? null,
    chargeCodeId: req.chargeCodeId ?? null,
    reasonCode: req.reasonCode ?? null,
    approverUserId: req.operator.userId ?? null,
    approverDisplayName: req.operator.displayName,
    signerUserId: req.operator.userId ?? 0,
    signerDisplayName: req.operator.displayName,
  });
  try {
    const result = await verifyAgainstPayload(req.digitalSignature.signatureId, expected);
    if (!result.valid) {
      return {
        code: 'INVALID_SIGNATURE',
        message: `Signature ${req.digitalSignature.signatureId} did not verify (${result.reason ?? 'unknown'}).`,
        blockingField: 'signature',
      };
    }
    if (result.transactionClass !== requiredClass) {
      return {
        code: 'INVALID_SIGNATURE',
        message: `Signature is for ${result.transactionClass} but this draw requires ${requiredClass}.`,
        blockingField: 'signature',
      };
    }
    return null;
  } catch (err: any) {
    return {
      code: 'INVALID_SIGNATURE',
      message: `Could not verify signature ${req.digitalSignature.signatureId}: ${err?.message ?? 'unknown error'}.`,
      blockingField: 'signature',
    };
  }
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

  // Re-resolve the session so the ledger row reflects the AUTHENTICATED
  // operator identity (snapshot from the session row), not whatever the
  // caller pasted into req.operator. validateIssueEligibility already
  // proved the session is good; this re-fetch also bumps lastActivityAt
  // exactly once per executed action so the idle timer stays alive.
  let effectiveOperator: MaterialIssueOperator = req.operator;
  if (req.operatorAuth?.sessionToken) {
    try {
      const { session } = await validateAndTouchSession(
        req.operatorAuth.sessionToken,
        { touch: true },
      );
      effectiveOperator = {
        userId: session.employeeId,
        displayName: session.employeeDisplayName,
        badge: req.operator?.badge ?? null,
        workstation: session.workstationId ?? req.operator?.workstation ?? null,
        deviceIp: session.ipAddress ?? req.operator?.deviceIp ?? null,
        authMethod: session.authMethod as MaterialIssueOperator['authMethod'],
      };
    } catch (err) {
      // Lost the race against an expiry / revoke that fired between
      // validation and execution. Surface as a structured blocker.
      if (err instanceof OperatorAuthError) {
        return {
          ok: false,
          blockers: [
            {
              code: 'OPERATOR_NOT_AUTHENTICATED',
              message: err.message,
              blockingField: 'operator',
            },
          ],
        };
      }
      throw err;
    }
  }

  const reqWithEffectiveOperator: MaterialIssueRequest = {
    ...req,
    operator: effectiveOperator,
  };
  // Replace `req` with the effective-operator copy for the rest of the
  // function so the ledger row, lot transaction, and reservation rows all
  // attribute the action to the authenticated operator.
  req = reqWithEffectiveOperator;

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
      if (req.p2MaterialRequirementId) {
        const requirementResult = await tx.execute(sql`
          SELECT required_quantity,issued_quantity,status
          FROM p2_manufacturing_work_order_material_requirements
          WHERE id=${req.p2MaterialRequirementId} FOR UPDATE
        `);
        const requirement = requirementResult.rows[0];
        const nextIssued =
          Number(requirement?.issued_quantity ?? 0) + req.quantity;
        if (
          !requirement ||
          requirement.status === 'CANCELLED' ||
          nextIssued > Number(requirement.required_quantity)
        )
          throw new MaterialIssueRaceError({
            code: 'ALLOCATION_EXCEEDED',
            message: 'The released BOM demand no longer has enough outstanding quantity.',
            blockingField: 'allocation',
          });
        await tx.execute(sql`
          UPDATE p2_manufacturing_work_order_material_requirements
          SET issued_quantity=${nextIssued},
              status=CASE WHEN ${nextIssued}>=required_quantity THEN 'SATISFIED' ELSE 'OPEN' END,
              updated_at=now()
          WHERE id=${req.p2MaterialRequirementId}
        `);
      }
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

      if (req.p2ReceivedUnitId != null) {
        const [physicalUnit] = await tx
          .select()
          .from(receivedUnits)
          .where(
            and(
              eq(receivedUnits.id, req.p2ReceivedUnitId),
              eq(receivedUnits.materialLotId, lot.id),
            ),
          )
          .for('update');
        const physicalQuantity = Number(physicalUnit?.quantity ?? 0);
        if (!physicalUnit || physicalQuantity < req.quantity) {
          throw new MaterialIssueRaceError({
            code: 'LOT_INSUFFICIENT_QTY',
            message: 'The accepted Receiving unit no longer has enough physical custody quantity.',
            blockingField: 'quantity',
          });
        }
        await tx
          .update(receivedUnits)
          .set({
            quantity: (physicalQuantity - req.quantity).toString(),
            updatedAt: new Date(),
          })
          .where(eq(receivedUnits.id, req.p2ReceivedUnitId));
      }

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
          // Phase-2 (Task #144): pin the reservation to a specific
          // routing step so any subsequent consume call must match.
          intendedRoutingStepId: req.intendedRoutingStepId ?? null,
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

    // Phase-2: atomically claim the override approval row inside the
    // same transaction as the ledger write. The conditional UPDATE matches
    // only an APPROVED row with the right id — a concurrent transaction
    // that already consumed it would lose the race here and we abort.
    // We do the claim BEFORE the ledger insert so a race aborts cheaply,
    // then back-fill `consumedByLedgerEntryId` AFTER the ledger row is
    // written so the approval -> ledger linkage is one-hop in audit.
    if (
      req.override?.approvalId &&
      (req as MutableInternal)._overrideVerifiedForBlocker
    ) {
      const [claimed] = await tx
        .update(materialIssueApprovals)
        .set({ status: 'CONSUMED', consumedAt: new Date() })
        .where(
          and(
            eq(materialIssueApprovals.id, req.override.approvalId),
            eq(materialIssueApprovals.status, 'APPROVED'),
          ),
        )
        .returning();
      if (!claimed) {
        throw new MaterialIssueRaceError({
          code: 'WRONG_ROUTING_STEP',
          message:
            `Override approval ${req.override.approvalId} could not be consumed ` +
            '(already consumed, revoked, or expired between validation and execution).',
          blockingField: 'routingStep',
        });
      }
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
        digitalSignatureId: req.digitalSignature?.signatureId ?? null,
        sourceModule: SOURCE_MODULE,
        sourceRecordId: req.materialLotId,
        metadata: {
          action: req.action,
          p2MaterialConsumptionRequestKey:
            req.p2MaterialConsumptionRequestKey ?? null,
          p2MaterialConsumptionRequestHash:
            req.p2MaterialConsumptionRequestHash ?? null,
          p2ReceivedUnitId: req.p2ReceivedUnitId ?? null,
          p2MaterialRequirementId: req.p2MaterialRequirementId ?? null,
          requestedQty: req.quantity,
          reservationId: createdReservationId,
          digitalSignatureId: req.digitalSignature?.signatureId ?? null,
          isOverride: req.isOverride ?? false,
          packetId: req.packetId ?? null,
          intendedRoutingStepId: req.intendedRoutingStepId ?? null,
          // Phase-2: stamp the override payload (without secrets) so
          // audit can reconstruct WHO authorized the bypass and WHY.
          override: req.override
            ? {
                reason: req.override.reason,
                approvalId: req.override.approvalId,
                approverUserId: req.override.approverUserId ?? null,
                approverDisplayName: req.override.approverDisplayName,
                approverRole: req.override.approverRole,
                writtenReason: req.override.writtenReason,
              }
            : null,
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

    // Phase-2: back-fill the consumed approval row with the ledger entry
    // id so audit can hop directly from approval -> ledger evidence.
    if (
      req.override?.approvalId &&
      (req as MutableInternal)._overrideVerifiedForBlocker
    ) {
      await tx
        .update(materialIssueApprovals)
        .set({ consumedByLedgerEntryId: ledgerEntry.id })
        .where(eq(materialIssueApprovals.id, req.override.approvalId));
    }

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

/**
 * Internal: returns true when the supplied override authorizes a bypass
 * of the supplied gate blocker. Mutates nothing — caller decides whether
 * to swallow the blocker or surface it.
 */
/**
 * Internal mutable shape we attach to the request inside the service
 * to carry validation-time decisions through to execution time. These
 * fields are NOT part of the public `MaterialIssueRequest` contract.
 */
interface MutableInternal {
  _overrideVerifiedForBlocker?: boolean;
}

/** Subset of fields we read from the `users` row when verifying an approver. */
interface UserApproverProjection {
  id: number;
  role: string;
  firstName: string | null;
  lastName: string | null;
  username: string;
}

async function applyOverrideIfAuthorized(
  blocker: MaterialIssueBlocker,
  override: MaterialIssueOverridePayload | null | undefined,
  context: { materialLotId?: string | null; travelerId?: string | null } = {},
): Promise<MaterialIssueOverridePayload | null> {
  if (!override) return null;
  // Only routing-step gates and a small whitelist may be bypassed via
  // ROUTING_STEP_BYPASS / EMERGENCY_PRODUCTION. Quantity / operator
  // gates are NEVER overridable — those are integrity invariants.
  const overridableCodes: ReadonlyArray<MaterialIssueBlockerCode> = [
    'WRONG_ROUTING_STEP',
    'ROUTING_STEP_NOT_ACTIVE',
    'ROUTING_STEP_MISMATCH',
    'NO_ACTIVE_ROUTING_STEP',
    'WAD_NOT_RELEASED',
    'LOT_QUARANTINED',
    'LOT_DOCUMENT_HELD',
  ];
  if (!overridableCodes.includes(blocker.code)) return null;
  // Server-side verification: do NOT trust caller-asserted approverRole /
  // approverDisplayName. Re-resolve from `users` so a caller cannot
  // claim a privileged role they don't actually hold. The verified
  // payload is what we return so the ledger writer stamps DB-resolved
  // identity, never caller-asserted strings.
  if (override.approverUserId == null) return null;
  if (!override.approvalId) return null;
  const approver = await storage.getUser(override.approverUserId);
  if (!approver) return null;

  // Load the persisted approval artifact. The override is only authorized
  // when a real `material_issue_approvals` row exists, is APPROVED (not
  // CONSUMED / REVOKED / EXPIRED), is not past its expiry, was created by
  // the same approverUserId, scoped to the same lot/traveler context (when
  // the approval row carries that scope), and authorizes the SPECIFIC
  // blocker we are about to bypass. This makes overrides un-spoofable by
  // service callers — they need a real approver to have minted the row
  // out-of-band first.
  let approval: typeof materialIssueApprovals.$inferSelect | undefined;
  try {
    const [row] = await db
      .select()
      .from(materialIssueApprovals)
      .where(eq(materialIssueApprovals.id, override.approvalId))
      .limit(1);
    approval = row;
  } catch {
    return null;
  }
  if (!approval) return null;
  if (approval.status !== 'APPROVED') return null;
  if (approval.expiresAt && approval.expiresAt.getTime() < Date.now()) return null;
  if (approval.approverUserId !== override.approverUserId) return null;
  if (approval.reason !== override.reason) return null;
  if (approval.bypassesBlocker !== blocker.code) return null;
  if (approval.materialLotId && context.materialLotId &&
      approval.materialLotId !== context.materialLotId) return null;
  if (approval.travelerId && context.travelerId &&
      approval.travelerId !== context.travelerId) return null;

  // `storage.getUser` returns the typed `User` row (`users.$inferSelect`).
  // We narrow once here so the verified payload below is fully type-safe.
  const approverRow = approver as Pick<
    UserApproverProjection,
    'role' | 'firstName' | 'lastName' | 'username'
  >;
  const fullName = [approverRow.firstName, approverRow.lastName]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(' ')
    .trim();
  const verified: MaterialIssueOverridePayload = {
    reason: override.reason,
    approvalId: approval.id,
    approverUserId: override.approverUserId,
    approverRole: approverRow.role || approval.approverRoleAtApproval || '',
    approverDisplayName:
      fullName || approverRow.username || String(override.approverUserId),
    writtenReason: approval.writtenReason,
  };
  return evaluateOverride(verified, blocker.code).ok ? verified : null;
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
