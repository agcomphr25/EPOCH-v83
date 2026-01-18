import { storage } from '../storage.js';
import { db } from '../db.js';
import { communicationLogs } from '@shared/schema';
import { sendOrderConfirmationNotification } from './notifications.js';
import { createSignatureLink, checkEnvironmentGuard, logSignatureEmailSend } from './magicLink.js';

const REMINDER_COOLDOWN_HOURS = 48; // Minimum hours between reminders
const MAX_REMINDER_ATTEMPTS = 3; // Maximum reminder emails per order

// LEGACY ORDER CUTOFF: Orders created before this date will NOT receive reminder emails.
// This prevents sending reminders for orders already in the system as of 1/8/26.
// Only orders entered after 01/11/26 (i.e., created on 01/12/26 or later) will receive reminders.
const REMINDER_CUTOFF_DATE = new Date('2026-01-12T00:00:00Z');

/**
 * Send reminder emails for follow-up orders using the unified notification function.
 * Enforces cooldown (48h) and max attempts (3) per order.
 * Uses existing signature_token - does NOT regenerate.
 * Does NOT bypass deduplication.
 */
export async function sendReminderForOverdueOrders() {
  console.log('📧 [REMINDER] Checking for overdue follow-up orders (>5 days without signature)...');
  
  try {
    // Get all follow-up orders that need reminders
    const overdueOrders = await storage.getOverdueFollowupOrders(5);
    
    if (overdueOrders.length === 0) {
      console.log('✅ [REMINDER] No overdue orders found');
      return { sent: 0, skipped: 0, failed: 0, message: 'No overdue orders' };
    }
    
    console.log(`⚠️  [REMINDER] Found ${overdueOrders.length} overdue order(s)`);
    
    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const results: Array<{
      orderId: string;
      outcome: 'sent' | 'skipped' | 'failed';
      reason?: string;
      error?: string;
    }> = [];
    
    for (const followupOrder of overdueOrders) {
      try {
        // Skip legacy orders created before the cutoff date (or with missing/invalid createdAt)
        // Treat null/invalid createdAt as legacy to ensure no pre-cutoff orders receive reminders
        let orderCreatedAt: Date | null = null;
        if (followupOrder.createdAt) {
          const parsed = new Date(followupOrder.createdAt);
          if (!isNaN(parsed.getTime())) {
            orderCreatedAt = parsed;
          }
        }
        
        const isLegacyOrder = !orderCreatedAt || orderCreatedAt < REMINDER_CUTOFF_DATE;
        if (isLegacyOrder) {
          const dateInfo = orderCreatedAt ? orderCreatedAt.toISOString() : 'missing/invalid date';
          console.log(`⏭️ [REMINDER] Order ${followupOrder.orderId} is legacy (${dateInfo}), skipping reminder`);
          
          // Log to communication_logs for traceability
          await db.insert(communicationLogs).values({
            orderId: followupOrder.orderId,
            customerId: followupOrder.customerId,
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'reminder',
            recipient: followupOrder.customerEmail,
            status: 'skipped',
            skipReason: 'legacy_order_before_cutoff',
            signatureToken: followupOrder.signatureToken || undefined,
            message: `Reminder skipped for ${followupOrder.orderId}: legacy order created before cutoff (${dateInfo})`,
            sentAt: new Date(),
          });
          
          skippedCount++;
          results.push({ orderId: followupOrder.orderId, outcome: 'skipped', reason: 'legacy_order_before_cutoff' });
          continue;
        }
        
        // Skip if already signed
        if (followupOrder.signatureSigned) {
          console.log(`⏭️ [REMINDER] Order ${followupOrder.orderId} already signed, skipping`);
          
          // Log skipped with reason
          await db.insert(communicationLogs).values({
            orderId: followupOrder.orderId,
            customerId: followupOrder.customerId,
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'reminder',
            recipient: followupOrder.customerEmail,
            status: 'skipped',
            skipReason: 'already_signed',
            signatureToken: followupOrder.signatureToken || undefined,
            message: `Reminder skipped for ${followupOrder.orderId}: order already signed`,
            sentAt: new Date(),
          });
          
          skippedCount++;
          results.push({ orderId: followupOrder.orderId, outcome: 'skipped', reason: 'already_signed' });
          continue;
        }
        
        // Check max attempts
        const reminderCount = followupOrder.reminderCount || 0;
        if (reminderCount >= MAX_REMINDER_ATTEMPTS) {
          console.log(`⏭️ [REMINDER] Order ${followupOrder.orderId} has reached max attempts (${MAX_REMINDER_ATTEMPTS}), skipping`);
          
          // Log skipped with reason
          await db.insert(communicationLogs).values({
            orderId: followupOrder.orderId,
            customerId: followupOrder.customerId,
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'reminder',
            recipient: followupOrder.customerEmail,
            status: 'skipped',
            skipReason: 'max_attempts',
            signatureToken: followupOrder.signatureToken || undefined,
            message: `Reminder skipped for ${followupOrder.orderId}: max attempts (${MAX_REMINDER_ATTEMPTS}) reached`,
            sentAt: new Date(),
          });
          
          skippedCount++;
          results.push({ orderId: followupOrder.orderId, outcome: 'skipped', reason: 'max_attempts' });
          continue;
        }
        
        // Check cooldown
        const lastReminderAt = followupOrder.reminderSentAt;
        if (lastReminderAt) {
          const hoursSinceLastReminder = (Date.now() - new Date(lastReminderAt).getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastReminder < REMINDER_COOLDOWN_HOURS) {
            console.log(`⏭️ [REMINDER] Order ${followupOrder.orderId} in cooldown (${hoursSinceLastReminder.toFixed(1)}h < ${REMINDER_COOLDOWN_HOURS}h), skipping`);
            
            // Log skipped with reason
            await db.insert(communicationLogs).values({
              orderId: followupOrder.orderId,
              customerId: followupOrder.customerId,
              messageType: 'transactional',
              method: 'email',
              type: 'order-confirmation',
              context: 'reminder',
              recipient: followupOrder.customerEmail,
              status: 'skipped',
              skipReason: 'cooldown',
              signatureToken: followupOrder.signatureToken || undefined,
              message: `Reminder skipped for ${followupOrder.orderId}: cooldown (${hoursSinceLastReminder.toFixed(1)}h since last reminder)`,
              sentAt: new Date(),
            });
            
            skippedCount++;
            results.push({ orderId: followupOrder.orderId, outcome: 'skipped', reason: 'cooldown' });
            continue;
          }
        }
        
        // Validate required data
        if (!followupOrder.signatureToken) {
          console.error(`❌ [REMINDER] Order ${followupOrder.orderId} has no signature token, skipping`);
          
          await db.insert(communicationLogs).values({
            orderId: followupOrder.orderId,
            customerId: followupOrder.customerId,
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'reminder',
            recipient: followupOrder.customerEmail,
            status: 'failed',
            signatureToken: null, // Token unavailable - explicit null per contract
            error: 'No signature token available',
            message: `Reminder failed for ${followupOrder.orderId}: no signature token`,
            sentAt: new Date(),
          });
          
          failedCount++;
          results.push({ orderId: followupOrder.orderId, outcome: 'failed', error: 'No signature token' });
          continue;
        }
        
        if (!followupOrder.pdfPath) {
          console.error(`❌ [REMINDER] Order ${followupOrder.orderId} has no PDF path, skipping`);
          
          await db.insert(communicationLogs).values({
            orderId: followupOrder.orderId,
            customerId: followupOrder.customerId,
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'reminder',
            recipient: followupOrder.customerEmail,
            status: 'failed',
            signatureToken: followupOrder.signatureToken || undefined,
            error: 'No PDF path available',
            message: `Reminder failed for ${followupOrder.orderId}: no PDF path`,
            sentAt: new Date(),
          });
          
          failedCount++;
          results.push({ orderId: followupOrder.orderId, outcome: 'failed', error: 'No PDF path' });
          continue;
        }
        
        console.log(`📨 [REMINDER] Sending reminder for order ${followupOrder.orderId} to ${followupOrder.customerEmail}`);
        
        // SIGNATURE LINK CONTRACT: Environment guard - block cross-environment sends
        const envGuard = checkEnvironmentGuard({
          orderId: followupOrder.orderId,
          signatureToken: followupOrder.signatureToken,
          orderEnvironment: (followupOrder as any).environment,
          recipient: followupOrder.customerEmail,
        });
        
        if (envGuard) {
          console.error(`🚨 [REMINDER] ${envGuard.reason}`);
          
          await db.insert(communicationLogs).values({
            orderId: followupOrder.orderId,
            customerId: followupOrder.customerId,
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'reminder',
            recipient: followupOrder.customerEmail,
            status: 'blocked',
            skipReason: 'cross_environment',
            signatureToken: followupOrder.signatureToken || undefined,
            error: envGuard.reason,
            message: `Reminder blocked for ${followupOrder.orderId}: cross-environment safety`,
            sentAt: new Date(),
          });
          
          failedCount++;
          results.push({ orderId: followupOrder.orderId, outcome: 'failed', error: 'cross_environment_blocked' });
          continue;
        }
        
        // Use EXISTING public signature ID - do NOT regenerate
        // SIGNATURE LINK CONTRACT: Use createSignatureLink with EXPLICIT environment from followup order
        // INVARIANT: Reminders MUST use the environment the followup order was CREATED in
        const { validateSignatureLinkEnvironment } = await import('./magicLink');
        const followupOrderEnv = ((followupOrder as any).environment || 'dev') as 'dev' | 'prod';
        
        // INVARIANT CHECK: Validate environment match before generating link
        validateSignatureLinkEnvironment((followupOrder as any).environment, followupOrderEnv, followupOrder.orderId);
        
        const signatureLink = createSignatureLink(followupOrder.publicSignatureId || '', followupOrderEnv);
        
        // SIGNATURE LINK CONTRACT: Forensic logging
        logSignatureEmailSend({
          orderId: followupOrder.orderId,
          signatureToken: followupOrder.signatureToken,
          publicSignatureId: followupOrder.publicSignatureId || '',
          environment: followupOrderEnv,
          context: 'reminder',
          recipient: followupOrder.customerEmail,
        });
        
        // Get order details from orderSummary
        const orderSummary = followupOrder.orderSummary as Record<string, any> || {};
        
        // Send via unified notification function (with context: 'reminder')
        // forceResend is NOT set - reminder flow respects deduplication
        const emailResult = await sendOrderConfirmationNotification({
          orderId: followupOrder.orderId,
          customerId: followupOrder.customerId,
          customerEmail: followupOrder.customerEmail,
          signatureToken: followupOrder.signatureToken,
          pdfPath: followupOrder.pdfPath,
          context: 'reminder', // Automated reminder email
          orderData: {
            orderId: followupOrder.orderId,
            customerName: orderSummary.customerName || '',
            customerEmail: followupOrder.customerEmail,
            orderDate: orderSummary.orderDate ? new Date(orderSummary.orderDate).toLocaleDateString() : '',
            dueDate: orderSummary.dueDate ? new Date(orderSummary.dueDate).toLocaleDateString() : '',
            customerPO: orderSummary.customerPO || undefined,
            modelId: orderSummary.modelId || undefined,
            handedness: orderSummary.handedness || undefined,
            features: orderSummary.features as Record<string, any> || undefined,
            notes: orderSummary.notes || undefined,
            shipping: orderSummary.shipping || 0,
            signatureLink,
          },
          // forceResend: false - reminder flow respects deduplication
        });
        
        // Handle outcome
        if (emailResult.outcome === 'sent') {
          // Update followup order with reminder tracking
          await storage.updateFollowupOrder(followupOrder.id, {
            reminderSent: true,
            reminderSentAt: new Date(),
            reminderCount: reminderCount + 1,
          });
          
          sentCount++;
          results.push({ orderId: followupOrder.orderId, outcome: 'sent' });
          console.log(`✅ [REMINDER] Reminder sent successfully for order ${followupOrder.orderId} (attempt ${reminderCount + 1}/${MAX_REMINDER_ATTEMPTS})`);
        } else if (emailResult.outcome === 'skipped') {
          // Deduplication prevented sending
          skippedCount++;
          results.push({ orderId: followupOrder.orderId, outcome: 'skipped', reason: emailResult.reason || 'dedup' });
          console.log(`⏭️ [REMINDER] Reminder skipped for order ${followupOrder.orderId} (reason: ${emailResult.reason || 'dedup'})`);
        } else {
          // Email failed
          failedCount++;
          results.push({ orderId: followupOrder.orderId, outcome: 'failed', error: emailResult.error });
          console.error(`❌ [REMINDER] Reminder failed for order ${followupOrder.orderId}: ${emailResult.error}`);
        }
        
      } catch (orderError: any) {
        const errorMessage = orderError instanceof Error ? orderError.message : 'Unknown error';
        console.error(`❌ [REMINDER] Exception processing reminder for order ${followupOrder.orderId}:`, errorMessage);
        
        // Log exception
        try {
          await db.insert(communicationLogs).values({
            orderId: followupOrder.orderId,
            customerId: followupOrder.customerId,
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'reminder',
            recipient: followupOrder.customerEmail,
            status: 'failed',
            signatureToken: followupOrder.signatureToken || undefined,
            error: errorMessage,
            message: `Reminder exception for ${followupOrder.orderId}: ${errorMessage}`,
            sentAt: new Date(),
          });
        } catch (logError) {
          console.error('[REMINDER] Failed to log exception:', logError);
        }
        
        failedCount++;
        results.push({ orderId: followupOrder.orderId, outcome: 'failed', error: errorMessage });
      }
    }
    
    console.log(`📧 [REMINDER] Reminder process complete: ${sentCount} sent, ${skippedCount} skipped, ${failedCount} failed`);
    return { 
      sent: sentCount, 
      skipped: skippedCount, 
      failed: failedCount,
      results 
    };
    
  } catch (error) {
    console.error('[REMINDER] Error in reminder process:', error);
    throw error;
  }
}
