/**
 * Audit API Routes
 * 
 * Endpoints for:
 * - Getting/updating audit settings
 * - Retrieving audit history for entities
 * - Getting department transitions and time summaries
 * - Getting scrap cycle history
 */

import { Router, Request, Response } from 'express';
import { auditService } from '../services/auditService';
import { z } from 'zod';

const router = Router();

// Get all audit settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await auditService.getAllSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching audit settings:', error);
    res.status(500).json({ error: 'Failed to fetch audit settings' });
  }
});

// Update an audit setting
router.patch('/settings/:eventType', async (req: Request, res: Response) => {
  try {
    const { eventType } = req.params;
    const { isEnabled } = req.body;

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({ error: 'isEnabled must be a boolean' });
    }

    const success = await auditService.updateSetting(eventType, isEnabled);
    
    if (!success) {
      return res.status(400).json({ error: 'Cannot disable critical event types' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating audit setting:', error);
    res.status(500).json({ error: 'Failed to update audit setting' });
  }
});

// Get audit history for an entity
router.get('/events/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const events = await auditService.getAuditHistory(entityType, entityId, limit);
    res.json(events);
  } catch (error) {
    console.error('Error fetching audit events:', error);
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

// Get department transitions for an entity
router.get('/transitions/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityId } = req.params;
    const cycleNumber = req.query.cycle ? parseInt(req.query.cycle as string) : undefined;

    const transitions = await auditService.getDepartmentTransitions(entityId, cycleNumber);
    res.json(transitions);
  } catch (error) {
    console.error('Error fetching department transitions:', error);
    res.status(500).json({ error: 'Failed to fetch department transitions' });
  }
});

// Get department time summary for an entity
router.get('/time-summary/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityId } = req.params;

    const summary = await auditService.getDepartmentTimeSummary(entityId);
    res.json(summary);
  } catch (error) {
    console.error('Error fetching time summary:', error);
    res.status(500).json({ error: 'Failed to fetch time summary' });
  }
});

// Get scrap cycles for an entity
router.get('/scrap-cycles/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityId } = req.params;

    const cycles = await auditService.getScrapCycles(entityId);
    res.json(cycles);
  } catch (error) {
    console.error('Error fetching scrap cycles:', error);
    res.status(500).json({ error: 'Failed to fetch scrap cycles' });
  }
});

// Get comprehensive audit data for an entity (events + transitions + scrap cycles)
router.get('/full/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;

    const [events, transitions, scrapCycles, timeSummary] = await Promise.all([
      auditService.getAuditHistory(entityType, entityId),
      auditService.getDepartmentTransitions(entityId),
      auditService.getScrapCycles(entityId),
      auditService.getDepartmentTimeSummary(entityId),
    ]);

    res.json({
      events,
      transitions,
      scrapCycles,
      timeSummary,
    });
  } catch (error) {
    console.error('Error fetching full audit data:', error);
    res.status(500).json({ error: 'Failed to fetch audit data' });
  }
});

// Manually log an audit event (for special cases)
router.post('/log', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      entityType: z.enum(['p1_order', 'p2_order', 'p2_serialized_item', 'p2_project']),
      entityId: z.string(),
      action: z.string(),
      reason: z.string().optional(),
      meta: z.record(z.any()).optional(),
    });

    const data = schema.parse(req.body);
    
    // Get actor from session
    const actor = (req as any).user ? {
      id: (req as any).user.id,
      username: (req as any).user.username,
      role: (req as any).user.role,
    } : undefined;

    const eventId = await auditService.logEvent({
      ...data,
      actor,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, eventId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    console.error('Error logging audit event:', error);
    res.status(500).json({ error: 'Failed to log audit event' });
  }
});

export default router;
