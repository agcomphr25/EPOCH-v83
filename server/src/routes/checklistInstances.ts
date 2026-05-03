import { Router, Request, Response } from 'express';
import { pool } from '../../db';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { generateInstancesForEmployee, createSingleInstance } from '../services/checklistInstanceService';
import { DEFAULT_CHECKLISTS_LIMIT, MAX_CHECKLISTS_LIMIT } from '../constants/checklists';

const router = Router();

const adminOnly = [authenticateToken, requireRole('ADMIN', 'OWNER')];
const authRequired = [authenticateToken];

function isAdminOrOwner(user: any): boolean {
  const role = (user?.role || '').toUpperCase();
  return role === 'ADMIN' || role === 'OWNER';
}

function assertOwnerOrAdmin(req: Request, res: Response, requestedEmployeeId: number): boolean {
  const user = (req as any).user;
  if (isAdminOrOwner(user)) return true;
  if (user?.employeeId && Number(user.employeeId) === requestedEmployeeId) return true;
  res.status(403).json({ error: 'Forbidden: you can only access your own checklist data' });
  return false;
}

router.get('/active', ...authRequired, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.query;
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    if (!assertOwnerOrAdmin(req, res, Number(employeeId))) return;

    const today = new Date().toISOString().split('T')[0];
    const instances = await generateInstancesForEmployee(Number(employeeId), today, 'daily');
    res.json(instances);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/history', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { employeeId, templateId, from, to, status, limit = String(DEFAULT_CHECKLISTS_LIMIT), offset = '0' } = req.query;
    const parsedLimit = parseInt(String(limit), 10);
    const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_CHECKLISTS_LIMIT)
      : DEFAULT_CHECKLISTS_LIMIT;

    let query = `
      SELECT ci.*,
        ct.name as template_name,
        e.name as employee_name,
        e.department as employee_department
      FROM checklist_instances ci
      JOIN checklist_templates ct ON ct.id = ci.template_id
      JOIN employees e ON e.id = ci.employee_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (employeeId) {
      paramCount++;
      query += ` AND ci.employee_id = $${paramCount}`;
      params.push(employeeId);
    }
    if (templateId) {
      paramCount++;
      query += ` AND ci.template_id = $${paramCount}`;
      params.push(templateId);
    }
    if (from) {
      paramCount++;
      query += ` AND ci.context_date >= $${paramCount}`;
      params.push(from);
    }
    if (to) {
      paramCount++;
      query += ` AND ci.context_date <= $${paramCount}`;
      params.push(to);
    }
    if (status) {
      paramCount++;
      query += ` AND ci.status = $${paramCount}`;
      params.push(status);
    }

    paramCount++;
    query += ` ORDER BY ci.context_date DESC, ci.created_at DESC LIMIT $${paramCount}`;
    params.push(effectiveLimit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(Number(offset));

    const results = await pool.query(query, params);

    let countQuery = `
      SELECT COUNT(*) as total
      FROM checklist_instances ci
      WHERE 1=1
    `;
    const countParams: any[] = [];
    let countParamCount = 0;

    if (employeeId) {
      countParamCount++;
      countQuery += ` AND ci.employee_id = $${countParamCount}`;
      countParams.push(employeeId);
    }
    if (templateId) {
      countParamCount++;
      countQuery += ` AND ci.template_id = $${countParamCount}`;
      countParams.push(templateId);
    }
    if (from) {
      countParamCount++;
      countQuery += ` AND ci.context_date >= $${countParamCount}`;
      countParams.push(from);
    }
    if (to) {
      countParamCount++;
      countQuery += ` AND ci.context_date <= $${countParamCount}`;
      countParams.push(to);
    }
    if (status) {
      countParamCount++;
      countQuery += ` AND ci.status = $${countParamCount}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult[0]?.total || '0', 10);

    res.json({ data: results || [], total, limit: effectiveLimit, offset: Number(offset) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/active-all', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { date, department, status } = req.query;
    const targetDate = date ? String(date) : new Date().toISOString().split('T')[0];

    let query = `
      SELECT ci.*, ct.name as template_name, e.name as employee_name, e.department as employee_department,
        (SELECT COUNT(*) FROM checklist_instance_items WHERE instance_id = ci.id) as total_items,
        (SELECT COUNT(*) FROM checklist_instance_items WHERE instance_id = ci.id AND completed = true) as completed_items
      FROM checklist_instances ci
      JOIN checklist_templates ct ON ct.id = ci.template_id
      JOIN employees e ON e.id = ci.employee_id
      WHERE ci.context_date = $1
    `;
    const params: any[] = [targetDate];
    let paramCount = 1;

    if (department) {
      paramCount++;
      query += ` AND e.department = $${paramCount}`;
      params.push(department);
    }
    if (status) {
      paramCount++;
      query += ` AND ci.status = $${paramCount}`;
      params.push(status);
    }

    query += ` ORDER BY e.name, ct.name`;

    const results = await pool.query(query, params);
    res.json(results || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', ...authRequired, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await pool.query(
      `SELECT ci.*, ct.name as template_name, e.name as employee_name
       FROM checklist_instances ci
       JOIN checklist_templates ct ON ct.id = ci.template_id
       JOIN employees e ON e.id = ci.employee_id
       WHERE ci.id = $1`,
      [id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Instance not found' });
    if (!assertOwnerOrAdmin(req, res, rows[0].employee_id)) return;
    const items = await pool.query(
      `SELECT * FROM checklist_instance_items WHERE instance_id = $1 ORDER BY sort_order`,
      [id]
    );
    res.json({ ...rows[0], items: items || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/items', ...authRequired, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const instanceRows = await pool.query(
      `SELECT employee_id FROM checklist_instances WHERE id = $1`,
      [id]
    );
    if (!instanceRows || instanceRows.length === 0) return res.status(404).json({ error: 'Instance not found' });
    if (!assertOwnerOrAdmin(req, res, instanceRows[0].employee_id)) return;
    const items = await pool.query(
      `SELECT * FROM checklist_instance_items WHERE instance_id = $1 ORDER BY sort_order`,
      [id]
    );
    res.json(items || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/events', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const events = await pool.query(
      `SELECT * FROM checklist_instance_events WHERE instance_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    res.json(events || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { templateId, employeeId, contextDate, contextType = 'daily' } = req.body;
    if (!templateId || !employeeId || !contextDate) {
      return res.status(400).json({ error: 'templateId, employeeId, and contextDate are required' });
    }
    const actor = (req as any).user;
    const instance = await createSingleInstance(
      Number(templateId),
      Number(employeeId),
      String(contextDate),
      String(contextType),
      { userId: actor?.userId || null, displayName: actor?.displayName || null }
    );
    res.status(201).json(instance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/status', ...authRequired, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'in_progress', 'completed', 'reviewed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const actor = (req as any).user;
    const ownerCheck = await pool.query(`SELECT employee_id FROM checklist_instances WHERE id = $1`, [id]);
    if (!ownerCheck || ownerCheck.length === 0) return res.status(404).json({ error: 'Instance not found' });
    if (!assertOwnerOrAdmin(req, res, ownerCheck[0].employee_id)) return;

    const result = await pool.query(
      `UPDATE checklist_instances
       SET status = $1, updated_at = NOW(),
           completed_at = CASE WHEN $1 = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (!result || result.length === 0) return res.status(404).json({ error: 'Instance not found' });

    await pool.query(
      `INSERT INTO checklist_instance_events (instance_id, event_type, actor_user_id, actor_display_name, new_value)
       VALUES ($1, 'status_changed', $2, $3, $4)`,
      [id, actor?.userId || null, actor?.displayName || null, status]
    );

    res.json(result[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/items/:itemId', ...authRequired, async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { value, completed } = req.body;
    const actor = (req as any).user;

    const existing = await pool.query(
      `SELECT cii.*, ci.employee_id FROM checklist_instance_items cii
       JOIN checklist_instances ci ON ci.id = cii.instance_id
       WHERE cii.id = $1`,
      [itemId]
    );
    if (!existing || existing.length === 0) return res.status(404).json({ error: 'Item not found' });
    if (!assertOwnerOrAdmin(req, res, existing[0].employee_id)) return;

    const prev = existing[0];
    const newCompleted = completed !== undefined ? Boolean(completed) : Boolean(value);

    const result = await pool.query(
      `UPDATE checklist_instance_items
       SET value = COALESCE($1, value),
           completed = $2,
           completed_at = CASE WHEN $2 = true AND completed_at IS NULL THEN NOW() ELSE completed_at END,
           completed_by_user_id = CASE WHEN $2 = true AND completed_by_user_id IS NULL THEN $3 ELSE completed_by_user_id END,
           completed_by_display_name = CASE WHEN $2 = true AND completed_by_display_name IS NULL THEN $4 ELSE completed_by_display_name END
       WHERE id = $5 RETURNING *`,
      [value || null, newCompleted, actor?.userId || null, actor?.displayName || null, itemId]
    );

    await pool.query(
      `INSERT INTO checklist_instance_events (instance_id, instance_item_id, event_type, actor_user_id, actor_display_name, previous_value, new_value)
       VALUES ($1, $2, 'item_updated', $3, $4, $5, $6)`,
      [prev.instance_id, itemId, actor?.userId || null, actor?.displayName || null, prev.value, value || null]
    );

    const allItems = await pool.query(
      `SELECT completed, required FROM checklist_instance_items WHERE instance_id = $1`,
      [prev.instance_id]
    );
    const allRequired = (allItems || []).filter((i: any) => i.required);
    const allRequiredDone = allRequired.length > 0 && allRequired.every((i: any) => i.completed);
    const anyDone = (allItems || []).some((i: any) => i.completed);

    let newStatus = 'pending';
    if (allRequiredDone || (allItems || []).every((i: any) => i.completed)) newStatus = 'completed';
    else if (anyDone) newStatus = 'in_progress';

    await pool.query(
      `UPDATE checklist_instances
       SET status = $1,
           completed_at = CASE WHEN $1 = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $2`,
      [newStatus, prev.instance_id]
    );

    res.json(result[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/items/:itemId/toggle', ...authRequired, async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const actor = (req as any).user;

    const existing = await pool.query(
      `SELECT cii.*, ci.employee_id FROM checklist_instance_items cii
       JOIN checklist_instances ci ON ci.id = cii.instance_id
       WHERE cii.id = $1`,
      [itemId]
    );
    if (!existing || existing.length === 0) return res.status(404).json({ error: 'Item not found' });
    if (!assertOwnerOrAdmin(req, res, existing[0].employee_id)) return;

    const prev = existing[0];
    const newCompleted = !prev.completed;

    const result = await pool.query(
      `UPDATE checklist_instance_items
       SET completed = $1,
           completed_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
           completed_by_user_id = CASE WHEN $1 = true THEN $2 ELSE NULL END,
           completed_by_display_name = CASE WHEN $1 = true THEN $3 ELSE NULL END
       WHERE id = $4 RETURNING *`,
      [newCompleted, actor?.userId || null, actor?.displayName || null, itemId]
    );

    await pool.query(
      `INSERT INTO checklist_instance_events (instance_id, instance_item_id, event_type, actor_user_id, actor_display_name, previous_value, new_value)
       VALUES ($1, $2, 'item_toggled', $3, $4, $5, $6)`,
      [prev.instance_id, itemId, actor?.userId || null, actor?.displayName || null, String(prev.completed), String(newCompleted)]
    );

    const allItems = await pool.query(
      `SELECT completed, required FROM checklist_instance_items WHERE instance_id = $1`,
      [prev.instance_id]
    );
    const anyDone = (allItems || []).some((i: any) => i.completed);
    const allRequired = (allItems || []).filter((i: any) => i.required);
    const allRequiredDone = allRequired.length > 0 && allRequired.every((i: any) => i.completed);
    const allDone = (allItems || []).every((i: any) => i.completed);

    let newStatus = 'pending';
    if (allDone || allRequiredDone) newStatus = 'completed';
    else if (anyDone) newStatus = 'in_progress';

    await pool.query(
      `UPDATE checklist_instances
       SET status = $1,
           completed_at = CASE WHEN $1 = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $2`,
      [newStatus, prev.instance_id]
    );

    res.json(result[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/review', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const actor = (req as any).user;
    const { notes } = req.body;

    const result = await pool.query(
      `UPDATE checklist_instances
       SET status = 'reviewed', reviewed_at = NOW(),
           reviewed_by_user_id = $1, reviewed_by_display_name = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [actor?.userId || null, actor?.displayName || null, id]
    );
    if (!result || result.length === 0) return res.status(404).json({ error: 'Instance not found' });

    await pool.query(
      `INSERT INTO checklist_instance_events (instance_id, event_type, actor_user_id, actor_display_name, metadata)
       VALUES ($1, 'reviewed', $2, $3, $4::jsonb)`,
      [id, actor?.userId || null, actor?.displayName || null, JSON.stringify({ notes })]
    );

    res.json(result[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
