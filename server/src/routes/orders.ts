import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { generateP1OrderId } from '../../utils/orderIdGenerator';
import { authenticateToken } from '../../middleware/auth';
import {
  insertOrderDraftSchema,
  insertOrderSchema,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertProductionOrderSchema,
  insertP2PurchaseOrderSchema,
  insertP2PurchaseOrderItemSchema,
  insertP2ProductionOrderSchema,
  insertPaymentSchema
} from '@shared/schema';

const router = Router();

// Get all orders for All Orders List (root endpoint)
router.get('/', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getAllOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error retrieving orders:', error);
    res.status(500).json({ error: "Failed to fetch order", details: (error as any).message });
  }
});

// Get all orders with payment status for All Orders List with payment column
router.get('/with-payment-status', async (req: Request, res: Response) => {
  try {
    // Add basic caching headers to reduce server load
    res.set({
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      'ETag': `"orders-${Date.now()}"`
    });
    
    const orders = await storage.getAllOrdersWithPaymentStatus();
    res.json(orders);
  } catch (error) {
    console.error('Error retrieving orders with payment status:', error);
    res.status(500).json({ error: "Failed to fetch orders with payment status", details: (error as any).message });
  }
});

// Get pipeline counts for all departments (must be before :orderId route)
router.get('/pipeline-counts', async (req: Request, res: Response) => {
  try {
    const counts = await storage.getPipelineCounts();
    res.json(counts);
  } catch (error) {
    console.error("Pipeline counts fetch error:", error);
    res.status(500).json({ error: "Failed to fetch pipeline counts" });
  }
});

// Get detailed pipeline data with schedule status (must be before :orderId route)
router.get('/pipeline-details', async (req: Request, res: Response) => {
  try {
    const details = await storage.getPipelineDetails();
    res.json(details);
  } catch (error) {
    console.error("Pipeline details fetch error:", error);
    res.status(500).json({ error: "Failed to fetch pipeline details" });
  }
});

// Outstanding Orders route (must be before :orderId route)
router.get('/outstanding', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getOutstandingOrders();
    res.json(orders);
  } catch (error) {
    console.error("Get outstanding orders error:", error);
    res.status(500).json({ error: "Failed to get outstanding orders" });
  }
});

// Get orders by department (must be before :orderId route)
router.get('/department/:department', async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    const decodedDepartment = decodeURIComponent(department);
    const orders = await storage.getOrdersByDepartment(decodedDepartment);
    res.json(orders);
  } catch (error) {
    console.error("Get orders by department error:", error);
    res.status(500).json({ error: "Failed to get orders by department" });
  }
});



// Search orders - must be before :orderId route
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.json([]);
    }

    const results = await storage.searchOrders(query as string);
    res.json(results);
  } catch (error) {
    console.error('Error searching orders:', error);
    res.status(500).json({ error: 'Failed to search orders' });
  }
});

// Order Draft Management
router.get('/drafts', async (req: Request, res: Response) => {
  try {
    const excludeFinalized = req.query.excludeFinalized === 'true';
    const drafts = await storage.getAllOrderDrafts();

    if (excludeFinalized) {
      const filteredDrafts = drafts.filter(draft => draft.status !== 'FINALIZED');
      res.json(filteredDrafts);
    } else {
      res.json(drafts);
    }
  } catch (error) {
    console.error('Get drafts error:', error);
    res.status(500).json({ error: "Failed to fetch order drafts" });
  }
});

router.get('/draft/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    console.log('Fetching order for ID:', orderId);

    // Check if the ID is a number (database ID) or string (order ID like AG422)
    if (/^\d+$/.test(orderId)) {
      // It's a numeric database ID - try draft first
      try {
        const draft = await storage.getOrderDraftById(parseInt(orderId));
        console.log('Found draft by database ID:', orderId);
        return res.json(draft);
      } catch (draftError) {
        console.log('No draft found by database ID, checking finalized orders...');
        try {
          const finalizedOrder = await storage.getOrderById(orderId);
          if (finalizedOrder) {
            console.log('Found finalized order by database ID:', orderId);
            return res.json(finalizedOrder);
          }
        } catch (finalizedError) {
          console.error('Order not found by database ID:', finalizedError);
        }
      }
    } else {
      // It's an order ID like AG422 - try draft first, then finalized
      try {
        const draft = await storage.getOrderDraft(orderId);
        if (draft) {
          console.log('Found draft order:', orderId);
          return res.json(draft);
        }
      } catch (draftError) {
        console.log('Draft not found, checking finalized orders...');
      }
      
      // Try finalized orders
      try {
        const finalizedOrder = await storage.getFinalizedOrderById(orderId);
        if (finalizedOrder) {
          console.log('Found finalized order:', orderId);
          return res.json(finalizedOrder);
        }
      } catch (finalizedError) {
        console.error('Order not found in either table:', finalizedError);
      }
    }

    return res.status(404).json({ error: `Order ${orderId} not found` });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Create finalized order directly (new streamlined process)
router.post('/finalized', async (req: Request, res: Response) => {
  try {
    const orderData = insertOrderDraftSchema.parse(req.body);
    const finalizedOrder = await storage.createFinalizedOrder(orderData, req.body.finalizedBy);
    res.status(201).json(finalizedOrder);
  } catch (error) {
    console.error('Create finalized order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create finalized order" });
  }
});

// Create draft order (legacy method for special cases)
router.post('/draft', async (req: Request, res: Response) => {
  try {
    const orderData = insertOrderDraftSchema.parse(req.body);
    
    // Check if this should be a finalized order instead
    if (orderData.status === 'FINALIZED') {
      console.log(`🔄 REDIRECTING: Order ${orderData.orderId} marked as FINALIZED - creating directly in production queue`);
      const finalizedOrder = await storage.createFinalizedOrder(orderData, req.body.finalizedBy);
      return res.status(201).json(finalizedOrder);
    }
    
    // Only create draft for non-finalized orders
    const draft = await storage.createOrderDraft(orderData);
    res.status(201).json(draft);
  } catch (error) {
    console.error('Create draft error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create order draft" });
  }
});

router.put('/draft/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    console.log('Update order endpoint called for ID:', orderId);
    console.log('Update data received:', req.body);

    // Validate the input data using the schema
    const updates = insertOrderDraftSchema.partial().parse(req.body);
    console.log('Validated updates:', updates);

    // For finalized orders that need to appear in All Orders page,
    // prioritize updating the all_orders table first
    let updatedOrder;
    try {
      console.log('Attempting to update as finalized order...');
      updatedOrder = await storage.updateFinalizedOrder(orderId, updates);
      console.log('Updated finalized order successfully:', updatedOrder);
      return res.json(updatedOrder);
    } catch (finalizedError) {
      console.log('Finalized order not found, attempting draft order update...');
      console.log('Finalized error:', finalizedError.message);
      
      // If finalized update fails, try to update as a draft order
      try {
        console.log('Calling updateOrderDraft...');
        updatedOrder = await storage.updateOrderDraft(orderId, updates);
        console.log('Updated draft order successfully:', updatedOrder);
        return res.json(updatedOrder);
      } catch (draftError) {
        console.error('Draft order update failed:', draftError.message);
        return res.status(404).json({ error: `Order ${orderId} not found in drafts or finalized orders` });
      }
    }
  } catch (error) {
    console.error('Update order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to update order" });
  }
});

router.delete('/draft/:id', async (req: Request, res: Response) => {
  try {
    const draftId = req.params.id;
    await storage.deleteOrderDraft(draftId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete draft error:', error);
    res.status(500).json({ error: "Failed to delete order draft" });
  }
});

// Order Management (duplicate removed)
// Specific routes must come before parameterized routes

// Get all orders endpoint (backward compatibility)
router.get('/all', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getAllOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error retrieving all orders:', error);
    res.status(500).json({ error: "Failed to fetch order", details: (error as any).message });
  }
});

// Get all finalized orders
router.get('/finalized', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getAllFinalizedOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error retrieving finalized orders:', error);
    res.status(500).json({ error: "Failed to fetch finalized orders", details: (error as any).message });
  }
});

// Finalize an order (move from draft to production)
router.post('/draft/:id/finalize', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const { finalizedBy } = req.body;

    const finalizedOrder = await storage.finalizeOrder(orderId, finalizedBy);
    res.json({ 
      success: true, 
      message: "Order finalized successfully",
      order: finalizedOrder 
    });
  } catch (error) {
    console.error('Finalize order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to finalize order" });
  }
});

// Get finalized order by ID
router.get('/finalized/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const order = await storage.getFinalizedOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: "Finalized order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error('Get finalized order error:', error);
    res.status(500).json({ error: "Failed to fetch finalized order" });
  }
});

// Update finalized order
router.put('/finalized/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const updates = req.body;

    const updatedOrder = await storage.updateFinalizedOrder(orderId, updates);
    res.json(updatedOrder);
  } catch (error) {
    console.error('Update finalized order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to update finalized order" });
  }
});

// Production Orders (must be before :id route)
router.get('/production-orders', async (req: Request, res: Response) => {
  try {
    const productionOrders = await storage.getAllProductionOrders();
    res.json(productionOrders);
  } catch (error) {
    console.error('Get production orders error:', error);
    res.status(500).json({ error: "Failed to fetch production orders" });
  }
});

router.post('/production-orders/generate/:purchaseOrderId', async (req: Request, res: Response) => {
  try {
    const purchaseOrderId = parseInt(req.params.purchaseOrderId);
    const productionOrders = await storage.generateProductionOrders(purchaseOrderId);
    res.status(201).json(productionOrders);
  } catch (error) {
    console.error('Generate production orders error:', error);
    res.status(500).json({ error: "Failed to generate production orders" });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const order = await storage.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Order ID Generation
router.get('/last-id', async (req: Request, res: Response) => {
  try {
    const lastOrder = await storage.getLastOrderId();
    res.json({ lastId: lastOrder || 'AG000' });
  } catch (error) {
    console.error('Get last ID error:', error);
    res.status(500).json({ error: "Failed to get last order ID", lastId: 'AG000' });
  }
});

// Support both GET and POST for generate-id to maintain compatibility
router.get('/generate-id', async (req: Request, res: Response) => {
  try {
    const orderId = await storage.generateNextOrderId();
    res.json({ orderId });
  } catch (error) {
    console.error('Order ID generation failed:', error);
    res.status(500).json({ error: "Failed to generate order ID" });
  }
});

router.post('/generate-id', async (req: Request, res: Response) => {
  try {
    const orderId = await storage.generateNextOrderId();
    res.json({ orderId });
  } catch (error) {
    console.error('Order ID generation failed:', error);
    res.status(500).json({ error: "Failed to generate order ID" });
  }
});

// Pipeline Management
router.get('/pipeline-counts', async (req: Request, res: Response) => {
  try {
    const counts = await storage.getPipelineCounts();
    res.json(counts);
  } catch (error) {
    console.error('Get pipeline counts error:', error);
    res.status(500).json({ error: "Failed to fetch pipeline counts" });
  }
});

router.get('/pipeline-details', async (req: Request, res: Response) => {
  try {
    const details = await storage.getPipelineDetails();
    res.json(details);
  } catch (error) {
    console.error('Get pipeline details error:', error);
    res.status(500).json({ error: "Failed to fetch pipeline details" });
  }
});

// This route seems to be duplicated, keeping the first instance.
// router.post('/:id/progress', async (req: Request, res: Response) => {
//   try {
//     const orderId = req.params.id;
//     const { nextDepartment } = req.body;
//     const updatedOrder = await storage.progressOrder(orderId, nextDepartment);
//     res.json(updatedOrder);
//   } catch (error) {
//     console.error('Progress order error:', error);
//     res.status(500).json({ error: "Failed to progress order" });
//   }
// });



router.post('/:id/scrap', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const scrapData = req.body;
    const scrappedOrder = await storage.scrapOrder(orderId, scrapData);
    res.json(scrappedOrder);
  } catch (error) {
    console.error('Scrap order error:', error);
    res.status(500).json({ error: "Failed to scrap order" });
  }
});

// Move order back to draft for editing
router.post('/:id/move-to-draft', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    
    // Get the current order
    const currentOrder = await storage.getOrderById(orderId);
    if (!currentOrder) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Move order back to draft status by copying to order_drafts table
    const draftData = {
      orderId: currentOrder.orderId,
      customerId: currentOrder.customerId,
      orderDate: currentOrder.orderDate,
      dueDate: currentOrder.dueDate,
      modelId: currentOrder.modelId,
      features: currentOrder.features as Record<string, any> | null,
      handedness: currentOrder.handedness,
      notes: currentOrder.notes,
      status: 'DRAFT',
      paymentAmount: currentOrder.paymentAmount,
      paymentDate: currentOrder.paymentDate,
      paymentType: currentOrder.paymentType,
      discountCode: currentOrder.discountCode,
      customDiscountType: currentOrder.customDiscountType,
      customDiscountValue: currentOrder.customDiscountValue,
      showCustomDiscount: currentOrder.showCustomDiscount,
      priceOverride: currentOrder.priceOverride,
      shipping: currentOrder.shipping || 0,
      isPaid: currentOrder.isPaid || false,
      isFlattop: currentOrder.isFlattop || false
    };

    // Create draft order
    const draftOrder = await storage.createOrderDraft(draftData);
    
    // Remove from finalized orders (allOrders table) - commented out for now
    // await storage.deleteFinalizedOrderById(orderId);

    res.json({ 
      success: true, 
      message: "Order moved to draft for editing",
      draftOrder 
    });
  } catch (error) {
    console.error('Move to draft error:', error);
    res.status(500).json({ error: "Failed to move order to draft" });
  }
});

// Progress order to next department
router.post('/:id/progress', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const { nextDepartment } = req.body;
    
    const updatedOrder = await storage.progressOrder(orderId, nextDepartment);
    res.json(updatedOrder);
  } catch (error) {
    console.error('Progress order error:', error);
    res.status(500).json({ error: "Failed to progress order" });
  }
});

// Purchase Orders
router.get('/purchase-orders', async (req: Request, res: Response) => {
  try {
    const purchaseOrders = await storage.getAllPurchaseOrders();
    res.json(purchaseOrders);
  } catch (error) {
    console.error('Get purchase orders error:', error);
    res.status(500).json({ error: "Failed to fetch purchase orders" });
  }
});

router.post('/purchase-orders', async (req: Request, res: Response) => {
  try {
    const purchaseOrderData = insertPurchaseOrderSchema.parse(req.body);
    const newPurchaseOrder = await storage.createPurchaseOrder(purchaseOrderData);
    res.status(201).json(newPurchaseOrder);
  } catch (error) {
    console.error('Create purchase order error:', error);
    res.status(500).json({ error: "Failed to create purchase order" });
  }
});



// Payment Management Routes
// Get all payments for an order
router.get('/:orderId/payments', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    console.log('Fetching payments for order:', orderId);
    
    // Get payments from separate payments table
    const payments = await storage.getPaymentsByOrderId(orderId);
    console.log('Found payments:', payments);
    
    res.json(payments);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// Add a new payment to an order
router.post('/:orderId/payments', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    console.log('Creating payment for order:', orderId);
    console.log('Payment data received:', req.body);
    
    const paymentData = insertPaymentSchema.parse({ ...req.body, orderId });
    console.log('Validated payment data:', paymentData);
    
    const newPayment = await storage.createPayment(paymentData);
    console.log('Payment created successfully:', newPayment);
    
    res.status(201).json(newPayment);
  } catch (error) {
    console.error('Create payment error:', error);
    console.error('Error details:', error.message);
    res.status(400).json({ error: "Failed to create payment", details: (error as any).message });
  }
});

// Update a payment
router.put('/payments/:paymentId', async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.paymentId);
    const paymentData = insertPaymentSchema.parse(req.body);
    const updatedPayment = await storage.updatePayment(paymentId, paymentData);
    res.json(updatedPayment);
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(400).json({ error: "Failed to update payment", details: (error as any).message });
  }
});

// Delete a payment
router.delete('/payments/:paymentId', async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.paymentId);
    await storage.deletePayment(paymentId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ error: "Failed to delete payment" });
  }
});

// Progress order to next department
router.post('/:orderId/progress', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { nextDepartment } = req.body;

    console.log(`🏭 Progressing order ${orderId}${nextDepartment ? ` to ${nextDepartment}` : ''}`);

    // Use the proper progressOrder method from storage that handles the department flow logic
    const updatedOrder = await storage.progressOrder(orderId, nextDepartment);

    console.log(`✅ Successfully progressed order ${orderId} to ${updatedOrder.currentDepartment}`);
    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Progress order error:', error);
    res.status(500).json({ error: "Failed to progress order", details: (error as any).message });
  }
});

// Complete QC and move to shipping
router.post('/complete-qc/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { qcNotes, qcPassedAll } = req.body;

    const updateData = {
      currentDepartment: qcPassedAll ? 'Shipping' : 'QC',
      qcCompletedAt: qcPassedAll ? new Date() : null,
      qcNotes: qcNotes || null,
      qcPassed: qcPassedAll,
      status: qcPassedAll ? 'Ready for Shipping' : 'In QC'
    };

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
      message: qcPassedAll ? 'Order moved to shipping' : 'QC notes updated',
      order: updatedOrder 
    });

  } catch (error) {
    console.error('Error completing QC:', error);
    res.status(500).json({ error: 'Failed to complete QC process' });
  }
});

// Cancel an order
router.post('/cancel/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    console.log('🔧 CANCEL ORDER ROUTE CALLED');
    console.log('🔧 Order ID:', orderId);
    console.log('🔧 Cancel reason:', reason);

    // Try to cancel the order (check if it exists first)
    const order = await storage.getOrderById(orderId);
    if (!order) {
      console.log('🔧 Order not found:', orderId);
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log('🔧 Found order:', order.id, order.status);

    // Update the order with cancellation information
    const updateData = {
      isCancelled: true,
      cancelledAt: new Date(),
      cancelReason: reason || 'No reason provided',
      status: 'CANCELLED',
      updatedAt: new Date()
    };

    let updatedOrder;
    try {
      // Try updating in finalized orders first
      updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
      console.log('🔧 Updated finalized order successfully');
    } catch (finalizedError) {
      console.log('🔧 Failed to update finalized order, trying draft orders:', finalizedError);
      try {
        // If not found in finalized orders, try draft orders
        updatedOrder = await storage.updateOrderDraft(orderId, updateData);
        console.log('🔧 Updated draft order successfully');
      } catch (draftError) {
        console.error('🔧 Failed to update both finalized and draft orders:', draftError);
        throw new Error('Order not found in either finalized or draft orders');
      }
    }

    console.log('🔧 Order cancelled successfully:', updatedOrder.orderId);

    res.json({ 
      success: true, 
      message: 'Order cancelled successfully',
      order: updatedOrder
    });

  } catch (error) {
    console.error('🔧 Error cancelling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

export default router;