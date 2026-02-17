import { Router } from 'express';
import { simulateOrderForecast, getExpectedDepartment, generateDashboardForecast } from '../../services/productionForecastEngine';
import { authenticateToken } from '../../middleware/auth';

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

export default router;
