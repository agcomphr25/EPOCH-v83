import { Router, Request, Response } from 'express';
import { pool } from '../../db';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await pool.query(`
      SELECT
        u.id,
        u.symbol,
        u.conversion_to_base::float AS conversion_to_base,
        f.id AS family_id,
        f.name AS family
      FROM units u
      JOIN unit_families f ON f.id = u.family_id
      ORDER BY f.name, u.symbol
    `) as Array<{ id: number; symbol: string; conversion_to_base: number; family_id: number; family: string }>;
    res.json(rows);
  } catch (err: any) {
    console.error('GET /api/units error:', err.message);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

export default router;
