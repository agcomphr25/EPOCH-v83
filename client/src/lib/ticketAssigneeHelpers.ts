export interface EmployeeForAssignee {
  id: number;
  name: string;
  userId?: number | null;
}

/**
 * Resolve a display name from a userId using the employees list.
 * Looks up by `userId` (NOT by `id`) so that the correct employee record is
 * matched when the two differ.
 */
export function getUserName(userId: number, employees: EmployeeForAssignee[]): string {
  const employee = employees.find(e => e.userId === userId);
  if (!employee) return `Employee ${userId}`;
  return employee.name;
}

/**
 * Return only employees that have a linked user account (userId is non-null).
 * Employees without a userId must be excluded from the assignee picker.
 */
export function filterAssignableEmployees(employees: EmployeeForAssignee[]): EmployeeForAssignee[] {
  return employees.filter(emp => emp.userId != null);
}

/**
 * Determine whether an employee is currently selected as an assignee.
 * Uses `emp.userId` (NOT `emp.id`) for the membership check.
 */
export function isAssigneeSelected(
  emp: EmployeeForAssignee,
  assignedUserIds: number[]
): boolean {
  if (emp.userId == null) return false;
  return assignedUserIds.includes(emp.userId);
}

/**
 * Toggle an employee in/out of the assignee list.
 * Adds or removes `emp.userId` (NOT `emp.id`).
 */
export function toggleAssignee(
  emp: EmployeeForAssignee,
  assignedUserIds: number[]
): number[] {
  if (emp.userId == null) return assignedUserIds;
  if (assignedUserIds.includes(emp.userId)) {
    return assignedUserIds.filter(id => id !== emp.userId);
  }
  return [...assignedUserIds, emp.userId];
}
