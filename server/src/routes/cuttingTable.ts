import { Router } from 'express';
import { storage } from '../../storage';
import { db } from '../../db';
import { 
  cuttingCutRecords, 
  cuttingPacketCompositions, 
  inventoryItems,
  cuttingPacketBOMs,
  cuttingPacketBOMMaterials,
  cuttingPacketBOMCuts,
  cuttingFabricInventory,
} from '../../schema';
import { and, gte, lte, eq, desc } from 'drizzle-orm';
import {
  insertCuttingMaterialSchema,
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
} from '../../schema';

const router = Router();

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
router.get('/fabric-items', async (req, res) => {
  try {
    const allItems = await storage.getAllInventoryItems();
    const fabricItems = allItems
      .filter((item) => item.isFabric === true)
      .map((item) => ({
        id: item.id,
        agPartNumber: item.agPartNumber,
        name: item.name,
        fabric: item.name,
        sku: item.sku,
      }));
    
    res.json(fabricItems);
  } catch (error) {
    console.error('Error fetching fabric items:', error);
    res.status(500).json({ error: 'Failed to fetch fabric items' });
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
          error: 'This recipe contains legacy component-based items. Please update the recipe:\n1. Go to Configure Recipes tab\n2. Select this packet type\n3. Click "Clear All" to remove old items\n4. Add new items using inventory parts with the "Packet Part" checkbox enabled' 
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
    
    // Auto-generate barcode for P2 items
    if (validatedData.productionLineId) {
      const line = await storage.getCuttingProductionLine(validatedData.productionLineId);
      if (line && line.lineName === 'P2') {
        // Generate unique barcode: FI-P2-YYYYMMDD-XXXX
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
        validatedData.barcode = `FI-P2-${date}-${random}`;
      }
    }
    
    const inventory = await storage.createCuttingFabricInventory(validatedData);
    res.json(inventory);
  } catch (error) {
    console.error('Error creating fabric inventory:', error);
    res.status(400).json({ error: 'Failed to create fabric inventory' });
  }
});

router.put('/fabric-inventory/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingFabricInventorySchema.partial().parse(req.body);
    const inventory = await storage.updateCuttingFabricInventory(req.params.id, validatedData);
    res.json(inventory);
  } catch (error) {
    console.error('Error updating fabric inventory:', error);
    res.status(400).json({ error: 'Failed to update fabric inventory' });
  }
});

router.patch('/fabric-inventory/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingFabricInventorySchema.partial().parse(req.body);
    const inventory = await storage.updateCuttingFabricInventory(req.params.id, validatedData);
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

// Print barcode label for fabric inventory
router.get('/fabric-inventory/:id/print-barcode', async (req, res) => {
  try {
    const inventory = await storage.getCuttingFabricInventory(req.params.id);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    if (!inventory.barcode) {
      return res.status(400).json({ error: 'This item does not have a barcode' });
    }

    // Get production line info
    const line = inventory.productionLineId 
      ? await storage.getCuttingProductionLine(inventory.productionLineId)
      : null;

    // Generate printable HTML with barcode
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Barcode Label - ${inventory.barcode}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <style>
    @media print {
      @page { 
        margin: 0;
        size: 3.33in 4in;
      }
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .label {
      background: white;
      padding: 10px;
      border: 2px solid #333;
      width: 3.33in;
      height: 4in;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .label-header {
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 6px;
      color: #333;
    }
    .label-info {
      font-size: 9px;
      margin: 2px 0;
      color: #666;
      line-height: 1.2;
    }
    .barcode-container {
      margin: 6px 0;
      max-width: 100%;
      overflow: hidden;
    }
    .barcode-container svg {
      max-width: 100%;
      height: auto;
    }
    .barcode-text {
      font-size: 10px;
      font-weight: bold;
      margin-top: 4px;
      letter-spacing: 0.5px;
      word-break: break-all;
    }
    .print-btn {
      margin-top: 12px;
      padding: 8px 16px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    .print-btn:hover {
      background: #0056b3;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="label-header">AG Composites - Fabric Inventory</div>
    ${line ? `<div class="label-info">Production Line: <strong>${line.lineName}</strong></div>` : ''}
    ${inventory.source ? `<div class="label-info">Source: ${inventory.source}</div>` : ''}
    ${inventory.fabric ? `<div class="label-info">Fabric: ${inventory.fabric}</div>` : ''}
    ${inventory.batchNumber ? `<div class="label-info">Batch: ${inventory.batchNumber}</div>` : ''}
    ${inventory.location ? `<div class="label-info">Location: ${inventory.location}</div>` : ''}
    ${inventory.conformanceDocumentLink ? `<div class="label-info">📄 Conformance Doc: <a href="${inventory.conformanceDocumentLink}" target="_blank" style="color: #007bff; text-decoration: none;">View Link</a></div>` : ''}
    <div class="barcode-container">
      <svg id="barcode"></svg>
    </div>
    <div class="barcode-text">${inventory.barcode}</div>
    <button class="print-btn no-print" onclick="window.print()">Print Label</button>
  </div>
  <script>
    JsBarcode("#barcode", "${inventory.barcode}", {
      format: "CODE128",
      width: 1.2,
      height: 40,
      displayValue: false,
      margin: 2,
      textMargin: 0
    });
  </script>
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
    // Query completed packets from manufacturing queue or a dedicated stock table
    // For now, return mock data that can be replaced with actual queries
    const stockLevels = {
      carbon_fiber: 385,
      fiberglass: 38,
    };
    
    res.json(stockLevels);
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
    
    const barcodeImage = generateBarcodeImage(barcodeValue || `FAB-${lotNumber || 'UNK'}-${fabricId}`, {
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

// ========== Packet BOM Endpoints ==========

// Get all packet BOMs with their materials
router.get('/packet-boms', async (req, res) => {
  try {
    const boms = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.isActive, true));
    
    const bomsWithMaterials = await Promise.all(
      boms.map(async (bom) => {
        const materials = await db.select().from(cuttingPacketBOMMaterials)
          .where(eq(cuttingPacketBOMMaterials.packetBomId, bom.id));
        return { ...bom, materials };
      })
    );
    
    res.json(bomsWithMaterials);
  } catch (error) {
    console.error('Error fetching packet BOMs:', error);
    res.status(500).json({ error: 'Failed to fetch packet BOMs' });
  }
});

// Get single packet BOM with materials
router.get('/packet-boms/:id', async (req, res) => {
  try {
    const [bom] = await db.select().from(cuttingPacketBOMs)
      .where(eq(cuttingPacketBOMs.id, req.params.id));
    
    if (!bom) {
      return res.status(404).json({ error: 'Packet BOM not found' });
    }
    
    const materials = await db.select().from(cuttingPacketBOMMaterials)
      .where(eq(cuttingPacketBOMMaterials.packetBomId, bom.id));
    
    res.json({ ...bom, materials });
  } catch (error) {
    console.error('Error fetching packet BOM:', error);
    res.status(500).json({ error: 'Failed to fetch packet BOM' });
  }
});

// Create packet BOM (auto-created when inventory item has cutting selected)
router.post('/packet-boms', async (req, res) => {
  try {
    const validatedData = insertCuttingPacketBOMSchema.parse(req.body);
    
    const [newBom] = await db.insert(cuttingPacketBOMs).values(validatedData).returning();
    
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
    
    const materials = await db.select().from(cuttingPacketBOMMaterials)
      .where(eq(cuttingPacketBOMMaterials.packetBomId, newBom.id));
    
    res.status(201).json({ ...newBom, materials });
  } catch (error) {
    console.error('Error creating packet BOM:', error);
    res.status(400).json({ error: 'Failed to create packet BOM' });
  }
});

// Update packet BOM
router.put('/packet-boms/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingPacketBOMSchema.partial().parse(req.body);
    
    const [updated] = await db.update(cuttingPacketBOMs)
      .set({ ...validatedData, updatedAt: new Date() })
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
    
    const materials = await db.select().from(cuttingPacketBOMMaterials)
      .where(eq(cuttingPacketBOMMaterials.packetBomId, updated.id));
    
    res.json({ ...updated, materials });
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
    
    const [newCut] = await db.insert(cuttingPacketBOMCuts).values({
      packetBomId: req.params.id,
      fabricInventoryId,
      mfgQueueItemId,
      squareMetersUsed: parseFloat(squareMetersUsed) || 0,
      piecesYielded: parseInt(piecesYielded) || 0,
      rollNumber,
      lotNumber,
      operatorName,
      notes,
    }).returning();
    
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

export default router;
