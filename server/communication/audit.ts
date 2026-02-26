import { db } from '../db';
import { sql } from 'drizzle-orm';
import type { AttachmentMeta } from './types';

export interface LogCommunicationOptions {
  templateKey: string;
  templateVersion: number;
  triggeredBy?: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  attachmentsMeta?: AttachmentMeta[];
  providerMessageId?: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  // Optional context fields
  orderId?: string;
  customerId?: string;
  context?: string;
}

/**
 * Primary API: write an outbound email audit record to communication_logs.
 * Never throws — failures are logged to console only so they never block sends.
 */
export async function logCommunication(
  opts: LogCommunicationOptions
): Promise<void> {
  try {
    const primaryRecipient = opts.to[0] ?? 'unknown';
    const sentAt = opts.status === 'sent' ? new Date().toISOString() : null;

    await db.execute(sql`
      INSERT INTO communication_logs (
        type,
        method,
        recipient,
        subject,
        status,
        direction,
        template_key,
        template_version,
        triggered_by,
        body_html,
        recipients,
        cc,
        attachments_meta,
        provider_message_id,
        order_id,
        customer_id,
        context,
        sent_at,
        created_at,
        message_type,
        error
      ) VALUES (
        'email',
        'email',
        ${primaryRecipient},
        ${opts.subject},
        ${opts.status},
        'outbound',
        ${opts.templateKey},
        ${opts.templateVersion},
        ${opts.triggeredBy ?? null},
        ${opts.bodyHtml},
        ${JSON.stringify(opts.to)},
        ${opts.cc ? JSON.stringify(opts.cc) : null},
        ${opts.attachmentsMeta ? JSON.stringify(opts.attachmentsMeta) : null},
        ${opts.providerMessageId ?? null},
        ${opts.orderId ?? null},
        ${opts.customerId ?? 'system'},
        ${opts.context ?? null},
        ${sentAt},
        NOW(),
        'transactional',
        ${opts.error ?? null}
      )
    `);
  } catch (err: any) {
    console.error('[CommunicationAudit] Failed to write log entry:', err.message);
  }
}
