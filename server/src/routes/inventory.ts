import { Router, Request, Response } from 'express';
import {
  insertInventoryItemSchema,
  insertInventoryScanSchema,
  insertPartsRequestSchema,
  insertInventoryBalanceSchema,
  insertInventoryTransactionSchema,
  insertVendorPartSchema,
  insertItemGroupSchema,
} from '@shared/schema';

import { storage } from '../../storage';

const router = Router();

// Enhanced Inventory API - Get all items
router.get('/inventory/items', async (req: Request, res: Response) => {
  try {
    const items = await storage.getAllInventoryItems();
    res.json(items);
  } catch (error) {
    console.error('Get enhanced inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// Enhanced Inventory API - Update item
router.put('/inventory/items/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const updates = req.body;
    const updatedItem = await storage.updateInventoryItem(itemId, updates);
    res.json(updatedItem);
  } catch (error) {
    console.error('Update enhanced inventory item error:', error);
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
});

// Enhanced Inventory API - Delete item
router.delete('/inventory/items/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    await storage.deleteInventoryItem(itemId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete enhanced inventory item error:', error);
    res.status(500).json({ error: 'Failed to delete inventory item' });
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

// Bulk update utilized fields for multiple items
// REPLACEMENT operation: Sets ALL selected items to have the EXACT same utilization flags
// as specified in the request. Frontend sends all 5 fields with true/false values.
// - Checked fields = true for all items
// - Unchecked fields = false for all items
// Example: If request includes {utilizedInPL1: true, utilizedInPL2: false, ...other false},
//          all selected items will get PL1=true and all others=false.
router.post('/items/bulk-update-utilized', async (req: Request, res: Response) => {
  try {
    const { itemIds, utilizedFields } = req.body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'Item IDs array is required' });
    }

    if (!utilizedFields || typeof utilizedFields !== 'object') {
      return res.status(400).json({ error: 'Utilized fields object is required' });
    }

    // Build update object with only the fields explicitly provided in the request
    // Only fields present in the request payload will be updated
    const updates: any = {};
    
    if ('utilizedInPL1' in utilizedFields) {
      updates.utilizedInPL1 = Boolean(utilizedFields.utilizedInPL1);
    }
    if ('utilizedInPL2' in utilizedFields) {
      updates.utilizedInPL2 = Boolean(utilizedFields.utilizedInPL2);
    }
    if ('utilizedInFacilities' in utilizedFields) {
      updates.utilizedInFacilities = Boolean(utilizedFields.utilizedInFacilities);
    }
    if ('utilizedInAdmin' in utilizedFields) {
      updates.utilizedInAdmin = Boolean(utilizedFields.utilizedInAdmin);
    }
    if ('utilizedInServices' in utilizedFields) {
      updates.utilizedInServices = Boolean(utilizedFields.utilizedInServices);
    }

    // Update each item with the new utilized fields
    for (const itemId of itemIds) {
      await storage.updateInventoryItem(itemId, updates);
    }

    res.json({ success: true, updatedCount: itemIds.length });
  } catch (error) {
    console.error('Bulk update utilized fields error:', error);
    res.status(500).json({ error: 'Failed to update items' });
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
router.post('/inventory/import/csv', async (req: Request, res: Response) => {
  try {
    const { csvData } = req.body;
    const replaceAll = req.query.replaceAll === 'true';
    
    console.log('📥 CSV Import started', replaceAll ? '(REPLACE MODE - TRANSACTIONAL)' : '(APPEND MODE)');

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
    
    // Check for problematic columns
    const problematicHeaders = headers.filter(h => 
      ['id', 'createdat', 'created_at', 'updatedat', 'updated_at'].includes(h.toLowerCase().trim())
    );
    if (problematicHeaders.length > 0) {
      console.warn('⚠️ CSV contains auto-generated columns that will be ignored:', problematicHeaders);
    }
    
    const rows = lines.slice(1);

    // Parse and validate all rows first before making any database changes
    const validatedItems: any[] = [];
    const errors: string[] = [];
    const skippedRows: string[] = [];

    console.log('🔍 Phase 1: Validating all CSV rows...');
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
          const normalizedHeader = header.toLowerCase().trim();

          switch (normalizedHeader) {
            case 'id':
            case 'createdat':
            case 'created_at':
            case 'updatedat':
            case 'updated_at':
            case 'isactive':
            case 'is_active':
              // Ignore auto-generated fields from CSV
              break;
            case 'ag part#':
            case 'ag part #':
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
            case 'type':
              // Issue #1: Add Type column support (Purchased/Manufactured)
              itemData.type = value || null;
              break;
            case 'source':
              itemData.source = value || null;
              break;
            case 'supplier part #':
            case 'supplier part#':
            case 'supplierpartnumber':
              itemData.supplierPartNumber = value || null;
              break;
            case 'secondary supplier part #':
            case 'secondary supplier part#':
            case 'secondarysupplierpartnumber':
              // Issue #2: Add explicit support for secondary supplier part number
              itemData.secondarySupplierPartNumber = value || null;
              break;
            case 'cost per':
            case 'costper':
              // Issue #4: Add detailed logging for cost per values
              const costValue = parseCostValue(value);
              if (i < 3) {
                console.log(`💰 Row ${i + 2} Cost Per: raw="${value}" parsed=${costValue}`);
              }
              itemData.costPer = costValue;
              break;
            case 'purchase unit':
            case 'purchaseunit':
              // Issue #2: Add Purchase Unit support
              itemData.purchaseUnit = value || null;
              break;
            case 'usage qty per unit':
            case 'usage quantity per unit':
            case 'usageqtyperunit':
            case 'usagequantityperunit':
              // Issue #2: Add Usage Quantity Per Unit support
              const usageQty = parseFloat(value);
              itemData.usageQuantityPerUnit = !isNaN(usageQty) ? usageQty : null;
              break;
            case 'usage unit':
            case 'usageunit':
              // Issue #2: Add Usage Unit support
              itemData.usageUnit = value || null;
              break;
            case 'cogs per unit':
            case 'cogsperunit':
              // Issue #2: Add COGS Per Unit support
              const cogsValue = parseCostValue(value);
              itemData.cogsPerUnit = cogsValue;
              break;
            case 'order date':
            case 'orderdate':
              // Parse and validate date - convert invalid dates to null
              if (value) {
                try {
                  const parsedDate = new Date(value);
                  // Check if date is valid
                  if (!isNaN(parsedDate.getTime())) {
                    itemData.orderDate = value;
                  } else {
                    itemData.orderDate = null;
                  }
                } catch {
                  itemData.orderDate = null;
                }
              } else {
                itemData.orderDate = null;
              }
              break;
            case 'notes':
              itemData.notes = value || null;
              break;
            case 'utilized':
            case 'utilized in':
              // Issue #3: Fix to accept both "Utilized" and "Utilized In" as column names
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
            case 'category':
              // Note: Category column found in CSV but not in database schema
              // Ignoring for now - can be added to schema if needed
              break;
          }
        });

        // Enhanced debugging for first few rows
        if (i < 3) {
          console.log(`🔍 Row ${i + 2} parsed data:`, {
            agPartNumber: itemData.agPartNumber,
            name: itemData.name,
            type: itemData.type,
            costPer: itemData.costPer,
            purchaseUnit: itemData.purchaseUnit,
            utilized: {
              PL1: itemData.utilizedInPL1,
              PL2: itemData.utilizedInPL2
            },
            rawValuesPreview: values.slice(0, 7).map((v, idx) => `${headers[idx]}="${v}"`)
          });
        }

        // Skip rows without required fields
        if (!itemData.agPartNumber || !itemData.name) {
          if (itemData.agPartNumber || itemData.name) {
            // Track as skipped rather than error since we're intentionally skipping it
            skippedRows.push(
              `Row ${i + 2}: Missing required fields - AG Part# or Name is empty`
            );
          }
          continue;
        }

        try {
          // Ensure we never pass auto-generated fields - they should auto-generate or have defaults
          delete itemData.id;
          delete itemData.createdAt;
          delete itemData.updatedAt;
          delete itemData.isActive;
          
          const validatedData = insertInventoryItemSchema.parse(itemData);
          validatedItems.push({ rowNum: i + 2, data: validatedData });
        } catch (error: any) {
          errors.push(
            `Row ${i + 2}: ${error instanceof Error ? error.message : JSON.stringify(error)}`
          );
        }
      } catch (error) {
        errors.push(
          `Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    console.log(`✅ Phase 1 complete: ${validatedItems.length} rows validated successfully, ${errors.length} validation errors, ${skippedRows.length} rows skipped`);
    if (errors.length > 0) {
      console.log('⚠️ Validation errors:', errors.slice(0, 5));
    }
    if (skippedRows.length > 0) {
      console.log('ℹ️ Skipped rows:', skippedRows.slice(0, 5));
    }

    // In replace mode, abort if ANY validation errors exist to prevent data loss
    // Note: Skipped rows (missing required fields) don't count as errors
    if (replaceAll && errors.length > 0) {
      console.log('❌ ABORT: Cannot replace all items when validation errors exist');
      return res.status(400).json({
        success: false,
        error: 'Cannot replace all items with validation errors. Please fix errors and try again.',
        validationErrors: errors,
        skippedRows: skippedRows,
        validatedCount: validatedItems.length,
      });
    }

    // Phase 2: Database operations (transactional if replace mode)
    console.log(`📝 Phase 2: Writing ${validatedItems.length} items to database...`);
    let importedCount = 0;
    const importErrors: string[] = [];
    
    if (replaceAll) {
      // TRANSACTION: Delete all + insert all atomically
      console.log('🔒 Starting transactional replace (delete + insert)...');
      try {
        await storage.replaceAllInventoryItems(validatedItems.map(item => item.data));
        importedCount = validatedItems.length;
        console.log(`✅ Transaction committed: ${importedCount} items replaced`);
      } catch (error) {
        console.error('❌ Transaction failed - rolling back:', error);
        throw new Error(`Failed to replace items: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      // APPEND MODE: Insert one by one
      for (const item of validatedItems) {
        try {
          await storage.createInventoryItem(item.data);
          importedCount++;
        } catch (error: any) {
          if (error.message && (error.message.includes('unique') || error.message.includes('duplicate'))) {
            importErrors.push(`Row ${item.rowNum}: AG Part# ${item.data.agPartNumber} already exists`);
          } else {
            importErrors.push(`Row ${item.rowNum}: ${error.message || 'Unknown error'}`);
          }
        }
      }
    }

    const allErrors = [...errors, ...importErrors];
    console.log(`✅ Import complete: ${importedCount} items imported, ${allErrors.length} total errors, ${skippedRows.length} rows skipped`);
    
    const response = {
      success: true,
      importedCount,
      skippedCount: skippedRows.length,
      errors: allErrors.length > 0 ? allErrors : undefined,
      skippedRows: skippedRows.length > 0 ? skippedRows : undefined,
    };
    console.log('📤 Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('❌ CSV import error:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

// CSV Export endpoint
router.get('/inventory/export/csv', async (req: Request, res: Response) => {
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
      'Utilized In',
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

// ========================================
// Enhanced Inventory MRP - Inventory Balances Routes
// ========================================

// GET /api/enhanced/inventory/balances - Get all inventory balances
router.get('/inventory/balances', async (req: Request, res: Response) => {
  try {
    const balances = await storage.getAllInventoryBalances();
    res.json(balances);
  } catch (error) {
    console.error('Get inventory balances error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory balances' });
  }
});

// GET /api/enhanced/inventory/balances/part/:agPartNumber - Get balances for a specific part
router.get('/inventory/balances/part/:agPartNumber', async (req: Request, res: Response) => {
  try {
    const { agPartNumber } = req.params;
    const balances = await storage.getInventoryBalancesByPart(agPartNumber);
    res.json(balances);
  } catch (error) {
    console.error('Get inventory balances by part error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory balances' });
  }
});

// GET /api/enhanced/inventory/balances/:id - Get a specific inventory balance
router.get('/inventory/balances/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const balance = await storage.getInventoryBalance(id);
    
    if (!balance) {
      return res.status(404).json({ error: 'Inventory balance not found' });
    }
    
    res.json(balance);
  } catch (error) {
    console.error('Get inventory balance error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory balance' });
  }
});

// POST /api/enhanced/inventory/balances - Create a new inventory balance
router.post('/inventory/balances', async (req: Request, res: Response) => {
  try {
    const data = insertInventoryBalanceSchema.parse(req.body);
    const balance = await storage.createInventoryBalance(data);
    res.status(201).json(balance);
  } catch (error) {
    console.error('Create inventory balance error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create inventory balance' });
  }
});

// PUT /api/enhanced/inventory/balances/:id - Update an inventory balance
router.put('/inventory/balances/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertInventoryBalanceSchema.partial().parse(req.body);
    const balance = await storage.updateInventoryBalance(id, data);
    res.json(balance);
  } catch (error) {
    console.error('Update inventory balance error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update inventory balance' });
  }
});

// DELETE /api/enhanced/inventory/balances/:id - Delete an inventory balance
router.delete('/inventory/balances/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteInventoryBalance(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete inventory balance error:', error);
    res.status(500).json({ error: 'Failed to delete inventory balance' });
  }
});

// ========================================
// Enhanced Inventory MRP - Inventory Transactions Routes
// ========================================

// GET /api/enhanced/inventory/transactions - Get all inventory transactions
router.get('/inventory/transactions', async (req: Request, res: Response) => {
  try {
    const transactions = await storage.getAllInventoryTransactions();
    res.json(transactions);
  } catch (error) {
    console.error('Get inventory transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory transactions' });
  }
});

// GET /api/enhanced/inventory/transactions/part/:agPartNumber - Get transactions for a specific part
router.get('/inventory/transactions/part/:agPartNumber', async (req: Request, res: Response) => {
  try {
    const { agPartNumber } = req.params;
    const transactions = await storage.getInventoryTransactionsByPart(agPartNumber);
    res.json(transactions);
  } catch (error) {
    console.error('Get inventory transactions by part error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory transactions' });
  }
});

// GET /api/enhanced/inventory/transactions/:id - Get a specific inventory transaction
router.get('/inventory/transactions/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const transaction = await storage.getInventoryTransaction(id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Inventory transaction not found' });
    }
    
    res.json(transaction);
  } catch (error) {
    console.error('Get inventory transaction error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory transaction' });
  }
});

// POST /api/enhanced/inventory/transactions - Create a new inventory transaction
router.post('/inventory/transactions', async (req: Request, res: Response) => {
  try {
    const data = insertInventoryTransactionSchema.parse(req.body);
    const transaction = await storage.createInventoryTransaction(data);
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Create inventory transaction error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create inventory transaction' });
  }
});

// ========================================
// Vendor Parts Routes
// ========================================

// GET /api/inventory/vendor-parts - Get all vendor parts
router.get('/vendor-parts', async (req: Request, res: Response) => {
  try {
    const vendorParts = await storage.getAllVendorParts();
    res.json(vendorParts);
  } catch (error) {
    console.error('Get vendor parts error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor parts' });
  }
});

// GET /api/inventory/vendor-parts/vendor/:vendorId - Get vendor parts for a specific vendor
router.get('/vendor-parts/vendor/:vendorId', async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const vendorParts = await storage.getVendorPartsByVendor(vendorId);
    res.json(vendorParts);
  } catch (error) {
    console.error('Get vendor parts by vendor error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor parts' });
  }
});

// GET /api/inventory/vendor-parts/part/:agPartNumber - Get vendor parts for a specific part
router.get('/vendor-parts/part/:agPartNumber', async (req: Request, res: Response) => {
  try {
    const { agPartNumber } = req.params;
    const vendorParts = await storage.getVendorPartsByPart(agPartNumber);
    res.json(vendorParts);
  } catch (error) {
    console.error('Get vendor parts by part error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor parts' });
  }
});

// GET /api/inventory/vendor-parts/:id - Get a specific vendor part
router.get('/vendor-parts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const vendorPart = await storage.getVendorPart(id);
    
    if (!vendorPart) {
      return res.status(404).json({ error: 'Vendor part not found' });
    }
    
    res.json(vendorPart);
  } catch (error) {
    console.error('Get vendor part error:', error);
    res.status(500).json({ error: 'Failed to fetch vendor part' });
  }
});

// POST /api/inventory/vendor-parts - Create a new vendor part
router.post('/vendor-parts', async (req: Request, res: Response) => {
  try {
    const data = insertVendorPartSchema.parse(req.body);
    const vendorPart = await storage.createVendorPart(data);
    res.status(201).json(vendorPart);
  } catch (error) {
    console.error('Create vendor part error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create vendor part' });
  }
});

// PUT /api/inventory/vendor-parts/:id - Update a vendor part
router.put('/vendor-parts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertVendorPartSchema.partial().parse(req.body);
    const vendorPart = await storage.updateVendorPart(id, data);
    res.json(vendorPart);
  } catch (error) {
    console.error('Update vendor part error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update vendor part' });
  }
});

// DELETE /api/inventory/vendor-parts/:id - Delete a vendor part
router.delete('/vendor-parts/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteVendorPart(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete vendor part error:', error);
    res.status(500).json({ error: 'Failed to delete vendor part' });
  }
});

// ===== ITEM GROUPS ROUTES =====

// GET /api/inventory/groups - Get all item groups
router.get('/groups', async (req: Request, res: Response) => {
  try {
    const groups = await storage.getAllItemGroups();
    res.json(groups);
  } catch (error) {
    console.error('Get item groups error:', error);
    res.status(500).json({ error: 'Failed to fetch item groups' });
  }
});

// GET /api/inventory/groups/:id - Get a specific item group
router.get('/groups/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const group = await storage.getItemGroup(id);
    if (!group) {
      return res.status(404).json({ error: 'Item group not found' });
    }
    res.json(group);
  } catch (error) {
    console.error('Get item group error:', error);
    res.status(500).json({ error: 'Failed to fetch item group' });
  }
});

// POST /api/inventory/groups - Create a new item group
router.post('/groups', async (req: Request, res: Response) => {
  try {
    const data = insertItemGroupSchema.parse(req.body);
    const group = await storage.createItemGroup(data);
    res.status(201).json(group);
  } catch (error) {
    console.error('Create item group error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create item group' });
  }
});

// PUT /api/inventory/groups/:id - Update an item group
router.put('/groups/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertItemGroupSchema.partial().parse(req.body);
    const group = await storage.updateItemGroup(id, data);
    res.json(group);
  } catch (error) {
    console.error('Update item group error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update item group' });
  }
});

// DELETE /api/inventory/groups/:id - Delete an item group
router.delete('/groups/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteItemGroup(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete item group error:', error);
    res.status(500).json({ error: 'Failed to delete item group' });
  }
});

// GET /api/inventory/groups/:id/items - Get all items in a group
router.get('/groups/:id/items', async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.id);
    const items = await storage.getItemsByGroupId(groupId);
    res.json(items);
  } catch (error) {
    console.error('Get items by group error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST /api/inventory/groups/:id/items - Add items to a group
router.post('/groups/:id/items', async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.id);
    const { itemIds } = req.body;
    
    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds must be an array' });
    }
    
    await storage.addItemsToGroup(groupId, itemIds);
    res.status(204).send();
  } catch (error) {
    console.error('Add items to group error:', error);
    res.status(500).json({ error: 'Failed to add items to group' });
  }
});

// DELETE /api/inventory/groups/:groupId/items/:itemId - Remove item from group
router.delete('/groups/:groupId/items/:itemId', async (req: Request, res: Response) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const itemId = parseInt(req.params.itemId);
    await storage.removeItemFromGroup(itemId, groupId);
    res.status(204).send();
  } catch (error) {
    console.error('Remove item from group error:', error);
    res.status(500).json({ error: 'Failed to remove item from group' });
  }
});

// GET /api/inventory/items/:id/groups - Get all groups an item belongs to
router.get('/items/:id/groups', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const groups = await storage.getGroupsByItemId(itemId);
    res.json(groups);
  } catch (error) {
    console.error('Get groups by item error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// GET /api/inventory/items-groups-map - Get all item-group mappings in bulk (single query)
router.get('/items-groups-map', async (req: Request, res: Response) => {
  try {
    const map = await storage.getAllItemGroupMappings();
    res.json(map);
  } catch (error) {
    console.error('Get items-groups map error:', error);
    res.status(500).json({ error: 'Failed to fetch items-groups map' });
  }
});

export default router;
