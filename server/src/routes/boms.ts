import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertBomDefinitionSchema, insertBomItemSchema } from '@shared/schema';

const router = Router();

// Get all BOMs
router.get('/', async (req, res) => {
  try {
    const boms = await storage.getAllBOMs();
    res.json(boms);
  } catch (error) {
    console.error("Get BOMs error:", error);
    res.status(500).json({ error: "Failed to fetch BOMs" });
  }
});

// Create new BOM
router.post('/', async (req, res) => {
  try {
    const bomData = insertBomDefinitionSchema.parse(req.body);
    const bom = await storage.createBOM(bomData);
    res.status(201).json(bom);
  } catch (error) {
    console.error("Create BOM error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid BOM data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create BOM" });
    }
  }
});

// Get BOM details with items
router.get('/:id/details', async (req, res) => {
  try {
    console.log(`🔧 Getting BOM details for ID: ${req.params.id}`);
    const { id } = req.params;
    const bomId = parseInt(id);
    
    if (isNaN(bomId)) {
      console.log(`❌ Invalid BOM ID: ${id}`);
      return res.status(400).json({ error: "Invalid BOM ID" });
    }
    
    const bom = await storage.getBOMDetails(bomId);
    if (!bom) {
      console.log(`❌ BOM ${id} not found`);
      return res.status(404).json({ error: "BOM not found" });
    }
    
    console.log(`✅ BOM details found: ${bom.modelName} with ${bom.items?.length || 0} items`);
    res.setHeader('Content-Type', 'application/json');
    res.json(bom);
  } catch (error) {
    console.error("❌ Get BOM details error:", error);
    res.status(500).json({ error: "Failed to fetch BOM details" });
  }
});

// Update BOM
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bomData = insertBomDefinitionSchema.partial().parse(req.body);
    const bom = await storage.updateBOM(parseInt(id), bomData);
    res.json(bom);
  } catch (error) {
    console.error("Update BOM error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid BOM data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update BOM" });
    }
  }
});

// Delete BOM (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await storage.deleteBOM(parseInt(id));
    res.json({ success: true });
  } catch (error) {
    console.error("Delete BOM error:", error);
    res.status(500).json({ error: "Failed to delete BOM" });
  }
});

// Add BOM item
router.post('/:id/items', async (req, res) => {
  try {
<<<<<<< HEAD
    const { id } = req.params;
    const { purchasingUnitConversion, ...restData } = req.body;
    
    // Map purchasingUnitConversion to quantityMultiplier for database
    const itemData = insertBomItemSchema.omit({ bomId: true }).parse({
      ...restData,
      quantityMultiplier: purchasingUnitConversion || 1,
    });
    
=======
    
    const { id } = req.params;
    const { purchasingUnitConversion, ...restData } = req.body;
    
    // Validate required fields
    if (!restData.partName || typeof restData.partName !== 'string') {
      return res.status(400).json({ 
        error: "Invalid part name", 
        details: "Part name is required and must be a string" 
      });
    }

    // Ensure quantity is at least 1 and is a valid number
    const quantity = Number(restData.quantity);
    if (isNaN(quantity) || quantity < 1) {
      console.log('❌ Quantity validation failed:', { received: restData.quantity, parsed: quantity });
      return res.status(400).json({ 
        error: "Invalid quantity", 
        details: `Quantity must be at least 1, received: ${restData.quantity}` 
      });
    }
    
    // Ensure purchasing unit conversion is valid
    const conversionValue = purchasingUnitConversion ? Number(purchasingUnitConversion) : 1;
    if (isNaN(conversionValue) || conversionValue <= 0) {
      console.log('❌ Conversion validation failed:', { received: purchasingUnitConversion, parsed: conversionValue });
      return res.status(400).json({ 
        error: "Invalid purchasing unit conversion", 
        details: `Purchasing unit conversion must be greater than 0, received: ${purchasingUnitConversion}` 
      });
    }

    // Prepare clean data for Zod validation
    const cleanData = {
      partName: restData.partName,
      quantity: quantity,
      quantityMultiplier: conversionValue,
      firstDept: restData.firstDept || 'Layup',
      itemType: restData.itemType || 'manufactured',
      isActive: restData.isActive !== false, // Default to true
    };

    // Map purchasingUnitConversion to quantityMultiplier for database
    const itemData = insertBomItemSchema.omit({ bomId: true }).parse(cleanData);
>>>>>>> origin/main
    const item = await storage.addBOMItem(parseInt(id), { ...itemData, bomId: parseInt(id) });
    res.status(201).json(item);
  } catch (error) {
    console.error("Add BOM item error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid BOM item data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to add BOM item" });
    }
  }
});

// Update BOM item
router.put('/:bomId/items/:itemId', async (req, res) => {
  try {
    const { bomId, itemId } = req.params;
    const { purchasingUnitConversion, ...restData } = req.body;
    
    // Map purchasingUnitConversion to quantityMultiplier for database
    const updateData = purchasingUnitConversion !== undefined 
      ? { ...restData, quantityMultiplier: purchasingUnitConversion }
      : restData;
    
    const itemData = insertBomItemSchema.partial().omit({ bomId: true }).parse(updateData);
    const item = await storage.updateBOMItem(parseInt(bomId), parseInt(itemId), itemData);
    res.json(item);
  } catch (error) {
    console.error("Update BOM item error:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid BOM item data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update BOM item" });
    }
  }
});

// Delete BOM item
router.delete('/:bomId/items/:itemId', async (req, res) => {
  try {
    const { bomId, itemId } = req.params;
    await storage.deleteBOMItem(parseInt(bomId), parseInt(itemId));
    res.json({ success: true });
  } catch (error) {
    console.error("Delete BOM item error:", error);
    res.status(500).json({ error: "Failed to delete BOM item" });
  }
});

// Multi-Level BOM Hierarchy Endpoints

// Get available BOMs that can be used as sub-assemblies
router.get('/:bomId/available-sub-assemblies', async (req, res) => {
  try {
    const { bomId } = req.params;
    const availableBOMs = await storage.getAvailableSubAssemblies(parseInt(bomId));
    res.json(availableBOMs);
  } catch (error) {
    console.error("Get available sub-assemblies error:", error);
    res.status(500).json({ error: "Failed to get available sub-assemblies" });
  }
});

// Create sub-assembly reference
router.post('/:parentBomId/sub-assemblies', async (req, res) => {
  try {
    const { parentBomId } = req.params;
    const { childBomId, partName, quantity, quantityMultiplier, notes } = req.body;
    
    if (!childBomId || !partName || !quantity) {
      return res.status(400).json({ error: "childBomId, partName, and quantity are required" });
    }

    const subAssemblyItem = await storage.createSubAssemblyReference(
      parseInt(parentBomId),
      parseInt(childBomId),
      partName,
      parseInt(quantity),
      quantityMultiplier ? parseInt(quantityMultiplier) : 1,
      notes
    );
    
    res.status(201).json(subAssemblyItem);
  } catch (error) {
    console.error("Create sub-assembly reference error:", error);
    res.status(500).json({ error: "Failed to create sub-assembly reference" });
  }
});

// Get hierarchical BOM structure
router.get('/:bomId/hierarchy', async (req, res) => {
  try {
    const { bomId } = req.params;
    const bomWithHierarchy = await storage.getBOMDetails(parseInt(bomId));
    
    if (!bomWithHierarchy) {
      return res.status(404).json({ error: "BOM not found" });
    }

    res.json({
      bom: bomWithHierarchy,
      hierarchicalItems: bomWithHierarchy.hierarchicalItems || []
    });
  } catch (error) {
    console.error("Get BOM hierarchy error:", error);
    res.status(500).json({ error: "Failed to get BOM hierarchy" });
  }
});

export default router;