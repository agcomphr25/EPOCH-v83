import axios from 'axios';

export type CommunicationMethod = 'email' | 'sms';

/**
 * Send order confirmation via email or SMS.
 * @param orderId - Order ID for confirmation
 * @param via - Communication method (email or SMS)
 */
export async function sendOrderConfirmation(orderId: string, via: CommunicationMethod): Promise<void> {
  await axios.post('/api/communications/order-confirmation', {
    orderId,
    via,
  });
}

/**
 * Send shipping notification via email or SMS.
 * @param orderId - Order ID for shipping notification
 * @param via - Communication method (email or SMS)
 */
export async function sendShippingNotification(orderId: string, via: CommunicationMethod): Promise<void> {
  await axios.post('/api/communications/shipping-notification', {
    orderId,
    via,
  });
}

/**
 * Send quality control alert via email or SMS.
 * @param orderId - Order ID for QC alert
 * @param via - Communication method (email or SMS)
 * @param message - Alert message
 */
export async function sendQualityControlAlert(orderId: string, via: CommunicationMethod, message: string): Promise<void> {
  await axios.post('/api/communications/quality-alert', {
    orderId,
    via,
    message,
  });
}