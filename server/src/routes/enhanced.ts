import { Router, Request, Response } from 'express';
import { enhancedStorage } from '../storage/enhanced-storage';
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
    const items = await enhancedStorage.getAllInventoryItems();
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
    const newItem = await enhancedStorage.createInventoryItem(itemData);
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
    const updatedItem = await enhancedStorage.updateInventoryItem(itemId, updates);
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
    await enhancedStorage.deleteInventoryItem(itemId);
    res.status(204).send();
  } catch (error) {
    console.error('Enhanced inventory delete error:', error);
    res.status(500).json({ error: "Failed to delete inventory item" });
  }
});

// CSV EXPORT/IMPORT ENDPOINTS (Enhanced Only)
// ===========================================

// GET /api/enhanced/inventory/export/csv - Export enhanced inventory items to CSV
router.get('/inventory/export/csv', async (req: Request, res: Response) => {
  try {
    const items = await enhancedStorage.getAllInventoryItems();
    
    if (items.length === 0) {
      return res.status(404).json({ error: "No inventory items to export" });
    }

    // Create CSV headers
    const headers = [
      'AG Part#',
      'Name', 
      'Source',
      'Supplier Part #',
      'Cost per',
      'Order Date',
      'Dept.',
      'Secondary Source',
      'Notes'
    ];

    // Convert items to CSV format
    const csvData = [
      headers.join(','),
      ...items.map(item => [
        `"${item.agPartNumber || ''}"`,
        `"${item.name || ''}"`,
        `"${item.source || ''}"`,
        `"${item.supplierPartNumber || ''}"`,
        item.costPer ? item.costPer.toString() : '',
        item.orderDate ? new Date(item.orderDate).toISOString().split('T')[0] : '',
        `"${item.department || ''}"`,
        `"${item.secondarySource || ''}"`,
        `"${item.notes || ''}"`
      ].join(','))
    ].join('\n');

    // Set headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `enhanced_inventory_export_${timestamp}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (error) {
    console.error('Enhanced CSV export error:', error);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

// POST /api/enhanced/inventory/import/csv - Import CSV data to enhanced inventory items
router.post('/inventory/import/csv', authenticateToken, async (req: Request, res: Response) => {
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

        // Use enhanced storage for import
        const validatedData = insertInventoryItemSchema.parse(itemData);
        await enhancedStorage.createInventoryItem(validatedData);
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
    console.error('Enhanced CSV import error:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

// ENHANCED INVENTORY BALANCES
// ===========================

// GET /api/enhanced/inventory/balances - Get all inventory balances
router.get('/inventory/balances', async (req: Request, res: Response) => {
  try {
    const balances = await enhancedStorage.getAllInventoryBalances();
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
    const newTransaction = await enhancedStorage.createInventoryTransaction(transactionData);
    res.status(201).json(newTransaction);
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
    const transactions = await enhancedStorage.getAllInventoryTransactions();
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
    const newTransaction = await enhancedStorage.createInventoryTransaction(transactionData);
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
    const result = await enhancedStorage.calculateEnhancedMRP();
    res.json(result);
  } catch (error) {
    console.error('Enhanced MRP calculation error:', error);
    res.status(500).json({ error: "Failed to run MRP calculation" });
  }
});

// GET /api/enhanced/mrp/requirements - Get MRP requirements
router.get('/mrp/requirements', async (req: Request, res: Response) => {
  try {
    const requirements = await enhancedStorage.getAllMRPRequirements();
    res.json(requirements);
  } catch (error) {
    console.error('Enhanced MRP requirements fetch error:', error);
    res.status(500).json({ error: "Failed to fetch MRP requirements" });
  }
});

// GET /api/enhanced/mrp/shortages - Get material shortages
router.get('/mrp/shortages', async (req: Request, res: Response) => {
  try {
    const shortages = await enhancedStorage.getMRPShortages();
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
    const vendorParts = await enhancedStorage.getAllVendorParts();
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
    const newPart = await enhancedStorage.createVendorPart(partData);
    res.status(201).json(newPart);
  } catch (error) {
    console.error('Enhanced vendor part create error:', error);
    res.status(500).json({ error: "Failed to create vendor part" });
  }
});

// GET /api/enhanced/processing/locations - Get outside processing locations
router.get('/processing/locations', async (req: Request, res: Response) => {
  try {
    const locations = await enhancedStorage.getAllOutsideProcessingLocations();
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
    const newLocation = await enhancedStorage.createOutsideProcessingLocation(locationData);
    res.status(201).json(newLocation);
  } catch (error) {
    console.error('Enhanced processing location create error:', error);
    res.status(500).json({ error: "Failed to create processing location" });
  }
});

// GET /api/enhanced/processing/jobs - Get processing jobs
router.get('/processing/jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await enhancedStorage.getAllOutsideProcessingJobs();
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
    const newJob = await enhancedStorage.createOutsideProcessingJob(jobData);
    res.status(201).json(newJob);
  } catch (error) {
    console.error('Enhanced processing job create error:', error);
    res.status(500).json({ error: "Failed to create processing job" });
  }
});

// GET /api/enhanced/po/suggestions - Get purchase order suggestions
router.get('/po/suggestions', async (req: Request, res: Response) => {
  try {
    const suggestions = await enhancedStorage.generatePOSuggestions();
    res.json(suggestions);
  } catch (error) {
    console.error('Enhanced PO suggestions fetch error:', error);
    res.status(500).json({ error: "Failed to fetch PO suggestions" });
  }
});

export default router;