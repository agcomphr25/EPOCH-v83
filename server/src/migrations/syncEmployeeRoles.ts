/**
 * One-time idempotent migration: sync employees.user_role → users.role
 *
 * For every (employee, user) linked pair where the roles differ,
 * this updates users.role to match employees.user_role (the HR record is authoritative).
 *
 * Safe to re-run: only touches rows that are actually mismatched at the time of execution.
 */

import { pool } from '../../db';

export interface RoleMismatch {
  employeeId: number;
  employeeName: string;
  userId: number;
  username: string;
  employeeRole: string;
  userRole: string;
}

export interface SyncResult {
  mismatches: RoleMismatch[];
  fixed: number;
  dryRun: boolean;
}

/**
 * Find all linked employee↔user pairs where the roles differ.
 */
export async function findRoleMismatches(): Promise<RoleMismatch[]> {
  // Note: the project's pool.query() returns the rows array directly.
  const rows = (await pool.query(`
    SELECT
      e.id          AS employee_id,
      e.name        AS employee_name,
      u.id          AS user_id,
      u.username    AS username,
      e.user_role   AS employee_role,
      u.role        AS user_role
    FROM employees e
    JOIN users u ON u.employee_id = e.id
    WHERE e.user_role IS DISTINCT FROM u.role
    ORDER BY e.id
  `)) as Array<{
    employee_id: number;
    employee_name: string;
    user_id: number;
    username: string;
    employee_role: string;
    user_role: string;
  }>;

  return rows.map((row) => ({
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    userId: row.user_id,
    username: row.username,
    employeeRole: row.employee_role,
    userRole: row.user_role,
  }));
}

/**
 * Apply the role sync: update users.role = employees.user_role for every mismatch.
 * Idempotent — running it again when there are no mismatches is a no-op.
 *
 * @param dryRun  When true, mismatches are detected and returned but nothing is written.
 */
export async function syncEmployeeRoles(dryRun = false): Promise<SyncResult> {
  const mismatches = await findRoleMismatches();

  if (dryRun || mismatches.length === 0) {
    if (mismatches.length === 0) {
      console.log('[syncEmployeeRoles] No role mismatches found — nothing to do.');
    } else {
      console.log(
        `[syncEmployeeRoles] DRY RUN — ${mismatches.length} mismatch(es) detected, no changes written.`
      );
      for (const m of mismatches) {
        console.log(
          `  employee ${m.employeeId} (${m.employeeName}) / user ${m.userId} (${m.username}): ` +
            `employees.user_role=${m.employeeRole}  ≠  users.role=${m.userRole}`
        );
      }
    }
    return { mismatches, fixed: 0, dryRun };
  }

  console.log(`[syncEmployeeRoles] Fixing ${mismatches.length} mismatch(es)…`);

  let fixed = 0;
  for (const m of mismatches) {
    await pool.query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`,
      [m.employeeRole, m.userId]
    );
    console.log(
      `[syncEmployeeRoles] Fixed user ${m.userId} (${m.username}): ` +
        `${m.userRole} → ${m.employeeRole}`
    );
    fixed++;
  }

  console.log(`[syncEmployeeRoles] Done — ${fixed} user account(s) updated.`);
  return { mismatches, fixed, dryRun: false };
}
