import express from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertFollowupOrderSchema } from '../../schema';
import { generateSalesOrderPDF, embedSignatureInPDF } from '../../utils/pdf/salesOrderPdf';
import { sendFollowupOrderEmail } from '../../utils/followupOrderEmail';
import { sendOrderSignedConfirmation } from '../../utils/orderSignedConfirmation';
import { calculatePriorityScore } from '../../utils/priorityScore';
import { sendReminderForOverdueOrders } from '../../utils/followupOrderReminder';
import { auditService } from '../services/auditService';
import { authenticateToken } from '../../middleware/auth';
import { createMagicLink } from '../../utils/magicLink';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';

const router = express.Router();

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

    // Generate unique signature token
    const signatureToken = nanoid(32);

    // Generate signature link using unified URL resolution
    const signatureLink = createMagicLink(signatureToken);

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
    console.log(`📝 Sign request received for followup order ID: ${id}`);
    
    if (isNaN(id)) {
      console.log(`❌ Invalid followup order ID: ${req.params.id}`);
      return res.status(400).json({ error: 'Invalid followup order ID' });
    }

    const { signatureData, signatureToken } = req.body;
    if (!signatureData) {
      console.log(`❌ Missing signature data for order ID: ${id}`);
      return res.status(400).json({ error: 'Signature data is required' });
    }

    // Normalize undefined/token mismatch cases
    if (!signatureToken) {
      console.log(`❌ Missing signature token for order ID: ${id}`);
      return res.status(400).json({ error: 'Missing signature token' });
    }

    const followupOrder = await storage.getFollowupOrder(id);
    if (!followupOrder) {
      console.log(`❌ Followup order not found for ID: ${id}`);
      return res.status(404).json({ error: 'Followup order not found' });
    }

    console.log(`📋 Found followup order: ${followupOrder.orderId}, pdfPath: ${followupOrder.pdfPath || 'MISSING'}`);

    // Support both new (`?token=`) and old (`:token`) formats by trimming whitespace
    if (!followupOrder.signatureToken || followupOrder.signatureToken.trim() !== signatureToken.trim()) {
      console.log(`❌ Token mismatch for order ${followupOrder.orderId}. Expected: ${followupOrder.signatureToken?.substring(0, 8)}..., Got: ${signatureToken?.substring(0, 8)}...`);
      return res.status(403).json({ error: 'Invalid or expired signing link token' });
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

    // Update order status from PENDING_SIGNATURE to FINALIZED and move to production queue
    console.log(`✅ Customer signed order ${followupOrder.orderId} - finalizing and moving to production...`);
    
    try {
      // Get current order to access features for priority calculation
      const currentOrder = await storage.getOrderById(followupOrder.orderId);
      
      // Calculate priority score based on rush fees and urgency
      const priorityScore = calculatePriorityScore(
        currentOrder?.features,
        currentOrder?.urgency,
        currentOrder?.isManualUrgency
      );
      
      console.log(`📊 Calculated priority score for order ${followupOrder.orderId}: ${priorityScore}`);
      
      // Update the order status to FINALIZED, set current department, copy signature data, and set priority
      await storage.updateFinalizedOrder(followupOrder.orderId, {
        status: 'FINALIZED',
        currentDepartment: 'P1 Production Queue',
        signatureData,
        signedAt: new Date(),
        priorityScore
      });
      
      console.log(`🎯 Order ${followupOrder.orderId} finalized and in production queue with signature (priority: ${priorityScore})`);
      
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

// POST /api/followup-orders/:orderId/resend-email - Resend signature email for PENDING_SIGNATURE orders
router.post('/:orderId/resend-email', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Verify order exists first
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Allow resending for both PENDING_SIGNATURE and FINALIZED orders
    const allowedStatuses = ['PENDING_SIGNATURE', 'FINALIZED'];
    if (!allowedStatuses.includes(order.status?.toUpperCase() || '')) {
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

    // Get or create the follow-up order
    let followupOrder = await storage.getFollowupOrderByOrderId(orderId);
    
    // Always generate a FRESH signature token when resending to ensure the link works
    // Use nanoid(32) to match the original token format used in Create Order flow
    const newSignatureToken = nanoid(32);
    
    if (!followupOrder) {
      console.log(`⚠️ No followup_order found for ${orderId} - creating one automatically`);
      
      // Create followup order entry with new token
      followupOrder = await storage.createFollowupOrder({
        orderId: order.orderId,
        customerId: order.customerId || '',
        customerEmail: customer.email,
        signatureToken: newSignatureToken,
        pdfGenerated: false, // Will be generated below
        emailSent: false,
      });
      
      console.log(`✅ Created followup_order for ${orderId} with fresh token ${newSignatureToken.substring(0, 8)}...`);
    } else {
      // Update existing followup order with fresh token
      console.log(`🔄 Updating followup_order for ${orderId} with fresh signature token`);
      
      const updateData: any = {
        signatureToken: newSignatureToken,
      };

      // ONLY reset signature state if the order is NOT already signed
      // This preserves signature data for already-signed orders
      if (!followupOrder.signatureSigned) {
        updateData.signatureData = null;
        updateData.signedAt = null;
        updateData.signedPdfPath = null;
      } else {
        console.log(`📋 Order ${orderId} already signed - preserving signature data`);
      }

      // NEVER reset signatureSigned once true
      followupOrder = await storage.updateFollowupOrder(
        followupOrder.id,
        updateData
      );
      
      console.log(`✅ Updated followup_order with fresh token ${newSignatureToken.substring(0, 8)}...`);
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

    // Generate signature link using the fresh token with unified URL resolution
    const signatureLink = createMagicLink(followupOrder.signatureToken || '');

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
          console.log(`📄 [Followup Resend] Discount found: ${order.discountCode} -> ${calculatedDiscountType} ${calculatedDiscountValue}`);
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
      featureQuantities: order.featureQuantities as Record<string, number> || undefined,
      miscItems: miscItems.length > 0 ? miscItems : undefined,
      notes: order.notes || undefined,
      shipping: order.shipping || 0,
      paymentStatus: 'PENDING' as const,
      discountCode: order.discountCode || undefined,
      discountDisplayName: discountDisplayName || undefined,
      discountAppliesTo: discountAppliesTo || undefined,
      customDiscountType: calculatedDiscountType || order.customDiscountType || undefined,
      customDiscountValue: calculatedDiscountValue || order.customDiscountValue || undefined,
      showCustomDiscount: shouldShowDiscount || order.showCustomDiscount || undefined,
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

    // Send the SAME email that was originally sent (Review and Sign with PDF)
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

// POST /api/followup-orders/test-reminder - Manually trigger the 5-day reminder check
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

// GET /api/followup-orders/signed-pdf/:orderId - Download signed PDF for an order (requires authentication)
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

    console.log(`📄 Regenerating base PDF for order ${orderId}...`);
    
    // Generate the base PDF (with signature box)
    const basePdfBuffer = await generateSalesOrderPDF(orderData, true);
    
    // Write the base PDF to a temp file so we can embed signature
    const tempPdfFilename = `temp_sales_order_${orderId}_${Date.now()}.pdf`;
    const tempPdfPath = path.join(uploadsDir, tempPdfFilename);
    fs.writeFileSync(tempPdfPath, basePdfBuffer);
    
    console.log(`✍️ Embedding signature into PDF for order ${orderId}...`);
    
    // Embed the stored signature into the PDF
    const signedPdfBuffer = await embedSignatureInPDF(tempPdfPath, followupOrder.signatureData);
    
    // Clean up temp file
    if (fs.existsSync(tempPdfPath)) {
      fs.unlinkSync(tempPdfPath);
    }
    
    // Save the regenerated signed PDF
    const signedPdfFilename = `signed_sales_order_${orderId}_${Date.now()}.pdf`;
    const signedPdfPath = path.join(uploadsDir, signedPdfFilename);
    fs.writeFileSync(signedPdfPath, signedPdfBuffer);
    
    // Update the followup order with the new signed PDF path
    await storage.updateFollowupOrder(followupOrder.id, {
      signedPdfPath,
    });
    
    console.log(`✅ Regenerated signed PDF for order ${orderId} at ${signedPdfPath}`);
    
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

// GET /api/followup-orders/signature-info/:orderId - Get signature info for an order (requires authentication)
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

export default router;
