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
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bom = await storage.getBOMDetails(parseInt(id));
    if (!bom) {
      return res.status(404).json({ error: "BOM not found" });
    }
    res.json(bom);
  } catch (error) {
    console.error("Get BOM details error:", error);
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
    const { id } = req.params;
    const itemData = insertBomItemSchema.omit({ bomId: true }).parse(req.body);
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
    const itemData = insertBomItemSchema.partial().omit({ bomId: true }).parse(req.body);
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

export default router;