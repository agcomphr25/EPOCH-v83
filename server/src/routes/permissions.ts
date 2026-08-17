import { Router } from 'express';
import { pool } from '../../db';
import {
  getUserPermissions,
  getAllCapabilities,
  getAllRoles,
  getUserOverrides,
  getUserScopedGrants,
  getAllScopedGrants,
} from '../services/permissionService';
import { requireAdminAccess } from '../../middleware/routeAuthorization';

const router = Router();

async function optionalRows(sql: string, values: unknown[] = []) {
  try {
    return (await pool.query(sql, values)) as any[];
  } catch (error) {
    console.warn('[permissions workspace] optional read unavailable', {
      code: (error as any)?.code || 'QUERY_UNAVAILABLE',
    });
    return null;
  }
}

/**
 * Read-only authority workspace projection. This endpoint deliberately performs
 * no writes and is restricted server-side to existing administrative access.
 */
router.get('/authority-workspace', requireAdminAccess, async (_req, res) => {
  const [
    employees,
    authorizations,
    assignments,
    training,
    legacy,
    events,
    flag,
  ] = await Promise.all([
    optionalRows(`SELECT e.id,e.employee_code AS "employeeNumber",e.name,e.job_title AS "jobTitle",
      e.department,e.employment_status AS "employmentStatus",e.is_active AS "isActive",
      s.name AS supervisor,u.id AS "userId",u.username,u.role,u.is_active AS "userIsActive",
      u.access_status AS "accessStatus",
      (SELECT count(*)::int FROM perm_role_capabilities prc JOIN perm_roles pr ON pr.id=prc.role_id WHERE pr.name=u.role) AS "permissionCount",
      (SELECT count(*)::int FROM perm_user_capability_scopes x WHERE x.user_id=u.id) AS "scopedGrantCount",
      (SELECT count(*)::int FROM design_control_project_assignments d WHERE d.user_id=u.id AND d.status='ACTIVE') AS "projectAssignmentCount",
      (SELECT count(*)::int FROM training_certifications tc WHERE tc.trainee_id=e.id AND tc.status='certified' AND (tc.expires_at IS NULL OR tc.expires_at>now())) AS "activeCertificationCount",
      (SELECT count(*)::int FROM certification_authorizations ca WHERE ca.employee_id=e.id AND ca.status='ACTIVE' AND (ca.expiration_date IS NULL OR ca.expiration_date>now())) AS "activeAuthorizationCount",
      (SELECT min(ca.expiration_date) FROM certification_authorizations ca WHERE ca.employee_id=e.id AND ca.status='ACTIVE' AND ca.expiration_date>now()) AS "nextExpiration"
      FROM employees e LEFT JOIN employees s ON s.id=e.supervisor_employee_id
      LEFT JOIN users u ON u.employee_id=e.id ORDER BY e.name`),
    optionalRows(`SELECT a.*,e.name AS employee_name,e.employee_code AS employee_number,
      au.username AS approver_username FROM certification_authorizations a
      JOIN employees e ON e.id=a.employee_id LEFT JOIN users au ON au.id=a.approved_by_user_id
      ORDER BY e.name,a.authorization_type,a.updated_at DESC`),
    optionalRows(
      `SELECT d.*,u.username FROM design_control_project_assignments d JOIN users u ON u.id=d.user_id ORDER BY d.assigned_at DESC`
    ),
    optionalRows(`SELECT tc.id,tc.trainee_id,tc.status,tc.certified_at,tc.expires_at,tc.part_number,
      c.name AS certification_name FROM training_certifications tc LEFT JOIN certifications c ON c.id=tc.certification_id ORDER BY tc.created_at DESC`),
    optionalRows(
      `SELECT id,employee_id,part_number,department,certified_date,certified_by FROM p2_employee_part_certifications ORDER BY created_at DESC`
    ),
    optionalRows(
      `SELECT authorization_id,revision,event_type,reason,occurred_at,actor_user_id FROM certification_authorization_events ORDER BY occurred_at DESC LIMIT 1000`
    ),
    optionalRows(
      `SELECT key,enabled,updated_at FROM certification_authorization_feature_flags WHERE key='prospective_enforcement'`
    ),
  ]);
  const envEnabled =
    process.env.CERTIFICATION_AUTHORIZATION_ENFORCEMENT === 'true';
  const dbEnabled = flag?.[0]?.enabled;
  res.json({
    dataAvailability: {
      employees: employees !== null,
      authorizations: authorizations !== null,
      assignments: assignments !== null,
      training: training !== null,
      legacyCertifications: legacy !== null,
      auditHistory: events !== null,
      databaseFlag: flag !== null && flag.length > 0,
    },
    employees,
    authorizations,
    assignments,
    training,
    legacyCertifications: legacy,
    auditHistory: events,
    enforcement: {
      environmentEnabled: envEnabled,
      databaseEnabled: typeof dbEnabled === 'boolean' ? dbEnabled : null,
      effectiveEnabled: envEnabled,
      controllingSource: 'CERTIFICATION_AUTHORIZATION_ENFORCEMENT',
      disagreement: typeof dbEnabled === 'boolean' && dbEnabled !== envEnabled,
    },
  });
});

// ─── Current user's permissions ──────────────────────────────────────────────

/** GET /api/permissions/me — returns resolved permission set for the caller */
router.get('/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  const { id, role } = req.user as any;
  const result = await getUserPermissions(id, role);
  res.json({ permissions: result.permissions });
});

// ─── Capabilities (admin only) ────────────────────────────────────────────────

/** GET /api/permissions/capabilities */
router.get('/capabilities', requireAdminAccess, async (_req, res) => {
  const caps = await getAllCapabilities();
  res.json(caps);
});

// ─── Roles (admin only) ───────────────────────────────────────────────────────

/** GET /api/permissions/roles */
router.get('/roles', requireAdminAccess, async (_req, res) => {
  try {
    const roles = await getAllRoles();
    res.json(roles);
  } catch (err) {
    console.error('[GET /api/permissions/roles] Failed to fetch roles:', err);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

/** POST /api/permissions/roles */
router.post('/roles', requireAdminAccess, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const rows = (await pool.query(
      `INSERT INTO perm_roles (name, description) VALUES ($1, $2) RETURNING id, name, description, is_system as "isSystem"`,
      [name.toUpperCase(), description || '']
    )) as any[];
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Role already exists' });
    throw err;
  }
});

/** DELETE /api/permissions/roles/:id */
router.delete('/roles/:id', requireAdminAccess, async (req, res) => {
  const { id } = req.params;
  const rows = (await pool.query(
    'SELECT is_system FROM perm_roles WHERE id = $1',
    [id]
  )) as any[];
  if (!rows.length) return res.status(404).json({ error: 'Role not found' });
  if (rows[0].is_system)
    return res.status(403).json({ error: 'Cannot delete a system role' });
  await pool.query('DELETE FROM perm_roles WHERE id = $1', [id]);
  res.json({ ok: true });
});

/** GET /api/permissions/roles/:id/capabilities */
router.get('/roles/:id/capabilities', requireAdminAccess, async (req, res) => {
  const rows = (await pool.query(
    `SELECT pc.id, pc.key, pc.description, pc.category
       FROM perm_role_capabilities prc
       JOIN perm_capabilities pc ON pc.id = prc.capability_id
      WHERE prc.role_id = $1
      ORDER BY pc.category, pc.key`,
    [req.params.id]
  )) as any[];
  res.json(rows);
});

/** POST /api/permissions/roles/:id/capabilities — add capability to role */
router.post('/roles/:id/capabilities', requireAdminAccess, async (req, res) => {
  const { capabilityId } = req.body;
  if (!capabilityId)
    return res.status(400).json({ error: 'capabilityId is required' });
  try {
    await pool.query(
      'INSERT INTO perm_role_capabilities (role_id, capability_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, capabilityId]
    );
    res.json({ ok: true });
  } catch (err: any) {
    if (err.code === '23503')
      return res.status(404).json({ error: 'Role or capability not found' });
    throw err;
  }
});

/** DELETE /api/permissions/roles/:id/capabilities/:capId — remove capability from role */
router.delete(
  '/roles/:id/capabilities/:capId',
  requireAdminAccess,
  async (req, res) => {
    await pool.query(
      'DELETE FROM perm_role_capabilities WHERE role_id = $1 AND capability_id = $2',
      [req.params.id, req.params.capId]
    );
    res.json({ ok: true });
  }
);

// ─── User overrides (admin only) ──────────────────────────────────────────────

/** GET /api/permissions/user-overrides?userId=X */
router.get('/user-overrides', requireAdminAccess, async (req, res) => {
  const userId = parseInt(req.query.userId as string);
  if (!userId)
    return res.status(400).json({ error: 'userId query param required' });
  const overrides = await getUserOverrides(userId);
  res.json(overrides);
});

/** POST /api/permissions/user-overrides — add or update a user override */
router.post('/user-overrides', requireAdminAccess, async (req, res) => {
  const { userId, capabilityKey, effect } = req.body;
  if (!userId || !capabilityKey || !effect) {
    return res
      .status(400)
      .json({ error: 'userId, capabilityKey, effect required' });
  }
  if (!['allow', 'deny'].includes(effect)) {
    return res.status(400).json({ error: 'effect must be "allow" or "deny"' });
  }

  const capRows = (await pool.query(
    'SELECT id FROM perm_capabilities WHERE key = $1',
    [capabilityKey]
  )) as any[];
  if (!capRows.length)
    return res.status(404).json({ error: 'Capability not found' });
  const capabilityId = capRows[0].id;

  const rows = (await pool.query(
    `INSERT INTO perm_user_overrides (user_id, capability_id, effect)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, capability_id) DO UPDATE SET effect = EXCLUDED.effect
     RETURNING id`,
    [userId, capabilityId, effect]
  )) as any[];
  res.status(201).json({ id: rows[0].id });
});

/** DELETE /api/permissions/user-overrides/:id */
router.delete('/user-overrides/:id', requireAdminAccess, async (req, res) => {
  await pool.query('DELETE FROM perm_user_overrides WHERE id = $1', [
    req.params.id,
  ]);
  res.json({ ok: true });
});

/** GET /api/permissions/all-user-overrides — all overrides, joined with user info */
router.get('/all-user-overrides', requireAdminAccess, async (_req, res) => {
  const rows = (await pool.query(
    `SELECT puo.id, puo.user_id, u.username, u.first_name, u.last_name,
            pc.key as capability_key, pc.description as capability_description, puo.effect
       FROM perm_user_overrides puo
       JOIN users u ON u.id = puo.user_id
       JOIN perm_capabilities pc ON pc.id = puo.capability_id
      ORDER BY u.username, pc.key`
  )) as any[];
  res.json(rows);
});

// ─── Scoped grants (admin only) ───────────────────────────────────────────────

/** GET /api/permissions/scoped-grants?userId=X — scoped grants for a single user */
router.get('/scoped-grants', requireAdminAccess, async (req, res) => {
  const userId = parseInt(req.query.userId as string);
  if (!userId)
    return res.status(400).json({ error: 'userId query param required' });
  const grants = await getUserScopedGrants(userId);
  res.json(grants);
});

/** GET /api/permissions/all-scoped-grants — all scoped grants across all users */
router.get('/all-scoped-grants', requireAdminAccess, async (_req, res) => {
  const grants = await getAllScopedGrants();
  res.json(grants);
});

/** POST /api/permissions/scoped-grants — create a scoped grant */
router.post('/scoped-grants', requireAdminAccess, async (req, res) => {
  const { userId, capabilityKey, scopeType, department, projectId } = req.body;
  if (!userId || !capabilityKey || !scopeType) {
    return res
      .status(400)
      .json({ error: 'userId, capabilityKey, scopeType required' });
  }
  if (!['GLOBAL', 'DEPARTMENT', 'PROJECT'].includes(scopeType)) {
    return res
      .status(400)
      .json({ error: 'scopeType must be GLOBAL, DEPARTMENT, or PROJECT' });
  }
  if (scopeType === 'DEPARTMENT' && !department) {
    return res
      .status(400)
      .json({ error: 'department required for DEPARTMENT scope' });
  }
  if (scopeType === 'PROJECT' && !projectId) {
    return res
      .status(400)
      .json({ error: 'projectId required for PROJECT scope' });
  }

  const userRows = (await pool.query('SELECT id FROM users WHERE id = $1', [
    userId,
  ])) as any[];
  if (!userRows.length)
    return res.status(404).json({ error: 'User not found' });

  const capRows = (await pool.query(
    'SELECT id FROM perm_capabilities WHERE key = $1',
    [capabilityKey]
  )) as any[];
  if (!capRows.length)
    return res.status(404).json({ error: 'Capability not found' });
  const capabilityId = capRows[0].id;

  // Enforce strict scope invariants: only store fields relevant to the scope type.
  // Trim and reject whitespace-only values so malformed grants can't be created.
  const canonicalDepartment =
    scopeType === 'DEPARTMENT' ? department?.trim() || null : null;
  const canonicalProjectId =
    scopeType === 'PROJECT' ? projectId?.trim() || null : null;
  if (scopeType === 'DEPARTMENT' && !canonicalDepartment) {
    return res
      .status(400)
      .json({ error: 'department must be a non-empty string' });
  }
  if (scopeType === 'PROJECT' && !canonicalProjectId) {
    return res
      .status(400)
      .json({ error: 'projectId must be a non-empty string' });
  }

  try {
    const rows = (await pool.query(
      `INSERT INTO perm_user_capability_scopes (user_id, capability_id, scope_type, department, project_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, capabilityId, scopeType, canonicalDepartment, canonicalProjectId]
    )) as any[];
    res.status(201).json({ id: rows[0].id });
  } catch (err: any) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'Scoped grant already exists' });
    throw err;
  }
});

/** DELETE /api/permissions/scoped-grants/:id */
router.delete('/scoped-grants/:id', requireAdminAccess, async (req, res) => {
  await pool.query('DELETE FROM perm_user_capability_scopes WHERE id = $1', [
    req.params.id,
  ]);
  res.json({ ok: true });
});

export default router;
