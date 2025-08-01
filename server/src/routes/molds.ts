import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertMoldSchema } from '@shared/schema';

const router = Router();

// Get all molds
router.get('/', async (req: Request, res: Response) => {
  try {
    const molds = await storage.getAllMolds();
    res.json(molds);
  } catch (error) {
    console.error("Molds fetch error:", error);
    res.status(500).json({ error: "Failed to fetch molds" });
  }
});

// Get specific mold
router.get('/:moldId', async (req: Request, res: Response) => {
  try {
    const mold = await storage.getMold(req.params.moldId);
    if (mold) {
      res.json(mold);
    } else {
      res.status(404).json({ error: "Mold not found" });
    }
  } catch (error) {
    console.error("Mold fetch error:", error);
    res.status(500).json({ error: "Failed to fetch mold" });
  }
});

// Create new mold
router.post('/', async (req: Request, res: Response) => {
  try {
    const result = insertMoldSchema.parse(req.body);
    
    // Check if mold with this ID already exists
    const existingMold = await storage.getMold(result.moldId);
    if (existingMold) {
      return res.status(409).json({ error: "Mold with this ID already exists" });
    }
    
    const mold = await storage.createMold(result);
    res.json(mold);
  } catch (error) {
    console.error("Mold creation error:", error);
    if (error.code === '23505') {
      res.status(409).json({ error: "Mold with this ID already exists" });
    } else {
      res.status(400).json({ error: "Invalid mold data" });
    }
  }
});

// Update existing mold
router.put('/:moldId', async (req: Request, res: Response) => {
  try {
    // Ensure updatedAt is properly set
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    const mold = await storage.updateMold(req.params.moldId, updateData);
    res.json(mold);
  } catch (error) {
    console.error("Mold update error:", error);
    res.status(400).json({ error: "Failed to update mold" });
  }
});

// Delete mold
router.delete('/:moldId', async (req: Request, res: Response) => {
  try {
    await storage.deleteMold(req.params.moldId);
    res.json({ success: true });
  } catch (error) {
    console.error("Mold deletion error:", error);
    res.status(500).json({ error: "Failed to delete mold" });
  }
});

export default router;