import { Router } from 'express';
import { storage } from '../../storage';
import { sessionAwareAuth, requireRole } from '../../middleware/auth';
import { insertTicketSchema, insertTicketActivitySchema } from '../../schema';
import { z } from 'zod';
import { pool } from '../../db';

const router = Router();

const CSR_ADMIN_ROLES = ['ADMIN', 'OWNER', 'CSR'];

function hasAccess(user: any): boolean {
  return user && CSR_ADMIN_ROLES.includes(user.role);
}

router.get('/', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasAccess(user)) {
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

    const tickets = await storage.getTickets(filters);
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/metrics', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasAccess(user)) {
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
    if (!hasAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const ticket = await storage.getTicketById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

router.post('/', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
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
    if (!hasAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const existingTicket = await storage.getTicketById(req.params.id);
    if (!existingTicket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const { status, priority, ownerUserId, assignedUserId, ...rest } = req.body;

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
        const assigneeResult = await pool.query(
          `SELECT username, first_name, last_name FROM users WHERE id = $1`,
          [assignedUserId]
        );
        if (assigneeResult.rows.length > 0) {
          const u = assigneeResult.rows[0];
          assigneeName = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username;
        }
      }
      if (previousAssignee) {
        const prevResult = await pool.query(
          `SELECT username, first_name, last_name FROM users WHERE id = $1`,
          [previousAssignee]
        );
        if (prevResult.rows.length > 0) {
          const u = prevResult.rows[0];
          previousAssigneeName = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.username;
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

    const ticket = await storage.updateTicket(req.params.id, {
      status,
      priority,
      ownerUserId,
      assignedUserId,
      ...rest,
    });

    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

router.post('/:id/archive', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!hasAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
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
    if (!hasAccess(user)) {
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
    if (!hasAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
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
    if (!hasAccess(user)) {
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
    if (!hasAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
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
    if (!hasAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
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
    if (!hasAccess(user)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const breachedCount = await storage.checkSlaBreaches();
    res.json({ breachedCount });
  } catch (error) {
    console.error('Error checking SLA breaches:', error);
    res.status(500).json({ error: 'Failed to check SLA breaches' });
  }
});

export default router;
