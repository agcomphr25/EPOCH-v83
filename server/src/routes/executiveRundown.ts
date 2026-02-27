import { Router, Request, Response } from 'express';
import { requireExecutiveAccess } from '../middleware/requireExecutiveAccess';
import { pool } from '../../db';

const router = Router();
router.use(requireExecutiveAccess);

const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

router.get('/today', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const today = new Date().toISOString().slice(0, 10);

    let group = await pool.query(
      `SELECT * FROM executive_rundown_groups WHERE user_id = $1 AND group_date = $2 AND is_active = true LIMIT 1`,
      [userId, today]
    );

    if (!group || group.length === 0) {
      return res.json({ group: null, items: [] });
    }

    const groupRow = group[0];

    const items = await pool.query(
      `SELECT * FROM executive_rundown_items
       WHERE group_id = $1 AND is_active = true
       ORDER BY
         CASE priority
           WHEN 'CRITICAL' THEN 0
           WHEN 'HIGH' THEN 1
           WHEN 'NORMAL' THEN 2
           WHEN 'LOW' THEN 3
         END,
         sort_order ASC`,
      [groupRow.id]
    );

    res.json({ group: groupRow, items: items || [] });
  } catch (error: any) {
    console.error('Executive rundown GET /today error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/overdue', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const today = new Date().toISOString().slice(0, 10);

    const items = await pool.query(
      `SELECT i.*, g.group_date
       FROM executive_rundown_items i
       JOIN executive_rundown_groups g ON g.id = i.group_id
       WHERE i.user_id = $1
         AND g.group_date < $2
         AND i.is_completed = false
         AND i.is_active = true
         AND g.is_active = true
       ORDER BY g.group_date ASC,
         CASE i.priority
           WHEN 'CRITICAL' THEN 0
           WHEN 'HIGH' THEN 1
           WHEN 'NORMAL' THEN 2
           WHEN 'LOW' THEN 3
         END,
         i.sort_order ASC`,
      [userId, today]
    );

    res.json({ items: items || [] });
  } catch (error: any) {
    console.error('Executive rundown GET /overdue error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/carry-forward', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const today = new Date().toISOString().slice(0, 10);

    const overdueItems = await pool.query(
      `SELECT i.id
       FROM executive_rundown_items i
       JOIN executive_rundown_groups g ON g.id = i.group_id
       WHERE i.user_id = $1
         AND g.group_date < $2
         AND i.is_completed = false
         AND i.is_active = true
         AND g.is_active = true`,
      [userId, today]
    );

    if (!overdueItems || overdueItems.length === 0) {
      return res.json({ carried: 0 });
    }

    let todayGroup = await pool.query(
      `SELECT * FROM executive_rundown_groups WHERE user_id = $1 AND group_date = $2 AND is_active = true LIMIT 1`,
      [userId, today]
    );

    let todayGroupId: number;
    if (!todayGroup || todayGroup.length === 0) {
      const newGroup = await pool.query(
        `INSERT INTO executive_rundown_groups (user_id, group_date, is_active, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), NOW())
         RETURNING *`,
        [userId, today]
      );
      todayGroupId = newGroup[0].id;
    } else {
      todayGroupId = todayGroup[0].id;
    }

    const ids = overdueItems.map((i: any) => i.id);
    await pool.query(
      `UPDATE executive_rundown_items
       SET group_id = $1, updated_at = NOW()
       WHERE id = ANY($2) AND user_id = $3`,
      [todayGroupId, ids, userId]
    );

    res.json({ carried: ids.length });
  } catch (error: any) {
    console.error('Executive rundown POST /carry-forward error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      title,
      description,
      priority = 'NORMAL',
      category,
      sortOrder = 0,
      linkedEntityType,
      linkedEntityId,
      taskDate,
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!PRIORITY_ORDER.includes(priority)) {
      return res.status(400).json({ error: `Invalid priority. Must be one of: ${PRIORITY_ORDER.join(', ')}` });
    }

    const targetDate = taskDate || new Date().toISOString().slice(0, 10);

    let group = await pool.query(
      `SELECT * FROM executive_rundown_groups WHERE user_id = $1 AND group_date = $2 AND is_active = true LIMIT 1`,
      [userId, targetDate]
    );

    let groupId: number;
    if (!group || group.length === 0) {
      const newGroup = await pool.query(
        `INSERT INTO executive_rundown_groups (user_id, group_date, is_active, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), NOW())
         RETURNING *`,
        [userId, targetDate]
      );
      groupId = newGroup[0].id;
    } else {
      groupId = group[0].id;
    }

    const item = await pool.query(
      `INSERT INTO executive_rundown_items
        (group_id, user_id, title, description, priority, category, sort_order, linked_entity_type, linked_entity_id, is_completed, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, true, NOW(), NOW())
       RETURNING *`,
      [groupId, userId, title.trim(), description || null, priority, category || null, sortOrder, linkedEntityType || null, linkedEntityId || null]
    );

    res.status(201).json(item[0]);
  } catch (error: any) {
    console.error('Executive rundown POST / error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE executive_rundown_items
       SET is_completed = true, completed_at = NOW(), completed_by = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $1 AND is_active = true
       RETURNING *`,
      [userId, id]
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result[0]);
  } catch (error: any) {
    console.error('Executive rundown POST /:id/complete error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/reorder', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { sortOrder } = req.body;

    if (typeof sortOrder !== 'number') {
      return res.status(400).json({ error: 'sortOrder must be a number' });
    }

    const result = await pool.query(
      `UPDATE executive_rundown_items
       SET sort_order = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 AND is_active = true
       RETURNING *`,
      [sortOrder, id, userId]
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result[0]);
  } catch (error: any) {
    console.error('Executive rundown PATCH /:id/reorder error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
