/**
 * Attention & State-Confidence Routes
 * 
 * Provides endpoints for:
 * - Confirming entity state
 * - Getting attention dashboard data
 * - Managing staleness configuration
 */

import { Router } from 'express';
import { sessionAwareAuth, requireRole } from '../../middleware/auth';
import { attentionStateService } from '../services/attentionStateService';
import { z } from 'zod';

const router = Router();

// Confirm entity state - low-friction action to mark state as still accurate
const confirmSchema = z.object({
  entityType: z.enum(['ticket', 'order', 'qc_item', 'production_delay']),
  entityId: z.string().min(1),
  confirmationNote: z.string().max(500).optional(),
});

router.post('/confirm', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const data = confirmSchema.parse(req.body);
    
    const result = await attentionStateService.confirmEntityState(
      data.entityType,
      data.entityId,
      user.id,
      user.username,
      data.confirmationNote
    );

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('[Attention] Error confirming state:', error);
    res.status(500).json({ error: 'Failed to confirm state' });
  }
});

// Get attention dashboard data (admin only)
router.get('/dashboard', sessionAwareAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const dashboard = await attentionStateService.getAttentionDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('[Attention] Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch attention dashboard' });
  }
});

// Get attention metrics for a specific entity type
router.get('/metrics/:entityType', sessionAwareAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { entityType } = req.params;
    const validTypes = ['ticket', 'order', 'qc_item', 'production_delay'];
    
    if (!validTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    const dashboard = await attentionStateService.getAttentionDashboard();
    
    switch (entityType) {
      case 'ticket':
        res.json({ metrics: dashboard.tickets, summary: dashboard.summary });
        break;
      case 'order':
        res.json({ metrics: dashboard.orders, summary: dashboard.summary });
        break;
      case 'qc_item':
        res.json({ metrics: dashboard.qcItems, summary: dashboard.summary });
        break;
      case 'production_delay':
        res.json({ metrics: dashboard.productionDelays, summary: dashboard.summary });
        break;
    }
  } catch (error) {
    console.error('[Attention] Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch attention metrics' });
  }
});

export default router;
