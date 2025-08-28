import { Router } from 'express';
import { ilike, or } from 'drizzle-orm';
import { db } from '../../db';
import { orders } from '../../schema';

const router = Router();

// GET /api/orders/search - Search orders for nonconformance module
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.json([]);
    }

    const searchConditions = [
      ilike(orders.orderId, `%${query}%`),
      ilike(orders.serialNumber, `%${query}%`),
      ilike(orders.customerName, `%${query}%`),
    ].filter(Boolean);

    const results = await db
      .select({
        id: orders.id,
        orderId: orders.orderId,
        serialNumber: orders.serialNumber,
        customerName: orders.customerName,
        poNumber: orders.poNumber,
        stockModel: orders.stockModel,
      })
      .from(orders)
      .where(or(...searchConditions))
      .limit(10);

    res.json(results);
  } catch (error) {
    console.error('Error searching orders:', error);
    res.status(500).json({ error: 'Failed to search orders' });
  }
});

export default router;