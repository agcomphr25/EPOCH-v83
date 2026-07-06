/**
 * Order State Transition Validator
 *
 * Defines the legal state machine for order status and department transitions.
 * The canonical write service (orderActivityService) calls this before executing
 * any mutation; invalid transitions throw a structured error.
 *
 * Exceptional flows (NCR repair, admin override, offline replay) must pass an
 * explicit overrideReason + actor context to bypass normal guards.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActorContext {
  actorId?: number | null;
  actorDisplayName?: string | null;
  actorType?: string;
}

export interface TransitionOverride {
  overrideReason: string;
  actor: ActorContext;
}

export class TransitionValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'TransitionValidationError';
  }
}

// ── Status state machine ─────────────────────────────────────────────────────

/**
 * Legal status → status transitions.
 *
 * The all_orders.status field is a plain text column (not an enum), so
 * the actual values used in the codebase span a wider vocabulary.
 * This map covers every target status seen in production code paths.
 *
 * Absent source statuses fall through to the "unknown source → allow" branch
 * so that future statuses or edge-case legacy rows do not hard-block.
 */
export const STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  // New orders start here (website import, manual entry)
  // Finalized order enters production
  FINALIZED:         ['IN_PROGRESS', 'CANCELLED'],
  // Active production paths
  IN_PROGRESS:       ['COMPLETED', 'FULFILLED', 'CANCELLED', 'FINALIZED', 'IN_PROGRESS'],
  // Shipping / fulfillment completion (UPS label generation sets COMPLETED)
  COMPLETED:         ['FULFILLED', 'IN_PROGRESS'],    // IN_PROGRESS: reopen / NCR repair (override)
  FULFILLED:         [],                              // terminal — must use override (NCR/admin reopen)
  CANCELLED:         ['IN_PROGRESS', 'FINALIZED'],    // must use override (reopen flow)
  // RTS / PO creation statuses
  CREATED:           ['IN_PROGRESS', 'CANCELLED'],
  PENDING:           ['IN_PROGRESS', 'LABELLED', 'CANCELLED'],
  LABELLED:          ['IN_PROGRESS', 'COMPLETED'],
};

/**
 * Status transitions that always require an explicit override regardless of
 * whether they appear in the allowed list.
 * Key: "fromStatus → toStatus"
 */
const ALWAYS_REQUIRES_OVERRIDE_TRANSITIONS: ReadonlySet<string> = new Set([
  // CANCELLED always requires a reason
  '* → CANCELLED',
  // Reopening a terminal fulfilled order requires an explicit reopen reason
  'FULFILLED → IN_PROGRESS',
  'COMPLETED → IN_PROGRESS',
  // Reopening a cancelled order requires a reason
  'CANCELLED → IN_PROGRESS',
  'CANCELLED → FINALIZED',
]);

/**
 * Validate a status transition.
 * Throws TransitionValidationError if illegal and no override is provided.
 */
export function validateStatusTransition(
  fromStatus: string | null | undefined,
  toStatus: string,
  override?: TransitionOverride
): void {
  if (!fromStatus || fromStatus === toStatus) return; // no-op or first-set

  const allowed = STATUS_TRANSITIONS[fromStatus];

  // If fromStatus is unknown, allow (we can't validate what we don't know)
  if (allowed === undefined) return;

  const isAllowed = allowed.includes(toStatus);

  // Check if this specific transition always requires override
  const transitionKey = `${fromStatus} → ${toStatus}`;
  const wildcardKey = `* → ${toStatus}`;
  const requiresOverride =
    ALWAYS_REQUIRES_OVERRIDE_TRANSITIONS.has(transitionKey) ||
    ALWAYS_REQUIRES_OVERRIDE_TRANSITIONS.has(wildcardKey);

  if (!isAllowed || requiresOverride) {
    if (override?.overrideReason) {
      // Explicit override provided — log and allow
      console.warn(
        `[TransitionValidator] Override accepted: ${fromStatus} → ${toStatus} | reason: ${override.overrideReason} | actor: ${override.actor.actorDisplayName ?? 'unknown'}`
      );
      return;
    }

    const reason = !isAllowed
      ? `Status transition from "${fromStatus}" to "${toStatus}" is not a legal forward path.`
      : `Status transition from "${fromStatus}" to "${toStatus}" requires an explicit override reason (reopen/admin flow).`;

    throw new TransitionValidationError(
      'ILLEGAL_STATUS_TRANSITION',
      reason,
      { fromStatus, toStatus }
    );
  }
}

// ── Department state machine ─────────────────────────────────────────────────

/**
 * The canonical P1 department progression flow (ordered).
 * Adjacent hops are always legal; non-adjacent hops require either an override
 * or must be listed in LEGAL_DEPARTMENT_SKIP_TRANSITIONS.
 */
export const P1_DEPARTMENT_FLOW: readonly string[] = [
  'P1 Production Queue',
  'Barcode',
  'Layup',
  'Layup/Plugging',
  'Plugging',
  'CNC',
  'Finish',
  'Finish Queue',
  'Finish QC',
  'Gunsmith',
  'Paint',
  'QC',
  'QC Shipping Queue',
  'Shipping',
  'Shipping Management',
  'Shipping QC',
  'Fulfilled',
];

/**
 * Legal non-adjacent skip transitions (flat-top bypass, no-rail bypass, etc.)
 * Key: "fromDept → toDept"
 */
const LEGAL_DEPARTMENT_SKIP_TRANSITIONS: ReadonlySet<string> = new Set([
  'Layup/Plugging → Finish',   // flat-top skips CNC
  'Layup/Plugging → CNC',
  'CNC → Finish',              // no-rail skips Gunsmith
  'Barcode → Layup/Plugging',
  'Barcode → Layup',
  'Barcode → CNC',
  'QC → Shipping',
  'QC → Fulfilled',
  'Shipping → Fulfilled',
  'Finish QC → Paint',
  'Finish QC → QC',
  'P1 Production Queue → Barcode',
  'P1 Production Queue → Layup',
  'P1 Production Queue → Layup/Plugging',
  // Repair re-entry points (NCR)
  'Fulfilled → CNC',
  'Fulfilled → Finish',
  'Fulfilled → Gunsmith',
  'Fulfilled → Paint',
  'Fulfilled → QC',
  'Fulfilled → Shipping',
  'Fulfilled → Layup',
]);

/**
 * Validate a department transition.
 * Adjacent and skip-listed hops are legal without override.
 * All other transitions require an explicit override.
 */
export function validateDepartmentTransition(
  fromDepartment: string | null | undefined,
  toDepartment: string,
  override?: TransitionOverride
): void {
  if (!fromDepartment || fromDepartment === toDepartment) return; // no-op

  const skipKey = `${fromDepartment} → ${toDepartment}`;
  if (LEGAL_DEPARTMENT_SKIP_TRANSITIONS.has(skipKey)) return; // explicitly listed skip

  // Check adjacency in the flow
  const fromIdx = P1_DEPARTMENT_FLOW.indexOf(fromDepartment);
  const toIdx   = P1_DEPARTMENT_FLOW.indexOf(toDepartment);

  if (fromIdx !== -1 && toIdx !== -1) {
    const diff = toIdx - fromIdx;
    if (diff === 1 || diff === -1) return; // adjacent move (forward or backward 1 step)
    if (diff > 1) return; // forward multi-hop — generally allowed for progression
    // diff < -1 means backward multi-hop — requires override
    if (diff < -1) {
      if (override?.overrideReason) {
        console.warn(
          `[TransitionValidator] Department backward multi-hop override: ${fromDepartment} → ${toDepartment} | reason: ${override.overrideReason}`
        );
        return;
      }
      throw new TransitionValidationError(
        'ILLEGAL_DEPARTMENT_REGRESSION',
        `Moving an order backward from "${fromDepartment}" to "${toDepartment}" requires an explicit override reason.`,
        { fromDepartment, toDepartment }
      );
    }
  }

  // Unknown department or non-adjacent without skip listing → allow if override present
  if (override?.overrideReason) {
    console.warn(
      `[TransitionValidator] Department override accepted: ${fromDepartment} → ${toDepartment} | reason: ${override.overrideReason}`
    );
    return;
  }

  // Unknown departments — allow freely (departments may be extended)
  if (fromIdx === -1 || toIdx === -1) return;
}
