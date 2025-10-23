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

    // Get stock model information
    const stockModels = await storage.getAllStockModels();
    const stockModel = stockModels.find(m => m.id === order.modelId);

    // Get features information for pricing and display names
    const allFeatures = await storage.getAllFeatures();
    
    // Helper function to create a fallback display name from a value
    const createFallbackDisplayName = (value: string): string => {
      return value
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };
    
    // Build comprehensive feature data for PDF
    const featurePrices: Record<string, number> = {};
    const featureDisplayNames: Record<string, string> = {};
    const featureSelectionDisplayNames: Record<string, string> = {};
    const featureSelectionPrices: Record<string, number> = {};

    if (order.features && typeof order.features === 'object') {
      for (const [featureKey, featureValue] of Object.entries(order.features)) {
        if (featureValue && featureValue !== false && featureValue !== '') {
          const featureDetail = allFeatures.find((f: any) => f.id === featureKey);
          if (featureDetail) {
            // Store feature-level display name
            featureDisplayNames[featureKey] = featureDetail.displayName || featureDetail.name || featureKey;
            
            // Process feature selections to get display names and prices
            const featureOptions = (featureDetail as any).options || [];
            
            if (Array.isArray(featureValue)) {
              // Handle array of selections (like rails)
              let totalPrice = 0;
              for (const selectionValue of featureValue) {
                const option = featureOptions.find((opt: any) => opt.value === selectionValue);
                if (option) {
                  featureSelectionDisplayNames[selectionValue] = option.displayName || option.label || selectionValue;
                  const selectionPrice = option.price || 0;
                  featureSelectionPrices[selectionValue] = selectionPrice;
                  totalPrice += selectionPrice;
                } else {
                  // Fallback: create display name from value
                  featureSelectionDisplayNames[selectionValue] = createFallbackDisplayName(selectionValue);
                }
              }
              featurePrices[featureKey] = totalPrice;
            } else {
              // Handle single selection
              const option = featureOptions.find((opt: any) => opt.value === featureValue);
              if (option) {
                featureSelectionDisplayNames[featureValue] = option.displayName || option.label || featureValue;
                const selectionPrice = option.price || 0;
                featureSelectionPrices[featureValue] = selectionPrice;
                featurePrices[featureKey] = selectionPrice;
              } else {
                // Fallback: create display name from value and use feature base price
                featureSelectionDisplayNames[featureValue] = createFallbackDisplayName(featureValue);
                featurePrices[featureKey] = featureDetail.price || 0;
              }
            }
          }
        }
      }
    }

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
      customerCompany: customer.company || undefined,
      customerAddress: defaultAddress ? {
        street: defaultAddress.street,
        street2: defaultAddress.street2 || undefined,
        city: defaultAddress.city,
        state: defaultAddress.state,
        zipCode: defaultAddress.zipCode,
        country: defaultAddress.country,
      } : undefined,
      modelId: order.modelId || undefined,
      modelName: stockModel?.name || undefined,
      modelDisplayName: stockModel?.displayName || undefined,
      modelPrice: stockModel?.price || 0,
      handedness: order.handedness || undefined,
      features: order.features as Record<string, any> || undefined,
      featurePrices,
      featureDisplayNames,
      featureSelectionDisplayNames,
      featureSelectionPrices,
      notes: order.notes || undefined,
      shipping: order.shipping || 0,
      paymentStatus: 'PENDING' as const, // New orders are always pending
      discountCode: order.discountCode || undefined,
      customDiscountType: order.customDiscountType || undefined,
      customDiscountValue: order.customDiscountValue || undefined,
      showCustomDiscount: order.showCustomDiscount || undefined,
    };

    console.log('📄 PDF Order Data Debug:', {
      orderId: orderData.orderId,
      modelId: orderData.modelId,
      modelDisplayName: orderData.modelDisplayName,
      modelPrice: orderData.modelPrice,
      featuresCount: orderData.features ? Object.keys(orderData.features).length : 0,
      features: orderData.features,
      featurePricesCount: Object.keys(featurePrices).length,
      featurePrices,
      featureDisplayNamesCount: Object.keys(featureDisplayNames).length,
      featureDisplayNames,
      discountCode: orderData.discountCode,
      customDiscountType: orderData.customDiscountType,
      customDiscountValue: orderData.customDiscountValue,
      showCustomDiscount: orderData.showCustomDiscount,
    });

    // Generate PDF
    const pdfBuffer = await generateSalesOrderPDF(orderData, true);
    const pdfFilename = `sales_order_${orderId}_${Date.now()}.pdf`;
    const pdfPath = path.join(uploadsDir, pdfFilename);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Create order summary for email and sign page
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
      // Add customer information for sign page
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerAddress: defaultAddress ? {
        street: defaultAddress.street,
        street2: defaultAddress.street2,
        city: defaultAddress.city,
        state: defaultAddress.state,
        zipCode: defaultAddress.zipCode,
      } : undefined,
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

    // Fetch customer information if not in orderSummary
    let enrichedOrderSummary = followupOrder.orderSummary as any;
    
    if (!enrichedOrderSummary.customerName && followupOrder.customerId) {
      const customer = await storage.getCustomerById(followupOrder.customerId);
      if (customer) {
        const addresses = await storage.getCustomerAddresses(followupOrder.customerId);
        const defaultAddress = addresses.find(addr => addr.isDefault) || addresses[0];
        
        enrichedOrderSummary = {
          ...enrichedOrderSummary,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          customerAddress: defaultAddress ? {
            street: defaultAddress.street,
            street2: defaultAddress.street2,
            city: defaultAddress.city,
            state: defaultAddress.state,
            zipCode: defaultAddress.zipCode,
          } : undefined,
        };
      }
    }

    // Fetch stock model and feature information for display names
    const stockModels = await storage.getAllStockModels();
    const allFeatures = await storage.getAllFeatures();
    
    const stockModel = stockModels.find(m => m.id === enrichedOrderSummary.modelId);
    
    const featureDisplayInfo: Record<string, any> = {};
    if (enrichedOrderSummary.features) {
      for (const [featureKey, featureValue] of Object.entries(enrichedOrderSummary.features)) {
        if (featureValue && featureValue !== false && featureValue !== '') {
          const featureDetail = allFeatures.find((f: any) => f.id === featureKey);
          if (featureDetail) {
            featureDisplayInfo[featureKey] = {
              displayName: featureDetail.displayName || featureDetail.name,
              selections: {}
            };
            
            const featureOptions = (featureDetail as any).options || [];
            if (Array.isArray(featureValue)) {
              for (const val of featureValue) {
                const option = featureOptions.find((opt: any) => opt.value === val);
                if (option) {
                  featureDisplayInfo[featureKey].selections[val] = option.displayName || option.label || val;
                }
              }
            } else {
              const option = featureOptions.find((opt: any) => opt.value === featureValue);
              if (option) {
                featureDisplayInfo[featureKey].selections[String(featureValue)] = option.displayName || option.label || String(featureValue);
              }
            }
          }
        }
      }
    }

    // Return order data with enriched information but do NOT expose the signature token
    const { signatureToken, ...safeOrderData } = followupOrder;
    res.json({
      ...safeOrderData,
      orderSummary: enrichedOrderSummary,
      modelDisplayName: stockModel?.displayName || stockModel?.name,
      featureDisplayInfo,
    });
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

    // Update order status from PENDING_SIGNATURE to FINALIZED and move to production queue
    console.log(`✅ Customer signed order ${followupOrder.orderId} - finalizing and moving to production...`);
    
    try {
      // Update the order status to FINALIZED, set current department, and copy signature data
      await storage.updateFinalizedOrder(followupOrder.orderId, {
        status: 'FINALIZED',
        currentDepartment: 'P1 Production Queue',
        signatureData,
        signedAt: new Date()
      });
      
      console.log(`🎯 Order ${followupOrder.orderId} finalized and in production queue with signature`);
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

// POST /api/followup-orders/:orderId/resend-email - Resend signature email (admin only for FINALIZED orders)
router.post('/:orderId/resend-email', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Get the follow-up order
    const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
    if (!followupOrder) {
      return res.status(404).json({ error: 'Follow-up order not found' });
    }

    // Verify order is still pending signature or finalized
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderStatus = order.status?.toUpperCase();
    
    // For FINALIZED orders, require admin authorization
    if (orderStatus === 'FINALIZED') {
      // Check admin authorization
      const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
      
      if (!sessionToken) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Verify session and get user role from database
      const pool = await import('../../db').then(m => m.pool);
      const sessionResult = await pool.query(
        'SELECT user_id, username FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()',
        [sessionToken]
      );

      if (!sessionResult || sessionResult.length === 0) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      const session = sessionResult[0];
      
      // Try to get user role from database first
      const userResult = await pool.query(
        'SELECT role FROM users WHERE username = $1 AND is_active = true',
        [session.username.toLowerCase()]
      );

      let userRole: string | null = null;
      
      if (userResult && userResult.length > 0) {
        userRole = userResult[0].role;
      } else {
        // Fall back to hardcoded admin users (epoch, glennj, tasham)
        const hardcodedAdmins = ['epoch', 'glennj', 'tasham'];
        if (hardcodedAdmins.includes(session.username.toLowerCase())) {
          userRole = 'ADMIN';
        }
      }

      if (userRole !== 'ADMIN') {
        return res.status(403).json({ 
          error: 'Admin authorization required to resend email for finalized orders' 
        });
      }
    } else if (orderStatus !== 'PENDING_SIGNATURE') {
      return res.status(400).json({ 
        error: `Order status is ${order.status}. Can only resend email for PENDING_SIGNATURE or FINALIZED orders.` 
      });
    }

    // Get customer details
    const customer = await storage.getCustomerById(order.customerId || '');
    if (!customer || !customer.email) {
      return res.status(400).json({ 
        error: 'Customer email not found. Cannot resend email.' 
      });
    }

    // Get customer address
    const addresses = await storage.getCustomerAddresses(order.customerId || '');
    const defaultAddress = addresses.find(addr => addr.isDefault) || addresses[0];

    // Get stock model information
    const stockModels = await storage.getAllStockModels();
    const stockModel = stockModels.find(m => m.id === order.modelId);

    // Get features information for pricing and display names
    const allFeatures = await storage.getAllFeatures();
    
    // Helper function to create a fallback display name from a value
    const createFallbackDisplayName = (value: string): string => {
      return value
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    };
    
    // Build comprehensive feature data for PDF
    const featurePrices: Record<string, number> = {};
    const featureDisplayNames: Record<string, string> = {};
    const featureSelectionDisplayNames: Record<string, string> = {};
    const featureSelectionPrices: Record<string, number> = {};

    if (order.features && typeof order.features === 'object') {
      for (const [featureKey, featureValue] of Object.entries(order.features)) {
        if (featureValue && featureValue !== false && featureValue !== '') {
          const featureDetail = allFeatures.find((f: any) => f.id === featureKey);
          if (featureDetail) {
            // Store feature-level display name
            featureDisplayNames[featureKey] = featureDetail.displayName || featureDetail.name || featureKey;
            
            // Process feature selections to get display names and prices
            const featureOptions = (featureDetail as any).options || [];
            
            if (Array.isArray(featureValue)) {
              // Handle array of selections (like rails)
              let totalPrice = 0;
              for (const selectionValue of featureValue) {
                const option = featureOptions.find((opt: any) => opt.value === selectionValue);
                if (option) {
                  featureSelectionDisplayNames[selectionValue] = option.displayName || option.label || selectionValue;
                  const selectionPrice = option.price || 0;
                  featureSelectionPrices[selectionValue] = selectionPrice;
                  totalPrice += selectionPrice;
                } else {
                  // Fallback: create display name from value
                  featureSelectionDisplayNames[selectionValue] = createFallbackDisplayName(selectionValue);
                }
              }
              featurePrices[featureKey] = totalPrice;
            } else {
              // Handle single selection
              const option = featureOptions.find((opt: any) => opt.value === featureValue);
              if (option) {
                featureSelectionDisplayNames[featureValue] = option.displayName || option.label || featureValue;
                const selectionPrice = option.price || 0;
                featureSelectionPrices[featureValue] = selectionPrice;
                featurePrices[featureKey] = selectionPrice;
              } else {
                // Fallback: create display name from value and use feature base price
                featureSelectionDisplayNames[featureValue] = createFallbackDisplayName(featureValue);
                featurePrices[featureKey] = featureDetail.price || 0;
              }
            }
          }
        }
      }
    }

    // Generate signature link using existing token
    const baseUrl = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'http://localhost:5000';
    const signatureLink = `${baseUrl}/sign-order/${followupOrder.signatureToken}`;

    // Prepare order data for PDF with LATEST discount information
    const orderData = {
      orderId: order.orderId,
      orderDate: new Date(order.orderDate),
      dueDate: new Date(order.dueDate),
      customerId: order.customerId || '',
      customerPO: order.customerPO || undefined,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone || undefined,
      customerCompany: customer.company || undefined,
      customerAddress: defaultAddress ? {
        street: defaultAddress.street,
        street2: defaultAddress.street2 || undefined,
        city: defaultAddress.city,
        state: defaultAddress.state,
        zipCode: defaultAddress.zipCode,
        country: defaultAddress.country,
      } : undefined,
      modelId: order.modelId || undefined,
      modelName: stockModel?.name || undefined,
      modelDisplayName: stockModel?.displayName || undefined,
      modelPrice: stockModel?.price || 0,
      handedness: order.handedness || undefined,
      features: order.features as Record<string, any> || undefined,
      featurePrices,
      featureDisplayNames,
      featureSelectionDisplayNames,
      featureSelectionPrices,
      notes: order.notes || undefined,
      shipping: order.shipping || 0,
      paymentStatus: 'PENDING' as const,
      discountCode: order.discountCode || undefined,
      customDiscountType: order.customDiscountType || undefined,
      customDiscountValue: order.customDiscountValue || undefined,
      showCustomDiscount: order.showCustomDiscount || undefined,
    };

    console.log('🔄 Regenerating PDF with latest order data including discounts:', {
      orderId: orderData.orderId,
      discountCode: orderData.discountCode,
      customDiscountType: orderData.customDiscountType,
      customDiscountValue: orderData.customDiscountValue,
      showCustomDiscount: orderData.showCustomDiscount,
    });

    // Regenerate PDF with latest order data (including updated discounts)
    const pdfBuffer = await generateSalesOrderPDF(orderData, true);
    const pdfFilename = `sales_order_${orderId}_${Date.now()}.pdf`;
    const pdfPath = path.join(uploadsDir, pdfFilename);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Update follow-up order with new PDF path
    await storage.updateFollowupOrder(followupOrder.id, {
      pdfPath,
      pdfGenerated: true,
      pdfGeneratedAt: new Date(),
    });

    // Send email with regenerated PDF
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
      // Update email sent timestamp
      await storage.updateFollowupOrder(followupOrder.id, {
        emailSent: true,
        emailSentAt: new Date(),
      });

      res.json({
        success: true,
        message: 'Review and sign email has been resent successfully.',
        emailSent: true,
        messageId: emailResult.messageId,
      });
    } else {
      await storage.updateFollowupOrder(followupOrder.id, {
        emailError: emailResult.error,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to send email.',
        error: emailResult.error,
      });
    }
  } catch (error) {
    console.error('Error resending follow-up order email:', error);
    res.status(500).json({ 
      error: 'Failed to resend email',
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;
