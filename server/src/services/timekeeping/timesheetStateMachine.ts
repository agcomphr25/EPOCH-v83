/**
 * Timesheet State Machine
 *
 * Single authoritative source for all valid timesheet lifecycle transitions.
 * All mutation paths must call assertTransition() before writing to the DB.
 *
 * States:
 *   draft               → Employee is recording/editing time
 *   submitted           → Employee submitted for supervisor review
 *   certified           → Supervisor approved (previously "approved")
 *   locked              → Admin explicitly locked; correction workflow required to reopen
 *   correction_requested → Employee/admin requested a formal correction on a locked sheet
 *   correction_approved  → Correction was approved; sheet returns to draft in same transaction
 */

export const TIMESHEET_STATUSES = [
  "draft",
  "submitted",
  "certified",
  "locked",
  "correction_requested",
  "correction_approved",
] as const;

export type TimesheetStatus = typeof TIMESHEET_STATUSES[number];

/** Which roles may perform each transition. Empty array = any authenticated user. */
interface Transition {
  from: TimesheetStatus;
  to: TimesheetStatus;
  roles: string[];
}

const TRANSITIONS: Transition[] = [
  { from: "draft",                to: "submitted",            roles: [] },
  { from: "submitted",            to: "certified",            roles: ["ADMIN", "OWNER", "SUPERVISOR", "MANAGER"] },
  { from: "submitted",            to: "draft",                roles: ["ADMIN", "OWNER", "SUPERVISOR", "MANAGER"] },
  { from: "certified",            to: "locked",               roles: ["ADMIN", "OWNER"] },
  { from: "locked",               to: "correction_requested", roles: [] },
  { from: "correction_requested", to: "correction_approved",  roles: ["ADMIN", "OWNER", "MANAGER", "SUPERVISOR"] },
  { from: "correction_requested", to: "locked",               roles: ["ADMIN", "OWNER", "MANAGER", "SUPERVISOR"] },
  { from: "correction_approved",  to: "draft",                roles: ["ADMIN", "OWNER", "MANAGER", "SUPERVISOR"] },
  { from: "correction_approved",  to: "certified",            roles: ["ADMIN", "OWNER", "MANAGER", "SUPERVISOR"] },
];

export class InvalidTransitionError extends Error {
  readonly statusCode = 409;
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly reason?: string
  ) {
    super(
      reason ??
        `Transition from "${from}" to "${to}" is not permitted in the current state.`
    );
    this.name = "InvalidTransitionError";
  }
}

/**
 * Assert that a transition from `current` to `target` is valid for the given role.
 * Throws InvalidTransitionError when invalid.
 */
export function assertTransition(
  current: string,
  target: string,
  actorRole?: string | null
): void {
  const match = TRANSITIONS.find((t) => t.from === current && t.to === target);

  if (!match) {
    throw new InvalidTransitionError(
      current,
      target,
      `"${target}" is not a valid next state from "${current}". ` +
        `Allowed transitions from "${current}": ${allowedTargets(current).join(", ") || "none"}.`
    );
  }

  if (match.roles.length > 0 && (!actorRole || !match.roles.includes(actorRole))) {
    throw new InvalidTransitionError(
      current,
      target,
      `Moving a timesheet from "${current}" to "${target}" requires one of the following roles: ${match.roles.join(", ")}.`
    );
  }
}

/** Returns which statuses the given status can transition to (ignoring role constraints). */
export function allowedTargets(from: string): string[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}

/**
 * Returns true when the timesheet may be directly edited (fields like periodStart, periodEnd).
 * Only draft timesheets are editable; all other states are read-only until formally reopened.
 */
export function isEditable(status: string): boolean {
  return status === "draft";
}
