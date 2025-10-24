import { sendEmailViaSendGrid } from './sendgrid';
import * as fs from 'fs';
import * as path from 'path';

interface SignedOrderConfirmationData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  dueDate: string;
}

function generateConfirmationEmailHTML(data: SignedOrderConfirmationData, logoBase64?: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Signed - ${data.orderId}</title>
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

  <!-- Success Message -->
  <div style="background-color: #d4edda; border: 2px solid #28a745; border-radius: 5px; padding: 25px; margin-bottom: 30px; text-align: center;">
    <div style="font-size: 48px; margin-bottom: 15px;">✓</div>
    <h2 style="color: #155724; margin: 0 0 10px 0; font-size: 22px;">Order Successfully Signed!</h2>
    <p style="margin: 0; color: #155724; font-size: 15px;">Your order is now in the production queue</p>
  </div>

  <!-- Greeting -->
  <div style="margin-bottom: 25px;">
    <p style="margin: 0 0 15px 0; font-size: 16px;">Dear ${data.customerName},</p>
    <p style="margin: 0 0 15px 0; font-size: 16px;">
      Thank you for signing and confirming your order! We have received your digital signature and your order has been successfully moved to our production queue.
    </p>
  </div>

  <!-- Order Details Box -->
  <div style="background-color: #f8f9fa; padding: 20px; border-left: 4px solid #28a745; border-radius: 3px; margin-bottom: 25px;">
    <h2 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 18px;">Order Information</h2>
    <table style="width: 100%; font-size: 15px;">
      <tr>
        <td style="padding: 8px 10px 8px 0; color: #666;"><strong>Order Number:</strong></td>
        <td style="padding: 8px 0; color: #2c3e50;"><strong>${data.orderId}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 10px 8px 0; color: #666;">Order Date:</td>
        <td style="padding: 8px 0;">${data.orderDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px 10px 8px 0; color: #666;">Estimated Completion:</td>
        <td style="padding: 8px 0;">${data.dueDate}</td>
      </tr>
      <tr>
        <td style="padding: 8px 10px 8px 0; color: #666;">Status:</td>
        <td style="padding: 8px 0; color: #28a745;"><strong>In Production Queue</strong></td>
      </tr>
    </table>
  </div>

  <!-- What's Next Section -->
  <div style="background-color: #e7f3ff; padding: 20px; border-left: 4px solid #0066cc; border-radius: 3px; margin-bottom: 25px;">
    <h3 style="color: #0066cc; margin: 0 0 15px 0; font-size: 18px;">What Happens Next?</h3>
    <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
      <li>Your order has been added to our production queue</li>
      <li>Our team will begin work on your custom order</li>
      <li>We will keep you updated on the progress</li>
      <li>You will be notified when your order is ready to ship</li>
    </ul>
  </div>

  <!-- Contact Information -->
  <div style="background-color: #fff; padding: 20px; border: 1px solid #e0e0e0; border-radius: 3px; margin-bottom: 25px;">
    <h3 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 16px;">Need to Make Changes?</h3>
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
      If you need to make any changes to your order, please contact us as soon as possible. Changes requested after 30 days from the order date may result in additional charges.
    </p>
    <p style="margin: 0; font-size: 14px; color: #666;">
      Email us at <a href="mailto:sales@agcomposites.com" style="color: #0066cc; text-decoration: none;"><strong>sales@agcomposites.com</strong></a>
    </p>
  </div>

  <!-- Footer -->
  <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px; text-align: center;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
      Thank you for choosing AG Composites!
    </p>
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
      Questions? Contact us at <a href="mailto:sales@agcomposites.com" style="color: #2c3e50; text-decoration: none;"><strong>sales@agcomposites.com</strong></a>
    </p>
    <p style="margin: 0; font-size: 12px; color: #999;">
      &copy; ${new Date().getFullYear()} AG Composites. All rights reserved.
    </p>
  </div>

</body>
</html>
  `;
}

function generateConfirmationEmailText(data: SignedOrderConfirmationData): string {
  return `
═══════════════════════════════════════════════════════════
AG COMPOSITES - ORDER CONFIRMATION
═══════════════════════════════════════════════════════════

✓ ORDER SUCCESSFULLY SIGNED!
Your order is now in the production queue

Dear ${data.customerName},

Thank you for signing and confirming your order! We have received your 
digital signature and your order has been successfully moved to our 
production queue.

ORDER INFORMATION
─────────────────────────────────────────────────────────────
Order Number:           ${data.orderId}
Order Date:             ${data.orderDate}
Estimated Completion:   ${data.dueDate}
Status:                 In Production Queue

WHAT HAPPENS NEXT?
─────────────────────────────────────────────────────────────
• Your order has been added to our production queue
• Our team will begin work on your custom order
• We will keep you updated on the progress
• You will be notified when your order is ready to ship

NEED TO MAKE CHANGES?
─────────────────────────────────────────────────────────────
If you need to make any changes to your order, please contact us as 
soon as possible. Changes requested after 30 days from the order date 
may result in additional charges.

Email us at sales@agcomposites.com

─────────────────────────────────────────────────────────────
Thank you for choosing AG Composites!

Questions? Contact us at sales@agcomposites.com

© ${new Date().getFullYear()} AG Composites. All rights reserved.
  `;
}

export async function sendOrderSignedConfirmation(
  data: SignedOrderConfirmationData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Read and encode company logo
    let logoBase64: string | undefined;
    try {
      const logoPath = path.join(process.cwd(), 'server', 'assets', 'logo_updated.png');
      console.log('📧 Logo path for confirmation email:', logoPath);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = logoBuffer.toString('base64');
        console.log('✅ Logo loaded successfully for confirmation email');
      } else {
        console.warn('❌ Logo file not found at:', logoPath);
      }
    } catch (error) {
      console.warn('❌ Could not load company logo for confirmation email:', error);
    }

    const emailHTML = generateConfirmationEmailHTML(data, logoBase64);
    const emailText = generateConfirmationEmailText(data);

    const result = await sendEmailViaSendGrid({
      to: data.customerEmail,
      subject: `Order ${data.orderId} Signed - Now in Production Queue`,
      text: emailText,
      html: emailHTML,
    });

    if (result.success) {
      console.log(`✅ Order signed confirmation email sent to ${data.customerEmail} for order ${data.orderId}`);
    } else {
      console.error(`❌ Failed to send confirmation email: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error('Error sending order signed confirmation email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
