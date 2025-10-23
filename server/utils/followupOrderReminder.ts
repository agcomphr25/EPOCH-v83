import { storage } from '../storage.js';
import { sendEmailViaSendGrid } from './sendgrid.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Send reminder email for follow-up orders older than 7 days without signature
 */
export async function sendReminderForOverdueOrders() {
  console.log('📧 Checking for overdue follow-up orders (>7 days without signature)...');
  
  try {
    // Get all follow-up orders that need reminders
    const overdueOrders = await storage.getOverdueFollowupOrders(7);
    
    if (overdueOrders.length === 0) {
      console.log('✅ No overdue orders found');
      return { sent: 0, message: 'No overdue orders' };
    }
    
    console.log(`⚠️  Found ${overdueOrders.length} overdue order(s)`);
    
    let sentCount = 0;
    let errorCount = 0;
    
    for (const followupOrder of overdueOrders) {
      try {
        console.log(`📨 Sending reminder for order ${followupOrder.orderId} to ${followupOrder.customerEmail}`);
        
        // Generate signature link
        const baseUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : 'http://localhost:5000';
        const signatureUrl = `${baseUrl}/sign-order/${followupOrder.signatureToken}`;
        
        // Create reminder email
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #0066cc; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background: #f9f9f9; }
              .button { 
                display: inline-block; 
                padding: 12px 30px; 
                background: #0066cc; 
                color: white; 
                text-decoration: none; 
                border-radius: 5px; 
                margin: 20px 0; 
              }
              .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
              .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Reminder: Sales Order Confirmation Required</h1>
              </div>
              <div class="content">
                <p>Hello,</p>
                
                <div class="warning">
                  <strong>Action Required:</strong> We sent you a sales order confirmation over a week ago and haven't received your signature yet.
                </div>
                
                <p><strong>Order Number:</strong> ${followupOrder.orderId}</p>
                
                <p>We need your signature to proceed with production of your order. Please review and sign the sales order at your earliest convenience.</p>
                
                <div style="text-align: center;">
                  <a href="${signatureUrl}" class="button">Review & Sign Order</a>
                </div>
                
                <p><em>If you have any questions or concerns about your order, please contact us immediately.</em></p>
                
                <p>Thank you,<br>AG Composites Team</p>
              </div>
              <div class="footer">
                <p>This is an automated reminder. Please do not reply to this email.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        
        await sendEmailViaSendGrid({
          to: followupOrder.customerEmail,
          subject: `REMINDER: Order ${followupOrder.orderId} - Signature Required`,
          html: emailHtml,
        });
        
        // Update the followup order to mark reminder as sent
        await storage.updateFollowupOrder(followupOrder.id, {
          reminderSent: true,
          reminderSentAt: new Date(),
        });
        
        sentCount++;
        console.log(`✅ Reminder sent successfully for order ${followupOrder.orderId}`);
        
      } catch (emailError) {
        errorCount++;
        console.error(`❌ Failed to send reminder for order ${followupOrder.orderId}:`, emailError);
      }
    }
    
    console.log(`📧 Reminder process complete: ${sentCount} sent, ${errorCount} failed`);
    return { sent: sentCount, failed: errorCount };
    
  } catch (error) {
    console.error('Error in reminder process:', error);
    throw error;
  }
}
