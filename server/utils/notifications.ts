import { customers } from '@shared/schema';
import { allOrders, communicationLogs } from '../schema.js';
import { eq, and } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

import { db } from '../db.js';
import { 
  getTwilioConfig, 
  getSendGridConfig, 
  isTwilioConfigured, 
  isSendGridConfigured,
  logNotificationConfig 
} from '../config/notifications.js';

// Initialize SendGrid with API key from centralized config
const sendGridConfig = getSendGridConfig();
if (sendGridConfig.apiKey) {
  sgMail.setApiKey(sendGridConfig.apiKey);
}

export interface NotificationData {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery?: Date;
  customerEmail?: string;
  customerPhone?: string;
  preferredMethods?: string[] | string | null;
  forceResend?: boolean; // Set true to bypass deduplication (manual resend)
}

export function normalizeNotificationMethods(
  preferredMethods: unknown,
  contact: { email?: string | null; phone?: string | null } = {}
): string[] {
  const rawMethods = Array.isArray(preferredMethods)
    ? preferredMethods
    : typeof preferredMethods === 'string'
      ? preferredMethods.split(/[,\s]+/)
      : [];

  const normalized = rawMethods
    .map((method) => String(method).trim().toLowerCase())
    .map((method) => {
      if (method === 'text' || method === 'phone') return 'sms';
      if (method === 'e-mail') return 'email';
      return method;
    })
    .filter((method): method is 'email' | 'sms' => method === 'email' || method === 'sms');

  const uniqueMethods = Array.from(new Set(normalized));
  if (uniqueMethods.length > 0) return uniqueMethods;

  if (contact.email) return ['email'];
  if (contact.phone) return ['sms'];
  return [];
}

export async function sendCustomerNotification(
  data: NotificationData
): Promise<{
  success: boolean;
  methods: string[];
  errors?: string[];
  skipped?: boolean;
}> {
  const results = {
    success: false,
    methods: [] as string[],
    errors: [] as string[],
  };

  console.log('📬 Starting customer notification for order:', data.orderId);
  console.log('[TRACKING NOTIFY] Incoming notification data:', JSON.stringify(data, null, 2));

  // ============================================================
  // DEDUPLICATION GUARD: Check if notification already sent for this order + tracking combo
  // Uses structured tracking_number column (not message text parsing)
  // ============================================================
  if (!data.forceResend) {
    try {
      const existingNotification = await db
        .select()
        .from(communicationLogs)
        .where(
          and(
            eq(communicationLogs.orderId, data.orderId),
            eq(communicationLogs.type, 'shipping-notification'),
            eq(communicationLogs.status, 'sent'),
            eq(communicationLogs.trackingNumber, data.trackingNumber)
          )
        )
        .limit(1);

      if (existingNotification.length > 0) {
        const existing = existingNotification[0];
        console.log(`⏭️ [DEDUP] Notification already sent for order ${data.orderId} with tracking ${data.trackingNumber} at ${existing.sentAt} via ${existing.method}. Skipping.`);
        return {
          success: true,
          methods: [existing.method || 'unknown'],
          skipped: true,
        };
      }
    } catch (dedupError) {
      console.error('[DEDUP] Error checking for existing notification:', dedupError);
      // Continue with notification if check fails - prefer to potentially double-send than not send
    }
  } else {
    console.log(`📬 [FORCE RESEND] Bypassing deduplication for order ${data.orderId}`);
  }

  // Get customer preferences - look in both finalized and draft orders
  let customer = null;
  let order = null;

  // First try to find in finalized orders using storage instead of direct import
  try {
    const { storage } = await import('../storage.js');
    const finalizedOrders = await storage.getAllFinalizedOrders();
    const finalizedOrder = finalizedOrders.find(
      (order: any) => order.orderId === data.orderId
    );
    if (finalizedOrder?.customerId) {
      order = finalizedOrder;
      const { storage } = await import('../storage.js');
      customer = await storage.getCustomerById(finalizedOrder.customerId);
    }
  } catch (error) {
    console.log('Order not found in finalized orders, trying draft orders');
  }

  // If not found in finalized, try draft orders
  if (!customer) {
    try {
      const { storage } = await import('../storage.js');
      const draftOrders = await storage.getAllOrderDrafts();
      const draftOrder = draftOrders.find(
        (order: any) => order.orderId === data.orderId
      );

      if (draftOrder?.customerId) {
        order = draftOrder;
        customer = await storage.getCustomerById(draftOrder.customerId);
      }
    } catch (error) {
      console.log('Order not found in draft orders either');
    }
  }

  if (!order || !customer) {
    const errorMsg = 'Order or customer not found in either finalized or draft orders';
    results.errors.push(errorMsg);
    console.error('❌ Notification failed:', errorMsg);
    return results;
  }

  // Determine notification methods
  let preferredMethods = normalizeNotificationMethods(
    data.preferredMethods,
    { email: data.customerEmail, phone: data.customerPhone }
  );
  const email = data.customerEmail || customer.email;
  const phone = data.customerPhone || customer.phone;
  if (!preferredMethods.length) {
    preferredMethods = normalizeNotificationMethods(
      customer.preferredCommunicationMethod,
      { email, phone }
    );
  }

  // 1. Detect Twilio availability using centralized config
  const allowSms = isTwilioConfigured();

  // Auto-select best possible method if preferred list empty.
  // Prefer SMS when the customer has a phone and Twilio is configured;
  // otherwise fall back to email. (Previously this unconditionally pushed
  // email first, which silently dropped SMS.)
  if (!preferredMethods.length) {
    if (phone && allowSms) preferredMethods.push('sms');
    if (email) preferredMethods.push('email');
    if (!preferredMethods.length && phone) preferredMethods.push('sms');
  }
  const prefersSms = preferredMethods.includes('sms');
  const prefersEmail = preferredMethods.includes('email');

  // Diagnostic: surface why SMS was skipped purely due to missing Twilio config
  if (prefersSms && !allowSms) {
    console.warn(
      `[NOTIFY] SMS preferred for order ${data.orderId} but Twilio is not configured ` +
      `(missing TWILIO_SID/TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_NUMBER). ` +
      `SMS will be skipped${email ? ' and email used as fallback' : ' and no SMS will be sent'}.`
    );
  }
  if (prefersSms && allowSms && !phone) {
    console.warn(
      `[NOTIFY] SMS preferred for order ${data.orderId} but customer has no phone number on file.`
    );
  }

  // 2. SMS → Email Fallback rule
  const needsEmailFallback = prefersSms && !allowSms;

  console.log('📬 Notification config:', {
    orderId: data.orderId,
    preferredMethods,
    prefersEmail,
    prefersSms,
    hasEmail: !!email,
    hasPhone: !!phone,
    allowSms,
    needsEmailFallback,
  });

  // Track successful sends
  let notificationSucceeded = false;
  const succeededMethods: string[] = [];

  // ================= EMAIL PATH ======================
  if ((prefersEmail || needsEmailFallback) && email) {
    try {
      console.log('📧 Attempting email notification to:', email);
      await sendEmailNotification(
        {
          email,
          orderId: data.orderId,
          trackingNumber: data.trackingNumber,
          carrier: data.carrier,
          estimatedDelivery: data.estimatedDelivery,
        },
        customer?.id.toString()
      );
      succeededMethods.push('email');
      notificationSucceeded = true;
      console.log('[NOTIFY] Email sent (direct or fallback)');
    } catch (error: any) {
      console.error('[NOTIFY EMAIL FAIL]', error);
      const errorMsg = `Email failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      results.errors.push(errorMsg);
    }
  }

  // ================= SMS PATH ========================
  const twilioConfig = getTwilioConfig();
  console.log("📡 SMS CONFIG CHECK:", {
    configured: allowSms ? "✔" : "❌",
    fromNumber: twilioConfig.fromNumber || "❌ NOT SET",
    prefersSms,
    phone: phone || "❌ NO PHONE",
    allowSms
  });
  
  if (prefersSms && phone && allowSms) {
    try {
      console.log('📱 Attempting SMS notification to:', phone);
      await sendSMSNotification(
        {
          phone,
          orderId: data.orderId,
          trackingNumber: data.trackingNumber,
          carrier: data.carrier,
          estimatedDelivery: data.estimatedDelivery,
        },
        customer?.id.toString()
      );
      succeededMethods.push('sms');
      notificationSucceeded = true;
      console.log('[NOTIFY] SMS sent');
    } catch (error: any) {
      console.error('[NOTIFY SMS FAIL]', error);
      const errorMsg = `SMS failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      results.errors.push(errorMsg);
      
      // SMS failed - try email as fallback if available
      if (email && !succeededMethods.includes('email')) {
        console.log('[NOTIFY] SMS failed, attempting email fallback to:', email);
        try {
          await sendEmailNotification(
            {
              email,
              orderId: data.orderId,
              trackingNumber: data.trackingNumber,
              carrier: data.carrier,
              estimatedDelivery: data.estimatedDelivery,
            },
            customer?.id.toString()
          );
          succeededMethods.push('email');
          notificationSucceeded = true;
          console.log('[NOTIFY] Email fallback succeeded after SMS failure');
        } catch (emailError: any) {
          console.error('[NOTIFY EMAIL FALLBACK FAIL]', emailError);
          const emailErrorMsg = `Email fallback failed: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`;
          results.errors.push(emailErrorMsg);
        }
      }
    }
  } else if (prefersSms && !allowSms && email) {
    console.log('[NOTIFY] SMS preferred but Twilio missing → fallback to email');
  }

  // ================= FINAL RESULT RETURN ==============
  results.success = succeededMethods.length > 0;
  results.methods = succeededMethods;

  if (results.success) {
    console.log('📬 Updating order notification status - methods:', succeededMethods);

    await db.update(allOrders)
      .set({
        customerNotified: true,
        notificationMethod: succeededMethods.join(', '),
        notificationSentAt: new Date(),
      })
      .where(eq(allOrders.orderId, data.orderId));

    // Log success to communication_logs for each method (with structured tracking_number)
    for (const method of succeededMethods) {
      await db.insert(communicationLogs).values({
        orderId: data.orderId,
        customerId: customer.id.toString(),
        messageType: 'transactional',
        method,
        type: 'shipping-notification',
        recipient: (method === 'email' ? email : phone) || 'unknown',
        status: 'sent',
        trackingNumber: data.trackingNumber,
        message: `Tracking: ${data.trackingNumber}`,
        sentAt: new Date(),
      });
    }

    console.log('✅ Notification complete for order:', data.orderId);
  } else {
    // Always log failure to communication_logs (with structured tracking_number)
    const fallbackMessage = `Shipping notification attempt failed for order ${data.orderId}. Errors: ${results.errors?.join('; ') || 'Unknown failure'}`;

    await db.insert(communicationLogs).values({
      orderId: data.orderId,
      customerId: customer.id.toString(),
      messageType: 'transactional',
      method: preferredMethods.length ? preferredMethods.join(',') : 'none',
      type: 'shipping-notification',
      recipient: email || phone || 'no-contact',
      status: 'failed',
      trackingNumber: data.trackingNumber,
      error: results.errors?.join('; ') || 'No contact method available',
      message: fallbackMessage,
      sentAt: new Date(),
    });

    console.error('❌ Notification failed:', data.orderId, results.errors);
  }

  return results;
}

async function sendEmailNotification(
  data: {
    email: string;
    orderId: string;
    trackingNumber: string;
    carrier: string;
    estimatedDelivery?: Date;
  },
  customerId?: string
) {
  const subject = `Your Order ${data.orderId} Has Shipped - AG Composites`;
  const deliveryText = data.estimatedDelivery
    ? `Estimated delivery: ${data.estimatedDelivery.toLocaleDateString()}`
    : 'Delivery information will be updated shortly.';

  const message = `
Dear Customer,

Great news! Your order ${data.orderId} has been shipped.

Shipping Details:
- Tracking Number: ${data.trackingNumber}
- Carrier: ${data.carrier}
- ${deliveryText}

You can track your package using the tracking number above on the ${data.carrier} website.

Thank you for choosing AG Composites!

Best regards,
AG Composites Team
230 Hamer Road
Owens Cross Roads, AL 35763
Phone: 256-723-8381
  `.trim();

  const emailConfig = getSendGridConfig();
  
  console.log('📧 [DIRECT SENDGRID] Sending email shipping notification:', {
    to: data.email,
    subject,
    from: emailConfig.fromEmail,
  });

  // Validate SendGrid configuration using centralized check
  if (!isSendGridConfigured()) {
    throw new Error('SendGrid is not configured (missing API key or from email)');
  }

  try {
    const emailData = {
      to: data.email,
      from: emailConfig.fromEmail,
      subject,
      text: message,
      html: message.replace(/\n/g, '<br>'),
    };

    const result = await sgMail.send(emailData);
    const messageId = result[0]?.headers?.['x-message-id'] || 'unknown';
    
    console.log('✅ [DIRECT SENDGRID] Email sent successfully, messageId:', messageId);
    return { status: 'sent', messageId };
  } catch (error: any) {
    console.error('❌ [DIRECT SENDGRID] Failed to send email:', error?.response?.body || error.message);
    throw error;
  }
}

async function sendSMSNotification(
  data: {
    phone: string;
    orderId: string;
    trackingNumber: string;
    carrier: string;
    estimatedDelivery?: Date;
  },
  customerId?: string
) {
  const message = `AG Composites: Your order ${data.orderId} has shipped! Track with ${data.trackingNumber} on ${data.carrier}. ${data.estimatedDelivery ? `Est. delivery: ${data.estimatedDelivery.toLocaleDateString()}` : ''}`;

  console.log('📱 [DIRECT TWILIO] Sending SMS shipping notification:', {
    to: data.phone,
    message: message.substring(0, 50) + '...',
  });

  // Call Twilio directly (bypasses authenticated API route)
  const twilioConfig = getTwilioConfig();
  
  if (!isTwilioConfigured()) {
    throw new Error('Twilio is not configured (missing Account SID, Auth Token, or From Number)');
  }

  try {
    const twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);
    
    const twilioMessage = await twilioClient.messages.create({
      body: message,
      from: twilioConfig.fromNumber,
      to: data.phone,
    });

    console.log('✅ [DIRECT TWILIO] SMS sent successfully:', twilioMessage.sid);

    // Log to communication_logs (with structured tracking_number)
    await db.insert(communicationLogs).values({
      customerId: customerId || data.orderId,
      orderId: data.orderId,
      messageType: 'transactional',
      method: 'sms',
      type: 'shipping-notification',
      recipient: data.phone,
      status: 'sent',
      trackingNumber: data.trackingNumber,
      message: message,
      externalId: twilioMessage.sid,
      sentAt: new Date(),
    });

    return { success: true, messageSid: twilioMessage.sid };
  } catch (error: any) {
    console.error('❌ [DIRECT TWILIO] Failed to send SMS:', error.message);
    throw error;
  }
}

export async function updateTrackingInfo(
  orderId: string,
  trackingData: {
    trackingNumber: string;
    carrier?: string;
    shippedDate?: Date;
    estimatedDelivery?: Date;
  }
) {
  return await db
    .update(allOrders)
    .set({
      trackingNumber: trackingData.trackingNumber,
      shippingCarrier: trackingData.carrier || 'UPS',
      shippedDate: trackingData.shippedDate || new Date(),
      estimatedDelivery: trackingData.estimatedDelivery,
      shippingLabelGenerated: true,
    })
    .where(eq(allOrders.orderId, orderId));
}

// =============================================================================
// ORDER CONFIRMATION NOTIFICATION
// Single unified function for sending order confirmation (magic-link) emails
// with structured deduplication using signature_token
// =============================================================================

export type OrderConfirmationContext = 'initial' | 'resend' | 'reminder' | 'pdf_copy' | 'updated_order';

export interface OrderConfirmationData {
  orderId: string;
  customerId: string;
  customerEmail: string;
  customerPhone?: string;
  preferredCommunicationMethod?: string; // 'email' | 'sms' | null
  signatureToken: string;
  publicSignatureId: string; // HARDENING: User-visible dedup key (sig_XXXXXXXX)
  pdfPath: string;
  context: OrderConfirmationContext; // Required: initial, resend, or reminder
  orderData: {
    orderId: string;
    customerName: string;
    customerEmail: string;
    orderDate: string;
    dueDate: string;
    customerPO?: string;
    modelId?: string;
    handedness?: string;
    features?: Record<string, any>;
    notes?: string;
    shipping?: number;
    signatureLink?: string; // Optional for pdf_copy context
  };
  forceResend?: boolean; // Set true to bypass deduplication (manual resend)
}

export type OrderConfirmationOutcome = 'sent' | 'skipped' | 'failed';

export interface OrderConfirmationResult {
  outcome: OrderConfirmationOutcome;
  messageId?: string;
  error?: string;
  reason?: string; // For skipped outcomes: 'dedup' | 'cooldown' | 'max_attempts' | etc
  method?: string;
}

// PAUSE FLAG: Set PAUSE_ORDER_CONFIRMATION_EMAILS=true to temporarily pause all order confirmation emails
// This includes initial, resend, and all contexts (initial_order, followup, etc.)
const isOrderConfirmationEmailsPaused = () => process.env.PAUSE_ORDER_CONFIRMATION_EMAILS === 'true';

export async function sendOrderConfirmationNotification(
  data: OrderConfirmationData
): Promise<OrderConfirmationResult> {
  console.log('📧 [ORDER-CONFIRM] Starting order confirmation notification:', data.orderId);

  // ============================================================
  // GLOBAL PAUSE CHECK: Skip all order confirmation emails when paused
  // ============================================================
  if (isOrderConfirmationEmailsPaused()) {
    console.log('⏸️ [ORDER-CONFIRM] Order confirmation emails are PAUSED (PAUSE_ORDER_CONFIRMATION_EMAILS=true)');
    
    // Log the skip in communication_logs for audit trail
    try {
      await db.insert(communicationLogs).values({
        orderId: data.orderId,
        customerId: data.customerId,
        messageType: 'transactional',
        method: 'email',
        type: 'order-confirmation',
        context: data.context,
        recipient: data.customerEmail,
        status: 'skipped',
        skipReason: 'paused',
        signatureToken: data.signatureToken,
        publicSignatureId: data.publicSignatureId,
        message: `Order confirmation email paused by PAUSE_ORDER_CONFIRMATION_EMAILS flag`,
        sentAt: new Date(),
      });
    } catch (logError) {
      console.error('[ORDER-CONFIRM] Error logging paused email:', logError);
    }
    
    return {
      outcome: 'skipped',
      reason: 'paused',
      method: 'email',
    };
  }

  // ============================================================
  // DEDUPLICATION GUARD: Check if confirmation already sent for this order
  // HARDENING: Uses stable, user-visible key (order_id, type, context, public_signature_id)
  // signatureToken still stored but not used as sole dedup key
  // ============================================================
  if (!data.forceResend) {
    try {
      const existingNotification = await db
        .select()
        .from(communicationLogs)
        .where(
          and(
            eq(communicationLogs.orderId, data.orderId),
            eq(communicationLogs.type, 'order-confirmation'),
            eq(communicationLogs.context, data.context),
            eq(communicationLogs.status, 'sent'),
            eq(communicationLogs.publicSignatureId, data.publicSignatureId)
          )
        )
        .limit(1);

      if (existingNotification.length > 0) {
        const existing = existingNotification[0];
        console.log(`⏭️ [DEDUP] Order confirmation already sent for ${data.orderId} (${data.context}) with publicId ${data.publicSignatureId} at ${existing.sentAt} via ${existing.method}. Skipping.`);
        
        // MANDATORY LOGGING: Insert a communication_log record for this dedup skip
        // Each finalization attempt must have its own log entry, even if deduped
        await db.insert(communicationLogs).values({
          orderId: data.orderId,
          customerId: data.customerId,
          messageType: 'transactional',
          method: existing.method || 'email',
          type: 'order-confirmation',
          context: data.context,
          recipient: data.customerEmail,
          status: 'skipped',
          skipReason: 'dedup',
          signatureToken: data.signatureToken,
          publicSignatureId: data.publicSignatureId,
          externalId: existing.externalId,
          message: `Order confirmation skipped (dedup) for ${data.orderId} - already sent at ${existing.sentAt}`,
          sentAt: new Date(),
        });
        
        return {
          outcome: 'skipped',
          reason: 'dedup',
          method: existing.method || 'email',
          messageId: existing.externalId || undefined,
        };
      }
    } catch (dedupError) {
      console.error('[DEDUP] Error checking for existing order confirmation:', dedupError);
      // Continue with notification if check fails - prefer to potentially double-send than not send
    }
  } else {
    console.log(`📧 [FORCE RESEND] Bypassing deduplication for order confirmation ${data.orderId}`);
  }

  // ============================================================
  // CHANNEL SELECTION: Use customer's preferred method (default: email)
  // Only one channel - no multi-channel sends for order confirmations
  // ============================================================
  const preferredMethod = data.preferredCommunicationMethod || 'email';
  
  // For order confirmations, we currently only support email (requires PDF attachment)
  // SMS confirmation would need a different flow (link-only, no PDF)
  const channel = 'email'; // SMS support could be added later if needed

  if (preferredMethod === 'sms' && channel === 'email') {
    console.log(`📧 [ORDER-CONFIRM] Customer prefers SMS but order confirmations require email for PDF attachment`);
  }

  // ============================================================
  // SEND EMAIL via existing sendFollowupOrderEmail function
  // ============================================================
  try {
    // Dynamic import to avoid circular dependency
    const { sendFollowupOrderEmail } = await import('./followupOrderEmail.js');
    
    const emailResult = await sendFollowupOrderEmail(data.orderData, data.pdfPath);

    if (emailResult.success) {
      // Log success to communication_logs (with both signatureToken and publicSignatureId)
      await db.insert(communicationLogs).values({
        orderId: data.orderId,
        customerId: data.customerId,
        messageType: 'transactional',
        method: channel,
        type: 'order-confirmation',
        context: data.context,
        recipient: data.customerEmail,
        status: 'sent',
        signatureToken: data.signatureToken,
        publicSignatureId: data.publicSignatureId,
        externalId: emailResult.messageId,
        message: `Order confirmation (${data.context}) with signature link for ${data.orderId}`,
        sentAt: new Date(),
      });

      console.log(`✅ [ORDER-CONFIRM] Email sent successfully for ${data.orderId} (${data.context})`);
      return {
        outcome: 'sent',
        messageId: emailResult.messageId,
        method: channel,
      };
    } else {
      // Log failure to communication_logs
      await db.insert(communicationLogs).values({
        orderId: data.orderId,
        customerId: data.customerId,
        messageType: 'transactional',
        method: channel,
        type: 'order-confirmation',
        context: data.context,
        recipient: data.customerEmail,
        status: 'failed',
        signatureToken: data.signatureToken,
        publicSignatureId: data.publicSignatureId,
        error: emailResult.error,
        message: `Failed order confirmation attempt (${data.context}) for ${data.orderId}`,
        sentAt: new Date(),
      });

      console.error(`❌ [ORDER-CONFIRM] Email failed for ${data.orderId} (${data.context}):`, emailResult.error);
      return {
        outcome: 'failed',
        error: emailResult.error,
        method: channel,
      };
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ [ORDER-CONFIRM] Exception sending email for ${data.orderId} (${data.context}):`, errorMessage);
    
    // Log exception to communication_logs
    await db.insert(communicationLogs).values({
      orderId: data.orderId,
      customerId: data.customerId,
      messageType: 'transactional',
      method: channel,
      type: 'order-confirmation',
      context: data.context,
      recipient: data.customerEmail,
      status: 'failed',
      signatureToken: data.signatureToken,
      publicSignatureId: data.publicSignatureId,
      error: errorMessage,
      message: `Exception during order confirmation (${data.context}) for ${data.orderId}`,
      sentAt: new Date(),
    });

    return {
      outcome: 'failed',
      error: errorMessage,
      method: channel,
    };
  }
}
