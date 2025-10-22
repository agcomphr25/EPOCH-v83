import express from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertFollowupOrderSchema } from '../../schema';
import { generateSalesOrderPDF, embedSignatureInPDF } from '../../utils/pdf/salesOrderPdf';
import { sendFollowupOrderEmail } from '../../utils/followupOrderEmail';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = 'uploads/followup-orders';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// POST /api/followup-orders - Create and send a follow-up order
router.post('/', async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Get order details from all_orders table
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get customer details
    const customer = await storage.getCustomerById(order.customerId || '');
    if (!customer || !customer.email) {
      return res.status(400).json({ 
        error: 'Customer email not found. Cannot send follow-up order.' 
      });
    }

    // Check if follow-up order already exists
    const existing = await storage.getFollowupOrderByOrderId(orderId);
    if (existing) {
      return res.status(400).json({ 
        error: 'Follow-up order already exists for this order',
        followupOrder: existing
      });
    }

    // Get customer address
    const addresses = await storage.getCustomerAddresses(order.customerId || '');
    const defaultAddress = addresses.find(addr => addr.isDefault) || addresses[0];

    // Generate unique signature token
    const signatureToken = nanoid(32);

    // Generate signature link
    const baseUrl = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'http://localhost:5000';
    const signatureLink = `${baseUrl}/sign-order/${signatureToken}`;

    // Prepare order data for PDF
    const orderData = {
      orderId: order.orderId,
      orderDate: new Date(order.orderDate),
      dueDate: new Date(order.dueDate),
      customerId: order.customerId || '',
      customerPO: order.customerPO || undefined,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone || undefined,
      customerAddress: defaultAddress ? {
        street: defaultAddress.street,
        street2: defaultAddress.street2 || undefined,
        city: defaultAddress.city,
        state: defaultAddress.state,
        zipCode: defaultAddress.zipCode,
        country: defaultAddress.country,
      } : undefined,
      modelId: order.modelId || undefined,
      handedness: order.handedness || undefined,
      features: order.features as Record<string, any> || undefined,
      notes: order.notes || undefined,
      shipping: order.shipping || 0,
      subtotal: undefined, // Calculate if needed
      total: undefined, // Calculate if needed
    };

    // Generate PDF
    const pdfBuffer = await generateSalesOrderPDF(orderData, true);
    const pdfFilename = `sales_order_${orderId}_${Date.now()}.pdf`;
    const pdfPath = path.join(uploadsDir, pdfFilename);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Create order summary for email
    const orderSummary = {
      orderId: order.orderId,
      orderDate: order.orderDate,
      dueDate: order.dueDate,
      customerPO: order.customerPO,
      modelId: order.modelId,
      handedness: order.handedness,
      features: order.features,
      notes: order.notes,
      shipping: order.shipping,
    };

    // Create followup order record
    const followupOrder = await storage.createFollowupOrder({
      orderId: order.orderId,
      customerId: order.customerId || '',
      customerEmail: customer.email,
      signatureToken,
      pdfGenerated: true,
      pdfPath,
      pdfGeneratedAt: new Date(),
      orderSummary,
    });

    // Send email
    const emailData = {
      orderId: order.orderId,
      customerName: customer.name,
      customerEmail: customer.email,
      orderDate: new Date(order.orderDate).toLocaleDateString(),
      dueDate: new Date(order.dueDate).toLocaleDateString(),
      customerPO: order.customerPO || undefined,
      modelId: order.modelId || undefined,
      handedness: order.handedness || undefined,
      features: order.features as Record<string, any> || undefined,
      notes: order.notes || undefined,
      shipping: order.shipping || 0,
      signatureLink,
    };

    const emailResult = await sendFollowupOrderEmail(emailData, pdfPath);

    if (emailResult.success) {
      await storage.updateFollowupOrder(followupOrder.id, {
        emailSent: true,
        emailSentAt: new Date(),
      });

      res.json({
        success: true,
        followupOrder,
        emailSent: true,
        messageId: emailResult.messageId,
      });
    } else {
      await storage.updateFollowupOrder(followupOrder.id, {
        emailError: emailResult.error,
      });

      res.status(500).json({
        success: false,
        followupOrder,
        emailSent: false,
        error: emailResult.error,
      });
    }
  } catch (error) {
    console.error('Error creating followup order:', error);
    res.status(500).json({ 
      error: 'Failed to create followup order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/followup-orders/by-token/:token - Get follow-up order by signature token (MUST be before /:id route)
router.get('/by-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const followupOrder = await storage.getFollowupOrderByToken(token);
    if (!followupOrder) {
      return res.status(404).json({ error: 'Followup order not found' });
    }

    // Return order data but do NOT expose the signature token in response
    const { signatureToken, ...safeOrderData } = followupOrder;
    res.json(safeOrderData);
  } catch (error) {
    console.error('Error fetching followup order by token:', error);
    res.status(500).json({ error: 'Failed to fetch followup order' });
  }
});

// GET /api/followup-orders - Get all follow-up orders (internal use only)
router.get('/', async (req, res) => {
  try {
    const { pending } = req.query;

    let followupOrders;
    if (pending === 'true') {
      followupOrders = await storage.getPendingFollowupOrders();
    } else {
      followupOrders = await storage.getAllFollowupOrders();
    }

    // Strip signature tokens from response for security
    const safeOrders = followupOrders.map(({ signatureToken, ...order }) => order);
    res.json(safeOrders);
  } catch (error) {
    console.error('Error fetching followup orders:', error);
    res.status(500).json({ error: 'Failed to fetch followup orders' });
  }
});

// GET /api/followup-orders/:id - Get single follow-up order (internal use only)
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid followup order ID' });
    }

    const followupOrder = await storage.getFollowupOrder(id);
    if (!followupOrder) {
      return res.status(404).json({ error: 'Followup order not found' });
    }

    // Strip signature token from response for security
    const { signatureToken, ...safeOrderData } = followupOrder;
    res.json(safeOrderData);
  } catch (error) {
    console.error('Error fetching followup order:', error);
    res.status(500).json({ error: 'Failed to fetch followup order' });
  }
});

// POST /api/followup-orders/:id/sign - Submit signature for follow-up order
router.post('/:id/sign', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid followup order ID' });
    }

    const { signatureData, signatureToken } = req.body;
    if (!signatureData) {
      return res.status(400).json({ error: 'Signature data is required' });
    }

    if (!signatureToken) {
      return res.status(400).json({ error: 'Signature token is required' });
    }

    const followupOrder = await storage.getFollowupOrder(id);
    if (!followupOrder) {
      return res.status(404).json({ error: 'Followup order not found' });
    }

    // Verify the signature token matches
    if (followupOrder.signatureToken !== signatureToken) {
      return res.status(403).json({ error: 'Invalid signature token' });
    }

    if (followupOrder.signatureSigned) {
      return res.status(400).json({ error: 'Order already signed' });
    }

    // Embed signature in PDF
    if (!followupOrder.pdfPath) {
      return res.status(400).json({ error: 'Original PDF not found' });
    }

    const signedPdfBuffer = await embedSignatureInPDF(
      followupOrder.pdfPath,
      signatureData
    );

    const signedPdfFilename = `signed_sales_order_${followupOrder.orderId}_${Date.now()}.pdf`;
    const signedPdfPath = path.join(uploadsDir, signedPdfFilename);
    fs.writeFileSync(signedPdfPath, signedPdfBuffer);

    // Update followup order
    const updated = await storage.updateFollowupOrder(id, {
      signatureData,
      signatureSigned: true,
      signedAt: new Date(),
      signedPdfPath,
      movedToProduction: true,
      movedToProductionAt: new Date(),
    });

    // Finalize the draft order and move it to production queue
    console.log(`✅ Customer signed order ${followupOrder.orderId} - finalizing and moving to production...`);
    
    try {
      // Finalize the order (moves from draft to all_orders table)
      await storage.finalizeOrder(followupOrder.orderId, 'customer_signature');
      
      console.log(`🎯 Order ${followupOrder.orderId} finalized and in production queue`);
    } catch (finalizeError) {
      console.error('Error finalizing order:', finalizeError);
      throw new Error('Failed to finalize order after signature');
    }

    res.json({
      success: true,
      followupOrder: updated,
      message: 'Order signed successfully and moved to production queue',
    });
  } catch (error) {
    console.error('Error signing followup order:', error);
    res.status(500).json({ 
      error: 'Failed to sign followup order',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
