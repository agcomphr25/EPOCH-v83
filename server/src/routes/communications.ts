
import { Router } from 'express';
import { z } from 'zod';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import { db } from '../../db';
import { communicationLogs, customerCommunications, customers } from '../../schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const router = Router();

// Email schema
const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(1),
  customerId: z.union([z.string(), z.number()]).transform(val => String(val)),
  orderId: z.string().optional().nullable()
});

// SMS schema
const smsSchema = z.object({
  to: z.string().min(10),
  message: z.string().min(1).max(160),
  customerId: z.union([z.string(), z.number()]).transform(val => String(val)),
  orderId: z.string().optional().nullable()
});

// Send email via SendGrid
router.post('/email', async (req, res) => {
  try {
    const data = emailSchema.parse(req.body);
    
    // Initialize SendGrid
    const apiKey = process.env.SENDGRID_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'SendGrid API key not configured' });
    }
    
    sgMail.setApiKey(apiKey);
    
    const msg = {
      to: data.to,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@yourcompany.com',
      subject: data.subject,
      text: data.message,
      html: data.message.replace(/\n/g, '<br>')
    };
    
    const emailResult = await sgMail.send(msg);
    
    // Store in database
    const [communicationLog] = await db.insert(communicationLogs).values({
      orderId: data.orderId,
      customerId: data.customerId,
      type: 'general',
      method: 'email',
      direction: 'outbound',
      recipient: data.to,
      subject: data.subject,
      message: data.message,
      status: 'sent',
      externalId: emailResult[0].headers['x-message-id'],
      sentAt: new Date()
    }).returning();

    // Create customer communication record
    await db.insert(customerCommunications).values({
      customerId: data.customerId,
      communicationLogId: communicationLog.id,
      priority: 'normal'
    });
    
    console.log(`Email sent to ${data.to} for customer ${data.customerId}${data.orderId ? ` (Order: ${data.orderId})` : ''}`);
    
    res.json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: communicationLog.id,
      externalId: emailResult[0].headers['x-message-id']
    });
    
  } catch (error: any) {
    console.error('SendGrid email error:', error);
    
    if (error.response?.body?.errors) {
      return res.status(400).json({ 
        error: 'SendGrid error', 
        details: error.response.body.errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: error.message 
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
      return res.status(500).json({ error: 'Twilio credentials not configured' });
    }
    
    const twilioClient = twilio(accountSid, authToken);
    
    const message = await twilioClient.messages.create({
      body: data.message,
      from: fromNumber,
      to: data.to
    });

    // Store in database
    const [communicationLog] = await db.insert(communicationLogs).values({
      orderId: data.orderId,
      customerId: data.customerId,
      type: 'general',
      method: 'sms',
      direction: 'outbound',
      recipient: data.to,
      message: data.message,
      status: message.status === 'queued' || message.status === 'sent' ? 'sent' : 'failed',
      externalId: message.sid,
      sentAt: new Date()
    }).returning();

    // Create customer communication record
    await db.insert(customerCommunications).values({
      customerId: data.customerId,
      communicationLogId: communicationLog.id,
      priority: 'normal'
    });
    
    console.log(`SMS Details:`, {
      messageId: message.sid,
      to: data.to,
      from: fromNumber,
      status: message.status,
      direction: message.direction,
      customerId: data.customerId,
      orderId: data.orderId
    });
    
    res.json({ 
      success: true, 
      message: 'SMS sent successfully',
      messageId: communicationLog.id,
      externalId: message.sid,
      status: message.status,
      twilioResponse: {
        sid: message.sid,
        status: message.status,
        direction: message.direction
      }
    });
    
  } catch (error: any) {
    console.error('Twilio SMS error:', error);
    
    res.status(500).json({ 
      error: 'Failed to send SMS', 
      details: error.message 
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
      return res.status(500).json({ error: 'Twilio credentials not configured' });
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
      dateSent: message.dateSent
    });
    
  } catch (error: any) {
    console.error('SMS status check error:', error);
    res.status(500).json({ error: 'Failed to check SMS status', details: error.message });
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
      timestamp: new Date()
    });

    // Look up customer by phone number
    const customer = await db.select().from(customers).where(eq(customers.phone, From)).limit(1);
    
    if (customer.length > 0) {
      // Store inbound message in database
      const [communicationLog] = await db.insert(communicationLogs).values({
        customerId: customer[0].id.toString(),
        type: 'customer-inquiry',
        method: 'sms',
        direction: 'inbound',
        recipient: To,
        sender: From,
        message: Body,
        status: 'received',
        externalId: MessageSid,
        receivedAt: new Date(),
        isRead: false
      }).returning();

      // Create customer communication record
      await db.insert(customerCommunications).values({
        customerId: customer[0].id.toString(),
        communicationLogId: communicationLog.id,
        priority: 'normal'
      });

      console.log(`Stored inbound SMS from customer ${customer[0].name} (ID: ${customer[0].id})`);
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
      timestamp: new Date()
    });

    // Look up customer by email address
    const customer = await db.select().from(customers).where(eq(customers.email, from)).limit(1);
    
    if (customer.length > 0) {
      // Store inbound message in database
      const [communicationLog] = await db.insert(communicationLogs).values({
        customerId: customer[0].id.toString(),
        type: 'customer-inquiry',
        method: 'email',
        direction: 'inbound',
        recipient: to,
        sender: from,
        subject: subject,
        message: text || html,
        status: 'received',
        receivedAt: new Date(),
        isRead: false
      }).returning();

      // Create customer communication record
      await db.insert(customerCommunications).values({
        customerId: customer[0].id.toString(),
        communicationLogId: communicationLog.id,
        priority: 'normal'
      });

      console.log(`Stored inbound email from customer ${customer[0].name} (ID: ${customer[0].id})`);
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
        customerName: customers.name,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        type: communicationLogs.type,
        method: communicationLogs.method,
        direction: communicationLogs.direction,
        sender: communicationLogs.sender,
        recipient: communicationLogs.recipient,
        subject: communicationLogs.subject,
        message: communicationLogs.message,
        status: communicationLogs.status,
        isRead: communicationLogs.isRead,
        receivedAt: communicationLogs.receivedAt,
        sentAt: communicationLogs.sentAt,
        createdAt: communicationLogs.createdAt,
        priority: customerCommunications.priority,
        assignedTo: customerCommunications.assignedTo,
        resolvedAt: customerCommunications.resolvedAt
      })
      .from(communicationLogs)
      .leftJoin(customers, eq(communicationLogs.customerId, sql`${customers.id}::text`))
      .leftJoin(customerCommunications, eq(communicationLogs.id, customerCommunications.communicationLogId))
      .orderBy(desc(communicationLogs.createdAt))
      .limit(100);
    
    res.json(inboxMessages);
    
  } catch (error: any) {
    console.error('Inbox error:', error);
    res.status(500).json({ error: 'Failed to fetch inbox messages' });
  }
});

// Mark message as read
router.patch('/inbox/:messageId/read', async (req, res) => {
  try {
    const { messageId } = req.params;
    
    await db
      .update(communicationLogs)
      .set({ isRead: true })
      .where(eq(communicationLogs.id, parseInt(messageId)));
    
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
