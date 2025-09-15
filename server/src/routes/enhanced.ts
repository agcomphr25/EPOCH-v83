import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  insertInventoryItemSchema,
  insertInventoryBalanceSchema,
  insertInventoryTransactionSchema,
  insertOutsideProcessingLocationSchema,
  insertOutsideProcessingJobSchema,
  insertVendorPartSchema,
  updateInventoryItemSchema,
  updateInventoryBalanceSchema,
  updateOutsideProcessingLocationSchema,
  updateOutsideProcessingJobSchema,
  updateVendorPartSchema
} from '@shared/schema';

const router = Router();

// ENHANCED INVENTORY ENDPOINTS (completely independent from legacy)
// ================================================================

// GET /api/enhanced/inventory/items - List all inventory items
router.get('/inventory/items', async (req: Request, res: Response) => {
  try {
    const items = await storage.getAllInventoryItems();
    res.json(items);
  } catch (error) {
    console.error('Enhanced inventory fetch error:', error);
    res.status(500).json({ error: "Failed to fetch inventory items" });
  }
});

// POST /api/enhanced/inventory/items - Create inventory item
router.post('/inventory/items', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemData = insertInventoryItemSchema.parse(req.body);
    const newItem = await storage.createInventoryItem(itemData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Enhanced inventory create error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create inventory item" });
  }
});

// PUT /api/enhanced/inventory/items/:id - Update inventory item
router.put('/inventory/items/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const updates = updateInventoryItemSchema.parse(req.body);
    const updatedItem = await storage.updateInventoryItem(itemId, updates);
    res.json(updatedItem);
  } catch (error) {
    console.error('Enhanced inventory update error:', error);
    res.status(500).json({ error: "Failed to update inventory item" });
  }
});

// DELETE /api/enhanced/inventory/items/:id - Delete inventory item
router.delete('/inventory/items/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    await storage.deleteInventoryItem(itemId);
    res.status(204).send();
  } catch (error) {
    console.error('Enhanced inventory delete error:', error);
    res.status(500).json({ error: "Failed to delete inventory item" });
  }
});

// ENHANCED INVENTORY BALANCES
// ===========================

// GET /api/enhanced/inventory/balances - Get all inventory balances
router.get('/inventory/balances', async (req: Request, res: Response) => {
  try {
    const balances = await storage.getAllInventoryBalances();
    res.json(balances);
  } catch (error) {
    console.error('Enhanced inventory balances fetch error:', error);
    res.status(500).json({ error: "Failed to fetch inventory balances" });
  }
});

// POST /api/enhanced/inventory/balances - Process inventory transaction (creates/updates balance)
router.post('/inventory/balances', authenticateToken, async (req: Request, res: Response) => {
  try {
    const transactionData = insertInventoryTransactionSchema.parse(req.body);
    const result = await storage.processInventoryTransaction(transactionData);
    res.status(201).json(result.updatedBalance);
  } catch (error) {
    console.error('Enhanced inventory balance create error:', error);
    res.status(500).json({ error: "Failed to process inventory balance" });
  }
});

// ENHANCED INVENTORY TRANSACTIONS
// ===============================

// GET /api/enhanced/inventory/transactions - Get all transactions
router.get('/inventory/transactions', async (req: Request, res: Response) => {
  try {
    const transactions = await storage.getAllInventoryTransactions();
    res.json(transactions);
  } catch (error) {
    console.error('Enhanced inventory transactions fetch error:', error);
    res.status(500).json({ error: "Failed to fetch inventory transactions" });
  }
});

// POST /api/enhanced/inventory/transactions - Create transaction
router.post('/inventory/transactions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const transactionData = insertInventoryTransactionSchema.parse(req.body);
    const newTransaction = await storage.createInventoryTransaction(transactionData);
    res.status(201).json(newTransaction);
  } catch (error) {
    console.error('Enhanced inventory transaction create error:', error);
    res.status(500).json({ error: "Failed to create inventory transaction" });
  }
});

// ENHANCED MRP SYSTEM (independent calculations)
// ==============================================

// POST /api/enhanced/mrp/calculate - Run MRP calculation (placeholder)
router.post('/mrp/calculate', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Enhanced MRP calculation - independent of legacy system
    const result = { status: 'completed', timestamp: new Date(), message: 'Enhanced MRP calculation completed' };
    res.json(result);
  } catch (error) {
    console.error('Enhanced MRP calculation error:', error);
    res.status(500).json({ error: "Failed to run MRP calculation" });
  }
});

// GET /api/enhanced/mrp/requirements - Get MRP requirements
router.get('/mrp/requirements', async (req: Request, res: Response) => {
  try {
    const requirements = await storage.getMrpRequirements();
    res.json(requirements);
  } catch (error) {
    console.error('Enhanced MRP requirements fetch error:', error);
    res.status(500).json({ error: "Failed to fetch MRP requirements" });
  }
});

// GET /api/enhanced/mrp/shortages - Get material shortages
router.get('/mrp/shortages', async (req: Request, res: Response) => {
  try {
    const shortages = await storage.getMrpShortages();
    res.json(shortages);
  } catch (error) {
    console.error('Enhanced MRP shortages fetch error:', error);
    res.status(500).json({ error: "Failed to fetch MRP shortages" });
  }
});

// ENHANCED VENDOR & PROCESSING (independent from legacy)
// ======================================================

// GET /api/enhanced/vendors/parts - Get all vendor parts
router.get('/vendors/parts', async (req: Request, res: Response) => {
  try {
    // Get all vendor parts - enhanced system only
    const vendorParts: any[] = []; // Placeholder for enhanced vendor parts
    res.json(vendorParts);
  } catch (error) {
    console.error('Enhanced vendor parts fetch error:', error);
    res.status(500).json({ error: "Failed to fetch vendor parts" });
  }
});

// POST /api/enhanced/vendors/parts - Create vendor part
router.post('/vendors/parts', authenticateToken, async (req: Request, res: Response) => {
  try {
    const partData = insertVendorPartSchema.parse(req.body);
    const newPart = await storage.createVendorPart(partData);
    res.status(201).json(newPart);
  } catch (error) {
    console.error('Enhanced vendor part create error:', error);
    res.status(500).json({ error: "Failed to create vendor part" });
  }
});

// GET /api/enhanced/processing/locations - Get outside processing locations
router.get('/processing/locations', async (req: Request, res: Response) => {
  try {
    const locations = await storage.getAllOutsideProcessingLocations();
    res.json(locations);
  } catch (error) {
    console.error('Enhanced processing locations fetch error:', error);
    res.status(500).json({ error: "Failed to fetch processing locations" });
  }
});

// POST /api/enhanced/processing/locations - Create processing location
router.post('/processing/locations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const locationData = insertOutsideProcessingLocationSchema.parse(req.body);
    const newLocation = await storage.createOutsideProcessingLocation(locationData);
    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Enhanced processing location create error:', error);
    res.status(500).json({ error: "Failed to create processing location" });
  }
});

// GET /api/enhanced/processing/jobs - Get processing jobs
router.get('/processing/jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await storage.getAllOutsideProcessingJobs();
    res.json(jobs);
  } catch (error) {
    console.error('Enhanced processing jobs fetch error:', error);
    res.status(500).json({ error: "Failed to fetch processing jobs" });
  }
});

// POST /api/enhanced/processing/jobs - Create processing job
router.post('/processing/jobs', authenticateToken, async (req: Request, res: Response) => {
  try {
    const jobData = insertOutsideProcessingJobSchema.parse(req.body);
    const newJob = await storage.createOutsideProcessingJob(jobData);
    res.status(201).json(newJob);
  } catch (error) {
    console.error('Enhanced processing job create error:', error);
    res.status(500).json({ error: "Failed to create processing job" });
  }
});

export default router;