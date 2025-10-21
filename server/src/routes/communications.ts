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

// Send email via SendGrid or Microsoft Graph
router.post('/email', async (req, res) => {
  try {
    const data = emailSchema.parse(req.body);

    // Determine email provider (default to SendGrid, but can use Microsoft if specified or configured)
    const defaultProvider: EmailProvider = (process.env.EMAIL_PROVIDER as EmailProvider) || 'sendgrid';
    const provider: EmailProvider = data.provider || defaultProvider;

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
      // Send via SendGrid (default)
      const apiKey = process.env.SENDGRID_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: 'SendGrid API key not configured' });
      }

      sgMail.setApiKey(apiKey);

      const msg = {
        to: data.to,
        from: senderEmail,
        subject: data.subject,
        text: data.message,
        html: data.html || data.message.replace(/\n/g, '<br>'),
      };

      const emailResult = await sgMail.send(msg);
      externalId = emailResult[0].headers['x-message-id'] as string;
    }

    // Store in database with new columns (only if customerId is provided)
    let communicationLog: any;
    if (data.customerId) {
      [communicationLog] = await db
        .insert(communicationLogs)
        .values({
          customerId: data.customerId,
          orderId: data.orderId || null,
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
    console.error('Email error:', error);

    if (error.response?.body?.errors) {
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

    // Initialize Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return res
        .status(500)
        .json({ error: 'Twilio credentials not configured' });
    }

    const twilioClient = twilio(accountSid, authToken);

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

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return res
        .status(500)
        .json({ error: 'Twilio credentials not configured' });
    }

    const twilioClient = twilio(accountSid, authToken);
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

export default router;
