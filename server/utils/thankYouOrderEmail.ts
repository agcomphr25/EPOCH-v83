import { sendEmailViaSendGrid } from './sendgrid';
import * as fs from 'fs';
import * as path from 'path';

interface ThankYouEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  dueDate: string;
  customerPO?: string;
  notes?: string;
}

function generateThankYouEmailHTML(orderData: ThankYouEmailData, logoBase64?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You - ${orderData.orderId}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <!-- Header -->
  <div style="background-color: #2c3e50; padding: 30px 20px; border-radius: 5px; margin-bottom: 30px; text-align: center;">
    ${logoBase64 ? `
    <img src="data:image/png;base64,${logoBase64}" alt="AG Composites" style="max-width: 250px; height: auto; margin-bottom: 10px;" />
    ` : `
    <h1 style="color: #ffffff; margin: 0 0 10px 0; font-size: 28px;">AG Composites</h1>
    `}
    <p style="margin: 0; color: #ecf0f1; font-size: 16px;">Order Confirmation</p>
  </div>

  <!-- Greeting -->
  <div style="margin-bottom: 25px;">
    <p style="margin: 0 0 15px 0; font-size: 16px;">Dear ${orderData.customerName},</p>
    <p style="margin: 0 0 15px 0; font-size: 16px;">Thank you for your purchase with AG Composites! We appreciate your business and are excited to work with you.</p>
  </div>

  <!-- Order Summary Box -->
  <div style="background-color: #f8f9fa; padding: 20px; border-left: 4px solid #2c3e50; border-radius: 3px; margin-bottom: 25px;">
    <h2 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 18px;">Order Summary</h2>
    <table style="width: 100%; font-size: 15px;">
      <tr>
        <td style="padding: 8px 10px 8px 0; color: #666;"><strong>Order Number:</strong></td>
        <td style="padding: 8px 0; color: #2c3e50;"><strong>${orderData.orderId}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 10px 8px 0; color: #666;">Order Date:</td>
        <td style="padding: 8px 0;">${orderData.orderDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px 10px 8px 0; color: #666;">Estimated Completion:</td>
        <td style="padding: 8px 0;">${orderData.dueDate}</td>
      </tr>
      ${orderData.customerPO ? `
      <tr>
        <td style="padding: 8px 10px 8px 0; color: #666;">Your PO Number:</td>
        <td style="padding: 8px 0;">${orderData.customerPO}</td>
      </tr>
      ` : ''}
    </table>
    <p style="margin: 15px 0 0 0; font-size: 14px; color: #666; font-style: italic;">
      Complete order details are included in the attached Sales Order PDF.
    </p>
  </div>

  ${orderData.notes ? `
  <!-- Notes Section -->
  <div style="background-color: #f8f9fa; padding: 20px; border-left: 4px solid #6c757d; border-radius: 3px; margin-bottom: 25px;">
    <h3 style="color: #2c3e50; margin: 0 0 10px 0; font-size: 16px;">Order Notes</h3>
    <p style="margin: 0; font-size: 14px; color: #333; white-space: pre-wrap;">${orderData.notes}</p>
  </div>
  ` : ''}

  <!-- Next Steps -->
  <div style="background-color: #e7f3ff; padding: 25px; border: 2px solid #0066cc; border-radius: 5px; margin-bottom: 25px;">
    <h2 style="color: #0066cc; margin: 0 0 15px 0; font-size: 18px;">✓ Order Confirmed</h2>
    <p style="margin: 0 0 15px 0; font-size: 15px; color: #333;">
      Your order has been received and is being processed. We will keep you updated on the progress and notify you when your order is ready to ship.
    </p>
    <p style="margin: 0; font-size: 14px; color: #0066cc;">
      <strong>Thank you for choosing AG Composites!</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px; text-align: center;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
      Questions about your order? Contact us at <a href="mailto:sales@agcomposites.com" style="color: #2c3e50; text-decoration: none;"><strong>sales@agcomposites.com</strong></a>
    </p>
    <p style="margin: 0; font-size: 12px; color: #999;">
      &copy; ${new Date().getFullYear()} AG Composites. All rights reserved.
    </p>
  </div>

</body>
</html>
  `;
}

function generateThankYouEmailText(orderData: ThankYouEmailData): string {
  return `
═══════════════════════════════════════════════════════════
AG COMPOSITES - ORDER CONFIRMATION
═══════════════════════════════════════════════════════════

Dear ${orderData.customerName},

Thank you for your purchase with AG Composites! We appreciate your 
business and are excited to work with you.

ORDER SUMMARY
─────────────────────────────────────────────────────────────
Order Number:           ${orderData.orderId}
Order Date:             ${orderData.orderDate}
Estimated Completion:   ${orderData.dueDate}
${orderData.customerPO ? `Your PO Number:         ${orderData.customerPO}` : ''}

Complete order details are included in the attached Sales Order PDF.

${orderData.notes ? `
ORDER NOTES
─────────────────────────────────────────────────────────────
${orderData.notes}

` : ''}
✓ ORDER CONFIRMED
─────────────────────────────────────────────────────────────
Your order has been received and is being processed. We will keep 
you updated on the progress and notify you when your order is ready 
to ship.

Thank you for choosing AG Composites!

─────────────────────────────────────────────────────────────
Questions about your order? Contact us at sales@agcomposites.com

© ${new Date().getFullYear()} AG Composites. All rights reserved.
  `;
}

export async function sendThankYouOrderEmail(
  orderData: ThankYouEmailData,
  pdfPath: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Read PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    const emailHTML = generateThankYouEmailHTML(orderData);
    const emailText = generateThankYouEmailText(orderData);

    // SendGrid email with attachment
    const { client, fromEmail } = await (await import('./sendgrid')).getUncachableSendGridClient();

    const msg = {
      to: orderData.customerEmail,
      from: fromEmail,
      subject: `Thank You for Your Order - ${orderData.orderId}`,
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

    console.log('📧 Sending thank you email:', {
      to: orderData.customerEmail,
      from: fromEmail,
      subject: msg.subject,
      textLength: emailText?.length || 0,
      htmlLength: emailHTML?.length || 0,
      hasAttachment: true,
      pdfSize: pdfBase64?.length || 0,
    });

    const [response] = await client.send(msg);

    console.log('✅ SendGrid response:', {
      statusCode: response.statusCode,
      messageId: response.headers['x-message-id'],
      body: response.body,
      headers: response.headers,
    });

    return {
      success: true,
      messageId: response.headers['x-message-id'] as string,
    };
  } catch (error) {
    console.error('Error sending thank you order email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
