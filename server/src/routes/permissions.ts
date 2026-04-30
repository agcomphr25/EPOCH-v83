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
    const rows = await pool.query(
      `INSERT INTO perm_roles (name, description) VALUES ($1, $2) RETURNING id, name, description, is_system as "isSystem"`,
      [name.toUpperCase(), description || '']
    ) as any[];
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Role already exists' });
    throw err;
  }
});

/** DELETE /api/permissions/roles/:id */
router.delete('/roles/:id', requireAdminAccess, async (req, res) => {
  const { id } = req.params;
  const rows = await pool.query('SELECT is_system FROM perm_roles WHERE id = $1', [id]) as any[];
  if (!rows.length) return res.status(404).json({ error: 'Role not found' });
  if (rows[0].is_system) return res.status(403).json({ error: 'Cannot delete a system role' });
  await pool.query('DELETE FROM perm_roles WHERE id = $1', [id]);
  res.json({ ok: true });
});

/** GET /api/permissions/roles/:id/capabilities */
router.get('/roles/:id/capabilities', requireAdminAccess, async (req, res) => {
  const rows = await pool.query(
    `SELECT pc.id, pc.key, pc.description, pc.category
       FROM perm_role_capabilities prc
       JOIN perm_capabilities pc ON pc.id = prc.capability_id
      WHERE prc.role_id = $1
      ORDER BY pc.category, pc.key`,
    [req.params.id]
  ) as any[];
  res.json(rows);
});

/** POST /api/permissions/roles/:id/capabilities — add capability to role */
router.post('/roles/:id/capabilities', requireAdminAccess, async (req, res) => {
  const { capabilityId } = req.body;
  if (!capabilityId) return res.status(400).json({ error: 'capabilityId is required' });
  try {
    await pool.query(
      'INSERT INTO perm_role_capabilities (role_id, capability_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, capabilityId]
    );
    res.json({ ok: true });
  } catch (err: any) {
    if (err.code === '23503') return res.status(404).json({ error: 'Role or capability not found' });
    throw err;
  }
});

/** DELETE /api/permissions/roles/:id/capabilities/:capId — remove capability from role */
router.delete('/roles/:id/capabilities/:capId', requireAdminAccess, async (req, res) => {
  await pool.query(
    'DELETE FROM perm_role_capabilities WHERE role_id = $1 AND capability_id = $2',
    [req.params.id, req.params.capId]
  );
  res.json({ ok: true });
});

// ─── User overrides (admin only) ──────────────────────────────────────────────

/** GET /api/permissions/user-overrides?userId=X */
router.get('/user-overrides', requireAdminAccess, async (req, res) => {
  const userId = parseInt(req.query.userId as string);
  if (!userId) return res.status(400).json({ error: 'userId query param required' });
  const overrides = await getUserOverrides(userId);
  res.json(overrides);
});

/** POST /api/permissions/user-overrides — add or update a user override */
router.post('/user-overrides', requireAdminAccess, async (req, res) => {
  const { userId, capabilityKey, effect } = req.body;
  if (!userId || !capabilityKey || !effect) {
    return res.status(400).json({ error: 'userId, capabilityKey, effect required' });
  }
  if (!['allow', 'deny'].includes(effect)) {
    return res.status(400).json({ error: 'effect must be "allow" or "deny"' });
  }

  const capRows = await pool.query('SELECT id FROM perm_capabilities WHERE key = $1', [capabilityKey]) as any[];
  if (!capRows.length) return res.status(404).json({ error: 'Capability not found' });
  const capabilityId = capRows[0].id;

  const rows = await pool.query(
    `INSERT INTO perm_user_overrides (user_id, capability_id, effect)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, capability_id) DO UPDATE SET effect = EXCLUDED.effect
     RETURNING id`,
    [userId, capabilityId, effect]
  ) as any[];
  res.status(201).json({ id: rows[0].id });
});

/** DELETE /api/permissions/user-overrides/:id */
router.delete('/user-overrides/:id', requireAdminAccess, async (req, res) => {
  await pool.query('DELETE FROM perm_user_overrides WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

/** GET /api/permissions/all-user-overrides — all overrides, joined with user info */
router.get('/all-user-overrides', requireAdminAccess, async (_req, res) => {
  const rows = await pool.query(
    `SELECT puo.id, puo.user_id, u.username, u.first_name, u.last_name,
            pc.key as capability_key, pc.description as capability_description, puo.effect
       FROM perm_user_overrides puo
       JOIN users u ON u.id = puo.user_id
       JOIN perm_capabilities pc ON pc.id = puo.capability_id
      ORDER BY u.username, pc.key`
  ) as any[];
  res.json(rows);
});

// ─── Scoped grants (admin only) ───────────────────────────────────────────────

/** GET /api/permissions/scoped-grants?userId=X — scoped grants for a single user */
router.get('/scoped-grants', requireAdminAccess, async (req, res) => {
  const userId = parseInt(req.query.userId as string);
  if (!userId) return res.status(400).json({ error: 'userId query param required' });
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
    return res.status(400).json({ error: 'userId, capabilityKey, scopeType required' });
  }
  if (!['GLOBAL', 'DEPARTMENT', 'PROJECT'].includes(scopeType)) {
    return res.status(400).json({ error: 'scopeType must be GLOBAL, DEPARTMENT, or PROJECT' });
  }
  if (scopeType === 'DEPARTMENT' && !department) {
    return res.status(400).json({ error: 'department required for DEPARTMENT scope' });
  }
  if (scopeType === 'PROJECT' && !projectId) {
    return res.status(400).json({ error: 'projectId required for PROJECT scope' });
  }

  const userRows = await pool.query('SELECT id FROM users WHERE id = $1', [userId]) as any[];
  if (!userRows.length) return res.status(404).json({ error: 'User not found' });

  const capRows = await pool.query('SELECT id FROM perm_capabilities WHERE key = $1', [capabilityKey]) as any[];
  if (!capRows.length) return res.status(404).json({ error: 'Capability not found' });
  const capabilityId = capRows[0].id;

  // Enforce strict scope invariants: only store fields relevant to the scope type.
  // Trim and reject whitespace-only values so malformed grants can't be created.
  const canonicalDepartment = scopeType === 'DEPARTMENT' ? (department?.trim() || null) : null;
  const canonicalProjectId  = scopeType === 'PROJECT'    ? (projectId?.trim()  || null) : null;
  if (scopeType === 'DEPARTMENT' && !canonicalDepartment) {
    return res.status(400).json({ error: 'department must be a non-empty string' });
  }
  if (scopeType === 'PROJECT' && !canonicalProjectId) {
    return res.status(400).json({ error: 'projectId must be a non-empty string' });
  }

  try {
    const rows = await pool.query(
      `INSERT INTO perm_user_capability_scopes (user_id, capability_id, scope_type, department, project_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, capabilityId, scopeType, canonicalDepartment, canonicalProjectId]
    ) as any[];
    res.status(201).json({ id: rows[0].id });
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Scoped grant already exists' });
    throw err;
  }
});

/** DELETE /api/permissions/scoped-grants/:id */
router.delete('/scoped-grants/:id', requireAdminAccess, async (req, res) => {
  await pool.query('DELETE FROM perm_user_capability_scopes WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
