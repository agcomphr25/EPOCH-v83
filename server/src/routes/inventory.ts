import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { sql, eq } from 'drizzle-orm';
import { validateSameFamily } from '../utils/unitConversionService';
import {
  calculateMaterialDemand,
  calculateMaterialShortages,
  calculateBuildCapacity,
  runMrp,
} from '../services/mrpMaterialPlanning';
import {
  insertInventoryItemSchema,
  insertInventoryScanSchema,
  insertPartsRequestSchema,
  insertInventoryBalanceSchema,
  insertInventoryTransactionSchema,
  insertVendorPartSchema,
  insertItemGroupSchema,
  insertDepartmentSchema,
  DEPARTMENT_LOCATION_MAP,
  EnrichedInventoryBalance,
  DepartmentBalanceBreakdown,
  getSupplySourceDashboard,
  type ManufacturedCategory,
  type InventoryItem,
} from '@shared/schema';

function withSupplySourceDashboard(item: InventoryItem) {
  return {
    ...item,
    supplySourceDashboard: getSupplySourceDashboard(item.manufacturedCategory as ManufacturedCategory),
  };
}

import { storage } from '../../storage';
import { db } from '../../db';

const router = Router();

// Pre-create PDF upload directories to avoid async issues in multer
const SDS_UPLOAD_DIR = path.join(process.cwd(), 'server/src/assets/sds');
const TDS_UPLOAD_DIR = path.join(process.cwd(), 'server/src/assets/tds');
const OTHER_DOCS_UPLOAD_DIR = path.join(process.cwd(), 'server/src/assets/other-docs');

fs.mkdir(SDS_UPLOAD_DIR, { recursive: true }).catch(err => {
  console.error('Failed to create SDS upload directory:', err);
});
fs.mkdir(TDS_UPLOAD_DIR, { recursive: true }).catch(err => {
  console.error('Failed to create TDS upload directory:', err);
});
fs.mkdir(OTHER_DOCS_UPLOAD_DIR, { recursive: true }).catch(err => {
  console.error('Failed to create Other Docs upload directory:', err);
});

// Configure multer storage for PDF uploads
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine destination based on field name
    let uploadDir = SDS_UPLOAD_DIR;
    if (file.fieldname === 'tdsFile') {
      uploadDir = TDS_UPLOAD_DIR;
    } else if (file.fieldname === 'otherDocsFile') {
      uploadDir = OTHER_DOCS_UPLOAD_DIR;
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Enhanced Inventory API - Get all items (mounted at /api/enhanced/inventory/items)
// Supports optional query param: ?manufacturedCategory=MACHINED_PART
router.get('/inventory/items', async (req: Request, res: Response) => {
  try {
    let items = await storage.getAllInventoryItems();
    const { manufacturedCategory } = req.query;
    if (typeof manufacturedCategory === 'string' && manufacturedCategory) {
      items = items.filter(item => item.manufacturedCategory === manufacturedCategory);
    }
    res.json(items.map(withSupplySourceDashboard));
  } catch (error) {
    console.error('Get enhanced inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// Also expose at /items for /api/inventory/items path
// Supports optional query param: ?manufacturedCategory=MACHINED_PART
router.get('/items', async (req: Request, res: Response) => {
  try {
    let items = await storage.getAllInventoryItems();
    const { manufacturedCategory } = req.query;
    if (typeof manufacturedCategory === 'string' && manufacturedCategory) {
      items = items.filter(item => item.manufacturedCategory === manufacturedCategory);
    }
    res.json(items.map(withSupplySourceDashboard));
  } catch (error) {
    console.error('Get inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// Get next available AG Part Number
router.get('/items/next-part-number', async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT ag_part_number FROM inventory_items WHERE ag_part_number ~ '^[0-9]+$' ORDER BY CAST(ag_part_number AS INTEGER) DESC LIMIT 1`
    );
    const maxNum = result.rows?.[0]?.ag_part_number ? parseInt(result.rows[0].ag_part_number as string, 10) : 0;
    res.json({ nextPartNumber: String(maxNum + 1) });
  } catch (error) {
    console.error('Get next part number error:', error);
    res.status(500).json({ error: 'Failed to get next part number' });
  }
});

// Check if AG Part Number already exists
router.get('/items/check-part-number/:partNumber', async (req: Request, res: Response) => {
  try {
    const { partNumber } = req.params;
    const result = await db.execute(
      sql`SELECT ag_part_number, name FROM inventory_items WHERE ag_part_number = ${partNumber} LIMIT 1`
    );
    const exists = (result.rows?.length ?? 0) > 0;
    res.json({ exists, existingItem: exists ? { agPartNumber: result.rows![0].ag_part_number, name: result.rows![0].name } : null });
  } catch (error) {
    console.error('Check part number error:', error);
    res.status(500).json({ error: 'Failed to check part number' });
  }
});

// Simple endpoint to get part numbers for dropdown selection
router.get('/items/part-numbers', async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT ag_part_number as "agPartNumber", name FROM inventory_items WHERE is_active = true OR is_active IS NULL ORDER BY ag_part_number`
    );
    res.json(result.rows || []);
  } catch (error) {
    console.error('Get part numbers error:', error);
    res.status(500).json({ error: 'Failed to fetch part numbers' });
  }
});

// Lightweight endpoint for purchased inventory items (for receipt line Part# combobox)
router.get('/items/purchased', async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT ag_part_number as "agPartNumber", name, purchase_unit as "purchaseUnit" FROM inventory_items WHERE item_type = 'PURCHASED' AND (is_active = true OR is_active IS NULL) ORDER BY ag_part_number`
    );
    res.json(result.rows || []);
  } catch (error) {
    console.error('Get purchased items error:', error);
    res.status(500).json({ error: 'Failed to fetch purchased items' });
  }
});

router.get('/items/fabric-items', async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT id, ag_part_number as "agPartNumber", name, source, supplier_part_number as "supplierPartNumber" FROM inventory_items WHERE is_fabric = true AND (is_active = true OR is_active IS NULL) ORDER BY ag_part_number`
    );
    res.json(result.rows || []);
  } catch (error) {
    console.error('Get fabric items error:', error);
    res.status(500).json({ error: 'Failed to fetch fabric items' });
  }
});

// Enhanced Inventory API - Get item by AG Part Number (for unit conversion lookup)
// This route is at /items/by-part-number to work with /api/inventory mount point
router.get('/items/by-part-number/:partNumber', async (req: Request, res: Response) => {
  try {
    const { partNumber } = req.params;
    const item = await storage.getInventoryItemByAgPartNumber(partNumber);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // Map all fields explicitly to ensure camelCase naming for frontend
    // The raw Drizzle object may have snake_case keys from DB, so we map them explicitly
    const rawItem = item as any;
    const response = {
      ...item,
      // Explicitly map conversion fields (handle both camelCase and snake_case from DB)
      vendorUnit: item.vendorUnit ?? rawItem.vendor_unit ?? null,
      purchaseUnit: item.purchaseUnit ?? rawItem.purchase_unit ?? null,
      purchaseQuantity: item.purchaseQuantity ?? rawItem.purchase_quantity ?? null,
      costPer: item.costPer ?? rawItem.cost_per ?? null,
      name: item.name ?? rawItem.name ?? null,
    };
    
    console.log('📦 Inventory item response for', partNumber, ':', {
      vendorUnit: response.vendorUnit,
      purchaseUnit: response.purchaseUnit,
      purchaseQuantity: response.purchaseQuantity,
      costPer: response.costPer,
    });
    
    res.json(withSupplySourceDashboard(response as InventoryItem));
  } catch (error) {
    console.error('Get inventory item by part number error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

// Enhanced Inventory API - Update item
router.put('/inventory/items/:id', pdfUpload.fields([{ name: 'sdsFile', maxCount: 1 }, { name: 'tdsFile', maxCount: 1 }, { name: 'otherDocsFile', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const dataString = req.body.data;
    
    let updates;
    if (dataString) {
      // Parse and validate the JSON data from FormData
      updates = insertInventoryItemSchema.partial().parse(JSON.parse(dataString));
    } else {
      // Fallback to direct JSON body (for backwards compatibility)
      updates = insertInventoryItemSchema.partial().parse(req.body);
    }

    // Fetch existing item once for all validations below
    const existingItem = await storage.getInventoryItem(itemId);

    // Validate itemType + manufacturedCategory consistency against merged effective state
    if (updates.itemType !== undefined || updates.manufacturedCategory !== undefined) {
      const effectiveType = updates.itemType !== undefined ? updates.itemType : existingItem?.itemType;
      const effectiveCategory = updates.manufacturedCategory !== undefined ? updates.manufacturedCategory : existingItem?.manufacturedCategory;
      if (effectiveType === 'PURCHASED' && effectiveCategory) {
        return res.status(400).json({ error: 'Purchased items must not have a manufactured category. Set itemType to MANUFACTURED or clear the category.' });
      }
      if (effectiveType === 'MANUFACTURED' && !effectiveCategory) {
        return res.status(400).json({ error: 'Manufactured items must have a manufactured category. Please select a category (Packet, Kit, Machined Part, Core, Sub-Assembly, or Assembly).' });
      }
    }
    
    // Add file paths if files were uploaded and set flags
    if (files?.sdsFile?.[0]) {
      updates.sdsFilePath = `/api/inventory/sds/${path.basename(files.sdsFile[0].path)}`;
      updates.hasSds = true;
    }
    if (files?.tdsFile?.[0]) {
      updates.tdsFilePath = `/api/inventory/tds/${path.basename(files.tdsFile[0].path)}`;
      updates.hasTds = true;
    }
    if (files?.otherDocsFile?.[0]) {
      updates.otherDocsFilePath = `/api/inventory/other-docs/${path.basename(files.otherDocsFile[0].path)}`;
      updates.hasOtherDocs = true;
    }
    
    if (updates.purchaseUnitId && updates.usageUnitId) {
      // Only validate cross-family if at least one unit actually changed — legacy items
      // may have mismatched units from before this validation existed and should not be
      // permanently blocked from edits that don't touch their units.
      const purchaseChanged = existingItem?.purchaseUnitId !== updates.purchaseUnitId;
      const usageChanged = existingItem?.usageUnitId !== updates.usageUnitId;
      if (purchaseChanged || usageChanged) {
        const familyCheck = await validateSameFamily(updates.purchaseUnitId, updates.usageUnitId);
        if (!familyCheck.valid) {
          return res.status(400).json({
            error: `Purchase unit (${familyCheck.purchaseFamilyName}) and usage unit (${familyCheck.usageFamilyName}) must belong to the same measurement family`,
          });
        }
      }
    }

    // Strip assignedDepartments from JSONB write — junction table is authoritative
    const { assignedDepartments: deptNames, ...storageUpdates } = updates as any;
    const updatedItem = await storage.updateInventoryItem(itemId, storageUpdates);
    
    if (deptNames && Array.isArray(deptNames)) {
      const { inventoryItemDepartments, inventoryDepartments } = await import('../../schema');
      const { db } = await import('../../db');
      const { eq, inArray } = await import('drizzle-orm');
      await db.delete(inventoryItemDepartments).where(eq(inventoryItemDepartments.itemId, itemId));
      if (deptNames.length > 0) {
        const depts = await db.select().from(inventoryDepartments).where(inArray(inventoryDepartments.name, deptNames as string[]));
        if (depts.length > 0) {
          await db.insert(inventoryItemDepartments).values(
            depts.map(d => ({ itemId, departmentId: d.id }))
          ).onConflictDoNothing();
        }
      }
    }
    
    res.json(withSupplySourceDashboard(updatedItem));
  } catch (error) {
    console.error('Update enhanced inventory item error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
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
    res.json(items.map(withSupplySourceDashboard));
  } catch (error) {
    console.error('Get inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// POST route for creating inventory items at the root level (to match client expectations)
router.post('/', pdfUpload.fields([{ name: 'sdsFile', maxCount: 1 }, { name: 'tdsFile', maxCount: 1 }, { name: 'otherDocsFile', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const dataString = req.body.data;
    
    let itemData;
    if (dataString) {
      // Parse the JSON data from FormData
      itemData = insertInventoryItemSchema.parse(JSON.parse(dataString));
    } else {
      // Fallback to direct JSON body (for backwards compatibility)
      itemData = insertInventoryItemSchema.parse(req.body);
    }

    // Validate itemType + manufacturedCategory consistency
    if (itemData.itemType === 'PURCHASED' && itemData.manufacturedCategory) {
      return res.status(400).json({ error: 'Purchased items must not have a manufactured category. Set itemType to MANUFACTURED or clear the category.' });
    }
    if (itemData.itemType === 'MANUFACTURED' && !itemData.manufacturedCategory) {
      return res.status(400).json({ error: 'Manufactured items must have a manufactured category. Please select a category (Packet, Kit, Machined Part, Core, Sub-Assembly, or Assembly).' });
    }
    
    // Add file paths if files were uploaded and set flags
    if (files?.sdsFile?.[0]) {
      itemData.sdsFilePath = `/api/inventory/sds/${path.basename(files.sdsFile[0].path)}`;
      itemData.hasSds = true;
    }
    if (files?.tdsFile?.[0]) {
      itemData.tdsFilePath = `/api/inventory/tds/${path.basename(files.tdsFile[0].path)}`;
      itemData.hasTds = true;
    }
    if (files?.otherDocsFile?.[0]) {
      itemData.otherDocsFilePath = `/api/inventory/other-docs/${path.basename(files.otherDocsFile[0].path)}`;
      itemData.hasOtherDocs = true;
    }
    
    if (itemData.purchaseUnitId && itemData.usageUnitId) {
      const familyCheck = await validateSameFamily(itemData.purchaseUnitId, itemData.usageUnitId);
      if (!familyCheck.valid) {
        return res.status(400).json({
          error: `Purchase unit (${familyCheck.purchaseFamilyName}) and usage unit (${familyCheck.usageFamilyName}) must belong to the same measurement family`,
        });
      }
    }

    const newItem = await storage.createInventoryItem(itemData);
    res.status(201).json(withSupplySourceDashboard(newItem));
  } catch (error) {
    console.error('Create inventory item error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

// PUT route for updating inventory items at the root level
router.put('/:id', pdfUpload.fields([{ name: 'sdsFile', maxCount: 1 }, { name: 'tdsFile', maxCount: 1 }, { name: 'otherDocsFile', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const dataString = req.body.data;
    
    let updates;
    if (dataString) {
      // Parse and validate the JSON data from FormData
      updates = insertInventoryItemSchema.partial().parse(JSON.parse(dataString));
    } else {
      // Fallback to direct JSON body (for backwards compatibility)
      updates = insertInventoryItemSchema.partial().parse(req.body);
    }

    // Validate itemType + manufacturedCategory consistency against merged effective state
    if (updates.itemType !== undefined || updates.manufacturedCategory !== undefined) {
      const existingItem = await storage.getInventoryItem(itemId);
      const effectiveType = updates.itemType !== undefined ? updates.itemType : existingItem?.itemType;
      const effectiveCategory = updates.manufacturedCategory !== undefined ? updates.manufacturedCategory : existingItem?.manufacturedCategory;
      if (effectiveType === 'PURCHASED' && effectiveCategory) {
        return res.status(400).json({ error: 'Purchased items must not have a manufactured category. Set itemType to MANUFACTURED or clear the category.' });
      }
      if (effectiveType === 'MANUFACTURED' && !effectiveCategory) {
        return res.status(400).json({ error: 'Manufactured items must have a manufactured category. Please select a category (Packet, Kit, Machined Part, Core, Sub-Assembly, or Assembly).' });
      }
    }
    
    // Add file paths if files were uploaded and set flags
    if (files?.sdsFile?.[0]) {
      updates.sdsFilePath = `/api/inventory/sds/${path.basename(files.sdsFile[0].path)}`;
      updates.hasSds = true;
    }
    if (files?.tdsFile?.[0]) {
      updates.tdsFilePath = `/api/inventory/tds/${path.basename(files.tdsFile[0].path)}`;
      updates.hasTds = true;
    }
    if (files?.otherDocsFile?.[0]) {
      updates.otherDocsFilePath = `/api/inventory/other-docs/${path.basename(files.otherDocsFile[0].path)}`;
      updates.hasOtherDocs = true;
    }
    
    const updatedItem = await storage.updateInventoryItem(itemId, updates);
    res.json(withSupplySourceDashboard(updatedItem));
  } catch (error) {
    console.error('Update inventory item error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
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
    res.json(items.map(withSupplySourceDashboard));
  } catch (error) {
    console.error('Get inventory items error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory items' });
  }
});

// Get all inventory items (for "Show all parts" feature) — must be before /items/:id
router.get('/items/all-for-request', async (req: Request, res: Response) => {
  try {
    const { inventoryItems, inventoryItemDepartments, inventoryDepartments } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq, sql } = await import('drizzle-orm');

    const items = await db
      .select({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        department: inventoryItems.department,
        usageUnit: inventoryItems.usageUnit,
        itemType: inventoryItems.itemType,
        manufacturedCategory: inventoryItems.manufacturedCategory,
        assignedDepartmentIds: sql<number[]>`COALESCE(
          (SELECT array_agg(iid.department_id) FROM inventory_item_departments iid WHERE iid.item_id = ${inventoryItems.id}),
          ARRAY[]::int[]
        )`.as('assigned_department_ids'),
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.isActive, true));

    res.json(items.map((item) => ({
      ...item,
      supplySourceDashboard: getSupplySourceDashboard(item.manufacturedCategory as ManufacturedCategory),
    })));
  } catch (error) {
    console.error('Get all items for request error:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

router.get('/items/:id', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const item = await storage.getInventoryItem(itemId);

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    res.json(withSupplySourceDashboard(item));
  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory item' });
  }
});

router.post('/items', pdfUpload.fields([{ name: 'sdsFile', maxCount: 1 }, { name: 'tdsFile', maxCount: 1 }, { name: 'otherDocsFile', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const dataString = req.body.data;
    
    let itemData;
    if (dataString) {
      // Parse the JSON data from FormData
      itemData = insertInventoryItemSchema.parse(JSON.parse(dataString));
    } else {
      // Fallback to direct JSON body (for backwards compatibility)
      itemData = insertInventoryItemSchema.parse(req.body);
    }

    // Validate itemType + manufacturedCategory consistency
    if (itemData.itemType === 'PURCHASED' && itemData.manufacturedCategory) {
      return res.status(400).json({ error: 'Purchased items must not have a manufactured category. Set itemType to MANUFACTURED or clear the category.' });
    }
    if (itemData.itemType === 'MANUFACTURED' && !itemData.manufacturedCategory) {
      return res.status(400).json({ error: 'Manufactured items must have a manufactured category. Please select a category (Packet, Kit, Machined Part, Core, Sub-Assembly, or Assembly).' });
    }
    
    // Add file paths if files were uploaded and set flags
    if (files?.sdsFile?.[0]) {
      itemData.sdsFilePath = `/api/inventory/sds/${path.basename(files.sdsFile[0].path)}`;
      itemData.hasSds = true;
    }
    if (files?.tdsFile?.[0]) {
      itemData.tdsFilePath = `/api/inventory/tds/${path.basename(files.tdsFile[0].path)}`;
      itemData.hasTds = true;
    }
    if (files?.otherDocsFile?.[0]) {
      itemData.otherDocsFilePath = `/api/inventory/other-docs/${path.basename(files.otherDocsFile[0].path)}`;
      itemData.hasOtherDocs = true;
    }
    
    // Strip assignedDepartments from JSONB write — junction table is authoritative
    const { assignedDepartments: deptNames, ...itemStorageData } = itemData as any;
    const newItem = await storage.createInventoryItem(itemStorageData);
    
    if (deptNames && Array.isArray(deptNames) && deptNames.length > 0) {
      const { inventoryItemDepartments, inventoryDepartments } = await import('../../schema');
      const { db } = await import('../../db');
      const { inArray } = await import('drizzle-orm');
      const depts = await db.select().from(inventoryDepartments).where(inArray(inventoryDepartments.name, deptNames as string[]));
      if (depts.length > 0) {
        await db.insert(inventoryItemDepartments).values(
          depts.map(d => ({ itemId: newItem.id, departmentId: d.id }))
        ).onConflictDoNothing();
      }
    }
    
    res.status(201).json(withSupplySourceDashboard(newItem));
  } catch (error) {
    console.error('Create inventory item error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

router.put('/items/:id', pdfUpload.fields([{ name: 'sdsFile', maxCount: 1 }, { name: 'tdsFile', maxCount: 1 }, { name: 'otherDocsFile', maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const dataString = req.body.data;
    
    let updates;
    if (dataString) {
      // Parse and validate the JSON data from FormData
      updates = insertInventoryItemSchema.partial().parse(JSON.parse(dataString));
    } else {
      // Fallback to direct JSON body (for backwards compatibility)
      updates = insertInventoryItemSchema.partial().parse(req.body);
    }

    // Fetch existing item once for all validations below
    const existingItem = await storage.getInventoryItem(itemId);

    // Validate itemType + manufacturedCategory consistency against merged effective state
    if (updates.itemType !== undefined || updates.manufacturedCategory !== undefined) {
      const effectiveType = updates.itemType !== undefined ? updates.itemType : existingItem?.itemType;
      const effectiveCategory = updates.manufacturedCategory !== undefined ? updates.manufacturedCategory : existingItem?.manufacturedCategory;
      if (effectiveType === 'PURCHASED' && effectiveCategory) {
        return res.status(400).json({ error: 'Purchased items must not have a manufactured category. Set itemType to MANUFACTURED or clear the category.' });
      }
      if (effectiveType === 'MANUFACTURED' && !effectiveCategory) {
        return res.status(400).json({ error: 'Manufactured items must have a manufactured category. Please select a category (Packet, Kit, Machined Part, Core, Sub-Assembly, or Assembly).' });
      }
    }
    
    // Add file paths if files were uploaded and set flags
    if (files?.sdsFile?.[0]) {
      updates.sdsFilePath = `/api/inventory/sds/${path.basename(files.sdsFile[0].path)}`;
      updates.hasSds = true;
    }
    if (files?.tdsFile?.[0]) {
      updates.tdsFilePath = `/api/inventory/tds/${path.basename(files.tdsFile[0].path)}`;
      updates.hasTds = true;
    }
    if (files?.otherDocsFile?.[0]) {
      updates.otherDocsFilePath = `/api/inventory/other-docs/${path.basename(files.otherDocsFile[0].path)}`;
      updates.hasOtherDocs = true;
    }
    
    if (updates.purchaseUnitId && updates.usageUnitId) {
      // Only validate cross-family if at least one unit actually changed — legacy items
      // may have mismatched units from before this validation existed and should not be
      // permanently blocked from edits that don't touch their units.
      const purchaseChanged = existingItem?.purchaseUnitId !== updates.purchaseUnitId;
      const usageChanged = existingItem?.usageUnitId !== updates.usageUnitId;
      if (purchaseChanged || usageChanged) {
        const familyCheck = await validateSameFamily(updates.purchaseUnitId, updates.usageUnitId);
        if (!familyCheck.valid) {
          return res.status(400).json({
            error: `Purchase unit (${familyCheck.purchaseFamilyName}) and usage unit (${familyCheck.usageFamilyName}) must belong to the same measurement family`,
          });
        }
      }
    }

    // Strip assignedDepartments from JSONB write — junction table is authoritative
    const { assignedDepartments: deptNames, ...storageUpdates } = updates as any;
    const updatedItem = await storage.updateInventoryItem(itemId, storageUpdates);
    
    if (deptNames && Array.isArray(deptNames)) {
      const { inventoryItemDepartments, inventoryDepartments } = await import('../../schema');
      const { db } = await import('../../db');
      const { eq, inArray } = await import('drizzle-orm');
      await db.delete(inventoryItemDepartments).where(eq(inventoryItemDepartments.itemId, itemId));
      if (deptNames.length > 0) {
        const depts = await db.select().from(inventoryDepartments).where(inArray(inventoryDepartments.name, deptNames as string[]));
        if (depts.length > 0) {
          await db.insert(inventoryItemDepartments).values(
            depts.map(d => ({ itemId, departmentId: d.id }))
          ).onConflictDoNothing();
        }
      }
    }
    
    res.json(withSupplySourceDashboard(updatedItem));
  } catch (error) {
    console.error('Update inventory item error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
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

// ============================================================================
// INVENTORY ITEM ROUTING ENDPOINTS
// Allows manufactured items to access and create routings at the item-master
// level, without requiring PO context.
// ============================================================================

// GET /api/inventory/items/:id/routing — get active routing for a manufactured item
// Returns { routing: null } with 200 when no routing is linked (avoids client-side error on expected not-found)
router.get('/items/:id/routing', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });
    const routing = await storage.getPartRoutingByInventoryItem(itemId.toString());
    res.json(routing ?? null);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get routing for inventory item', message: error.message });
  }
});

// POST /api/inventory/items/:id/routing — create a routing linked to a manufactured item
router.post('/items/:id/routing', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });

    const item = await storage.getInventoryItem(itemId);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    // Prevent creating routing for non-manufactured items
    if (item.itemType !== 'MANUFACTURED') {
      return res.status(422).json({ error: 'Routings can only be created for manufactured items' });
    }

    // Check for existing routing
    const existing = await storage.getPartRoutingByInventoryItem(itemId.toString());
    if (existing) {
      return res.status(409).json({ error: 'A routing already exists for this item', existing });
    }

    const {
      routingName,
      departmentSequence,
      traceabilityConfig,
      createdBy,
      routingType,
      routingRevision,
      departmentConfig,
      materialsConfig,
      qcStandards,
      customFields,
    } = req.body;

    // Infer a sensible routingType from manufacturedCategory when not explicitly provided.
    // Valid enum values: COMPOSITE, CNC, CORE, KIT, SUB_ASSEMBLY, ASSEMBLY, OUTSIDE_PROCESS, INSPECTION
    const inferredRoutingType = (() => {
      if (routingType) return routingType;
      const cat = (item as any).manufacturedCategory;
      if (cat === 'ASSEMBLY') return 'ASSEMBLY';
      if (cat === 'SUB_ASSEMBLY') return 'SUB_ASSEMBLY';
      if (cat === 'MACHINED_PART') return 'CNC';
      if (cat === 'KIT') return 'KIT';
      if (cat === 'CORE') return 'CORE';
      return 'COMPOSITE'; // PACKET, unknown
    })();

    const routingData = {
      inventoryItemId: itemId.toString(),
      partNumber: item.agPartNumber || '',
      partName: item.name || '',
      routingName: routingName || `${item.agPartNumber || item.name} Routing`,
      routingRevision: routingRevision ?? 1,
      departmentSequence: departmentSequence ?? ['Manufacturing'],
      traceabilityConfig: traceabilityConfig ?? {},
      createdBy: createdBy || 'system',
      routingType: inferredRoutingType,
      ...(departmentConfig !== undefined && { departmentConfig }),
      ...(materialsConfig !== undefined && { materialsConfig }),
      ...(qcStandards !== undefined && { qcStandards }),
      ...(customFields !== undefined && { customFields }),
    };

    const routing = await storage.createPartRouting(routingData as any);
    res.status(201).json(routing);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create routing for inventory item', message: error.message });
  }
});

// PUT /api/inventory/items/:id/routing-link — link an existing routing to an inventory item
router.put('/items/:id/routing-link', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });

    const { routingId } = req.body;
    if (!routingId) return res.status(400).json({ error: 'routingId is required' });

    const item = await storage.getInventoryItem(itemId);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    if (item.itemType !== 'MANUFACTURED') {
      return res.status(422).json({ error: 'Routing link can only be set for manufactured items' });
    }

    const routing = await storage.updatePartRouting(routingId, {
      inventoryItemId: itemId.toString(),
      partNumber: item.agPartNumber || undefined,
      partName: item.name || undefined,
    } as any);
    res.json(routing);
  } catch (error: any) {
    if (error.message?.includes('not found')) return res.status(404).json({ error: 'Routing not found' });
    res.status(500).json({ error: 'Failed to link routing to inventory item', message: error.message });
  }
});

// GET /api/inventory/items/:id/routing-templates — list active routing templates (for template-based creation)
router.get('/items/:id/routing-templates', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });
    const { routingType } = req.query;
    const templates = await storage.getRoutingTemplates({
      isActive: true,
      ...(routingType ? { routingType: routingType as string } : {}),
    });
    res.json(templates);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get routing templates', message: error.message });
  }
});

// POST /api/inventory/items/:id/routing-from-template — create a routing from a template for this item
router.post('/items/:id/routing-from-template', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });

    const { templateId, routingName, routingRevision, createdBy } = req.body;
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });

    const item = await storage.getInventoryItem(itemId);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    if (item.itemType !== 'MANUFACTURED') {
      return res.status(422).json({ error: 'Template-based routing can only be created for manufactured items' });
    }

    // Prevent duplicate routing
    const existing = await storage.getPartRoutingByInventoryItem(itemId.toString());
    if (existing) {
      return res.status(409).json({ error: 'A routing already exists for this item', existing });
    }

    const result = await storage.createPartRoutingFromTemplate(templateId, {
      inventoryItemId: itemId.toString(),
      partNumber: item.agPartNumber || '',
      partName: item.name || '',
      routingName: routingName || undefined,
      routingRevision: routingRevision ?? 1,
      createdBy: createdBy || 'system',
    });

    res.status(201).json(result);
  } catch (error: any) {
    if (error.message?.includes('not found')) return res.status(404).json({ error: error.message });
    res.status(500).json({ error: 'Failed to create routing from template', message: error.message });
  }
});

// GET /api/inventory/items/:id/available-routings — list all routings eligible for linking
// Returns routings that are either unlinked or linked to a different item.
router.get('/items/:id/available-routings', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.id);
    if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });

    const allRoutings = await storage.getPartRoutings();

    // Return all routings except the one already linked to this item, with key fields for display
    const eligible = allRoutings
      .filter((r) => r.inventoryItemId !== itemId.toString())
      .map((r) => ({
        id: r.id,
        routingName: r.routingName,
        partNumber: r.partNumber,
        partName: r.partName,
        routingType: r.routingType,
        routingRevision: r.routingRevision,
        isActive: r.isActive,
        inventoryItemId: r.inventoryItemId,
      }));

    res.json(eligible);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get available routings', message: error.message });
  }
});

// GET /api/inventory/items/:agPartNumber/cost-history - Get cost history for an inventory item
router.get('/items/:agPartNumber/cost-history', async (req: Request, res: Response) => {
  try {
    const { agPartNumber } = req.params;
    const costHistory = await storage.getInventoryItemCostHistory(agPartNumber);
    res.json(costHistory);
  } catch (error) {
    console.error('Get cost history error:', error);
    res.status(500).json({ error: 'Failed to retrieve cost history' });
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
    if ('utilizedInPL3' in utilizedFields) {
      updates.utilizedInPL3 = Boolean(utilizedFields.utilizedInPL3);
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

// Resolve a free-text source string to a vendors.id via case-insensitive name match.
// Future improvement: replace with inventory_items.source_vendor_id (FK) once schema migration is done.
async function resolveSourceVendorId(sourceText: string | null | undefined, db: any): Promise<number | null> {
  if (!sourceText?.trim()) return null;
  const normalized = sourceText.trim().toLowerCase();
  const { vendors } = await import('../../schema');
  const { sql: sqlFn } = await import('drizzle-orm');
  const [vendor] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(sqlFn`LOWER(${vendors.name}) = ${normalized}`)
    .limit(1);
  return vendor?.id ?? null;
}

router.post('/parts-requests', async (req: Request, res: Response) => {
  try {
    const requestData = insertPartsRequestSchema.parse(req.body);

    if (requestData.agPartNumber) {
      const { inventoryItems } = await import('../../schema');
      const [item] = await db
        .select({
          vendorId: inventoryItems.vendorId,
          source: inventoryItems.source,
          defaultOrderMethod: inventoryItems.defaultOrderMethod,
        })
        .from(inventoryItems)
        .where(eq(inventoryItems.agPartNumber, requestData.agPartNumber))
        .limit(1);

      if (item) {
        // Auto-set orderMethod from item default if not provided
        if (!requestData.orderMethod && item.defaultOrderMethod) {
          requestData.orderMethod = item.defaultOrderMethod as 'PO' | 'WEBSITE';
        }

        // Auto-assign vendor from source or item vendor if not provided.
        // Future improvement: a supplier_items table or source_vendor_id FK would replace this lookup.
        if (!requestData.vendorId) {
          const sourceVendorId = await resolveSourceVendorId(item.source, db);
          if (sourceVendorId) {
            requestData.vendorId = sourceVendorId;
          } else if (item.vendorId) {
            requestData.vendorId = item.vendorId;
          }
        }
      }
    }

    const newRequest = await storage.createPartsRequest(requestData);
    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Create parts request error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create parts request' });
  }
});

router.put('/parts-requests/:id', async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    const updates = insertPartsRequestSchema.partial().parse(req.body);
    
    // Enforce status transition rules: PENDING → APPROVED → ORDERED → RECEIVED → DELIVERED_TO_DEPT
    // Also allows PENDING → REJECTED
    if (updates.status) {
      const validTransitions: Record<string, string[]> = {
        'APPROVED': ['PENDING'],
        'REJECTED': ['PENDING', 'CANCEL_REQUESTED'],
        'ORDERED': ['APPROVED'],
        'ORDERED_PARTIAL': ['APPROVED'],
        'RECEIVED': ['ORDERED', 'ORDERED_PARTIAL', 'RECEIVED_PARTIAL'],
        'RECEIVED_PARTIAL': ['ORDERED', 'ORDERED_PARTIAL'],
        'DELIVERED_TO_DEPT': ['RECEIVED', 'RECEIVED_PARTIAL'],
        'CANCEL_REQUESTED': ['ORDERED', 'ORDERED_PARTIAL'],
        'CANCELED': ['PENDING', 'APPROVED', 'CANCEL_REQUESTED'],
      };
      
      if (validTransitions[updates.status]) {
        // Get current status
        const existingRequest = await storage.getPartsRequest(requestId);
        if (!existingRequest) {
          return res.status(404).json({ error: 'Request not found' });
        }
        
        const allowedFromStatuses = validTransitions[updates.status];
        if (!allowedFromStatuses.includes(existingRequest.status)) {
          return res.status(400).json({ 
            error: `Cannot change status to '${updates.status}' from '${existingRequest.status}'. Valid source statuses: ${allowedFromStatuses.join(', ')}.`
          });
        }
      }
    }
    
    const updatedRequest = await storage.updatePartsRequest(requestId, updates);
    res.json(updatedRequest);
  } catch (error) {
    console.error('Update parts request error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update parts request' });
  }
});

router.delete('/parts-requests/:id', async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    await storage.deletePartsRequest(requestId);
    res.status(204).send();
  } catch (error) {
    console.error('Delete parts request error:', error);
    res.status(500).json({ error: 'Failed to delete parts request' });
  }
});

// Get parts requests by the current user (all departments)
router.get('/parts-requests/my', async (req: Request, res: Response) => {
  try {
    const username = req.user?.username;
    if (!username) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const requests = await storage.getPartsRequestsByUser(username);
    res.json(requests);
  } catch (error) {
    console.error('Get user parts requests error:', error);
    res.status(500).json({ error: 'Failed to fetch user parts requests' });
  }
});

// Get parts requests by department
router.get('/parts-requests/department/:departmentId', async (req: Request, res: Response) => {
  try {
    const departmentId = parseInt(req.params.departmentId);
    const requests = await storage.getPartsRequestsByDepartment(departmentId);
    res.json(requests);
  } catch (error) {
    console.error('Get department parts requests error:', error);
    res.status(500).json({ error: 'Failed to fetch department parts requests' });
  }
});

// Get consolidated parts needs for inventory manager
router.get('/parts-requests/consolidated/needs', async (req: Request, res: Response) => {
  try {
    const needs = await storage.getConsolidatedPartsNeeds();
    res.json(needs);
  } catch (error) {
    console.error('Get consolidated parts needs error:', error);
    res.status(500).json({ error: 'Failed to fetch consolidated parts needs' });
  }
});

// Get parts requests grouped by vendor for consolidated ordering view
router.get('/parts-requests/by-vendor', async (req: Request, res: Response) => {
  try {
    const { partsRequests, vendors, inventoryItems } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq, and, inArray, isNotNull, isNull } = await import('drizzle-orm');
    
    // Get all active parts requests that are not yet delivered
    const activeStatuses = ['PENDING', 'APPROVED', 'ORDERED', 'RECEIVED'];
    const requests = await db
      .select()
      .from(partsRequests)
      .where(
        and(
          eq(partsRequests.isActive, true),
          inArray(partsRequests.status, activeStatuses)
        )
      );
    
    // Get all vendors for lookup
    const allVendors = await db.select().from(vendors);
    const vendorMap = new Map(allVendors.map(v => [v.id, v]));
    
    // Get inventory items with vendor assignments for auto-suggest
    const itemsWithVendors = await db
      .select({
        agPartNumber: inventoryItems.agPartNumber,
        vendorId: inventoryItems.vendorId,
        name: inventoryItems.name,
      })
      .from(inventoryItems)
      .where(isNotNull(inventoryItems.vendorId));
    
    const itemVendorMap = new Map(itemsWithVendors.map(i => [i.agPartNumber, i.vendorId]));
    
    // Group requests by vendor
    const vendorGroups: Record<string, {
      vendorId: number | null;
      vendorName: string;
      orderMethod: string | null;
      websiteUrl: string | null;
      requests: typeof requests;
      totalQuantity: number;
      totalEstimatedCost: number;
    }> = {};
    
    // "Unassigned" group for requests without vendor
    vendorGroups['unassigned'] = {
      vendorId: null,
      vendorName: 'Unassigned',
      orderMethod: null,
      websiteUrl: null,
      requests: [],
      totalQuantity: 0,
      totalEstimatedCost: 0,
    };
    
    for (const request of requests) {
      if (request.orderMethod === 'WEBSITE') {
        const key = 'WEBSITE';
        if (!vendorGroups[key]) {
          vendorGroups[key] = {
            vendorId: null,
            vendorName: 'Website Orders',
            orderMethod: 'WEBSITE',
            websiteUrl: null,
            requests: [],
            totalQuantity: 0,
            totalEstimatedCost: 0,
          };
        }
        vendorGroups[key].requests.push(request);
        vendorGroups[key].totalQuantity += request.quantity;
        vendorGroups[key].totalEstimatedCost += request.estimatedCost || 0;
        continue;
      }

      let vendorId = request.vendorId;
      if (!vendorId && request.agPartNumber) {
        vendorId = itemVendorMap.get(request.agPartNumber) || null;
      }
      
      if (vendorId && vendorMap.has(vendorId)) {
        const vendor = vendorMap.get(vendorId)!;
        const key = `vendor-${vendorId}`;
        
        if (!vendorGroups[key]) {
          vendorGroups[key] = {
            vendorId: vendor.id,
            vendorName: vendor.name,
            orderMethod: request.orderMethod || null,
            websiteUrl: null,
            requests: [],
            totalQuantity: 0,
            totalEstimatedCost: 0,
          };
        }
        
        vendorGroups[key].requests.push(request);
        vendorGroups[key].totalQuantity += request.quantity;
        vendorGroups[key].totalEstimatedCost += request.estimatedCost || 0;
      } else {
        vendorGroups['unassigned'].requests.push(request);
        vendorGroups['unassigned'].totalQuantity += request.quantity;
        vendorGroups['unassigned'].totalEstimatedCost += request.estimatedCost || 0;
      }
    }
    
    // Convert to array and sort by vendor name
    const result = Object.values(vendorGroups)
      .filter(g => g.requests.length > 0)
      .sort((a, b) => {
        if (a.vendorName === 'Unassigned') return 1;
        if (b.vendorName === 'Unassigned') return -1;
        return a.vendorName.localeCompare(b.vendorName);
      });
    
    res.json(result);
  } catch (error) {
    console.error('Get parts requests by vendor error:', error);
    res.status(500).json({ error: 'Failed to fetch parts requests by vendor' });
  }
});

// Bulk update parts requests (for vendor assignment and bulk status changes)
// Enforces status transition rules: PENDING → APPROVED → ORDERED → RECEIVED → DELIVERED_TO_DEPT
router.put('/parts-requests/bulk', async (req: Request, res: Response) => {
  try {
    const { partsRequests } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq, inArray, and } = await import('drizzle-orm');
    
    const { requestIds, updates } = req.body as {
      requestIds: number[];
      updates: {
        vendorId?: number | null;
        orderMethod?: 'PO' | 'WEBSITE' | null;
        vendorPartNumber?: string | null;
        productUrl?: string | null;
        status?: string;
        expectedDelivery?: string | null;
        orderDate?: string | null;
        notes?: string | null;
      };
    };
    
    if (!requestIds || requestIds.length === 0) {
      return res.status(400).json({ error: 'No request IDs provided' });
    }
    
    // Build update object with proper date handling
    const updateData: Record<string, unknown> = {};
    if (updates.vendorId !== undefined) updateData.vendorId = updates.vendorId;
    if (updates.orderMethod !== undefined) updateData.orderMethod = updates.orderMethod;
    if (updates.vendorPartNumber !== undefined) updateData.vendorPartNumber = updates.vendorPartNumber;
    if (updates.productUrl !== undefined) updateData.productUrl = updates.productUrl;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.expectedDelivery !== undefined) {
      updateData.expectedDelivery = updates.expectedDelivery;
    }
    if (updates.orderDate !== undefined) {
      updateData.orderDate = updates.orderDate ? new Date(updates.orderDate) : null;
    }
    updateData.updatedAt = new Date();
    
    // Define valid status transitions
    const validTransitions: Record<string, string> = {
      'ORDERED': 'APPROVED',       // Can only mark ORDERED if currently APPROVED
      'RECEIVED': 'ORDERED',       // Can only mark RECEIVED if currently ORDERED
      'DELIVERED_TO_DEPT': 'RECEIVED', // Can only mark DELIVERED if currently RECEIVED
    };
    
    let updatedCount = 0;
    let skippedCount = 0;
    const skippedIds: number[] = [];
    
    // If status is being changed, enforce valid transitions
    if (updates.status && validTransitions[updates.status]) {
      const requiredCurrentStatus = validTransitions[updates.status];
      
      // Get all requests to check their current status
      const existingRequests = await db
        .select({ id: partsRequests.id, status: partsRequests.status })
        .from(partsRequests)
        .where(inArray(partsRequests.id, requestIds));
      
      // Separate valid and invalid requests
      const validIds: number[] = [];
      for (const req of existingRequests) {
        if (req.status === requiredCurrentStatus) {
          validIds.push(req.id);
        } else {
          skippedIds.push(req.id);
          skippedCount++;
        }
      }
      
      if (validIds.length > 0) {
        updateData.status = updates.status;
        await db
          .update(partsRequests)
          .set(updateData)
          .where(inArray(partsRequests.id, validIds));
        updatedCount = validIds.length;
      }
      
      // Return detailed response about what was updated/skipped
      res.json({ 
        success: true, 
        updatedCount, 
        skippedCount,
        skippedIds: skippedIds.length > 0 ? skippedIds : undefined,
        message: skippedCount > 0 
          ? `Updated ${updatedCount} requests. Skipped ${skippedCount} requests that were not in '${requiredCurrentStatus}' status.`
          : `Successfully updated ${updatedCount} requests.`
      });
    } else {
      // No status change or status doesn't require transition validation (like vendor assignment)
      if (updates.status) {
        updateData.status = updates.status;
      }
      
      await db
        .update(partsRequests)
        .set(updateData)
        .where(inArray(partsRequests.id, requestIds));
      
      res.json({ success: true, updatedCount: requestIds.length });
    }
  } catch (error) {
    console.error('Bulk update parts requests error:', error);
    res.status(500).json({ error: 'Failed to bulk update parts requests' });
  }
});

// ==========================================
// PARTS REQUEST v2: BATCH & RECEIVING ROUTES
// ==========================================

// Create order batch from selected parts requests
router.post('/parts-requests/batches', async (req: Request, res: Response) => {
  try {
    const { partsRequests, partsRequestBatches, partsRequestOrderLines, partsRequestOrderAllocations, partsRequestStatusHistory } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq } = await import('drizzle-orm');

    const { vendorId, vendorName, orderMethod, requestIds, quantities, createdBy, notes } = req.body as {
      vendorId: number | null;
      vendorName: string;
      orderMethod: string | null;
      requestIds: number[];
      quantities: Record<number, number>;
      createdBy: string;
      notes?: string;
    };

    if (!requestIds || requestIds.length === 0) {
      return res.status(400).json({ error: 'No request IDs provided' });
    }

    const [batch] = await db.insert(partsRequestBatches).values({
      vendorId,
      vendorName,
      orderMethod,
      status: 'ORDERED',
      createdBy,
      notes: notes || null,
      orderDate: new Date(),
    }).returning();

    for (const reqId of requestIds) {
      const qtyOrdered = quantities[reqId] || 0;
      if (qtyOrdered <= 0) continue;

      const [existing] = await db.select().from(partsRequests).where(eq(partsRequests.id, reqId));
      if (!existing) continue;

      const [orderLine] = await db.insert(partsRequestOrderLines).values({
        batchId: batch.id,
        vendorId: vendorId,
        partNumber: existing.partNumber,
        partName: existing.partName,
        agPartNumber: existing.agPartNumber,
        qtyOrdered,
        qtyReceived: 0,
        status: 'ORDERED',
      }).returning();

      await db.insert(partsRequestOrderAllocations).values({
        orderLineId: orderLine.id,
        partsRequestId: reqId,
        qtyAllocated: qtyOrdered,
        qtyReceivedApplied: 0,
        departmentId: existing.departmentId,
        status: 'ALLOCATED',
      });

      const totalOrdered = (existing.qtyOrdered || 0) + qtyOrdered;
      const newStatus = totalOrdered >= existing.quantity ? 'ORDERED' : 'ORDERED_PARTIAL';

      await db.update(partsRequests).set({
        batchId: batch.id,
        qtyOrdered: totalOrdered,
        status: newStatus,
        vendorId: vendorId,
        orderMethod: orderMethod,
        orderDate: new Date(),
        updatedAt: new Date(),
      }).where(eq(partsRequests.id, reqId));

      await db.insert(partsRequestStatusHistory).values({
        partsRequestId: reqId,
        fromStatus: existing.status,
        toStatus: newStatus,
        changedBy: createdBy,
        reason: `Order batch #${batch.id} created - ${qtyOrdered} ordered via order line #${orderLine.id}`,
      });
    }

    res.status(201).json(batch);
  } catch (error) {
    console.error('Create order batch error:', error);
    res.status(500).json({ error: 'Failed to create order batch' });
  }
});

// Get all order batches with their order lines
router.get('/parts-requests/batches', async (req: Request, res: Response) => {
  try {
    const { partsRequestBatches, partsRequestOrderLines, partsRequestOrderAllocations, partsRequests } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq, desc } = await import('drizzle-orm');

    const batches = await db.select().from(partsRequestBatches).orderBy(desc(partsRequestBatches.createdAt));

    const result = await Promise.all(batches.map(async (batch) => {
      const orderLines = await db.select().from(partsRequestOrderLines).where(eq(partsRequestOrderLines.batchId, batch.id));
      const allocations = await db.select().from(partsRequestOrderAllocations);
      const lineAllocations = allocations.filter(a => orderLines.some(l => l.id === a.orderLineId));
      return { ...batch, orderLines, allocations: lineAllocations };
    }));

    res.json(result);
  } catch (error) {
    console.error('Get order batches error:', error);
    res.status(500).json({ error: 'Failed to fetch order batches' });
  }
});

// Get pending receipts grouped by vendor — queries ORDER BATCHES and ORDER LINES only
router.get('/parts-requests/pending-receipts', async (req: Request, res: Response) => {
  try {
    const { partsRequestBatches, partsRequestOrderLines, partsRequestOrderAllocations, vendors } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq, inArray, lt, and } = await import('drizzle-orm');
    const { sql: sqlTag } = await import('drizzle-orm');

    const pendingBatches = await db
      .select()
      .from(partsRequestBatches)
      .where(inArray(partsRequestBatches.status, ['ORDERED', 'PARTIALLY_RECEIVED']));

    if (pendingBatches.length === 0) {
      return res.json([]);
    }

    const allVendors = await db.select().from(vendors);
    const vendorMap = new Map(allVendors.map(v => [v.id, v]));

    const batchIds = pendingBatches.map(b => b.id);
    const orderLines = await db
      .select()
      .from(partsRequestOrderLines)
      .where(inArray(partsRequestOrderLines.batchId, batchIds));

    const allAllocations = await db
      .select()
      .from(partsRequestOrderAllocations)
      .where(inArray(partsRequestOrderAllocations.orderLineId, orderLines.map(l => l.id)));

    type VendorGroup = {
      vendorId: number | null;
      vendorName: string;
      batches: Array<{
        batchId: number;
        batchStatus: string;
        orderDate: Date | null;
        orderLines: Array<{
          orderLineId: number;
          partNumber: string | null;
          partName: string | null;
          agPartNumber: string | null;
          qtyOrdered: number;
          qtyReceived: number;
          remainingQty: number;
          status: string;
          allocations: Array<{
            allocationId: number;
            partsRequestId: number;
            departmentId: number | null;
            qtyAllocated: number;
            qtyReceivedApplied: number;
          }>;
        }>;
      }>;
      totalOrdered: number;
      totalReceived: number;
    };

    const vendorGroups: Record<string, VendorGroup> = {};

    for (const batch of pendingBatches) {
      const vId = batch.vendorId;
      const key = vId ? `vendor-${vId}` : 'unassigned';
      const vName = batch.vendorName || (vId && vendorMap.has(vId) ? vendorMap.get(vId)!.name : 'Unknown Vendor');

      if (!vendorGroups[key]) {
        vendorGroups[key] = {
          vendorId: vId,
          vendorName: vName,
          batches: [],
          totalOrdered: 0,
          totalReceived: 0,
        };
      }

      const batchLines = orderLines.filter(l => l.batchId === batch.id);
      const batchOrderLines = batchLines
        .filter(l => l.qtyReceived < l.qtyOrdered)
        .map(l => {
          const lineAllocations = allAllocations
            .filter(a => a.orderLineId === l.id)
            .map(a => ({
              allocationId: a.id,
              partsRequestId: a.partsRequestId,
              departmentId: a.departmentId,
              qtyAllocated: a.qtyAllocated,
              qtyReceivedApplied: a.qtyReceivedApplied,
            }));

          return {
            orderLineId: l.id,
            partNumber: l.partNumber,
            partName: l.partName,
            agPartNumber: l.agPartNumber,
            qtyOrdered: l.qtyOrdered,
            qtyReceived: l.qtyReceived,
            remainingQty: l.qtyOrdered - l.qtyReceived,
            status: l.status,
            allocations: lineAllocations,
          };
        });

      if (batchOrderLines.length > 0) {
        vendorGroups[key].batches.push({
          batchId: batch.id,
          batchStatus: batch.status,
          orderDate: batch.orderDate,
          orderLines: batchOrderLines,
        });

        for (const line of batchLines) {
          vendorGroups[key].totalOrdered += line.qtyOrdered;
          vendorGroups[key].totalReceived += line.qtyReceived;
        }
      }
    }

    const result = Object.values(vendorGroups)
      .filter(g => g.batches.length > 0)
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName));

    res.json(result);
  } catch (error) {
    console.error('Get pending receipts error:', error);
    res.status(500).json({ error: 'Failed to fetch pending receipts' });
  }
});

// Receive parts against ORDER LINES (not requests directly)
router.post('/parts-requests/receive', async (req: Request, res: Response) => {
  try {
    const { partsRequests, partsRequestBatches, partsRequestOrderLines, partsRequestOrderAllocations, partsRequestReceipts, partsRequestReceiptLines, partsRequestStatusHistory } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq, sql: sqlTag } = await import('drizzle-orm');

    const { batchId, receivedBy, notes, lines } = req.body as {
      batchId: number;
      receivedBy: string;
      notes?: string;
      lines: Array<{
        orderLineId: number;
        qtyReceived: number;
      }>;
    };

    if (!lines || lines.length === 0) {
      return res.status(400).json({ error: 'No receipt lines provided' });
    }

    const [receipt] = await db.insert(partsRequestReceipts).values({
      batchId: batchId || null,
      vendorId: null,
      receivedBy,
      notes: notes || null,
    }).returning();

    let allFullyReceived = true;
    let anyReceived = false;

    for (const line of lines) {
      if (line.qtyReceived <= 0) continue;
      anyReceived = true;

      const [orderLine] = await db.select().from(partsRequestOrderLines).where(eq(partsRequestOrderLines.id, line.orderLineId));
      if (!orderLine) continue;

      const newOrderLineReceived = orderLine.qtyReceived + line.qtyReceived;
      const orderLineStatus = newOrderLineReceived >= orderLine.qtyOrdered ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

      await db.update(partsRequestOrderLines).set({
        qtyReceived: newOrderLineReceived,
        status: orderLineStatus,
        updatedAt: new Date(),
      }).where(eq(partsRequestOrderLines.id, line.orderLineId));

      await db.insert(partsRequestReceiptLines).values({
        receiptId: receipt.id,
        orderLineId: line.orderLineId,
        qtyReceived: line.qtyReceived,
      });

      if (newOrderLineReceived < orderLine.qtyOrdered) {
        allFullyReceived = false;
      }

      const allocations = await db.select().from(partsRequestOrderAllocations).where(eq(partsRequestOrderAllocations.orderLineId, line.orderLineId));

      let remainingToApply = line.qtyReceived;
      for (const alloc of allocations) {
        if (remainingToApply <= 0) break;
        const canApply = Math.min(remainingToApply, alloc.qtyAllocated - alloc.qtyReceivedApplied);
        if (canApply <= 0) continue;

        await db.update(partsRequestOrderAllocations).set({
          qtyReceivedApplied: alloc.qtyReceivedApplied + canApply,
          status: (alloc.qtyReceivedApplied + canApply) >= alloc.qtyAllocated ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
          updatedAt: new Date(),
        }).where(eq(partsRequestOrderAllocations.id, alloc.id));

        const [request] = await db.select().from(partsRequests).where(eq(partsRequests.id, alloc.partsRequestId));
        if (request) {
          const newTotalReceived = (request.qtyReceived || 0) + canApply;
          const requestStatus = newTotalReceived >= (request.qtyOrdered || request.quantity) ? 'RECEIVED' : 'RECEIVED_PARTIAL';

          await db.update(partsRequests).set({
            qtyReceived: newTotalReceived,
            status: requestStatus,
            actualDelivery: new Date().toISOString().split('T')[0],
            updatedAt: new Date(),
          }).where(eq(partsRequests.id, alloc.partsRequestId));

          await db.insert(partsRequestStatusHistory).values({
            partsRequestId: alloc.partsRequestId,
            fromStatus: request.status,
            toStatus: requestStatus,
            changedBy: receivedBy,
            reason: `Received ${canApply} units via order line #${line.orderLineId}`,
          });
        }

        remainingToApply -= canApply;
      }
    }

    if (batchId && anyReceived) {
      const batchStatus = allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      await db.update(partsRequestBatches).set({
        status: batchStatus,
        updatedAt: new Date(),
      }).where(eq(partsRequestBatches.id, batchId));
    }

    res.status(201).json(receipt);
  } catch (error) {
    console.error('Receive parts error:', error);
    res.status(500).json({ error: 'Failed to receive parts' });
  }
});

// Cancel request (requester)
router.post('/parts-requests/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { partsRequests, partsRequestStatusHistory } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq } = await import('drizzle-orm');

    const requestId = parseInt(req.params.id);
    const { cancelledBy, reason } = req.body as { cancelledBy: string; reason?: string };

    const [existing] = await db.select().from(partsRequests).where(eq(partsRequests.id, requestId));
    if (!existing) return res.status(404).json({ error: 'Request not found' });

    const canCancelDirectly = ['PENDING', 'APPROVED'].includes(existing.status);
    const needsReview = ['ORDERED', 'ORDERED_PARTIAL'].includes(existing.status);

    if (!canCancelDirectly && !needsReview) {
      return res.status(400).json({ error: `Cannot cancel request in '${existing.status}' status` });
    }

    const newStatus = canCancelDirectly ? 'CANCELED' : 'CANCEL_REQUESTED';

    await db.update(partsRequests).set({
      status: newStatus,
      cancelReason: reason || null,
      cancelRequestedAt: new Date(),
      cancelRequestedBy: cancelledBy,
      updatedAt: new Date(),
    }).where(eq(partsRequests.id, requestId));

    await db.insert(partsRequestStatusHistory).values({
      partsRequestId: requestId,
      fromStatus: existing.status,
      toStatus: newStatus,
      changedBy: cancelledBy,
      reason: reason || 'Cancelled by requester',
    });

    res.json({ success: true, newStatus });
  } catch (error) {
    console.error('Cancel parts request error:', error);
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

// Reject request (admin/IM)
router.post('/parts-requests/:id/reject', async (req: Request, res: Response) => {
  try {
    const { partsRequests, partsRequestStatusHistory } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq } = await import('drizzle-orm');

    const requestId = parseInt(req.params.id);
    const { rejectedBy, reason } = req.body as { rejectedBy: string; reason: string };

    if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

    const [existing] = await db.select().from(partsRequests).where(eq(partsRequests.id, requestId));
    if (!existing) return res.status(404).json({ error: 'Request not found' });

    const canReject = ['PENDING', 'CANCEL_REQUESTED'].includes(existing.status);
    if (!canReject) {
      return res.status(400).json({ error: `Cannot reject request in '${existing.status}' status` });
    }

    const newStatus = existing.status === 'CANCEL_REQUESTED' ? 'CANCELED' : 'REJECTED';

    await db.update(partsRequests).set({
      status: newStatus,
      rejectionReason: reason,
      rejectedBy,
      rejectedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(partsRequests.id, requestId));

    await db.insert(partsRequestStatusHistory).values({
      partsRequestId: requestId,
      fromStatus: existing.status,
      toStatus: newStatus,
      changedBy: rejectedBy,
      reason,
    });

    res.json({ success: true, newStatus });
  } catch (error) {
    console.error('Reject parts request error:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// Get status history for a parts request
router.get('/parts-requests/:id/history', async (req: Request, res: Response) => {
  try {
    const { partsRequestStatusHistory } = await import('../../schema');
    const { db } = await import('../../db');
    const { eq, desc } = await import('drizzle-orm');

    const requestId = parseInt(req.params.id);
    const history = await db
      .select()
      .from(partsRequestStatusHistory)
      .where(eq(partsRequestStatusHistory.partsRequestId, requestId))
      .orderBy(desc(partsRequestStatusHistory.createdAt));

    res.json(history);
  } catch (error) {
    console.error('Get status history error:', error);
    res.status(500).json({ error: 'Failed to fetch status history' });
  }
});

// Departments CRUD - Get actual manufacturing departments from orderDepartmentTypes
router.get('/departments', async (req: Request, res: Response) => {
  try {
    const { inventoryDepartments } = await import('../../schema');
    const { eq } = await import('drizzle-orm');
    const { db } = await import('../../db');
    
    const departments = await db
      .select()
      .from(inventoryDepartments)
      .where(eq(inventoryDepartments.isActive, true))
      .orderBy(inventoryDepartments.sortOrder);
    
    const simpleDepartments = departments.map(dept => ({
      id: dept.id,
      name: dept.name
    }));
    res.json(simpleDepartments);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

router.post('/departments', async (req: Request, res: Response) => {
  try {
    const departmentData = insertDepartmentSchema.parse(req.body);
    const newDepartment = await storage.createDepartment(departmentData);
    res.status(201).json(newDepartment);
  } catch (error) {
    console.error('Create department error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/departments/:id', async (req: Request, res: Response) => {
  try {
    const departmentId = parseInt(req.params.id);
    const updates = insertDepartmentSchema.partial().parse(req.body);
    const updatedDepartment = await storage.updateDepartment(departmentId, updates);
    res.json(updatedDepartment);
  } catch (error) {
    console.error('Update department error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update department' });
  }
});

router.delete('/departments/:id', async (req: Request, res: Response) => {
  try {
    const departmentId = parseInt(req.params.id);
    await storage.deleteDepartment(departmentId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

// Department Consumption Rates - DISABLED (table removed from production)
const CONSUMPTION_DISABLED = { error: 'Department consumption rates feature disabled' };
router.get('/consumption-rates/part/:agPartNumber', (_req: Request, res: Response) => res.status(501).json(CONSUMPTION_DISABLED));
router.get('/consumption-rates/department/:departmentId', (_req: Request, res: Response) => res.status(501).json(CONSUMPTION_DISABLED));
router.post('/consumption-rates', (_req: Request, res: Response) => res.status(501).json(CONSUMPTION_DISABLED));
router.put('/consumption-rates/:id', (_req: Request, res: Response) => res.status(501).json(CONSUMPTION_DISABLED));
router.delete('/consumption-rates/:id', (_req: Request, res: Response) => res.status(501).json(CONSUMPTION_DISABLED));

// Get inventory items filtered by department
router.get('/items/department/:departmentName', async (req: Request, res: Response) => {
  try {
    const departmentName = req.params.departmentName;
    const username = req.user?.username;
    
    // Admin users (glennj, tasham, staciw) can see all parts regardless of department
    const isAdmin = username ? ['glennj', 'tasham', 'staciw'].includes(username.toLowerCase()) : false;
    
    const items = await storage.getInventoryItemsByDepartment(departmentName, isAdmin);
    res.json(items.map(withSupplySourceDashboard));
  } catch (error) {
    console.error('Get inventory items by department error:', error);
    res.status(500).json({ error: 'Failed to fetch department inventory items' });
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
  utilizedInPL3: boolean;
  utilizedInFacilities: boolean;
  utilizedInAdmin: boolean;
  utilizedInServices: boolean;
} {
  const valueLower = value.toLowerCase();
  return {
    utilizedInPL1: valueLower.includes('pl1'),
    utilizedInPL2: valueLower.includes('pl2'),
    utilizedInPL3: valueLower.includes('pl3'),
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
          utilizedInPL3: false,
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
            case 'consumption rate':
            case 'consumptionrate':
              // Maps CSV "Usage Quantity Per Unit" column to consumptionRate (the real DB column)
              const usageQty = parseFloat(value);
              itemData.consumptionRate = !isNaN(usageQty) ? usageQty : null;
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
              PL2: itemData.utilizedInPL2,
              PL3: itemData.utilizedInPL3
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
      if (item.utilizedInPL3) utilized.push('PL3');
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
        escapeCSV(item.consumptionRate),
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

// GET /api/enhanced/inventory/balances - Get all inventory balances with department metadata
router.get('/inventory/balances', async (req: Request, res: Response) => {
  try {
    const balances = await storage.getAllInventoryBalances();
    
    // Enrich balances with department metadata
    const enrichedBalances: EnrichedInventoryBalance[] = balances.map((balance) => {
      const deptInfo = DEPARTMENT_LOCATION_MAP[balance.locationId];
      return {
        ...balance,
        departmentMeta: deptInfo ? {
          departmentId: deptInfo.departmentId,
          departmentName: deptInfo.departmentName,
          locationId: balance.locationId,
        } : undefined,
      };
    });

    // Compute per-part department breakdown
    const departmentBreakdowns = new Map<string, Map<number, DepartmentBalanceBreakdown>>();
    
    enrichedBalances.forEach((balance) => {
      if (!balance.departmentMeta) return;
      
      if (!departmentBreakdowns.has(balance.agPartNumber)) {
        departmentBreakdowns.set(balance.agPartNumber, new Map());
      }
      
      const partDepts = departmentBreakdowns.get(balance.agPartNumber)!;
      const deptId = balance.departmentMeta.departmentId;
      
      if (!partDepts.has(deptId)) {
        partDepts.set(deptId, {
          departmentId: deptId,
          departmentName: balance.departmentMeta.departmentName,
          totalQuantityOnHand: 0,
          totalQuantityAllocated: 0,
          totalQuantityAvailable: 0,
          locations: [],
        });
      }
      
      const breakdown = partDepts.get(deptId)!;
      breakdown.totalQuantityOnHand += balance.quantityOnHand;
      breakdown.totalQuantityAllocated += balance.quantityAllocated;
      breakdown.totalQuantityAvailable += balance.quantityAvailable;
      if (!breakdown.locations.includes(balance.locationId)) {
        breakdown.locations.push(balance.locationId);
      }
    });

    res.json({
      balances: enrichedBalances,
      departmentBreakdowns: Object.fromEntries(
        Array.from(departmentBreakdowns.entries()).map(([part, depts]) => [
          part,
          Array.from(depts.values())
        ])
      ),
    });
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

// GET /api/enhanced/inventory/transactions - Get inventory transactions with filters and department metadata
router.get('/inventory/transactions', async (req: Request, res: Response) => {
  try {
    const { partId, transactionType, dateFrom, dateTo, page = '1', limit = '50' } = req.query;
    
    let transactions = await storage.getAllInventoryTransactions();
    
    // Apply filters
    if (partId) {
      transactions = transactions.filter(t => t.agPartNumber === partId);
    }
    if (transactionType) {
      transactions = transactions.filter(t => t.transactionType === transactionType);
    }
    if (dateFrom) {
      const fromDate = new Date(dateFrom as string);
      transactions = transactions.filter(t => new Date(t.transactionDate) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo as string);
      transactions = transactions.filter(t => new Date(t.transactionDate) <= toDate);
    }
    
    // Enrich with department metadata based on location
    const enrichedTransactions = transactions.map(transaction => {
      const location = transaction.toLocation || transaction.fromLocation;
      const deptInfo = location ? DEPARTMENT_LOCATION_MAP[location] : undefined;
      
      return {
        ...transaction,
        locationId: location || 'Unknown',
        departmentName: deptInfo?.departmentName,
        departmentId: deptInfo?.departmentId,
      };
    });
    
    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    
    const paginatedTransactions = enrichedTransactions.slice(startIndex, endIndex);
    
    res.json({
      data: paginatedTransactions,
      total: enrichedTransactions.length,
      page: pageNum,
      limit: limitNum,
    });
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
    res.json(items.map(withSupplySourceDashboard));
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

// ========================================
// Stock BOM Material Forecasting (MRP Integration)
// ========================================

// GET /api/inventory/material-forecast - Calculate material requirements from stock orders with BOMs
// Now includes UOM conversion: calculates both usage requirements (for manufacturing) 
// and purchase requirements (for procurement) using conversion factors
router.get('/material-forecast', async (req: Request, res: Response) => {
  try {
    // Import required tables dynamically to avoid circular dependencies
    const { db } = await import('../../db');
    const { allOrders, bomDefinitions, bomItems, inventoryItems } = await import('../../schema');
    const { isNotNull, eq, and } = await import('drizzle-orm');
    const { buildStockBOMTree } = await import('../db/queries/bom');

    // Get all orders that have a linked Stock BOM
    const ordersWithBoms = await db
      .select({
        orderId: allOrders.orderId,
        bomDefinitionId: allOrders.bomDefinitionId,
        status: allOrders.status,
        modelId: allOrders.modelId,
      })
      .from(allOrders)
      .where(isNotNull(allOrders.bomDefinitionId));

    console.log(`📊 Found ${ordersWithBoms.length} orders with Stock BOMs for material forecast`);

    // Preload ALL inventory items to avoid N+1 queries (critical performance optimization)
    const allInventoryItems = await db
      .select({
        name: inventoryItems.name,
        agPartNumber: inventoryItems.agPartNumber,
        usageUnit: inventoryItems.usageUnit,
        purchaseUnit: inventoryItems.purchaseUnit,
        consumptionRate: inventoryItems.consumptionRate,
      })
      .from(inventoryItems);

    // Build lookup map by part name for O(1) access
    const inventoryLookup = new Map(
      allInventoryItems.map(item => [item.name, item])
    );

    console.log(`📦 Preloaded ${allInventoryItems.length} inventory items for UOM lookup`);

    // Track material demand by part name
    const materialDemand: Record<string, { 
      partName: string; 
      agPartNumber: string | null;
      usageQty: number; // Quantity needed for manufacturing (in usageUom)
      purchaseQty: number; // Quantity to purchase (in purchaseUom, after conversion)
      usageUom: string;
      purchaseUom: string;
      conversionFactor: number;
      orders: string[]; 
      itemType: string;
    }> = {};

    // Process each order
    for (const order of ordersWithBoms) {
      if (!order.bomDefinitionId) continue;

      try {
        // Explode the BOM to get material requirements
        const bomTree = await buildStockBOMTree(order.bomDefinitionId);
        
        // Aggregate material requirements (exclude labor and optional items for now)
        for (const item of bomTree.items) {
          if (item.itemType === 'labor' || item.isOptional) {
            continue; // Skip labor and optional items in material forecast
          }

          const key = item.partName;
          if (!materialDemand[key]) {
            // Look up the inventory item from preloaded map (O(1) lookup)
            const itemData = inventoryLookup.get(item.partName);
            
            const usageUom = itemData?.usageUnit || 'EA';
            const purchaseUom = itemData?.purchaseUnit || 'EA';
            const conversionFactor = itemData?.consumptionRate || 1;

            // Validate conversion factor to prevent divide-by-zero
            if (conversionFactor <= 0) {
              console.warn(`⚠️ Invalid conversion factor for ${item.partName}: ${conversionFactor}, defaulting to 1`);
            }

            materialDemand[key] = {
              partName: item.partName,
              agPartNumber: itemData?.agPartNumber || null,
              usageQty: 0,
              purchaseQty: 0,
              usageUom,
              purchaseUom,
              conversionFactor: conversionFactor > 0 ? conversionFactor : 1,
              orders: [],
              itemType: item.itemType,
            };
          }

          // Add to usage quantity (this is in usageUom)
          materialDemand[key].usageQty += item.quantity;
          
          // Calculate purchase quantity using validated conversion factor
          // purchaseQty = usageQty / conversionFactor
          // Example: 256 oz (usage) / 128 (oz per gallon) = 2 gallons (purchase)
          const safeFactor = materialDemand[key].conversionFactor > 0 ? materialDemand[key].conversionFactor : 1;
          materialDemand[key].purchaseQty = materialDemand[key].usageQty / safeFactor;
          
          if (!materialDemand[key].orders.includes(order.orderId)) {
            materialDemand[key].orders.push(order.orderId);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to explode BOM ${order.bomDefinitionId} for order ${order.orderId}:`, error);
      }
    }

    // Convert to array and sort by purchase quantity (what we need to buy)
    const forecast = Object.values(materialDemand).sort((a, b) => b.purchaseQty - a.purchaseQty);

    console.log(`✅ Material forecast calculated: ${forecast.length} unique materials required`);
    console.log(`📦 Example conversions:`, forecast.slice(0, 3).map(f => ({
      part: f.partName,
      usage: `${f.usageQty.toFixed(2)} ${f.usageUom}`,
      purchase: `${f.purchaseQty.toFixed(2)} ${f.purchaseUom}`,
      factor: f.conversionFactor
    })));

    res.json({
      ordersProcessed: ordersWithBoms.length,
      materialsRequired: forecast.length,
      forecast,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Material forecast error:', error);
    res.status(500).json({ error: 'Failed to calculate material forecast' });
  }
});

// Serve SDS PDF files
router.get('/sds/:filename', async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    
    // Security: Validate filename to prevent path traversal
    // Reject any filename with path separators or parent directory references
    if (
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('..') ||
      filename !== path.basename(filename)
    ) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    // Build absolute path and ensure it's within SDS directory
    const filePath = path.resolve(SDS_UPLOAD_DIR, filename);
    if (!filePath.startsWith(path.resolve(SDS_UPLOAD_DIR))) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'SDS file not found' });
    }
    
    // Send the PDF file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving SDS file:', error);
    res.status(500).json({ error: 'Failed to serve SDS file' });
  }
});

// Serve TDS PDF files
router.get('/tds/:filename', async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    
    // Security: Validate filename to prevent path traversal
    // Reject any filename with path separators or parent directory references
    if (
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('..') ||
      filename !== path.basename(filename)
    ) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    // Build absolute path and ensure it's within TDS directory
    const filePath = path.resolve(TDS_UPLOAD_DIR, filename);
    if (!filePath.startsWith(path.resolve(TDS_UPLOAD_DIR))) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'TDS file not found' });
    }
    
    // Send the PDF file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving TDS file:', error);
    res.status(500).json({ error: 'Failed to serve TDS file' });
  }
});

// Serve Other Docs PDF files
router.get('/other-docs/:filename', async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    
    // Security: Validate filename to prevent path traversal
    // Reject any filename with path separators or parent directory references
    if (
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('..') ||
      filename !== path.basename(filename)
    ) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    // Build absolute path and ensure it's within Other Docs directory
    const filePath = path.resolve(OTHER_DOCS_UPLOAD_DIR, filename);
    if (!filePath.startsWith(path.resolve(OTHER_DOCS_UPLOAD_DIR))) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Other Docs file not found' });
    }
    
    // Send the PDF file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving Other Docs file:', error);
    res.status(500).json({ error: 'Failed to serve Other Docs file' });
  }
});

// ===== OUTSIDE PROCESSING ROUTES =====

// GET /api/inventory/outside-processing/locations - Get all outside processing locations
router.get('/outside-processing/locations', async (req: Request, res: Response) => {
  try {
    // TODO: Implement outside processing locations storage
    // For now, return an empty array
    res.json([]);
  } catch (error) {
    console.error('Get outside processing locations error:', error);
    res.status(500).json({ error: 'Failed to fetch outside processing locations' });
  }
});

// GET /api/inventory/outside-processing/jobs - Get all outside processing jobs
router.get('/outside-processing/jobs', async (req: Request, res: Response) => {
  try {
    // TODO: Implement outside processing jobs storage
    // For now, return an empty array
    res.json([]);
  } catch (error) {
    console.error('Get outside processing jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch outside processing jobs' });
  }
});

// GET /api/inventory/fabric?search=... - Fabric inventory picker for traveler TRACE tasks
router.get('/fabric', async (req: Request, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').trim().toLowerCase();
    const allInventory = await storage.getAllCuttingFabricInventory();
    const activeInventory = allInventory.filter((item: any) => item.status === 'active');

    let results = activeInventory;
    if (search) {
      results = activeInventory.filter((item: any) => {
        const searchFields = [
          item.internalControlNumber,
          item.fabric,
          item.fabricPartNumber,
          item.source,
          item.nickname,
          item.batchNumber,
          item.lotNumber,
          item.rollNumber,
          item.barcode,
        ].filter(Boolean).map(s => s.toLowerCase());
        return searchFields.some(f => f.includes(search));
      });
    }

    const mapped = results.map((item: any) => ({
      id: item.id,
      internalControlNumber: item.internalControlNumber || '',
      expirationDate: item.expirationDate || '',
      batchNumber: item.batchNumber || item.lotNumber || '',
      fabricType: item.fabric || '',
      brand: item.source || '',
      freezerNumber: item.freezerNumber != null ? String(item.freezerNumber) : '',
      partNumber: item.fabricPartNumber || item.supplierPartNumber || '',
      rollNumber: item.rollNumber || '',
      quantityInStock: item.quantityInStock || 0,
      status: item.status || 'active',
      nickname: item.nickname || '',
    }));

    res.json(mapped);
  } catch (error: any) {
    console.error('Error fetching fabric inventory for picker:', error);
    res.status(500).json({ error: 'Failed to fetch fabric inventory' });
  }
});

// GET /api/inventory/fabric/:id - Get single fabric inventory item for validation
router.get('/fabric/:id', async (req: Request, res: Response) => {
  try {
    const item = await storage.getCuttingFabricInventory(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Fabric inventory item not found' });
    }
    res.json({
      id: item.id,
      internalControlNumber: (item as any).internalControlNumber || '',
      expirationDate: (item as any).expirationDate || '',
      batchNumber: (item as any).batchNumber || (item as any).lotNumber || '',
      fabricType: (item as any).fabric || '',
      brand: (item as any).source || '',
      freezerNumber: (item as any).freezerNumber != null ? String((item as any).freezerNumber) : '',
      partNumber: (item as any).fabricPartNumber || (item as any).supplierPartNumber || '',
      rollNumber: (item as any).rollNumber || '',
      quantityInStock: (item as any).quantityInStock || 0,
      status: (item as any).status || 'active',
    });
  } catch (error: any) {
    console.error('Error fetching fabric inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch fabric inventory item' });
  }
});

// ── MRP / Material Planning Engine ────────────────────────────────────────────

router.get('/mrp/demand', async (req: Request, res: Response) => {
  try {
    const sku = req.query.sku as string | undefined;
    const demand = await calculateMaterialDemand(sku);
    res.json({ demand, count: demand.length, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('MRP demand error:', error);
    res.status(500).json({ error: 'Failed to calculate material demand', message: error.message });
  }
});

router.get('/mrp/shortages', async (req: Request, res: Response) => {
  try {
    const sku = req.query.sku as string | undefined;
    const shortages = await calculateMaterialShortages(undefined, sku);
    const onlyShort = shortages.filter((s) => s.isShort);
    res.json({
      shortages,
      shortCount: onlyShort.length,
      allClear: onlyShort.length === 0,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('MRP shortages error:', error);
    res.status(500).json({ error: 'Failed to calculate material shortages', message: error.message });
  }
});

router.get('/mrp/capacity/:sku', async (req: Request, res: Response) => {
  try {
    const { sku } = req.params;
    const capacity = await calculateBuildCapacity(sku);
    res.json({ ...capacity, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('MRP capacity error:', error);
    res.status(500).json({ error: 'Failed to calculate build capacity', message: error.message });
  }
});

router.get('/mrp/run', async (req: Request, res: Response) => {
  try {
    const skuFilter = req.query.sku as string | undefined;
    const capacitySku = req.query.capacitySku as string | undefined;
    const result = await runMrp({ skuFilter, capacitySku });
    res.json(result);
  } catch (error: any) {
    console.error('MRP run error:', error);
    res.status(500).json({ error: 'Failed to run MRP', message: error.message });
  }
});

export default router;
