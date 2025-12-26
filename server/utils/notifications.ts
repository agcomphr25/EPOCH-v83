import { customers } from '@shared/schema';
import { allOrders } from '../schema.js';
import { eq } from 'drizzle-orm';

import { db } from '../db.js';

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
  const preferredMethods = data.preferredMethods ||
    (customer.preferredCommunicationMethod as string[]) || ['email'];
  const email = data.customerEmail || customer.email;
  const phone = data.customerPhone || customer.phone;

  // Check if Twilio is configured
  const allowSms = Boolean(process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_NUMBER);
  const prefersSms = preferredMethods.includes('sms');
  const prefersEmail = preferredMethods.includes('email');

  console.log('📬 Notification config:', {
    orderId: data.orderId,
    preferredMethods,
    prefersEmail,
    prefersSms,
    hasEmail: !!email,
    hasPhone: !!phone,
    allowSms,
  });

  // Track successful sends - only update DB after confirmed success
  let notificationSucceeded = false;
  const succeededMethods: string[] = [];

  // Determine if we need email fallback (SMS preferred but Twilio not configured)
  const needsEmailFallback = prefersSms && !prefersEmail && !allowSms && email;
  if (needsEmailFallback) {
    console.log('[NOTIFY] SMS preferred but Twilio missing → fallback to email');
  }

  // --- EMAIL PATH ---
  // Send email if: customer prefers email OR we need fallback from SMS
  if ((prefersEmail || needsEmailFallback) && email) {
    console.log('[TRACKING NOTIFY] Preparing email for:', email, 'Order:', data.orderId);
    console.log('[TRACKING NOTIFY] Email payload:', {
      email,
      orderId: data.orderId,
      trackingNumber: data.trackingNumber,
      carrier: data.carrier,
      estimatedDelivery: data.estimatedDelivery,
      customerId: customer?.id?.toString(),
      reason: needsEmailFallback ? 'SMS fallback' : 'customer preference',
    });
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
      console.log('[NOTIFY] Email succeeded');
      console.log('✅ Email notification succeeded');
    } catch (error: any) {
      console.error('[NOTIFY-EMAIL-FAIL]', error);
      console.error('[TRACKING ERROR RAW]', error?.response?.body || error?.message || error);
      const errorMsg = `Email failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      results.errors.push(errorMsg);
      console.error('❌ Email notification failed:', error);
    }
  } else if (!prefersEmail && !needsEmailFallback) {
    console.log('[NOTIFY] Email skipped - not in customer preferences');
  } else if (!email) {
    console.log('[NOTIFY] Email skipped - no email address available');
  }

  // --- SMS PATH ---
  if (prefersSms && phone) {
    if (!allowSms) {
      console.log('[NOTIFY] SMS preferred but Twilio credentials missing → skipping SMS');
      // Don't add to errors if we already have email fallback success
      if (!notificationSucceeded) {
        results.errors.push('SMS preferred but Twilio not configured');
      }
    } else {
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
        console.log('[NOTIFY] SMS succeeded');
        console.log('✅ SMS notification succeeded');
      } catch (error) {
        console.error('[NOTIFY-SMS-FAIL]', error);
        const errorMsg = `SMS failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        results.errors.push(errorMsg);
        console.error('❌ SMS notification failed:', error);
      }
    }
  } else if (prefersSms && !phone) {
    console.log('[NOTIFY] SMS skipped - no phone number available');
  }

  // CRITICAL: Only update order notification status if at least one method succeeded
  // This ensures failed sends do NOT mark the order as notified, allowing retries
  if (notificationSucceeded && succeededMethods.length > 0) {
    console.log('📬 Updating order notification status - methods succeeded:', succeededMethods);
    await db
      .update(allOrders)
      .set({
        customerNotified: true,
        notificationMethod: succeededMethods.join(', '),
        notificationSentAt: new Date(),
      })
      .where(eq(allOrders.orderId, data.orderId));

    results.success = true;
    results.methods = succeededMethods;
    console.log('✅ Notification complete for order:', data.orderId);
  } else {
    // All methods failed - do NOT update customerNotified
    // This allows automatic triggers and manual resend to retry later
    console.error('❌ All notification methods failed for order:', data.orderId, results.errors);
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
  // Email notification logic
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

  console.log('Sending email shipping notification:', {
    to: data.email,
    subject,
    message: message.substring(0, 100) + '...',
  });

  // Use the actual email API endpoint
  try {
    // In Replit, use relative path since we're making internal server-to-server call
    const response = await fetch(`http://127.0.0.1:5000/api/communications/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: data.email,
        subject: subject,
        message: message,
        customerId: customerId || data.orderId, // Use actual customer ID or fallback to order ID
        orderId: data.orderId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json() as any;
      throw new Error(errorData.error || 'Email API request failed');
    }

    const result = await response.json() as any;
    console.log(
      'Email shipping notification sent successfully:',
      result.externalId
    );
    return result;
  } catch (error) {
    console.error('Failed to send email shipping notification:', error);
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

  console.log('Sending SMS shipping notification:', {
    to: data.phone,
    message: message.substring(0, 50) + '...',
  });

  // Use the actual SMS API endpoint
  try {
    // In Replit, use relative path since we're making internal server-to-server call
    const response = await fetch(`http://127.0.0.1:5000/api/communications/sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: data.phone,
        message: message,
        customerId: customerId || data.orderId, // Use actual customer ID or fallback to order ID
        orderId: data.orderId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json() as any;
      throw new Error(errorData.error || 'SMS API request failed');
    }

    const result = await response.json() as any;
    console.log(
      'SMS shipping notification sent successfully:',
      result.externalId
    );
    return result;
  } catch (error) {
    console.error('Failed to send SMS shipping notification:', error);
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
