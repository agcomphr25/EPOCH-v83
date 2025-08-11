
import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { db } from '../../db';
import { eq, inArray } from 'drizzle-orm';
import { allOrders, orderDrafts } from '../../schema';

const router = Router();

// Get order by ID (checks both draft and finalized orders)
router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    // Try finalized orders first
    let order = await storage.getFinalizedOrderById(orderId);
    
    // If not found, try draft orders
    if (!order) {
      order = await storage.getOrderDraft(orderId);
    }
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// Get multiple orders by IDs
router.get('/orders/bulk', async (req: Request, res: Response) => {
  try {
    const { orderIds } = req.query;
    
    if (!orderIds || typeof orderIds !== 'string') {
      return res.status(400).json({ error: 'orderIds query parameter is required' });
    }
    
    const ids = orderIds.split(',').map(id => id.trim());
    
    // Get from both finalized and draft orders
    const finalizedOrders = await db.select()
      .from(allOrders)
      .where(inArray(allOrders.orderId, ids));
    
    const draftOrders = await db.select()
      .from(orderDrafts)
      .where(inArray(orderDrafts.orderId, ids));
    
    // Combine and deduplicate (prioritize finalized over draft)
    const orderMap = new Map();
    
    // Add draft orders first
    draftOrders.forEach(order => {
      orderMap.set(order.orderId, { ...order, isFinalized: false });
    });
    
    // Add finalized orders (will overwrite drafts if same ID)
    finalizedOrders.forEach(order => {
      orderMap.set(order.orderId, { ...order, isFinalized: true });
    });
    
    const orders = Array.from(orderMap.values());
    
    res.json(orders);
  } catch (error) {
    console.error('Error getting orders in bulk:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Get orders ready for shipping
router.get('/ready-for-shipping', async (req: Request, res: Response) => {
  try {
    // Get orders from both finalized and draft tables
    const finalizedOrders = await storage.getAllFinalizedOrders();
    const draftOrders = await storage.getAllOrderDrafts();
    
    // Combine and filter for shipping-ready orders
    const allOrders = [...finalizedOrders, ...draftOrders];
    const shippingOrders = allOrders.filter((order: any) => 
      order.currentDepartment === 'Shipping' ||
      order.status === 'Ready for Shipping' ||
      (order.qcCompletedAt && !order.shippedDate) ||
      (order.currentDepartment === 'QC' && order.qcPassed)
    );
    
    res.json(shippingOrders);
  } catch (error) {
    console.error('Error getting shipping-ready orders:', error);
    res.status(500).json({ error: 'Failed to get shipping-ready orders' });
  }
});

// Mark order as shipped
router.post('/mark-shipped/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { 
      trackingNumber, 
      shippingCarrier = 'UPS', 
      shippingMethod = 'Ground',
      estimatedDelivery,
      sendNotification = true,
      notificationMethod = 'email'
    } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    // Update order with shipping information
    const updateData = {
      currentDepartment: 'Shipped',
      trackingNumber,
      shippingCarrier,
      shippingMethod,
      shippedDate: new Date(),
      shippingCompletedAt: new Date(),
      estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
      customerNotified: sendNotification,
      notificationMethod: sendNotification ? notificationMethod : null,
      notificationSentAt: sendNotification ? new Date() : null,
    };

    // Try to update in finalized orders first
    let updatedOrder;
    try {
      updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
    } catch (error) {
      // If not found in finalized orders, try draft orders
      updatedOrder = await storage.updateOrderDraft(orderId, updateData);
    }

    // Send customer notification if requested
    if (sendNotification) {
      try {
        const { sendCustomerNotification } = await import('../../utils/notifications');
        await sendCustomerNotification({
          orderId,
          trackingNumber,
          carrier: shippingCarrier,
          estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : undefined
        });
      } catch (notificationError) {
        console.error('Failed to send customer notification:', notificationError);
        // Don't fail the entire request if notification fails
      }
    }

    res.json({ 
      success: true, 
      message: 'Order marked as shipped',
      order: updatedOrder 
    });

  } catch (error) {
    console.error('Error marking order as shipped:', error);
    res.status(500).json({ error: 'Failed to mark order as shipped' });
  }
});

// Update tracking information
router.put('/tracking/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { 
      trackingNumber,
      shippingCarrier,
      shippingMethod,
      estimatedDelivery,
      deliveryConfirmed,
      customerNotified,
      notificationMethod 
    } = req.body;

    const updateData: any = {};
    
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
    if (shippingCarrier !== undefined) updateData.shippingCarrier = shippingCarrier;
    if (shippingMethod !== undefined) updateData.shippingMethod = shippingMethod;
    if (estimatedDelivery !== undefined) updateData.estimatedDelivery = estimatedDelivery ? new Date(estimatedDelivery) : null;
    if (deliveryConfirmed !== undefined) {
      updateData.deliveryConfirmed = deliveryConfirmed;
      if (deliveryConfirmed) {
        updateData.deliveryConfirmedAt = new Date();
      }
    }
    if (customerNotified !== undefined) updateData.customerNotified = customerNotified;
    if (notificationMethod !== undefined) updateData.notificationMethod = notificationMethod;

    // Try to update in finalized orders first
    let updatedOrder;
    try {
      updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
    } catch (error) {
      // If not found in finalized orders, try draft orders
      updatedOrder = await storage.updateOrderDraft(orderId, updateData);
    }

    res.json({ 
      success: true, 
      message: 'Tracking information updated',
      order: updatedOrder 
    });

  } catch (error) {
    console.error('Error updating tracking information:', error);
    res.status(500).json({ error: 'Failed to update tracking information' });
  }
});

// Get shipping statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getAllFinalizedOrders();
    
    const stats = {
      readyForShipping: orders.filter((o: any) => 
        (o.currentDepartment === 'QC' || o.currentDepartment === 'Shipping') && !o.shippedDate
      ).length,
      shipped: orders.filter((o: any) => o.shippedDate).length,
      delivered: orders.filter((o: any) => o.deliveryConfirmed).length,
      pending: orders.filter((o: any) => o.shippedDate && !o.deliveryConfirmed).length
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting shipping stats:', error);
    res.status(500).json({ error: 'Failed to get shipping statistics' });
  }
});

export default router;
