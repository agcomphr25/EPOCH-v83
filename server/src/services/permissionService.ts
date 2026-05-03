import { pool } from '../../db';

export interface ResolvedPermissions {
  permissions: string[];        // full list of granted capability keys
  permissionSet: Set<string>;   // same, for O(1) lookup
}

/**
 * Resolve the full permission set for a user.
 *
 * Resolution order:
 *   1. Load permissions granted by the user's DB role (perm_roles → perm_role_capabilities → perm_capabilities)
 *   2. Add any user-level allow overrides
 *   3. Remove any user-level deny overrides
 *
 * Falls back gracefully when the permission tables don't exist yet (migration in progress).
 */
export async function getUserPermissions(userId: number, userRole?: string): Promise<ResolvedPermissions> {
  try {
    // 1. Role-based permissions
    const roleRows = await pool.query<{ key: string }>(
      `SELECT pc.key
         FROM perm_capabilities pc
         JOIN perm_role_capabilities prc ON prc.capability_id = pc.id
         JOIN perm_roles pr ON pr.id = prc.role_id
        WHERE pr.name = $1`,
      [userRole || 'EMPLOYEE']
    );

    const granted = new Set<string>(roleRows.map((r: any) => r.key));

    // 2. User overrides
    const overrideRows = await pool.query<{ key: string; effect: string }>(
      `SELECT pc.key, puo.effect
         FROM perm_user_overrides puo
         JOIN perm_capabilities pc ON pc.id = puo.capability_id
        WHERE puo.user_id = $1`,
      [userId]
    );

    for (const row of overrideRows as any[]) {
      if (row.effect === 'allow') {
        granted.add(row.key);
      } else if (row.effect === 'deny') {
        granted.delete(row.key);
      }
    }

    return { permissionSet: granted, permissions: Array.from(granted) };
  } catch {
    // Tables may not exist yet during first boot — return empty set
    return { permissionSet: new Set(), permissions: [] };
  }
}

/** All defined capabilities grouped by category */
export async function getAllCapabilities(): Promise<{ id: number; key: string; description: string; category: string }[]> {
  try {
    return await pool.query('SELECT id, key, description, category FROM perm_capabilities ORDER BY category, key') as any[];
  } catch {
    return [];
  }
}

/** All roles with their assigned capabilities */
export async function getAllRoles(): Promise<{ id: number; name: string; description: string; isSystem: boolean; capabilities: string[] }[]> {
  const roles = await pool.query('SELECT id, name, description, is_system as "isSystem" FROM perm_roles ORDER BY name') as any[];
  const caps = await pool.query(
    `SELECT prc.role_id, pc.key
       FROM perm_role_capabilities prc
       JOIN perm_capabilities pc ON pc.id = prc.capability_id`
  ) as any[];

  const capsByRole: Record<number, string[]> = {};
  for (const c of caps) {
    if (!capsByRole[c.role_id]) capsByRole[c.role_id] = [];
    capsByRole[c.role_id].push(c.key);
  }

  return roles.map((r: any) => ({ ...r, capabilities: capsByRole[r.id] || [] }));
}

/** User-level overrides for a specific user */
export async function getUserOverrides(userId: number): Promise<{ id: number; capabilityKey: string; effect: string }[]> {
  try {
    return await pool.query(
      `SELECT puo.id, pc.key as "capabilityKey", puo.effect
         FROM perm_user_overrides puo
         JOIN perm_capabilities pc ON pc.id = puo.capability_id
        WHERE puo.user_id = $1`,
      [userId]
    ) as any[];
  } catch {
    return [];
  }
}

export interface ScopeContext {
  department?: string | null;
  projectId?: string | null;
}

/**
 * Check whether a user has a scoped capability grant that covers the given context.
 *
 * Resolution rules:
 *   - ADMIN/OWNER role bypasses all scope checks (always returns true).
 *   - If no scope rows are configured for the user+capability, fall back to the
 *     role-based permission check: the user gets global access if their role grants
 *     the capability.  Scoped restrictions only apply when explicitly configured.
 *   - GLOBAL scope always grants, regardless of context.
 *   - DEPARTMENT scope grants when context.department matches the grant's department.
 *   - PROJECT scope grants when context.projectId matches the grant's projectId.
 *   - If scope rows exist but none match the context, access is denied.
 *
 * Falls back gracefully when the table doesn't exist yet.
 */
export async function userHasScopedCapability(
  userId: number,
  userRole: string | undefined,
  capabilityKey: string,
  context: ScopeContext
): Promise<boolean> {
  if (userRole === 'ADMIN' || userRole === 'OWNER') return true;

  try {
    const rows = await pool.query(
      `SELECT pucs.scope_type, pucs.department, pucs.project_id
         FROM perm_user_capability_scopes pucs
         JOIN perm_capabilities pc ON pc.id = pucs.capability_id
        WHERE pucs.user_id = $1
          AND pc.key = $2`,
      [userId, capabilityKey]
    ) as any[];

    if (rows.length === 0) {
      // No fine-grained scope rows configured for this user+capability.
      // Fall back to role-based check: if the role grants the capability, allow globally.
      const { permissionSet } = await getUserPermissions(userId, userRole);
      return permissionSet.has(capabilityKey);
    }

    for (const row of rows) {
      if (row.scope_type === 'GLOBAL') return true;
      if (row.scope_type === 'DEPARTMENT' && context.department && row.department === context.department) return true;
      if (row.scope_type === 'PROJECT' && context.projectId && row.project_id === context.projectId) return true;
    }

    return false;
  } catch (err) {
    // Fail-closed: deny access on unexpected errors.
    // Log so DB issues don't silently masquerade as authorization denials.
    console.warn('[userHasScopedCapability] Unexpected DB error — denying access', { userId, capabilityKey, err });
    return false;
  }
}

/** All scoped grants for a specific user */
export async function getUserScopedGrants(userId: number): Promise<{
  id: number;
  capabilityKey: string;
  capabilityDescription: string;
  scopeType: string;
  department: string | null;
  projectId: string | null;
  createdAt: string;
}[]> {
  try {
    return await pool.query(
      `SELECT pucs.id, pc.key as "capabilityKey", pc.description as "capabilityDescription",
              pucs.scope_type as "scopeType", pucs.department, pucs.project_id as "projectId",
              pucs.created_at as "createdAt"
         FROM perm_user_capability_scopes pucs
         JOIN perm_capabilities pc ON pc.id = pucs.capability_id
        WHERE pucs.user_id = $1
        ORDER BY pc.key, pucs.scope_type`,
      [userId]
    ) as any[];
  } catch {
    return [];
  }
}

/** All scoped grants across all users */
export async function getAllScopedGrants(): Promise<{
  id: number;
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  capabilityKey: string;
  scopeType: string;
  department: string | null;
  projectId: string | null;
}[]> {
  try {
    return await pool.query(
      `SELECT pucs.id, pucs.user_id as "userId", u.username, u.first_name as "firstName", u.last_name as "lastName",
              pc.key as "capabilityKey", pucs.scope_type as "scopeType",
              pucs.department, pucs.project_id as "projectId"
         FROM perm_user_capability_scopes pucs
         JOIN users u ON u.id = pucs.user_id
         JOIN perm_capabilities pc ON pc.id = pucs.capability_id
        ORDER BY u.username, pc.key`
    ) as any[];
  } catch {
    return [];
  }
}
