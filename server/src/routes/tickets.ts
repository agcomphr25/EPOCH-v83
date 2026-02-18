import { Router } from 'express';
import { storage } from '../../storage';
import { sessionAwareAuth, requireRole } from '../../middleware/auth';
import { insertTicketSchema, insertTicketActivitySchema, tickets } from '../../schema';
import { z } from 'zod';
import { pool, db } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { auditService } from '../services/auditService';
import { notificationManager } from '../services/notificationManager';

// In-memory session-based deduplication for TICKET_VIEWED events
// Key: `${userId}-${ticketId}`, Value: timestamp of last view in this session
const ticketViewCache = new Map<string, number>();
const VIEW_DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes - don't log repeat views within this window

const router = Router();

const CSR_ADMIN_ROLES = ['ADMIN', 'OWNER', 'CSR'];
const WRITE_ROLES = ['ADMIN', 'OWNER'];
const TICKET_WRITE_USERS = ['darleneb', 'staciw'];

const updateTicketSchema = z.object({
  status: z.enum(['new', 'in_progress', 'waiting_on_customer', 'waiting_on_production', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  ownerUserId: z.number().optional(),
  assignedUserId: z.number().nullable().optional(),
  assignedUserIds: z.array(z.number()).optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
});

// Read access for all authenticated users
function hasReadAccess(user: any): boolean {
  return !!user;
}

function hasWriteAccess(user: any): boolean {
  return user && (WRITE_ROLES.includes(user.role) || TICKET_WRITE_USERS.includes(user.username?.toLowerCase()));
}

router.get('/', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasReadAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filters = {
      status: req.query.status as string | undefined,
      ticketType: req.query.ticketType as string | undefined,
      priority: req.query.priority as string | undefined,
      ownerUserId: req.query.ownerUserId ? parseInt(req.query.ownerUserId as string) : undefined,
      slaBreached: req.query.slaBreached === 'true' ? true : req.query.slaBreached === 'false' ? false : undefined,
      archived: req.query.archived === 'true' ? true : false,
    };

    let ticketsList = await storage.getTickets(filters);

    const orderId = req.query.orderId as string | undefined;
    if (orderId) {
      const linkedTickets = await db.execute(sql`
        SELECT DISTINCT ticket_id FROM ticket_orders WHERE order_id = ${orderId}
      `);
      const linkedIds = new Set(linkedTickets.rows.map((r: any) => r.ticket_id));
      ticketsList = ticketsList.filter((t: any) => linkedIds.has(t.id));
    }

    res.json(ticketsList);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/metrics', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasReadAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const metrics = await storage.getTicketMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching ticket metrics:', error);
    res.status(500).json({ error: 'Failed to fetch ticket metrics' });
  }
});

router.get('/:id', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasReadAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const ticketId = req.params.id;
    const ticket = await storage.getTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // === ENGAGEMENT TRACKING ===
    // Use session ID for true per-session deduplication
    const sessionId = (req as any).sessionID || req.get('x-session-id') || `anon-${req.ip}`;
    let viewedByData = { ...(ticket.viewedBy || {}) };
    
    if (user?.id) {
      const userId = user.id;
      const sessionKey = `${userId}-${ticketId}-${sessionId}`;
      const now = Date.now();
      const lastView = ticketViewCache.get(sessionKey);

      // Per-session deduplication: only log once per user/ticket/session
      const shouldLogView = !lastView;

      if (shouldLogView) {
        // Mark as viewed in this session (no time window - truly once per session)
        ticketViewCache.set(sessionKey, now);

        // Determine assignment status for the viewing user
        const isAssignee = ticket.assignedUserId === userId || 
          (ticket.assignedUserIds && ticket.assignedUserIds.includes(userId));
        const isOwner = ticket.ownerUserId === userId;

        // Log TICKET_VIEWED audit event (non-blocking)
        auditService.logEvent({
          entityType: 'ticket',
          entityId: ticketId,
          action: 'TICKET_VIEWED',
          actor: {
            id: userId,
            username: user.username,
            role: user.role,
          },
          meta: {
            ticketStatus: ticket.status,
            assignmentStatus: isAssignee ? 'assignee' : isOwner ? 'owner' : 'viewer',
            sessionId,
          },
          ipAddress: req.ip || undefined,
          userAgent: req.get('user-agent') || undefined,
        }).catch(err => console.error('[Ticket] Failed to log TICKET_VIEWED:', err));

        // Update viewedBy tracking synchronously so response reflects current view
        const nowIso = new Date().toISOString();
        viewedByData[userId.toString()] = nowIso;
        
        // Persist to DB (non-blocking but use updated data in response)
        db.update(tickets)
          .set({ viewedBy: viewedByData })
          .where(eq(tickets.id, ticketId))
          .catch(err => console.error('[Ticket] Failed to update viewedBy:', err));
      }
    }

    // Compute hasSeenLatestUpdate for each assignee (admin visibility)
    // Use viewedByData which includes the current view
    const viewedBy = viewedByData;
    const updatedAt = ticket.updatedAt ? new Date(ticket.updatedAt).getTime() : 0;
    
    const engagementMetrics: Record<string, { lastViewedAt: string | null; hasSeenLatestUpdate: boolean }> = {};
    
    // Add current user's engagement status
    if (user?.id) {
      const userViewedAt = viewedBy[user.id.toString()];
      engagementMetrics[user.id.toString()] = {
        lastViewedAt: userViewedAt || null,
        hasSeenLatestUpdate: userViewedAt ? new Date(userViewedAt).getTime() >= updatedAt : false,
      };
    }

    // Add all assignees' engagement status (for admin views)
    const allAssignees = [...(ticket.assignedUserIds || [])];
    if (ticket.assignedUserId && !allAssignees.includes(ticket.assignedUserId)) {
      allAssignees.push(ticket.assignedUserId);
    }
    
    for (const assigneeId of allAssignees) {
      const assigneeViewedAt = viewedBy[assigneeId.toString()];
      engagementMetrics[assigneeId.toString()] = {
        lastViewedAt: assigneeViewedAt || null,
        hasSeenLatestUpdate: assigneeViewedAt ? new Date(assigneeViewedAt).getTime() >= updatedAt : false,
      };
    }

    // Return ticket with engagement data
    res.json({
      ...ticket,
      engagementMetrics,
      currentUserHasSeenLatest: user?.id ? 
        (viewedBy[user.id.toString()] ? new Date(viewedBy[user.id.toString()]).getTime() >= updatedAt : false) : null,
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

/**
 * POST /:id/acknowledge - Mark ticket as reviewed (optional acknowledgement)
 * Low-friction engagement signal - user explicitly acknowledges they've seen the ticket
 */
router.post('/:id/acknowledge', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasWriteAccess(user)) {
      return res.status(403).json({ error: 'Write access denied. Only admins can modify tickets.' });
    }

    const ticketId = req.params.id;
    const ticket = await storage.getTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const userId = user.id;
    const now = new Date().toISOString();

    // Update viewedBy with acknowledgement timestamp
    const viewedByUpdate = {
      ...(ticket.viewedBy || {}),
      [userId.toString()]: now,
    };

    await db.update(tickets)
      .set({ viewedBy: viewedByUpdate })
      .where(eq(tickets.id, ticketId));

    // Log TICKET_ACKNOWLEDGED audit event
    await auditService.logEvent({
      entityType: 'ticket',
      entityId: ticketId,
      action: 'TICKET_ACKNOWLEDGED',
      actor: {
        id: userId,
        username: user.username,
        role: user.role,
      },
      meta: {
        ticketStatus: ticket.status,
        ticketPriority: ticket.priority,
        acknowledgedAt: now,
      },
      ipAddress: req.ip || undefined,
      userAgent: req.get('user-agent') || undefined,
    });

    res.json({ 
      success: true, 
      acknowledgedAt: now,
      message: 'Ticket acknowledged successfully',
    });
  } catch (error) {
    console.error('Error acknowledging ticket:', error);
    res.status(500).json({ error: 'Failed to acknowledge ticket' });
  }
});

/**
 * POST /:id/confirm-state - Confirm ticket state is still accurate
 * Low-friction action: "Confirm Status" / "Still Waiting / No Change"
 * Updates lastConfirmedAt without requiring comments
 */
router.post('/:id/confirm-state', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasWriteAccess(user)) {
      return res.status(403).json({ error: 'Write access denied. Only admins can modify tickets.' });
    }

    const ticketId = req.params.id;
    const ticket = await storage.getTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const userId = user.id;
    const now = new Date();
    const nowIso = now.toISOString();
    const { confirmationNote } = req.body;

    // Update confirmation fields
    await db.update(tickets)
      .set({ 
        lastConfirmedAt: now,
        lastConfirmedByUserId: userId,
        confirmationNote: confirmationNote || null,
        attentionRisk: null, // Reset risk on confirmation
      })
      .where(eq(tickets.id, ticketId));

    // Log ENTITY_CONFIRMED audit event
    await auditService.logEvent({
      entityType: 'ticket',
      entityId: ticketId,
      action: 'ENTITY_CONFIRMED',
      actor: {
        id: userId,
        username: user.username,
        role: user.role,
      },
      meta: {
        ticketStatus: ticket.status,
        confirmedAt: nowIso,
        confirmationNote,
      },
      ipAddress: req.ip || undefined,
      userAgent: req.get('user-agent') || undefined,
    });

    res.json({ 
      success: true, 
      confirmedAt: nowIso,
      message: 'Ticket state confirmed successfully',
    });
  } catch (error) {
    console.error('Error confirming ticket state:', error);
    res.status(500).json({ error: 'Failed to confirm ticket state' });
  }
});

router.post('/', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasWriteAccess(user)) {
      return res.status(403).json({ error: 'Write access denied. Only admins can create tickets.' });
    }

    const data = insertTicketSchema.parse({
      ...req.body,
      ownerUserId: req.body.ownerUserId || user.id,
    });

    const ticket = await storage.createTicket(data);

    await storage.createTicketActivity({
      ticketId: ticket.id,
      activityType: 'comment',
      message: `Ticket created: ${ticket.title}`,
      createdBy: user.id,
    });

    res.status(201).json(ticket);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.patch('/:id', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasWriteAccess(user)) {
      return res.status(403).json({ error: 'Write access denied. Only admins can modify tickets.' });
    }

    const existingTicket = await storage.getTicketById(req.params.id);
    if (!existingTicket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const validatedData = updateTicketSchema.parse(req.body);
    const { status, priority, ownerUserId, assignedUserId, assignedUserIds } = validatedData;

    if (status && status !== existingTicket.status) {
      await storage.createTicketActivity({
        ticketId: req.params.id,
        activityType: 'status_change',
        message: `Status changed from ${existingTicket.status} to ${status}`,
        previousValue: existingTicket.status,
        newValue: status,
        createdBy: user.id,
      });
    }

    if (priority && priority !== existingTicket.priority) {
      await storage.createTicketActivity({
        ticketId: req.params.id,
        activityType: 'priority_change',
        message: `Priority changed from ${existingTicket.priority} to ${priority}`,
        previousValue: existingTicket.priority,
        newValue: priority,
        createdBy: user.id,
      });
    }

    if (ownerUserId && ownerUserId !== existingTicket.ownerUserId) {
      await storage.createTicketActivity({
        ticketId: req.params.id,
        activityType: 'assignment',
        message: `Ticket reassigned`,
        previousValue: String(existingTicket.ownerUserId),
        newValue: String(ownerUserId),
        createdBy: user.id,
      });
    }

    // Handle assignee changes - different from owner changes
    if (assignedUserId !== undefined && assignedUserId !== existingTicket.assignedUserId) {
      const previousAssignee = existingTicket.assignedUserId;
      
      // Get user names for better activity messages
      let assigneeName = 'Unknown';
      let previousAssigneeName = null;
      if (assignedUserId) {
        try {
          const assigneeResult = await pool.query(
            `SELECT username, first_name, last_name FROM users WHERE id = $1`,
            [assignedUserId]
          );
          if (assigneeResult?.rows && assigneeResult.rows.length > 0) {
            const u = assigneeResult.rows[0];
            assigneeName = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username;
          }
        } catch (e) {
          console.error('Error fetching assignee name:', e);
        }
      }
      if (previousAssignee) {
        try {
          const prevResult = await pool.query(
            `SELECT username, first_name, last_name FROM users WHERE id = $1`,
            [previousAssignee]
          );
          if (prevResult?.rows && prevResult.rows.length > 0) {
            const u = prevResult.rows[0];
            previousAssigneeName = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username;
          }
        } catch (e) {
          console.error('Error fetching previous assignee name:', e);
        }
      }

      // Send internal message notification to new assignee (do this first to track if it was sent)
      let notificationSent = false;
      if (assignedUserId && assignedUserId !== user.id) {
        try {
          await pool.query(
            `INSERT INTO internal_messages (sender_id, recipient_id, subject, body, related_entity_type, related_entity_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              user.id,
              assignedUserId,
              `Ticket Assigned: ${existingTicket.title}`,
              `You have been assigned to ticket "${existingTicket.title}" (${existingTicket.ticketType} - ${existingTicket.priority} priority).\n\nDescription: ${existingTicket.description || 'No description provided'}`,
              'ticket',
              req.params.id
            ]
          );
          notificationSent = true;
          console.log(`📧 Sent ticket assignment notification to user ${assignedUserId} for ticket ${req.params.id}`);
        } catch (msgErr) {
          console.error('Failed to send assignment notification:', msgErr);
        }

        notificationManager.sendToUser(assignedUserId, {
          type: 'ticket_assigned',
          title: 'Ticket Assigned to You',
          message: `You've been assigned to ticket "${existingTicket.title}" (${existingTicket.priority} priority)`,
          data: { ticketId: req.params.id, ticketTitle: existingTicket.title, priority: existingTicket.priority },
          timestamp: new Date().toISOString(),
        });
      }

      if (previousAssignee && previousAssignee !== assignedUserId) {
        notificationManager.sendToUser(previousAssignee, {
          type: 'ticket_unassigned',
          title: 'Ticket Reassigned',
          message: `You've been unassigned from ticket "${existingTicket.title}"`,
          data: { ticketId: req.params.id, ticketTitle: existingTicket.title },
          timestamp: new Date().toISOString(),
        });
      }
      
      // Build activity message with user names and notification status
      let activityMessage = '';
      if (assignedUserId) {
        if (previousAssignee) {
          activityMessage = `Ticket reassigned from ${previousAssigneeName} to ${assigneeName}`;
        } else {
          activityMessage = `Ticket assigned to ${assigneeName}`;
        }
        if (notificationSent) {
          activityMessage += ` (notification sent)`;
        }
      } else {
        activityMessage = previousAssigneeName 
          ? `Ticket unassigned from ${previousAssigneeName}` 
          : 'Ticket unassigned';
      }
      
      await storage.createTicketActivity({
        ticketId: req.params.id,
        activityType: 'assignment',
        message: activityMessage,
        previousValue: previousAssignee ? String(previousAssignee) : null,
        newValue: assignedUserId ? String(assignedUserId) : null,
        createdBy: user.id,
      });
    }

    if (assignedUserIds !== undefined) {
      const previousIds = new Set(existingTicket.assignedUserIds || []);
      const newIds = new Set(assignedUserIds);
      const addedIds = assignedUserIds.filter((id: number) => !previousIds.has(id) && id !== user.id);
      const removedIds = Array.from(previousIds).filter((id) => !newIds.has(id));

      for (const addedId of addedIds) {
        notificationManager.sendToUser(addedId, {
          type: 'ticket_assigned',
          title: 'Ticket Assigned to You',
          message: `You've been assigned to ticket "${existingTicket.title}" (${existingTicket.priority} priority)`,
          data: { ticketId: req.params.id, ticketTitle: existingTicket.title, priority: existingTicket.priority },
          timestamp: new Date().toISOString(),
        });
      }

      for (const removedId of removedIds) {
        notificationManager.sendToUser(removedId, {
          type: 'ticket_unassigned',
          title: 'Ticket Reassigned',
          message: `You've been unassigned from ticket "${existingTicket.title}"`,
          data: { ticketId: req.params.id, ticketTitle: existingTicket.title },
          timestamp: new Date().toISOString(),
        });
      }
    }

    const ticket = await storage.updateTicket(req.params.id, validatedData);

    res.json(ticket);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

router.post('/:id/archive', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasWriteAccess(user)) {
      return res.status(403).json({ error: 'Write access denied. Only admins can archive tickets.' });
    }

    const ticket = await storage.archiveTicket(req.params.id);

    await storage.createTicketActivity({
      ticketId: req.params.id,
      activityType: 'status_change',
      message: 'Ticket archived',
      createdBy: user.id,
    });

    res.json(ticket);
  } catch (error) {
    console.error('Error archiving ticket:', error);
    res.status(500).json({ error: 'Failed to archive ticket' });
  }
});

router.get('/:id/activity', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasReadAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const activity = await storage.getTicketActivity(req.params.id);
    res.json(activity);
  } catch (error) {
    console.error('Error fetching ticket activity:', error);
    res.status(500).json({ error: 'Failed to fetch ticket activity' });
  }
});

router.post('/:id/activity', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasWriteAccess(user)) {
      return res.status(403).json({ error: 'Write access denied. Only admins can add activity.' });
    }

    const data = insertTicketActivitySchema.parse({
      ticketId: req.params.id,
      activityType: 'comment',
      message: req.body.message,
      createdBy: user.id,
    });

    const activity = await storage.createTicketActivity(data);
    res.status(201).json(activity);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Error creating ticket activity:', error);
    res.status(500).json({ error: 'Failed to create ticket activity' });
  }
});

router.get('/:id/orders', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasReadAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const orders = await storage.getTicketOrders(req.params.id);
    res.json(orders);
  } catch (error) {
    console.error('Error fetching ticket orders:', error);
    res.status(500).json({ error: 'Failed to fetch ticket orders' });
  }
});

router.post('/:id/orders', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasWriteAccess(user)) {
      return res.status(403).json({ error: 'Write access denied. Only admins can link orders.' });
    }

    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const link = await storage.linkOrderToTicket(req.params.id, orderId);

    await storage.createTicketActivity({
      ticketId: req.params.id,
      activityType: 'comment',
      message: `Order ${orderId} linked to ticket`,
      createdBy: user.id,
    });

    res.status(201).json(link);
  } catch (error) {
    console.error('Error linking order to ticket:', error);
    res.status(500).json({ error: 'Failed to link order to ticket' });
  }
});

router.delete('/:id/orders/:orderId', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasWriteAccess(user)) {
      return res.status(403).json({ error: 'Write access denied. Only admins can unlink orders.' });
    }

    await storage.unlinkOrderFromTicket(req.params.id, req.params.orderId);

    await storage.createTicketActivity({
      ticketId: req.params.id,
      activityType: 'comment',
      message: `Order ${req.params.orderId} unlinked from ticket`,
      createdBy: user.id,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error unlinking order from ticket:', error);
    res.status(500).json({ error: 'Failed to unlink order from ticket' });
  }
});

router.post('/check-sla', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasWriteAccess(user)) {
      return res.status(403).json({ error: 'Write access denied. Only admins can check SLA.' });
    }

    const breachedCount = await storage.checkSlaBreaches();
    res.json({ breachedCount });
  } catch (error) {
    console.error('Error checking SLA breaches:', error);
    res.status(500).json({ error: 'Failed to check SLA breaches' });
  }
});

router.post('/by-orders', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasReadAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { orderIds } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.json({});
    }

    const uniqueIds = [...new Set(orderIds)].slice(0, 500);

    const orderIdArray = `{${uniqueIds.map(id => `"${id}"`).join(',')}}`;
    const result = await db.execute(sql`
      SELECT 
        tor.order_id,
        COUNT(DISTINCT t.id) as ticket_count,
        MAX(CASE WHEN t.priority = 'high' THEN 1 ELSE 0 END) as has_high_priority,
        ARRAY_AGG(DISTINCT t.status) as statuses
      FROM ticket_orders tor
      JOIN tickets t ON tor.ticket_id = t.id
      WHERE tor.order_id = ANY(${orderIdArray}::text[])
        AND t.status NOT IN ('closed')
      GROUP BY tor.order_id
    `);

    const ticketMap: Record<string, { count: number; hasHighPriority: boolean; statuses: string[] }> = {};
    result.rows.forEach((row: any) => {
      ticketMap[row.order_id] = {
        count: parseInt(row.ticket_count),
        hasHighPriority: row.has_high_priority === 1,
        statuses: row.statuses || [],
      };
    });

    res.json(ticketMap);
  } catch (error) {
    console.error('Error fetching tickets by orders:', error);
    res.status(500).json({ error: 'Failed to fetch ticket counts' });
  }
});

export default router;
