import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  insertMrpRequirementSchema,
  updateMrpRequirementSchema
} from '@shared/schema';

const router = Router();

// ============================================================================
// MRP CALCULATION & PLANNING ROUTES
// ============================================================================

// Run full MRP calculation
router.post('/calculate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { scope = 'ALL', scopeId } = req.body;
    
    if (!['ALL', 'SPECIFIC_PART', 'SPECIFIC_ORDER'].includes(scope)) {
      return res.status(400).json({ error: "scope must be 'ALL', 'SPECIFIC_PART', or 'SPECIFIC_ORDER'" });
    }
    
    if ((scope === 'SPECIFIC_PART' || scope === 'SPECIFIC_ORDER') && !scopeId) {
      return res.status(400).json({ error: "scopeId is required for SPECIFIC_PART or SPECIFIC_ORDER scope" });
    }
    
    const result = await storage.calculateMrpRequirements(scope, scopeId);
    res.json(result);
  } catch (error) {
    console.error('Calculate MRP requirements error:', error);
    res.status(500).json({ error: "Failed to calculate MRP requirements" });
  }
});

// Get MRP requirements with filtering
router.get('/requirements', async (req: Request, res: Response) => {
  try {
    const { partId, status, needDateFrom, needDateTo } = req.query;
    
    const params = {
      partId: partId as string,
      status: status as string,
      needDateFrom: needDateFrom ? new Date(needDateFrom as string) : undefined,
      needDateTo: needDateTo ? new Date(needDateTo as string) : undefined
    };
    
    const requirements = await storage.getMrpRequirements(params);
    res.json(requirements);
  } catch (error) {
    console.error('Get MRP requirements error:', error);
    res.status(500).json({ error: "Failed to fetch MRP requirements" });
  }
});

// Get MRP shortages
router.get('/shortages', async (req: Request, res: Response) => {
  try {
    const shortages = await storage.getMrpShortages();
    res.json(shortages);
  } catch (error) {
    console.error('Get MRP shortages error:', error);
    res.status(500).json({ error: "Failed to fetch MRP shortages" });
  }
});

// Update MRP requirement
router.put('/requirements/:requirementId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { requirementId } = req.params;
    const updateData = updateMrpRequirementSchema.parse(req.body);
    
    const updatedRequirement = await storage.updateMrpRequirement(requirementId, updateData);
    res.json(updatedRequirement);
  } catch (error) {
    console.error('Update MRP requirement error:', error);
    res.status(500).json({ error: "Failed to update MRP requirement" });
  }
});

// Close MRP requirement
router.post('/requirements/:requirementId/close', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { requirementId } = req.params;
    
    await storage.closeMrpRequirement(requirementId);
    res.json({ success: true, message: "MRP requirement closed successfully" });
  } catch (error) {
    console.error('Close MRP requirement error:', error);
    res.status(500).json({ error: "Failed to close MRP requirement" });
  }
});

// Get MRP calculation history
router.get('/calculation-history', async (req: Request, res: Response) => {
  try {
    const { limit = '50' } = req.query;
    
    const history = await storage.getMrpCalculationHistory(parseInt(limit as string));
    res.json(history);
  } catch (error) {
    console.error('Get MRP calculation history error:', error);
    res.status(500).json({ error: "Failed to fetch MRP calculation history" });
  }
});

// ============================================================================
// ROBUST PARTS INTEGRATION ROUTES
// ============================================================================

// Get all robust parts with filtering
router.get('/parts', async (req: Request, res: Response) => {
  try {
    const { q, type, active, page = '1', limit = '50' } = req.query;
    
    const params = {
      q: q as string,
      type: type as string,
      active: active === 'true',
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    };
    
    const parts = await storage.getAllRobustParts(params);
    res.json(parts);
  } catch (error) {
    console.error('Get robust parts error:', error);
    res.status(500).json({ error: "Failed to fetch robust parts" });
  }
});

// Get specific robust part
router.get('/parts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const part = await storage.getRobustPart(id);
    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }
    
    res.json(part);
  } catch (error) {
    console.error('Get robust part error:', error);
    res.status(500).json({ error: "Failed to fetch robust part" });
  }
});

// Get part by SKU
router.get('/parts/sku/:sku', async (req: Request, res: Response) => {
  try {
    const { sku } = req.params;
    
    const part = await storage.getRobustPartBySku(sku);
    if (!part) {
      return res.status(404).json({ error: "Part not found" });
    }
    
    res.json(part);
  } catch (error) {
    console.error('Get robust part by SKU error:', error);
    res.status(500).json({ error: "Failed to fetch robust part" });
  }
});

// ============================================================================
// BOM MANAGEMENT ROUTES
// ============================================================================

// Get BOM lines for a part
router.get('/parts/:partId/bom', async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    
    const bomLines = await storage.getBomLinesForPart(partId);
    res.json(bomLines);
  } catch (error) {
    console.error('Get BOM lines error:', error);
    res.status(500).json({ error: "Failed to fetch BOM lines" });
  }
});

// Get BOM lines by parent part
router.get('/parts/:parentPartId/children', async (req: Request, res: Response) => {
  try {
    const { parentPartId } = req.params;
    
    const bomLines = await storage.getBomLinesByParent(parentPartId);
    res.json(bomLines);
  } catch (error) {
    console.error('Get BOM lines by parent error:', error);
    res.status(500).json({ error: "Failed to fetch BOM lines" });
  }
});

// Explode BOM for a part (get all component requirements)
router.post('/parts/:partId/explode', async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    const { quantity = 1 } = req.body;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: "Quantity must be a positive number" });
    }
    
    const explodedBom = await storage.explodeBom(partId, quantity);
    res.json(explodedBom);
  } catch (error) {
    console.error('Explode BOM error:', error);
    res.status(500).json({ error: "Failed to explode BOM" });
  }
});

export default router;