import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  insertInventoryItemSchema,
  insertInventoryScanSchema,
  insertPartsRequestSchema,
  insertInventoryBalanceSchema,
  insertInventoryTransactionSchema,
  insertOutsideProcessingLocationSchema,
  insertOutsideProcessingJobSchema,
  insertVendorPartSchema,
  updateInventoryItemSchema,
  updateInventoryBalanceSchema,
  updatePartsRequestSchema,
  updateOutsideProcessingLocationSchema,
  updateOutsideProcessingJobSchema,
  updateVendorPartSchema
} from '@shared/schema';

const router = Router();

// POST route for creating inventory items at the root level (to match client expectations)
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemData = insertInventoryItemSchema.parse(req.body);
    const newItem = await storage.createInventoryItem(itemData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Create inventory item error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create inventory item" });
  }
});

// PUT route for updating inventory items at the root level
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const updates = updateInventoryItemSchema.parse(req.body);
    const updatedItem = await storage.updateInventoryItem(itemId, updates);
    res.json(updatedItem);
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ error: "Failed to update inventory item" });
  }
});

// DELETE route for deleting inventory items at the root level
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    await storage.deleteInventoryItem(itemId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({ error: "Failed to delete inventory item" });
  }
});

// Inventory Items Management
router.get('/items', async (req: Request, res: Response) => {
  try {
    const items = await storage.getAllInventoryItems();
    res.json(items);
  } catch (error) {
    console.error('Get inventory items error:', error);
    res.status(500).json({ error: "Failed to fetch inventory items" });
  }
});

router.get('/items/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const item = await storage.getInventoryItem(itemId);
    
    if (!item) {
      return res.status(404).json({ error: "Inventory item not found" });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({ error: "Failed to fetch inventory item" });
  }
});

router.post('/items', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemData = insertInventoryItemSchema.parse(req.body);
    const newItem = await storage.createInventoryItem(itemData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Create inventory item error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create inventory item" });
  }
});

router.put('/items/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const updates = updateInventoryItemSchema.parse(req.body);
    const updatedItem = await storage.updateInventoryItem(itemId, updates);
    res.json(updatedItem);
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ error: "Failed to update inventory item" });
  }
});

router.delete('/items/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    await storage.deleteInventoryItem(itemId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({ error: "Failed to delete inventory item" });
  }
});

// Inventory Scanning
router.get('/scans', async (req: Request, res: Response) => {
  try {
    const scans = await storage.getAllInventoryScans();
    res.json(scans);
  } catch (error) {
    console.error('Get inventory scans error:', error);
    res.status(500).json({ error: "Failed to fetch inventory scans" });
  }
});

router.post('/scans', authenticateToken, async (req: Request, res: Response) => {
  try {
    const scanData = insertInventoryScanSchema.parse(req.body);
    const newScan = await storage.createInventoryScan(scanData);
    res.status(201).json(newScan);
  } catch (error) {
    console.error('Create inventory scan error:', error);
    res.status(500).json({ error: "Failed to create inventory scan" });
  }
});

// Parts Requests
router.get('/parts-requests', async (req: Request, res: Response) => {
  try {
    const requests = await storage.getAllPartsRequests();
    res.json(requests);
  } catch (error) {
    console.error('Get parts requests error:', error);
    res.status(500).json({ error: "Failed to fetch parts requests" });
  }
});

router.post('/parts-requests', async (req: Request, res: Response) => {
  try {
    const requestData = insertPartsRequestSchema.parse(req.body);
    const newRequest = await storage.createPartsRequest(requestData);
    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Create parts request error:', error);
    res.status(500).json({ error: "Failed to create parts request" });
  }
});

router.put('/parts-requests/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    const updates = updatePartsRequestSchema.parse(req.body);
    const updatedRequest = await storage.updatePartsRequest(requestId, updates);
    res.json(updatedRequest);
  } catch (error) {
    console.error('Update parts request error:', error);
    res.status(500).json({ error: "Failed to update parts request" });
  }
});

// CSV Import endpoint
router.post('/import/csv', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { csvData } = req.body;
    
    if (!csvData) {
      return res.status(400).json({ error: 'CSV data is required' });
    }

    // Parse CSV data (simple implementation)
    const lines = csvData.split('\n').filter((line: string) => line.trim());
    if (lines.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    const headers = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1);
    
    let importedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const values = rows[i].split(',').map((v: string) => v.trim().replace(/"/g, ''));
        
        if (values.length !== headers.length) {
          errors.push(`Row ${i + 2}: Column count mismatch`);
          continue;
        }

        const itemData: any = {};
        headers.forEach((header: string, index: number) => {
          const value = values[index];
          
          switch (header.toLowerCase()) {
            case 'ag part#':
            case 'agpartnumber':
              itemData.agPartNumber = value;
              break;
            case 'name':
              itemData.name = value;
              break;
            case 'source':
              itemData.source = value || null;
              break;
            case 'supplier part #':
            case 'supplierpartnumber':
              itemData.supplierPartNumber = value || null;
              break;
            case 'cost per':
            case 'costper':
              itemData.costPer = value && !isNaN(parseFloat(value)) ? parseFloat(value) : null;
              break;
            case 'order date':
            case 'orderdate':
              itemData.orderDate = value || null;
              break;
            case 'dept.':
            case 'dept':
            case 'department':
              itemData.department = value || null;
              break;
            case 'secondary source':
            case 'secondarysource':
              itemData.secondarySource = value || null;
              break;
            case 'notes':
              itemData.notes = value || null;
              break;
          }
        });

        if (!itemData.agPartNumber || !itemData.name) {
          errors.push(`Row ${i + 2}: Missing required fields (AG Part# and Name)`);
          continue;
        }

        const validatedData = insertInventoryItemSchema.parse(itemData);
        await storage.createInventoryItem(validatedData);
        importedCount++;
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      success: true,
      importedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('CSV import error:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

// ============================================================================
// ENHANCED INVENTORY MANAGEMENT & MRP ROUTES
// ============================================================================

// ============================================================================
// INVENTORY BALANCES MANAGEMENT
// ============================================================================

// Get inventory balance for specific part/location
router.get('/balances/:partId', async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    const { locationId } = req.query;
    
    const balance = await storage.getInventoryBalance(partId, locationId as string);
    if (!balance) {
      return res.status(404).json({ error: "Inventory balance not found" });
    }
    
    res.json(balance);
  } catch (error) {
    console.error('Get inventory balance error:', error);
    res.status(500).json({ error: "Failed to fetch inventory balance" });
  }
});

// Get all inventory balances with filtering
router.get('/balances', async (req: Request, res: Response) => {
  try {
    const { partId, locationId, lowStock } = req.query;
    
    const params = {
      partId: partId as string,
      locationId: locationId as string,
      lowStock: lowStock === 'true'
    };
    
    const balances = await storage.getAllInventoryBalances(params);
    res.json(balances);
  } catch (error) {
    console.error('Get inventory balances error:', error);
    res.status(500).json({ error: "Failed to fetch inventory balances" });
  }
});

// Update inventory balance
router.put('/balances/:partId/:locationId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { partId, locationId } = req.params;
    const updateData = updateInventoryBalanceSchema.parse(req.body);
    
    const updatedBalance = await storage.updateInventoryBalance(partId, locationId, updateData);
    res.json(updatedBalance);
  } catch (error) {
    console.error('Update inventory balance error:', error);
    res.status(500).json({ error: "Failed to update inventory balance" });
  }
});

// ============================================================================
// INVENTORY TRANSACTIONS MANAGEMENT
// ============================================================================

// Get all inventory transactions with filtering and pagination
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const { partId, transactionType, dateFrom, dateTo, page = '1', limit = '50' } = req.query;
    
    const params = {
      partId: partId as string,
      transactionType: transactionType as string,
      dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
      dateTo: dateTo ? new Date(dateTo as string) : undefined,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };
    
    const transactions = await storage.getAllInventoryTransactions(params);
    res.json(transactions);
  } catch (error) {
    console.error('Get inventory transactions error:', error);
    res.status(500).json({ error: "Failed to fetch inventory transactions" });
  }
});

// Get specific inventory transaction
router.get('/transactions/:transactionId', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = await storage.getInventoryTransaction(transactionId);
    if (!transaction) {
      return res.status(404).json({ error: "Inventory transaction not found" });
    }
    
    res.json(transaction);
  } catch (error) {
    console.error('Get inventory transaction error:', error);
    res.status(500).json({ error: "Failed to fetch inventory transaction" });
  }
});

// Create new inventory transaction
router.post('/transactions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const transactionData = insertInventoryTransactionSchema.parse(req.body);
    const newTransaction = await storage.createInventoryTransaction(transactionData);
    res.status(201).json(newTransaction);
  } catch (error) {
    console.error('Create inventory transaction error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create inventory transaction" });
  }
});

// Process inventory transaction (with balance updates)
router.post('/transactions/process', authenticateToken, async (req: Request, res: Response) => {
  try {
    const transactionData = insertInventoryTransactionSchema.parse(req.body);
    const result = await storage.processInventoryTransaction(transactionData);
    res.status(201).json(result);
  } catch (error) {
    console.error('Process inventory transaction error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to process inventory transaction" });
  }
});

// ============================================================================
// PROGRESSIVE ALLOCATION MANAGEMENT
// ============================================================================

// Allocate inventory to customer order
router.post('/allocate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { partId, quantity, customerOrderId } = req.body;
    
    if (!partId || !quantity || !customerOrderId) {
      return res.status(400).json({ error: "partId, quantity, and customerOrderId are required" });
    }
    
    const result = await storage.allocateInventoryToOrder(partId, quantity, customerOrderId);
    res.json(result);
  } catch (error) {
    console.error('Allocate inventory error:', error);
    res.status(500).json({ error: "Failed to allocate inventory" });
  }
});

// Commit inventory from order (allocated → committed)
router.post('/commit', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { partId, quantity, customerOrderId } = req.body;
    
    if (!partId || !quantity || !customerOrderId) {
      return res.status(400).json({ error: "partId, quantity, and customerOrderId are required" });
    }
    
    await storage.commitInventoryFromOrder(partId, quantity, customerOrderId);
    res.json({ success: true, message: "Inventory committed successfully" });
  } catch (error) {
    console.error('Commit inventory error:', error);
    res.status(500).json({ error: "Failed to commit inventory" });
  }
});

// Consume allocated inventory (committed → consumed)
router.post('/consume', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { partId, quantity, productionOrderId } = req.body;
    
    if (!partId || !quantity || !productionOrderId) {
      return res.status(400).json({ error: "partId, quantity, and productionOrderId are required" });
    }
    
    await storage.consumeAllocatedInventory(partId, quantity, productionOrderId);
    res.json({ success: true, message: "Inventory consumed successfully" });
  } catch (error) {
    console.error('Consume inventory error:', error);
    res.status(500).json({ error: "Failed to consume inventory" });
  }
});

// Release allocated inventory (back to available)
router.post('/release', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { partId, customerOrderId } = req.body;
    
    if (!partId || !customerOrderId) {
      return res.status(400).json({ error: "partId and customerOrderId are required" });
    }
    
    await storage.releaseAllocatedInventory(partId, customerOrderId);
    res.json({ success: true, message: "Inventory released successfully" });
  } catch (error) {
    console.error('Release inventory error:', error);
    res.status(500).json({ error: "Failed to release inventory" });
  }
});

// ============================================================================
// OUTSIDE PROCESSING MANAGEMENT
// ============================================================================

// Get all outside processing locations
router.get('/outside-processing/locations', async (req: Request, res: Response) => {
  try {
    const locations = await storage.getAllOutsideProcessingLocations();
    res.json(locations);
  } catch (error) {
    console.error('Get outside processing locations error:', error);
    res.status(500).json({ error: "Failed to fetch outside processing locations" });
  }
});

// Get specific outside processing location
router.get('/outside-processing/locations/:locationId', async (req: Request, res: Response) => {
  try {
    const { locationId } = req.params;
    
    const location = await storage.getOutsideProcessingLocation(locationId);
    if (!location) {
      return res.status(404).json({ error: "Outside processing location not found" });
    }
    
    res.json(location);
  } catch (error) {
    console.error('Get outside processing location error:', error);
    res.status(500).json({ error: "Failed to fetch outside processing location" });
  }
});

// Create outside processing location
router.post('/outside-processing/locations', authenticateToken, async (req: Request, res: Response) => {
  try {
    const locationData = insertOutsideProcessingLocationSchema.parse(req.body);
    const newLocation = await storage.createOutsideProcessingLocation(locationData);
    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Create outside processing location error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create outside processing location" });
  }
});

// Update outside processing location
router.put('/outside-processing/locations/:locationId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { locationId } = req.params;
    const updateData = updateOutsideProcessingLocationSchema.parse(req.body);
    
    const updatedLocation = await storage.updateOutsideProcessingLocation(locationId, updateData);
    res.json(updatedLocation);
  } catch (error) {
    console.error('Update outside processing location error:', error);
    res.status(500).json({ error: "Failed to update outside processing location" });
  }
});

// Get all outside processing jobs
router.get('/outside-processing/jobs', async (req: Request, res: Response) => {
  try {
    const { vendorId, status, locationId } = req.query;
    
    const params = {
      vendorId: vendorId as string,
      status: status as string,
      locationId: locationId as string
    };
    
    const jobs = await storage.getAllOutsideProcessingJobs(params);
    res.json(jobs);
  } catch (error) {
    console.error('Get outside processing jobs error:', error);
    res.status(500).json({ error: "Failed to fetch outside processing jobs" });
  }
});

// Get specific outside processing job
router.get('/outside-processing/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    const job = await storage.getOutsideProcessingJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Outside processing job not found" });
    }
    
    res.json(job);
  } catch (error) {
    console.error('Get outside processing job error:', error);
    res.status(500).json({ error: "Failed to fetch outside processing job" });
  }
});

// Create outside processing job
router.post('/outside-processing/jobs', authenticateToken, async (req: Request, res: Response) => {
  try {
    const jobData = insertOutsideProcessingJobSchema.parse(req.body);
    const newJob = await storage.createOutsideProcessingJob(jobData);
    res.status(201).json(newJob);
  } catch (error) {
    console.error('Create outside processing job error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create outside processing job" });
  }
});

// Update outside processing job
router.put('/outside-processing/jobs/:jobId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const updateData = updateOutsideProcessingJobSchema.parse(req.body);
    
    const updatedJob = await storage.updateOutsideProcessingJob(jobId, updateData);
    res.json(updatedJob);
  } catch (error) {
    console.error('Update outside processing job error:', error);
    res.status(500).json({ error: "Failed to update outside processing job" });
  }
});

// Return parts from outside processing
router.post('/outside-processing/jobs/:jobId/return', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { partsReturned, scrapQty } = req.body;
    
    if (!partsReturned) {
      return res.status(400).json({ error: "partsReturned is required" });
    }
    
    const updatedJob = await storage.returnPartsFromOutsideProcessing(jobId, partsReturned, scrapQty);
    res.json(updatedJob);
  } catch (error) {
    console.error('Return parts from outside processing error:', error);
    res.status(500).json({ error: "Failed to return parts from outside processing" });
  }
});

// ============================================================================
// VENDOR PARTS MANAGEMENT
// ============================================================================

// Get vendor parts for specific part
router.get('/vendor-parts/part/:partId', async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    
    const vendorParts = await storage.getVendorPartsForPart(partId);
    res.json(vendorParts);
  } catch (error) {
    console.error('Get vendor parts for part error:', error);
    res.status(500).json({ error: "Failed to fetch vendor parts for part" });
  }
});

// Get vendor parts for specific vendor
router.get('/vendor-parts/vendor/:vendorId', async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.params;
    
    const vendorParts = await storage.getVendorPartsForVendor(vendorId);
    res.json(vendorParts);
  } catch (error) {
    console.error('Get vendor parts for vendor error:', error);
    res.status(500).json({ error: "Failed to fetch vendor parts for vendor" });
  }
});

// Create vendor part
router.post('/vendor-parts', authenticateToken, async (req: Request, res: Response) => {
  try {
    const vendorPartData = insertVendorPartSchema.parse(req.body);
    const newVendorPart = await storage.createVendorPart(vendorPartData);
    res.status(201).json(newVendorPart);
  } catch (error) {
    console.error('Create vendor part error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create vendor part" });
  }
});

// Update vendor part
router.put('/vendor-parts/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const vendorPartId = parseInt(req.params.id);
    const updateData = req.body;
    
    const updatedVendorPart = await storage.updateVendorPart(vendorPartId, updateData);
    res.json(updatedVendorPart);
  } catch (error) {
    console.error('Update vendor part error:', error);
    res.status(500).json({ error: "Failed to update vendor part" });
  }
});

// Delete vendor part
router.delete('/vendor-parts/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const vendorPartId = parseInt(req.params.id);
    
    await storage.deleteVendorPart(vendorPartId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete vendor part error:', error);
    res.status(500).json({ error: "Failed to delete vendor part" });
  }
});

// Get preferred vendor for part
router.get('/vendor-parts/preferred/:partId', async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    
    const preferredVendor = await storage.getPreferredVendorForPart(partId);
    if (!preferredVendor) {
      return res.status(404).json({ error: "No preferred vendor found for this part" });
    }
    
    res.json(preferredVendor);
  } catch (error) {
    console.error('Get preferred vendor error:', error);
    res.status(500).json({ error: "Failed to fetch preferred vendor" });
  }
});

// Generate purchase order suggestions
router.get('/purchase-order-suggestions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const suggestions = await storage.generatePurchaseOrderSuggestions();
    res.json(suggestions);
  } catch (error) {
    console.error('Generate PO suggestions error:', error);
    res.status(500).json({ error: "Failed to generate purchase order suggestions" });
  }
});

export default router;