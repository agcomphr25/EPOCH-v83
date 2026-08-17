import { and, eq } from 'drizzle-orm';

import { db, pool } from '../../db';
import { communicationLogs } from '../../schema';
import { sendEmailViaSendGrid } from '../../utils/sendgrid';

const PURE_PRECISION_CUSTOMER_NAME = 'pure precision';
const TEMPLATE_KEY = 'p1-pure-precision-shipping-notification';

export type P1ShipmentNotificationResult = {
  requested: boolean;
  eligible: boolean;
  sent: boolean;
  skipped?: boolean;
  recipient?: string;
  error?: string;
};

export function isPurePrecisionCustomer(customerName: unknown): boolean {
  return String(customerName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') === PURE_PRECISION_CUSTOMER_NAME;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function updateShipmentNotificationMetadata(
  shipmentId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `UPDATE shipment_records
     SET notification_metadata = COALESCE(notification_metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [shipmentId, JSON.stringify(metadata)]
  );
}

export async function sendPurePrecisionShipmentNotification(input: {
  shipmentId: string;
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
  trackingNumber: string;
  carrier: string;
  poNumbers: string[];
  triggeredBy?: string | null;
}): Promise<P1ShipmentNotificationResult> {
  if (!isPurePrecisionCustomer(input.customerName)) {
    return { requested: true, eligible: false, sent: false, skipped: true };
  }

  const recipient = String(input.customerEmail || '').trim();
  if (!recipient) {
    const error = 'Pure Precision does not have a primary email address.';
    await updateShipmentNotificationMetadata(input.shipmentId, {
      trackingNotificationStatus: 'failed',
      trackingNotificationError: error,
      trackingNotificationAttemptedAt: new Date().toISOString(),
    });
    return { requested: true, eligible: true, sent: false, error };
  }

  const existing = await db
    .select({ id: communicationLogs.id, sentAt: communicationLogs.sentAt })
    .from(communicationLogs)
    .where(
      and(
        eq(communicationLogs.customerId, input.customerId),
        eq(communicationLogs.type, 'p1-shipping-notification'),
        eq(communicationLogs.status, 'sent'),
        eq(communicationLogs.trackingNumber, input.trackingNumber)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await updateShipmentNotificationMetadata(input.shipmentId, {
      trackingNotificationStatus: 'sent',
      trackingNotificationSkippedAsDuplicate: true,
      trackingNotificationRecipient: recipient,
      trackingNotificationSentAt: existing[0].sentAt,
    });
    return {
      requested: true,
      eligible: true,
      sent: true,
      skipped: true,
      recipient,
    };
  }

  const poNumbers = Array.from(new Set(input.poNumbers.filter(Boolean)));
  const poLabel = poNumbers.length === 1 ? `PO ${poNumbers[0]}` : `POs ${poNumbers.join(', ')}`;
  const subject = `Pure Precision shipment for ${poLabel} has shipped - AG Composites`;
  const trackingUrl = `https://www.ups.com/track?tracknum=${encodeURIComponent(input.trackingNumber)}`;
  const text = [
    'Hello Pure Precision,',
    '',
    `Your AG Composites shipment for ${poLabel} has shipped.`,
    '',
    `Carrier: ${input.carrier}`,
    `Tracking number: ${input.trackingNumber}`,
    `Track shipment: ${trackingUrl}`,
    '',
    'Thank you,',
    'AG Composites',
    '256-723-8381',
  ].join('\n');
  const html = `
    <p>Hello Pure Precision,</p>
    <p>Your AG Composites shipment for <strong>${escapeHtml(poLabel)}</strong> has shipped.</p>
    <p>
      Carrier: ${escapeHtml(input.carrier)}<br>
      Tracking number: <strong>${escapeHtml(input.trackingNumber)}</strong><br>
      <a href="${escapeHtml(trackingUrl)}">Track this shipment</a>
    </p>
    <p>Thank you,<br>AG Composites<br>256-723-8381</p>
  `.trim();

  const trackingFromEmail =
    process.env.TRACKING_NOTIFICATION_FROM_EMAIL ||
    process.env.CUSTOMER_NOTIFICATION_FROM_EMAIL ||
    undefined;
  const trackingReplyTo =
    process.env.TRACKING_NOTIFICATION_REPLY_TO || trackingFromEmail || undefined;

  try {
    const sendResult = await sendEmailViaSendGrid({
      to: recipient,
      ...(trackingFromEmail ? { fromEmail: trackingFromEmail } : {}),
      fromName: 'AG Composites Sales',
      ...(trackingReplyTo ? { replyTo: trackingReplyTo } : {}),
      subject,
      text,
      html,
    });

    if (!sendResult.success) {
      throw new Error(sendResult.error || 'SendGrid email failed');
    }

    const sentAt = new Date();
    await db.insert(communicationLogs).values({
      orderId: null,
      customerId: input.customerId,
      messageType: 'transactional',
      method: 'email',
      type: 'p1-shipping-notification',
      recipient,
      subject,
      message: text,
      bodyHtml: html,
      status: 'sent',
      trackingNumber: input.trackingNumber,
      sentAt,
      externalId: sendResult.messageId || null,
      providerMessageId: sendResult.messageId || null,
      templateKey: TEMPLATE_KEY,
      triggeredBy: input.triggeredBy || 'p1-shipment',
      recipients: [recipient],
    });
    await updateShipmentNotificationMetadata(input.shipmentId, {
      trackingNotificationStatus: 'sent',
      trackingNotificationRecipient: recipient,
      trackingNotificationMethod: 'email',
      trackingNotificationSentAt: sentAt.toISOString(),
      trackingNotificationProviderMessageId: sendResult.messageId || null,
    });

    return { requested: true, eligible: true, sent: true, recipient };
  } catch (cause: any) {
    const error = cause?.message || 'Tracking notification failed.';
    await db.insert(communicationLogs).values({
      orderId: null,
      customerId: input.customerId,
      messageType: 'transactional',
      method: 'email',
      type: 'p1-shipping-notification',
      recipient,
      subject,
      message: text,
      bodyHtml: html,
      status: 'failed',
      trackingNumber: input.trackingNumber,
      error,
      sentAt: new Date(),
      templateKey: TEMPLATE_KEY,
      triggeredBy: input.triggeredBy || 'p1-shipment',
      recipients: [recipient],
    });
    await updateShipmentNotificationMetadata(input.shipmentId, {
      trackingNotificationStatus: 'failed',
      trackingNotificationRecipient: recipient,
      trackingNotificationError: error,
      trackingNotificationAttemptedAt: new Date().toISOString(),
    });
    return { requested: true, eligible: true, sent: false, recipient, error };
  }
}
