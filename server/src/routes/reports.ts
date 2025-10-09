import { Router } from 'express';
import { db } from '../../db';
import { allOrders, stockModels, features } from '../../schema';
import { eq, and, gte, lt, sql } from 'drizzle-orm';

const router = Router();

// September 2025 FULFILLED Orders Report
router.get('/september-fulfilled-2025', async (req, res) => {
  try {
    const orders = await db
      .select({
        orderId: allOrders.orderId,
        customerId: allOrders.customerId,
        orderDate: allOrders.orderDate,
        updatedAt: allOrders.updatedAt,
        basePrice: sql<number>`COALESCE(${allOrders.priceOverride}, ${stockModels.price}, 0)`.as('base_price'),
        shipping: allOrders.shipping,
        customDiscountType: allOrders.customDiscountType,
        customDiscountValue: allOrders.customDiscountValue,
        showCustomDiscount: allOrders.showCustomDiscount,
        features: allOrders.features,
        modelId: allOrders.modelId,
      })
      .from(allOrders)
      .leftJoin(stockModels, eq(allOrders.modelId, stockModels.id))
      .where(
        and(
          eq(allOrders.status, 'FULFILLED'),
          gte(allOrders.updatedAt, new Date('2025-09-01')),
          lt(allOrders.updatedAt, new Date('2025-10-01'))
        )
      )
      .orderBy(allOrders.updatedAt);

    // Calculate features total for each order
    const ordersWithTotals = await Promise.all(
      orders.map(async (order) => {
        let featuresTotal = 0;
        
        if (order.features && typeof order.features === 'object') {
          const featureKeys = Object.keys(order.features);
          
          if (featureKeys.length > 0) {
            const featuresList = await db
              .select({
                price: features.price,
              })
              .from(features)
              .where(sql`${features.id} = ANY(${featureKeys})`);
            
            featuresTotal = featuresList.reduce((sum, f) => sum + (f.price || 0), 0);
          }
        }

        const basePrice = Number(order.basePrice) || 0;
        const shipping = Number(order.shipping) || 0;
        
        let orderTotal = basePrice + featuresTotal + shipping;
        
        // Apply discount if applicable
        if (order.showCustomDiscount && order.customDiscountValue) {
          if (order.customDiscountType === 'percent') {
            orderTotal = (basePrice + featuresTotal) * (1 - order.customDiscountValue / 100) + shipping;
          } else if (order.customDiscountType === 'fixed') {
            orderTotal = (basePrice + featuresTotal) - order.customDiscountValue + shipping;
          }
        }

        return {
          orderId: order.orderId,
          customerId: order.customerId,
          orderDate: order.orderDate,
          updatedAt: order.updatedAt,
          basePrice,
          featuresTotal,
          shipping,
          customDiscountType: order.customDiscountType,
          customDiscountValue: order.customDiscountValue,
          showCustomDiscount: order.showCustomDiscount,
          orderTotal,
        };
      })
    );

    const totalAmountDue = ordersWithTotals.reduce((sum, order) => sum + order.orderTotal, 0);

    res.json({
      orderCount: ordersWithTotals.length,
      totalAmountDue,
      orders: ordersWithTotals,
    });
  } catch (error) {
    console.error('Error fetching September 2025 FULFILLED orders:', error);
    res.status(500).json({ error: 'Failed to fetch report data' });
  }
});

export default router;
