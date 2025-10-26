import { Router, Request, Response } from 'express';
import {
  insertInventoryItemSchema,
  insertInventoryScanSchema,
  insertPartsRequestSchema,
} from '@shared/schema';

import { storage } from '../../storage';

const router = Router();

// Enhanced Inventory API - Get all items
router.get('/enhanced/inventory/items', async (req: Request, res: Response) => {
  try {
    const items = await storage.getAllInventoryItems();
    res.json(items);
  } catch (error) {
    console.error('Get enhanced inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// Inventory Items Management - Direct access route
router.get('/', async (req: Request, res: Response) => {
  try {
    const items = await storage.getAllInventoryItems();
    res.json(items);
  } catch (error) {
    console.error('Get inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
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
    res.status(500).json({ error: 'Failed to create inventory item' });
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
    res.status(500).json({ error: 'Failed to update inventory item' });
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
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Inventory Items Management
router.get('/items', async (req: Request, res: Response) => {
  try {
    const items = await storage.getAllInventoryItems();
    res.json(items);
  } catch (error) {
    console.error('Get inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

router.get('/items/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const item = await storage.getInventoryItem(itemId);

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

router.post('/items', async (req: Request, res: Response) => {
  try {
    const itemData = insertInventoryItemSchema.parse(req.body);
    const newItem = await storage.createInventoryItem(itemData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Create inventory item error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

router.put('/items/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const updates = req.body;
    const updatedItem = await storage.updateInventoryItem(itemId, updates);
    res.json(updatedItem);
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

router.delete('/items/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    await storage.deleteInventoryItem(itemId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
  }
});

// Inventory Scanning
router.get('/scans', async (req: Request, res: Response) => {
  try {
    const scans = await storage.getAllInventoryScans();
    res.json(scans);
  } catch (error) {
    console.error('Get inventory scans error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory scans' });
  }
});

router.post('/scans', async (req: Request, res: Response) => {
  try {
    const scanData = insertInventoryScanSchema.parse(req.body);
    const newScan = await storage.createInventoryScan(scanData);
    res.status(201).json(newScan);
  } catch (error) {
    console.error('Create inventory scan error:', error);
    res.status(500).json({ error: 'Failed to create inventory scan' });
  }
});

// Parts Requests
router.get('/parts-requests', async (req: Request, res: Response) => {
  try {
    const requests = await storage.getAllPartsRequests();
    res.json(requests);
  } catch (error) {
    console.error('Get parts requests error:', error);
    res.status(500).json({ error: 'Failed to fetch parts requests' });
  }
});

router.post('/parts-requests', async (req: Request, res: Response) => {
  try {
    const requestData = insertPartsRequestSchema.parse(req.body);
    const newRequest = await storage.createPartsRequest(requestData);
    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Create parts request error:', error);
    res.status(500).json({ error: 'Failed to create parts request' });
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
    res.status(500).json({ error: 'Failed to update parts request' });
  }
});

// Helper function to parse CSV line with proper quote handling
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// Helper function to parse cost value (handles formats like "$491.20" or "27/20")
function parseCostValue(value: string): number | null {
  if (!value) return null;

  // Remove dollar signs and whitespace
  const cleaned = value.replace(/[$\s]/g, '');

  // Handle fractional formats like "27/20" - evaluate as division
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/');
    if (parts.length !== 2) return null;

    const numerator = parseFloat(parts[0]);
    const denominator = parseFloat(parts[1]);

    if (isNaN(numerator) || isNaN(denominator) || denominator === 0) {
      return null;
    }

    return numerator / denominator;
  }

  const num = parseFloat(cleaned);
  return !isNaN(num) ? num : null;
}

// Helper function to parse "Utilized" column into boolean flags
function parseUtilizedColumn(value: string): {
  utilizedInPL1: boolean;
  utilizedInPL2: boolean;
  utilizedInFacilities: boolean;
  utilizedInAdmin: boolean;
  utilizedInServices: boolean;
} {
  const valueLower = value.toLowerCase();
  return {
    utilizedInPL1: valueLower.includes('pl1'),
    utilizedInPL2: valueLower.includes('pl2'),
    utilizedInFacilities: valueLower.includes('facilities'),
    utilizedInAdmin: valueLower.includes('admin'),
    utilizedInServices: valueLower.includes('services'),
  };
}

// CSV Import endpoint - Enhanced for new fields
router.post('/enhanced/inventory/import/csv', async (req: Request, res: Response) => {
  try {
    const { csvData } = req.body;
    console.log('📥 CSV Import started');

    if (!csvData) {
      console.log('❌ No CSV data provided');
      return res.status(400).json({ error: 'CSV data is required' });
    }

    const lines = csvData.split('\n').filter((line: string) => line.trim());
    console.log(`📄 CSV has ${lines.length} lines`);
    
    if (lines.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    const headers = parseCSVLine(lines[0]);
    console.log('📋 CSV Headers:', headers);
    const rows = lines.slice(1);

    let importedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const values = parseCSVLine(rows[i]);

        // Skip empty rows
        if (values.every(v => !v)) {
          continue;
        }

        const itemData: any = {
          utilizedInPL1: false,
          utilizedInPL2: false,
          utilizedInFacilities: false,
          utilizedInAdmin: false,
          utilizedInServices: false,
          isStockItem: false,
        };

        headers.forEach((header: string, index: number) => {
          const value = values[index] || '';

          switch (header.toLowerCase().trim()) {
            case 'ag part#':
            case 'agpartnumber':
              itemData.agPartNumber = value;
              break;
            case 'sku':
              // Check if SKU contains "Stock" to set isStockItem flag
              if (value.toLowerCase().includes('stock')) {
                itemData.isStockItem = true;
                itemData.sku = value;
              } else {
                itemData.sku = value || null;
              }
              break;
            case 'name':
              itemData.name = value;
              break;
            case 'source':
              itemData.source = value || null;
              break;
            case 'supplier part #':
            case 'supplier part#':
            case 'supplierpartnumber':
              // This is the primary supplier part number
              if (!itemData.supplierPartNumber) {
                itemData.supplierPartNumber = value || null;
              } else {
                // If we already have a supplier part number, this might be secondary
                itemData.secondarySupplierPartNumber = value || null;
              }
              break;
            case 'cost per':
            case 'costper':
              itemData.costPer = parseCostValue(value);
              break;
            case 'order date':
            case 'orderdate':
              itemData.orderDate = value || null;
              break;
            case 'notes':
              itemData.notes = value || null;
              break;
            case 'utilized':
              // Parse the "Utilized" column for production line flags
              const utilized = parseUtilizedColumn(value);
              Object.assign(itemData, utilized);
              break;
            case 'secondary source':
            case 'secondarysource':
              itemData.secondarySource = value || null;
              break;
            case 'dept.':
            case 'dept':
            case 'department':
              itemData.department = value || null;
              break;
          }
        });

        // Skip rows without required fields
        if (!itemData.agPartNumber || !itemData.name) {
          if (itemData.agPartNumber || itemData.name) {
            errors.push(
              `Row ${i + 2}: Missing required fields (AG Part# and Name)`
            );
          }
          continue;
        }

        try {
          const validatedData = insertInventoryItemSchema.parse(itemData);
          await storage.createInventoryItem(validatedData);
          importedCount++;
        } catch (error: any) {
          // Handle duplicate AG Part# errors
          if (error.message && error.message.includes('unique') || error.message && error.message.includes('duplicate')) {
            errors.push(`Row ${i + 2}: AG Part# ${itemData.agPartNumber} already exists`);
          } else {
            throw error;
          }
        }
      } catch (error) {
        errors.push(
          `Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    console.log(`✅ Import complete: ${importedCount} items imported, ${errors.length} errors`);
    if (errors.length > 0) {
      console.log('⚠️ Import errors:', errors.slice(0, 5));
    }

    const response = {
      success: true,
      importedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
    console.log('📤 Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('❌ CSV import error:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

// CSV Export endpoint
router.get('/enhanced/inventory/export/csv', async (req: Request, res: Response) => {
  try {
    const items = await storage.getAllInventoryItems();

    // Create CSV header
    const headers = [
      'AG Part#',
      'SKU',
      'Name',
      'Type',
      'Source',
      'Supplier Part #',
      'Secondary Supplier Part #',
      'Cost per',
      'Purchase Unit',
      'Usage Qty per Unit',
      'Usage Unit',
      'COGS per Unit',
      'Order Date',
      'Department',
      'Secondary Source',
      'Notes',
      'Stock Item',
      'Utilized',
    ];

    // Helper function to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    // Build utilized string from boolean flags
    const buildUtilizedString = (item: any): string => {
      const utilized: string[] = [];
      if (item.utilizedInPL1) utilized.push('PL1');
      if (item.utilizedInPL2) utilized.push('PL2');
      if (item.utilizedInFacilities) utilized.push('Facilities');
      if (item.utilizedInAdmin) utilized.push('Admin');
      if (item.utilizedInServices) utilized.push('Services');
      return utilized.join(', ');
    };

    // Create CSV rows
    const rows = items.map((item: any) => {
      return [
        escapeCSV(item.agPartNumber),
        escapeCSV(item.sku),
        escapeCSV(item.name),
        escapeCSV(item.type),
        escapeCSV(item.source),
        escapeCSV(item.supplierPartNumber),
        escapeCSV(item.secondarySupplierPartNumber),
        escapeCSV(item.costPer),
        escapeCSV(item.purchaseUnit),
        escapeCSV(item.usageQuantityPerUnit),
        escapeCSV(item.usageUnit),
        escapeCSV(item.cogsPerUnit),
        escapeCSV(item.orderDate ? new Date(item.orderDate).toISOString().split('T')[0] : ''),
        escapeCSV(item.department),
        escapeCSV(item.secondarySource),
        escapeCSV(item.notes),
        escapeCSV(item.isStockItem ? 'Yes' : 'No'),
        escapeCSV(buildUtilizedString(item)),
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory_export.csv');
    res.send(csv);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

export default router;
