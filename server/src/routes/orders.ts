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
    const draftId = req.params.id;
    let draft;

    // Check if the ID is a number (database ID) or string (order ID like AG422)
    if (/^\d+$/.test(draftId)) {
      // It's a numeric database ID
      draft = await storage.getOrderDraftById(parseInt(draftId));
    } else {
      // It's an order ID like AG422
      draft = await storage.getOrderDraft(draftId);
    }

    if (!draft) {
      return res.status(404).json({ error: "Order draft not found" });
    }

    res.json(draft);
  } catch (error) {
    console.error('Get draft error:', error);
    res.status(500).json({ error: "Failed to fetch order draft" });
  }
});

router.post('/draft', async (req: Request, res: Response) => {
  try {
    const orderData = insertOrderDraftSchema.parse(req.body);
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
    const draftId = req.params.id;
    console.log('Update draft endpoint called for ID:', draftId);
    console.log('Update data received:', req.body);

    // Validate the input data using the schema
    const updates = insertOrderDraftSchema.partial().parse(req.body);
    console.log('Validated updates:', updates);

    const updatedDraft = await storage.updateOrderDraft(draftId, updates);
    console.log('Update successful, returning:', updatedDraft);
    res.json(updatedDraft);
  } catch (error) {
    console.error('Update draft error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to update order draft" });
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
// Get all payments for an order (now using main orders table)
router.get('/:orderId/payments', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    
    // Get payment information from main orders table instead of separate payments table
    const order = await storage.getOrderById(orderId);
    
    if (!order) {
      return res.json([]);
    }
    
    // If order has payment data, return it in the expected format
    if (order.isPaid && order.paymentAmount && order.paymentAmount > 0) {
      const payment = {
        id: 1, // Single payment ID
        orderId: order.orderId,
        paymentType: order.paymentType || 'unknown',
        paymentAmount: order.paymentAmount,
        paymentDate: order.paymentDate || order.paymentTimestamp,
        notes: `Payment from main orders table: $${order.paymentAmount} via ${order.paymentType}`,
        createdAt: order.paymentTimestamp || order.updatedAt,
        updatedAt: order.paymentTimestamp || order.updatedAt
      };
      res.json([payment]);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// Add a new payment to an order
router.post('/:orderId/payments', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    const paymentData = insertPaymentSchema.parse({ ...req.body, orderId });
    const newPayment = await storage.createPayment(paymentData);
    res.status(201).json(newPayment);
  } catch (error) {
    console.error('Create payment error:', error);
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

    console.log(`🏭 Progressing order ${orderId} to ${nextDepartment}`);

    // Try to find order in finalized orders first
    let existingOrder = await storage.getFinalizedOrderById(orderId);
    let isFinalized = true;

    if (!existingOrder) {
      // If not found in finalized orders, try draft orders
      existingOrder = await storage.getOrderDraft(orderId);
      isFinalized = false;
    }

    if (!existingOrder) {
      console.error(`❌ Order ${orderId} not found in either finalized or draft orders`);
      return res.status(404).json({ error: `Order ${orderId} not found` });
    }

    console.log(`📋 Found order ${orderId} in department: ${existingOrder.currentDepartment} (${isFinalized ? 'finalized' : 'draft'})`);

    // Prepare completion timestamp update based on current department
    const completionUpdates: any = {};
    const now = new Date();

    switch (existingOrder.currentDepartment) {
      case 'Layup': completionUpdates.layupCompletedAt = now; break;
      case 'Plugging': completionUpdates.pluggingCompletedAt = now; break;
      case 'CNC': completionUpdates.cncCompletedAt = now; break;
      case 'Finish': completionUpdates.finishCompletedAt = now; break;
      case 'Gunsmith': completionUpdates.gunsmithCompletedAt = now; break;
      case 'Paint': completionUpdates.paintCompletedAt = now; break;
      case 'QC': completionUpdates.qcCompletedAt = now; break;
      case 'Shipping': completionUpdates.shippingCompletedAt = now; break;
    }

    // Update the appropriate table
    let updatedOrder;
    if (isFinalized) {
      updatedOrder = await storage.updateFinalizedOrder(orderId, {
        currentDepartment: nextDepartment,
        ...completionUpdates
      });
    } else {
      updatedOrder = await storage.updateOrderDraft(orderId, {
        currentDepartment: nextDepartment,
        ...completionUpdates
      });
    }

    console.log(`✅ Successfully progressed order ${orderId} from ${existingOrder.currentDepartment} to ${nextDepartment}`);
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

export default router;