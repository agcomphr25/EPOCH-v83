
import { Router } from 'express';
import { z } from 'zod';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

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
    
    await sgMail.send(msg);
    
    // Log the communication
    console.log(`Email sent to ${data.to} for customer ${data.customerId}${data.orderId ? ` (Order: ${data.orderId})` : ''}`);
    
    res.json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: Date.now().toString()
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
    
    // Log detailed SMS information for debugging
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
      messageId: message.sid,
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

    // TODO: Store in database and associate with customer
    // You would look up the customer by phone number
    // and save this as an inbound communication
    
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

    // TODO: Store in database and associate with customer
    // You would look up the customer by email address
    // and save this as an inbound communication
    
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
    // TODO: Implement database query for recent inbound messages
    // This would show all unread/recent customer responses
    const mockInboxMessages = [];
    
    res.json(mockInboxMessages);
    
  } catch (error: any) {
    console.error('Inbox error:', error);
    res.status(500).json({ error: 'Failed to fetch inbox messages' });
  }
});

export default router;
