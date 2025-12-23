import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertPartRoutingSchema } from '../../schema';

const router = Router();

// Middleware to log all requests to this router
router.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[PartRoutings] ${req.method} ${req.path} Content-Type: ${req.get('Content-Type')}`);
  next();
});

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
    console.log('[PartRouting POST] ========== REQUEST DEBUG ==========');
    console.log('[PartRouting POST] Request keys:', Object.keys(req.body || {}));
    console.log('[PartRouting POST] Full body:', JSON.stringify(req.body, null, 2));
    console.log('[PartRouting POST] =====================================');
    
    const validatedData = insertPartRoutingSchema.parse(req.body);
    console.log('[PartRouting POST] Validation passed, creating routing...');
    const routing = await storage.createPartRouting(validatedData);
    res.status(201).json(routing);
  } catch (error: any) {
    console.error('[PartRouting POST] ========== ERROR ==========');
    console.error('[PartRouting POST] Error type:', error.constructor.name);
    console.error('[PartRouting POST] Error message:', error.message);
    
    if (error instanceof z.ZodError) {
      console.error('[PartRouting POST] Zod validation FAILED');
      console.error('[PartRouting POST] Issues array:', JSON.stringify(error.issues, null, 2));
      console.error('[PartRouting POST] Received keys:', Object.keys(req.body || {}));
      console.error('[PartRouting POST] ===========================');
      
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'One or more fields failed validation',
        receivedKeys: Object.keys(req.body || {}),
        issues: error.issues,
        details: error.errors.map(e => ({
          path: e.path.join('.'),
          code: e.code,
          message: e.message,
          received: e.path.reduce((obj: any, key) => obj?.[key], req.body)
        }))
      });
    }
    
    console.error('[PartRouting POST] Non-Zod error:', error);
    console.error('[PartRouting POST] ===========================');
    
    res.status(500).json({ 
      error: 'Failed to create part routing',
      message: error.message 
    });
  }
});

// Update part routing
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    console.log('[PartRouting PATCH] ========== REQUEST DEBUG ==========');
    console.log('[PartRouting PATCH] ID:', req.params.id);
    console.log('[PartRouting PATCH] Request keys:', Object.keys(req.body || {}));
    console.log('[PartRouting PATCH] Full body:', JSON.stringify(req.body, null, 2));
    console.log('[PartRouting PATCH] =====================================');
    
    const { id } = req.params;
    const validatedData = insertPartRoutingSchema.partial().parse(req.body);
    const routing = await storage.updatePartRouting(id, validatedData);
    res.json(routing);
  } catch (error: any) {
    console.error('[PartRouting PATCH] Error:', error);
    
    if (error instanceof z.ZodError) {
      console.error('[PartRouting PATCH] Zod validation FAILED');
      console.error('[PartRouting PATCH] Issues:', JSON.stringify(error.issues, null, 2));
      
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'One or more fields failed validation',
        receivedKeys: Object.keys(req.body || {}),
        issues: error.issues,
        details: error.errors.map(e => ({
          path: e.path.join('.'),
          code: e.code,
          message: e.message,
          received: e.path.reduce((obj: any, key) => obj?.[key], req.body)
        }))
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
