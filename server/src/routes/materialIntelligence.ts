import { Router, Request, Response } from 'express';
import { getMaterialIntelligenceDashboard } from '../services/materialIntelligenceService';

const router = Router();

// GET /api/material-intelligence/dashboard
//
// Read-only analytics dashboard combining:
//   - Build capacity summary
//   - Blocking materials list
//   - Purchasing radar (days of stock remaining + recommended order qty)
//   - Inventory pressure per material
//
// All data is derived from existing inventory_balances, bom_items, and all_orders.
// No mutations are performed.

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const data = await getMaterialIntelligenceDashboard();
    res.json(data);
  } catch (error: any) {
    console.error('Material intelligence dashboard error:', error);
    res.status(500).json({
      error: 'Failed to compute material intelligence dashboard',
      message: error.message,
    });
  }
});

export default router;
