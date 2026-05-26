import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { sql, eq, and, gte, lte, ilike, or, inArray, desc, asc, type SQL } from 'drizzle-orm';
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
import { DEFAULT_INVENTORY_TRANSACTIONS_LIMIT, MAX_INVENTORY_TRANSACTIONS_LIMIT } from '../constants/inventory';
import { requireRole } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router();

const isHostedProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.REPL_DEPLOYMENT === 'true' ||
  process.env.REPLIT_DEPLOYMENT === 'true';

const INVENTORY_UPLOAD_ROOT = process.env.INVENTORY_UPLOAD_DIR
  ? path.resolve(process.env.INVENTORY_UPLOAD_DIR)
  : isHostedProduction
    ? path.join(os.tmpdir(), 'epoch-inventory-documents')
    : path.join(process.cwd(), 'uploads', 'inventory-documents');

// Keep legacy locations readable so existing DB file paths still work.
const LEGACY_SDS_UPLOAD_DIR = path.join(process.cwd(), 'server/src/assets/sds');
const LEGACY_TDS_UPLOAD_DIR = path.join(process.cwd(), 'server/src/assets/tds');
const LEGACY_OTHER_DOCS_UPLOAD_DIR = path.join(process.cwd(), 'server/src/assets/other-docs');

const SDS_UPLOAD_DIR = path.join(INVENTORY_UPLOAD_ROOT, 'sds');
const TDS_UPLOAD_DIR = path.join(INVENTORY_UPLOAD_ROOT, 'tds');
const OTHER_DOCS_UPLOAD_DIR = path.join(INVENTORY_UPLOAD_ROOT, 'other-docs');

fs.mkdir(SDS_UPLOAD_DIR, { recursive: true }).catch(err => {
  console.error('Failed to create SDS upload directory:', err);
});
fs.mkdir(TDS_UPLOAD_DIR, { recursive: true }).catch(err => {
  console.error('Failed to create TDS upload directory:', err);
});
fs.mkdir(OTHER_DOCS_UPLOAD_DIR, { recursive: true }).catch(err => {
  console.error('Failed to create Other Docs upload directory:', err);
});

function ensureUploadDir(uploadDir: string) {
  fsSync.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage for PDF uploads
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Determine destination based on field name
      let uploadDir = SDS_UPLOAD_DIR;
      if (file.fieldname === 'tdsFile') {
        uploadDir = TDS_UPLOAD_DIR;
      } else if (file.fieldname === 'otherDocsFile') {
        uploadDir = OTHER_DOCS_UPLOAD_DIR;
      }
      ensureUploadDir(uploadDir);
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, '');
    }
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

const inventoryPdfUpload = pdfUpload.fields([
  { name: 'sdsFile', maxCount: 1 },
  { name: 'tdsFile', maxCount: 1 },
  { name: 'otherDocsFile', maxCount: 1 },
]);

function getInventoryRequestId(req: Request, res: Response) {
  const existingId = req.headers['x-inventory-request-id'] || req.headers['x-request-id'];
  const requestId = Array.isArray(existingId) ? existingId[0] : existingId || randomUUID();
  res.locals.inventoryRequestId = requestId;
  res.setHeader('X-Inventory-Request-Id', requestId);
  return requestId;
}

function summarizeInventoryFiles(files: unknown) {
  if (!files || typeof files !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(files as Record<string, Express.Multer.File[]>).map(([field, fieldFiles]) => [
      field,
      fieldFiles.map(file => ({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
      })),
    ]),
  );
}

function handleInventoryPdfUpload(req: Request, res: Response, next: (err?: any) => void) {
  const requestId = getInventoryRequestId(req, res);
  console.log(`[inventory-upload:${requestId}] start`, {
    method: req.method,
    path: req.originalUrl,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
  });

  inventoryPdfUpload(req, res, (error: any) => {
    if (!error) {
      console.log(`[inventory-upload:${requestId}] complete`, {
        fields: Object.keys(req.body || {}),
        dataBytes: typeof req.body?.data === 'string' ? Buffer.byteLength(req.body.data) : 0,
        files: summarizeInventoryFiles(req.files),
      });
      return next();
    }

    console.error(`[inventory-upload:${requestId}] error`, error);
    const message = error instanceof multer.MulterError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Failed to upload inventory document';
    const statusCode = error instanceof multer.MulterError || message === 'Only PDF files are allowed' ? 400 : 500;
    return res.status(statusCode).json({ error: message, requestId, code: 'INVENTORY_UPLOAD_FAILED' });
  });
}

function sendInventoryUpdateError(res: Response, error: unknown, fallbackMessage = 'Failed to update inventory item') {
  const requestId = res.locals.inventoryRequestId;
  const message = error instanceof Error ? error.message : fallbackMessage;
  const statusCode = error instanceof Error ? 400 : 500;
  return res.status(statusCode).json({ error: message, requestId, code: 'INVENTORY_UPDATE_FAILED' });
}

async function resolveInventoryDocumentPath(primaryDir: string, legacyDir: string, filename: string) {
  const primaryPath = path.resolve(primaryDir, filename);
  if (!primaryPath.startsWith(path.resolve(primaryDir))) {
    return null;
  }

  try {
    await fs.access(primaryPath);
    return primaryPath;
  } catch {
    const legacyPath = path.resolve(legacyDir, filename);
    if (!legacyPath.startsWith(path.resolve(legacyDir))) {
      return null;
    }
    try {
      await fs.access(legacyPath);
      return legacyPath;
    } catch {
      return null;
    }
  }
}

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
router.put('/inventory/items/:id', requirePermission('inventory.adjust'), handleInventoryPdfUpload, async (req: Request, res: Response) => {
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
      // Only validate cross-family when at least one unit changed.
      // Exception: if the existing item already has a mismatched pair (legacy data
      // entered before this validation existed), only enforce the new-pair constraint
      // when BOTH units are being changed together.  Single-unit edits on items with
      // pre-existing mismatched pairs must not be permanently blocked.
      const purchaseChanged = existingItem?.purchaseUnitId !== updates.purchaseUnitId;
      const usageChanged = existingItem?.usageUnitId !== updates.usageUnitId;
      if (purchaseChanged || usageChanged) {
        let existingAlreadyMismatched = false;
        if (existingItem?.purchaseUnitId && existingItem?.usageUnitId) {
          const existingCheck = await validateSameFamily(existingItem.purchaseUnitId, existingItem.usageUnitId);
          existingAlreadyMismatched = !existingCheck.valid;
        }
        const shouldEnforce = !existingAlreadyMismatched || (purchaseChanged && usageChanged);
        if (shouldEnforce) {
          const familyCheck = await validateSameFamily(updates.purchaseUnitId, updates.usageUnitId);
          if (!familyCheck.valid) {
            return res.status(400).json({
              error: `Purchase unit (${familyCheck.purchaseFamilyName}) and usage unit (${familyCheck.usageFamilyName}) must belong to the same measurement family`,
            });
          }
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
    console.error(`[inventory-update:${res.locals.inventoryRequestId || 'unknown'}] enhanced error`, error);
    return sendInventoryUpdateError(res, error);
  }
});

// Enhanced Inventory API - Delete item
router.delete('/inventory/items/:id', requirePermission('inventory.adjust'), async (req: Request, res: Response) => {
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
router.post('/', requirePermission('inventory.adjust'), handleInventoryPdfUpload, async (req: Request, res: Response) => {
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
router.put('/:id', requirePermission('inventory.adjust'), handleInventoryPdfUpload, async (req: Request, res: Response) => {
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
    console.error(`[inventory-update:${res.locals.inventoryRequestId || 'unknown'}] root error`, error);
    return sendInventoryUpdateError(res, error);
  }
});

// DELETE route for deleting inventory items at the root level
router.delete('/:id', requirePermission('inventory.adjust'), async (req: Request, res: Response) => {
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

router.post('/items', requirePermission('inventory.adjust'), handleInventoryPdfUpload, async (req: Request, res: Response) => {
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

router.put('/items/:id', requirePermission('inventory.adjust'), handleInventoryPdfUpload, async (req: Request, res: Response) => {
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
      // Only validate cross-family when at least one unit changed.
      // Exception: if the existing item already has a mismatched pair (legacy data
      // entered before this validation existed), only enforce the new-pair constraint
      // when BOTH units are being changed together.  Single-unit edits on items with
      // pre-existing mismatched pairs must not be permanently blocked.
      const purchaseChanged = existingItem?.purchaseUnitId !== updates.purchaseUnitId;
      const usageChanged = existingItem?.usageUnitId !== updates.usageUnitId;
      if (purchaseChanged || usageChanged) {
        let existingAlreadyMismatched = false;
        if (existingItem?.purchaseUnitId && existingItem?.usageUnitId) {
          const existingCheck = await validateSameFamily(existingItem.purchaseUnitId, existingItem.usageUnitId);
          existingAlreadyMismatched = !existingCheck.valid;
        }
        const shouldEnforce = !existingAlreadyMismatched || (purchaseChanged && usageChanged);
        if (shouldEnforce) {
          const familyCheck = await validateSameFamily(updates.purchaseUnitId, updates.usageUnitId);
          if (!familyCheck.valid) {
            return res.status(400).json({
              error: `Purchase unit (${familyCheck.purchaseFamilyName}) and usage unit (${familyCheck.usageFamilyName}) must belong to the same measurement family`,
            });
          }
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
    console.error(`[inventory-update:${res.locals.inventoryRequestId || 'unknown'}] items error`, error);
    return sendInventoryUpdateError(res, error);
  }
});

router.delete('/items/:id', requirePermission('inventory.adjust'), async (req: Request, res: Response) => {
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
      if (cat === 'ASSEMBLY' || cat === 'FINAL_ASSEMBLY') return 'ASSEMBLY';
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

const OWNER_APPROVAL_THRESHOLD = 1000;

function getPartsRequestTotalCost(request: { estimatedCost?: number | null }) {
  return Number(request.estimatedCost || 0);
}

function appendApprovalHistory(
  request: { approvalHistory?: Array<Record<string, unknown>> | null },
  entry: Record<string, unknown>
) {
  const existing = Array.isArray(request.approvalHistory) ? request.approvalHistory : [];
  return [...existing, { ...entry, occurredAt: new Date().toISOString() }];
}

function getApprovalActor(req: Request, fallback?: string | null) {
  return req.user?.username || fallback?.trim() || 'Unknown approver';
}

router.get('/parts-requests/owner-approvals', async (_req: Request, res: Response) => {
  try {
    const requests = await storage.getAllPartsRequests();
    res.json(
      requests.filter(
        (request) =>
          request.isActive !== false &&
          request.status === 'PENDING_OWNER_APPROVAL' &&
          request.approvalStatus === 'OWNER_PENDING'
      )
    );
  } catch (error) {
    console.error('Get owner approval parts requests error:', error);
    res.status(500).json({ error: 'Failed to fetch owner approval requests' });
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
    const now = new Date();
    requestData.status = 'PENDING';
    requestData.approvalStatus = 'PENDING';
    requestData.approvalRequiredRole = 'INVENTORY_MANAGER';
    requestData.approvalHistory = [
      {
        event: 'REQUEST_CREATED',
        actor: requestData.requestedBy,
        fromStatus: null,
        toStatus: 'PENDING',
        notes: 'Parts request submitted for inventory manager review.',
        occurredAt: now.toISOString(),
      },
    ];

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

router.post('/parts-requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    const {
      approvedBy,
      digitalSignature,
      notes,
      decision = 'APPROVED',
    } = req.body as {
      approvedBy?: string;
      digitalSignature?: string;
      notes?: string;
      decision?: 'APPROVED' | 'REJECTED';
    };

    const existingRequest = await storage.getPartsRequest(requestId);
    if (!existingRequest) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (existingRequest.status !== 'PENDING_OWNER_APPROVAL') {
      return res.status(400).json({ error: `Request is not waiting on owner approval. Current status: ${existingRequest.status}` });
    }

    const actor = getApprovalActor(req, approvedBy);
    const now = new Date();
    const isApproved = decision !== 'REJECTED';
    const nextStatus = isApproved ? 'APPROVED' : 'REJECTED';
    const signature = digitalSignature || `${actor} digital approval ${now.toISOString()}`;
    const approvalHistory = appendApprovalHistory(existingRequest, {
      event: isApproved ? 'OWNER_APPROVED' : 'OWNER_REJECTED',
      actor,
      fromStatus: existingRequest.status,
      toStatus: nextStatus,
      approvalLevel: 'OWNER',
      digitalSignature: signature,
      notes: notes || null,
      totalCost: getPartsRequestTotalCost(existingRequest),
    });

    const updatedRequest = await storage.updatePartsRequest(requestId, {
      status: nextStatus,
      approvalStatus: isApproved ? 'APPROVED' : 'REJECTED',
      approvedBy: isApproved ? actor : existingRequest.approvedBy,
      approvedDate: isApproved ? now : existingRequest.approvedDate,
      ownerApprovedBy: isApproved ? actor : existingRequest.ownerApprovedBy,
      ownerApprovedAt: isApproved ? now : existingRequest.ownerApprovedAt,
      digitalApprovalSignature: signature,
      rejectionReason: isApproved ? existingRequest.rejectionReason : notes || existingRequest.rejectionReason,
      rejectedBy: isApproved ? existingRequest.rejectedBy : actor,
      rejectedAt: isApproved ? existingRequest.rejectedAt : now,
      notes: notes ?? existingRequest.notes,
      approvalHistory,
      updatedAt: now,
    } as any);

    const { partsRequestStatusHistory } = await import('../../schema');
    await db.insert(partsRequestStatusHistory).values({
      partsRequestId: requestId,
      fromStatus: existingRequest.status,
      toStatus: nextStatus,
      changedBy: actor,
      reason: isApproved ? 'Owner digital approval completed.' : notes || 'Owner rejected approval request.',
    });

    res.json(updatedRequest);
  } catch (error) {
    console.error('Approve owner parts request error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to approve parts request' });
  }
});

router.put('/parts-requests/:id', async (req: Request, res: Response) => {
  try {
    const requestId = parseInt(req.params.id);
    const updates = insertPartsRequestSchema.partial().parse(req.body);
    const existingRequest = await storage.getPartsRequest(requestId);
    if (!existingRequest) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    // Enforce status transition rules: PENDING → APPROVED → ORDERED → RECEIVED → DELIVERED_TO_DEPT
    // Also allows PENDING → REJECTED
    if (updates.status) {
      const validTransitions: Record<string, string[]> = {
        'PENDING_OWNER_APPROVAL': ['PENDING'],
        'APPROVED': ['PENDING', 'PENDING_OWNER_APPROVAL'],
        'REJECTED': ['PENDING', 'CANCEL_REQUESTED'],
        'ORDERED': ['PENDING', 'APPROVED'],
        'ORDERED_PARTIAL': ['PENDING', 'APPROVED'],
        'RECEIVED': ['ORDERED', 'ORDERED_PARTIAL', 'RECEIVED_PARTIAL'],
        'RECEIVED_PARTIAL': ['ORDERED', 'ORDERED_PARTIAL'],
        'DELIVERED_TO_DEPT': ['RECEIVED', 'RECEIVED_PARTIAL'],
        'CANCEL_REQUESTED': ['ORDERED', 'ORDERED_PARTIAL'],
        'CANCELED': ['PENDING', 'APPROVED', 'CANCEL_REQUESTED'],
      };
      
      if (validTransitions[updates.status]) {
        const allowedFromStatuses = validTransitions[updates.status];
        if (!allowedFromStatuses.includes(existingRequest.status)) {
          return res.status(400).json({ 
            error: `Cannot change status to '${updates.status}' from '${existingRequest.status}'. Valid source statuses: ${allowedFromStatuses.join(', ')}.`
          });
        }
      }

      if (updates.status === 'ORDERED' || updates.status === 'ORDERED_PARTIAL') {
        updates.orderDate = updates.orderDate ?? new Date();
      }

      if (updates.status === 'REJECTED') {
        updates.rejectedAt = updates.rejectedAt ?? new Date();
        updates.rejectionReason = updates.rejectionReason ?? updates.notes ?? null;
      }
    }

    if (updates.status === 'APPROVED') {
      const effectiveRequest = { ...existingRequest, ...updates };
      const totalCost = getPartsRequestTotalCost(effectiveRequest);
      const actor = getApprovalActor(req, updates.approvedBy ?? null);
      const now = new Date();
      const needsOwnerApproval = totalCost > OWNER_APPROVAL_THRESHOLD;
      const nextStatus = needsOwnerApproval ? 'PENDING_OWNER_APPROVAL' : 'APPROVED';
      const signature = updates.digitalApprovalSignature || `${actor} digital approval ${now.toISOString()}`;

      updates.approvalRequiredRole = needsOwnerApproval ? 'OWNER' : 'INVENTORY_MANAGER';
      updates.approvalStatus = needsOwnerApproval ? 'OWNER_PENDING' : 'APPROVED';
      updates.status = nextStatus;
      updates.approvedBy = needsOwnerApproval ? existingRequest.approvedBy : actor;
      updates.approvedDate = needsOwnerApproval ? existingRequest.approvedDate : now;
      updates.digitalApprovalSignature = needsOwnerApproval ? existingRequest.digitalApprovalSignature : signature;
      updates.approvalHistory = appendApprovalHistory(existingRequest, {
        event: needsOwnerApproval ? 'OWNER_APPROVAL_REQUESTED' : 'INVENTORY_MANAGER_APPROVED',
        actor,
        fromStatus: existingRequest.status,
        toStatus: nextStatus,
        approvalLevel: needsOwnerApproval ? 'OWNER' : 'INVENTORY_MANAGER',
        digitalSignature: needsOwnerApproval ? null : signature,
        notes: needsOwnerApproval
          ? `Total cost $${totalCost.toFixed(2)} exceeds the $${OWNER_APPROVAL_THRESHOLD.toFixed(2)} inventory manager approval limit.`
          : updates.notes ?? null,
        totalCost,
      });
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
router.post('/parts-requests/receive', requirePermission('inventory.manage_requests'), async (req: Request, res: Response) => {
  try {
    const {
      partsRequests,
      partsRequestBatches,
      partsRequestOrderLines,
      partsRequestOrderAllocations,
      partsRequestReceipts,
      partsRequestReceiptLines,
      partsRequestStatusHistory,
      inventoryItems: inventoryItemsTable,
      inventoryBalances: inventoryBalancesTable,
      inventoryTransactionLedger: inventoryTransactionLedgerTable,
    } = await import('../../schema');
    const { recordInventoryLedgerEntry } = await import('../services/inventoryTransactionLedgerService');

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

    // Task #229 — wrap the entire receipt (parent receipt row, line updates,
    // allocation propagation, batch status, request status history, AND the
    // ITL `RECEIVE` writes) in a single db.transaction so the ledger and the
    // parts-request state cannot diverge. ITL failure rolls back everything.
    const receipt = await db.transaction(async (tx) => {
      const [createdReceipt] = await tx.insert(partsRequestReceipts).values({
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

        const [orderLine] = await tx.select().from(partsRequestOrderLines).where(eq(partsRequestOrderLines.id, line.orderLineId));
        if (!orderLine) continue;

        const newOrderLineReceived = orderLine.qtyReceived + line.qtyReceived;
        const orderLineStatus = newOrderLineReceived >= orderLine.qtyOrdered ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

        await tx.update(partsRequestOrderLines).set({
          qtyReceived: newOrderLineReceived,
          status: orderLineStatus,
          updatedAt: new Date(),
        }).where(eq(partsRequestOrderLines.id, line.orderLineId));

        const [receiptLine] = await tx.insert(partsRequestReceiptLines).values({
          receiptId: createdReceipt.id,
          orderLineId: line.orderLineId,
          qtyReceived: line.qtyReceived,
        }).returning();

        if (newOrderLineReceived < orderLine.qtyOrdered) {
          allFullyReceived = false;
        }

        // ── Inventory Transaction Ledger write (Task #229 / #248) ──────────
        // The ITL inventory_item_id FK is NOT NULL. Previously, when a part
        // had no matching inventory_items row we silently skipped the ledger
        // write — that's the bug behind Task #248 (Rock West receipt missing
        // from the Transactions list). Now: when an agPartNumber is present
        // but no inventory_items row exists, auto-create a minimal placeholder
        // inside the same transaction, then write the ledger row. Truly
        // ad-hoc lines (no agPartNumber) still skip with a warning because
        // there's no part identity to track.
        if (orderLine.agPartNumber) {
          const { ensureInventoryItemForReceipt } = await import(
            '../services/ensureInventoryItemForReceipt'
          );
          const invItem = await ensureInventoryItemForReceipt(tx, {
            agPartNumber: orderLine.agPartNumber,
            fallbackName: orderLine.partName ?? orderLine.partNumber ?? null,
            createdBy: receivedBy ?? null,
          });

          {
            const ledgerSourceModule = 'receiving:parts-request';
            // Stable composite source key: anchored to the parent receipt id +
            // the business order-line id (not the surrogate receipt-line PK).
            // Within one receipt call, an order line can only be received once,
            // so this collapses to exactly one ITL row per line per receipt.
            const ledgerSourceRecordId = `${createdReceipt.id}:${line.orderLineId}`;
            const [existingLedger] = await tx
              .select({ id: inventoryTransactionLedgerTable.id })
              .from(inventoryTransactionLedgerTable)
              .where(
                and(
                  eq(inventoryTransactionLedgerTable.sourceModule, ledgerSourceModule),
                  eq(inventoryTransactionLedgerTable.sourceRecordId, ledgerSourceRecordId),
                ),
              )
              .limit(1);

            if (!existingLedger) {
              const balanceRows = await tx
                .select({ quantityOnHand: inventoryBalancesTable.quantityOnHand })
                .from(inventoryBalancesTable)
                .where(eq(inventoryBalancesTable.agPartNumber, invItem.agPartNumber));
              const quantityBefore = balanceRows.reduce(
                (sum, b) => sum + Number(b.quantityOnHand ?? 0),
                0,
              );
              const quantityAfter = quantityBefore + line.qtyReceived;

              await recordInventoryLedgerEntry({
                transactionType: 'RECEIVE',
                inventoryItemId: invItem.id,
                agPartNumber: invItem.agPartNumber,
                unitOfMeasure: invItem.purchaseUnit ?? invItem.usageUnit ?? 'EA',
                quantityBefore,
                quantityDelta: line.qtyReceived,
                quantityAfter,
                performedByDisplayName: receivedBy || 'system:parts-request-receive',
                reasonCode: 'PARTS_REQUEST_RECEIPT',
                notes: notes ?? null,
                sourceModule: ledgerSourceModule,
                sourceRecordId: ledgerSourceRecordId,
                metadata: {
                  receiptId: createdReceipt.id,
                  orderLineId: line.orderLineId,
                  batchId: batchId ?? null,
                  partNumber: orderLine.partNumber,
                  partName: orderLine.partName,
                },
              }, tx);
            }
          }
        } else {
          console.warn(
            `[parts-requests/receive] Skipping ITL write — order line ${line.orderLineId} has no agPartNumber (ad-hoc request)`,
          );
        }

        const allocations = await tx.select().from(partsRequestOrderAllocations).where(eq(partsRequestOrderAllocations.orderLineId, line.orderLineId));

        let remainingToApply = line.qtyReceived;
        for (const alloc of allocations) {
          if (remainingToApply <= 0) break;
          const canApply = Math.min(remainingToApply, alloc.qtyAllocated - alloc.qtyReceivedApplied);
          if (canApply <= 0) continue;

          await tx.update(partsRequestOrderAllocations).set({
            qtyReceivedApplied: alloc.qtyReceivedApplied + canApply,
            status: (alloc.qtyReceivedApplied + canApply) >= alloc.qtyAllocated ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
            updatedAt: new Date(),
          }).where(eq(partsRequestOrderAllocations.id, alloc.id));

          const [request] = await tx.select().from(partsRequests).where(eq(partsRequests.id, alloc.partsRequestId));
          if (request) {
            const newTotalReceived = (request.qtyReceived || 0) + canApply;
            const requestStatus = newTotalReceived >= (request.qtyOrdered || request.quantity) ? 'RECEIVED' : 'RECEIVED_PARTIAL';

            await tx.update(partsRequests).set({
              qtyReceived: newTotalReceived,
              status: requestStatus,
              actualDelivery: new Date().toISOString().split('T')[0],
              updatedAt: new Date(),
            }).where(eq(partsRequests.id, alloc.partsRequestId));

            await tx.insert(partsRequestStatusHistory).values({
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
        await tx.update(partsRequestBatches).set({
          status: batchStatus,
          updatedAt: new Date(),
        }).where(eq(partsRequestBatches.id, batchId));
      }

      return createdReceipt;
    });

    res.status(201).json(receipt);
  } catch (error: any) {
    console.error('Receive parts error:', error);
    // Surface inventory-ledger validation/FK failures as a structured 422 so
    // the caller can distinguish ledger invariant failures from generic 500s.
    const msg = String(error?.message ?? '');
    if (
      error?.code === 'INVENTORY_LEDGER_VALIDATION' ||
      /inventory[_ ]?ledger|inventory_transaction_ledger|recordInventoryLedgerEntry/i.test(msg)
    ) {
      return res.status(422).json({
        error: 'Inventory ledger write failed',
        code: 'INVENTORY_LEDGER_WRITE_FAILED',
        message: msg,
      });
    }
    res.status(500).json({ error: 'Failed to receive parts', message: msg });
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
router.post('/parts-requests/:id/reject', requirePermission('inventory.manage_requests'), async (req: Request, res: Response) => {
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

// Departments CRUD - inventory_departments (used by receiving and inventory item assignment)
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
    
    res.json(departments);
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

router.post('/departments', requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const { inventoryDepartments, insertInventoryDepartmentSchema } = await import('../../schema');
    const { db } = await import('../../db');
    const departmentData = insertInventoryDepartmentSchema.parse(req.body);
    const [newDepartment] = await db.insert(inventoryDepartments).values(departmentData).returning();
    res.status(201).json(newDepartment);
  } catch (error) {
    console.error('Create department error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/departments/:id', requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
  try {
    const departmentId = parseInt(req.params.id);
    const { inventoryDepartments, insertInventoryDepartmentSchema } = await import('../../schema');
    const { eq } = await import('drizzle-orm');
    const { db } = await import('../../db');
    const updates = insertInventoryDepartmentSchema.partial().parse(req.body);
    const [updatedDepartment] = await db
      .update(inventoryDepartments)
      .set(updates)
      .where(eq(inventoryDepartments.id, departmentId))
      .returning();
    if (!updatedDepartment) return res.status(404).json({ error: 'Department not found' });
    res.json(updatedDepartment);
  } catch (error) {
    console.error('Update department error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update department' });
  }
});

router.delete('/departments/:id', requireRole('ADMIN', 'OWNER'), async (req: Request, res: Response) => {
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
// Inventory Restock Signals
// ========================================

// GET /api/inventory/restock-signals
// Returns aggregated restock signal rows for all tracked materials (those with a reorderPoint set).
// Rows are sorted: critical (available <= 0) first, then largest restockGap, then alphabetical part number.
router.get('/restock-signals', async (req: Request, res: Response) => {
  try {
    const balances = await storage.getAllInventoryBalances();
    const items = await storage.getAllInventoryItems();

    const itemMap = new Map<string, string>();
    for (const item of items) {
      itemMap.set(item.agPartNumber, item.name);
    }

    // Aggregate across all locations per part number
    const aggregated = new Map<string, {
      agPartNumber: string;
      materialName: string;
      totalOnHand: number;
      totalAllocated: number;
      totalAvailable: number;
      maxReorderPoint: number;
    }>();

    for (const b of balances) {
      const existing = aggregated.get(b.agPartNumber);
      if (existing) {
        existing.totalOnHand += b.quantityOnHand;
        existing.totalAllocated += b.quantityAllocated;
        existing.totalAvailable += b.quantityAvailable;
        if ((b.reorderPoint ?? 0) > existing.maxReorderPoint) {
          existing.maxReorderPoint = b.reorderPoint ?? 0;
        }
      } else {
        aggregated.set(b.agPartNumber, {
          agPartNumber: b.agPartNumber,
          materialName: itemMap.get(b.agPartNumber) ?? b.agPartNumber,
          totalOnHand: b.quantityOnHand,
          totalAllocated: b.quantityAllocated,
          totalAvailable: b.quantityAvailable,
          maxReorderPoint: b.reorderPoint ?? 0,
        });
      }
    }

    // Build signal rows — include all parts that have a reorderPoint configured
    const rows = Array.from(aggregated.values())
      .filter((p) => p.maxReorderPoint > 0)
      .map((p) => {
        const restockGap = Math.max(0, p.maxReorderPoint - p.totalAvailable);
        let signalStatus: 'critical' | 'low' | 'healthy';
        if (p.totalAvailable <= 0) {
          signalStatus = 'critical';
        } else if (p.totalAvailable < p.maxReorderPoint) {
          signalStatus = 'low';
        } else {
          signalStatus = 'healthy';
        }
        return {
          agPartNumber: p.agPartNumber,
          materialName: p.materialName,
          quantityOnHand: p.totalOnHand,
          quantityAllocated: p.totalAllocated,
          quantityAvailable: p.totalAvailable,
          reorderPoint: p.maxReorderPoint,
          restockGap,
          signalStatus,
        };
      });

    // Sort: critical → largest gap → alphabetical
    rows.sort((a, b) => {
      const statusOrder = { critical: 0, low: 1, healthy: 2 };
      if (statusOrder[a.signalStatus] !== statusOrder[b.signalStatus]) {
        return statusOrder[a.signalStatus] - statusOrder[b.signalStatus];
      }
      if (b.restockGap !== a.restockGap) return b.restockGap - a.restockGap;
      return a.agPartNumber.localeCompare(b.agPartNumber);
    });

    res.json({ rows });
  } catch (error) {
    console.error('Get restock signals error:', error);
    res.status(500).json({ error: 'Failed to fetch restock signals' });
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
router.post('/inventory/balances', requirePermission('inventory.adjust'), async (req: Request, res: Response) => {
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
router.put('/inventory/balances/:id', requirePermission('inventory.adjust'), async (req: Request, res: Response) => {
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
router.delete('/inventory/balances/:id', requirePermission('inventory.adjust'), async (req: Request, res: Response) => {
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
    const { partId, transactionType, dateFrom, dateTo, page = '1', limit = String(DEFAULT_INVENTORY_TRANSACTIONS_LIMIT) } = req.query;
    
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
    const parsedLimit = parseInt(limit as string);
    const limitNum = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_INVENTORY_TRANSACTIONS_LIMIT)
      : DEFAULT_INVENTORY_TRANSACTIONS_LIMIT;
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

// ========================================
// Inventory Ledger - Unified filterable view of all inventory transactions
// ========================================

const LEDGER_DEFAULT_LIMIT = 100;
const LEDGER_MAX_LIMIT = 500;

function parseMultiValue(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((v) => String(v).split(',')).map((v) => v.trim()).filter(Boolean);
  }
  return String(raw).split(',').map((v) => v.trim()).filter(Boolean);
}

function ledgerDeltaForRow(row: { transactionType: string; quantity: number }): number {
  const t = (row.transactionType || '').toLowerCase();
  const q = Number(row.quantity) || 0;
  switch (t) {
    case 'receipt':
    case 'return':
    case 'putaway':
      return Math.abs(q);
    case 'issue':
    case 'consumption':
      return -Math.abs(q);
    case 'adjustment':
      return q;
    case 'transfer':
    case 'receipt_pending':
    case 'allocation':
      return 0;
    default:
      return q;
  }
}

interface LedgerFilters {
  agPartNumber?: string;
  partSearch?: string;
  location?: string;
  types: string[];
  departmentId?: number;
  referenceNumber?: string;
  createdBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

function parseLedgerFilters(req: Request): LedgerFilters {
  const q = req.query;
  const types = parseMultiValue(q.transactionType).map((t) => t.toLowerCase());
  const departmentRaw = typeof q.departmentId === 'string' ? q.departmentId : undefined;
  const departmentId = departmentRaw && /^\d+$/.test(departmentRaw) ? parseInt(departmentRaw, 10) : undefined;
  const dateFrom = typeof q.dateFrom === 'string' && q.dateFrom ? new Date(q.dateFrom) : undefined;
  let dateTo: Date | undefined;
  if (typeof q.dateTo === 'string' && q.dateTo) {
    const d = new Date(q.dateTo);
    if (!isNaN(d.getTime())) {
      // If only a date (YYYY-MM-DD) was provided, expand to end-of-day so the
      // entire dateTo day is included.
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.dateTo)) {
        d.setUTCHours(23, 59, 59, 999);
      }
      dateTo = d;
    }
  }
  return {
    agPartNumber: typeof q.agPartNumber === 'string' && q.agPartNumber ? q.agPartNumber : undefined,
    partSearch: typeof q.partSearch === 'string' && q.partSearch.trim() ? q.partSearch.trim() : undefined,
    location: typeof q.location === 'string' && q.location ? q.location : undefined,
    types,
    departmentId,
    referenceNumber: typeof q.referenceNumber === 'string' && q.referenceNumber ? q.referenceNumber : undefined,
    createdBy: typeof q.createdBy === 'string' && q.createdBy ? q.createdBy : undefined,
    dateFrom: dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : undefined,
    dateTo: dateTo && !isNaN(dateTo.getTime()) ? dateTo : undefined,
  };
}

interface LedgerRow {
  id: number;
  transactionDate: Date;
  agPartNumber: string;
  partName: string | null;
  transactionType: string;
  quantity: number;
  unitOfMeasure: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  location: string;
  costPerUnit: string | null;
  totalCost: string | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  performedBy: string;
  departmentId?: number;
  departmentName?: string;
  delta: number;
  runningBalance?: number;
}

async function fetchLedgerRows(filters: LedgerFilters): Promise<LedgerRow[]> {
  const { inventoryTransactions, inventoryItems } = await import('../../schema');

  const conditions: SQL[] = [];
  if (filters.agPartNumber) {
    conditions.push(eq(inventoryTransactions.agPartNumber, filters.agPartNumber));
  }
  if (filters.partSearch) {
    const term = `%${filters.partSearch}%`;
    const partOr = or(
      ilike(inventoryTransactions.agPartNumber, term),
      ilike(inventoryItems.name, term),
    );
    if (partOr) conditions.push(partOr);
  }
  if (filters.types.length > 0) {
    conditions.push(inArray(sql`lower(${inventoryTransactions.transactionType})`, filters.types));
  }
  if (filters.location) {
    const locOr = or(
      eq(inventoryTransactions.toLocation, filters.location),
      eq(inventoryTransactions.fromLocation, filters.location),
    );
    if (locOr) conditions.push(locOr);
  }
  if (filters.referenceNumber) {
    conditions.push(ilike(inventoryTransactions.referenceId, `%${filters.referenceNumber}%`));
  }
  if (filters.createdBy) {
    conditions.push(ilike(inventoryTransactions.performedBy, `%${filters.createdBy}%`));
  }
  if (filters.dateFrom) {
    conditions.push(gte(inventoryTransactions.transactionDate, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(inventoryTransactions.transactionDate, filters.dateTo));
  }

  const baseQuery = db
    .select({
      id: inventoryTransactions.id,
      transactionDate: inventoryTransactions.transactionDate,
      agPartNumber: inventoryTransactions.agPartNumber,
      partName: inventoryItems.name,
      transactionType: inventoryTransactions.transactionType,
      quantity: inventoryTransactions.quantity,
      unitOfMeasure: inventoryTransactions.unitOfMeasure,
      fromLocation: inventoryTransactions.fromLocation,
      toLocation: inventoryTransactions.toLocation,
      costPerUnit: inventoryTransactions.costPerUnit,
      totalCost: inventoryTransactions.totalCost,
      referenceType: inventoryTransactions.referenceType,
      referenceId: inventoryTransactions.referenceId,
      notes: inventoryTransactions.notes,
      performedBy: inventoryTransactions.performedBy,
    })
    .from(inventoryTransactions)
    .leftJoin(inventoryItems, eq(inventoryItems.agPartNumber, inventoryTransactions.agPartNumber));

  const rows = conditions.length > 0
    ? await baseQuery.where(and(...conditions)).orderBy(desc(inventoryTransactions.transactionDate), desc(inventoryTransactions.id))
    : await baseQuery.orderBy(desc(inventoryTransactions.transactionDate), desc(inventoryTransactions.id));

  let enriched: LedgerRow[] = rows.map((r) => {
    const location = r.toLocation || r.fromLocation || 'Unknown';
    const deptInfo = location ? DEPARTMENT_LOCATION_MAP[location] : undefined;
    return {
      ...r,
      location,
      departmentId: deptInfo?.departmentId,
      departmentName: deptInfo?.departmentName,
      delta: ledgerDeltaForRow({ transactionType: r.transactionType, quantity: r.quantity }),
    };
  });

  if (filters.departmentId != null) {
    enriched = enriched.filter((r) => r.departmentId === filters.departmentId);
  }

  // Compute running balance only when narrowed to a single part
  if (filters.agPartNumber) {
    const ascending = [...enriched].reverse();
    let balance = 0;
    for (const row of ascending) {
      balance += row.delta;
      row.runningBalance = balance;
    }
  }

  return enriched;
}

function ledgerCsvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const LEDGER_CSV_COLUMNS: Array<{ key: keyof LedgerRow | 'date' | 'reference'; label: string }> = [
  { key: 'date', label: 'Date' },
  { key: 'agPartNumber', label: 'AG Part #' },
  { key: 'partName', label: 'Part Name' },
  { key: 'location', label: 'Location' },
  { key: 'departmentName', label: 'Department' },
  { key: 'transactionType', label: 'Type' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'delta', label: 'Signed Delta' },
  { key: 'runningBalance', label: 'Running Balance' },
  { key: 'unitOfMeasure', label: 'UOM' },
  { key: 'costPerUnit', label: 'Unit Cost' },
  { key: 'totalCost', label: 'Total Cost' },
  { key: 'referenceType', label: 'Ref Type' },
  { key: 'reference', label: 'Reference' },
  { key: 'performedBy', label: 'Created By' },
  { key: 'notes', label: 'Notes' },
];

// GET /api/inventory/ledger - Unified inventory ledger with filters and pagination
router.get('/ledger', async (req: Request, res: Response) => {
  try {
    const filters = parseLedgerFilters(req);
    const pageNum = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const requested = parseInt(String(req.query.limit ?? String(LEDGER_DEFAULT_LIMIT)), 10);
    const limit = Number.isFinite(requested) && requested > 0
      ? Math.min(requested, LEDGER_MAX_LIMIT)
      : LEDGER_DEFAULT_LIMIT;

    const allRows = await fetchLedgerRows(filters);
    const total = allRows.length;
    const start = (pageNum - 1) * limit;
    const paginated = allRows.slice(start, start + limit);

    res.json({
      data: paginated,
      total,
      page: pageNum,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasRunningBalance: !!filters.agPartNumber,
    });
  } catch (error) {
    console.error('Get inventory ledger error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory ledger' });
  }
});

// GET /api/inventory/ledger/export.csv - CSV export of filtered ledger
router.get('/ledger/export.csv', async (req: Request, res: Response) => {
  try {
    const filters = parseLedgerFilters(req);
    const rows = await fetchLedgerRows(filters);

    const header = LEDGER_CSV_COLUMNS.map((c) => ledgerCsvEscape(c.label)).join(',');
    const lines = [header];
    for (const r of rows) {
      const reference = r.referenceId
        ? (r.referenceType ? `${r.referenceType}:${r.referenceId}` : r.referenceId)
        : '';
      const dateStr = r.transactionDate ? new Date(r.transactionDate).toISOString() : '';
      const values = LEDGER_CSV_COLUMNS.map((c) => {
        switch (c.key) {
          case 'date': return ledgerCsvEscape(dateStr);
          case 'reference': return ledgerCsvEscape(reference);
          default: return ledgerCsvEscape(r[c.key as keyof LedgerRow]);
        }
      });
      lines.push(values.join(','));
    }

    const csv = lines.join('\r\n');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="inventory-ledger-${ts}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export inventory ledger CSV error:', error);
    res.status(500).json({ error: 'Failed to export inventory ledger' });
  }
});

// GET /api/inventory/ledger/locations - Distinct locations for filter dropdowns
router.get('/ledger/locations', async (_req: Request, res: Response) => {
  try {
    const { inventoryTransactions } = await import('../../schema');
    const rows = await db.execute(sql`
      SELECT DISTINCT loc FROM (
        SELECT to_location AS loc FROM ${inventoryTransactions} WHERE to_location IS NOT NULL
        UNION
        SELECT from_location AS loc FROM ${inventoryTransactions} WHERE from_location IS NOT NULL
      ) t WHERE loc <> '' ORDER BY loc
    `);
    const locations = (rows.rows as Array<{ loc: string }>).map((r) => r.loc).filter(Boolean);
    res.json({ locations, departments: DEPARTMENT_LOCATION_MAP });
  } catch (error) {
    console.error('Get ledger locations error:', error);
    res.status(500).json({ error: 'Failed to fetch ledger locations' });
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
router.post('/inventory/transactions', requirePermission('inventory.adjust'), async (req: Request, res: Response) => {
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
    
    const filePath = await resolveInventoryDocumentPath(SDS_UPLOAD_DIR, LEGACY_SDS_UPLOAD_DIR, filename);
    if (!filePath) {
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
    
    const filePath = await resolveInventoryDocumentPath(TDS_UPLOAD_DIR, LEGACY_TDS_UPLOAD_DIR, filename);
    if (!filePath) {
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
    
    const filePath = await resolveInventoryDocumentPath(OTHER_DOCS_UPLOAD_DIR, LEGACY_OTHER_DOCS_UPLOAD_DIR, filename);
    if (!filePath) {
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

interface ReconciliationRawRow {
  agPartNumber: unknown;
  materialName: unknown;
  lotQtyTotal: unknown;
  quantityOnHand: unknown;
  quantityAllocated: unknown;
  quantityAvailable: unknown;
  variance: unknown;
  lotCount: unknown;
  orphanedBalance: unknown;
  missingBalance: unknown;
}

function parseDbBool(v: unknown): boolean {
  return v === true || v === 't' || v === 'true' || v === '1' || v === 1;
}

function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}

// Inventory Reconciliation — read-only comparison of lot quantities vs. balance records
router.get('/reconciliation', async (req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      WITH active_lots AS (
        SELECT
          material_part_number AS ag_part_number,
          MAX(material_name)   AS material_name,
          SUM(remaining_qty::numeric) AS lot_qty_total,
          COUNT(*)             AS lot_count
        FROM material_lots
        WHERE status IN ('RECEIVED', 'ACCEPTED', 'ISSUED', 'QUARANTINE')
        GROUP BY material_part_number
      ),
      balance_summary AS (
        SELECT
          ag_part_number,
          SUM(quantity_on_hand)    AS quantity_on_hand,
          SUM(quantity_allocated)  AS quantity_allocated,
          SUM(quantity_available)  AS quantity_available
        FROM inventory_balances
        GROUP BY ag_part_number
      )
      SELECT
        COALESCE(al.ag_part_number, bs.ag_part_number)        AS "agPartNumber",
        COALESCE(al.material_name, ii.name)                    AS "materialName",
        COALESCE(al.lot_qty_total, 0)                          AS "lotQtyTotal",
        COALESCE(bs.quantity_on_hand, 0)                       AS "quantityOnHand",
        COALESCE(bs.quantity_allocated, 0)                     AS "quantityAllocated",
        COALESCE(bs.quantity_available, 0)                     AS "quantityAvailable",
        COALESCE(al.lot_qty_total, 0) - COALESCE(bs.quantity_on_hand, 0) AS "variance",
        COALESCE(al.lot_count, 0)                              AS "lotCount",
        (al.ag_part_number IS NULL)                            AS "orphanedBalance",
        (bs.ag_part_number IS NULL)                            AS "missingBalance"
      FROM active_lots al
      FULL OUTER JOIN balance_summary bs ON al.ag_part_number = bs.ag_part_number
      LEFT JOIN inventory_items ii ON ii.ag_part_number = COALESCE(al.ag_part_number, bs.ag_part_number)
      ORDER BY ABS(COALESCE(al.lot_qty_total, 0) - COALESCE(bs.quantity_on_hand, 0)) DESC, "agPartNumber"
    `);

    const rows = (Array.isArray(result) ? result : result.rows) as ReconciliationRawRow[];

    const data = rows.map((row) => {
      const orphaned = parseDbBool(row.orphanedBalance);
      const missing  = parseDbBool(row.missingBalance);
      const variance = toNumber(row.variance);
      return {
        agPartNumber:      toStr(row.agPartNumber),
        materialName:      row.materialName != null ? toStr(row.materialName) : null,
        lotQtyTotal:       toNumber(row.lotQtyTotal),
        quantityOnHand:    toNumber(row.quantityOnHand),
        quantityAllocated: toNumber(row.quantityAllocated),
        quantityAvailable: toNumber(row.quantityAvailable),
        variance,
        lotCount:          toNumber(row.lotCount),
        orphanedBalance:   orphaned,
        missingBalance:    missing,
        isMismatch:        variance !== 0 || orphaned || missing,
      };
    });

    res.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error fetching inventory reconciliation:', msg);
    res.status(500).json({ error: 'Failed to fetch reconciliation data', message: msg });
  }
});

// ── Cycle Count Session Routes ────────────────────────────────────────────────

// List all sessions
router.get('/cycle-count', async (req: Request, res: Response) => {
  try {
    const sessions = await storage.listCycleCountSessions();
    res.json(sessions);
  } catch (error) {
    console.error('List cycle count sessions error:', error);
    res.status(500).json({ error: 'Failed to list cycle count sessions' });
  }
});

// Create a new session (auto-populates lines from material_lots)
router.post('/cycle-count', async (req: Request, res: Response) => {
  try {
    const createdBy = req.user?.username;
    if (!createdBy) return res.status(401).json({ error: 'Not authenticated' });
    const { z } = await import('zod');
    const schema = z.object({
      location: z.string().min(1, 'Location is required'),
      partFilter: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }
    const session = await storage.createCycleCountSession({ ...parsed.data, createdBy });
    res.status(201).json(session);
  } catch (error) {
    console.error('Create cycle count session error:', error);
    const err = error instanceof Error ? (error as Error & { statusCode?: number }) : null;
    res.status(err?.statusCode || 500).json({ error: err?.message || 'Failed to create cycle count session' });
  }
});

// Get session detail with lines
router.get('/cycle-count/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    const session = await storage.getCycleCountSession(id);
    if (!session) return res.status(404).json({ error: 'Cycle count session not found' });
    res.json(session);
  } catch (error) {
    console.error('Get cycle count session error:', error);
    res.status(500).json({ error: 'Failed to get cycle count session' });
  }
});

// Update counted quantities on lines (only allowed in IN_PROGRESS state)
router.patch('/cycle-count/:id/lines', async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session ID' });
    const { z } = await import('zod');
    // Non-negative finite-numeric string: physical counts cannot be negative.
    // Rejects negative values, "12abc", "NaN", "Infinity", etc.
    const numericString = z.string().regex(
      /^\d+(\.\d+)?$/,
      'countedQty must be a non-negative number (e.g. "0", "12" or "3.5")'
    );
    const schema = z.object({
      lines: z.array(z.object({
        id: z.number().int(),
        countedQty: z.union([numericString, z.null()]),
        notes: z.string().optional(),
      })),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }
    const lines = await storage.updateCycleCountLines(sessionId, parsed.data.lines);
    res.json(lines);
  } catch (error) {
    console.error('Update cycle count lines error:', error);
    const err = error instanceof Error ? (error as Error & { statusCode?: number }) : null;
    res.status(err?.statusCode || 500).json({ error: err?.message || 'Failed to update cycle count lines' });
  }
});

// Submit session — transitions IN_PROGRESS → COMPLETED, locking counts for review
router.post('/cycle-count/:id/submit', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    const session = await storage.submitCycleCountSession(id);
    res.json(session);
  } catch (error) {
    console.error('Submit cycle count session error:', error);
    const err = error instanceof Error ? (error as Error & { statusCode?: number }) : null;
    res.status(err?.statusCode || 500).json({ error: err?.message || 'Failed to submit cycle count session' });
  }
});

// Post session — applies all non-zero variance adjustments and locks the session (must be COMPLETED first)
router.post('/cycle-count/:id/post', async (req: Request, res: Response) => {
  try {
    const performedBy = req.user?.username;
    if (!performedBy) return res.status(401).json({ error: 'Not authenticated' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid session ID' });
    const session = await storage.postCycleCountSession(id, performedBy);
    res.json(session);
  } catch (error) {
    console.error('Post cycle count session error:', error);
    const err = error instanceof Error ? (error as Error & { statusCode?: number }) : null;
    res.status(err?.statusCode || 500).json({ error: err?.message || 'Failed to post cycle count session' });
  }
});

export default router;
