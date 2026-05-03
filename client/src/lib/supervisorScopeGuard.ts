export interface ScopeAssignment {
  employeeId: number;
}

export interface ScopedTimesheet {
  employeeId: number;
}

/**
 * Filter a list of timesheets to only those whose employeeId is covered by the
 * supervisor's assignments.
 *
 * An empty assignments list means the supervisor has no direct reports configured,
 * so the result is an empty array (least-privilege: show nothing rather than
 * leaking global data).
 */
export function filterPendingByScope<T extends ScopedTimesheet>(
  timesheets: T[],
  assignments: ScopeAssignment[]
): T[] {
  if (assignments.length === 0) return [];
  const allowed = new Set(assignments.map((a) => a.employeeId));
  return timesheets.filter((ts) => allowed.has(ts.employeeId));
}

/**
 * Return true when the supervisor is authorized to act on a timesheet belonging
 * to `timesheetEmployeeId`.
 *
 * Scope policy is strict least-privilege: if the supervisor has no assignment
 * rows configured they are denied access to any timesheet (same as the pending
 * queue returning empty). Assignments must be explicitly configured before
 * approve/reject actions are available.
 */
export function isScopeAuthorized(
  assignments: ScopeAssignment[],
  timesheetEmployeeId: number
): boolean {
  if (assignments.length === 0) return false;
  return assignments.some((a) => a.employeeId === timesheetEmployeeId);
}
