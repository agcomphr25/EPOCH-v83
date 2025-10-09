import { Router } from 'express';
import { db } from '../../db';
import { allOrders, stockModels, features } from '../../schema';
import { eq, and, gte, lt, sql, inArray } from 'drizzle-orm';

const router = Router();

// Monthly FULFILLED Orders Report
router.get('/monthly-fulfilled', async (req, res) => {
  try {
    const { month, year } = req.query;
    
    // Default to September 2025 if not provided
    const reportMonth = month ? parseInt(month as string) : 9;
    const reportYear = year ? parseInt(year as string) : 2025;
    
    // Calculate date range for the selected month
    const startDate = new Date(reportYear, reportMonth - 1, 1);
    const endDate = new Date(reportYear, reportMonth, 1);
    
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
          gte(allOrders.updatedAt, startDate),
          lt(allOrders.updatedAt, endDate)
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
              .where(inArray(features.id, featureKeys));
            
            featuresTotal = featuresList.reduce((sum, f) => sum + (f.price || 0), 0);
          }
        }

        const basePrice = Number(order.basePrice) || 0;
        const shipping = Number(order.shipping) || 0;
        
        let orderTotal = basePrice + featuresTotal + shipping;
        let discountAmount = 0;
        
        // Apply discount if applicable
        if (order.showCustomDiscount && order.customDiscountValue) {
          if (order.customDiscountType === 'percent') {
            discountAmount = (basePrice + featuresTotal) * (order.customDiscountValue / 100);
            orderTotal = (basePrice + featuresTotal) * (1 - order.customDiscountValue / 100) + shipping;
          } else if (order.customDiscountType === 'fixed') {
            discountAmount = order.customDiscountValue;
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
          discountAmount,
          customDiscountType: order.customDiscountType,
          customDiscountValue: order.customDiscountValue,
          showCustomDiscount: order.showCustomDiscount,
          orderTotal,
        };
      })
    );

    // Calculate column totals
    const columnTotals = ordersWithTotals.reduce((totals, order) => ({
      basePrice: totals.basePrice + order.basePrice,
      featuresTotal: totals.featuresTotal + order.featuresTotal,
      shipping: totals.shipping + order.shipping,
      discountAmount: totals.discountAmount + order.discountAmount,
      orderTotal: totals.orderTotal + order.orderTotal,
    }), { basePrice: 0, featuresTotal: 0, shipping: 0, discountAmount: 0, orderTotal: 0 });

    res.json({
      orderCount: ordersWithTotals.length,
      totalAmountDue: columnTotals.orderTotal,
      columnTotals,
      orders: ordersWithTotals,
    });
  } catch (error) {
    console.error('Error fetching monthly FULFILLED orders:', error);
    res.status(500).json({ error: 'Failed to fetch report data' });
  }
});

export default router;
