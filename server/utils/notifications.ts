import { db } from '../db.js';
import { orderDrafts, customers } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface NotificationData {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery?: Date;
  customerEmail?: string;
  customerPhone?: string;
  preferredMethods?: string[];
}

export async function sendCustomerNotification(data: NotificationData): Promise<{
  success: boolean;
  methods: string[];
  errors?: string[];
}> {
  const results = {
    success: false,
    methods: [] as string[],
    errors: [] as string[]
  };

  // Get customer preferences - look in both finalized and draft orders
  let customer = null;
  let order = null;

  // First try to find in finalized orders using storage instead of direct import
  try {
    const { storage } = await import('../storage.js');
    const finalizedOrders = await storage.getAllFinalizedOrders();
    const finalizedOrder = finalizedOrders.find((order: any) => order.orderId === data.orderId);
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
      const draftOrder = draftOrders.find((order: any) => order.orderId === data.orderId);

      if (draftOrder?.customerId) {
        order = draftOrder;
        customer = await storage.getCustomerById(draftOrder.customerId);
      }
    } catch (error) {
      console.log('Order not found in draft orders either');
    }
  }

  if (!order || !customer) {
    results.errors.push('Order or customer not found in either finalized or draft orders');
    return results;
  }

  // Determine notification methods
  const preferredMethods = data.preferredMethods || customer.preferredCommunicationMethod as string[] || ['email'];
  const email = data.customerEmail || customer.email;
  const phone = data.customerPhone || customer.phone;

  // Send email notification if preferred and email available
  if (preferredMethods.includes('email') && email) {
    try {
      await sendEmailNotification({
        email,
        orderId: data.orderId,
        trackingNumber: data.trackingNumber,
        carrier: data.carrier,
        estimatedDelivery: data.estimatedDelivery
      });
      results.methods.push('email');
    } catch (error) {
      results.errors.push(`Email failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Send SMS notification if preferred and phone available
  if (preferredMethods.includes('sms') && phone) {
    try {
      await sendSMSNotification({
        phone,
        orderId: data.orderId,
        trackingNumber: data.trackingNumber,
        carrier: data.carrier,
        estimatedDelivery: data.estimatedDelivery
      });
      results.methods.push('sms');
    } catch (error) {
      results.errors.push(`SMS failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Update order notification status
  if (results.methods.length > 0) {
    await db
      .update(orderDrafts)
      .set({
        customerNotified: true,
        notificationMethod: results.methods.join(', '),
        notificationSentAt: new Date()
      })
      .where(eq(orderDrafts.orderId, data.orderId));
    
    results.success = true;
  }

  return results;
}

async function sendEmailNotification(data: {
  email: string;
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery?: Date;
}) {
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
    message: message.substring(0, 100) + '...'
  });

  // Use the actual email API endpoint
  try {
    const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
    const response = await fetch(`${baseUrl}/api/communications/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: data.email,
        subject: subject,
        message: message,
        customerId: customer?.id.toString() || '0', // Use actual customer ID or fallback
        orderId: data.orderId
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Email API request failed');
    }

    const result = await response.json();
    console.log('Email shipping notification sent successfully:', result.externalId);
    return result;
  } catch (error) {
    console.error('Failed to send email shipping notification:', error);
    throw error;
  }
}

async function sendSMSNotification(data: {
  phone: string;
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery?: Date;
}) {
  const message = `AG Composites: Your order ${data.orderId} has shipped! Track with ${data.trackingNumber} on ${data.carrier}. ${data.estimatedDelivery ? `Est. delivery: ${data.estimatedDelivery.toLocaleDateString()}` : ''}`;

  console.log('Sending SMS shipping notification:', {
    to: data.phone,
    message: message.substring(0, 50) + '...'
  });

  // Use the actual SMS API endpoint
  try {
    const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';
    const response = await fetch(`${baseUrl}/api/communications/sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: data.phone,
        message: message,
        customerId: customer?.id.toString() || '0', // Use actual customer ID or fallback
        orderId: data.orderId
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'SMS API request failed');
    }

    const result = await response.json();
    console.log('SMS shipping notification sent successfully:', result.externalId);
    return result;
  } catch (error) {
    console.error('Failed to send SMS shipping notification:', error);
    throw error;
  }
}

export async function updateTrackingInfo(orderId: string, trackingData: {
  trackingNumber: string;
  carrier?: string;
  shippedDate?: Date;
  estimatedDelivery?: Date;
}) {
  return await db
    .update(orderDrafts)
    .set({
      trackingNumber: trackingData.trackingNumber,
      shippingCarrier: trackingData.carrier || 'UPS',
      shippedDate: trackingData.shippedDate || new Date(),
      estimatedDelivery: trackingData.estimatedDelivery,
      shippingLabelGenerated: true
    })
    .where(eq(orderDrafts.orderId, orderId));
}