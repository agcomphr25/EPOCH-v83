import { Router } from 'express';
import { storage } from '../../storage';
import { db } from '../../db';
import { 
  cuttingCutRecords, 
  cuttingPacketCompositions, 
  inventoryItems,
  cuttingPacketBOMs,
  cuttingPacketBOMMaterials,
  cuttingPacketBOMParts,
  cuttingPacketBOMCuts,
  cuttingFabricInventory,
  cuttingFabricInventoryTransactions,
  manufacturingQueue,
  getDashboardCategories,
  supplySourceDashboardToLegacyDept,
} from '../../schema';
import { and, gte, lte, eq, desc, ilike, or, isNull, inArray } from 'drizzle-orm';
import {
  adjustPacketInventoryForMaterial,
  normalizeP1PacketMaterialType,
  type P1PacketMaterialType,
} from '../utils/p1PacketInventory';
import {
  insertCuttingMaterialSchema,
  insertCuttingFabricTypeSchema,
  insertCuttingProductionLineSchema,
  insertCuttingProductCategorySchema,
  insertCuttingComponentSchema,
  insertCuttingWeeklyDataSchema,
  insertCuttingCutProgressSchema,
  insertCuttingFabricInventorySchema,
  insertCuttingPacketSessionSchema,
  insertCuttingPacketSessionLotSchema,
  insertCuttingFabricInventoryTransactionSchema,
  insertCuttingPacketCompositionSchema,
  insertCuttingCutRecordSchema,
  insertCuttingPacketBOMSchema,
  insertCuttingPacketBOMMaterialSchema,
  insertCuttingPacketBOMCutSchema,
  type CuttingFabricInventoryTransaction,
} from '../../schema';

const router = Router();

function parseFabricStockQuantity(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nonZeroInventoryDelta(quantity: number): number {
  if (quantity === 0) return 0;
  const magnitude = Math.max(1, Math.round(Math.abs(quantity)));
  return quantity < 0 ? -magnitude : magnitude;
}

function syncFabricStockFields<T extends Record<string, any>>(data: T): T {
  const next = { ...data };
  const hasQuantityInStock = next.quantityInStock !== undefined && next.quantityInStock !== null && next.quantityInStock !== '';
  const hasSquareMeters = next.squareMeters !== undefined && next.squareMeters !== null && next.squareMeters !== '';

  if (hasSquareMeters) {
    const quantity = parseFabricStockQuantity(next.squareMeters);
    next.quantityInStock = quantity;
  } else if (hasQuantityInStock) {
    const quantity = parseFabricStockQuantity(next.quantityInStock);
    next.squareMeters = String(quantity);
  }

  return next as T;
}

type CuttingPacketStockLevels = {
  carbon_fiber: number;
  fiberglass: number;
  mesa: number;
  cheek_riser: number;
};

function classifyPacketMaterial(item: any): keyof CuttingPacketStockLevels | null {
  const haystack = [
    item?.name,
    item?.agPartNumber,
    item?.description,
    item?.category,
    item?.manufacturedCategory,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (haystack.includes('cheek riser') || haystack.includes('cheekriser') || haystack.includes('cheek_riser')) return 'cheek_riser';
  if (haystack.includes('mesa')) return 'mesa';
  if (haystack.includes('fiberglass') || /\bfg\b/.test(haystack) || haystack.includes('fg stock')) return 'fiberglass';
  if (haystack.includes('carbon') || haystack.includes('carbon_fiber') || /\bcf\b/.test(haystack) || haystack.includes('cf stock')) return 'carbon_fiber';
  return null;
}

function parseP1PacketQueueNotes(notes: string | null): Record<string, any> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { rawNotes: notes };
  }
}

function stringifyP1PacketQueueNotes(notes: Record<string, any>): string {
  const { rawNotes, ...serializableNotes } = notes;
  return JSON.stringify(serializableNotes);
}

function getP1PacketMaterialFromQueueNotes(notes: Record<string, any>): P1PacketMaterialType | null {
  const source = String(notes.source || '').toUpperCase();
  const materialType = String(notes.materialType || '').toLowerCase();
  if (notes.isP2Packet === true || source === 'P2' || source === 'P2_SYNC' || materialType.startsWith('p2_')) {
    return null;
  }
  return normalizeP1PacketMaterialType(notes.materialType)
    || normalizeP1PacketMaterialType(notes.packetName)
    || normalizeP1PacketMaterialType(notes.rawNotes);
}

async function ensureP1PacketInventoryForCompletedQueueRows(): Promise<void> {
  const cuttingTableDept = supplySourceDashboardToLegacyDept('CUTTING_TABLE')!;
  const cuttingTableCategories = getDashboardCategories('CUTTING_TABLE');
  const completedRows = await db
    .select({
      queue: manufacturingQueue,
      item: inventoryItems,
    })
    .from(manufacturingQueue)
    .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
    .where(and(
      or(
        eq(manufacturingQueue.department, cuttingTableDept),
        inArray(inventoryItems.manufacturedCategory, cuttingTableCategories)
      ),
      eq(manufacturingQueue.status, 'COMPLETED')
    ))
    .orderBy(desc(manufacturingQueue.completedAt), desc(manufacturingQueue.updatedAt))
    .limit(500);

  for (const row of completedRows) {
    const notes = parseP1PacketQueueNotes(row.queue.notes);
    const materialType = getP1PacketMaterialFromQueueNotes(notes);
    const completedQuantity = row.queue.quantityCompleted || 0;
    const alreadyAdded = Number(notes.p1PacketInventoryAdded || 0);
    const missingQuantity = completedQuantity - alreadyAdded;
    if (!materialType || missingQuantity <= 0) continue;

    await db.transaction(async (tx) => {
      const [lockedRow] = await tx
        .select({
          notes: manufacturingQueue.notes,
          quantityCompleted: manufacturingQueue.quantityCompleted,
        })
        .from(manufacturingQueue)
        .where(eq(manufacturingQueue.id, row.queue.id))
        .for('update');

      if (!lockedRow) return;
      const lockedNotes = parseP1PacketQueueNotes(lockedRow.notes);
      const lockedMaterialType = getP1PacketMaterialFromQueueNotes(lockedNotes);
      const lockedCompletedQuantity = lockedRow.quantityCompleted || 0;
      const lockedAlreadyAdded = Number(lockedNotes.p1PacketInventoryAdded || 0);
      const lockedMissingQuantity = lockedCompletedQuantity - lockedAlreadyAdded;
      if (!lockedMaterialType || lockedMissingQuantity <= 0) return;

      await adjustPacketInventoryForMaterial(tx, lockedMaterialType, lockedMissingQuantity);
      await tx
        .update(manufacturingQueue)
        .set({
          notes: stringifyP1PacketQueueNotes({
            ...lockedNotes,
            p1PacketInventoryAdded: lockedAlreadyAdded + lockedMissingQuantity,
            p1PacketInventoryMaterialType: lockedMaterialType,
          }),
          updatedAt: new Date(),
        })
        .where(eq(manufacturingQueue.id, row.queue.id));
    });
  }
}

async function getCuttingPacketStockLevels(): Promise<CuttingPacketStockLevels> {
  await ensureP1PacketInventoryForCompletedQueueRows();

  const levels: CuttingPacketStockLevels = {
    carbon_fiber: 0,
    fiberglass: 0,
    mesa: 0,
    cheek_riser: 0,
  };

  const allItems = await storage.getAllInventoryItems();
  const packetItems = allItems.filter((item: any) =>
    item.isPacket === true ||
    item.manufacturedCategory === 'PACKET' ||
    item.category === 'packet' ||
    String(item.name ?? '').toLowerCase().includes('packet')
  );

  for (const item of packetItems) {
    const material = classifyPacketMaterial(item);
    if (!material) continue;
    const rawQty = (item as any).onHand ?? (item as any).quantityInStock ?? (item as any).available ?? 0;
    const qty = Number(rawQty);
    levels[material] += Number.isFinite(qty) ? qty : 0;
  }

  return levels;
}

// Materials endpoints
router.get('/materials', async (req, res) => {
  try {
    const materials = await storage.getAllCuttingMaterials();
    res.json(materials);
  } catch (error) {
    console.error('Error fetching cutting materials:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

router.get('/materials/:id', async (req, res) => {
  try {
    const material = await storage.getCuttingMaterial(req.params.id);
    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }
    res.json(material);
  } catch (error) {
    console.error('Error fetching cutting material:', error);
    res.status(500).json({ error: 'Failed to fetch material' });
  }
});

router.post('/materials', async (req, res) => {
  try {
    const validatedData = insertCuttingMaterialSchema.parse(req.body);
    const material = await storage.createCuttingMaterial(validatedData);
    res.json(material);
  } catch (error) {
    console.error('Error creating cutting material:', error);
    res.status(400).json({ error: 'Failed to create material' });
  }
});

router.put('/materials/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingMaterialSchema.partial().parse(req.body);
    const material = await storage.updateCuttingMaterial(req.params.id, validatedData);
    res.json(material);
  } catch (error) {
    console.error('Error updating cutting material:', error);
    res.status(400).json({ error: 'Failed to update material' });
  }
});

router.delete('/materials/:id', async (req, res) => {
  try {
    await storage.deleteCuttingMaterial(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting cutting material:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// Fabric Types endpoints
router.get('/fabric-types', async (req, res) => {
  try {
    const fabricTypes = await storage.getAllCuttingFabricTypes();
    res.json(fabricTypes);
  } catch (error) {
    console.error('Error fetching fabric types:', error);
    res.status(500).json({ error: 'Failed to fetch fabric types' });
  }
});

router.post('/fabric-types', async (req, res) => {
  try {
    const validatedData = insertCuttingFabricTypeSchema.parse(req.body);
    const fabricType = await storage.createCuttingFabricType(validatedData);
    res.json(fabricType);
  } catch (error) {
    console.error('Error creating fabric type:', error);
    res.status(400).json({ error: 'Failed to create fabric type' });
  }
});

router.delete('/fabric-types/:id', async (req, res) => {
  try {
    await storage.deleteCuttingFabricType(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting fabric type:', error);
    res.status(500).json({ error: 'Failed to delete fabric type' });
  }
});

// Production Lines endpoints
router.get('/production-lines', async (req, res) => {
  try {
    const lines = await storage.getAllCuttingProductionLines();
    res.json(lines);
  } catch (error) {
    console.error('Error fetching production lines:', error);
    res.status(500).json({ error: 'Failed to fetch production lines' });
  }
});

router.post('/production-lines', async (req, res) => {
  try {
    const validatedData = insertCuttingProductionLineSchema.parse(req.body);
    const line = await storage.createCuttingProductionLine(validatedData);
    res.json(line);
  } catch (error) {
    console.error('Error creating production line:', error);
    res.status(400).json({ error: 'Failed to create production line' });
  }
});

router.put('/production-lines/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingProductionLineSchema.partial().parse(req.body);
    const line = await storage.updateCuttingProductionLine(req.params.id, validatedData);
    res.json(line);
  } catch (error) {
    console.error('Error updating production line:', error);
    res.status(400).json({ error: 'Failed to update production line' });
  }
});

router.delete('/production-lines/:id', async (req, res) => {
  try {
    await storage.deleteCuttingProductionLine(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting production line:', error);
    res.status(500).json({ error: 'Failed to delete production line' });
  }
});

// Product Categories endpoints
router.get('/product-categories', async (req, res) => {
  try {
    const categories = await storage.getAllCuttingProductCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({ error: 'Failed to fetch product categories' });
  }
});

router.get('/product-categories/by-line/:lineId', async (req, res) => {
  try {
    const categories = await storage.getCuttingProductCategoriesByLine(req.params.lineId);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching product categories by line:', error);
    res.status(500).json({ error: 'Failed to fetch product categories' });
  }
});

router.post('/product-categories', async (req, res) => {
  try {
    const validatedData = insertCuttingProductCategorySchema.parse(req.body);
    const category = await storage.createCuttingProductCategory(validatedData);
    res.json(category);
  } catch (error) {
    console.error('Error creating product category:', error);
    res.status(400).json({ error: 'Failed to create product category' });
  }
});

router.put('/product-categories/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingProductCategorySchema.partial().parse(req.body);
    const category = await storage.updateCuttingProductCategory(req.params.id, validatedData);
    res.json(category);
  } catch (error) {
    console.error('Error updating product category:', error);
    res.status(400).json({ error: 'Failed to update product category' });
  }
});

router.delete('/product-categories/:id', async (req, res) => {
  try {
    await storage.deleteCuttingProductCategory(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting product category:', error);
    res.status(500).json({ error: 'Failed to delete product category' });
  }
});

// Components endpoints
router.get('/components', async (req, res) => {
  try {
    const components = await storage.getAllCuttingComponents();
    res.json(components);
  } catch (error) {
    console.error('Error fetching components:', error);
    res.status(500).json({ error: 'Failed to fetch components' });
  }
});

router.get('/components/by-category/:categoryId', async (req, res) => {
  try {
    const components = await storage.getCuttingComponentsByCategory(req.params.categoryId);
    res.json(components);
  } catch (error) {
    console.error('Error fetching components by category:', error);
    res.status(500).json({ error: 'Failed to fetch components' });
  }
});

router.post('/components', async (req, res) => {
  try {
    const validatedData = insertCuttingComponentSchema.parse(req.body);
    const component = await storage.createCuttingComponent(validatedData);
    res.json(component);
  } catch (error) {
    console.error('Error creating component:', error);
    res.status(400).json({ error: 'Failed to create component' });
  }
});

router.put('/components/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingComponentSchema.partial().parse(req.body);
    const component = await storage.updateCuttingComponent(req.params.id, validatedData);
    res.json(component);
  } catch (error) {
    console.error('Error updating component:', error);
    res.status(400).json({ error: 'Failed to update component' });
  }
});

router.delete('/components/:id', async (req, res) => {
  try {
    await storage.deleteCuttingComponent(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting component:', error);
    res.status(500).json({ error: 'Failed to delete component' });
  }
});

// Packet Compositions endpoints
router.get('/packet-compositions', async (req, res) => {
  try {
    const compositions = await storage.getAllPacketCompositions();
    res.json(compositions);
  } catch (error) {
    console.error('Error fetching packet compositions:', error);
    res.status(500).json({ error: 'Failed to fetch packet compositions' });
  }
});

// Packet Compositions - Get inventory items used in packet compositions
router.get('/packet-composition-items', async (req, res) => {
  try {
    const compositions = await storage.getAllPacketCompositions();
    
    // Filter to only compositions with inventory items and enrich with item and category details
    const itemCompositions = await Promise.all(
      compositions
        .filter((comp) => comp.inventoryItemId !== null)
        .map(async (comp) => {
          const item = await storage.getInventoryItem(comp.inventoryItemId!);
          const category = comp.productCategoryId ? await storage.getCuttingProductCategory(comp.productCategoryId) : null;
          return {
            compositionId: comp.id,
            inventoryItemId: comp.inventoryItemId,
            productCategoryId: comp.productCategoryId,
            quantityNeeded: comp.quantityNeeded,
            item: item ? {
              id: item.id,
              agPartNumber: item.agPartNumber,
              name: item.name, // Use name from Enhanced Inventory system
              description: item.name, // Keep description property for compatibility but use name
            } : null,
            category: category ? {
              id: category.id,
              categoryName: category.categoryName,
              productionLineId: category.productionLineId,
            } : null,
          };
        })
    );
    
    res.json(itemCompositions.filter((comp) => comp.item !== null));
  } catch (error) {
    console.error('Error fetching packet composition items:', error);
    res.status(500).json({ error: 'Failed to fetch packet composition items' });
  }
});

// Fabric Items - Get inventory items marked as fabrics (is_fabric = true)
// Max rows returned by these list endpoints. Bounds an otherwise-unbounded
// SELECT so a runaway dataset cannot exhaust memory and crash the server
// (root cause of task #178: full inventory_items scan via getAllInventoryItems).
const CUTTING_LIST_MAX_ROWS = 5000;

const inventoryActiveCondition = or(
  eq(inventoryItems.isActive, true),
  isNull(inventoryItems.isActive),
);

router.get('/fabric-items', async (req, res) => {
  try {
    const rows = await db
      .select({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.isFabric, true), inventoryActiveCondition))
      .orderBy(inventoryItems.name)
      .limit(CUTTING_LIST_MAX_ROWS);

    const fabricItems = rows.map((item) => ({
      id: item.id,
      agPartNumber: item.agPartNumber,
      name: item.name,
      fabric: item.name,
      sku: item.sku,
    }));

    res.json(fabricItems);
  } catch (error: any) {
    console.error('[cutting-table/fabric-items] DB error:', {
      route: '/api/cutting-table/fabric-items',
      message: error?.message,
      code: error?.code,
    });
    res.status(500).json({ error: 'Failed to fetch fabric items' });
  }
});

// Packet Items - Get inventory items marked as packets (is_packet = true)
router.get('/packet-items', async (req, res) => {
  try {
    const rows = await db
      .select({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.isPacket, true), inventoryActiveCondition))
      .orderBy(inventoryItems.name)
      .limit(CUTTING_LIST_MAX_ROWS);

    res.json(rows);
  } catch (error: any) {
    console.error('[cutting-table/packet-items] DB error:', {
      route: '/api/cutting-table/packet-items',
      message: error?.message,
      code: error?.code,
    });
    res.status(500).json({ error: 'Failed to fetch packet items' });
  }
});

// Packet Part Items - Get inventory items that can be components of a packet BOM
router.get('/packet-part-items', async (req, res) => {
  try {
    const manufacturedComponentCondition = and(
      or(
        eq(inventoryItems.itemType, 'MANUFACTURED'),
        ilike(inventoryItems.type, '%manufactur%')
      ),
      or(
        eq(inventoryItems.manufacturedCategory, 'COMPONENT'),
        eq(inventoryItems.manufacturingLevel, 'COMPONENT')
      )
    );

    const rows = await db
      .select({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
      })
      .from(inventoryItems)
      .where(and(or(eq(inventoryItems.isPacketPart, true), manufacturedComponentCondition), inventoryActiveCondition))
      .orderBy(inventoryItems.name)
      .limit(CUTTING_LIST_MAX_ROWS);

    res.json(rows);
  } catch (error: any) {
    console.error('[cutting-table/packet-part-items] DB error:', {
      route: '/api/cutting-table/packet-part-items',
      message: error?.message,
      code: error?.code,
    });
    res.status(500).json({ error: 'Failed to fetch packet part items' });
  }
});

// Packet Recipes - Get recipe (composition) for a specific category
router.get('/packet-recipes/:categoryId', async (req, res) => {
  try {
    const compositions = await storage.getPacketCompositionsByCategory(req.params.categoryId);
    
    // Enrich with component details
    const enrichedCompositions = await Promise.all(
      compositions.map(async (comp) => {
        const component = comp.componentId ? await storage.getCuttingComponent(comp.componentId) : null;
        return {
          ...comp,
          component,
        };
      })
    );
    
    res.json(enrichedCompositions);
  } catch (error) {
    console.error('Error fetching packet recipes:', error);
    res.status(500).json({ error: 'Failed to fetch packet recipes' });
  }
});

// Create packet composition
router.post('/packet-compositions', async (req, res) => {
  try {
    const validatedData = insertCuttingPacketCompositionSchema.parse(req.body);
    const composition = await storage.createPacketComposition(validatedData);
    res.json(composition);
  } catch (error) {
    console.error('Error creating packet composition:', error);
    res.status(400).json({ error: 'Failed to create packet composition' });
  }
});

// Delete packet composition
router.delete('/packet-compositions/:id', async (req, res) => {
  try {
    await storage.deletePacketComposition(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting packet composition:', error);
    res.status(500).json({ error: 'Failed to delete packet composition' });
  }
});

// Packet Sessions - Build packets with inventory consumption
router.post('/packet-sessions/build', async (req, res) => {
  try {
    const {
      productCategoryId,
      packetsCount,
      performedBy,
      notes,
    } = req.body;

    if (!productCategoryId || !packetsCount || packetsCount <= 0) {
      return res.status(400).json({ error: 'Product category and packets count required' });
    }

    // Get packet recipe (compositions)
    const compositions = await storage.getPacketCompositionsByCategory(productCategoryId);
    if (compositions.length === 0) {
      return res.status(400).json({ error: 'No recipe found for this product category' });
    }

    // Phase 1: Check for legacy components and verify inventory availability
    interface ItemConsumption {
      type: 'inventory_item';
      inventoryItemId: number;
      itemName: string;
      itemPartNumber: string;
      quantityNeeded: number;
      availableQty: number;
    }
    
    const itemConsumptions: ItemConsumption[] = [];
    
    // First pass: Check for ANY legacy components and block if found
    for (const comp of compositions) {
      if (comp.componentId && !comp.inventoryItemId) {
        return res.status(400).json({ 
          error: 'This recipe contains legacy component-based items. Please update the recipe:\n1. Go to Configure Recipes tab\n2. Select this packet type\n3. Click "Clear All" to remove old items\n4. Add new items using inventory parts with manufactured category set to "Packet"' 
        });
      }
    }
    
    // Second pass: Validate inventory availability
    for (const comp of compositions) {
      if (comp.inventoryItemId) {
        // Get inventory item details
        const inventoryItem = await storage.getInventoryItem(comp.inventoryItemId);
        if (!inventoryItem) {
          return res.status(400).json({ 
            error: `Inventory item not found for composition ${comp.id}` 
          });
        }

        const totalNeeded = comp.quantityNeeded * packetsCount;
        const availableQty = inventoryItem.available || inventoryItem.quantityInStock || 0;
        
        // Check if sufficient inventory
        if (availableQty < totalNeeded) {
          return res.status(400).json({ 
            error: `Insufficient inventory for ${inventoryItem.agPartNumber} - ${inventoryItem.name}. Need ${totalNeeded}, have ${availableQty}` 
          });
        }
        
        itemConsumptions.push({
          type: 'inventory_item',
          inventoryItemId: comp.inventoryItemId,
          itemName: inventoryItem.name,
          itemPartNumber: inventoryItem.agPartNumber,
          quantityNeeded: totalNeeded,
          availableQty,
        });
      }
    }

    // Phase 2: All checks passed, now perform atomic transaction
    // Store ORIGINAL values before ANY updates (handles duplicate items correctly)
    const originalInventoryValues = new Map<number, {
      available: number;
      onHand: number;
      quantityInStock: number;
    }>();
    
    const consumptionResults = [];
    let createdSession: any = null;

    try {
      // Step 1: Capture original values for ALL unique inventory items
      const uniqueItemIds = Array.from(new Set(itemConsumptions.map(c => c.inventoryItemId)));
      for (const itemId of uniqueItemIds) {
        const inventoryItem = await storage.getInventoryItem(itemId);
        if (!inventoryItem) {
          throw new Error(`Inventory item ${itemId} not found`);
        }
        originalInventoryValues.set(itemId, {
          available: inventoryItem.available || 0,
          onHand: inventoryItem.onHand || 0,
          quantityInStock: inventoryItem.quantityInStock || 0,
        });
      }

      // Step 2: Apply all inventory updates
      for (const consumption of itemConsumptions) {
        const inventoryItem = await storage.getInventoryItem(consumption.inventoryItemId);
        if (!inventoryItem) {
          throw new Error(`Inventory item ${consumption.inventoryItemId} disappeared during transaction`);
        }

        const oldAvailable = inventoryItem.available || 0;
        const newAvailable = Math.max(0, oldAvailable - consumption.quantityNeeded);
        const newOnHand = Math.max(0, (inventoryItem.onHand || 0) - consumption.quantityNeeded);
        const newQtyInStock = Math.max(0, (inventoryItem.quantityInStock || 0) - consumption.quantityNeeded);
        
        await storage.updateInventoryItem(consumption.inventoryItemId, {
          available: newAvailable,
          onHand: newOnHand,
          quantityInStock: newQtyInStock,
          lastUpdated: new Date(),
        });
        
        consumptionResults.push({
          inventoryItemId: consumption.inventoryItemId,
          itemName: consumption.itemName,
          itemPartNumber: consumption.itemPartNumber,
          quantityConsumed: consumption.quantityNeeded,
          oldBalance: oldAvailable,
          newBalance: newAvailable,
        });
      }

      // Step 3: Only create session AFTER all inventory updates succeed
      const transactionDetails = itemConsumptions.map(item => 
        `${item.itemPartNumber} - ${item.itemName}: ${item.quantityNeeded} units consumed`
      ).join('\n');
      
      const sessionNotes = notes 
        ? `${notes}\n\nInventory Consumption:\n${transactionDetails}`
        : `Inventory Consumption:\n${transactionDetails}`;

      createdSession = await storage.createCuttingPacketSession({
        productCategoryId,
        packetsTarget: packetsCount,
        createdBy: performedBy,
        notes: sessionNotes,
      });

      res.json({
        success: true,
        session: createdSession,
        consumptions: consumptionResults,
        message: `Successfully built ${packetsCount} packet(s)`,
      });
    } catch (transactionError) {
      console.error('Error during packet build transaction, rolling back:', transactionError);
      
      // Rollback: Restore ORIGINAL values (not intermediate values)
      for (const [itemId, originalValues] of Array.from(originalInventoryValues.entries())) {
        try {
          await storage.updateInventoryItem(itemId, originalValues);
        } catch (rollbackError) {
          console.error(`CRITICAL: Failed to rollback inventory item ${itemId}:`, rollbackError);
        }
      }
      
      // If session was created, try to delete it (best effort)
      if (createdSession) {
        try {
          // Note: Add deletePacketSession to storage if it doesn't exist
          // For now, log that manual cleanup may be needed
          console.error(`Session ${createdSession.id} may need manual cleanup`);
        } catch (cleanupError) {
          console.error('Failed to cleanup session:', cleanupError);
        }
      }
      
      throw new Error('Packet build failed, all changes rolled back');
    }
  } catch (error) {
    console.error('Error building packet session:', error);
    res.status(500).json({ error: 'Failed to build packet session' });
  }
});

// Weekly Data endpoints
router.get('/weekly-data', async (req, res) => {
  try {
    const data = await storage.getAllCuttingWeeklyData();
    res.json(data);
  } catch (error) {
    console.error('Error fetching weekly data:', error);
    res.status(500).json({ error: 'Failed to fetch weekly data' });
  }
});

router.get('/weekly-data/by-week/:weekDate', async (req, res) => {
  try {
    const data = await storage.getCuttingWeeklyDataByWeek(req.params.weekDate);
    res.json(data);
  } catch (error) {
    console.error('Error fetching weekly data by week:', error);
    res.status(500).json({ error: 'Failed to fetch weekly data' });
  }
});

router.post('/weekly-data', async (req, res) => {
  try {
    const validatedData = insertCuttingWeeklyDataSchema.parse(req.body);
    const weekData = await storage.createCuttingWeeklyData(validatedData);
    res.json(weekData);
  } catch (error) {
    console.error('Error creating weekly data:', error);
    res.status(400).json({ error: 'Failed to create weekly data' });
  }
});

router.put('/weekly-data/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingWeeklyDataSchema.partial().parse(req.body);
    const weekData = await storage.updateCuttingWeeklyData(req.params.id, validatedData);
    res.json(weekData);
  } catch (error) {
    console.error('Error updating weekly data:', error);
    res.status(400).json({ error: 'Failed to update weekly data' });
  }
});

router.delete('/weekly-data/:id', async (req, res) => {
  try {
    await storage.deleteCuttingWeeklyData(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting weekly data:', error);
    res.status(500).json({ error: 'Failed to delete weekly data' });
  }
});

// Cut Progress endpoints
router.get('/cut-progress', async (req, res) => {
  try {
    const progress = await storage.getAllCuttingCutProgress();
    res.json(progress);
  } catch (error) {
    console.error('Error fetching cut progress:', error);
    res.status(500).json({ error: 'Failed to fetch cut progress' });
  }
});

router.get('/cut-progress/by-week/:weekDate', async (req, res) => {
  try {
    const progress = await storage.getCuttingCutProgressByWeek(req.params.weekDate);
    res.json(progress);
  } catch (error) {
    console.error('Error fetching cut progress by week:', error);
    res.status(500).json({ error: 'Failed to fetch cut progress' });
  }
});

router.get('/cut-progress/by-day/:workDate', async (req, res) => {
  try {
    const progress = await storage.getCuttingCutProgressByDay(req.params.workDate);
    res.json(progress);
  } catch (error) {
    console.error('Error fetching cut progress by day:', error);
    res.status(500).json({ error: 'Failed to fetch cut progress' });
  }
});

router.post('/cut-progress', async (req, res) => {
  try {
    const validatedData = insertCuttingCutProgressSchema.parse(req.body);
    const progress = await storage.createCuttingCutProgress(validatedData);
    res.json(progress);
  } catch (error) {
    console.error('Error creating cut progress:', error);
    res.status(400).json({ error: 'Failed to create cut progress' });
  }
});

router.put('/cut-progress/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingCutProgressSchema.partial().parse(req.body);
    const progress = await storage.updateCuttingCutProgress(req.params.id, validatedData);
    res.json(progress);
  } catch (error) {
    console.error('Error updating cut progress:', error);
    res.status(400).json({ error: 'Failed to update cut progress' });
  }
});

router.delete('/cut-progress/:id', async (req, res) => {
  try {
    await storage.deleteCuttingCutProgress(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting cut progress:', error);
    res.status(500).json({ error: 'Failed to delete cut progress' });
  }
});

// Fabric Inventory endpoints
router.get('/fabric-inventory', async (req, res) => {
  try {
    const inventory = await storage.getAllCuttingFabricInventory();
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching fabric inventory:', error);
    res.status(500).json({ error: 'Failed to fetch fabric inventory' });
  }
});

router.get('/fabric-inventory/by-material/:materialId', async (req, res) => {
  try {
    const inventory = await storage.getCuttingFabricInventoryByMaterial(req.params.materialId);
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching fabric inventory by material:', error);
    res.status(500).json({ error: 'Failed to fetch fabric inventory' });
  }
});

router.get('/fabric-inventory-by-icn/:icn', async (req, res) => {
  try {
    const { icn } = req.params;
    const needle = icn.toLowerCase();
    const allInventory = await storage.getAllCuttingFabricInventory();

    const identifierFields = ['internalControlNumber', 'barcode', 'lotNumber', 'batchNumber', 'rollNumber'] as const;

    const matchesField = (item: any, exact: boolean) =>
      identifierFields.some(f => {
        const val = item[f];
        if (!val) return false;
        return exact
          ? val.toLowerCase() === needle
          : val.toLowerCase().includes(needle);
      });

    const exactMatch = allInventory.find(item => matchesField(item, true));
    if (exactMatch) {
      return res.json({ match: exactMatch, suggestions: [] });
    }

    const partialMatches = allInventory.filter(item => matchesField(item, false));
    if (partialMatches.length > 0) {
      return res.json({ match: null, suggestions: partialMatches.slice(0, 10) });
    }

    res.json({ match: null, suggestions: [] });
  } catch (error) {
    console.error('Error fetching fabric inventory by ICN:', error);
    res.status(500).json({ error: 'Failed to fetch fabric inventory by ICN' });
  }
});

// Look up fabric inventory by barcode
router.get('/fabric-inventory-by-barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    const allInventory = await storage.getAllCuttingFabricInventory();
    const inventory = allInventory.find(item => item.barcode === barcode);
    
    if (!inventory) {
      return res.status(404).json({ error: 'Fabric inventory not found for this barcode' });
    }
    
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching fabric inventory by barcode:', error);
    res.status(500).json({ error: 'Failed to fetch fabric inventory' });
  }
});

router.post('/fabric-inventory', async (req, res) => {
  try {
    const validatedData = insertCuttingFabricInventorySchema.parse(req.body);
    const fabricInventoryData = syncFabricStockFields(validatedData);
    
    if (!fabricInventoryData.barcode) {
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      
      let prefix = 'FAB';
      if (fabricInventoryData.productionLineId) {
        const line = await storage.getCuttingProductionLine(fabricInventoryData.productionLineId);
        if (line && line.lineName === 'P2') {
          prefix = 'FI-P2';
        }
      }
      
      fabricInventoryData.barcode = `${prefix}-${date}-${random}`;
    }
    
    if (!fabricInventoryData.internalControlNumber) {
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const seq = Date.now().toString().slice(-6);
      const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      fabricInventoryData.internalControlNumber = `ICN-${date}-${seq}-${rand}`;
    }
    
    const inventory = await storage.createCuttingFabricInventory(fabricInventoryData);
    res.json(inventory);
  } catch (error) {
    console.error('Error creating fabric inventory:', error);
    res.status(400).json({ error: 'Failed to create fabric inventory' });
  }
});

router.put('/fabric-inventory/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingFabricInventorySchema.partial().parse(req.body);
    const inventory = await storage.updateCuttingFabricInventory(req.params.id, syncFabricStockFields(validatedData));
    res.json(inventory);
  } catch (error) {
    console.error('Error updating fabric inventory:', error);
    res.status(400).json({ error: 'Failed to update fabric inventory' });
  }
});

router.patch('/fabric-inventory/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingFabricInventorySchema.partial().parse(req.body);
    const inventory = await storage.updateCuttingFabricInventory(req.params.id, syncFabricStockFields(validatedData));
    res.json(inventory);
  } catch (error) {
    console.error('Error updating fabric inventory:', error);
    res.status(400).json({ error: 'Failed to update fabric inventory' });
  }
});

router.delete('/fabric-inventory/:id', async (req, res) => {
  try {
    await storage.deleteCuttingFabricInventory(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting fabric inventory:', error);
    res.status(500).json({ error: 'Failed to delete fabric inventory' });
  }
});

router.post('/fabric-inventory/:id/deplete', async (req, res) => {
  try {
    const rollId = req.params.id;
    const depletedBy = (req as any).user?.username || 'unknown';
    
    const inventory = await storage.updateCuttingFabricInventory(rollId, {
      status: 'depleted',
      depletedAt: new Date(),
      depletedBy: depletedBy,
      quantityInStock: 0,
      squareMeters: '0',
    });

    await storage.createCuttingFabricInventoryTransaction({
      fabricInventoryId: rollId,
      changeType: 'ADJUSTMENT',
      quantityDelta: 0,
      performedBy: depletedBy,
      notes: 'Roll marked as depleted',
    });
    
    res.json({ 
      success: true, 
      message: 'Roll marked as depleted - traceability preserved',
      rollId,
      depletedBy,
      depletedAt: inventory?.depletedAt,
    });
  } catch (error) {
    console.error('Error depleting fabric roll:', error);
    res.status(500).json({ error: 'Failed to deplete fabric roll' });
  }
});

router.post('/fabric-inventory/:id/reactivate', async (req, res) => {
  try {
    const rollId = req.params.id;
    const { squareMeters } = req.body;
    const reactivatedBy = (req as any).user?.username || 'unknown';

    const updateData: any = {
      status: 'active',
      depletedAt: null,
      depletedBy: null,
    };
    if (squareMeters !== undefined && squareMeters !== null && squareMeters !== '') {
      const qty = parseFloat(squareMeters);
      if (!isNaN(qty) && qty >= 0) {
        updateData.squareMeters = String(qty);
        updateData.quantityInStock = qty;
      }
    }

    await storage.updateCuttingFabricInventory(rollId, updateData);

    await storage.createCuttingFabricInventoryTransaction({
      fabricInventoryId: rollId,
      changeType: 'ADJUSTMENT',
      quantityDelta: 0,
      performedBy: reactivatedBy,
      notes: 'Roll reactivated',
    });

    res.json({
      success: true,
      message: 'Roll reactivated successfully',
      rollId,
      reactivatedBy,
    });
  } catch (error) {
    console.error('Error reactivating fabric roll:', error);
    res.status(500).json({ error: 'Failed to reactivate fabric roll' });
  }
});

router.get('/fabric-inventory/:id/history', async (req, res) => {
  try {
    const rollId = req.params.id;
    const [roll, transactions] = await Promise.all([
      storage.getCuttingFabricInventory(rollId),
      storage.getCuttingFabricInventoryTransactionsByInventory(rollId),
    ]);

    if (!roll) {
      return res.status(404).json({ error: 'Fabric inventory roll not found' });
    }

    let history = [...transactions];

    // If the roll has depleted_by/depleted_at metadata but no matching ADJUSTMENT transaction,
    // inject a synthetic entry for historical records.
    if (roll.depletedBy && roll.depletedAt) {
      const hasDepletionTx = transactions.some(
        (t) => t.changeType === 'ADJUSTMENT' && t.notes?.toLowerCase().includes('depleted')
      );
      if (!hasDepletionTx) {
        const syntheticEntry: CuttingFabricInventoryTransaction = {
          id: `synthetic-depletion-${rollId}`,
          fabricInventoryId: rollId,
          sessionLotId: null,
          changeType: 'ADJUSTMENT',
          quantityDelta: 0,
          performedBy: roll.depletedBy,
          notes: 'Roll marked as depleted (historical record)',
          createdAt: roll.depletedAt,
          updatedAt: roll.depletedAt,
        };
        history.push(syntheticEntry);
      }
    }

    // Sort newest first
    history.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    res.json(history);
  } catch (error) {
    console.error('Error fetching fabric inventory history:', error);
    res.status(500).json({ error: 'Failed to fetch roll history' });
  }
});

router.post('/fabric-inventory/:id/assign-freezer', async (req, res) => {
  try {
    const rollId = req.params.id;
    const { freezerNumber } = req.body;
    
    if (!freezerNumber || isNaN(parseInt(freezerNumber))) {
      return res.status(400).json({ error: 'Valid freezer number is required' });
    }

    const existing = await storage.getCuttingFabricInventory(rollId);
    if (!existing) {
      return res.status(404).json({ error: 'Fabric inventory roll not found' });
    }
    if (existing.status === 'depleted') {
      return res.status(409).json({ error: 'Cannot assign freezer to a depleted roll' });
    }
    
    const inventory = await storage.updateCuttingFabricInventory(rollId, {
      freezerNumber: parseInt(freezerNumber),
      location: `Freezer ${freezerNumber}`,
    });
    
    res.json({ 
      success: true, 
      message: `Roll assigned to Freezer ${freezerNumber}`,
      rollId,
      freezerNumber: parseInt(freezerNumber),
    });
  } catch (error) {
    console.error('Error assigning freezer:', error);
    res.status(500).json({ error: 'Failed to assign freezer location' });
  }
});

router.post('/fabric-inventory/:id/receive', async (req, res) => {
  try {
    const rollId = req.params.id;
    const { freezerNumber, isP2 } = req.body;
    
    if (!freezerNumber || isNaN(parseInt(freezerNumber))) {
      return res.status(400).json({ error: 'Valid freezer number is required' });
    }

    const existing = await storage.getCuttingFabricInventory(rollId);
    if (!existing) {
      return res.status(404).json({ error: 'Fabric inventory roll not found' });
    }
    if (existing.status === 'depleted') {
      return res.status(409).json({ error: 'Cannot receive depleted fabric into a freezer' });
    }
    
    const updateData: any = {
      freezerNumber: parseInt(freezerNumber),
      location: `Freezer ${freezerNumber}`,
      receivedDate: new Date().toISOString().split('T')[0],
    };
    
    let generatedBarcode: string | null = null;
    
    if (isP2) {
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      generatedBarcode = `FI-P2-${date}-${random}`;
      updateData.barcode = generatedBarcode;
    }
    
    const inventory = await storage.updateCuttingFabricInventory(rollId, updateData);
    
    res.json({ 
      success: true, 
      message: isP2 ? `P2 item received with barcode: ${generatedBarcode}` : `Roll assigned to Freezer ${freezerNumber}`,
      rollId,
      freezerNumber: parseInt(freezerNumber),
      generatedBarcode,
    });
  } catch (error) {
    console.error('Error receiving fabric:', error);
    res.status(500).json({ error: 'Failed to receive fabric' });
  }
});

// Recommended Cuts endpoint - calculates cuts needed based on packet recipes and weekly goals
router.get('/recommended-cuts/:weekDate', async (req, res) => {
  try {
    const { weekDate } = req.params;
    
    // Calculate week end date (Sunday)
    const weekStart = new Date(weekDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Add 6 days to get Sunday
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    // Get all goals for this week
    const goals = await storage.getCuttingWeeklyDataByWeek(weekDate);
    
    if (goals.length === 0) {
      return res.json([]);
    }
    
    // Get all cut records for this week in one query
    const weekCuts = await db
      .select()
      .from(cuttingCutRecords)
      .where(and(
        gte(cuttingCutRecords.workDate, weekDate),
        lte(cuttingCutRecords.workDate, weekEndStr)
      ));
    
    // Calculate recommended cuts for each goal
    const recommendations = await Promise.all(goals.map(async (goal) => {
      if (!goal.productCategoryId) {
        return null;
      }
      
      // Get packet recipe/composition for this product category
      const compositions = await db
        .select()
        .from(cuttingPacketCompositions)
        .where(eq(cuttingPacketCompositions.productCategoryId, goal.productCategoryId));
      
      // Get category and line details
      const category = await storage.getCuttingProductCategory(goal.productCategoryId);
      const line = goal.productionLineId ? await storage.getCuttingProductionLine(goal.productionLineId) : null;
      
      // Calculate cuts needed for each component
      const componentCuts = await Promise.all(compositions.map(async (comp: any) => {
        const totalCutsNeeded = goal.quantity * comp.quantityNeeded;
        
        // Get inventory item details if available
        let itemName = 'Unknown Component';
        let partNumber = '';
        
        if (comp.inventoryItemId) {
          const item = await db
            .select()
            .from(inventoryItems)
            .where(eq(inventoryItems.id, comp.inventoryItemId))
            .limit(1);
          
          if (item[0]) {
            itemName = item[0].name;
            partNumber = item[0].agPartNumber;
          }
        } else if (comp.componentId) {
          const component = await storage.getCuttingComponent(comp.componentId);
          if (component) {
            itemName = component.componentName;
          }
        }
        
        // Filter cuts for this specific component by part number AND product category
        // This prevents cross-contamination between different goals with shared part numbers
        const completedCuts = weekCuts
          .filter(cut => {
            // REQUIRE category match to prevent cross-contamination
            // Skip cuts without a category tag
            if (!cut.productCategoryId || cut.productCategoryId !== goal.productCategoryId) {
              return false;
            }
            
            // If component has a part number, cut must match that part number
            if (partNumber && cut.partNumber !== partNumber) {
              return false;
            }
            
            // If component has NO part number but cut HAS a part number, skip it
            // (that cut belongs to a different component)
            if (!partNumber && cut.partNumber) {
              return false;
            }
            
            return true;
          })
          .reduce((sum: number, cut) => sum + (cut.piecesYielded || 0), 0);
        
        return {
          componentName: itemName,
          partNumber,
          quantityPerPacket: comp.quantityNeeded,
          totalCutsNeeded,
          completedCuts,
          remainingCuts: totalCutsNeeded - completedCuts,
        };
      }));
      
      return {
        goalId: goal.id,
        weekDate: goal.weekDate,
        productionLine: line?.lineName || 'N/A',
        productCategory: category?.categoryName || 'Unknown',
        packetsNeeded: goal.quantity,
        components: componentCuts,
      };
    }));
    
    const validRecommendations = recommendations.filter(r => r !== null);
    res.json(validRecommendations);
  } catch (error) {
    console.error('Error calculating recommended cuts:', error);
    res.status(500).json({ error: 'Failed to calculate recommended cuts' });
  }
});

// Production Progress endpoint - calculates remaining cuts needed to hit goals
router.get('/production-progress/:weekDate', async (req, res) => {
  try {
    const { weekDate } = req.params;
    
    // Get all goals for this week
    const goals = await storage.getCuttingWeeklyDataByWeek(weekDate);
    
    // Calculate progress for each goal
    const progress = await Promise.all(goals.map(async (goal) => {
      // Skip if no product category
      if (!goal.productCategoryId) {
        return null;
      }
      
      // Find all cut records for this week and product category
      const cuts = await db
        .select()
        .from(cuttingCutRecords)
        .where(and(
          gte(cuttingCutRecords.workDate, weekDate),
          eq(cuttingCutRecords.productCategoryId, goal.productCategoryId)
        ));
      
      // Sum up pieces yielded
      const totalCut = cuts.reduce((sum: number, cut) => sum + (cut.piecesYielded || 0), 0);
      const remaining = goal.quantity - totalCut;
      
      // Get category and line details
      const category = await storage.getCuttingProductCategory(goal.productCategoryId!);
      const line = goal.productionLineId ? await storage.getCuttingProductionLine(goal.productionLineId) : null;
      
      return {
        goalId: goal.id,
        weekDate: goal.weekDate,
        productionLine: line?.lineName || 'N/A',
        productCategory: category?.categoryName || 'Unknown',
        targetQuantity: goal.quantity,
        completedQuantity: totalCut,
        remainingQuantity: remaining,
        percentComplete: goal.quantity > 0 ? Math.round((totalCut / goal.quantity) * 100) : 0,
      };
    }));
    
    // Filter out null entries
    const validProgress = progress.filter(p => p !== null);
    
    res.json(validProgress);
  } catch (error) {
    console.error('Error calculating production progress:', error);
    res.status(500).json({ error: 'Failed to calculate production progress' });
  }
});

// Initialize seed data for production lines and categories
router.post('/initialize', async (req, res) => {
  try {
    // Create P1 production line
    const p1Line = await storage.createCuttingProductionLine({
      lineName: 'P1',
      lineNumber: 1,
      description: 'Production Line 1',
      isActive: true,
    });

    // Create P2 production line
    const p2Line = await storage.createCuttingProductionLine({
      lineName: 'P2',
      lineNumber: 2,
      description: 'Production Line 2',
      isActive: true,
    });

    // Create P1 categories
    const p1Categories = [
      { categoryName: 'Fiberglass Packets', displayOrder: 1 },
      { categoryName: 'Carbon Fiber Packets', displayOrder: 2 },
      { categoryName: 'Pillar Seams', displayOrder: 3 },
      { categoryName: 'Texture Stencils - Mesa Wrists', displayOrder: 4 },
      { categoryName: 'Texture Stencils - APR Wrist', displayOrder: 5 },
      { categoryName: 'Texture Stencils - AG Wrist', displayOrder: 6 },
      { categoryName: 'Texture Stencils - Small Forends', displayOrder: 7 },
      { categoryName: 'Texture Stencils - Long Forends', displayOrder: 8 },
    ];

    const createdP1Categories = [];
    for (const category of p1Categories) {
      const created = await storage.createCuttingProductCategory({
        productionLineId: p1Line.id,
        ...category,
      });
      createdP1Categories.push(created);
    }

    // Create P2 categories
    const p2Categories = [
      { categoryName: '12" Tube', displayOrder: 1 },
      { categoryName: '10" Tube', displayOrder: 2 },
      { categoryName: 'Antenna Cover', displayOrder: 3 },
      { categoryName: 'Vertical', displayOrder: 4 },
      { categoryName: 'Horizontal', displayOrder: 5 },
      { categoryName: 'Aileron', displayOrder: 6 },
      { categoryName: 'Rudder', displayOrder: 7 },
      { categoryName: 'Elevator', displayOrder: 8 },
    ];

    const createdP2Categories = [];
    for (const category of p2Categories) {
      const created = await storage.createCuttingProductCategory({
        productionLineId: p2Line.id,
        ...category,
      });
      createdP2Categories.push(created);
    }

    res.json({
      success: true,
      message: 'Cutting table initialized successfully',
      data: {
        productionLines: [p1Line, p2Line],
        p1Categories: createdP1Categories,
        p2Categories: createdP2Categories,
      },
    });
  } catch (error) {
    console.error('Error initializing cutting table:', error);
    res.status(500).json({ error: 'Failed to initialize cutting table' });
  }
});

// Generate barcode for fabric that doesn't have one
router.post('/fabric-inventory/:id/generate-barcode', async (req, res) => {
  try {
    const inventory = await storage.getCuttingFabricInventory(req.params.id);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    if (inventory.barcode) {
      return res.json({ success: true, barcode: inventory.barcode, message: 'Barcode already exists' });
    }

    // Generate unique barcode
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    
    let prefix = 'FAB';
    if (inventory.productionLineId) {
      const line = await storage.getCuttingProductionLine(inventory.productionLineId);
      if (line && line.lineName === 'P2') {
        prefix = 'FI-P2';
      }
    }
    
    const barcode = `${prefix}-${date}-${random}`;
    await storage.updateCuttingFabricInventory(req.params.id, { barcode });
    
    res.json({ success: true, barcode, message: 'Barcode generated successfully' });
  } catch (error) {
    console.error('Error generating barcode:', error);
    res.status(500).json({ error: 'Failed to generate barcode' });
  }
});

// Bulk generate barcodes for all fabrics without one
router.post('/fabric-inventory/generate-all-barcodes', async (req, res) => {
  try {
    const allInventory = await storage.getAllCuttingFabricInventory();
    const withoutBarcodes = allInventory.filter(item => !item.barcode);
    
    let generated = 0;
    for (const item of withoutBarcodes) {
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      
      let prefix = 'FAB';
      if (item.productionLineId) {
        const line = await storage.getCuttingProductionLine(item.productionLineId);
        if (line && line.lineName === 'P2') {
          prefix = 'FI-P2';
        }
      }
      
      const barcode = `${prefix}-${date}-${random}`;
      await storage.updateCuttingFabricInventory(item.id, { barcode });
      generated++;
    }
    
    res.json({ 
      success: true, 
      message: `Generated barcodes for ${generated} fabric items`,
      totalProcessed: generated,
      totalWithoutBarcodes: withoutBarcodes.length
    });
  } catch (error) {
    console.error('Error bulk generating barcodes:', error);
    res.status(500).json({ error: 'Failed to bulk generate barcodes' });
  }
});

// Print barcode label for fabric inventory
router.get('/fabric-inventory/:id/print-barcode', async (req, res) => {
  try {
    let inventory = await storage.getCuttingFabricInventory(req.params.id);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Auto-generate barcode if missing
    if (!inventory.barcode) {
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
      
      let prefix = 'FAB';
      if (inventory.productionLineId) {
        const line = await storage.getCuttingProductionLine(inventory.productionLineId);
        if (line && line.lineName === 'P2') {
          prefix = 'FI-P2';
        }
      }
      
      const barcode = `${prefix}-${date}-${random}`;
      inventory = await storage.updateCuttingFabricInventory(req.params.id, { barcode });
    }

    // Get production line info
    const line = inventory.productionLineId 
      ? await storage.getCuttingProductionLine(inventory.productionLineId)
      : null;

    // Generate printable HTML with barcode — 4x6 shipping label format
    const expFormatted = inventory.expirationDate
      ? new Date(inventory.expirationDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' })
      : null;
    const dateReceived = inventory.dateReceived
      ? new Date(inventory.dateReceived).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' })
      : null;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Fabric Label - ${inventory.barcode}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @media print {
      @page { size: 6in 4in; margin: 0; }
      html, body { width: 6in; height: 4in; }
      .no-print { display: none !important; }
      body { background: white; padding: 0; display: block; min-height: auto; }
      .label { border: none; box-shadow: none; }
    }
    body {
      font-family: Arial, sans-serif;
      background: #e8e8e8;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      gap: 14px;
    }
    .controls {
      display: flex;
      gap: 10px;
    }
    .btn {
      padding: 9px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
    }
    .btn-print { background: #1a56db; color: white; }
    .btn-print:hover { background: #1e40af; }
    .btn-close { background: #6b7280; color: white; }
    .btn-close:hover { background: #4b5563; }
    .label {
      background: white;
      border: 1px solid #ccc;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      width: 6in;
      height: 4in;
      padding: 0.2in 0.25in;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .label-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .company {
      font-size: 14px;
      font-weight: bold;
      color: #000;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .label-type {
      font-size: 11px;
      font-weight: bold;
      color: #000;
      text-transform: uppercase;
      background: #000;
      color: #fff;
      padding: 2px 8px;
      border-radius: 2px;
    }
    .fabric-name {
      font-size: 18px;
      font-weight: bold;
      color: #000;
      line-height: 1.2;
      margin-bottom: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .fields-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px 16px;
      margin-bottom: 6px;
    }
    .field {
      color: #000;
    }
    .field-label {
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
      line-height: 1.2;
    }
    .field-value {
      font-size: 13px;
      font-weight: bold;
      line-height: 1.3;
    }
    .barcode-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      margin-top: auto;
    }
    .barcode-section svg {
      width: 100%;
      max-width: 5in;
      height: auto;
    }
    .barcode-text {
      font-size: 11px;
      font-family: monospace;
      color: #000;
      letter-spacing: 2px;
      margin-top: 2px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="controls no-print">
    <button class="btn btn-print" onclick="window.print()">Print Label (4x6)</button>
    <button class="btn btn-close" onclick="window.close()">Close</button>
  </div>
  <div class="label">
    <div class="label-header">
      <div class="company">AG Composites</div>
      <div class="label-type">Fabric Roll${line ? ' - ' + line.lineName : ''}</div>
    </div>
    <div class="fabric-name">${inventory.fabric || inventory.fabricPartNumber || 'Fabric Roll'}</div>
    <div class="fields-grid">
      ${inventory.rollNumber ? `<div class="field"><div class="field-label">Roll #</div><div class="field-value">${inventory.rollNumber}</div></div>` : ''}
      ${inventory.lotNumber ? `<div class="field"><div class="field-label">Lot #</div><div class="field-value">${inventory.lotNumber}</div></div>` : ''}
      ${inventory.squareMeters ? `<div class="field"><div class="field-label">Qty (m\u00B2)</div><div class="field-value">${inventory.squareMeters}</div></div>` : ''}
      ${dateReceived ? `<div class="field"><div class="field-label">Received</div><div class="field-value">${dateReceived}</div></div>` : ''}
      ${expFormatted ? `<div class="field"><div class="field-label">Expires</div><div class="field-value">${expFormatted}</div></div>` : ''}
      ${inventory.source ? `<div class="field"><div class="field-label">Source</div><div class="field-value">${inventory.source}</div></div>` : ''}
    </div>
    <div class="barcode-section">
      <svg id="barcode"></svg>
      <div class="barcode-text">${inventory.barcode}</div>
    </div>
  </div>
  <script>
    JsBarcode("#barcode", "${inventory.barcode}", {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: false,
      margin: 0
    });
  <\/script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error generating barcode label:', error);
    res.status(500).json({ error: 'Failed to generate barcode label' });
  }
});

// Cut Records Routes
router.get('/cut-records', async (req, res) => {
  try {
    const records = await storage.getAllCuttingCutRecords();
    res.json(records);
  } catch (error) {
    console.error('Error fetching cut records:', error);
    res.status(500).json({ error: 'Failed to fetch cut records' });
  }
});

router.get('/cut-records/:id', async (req, res) => {
  try {
    const record = await storage.getCuttingCutRecord(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Cut record not found' });
    }
    res.json(record);
  } catch (error) {
    console.error('Error fetching cut record:', error);
    res.status(500).json({ error: 'Failed to fetch cut record' });
  }
});

router.get('/cut-records/by-date/:workDate', async (req, res) => {
  try {
    const records = await storage.getCuttingCutRecordsByDate(req.params.workDate);
    res.json(records);
  } catch (error) {
    console.error('Error fetching cut records by date:', error);
    res.status(500).json({ error: 'Failed to fetch cut records by date' });
  }
});

router.get('/cut-records/by-category/:categoryId', async (req, res) => {
  try {
    const records = await storage.getCuttingCutRecordsByCategory(req.params.categoryId);
    res.json(records);
  } catch (error) {
    console.error('Error fetching cut records by category:', error);
    res.status(500).json({ error: 'Failed to fetch cut records by category' });
  }
});

router.post('/cut-records', async (req, res) => {
  try {
    const validation = insertCuttingCutRecordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.message });
    }
    const record = await storage.createCuttingCutRecord(validation.data);
    res.status(201).json(record);
  } catch (error) {
    console.error('Error creating cut record:', error);
    res.status(500).json({ error: 'Failed to create cut record' });
  }
});

router.patch('/cut-records/:id', async (req, res) => {
  try {
    const record = await storage.updateCuttingCutRecord(req.params.id, req.body);
    res.json(record);
  } catch (error) {
    console.error('Error updating cut record:', error);
    res.status(500).json({ error: 'Failed to update cut record' });
  }
});

router.delete('/cut-records/:id', async (req, res) => {
  try {
    await storage.deleteCuttingCutRecord(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting cut record:', error);
    res.status(500).json({ error: 'Failed to delete cut record' });
  }
});

// Quick Production Entry - automatically generates cut records for all components in a packet
router.post('/quick-production-entry', async (req, res) => {
  try {
    const { workDate, productCategoryId, packetsProduced, fabricSquareMetersUsed, notes } = req.body;
    
    // Validate required fields
    if (!workDate || !productCategoryId || !packetsProduced || packetsProduced <= 0) {
      return res.status(400).json({ 
        error: 'Work date, product category, and packets produced (>0) are required' 
      });
    }
    
    // Get packet composition/recipe for this product category
    const compositions = await db
      .select()
      .from(cuttingPacketCompositions)
      .where(eq(cuttingPacketCompositions.productCategoryId, productCategoryId));
    
    if (compositions.length === 0) {
      return res.status(400).json({ 
        error: 'No recipe found for this packet type. Please create a recipe first in the Recipe Builder tab.' 
      });
    }
    
    // Get category details for naming
    const category = await storage.getCuttingProductCategory(productCategoryId);
    const categoryName = category?.categoryName || 'Unknown';
    
    // Create cut records for each component in the recipe
    const createdRecords = [];
    
    for (const comp of compositions) {
      const totalPiecesYielded = packetsProduced * comp.quantityNeeded;
      
      // Get inventory item details if available
      let partNumber = '';
      let itemDescription = '';
      let fabricType = '';
      
      if (comp.inventoryItemId) {
        const item = await db
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, comp.inventoryItemId))
          .limit(1);
        
        if (item[0]) {
          partNumber = item[0].agPartNumber || '';
          itemDescription = item[0].name || '';
          fabricType = item[0].category || '';
        }
      } else if (comp.componentId) {
        const component = await storage.getCuttingComponent(comp.componentId);
        if (component) {
          itemDescription = component.componentName;
          fabricType = component.fabricType || '';
        }
      }
      
      // Create cut record
      const cutRecordData = {
        workDate,
        productCategoryId,
        piecesYielded: totalPiecesYielded,
        fabricSquareMetersUsed: fabricSquareMetersUsed || '0',
        fabricType: fabricType || categoryName,
        partNumber: partNumber || null,
        itemDescription: itemDescription || `${categoryName} Component`,
        notes: notes || `Quick entry: ${packetsProduced} packets of ${categoryName}`,
      };
      
      const validation = insertCuttingCutRecordSchema.safeParse(cutRecordData);
      if (!validation.success) {
        console.error('Validation error for component:', validation.error);
        continue; // Skip this component but continue with others
      }
      
      const record = await storage.createCuttingCutRecord(validation.data);
      createdRecords.push(record);
    }
    
    res.status(201).json({
      success: true,
      message: `Created ${createdRecords.length} cut records for ${packetsProduced} packets of ${categoryName}`,
      recordsCreated: createdRecords.length,
      packetsProduced,
      categoryName,
      records: createdRecords,
    });
  } catch (error) {
    console.error('Error in quick production entry:', error);
    res.status(500).json({ error: 'Failed to create production entry' });
  }
});

// Stock Levels - Get current packet stock counts
router.get('/stock-levels', async (req, res) => {
  try {
    res.json(await getCuttingPacketStockLevels());
  } catch (error) {
    console.error('Error fetching stock levels:', error);
    res.status(500).json({ error: 'Failed to fetch stock levels' });
  }
});

// Print Fabric Label - Generate barcode for fabric inventory item
router.post('/print-fabric-label', async (req, res) => {
  try {
    const { fabricId, barcodeValue, fabricType, lotNumber, batchNumber, rollNumber } = req.body;
    
    const { generateBarcodeImage } = await import('../utils/barcodeGenerator');
    
    const barcodeImage = await generateBarcodeImage(barcodeValue || `FAB-${lotNumber || 'UNK'}-${fabricId}`, {
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 14,
      margin: 10,
    });
    
    res.json({
      success: true,
      barcodeImage,
      labelData: {
        fabricType,
        lotNumber,
        batchNumber,
        rollNumber,
        barcodeValue,
      },
    });
  } catch (error) {
    console.error('Error generating fabric label:', error);
    res.status(500).json({ error: 'Failed to generate label' });
  }
});

// Packet Sessions - Record packet building with fabric traceability (AS9100 compliant)
router.post('/packet-sessions', async (req, res) => {
  try {
    const { packetType, packetsBuilt, fabricTraceability, fabricLots, createdAt } = req.body;
    
    // Validate required fields
    if (!packetType) {
      return res.status(400).json({ error: 'Packet type is required' });
    }
    
    // Extract full traceability data for AS9100 compliance
    const traceabilityRecords = fabricTraceability || [];
    
    // Create packet session with full traceability chain
    const session = {
      id: `PS-${Date.now()}`,
      packetType,
      packetsBuilt: parseInt(packetsBuilt) || 1,
      createdAt: createdAt || new Date().toISOString(),
      status: 'completed',
      // Full traceability data for AS9100 compliance
      fabricTraceability: traceabilityRecords.map((fabric: any) => ({
        fabricId: fabric.fabricId,
        barcodeValue: fabric.barcodeValue,
        fabricType: fabric.fabricType,
        fabricPartNumber: fabric.fabricPartNumber,
        internalControlNumber: fabric.internalControlNumber,
        batchNumber: fabric.batchNumber,  // Batch/Lot # 
        rollNumber: fabric.rollNumber,
        lotNumber: fabric.lotNumber,
        supplierPartNumber: fabric.supplierPartNumber,
        expirationDate: fabric.expirationDate,
        scannedAt: fabric.scannedAt,
      })),
      // Backward compatibility - simple barcode list
      fabricLots: fabricLots || traceabilityRecords.map((f: any) => f.barcodeValue) || [],
    };
    
    // Log for audit trail (would be persisted in production)
    console.log(`[PACKET SESSION] Created ${session.id} with ${traceabilityRecords.length} fabric lot(s) for AS9100 traceability:`, 
      traceabilityRecords.map((f: any) => `${f.fabricType} - Batch: ${f.batchNumber || f.lotNumber} - Roll: ${f.rollNumber}`).join(', ')
    );
    
    res.status(201).json(session);
  } catch (error) {
    console.error('Error creating packet session:', error);
    res.status(500).json({ error: 'Failed to create packet session' });
  }
});

// Weekly Packet Needs - Calculate from P1 layup schedule
router.get('/weekly-packet-needs', async (req, res) => {
  try {
    // This would query the layup schedule to determine packet needs
    // For now, return sample data
    res.json({
      carbon_fiber: 45,
      fiberglass: 8,
    });
  } catch (error) {
    console.error('Error fetching weekly packet needs:', error);
    res.status(500).json({ error: 'Failed to fetch weekly packet needs' });
  }
});

// ========== Weekly Cutting Queue - Aggregates P1, P1 PO, and P2 demand ==========
router.get('/weekly-cutting-queue', async (req, res) => {
  try {
    const { weekStart, showAll } = req.query;
    const startDate = weekStart ? new Date(weekStart as string) : new Date();
    const endDate = new Date(startDate);
    
    // If showAll is true, extend to 90 days out to capture all pending work
    if (showAll === 'true') {
      endDate.setDate(endDate.getDate() + 90);
    } else {
      endDate.setDate(endDate.getDate() + 7);
    }

    // Get all packet BOMs for matching
    const boms = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.isActive, true));
    
    // Get manufacturing queue items for demand already scheduled
    const { manufacturingQueue } = await import('../../schema');
    let scheduledQuantities: Record<string, number> = {};
    try {
      const mfgQueueItems = await db.select().from(manufacturingQueue)
        .where(eq(manufacturingQueue.department, 'Cutting Table'));
      scheduledQuantities = mfgQueueItems.reduce((acc, item) => {
        try {
          const key = item.notes ? JSON.parse(item.notes)?.bomId : null;
          if (key) {
            acc[key] = (acc[key] || 0) + (item.quantityRequested - (item.quantityCompleted || 0));
          }
        } catch (e) {}
        return acc;
      }, {} as Record<string, number>);
    } catch (mfgErr) {
      console.log('Mfg queue query skipped:', mfgErr);
    }

    // Aggregate demand from multiple sources
    const queueItems: any[] = [];
    let cfInventoryUsed = 0;
    let fgInventoryUsed = 0;

    // Get on-hand stock levels from the same packet inventory source used by the stock-levels endpoint.
    const { pool } = await import('../../db');
    const stockLevels = await getCuttingPacketStockLevels();
    const cfOnHand = stockLevels.carbon_fiber;
    const fgOnHand = stockLevels.fiberglass;

    // 1. P1 Layup Schedule - Regular orders that need packets from inventory
    try {
      // If showAll, don't filter by date - get all pending layup items
      const layupScheduleResult = showAll === 'true' 
        ? await pool.query(`
            SELECT 
              ls.id,
              ls.order_id as "orderId",
              ls.stock_model as "stockModel",
              ls.scheduled_date as "scheduledDate",
              ls.material_type as "materialTypeRaw",
              COALESCE(ls.customer_name, c.name, 'Regular Order') as "customer",
              o.due_date as "dueDate",
              'P1' as source,
              'regular' as orderType
            FROM layup_schedule ls
            LEFT JOIN orders o ON ls.order_id = o.order_id
            LEFT JOIN customers c ON o.customer = c.name
            ORDER BY ls.scheduled_date DESC
            LIMIT 500
          `)
        : await pool.query(`
            SELECT 
              ls.id,
              ls.order_id as "orderId",
              ls.stock_model as "stockModel",
              ls.scheduled_date as "scheduledDate",
              ls.material_type as "materialTypeRaw",
              COALESCE(ls.customer_name, c.name, 'Regular Order') as "customer",
              o.due_date as "dueDate",
              'P1' as source,
              'regular' as orderType
            FROM layup_schedule ls
            LEFT JOIN orders o ON ls.order_id = o.order_id
            LEFT JOIN customers c ON o.customer = c.name
            WHERE ls.scheduled_date >= $1 AND ls.scheduled_date < $2
            ORDER BY ls.scheduled_date ASC
          `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

      const layupRows = Array.isArray(layupScheduleResult) ? layupScheduleResult : (layupScheduleResult as any).rows || [];
      for (const item of layupRows) {
        const materialType = item.stockModel?.toLowerCase().includes('cf_') ? 'carbon_fiber' : 
                            item.stockModel?.toLowerCase().includes('fg_') ? 'fiberglass' : 'unknown';
        
        // Check if we can use inventory or need new cut
        let usesInventory = false;
        let requiresNewCut = true;
        
        if (materialType === 'carbon_fiber' && cfInventoryUsed < cfOnHand) {
          usesInventory = true;
          requiresNewCut = false;
          cfInventoryUsed++;
        } else if (materialType === 'fiberglass' && fgInventoryUsed < fgOnHand) {
          usesInventory = true;
          requiresNewCut = false;
          fgInventoryUsed++;
        }
        
        queueItems.push({
          id: `p1-${item.id}`,
          orderId: item.orderId,
          stockModel: item.stockModel,
          source: 'P1',
          orderType: 'regular',
          materialType,
          scheduledDate: item.scheduledDate,
          dueDate: item.dueDate,
          customer: item.customer,
          priority: item.priority || 50,
          packetsNeeded: 1,
          usesInventory,
          requiresNewCut,
        });
      }
    } catch (err) {
      console.log('P1 layup schedule query skipped:', err);
    }

    // 2. P1 Purchase Order Items - Items that still need packets (remaining = quantity - order_count)
    try {
      const p1PoItemsResult = await pool.query(`
        SELECT 
          poi.id,
          po.po_number as "poNumber",
          po.customer_name as "customerName",
          poi.item_name as "itemName",
          poi.quantity,
          COALESCE(poi.order_count, 0) as "orderCount",
          poi.quantity - COALESCE(poi.order_count, 0) as "remaining",
          poi.due_date as "dueDate",
          poi.specifications
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.po_id = po.id
        WHERE po.status NOT IN ('COMPLETED', 'CANCELLED', 'SHIPPED')
          AND poi.quantity > COALESCE(poi.order_count, 0)
        ORDER BY poi.due_date ASC NULLS LAST
        LIMIT 500
      `);

      const p1PoRows = Array.isArray(p1PoItemsResult) ? p1PoItemsResult : (p1PoItemsResult as any).rows || [];
      for (const item of p1PoRows) {
        // Parse specifications JSON to get material type
        let specs: any = {};
        try {
          specs = typeof item.specifications === 'string' 
            ? JSON.parse(item.specifications) 
            : (item.specifications || {});
        } catch (e) {
          specs = {};
        }
        
        // Get material from specifications.material field (e.g., "carbon_fiber", "fiberglass")
        const specMaterial = (specs.material || '').toLowerCase();
        const stockModelName = specs.stockModel || specs.stock_model || '';
        
        // Determine material type from specs.material first, then fall back to stock model name
        let materialType = 'unknown';
        if (specMaterial === 'carbon_fiber' || specMaterial === 'carbon' || specMaterial === 'cf') {
          materialType = 'carbon_fiber';
        } else if (specMaterial === 'fiberglass' || specMaterial === 'fg') {
          materialType = 'fiberglass';
        } else if (specMaterial === 'mesa' || stockModelName.toLowerCase().includes('mesa')) {
          materialType = 'mesa';
        } else if (stockModelName.toLowerCase().includes('cf_') || stockModelName.toLowerCase().includes('cf ')) {
          materialType = 'carbon_fiber';
        } else if (stockModelName.toLowerCase().includes('fg_') || stockModelName.toLowerCase().includes('fg ')) {
          materialType = 'fiberglass';
        }
        
        // Add items based on remaining quantity (items that still need packets)
        const remaining = item.remaining || 0;
        if (remaining > 0) {
          queueItems.push({
            id: `p1po-${item.id}`,
            orderId: item.poNumber,
            stockModel: stockModelName || item.itemName || `PO Item ${item.id}`,
            source: 'P1_PO',
            orderType: 'p1_po',
            materialType,
            scheduledDate: item.dueDate,
            dueDate: item.dueDate,
            customer: item.customerName,
            priority: 50,
            packetsNeeded: remaining,
            usesInventory: false,
            requiresNewCut: true,
            specifications: specs,
          });
        }
      }
    } catch (err) {
      console.log('P1 PO items query skipped:', err);
    }

    // 3. Regular Production Queue - Orders from order entry (all_orders table) that need packets
    try {
      const regularQueueResult = await pool.query(`
        SELECT 
          o.order_id as "orderId",
          o.model_id as "stockModel",
          o.due_date as "dueDate",
          o.customer_id as "customerId",
          c.name as "customerName",
          o.features
        FROM all_orders o
        LEFT JOIN customers c ON CAST(o.customer_id AS INTEGER) = c.id
        WHERE o.current_department = 'P1 Production Queue'
          AND o.status IN ('FINALIZED', 'Active', 'IN_PROGRESS')
          AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
          AND o.model_id IS NOT NULL 
          AND o.model_id != '' 
          AND o.model_id != 'None'
          AND LOWER(o.model_id) != 'no stock'
          AND LOWER(o.model_id) != 'no_stock'
        ORDER BY o.due_date ASC
        LIMIT 500
      `);

      const regularRows = Array.isArray(regularQueueResult) ? regularQueueResult : (regularQueueResult as any).rows || [];
      for (const item of regularRows) {
        // Parse features JSON to get material type
        let features: any = {};
        try {
          features = typeof item.features === 'string' 
            ? JSON.parse(item.features) 
            : (item.features || {});
        } catch (e) {
          features = {};
        }
        
        const stockModelName = item.stockModel || '';
        
        // Determine material type from stock model name prefix
        let materialType = 'unknown';
        const stockLower = stockModelName.toLowerCase();
        if (stockLower.includes('mesa')) {
          materialType = 'mesa';
        } else if (stockLower.startsWith('cf_') || stockLower.startsWith('cf-') || stockLower.includes('carbon')) {
          materialType = 'carbon_fiber';
        } else if (stockLower.startsWith('fg_') || stockLower.startsWith('fg-') || stockLower.includes('fiberglass')) {
          materialType = 'fiberglass';
        }
        
        queueItems.push({
          id: `p1reg-${item.orderId}`,
          orderId: item.orderId,
          stockModel: stockModelName,
          source: 'P1',
          orderType: 'regular',
          materialType,
          scheduledDate: item.dueDate,
          dueDate: item.dueDate,
          customer: item.customerName || item.customerId,
          priority: 50,
          packetsNeeded: 1,
          usesInventory: false,
          requiresNewCut: true,
          specifications: features,
        });
      }
    } catch (err) {
      console.log('Regular production queue query skipped:', err);
    }

    const applyP1PacketInventory = (materialType: 'carbon_fiber' | 'fiberglass' | 'mesa' | 'cheek_riser', onHand: number) => {
      let remainingOnHand = Math.max(0, Number(onHand) || 0);
      for (const item of queueItems) {
        if (item.materialType !== materialType) continue;
        if (item.source !== 'P1' && item.source !== 'P1_PO') continue;

        const packetsNeeded = Math.max(0, Number(item.packetsNeeded) || 0);
        const inventoryApplied = Math.min(remainingOnHand, packetsNeeded);
        remainingOnHand -= inventoryApplied;

        item.inventoryApplied = inventoryApplied;
        item.packetsToCut = Math.max(0, packetsNeeded - inventoryApplied);
        item.usesInventory = inventoryApplied > 0;
        item.requiresNewCut = item.packetsToCut > 0;
      }
    };

    applyP1PacketInventory('carbon_fiber', cfOnHand);
    applyP1PacketInventory('fiberglass', fgOnHand);
    applyP1PacketInventory('mesa', stockLevels.mesa);
    applyP1PacketInventory('cheek_riser', stockLevels.cheek_riser);

    // 4. P2 PO Items - Purchase order items with BOMs requiring cutting (packets only)
    try {
      const p2CountResult = await pool.query(`
        SELECT COUNT(*) as total,
          COUNT(*) FILTER (WHERE department = 'Cutting Table') as cutting_dept,
          COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress', 'queued', 'PENDING')) as active_status
        FROM p2_production_orders
      `);
      const p2Counts = (p2CountResult as any).rows?.[0] || p2CountResult?.[0];
      console.log('📊 P2 production orders diagnostic:', JSON.stringify(p2Counts));
      // Query P2 production orders table - only items that are actual packets
      // Packet identification: is_packet flag, matching cutting_packet_bom, 'packet' keyword in name/sku, or specific SKUs (P706, P707)
      // Match inventory by sku (AG part number) first, then fall back to part_name matching
      const p2Query = `
            SELECT DISTINCT ON (po.id)
              po.id,
              po.p2_po_id as "poId",
              po.part_name as "itemName",
              po.sku,
              po.quantity,
              po.due_date as "dueDate",
              po.order_id as "poNumber",
              po.priority,
              po.status,
              po.department as "department",
              COALESCE(p2.customer_name, 'P2 Order') as "customer",
              'P2' as source,
              COALESCE(inv.is_packet, false) as "isPacket",
              bom.id as "matchedBomId",
              po.quantity as "originalQuantity",
              COALESCE(p2_units.serialized_count, 0) as "serializedQuantity",
              COALESCE(committed_packets.committed_count, 0) as "committedQuantity",
              CASE
                WHEN COALESCE(committed_packets.committed_count, 0) > 0
                  AND COALESCE(NULLIF(p2_units.serialized_count, 0), po.quantity) > COALESCE(committed_packets.committed_count, 0)
                THEN GREATEST(
                  COALESCE(NULLIF(p2_units.serialized_count, 0), po.quantity)
                    - COALESCE(committed_packets.committed_count, 0),
                  0
                )
                ELSE po.quantity
              END as "openQuantity"
            FROM p2_production_orders po
            LEFT JOIN p2_purchase_orders p2 ON po.p2_po_id = p2.id
            LEFT JOIN inventory_items inv ON (
              inv.ag_part_number = po.sku OR
              LOWER(inv.ag_part_number) = LOWER(po.sku) OR
              LOWER(inv.name) = LOWER(po.part_name) OR 
              inv.ag_part_number = po.part_name OR
              LOWER(inv.ag_part_number) = LOWER(po.part_name)
            )
            LEFT JOIN cutting_packet_boms bom ON (
              bom.is_active = true AND (
                bom.part_number = po.sku OR
                bom.part_number = po.part_name OR 
                LOWER(bom.packet_type) = LOWER(po.part_name) OR
                LOWER(bom.part_number) = LOWER(po.part_name) OR
                LOWER(bom.packet_type) LIKE '%' || LOWER(po.part_name) || '%' OR
                LOWER(po.part_name) LIKE '%' || LOWER(bom.packet_type) || '%'
              )
            )
            LEFT JOIN LATERAL (
              SELECT COUNT(*)::int as serialized_count
              FROM p2_serialized_items si
              WHERE si.po_item_id = po.p2_po_item_id
                AND UPPER(COALESCE(si.status, 'ACTIVE')) NOT IN ('SCRAPPED', 'CANCELLED')
            ) p2_units ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(DISTINCT si.id)::int as committed_count
              FROM p2_serialized_items si
              JOIN cutting_built_packets cbp ON (
                cbp.allocated_to_order IS NOT NULL
                AND TRIM(cbp.allocated_to_order) <> ''
                AND LOWER(TRIM(cbp.allocated_to_order)) IN (
                  LOWER(TRIM(si.id::text)),
                  LOWER(TRIM(si.barcode)),
                  LOWER(TRIM(si.serial_number)),
                  LOWER(TRIM(COALESCE(si.traveler_barcode, '')))
                )
              )
              WHERE si.po_item_id = po.p2_po_item_id
                AND UPPER(COALESCE(si.status, 'ACTIVE')) NOT IN ('SCRAPPED', 'CANCELLED')
                AND (
                  (bom.product_category_id IS NOT NULL AND cbp.product_category_id = bom.product_category_id)
                  OR (
                    cbp.product_category_id IS NOT NULL
                    AND EXISTS (
                      SELECT 1
                      FROM cutting_product_categories cpc
                      WHERE cpc.id = cbp.product_category_id
                        AND (
                          LOWER(cpc.category_name) = LOWER(COALESCE(inv.name, ''))
                          OR LOWER(cpc.category_name) = LOWER(COALESCE(po.part_name, ''))
                          OR LOWER(cpc.category_name) = LOWER(COALESCE(bom.packet_type, ''))
                          OR LOWER(cpc.category_name) = LOWER(COALESCE(bom.part_number, ''))
                        )
                    )
                  )
                )
            ) committed_packets ON true
            WHERE po.status IN ('pending', 'in_progress', 'queued', 'PENDING')
              AND (
                inv.is_packet = true
                OR bom.id IS NOT NULL
                OR LOWER(po.part_name) LIKE '%packet%'
                OR LOWER(po.sku) LIKE '%packet%'
                OR po.sku IN ('P706', 'P707')
              )`;
      
      const p2Result = showAll === 'true'
        ? await pool.query(p2Query + `
            ORDER BY po.id, po.due_date ASC NULLS LAST
            LIMIT 2000
          `)
        : await pool.query(p2Query + `
              AND po.due_date >= $1 AND po.due_date < $2
            ORDER BY po.id, po.due_date ASC
          `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

      const p2Rows = Array.isArray(p2Result) ? p2Result : (p2Result as any).rows || [];
      const p2MaterialCache: Record<string, string> = {};
      for (const item of p2Rows) {
        const matchingBomId = item.matchedBomId;
        const matchingBom = matchingBomId ? boms.find(b => b.id === matchingBomId) : 
          boms.find(b => 
            b.partNumber === item.itemName || 
            b.packetType?.toLowerCase() === item.itemName?.toLowerCase() ||
            b.partNumber?.toLowerCase().includes(item.itemName?.toLowerCase() || '')
          );
        
        let materialType = 'unknown';
        
        if (matchingBom) {
          const materials = await db.select().from(cuttingPacketBOMMaterials)
            .where(eq(cuttingPacketBOMMaterials.packetBomId, matchingBom.id));
          const primaryMaterial = materials[0];
          if (primaryMaterial?.fabricType) {
            materialType = primaryMaterial.fabricType.toLowerCase().includes('carbon') ? 'carbon_fiber' : 
                          primaryMaterial.fabricType.toLowerCase().includes('fiber') ? 'fiberglass' : 'unknown';
          }
        }
        
        if (materialType === 'unknown') {
          const itemNameLower = (item.itemName || '').toLowerCase();
          materialType = itemNameLower.includes('cf') || itemNameLower.includes('carbon') ? 'carbon_fiber' :
                        itemNameLower.includes('fg') || itemNameLower.includes('fiber') ? 'fiberglass' : 'unknown';
        }
        
        if (materialType === 'unknown') {
          const sku = item.sku || '';
          if (p2MaterialCache[sku]) {
            materialType = p2MaterialCache[sku];
          } else {
            try {
              const childNames = await pool.query(`
                SELECT ii.name
                FROM bom_lines bl
                JOIN bom_revisions br ON bl.revision_id = br.id
                JOIN boms b ON br.bom_id = b.id
                JOIN inventory_items ii ON ii.ag_part_number = bl.child_part_ag_number
                WHERE b.parent_part_ag_number = $1
                UNION
                SELECT ii2.name
                FROM bom_lines bl1
                JOIN bom_revisions br1 ON bl1.revision_id = br1.id
                JOIN boms b1 ON br1.bom_id = b1.id
                JOIN boms b2 ON b2.parent_part_ag_number = bl1.child_part_ag_number AND b2.is_active = true
                JOIN bom_revisions br2 ON br2.bom_id = b2.id
                JOIN bom_lines bl2 ON bl2.revision_id = br2.id
                JOIN inventory_items ii2 ON ii2.ag_part_number = bl2.child_part_ag_number
                WHERE b1.parent_part_ag_number = $1
                LIMIT 40
              `, [sku]);
              const childRows = (childNames as any).rows || childNames || [];
              const allNames = childRows.map((r: any) => (r.name || '').toLowerCase()).join(' ');
              if (allNames.includes('carbon') || allNames.includes('cf ') || allNames.includes('twill')) {
                materialType = 'carbon_fiber';
              } else if (allNames.includes('fiberglass') || allNames.includes('fg ')) {
                materialType = 'fiberglass';
              }
              p2MaterialCache[sku] = materialType;
            } catch (e) {
            }
          }
        }
        
        queueItems.push({
          id: `p2-${item.id}`,
          orderId: item.poNumber ? `PO-${item.poNumber}-${item.id}` : `P2-${item.id}`,
          stockModel: item.itemName,
          sku: item.sku,
          source: 'P2',
          orderType: 'p2_po',
          materialType,
          scheduledDate: item.dueDate,
          dueDate: item.dueDate,
          customer: item.customer,
          priority: 60,
          packetsNeeded: item.openQuantity || item.quantity || 1,
          originalQuantity: item.originalQuantity || item.quantity || 1,
          serializedQuantity: item.serializedQuantity || 0,
          committedQuantity: item.committedQuantity || 0,
          usesInventory: false,
          requiresNewCut: true,
          bomId: matchingBom?.id,
          isPacket: item.isPacket === true,
          packetBomId: matchingBom?.id,
        });
      }
      console.log(`✅ P2 demand: found ${p2Rows.length} rows, pushed to queue (total now: ${queueItems.length})`);
    } catch (err: any) {
      console.error('❌ P2 production queue query FAILED:', err?.message || err);
      console.error('P2 query error details:', JSON.stringify({ code: err?.code, detail: err?.detail, hint: err?.hint }));
    }

    const p2ItemCount = queueItems.filter(i => i.orderType === 'p2_po').length;

    // Calculate totals reconciled with inventory
    const quantityForDemand = (item: any) => item.source === 'P1' || item.source === 'P1_PO'
      ? Math.max(0, Number(item.packetsToCut ?? item.packetsNeeded ?? 1))
      : Math.max(0, Number(item.packetsNeeded ?? 1));

    const cfTotal = queueItems.filter(i => i.materialType === 'carbon_fiber').reduce((sum, i) => sum + quantityForDemand(i), 0);
    const fgTotal = queueItems.filter(i => i.materialType === 'fiberglass').reduce((sum, i) => sum + quantityForDemand(i), 0);
    const cfFromInventory = queueItems.filter(i => i.materialType === 'carbon_fiber').reduce((sum, i) => sum + (Number(i.inventoryApplied) || 0), 0);
    const fgFromInventory = queueItems.filter(i => i.materialType === 'fiberglass').reduce((sum, i) => sum + (Number(i.inventoryApplied) || 0), 0);

    const summary = {
      carbon_fiber: {
        regular: queueItems.filter(i => i.materialType === 'carbon_fiber' && i.orderType === 'regular').reduce((sum, i) => sum + quantityForDemand(i), 0),
        oem: queueItems.filter(i => i.materialType === 'carbon_fiber' && (i.orderType === 'oem' || i.orderType === 'p1_po')).reduce((sum, i) => sum + quantityForDemand(i), 0),
        p2: queueItems.filter(i => i.materialType === 'carbon_fiber' && i.orderType === 'p2_po').reduce((sum, i) => sum + (i.packetsNeeded || 1), 0),
        total: cfTotal,
        fromInventory: cfFromInventory,
        needsCutting: cfTotal,
        onHand: cfOnHand,
      },
      fiberglass: {
        regular: queueItems.filter(i => i.materialType === 'fiberglass' && i.orderType === 'regular').reduce((sum, i) => sum + quantityForDemand(i), 0),
        oem: queueItems.filter(i => i.materialType === 'fiberglass' && (i.orderType === 'oem' || i.orderType === 'p1_po')).reduce((sum, i) => sum + quantityForDemand(i), 0),
        p2: queueItems.filter(i => i.materialType === 'fiberglass' && i.orderType === 'p2_po').reduce((sum, i) => sum + (i.packetsNeeded || 1), 0),
        total: fgTotal,
        fromInventory: fgFromInventory,
        needsCutting: fgTotal,
        onHand: fgOnHand,
      },
      weekStart: startDate.toISOString().split('T')[0],
      weekEnd: endDate.toISOString().split('T')[0],
      scheduledInQueue: Object.values(scheduledQuantities).reduce((a, b) => a + b, 0),
    };

    res.json({
      items: queueItems.sort((a, b) => {
        const customerA = (a.customer || '').toString().toLowerCase();
        const customerB = (b.customer || '').toString().toLowerCase();
        return customerA.localeCompare(customerB);
      }),
      summary,
      totalItems: queueItems.length,
      _debug: {
        p2Count: p2ItemCount,
        totalQueueItems: queueItems.length,
        sourceBreakdown: {
          p1: queueItems.filter(i => i.source === 'P1').length,
          p1po: queueItems.filter(i => i.source === 'P1_PO').length,
          p2: p2ItemCount,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching weekly cutting queue:', error);
    res.status(500).json({ error: 'Failed to fetch weekly cutting queue' });
  }
});

// Schedule packet to cutting queue
router.post('/schedule-to-cutting', async (req, res) => {
  try {
    const { orderId, bomId, quantity, priority, dueDate, source, materialType, packetName: requestedPacketName, notes } = req.body;

    if (!quantity) {
      return res.status(400).json({ error: 'Quantity is required' });
    }

    // For P2 items, allow scheduling without a valid BOM
    let validBomId = bomId;
    if (bomId && bomId !== 'generic-p2-packet') {
      const [bom] = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.id, bomId));
      if (!bom) {
        // If BOM not found and not P2 source, try to find by material type
        if (source !== 'P2') {
          validBomId = null; // Will try to find by material type below
        } else {
          validBomId = null; // Allow P2 without BOM
        }
      }
    } else if (bomId === 'generic-p2-packet') {
      validBomId = null; // P2 generic packet
    }

    // If no BOM ID provided or not found, try to find one by material type/packet type
    if (!validBomId && materialType) {
      const packetTypeName = materialType === 'carbon_fiber' ? 'Carbon Fiber Packet' :
                             materialType === 'fiberglass' ? 'Fiberglass Packet' :
                             materialType === 'mesa' ? 'Mesa Packet' :
                             materialType === 'cheek_riser' ? 'Cheek Riser' :
                             materialType === 'p2_disruptor' ? 'Disruptor' :
                             materialType === 'p2_disruptor_packet' ? 'Disruptor' :
                             materialType === 'p2_antenna' ? 'Antenna Cover' :
                             materialType === 'p2_antenna_cover' ? 'Antenna Cover' :
                             materialType === 'p2_carbon_fiber_packet' ? 'Carbon Fiber Packet' :
                             materialType === 'p2_fiberglass_packet' ? 'Fiberglass Packet' :
                             materialType === 'p2_mesa_packet' ? 'Mesa Packet' : null;

      if (packetTypeName) {
        const [matchingBom] = await db.select()
          .from(cuttingPacketBOMs)
          .where(and(
            ilike(cuttingPacketBOMs.packetType, `%${packetTypeName}%`),
            eq(cuttingPacketBOMs.isActive, true)
          ))
          .limit(1);

        if (matchingBom) {
          validBomId = matchingBom.id;
          console.log(`Auto-matched BOM ${validBomId} for material type ${materialType}`);
        }
      }
    }

    const packetName = requestedPacketName || (
                       materialType === 'carbon_fiber' ? 'Carbon Fiber Packet' :
                       materialType === 'fiberglass' ? 'Fiberglass Packet' :
                       materialType === 'mesa' ? 'Mesa Packet' :
                       materialType === 'cheek_riser' ? 'Cheek Riser' :
                       materialType === 'p2_disruptor' ? 'Disruptor Packet' :
                       materialType === 'p2_disruptor_packet' ? 'Disruptor Packet' :
                       materialType === 'p2_antenna' ? 'Antenna Cover Packet' :
                       materialType === 'p2_antenna_cover' ? 'Antenna Cover Packet' : 'Stock Packet');

    const poNumber = req.body.poNumber;

    // Detect P2 packet scheduling (per-PO Schedule button or source=P2). These paths
    // route through the shared upsert helper so all contributing POs collapse into a
    // single grouped manufacturing_queue row per packet type per due-date bucket.
    const isP2PacketSchedule = source === 'P2'
      || (typeof materialType === 'string' && materialType.startsWith('p2_'));

    if (isP2PacketSchedule) {
      const { upsertGroupedCuttingQueueEntry } = await import('../utils/cuttingQueueGroupingHelper');

      // Try to extract a p2PoItemId from orderId so re-runs of the same PO line
      // dedupe cleanly inside notes.poNumbers. orderId format is either
      // "PO-{poNumber}-{id}" or "P2-{id}" — the trailing segment is the
      // p2_production_orders.id, NOT the p2_po_items.id, so we leave
      // p2PoItemId null and dedupe by poNumber.
      const items = [{
        poNumber: poNumber ? String(poNumber) : (orderId ? String(orderId) : `MANUAL-${Date.now()}`),
        quantity,
        p2PoItemId: null as number | null,
        p2PoId: null as number | null,
      }];

      const result = await upsertGroupedCuttingQueueEntry({
        packetName,
        materialType: materialType || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        items,
        source: source === 'P2' ? 'P2' : 'MANUAL',
        userNotes: notes || null,
        bomId: validBomId,
        priority: priority || 50,
      });

      if (!result) {
        return res.status(500).json({ error: 'Failed to schedule to cutting queue' });
      }

      // For P2 source, update the source production order status so it no longer appears as open demand.
      // Guarded by `result.addedQuantity > 0` so an idempotent re-run (helper detected a
      // duplicate poNumber and added zero quantity) does NOT subtract again from the
      // source order — that would otherwise drift the open-demand count below zero.
      if (source === 'P2' && orderId && result.addedQuantity > 0) {
        try {
          const { pool } = await import('../../db');
          const idParts = String(orderId).split('-');
          const p2OrderId = parseInt(idParts[idParts.length - 1], 10);
          if (!isNaN(p2OrderId)) {
            const orderRows = await pool.query(
              `SELECT id, quantity FROM p2_production_orders WHERE id = $1`,
              [p2OrderId]
            );
            const orderRow = (orderRows as any).rows?.[0] || (orderRows as any[])[0];
            if (orderRow) {
              const remaining = (orderRow.quantity || 0) - quantity;
              if (remaining <= 0) {
                await pool.query(
                  `UPDATE p2_production_orders SET status = 'scheduled', updated_at = NOW() WHERE id = $1`,
                  [p2OrderId]
                );
                console.log(`✅ P2 production order ${p2OrderId} fully scheduled — status → scheduled`);
              } else {
                await pool.query(
                  `UPDATE p2_production_orders SET quantity = $1, updated_at = NOW() WHERE id = $2`,
                  [remaining, p2OrderId]
                );
                console.log(`✅ P2 production order ${p2OrderId} partially scheduled — remaining quantity: ${remaining}`);
              }
            }
          }
        } catch (p2UpdateErr: any) {
          console.warn('⚠️ Could not update P2 production order status after scheduling:', p2UpdateErr.message);
        }
      }

      if (result.created) {
        console.log(`✅ Per-PO scheduled ${quantity} "${packetName}" packets — created new grouped queue entry ${result.queueItem.id}`);
      } else {
        console.log(`✅ Per-PO scheduled ${result.addedQuantity} "${packetName}" packets (${result.duplicateCount} dup skipped) — merged into existing grouped queue entry ${result.queueItem.id}`);
      }

      let parsedNotes: Record<string, unknown> = {};
      try { parsedNotes = result.queueItem.notes ? JSON.parse(result.queueItem.notes) : {}; } catch {}

      return res.status(201).json({
        ...result.queueItem,
        bomId: validBomId,
        orderId: (parsedNotes.orderId as string | undefined) ?? orderId,
        source,
        materialType,
        grouped: true,
        mergedIntoExisting: !result.created,
        addedQuantity: result.addedQuantity,
        duplicateCount: result.duplicateCount,
        totalContributors: result.totalContributors,
      });
    }

    // ---- Legacy P1 / non-P2 path (carbon_fiber / fiberglass / mesa stock, custom demand) ----
    // Find or create an inventory item for this packet type
    const { manufacturingQueue, inventoryItems } = await import('../../schema');
    const { pool } = await import('../../db');

    // Try to find existing packet inventory item - use exact match first
    let inventoryItemId: number | null = null;
    try {
      // First try exact name match
      const exactResult = await pool.query(
        `SELECT id FROM inventory_items WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [packetName]
      );
      const exactRows = Array.isArray(exactResult) ? exactResult : (exactResult as any).rows || [];
      if (exactRows.length > 0) {
        inventoryItemId = exactRows[0].id;
      }

      // If no exact match, try pattern match
      if (!inventoryItemId) {
        const result = await pool.query(
          `SELECT id FROM inventory_items WHERE name ILIKE $1 LIMIT 1`,
          [`%${packetName}%`]
        );
        const rows = Array.isArray(result) ? result : (result as any).rows || [];
        if (rows.length > 0) {
          inventoryItemId = rows[0].id;
        }
      }
    } catch (e) {
      console.log('Could not find inventory item:', e);
    }

    // If no inventory item found, use a default packet item
    if (!inventoryItemId) {
      try {
        const result = await pool.query(
          `SELECT id FROM inventory_items WHERE name ILIKE '%packet%' LIMIT 1`
        );
        const rows = Array.isArray(result) ? result : (result as any).rows || [];
        if (rows.length > 0) {
          inventoryItemId = rows[0].id;
        }
      } catch (e) {
        console.log('Could not find any packet inventory item:', e);
      }
    }

    // If still no item found, create one
    if (!inventoryItemId) {
      const [newItem] = await db.insert(inventoryItems).values({
        name: packetName,
        agPartNumber: `PKT-${materialType?.toUpperCase() || 'STK'}`,
        category: 'packet',
        quantityInStock: 0,
      }).returning();
      inventoryItemId = newItem.id;
    }

    // P1 / non-P2 path keeps its historical behavior — insert a fresh row per call.
    // (P1 stock packet scheduling is intentionally NOT routed through the grouping
    // helper; that path is unchanged per task scope.)
    const queueNotes = JSON.stringify({
      orderId,
      source,
      materialType,
      bomId: validBomId,
      userNotes: notes,
      isP2Packet: false,
      packetName,
      poNumber: poNumber || null,
    });
    const [queueItem] = await db.insert(manufacturingQueue).values({
      inventoryItemId,
      department: 'Cutting Table',
      quantityRequested: quantity,
      quantityCompleted: 0,
      priority: priority || 50,
      status: 'PENDING',
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: queueNotes,
      requestedBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    res.status(201).json({
      ...queueItem,
      bomId: validBomId,
      orderId,
      source,
      materialType,
    });
  } catch (error) {
    console.error('Error scheduling to cutting queue:', error);
    res.status(500).json({ error: 'Failed to schedule to cutting queue' });
  }
});

router.post('/bulk-schedule-to-cutting', async (req, res) => {
  try {
    const { items, packetType, materialType } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required and must not be empty' });
    }

    const totalQuantity = items.reduce((sum: number, item: { quantity?: number }) => sum + (item.quantity || 0), 0);
    if (totalQuantity <= 0) {
      return res.status(400).json({ error: 'Total quantity must be greater than 0' });
    }

    const packetName = packetType || 'Stock Packet';
    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;

    interface BulkItem { poNumber: string; quantity: number; p2PoItemId?: number | null; p2PoId?: number | null }
    const groupedItems = (items as BulkItem[]).map(item => ({
      poNumber: item.poNumber,
      quantity: item.quantity,
      p2PoItemId: item.p2PoItemId ?? null,
      p2PoId: item.p2PoId ?? null,
    }));

    const { upsertGroupedCuttingQueueEntry } = await import('../utils/cuttingQueueGroupingHelper');
    const result = await upsertGroupedCuttingQueueEntry({
      packetName,
      materialType: materialType || null,
      dueDate,
      items: groupedItems,
      source: 'MANUAL',
      userNotes: `Bulk scheduled ${totalQuantity} ${packetName} packets from ${items.length} POs`,
    });

    if (!result) {
      return res.status(500).json({ error: 'Failed to bulk schedule to cutting queue' });
    }

    let parsedNotes: Record<string, unknown> = {};
    try { parsedNotes = result.queueItem.notes ? JSON.parse(result.queueItem.notes) : {}; } catch {}
    const orderId = (parsedNotes.orderId as string | undefined) || `BULK-${packetName.replace(/\s+/g, '_').toUpperCase()}-${Date.now()}`;
    const validBomId = (parsedNotes.bomId as string | null | undefined) ?? null;

    if (result.created) {
      console.log(`✅ Bulk scheduled ${totalQuantity} "${packetName}" packets from ${items.length} POs into new queue entry ${result.queueItem.id}`);
    } else {
      console.log(`✅ Bulk scheduled ${result.addedQuantity} additional "${packetName}" packets (${result.duplicateCount} dup skipped) — merged into existing queue entry ${result.queueItem.id} (now ${result.totalContributors} contributing PO entries)`);
    }

    res.status(201).json({
      ...result.queueItem,
      bomId: validBomId,
      orderId,
      source: 'MANUAL',
      materialType,
      totalQuantity,
      poCount: items.length,
      grouped: true,
      mergedIntoExisting: !result.created,
      addedQuantity: result.addedQuantity,
      duplicateCount: result.duplicateCount,
      totalContributors: result.totalContributors,
    });
  } catch (error) {
    console.error('Error bulk scheduling to cutting queue:', error);
    res.status(500).json({ error: 'Failed to bulk schedule to cutting queue' });
  }
});

// Backfill endpoint: reconcile historical manufacturing_queue P2 entries to their source production orders
router.post('/backfill-p2-scheduled-status', async (req, res) => {
  try {
    const { pool: bfPool } = await import('../../db');
    const summary = await runP2ScheduledBackfill(bfPool);
    res.json({ success: true, ...summary });
  } catch (err: any) {
    console.error('❌ P2 backfill endpoint error:', err.message);
    res.status(500).json({ error: 'Backfill failed', detail: err.message });
  }
});

// Backfill endpoint: consolidate historical pre-task duplicate PENDING P2 cutting rows
// (one per PO / one per re-sync click) into the new grouped shape (one row per
// packet type per due-date bucket, with contributing POs merged into notes.poNumbers).
router.post('/backfill-p2-duplicate-grouping', async (req, res) => {
  try {
    const { pool: bfPool } = await import('../../db');
    const summary = await runP2DuplicateCuttingBackfill(bfPool);
    res.json({ success: true, ...summary });
  } catch (err: any) {
    console.error('❌ P2 duplicate-grouping backfill endpoint error:', err.message);
    res.status(500).json({ error: 'Backfill failed', detail: err.message });
  }
});

// Shared backfill logic — also called at boot
// Idempotent: once a queue row is processed its notes are stamped with p2BackfillApplied:true
// so re-running on the next restart never double-subtracts quantity.
export async function runP2ScheduledBackfill(pool: any): Promise<{ updated: number; partial: number; skipped: number }> {
  // Only fetch rows that have NOT already been processed by a previous backfill run
  const queueResult = await pool.query(`
    SELECT id, notes, quantity_requested
    FROM manufacturing_queue
    WHERE department = 'Cutting Table'
      AND notes IS NOT NULL
      AND notes::text LIKE '%"isP2Packet":true%'
      AND notes::text NOT LIKE '%"p2BackfillApplied":true%'
  `);
  const queueRows = (queueResult as any).rows || (queueResult as any[]) || [];

  let updated = 0;
  let partial = 0;
  let skipped = 0;

  for (const row of queueRows) {
    try {
      let parsedNotes: any = {};
      try { parsedNotes = JSON.parse(row.notes); } catch (_) { skipped++; continue; }
      const orderId = parsedNotes?.orderId;
      if (!orderId) { skipped++; continue; }

      // Parse orderId: "PO-{poNumber}-{id}" or "P2-{id}" — last segment is DB id
      const idParts = String(orderId).split('-');
      const p2OrderId = parseInt(idParts[idParts.length - 1], 10);
      if (isNaN(p2OrderId)) { skipped++; continue; }

      const orderResult = await pool.query(
        `SELECT id, quantity, status FROM p2_production_orders WHERE id = $1`,
        [p2OrderId]
      );
      const orderRow = (orderResult as any).rows?.[0] || (orderResult as any[])[0];
      if (!orderRow) { skipped++; continue; }

      // Skip orders already moved past pending
      if (orderRow.status === 'scheduled' || orderRow.status === 'completed' || orderRow.status === 'cancelled') {
        skipped++;
        continue;
      }

      const scheduledQty = row.quantity_requested || 0;
      const remaining = (orderRow.quantity || 0) - scheduledQty;

      if (remaining <= 0) {
        await pool.query(
          `UPDATE p2_production_orders SET status = 'scheduled', updated_at = NOW() WHERE id = $1`,
          [p2OrderId]
        );
        updated++;
      } else {
        await pool.query(
          `UPDATE p2_production_orders SET quantity = $1, updated_at = NOW() WHERE id = $2`,
          [remaining, p2OrderId]
        );
        partial++;
      }

      // Stamp this queue row so the backfill never processes it again (idempotency guard)
      parsedNotes.p2BackfillApplied = true;
      await pool.query(
        `UPDATE manufacturing_queue SET notes = $1 WHERE id = $2`,
        [JSON.stringify(parsedNotes), row.id]
      );
    } catch (rowErr: any) {
      console.warn(`⚠️ P2 backfill: error processing queue row ${row.id}:`, rowErr.message);
      skipped++;
    }
  }

  console.log(`✅ P2 backfill complete — fully scheduled: ${updated}, partial qty reduced: ${partial}, skipped: ${skipped}`);
  return { updated, partial, skipped };
}

// ---- Helpers for the duplicate-grouping backfill ----

interface LegacyGroupedItem {
  poNumber: string;
  quantity: number;
  p2PoItemId: number | null;
  p2PoId: number | null;
}

function bfDueDateBucketKey(d: any): string {
  if (d === null || d === undefined) return 'null';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return 'null';
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toISOString()
    .slice(0, 10);
}

function bfItemKey(item: LegacyGroupedItem): string {
  if (item.p2PoItemId != null) return `item:${item.p2PoItemId}`;
  return `po:${item.poNumber}`;
}

// Extract a normalized list of contributing PO entries from a parsed legacy notes blob.
// - If notes already has poNumbers[] (new grouped shape), normalize and return it.
// - Otherwise build a single entry from singular poNumber / orderId / sourceId.
function bfExtractPoNumbers(parsed: any, fallbackQuantity: number, row: any): LegacyGroupedItem[] {
  if (Array.isArray(parsed?.poNumbers) && parsed.poNumbers.length > 0) {
    return parsed.poNumbers
      .filter((p: any) => p && (p.poNumber !== undefined || p.p2PoItemId != null))
      .map((p: any) => ({
        poNumber: p.poNumber != null ? String(p.poNumber) : '',
        quantity: typeof p.quantity === 'number' ? p.quantity : 0,
        p2PoItemId: p.p2PoItemId ?? null,
        p2PoId: p.p2PoId ?? null,
      }));
  }

  const poNumber =
    (parsed && typeof parsed.poNumber === 'string' && parsed.poNumber) ||
    (parsed && typeof parsed.orderId === 'string' && parsed.orderId) ||
    (row && row.source_id ? String(row.source_id) : null) ||
    `LEGACY-${row?.id ?? Date.now()}`;

  return [{
    poNumber,
    quantity: fallbackQuantity || 0,
    p2PoItemId: row?.p2_po_item_id ?? null,
    p2PoId: row?.p2_po_id ?? null,
  }];
}

/**
 * Consolidate historical PENDING P2 cutting rows into the new grouped shape.
 *
 * Behavior:
 *   - Selects PENDING manufacturing_queue rows in 'Cutting Table' whose notes
 *     mark them as P2 packets (notes.isP2Packet === true OR notes.materialType
 *     starts with 'p2_').
 *   - Groups them by (inventoryItemId, due-date bucket day, packetName).
 *   - For each group:
 *       * Picks one canonical row (earliest createdAt, lowest id).
 *       * Merges all contributing PO entries into notes.poNumbers, dedup by
 *         p2PoItemId / poNumber. Sums their quantities into quantityRequested
 *         on the canonical row.
 *       * Stamps canonical notes with isP2Packet:true, p2BackfillApplied:true,
 *         drops the singular `poNumber` field.
 *       * Deletes sibling rows.
 *
 * Idempotent:
 *   - A group containing exactly one row that is already in canonical shape
 *     (poNumbers[] present, p2BackfillApplied:true, isP2Packet:true, no
 *     singular poNumber) is skipped.
 *
 * Used by:
 *   - POST /api/cutting-table/backfill-p2-duplicate-grouping (admin endpoint)
 *   - server/index.ts boot-time guarded execution
 */
export async function runP2DuplicateCuttingBackfill(pool: any): Promise<{
  candidatesScanned: number;
  groupsConsolidated: number;
  rowsKept: number;
  rowsMerged: number;
  rowsReshaped: number;
  groupsSkipped: number;
  errors: number;
}> {
  const queueResult = await pool.query(`
    SELECT id, inventory_item_id, due_date, quantity_requested, quantity_completed,
           priority, notes, requested_by, p2_po_id, p2_po_item_id, source_id,
           created_at
    FROM manufacturing_queue
    WHERE department = 'Cutting Table'
      AND status = 'PENDING'
      AND inventory_item_id IS NOT NULL
      AND notes IS NOT NULL
      AND (
        notes::text LIKE '%"isP2Packet":true%'
        OR notes::text LIKE '%"materialType":"p2_%'
      )
    ORDER BY created_at ASC NULLS LAST, id ASC
  `);
  const rows = (queueResult as any).rows || (queueResult as any[]) || [];

  interface Candidate {
    row: any;
    parsed: any;
    packetName: string;
    bucket: string;
  }

  const groups = new Map<string, Candidate[]>();
  let candidatesScanned = 0;
  let errors = 0;

  for (const row of rows) {
    let parsed: any = {};
    try {
      parsed = row.notes ? JSON.parse(row.notes) : {};
    } catch {
      errors++;
      continue;
    }

    const isP2 = parsed?.isP2Packet === true
      || (typeof parsed?.materialType === 'string' && parsed.materialType.startsWith('p2_'));
    if (!isP2) continue;

    const packetName = typeof parsed?.packetName === 'string' && parsed.packetName.trim()
      ? parsed.packetName.trim()
      : null;
    if (!packetName) continue;

    candidatesScanned++;
    const bucket = bfDueDateBucketKey(row.due_date);
    const key = `${row.inventory_item_id}|${bucket}|${packetName.toLowerCase()}`;
    const list = groups.get(key);
    if (list) list.push({ row, parsed, packetName, bucket });
    else groups.set(key, [{ row, parsed, packetName, bucket }]);
  }

  let groupsConsolidated = 0;
  let rowsKept = 0;
  let rowsMerged = 0;
  let rowsReshaped = 0;
  let groupsSkipped = 0;

  for (const items of Array.from(groups.values())) {
    if (items.length === 0) continue;

    if (items.length === 1) {
      const { row, parsed, packetName } = items[0];
      const alreadyCanonical = Array.isArray(parsed.poNumbers)
        && parsed.poNumbers.length > 0
        && parsed.p2BackfillApplied === true
        && parsed.isP2Packet === true
        && parsed.poNumber === undefined;
      if (alreadyCanonical) {
        groupsSkipped++;
        continue;
      }

      try {
        const merged = bfExtractPoNumbers(parsed, row.quantity_requested || 0, row);
        const totalQty = merged.reduce((s, p) => s + (p.quantity || 0), 0)
          || (row.quantity_requested || 0);

        const updatedNotes: any = {
          ...parsed,
          isP2Packet: true,
          p2BackfillApplied: true,
          packetName,
          poNumbers: merged,
        };
        delete updatedNotes.poNumber;
        if (!updatedNotes.userNotes) {
          updatedNotes.userNotes = `Grouped ${merged.length} PO entr${merged.length === 1 ? 'y' : 'ies'} for ${packetName}`;
        }

        await pool.query(
          `UPDATE manufacturing_queue
              SET quantity_requested = $1,
                  notes = $2,
                  updated_at = NOW()
            WHERE id = $3`,
          [totalQty, JSON.stringify(updatedNotes), row.id]
        );
        rowsReshaped++;
        rowsKept++;
      } catch (rowErr: any) {
        console.warn(`⚠️ P2 duplicate-grouping backfill: reshape failed for row ${row.id}:`, rowErr.message);
        errors++;
      }
      continue;
    }

    // Multi-row group — consolidate into the earliest row, delete the rest
    try {
      const sorted = items.slice().sort((a, b) => {
        const at = a.row.created_at ? new Date(a.row.created_at).getTime() : 0;
        const bt = b.row.created_at ? new Date(b.row.created_at).getTime() : 0;
        if (at !== bt) return at - bt;
        return (a.row.id || 0) - (b.row.id || 0);
      });

      const canonical = sorted[0];
      const others = sorted.slice(1);

      const seen = new Set<string>();
      const mergedPos: LegacyGroupedItem[] = [];
      let totalQty = 0;

      for (const { row, parsed } of sorted) {
        const pos = bfExtractPoNumbers(parsed, row.quantity_requested || 0, row);
        const rowQty = row.quantity_requested || 0;
        const sumOfEntries = pos.reduce((s, p) => s + (p.quantity || 0), 0);
        const scale = (sumOfEntries === 0 && rowQty > 0 && pos.length > 0)
          ? rowQty / pos.length
          : 0;
        for (const po of pos) {
          const k = bfItemKey(po);
          if (seen.has(k)) continue;
          seen.add(k);
          const qty = po.quantity || scale || 0;
          const normalized: LegacyGroupedItem = { ...po, quantity: qty };
          mergedPos.push(normalized);
          totalQty += qty;
        }
      }

      if (totalQty <= 0) {
        // Fall back to the sum of quantity_requested across rows
        totalQty = sorted.reduce((s, c) => s + (c.row.quantity_requested || 0), 0);
      }

      const updatedNotes: any = {
        ...canonical.parsed,
        isP2Packet: true,
        p2BackfillApplied: true,
        packetName: canonical.packetName,
        poNumbers: mergedPos,
        userNotes: canonical.parsed.userNotes
          || `Grouped ${mergedPos.length} PO entr${mergedPos.length === 1 ? 'y' : 'ies'} for ${canonical.packetName}`,
      };
      delete updatedNotes.poNumber;

      await pool.query(
        `UPDATE manufacturing_queue
            SET quantity_requested = $1,
                notes = $2,
                updated_at = NOW()
          WHERE id = $3`,
        [totalQty, JSON.stringify(updatedNotes), canonical.row.id]
      );

      for (const { row, parsed, packetName: deletedPacketName, bucket } of others) {
        await pool.query(`DELETE FROM manufacturing_queue WHERE id = $1`, [row.id]);
        // Record the alias so any labels printed against the deleted row still
        // resolve to the surviving canonical row when scanned.
        try {
          await pool.query(
            `INSERT INTO cutting_packet_barcode_aliases
                (original_queue_id, successor_queue_id, inventory_item_id, packet_name, due_date_bucket, reason, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, 'merged', NOW(), NOW())
              ON CONFLICT (original_queue_id) DO UPDATE
                SET successor_queue_id = EXCLUDED.successor_queue_id,
                    inventory_item_id = COALESCE(EXCLUDED.inventory_item_id, cutting_packet_barcode_aliases.inventory_item_id),
                    packet_name = COALESCE(EXCLUDED.packet_name, cutting_packet_barcode_aliases.packet_name),
                    due_date_bucket = COALESCE(EXCLUDED.due_date_bucket, cutting_packet_barcode_aliases.due_date_bucket),
                    reason = 'merged',
                    updated_at = NOW()`,
            [row.id, canonical.row.id, row.inventory_item_id ?? null, deletedPacketName, bucket],
          );
        } catch (aliasErr: any) {
          console.warn(`⚠️ P2 duplicate-grouping backfill: alias record failed for row ${row.id}:`, aliasErr?.message || aliasErr);
        }
        rowsMerged++;
      }

      rowsKept++;
      groupsConsolidated++;
    } catch (groupErr: any) {
      console.warn(`⚠️ P2 duplicate-grouping backfill: consolidation failed for group:`, groupErr.message);
      errors++;
    }
  }

  console.log(
    `✅ P2 duplicate-grouping backfill complete — scanned: ${candidatesScanned}, ` +
    `groups consolidated: ${groupsConsolidated}, rows kept: ${rowsKept}, ` +
    `rows merged-and-deleted: ${rowsMerged}, single rows reshaped: ${rowsReshaped}, ` +
    `groups already canonical: ${groupsSkipped}, errors: ${errors}`
  );

  return {
    candidatesScanned,
    groupsConsolidated,
    rowsKept,
    rowsMerged,
    rowsReshaped,
    groupsSkipped,
    errors,
  };
}

// ========== Packet BOM Endpoints ==========

// Helper to transform parts data for frontend
const transformPart = (part: any) => {
  let quantity = 1;
  let cutsNeeded = 1;
  try {
    if (part.notes) {
      const parsed = JSON.parse(part.notes);
      quantity = parsed.quantity || 1;
      cutsNeeded = parsed.cutsNeeded || 1;
    }
  } catch {
    // Legacy format: "Qty: X, Cuts: Y"
    const qtyMatch = part.notes?.match(/Qty:\s*(\d+)/);
    const cutsMatch = part.notes?.match(/Cuts:\s*(\d+)/);
    if (qtyMatch) quantity = parseInt(qtyMatch[1]) || 1;
    if (cutsMatch) cutsNeeded = parseInt(cutsMatch[1]) || 1;
  }
  return {
    ...part,
    quantity,
    cutsNeeded,
    materialPartNumber: part.commonName || "",
    materialName: part.fabricType || "",
  };
};

// Get all packet BOMs with their materials and parts
router.get('/packet-boms', async (req, res) => {
  try {
    const boms = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.isActive, true));
    
    const bomsWithData = await Promise.all(
      boms.map(async (bom) => {
        const materials = await db.select().from(cuttingPacketBOMMaterials)
          .where(eq(cuttingPacketBOMMaterials.packetBomId, bom.id));
        const rawParts = await db.select().from(cuttingPacketBOMParts)
          .where(eq(cuttingPacketBOMParts.packetBomId, bom.id))
          .orderBy(cuttingPacketBOMParts.sortOrder);
        const parts = rawParts.map(transformPart);
        
        // Get cuts from cutsConfig field (with fallback to description for migration)
        let cuts: any[] = [];
        if (bom.cutsConfig) {
          if (Array.isArray(bom.cutsConfig)) {
            cuts = bom.cutsConfig;
          } else if (typeof bom.cutsConfig === 'string') {
            try { cuts = JSON.parse(bom.cutsConfig); } catch (e) { cuts = []; }
          }
        }
        if (cuts.length === 0 && bom.description) {
          try {
            const parsed = JSON.parse(bom.description);
            if (Array.isArray(parsed)) cuts = parsed;
          } catch (e) { /* ignore */ }
        }
        
        // Get cut programs from cutProgramsConfig field
        let cutPrograms: any[] = [];
        if (bom.cutProgramsConfig) {
          if (Array.isArray(bom.cutProgramsConfig)) {
            cutPrograms = bom.cutProgramsConfig;
          } else if (typeof bom.cutProgramsConfig === 'string') {
            try { cutPrograms = JSON.parse(bom.cutProgramsConfig); } catch (e) { cutPrograms = []; }
          }
        }
        
        // Get ply schedule from plyScheduleConfig field
        let plySchedule: any[] = [];
        if (bom.plyScheduleConfig) {
          if (Array.isArray(bom.plyScheduleConfig)) {
            plySchedule = bom.plyScheduleConfig;
          } else if (typeof bom.plyScheduleConfig === 'string') {
            try { plySchedule = JSON.parse(bom.plyScheduleConfig); } catch (e) { plySchedule = []; }
          }
        }
        
        return { 
          ...bom, 
          materials, 
          parts, 
          cuts, 
          cutPrograms,
          noPlySchedule: bom.noPlySchedule || false,
          plySchedule,
        };
      })
    );
    
    res.json(bomsWithData);
  } catch (error) {
    console.error('Error fetching packet BOMs:', error);
    res.status(500).json({ error: 'Failed to fetch packet BOMs' });
  }
});

// Get single packet BOM with materials and parts
router.get('/packet-boms/:id', async (req, res) => {
  try {
    const [bom] = await db.select().from(cuttingPacketBOMs)
      .where(eq(cuttingPacketBOMs.id, req.params.id));
    
    if (!bom) {
      return res.status(404).json({ error: 'Packet BOM not found' });
    }
    
    const materials = await db.select().from(cuttingPacketBOMMaterials)
      .where(eq(cuttingPacketBOMMaterials.packetBomId, bom.id));

    const rawParts = await db.select().from(cuttingPacketBOMParts)
      .where(eq(cuttingPacketBOMParts.packetBomId, bom.id))
      .orderBy(cuttingPacketBOMParts.sortOrder);
    const parts = rawParts.map(transformPart);
    
    // Get cuts from cutsConfig field (with fallback to description for migration)
    let cuts: any[] = [];
    if (bom.cutsConfig) {
      if (Array.isArray(bom.cutsConfig)) {
        cuts = bom.cutsConfig;
      } else if (typeof bom.cutsConfig === 'string') {
        try { cuts = JSON.parse(bom.cutsConfig); } catch (e) { cuts = []; }
      }
    }
    if (cuts.length === 0 && bom.description) {
      try {
        const parsed = JSON.parse(bom.description);
        if (Array.isArray(parsed)) cuts = parsed;
      } catch (e) { /* ignore */ }
    }
    
    res.json({ ...bom, materials, parts, cuts });
  } catch (error) {
    console.error('Error fetching packet BOM:', error);
    res.status(500).json({ error: 'Failed to fetch packet BOM' });
  }
});

// Create packet BOM (auto-created when inventory item has cutting selected)
router.post('/packet-boms', async (req, res) => {
  try {
    // Store cuts configuration in dedicated cutsConfig jsonb field
    const cutsConfigData = req.body.cuts || null;
    const cutProgramsConfigData = req.body.cutPrograms || null;
    const plyScheduleConfigData = req.body.plySchedule || null;
    const noPlyScheduleValue = req.body.noPlySchedule || false;
    const baseData = insertCuttingPacketBOMSchema.parse(req.body);
    
    const [newBom] = await db.insert(cuttingPacketBOMs).values({
      ...baseData,
      cutsConfig: cutsConfigData, // Store cuts in dedicated jsonb column
      cutProgramsConfig: cutProgramsConfigData, // Store cut programs from Step 3
      noPlySchedule: noPlyScheduleValue, // Whether no ply schedule is needed
      plyScheduleConfig: plyScheduleConfigData, // Store ply schedule from Step 4
    }).returning();
    
    // If materials are provided, add them
    if (req.body.materials && Array.isArray(req.body.materials)) {
      for (const material of req.body.materials) {
        await db.insert(cuttingPacketBOMMaterials).values({
          packetBomId: newBom.id,
          fabricType: material.fabricType,
          commonName: material.commonName,
          quantityNeeded: material.quantityNeeded || 1,
          rollsRequired: material.rollsRequired || 1,
          squareMetersRequired: material.squareMetersRequired,
        });
      }
    }

    // If parts are provided, add them (simplified structure for new model)
    if (req.body.parts && Array.isArray(req.body.parts)) {
      for (let i = 0; i < req.body.parts.length; i++) {
        const part = req.body.parts[i];
        await db.insert(cuttingPacketBOMParts).values({
          packetBomId: newBom.id,
          partNumber: part.partNumber,
          partDescription: part.partName || part.partDescription,
          fabricType: "", // Material is now on cuts, not parts
          commonName: "",
          yieldPerCut: 1,
          squareMetersPerPart: null,
          sortOrder: i,
          notes: JSON.stringify({ quantity: part.quantity || 1 }),
        });
      }
    }
    
    const materials = await db.select().from(cuttingPacketBOMMaterials)
      .where(eq(cuttingPacketBOMMaterials.packetBomId, newBom.id));

    const rawParts = await db.select().from(cuttingPacketBOMParts)
      .where(eq(cuttingPacketBOMParts.packetBomId, newBom.id))
      .orderBy(cuttingPacketBOMParts.sortOrder);
    const parts = rawParts.map(transformPart);
    
    // Get cuts from cutsConfig field
    let cuts: any[] = [];
    if (newBom.cutsConfig) {
      if (Array.isArray(newBom.cutsConfig)) {
        cuts = newBom.cutsConfig;
      } else if (typeof newBom.cutsConfig === 'string') {
        try { cuts = JSON.parse(newBom.cutsConfig); } catch (e) { cuts = []; }
      }
    }
    
    res.status(201).json({ 
      ...newBom, 
      materials, 
      parts, 
      cuts,
      cutPrograms: cutProgramsConfigData || [],
      noPlySchedule: noPlyScheduleValue,
      plySchedule: plyScheduleConfigData || [],
    });
  } catch (error) {
    console.error('Error creating packet BOM:', error);
    res.status(400).json({ error: 'Failed to create packet BOM' });
  }
});

// Update packet BOM
router.put('/packet-boms/:id', async (req, res) => {
  try {
    // Store cuts configuration in dedicated cutsConfig jsonb field
    const cutsConfigData = req.body.cuts !== undefined ? req.body.cuts : undefined;
    const cutProgramsConfigData = req.body.cutPrograms !== undefined ? req.body.cutPrograms : undefined;
    const plyScheduleConfigData = req.body.plySchedule !== undefined ? req.body.plySchedule : undefined;
    const noPlyScheduleValue = req.body.noPlySchedule !== undefined ? req.body.noPlySchedule : undefined;
    const baseData = insertCuttingPacketBOMSchema.partial().parse(req.body);
    
    const updateData: any = { ...baseData, updatedAt: new Date() };
    if (cutsConfigData !== undefined) {
      updateData.cutsConfig = cutsConfigData;
    }
    if (cutProgramsConfigData !== undefined) {
      updateData.cutProgramsConfig = cutProgramsConfigData;
    }
    if (plyScheduleConfigData !== undefined) {
      updateData.plyScheduleConfig = plyScheduleConfigData;
    }
    if (noPlyScheduleValue !== undefined) {
      updateData.noPlySchedule = noPlyScheduleValue;
    }
    
    const [updated] = await db.update(cuttingPacketBOMs)
      .set(updateData)
      .where(eq(cuttingPacketBOMs.id, req.params.id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Packet BOM not found' });
    }
    
    // Update materials if provided
    if (req.body.materials && Array.isArray(req.body.materials)) {
      await db.delete(cuttingPacketBOMMaterials)
        .where(eq(cuttingPacketBOMMaterials.packetBomId, updated.id));
      
      for (const material of req.body.materials) {
        await db.insert(cuttingPacketBOMMaterials).values({
          packetBomId: updated.id,
          fabricType: material.fabricType,
          commonName: material.commonName,
          quantityNeeded: material.quantityNeeded || 1,
          rollsRequired: material.rollsRequired || 1,
          squareMetersRequired: material.squareMetersRequired,
        });
      }
    }

    // Update parts if provided (simplified structure for new model)
    if (req.body.parts && Array.isArray(req.body.parts)) {
      await db.delete(cuttingPacketBOMParts)
        .where(eq(cuttingPacketBOMParts.packetBomId, updated.id));
      
      for (let i = 0; i < req.body.parts.length; i++) {
        const part = req.body.parts[i];
        await db.insert(cuttingPacketBOMParts).values({
          packetBomId: updated.id,
          partNumber: part.partNumber,
          partDescription: part.partName || part.partDescription,
          fabricType: "", // Material is now on cuts, not parts
          commonName: "",
          yieldPerCut: 1,
          squareMetersPerPart: null,
          sortOrder: i,
          notes: JSON.stringify({ quantity: part.quantity || 1 }),
        });
      }
    }
    
    const materials = await db.select().from(cuttingPacketBOMMaterials)
      .where(eq(cuttingPacketBOMMaterials.packetBomId, updated.id));

    const rawParts = await db.select().from(cuttingPacketBOMParts)
      .where(eq(cuttingPacketBOMParts.packetBomId, updated.id))
      .orderBy(cuttingPacketBOMParts.sortOrder);
    const parts = rawParts.map(transformPart);
    
    // Get cuts from cutsConfig field
    let cuts: any[] = [];
    if (updated.cutsConfig) {
      if (Array.isArray(updated.cutsConfig)) {
        cuts = updated.cutsConfig;
      } else if (typeof updated.cutsConfig === 'string') {
        try { cuts = JSON.parse(updated.cutsConfig); } catch (e) { cuts = []; }
      }
    }
    
    res.json({ ...updated, materials, parts, cuts });
  } catch (error) {
    console.error('Error updating packet BOM:', error);
    res.status(400).json({ error: 'Failed to update packet BOM' });
  }
});

// Delete packet BOM (soft delete)
router.delete('/packet-boms/:id', async (req, res) => {
  try {
    await db.update(cuttingPacketBOMs)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(cuttingPacketBOMs.id, req.params.id));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting packet BOM:', error);
    res.status(500).json({ error: 'Failed to delete packet BOM' });
  }
});

// Record cut for a packet BOM (tracks square meters and yield)
router.post('/packet-boms/:id/cuts', async (req, res) => {
  try {
    const { squareMetersUsed, piecesYielded, fabricInventoryId, rollNumber, lotNumber, operatorName, notes, mfgQueueItemId } = req.body;
    
    // Validate required fields for AS9100 traceability
    if (!rollNumber || !lotNumber) {
      return res.status(400).json({ error: 'Roll number and lot number are required for traceability' });
    }
    
    if (!squareMetersUsed || squareMetersUsed <= 0) {
      return res.status(400).json({ error: 'Square meters used must be greater than 0' });
    }
    
    // Record the cut
    const [newCut] = await db.insert(cuttingPacketBOMCuts).values({
      packetBomId: req.params.id,
      fabricInventoryId,
      mfgQueueItemId,
      squareMetersUsed: parseFloat(squareMetersUsed) || 0,
      piecesYielded: parseInt(piecesYielded) || 1,
      rollNumber,
      lotNumber,
      operatorName: operatorName || 'unknown',
      notes,
    }).returning();
    
    // Decrement fabric inventory if fabricInventoryId is provided
    if (fabricInventoryId) {
      try {
        const [currentInventory] = await db.select()
          .from(cuttingFabricInventory)
          .where(eq(cuttingFabricInventory.id, fabricInventoryId));
        
        if (currentInventory) {
          const currentSquareMeters = parseFloat(currentInventory.squareMeters?.toString() || '0');
          const currentQuantityInStock = parseFabricStockQuantity(currentInventory.quantityInStock);
          const usedSquareMeters = parseFloat(squareMetersUsed) || 0;
          const newSquareMeters = Math.max(0, currentSquareMeters - usedSquareMeters);
          const newQuantityInStock = Math.max(0, currentQuantityInStock - usedSquareMeters);
          const isDepleted = newSquareMeters <= 0 && newQuantityInStock <= 0;
          
          await db.update(cuttingFabricInventory)
            .set({ 
              squareMeters: newSquareMeters.toString(),
              quantityInStock: newQuantityInStock,
              status: isDepleted ? 'depleted' : currentInventory.status,
              depletedAt: isDepleted ? new Date() : currentInventory.depletedAt,
              depletedBy: isDepleted ? (operatorName || 'unknown') : currentInventory.depletedBy,
              updatedAt: new Date(),
            })
            .where(eq(cuttingFabricInventory.id, fabricInventoryId));

          await db.insert(cuttingFabricInventoryTransactions).values({
            fabricInventoryId,
            changeType: 'ISSUE',
            quantityDelta: nonZeroInventoryDelta(-usedSquareMeters),
            performedBy: operatorName || 'unknown',
            notes: `Cut record ${newCut.id}: ${usedSquareMeters} square meters used from roll ${rollNumber}`,
          });
          
          console.log(`[CUT RECORDED] Roll ${rollNumber}: ${usedSquareMeters}m² consumed, ${newSquareMeters}m² remaining`);
        }
      } catch (inventoryError) {
        console.error('Warning: Could not update fabric inventory:', inventoryError);
        // Don't fail the cut recording if inventory update fails
      }
    }
    
    // Log for audit trail
    console.log(`[PACKET CUT] BOM ${req.params.id}: ${piecesYielded} pieces from Roll ${rollNumber} (Lot: ${lotNumber}) by ${operatorName}`);
    
    res.status(201).json(newCut);
  } catch (error) {
    console.error('Error recording packet BOM cut:', error);
    res.status(400).json({ error: 'Failed to record cut' });
  }
});

// Get cut history for a packet BOM
router.get('/packet-boms/:id/cuts', async (req, res) => {
  try {
    const cuts = await db.select().from(cuttingPacketBOMCuts)
      .where(eq(cuttingPacketBOMCuts.packetBomId, req.params.id))
      .orderBy(desc(cuttingPacketBOMCuts.cutDate));
    
    res.json(cuts);
  } catch (error) {
    console.error('Error fetching packet BOM cuts:', error);
    res.status(500).json({ error: 'Failed to fetch cuts' });
  }
});

// Calculate estimated cuts needed based on packet quantity and BOM yield
router.get('/packet-boms/:id/estimate-cuts', async (req, res) => {
  try {
    const { quantity } = req.query;
    const packetQuantity = parseInt(quantity as string) || 1;
    
    const [bom] = await db.select().from(cuttingPacketBOMs)
      .where(eq(cuttingPacketBOMs.id, req.params.id));
    
    if (!bom) {
      return res.status(404).json({ error: 'Packet BOM not found' });
    }
    
    const yieldPerCut = bom.yieldPerCut || 4;
    const wasteFactor = bom.wasteFactor || 0.05;
    const effectiveYield = Math.floor(yieldPerCut * (1 - wasteFactor));
    const estimatedCuts = Math.ceil(packetQuantity / effectiveYield);
    const estimatedSquareMeters = estimatedCuts * (bom.squareMetersPerCut || 0);
    
    res.json({
      packetQuantity,
      yieldPerCut,
      wasteFactor,
      effectiveYield,
      estimatedCuts,
      estimatedSquareMeters,
      squareMetersPerCut: bom.squareMetersPerCut,
    });
  } catch (error) {
    console.error('Error calculating estimated cuts:', error);
    res.status(500).json({ error: 'Failed to calculate estimate' });
  }
});

// Weekly goals with auto-calculated cuts from BOMs
router.get('/weekly-goals', async (req, res) => {
  try {
    const weekDate = req.query.weekDate as string || new Date().toISOString().split('T')[0];
    
    // Get weekly data
    const weeklyData = await storage.getCuttingWeeklyDataByWeek(weekDate);
    
    // Enhance with estimated cuts from packet BOMs
    const goalsWithEstimates = await Promise.all(
      weeklyData.map(async (goal: any) => {
        // Try to find a packet BOM for this category
        const [bom] = await db.select().from(cuttingPacketBOMs)
          .where(eq(cuttingPacketBOMs.productCategoryId, goal.productCategoryId))
          .limit(1);
        
        let estimatedCuts = 0;
        if (bom) {
          const effectiveYield = Math.floor((bom.yieldPerCut || 4) * (1 - (bom.wasteFactor || 0.05)));
          estimatedCuts = Math.ceil(goal.quantity / Math.max(effectiveYield, 1));
        } else {
          estimatedCuts = Math.ceil(goal.quantity / 4); // Default 4 pieces per cut
        }
        
        // Get production line and category names
        const lines = await storage.getAllCuttingProductionLines();
        const categories = await storage.getAllCuttingProductCategories();
        const line = lines.find((l: any) => l.id === goal.productionLineId);
        const category = categories.find((c: any) => c.id === goal.productCategoryId);
        
        return {
          ...goal,
          lineName: line?.lineName || 'Unknown',
          categoryName: category?.categoryName || 'Unknown',
          estimatedCuts,
          completedCuts: 0, // TODO: Calculate from actual cut records
          completedQuantity: 0, // TODO: Calculate from completed production
        };
      })
    );
    
    res.json(goalsWithEstimates);
  } catch (error) {
    console.error('Error fetching weekly goals:', error);
    res.status(500).json({ error: 'Failed to fetch weekly goals' });
  }
});

// ============ PACKET BOM PARTS ROUTES ============

// Get all parts for a packet BOM
router.get('/packet-boms/:id/parts', async (req, res) => {
  try {
    const parts = await db.select().from(cuttingPacketBOMParts)
      .where(eq(cuttingPacketBOMParts.packetBomId, req.params.id))
      .orderBy(cuttingPacketBOMParts.sortOrder);
    
    res.json(parts);
  } catch (error) {
    console.error('Error fetching packet BOM parts:', error);
    res.status(500).json({ error: 'Failed to fetch parts' });
  }
});

// Add a part to a packet BOM
router.post('/packet-boms/:id/parts', async (req, res) => {
  try {
    const { partNumber, partDescription, fabricType, commonName, yieldPerCut, squareMetersPerPart, sortOrder, notes } = req.body;
    
    if (!partNumber || !fabricType) {
      return res.status(400).json({ error: 'Part number and fabric type are required' });
    }
    
    const [newPart] = await db.insert(cuttingPacketBOMParts)
      .values({
        packetBomId: req.params.id,
        partNumber,
        partDescription,
        fabricType,
        commonName,
        yieldPerCut: yieldPerCut || 1,
        squareMetersPerPart: squareMetersPerPart || null,
        sortOrder: sortOrder || 0,
        notes,
      })
      .returning();
    
    res.status(201).json(newPart);
  } catch (error) {
    console.error('Error adding packet BOM part:', error);
    res.status(400).json({ error: 'Failed to add part' });
  }
});

// Update a part
router.put('/packet-bom-parts/:partId', async (req, res) => {
  try {
    const { partNumber, partDescription, fabricType, commonName, yieldPerCut, squareMetersPerPart, sortOrder, notes } = req.body;
    
    const [updated] = await db.update(cuttingPacketBOMParts)
      .set({
        partNumber,
        partDescription,
        fabricType,
        commonName,
        yieldPerCut,
        squareMetersPerPart,
        sortOrder,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(cuttingPacketBOMParts.id, req.params.partId))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Part not found' });
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating packet BOM part:', error);
    res.status(400).json({ error: 'Failed to update part' });
  }
});

// Delete a part
router.delete('/packet-bom-parts/:partId', async (req, res) => {
  try {
    const [deleted] = await db.delete(cuttingPacketBOMParts)
      .where(eq(cuttingPacketBOMParts.id, req.params.partId))
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ error: 'Part not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting packet BOM part:', error);
    res.status(500).json({ error: 'Failed to delete part' });
  }
});

// ---------------------------------------------------------------------------
// Inventory Audit endpoints
// ---------------------------------------------------------------------------

router.get('/inventory-audit/settings', async (req, res) => {
  try {
    const settings = await storage.getInventoryAuditSettings();
    res.json(settings ?? null);
  } catch (error) {
    console.error('Error fetching inventory audit settings:', error);
    res.status(500).json({ error: 'Failed to fetch audit settings' });
  }
});

router.put('/inventory-audit/settings', async (req, res) => {
  try {
    const { frequency, nextAuditDate, lastAuditDate } = req.body;

    if (!frequency) {
      return res.status(400).json({ error: 'frequency is required' });
    }

    const nextDate = nextAuditDate ? new Date(nextAuditDate) : computeNextAuditDate(frequency);
    const settings = await storage.upsertInventoryAuditSettings({
      frequency,
      nextAuditDate: nextDate,
      lastAuditDate: lastAuditDate ? new Date(lastAuditDate) : undefined,
    });
    res.json(settings);
  } catch (error) {
    console.error('Error saving inventory audit settings:', error);
    res.status(500).json({ error: 'Failed to save audit settings' });
  }
});

router.get('/inventory-audit/packets', async (req, res) => {
  try {
    const allItems = await storage.getAllInventoryItems();
    const packets = allItems.filter((item: any) =>
      item.isPacket === true || item.manufacturedCategory === 'PACKET'
    );
    const result = await Promise.all(
      packets.map(async (p) => {
        const latest = await storage.getLatestAuditRecordByPacket(p.id);
        const systemQty = Number((p as any).onHand ?? (p as any).quantityInStock ?? (p as any).available ?? 0);
        return {
          id: p.id,
          agPartNumber: p.agPartNumber,
          name: p.name,
          systemQty: Number.isFinite(systemQty) ? systemQty : 0,
          lastAuditRecord: latest ?? null,
        };
      })
    );
    res.json(result);
  } catch (error) {
    console.error('Error fetching audit packets:', error);
    res.status(500).json({ error: 'Failed to fetch packets' });
  }
});

router.post('/inventory-audit/submit', async (req, res) => {
  try {
    const { entries, auditedBy } = req.body as {
      entries: { packetId: number; actualQty: number }[];
      auditedBy?: string;
    };

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array is required' });
    }

    const allItems = await storage.getAllInventoryItems();
    const packets = allItems.filter((item: any) =>
      item.isPacket === true || item.manufacturedCategory === 'PACKET'
    );
    const packetMap = new Map(packets.map((p) => [p.id, p]));

    const records = [];
    for (const entry of entries) {
      const packet = packetMap.get(entry.packetId);
      if (!packet) continue;
      const rawSystemQty = (packet as any).onHand ?? (packet as any).quantityInStock ?? (packet as any).available ?? 0;
      const systemQty = Number.isFinite(Number(rawSystemQty)) ? Number(rawSystemQty) : 0;
      const variance = entry.actualQty - systemQty;
      const record = await storage.createInventoryAuditRecord({
        packetId: entry.packetId,
        systemQty,
        actualQty: entry.actualQty,
        variance,
        auditedBy: auditedBy ?? null,
      });
      records.push(record);

      // Update inventory item on-hand quantity so demand cards reflect the audited actuals
      await storage.updateInventoryItem(entry.packetId, {
        onHand: entry.actualQty,
        quantityInStock: entry.actualQty,
      });
    }

    const now = new Date();
    const existing = await storage.getInventoryAuditSettings();
    if (existing) {
      const nextDate = computeNextAuditDate(existing.frequency, now);
      await storage.upsertInventoryAuditSettings({
        frequency: existing.frequency,
        lastAuditDate: now,
        nextAuditDate: nextDate,
      });
    }

    res.json({ success: true, count: records.length });
  } catch (error) {
    console.error('Error submitting inventory audit:', error);
    res.status(500).json({ error: 'Failed to submit audit' });
  }
});

function computeNextAuditDate(frequency: string, from: Date = new Date()): Date {
  const next = new Date(from);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'bi_weekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      next.setDate(next.getDate() + 7);
  }
  return next;
}

export default router;
