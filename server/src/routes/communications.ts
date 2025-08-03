import { Router, Request, Response } from 'express';

const router = Router();

// Send customer notification (email or SMS)
router.post('/send-notification', async (req: Request, res: Response) => {
  try {
    const { orderId, trackingNumber, customerName, customerEmail, customerPhone, method, message } = req.body;
    
    console.log(`📧 Sending ${method} notification for order ${orderId}`);
    console.log(`Tracking: ${trackingNumber}`);
    console.log(`Customer: ${customerName}`);
    console.log(`Message: ${message}`);
    
    // Simulate sending notification based on method
    if (method === 'email' && customerEmail) {
      // In a real implementation, this would integrate with an email service like SendGrid, AWS SES, etc.
      console.log(`✉️ EMAIL sent to: ${customerEmail}`);
      
      // Simulate email sending delay
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Log the communication
      const { storage } = await import('../../storage');
      // Note: This would require a communications table in the database schema
      
      res.json({
        success: true,
        method: 'email',
        recipient: customerEmail,
        timestamp: new Date().toISOString(),
        message: 'Email notification sent successfully'
      });
      
    } else if (method === 'sms' && customerPhone) {
      // In a real implementation, this would integrate with Twilio, AWS SNS, etc.
      console.log(`📱 SMS sent to: ${customerPhone}`);
      
      // Simulate SMS sending delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      res.json({
        success: true,
        method: 'sms',
        recipient: customerPhone,
        timestamp: new Date().toISOString(),
        message: 'SMS notification sent successfully'
      });
      
    } else {
      res.status(400).json({
        success: false,
        error: `Missing ${method === 'email' ? 'email address' : 'phone number'} for ${method} notification`
      });
    }
    
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification'
    });
  }
});

// Get customer communication preferences
router.get('/preferences/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    
    // Get customer data from storage
    const { storage } = await import('../../storage');
    const customers = await storage.getAllCustomers();
    const customer = customers.find(c => c.id.toString() === customerId || c.name === customerId);
    
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Return communication preferences (in a real app, this would be stored in customer profile)
    res.json({
      customerId: customer.id,
      customerName: customer.name,
      email: customer.email || null,
      phone: customer.phone || null,
      preferredMethod: customer.email ? 'email' : customer.phone ? 'sms' : 'email',
      allowEmail: !!customer.email,
      allowSms: !!customer.phone
    });
    
  } catch (error) {
    console.error('Error getting customer preferences:', error);
    res.status(500).json({ error: 'Failed to get customer preferences' });
  }
});

export default router;