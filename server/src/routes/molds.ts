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
    const mold = await storage.createMold(result);
    res.json(mold);
  } catch (error) {
    console.error("Mold creation error:", error);
    res.status(400).json({ error: "Invalid mold data" });
  }
});

// Update existing mold
router.put('/:moldId', async (req: Request, res: Response) => {
  try {
    // Clean the update data to ensure proper timestamp handling
    const updateData = { ...req.body };
    
    // Remove any timestamp fields that might cause issues
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.id; // Remove ID to prevent conflicts
    
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
  } catch (error: any) {
    console.error("Mold deletion error:", error);
    
    // Check if it's a foreign key constraint error
    if (error.code === '23503' && error.constraint === 'layup_schedule_mold_id_fkey') {
      res.status(400).json({ 
        error: "Cannot delete mold - it is currently used in the layup schedule. Please clear the schedule first or disable the mold instead.",
        constraint: "referenced_in_schedule"
      });
    } else {
      res.status(500).json({ error: "Failed to delete mold" });
    }
  }
});

// Add endpoint to check if mold is referenced in schedule
router.get('/:moldId/references', async (req: Request, res: Response) => {
  try {
    const { storage } = await import('../../storage');
    const schedule = await storage.getAllLayupSchedule();
    const references = schedule.filter((entry: any) => entry.moldId === req.params.moldId);
    
    res.json({
      isReferenced: references.length > 0,
      referenceCount: references.length,
      references: references.map((ref: any) => ({
        orderId: ref.orderId,
        scheduledDate: ref.scheduledDate
      }))
    });
  } catch (error) {
    console.error("Reference check error:", error);
    res.status(500).json({ error: "Failed to check references" });
  }
});

// Add endpoint to clear schedule references for a mold
router.delete('/:moldId/schedule-references', async (req: Request, res: Response) => {
  try {
    const { storage } = await import('../../storage');
    await storage.clearMoldFromSchedule(req.params.moldId);
    res.json({ success: true, message: "Cleared all schedule references for this mold" });
  } catch (error) {
    console.error("Clear references error:", error);
    res.status(500).json({ error: "Failed to clear schedule references" });
  }
});

export default router;