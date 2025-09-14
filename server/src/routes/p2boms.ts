import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  insertBomDefinitionSchema,
  insertBomItemSchema,
  type BomDefinition,
  type BomItem
} from '../../schema';

const router = Router();

// ============================================================================
// BOM DEFINITIONS CRUD
// ============================================================================

// GET /api/boms - List all BOM definitions
router.get('/', async (req: Request, res: Response) => {
  try {
    const boms = await storage.getAllBOMs();
    res.json(boms);
  } catch (error) {
    console.error('Get BOMs error:', error);
    res.status(500).json({ error: 'Failed to fetch BOMs' });
  }
});

// GET /api/boms/:id - Get specific BOM definition
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.id);
    const bom = await storage.getBOMDefinition(bomId);
    
    if (!bom) {
      return res.status(404).json({ error: 'BOM not found' });
    }
    
    res.json(bom);
  } catch (error) {
    console.error('Get BOM error:', error);
    res.status(500).json({ error: 'Failed to fetch BOM' });
  }
});

// POST /api/boms - Create new BOM definition
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const bomData = insertBomDefinitionSchema.parse(req.body);
    const newBom = await storage.createBOM(bomData);
    res.status(201).json(newBom);
  } catch (error) {
    console.error('Create BOM error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create BOM' });
  }
});

// PUT /api/boms/:id - Update BOM definition
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.id);
    const updates = insertBomDefinitionSchema.partial().parse(req.body);
    const updatedBom = await storage.updateBOM(bomId, updates);
    
    if (!updatedBom) {
      return res.status(404).json({ error: 'BOM not found' });
    }
    
    res.json(updatedBom);
  } catch (error) {
    console.error('Update BOM error:', error);
    res.status(500).json({ error: 'Failed to update BOM' });
  }
});

// DELETE /api/boms/:id - Delete BOM definition (mark as inactive)
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.id);
    // Mark as inactive instead of hard delete
    const updatedBom = await storage.updateBOM(bomId, { isActive: false });
    
    if (!updatedBom) {
      return res.status(404).json({ error: 'BOM not found' });
    }
    
    res.status(204).end();
  } catch (error) {
    console.error('Delete BOM error:', error);
    res.status(500).json({ error: 'Failed to delete BOM' });
  }
});

// ============================================================================
// BOM DETAILS WITH ITEMS
// ============================================================================

// GET /api/boms/:bomId/details - Get BOM with all items
router.get('/:bomId/details', async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.bomId);
    const bomWithItems = await storage.getBOMDetails(bomId);
    
    if (!bomWithItems) {
      return res.status(404).json({ error: 'BOM not found' });
    }
    
    res.json(bomWithItems);
  } catch (error) {
    console.error('Get BOM details error:', error);
    res.status(500).json({ error: 'Failed to fetch BOM details' });
  }
});

// GET /api/boms/:bomId/hierarchy - Get BOM hierarchical structure
router.get('/:bomId/hierarchy', async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.bomId);
    const bomDetails = await storage.getBOMDetails(bomId);
    res.json({
      hierarchicalItems: bomDetails?.hierarchicalItems || []
    });
  } catch (error) {
    console.error('Get BOM hierarchy error:', error);
    res.status(500).json({ error: 'Failed to fetch BOM hierarchy' });
  }
});

// ============================================================================
// BOM ITEMS CRUD
// ============================================================================

// POST /api/boms/:bomId/items - Add item to BOM
router.post('/:bomId/items', authenticateToken, async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.bomId);
    const itemData = insertBomItemSchema.parse({
      ...req.body,
      bomId
    });
    
    const newItem = await storage.addBOMItem(bomId, itemData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error('Create BOM item error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create BOM item' });
  }
});

// PUT /api/boms/:bomId/items/:itemId - Update BOM item
router.put('/:bomId/items/:itemId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.bomId);
    const itemId = parseInt(req.params.itemId);
    const updates = insertBomItemSchema.partial().parse(req.body);
    const updatedItem = await storage.updateBOMItem(bomId, itemId, updates);
    
    if (!updatedItem) {
      return res.status(404).json({ error: 'BOM item not found' });
    }
    
    res.json(updatedItem);
  } catch (error) {
    console.error('Update BOM item error:', error);
    res.status(500).json({ error: 'Failed to update BOM item' });
  }
});

// DELETE /api/boms/:bomId/items/:itemId - Delete BOM item (mark as inactive)
router.delete('/:bomId/items/:itemId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.bomId);
    const itemId = parseInt(req.params.itemId);
    // Mark as inactive instead of hard delete
    const updatedItem = await storage.updateBOMItem(bomId, itemId, { isActive: false });
    
    if (!updatedItem) {
      return res.status(404).json({ error: 'BOM item not found' });
    }
    
    res.status(204).end();
  } catch (error) {
    console.error('Delete BOM item error:', error);
    res.status(500).json({ error: 'Failed to delete BOM item' });
  }
});

// ============================================================================
// SUB-ASSEMBLIES
// ============================================================================

// GET /api/boms/:bomId/available-sub-assemblies - Get BOMs that can be used as sub-assemblies
router.get('/:bomId/available-sub-assemblies', async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.bomId);
    const availableBoms = await storage.getAvailableSubAssemblies(bomId);
    res.json(availableBoms);
  } catch (error) {
    console.error('Get available sub-assemblies error:', error);
    res.status(500).json({ error: 'Failed to fetch available sub-assemblies' });
  }
});

// POST /api/boms/:bomId/sub-assemblies - Add sub-assembly to BOM
router.post('/:bomId/sub-assemblies', authenticateToken, async (req: Request, res: Response) => {
  try {
    const bomId = parseInt(req.params.bomId);
    const { childBomId, partName, quantity, quantityMultiplier, notes } = req.body;
    
    const subAssemblyItem = await storage.createSubAssemblyReference(
      bomId,
      childBomId,
      partName,
      quantity,
      quantityMultiplier || 1,
      notes
    );
    
    res.status(201).json(subAssemblyItem);
  } catch (error) {
    console.error('Create sub-assembly error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create sub-assembly' });
  }
});

export default router;