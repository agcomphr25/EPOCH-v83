import { sendEmailViaSendGrid } from './sendgrid';
import * as fs from 'fs';
import * as path from 'path';
import { resolveAssetPath } from '../src/utils/assetPaths';

interface EmailOrderData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  dueDate: string;
  customerPO?: string;
  modelId?: string;
  handedness?: string;
  features?: Record<string, string>;  // Display names (e.g. "Action Inlet": "BAT Vesper")
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

function generateEmailHTML(orderData: EmailOrderData, logoBase64?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation - ${orderData.orderId}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <!-- Header -->
  <div style="background-color: #2c3e50; padding: 30px 20px; border-radius: 5px; margin-bottom: 30px; text-align: center;">
    ${logoBase64 ? `
    <img src="data:image/png;base64,${logoBase64}" alt="AG Composites" style="max-width: 250px; height: auto; margin-bottom: 10px;" />
    ` : `
    <h1 style="color: #ffffff; margin: 0 0 10px 0; font-size: 28px;">AG Composites</h1>
    `}
    <p style="margin: 0; color: #ecf0f1; font-size: 16px;">Sales Order Confirmation</p>
  </div>

  <!-- Greeting -->
  <div style="margin-bottom: 25px;">
    <p style="margin: 0 0 15px 0; font-size: 16px;">Dear ${orderData.customerName},</p>
    <p style="margin: 0 0 15px 0; font-size: 16px;">Thank you for your order with AG Composites! Please take a moment to review the order and sign confirming details of your customized order. We are unable to put your order into production without this confirmation.</p>
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
      Complete order details and specifications are included in the attached Sales Order PDF.
    </p>
  </div>

  <!-- Terms and Conditions Section -->
  <div style="background-color: #f8f9fa; padding: 25px; border-left: 4px solid #6c757d; border-radius: 3px; margin-bottom: 25px;">
    <h2 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 18px;">Terms and Conditions - Standard</h2>
    <p style="margin: 0 0 10px 0; font-size: 13px; color: #666; font-weight: bold;">Initial Terms and Conditions</p>
    <p style="margin: 0 0 15px 0; font-size: 13px; color: #666; font-style: italic;">
      Please sign and return a copy of this form, or reply to the email that you are in agreement
    </p>
    <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #333; line-height: 1.8;">
      <li>Please review the specs indicated and make sure they match your intent.</li>
      <li>Any changes to specs requested after 30 days from Order Date may result in additional charges.</li>
      <li>Remington "clones" are not made by Remington and may not fit as exactly as Remington models do.</li>
      <li>The Estimated Completion Date is an estimation based on our current capacity and the specs of your order. We make every effort to ship stocks by the Estimated Completion Date.</li>
      <li>Please sign and return a copy of this form, or reply to the email that you are in agreement with the specs of your order and these terms and conditions. We are not able to place any order into production without a confirmation.</li>
    </ol>
  </div>

  <!-- Action Required Section -->
  <div style="background-color: #fff3cd; padding: 25px; border: 2px solid #ffc107; border-radius: 5px; margin-bottom: 25px;">
    <h2 style="color: #856404; margin: 0 0 15px 0; font-size: 18px;">✓ Signature Required</h2>
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #333;">
      Please review the attached Sales Order PDF carefully. Once reviewed, click the button below to digitally sign and approve your order for production.
    </p>
    <div style="text-align: center; margin: 25px 0;">
      <a href="${orderData.signatureLink}" 
         style="display: inline-block; background-color: #28a745; color: white; padding: 16px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 17px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
        Review and Sign Order
      </a>
    </div>
    <p style="margin: 0; font-size: 14px; color: #856404; text-align: center; line-height: 1.5;">
      <strong>Important:</strong> Production will begin only after you have reviewed and signed this order.
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

function generateEmailText(orderData: EmailOrderData): string {
  return `
═══════════════════════════════════════════════════════════
AG COMPOSITES - SALES ORDER CONFIRMATION
═══════════════════════════════════════════════════════════

Dear ${orderData.customerName},

Thank you for your order with AG Composites! Please take a moment to 
review the order and sign confirming details of your customized order. 
We are unable to put your order into production without this confirmation.

ORDER SUMMARY
─────────────────────────────────────────────────────────────
Order Number:           ${orderData.orderId}
Order Date:             ${orderData.orderDate}
Estimated Completion:   ${orderData.dueDate}
${orderData.customerPO ? `Your PO Number:         ${orderData.customerPO}` : ''}

Complete order details and specifications are included in the 
attached Sales Order PDF.

TERMS AND CONDITIONS - STANDARD
─────────────────────────────────────────────────────────────
Initial Terms and Conditions
Please sign and return a copy of this form, or reply to the email 
that you are in agreement

1. Please review the specs indicated and make sure they match your intent.
2. Any changes to specs requested after 30 days from Order Date may 
   result in additional charges.
3. Remington "clones" are not made by Remington and may not fit as 
   exactly as Remington models do.
4. The Estimated Completion Date is an estimation based on our current 
   capacity and the specs of your order. We make every effort to ship 
   stocks by the Estimated Completion Date.
5. Please sign and return a copy of this form, or reply to the email 
   that you are in agreement with the specs of your order and these 
   terms and conditions. We are not able to place any order into 
   production without a confirmation.

✓ SIGNATURE REQUIRED
─────────────────────────────────────────────────────────────
Please review the attached Sales Order PDF carefully. Once reviewed, 
click the link below to digitally sign and approve your order for 
production:

${orderData.signatureLink}

IMPORTANT: Production will begin only after you have reviewed and 
signed this order.

─────────────────────────────────────────────────────────────
Questions about your order? Contact us at sales@agcomposites.com

© ${new Date().getFullYear()} AG Composites. All rights reserved.
  `;
}

export async function sendFollowupOrderEmail(
  orderData: EmailOrderData,
  pdfPath: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Read PDF file
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Read and encode company logo
    let logoBase64: string | undefined;
    try {
      const logoPath = resolveAssetPath('logo_updated.png');
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = logoBuffer.toString('base64');
      } else {
        console.warn('Logo file not found at:', logoPath);
      }
    } catch (error) {
      console.warn('Could not load company logo for email:', error);
    }

    const emailHTML = generateEmailHTML(orderData, logoBase64);
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
