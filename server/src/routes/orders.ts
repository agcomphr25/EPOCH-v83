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
  insertP2ProductionOrderSchema
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



// Order Draft Management
router.get('/drafts', async (req: Request, res: Response) => {
  try {
    const drafts = await storage.getAllOrderDrafts();
    res.json(drafts);
  } catch (error) {
    console.error('Get drafts error:', error);
    res.status(500).json({ error: "Failed to fetch order drafts" });
  }
});

router.get('/draft/:id', async (req: Request, res: Response) => {
  try {
    const draftId = req.params.id;
    const draft = await storage.getOrderDraftById(draftId);
    
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
    const updates = req.body;
    const updatedDraft = await storage.updateOrderDraft(draftId, updates);
    res.json(updatedDraft);
  } catch (error) {
    console.error('Update draft error:', error);
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
    const lastOrderId = await storage.getLastOrderId();
    const orderId = generateP1OrderId(new Date(), lastOrderId || '');
    res.json({ orderId });
  } catch (error) {
    console.error('Generate ID error:', error);
    const fallbackId = `AG${Date.now().toString().slice(-6)}`;
    res.json({ orderId: fallbackId });
  }
});

router.post('/generate-id', async (req: Request, res: Response) => {
  try {
    const lastOrderId = await storage.getLastOrderId();
    const orderId = generateP1OrderId(new Date(), lastOrderId || '');
    res.json({ orderId });
  } catch (error) {
    console.error('Generate ID error:', error);
    const fallbackId = `AG${Date.now().toString().slice(-6)}`;
    res.json({ orderId: fallbackId });
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

// Production Orders
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
    const productionOrders = await storage.generateProductionOrdersFromPO(purchaseOrderId);
    res.status(201).json(productionOrders);
  } catch (error) {
    console.error('Generate production orders error:', error);
    res.status(500).json({ error: "Failed to generate production orders" });
  }
});



export default router;