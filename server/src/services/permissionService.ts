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
  try {
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
  } catch {
    return [];
  }
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
