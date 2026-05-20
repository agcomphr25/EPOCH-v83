/**
 * Material-issue override reason-code catalog and policy matrix
 * (Task #144 Step 6).
 *
 * Each reason code below is the only authorized way to bypass a
 * specific Phase-1/Phase-2 gate. The catalog is the single source of
 * truth — the gate layer reads it to decide whether an override payload
 * is allowed to clear a given blocker.
 *
 * Adding a new reason code REQUIRES:
 *   1. A new entry below with `bypassesGates`, `allowedRoles`, and a
 *      one-line `description` suitable for showing in an approver UI.
 *   2. Mention in `docs/EPOCH_ARCHITECTURE_CONSTITUTION.md` § Section 10.
 *
 * Removing a reason code is **never** allowed once it has appeared in a
 * shipped ledger row — the ledger references the code as immutable
 * evidence and the catalog must keep returning a description for it.
 */

import type { MaterialIssueBlockerCode } from './materialIssueGates';

export type MaterialIssueOverrideReason =
  | 'ROUTING_STEP_BYPASS'
  | 'WAD_LATE_RELEASE'
  | 'DOCUMENT_HOLD_RELEASE'
  | 'LOT_QUARANTINE_DEVIATION'
  | 'EMERGENCY_PRODUCTION';

export interface MaterialIssueOverrideReasonSpec {
  reason: MaterialIssueOverrideReason;
  description: string;
  /** Which gate blockers this reason is authorized to bypass. */
  bypassesGates: ReadonlyArray<MaterialIssueBlockerCode>;
  /**
   * Roles authorized to approve this override. The string values match
   * the `role` strings stored on `users.role` and on `perm_roles.code`.
   */
  allowedRoles: ReadonlyArray<string>;
  /** True when an explicit free-text reason is required from the approver. */
  requiresWrittenReason: boolean;
}

const CATALOG: Record<MaterialIssueOverrideReason, MaterialIssueOverrideReasonSpec> = {
  ROUTING_STEP_BYPASS: {
    reason: 'ROUTING_STEP_BYPASS',
    description:
      'Allow material to be issued or consumed against a routing step ' +
      'other than the traveler’s active step. Use only when production ' +
      'sequence has been formally re-planned and the deviation is documented.',
    bypassesGates: ['WRONG_ROUTING_STEP', 'ROUTING_STEP_NOT_ACTIVE'],
    allowedRoles: ['Production Supervisor', 'Manufacturing Manager'],
    requiresWrittenReason: true,
  },
  WAD_LATE_RELEASE: {
    reason: 'WAD_LATE_RELEASE',
    description:
      'Allow material draw against a WAD that is APPROVED but not yet ' +
      'RELEASED in the system because of a paperwork lag. Requires ' +
      'manager approval and is reconciled within the same shift.',
    bypassesGates: ['WAD_NOT_RELEASED'],
    allowedRoles: ['Manufacturing Manager'],
    requiresWrittenReason: true,
  },
  DOCUMENT_HOLD_RELEASE: {
    reason: 'DOCUMENT_HOLD_RELEASE',
    description:
      'Allow a one-time material draw from a document-held lot only after ' +
      'Quality confirms the missing cert package has a governed temporary release.',
    bypassesGates: ['LOT_DOCUMENT_HELD'],
    allowedRoles: ['Quality Manager', 'Compliance Manager'],
    requiresWrittenReason: true,
  },
  LOT_QUARANTINE_DEVIATION: {
    reason: 'LOT_QUARANTINE_DEVIATION',
    description:
      'Issue material from a lot still in QUARANTINE under an authorized ' +
      'engineering deviation. Quality must have signed off in NCR.',
    bypassesGates: ['LOT_QUARANTINED'],
    allowedRoles: ['Quality Manager'],
    requiresWrittenReason: true,
  },
  EMERGENCY_PRODUCTION: {
    reason: 'EMERGENCY_PRODUCTION',
    description:
      'Top-level emergency override. May bypass any single gate. Requires ' +
      'Owner / Plant Manager approval and triggers a mandatory post-incident review.',
    // EMERGENCY_PRODUCTION intentionally does NOT include any
    // routing-step blocker. Routing-step bypass is the most tightly-
    // scoped control in the catalog and must always go through
    // `ROUTING_STEP_BYPASS` so production-supervisor / manufacturing-
    // manager sign off, never through the broader emergency path.
    bypassesGates: [
      'WAD_NOT_RELEASED',
      'LOT_QUARANTINED',
      'LOT_DOCUMENT_HELD',
    ],
    allowedRoles: ['OWNER', 'Plant Manager'],
    requiresWrittenReason: true,
  },
};

export interface MaterialIssueOverridePayload {
  reason: MaterialIssueOverrideReason;
  /**
   * UUID of the row in `material_issue_approvals` that authorizes this
   * bypass. Required: the service loads the row, verifies it is APPROVED,
   * not expired, scoped to the same lot/traveler/blocker, and atomically
   * marks it CONSUMED in the same transaction as the ledger write.
   * Approval rows are single-use and cannot be reused once consumed.
   */
  approvalId: string;
  /**
   * The user id of the approver. Required so the service can cross-check
   * the supplied approval row against the approver identity AND
   * server-verify the approver's role against `users.role`. Caller-
   * supplied `approverRole` / `approverDisplayName` are advisory only
   * and are overwritten with the DB-resolved values before being
   * stamped on the ledger.
   */
  approverUserId: number;
  approverDisplayName?: string;
  approverRole?: string;
  writtenReason: string;
}

export interface OverrideValidationResult {
  ok: boolean;
  /** When `ok = false`, why the override is rejected. */
  message?: string;
}

/**
 * Returns true when `override` is well-formed AND authorizes a bypass of
 * `blocker`. The caller is responsible for verifying that the approver
 * is actually who they claim to be (badge / SSO / signed action token);
 * this function only enforces policy, not authentication.
 */
export function evaluateOverride(
  override: MaterialIssueOverridePayload | null | undefined,
  blocker: MaterialIssueBlockerCode,
): OverrideValidationResult {
  if (!override) return { ok: false, message: 'No override payload supplied.' };
  const spec = CATALOG[override.reason];
  if (!spec) {
    return { ok: false, message: `Unknown override reason: ${override.reason}.` };
  }
  if (!spec.bypassesGates.includes(blocker)) {
    return {
      ok: false,
      message:
        `Override reason ${override.reason} does not authorize bypassing ${blocker}.`,
    };
  }
  if (!override.approverRole || !spec.allowedRoles.includes(override.approverRole)) {
    return {
      ok: false,
      message:
        `Role ${override.approverRole ?? '(none)'} is not authorized to approve ${override.reason}. ` +
        `Allowed: ${spec.allowedRoles.join(', ')}.`,
    };
  }
  if (
    spec.requiresWrittenReason &&
    (!override.writtenReason || override.writtenReason.trim().length < 10)
  ) {
    return {
      ok: false,
      message:
        `Override reason ${override.reason} requires a written reason of ` +
        `at least 10 characters.`,
    };
  }
  if (!override.approverDisplayName || !override.approverDisplayName.trim()) {
    return { ok: false, message: 'Override requires an approver display name.' };
  }
  if (override.approverUserId == null || !Number.isFinite(override.approverUserId)) {
    return { ok: false, message: 'Override requires a server-verified approverUserId.' };
  }
  if (!override.approvalId || typeof override.approvalId !== 'string') {
    return {
      ok: false,
      message:
        'Override requires an approvalId referencing a material_issue_approvals row.',
    };
  }
  return { ok: true };
}

export function getOverrideReasonSpec(
  reason: MaterialIssueOverrideReason,
): MaterialIssueOverrideReasonSpec | undefined {
  return CATALOG[reason];
}

export function listOverrideReasons(): ReadonlyArray<MaterialIssueOverrideReasonSpec> {
  return Object.values(CATALOG);
}
