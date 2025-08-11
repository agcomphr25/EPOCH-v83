import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  insertInventoryItemSchema,
  insertInventoryScanSchema,
  insertPartsRequestSchema
} from '@shared/schema';

const router = Router();

// Inventory Items Management - Direct access route
router.get('/', async (req: Request, res: Response) => {
  try {
    const items = await storage.getAllInventoryItems();
    res.json(items);
  } catch (error) {
    console.error('Get inventory items error:', error);
    res.status(500).json({ error: "Failed to fetch inventory items" });
  }
});

// POST route for creating inventory items at the root level (to match client expectations)
router.post('/', async (req: Request, res: Response) => {
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
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const updates = req.body;
    const updatedItem = await storage.updateInventoryItem(itemId, updates);
    res.json(updatedItem);
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ error: "Failed to update inventory item" });
  }
});

// DELETE route for deleting inventory items at the root level
router.delete('/:id', async (req: Request, res: Response) => {
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
    const updates = req.body;
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

router.post('/scans', async (req: Request, res: Response) => {
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

router.put('/parts-requests/:id', async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    const updates = req.body;
    const updatedRequest = await storage.updatePartsRequest(requestId, updates);
    res.json(updatedRequest);
  } catch (error) {
    console.error('Update parts request error:', error);
    res.status(500).json({ error: "Failed to update parts request" });
  }
});

// CSV Import endpoint
router.post('/import/csv', async (req: Request, res: Response) => {
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
        headers.forEach((header, index) => {
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

export default router;