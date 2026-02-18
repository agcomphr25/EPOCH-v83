import { Router } from 'express';
import { simulateOrderForecast, getExpectedDepartment, generateDashboardForecast, generateWeeklyForecast } from '../../services/productionForecastEngine';
import { authenticateToken } from '../../middleware/auth';
import { pgPool } from '../../db';

const router = Router();

router.use(authenticateToken);

router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const forecast = await simulateOrderForecast(orderId);
    if (!forecast) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const expected = await getExpectedDepartment(orderId);

    res.json({
      ...forecast,
      currentStatus: expected,
    });
  } catch (error: any) {
    console.error('Forecast order error:', error);
    res.status(500).json({ error: 'Failed to generate order forecast' });
  }
});

router.get('/dashboard', async (_req, res) => {
  try {
    const dashboard = await generateDashboardForecast();
    res.json(dashboard);
  } catch (error: any) {
    console.error('Forecast dashboard error:', error);
    res.status(500).json({ error: 'Failed to generate dashboard forecast' });
  }
});

router.get('/weekly', async (req, res) => {
  try {
    const { weekStart } = req.query;
    if (!weekStart || typeof weekStart !== 'string') {
      return res.status(400).json({ error: 'weekStart query parameter required (YYYY-MM-DD)' });
    }

    const startDate = new Date(weekStart + 'T00:00:00Z');
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const forecastItems = await generateWeeklyForecast(startDate, endDate);

    const verifications = await pgPool.query(
      `SELECT order_id, department, notes, verified_by, verified_at
       FROM production_forecast_verifications
       WHERE week_start_date = $1`,
      [startDate]
    );

    const verificationMap = new Map<string, { notes: string | null; verifiedBy: number | null; verifiedAt: string | null }>();
    for (const v of verifications.rows) {
      const key = `${v.order_id}::${v.department}`;
      verificationMap.set(key, {
        notes: v.notes,
        verifiedBy: v.verified_by,
        verifiedAt: v.verified_at,
      });
    }

    const results = forecastItems.map(item => {
      const key = `${item.orderId}::${item.actualDepartment}`;
      const verification = verificationMap.get(key);
      return {
        ...item,
        isVerified: !!verification,
        verificationNotes: verification?.notes || null,
        verifiedBy: verification?.verifiedBy || null,
        verifiedAt: verification?.verifiedAt || null,
      };
    });

    res.json({
      weekStart: weekStart,
      weekEnd: endDate.toISOString().split('T')[0],
      orders: results,
    });
  } catch (error: any) {
    console.error('Weekly forecast error:', error);
    res.status(500).json({ error: 'Failed to generate weekly forecast' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { orderId, department, weekStartDate, notes } = req.body;
    if (!orderId || !department || !weekStartDate) {
      return res.status(400).json({ error: 'orderId, department, and weekStartDate are required' });
    }

    const userId = (req as any).user?.id || null;
    const startDate = new Date(weekStartDate + 'T00:00:00Z');

    await pgPool.query(
      `INSERT INTO production_forecast_verifications (order_id, department, week_start_date, verified_by, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id, department, week_start_date) DO UPDATE
       SET verified_by = $4, notes = $5, verified_at = NOW()`,
      [orderId, department, startDate, userId, notes || null]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Verify forecast error:', error);
    res.status(500).json({ error: 'Failed to verify forecast entry' });
  }
});

router.delete('/verify', async (req, res) => {
  try {
    const { orderId, department, weekStartDate } = req.body;
    if (!orderId || !department || !weekStartDate) {
      return res.status(400).json({ error: 'orderId, department, and weekStartDate are required' });
    }

    const startDate = new Date(weekStartDate + 'T00:00:00Z');

    await pgPool.query(
      `DELETE FROM production_forecast_verifications
       WHERE order_id = $1 AND department = $2 AND week_start_date = $3`,
      [orderId, department, startDate]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Unverify forecast error:', error);
    res.status(500).json({ error: 'Failed to remove forecast verification' });
  }
});

router.get('/settings/departments', async (_req, res) => {
  try {
    const result = await pgPool.query(
      'SELECT department_name, avg_days FROM department_forecast_defaults ORDER BY department_name'
    );
    res.json(result.rows.map(r => ({ department: r.department_name, avgDays: r.avg_days })));
  } catch (error: any) {
    console.error('Get forecast settings error:', error);
    res.status(500).json({ error: 'Failed to load forecast settings' });
  }
});

router.put('/settings/departments/:department', async (req, res) => {
  try {
    const department = decodeURIComponent(req.params.department);
    const { avgDays } = req.body;

    const validDays = typeof avgDays === 'number' && avgDays >= 0 ? avgDays : 1;

    const result = await pgPool.query(
      `UPDATE department_forecast_defaults
       SET avg_days = $1, updated_at = NOW()
       WHERE department_name = $2
       RETURNING department_name, avg_days`,
      [validDays, department]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Department "${department}" not found` });
    }

    res.json({ department: result.rows[0].department_name, avgDays: result.rows[0].avg_days });
  } catch (error: any) {
    console.error('Update forecast settings error:', error);
    res.status(500).json({ error: 'Failed to update forecast settings' });
  }
});

export default router;
