import { customers } from '@shared/schema';
import { allOrders, communicationLogs } from '../schema.js';
import { eq } from 'drizzle-orm';
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
  preferredMethods?: string[];
}

export async function sendCustomerNotification(
  data: NotificationData
): Promise<{
  success: boolean;
  methods: string[];
  errors?: string[];
}> {
  const results = {
    success: false,
    methods: [] as string[],
    errors: [] as string[],
  };

  console.log('📬 Starting customer notification for order:', data.orderId);
  console.log('[TRACKING NOTIFY] Incoming notification data:', JSON.stringify(data, null, 2));

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
  let preferredMethods = data.preferredMethods ||
    (customer.preferredCommunicationMethod as string[]) || [];
  const email = data.customerEmail || customer.email;
  const phone = data.customerPhone || customer.phone;

  // 1. Detect Twilio availability using centralized config
  const allowSms = isTwilioConfigured();

  // Auto-select best possible method if preferred list empty
  if (!preferredMethods.length) {
    if (email) preferredMethods.push('email');
    else if (phone && allowSms) preferredMethods.push('sms');
  }
  const prefersSms = preferredMethods.includes('sms');
  const prefersEmail = preferredMethods.includes('email');

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

    // Log success to communication_logs for each method
    for (const method of succeededMethods) {
      await db.insert(communicationLogs).values({
        orderId: data.orderId,
        customerId: customer.id.toString(),
        messageType: 'transactional',
        method,
        type: 'shipping-notification',
        recipient: (method === 'email' ? email : phone) || 'unknown',
        status: 'sent',
        message: `Tracking: ${data.trackingNumber}`,
        sentAt: new Date(),
      });
    }

    console.log('✅ Notification complete for order:', data.orderId);
  } else {
    // Always log failure to communication_logs
    const fallbackMessage = `Shipping notification attempt failed for order ${data.orderId}. Errors: ${results.errors?.join('; ') || 'Unknown failure'}`;

    await db.insert(communicationLogs).values({
      orderId: data.orderId,
      customerId: customer.id.toString(),
      messageType: 'transactional',
      method: preferredMethods.length ? preferredMethods.join(',') : 'none',
      type: 'shipping-notification',
      recipient: email || phone || 'no-contact',
      status: 'failed',
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

    // Log to communication_logs
    await db.insert(communicationLogs).values({
      customerId: customerId || data.orderId,
      orderId: data.orderId,
      messageType: 'transactional',
      method: 'sms',
      type: 'shipping-notification',
      recipient: data.phone,
      status: 'sent',
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
