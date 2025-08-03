import { db } from '../../db';
import { orderDrafts, customers } from '../../schema';
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

  // Get customer preferences
  const [order] = await db
    .select({
      customerId: orderDrafts.customerId,
      orderId: orderDrafts.orderId
    })
    .from(orderDrafts)
    .where(eq(orderDrafts.orderId, data.orderId));

  if (!order || !order.customerId) {
    results.errors.push('Order or customer not found');
    return results;
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, parseInt(order.customerId)));

  if (!customer) {
    results.errors.push('Customer not found');
    return results;
  }

  // Determine notification methods
  const preferredMethods = customer.preferredCommunicationMethod as string[] || ['email'];
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

  console.log('Email notification would be sent:', {
    to: data.email,
    subject,
    message: message.substring(0, 100) + '...'
  });

  // TODO: Implement actual email sending (SendGrid, etc.)
  // For now, just log the notification
  return Promise.resolve();
}

async function sendSMSNotification(data: {
  phone: string;
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery?: Date;
}) {
  const message = `AG Composites: Your order ${data.orderId} has shipped! Track with ${data.trackingNumber} on ${data.carrier}. ${data.estimatedDelivery ? `Est. delivery: ${data.estimatedDelivery.toLocaleDateString()}` : ''}`;

  console.log('SMS notification would be sent:', {
    to: data.phone,
    message
  });

  // TODO: Implement actual SMS sending (Twilio, etc.)
  // For now, just log the notification
  return Promise.resolve();
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