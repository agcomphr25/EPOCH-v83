import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertKickbackSchema } from '../../schema';
import { z } from 'zod';
import { pool } from '../../db';

const router = Router();

// Get all kickbacks
router.get('/', async (req: Request, res: Response) => {
  try {
    const kickbacks = await storage.getAllKickbacks();
    res.json(kickbacks);
  } catch (error) {
    console.error('Get all kickbacks error:', error);
    res.status(500).json({ error: 'Failed to fetch kickbacks' });
  }
});

// Get kickbacks by order ID
router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const kickbacks = await storage.getKickbacksByOrderId(orderId);
    res.json(kickbacks);
  } catch (error) {
    console.error('Get kickbacks by order error:', error);
    res.status(500).json({ error: 'Failed to fetch kickbacks for order' });
  }
});

// Get kickbacks by status
router.get('/status/:status', async (req: Request, res: Response) => {
  try {
    const { status } = req.params;
    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const kickbacks = await storage.getKickbacksByStatus(
      status as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
    );
    res.json(kickbacks);
  } catch (error) {
    console.error('Get kickbacks by status error:', error);
    res.status(500).json({ error: 'Failed to fetch kickbacks by status' });
  }
});

// Get kickbacks by department
router.get('/department/:department', async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    const kickbacks = await storage.getKickbacksByDepartment(department);
    res.json(kickbacks);
  } catch (error) {
    console.error('Get kickbacks by department error:', error);
    res.status(500).json({ error: 'Failed to fetch kickbacks by department' });
  }
});

// Get kickback analytics
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let dateRange;
    if (startDate && endDate) {
      dateRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string),
      };
    }

    const analytics = await storage.getKickbackAnalytics(dateRange);
    res.json(analytics);
  } catch (error) {
    console.error('Get kickback analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch kickback analytics' });
  }
});

// Get single kickback
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid kickback ID' });
    }

    const kickback = await storage.getKickback(id);
    if (!kickback) {
      return res.status(404).json({ error: 'Kickback not found' });
    }

    res.json(kickback);
  } catch (error) {
    console.error('Get kickback error:', error);
    res.status(500).json({ error: 'Failed to fetch kickback' });
  }
});

// Create new kickback
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = insertKickbackSchema.parse(req.body);
    const kickback = await storage.createKickback(validatedData);
    res.status(201).json(kickback);
  } catch (error) {
    console.error('Create kickback error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid kickback data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create kickback' });
  }
});

// Update kickback
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid kickback ID' });
    }

    // Partial validation for updates
    const updateSchema = insertKickbackSchema.partial();
    const validatedData = updateSchema.parse(req.body);

    // Fetch existing kickback before update so we have the orderId
    const existingKickback = await storage.getKickback(id);

    const kickback = await storage.updateKickback(id, validatedData);

    // When a kickback is resolved, reset the order status to FINALIZED if it is
    // currently IN_PROGRESS in the P1 Production Queue so the order becomes visible
    // in the queue again. All kickbacks by definition return orders to P1 Production Queue.
    let statusResetWarning: string | undefined;
    if (validatedData.status === 'RESOLVED' && existingKickback?.orderId) {
      try {
        const changedBy = (req.user as { username?: string } | undefined)?.username ?? 'SYSTEM';
        const userRole = (req.user as { role?: string } | undefined)?.role ?? 'SYSTEM';
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows } = await client.query<{ status: string; current_department: string }>(
            `SELECT status, current_department FROM all_orders WHERE order_id = $1 LIMIT 1`,
            [existingKickback.orderId]
          );
          const order = rows[0];

          if (order?.status === 'IN_PROGRESS' && order.current_department === 'P1 Production Queue') {
            await client.query(
              `UPDATE all_orders SET status = 'FINALIZED', updated_at = NOW() WHERE order_id = $1`,
              [existingKickback.orderId]
            );
            await client.query(
              `INSERT INTO admin_audit_log
                 (order_id, field_name, field_label, old_value, new_value, changed_by, user_role, change_type, reason, ip_address, user_agent, timestamp)
               VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW())`,
              [
                existingKickback.orderId,
                'status',
                'Order Status',
                JSON.stringify('IN_PROGRESS'),
                JSON.stringify('FINALIZED'),
                changedBy,
                userRole,
                'KICKBACK_STATUS_RESET',
                `Automatic status reset to FINALIZED on kickback resolution (kickback ID: ${id}) — order returned to P1 Production Queue`,
                req.ip ?? null,
                req.headers['user-agent'] ?? null,
              ]
            );
            console.log(
              `✅ KICKBACK RESOLVE: Reset order ${existingKickback.orderId} status IN_PROGRESS → FINALIZED on kickback #${id} resolution`
            );
          }
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          client.release();
        }
      } catch (resetErr) {
        const msg = resetErr instanceof Error ? resetErr.message : String(resetErr);
        console.error(`KICKBACK RESOLVE: Failed to reset order status for ${existingKickback.orderId}:`, resetErr);
        statusResetWarning = `Kickback resolved but order status reset failed: ${msg}. The order may still appear as IN_PROGRESS in the P1 queue until manually corrected.`;
      }
    }

    res.json(statusResetWarning ? { ...kickback, _warning: statusResetWarning } : kickback);
  } catch (error) {
    console.error('Update kickback error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid kickback data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update kickback' });
  }
});

// Delete kickback
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid kickback ID' });
    }

    await storage.deleteKickback(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete kickback error:', error);
    res.status(500).json({ error: 'Failed to delete kickback' });
  }
});

export default router;
