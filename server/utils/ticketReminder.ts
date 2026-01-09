import { pool } from '../db.js';

const STALE_TICKET_HOURS = 48;
const REMINDER_COOLDOWN_HOURS = 24;
const MAX_REMINDER_ATTEMPTS = 3;

interface StaleTicket {
  id: string;
  title: string;
  ticketType: string;
  priority: string;
  status: string;
  assignedUserId: number;
  ownerUserId: number;
  lastActivityAt: Date | null;
  reminderCount: number;
  lastReminderAt: Date | null;
  createdAt: Date;
}

export async function sendStaleTicketReminders() {
  console.log('🎫 [TICKET REMINDER] Checking for stale tickets...');
  
  try {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - STALE_TICKET_HOURS * 60 * 60 * 1000);
    const cooldownThreshold = new Date(now.getTime() - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000);
    
    const staleTicketsResult = await pool.query(`
      SELECT 
        id, title, ticket_type as "ticketType", priority, status,
        assigned_user_id as "assignedUserId",
        owner_user_id as "ownerUserId",
        last_activity_at as "lastActivityAt",
        reminder_count as "reminderCount",
        last_reminder_at as "lastReminderAt",
        created_at as "createdAt"
      FROM tickets
      WHERE 
        assigned_user_id IS NOT NULL
        AND status NOT IN ('resolved', 'closed')
        AND archived_at IS NULL
        AND (last_activity_at IS NULL OR last_activity_at < $1)
        AND (reminder_count IS NULL OR reminder_count < $2)
        AND (last_reminder_at IS NULL OR last_reminder_at < $3)
      ORDER BY priority DESC, last_activity_at ASC
    `, [staleThreshold, MAX_REMINDER_ATTEMPTS, cooldownThreshold]);
    
    // pg pool.query returns { rows: [...] }
    const staleTickets: StaleTicket[] = (staleTicketsResult as any).rows || [];
    
    if (staleTickets.length === 0) {
      console.log('✅ [TICKET REMINDER] No stale tickets found');
      return { sent: 0, skipped: 0 };
    }
    
    console.log(`⚠️ [TICKET REMINDER] Found ${staleTickets.length} stale ticket(s)`);
    
    let sentCount = 0;
    let skippedCount = 0;
    
    for (const ticket of staleTickets) {
      try {
        const assigneeId = ticket.assignedUserId;
        const ownerId = ticket.ownerUserId;
        
        const lastActivityStr = ticket.lastActivityAt 
          ? formatTimeAgo(new Date(ticket.lastActivityAt))
          : 'creation';
        
        const messageBody = `Ticket "${ticket.title}" has not been updated since ${lastActivityStr}.\n\n` +
          `Type: ${ticket.ticketType}\n` +
          `Priority: ${ticket.priority}\n` +
          `Status: ${ticket.status}\n\n` +
          `Please review and update this ticket.`;
        
        await pool.query(
          `INSERT INTO internal_messages (sender_id, recipient_id, subject, body, related_entity_type, related_entity_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            ownerId,
            assigneeId,
            `Reminder: Ticket needs attention - ${ticket.title}`,
            messageBody,
            'ticket',
            ticket.id
          ]
        );
        
        await pool.query(
          `UPDATE tickets 
           SET reminder_count = COALESCE(reminder_count, 0) + 1,
               last_reminder_at = NOW()
           WHERE id = $1`,
          [ticket.id]
        );
        
        console.log(`📧 [TICKET REMINDER] Sent reminder for ticket ${ticket.id} to user ${assigneeId}`);
        sentCount++;
        
      } catch (ticketErr) {
        console.error(`❌ [TICKET REMINDER] Failed to send reminder for ticket ${ticket.id}:`, ticketErr);
        skippedCount++;
      }
    }
    
    console.log(`🎫 [TICKET REMINDER] Complete: ${sentCount} sent, ${skippedCount} skipped`);
    return { sent: sentCount, skipped: skippedCount };
    
  } catch (error) {
    console.error('❌ [TICKET REMINDER] Error checking stale tickets:', error);
    return { sent: 0, skipped: 0, error: String(error) };
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else {
    return 'less than an hour ago';
  }
}
