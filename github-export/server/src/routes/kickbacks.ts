import { Router, Request, Response } from "express";
import { storage } from "../../storage";
import { insertKickbackSchema } from "../../schema";
import { z } from "zod";

const router = Router();

// Get all kickbacks
router.get('/', async (req: Request, res: Response) => {
  try {
    const kickbacks = await storage.getAllKickbacks();
    res.json(kickbacks);
  } catch (error) {
    console.error('Get all kickbacks error:', error);
    res.status(500).json({ error: "Failed to fetch kickbacks" });
  }
});

// Get kickbacks by order ID
router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const kickbacks = await storage.getKickbacksByOrderId(orderId);
    res.json(kickbacks);
  } catch (error) {
    console.error('Get kickbacks by order error:', error);
    res.status(500).json({ error: "Failed to fetch kickbacks for order" });
  }
});

// Get kickbacks by status
router.get('/status/:status', async (req: Request, res: Response) => {
  try {
    const { status } = req.params;
    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const kickbacks = await storage.getKickbacksByStatus(status as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED');
    res.json(kickbacks);
  } catch (error) {
    console.error('Get kickbacks by status error:', error);
    res.status(500).json({ error: "Failed to fetch kickbacks by status" });
  }
});

// Get kickbacks by department
router.get('/department/:department', async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    const kickbacks = await storage.getKickbacksByDepartment(department);
    res.json(kickbacks);
  } catch (error) {
    console.error('Get kickbacks by department error:', error);
    res.status(500).json({ error: "Failed to fetch kickbacks by department" });
  }
});

// Get kickback analytics
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateRange;
    if (startDate && endDate) {
      dateRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };
    }
    
    const analytics = await storage.getKickbackAnalytics(dateRange);
    res.json(analytics);
  } catch (error) {
    console.error('Get kickback analytics error:', error);
    res.status(500).json({ error: "Failed to fetch kickback analytics" });
  }
});

// Get single kickback
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid kickback ID" });
    }
    
    const kickback = await storage.getKickback(id);
    if (!kickback) {
      return res.status(404).json({ error: "Kickback not found" });
    }
    
    res.json(kickback);
  } catch (error) {
    console.error('Get kickback error:', error);
    res.status(500).json({ error: "Failed to fetch kickback" });
  }
});

// Create new kickback
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = insertKickbackSchema.parse(req.body);
    const kickback = await storage.createKickback(validatedData);
    res.status(201).json(kickback);
  } catch (error) {
    console.error('Create kickback error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid kickback data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create kickback" });
  }
});

// Update kickback
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid kickback ID" });
    }
    
    // Partial validation for updates
    const updateSchema = insertKickbackSchema.partial();
    const validatedData = updateSchema.parse(req.body);
    
    const kickback = await storage.updateKickback(id, validatedData);
    res.json(kickback);
  } catch (error) {
    console.error('Update kickback error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid kickback data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update kickback" });
  }
});

// Delete kickback
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid kickback ID" });
    }
    
    await storage.deleteKickback(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete kickback error:', error);
    res.status(500).json({ error: "Failed to delete kickback" });
  }
});

export default router;