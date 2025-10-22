import { sendEmailViaSendGrid } from './sendgrid';
import * as fs from 'fs';

interface EmailOrderData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  dueDate: string;
  customerPO?: string;
  modelId?: string;
  handedness?: string;
  features?: Record<string, any>;
  subtotal?: number;
  shipping?: number;
  total?: number;
  notes?: string;
  signatureLink: string;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function generateOrderDetailsHTML(orderData: EmailOrderData): string {
  let featuresHTML = '';
  
  if (orderData.features) {
    featuresHTML = Object.entries(orderData.features)
      .filter(([_, value]) => value)
      .map(([key, value]) => {
        const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;"><strong>${displayKey}:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${displayValue}</td>
          </tr>
        `;
      })
      .join('');
  }

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      ${orderData.modelId ? `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;"><strong>Model:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${orderData.modelId}</td>
        </tr>
      ` : ''}
      ${orderData.handedness ? `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;"><strong>Handedness:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #e0e0e0;">${orderData.handedness}</td>
        </tr>
      ` : ''}
      ${featuresHTML}
    </table>
  `;
}

function generateEmailHTML(orderData: EmailOrderData): string {
  const orderDetailsHTML = generateOrderDetailsHTML(orderData);
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation - ${orderData.orderId}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f8f8; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
    <h1 style="color: #2c3e50; margin: 0 0 10px 0;">Order Confirmation</h1>
    <p style="margin: 0; color: #7f8c8d;">Thank you for your order with AG Composites</p>
  </div>

  <div style="background-color: white; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px; margin-bottom: 20px;">
    <h2 style="color: #2c3e50; margin-top: 0;">Order Information</h2>
    <table style="width: 100%; margin-bottom: 15px;">
      <tr>
        <td style="padding: 5px 0;"><strong>Order ID:</strong></td>
        <td style="padding: 5px 0;">${orderData.orderId}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0;"><strong>Order Date:</strong></td>
        <td style="padding: 5px 0;">${orderData.orderDate}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0;"><strong>Due Date:</strong></td>
        <td style="padding: 5px 0;">${orderData.dueDate}</td>
      </tr>
      ${orderData.customerPO ? `
      <tr>
        <td style="padding: 5px 0;"><strong>Customer PO:</strong></td>
        <td style="padding: 5px 0;">${orderData.customerPO}</td>
      </tr>
      ` : ''}
    </table>

    <h3 style="color: #2c3e50; margin-top: 20px;">Order Details</h3>
    ${orderDetailsHTML}

    ${orderData.notes ? `
      <div style="margin-top: 20px; padding: 15px; background-color: #f8f8f8; border-radius: 5px;">
        <strong>Special Instructions:</strong>
        <p style="margin: 10px 0 0 0;">${orderData.notes}</p>
      </div>
    ` : ''}

    <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #e0e0e0;">
      <table style="width: 100%; max-width: 300px; margin-left: auto;">
        ${orderData.subtotal !== undefined ? `
        <tr>
          <td style="padding: 5px 0;"><strong>Subtotal:</strong></td>
          <td style="padding: 5px 0; text-align: right;">${formatCurrency(orderData.subtotal)}</td>
        </tr>
        ` : ''}
        ${orderData.shipping !== undefined && orderData.shipping > 0 ? `
        <tr>
          <td style="padding: 5px 0;"><strong>Shipping:</strong></td>
          <td style="padding: 5px 0; text-align: right;">${formatCurrency(orderData.shipping)}</td>
        </tr>
        ` : ''}
        ${orderData.total !== undefined ? `
        <tr style="border-top: 2px solid #2c3e50;">
          <td style="padding: 10px 0 5px 0;"><strong style="font-size: 18px;">TOTAL:</strong></td>
          <td style="padding: 10px 0 5px 0; text-align: right;"><strong style="font-size: 18px;">${formatCurrency(orderData.total)}</strong></td>
        </tr>
        ` : ''}
      </table>
    </div>
  </div>

  <div style="background-color: #fff3cd; padding: 20px; border: 1px solid #ffc107; border-radius: 5px; margin-bottom: 20px;">
    <h2 style="color: #856404; margin-top: 0;">Action Required: Review & Sign</h2>
    <p style="margin: 0 0 15px 0;">Please review the order details above carefully. If everything looks correct, click the button below to digitally sign and approve this order for production.</p>
    <div style="text-align: center; margin: 20px 0;">
      <a href="${orderData.signatureLink}" 
         style="display: inline-block; background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
        Review & Sign Order
      </a>
    </div>
    <p style="margin: 15px 0 0 0; font-size: 14px; color: #856404;">
      <strong>Important:</strong> Your order will not enter production until you have signed this document.
    </p>
  </div>

  <div style="background-color: #f8f8f8; padding: 15px; border-radius: 5px; text-align: center; color: #7f8c8d; font-size: 12px;">
    <p style="margin: 0 0 10px 0;">A PDF copy of this sales order is attached for your records.</p>
    <p style="margin: 0;">If you have any questions, please contact us at info@agcomposites.com</p>
    <p style="margin: 10px 0 0 0;">&copy; ${new Date().getFullYear()} AG Composites. All rights reserved.</p>
  </div>
</body>
</html>
  `;
}

function generateEmailText(orderData: EmailOrderData): string {
  let orderDetails = `
Order Confirmation - ${orderData.orderId}

Thank you for your order with AG Composites!

ORDER INFORMATION
-----------------
Order ID: ${orderData.orderId}
Order Date: ${orderData.orderDate}
Due Date: ${orderData.dueDate}
${orderData.customerPO ? `Customer PO: ${orderData.customerPO}` : ''}

ORDER DETAILS
-------------
${orderData.modelId ? `Model: ${orderData.modelId}` : ''}
${orderData.handedness ? `Handedness: ${orderData.handedness}` : ''}
`;

  if (orderData.features) {
    Object.entries(orderData.features)
      .filter(([_, value]) => value)
      .forEach(([key, value]) => {
        const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
        orderDetails += `${displayKey}: ${displayValue}\n`;
      });
  }

  if (orderData.notes) {
    orderDetails += `\nSpecial Instructions:\n${orderData.notes}\n`;
  }

  orderDetails += `\nPRICING
-------
${orderData.subtotal !== undefined ? `Subtotal: ${formatCurrency(orderData.subtotal)}` : ''}
${orderData.shipping !== undefined && orderData.shipping > 0 ? `Shipping: ${formatCurrency(orderData.shipping)}` : ''}
${orderData.total !== undefined ? `TOTAL: ${formatCurrency(orderData.total)}` : ''}

ACTION REQUIRED
---------------
Please review the order details above carefully. If everything looks correct, 
click the link below to digitally sign and approve this order for production:

${orderData.signatureLink}

IMPORTANT: Your order will not enter production until you have signed this document.

A PDF copy of this sales order is attached for your records.

If you have any questions, please contact us at info@agcomposites.com

© ${new Date().getFullYear()} AG Composites. All rights reserved.
  `;

  return orderDetails;
}

export async function sendFollowupOrderEmail(
  orderData: EmailOrderData,
  pdfPath: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Read PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    const emailHTML = generateEmailHTML(orderData);
    const emailText = generateEmailText(orderData);

    // SendGrid email with attachment
    const { client, fromEmail } = await (await import('./sendgrid')).getUncachableSendGridClient();

    const msg = {
      to: orderData.customerEmail,
      from: fromEmail,
      subject: `Order Confirmation - ${orderData.orderId} - Signature Required`,
      text: emailText,
      html: emailHTML,
      attachments: [
        {
          content: pdfBase64,
          filename: `Sales_Order_${orderData.orderId}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    };

    const [response] = await client.send(msg);

    return {
      success: true,
      messageId: response.headers['x-message-id'] as string,
    };
  } catch (error) {
    console.error('Error sending followup order email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
