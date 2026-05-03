import { Router, Request, Response } from 'express';
import { pool } from '../../db';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { DEFAULT_CHECKLISTS_LIMIT, MAX_CHECKLISTS_LIMIT } from '../constants/checklists';

const router = Router();

const adminOnly = [authenticateToken, requireRole('ADMIN', 'OWNER')];
const authRequired = [authenticateToken];

router.get('/templates', ...adminOnly, async (_req: Request, res: Response) => {
  try {
    const templates = await pool.query(
      `SELECT ct.*, 
        (SELECT COUNT(*) FROM checklist_template_items WHERE template_id = ct.id) as item_count,
        (SELECT COUNT(*) FROM checklist_assignments WHERE template_id = ct.id AND is_active = true) as assignment_count
       FROM checklist_templates ct
       ORDER BY ct.created_at DESC`
    );
    res.json(templates);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/templates/:id', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const templates = await pool.query(
      `SELECT * FROM checklist_templates WHERE id = $1`, [id]
    );
    if (!templates || templates.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const items = await pool.query(
      `SELECT * FROM checklist_template_items WHERE template_id = $1 ORDER BY sort_order`, [id]
    );
    const assignments = await pool.query(
      `SELECT ca.*,
              e.name as employee_name,
              e.department as employee_department,
              COALESCE(ca.assignment_type, 'employee') as assignment_type
       FROM checklist_assignments ca
       LEFT JOIN employees e ON e.id = ca.employee_id
       WHERE ca.template_id = $1
       ORDER BY ca.assignment_type, e.name NULLS LAST, ca.department_name, ca.role_key`, [id]
    );
    res.json({ ...templates[0], items: items || [], assignments: assignments || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/templates', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { name, description, department, isActive, enforceClockOut, items } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await pool.query(
      `INSERT INTO checklist_templates (name, description, department, is_active, enforce_clock_out)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description || null, department || null, isActive !== false, enforceClockOut !== false]
    );
    const template = result[0];

    if (items && Array.isArray(items) && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await pool.query(
          `INSERT INTO checklist_template_items (template_id, label, type, options, required, frequency, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [template.id, item.label, item.type || 'checkbox', item.options ? JSON.stringify(item.options) : null, item.required || false, item.frequency || 'DAILY', i]
        );
      }
    }

    res.status(201).json(template);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/templates/:id', ...adminOnly, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { name, description, department, isActive, enforceClockOut, items } = req.body;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE checklist_templates 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description),
           department = COALESCE($3, department),
           is_active = COALESCE($4, is_active),
           enforce_clock_out = COALESCE($5, enforce_clock_out),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, description, department, isActive, enforceClockOut, id]
    );
    if (!result.rows || result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Template not found' });
    }

    if (items !== undefined && Array.isArray(items)) {
      await client.query(
        `DELETE FROM checklist_template_items WHERE template_id = $1`,
        [id]
      );
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await client.query(
          `INSERT INTO checklist_template_items (template_id, label, type, options, required, frequency, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, item.label, item.type || 'checkbox', item.options ? JSON.stringify(item.options) : null, item.required || false, item.frequency || 'DAILY', item.sortOrder ?? item.sort_order ?? i]
        );
      }
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

router.delete('/templates/:id', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM checklist_templates WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/templates/:id/items', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, type, options, required, frequency, sortOrder } = req.body;
    if (!label) return res.status(400).json({ error: 'Label is required' });

    const result = await pool.query(
      `INSERT INTO checklist_template_items (template_id, label, type, options, required, frequency, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, label, type || 'checkbox', options ? JSON.stringify(options) : null, required || false, frequency || 'DAILY', sortOrder || 0]
    );
    res.status(201).json(result[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/templates/:templateId/items/:itemId', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { label, type, options, required, frequency, sortOrder } = req.body;

    const result = await pool.query(
      `UPDATE checklist_template_items
       SET label = COALESCE($1, label),
           type = COALESCE($2, type),
           options = COALESCE($3, options),
           required = COALESCE($4, required),
           frequency = COALESCE($5, frequency),
           sort_order = COALESCE($6, sort_order)
       WHERE id = $7 RETURNING *`,
      [label, type, options ? JSON.stringify(options) : null, required, frequency, sortOrder, itemId]
    );
    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(result[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/templates/:templateId/items/:itemId', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    await pool.query(`DELETE FROM checklist_template_items WHERE id = $1`, [itemId]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/templates/:id/assignments', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const assignments = await pool.query(
      `SELECT ca.*,
              e.name as employee_name,
              e.department as employee_department,
              COALESCE(ca.assignment_type, 'employee') as assignment_type
       FROM checklist_assignments ca
       LEFT JOIN employees e ON e.id = ca.employee_id
       WHERE ca.template_id = $1
       ORDER BY ca.assignment_type, e.name NULLS LAST, ca.department_name, ca.role_key`, [id]
    );
    res.json(assignments || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/assignments', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { templateId, employeeId, isActive, startDate, endDate, assignmentType = 'employee', departmentName, roleKey } = req.body;
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });

    if (assignmentType === 'department' && departmentName) {
      const result = await pool.query(
        `INSERT INTO checklist_assignments (template_id, assignment_type, department_name, is_active, start_date, end_date)
         VALUES ($1, 'department', $2, $3, $4, $5)
         RETURNING *`,
        [templateId, departmentName, isActive !== false, startDate || null, endDate || null]
      );
      return res.status(201).json(result[0]);
    }

    if (assignmentType === 'role' && roleKey) {
      const result = await pool.query(
        `INSERT INTO checklist_assignments (template_id, assignment_type, role_key, is_active, start_date, end_date)
         VALUES ($1, 'role', $2, $3, $4, $5)
         RETURNING *`,
        [templateId, roleKey, isActive !== false, startDate || null, endDate || null]
      );
      return res.status(201).json(result[0]);
    }

    if (!employeeId) return res.status(400).json({ error: 'employeeId is required for employee-type assignments' });

    const result = await pool.query(
      `INSERT INTO checklist_assignments (template_id, employee_id, assignment_type, is_active, start_date, end_date)
       VALUES ($1, $2, 'employee', $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [templateId, employeeId, isActive !== false, startDate || null, endDate || null]
    );
    res.status(201).json(result[0] || {});
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/assignments/bulk', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { templateId, employeeIds } = req.body;
    if (!templateId || !employeeIds || !Array.isArray(employeeIds)) {
      return res.status(400).json({ error: 'templateId and employeeIds array are required' });
    }

    const results = [];
    for (const employeeId of employeeIds) {
      const result = await pool.query(
        `INSERT INTO checklist_assignments (template_id, employee_id, assignment_type, is_active)
         VALUES ($1, $2, 'employee', true)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [templateId, employeeId]
      );
      if (result && result.length > 0) results.push(result[0]);
    }
    res.status(201).json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/assignments/:id', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM checklist_assignments WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/active', ...authRequired, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.query;
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    const today = new Date().toISOString().split('T')[0];
    
    const templates = await pool.query(
      `SELECT DISTINCT ct.*
       FROM checklist_templates ct
       JOIN checklist_assignments ca ON ca.template_id = ct.id
       WHERE (
         (ca.assignment_type = 'employee' AND ca.employee_id = $1)
         OR (ca.assignment_type = 'department' AND ca.department_name = (
             SELECT department FROM employees WHERE id = $1 LIMIT 1
           ))
         OR (ca.assignment_type = 'role' AND ca.role_key = (
             SELECT role FROM employees WHERE id = $1 LIMIT 1
           ))
       )
         AND ca.is_active = true
         AND ct.is_active = true
         AND (ca.start_date IS NULL OR ca.start_date <= $2)
         AND (ca.end_date IS NULL OR ca.end_date >= $2)
       ORDER BY ct.name`,
      [employeeId, today]
    );

    const result = [];
    for (const template of (templates || [])) {
      const allItems = await pool.query(
        `SELECT * FROM checklist_template_items WHERE template_id = $1 ORDER BY sort_order`,
        [template.id]
      );

      const applicableItems = (allItems || []).filter((item: any) => {
        return isItemDueToday(item.frequency, today);
      });

      if (applicableItems.length === 0) continue;

      const primaryPeriodDate = getPeriodDate('DAILY', today);

      const responses = await pool.query(
        `SELECT cr.*, 
          (SELECT json_agg(json_build_object('id', cri.id, 'templateItemId', cri.template_item_id, 'value', cri.value, 'completed', cri.completed))
           FROM checklist_response_items cri WHERE cri.response_id = cr.id) as response_items
         FROM checklist_responses cr
         WHERE cr.template_id = $1 AND cr.employee_id = $2 AND cr.period_date = $3`,
        [template.id, employeeId, primaryPeriodDate]
      );

      result.push({
        ...template,
        items: applicableItems,
        periodDate: primaryPeriodDate,
        existingResponse: responses && responses.length > 0 ? responses[0] : null,
      });
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/submit', ...authRequired, async (req: Request, res: Response) => {
  try {
    const { templateId, employeeId, periodDate, items } = req.body;
    if (!templateId || !employeeId || !periodDate || !items) {
      return res.status(400).json({ error: 'templateId, employeeId, periodDate, and items are required' });
    }

    let responseRows = await pool.query(
      `SELECT * FROM checklist_responses WHERE template_id = $1 AND employee_id = $2 AND period_date = $3`,
      [templateId, employeeId, periodDate]
    );

    let responseId;
    if (responseRows && responseRows.length > 0) {
      responseId = responseRows[0].id;
      await pool.query(`DELETE FROM checklist_response_items WHERE response_id = $1`, [responseId]);
      await pool.query(
        `UPDATE checklist_responses SET updated_at = NOW(), completed_at = $1 WHERE id = $2`,
        [items.every((i: any) => !i.required || i.completed) ? new Date() : null, responseId]
      );
    } else {
      const insertResult = await pool.query(
        `INSERT INTO checklist_responses (template_id, employee_id, period_date, completed_at)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [templateId, employeeId, periodDate, items.every((i: any) => !i.required || i.completed) ? new Date() : null]
      );
      responseId = insertResult[0].id;
    }

    for (const item of items) {
      await pool.query(
        `INSERT INTO checklist_response_items (response_id, template_item_id, value, completed)
         VALUES ($1, $2, $3, $4)`,
        [responseId, item.templateItemId, item.value || null, item.completed || false]
      );
    }

    res.json({ success: true, responseId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/enforcement-status', ...authRequired, async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.query;
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    const today = new Date().toISOString().split('T')[0];
    const dailyPeriodDate = getPeriodDate('DAILY', today);

    const incomplete: Array<{ id: number; name: string; incompleteItems: string[] }> = [];

    // Check instance-based enforcement first
    // NOTE: ci is always joined on the requesting employee ($1), not ca.employee_id,
    // to correctly handle department/role-level assignments where ca.employee_id is null.
    const instanceEnforced = await pool.query(
      `SELECT ct.id, ct.name, ci.id as instance_id
       FROM checklist_templates ct
       JOIN checklist_assignments ca ON ca.template_id = ct.id
       LEFT JOIN checklist_instances ci ON ci.template_id = ct.id
                                       AND ci.employee_id = $1::integer
                                       AND ci.context_date = $2
                                       AND ci.context_type = 'daily'
       WHERE (
         (ca.assignment_type = 'employee' AND ca.employee_id = $1::integer)
         OR (ca.assignment_type = 'department' AND ca.department_name = (
             SELECT department FROM employees WHERE id = $1::integer LIMIT 1
           ))
         OR (ca.assignment_type = 'role' AND ca.role_key = (
             SELECT role FROM employees WHERE id = $1::integer LIMIT 1
           ))
       )
         AND ca.is_active = true
         AND ct.is_active = true
         AND ct.enforce_clock_out = true
         AND (ca.start_date IS NULL OR ca.start_date <= $2)
         AND (ca.end_date IS NULL OR ca.end_date >= $2)`,
      [employeeId, today]
    );

    const checkedTemplateIds = new Set<number>();

    for (const row of (instanceEnforced || [])) {
      if (checkedTemplateIds.has(row.id)) continue;
      checkedTemplateIds.add(row.id);

      if (row.instance_id) {
        const incompleteItems = await pool.query(
          `SELECT label FROM checklist_instance_items
           WHERE instance_id = $1 AND required = true AND completed = false`,
          [row.instance_id]
        );
        if (incompleteItems && incompleteItems.length > 0) {
          incomplete.push({
            id: row.id,
            name: row.name,
            incompleteItems: incompleteItems.map((i: any) => i.label),
          });
        }
      } else {
        const requiredItems = await pool.query(
          `SELECT id, label, frequency FROM checklist_template_items
           WHERE template_id = $1 AND required = true`,
          [row.id]
        );

        const dueRequiredItems = (requiredItems || []).filter((item: any) => isItemDueToday(item.frequency, today));
        if (dueRequiredItems.length === 0) continue;

        const responses = await pool.query(
          `SELECT cr.id FROM checklist_responses cr
           WHERE cr.template_id = $1 AND cr.employee_id = $2 AND cr.period_date = $3 AND cr.completed_at IS NOT NULL`,
          [row.id, employeeId, dailyPeriodDate]
        );

        if (!responses || responses.length === 0) {
          incomplete.push({
            id: row.id,
            name: row.name,
            incompleteItems: dueRequiredItems.map((i: any) => i.label),
          });
        }
      }
    }

    res.json({
      canClockOut: incomplete.length === 0,
      incompleteChecklists: incomplete,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/history', ...adminOnly, async (req: Request, res: Response) => {
  try {
    const { employeeId, from, to, templateId, limit = String(DEFAULT_CHECKLISTS_LIMIT), offset = '0' } = req.query;
    const parsedLimit = parseInt(String(limit), 10);
    const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_CHECKLISTS_LIMIT)
      : DEFAULT_CHECKLISTS_LIMIT;
    
    let query = `
      SELECT cr.*, ct.name as template_name, e.name as employee_name,
        (SELECT json_agg(json_build_object(
          'id', cri.id, 'templateItemId', cri.template_item_id, 'value', cri.value, 'completed', cri.completed,
          'label', cti.label, 'type', cti.type, 'required', cti.required, 'frequency', cti.frequency
        ))
         FROM checklist_response_items cri 
         JOIN checklist_template_items cti ON cti.id = cri.template_item_id
         WHERE cri.response_id = cr.id) as response_items
      FROM checklist_responses cr
      JOIN checklist_templates ct ON ct.id = cr.template_id
      JOIN employees e ON e.id = cr.employee_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (employeeId) {
      paramCount++;
      query += ` AND cr.employee_id = $${paramCount}`;
      params.push(employeeId);
    }
    if (templateId) {
      paramCount++;
      query += ` AND cr.template_id = $${paramCount}`;
      params.push(templateId);
    }
    if (from) {
      paramCount++;
      query += ` AND cr.period_date >= $${paramCount}`;
      params.push(from);
    }
    if (to) {
      paramCount++;
      query += ` AND cr.period_date <= $${paramCount}`;
      params.push(to);
    }

    paramCount++;
    query += ` ORDER BY cr.period_date DESC, cr.created_at DESC LIMIT $${paramCount}`;
    params.push(effectiveLimit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(Number(offset));

    const results = await pool.query(query, params);
    res.json(results || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function getPeriodDate(frequency: string, today: string): string {
  const date = new Date(today + 'T00:00:00');
  switch (frequency) {
    case 'WEEKLY': {
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff)).toISOString().split('T')[0];
    }
    case 'MONTHLY': {
      return `${today.substring(0, 7)}-01`;
    }
    default:
      return today;
  }
}

function isItemDueToday(frequency: string, today: string): boolean {
  switch (frequency) {
    case 'DAILY':
      return true;
    case 'WEEKLY': {
      const d = new Date(today + 'T00:00:00');
      return d.getDay() === 1;
    }
    case 'MONTHLY': {
      const d = new Date(today + 'T00:00:00');
      return d.getDate() === 1;
    }
    default:
      return true;
  }
}

export default router;
