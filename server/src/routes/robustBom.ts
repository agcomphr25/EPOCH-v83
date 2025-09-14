import { Router } from 'express';
import { z } from 'zod';
import { robustBomService } from '../services/robustBomService';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { 
  insertRobustPartSchema, 
  insertRobustBomLineSchema 
} from '@shared/schema';

const router = Router();

// SECURE: Get authenticated user from request (after authenticateToken middleware)
const getCurrentUser = (req: any) => {
  // Use authenticated user from middleware - NEVER trust headers
  if (!req.user || !req.user.username) {
    throw new Error('Authentication required - no valid user session');
  }
  return req.user.username;
};

// ============================================================================
// PARTS MANAGEMENT ROUTES
// ============================================================================

/**
 * GET /api/robust-bom/parts/search
 * Search parts with pagination and filtering
 */
router.get('/parts/search', authenticateToken, async (req, res) => {
  try {
    const { 
      q: query = '', 
      type = 'ALL', 
      lifecycleStatus = 'ALL',
      page = '1', 
      pageSize = '50' 
    } = req.query;

    const result = await robustBomService.searchParts({
      query: String(query),
      type: String(type),
      lifecycleStatus: String(lifecycleStatus),
      page: parseInt(String(page)),
      pageSize: Math.min(parseInt(String(pageSize)), 100) // Max 100 per page
    });

    res.json(result);
  } catch (error: any) {
    console.error('Parts search error:', error);
    res.status(500).json({ 
      error: 'Failed to search parts', 
      message: error.message 
    });
  }
});

/**
 * GET /api/robust-bom/parts/:id
 * Get part by ID with optional history
 */
router.get('/parts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const includeHistory = req.query.includeHistory === 'true';

    const part = await robustBomService.getPartById(id, includeHistory);
    res.json(part);
  } catch (error: any) {
    console.error('Get part error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Part not found', message: error.message });
    } else {
      res.status(500).json({ error: 'Failed to get part', message: error.message });
    }
  }
});

/**
 * POST /api/robust-bom/parts
 * Create new part
 */
router.post('/parts', authenticateToken, requireRole('ADMIN', 'ENGINEERING'), async (req, res) => {
  try {
    const partData = insertRobustPartSchema.parse(req.body);
    const createdBy = getCurrentUser(req);

    const newPart = await robustBomService.createPart(partData, createdBy);
    
    res.status(201).json(newPart);
  } catch (error: any) {
    console.error('Create part error:', error);
    if (error.message.includes('already exists')) {
      res.status(400).json({ error: 'Part already exists', message: error.message });
    } else if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    } else {
      res.status(500).json({ error: 'Failed to create part', message: error.message });
    }
  }
});

/**
 * PUT /api/robust-bom/parts/:id
 * Update existing part
 */
router.put('/parts/:id', authenticateToken, requireRole('ADMIN', 'ENGINEERING'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = insertRobustPartSchema.partial().parse(req.body);
    const { changeReason } = req.body;
    const updatedBy = getCurrentUser(req);

    const updatedPart = await robustBomService.updatePart(id, updates, updatedBy, changeReason);
    
    res.json(updatedPart);
  } catch (error: any) {
    console.error('Update part error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Part not found', message: error.message });
    } else if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    } else {
      res.status(500).json({ error: 'Failed to update part', message: error.message });
    }
  }
});

/**
 * PUT /api/robust-bom/parts/:id/lifecycle
 * Update part lifecycle status
 */
router.put('/parts/:id/lifecycle', authenticateToken, requireRole('ADMIN', 'ENGINEERING'), async (req, res) => {
  try {
    const { id } = req.params;
    const { lifecycleStatus, reason } = req.body;
    const updatedBy = getCurrentUser(req);

    if (!['ACTIVE', 'OBSOLETE', 'DISCONTINUED', 'PHASE_OUT'].includes(lifecycleStatus)) {
      return res.status(400).json({ 
        error: 'Invalid lifecycle status' 
      });
    }

    const updatedPart = await robustBomService.updatePartLifecycle(
      id, 
      lifecycleStatus, 
      updatedBy, 
      reason
    );
    
    res.json(updatedPart);
  } catch (error: any) {
    console.error('Update lifecycle error:', error);
    if (error.message.includes('Cannot obsolete')) {
      res.status(400).json({ error: 'Lifecycle change blocked', message: error.message });
    } else if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Part not found', message: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update lifecycle', message: error.message });
    }
  }
});

/**
 * GET /api/robust-bom/parts/:id/cost-history
 * Get cost history for a part
 */
router.get('/parts/:id/cost-history', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit || '50')), 100);

    const history = await robustBomService.getPartCostHistory(id, limit);
    res.json(history);
  } catch (error: any) {
    console.error('Get cost history error:', error);
    res.status(500).json({ error: 'Failed to get cost history', message: error.message });
  }
});

/**
 * GET /api/robust-bom/parts/:id/audit-log
 * Get audit log for a part
 */
router.get('/parts/:id/audit-log', authenticateToken, requireRole('ADMIN', 'ENGINEERING'), async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit || '100')), 200);

    const auditLog = await robustBomService.getPartAuditLog(id, limit);
    res.json(auditLog);
  } catch (error: any) {
    console.error('Get audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log', message: error.message });
  }
});

/**
 * GET /api/robust-bom/parts/:id/where-used
 * Get where-used information for a part
 */
router.get('/parts/:id/where-used', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const whereUsed = await robustBomService.getWhereUsed(id);
    res.json(whereUsed);
  } catch (error: any) {
    console.error('Get where-used error:', error);
    res.status(500).json({ error: 'Failed to get where-used data', message: error.message });
  }
});

// ============================================================================
// BOM OPERATIONS ROUTES
// ============================================================================

/**
 * GET /api/robust-bom/bom/:partId/tree
 * Get BOM tree structure with cost rollup
 */
router.get('/bom/:partId/tree', authenticateToken, async (req, res) => {
  try {
    const { partId } = req.params;
    const includeInactive = req.query.includeInactive === 'true';

    const bomTree = await robustBomService.getBomTree(partId, includeInactive);
    res.json(bomTree);
  } catch (error: any) {
    console.error('Get BOM tree error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Part not found', message: error.message });
    } else if (error.message.includes('depth exceeded')) {
      res.status(400).json({ error: 'BOM too deep', message: error.message });
    } else {
      res.status(500).json({ error: 'Failed to get BOM tree', message: error.message });
    }
  }
});

/**
 * GET /api/robust-bom/bom/:partId/cost-rollup
 * Calculate rolled-up cost for a part
 */
router.get('/bom/:partId/cost-rollup', authenticateToken, async (req, res) => {
  try {
    const { partId } = req.params;

    const rolledUpCost = await robustBomService.calculateRolledUpCost(partId);
    res.json({ 
      partId, 
      rolledUpCost, 
      currency: 'USD',
      calculatedAt: new Date().toISOString() 
    });
  } catch (error: any) {
    console.error('Cost rollup error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Part not found', message: error.message });
    } else {
      res.status(500).json({ error: 'Failed to calculate cost rollup', message: error.message });
    }
  }
});

/**
 * POST /api/robust-bom/bom/lines
 * Add BOM line
 */
router.post('/bom/lines', authenticateToken, requireRole('ADMIN', 'ENGINEERING'), async (req, res) => {
  try {
    const bomLineData = insertRobustBomLineSchema.parse(req.body);
    const createdBy = getCurrentUser(req);

    const bomLine = await robustBomService.addBomLine(bomLineData, createdBy);
    
    res.status(201).json(bomLine);
  } catch (error: any) {
    console.error('Add BOM line error:', error);
    if (error.message.includes('circular reference')) {
      res.status(400).json({ error: 'Circular reference', message: error.message });
    } else if (error.message.includes('minimum') || error.message.includes('maximum')) {
      res.status(400).json({ error: 'Quantity constraint violation', message: error.message });
    } else if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    } else {
      res.status(500).json({ error: 'Failed to add BOM line', message: error.message });
    }
  }
});

/**
 * PUT /api/robust-bom/bom/lines/:lineId
 * Update BOM line
 */
router.put('/bom/lines/:lineId', authenticateToken, requireRole('ADMIN', 'ENGINEERING'), async (req, res) => {
  try {
    const { lineId } = req.params;
    const updates = insertRobustBomLineSchema.partial().parse(req.body);
    // Implementation would go here - similar to updatePart
    
    res.json({ message: 'BOM line update not yet implemented' });
  } catch (error: any) {
    console.error('Update BOM line error:', error);
    res.status(500).json({ error: 'Failed to update BOM line', message: error.message });
  }
});

/**
 * DELETE /api/robust-bom/bom/lines/:lineId
 * Delete BOM line
 */
router.delete('/bom/lines/:lineId', authenticateToken, requireRole('ADMIN', 'ENGINEERING'), async (req, res) => {
  try {
    const { lineId } = req.params;
    // Implementation would go here
    
    res.json({ message: 'BOM line deletion not yet implemented' });
  } catch (error: any) {
    console.error('Delete BOM line error:', error);
    res.status(500).json({ error: 'Failed to delete BOM line', message: error.message });
  }
});

/**
 * POST /api/robust-bom/bom/:sourcePartId/clone/:targetPartId
 * Clone BOM structure from source to target part
 */
router.post('/bom/:sourcePartId/clone/:targetPartId', authenticateToken, requireRole('ADMIN', 'ENGINEERING'), async (req, res) => {
  try {
    const { sourcePartId, targetPartId } = req.params;
    const createdBy = getCurrentUser(req);

    const result = await robustBomService.cloneBom(sourcePartId, targetPartId, createdBy);
    
    res.json(result);
  } catch (error: any) {
    console.error('Clone BOM error:', error);
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'Part not found', message: error.message });
    } else {
      res.status(500).json({ error: 'Failed to clone BOM', message: error.message });
    }
  }
});

// ============================================================================
// UTILITY ROUTES
// ============================================================================

/**
 * GET /api/robust-bom/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'robust-bom-api',
    timestamp: new Date().toISOString() 
  });
});

/**
 * GET /api/robust-bom/stats
 * Get system statistics
 */
router.get('/stats', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    // This would be implemented to show system stats
    res.json({ message: 'Stats endpoint not yet implemented' });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

export default router;