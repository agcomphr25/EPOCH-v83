import type { AuditEntry } from './types';

export async function auditEmailSend(
  db: import('../db').Database,
  entry: AuditEntry
): Promise<void> {
  try {
    await db.execute(
      (await import('drizzle-orm')).sql`
        INSERT INTO communication_logs (
          type, method, recipient, subject, status, direction,
          template_key, template_version, triggered_by, body_html,
          recipients, cc, attachments_meta, provider_message_id,
          order_id, customer_id, context, sent_at, created_at,
          message_type
        ) VALUES (
          'email', 'email',
          ${Array.isArray(entry.to) ? entry.to[0] : entry.to},
          ${entry.subject},
          ${entry.status},
          'outbound',
          ${entry.templateKey},
          ${entry.templateVersion},
          ${entry.triggeredBy ?? null},
          ${entry.bodyHtml},
          ${JSON.stringify(entry.to)},
          ${entry.cc ? JSON.stringify(entry.cc) : null},
          ${entry.attachmentsMeta ? JSON.stringify(entry.attachmentsMeta) : null},
          ${entry.providerMessageId ?? null},
          ${entry.orderId ?? null},
          ${entry.customerId ?? 'system'},
          ${entry.context ?? null},
          ${entry.status === 'sent' ? new Date().toISOString() : null},
          NOW(),
          'transactional'
        )
      `
    );
  } catch (err: any) {
    console.error('[CommunicationAudit] Failed to write audit log:', err.message);
  }
}
