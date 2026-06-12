import { Router } from 'express';
import { z } from 'zod';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import { db } from '../../db';
import {
  communicationLogs,
  customerCommunications,
  customers,
} from '../../schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { sendEmailViaGraphAPI } from '../../utils/microsoftGraph';
import { getUncachableSendGridClient } from '../../utils/sendgrid';
import { getTwilioConfig, isTwilioConfigured } from '../../config/notifications';

const router = Router();

// Email provider type
type EmailProvider = 'sendgrid' | 'microsoft';

// Email schema
const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1),
  html: z.string().optional(), // For HTML email content
  customerId: z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .optional()
    .nullable(),
  orderId: z.string().optional().nullable(),
  provider: z.enum(['sendgrid', 'microsoft']).optional(), // Optional provider selection
});

// SMS schema
const smsSchema = z.object({
  to: z.string().min(10),
  message: z.string().min(1).max(160),
  customerId: z.union([z.string(), z.number()]).transform((val) => String(val)),
  orderId: z.string().optional().nullable(),
});

// Diagnostic endpoint to confirm email config — not mounted in production
if (process.env.NODE_ENV !== 'production') {
  router.get('/email/test', async (req, res) => {
    try {
      res.json({
        SENDGRID_API_KEY: !!process.env.SENDGRID_API_KEY,
        SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || 'NOT SET',
        EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'sendgrid (default)',
        status: "Email service reachable",
        nextStep: "Try sending a test email via POST /api/communications/email"
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

// Send email via SendGrid or Microsoft Graph
router.post('/email', async (req, res) => {
  try {
    console.log('[ZOD] Email payload about to validate:', JSON.stringify(req.body, null, 2));
    
    const data = emailSchema.parse(req.body);
    
    console.log('[ZOD] Email payload validated successfully');

    // Explicitly resolve provider - only use Microsoft if explicitly configured
    // Default strictly to SendGrid for stability
    const provider: EmailProvider = process.env.EMAIL_PROVIDER === 'microsoft' 
      ? 'microsoft' 
      : 'sendgrid';

    console.log('📧 Email provider resolved to:', provider);

    let externalId: string | undefined;
    let senderEmail = 'stacisales@agcomposites.com';

    console.log(`📧 Sending email via ${provider.toUpperCase()} to ${data.to}`);

    // Send email based on provider
    if (provider === 'microsoft') {
      // Send via Microsoft Graph API
      const result = await sendEmailViaGraphAPI({
        to: data.to,
        subject: data.subject,
        text: data.message,
        html: data.html || data.message.replace(/\n/g, '<br>'),
      });

      if (!result.success) {
        return res.status(500).json({
          error: 'Microsoft Graph email failed',
          details: result.error,
        });
      }

      externalId = result.messageId;
      senderEmail = process.env.MICROSOFT_SENDER_EMAIL || senderEmail;
    } else {
      // Send via SendGrid (default) using Replit integration
      try {
        console.log('[SENDGRID] Getting SendGrid client...');
        const { client, fromEmail } = await getUncachableSendGridClient();
        senderEmail = fromEmail.email; // Use verified sender email from integration
        console.log('[SENDGRID] Client obtained, sender:', senderEmail);

        const msg = {
          to: data.to,
          from: fromEmail, // Use full from object with email and name
          subject: data.subject,
          text: data.message,
          html: data.html || data.message.replace(/\n/g, '<br>'),
        };
        
        console.log('[SENDGRID] Sending message:', { to: msg.to, from: msg.from, subject: msg.subject });

        const emailResult = await client.send(msg);
        externalId = emailResult[0].headers['x-message-id'] as string;
        console.log('[SENDGRID] Send successful, messageId:', externalId);
      } catch (error: any) {
        console.error('[SENDGRID ERROR] Integration error:', error);
        console.error('[SENDGRID ERROR] Response body:', error?.response?.body || 'N/A');
        console.error('[SENDGRID ERROR] Status:', error?.code || error?.response?.statusCode || 'N/A');
        return res.status(500).json({ 
          error: 'SendGrid not configured',
          details: error.message,
          responseBody: error?.response?.body,
          hint: 'Make sure SendGrid integration is set up with a verified sender email'
        });
      }
    }

    // Store in database with new columns (only if customerId is provided)
    let communicationLog: any;
    if (data.customerId) {
      [communicationLog] = await db
        .insert(communicationLogs)
        .values({
          customerId: data.customerId,
          orderId: data.orderId || null,
          messageType: 'transactional',
          type: 'shipping-notification',
          method: 'email',
          direction: 'outbound',
          sender: senderEmail,
          recipient: data.to,
          subject: data.subject,
          message: data.message,
          status: 'sent',
          isRead: false,
          externalId,
          sentAt: new Date(),
        })
        .returning();
    }

    console.log(
      `✅ Email sent via ${provider.toUpperCase()} to ${data.to}${data.customerId ? ` for customer ${data.customerId}` : ''}${data.orderId ? ` (Order: ${data.orderId})` : ''}`
    );

    res.json({
      success: true,
      message: `Email sent successfully via ${provider}`,
      messageId: communicationLog?.id,
      externalId,
      provider,
    });
  } catch (error: any) {
    console.error('[EMAIL ERROR] Full error:', error);
    
    // Check for Zod validation errors
    if (error.name === 'ZodError') {
      console.error('[ZOD ERROR] Validation failed:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({
        error: 'Email validation error',
        details: error.errors,
      });
    }

    if (error.response?.body?.errors) {
      console.error('[EMAIL ERROR] Service error body:', error.response.body.errors);
      return res.status(400).json({
        error: 'Email service error',
        details: error.response.body.errors,
      });
    }

    res.status(500).json({
      error: 'Failed to send email',
      details: error.message,
    });
  }
});

// Send SMS via Twilio
router.post('/sms', async (req, res) => {
  try {
    const data = smsSchema.parse(req.body);

    // Initialize Twilio using centralized config
    const twilioConfig = getTwilioConfig();

    if (!isTwilioConfigured()) {
      console.error('Missing Twilio config:', { accountSid: !!twilioConfig.accountSid, authToken: !!twilioConfig.authToken, fromNumber: !!twilioConfig.fromNumber });
      return res
        .status(500)
        .json({ error: 'Twilio credentials not configured' });
    }

    const twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);
    const fromNumber = twilioConfig.fromNumber;

    const message = await twilioClient.messages.create({
      body: data.message,
      from: fromNumber,
      to: data.to,
    });

    // Store in database with new columns
    const [communicationLog] = await db
      .insert(communicationLogs)
      .values({
        customerId: data.customerId,
        orderId: data.orderId || null,
        messageType: 'transactional',
        type: 'sms-notification',
        method: 'sms',
        direction: 'outbound',
        sender: fromNumber,
        recipient: data.to,
        subject: null,
        message: data.message,
        status: message.status,
        isRead: false,
        externalId: message.sid,
        sentAt: new Date(),
      })
      .returning();

    console.log(
      `SMS sent to ${data.to} for customer ${data.customerId}${data.orderId ? ` (Order: ${data.orderId})` : ''}`
    );

    res.json({
      success: true,
      message: 'SMS sent successfully',
      messageId: communicationLog.id,
      externalId: message.sid,
      status: message.status,
      twilioResponse: {
        sid: message.sid,
        status: message.status,
        direction: message.direction,
      },
    });
  } catch (error: any) {
    console.error('Twilio SMS error:', error);

    res.status(500).json({
      error: 'Failed to send SMS',
      details: error.message,
    });
  }
});

// Check SMS message status
router.get('/sms-status/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    const twilioConfig = getTwilioConfig();

    if (!twilioConfig.accountSid || !twilioConfig.authToken) {
      return res
        .status(500)
        .json({ error: 'Twilio credentials not configured' });
    }

    const twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);
    const message = await twilioClient.messages(messageId).fetch();

    res.json({
      messageId: message.sid,
      status: message.status,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      to: message.to,
      from: message.from,
      dateCreated: message.dateCreated,
      dateUpdated: message.dateUpdated,
      dateSent: message.dateSent,
    });
  } catch (error: any) {
    console.error('SMS status check error:', error);
    res
      .status(500)
      .json({ error: 'Failed to check SMS status', details: error.message });
  }
});

// Twilio webhook for incoming SMS
router.post('/sms/webhook', async (req, res) => {
  try {
    const { From, To, Body, MessageSid } = req.body;

    console.log('Incoming SMS:', {
      from: From,
      to: To,
      body: Body,
      messageId: MessageSid,
      timestamp: new Date(),
    });

    // Look up customer by phone number
    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, From))
      .limit(1);

    if (customer.length > 0) {
      // Store inbound message in database using existing schema
      const [communicationLog] = await db
        .insert(communicationLogs)
        .values({
          customerId: customer[0].id.toString(),
          orderId: null,
          type: 'customer-inquiry',
          method: 'sms',
          recipient: To,
          message: Body,
          status: 'received',
          direction: 'inbound',
          externalId: MessageSid,
          receivedAt: new Date(),
        })
        .returning();

      // Webhook processed successfully

      console.log(
        `Stored inbound SMS from customer ${customer[0].name} (ID: ${customer[0].id})`
      );
    } else {
      console.log(`No customer found for phone number: ${From}`);
    }

    // Respond with empty TwiML to acknowledge receipt
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error: any) {
    console.error('SMS webhook error:', error);
    res.status(500).send('Error processing SMS webhook');
  }
});

// SendGrid webhook for incoming emails (requires SendGrid Inbound Parse)
router.post('/email/webhook', async (req, res) => {
  try {
    const { from, to, subject, text, html } = req.body;

    console.log('Incoming Email:', {
      from,
      to,
      subject,
      text: text?.substring(0, 100) + '...',
      timestamp: new Date(),
    });

    // Look up customer by email address
    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.email, from))
      .limit(1);

    if (customer.length > 0) {
      // Store inbound message in database using existing schema
      const [communicationLog] = await db
        .insert(communicationLogs)
        .values({
          customerId: customer[0].id.toString(),
          orderId: '',
          type: 'customer-inquiry',
          method: 'email',
          direction: 'inbound',
          sender: from,
          recipient: to,
          subject: subject,
          message: text || html,
          status: 'received',
          receivedAt: new Date(),
        })
        .returning();

      // Webhook processed successfully

      console.log(
        `Stored inbound email from customer ${customer[0].name} (ID: ${customer[0].id})`
      );
    } else {
      console.log(`No customer found for email address: ${from}`);
    }

    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Email webhook error:', error);
    res.status(500).send('Error processing email webhook');
  }
});

// Get communication history (including inbound/outbound)
router.get('/history/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;

    // This would typically fetch from a communications log table
    // For now, return empty array
    res.json([]);
  } catch (error: any) {
    console.error('Communication history error:', error);
    res.status(500).json({ error: 'Failed to fetch communication history' });
  }
});

// Get all recent inbound messages for admin dashboard
router.get('/inbox', async (req, res) => {
  try {
    const inboxMessages = await db
      .select({
        id: communicationLogs.id,
        customerId: communicationLogs.customerId,
        type: communicationLogs.type,
        method: communicationLogs.method,
        direction: communicationLogs.direction,
        sender: communicationLogs.sender,
        recipient: communicationLogs.recipient,
        subject: communicationLogs.subject,
        message: communicationLogs.message,
        status: communicationLogs.status,
        isRead: communicationLogs.isRead,
        sentAt: communicationLogs.sentAt,
        receivedAt: communicationLogs.receivedAt,
        createdAt: communicationLogs.createdAt,
        customerName: customers.name,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(communicationLogs)
      .leftJoin(
        customers,
        eq(communicationLogs.customerId, sql`${customers.id}::text`)
      )
      .orderBy(desc(communicationLogs.createdAt))
      .limit(100);

    // Transform the results to flatten the structure
    const transformedMessages = inboxMessages.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerName: row.customerName || 'Unknown Customer',
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      type: row.type,
      method: row.method,
      direction: row.direction,
      sender: row.sender,
      recipient: row.recipient,
      subject: row.subject,
      message: row.message,
      status: row.status,
      isRead: row.isRead,
      sentAt: row.sentAt,
      receivedAt: row.receivedAt,
      createdAt: row.createdAt,
    }));

    res.json(transformedMessages);
  } catch (error: any) {
    console.error('Inbox error:', error);
    res.status(500).json({ error: 'Failed to fetch inbox messages' });
  }
});

// Mark message as read
router.patch('/inbox/:messageId/read', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Mark as read functionality not available with current schema
    // Would need isRead column in database

    res.json({ success: true });
  } catch (error: any) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Get communication history for a specific customer
router.get('/customer/:customerId/history', async (req, res) => {
  try {
    const { customerId } = req.params;

    const history = await db
      .select()
      .from(communicationLogs)
      .where(eq(communicationLogs.customerId, customerId))
      .orderBy(desc(communicationLogs.createdAt));

    res.json(history);
  } catch (error: any) {
    console.error('Communication history error:', error);
    res.status(500).json({ error: 'Failed to fetch communication history' });
  }
});

// Test SendGrid configuration — not mounted in production
if (process.env.NODE_ENV !== 'production') {
router.post('/test-sendgrid', async (req, res) => {
  try {
    const { testEmail } = req.body;
    
    if (!testEmail) {
      return res.status(400).json({ 
        error: 'testEmail is required in request body' 
      });
    }

    console.log('🧪 Testing SendGrid configuration...');
    
    // Validate SendGrid credentials - LOCKED to SENDGRID_FROM_EMAIL only (no fallbacks)
    const hasApiKey = !!process.env.SENDGRID_API_KEY;
    const hasFromEmail = !!process.env.SENDGRID_FROM_EMAIL;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    
    console.log('🧪 SendGrid config check:', {
      hasApiKey,
      hasFromEmail,
      fromEmail: fromEmail ? `${fromEmail.substring(0, 3)}...` : 'NOT SET',
    });
    
    if (!hasApiKey) {
      return res.status(500).json({
        error: 'SENDGRID_API_KEY is required',
        hint: 'Set SENDGRID_API_KEY environment variable',
      });
    }
    
    if (!hasFromEmail) {
      return res.status(500).json({
        error: 'SENDGRID_FROM_EMAIL is required and must be a verified SendGrid sender',
        hint: 'Set SENDGRID_FROM_EMAIL environment variable to a verified sender email',
      });
    }

    // Attempt to send a test email via SendGrid
    const { client, fromEmail: resolvedFrom } = await getUncachableSendGridClient();
    
    console.log('🧪 Sending test email with sender:', resolvedFrom.email);
    
    const testMsg = {
      to: testEmail,
      from: resolvedFrom,
      subject: 'EPOCH v8 - SendGrid Configuration Test',
      text: `This is a test email from EPOCH v8 to verify SendGrid configuration.\n\nSender: ${resolvedFrom.email}\nTimestamp: ${new Date().toISOString()}\n\nIf you received this email, SendGrid is properly configured.`,
      html: `
        <h2>EPOCH v8 - SendGrid Test</h2>
        <p>This is a test email to verify SendGrid configuration.</p>
        <ul>
          <li><strong>Sender:</strong> ${resolvedFrom.email}</li>
          <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
        </ul>
        <p>If you received this email, SendGrid is properly configured.</p>
      `,
    };

    const [response] = await client.send(testMsg);
    
    console.log('✅ SendGrid test email sent successfully:', {
      statusCode: response.statusCode,
      messageId: response.headers['x-message-id'],
    });

    res.json({
      success: true,
      message: 'Test email sent successfully',
      details: {
        senderEmail: resolvedFrom.email,
        recipientEmail: testEmail,
        messageId: response.headers['x-message-id'],
        statusCode: response.statusCode,
        provider: 'sendgrid',
      },
    });
  } catch (error: any) {
    console.error('❌ SendGrid test failed:', error);
    
    // Provide helpful error details
    let errorDetails = error.message;
    if (error.response?.body?.errors) {
      errorDetails = error.response.body.errors;
    }
    
    res.status(500).json({
      error: 'SendGrid test failed',
      details: errorDetails,
      hint: 'Check that SENDGRID_FROM_EMAIL is a verified sender in your SendGrid account',
    });
  }
});
}

// DIAGNOSTIC: Hard-coded debug email test — not mounted in production
if (process.env.NODE_ENV !== 'production') {
router.get('/debug/email-test', async (req, res) => {
  console.log('='.repeat(60));
  console.log('[DEBUG EMAIL TEST] Starting diagnostic email test');
  console.log('[DEBUG EMAIL TEST] Timestamp:', new Date().toISOString());
  console.log('='.repeat(60));
  
  try {
    // Log configuration
    console.log('[DEBUG EMAIL TEST] Environment Check:');
    console.log('  SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'present' : 'MISSING');
    console.log('  SENDGRID_FROM_EMAIL:', process.env.SENDGRID_FROM_EMAIL || 'NOT SET');
    console.log('  EMAIL_PROVIDER:', process.env.EMAIL_PROVIDER || 'not set (defaults to sendgrid)');
    
    // Get SendGrid client (same path as notifications)
    const { client, fromEmail } = await getUncachableSendGridClient();
    
    console.log('[DEBUG EMAIL TEST] Resolved sender:', fromEmail.email);
    console.log('[DEBUG EMAIL TEST] Sending test email to glenn@agcomposites.com');
    
    const testMsg = {
      to: 'glenn@agcomposites.com',
      from: fromEmail,
      subject: 'EPOCH Email Test - Tracking Notification Pipeline',
      text: `Tracking notification pipeline test\n\nTimestamp: ${new Date().toISOString()}\nSender: ${fromEmail.email}\n\nThis email uses the same SendGrid path as tracking notifications.`,
      html: `
        <h2>EPOCH Email Test - Tracking Notification Pipeline</h2>
        <p>This email uses the same SendGrid path as tracking notifications.</p>
        <ul>
          <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
          <li><strong>Sender:</strong> ${fromEmail.email}</li>
          <li><strong>Provider:</strong> SendGrid</li>
        </ul>
      `,
    };
    
    console.log('[DEBUG EMAIL TEST] Message payload:', {
      to: testMsg.to,
      from: testMsg.from,
      subject: testMsg.subject,
    });
    
    const [response] = await client.send(testMsg);
    
    console.log('[DEBUG EMAIL TEST] ✅ SUCCESS');
    console.log('[DEBUG EMAIL TEST] Status Code:', response.statusCode);
    console.log('[DEBUG EMAIL TEST] Message ID:', response.headers['x-message-id']);
    console.log('='.repeat(60));
    
    res.json({
      success: true,
      message: 'Diagnostic email sent successfully',
      details: {
        to: 'glenn@agcomposites.com',
        from: fromEmail.email,
        statusCode: response.statusCode,
        messageId: response.headers['x-message-id'],
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[DEBUG EMAIL TEST] ❌ FAILED');
    console.error('[DEBUG EMAIL TEST] Error:', error?.message || error);
    console.error('[DEBUG EMAIL TEST] Response Body:', error?.response?.body || 'N/A');
    console.error('[DEBUG EMAIL TEST] Status Code:', error?.code || error?.response?.statusCode || 'N/A');
    console.error('='.repeat(60));
    
    // Return full error details
    const errorBody = error?.response?.body || { message: error?.message || 'Unknown error' };
    
    res.status(500).json({
      success: false,
      error: 'Diagnostic email failed',
      details: {
        message: error?.message,
        responseBody: errorBody,
        statusCode: error?.code || error?.response?.statusCode,
        timestamp: new Date().toISOString(),
      },
    });
  }
});
}

// Get all communication logs (admin view)
router.get('/logs', async (req, res) => {
  try {
    const logs = await db
      .select()
      .from(communicationLogs)
      .orderBy(desc(communicationLogs.sentAt))
      .limit(500);

    res.json(logs);
  } catch (error: any) {
    console.error('Error fetching communication logs:', error);
    res.status(500).json({
      error: 'Failed to fetch communication logs',
      details: error.message,
    });
  }
});

// Get notification history for a specific order
router.get('/order/:orderId/history', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Get all communication logs for this order, ordered by most recent first
    const notifications = await db
      .select()
      .from(communicationLogs)
      .where(eq(communicationLogs.orderId, orderId))
      .orderBy(desc(communicationLogs.sentAt));

    res.json({
      orderId,
      count: notifications.length,
      notifications: notifications.map((n) => ({
        id: n.id,
        method: n.method,
        type: n.type,
        recipient: n.recipient,
        subject: n.subject,
        message: n.message?.substring(0, 200) + (n.message && n.message.length > 200 ? '...' : ''),
        status: n.status,
        error: n.error,
        sentAt: n.sentAt,
        externalId: n.externalId,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({
      error: 'Failed to fetch notification history',
      details: error.message,
    });
  }
});

export default router;
