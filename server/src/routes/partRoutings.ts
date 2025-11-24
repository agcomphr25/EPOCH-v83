import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertPartRoutingSchema } from '../../schema';

const router = Router();

// Get all part routings with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { inventoryItemId, isActive } = req.query;
    
    const filters: { inventoryItemId?: string; isActive?: boolean } = {};
    
    if (inventoryItemId && typeof inventoryItemId === 'string') {
      filters.inventoryItemId = inventoryItemId;
    }
    
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    
    const routings = await storage.getPartRoutings(filters);
    res.json(routings);
  } catch (error: any) {
    console.error('Error fetching part routings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch part routings',
      message: error.message 
    });
  }
});

// Get part routing by part number (MUST be before /:id route)
router.get('/by-part/:partNumber', async (req: Request, res: Response) => {
  try {
    const { partNumber } = req.params;
    const routing = await storage.getPartRoutingByPartNumber(partNumber);
    
    if (!routing) {
      return res.status(404).json({ error: 'Part routing not found' });
    }
    
    res.json(routing);
  } catch (error: any) {
    console.error('Error fetching part routing by part number:', error);
    res.status(500).json({ 
      error: 'Failed to fetch part routing',
      message: error.message 
    });
  }
});

// Get part routing by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const routing = await storage.getPartRouting(id);
    
    if (!routing) {
      return res.status(404).json({ error: 'Part routing not found' });
    }
    
    res.json(routing);
  } catch (error: any) {
    console.error('Error fetching part routing:', error);
    res.status(500).json({ 
      error: 'Failed to fetch part routing',
      message: error.message 
    });
  }
});

// Create new part routing
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = insertPartRoutingSchema.parse(req.body);
    const routing = await storage.createPartRouting(validatedData);
    res.status(201).json(routing);
  } catch (error: any) {
    console.error('Error creating part routing:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create part routing',
      message: error.message 
    });
  }
});

// Update part routing
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = insertPartRoutingSchema.partial().parse(req.body);
    const routing = await storage.updatePartRouting(id, validatedData);
    res.json(routing);
  } catch (error: any) {
    console.error('Error updating part routing:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.errors 
      });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Part routing not found' });
    }
    
    res.status(500).json({ 
      error: 'Failed to update part routing',
      message: error.message 
    });
  }
});

// Delete part routing
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.deletePartRouting(id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting part routing:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Part routing not found' });
    }
    
    res.status(500).json({ 
      error: 'Failed to delete part routing',
      message: error.message 
    });
  }
});

export default router;
