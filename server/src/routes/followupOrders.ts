import express from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertFollowupOrderSchema } from '../../schema';
import { embedSignatureInPDF } from '../../utils/pdf/salesOrderPdf';
import { sendOrderSignedConfirmation } from '../../utils/orderSignedConfirmation';
// DEPRECATED: calculatePriorityScore removed - use computeEffectivePriority() from shared/utils
import { sendReminderForOverdueOrders } from '../../utils/followupOrderReminder';
import { sendOrderConfirmationNotification } from '../../utils/notifications';
import { auditService } from '../services/auditService';
import { authenticateToken } from '../../middleware/auth';
import { createSignatureLink, generatePublicSignatureId } from '../../utils/magicLink';
import { generateOrderPdf, PdfIntent, hasOrderChangedSinceSnapshot, storeOrderSnapshotById } from '../../services/orderPdfService';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';

const router = express.Router();

// Helper function to evaluate production readiness status
// Returns: 'ready', 'missing_model', 'missing_action_length', or 'pending'
// Note: Handles both camelCase (from API) and snake_case (from storage) field names
function evaluateProductionReadiness(order: any): string {
  // Handle both camelCase and snake_case field names
  const modelId = order?.modelId || order?.model_id || order?.stockModelId || order?.stock_model_id;
  const features = order?.features || {};
  const actionLength = features?.action_length;
  
  // Check for missing or invalid model
  if (!modelId || modelId === '' || modelId === 'None' || 
      modelId.toLowerCase() === 'no stock' || modelId.toLowerCase() === 'no_stock') {
    return 'missing_model';
  }
  
  // Check for missing action_length
  if (!actionLength || actionLength === '' || actionLength === 'null') {
    return 'missing_action_length';
  }
  
  return 'ready';
}

// Ensure uploads directory exists
const uploadsDir = 'uploads/followup-orders';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Helper function to calculate order pricing - mirrors OrderEntry pricing logic
async function calculateOrderPricing(
  orderSummary: any,
  stockModel: any,
  allFeatures: any[],
  orderId: string
) {
  // Get full order record for price overrides and discount settings
  const order = await storage.getOrderById(orderId);
  if (!order) {
    throw new Error('Order not found');
  }
  
  let subtotal = 0;
  let basePrice = 0;
  
  // Step 1: Determine base price (following OrderEntry logic exactly)
  // Priority: priceOverride > flattopPriceOverride > stock model price
  if (order.priceOverride !== null && order.priceOverride !== undefined) {
    // APR complete price override - use as entire subtotal
    basePrice = parseFloat(String(order.priceOverride)) || 0;
    subtotal = basePrice;
    
    // Add shipping
    const shipping = parseFloat(String(orderSummary.shipping)) || 0;
    
    // Get payments
    const payments = await storage.getPaymentsByOrderId(orderId);
    const paidAmount = payments.reduce((sum, payment) => sum + (parseFloat(String(payment.paymentAmount)) || 0), 0);
    
    // Calculate discount (custom discount only applies to base price when priceOverride is set)
    let discountAmount = 0;
    if (order.showCustomDiscount && order.customDiscountValue) {
      if (order.customDiscountType === 'percent') {
        discountAmount = (subtotal * (parseFloat(String(order.customDiscountValue)) || 0)) / 100;
      } else {
        discountAmount = parseFloat(String(order.customDiscountValue)) || 0;
      }
    }
    
    const total = subtotal - discountAmount + shipping;
    const balanceDue = total - paidAmount;
    
    return { basePrice, subtotal, discountAmount, shipping, total, paidAmount, balanceDue };
  }
  
  // Step 2: Check for flattop price override
  if (order.isFlattop && order.flattopPriceOverride !== null && order.flattopPriceOverride !== undefined) {
    basePrice = parseFloat(String(order.flattopPriceOverride)) || 0;
    subtotal = basePrice;
  } else {
    // Use stock model price
    basePrice = parseFloat(String(stockModel?.price)) || 0;
    subtotal = basePrice;
  }
  
  // Step 3: Add feature prices
  if (orderSummary.features) {
    for (const [featureKey, featureValue] of Object.entries(orderSummary.features)) {
      if (!featureValue || featureValue === false || featureValue === '' || featureKey === 'miscItems') {
        continue;
      }
      
      // Find the feature definition
      let featureDetail = allFeatures.find((f: any) => f.id === featureKey || f.name === featureKey);
      
      // Special handling for paint_options - search across all paint-related features
      if (!featureDetail && featureKey === 'paint_options') {
        const paintFeatures = allFeatures.filter((f: any) => 
          f.id === 'special_effects' || 
          f.id === 'custom_graphics' || 
          f.id === 'camo_patterns' ||
          f.id === 'premium_patterns' ||
          f.id === 'base_colors'
        );
        
        for (const pf of paintFeatures) {
          const pfOptions = (pf as any).options || [];
          const option = pfOptions.find((opt: any) => opt.value === featureValue);
          if (option) {
            featureDetail = pf;
            break;
          }
        }
      }
      
      if (featureDetail) {
        const featureOptions = (featureDetail as any).options || [];
        
        if (Array.isArray(featureValue)) {
          // Handle multi-select features
          for (const val of featureValue) {
            const option = featureOptions.find((opt: any) => opt.value === val);
            if (option?.price) {
              subtotal += parseFloat(String(option.price)) || 0;
            }
          }
        } else {
          // Handle single-select features
          const option = featureOptions.find((opt: any) => opt.value === featureValue);
          if (option?.price) {
            subtotal += parseFloat(String(option.price)) || 0;
          }
        }
      }
    }
    
    // Add miscellaneous items total
    if (Array.isArray(orderSummary.features.miscItems)) {
      const miscTotal = orderSummary.features.miscItems.reduce(
        (sum: number, item: any) => sum + (parseFloat(String(item.total)) || 0),
        0
      );
      subtotal += miscTotal;
    }
  }
  
  // Step 4: Calculate discount amount
  let discountAmount = 0;
  
  // Handle custom discount
  if (order.showCustomDiscount && order.customDiscountValue) {
    if (order.customDiscountType === 'percent') {
      discountAmount = (subtotal * (parseFloat(String(order.customDiscountValue)) || 0)) / 100;
    } else {
      discountAmount = parseFloat(String(order.customDiscountValue)) || 0;
    }
  }
  // Handle discount codes
  else if (order.discountCode && order.discountCode !== 'none') {
    // Get all persistent discounts and short-term sales
    const persistentDiscounts = await storage.getAllPersistentDiscounts();
    const shortTermSales = await storage.getAllShortTermSales();
    
    // Check if it's a persistent discount
    if (order.discountCode.startsWith('persistent_')) {
      const discountId = parseInt(order.discountCode.replace('persistent_', ''));
      const discount = persistentDiscounts.find(d => d.id === discountId);
      
      if (discount) {
        const baseAmount = basePrice; // For stock_model discounts
        
        if (discount.appliesTo === 'stock_model') {
          // Apply discount only to base model price
          if (discount.percent) {
            discountAmount = (baseAmount * discount.percent) / 100;
          } else if (discount.fixedAmount) {
            discountAmount = discount.fixedAmount / 100; // Convert from cents to dollars
          }
        } else {
          // Apply discount to total order
          if (discount.percent) {
            discountAmount = (subtotal * discount.percent) / 100;
          } else if (discount.fixedAmount) {
            discountAmount = discount.fixedAmount / 100;
          }
        }
      }
    }
    // Check if it's a short-term sale
    else if (order.discountCode.startsWith('short_term_')) {
      const saleId = parseInt(order.discountCode.replace('short_term_', ''));
      const sale = shortTermSales.find(s => s.id === saleId);
      
      if (sale && sale.percent) {
        const baseAmount = basePrice; // For stock_model sales
        
        if (sale.appliesTo === 'stock_model') {
          // Apply discount only to base model price
          discountAmount = (baseAmount * sale.percent) / 100;
        } else {
          // Apply discount to total order
          discountAmount = (subtotal * sale.percent) / 100;
        }
      }
    }
  }
  
  // Step 5: Get shipping charge
  const shipping = parseFloat(String(orderSummary.shipping)) || 0;
  
  // Step 6: Calculate total
  const total = subtotal - discountAmount + shipping;
  
  // Step 7: Get payments
  const payments = await storage.getPaymentsByOrderId(orderId);
  const paidAmount = payments.reduce((sum, payment) => sum + (parseFloat(String(payment.paymentAmount)) || 0), 0);
  
  // Step 8: Calculate balance due
  const balanceDue = total - paidAmount;
  
  return {
    basePrice,
    subtotal,
    discountAmount,
    shipping,
    total,
    paidAmount,
    balanceDue,
  };
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

    // Generate unique signature token (server-only secret) and public ID (URL-safe)
    const signatureToken = nanoid(32);
    const publicSignatureId = generatePublicSignatureId();

    // SIGNATURE LINK CONTRACT: Get environment FIRST, then generate signature link with EXPLICIT env
    const { getCurrentEnvironment: getEnv } = await import('../../utils/magicLink');
    const orderEnvironmentForLink = getEnv();
    const signatureLink = createSignatureLink(publicSignatureId, orderEnvironmentForLink);

    // Extract miscellaneous items from features object
    const miscItems = (order.features as any)?.miscItems || [];

    // Get discount details for PDF - extract display name, type, value, and appliesTo
    let discountDisplayName: string | undefined;
    let discountAppliesTo: 'stock_model' | 'total_order' | undefined;
    let calculatedDiscountType: string | undefined;
    let calculatedDiscountValue: number | undefined;
    let shouldShowDiscount = false;
    
    if (order.discountCode && order.discountCode !== 'none') {
      try {
        const persistentDiscounts = await storage.getAllPersistentDiscounts();
        const seasonalDiscounts = await storage.getAllShortTermSales();
        
        let discount: any = null;
        if (order.discountCode.startsWith('persistent_')) {
          const discountId = parseInt(order.discountCode.replace('persistent_', ''));
          discount = persistentDiscounts.find((d) => d.id === discountId);
        } else if (order.discountCode.startsWith('short_term_')) {
          const discountId = parseInt(order.discountCode.replace('short_term_', ''));
          discount = seasonalDiscounts.find((d) => d.id === discountId);
        } else {
          discount = persistentDiscounts.find((d) => d.name === order.discountCode) ||
                     seasonalDiscounts.find((d) => d.name === order.discountCode);
        }
        
        if (discount) {
          shouldShowDiscount = true;
          discountDisplayName = discount.name || discount.description;
          discountAppliesTo = discount.appliesTo || 'total_order';
          
          if (discount.percent !== null && discount.percent > 0) {
            calculatedDiscountType = 'percent';
            calculatedDiscountValue = discount.percent;
          } else if (discount.fixedAmount) {
            calculatedDiscountType = 'fixed';
            calculatedDiscountValue = Number(discount.fixedAmount) / 100;
          }
          console.log(`📄 [Followup Create] Discount found: ${order.discountCode} -> ${calculatedDiscountType} ${calculatedDiscountValue}`);
        } else if (order.customDiscountValue) {
          shouldShowDiscount = true;
          calculatedDiscountType = order.customDiscountType || 'percent';
          calculatedDiscountValue = order.customDiscountValue;
          discountAppliesTo = (order.discountAppliesTo as 'stock_model' | 'total_order') || 'total_order';
        }
      } catch (error) {
        console.error('Error fetching discount details:', error);
      }
    }
    
    if (order.showCustomDiscount && order.customDiscountValue) {
      shouldShowDiscount = true;
      calculatedDiscountType = order.customDiscountType || 'percent';
      calculatedDiscountValue = order.customDiscountValue;
    }

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
      featureQuantities: order.featureQuantities as Record<string, number> || undefined,
      miscItems: miscItems.length > 0 ? miscItems : undefined,
      notes: order.notes || undefined,
      shipping: order.shipping || 0,
      paymentStatus: 'PENDING' as const, // New orders are always pending
      discountCode: order.discountCode || undefined,
      discountDisplayName: discountDisplayName || undefined,
      discountAppliesTo: discountAppliesTo || undefined,
      customDiscountType: calculatedDiscountType || order.customDiscountType || undefined,
      customDiscountValue: calculatedDiscountValue || order.customDiscountValue || undefined,
      showCustomDiscount: shouldShowDiscount || order.showCustomDiscount || undefined,
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

    // Generate PDF via unified PDF service (creates snapshot internally and returns it)
    const pdfResult = await generateOrderPdf(orderId, PdfIntent.SIGNATURE_EMAIL);
    const pdfPath = pdfResult.filePath!;
    const orderSnapshot = pdfResult.snapshot; // Snapshot created by service, store with followup order

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

    // SIGNATURE LINK CONTRACT: Write environment explicitly on create (not DB defaults)
    const { getCurrentEnvironment, logSignatureEmailSend } = await import('../../utils/magicLink');
    const orderEnvironment = getCurrentEnvironment();
    
    // Create followup order record with explicit environment, public ID, and frozen snapshot
    const followupOrder = await storage.createFollowupOrder({
      orderId: order.orderId,
      customerId: order.customerId || '',
      customerEmail: customer.email,
      publicSignatureId, // URL-safe public identifier (exposed in emails)
      signatureToken, // Server-only secret (never exposed)
      environment: orderEnvironment, // Explicit environment for cross-environment safety
      pdfGenerated: true,
      pdfPath,
      pdfGeneratedAt: new Date(),
      orderSummary,
      orderSnapshot, // INVARIANT: Frozen at creation, never updated on resend
    });
    
    // SIGNATURE LINK CONTRACT: Forensic logging for every signature email send
    logSignatureEmailSend({
      orderId: order.orderId,
      signatureToken,
      publicSignatureId,
      environment: orderEnvironment,
      context: 'initial',
      recipient: customer.email,
    });

    // Send email via unified notification function (with deduplication)
    // forceResend is NOT set - automatic create flow respects deduplication
    const emailResult = await sendOrderConfirmationNotification({
      orderId: order.orderId,
      customerId: order.customerId || '',
      customerEmail: customer.email,
      customerPhone: customer.phone,
      preferredCommunicationMethod: customer.preferredCommunicationMethod,
      signatureToken,
      publicSignatureId,
      pdfPath,
      context: 'initial', // Initial order finalization
      orderData: {
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
      },
      // forceResend: false - automatic sends respect deduplication
    });

    // MANDATORY OUTCOME HANDLING: Every finalization must have a recorded email outcome
    // Log error for unknown outcomes but treat as 'failed' - order creation still succeeded
    const validOutcomes = ['sent', 'skipped', 'failed'] as const;
    if (!validOutcomes.includes(emailResult.outcome)) {
      const originalOutcome = emailResult.outcome;
      console.error(`❌ [FINALIZE] Unknown email outcome for ${order.orderId}: ${originalOutcome} - treating as failed`);
      // Treat unknown outcome as failed and continue to success response
      emailResult.outcome = 'failed';
      emailResult.error = `Unknown email outcome: ${originalOutcome}`;
    }

    if (emailResult.outcome === 'sent') {
      // Email was actually sent - update timestamp
      await storage.updateFollowupOrder(followupOrder.id, {
        emailSent: true,
        emailSentAt: new Date(),
        emailError: null, // Clear any previous error on success
      });

      res.json({
        success: true,
        followupOrder,
        emailOutcome: 'sent',
        emailSent: true,
        messageId: emailResult.messageId,
      });
    } else if (emailResult.outcome === 'skipped') {
      // Email was skipped due to deduplication - followup order already has email_sent=true
      res.json({
        success: true,
        followupOrder,
        emailOutcome: 'skipped',
        emailSent: false, // Not sent this time
        skipped: true,
        messageId: emailResult.messageId,
      });
    } else {
      // Email failed - record the error but return success (email failure is recoverable)
      // HARDENING: Email failure is a side-effect, not a transaction failure
      // The followup order and PDF were created successfully - only notification failed
      await storage.updateFollowupOrder(followupOrder.id, {
        emailError: emailResult.error,
      });

      console.log(`⚠️ [FINALIZE] Order ${order.orderId} finalized successfully but email failed: ${emailResult.error}`);
      res.json({
        success: true,
        followupOrder,
        emailOutcome: 'failed',
        emailSent: false,
        emailError: emailResult.error,
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

// GET /api/followup-orders/sign/:publicId - Get follow-up order by PUBLIC signature ID (NEW PATH-BASED ROUTE)
// This is the PRIMARY route for customer signature links - no query params, no secrets
router.get('/sign/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;

    // FORENSIC LOGGING: Trace INITIAL signature link click for "Order Not Found" debugging
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔐 [SIGN-ORDER] Path-based lookup request received');
    console.log('🔐 [SIGN-ORDER] Timestamp:', new Date().toISOString());
    console.log('🔐 [SIGN-ORDER] Raw publicId from URL params:', publicId);
    console.log('🔐 [SIGN-ORDER] publicId type:', typeof publicId);
    console.log('🔐 [SIGN-ORDER] publicId length:', publicId?.length);
    console.log('🔐 [SIGN-ORDER] publicId trimmed:', publicId?.trim());
    console.log('🔐 [SIGN-ORDER] publicId === trimmed:', publicId === publicId?.trim());
    console.log('🔐 [SIGN-ORDER] APP_ENV:', process.env.APP_ENV);
    console.log('🔐 [SIGN-ORDER] NODE_ENV:', process.env.NODE_ENV);
    console.log('═══════════════════════════════════════════════════════════════');

    // Validate public ID format (sig_XXXXXXXX)
    if (!publicId || !publicId.startsWith('sig_')) {
      console.log('❌ [SIGN-ORDER] Invalid public ID format:', publicId);
      return res.status(400).json({ error: 'Invalid signature link format' });
    }

    const followupOrder = await storage.getFollowupOrderByPublicId(publicId);
    if (!followupOrder) {
      console.log('❌ [SIGN-ORDER] No order found for public ID:', publicId);
      console.log('❌ [SIGN-ORDER] FORENSIC: The publicSignatureId', publicId, 'does not exist in followup_orders table');
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log('✅ [SIGN-ORDER] Found order:', followupOrder.orderId);

    // Environment check
    const { getCurrentEnvironment } = await import('../../utils/magicLink');
    const currentEnv = getCurrentEnvironment();
    if (followupOrder.environment && followupOrder.environment !== currentEnv) {
      console.log(`❌ [SIGN-ORDER] Environment mismatch: order=${followupOrder.environment}, current=${currentEnv}`);
      return res.status(403).json({ error: 'This link is not valid in this environment' });
    }

    // Check if already signed
    if (followupOrder.signatureSigned) {
      console.log(`📋 [SIGN-ORDER] Order ${followupOrder.orderId} already signed`);
    }

    // Enrich order data (same logic as by-token route)
    let enrichedOrderSummary = followupOrder.orderSummary as any;
    
    if (!enrichedOrderSummary?.customerName && followupOrder.customerId) {
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

    // Fetch stock model and feature information
    const stockModels = await storage.getAllStockModels();
    const allFeatures = await storage.getAllFeatures();
    
    const stockModel = stockModels.find(m => m.id === enrichedOrderSummary?.modelId);
    
    // Calculate pricing
    const pricing = await calculateOrderPricing(enrichedOrderSummary, stockModel, allFeatures, followupOrder.orderId);

    // Return order data - NEVER expose signatureToken to client
    const { signatureToken, ...safeOrderData } = followupOrder;
    res.json({
      ...safeOrderData,
      orderSummary: enrichedOrderSummary,
      modelDisplayName: stockModel?.displayName || stockModel?.name || enrichedOrderSummary?.modelId,
      pricing,
    });
  } catch (error) {
    console.error('Error fetching followup order by public ID:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// GET /api/followup-orders/by-token/:token - LEGACY: Get follow-up order by signature token
// This route is deprecated - use /sign/:publicId instead
router.get('/by-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // TOKEN INTEGRITY FORENSIC LOGGING
    console.log('⚠️ [LEGACY-TOKEN] /by-token request received (deprecated path)');
    console.log('⚠️ [LEGACY-TOKEN] Raw token from URL:', JSON.stringify(token));
    console.log('⚠️ [LEGACY-TOKEN] Token length:', token?.length);

    const followupOrder = await storage.getFollowupOrderByToken(token);
    if (!followupOrder) {
      console.log('❌ [LEGACY-TOKEN] NO MATCH FOUND for token:', JSON.stringify(token));
      
      // Try trimmed version
      const trimmedOrder = await storage.getFollowupOrderByToken(token?.trim() || '');
      if (trimmedOrder) {
        console.log('⚠️ [LEGACY-TOKEN] FOUND with trimmed token!');
      }
      
      return res.status(404).json({ error: 'Followup order not found' });
    }
    
    console.log('✅ [LEGACY-TOKEN] MATCH FOUND for order:', followupOrder.orderId);
    
    // If this order has a publicSignatureId, redirect client to use new path
    if (followupOrder.publicSignatureId) {
      console.log('🔄 [LEGACY-TOKEN] Order has publicSignatureId, client should use new path');
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
          // Special handling for handedness (not in features table)
          if (featureKey === 'handedness') {
            featureDisplayInfo[featureKey] = {
              displayName: 'Handedness',
              selections: {
                [String(featureValue)]: String(featureValue).charAt(0).toUpperCase() + String(featureValue).slice(1)
              }
            };
            continue;
          }
          
          // Search for feature by both id and name to handle feature key mismatches
          let featureDetail = allFeatures.find((f: any) => f.id === featureKey || f.name === featureKey);
          
          // Special handling for paint_options - search across all paint-related features
          if (!featureDetail && featureKey === 'paint_options') {
            const paintFeatures = allFeatures.filter((f: any) => 
              f.id === 'special_effects' || 
              f.id === 'custom_graphics' || 
              f.id === 'camo_patterns' ||
              f.id === 'premium_patterns' ||
              f.id === 'base_colors'
            );
            
            // Search for the value across all paint features
            for (const pf of paintFeatures) {
              const pfOptions = (pf as any).options || [];
              const option = pfOptions.find((opt: any) => opt.value === featureValue);
              if (option) {
                featureDetail = pf;
                break;
              }
            }
          }
          
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

    // Calculate pricing information
    const pricingInfo = await calculateOrderPricing(
      enrichedOrderSummary,
      stockModel,
      allFeatures,
      followupOrder.orderId || ''
    );

    // Return order data with enriched information but do NOT expose the signature token
    const { signatureToken, ...safeOrderData } = followupOrder;
    res.json({
      ...safeOrderData,
      orderSummary: enrichedOrderSummary,
      modelDisplayName: stockModel?.displayName || stockModel?.name,
      featureDisplayInfo,
      pricing: pricingInfo,
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

// GET /api/followup-orders/signature-info/:orderId - Get signature info for an order (requires authentication)
// NOTE: This route MUST be defined BEFORE the /:id route to avoid being caught by the parametric route
router.get('/signature-info/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Find the followup order by orderId
    const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
    
    if (!followupOrder) {
      return res.json({ 
        hasSignature: false,
        orderId 
      });
    }
    
    // Signed PDF is available if:
    // 1. The file exists on disk, OR
    // 2. We have the signature data stored (can regenerate on-demand)
    const signedPdfOnDisk = !!(followupOrder.signedPdfPath && fs.existsSync(followupOrder.signedPdfPath));
    const canRegeneratePdf = !!followupOrder.signatureData;
    
    res.json({
      hasSignature: followupOrder.signatureSigned || false,
      signedAt: followupOrder.signedAt,
      signedPdfAvailable: signedPdfOnDisk || canRegeneratePdf,
      orderId
    });
  } catch (error) {
    console.error('Error fetching signature info:', error);
    res.status(500).json({ 
      error: 'Failed to fetch signature info',
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// GET /api/followup-orders/signed-pdf/:orderId - Download signed PDF for an order (requires authentication)
// NOTE: This route MUST be defined BEFORE the /:id route to avoid being caught by the parametric route
router.get('/signed-pdf/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Find the followup order by orderId
    const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
    
    if (!followupOrder) {
      return res.status(404).json({ error: 'No signature record found for this order' });
    }
    
    if (!followupOrder.signatureSigned) {
      return res.status(400).json({ error: 'Order has not been signed yet' });
    }
    
    // Check if signed PDF exists on disk
    if (followupOrder.signedPdfPath && fs.existsSync(followupOrder.signedPdfPath)) {
      // Signed PDF exists, serve it directly
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="signed_order_${orderId}.pdf"`);
      return res.sendFile(path.resolve(followupOrder.signedPdfPath));
    }
    
    // Signed PDF is missing - attempt to regenerate from stored signature data
    console.log(`⚠️ Signed PDF missing for order ${orderId}, attempting to regenerate...`);
    
    if (!followupOrder.signatureData) {
      return res.status(404).json({ 
        error: 'Cannot regenerate signed PDF - signature data not found' 
      });
    }
    
    // Get order and customer data to regenerate PDF
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const customer = await storage.getCustomerById(order.customerId || '');
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
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
            featureDisplayNames[featureKey] = featureDetail.displayName || featureDetail.name || featureKey;
            const featureOptions = (featureDetail as any).options || [];
            
            if (Array.isArray(featureValue)) {
              let totalPrice = 0;
              for (const selectionValue of featureValue) {
                const option = featureOptions.find((opt: any) => opt.value === selectionValue);
                if (option) {
                  featureSelectionDisplayNames[selectionValue] = option.displayName || option.label || selectionValue;
                  const selectionPrice = option.price || 0;
                  featureSelectionPrices[selectionValue] = selectionPrice;
                  totalPrice += selectionPrice;
                } else {
                  featureSelectionDisplayNames[selectionValue] = createFallbackDisplayName(selectionValue);
                }
              }
              featurePrices[featureKey] = totalPrice;
            } else {
              const option = featureOptions.find((opt: any) => opt.value === featureValue);
              if (option) {
                featureSelectionDisplayNames[featureValue] = option.displayName || option.label || featureValue;
                const selectionPrice = option.price || 0;
                featureSelectionPrices[featureValue] = selectionPrice;
                featurePrices[featureKey] = selectionPrice;
              } else {
                featureSelectionDisplayNames[featureValue] = createFallbackDisplayName(featureValue);
                featurePrices[featureKey] = featureDetail.price || 0;
              }
            }
          }
        }
      }
    }

    // Extract miscellaneous items from features object
    const miscItems = (order.features as any)?.miscItems || [];

    // Prepare order data for PDF regeneration
    const orderData = {
      orderId: order.orderId,
      orderDate: new Date(order.orderDate),
      dueDate: new Date(order.dueDate),
      customerId: order.customerId || '',
      customerPO: order.customerPO || undefined,
      customerName: customer.name,
      customerEmail: customer.email || undefined,
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
      featureQuantities: order.featureQuantities as Record<string, number> || undefined,
      miscItems: miscItems.length > 0 ? miscItems : undefined,
      notes: order.notes || undefined,
      shipping: order.shipping || 0,
      paymentStatus: 'PENDING' as const,
      discountCode: order.discountCode || undefined,
      customDiscountType: order.customDiscountType || undefined,
      customDiscountValue: order.customDiscountValue || undefined,
      showCustomDiscount: order.showCustomDiscount || undefined,
    };

    // Generate signed PDF via unified service (uses stored snapshot + embeds signature)
    console.log(`📄 [SIGNED-ARCHIVE] Generating signed PDF for order ${orderId}...`);
    
    const pdfResult = await generateOrderPdf(orderId, PdfIntent.SIGNED_ARCHIVE);
    const signedPdfPath = pdfResult.filePath!;
    
    // Update the followup order with the new signed PDF path
    await storage.updateFollowupOrder(followupOrder.id, {
      signedPdfPath,
    });
    
    console.log(`✅ [SIGNED-ARCHIVE] PDF generated for order ${orderId} at ${signedPdfPath}`);
    
    // Serve the regenerated signed PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="signed_order_${orderId}.pdf"`);
    res.sendFile(path.resolve(signedPdfPath));
  } catch (error) {
    console.error('Error fetching signed PDF:', error);
    res.status(500).json({ 
      error: 'Failed to fetch signed PDF',
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
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
// Accepts EITHER publicSignatureId (new) OR signatureToken (legacy)
router.post('/:id/sign', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    console.log(`📝 Sign request received for followup order ID: ${id}`);
    
    if (isNaN(id)) {
      console.log(`❌ Invalid followup order ID: ${req.params.id}`);
      return res.status(400).json({ error: 'Invalid followup order ID' });
    }

    const { signatureData, signatureToken, publicSignatureId } = req.body;
    if (!signatureData) {
      console.log(`❌ Missing signature data for order ID: ${id}`);
      return res.status(400).json({ error: 'Signature data is required' });
    }

    // Must have either publicSignatureId (new) or signatureToken (legacy)
    if (!signatureToken && !publicSignatureId) {
      console.log(`❌ Missing authentication for order ID: ${id}`);
      return res.status(400).json({ error: 'Missing signature authentication' });
    }

    const followupOrder = await storage.getFollowupOrder(id);
    if (!followupOrder) {
      console.log(`❌ Followup order not found for ID: ${id}`);
      return res.status(404).json({ error: 'Followup order not found' });
    }

    console.log(`📋 Found followup order: ${followupOrder.orderId}, pdfPath: ${followupOrder.pdfPath || 'MISSING'}`);

    // Validate authorization - accept EITHER publicSignatureId OR signatureToken
    let isAuthorized = false;
    
    if (publicSignatureId) {
      // NEW: Validate using public signature ID (no secret in client)
      isAuthorized = followupOrder.publicSignatureId === publicSignatureId;
      if (!isAuthorized) {
        console.log(`❌ Public ID mismatch for order ${followupOrder.orderId}`);
      }
    } else if (signatureToken) {
      // LEGACY: Validate using secret token (backwards compatibility)
      isAuthorized = followupOrder.signatureToken?.trim() === signatureToken?.trim();
      if (!isAuthorized) {
        console.log(`❌ Token mismatch for order ${followupOrder.orderId}`);
      }
    }
    
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Invalid or expired signing link' });
    }

    if (followupOrder.signatureSigned) {
      console.log(`⚠️ Order ${followupOrder.orderId} already signed at ${followupOrder.signedAt}`);
      return res.status(400).json({ error: 'Order already signed' });
    }

    // Check for PDF path
    if (!followupOrder.pdfPath) {
      console.log(`❌ No PDF path for order ${followupOrder.orderId} - PDF was never generated`);
      return res.status(400).json({ 
        error: 'Original PDF not found. Please contact support to resend the signature request.',
        details: 'PDF was never generated for this order'
      });
    }

    // Verify the PDF file actually exists
    if (!fs.existsSync(followupOrder.pdfPath)) {
      console.log(`❌ PDF file missing at path: ${followupOrder.pdfPath} for order ${followupOrder.orderId}`);
      return res.status(400).json({ 
        error: 'Original PDF file not found. Please contact support to resend the signature request.',
        details: 'PDF file was deleted or moved'
      });
    }

    console.log(`✅ PDF verified at: ${followupOrder.pdfPath}`);

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

    // Update order status to FINALIZED and move to production queue
    console.log(`✅ Customer signed order ${followupOrder.orderId} - finalizing and moving to production...`);
    
    try {
      // Get current order to access features for readiness evaluation
      const currentOrder = await storage.getOrderById(followupOrder.orderId);
      
      // UNIFIED PRIORITY MODEL: Do NOT persist calculated priority score
      // Priority is computed at runtime by computeEffectivePriority()
      // We only persist the urgency state and source
      console.log(`📊 Order ${followupOrder.orderId}: Priority will be computed at runtime (not persisted)`);
      
      // Evaluate production readiness status
      const productionReadinessStatus = evaluateProductionReadiness(currentOrder);
      console.log(`📋 Production readiness status for order ${followupOrder.orderId}: ${productionReadinessStatus}`);
      
      // Update the order status to FINALIZED, set current department, copy signature data
      // NOTE: Do NOT update priorityScore - it's computed at runtime
      await storage.updateFinalizedOrder(followupOrder.orderId, {
        status: 'FINALIZED',
        currentDepartment: 'P1 Production Queue',
        signatureData,
        signedAt: new Date(),
        // priorityScore: NOT SET - use computeEffectivePriority() for sorting
        prioritySource: currentOrder?.isManualUrgency ? 'urgency' : 'default',
        productionReadinessStatus
      });
      
      console.log(`🎯 Order ${followupOrder.orderId} finalized and in production queue with signature (priority computed at runtime, readiness: ${productionReadinessStatus})`);
      
      // Log audit event for customer signature
      try {
        await auditService.logEvent({
          entityType: 'p1_order',
          entityId: followupOrder.orderId,
          action: 'CUSTOMER_SIGNATURE',
          reason: 'Customer signed order confirmation',
          meta: {
            signedAt: new Date().toISOString(),
            movedToProduction: true,
            signedPdfAvailable: true,
          }
        });
        console.log(`📋 Audit event logged for customer signature on order ${followupOrder.orderId}`);
      } catch (auditError) {
        console.error('Failed to log audit event for signature:', auditError);
        // Don't fail the signature process if audit fails
      }
    } catch (finalizeError) {
      console.error('Error finalizing order:', finalizeError);
      throw new Error('Failed to finalize order after signature');
    }

    // Send confirmation email to customer
    console.log(`🔔 Attempting to send confirmation email for order ${followupOrder.orderId}...`);
    try {
      const order = await storage.getOrderById(followupOrder.orderId);
      const customer = await storage.getCustomerById(followupOrder.customerId);
      
      console.log(`🔍 Order retrieved: ${order ? 'Yes' : 'No'}, Customer retrieved: ${customer ? 'Yes' : 'No'}, Customer email: ${customer?.email || 'N/A'}`);
      
      if (order && customer && customer.email) {
        // Defensive date handling to avoid "Invalid Date" strings
        const formatDate = (date: any): string => {
          if (!date) return 'N/A';
          const parsed = new Date(date);
          return isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString();
        };

        const confirmationEmailData = {
          orderId: followupOrder.orderId,
          customerName: customer.name,
          customerEmail: customer.email,
          orderDate: formatDate(order.orderDate),
          dueDate: formatDate(order.dueDate),
        };

        const emailResult = await sendOrderSignedConfirmation(confirmationEmailData);
        
        if (emailResult.success) {
          console.log(`📧 Confirmation email sent to ${customer.email} for order ${followupOrder.orderId}`);
        } else {
          console.error(`❌ Failed to send confirmation email: ${emailResult.error}`);
        }
      } else {
        console.log(`⚠️ Skipping confirmation email - Order: ${order ? 'found' : 'missing'}, Customer: ${customer ? 'found' : 'missing'}, Email: ${customer?.email || 'missing'}`);
      }
    } catch (emailError) {
      console.error('Error sending confirmation email (non-critical):', emailError);
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

// POST /api/followup-orders/:orderId/resend-email - retired customer signature email resend endpoint
// SEMANTIC: This is a TRUE RESEND - same document, same snapshot, same publicSignatureId
// If the order has changed since the snapshot was created, this will REFUSE to resend
// Use sendUpdatedOrderForSignature instead for changed orders
router.post('/:orderId/resend-email', async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(`📧 [RESEND] Starting resend-email for order ${orderId}`);

    // Verify order exists first
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Allow only finalized orders on this retired compatibility path.
    const allowedStatuses = ['FINALIZED'];
    if (!allowedStatuses.includes(order.status?.toUpperCase() || '')) {
      return res.status(400).json({ 
        error: `Order status is ${order.status}. Can only resend email for finalized orders.`
      });
    }

    // Get customer details
    const customer = await storage.getCustomerById(order.customerId || '');
    if (!customer || !customer.email) {
      return res.status(400).json({ 
        error: 'Customer email not found. Cannot resend email.' 
      });
    }

    // SIGNATURE LINK CONTRACT: Get environment and check for cross-environment safety
    const { createSignatureLink, getCurrentEnvironment, logSignatureEmailSend } = await import('../../utils/magicLink');
    const currentEnv = getCurrentEnvironment();
    
    // INVARIANT: Resend REQUIRES an existing followup order with snapshot
    // If no followup order exists, the user should use sendUpdatedOrderForSignature
    const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
    
    if (!followupOrder) {
      console.log(`🚫 [RESEND-BLOCKED] No followup_order found for ${orderId} - cannot resend without existing document`);
      return res.status(400).json({
        error: 'No signature request exists for this order. Use "Send Updated Order for Signature" to create a new signature request.',
        code: 'NO_EXISTING_FOLLOWUP',
        action: 'send_updated_order',
      });
    }

    // INVARIANT: Cannot resend a superseded followup order
    if ((followupOrder as any).supersededAt) {
      console.log(`🚫 [RESEND-BLOCKED] Followup order for ${orderId} was superseded at ${(followupOrder as any).supersededAt}`);
      return res.status(400).json({
        error: 'This signature request has been superseded by a newer version. The customer should use the latest signature link.',
        code: 'FOLLOWUP_SUPERSEDED',
        supersededAt: (followupOrder as any).supersededAt,
      });
    }

    // INVARIANT: Cannot resend if order already signed - customer already approved this version
    if (followupOrder.signatureSigned) {
      console.log(`🚫 [RESEND-BLOCKED] Followup order for ${orderId} already signed at ${followupOrder.signedAt}`);
      return res.status(400).json({
        error: 'This order has already been signed by the customer. Resending is not needed.',
        code: 'ALREADY_SIGNED',
        signedAt: followupOrder.signedAt,
      });
    }

    // INVARIANT: Cannot resend without a stored snapshot
    if (!followupOrder.orderSnapshot) {
      console.log(`🚫 [RESEND-BLOCKED] No snapshot stored for ${orderId} - cannot resend without frozen data`);
      return res.status(400).json({
        error: 'No snapshot exists for this signature request. Use "Send Updated Order for Signature" to create a new signature request with current order data.',
        code: 'NO_SNAPSHOT',
        action: 'send_updated_order',
      });
    }

    // INVARIANT: Refuse to resend if order has changed since snapshot was created
    // This is the KEY semantic distinction - resend = same document
    const { hasChanged, changes } = await hasOrderChangedSinceSnapshot(orderId, followupOrder.orderSnapshot as any);
    if (hasChanged) {
      console.log(`🚫 [RESEND-BLOCKED] Order ${orderId} has changed since snapshot. Changes:`, changes);
      return res.status(400).json({
        error: 'The order has been modified since the signature request was created. Use "Send Updated Order for Signature" to send the updated order for new approval.',
        code: 'ORDER_CHANGED',
        action: 'send_updated_order',
        changes: changes,
      });
    }

    console.log(`✅ [RESEND] Order ${orderId} matches snapshot - proceeding with resend`);

    // SIGNATURE LINK CONTRACT: Token immutability - NEVER regenerate tokens
    // Check for cross-environment safety
    const orderEnv = (followupOrder as any).environment || 'dev';
    if (orderEnv !== currentEnv) {
      console.error(`🚨 [CROSS-ENV BLOCK] Order ${orderId} was created in ${orderEnv} but current environment is ${currentEnv}. Blocking email to prevent broken links.`);
      return res.status(400).json({
        error: `Cannot resend email: Order was created in ${orderEnv} environment but you are currently in ${currentEnv}. This would result in a broken signature link.`,
        orderEnvironment: orderEnv,
        currentEnvironment: currentEnv,
      });
    }
    
    console.log(`📋 [RESEND] Using existing immutable token for ${orderId} (token: ${followupOrder.signatureToken?.substring(0, 8)}...)`);
    
    // SAFETY CHECK: If existing order is missing publicSignatureId, generate one
    let currentFollowupOrder = followupOrder;
    if (!followupOrder.publicSignatureId) {
      console.log(`⚠️ Order ${orderId} missing publicSignatureId - generating one now`);
      const { generatePublicSignatureId } = await import('../../utils/magicLink');
      const newPublicId = generatePublicSignatureId();
      await storage.updateFollowupOrder(followupOrder.id, { publicSignatureId: newPublicId });
      currentFollowupOrder = { ...followupOrder, publicSignatureId: newPublicId };
      console.log(`✅ Generated publicSignatureId ${newPublicId} for order ${orderId}`);
    }

    // SIGNATURE LINK CONTRACT: Generate signature link using publicSignatureId with EXPLICIT environment from followup order
    // INVARIANT: Resend MUST use the environment the followup order was CREATED in
    const { validateSignatureLinkEnvironment } = await import('../../utils/magicLink');
    const followupOrderEnv = (currentFollowupOrder as any).environment as 'dev' | 'prod' || 'dev';
    
    // INVARIANT CHECK: Validate environment match before generating link
    validateSignatureLinkEnvironment((currentFollowupOrder as any).environment, followupOrderEnv, orderId);
    
    const signatureLink = createSignatureLink(currentFollowupOrder.publicSignatureId || '', followupOrderEnv);
    
    // SIGNATURE LINK CONTRACT: Forensic logging for every signature email send
    logSignatureEmailSend({
      orderId: orderId,
      signatureToken: currentFollowupOrder.signatureToken || '',
      publicSignatureId: currentFollowupOrder.publicSignatureId || '',
      environment: followupOrderEnv,
      context: 'resend',
      recipient: customer.email,
    });

    // RESEND uses the SAME snapshot as the original (never regenerates data)
    // All order data comes from the stored snapshot via the PDF service
    console.log('🔄 [RESEND] Regenerating PDF using STORED snapshot for data consistency');
    
    const pdfResult = await generateOrderPdf(orderId, PdfIntent.RESEND_EMAIL);
    const pdfPath = pdfResult.filePath!;

    // Update follow-up order with new PDF path
    await storage.updateFollowupOrder(followupOrder.id, {
      pdfPath,
      pdfGenerated: true,
      pdfGeneratedAt: new Date(),
    });

    // DEBUG: Log signature state before sending email
    console.log('📧 [RESEND-DEBUG] About to send email for order:', {
      orderId: order.orderId,
      signatureLink,
      signatureLinkLength: signatureLink?.length || 0,
      publicSignatureId: followupOrder.publicSignatureId,
      signatureToken: followupOrder.signatureToken?.substring(0, 8) + '...',
      signatureSigned: followupOrder.signatureSigned,
      signedAt: followupOrder.signedAt,
      pdfPath,
    });
    
    // INVARIANT: Email data comes from stored snapshot, NOT from live order
    // This ensures the email matches the PDF exactly
    const storedSnapshot = followupOrder.orderSnapshot as any;
    
    // Send email via unified notification function with forceResend=true (bypass deduplication)
    // Manual resends intentionally bypass deduplication since user explicitly requested it
    const emailResult = await sendOrderConfirmationNotification({
      orderId: storedSnapshot.orderId || order.orderId,
      customerId: storedSnapshot.customerId || order.customerId || '',
      customerEmail: storedSnapshot.customerEmail || customer.email,
      customerPhone: storedSnapshot.customerPhone || customer.phone,
      preferredCommunicationMethod: customer.preferredCommunicationMethod,
      signatureToken: currentFollowupOrder.signatureToken || '',
      publicSignatureId: currentFollowupOrder.publicSignatureId || '',
      pdfPath,
      context: 'resend', // Manual resend by user
      orderData: {
        orderId: storedSnapshot.orderId || order.orderId,
        customerName: storedSnapshot.customerName || customer.name,
        customerEmail: storedSnapshot.customerEmail || customer.email,
        orderDate: storedSnapshot.orderDate ? new Date(storedSnapshot.orderDate).toLocaleDateString() : new Date(order.orderDate).toLocaleDateString(),
        dueDate: storedSnapshot.dueDate ? new Date(storedSnapshot.dueDate).toLocaleDateString() : new Date(order.dueDate).toLocaleDateString(),
        customerPO: storedSnapshot.customerPO || order.customerPO || undefined,
        modelId: storedSnapshot.modelId || order.modelId || undefined,
        handedness: storedSnapshot.handedness || order.handedness || undefined,
        features: storedSnapshot.features || order.features as Record<string, any> || undefined,
        notes: storedSnapshot.notes || order.notes || undefined,
        shipping: storedSnapshot.shipping || order.shipping || 0,
        signatureLink,
      },
      forceResend: true, // MANUAL RESEND - bypass deduplication intentionally
    });

    // MANDATORY OUTCOME HANDLING: Every resend must have a recorded email outcome
    // Fail fast if we receive an unknown outcome
    const validOutcomes = ['sent', 'skipped', 'failed'] as const;
    if (!validOutcomes.includes(emailResult.outcome)) {
      console.error(`❌ [RESEND-FAIL] Unknown email outcome for ${order.orderId}: ${emailResult.outcome}`);
      return res.status(500).json({
        success: false,
        error: `Email resend failed: Unknown email outcome "${emailResult.outcome}"`,
      });
    }

    if (emailResult.outcome === 'sent') {
      // Update email sent timestamp and clear any previous error
      await storage.updateFollowupOrder(followupOrder.id, {
        emailSent: true,
        emailSentAt: new Date(),
        emailError: null,
      });

      res.json({
        success: true,
        message: 'Review and sign email has been resent successfully.',
        emailOutcome: 'sent',
        emailSent: true,
        messageId: emailResult.messageId,
      });
    } else if (emailResult.outcome === 'skipped') {
      // This shouldn't happen with forceResend=true, but handle it gracefully
      res.json({
        success: true,
        message: 'Email was skipped (deduplication).',
        emailOutcome: 'skipped',
        emailSent: false,
        skipped: true,
      });
    } else {
      // Email failed - record the error and return failure
      await storage.updateFollowupOrder(followupOrder.id, {
        emailError: emailResult.error,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to send email.',
        emailOutcome: 'failed',
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

// POST /api/followup-orders/:orderId/send-updated-order - Send an updated order for signature
// SEMANTIC: This creates a NEW signature request - new snapshot, new publicSignatureId, new followup_order
// Supersedes any existing unsigned followup order for this order
// Use this when order data has changed and customer must re-approve
router.post('/:orderId/send-updated-order', async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(`📧 [UPDATED-ORDER] Starting send-updated-order for order ${orderId}`);

    // Verify order exists first
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Allow only finalized orders on this retired compatibility path.
    const allowedStatuses = ['FINALIZED'];
    if (!allowedStatuses.includes(order.status?.toUpperCase() || '')) {
      return res.status(400).json({ 
        error: `Order status is ${order.status}. Can only send signature request for finalized orders.`
      });
    }

    // Get customer details
    const customer = await storage.getCustomerById(order.customerId || '');
    if (!customer || !customer.email) {
      return res.status(400).json({ 
        error: 'Customer email not found. Cannot send email.' 
      });
    }

    // Get environment for signature link
    const { getCurrentEnvironment, logSignatureEmailSend } = await import('../../utils/magicLink');
    const currentEnv = getCurrentEnvironment();

    // Check for existing unsigned followup order to supersede
    const existingFollowup = await storage.getFollowupOrderByOrderId(orderId);
    let supersededFollowupId: number | null = null;
    
    if (existingFollowup && !existingFollowup.signatureSigned && !(existingFollowup as any).supersededAt) {
      // Mark the existing unsigned followup as superseded
      console.log(`🔄 [UPDATED-ORDER] Superseding existing followup order ${existingFollowup.id} for ${orderId}`);
      await storage.updateFollowupOrder(existingFollowup.id, {
        supersededAt: new Date(),
        supersessionReason: 'order_updated',
      } as any);
      supersededFollowupId = existingFollowup.id;
      console.log(`✅ [UPDATED-ORDER] Marked followup ${existingFollowup.id} as superseded (reason: order_updated)`);
    } else if (existingFollowup?.signatureSigned) {
      console.log(`📋 [UPDATED-ORDER] Previous followup ${existingFollowup.id} was signed - creating new followup for updated order`);
    }

    // Create new signature token and public ID
    const signatureToken = nanoid(32);
    const newPublicSignatureId = generatePublicSignatureId();

    // Create new followup order with new tokens
    const newFollowupOrder = await storage.createFollowupOrder({
      orderId: order.orderId,
      customerId: order.customerId || '',
      customerEmail: customer.email,
      signatureToken,
      publicSignatureId: newPublicSignatureId,
      environment: currentEnv,
      pdfGenerated: false,
      emailSent: false,
    });

    // Update the superseded followup to reference the new one
    if (supersededFollowupId) {
      await storage.updateFollowupOrder(supersededFollowupId, {
        supersededBy: newFollowupOrder.id,
      } as any);
    }

    console.log(`✅ [UPDATED-ORDER] Created new followup order ${newFollowupOrder.id} with publicSignatureId ${newPublicSignatureId}`);

    // Generate PDF with SIGNATURE_EMAIL intent (creates new snapshot)
    console.log(`📸 [UPDATED-ORDER] Creating NEW snapshot for updated order ${orderId}`);
    const pdfResult = await generateOrderPdf(orderId, PdfIntent.SIGNATURE_EMAIL);
    const pdfPath = pdfResult.filePath!;

    // Store the new snapshot with the specific new followup order
    // CRITICAL: Use followup order ID, not order ID, to prevent overwriting other snapshots
    if (pdfResult.snapshot) {
      await storeOrderSnapshotById(newFollowupOrder.id, pdfResult.snapshot);
      console.log(`💾 [UPDATED-ORDER] Stored snapshot for followup order ${newFollowupOrder.id}`);
    }

    // Update follow-up order with PDF path
    await storage.updateFollowupOrder(newFollowupOrder.id, {
      pdfPath,
      pdfGenerated: true,
      pdfGeneratedAt: new Date(),
    });

    // Generate signature link with EXPLICIT environment (currentEnv for new followup order)
    const signatureLink = createSignatureLink(newPublicSignatureId, currentEnv);

    // Forensic logging
    logSignatureEmailSend({
      orderId: orderId,
      signatureToken: signatureToken,
      publicSignatureId: newPublicSignatureId,
      environment: currentEnv,
      context: 'updated_order',
      recipient: customer.email,
    });

    // Use snapshot data for email to ensure consistency with PDF
    const newSnapshot = pdfResult.snapshot as any;
    
    console.log('📧 [UPDATED-ORDER-DEBUG] About to send email for order:', {
      orderId: order.orderId,
      signatureLink,
      publicSignatureId: newPublicSignatureId,
      signatureToken: signatureToken.substring(0, 8) + '...',
      pdfPath,
      supersededFollowupId,
      hasSnapshot: !!newSnapshot,
    });

    // Send signature email using snapshot data for consistency
    const emailResult = await sendOrderConfirmationNotification({
      orderId: newSnapshot?.orderId || order.orderId,
      customerId: newSnapshot?.customerId || order.customerId || '',
      customerEmail: newSnapshot?.customerEmail || customer.email,
      customerPhone: newSnapshot?.customerPhone || customer.phone,
      preferredCommunicationMethod: customer.preferredCommunicationMethod,
      signatureToken: signatureToken,
      publicSignatureId: newPublicSignatureId,
      pdfPath,
      context: 'updated_order',
      orderData: {
        orderId: newSnapshot?.orderId || order.orderId,
        customerName: newSnapshot?.customerName || customer.name,
        customerEmail: newSnapshot?.customerEmail || customer.email,
        orderDate: newSnapshot?.orderDate ? new Date(newSnapshot.orderDate).toLocaleDateString() : new Date(order.orderDate).toLocaleDateString(),
        dueDate: newSnapshot?.dueDate ? new Date(newSnapshot.dueDate).toLocaleDateString() : new Date(order.dueDate).toLocaleDateString(),
        customerPO: newSnapshot?.customerPO || order.customerPO || undefined,
        modelId: newSnapshot?.modelId || order.modelId || undefined,
        handedness: newSnapshot?.handedness || order.handedness || undefined,
        features: newSnapshot?.features || order.features as Record<string, any> || undefined,
        notes: newSnapshot?.notes || order.notes || undefined,
        shipping: newSnapshot?.shipping || order.shipping || 0,
        signatureLink,
      },
      forceResend: true, // Always send for updated orders
    });

    // Handle email outcome
    const validOutcomes = ['sent', 'skipped', 'failed'] as const;
    if (!validOutcomes.includes(emailResult.outcome)) {
      console.error(`❌ [UPDATED-ORDER-FAIL] Unknown email outcome for ${order.orderId}: ${emailResult.outcome}`);
      return res.status(500).json({
        success: false,
        error: `Email send failed: Unknown email outcome "${emailResult.outcome}"`,
      });
    }

    if (emailResult.outcome === 'sent') {
      await storage.updateFollowupOrder(newFollowupOrder.id, {
        emailSent: true,
        emailSentAt: new Date(),
        emailError: null,
      });

      console.log(`✅ [UPDATED-ORDER] Successfully sent updated order email for ${orderId}`);

      res.json({
        success: true,
        message: 'Updated order has been sent for signature.',
        emailOutcome: 'sent',
        emailSent: true,
        messageId: emailResult.messageId,
        newFollowupOrderId: newFollowupOrder.id,
        supersededFollowupId: supersededFollowupId,
        newPublicSignatureId: newPublicSignatureId,
      });
    } else if (emailResult.outcome === 'skipped') {
      res.json({
        success: true,
        message: 'Email was skipped (deduplication).',
        emailOutcome: 'skipped',
        emailSent: false,
        newFollowupOrderId: newFollowupOrder.id,
      });
    } else {
      // Email failed - record the error but return success (email failure is a side-effect)
      // The followup order was created successfully - only notification failed
      await storage.updateFollowupOrder(newFollowupOrder.id, {
        emailError: emailResult.error,
      });

      console.log(`⚠️ [SEND-UPDATED] Order updated successfully but email failed: ${emailResult.error}`);
      res.json({
        success: true,
        message: 'Order updated successfully but email failed to send.',
        emailOutcome: 'failed',
        emailSent: false,
        emailError: emailResult.error,
        newFollowupOrderId: newFollowupOrder.id,
      });
    }
  } catch (error) {
    console.error('Error sending updated order for signature:', error);
    res.status(500).json({ 
      error: 'Failed to send updated order',
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Test route — not mounted in production
if (process.env.NODE_ENV !== 'production') {
  router.post('/test-reminder', async (req, res) => {
    try {
      console.log('🧪 Manual trigger: Running follow-up order reminder check...');
      
      const result = await sendReminderForOverdueOrders();
      
      res.json({
        success: true,
        message: `Reminder check completed. ${result.sent} reminder(s) sent.`,
        details: result,
      });
    } catch (error) {
      console.error('Error running reminder check:', error);
      res.status(500).json({ 
        error: 'Failed to run reminder check',
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });
}

export default router;
