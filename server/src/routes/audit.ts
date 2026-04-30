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
import { DEFAULT_AUDIT_EVENTS_LIMIT, MAX_AUDIT_EVENTS_LIMIT } from '../constants/audit';
import { db } from '../../db';
import { auditEvents } from '../../schema';
import { eq, and, or, desc, sql, inArray } from 'drizzle-orm';
import { requireAdminOrOwner, authenticateToken } from '../../middleware/auth';

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

// GET /api/audit/traveler-events?ids=id1,id2,id3
// Fetch audit events across multiple traveler IDs (for re-manufactured serial numbers).
// Each returned event includes a `travelerId` field indicating which traveler it belongs to.
router.get('/traveler-events', async (req: Request, res: Response) => {
  try {
    const rawIds = (req.query.ids as string) || '';
    const ids = rawIds.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'At least one traveler ID is required via ?ids=' });
    }
    const parsedLimit = parseInt(req.query.limit as string);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_AUDIT_EVENTS_LIMIT)
      : DEFAULT_AUDIT_EVENTS_LIMIT;

    const rows = await db
      .select()
      .from(auditEvents)
      .where(
        or(
          and(eq(auditEvents.entityType, 'traveler'), inArray(auditEvents.entityId, ids)),
          and(
            eq(auditEvents.entityType, 'traveler_step'),
            sql`${auditEvents.meta}->>'travelerId' = ANY(ARRAY[${sql.join(ids.map(id => sql`${id}`), sql`, `)}])`,
          ),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    // Annotate each event with the travelerId it belongs to
    const annotated = rows.map(event => ({
      ...event,
      travelerId:
        event.entityType === 'traveler'
          ? event.entityId
          : ((event.meta as Record<string, any>)?.travelerId ?? null),
    }));

    return res.json(annotated);
  } catch (error) {
    console.error('Error fetching multi-traveler audit events:', error);
    return res.status(500).json({ error: 'Failed to fetch traveler audit events' });
  }
});

// Get audit history for an entity
// Special case: when entityType = 'traveler', also returns step-level events
// (entityType='traveler_step') whose meta.travelerId matches the entityId.
// Special case: when entityType = 'vault_document', admin/owner role required.
router.get('/events/:entityType/:entityId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;

    // Vault document audit events contain sensitive metadata (actor IDs, IPs, document keys)
    // and are restricted to admin/owner users.
    if (entityType === 'vault_document') {
      const user = (req as any).user;
      if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
        return res.status(403).json({ error: 'Admin or Owner role required to view document audit history' });
      }
    }

    const parsedLimit = parseInt(req.query.limit as string);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_AUDIT_EVENTS_LIMIT)
      : DEFAULT_AUDIT_EVENTS_LIMIT;

    if (entityType === 'traveler') {
      const events = await db
        .select()
        .from(auditEvents)
        .where(
          or(
            and(eq(auditEvents.entityType, 'traveler'), eq(auditEvents.entityId, entityId)),
            and(
              eq(auditEvents.entityType, 'traveler_step'),
              sql`${auditEvents.meta}->>'travelerId' = ${entityId}`,
            ),
          ),
        )
        .orderBy(desc(auditEvents.createdAt))
        .limit(limit);
      return res.json(events);
    }

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

// Get unified timeline for an entity (combines all event types into chronological list)
router.get('/timeline/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    
    // Validate entityType
    const validEntityTypes = ['p1_order', 'p2_order', 'p2_serialized_item', 'p2_project'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }
    
    // Validate entityId
    if (!entityId || entityId.trim() === '') {
      return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    const { category, startDate, endDate, actor, limit: limitParam } = req.query;
    const limit = Math.min(parseInt(limitParam as string) || 200, 500); // Cap at 500

    const [events, transitions, scrapCycles] = await Promise.all([
      auditService.getAuditHistory(entityType, entityId, limit),
      auditService.getDepartmentTransitions(entityId),
      auditService.getScrapCycles(entityId),
    ]);

    // Transform all into unified timeline items
    const timelineItems: Array<{
      id: string;
      type: 'audit' | 'transition' | 'scrap';
      timestamp: Date;
      category: string;
      action: string;
      description: string;
      actor: string | null;
      details: Record<string, any>;
    }> = [];

    // Add audit events
    for (const event of events) {
      timelineItems.push({
        id: `audit-${event.id}`,
        type: 'audit',
        timestamp: new Date(event.timestamp || event.createdAt),
        category: getCategoryForAction(event.action),
        action: event.action,
        description: formatAuditAction(event.action, event.fieldsChanged),
        actor: event.actorName || null,
        details: {
          fieldsChanged: event.fieldsChanged,
          reason: event.reason,
          meta: event.meta,
        },
      });
    }

    // Add department transitions
    for (const transition of transitions) {
      timelineItems.push({
        id: `transition-entry-${transition.id}`,
        type: 'transition',
        timestamp: new Date(transition.enteredAt),
        category: 'production',
        action: 'DEPARTMENT_ENTRY',
        description: `Entered ${transition.department}`,
        actor: null, // Could look up enteredByUserId if needed
        details: {
          department: transition.department,
          cycleNumber: transition.cycleNumber,
          durationMinutes: transition.durationMinutes,
        },
      });

      if (transition.exitedAt) {
        timelineItems.push({
          id: `transition-exit-${transition.id}`,
          type: 'transition',
          timestamp: new Date(transition.exitedAt),
          category: 'production',
          action: 'DEPARTMENT_EXIT',
          description: `Exited ${transition.department}${transition.exitReason ? ` (${transition.exitReason})` : ''}`,
          actor: null,
          details: {
            department: transition.department,
            exitReason: transition.exitReason,
            durationMinutes: transition.durationMinutes,
          },
        });
      }
    }

    // Add scrap cycles
    for (const scrap of scrapCycles) {
      timelineItems.push({
        id: `scrap-${scrap.id}`,
        type: 'scrap',
        timestamp: new Date(scrap.scrappedAt),
        category: 'qc',
        action: 'SCRAP_CYCLE',
        description: `Scrapped in ${scrap.scrapDepartment || 'unknown department'}: ${scrap.scrapReason}`,
        actor: null,
        details: {
          cycleNumber: scrap.cycleNumber,
          scrapReason: scrap.scrapReason,
          scrapDepartment: scrap.scrapDepartment,
          restartEntityId: scrap.restartEntityId,
        },
      });

      if (scrap.restartedAt) {
        timelineItems.push({
          id: `restart-${scrap.id}`,
          type: 'scrap',
          timestamp: new Date(scrap.restartedAt),
          category: 'production',
          action: 'ORDER_RESTARTED',
          description: `Order restarted as ${scrap.restartEntityId || 'new order'}`,
          actor: null,
          details: {
            restartEntityId: scrap.restartEntityId,
            originalCycle: scrap.cycleNumber,
          },
        });
      }
    }

    // Sort by timestamp descending (newest first)
    timelineItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply filters
    let filtered = timelineItems;

    if (category && category !== 'all') {
      filtered = filtered.filter(item => item.category === category);
    }

    if (startDate) {
      const start = new Date(startDate as string);
      if (!isNaN(start.getTime())) {
        filtered = filtered.filter(item => item.timestamp >= start);
      }
    }

    if (endDate) {
      const end = new Date(endDate as string);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        filtered = filtered.filter(item => item.timestamp <= end);
      }
    }

    if (actor && typeof actor === 'string' && actor.trim() !== '') {
      const actorLower = actor.toLowerCase().trim();
      filtered = filtered.filter(item => 
        item.actor?.toLowerCase().includes(actorLower)
      );
    }

    res.json(filtered.slice(0, limit));
  } catch (error) {
    console.error('Error fetching unified timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// Helper functions for timeline
function getCategoryForAction(action: string): string {
  const categoryMap: Record<string, string> = {
    'DEPARTMENT_CHANGE': 'production',
    'STATUS_CHANGE': 'production',
    'TECHNICIAN_ASSIGNED': 'production',
    'PRIORITY_CHANGE': 'production',
    'SCRAP_DECLARED': 'qc',
    'ORDER_CANCELLED': 'production',
    'PAYMENT_RECEIVED': 'finance',
    'REFUND_ISSUED': 'finance',
    'DISCOUNT_APPLIED': 'finance',
    'PRICE_CHANGE': 'finance',
    'SHIPPING_UPDATE': 'shipping',
    'ADDRESS_CHANGED': 'shipping',
    'TRACKING_ADDED': 'shipping',
    'QC_PASSED': 'qc',
    'QC_FAILED': 'qc',
    'NCR_CREATED': 'qc',
    'ORDER_CREATED': 'production',
  };
  return categoryMap[action] || 'production';
}

function formatAuditAction(action: string, fieldsChanged: any): string {
  const actionLabels: Record<string, string> = {
    'DEPARTMENT_CHANGE': 'Department changed',
    'STATUS_CHANGE': 'Status updated',
    'TECHNICIAN_ASSIGNED': 'Technician assigned',
    'PRIORITY_CHANGE': 'Priority updated',
    'SCRAP_DECLARED': 'Scrap declared',
    'ORDER_CANCELLED': 'Order cancelled',
    'PAYMENT_RECEIVED': 'Payment received',
    'REFUND_ISSUED': 'Refund issued',
    'DISCOUNT_APPLIED': 'Discount applied',
    'PRICE_CHANGE': 'Price changed',
    'SHIPPING_UPDATE': 'Shipping updated',
    'ADDRESS_CHANGED': 'Address changed',
    'TRACKING_ADDED': 'Tracking number added',
    'QC_PASSED': 'QC passed',
    'QC_FAILED': 'QC failed',
    'NCR_CREATED': 'NCR created',
    'ORDER_CREATED': 'Order created',
  };

  let label = actionLabels[action] || action.replace(/_/g, ' ').toLowerCase();

  // Add field change details if available
  if (fieldsChanged && typeof fieldsChanged === 'object') {
    const fields = Object.keys(fieldsChanged);
    if (fields.length === 1) {
      const field = fields[0];
      const change = fieldsChanged[field];
      if (change?.before !== undefined && change?.after !== undefined) {
        label += `: ${change.before} → ${change.after}`;
      }
    }
  }

  return label;
}

// GET /api/audit/by-project/:projectId — all audit events related to a project
// Matches events where entityType = 'p2_project' AND entityId = projectId,
// OR events whose meta JSONB contains projectId.
router.get('/by-project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const parsedLimit = parseInt(req.query.limit as string);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_AUDIT_EVENTS_LIMIT)
      : DEFAULT_AUDIT_EVENTS_LIMIT;

    const events = await db.select()
      .from(auditEvents)
      .where(
        or(
          and(
            eq(auditEvents.entityType, 'p2_project'),
            eq(auditEvents.entityId, projectId)
          ),
          sql`${auditEvents.meta} @> ${JSON.stringify({ projectId })}::jsonb`
        )
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    res.json(events);
  } catch (error) {
    console.error('Error fetching audit events by project:', error);
    res.status(500).json({ error: 'Failed to fetch audit events by project' });
  }
});

// GET /api/audit/by-work-order/:workOrderId — all audit events related to a work order
// Matches events where entityType = 'work_order' AND entityId = workOrderId,
// OR events whose meta JSONB contains workOrderId.
router.get('/by-work-order/:workOrderId', async (req: Request, res: Response) => {
  try {
    const { workOrderId } = req.params;
    const parsedLimit = parseInt(req.query.limit as string);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_AUDIT_EVENTS_LIMIT)
      : DEFAULT_AUDIT_EVENTS_LIMIT;

    const events = await db.select()
      .from(auditEvents)
      .where(
        or(
          and(
            eq(auditEvents.entityType, 'work_order'),
            eq(auditEvents.entityId, workOrderId)
          ),
          sql`${auditEvents.meta} @> ${JSON.stringify({ workOrderId })}::jsonb`
        )
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    res.json(events);
  } catch (error) {
    console.error('Error fetching audit events by work order:', error);
    res.status(500).json({ error: 'Failed to fetch audit events by work order' });
  }
});

// GET /api/audit/by-user/:userId — all audit events for a given actor (by numeric actorId)
router.get('/by-user/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'userId must be a numeric employee ID' });
    }
    const parsedLimit = parseInt(req.query.limit as string);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_AUDIT_EVENTS_LIMIT)
      : DEFAULT_AUDIT_EVENTS_LIMIT;

    const events = await db.select()
      .from(auditEvents)
      .where(eq(auditEvents.actorId, userId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    res.json(events);
  } catch (error) {
    console.error('Error fetching audit events by user:', error);
    res.status(500).json({ error: 'Failed to fetch audit events by user' });
  }
});

// GET /api/audit/documents — query document audit events (admin only)
//
// Always filters to entityType = vault_document. Callers may pass
// ?resource_type=document explicitly (per NIST AU-2 reporting requirements);
// any other resource_type value returns a 400. Optional filters:
//   ?documentId=<id>         — filter by specific vault_document entity ID
//   ?documentKey=<objectPath>— filter by object storage key in meta
//   ?limit=<n>               — cap result count (max MAX_AUDIT_EVENTS_LIMIT)
router.get('/documents', ...requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const resourceType = req.query.resource_type as string | undefined;
    if (resourceType !== undefined && resourceType !== 'document') {
      return res.status(400).json({
        error: "Invalid resource_type. Only 'document' is supported on this endpoint.",
      });
    }

    const parsedLimit = parseInt(req.query.limit as string);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_AUDIT_EVENTS_LIMIT)
      : DEFAULT_AUDIT_EVENTS_LIMIT;

    const documentId = req.query.documentId as string | undefined;
    const documentKey = req.query.documentKey as string | undefined;

    const conditions: any[] = [eq(auditEvents.entityType, 'vault_document')];

    if (documentId) {
      conditions.push(eq(auditEvents.entityId, documentId));
    }

    if (documentKey) {
      conditions.push(sql`${auditEvents.meta}->>'documentKey' = ${documentKey}`);
    }

    const events = await db.select()
      .from(auditEvents)
      .where(and(...conditions))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    res.json(events);
  } catch (error) {
    console.error('Error fetching document audit events:', error);
    res.status(500).json({ error: 'Failed to fetch document audit events' });
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
