
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
    
    // Log the communication
    console.log(`SMS sent to ${data.to} for customer ${data.customerId}${data.orderId ? ` (Order: ${data.orderId})` : ''}`);
    
    res.json({ 
      success: true, 
      message: 'SMS sent successfully',
      messageId: message.sid
    });
    
  } catch (error: any) {
    console.error('Twilio SMS error:', error);
    
    res.status(500).json({ 
      error: 'Failed to send SMS', 
      details: error.message 
    });
  }
});

// Get communication history (optional feature)
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

export default router;
