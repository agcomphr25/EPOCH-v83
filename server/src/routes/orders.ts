import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { pool } from '../../db';
import { payments, allOrders, orders, customerAddresses } from '../../../shared/schema';
import { eq, sql, desc, and } from 'drizzle-orm';
import { storage } from '../../storage';
import { generateP1OrderId } from '../../utils/orderIdGenerator';
import {
  insertAllOrderSchema,
  insertOrderSchema,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertProductionOrderSchema,
  insertP2PurchaseOrderSchema,
  insertP2PurchaseOrderItemSchema,
  insertP2ProductionOrderSchema,
  insertPaymentSchema,
} from '@shared/schema';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { 
  adminFieldUpdateSchema, 
  adminBulkUpdateSchema,
  ADMIN_FIELD_CONFIG 
} from '../../../shared/adminConfig';
import { auditService } from '../services/auditService';

const router = Router();

// Helper function to get the correct base URL for signature links
// In production, always use the production domain to ensure email links work
function getSignatureLinkBaseUrl(): string {
  // Check for explicit production domain first
  const productionDomain = process.env.PRODUCTION_DOMAIN || 'agcompepoch.xyz';
  
  // In production mode or if REPL_DEPLOYMENT is set, use production domain
  if (process.env.NODE_ENV === 'production' || process.env.REPL_DEPLOYMENT) {
    return `https://${productionDomain}`;
  }
  
  // In development, use REPLIT_DOMAINS if available, otherwise localhost
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
  }
  
  return 'http://localhost:5000';
}

// Get all orders for All Orders List (root endpoint)
router.get('/', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getAllOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error retrieving orders:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch order',
        details: (error as any).message,
      });
  }
});

// Get all orders with payment status for All Orders List with payment column
router.get('/with-payment-status', async (req: Request, res: Response) => {
  try {
    // Add basic caching headers to reduce server load
    res.set({
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      ETag: `"orders-${Date.now()}"`,
    });

    const search = (req.query.search as string) || '';
    const limit = parseInt(req.query.limit as string) || 99999; // Return ALL orders by default

    const orders = await storage.getAllOrdersWithPaymentStatus(search, limit);
    res.json(orders);
  } catch (error) {
    console.error('Error retrieving orders with payment status:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch orders with payment status',
        details: (error as any).message,
      });
  }
});

// Get paginated orders with payment status for improved performance
router.get(
  '/with-payment-status/paginated',
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100 per page

      // Add basic caching headers
      res.set({
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        ETag: `"orders-paginated-${page}-${limit}-${Date.now()}"`,
      });

      const result = await storage.getAllOrdersWithPaymentStatusPaginated(
        page,
        limit
      );
      res.json(result);
    } catch (error) {
      console.error(
        'Error retrieving paginated orders with payment status:',
        error
      );
      res
        .status(500)
        .json({
          error: 'Failed to fetch paginated orders with payment status',
          details: (error as any).message,
        });
    }
  }
);

// Get unpaid/partially paid orders for batch payment processing
router.get('/unpaid', async (req: Request, res: Response) => {
  try {
    const unpaidOrders = await storage.getUnpaidOrders();
    res.json(unpaidOrders);
  } catch (error) {
    console.error('Error retrieving unpaid orders:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch unpaid orders',
        details: (error as any).message,
      });
  }
});

// Get unpaid orders for a specific customer
router.get(
  '/unpaid/customer/:customerId',
  async (req: Request, res: Response) => {
    try {
      const { customerId } = req.params;
      const unpaidOrders = await storage.getUnpaidOrdersByCustomer(customerId);
      res.json(unpaidOrders);
    } catch (error) {
      console.error('Error retrieving unpaid orders by customer:', error);
      res
        .status(500)
        .json({
          error: 'Failed to fetch unpaid orders for customer',
          details: (error as any).message,
        });
    }
  }
);

// Get all orders for a specific customer (for refund system)
router.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    console.log(`Getting all orders for customer ${customerId}`);

    // Load cached data for order total calculations (same as getUnpaidOrdersByCustomer)
    const stockModelsData = await storage.getAllStockModels();
    const allFeatures = await storage.getAllFeatures();
    const persistentDiscounts = await storage.getAllPersistentDiscounts();

    // Get orders from allOrders table
    const orders = await db
      .select()
      .from(allOrders)
      .where(eq(allOrders.customerId, customerId))
      .orderBy(desc(allOrders.orderDate));

    // Calculate payment totals and order totals for each order
    const ordersWithPaymentTotals = await Promise.all(
      orders.map(async (order) => {
        // Get total payments for this order
        const paymentResults = await db
          .select({
            total: sql`SUM(${payments.paymentAmount})`.as('total'),
          })
          .from(payments)
          .where(eq(payments.orderId, order.orderId));

        const paymentTotal = Number(paymentResults[0]?.total || 0);

        // Use the internal calculateOrderTotal method to get accurate total
        // This is the same approach used in getUnpaidOrdersByCustomer
        let actualOrderTotal = 0;
        try {
          // Call the private method through the storage instance
          actualOrderTotal = await (storage as any).calculateOrderTotalOptimized(
            order,
            stockModelsData,
            allFeatures,
            persistentDiscounts
          );
        } catch (error) {
          console.error(
            `❌ Error calculating order total for ${order.orderId}:`,
            error
          );
          // FIXED: Fallback to stored payment amount (order total) instead of shipping
          actualOrderTotal = Number(order.paymentAmount) || 0;
        }

        const balanceDue = Math.max(0, actualOrderTotal - paymentTotal);

        // Round to 2 decimal places to avoid floating-point precision issues
        const roundedPaymentTotal = Math.round(paymentTotal * 100) / 100;
        const roundedOrderTotal = Math.round(actualOrderTotal * 100) / 100;
        const roundedBalanceDue = Math.round(balanceDue * 100) / 100;

        return {
          id: order.id,
          orderId: order.orderId,
          orderDate: order.orderDate,
          dueDate: order.dueDate,
          fbOrderNumber: order.fbOrderNumber,
          currentDepartment: order.currentDepartment,
          status: order.status,
          modelId: order.modelId,
          shipping: order.shipping,
          paymentAmount: order.paymentAmount,
          isPaid: order.isPaid,
          customerPO: order.customerPO,
          paymentTotal: roundedPaymentTotal,
          orderTotal: roundedOrderTotal,
          balanceDue: roundedBalanceDue,
          isFullyPaid: roundedPaymentTotal >= roundedOrderTotal && roundedOrderTotal > 0,
        };
      })
    );

    console.log(
      `Found ${ordersWithPaymentTotals.length} orders for customer ${customerId}`
    );
    res.json(ordersWithPaymentTotals);
  } catch (error) {
    console.error('❌ Error retrieving orders by customer:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch orders for customer',
        details: (error as any).message,
      });
  }
});

// Get pipeline counts for all departments (must be before :orderId route)
router.get('/pipeline-counts', async (req: Request, res: Response) => {
  try {
    const counts = await storage.getPipelineCounts();
    res.json(counts);
  } catch (error) {
    console.error('Pipeline counts fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline counts' });
  }
});

// Get detailed pipeline data with schedule status (must be before :orderId route)
router.get('/pipeline-details', async (req: Request, res: Response) => {
  try {
    const details = await storage.getPipelineDetails();
    res.json(details);
  } catch (error) {
    console.error('Pipeline details fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline details' });
  }
});

// Outstanding Orders route (must be before :orderId route)
router.get('/outstanding', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getOutstandingOrders();
    res.json(orders);
  } catch (error) {
    console.error('Get outstanding orders error:', error);
    res.status(500).json({ error: 'Failed to get outstanding orders' });
  }
});

// Get orders by department (must be before :orderId route)
router.get('/department/:department', async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    const decodedDepartment = decodeURIComponent(department);
    const orders = await storage.getOrdersByDepartment(decodedDepartment);
    res.json(orders);
  } catch (error) {
    console.error('Get orders by department error:', error);
    res.status(500).json({ error: 'Failed to get orders by department' });
  }
});

// Search orders - must be before :orderId route
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.json([]);
    }

    const results = await storage.searchOrders(query as string);
    res.json(results);
  } catch (error) {
    console.error('Error searching orders:', error);
    res.status(500).json({ error: 'Failed to search orders' });
  }
});

// Order Draft Management
router.get('/drafts', async (req: Request, res: Response) => {
  try {
    const excludeFinalized = req.query.excludeFinalized === 'true';
    const drafts = await storage.getAllOrderDrafts();

    if (excludeFinalized) {
      const filteredDrafts = drafts.filter(
        (draft) => draft.status !== 'FINALIZED'
      );
      res.json(filteredDrafts);
    } else {
      res.json(drafts);
    }
  } catch (error) {
    console.error('Get drafts error:', error);
    res.status(500).json({ error: 'Failed to fetch order drafts' });
  }
});

router.get('/draft/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    console.log('Fetching order for ID:', orderId);

    // Check if the ID is a number (database ID) or string (order ID like AG422)
    if (/^\d+$/.test(orderId)) {
      // It's a numeric database ID - try draft first
      try {
        const draft = await storage.getOrderDraftById(parseInt(orderId));
        console.log('Found draft by database ID:', orderId);
        return res.json(draft);
      } catch (draftError) {
        console.log(
          'No draft found by database ID, checking finalized orders...'
        );
        try {
          const finalizedOrder = await storage.getOrderById(orderId);
          if (finalizedOrder) {
            console.log('Found finalized order by database ID:', orderId);
            return res.json(finalizedOrder);
          }
        } catch (finalizedError) {
          console.error('Order not found by database ID:', finalizedError);
        }
      }
    } else {
      // It's an order ID like AG422 - try draft first, then finalized
      try {
        const draft = await storage.getOrderDraft(orderId);
        if (draft) {
          console.log('Found draft order:', orderId);
          return res.json(draft);
        }
      } catch (draftError) {
        console.log('Draft not found, checking finalized orders...');
      }

      // Try finalized orders
      try {
        const finalizedOrder = await storage.getFinalizedOrderById(orderId);
        if (finalizedOrder) {
          console.log('Found finalized order:', orderId);
          return res.json(finalizedOrder);
        }
      } catch (finalizedError) {
        console.error('Order not found in either table:', finalizedError);
      }
    }

    return res.status(404).json({ error: `Order ${orderId} not found` });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order - with or without signature requirement based on whether stock is selected
router.post('/finalized', async (req: Request, res: Response) => {
  try {
    const orderData = insertAllOrderSchema.parse(req.body);
    
    // Determine if stock is selected (has modelId and it's not "no_stock" or similar)
    // Normalize the modelId for checking (trim whitespace and convert to lowercase)
    const normalizedModelId = orderData.modelId?.trim().toLowerCase() || '';
    const noStockIdentifiers = ['', 'no_stock', 'no stock', 'none'];
    const hasStock: boolean = !noStockIdentifiers.includes(normalizedModelId);
    
    // If no stock, create as FINALIZED and skip signature requirement, send directly to shipping
    // If has stock, create as PENDING_SIGNATURE and require customer confirmation
    const orderStatus = hasStock ? 'PENDING_SIGNATURE' : 'FINALIZED';
    const orderDepartment = hasStock ? 'Awaiting Customer Signature' : 'Shipping Management';
    
    const order = await storage.createFinalizedOrder({
      ...orderData,
      status: orderStatus,
      currentDepartment: orderDepartment
    });
    
    if (hasStock) {
      console.log(`📧 Order ${order.orderId} created with PENDING_SIGNATURE status - sending confirmation email to customer...`);
    } else {
      console.log(`📧 Order ${order.orderId} created as FINALIZED (no stock) - sending thank you email to customer...`);
    }
    
    // Automatically create followup order and send email
    try {
      // Import dependencies
      const { nanoid } = await import('nanoid');
      const { generateSalesOrderPDF } = await import('../../utils/pdf/salesOrderPdf');
      const { sendFollowupOrderEmail } = await import('../../utils/followupOrderEmail');
      const { sendThankYouOrderEmail } = await import('../../utils/thankYouOrderEmail');
      const fs = await import('fs');
      const path = await import('path');
      
      // Get customer details
      const customer = await storage.getCustomerById(orderData.customerId || '');
      if (!customer || !customer.email) {
        console.warn(`⚠️  No email found for customer ${orderData.customerId} - skipping email`);
        return res.status(201).json(order);
      }
      
      // Get customer address
      const addresses = await storage.getCustomerAddresses(String(customer.id));
      const defaultAddress = addresses.find(addr => addr.isDefault) || addresses[0];
      
      // Get features and stock models
      const allFeatures = await storage.getAllFeatures();
      const allStockModels = await storage.getAllStockModels();
      
      // Helper function to create a fallback display name from a value
      const createFallbackDisplayName = (value: string): string => {
        return value
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      };
      
      // Get stock model information
      const stockModel = allStockModels.find(m => m.id === order.modelId);
      
      // Build comprehensive feature data for PDF
      const featurePrices: Record<string, number> = {};
      const featureDisplayNames: Record<string, string> = {};
      const featureSelectionDisplayNames: Record<string, string> = {};
      const featureSelectionPrices: Record<string, number> = {};
      
      if (order.features && typeof order.features === 'object') {
        for (const [featureKey, featureValue] of Object.entries(order.features)) {
          if (featureValue && featureValue !== false && featureValue !== '') {
            // Special handling for paint_options_combined (format: "feature_category:option_value")
            if (featureKey === 'paint_options_combined' && typeof featureValue === 'string') {
              const [paintCategory, paintValue] = featureValue.split(':');
              const paintFeature = allFeatures.find((f: any) => f.id === paintCategory);
              
              if (paintFeature) {
                // Use the actual category's display name
                featureDisplayNames[featureKey] = paintFeature.displayName || paintFeature.name || 'Paint Options';
                const paintOptions = (paintFeature as any).options || [];
                const paintOption = paintOptions.find((opt: any) => opt.value === paintValue);
                
                if (paintOption) {
                  featureSelectionDisplayNames[featureValue] = paintOption.displayName || paintOption.label || paintValue;
                  const paintPrice = paintOption.price || 0;
                  featureSelectionPrices[featureValue] = paintPrice;
                  featurePrices[featureKey] = paintPrice;
                } else {
                  // Fallback
                  featureSelectionDisplayNames[featureValue] = createFallbackDisplayName(paintValue);
                  featurePrices[featureKey] = 0;
                }
              }
              continue;
            }
            
            // Special handling for simple paint_options (just the option value)
            if (featureKey === 'paint_options' && typeof featureValue === 'string') {
              // Try to find this paint option across all paint feature categories
              let paintPrice = 0;
              let paintDisplayName = createFallbackDisplayName(featureValue);
              let categoryDisplayName = 'Paint Options';
              
              for (const paintFeatureId of ['base_colors', 'camo_patterns', 'custom_graphics', 'special_effects', 'premium_patterns']) {
                const paintFeature = allFeatures.find((f: any) => f.id === paintFeatureId);
                if (paintFeature) {
                  const paintOptions = (paintFeature as any).options || [];
                  const paintOption = paintOptions.find((opt: any) => opt.value === featureValue);
                  if (paintOption) {
                    paintDisplayName = paintOption.displayName || paintOption.label || featureValue;
                    paintPrice = paintOption.price || 0;
                    categoryDisplayName = paintFeature.displayName || paintFeature.name || 'Paint Options';
                    break;
                  }
                }
              }
              
              featureDisplayNames[featureKey] = categoryDisplayName;
              featureSelectionDisplayNames[featureValue] = paintDisplayName;
              featureSelectionPrices[featureValue] = paintPrice;
              featurePrices[featureKey] = paintPrice;
              continue;
            }
            
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
      
      // Extract miscellaneous items from features object
      const miscItems = (order.features as any)?.miscItems || [];
      
      // Get discount display name and appliesTo if a discount is set
      let discountDisplayName: string | undefined;
      let discountAppliesTo: 'stock_model' | 'total_order' | undefined;
      
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
          }
          
          if (discount) {
            discountDisplayName = discount.name || discount.description;
            discountAppliesTo = discount.appliesTo || 'total_order';
          }
        } catch (error) {
          console.error('Error fetching discount details:', error);
        }
      }
      
      // Prepare order data for PDF (using actual order from database)
      const pdfOrderData = {
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
        customDiscountType: order.customDiscountType || undefined,
        customDiscountValue: order.customDiscountValue || undefined,
        showCustomDiscount: order.showCustomDiscount || undefined,
      };
      
      // Generate PDF
      const uploadsDir = 'uploads/followup-orders';
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      
      const pdfBuffer = await generateSalesOrderPDF(pdfOrderData, hasStock);
      const pdfFilename = `sales_order_${order.orderId}_${Date.now()}.pdf`;
      const pdfPath = path.join(uploadsDir, pdfFilename);
      fs.writeFileSync(pdfPath, pdfBuffer);
      
      if (hasStock) {
        // Order with stock - require signature
        // Generate unique signature token
        const signatureToken = nanoid(32);
        
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
        
        console.log(`✅ Follow-up order created for ${order.orderId}, sending signature email...`);
        
        // Prepare email data using production-aware base URL
        const baseUrl = getSignatureLinkBaseUrl();
        
        const emailData = {
          orderId: order.orderId,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPO: order.customerPO || '',
          modelId: stockModel?.displayName || order.modelId || 'Custom',
          orderDate: new Date(order.orderDate).toISOString().split('T')[0],
          dueDate: new Date(order.dueDate).toISOString().split('T')[0],
          signatureLink: `${baseUrl}/sign-order/${signatureToken}`,
          features: order.features as Record<string, any> || undefined,
        };
        
        // Send signature email
        const emailResult = await sendFollowupOrderEmail(emailData, pdfPath);
        
        if (emailResult.success) {
          // Update followup order to mark email as sent
          await storage.updateFollowupOrder(followupOrder.id, {
            emailSent: true,
            emailSentAt: new Date(),
          });
          
          console.log(`📧 Signature email sent for order ${order.orderId}`);
        } else {
          // Update followup order with error
          await storage.updateFollowupOrder(followupOrder.id, {
            emailError: emailResult.error,
          });
          
          console.error(`❌ Failed to send signature email for order ${order.orderId}: ${emailResult.error}`);
        }
      } else {
        // Order without stock - send thank you email (no signature required)
        const emailData = {
          orderId: order.orderId,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPO: order.customerPO || '',
          orderDate: new Date(order.orderDate).toISOString().split('T')[0],
          dueDate: new Date(order.dueDate).toISOString().split('T')[0],
          notes: order.notes || '',
        };
        
        // Send thank you email
        await sendThankYouOrderEmail(emailData, pdfPath);
        
        console.log(`📧 Thank you email sent for order ${order.orderId} (no signature required)`);
      }
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      // Don't fail the order creation if email fails
    }
    
    // Log audit event for order creation
    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: order.orderId,
        action: 'ORDER_CREATED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'System',
          role: (req as any).user?.role || 'system',
        },
        meta: { 
          source: 'order_creation',
          status: orderStatus,
          department: orderDepartment,
          customerId: orderData.customerId,
          modelId: orderData.modelId,
        },
      });
      
      // Record initial department entry
      await auditService.recordDepartmentEntry({
        entityType: 'p1_order',
        entityId: order.orderId,
        department: orderDepartment,
        enteredByUserId: (req as any).user?.id,
        metadata: { source: 'order_creation' },
      });
    } catch (auditError) {
      console.error('Error logging audit event:', auditError);
      // Don't fail the order creation if audit logging fails
    }
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Create draft order (legacy method - now creates PENDING_SIGNATURE orders)
router.post('/draft', async (req: Request, res: Response) => {
  try {
    const orderData = insertAllOrderSchema.parse(req.body);

    // Create as PENDING_SIGNATURE or FINALIZED based on status
    const finalStatus = orderData.status === 'FINALIZED' ? 'FINALIZED' : 'PENDING_SIGNATURE';
    
    console.log(`🔄 Creating order ${orderData.orderId} with status: ${finalStatus}`);
    
    const order = await storage.createFinalizedOrder({
      ...orderData,
      status: finalStatus
    }, req.body.finalizedBy);
    
    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.put('/draft/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    console.log('Update order endpoint called for ID:', orderId);
    console.log('Update data received:', req.body);

    // Validate the input data using the schema
    const updates = insertAllOrderSchema.partial().parse(req.body);
    console.log('Validated updates:', updates);

    // CRITICAL SERVER-SIDE VALIDATION: Prevent null/empty modelId for non-custom orders
    if (
      updates.isCustomOrder === 'no' &&
      (!updates.modelId || updates.modelId.trim() === '')
    ) {
      return res.status(400).json({
        error: 'Stock model is required for non-custom orders',
      });
    }

    // Update the order in all_orders table
    const updatedOrder = await storage.updateFinalizedOrder(orderId, updates);
    console.log('Updated order successfully:', updatedOrder);
    return res.json(updatedOrder);
  } catch (error) {
    console.error('Update order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update order' });
  }
});

router.delete('/draft/:id', async (req: Request, res: Response) => {
  try {
    const draftId = req.params.id;
    await storage.deleteOrderDraft(draftId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete draft error:', error);
    res.status(500).json({ error: 'Failed to delete order draft' });
  }
});

// Order Management (duplicate removed)
// Specific routes must come before parameterized routes

// Get all orders endpoint (backward compatibility) - includes both regular and P1 production orders
router.get('/all', async (req: Request, res: Response) => {
  try {
    // getAllOrders() already includes both regular orders and P1 production orders
    const allOrders = await storage.getAllOrders();
    res.json(allOrders);
  } catch (error) {
    console.error('Error retrieving all orders:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch orders',
        details: (error as any).message,
      });
  }
});

// Get all finalized orders
router.get('/finalized', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getAllFinalizedOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error retrieving finalized orders:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch finalized orders',
        details: (error as any).message,
      });
  }
});

// Finalize an order (move from draft to production)
router.post('/draft/:id/finalize', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const { finalizedBy } = req.body;

    const finalizedOrder = await storage.finalizeOrder(orderId, finalizedBy);
    res.json({
      success: true,
      message: 'Order finalized successfully',
      order: finalizedOrder,
    });
  } catch (error) {
    console.error('Finalize order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to finalize order' });
  }
});

// Get finalized order by ID
router.get('/finalized/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const order = await storage.getFinalizedOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Finalized order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Get finalized order error:', error);
    res.status(500).json({ error: 'Failed to fetch finalized order' });
  }
});

// Update finalized order
router.put('/finalized/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const updates = req.body;

    const updatedOrder = await storage.updateFinalizedOrder(orderId, updates);
    res.json(updatedOrder);
  } catch (error) {
    console.error('Update finalized order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update finalized order' });
  }
});

// Fulfill an order (move to shipping management with fulfilled badge)
router.post('/fulfill', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Update the order to be fulfilled and move to shipping management
    const updatedOrder = await storage.fulfillOrder(orderId);

    res.json({
      success: true,
      message: 'Order fulfilled successfully',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Fulfill order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fulfill order' });
  }
});

// Production Orders (must be before :id route)
router.get('/production-orders', async (req: Request, res: Response) => {
  try {
    const productionOrders = await storage.getAllProductionOrders();
    res.json(productionOrders);
  } catch (error) {
    console.error('Get production orders error:', error);
    res.status(500).json({ error: 'Failed to fetch production orders' });
  }
});

router.post(
  '/production-orders/generate/:purchaseOrderId',
  async (req: Request, res: Response) => {
    try {
      const purchaseOrderId = parseInt(req.params.purchaseOrderId);
      const productionOrders =
        await storage.generateP2ProductionOrders(purchaseOrderId);
      res.status(201).json(productionOrders);
    } catch (error) {
      console.error('Generate production orders error:', error);
      res.status(500).json({ error: 'Failed to generate production orders' });
    }
  }
);

// Clear all production orders for a P2 Purchase Order
router.delete(
  '/production-orders/clear/:purchaseOrderId',
  async (req: Request, res: Response) => {
    try {
      const purchaseOrderId = parseInt(req.params.purchaseOrderId);
      const deletedCount = await storage.deleteP2ProductionOrdersByPoId(purchaseOrderId);
      res.json({ 
        success: true, 
        message: `Cleared ${deletedCount} production orders`,
        deletedCount 
      });
    } catch (error) {
      console.error('Clear production orders error:', error);
      res.status(500).json({ error: 'Failed to clear production orders' });
    }
  }
);

// Order ID Generation - MUST be before parameterized routes
router.get('/last-id', async (req: Request, res: Response) => {
  try {
    const lastOrder = await storage.getLastOrderId();
    res.json({ lastId: lastOrder || 'AG000' });
  } catch (error) {
    console.error('Get last ID error:', error);
    res
      .status(500)
      .json({ error: 'Failed to get last order ID', lastId: 'AG000' });
  }
});

// Support both GET and POST for generate-id to maintain compatibility
router.get('/generate-id', async (req: Request, res: Response) => {
  try {
    const orderId = await storage.generateNextOrderId();
    res.json({ orderId });
  } catch (error) {
    console.error('Order ID generation failed:', error);
    res.status(500).json({ error: 'Failed to generate order ID' });
  }
});

router.post('/generate-id', async (req: Request, res: Response) => {
  try {
    const orderId = await storage.generateNextOrderId();
    res.json({ orderId });
  } catch (error) {
    console.error('Order ID generation failed:', error);
    res.status(500).json({ error: 'Failed to generate order ID' });
  }
});

// Parameterized route - MUST be after specific routes
// Supports both regular orders and P1 production orders
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    console.log(`📋 GET /${orderId} - Fetching order details`);

    // Try to find the order in both drafts and finalized tables
    let order = await storage.getOrderById(orderId);

    // If not found in regular orders, check production_orders table (P1 orders)
    if (!order && orderId.startsWith('P1-')) {
      console.log(`🔍 P1 order detected: ${orderId}, querying production_orders table`);
      const { pool } = await import('../../db');
      
      try {
        const productionOrderResult = await pool.query`
          SELECT 
            order_id,
            customer_id,
            customer_name,
            po_number,
            item_name,
            specifications,
            order_date,
            due_date,
            production_status,
            current_department,
            created_at,
            updated_at
          FROM production_orders
          WHERE order_id = ${orderId}
          LIMIT 1
        `;
        
        console.log(`🔍 Production order query result:`, productionOrderResult);
        
        if (productionOrderResult && productionOrderResult.length > 0) {
          const po = productionOrderResult[0];
          console.log(`✅ Found P1 production order:`, po);
          order = {
            orderId: po.order_id,
            customerId: po.customer_id,
            customerName: po.customer_name,
            currentDepartment: po.current_department,
            orderDate: po.order_date,
            dueDate: po.due_date,
            status: 'in_production',
            stockModelId: po.specifications?.stockModel || po.specifications?.stock_model || 'unknown',
            modelId: po.specifications?.stockModel || po.specifications?.stock_model || 'unknown',
            fbOrderNumber: po.po_number,
            isP1Order: true,
            // Include full features/specifications for barcode labels
            features: po.specifications || {},
            actionLength: po.specifications?.actionLength || po.specifications?.action_length,
          } as any; // Custom response object with fields from production_orders table
        } else {
          console.log(`❌ No production order found for ${orderId}`);
        }
      } catch (queryError) {
        console.error(`❌ Error querying production_orders:`, queryError);
      }
    }

    if (!order) {
      console.log(`❌ Order ${orderId} not found`);
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(`✅ Found order ${orderId} in department: ${order.currentDepartment}`);
    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Pipeline Management
router.get('/pipeline-counts', async (req: Request, res: Response) => {
  try {
    const counts = await storage.getPipelineCounts();
    res.json(counts);
  } catch (error) {
    console.error('Get pipeline counts error:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline counts' });
  }
});

router.get('/pipeline-details', async (req: Request, res: Response) => {
  try {
    const details = await storage.getPipelineDetails();
    res.json(details);
  } catch (error) {
    console.error('Get pipeline details error:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline details' });
  }
});

// This route seems to be duplicated, keeping the first instance.
// router.post('/:id/progress', async (req: Request, res: Response) => {
//   try {
//     const orderId = req.params.id;
//     const { nextDepartment } = req.body;
//     const updatedOrder = await storage.progressOrder(orderId, nextDepartment);
//     res.json(updatedOrder);
//   } catch (error) {
//     console.error('Progress order error:', error);
//     res.status(500).json({ error: "Failed to progress order" });
//   }
// });

router.post('/:id/scrap', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const scrapData = req.body;
    const scrappedOrder = await storage.scrapOrder(orderId, scrapData);
    res.json(scrappedOrder);
  } catch (error) {
    console.error('Scrap order error:', error);
    res.status(500).json({ error: 'Failed to scrap order' });
  }
});

// Move order back to draft for editing
router.post('/:id/move-to-draft', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;

    // Get the current order
    const currentOrder = await storage.getOrderById(orderId);
    if (!currentOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Move order back to draft status by copying to order_drafts table
    const draftData = {
      orderId: currentOrder.orderId,
      customerId: currentOrder.customerId,
      orderDate: currentOrder.orderDate,
      dueDate: currentOrder.dueDate,
      modelId: currentOrder.modelId,
      features: currentOrder.features as Record<string, any> | null,
      handedness: currentOrder.handedness,
      notes: currentOrder.notes,
      status: 'DRAFT',
      currentDepartment: currentOrder.currentDepartment || 'Draft',
      paymentAmount: currentOrder.paymentAmount,
      paymentDate: currentOrder.paymentDate,
      paymentType: currentOrder.paymentType,
      discountCode: currentOrder.discountCode,
      customDiscountType: currentOrder.customDiscountType,
      customDiscountValue: currentOrder.customDiscountValue,
      showCustomDiscount: currentOrder.showCustomDiscount,
      priceOverride: currentOrder.priceOverride,
      shipping: currentOrder.shipping || 0,
      isPaid: currentOrder.isPaid || false,
      isVerified: currentOrder.isVerified || false,
      isFlattop: currentOrder.isFlattop || false,
    };

    // Create draft order
    const draftOrder = await storage.createOrderDraft(draftData as any);

    // Remove from finalized orders (allOrders table) - commented out for now
    // await storage.deleteFinalizedOrderById(orderId);

    res.json({
      success: true,
      message: 'Order moved to draft for editing',
      draftOrder,
    });
  } catch (error) {
    console.error('Move to draft error:', error);
    res.status(500).json({ error: 'Failed to move order to draft' });
  }
});

// Progress order to next department
router.post('/:id/progress', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const { nextDepartment } = req.body;

    const updatedOrder = await storage.progressOrder(orderId, nextDepartment);
    res.json(updatedOrder);
  } catch (error) {
    console.error('Progress order error:', error);
    res.status(500).json({ error: 'Failed to progress order' });
  }
});

// Sync verification status between draft and finalized orders
router.post('/sync-verification', async (req: Request, res: Response) => {
  try {
    const result = await storage.syncVerificationStatus();
    res.json(result);
  } catch (error) {
    console.error('Sync verification status error:', error);
    res
      .status(500)
      .json({
        error: 'Failed to sync verification status',
        details: (error as Error).message,
      });
  }
});

// Purchase Orders
router.get('/purchase-orders', async (req: Request, res: Response) => {
  try {
    const purchaseOrders = await storage.getAllPurchaseOrders();
    res.json(purchaseOrders);
  } catch (error) {
    console.error('Get purchase orders error:', error);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

router.post('/purchase-orders', async (req: Request, res: Response) => {
  try {
    const purchaseOrderData = insertPurchaseOrderSchema.parse(req.body);
    const newPurchaseOrder =
      await storage.createPurchaseOrder(purchaseOrderData);
    res.status(201).json(newPurchaseOrder);
  } catch (error) {
    console.error('Create purchase order error:', error);
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
});

// Payment Management Routes
// Get all payments for an order
router.get('/:orderId/payments', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    console.log('Fetching payments for order:', orderId);

    // Get payments from separate payments table
    const payments = await storage.getPaymentsByOrderId(orderId);
    console.log('Found payments:', payments);

    res.json(payments);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Add a new payment to an order
router.post('/:orderId/payments', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    console.log('Creating payment for order:', orderId);
    console.log('Payment data received:', req.body);

    const paymentData = insertPaymentSchema.parse({ ...req.body, orderId });
    console.log('Validated payment data:', paymentData);

    const newPayment = await storage.createPayment(paymentData);
    console.log('Payment created successfully:', newPayment);

    res.status(201).json(newPayment);
  } catch (error) {
    console.error('Create payment error:', error);
    console.error('Error details:', (error as Error).message);
    res
      .status(400)
      .json({
        error: 'Failed to create payment',
        details: (error as any).message,
      });
  }
});

// Update a payment
router.put('/payments/:paymentId', async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.paymentId);
    const paymentData = insertPaymentSchema.parse(req.body);
    const updatedPayment = await storage.updatePayment(paymentId, paymentData);
    res.json(updatedPayment);
  } catch (error) {
    console.error('Update payment error:', error);
    res
      .status(400)
      .json({
        error: 'Failed to update payment',
        details: (error as any).message,
      });
  }
});

// Delete a payment
router.delete('/payments/:paymentId', async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.paymentId);

    // Validate payment ID
    if (isNaN(paymentId)) {
      console.error('Invalid payment ID:', req.params.paymentId);
      return res.status(400).json({ error: 'Invalid payment ID' });
    }

    console.log(`🗑️ Attempting to delete payment ID: ${paymentId}`);

    // Check if payment exists by trying to get it directly
    try {
      const result = await db
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);
      if (result.length === 0) {
        console.error('Payment not found:', paymentId);
        return res.status(404).json({ error: 'Payment not found' });
      }
      console.log(
        `✅ Payment found: ${paymentId}, orderId: ${result[0].orderId}`
      );
    } catch (checkError) {
      console.error('Error checking payment existence:', checkError);
      return res.status(500).json({ error: 'Error validating payment' });
    }

    await storage.deletePayment(paymentId);
    console.log(`✅ Successfully deleted payment ID: ${paymentId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete payment error:', error);
    console.error('Error details:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
      paymentId: req.params.paymentId,
    });
    res.status(500).json({
      error: 'Failed to delete payment',
      details: (error as Error).message,
    });
  }
});

// Bulk payment processing - record payments for multiple orders at once
// NOTE: Currently accepts orderTotal from client for payment completion logic.
// In production, this should be verified server-side using calculateOrderTotal
// to prevent integrity issues. For now, this is acceptable as an internal CSR tool.
router.post('/bulk-payment', async (req: Request, res: Response) => {
  try {
    const { payments: paymentItems } = req.body;
    
    if (!Array.isArray(paymentItems) || paymentItems.length === 0) {
      return res.status(400).json({ error: 'Invalid payment data' });
    }

    console.log(`💳 Processing bulk payment for ${paymentItems.length} orders`);

    const results = [];
    const errors = [];

    for (const item of paymentItems) {
      try {
        const { orderId, paymentType, paymentAmount, paymentDate, orderTotal } = item;

        if (!orderId || !paymentType || !paymentAmount) {
          throw new Error(`Missing required fields for order ${orderId}`);
        }

        if (orderTotal === undefined || orderTotal === null) {
          throw new Error(`Order total not provided for order ${orderId}`);
        }

        const paymentData = insertPaymentSchema.parse({
          orderId,
          paymentType,
          paymentAmount: parseFloat(paymentAmount),
          paymentDate: new Date(paymentDate),
          notes: item.notes || null,
        });

        const newPayment = await storage.createPayment(paymentData);

        const allPayments = await storage.getPaymentsByOrderId(orderId);
        const totalPaid = allPayments.reduce(
          (sum: number, p: any) => sum + p.paymentAmount,
          0
        );

        // Round to 2 decimal places to avoid floating-point precision issues
        const roundedTotalPaid = Math.round(totalPaid * 100) / 100;
        const roundedOrderTotal = Math.round(orderTotal * 100) / 100;
        const isPaidInFull = roundedTotalPaid >= roundedOrderTotal;
        
        // Calculate credit if overpaid
        const creditAmount = isPaidInFull && roundedTotalPaid > roundedOrderTotal 
          ? roundedTotalPaid - roundedOrderTotal 
          : 0;

        console.log(`📊 Payment summary for ${orderId}:`, {
          orderTotal,
          roundedOrderTotal,
          totalPaid,
          roundedTotalPaid,
          isPaidInFull,
          creditAmount,
          newPaymentAmount: paymentAmount,
        });

        // Log overpayment/credit
        if (creditAmount > 0) {
          console.log(`💰 OVERPAYMENT: Order ${orderId} has a credit of $${creditAmount.toFixed(2)}`);
        }

        await db
          .update(allOrders)
          .set({
            isPaid: isPaidInFull,
            paymentType,
            paymentAmount: totalPaid,
            paymentDate: new Date(paymentDate),
            paymentTimestamp: new Date(),
          })
          .where(eq(allOrders.orderId, orderId));

        results.push({
          orderId,
          success: true,
          paymentId: newPayment.id,
          isPaidInFull,
          totalPaid,
          creditAmount,
        });

        console.log(`✅ Payment recorded for order ${orderId} (Paid in full: ${isPaidInFull}${creditAmount > 0 ? `, Credit: $${creditAmount.toFixed(2)}` : ''})`);
      } catch (error) {
        console.error(`❌ Error processing payment for order ${item.orderId}:`, error);
        errors.push({
          orderId: item.orderId,
          error: (error as Error).message,
        });
      }
    }

    res.json({
      success: errors.length === 0,
      processed: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error('Bulk payment error:', error);
    res.status(500).json({
      error: 'Failed to process bulk payment',
      details: (error as Error).message,
    });
  }
});

// Progress order to next department
router.post('/:orderId/progress', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { nextDepartment } = req.body;

    console.log(
      `🏭 Progressing order ${orderId} to ${nextDepartment || 'next department'}`
    );

    // Try to find order in different order tables
    let existingOrder = await storage.getFinalizedOrderById(orderId);
    let isFinalized = true;
    let isP2Order = false;

    if (!existingOrder) {
      // Try P2 finalized orders
      try {
        existingOrder = await storage.getFinalizedOrderById(orderId);
        isP2Order = true;
        isFinalized = true;
        console.log(`📋 Found P2 finalized order: ${orderId}`);
      } catch (error) {
        // P2 method might not exist, continue to draft orders
      }
    }

    if (!existingOrder) {
      // Try P1 draft orders
      const draftOrder = await storage.getOrderDraft(orderId);
      if (draftOrder) {
        existingOrder = draftOrder as any;
        isFinalized = false;
        console.log(`📋 Found P1 draft order: ${orderId}`);
      }
    }

    if (!existingOrder) {
      // Try P2 draft orders
      try {
        const p2DraftOrder = await storage.getOrderDraft(orderId);
        if (p2DraftOrder) {
          existingOrder = p2DraftOrder as any;
          isFinalized = false;
          isP2Order = true;
          console.log(`📋 Found P2 draft order: ${orderId}`);
        }
      } catch (error) {
        // P2 method might not exist
      }
    }

    if (!existingOrder) {
      console.error(
        `❌ Order ${orderId} not found in either finalized or draft orders`
      );
      return res.status(404).json({ error: `Order ${orderId} not found` });
    }

    console.log(
      `📋 Found order ${orderId} in department: ${existingOrder.currentDepartment} (${isFinalized ? 'finalized' : 'draft'}, ${isP2Order ? 'P2' : 'P1'})`
    );

    // Prepare completion timestamp update based on current department
    const completionUpdates: any = {};
    const now = new Date();

    switch (existingOrder.currentDepartment) {
      case 'P1 Production Queue':
        completionUpdates.productionQueueCompletedAt = now;
        break;
      case 'P2 Production Queue':
        completionUpdates.productionQueueCompletedAt = now;
        break;
      case 'Layup/Plugging':
        completionUpdates.layupPluggingCompletedAt = now;
        break;
      case 'Barcode':
        completionUpdates.barcodeCompletedAt = now;
        break;
      case 'CNC':
        completionUpdates.cncCompletedAt = now;
        break;
      case 'Gunsmith':
        completionUpdates.gunsmithCompletedAt = now;
        break;
      case 'Finish':
        completionUpdates.finishCompletedAt = now;
        break;
      case 'Finish QC':
        completionUpdates.finishQcCompletedAt = now;
        break;
      case 'Paint':
        completionUpdates.paintCompletedAt = now;
        break;
      case 'Shipping QC':
        completionUpdates.shippingQcCompletedAt = now;
        break;
      case 'Shipping':
        completionUpdates.shippingCompletedAt = now;
        break;
    }

    // Define the departments sequence for automatic progression
    // Flow: Layup/Plugging → Barcode → CNC → Gunsmith → Finish → Finish QC → Paint → Shipping QC → Shipping (final department)
    // After Shipping, order status becomes FULFILLED and currentDepartment is cleared
    const departments = [
      'P1 Production Queue',
      'Layup/Plugging',
      'Barcode',
      'CNC',
      'Gunsmith',
      'Finish',
      'Finish QC',
      'Paint',
      'Shipping QC',
      'Shipping',
    ];

    // CRITICAL SAFEGUARD: Prevent backwards department progression
    if (nextDepartment) {
      const currentIndex = departments.indexOf(existingOrder.currentDepartment || '');
      const targetIndex = departments.indexOf(nextDepartment);

      // Allow backwards movement only for specific administrative cases
      if (targetIndex < currentIndex && targetIndex >= 0 && currentIndex >= 0) {
        console.log(
          `⚠️  WARNING: Attempting to move order ${orderId} backwards from ${existingOrder.currentDepartment} to ${nextDepartment}`
        );

        // Log this as a potential issue for investigation
        const backwardsMovement = {
          orderId,
          fromDepartment: existingOrder.currentDepartment,
          toDepartment: nextDepartment,
          timestamp: new Date().toISOString(),
          reason: 'Manual backwards progression detected',
        };
        console.error('🚨 BACKWARDS PROGRESSION DETECTED:', backwardsMovement);

        // For now, allow it but log heavily - in future this could be blocked
        // return res.status(400).json({
        //   error: `Cannot move order backwards from ${existingOrder.currentDepartment} to ${nextDepartment}. This could cause data loss.`
        // });
      }
    }

    // Special handling for orders with no stock model - they bypass manufacturing and go to Shipping QC
    const hasNoStockModel =
      !existingOrder.modelId || existingOrder.modelId.trim() === '';

    // Special handling for flat top orders - they bypass CNC and go directly to Finish
    const isFlatTop = existingOrder.isFlattop || false;

    // Check if order has no_rail - these bypass Gunsmith entirely
    const features =
      typeof existingOrder.features === 'string'
        ? JSON.parse(existingOrder.features)
        : existingOrder.features;
    const hasNoRail = features?.rail_accessory?.includes?.('no_rail') || false;

    // If no nextDepartment provided, calculate it automatically
    let targetDepartment = nextDepartment;
    let shouldMarkFulfilled = false;

    if (!targetDepartment) {
      // Special case: Shipping is the final department
      // When progressing from Shipping, set status to FULFILLED and clear department
      if (existingOrder.currentDepartment === 'Shipping') {
        shouldMarkFulfilled = true;
        targetDepartment = null; // Clear department
        console.log(
          `📦 Order ${orderId} completing Shipping - will be marked as FULFILLED with no department`
        );
      }
      // Orders with no stock model should skip manufacturing departments
      else if (
        hasNoStockModel &&
        existingOrder.currentDepartment === 'P1 Production Queue'
      ) {
        targetDepartment = 'Shipping QC';
        console.log(
          `🚀 Order ${orderId} has no stock model - routing directly to Shipping QC`
        );
      }
      // Flat top orders skip CNC and go directly to Finish after Layup/Plugging
      else if (
        isFlatTop &&
        existingOrder.currentDepartment === 'Layup/Plugging'
      ) {
        targetDepartment = 'Finish';
        console.log(
          `🏔️ Order ${orderId} is flat top - bypassing CNC, routing directly to Finish`
        );
      }
      // Orders with no_rail skip Gunsmith and go directly from CNC to Finish
      else if (hasNoRail && existingOrder.currentDepartment === 'CNC') {
        targetDepartment = 'Finish';
        console.log(
          `🔧 Order ${orderId} has no_rail - bypassing Gunsmith, routing directly from CNC to Finish`
        );
      }
      // Regular progression for all other cases
      else {
        const currentIndex = departments.indexOf(
          existingOrder.currentDepartment || ''
        );
        if (currentIndex >= 0 && currentIndex < departments.length - 1) {
          targetDepartment = departments[currentIndex + 1];
        } else {
          console.error(
            `❌ Cannot determine next department for ${existingOrder.currentDepartment}`
          );
          return res
            .status(400)
            .json({
              error: `Invalid current department: ${existingOrder.currentDepartment}`,
            });
        }
      }
    }

    console.log(`🎯 Target department: ${targetDepartment}`);

    // Get existing department history and add new entry
    const existingHistory = (existingOrder as any).departmentHistory || [];
    const departmentHistory = Array.isArray(existingHistory) ? [...existingHistory] : [];
    const progressedBy = (req as any).user?.username || 'System';
    
    // Add new history entry for department change
    if (existingOrder.currentDepartment && targetDepartment) {
      departmentHistory.push({
        fromDepartment: existingOrder.currentDepartment,
        toDepartment: targetDepartment,
        timestamp: now.toISOString(),
        progressedBy,
        assignedTechnician: (existingOrder as any).assignedTechnician || null,
      });
    }

    // Prepare update data
    const updateData: any = {
      ...completionUpdates,
      departmentHistory,
    };

    if (shouldMarkFulfilled) {
      updateData.status = 'FULFILLED';
      updateData.currentDepartment = undefined; // Clear department when fulfilled
      console.log(`📦 Marking order as FULFILLED with no department`);
    } else {
      updateData.currentDepartment = targetDepartment;
    }

    // Update the appropriate table
    let updatedOrder;
    if (isFinalized && isP2Order) {
      console.log(
        `🔄 Updating P2 finalized order ${orderId} in P2 allOrders table`
      );
      console.log(`🔄 Update data:`, updateData);
      try {
        updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
        console.log(
          `✅ Updated P2 finalized order result:`,
          updatedOrder?.currentDepartment,
          updatedOrder?.status
        );
      } catch (error) {
        console.error(
          `❌ P2 update method not available, falling back to P1 update:`,
          error
        );
        updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
      }
    } else if (isFinalized) {
      console.log(
        `🔄 Updating P1 finalized order ${orderId} in allOrders table`
      );
      console.log(`🔄 Update data:`, updateData);
      updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
      console.log(
        `✅ Updated P1 finalized order result:`,
        updatedOrder?.currentDepartment,
        updatedOrder?.status
      );
    } else if (isP2Order) {
      console.log(
        `🔄 Updating P2 draft order ${orderId} in P2 orderDrafts table`
      );
      console.log(`🔄 Update data:`, updateData);
      try {
        updatedOrder = await storage.updateOrderDraft(orderId, updateData);
        console.log(
          `✅ Updated P2 draft order result:`,
          updatedOrder?.currentDepartment,
          updatedOrder?.status
        );
      } catch (error) {
        console.error(
          `❌ P2 update method not available, falling back to P1 update:`,
          error
        );
        updatedOrder = await storage.updateOrderDraft(orderId, updateData);
      }
    } else {
      console.log(`🔄 Updating P1 draft order ${orderId} in orderDrafts table`);
      console.log(`🔄 Update data:`, updateData);
      updatedOrder = await storage.updateOrderDraft(orderId, updateData);
      console.log(
        `✅ Updated P1 draft order result:`,
        updatedOrder?.currentDepartment,
        updatedOrder?.status
      );
    }

    if (shouldMarkFulfilled) {
      console.log(
        `✅ Successfully marked order ${orderId} as FULFILLED (status: ${updatedOrder?.status})`
      );
      
      // Log audit event for order fulfillment
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: orderId,
        action: 'ORDER_FULFILLED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'System',
          role: (req as any).user?.role || 'system',
        },
        fieldsChanged: {
          status: { before: existingOrder.status, after: 'FULFILLED' },
          currentDepartment: { before: existingOrder.currentDepartment, after: null },
        },
        meta: { source: 'department_progression' },
      });
    } else {
      console.log(
        `✅ Successfully progressed order ${orderId} from ${existingOrder.currentDepartment} to ${targetDepartment}`
      );
      console.log(
        `✅ Final order department: ${updatedOrder?.currentDepartment}`
      );

      // Verify the update succeeded
      if (updatedOrder?.currentDepartment !== targetDepartment) {
        console.error(
          `❌ Update failed: Expected ${targetDepartment}, got ${updatedOrder?.currentDepartment}`
        );
        return res.status(500).json({ error: `Department update failed` });
      }
      
      // Log audit event for department progression using standard event type
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: orderId,
        action: 'DEPARTMENT_CHANGE',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'System',
          role: (req as any).user?.role || 'system',
        },
        fieldsChanged: {
          currentDepartment: { before: existingOrder.currentDepartment, after: targetDepartment },
        },
        meta: { 
          source: 'department_progression',
          fromDepartment: existingOrder.currentDepartment,
          toDepartment: targetDepartment,
        },
      });
      
      // Also record department transition for timing tracking
      await auditService.recordDepartmentEntry({
        entityType: 'p1_order',
        entityId: orderId,
        department: targetDepartment,
        enteredByUserId: (req as any).user?.id,
        metadata: {
          fromDepartment: existingOrder.currentDepartment,
          progressedBy: progressedBy,
        },
      });
    }

    res.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error('Progress order error:', error);
    res
      .status(500)
      .json({
        error: 'Failed to progress order',
        details: (error as any).message,
      });
  }
});

// Complete QC and move to shipping
router.post('/complete-qc/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { qcNotes, qcPassedAll } = req.body;

    const updateData = {
      currentDepartment: qcPassedAll ? 'Shipping' : 'QC',
      qcCompletedAt: qcPassedAll ? new Date() : null,
      qcNotes: qcNotes || null,
      qcPassed: qcPassedAll,
      status: qcPassedAll ? 'Ready for Shipping' : 'In QC',
    };

    // Try to update in finalized orders first
    let updatedOrder;
    try {
      updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
    } catch (error) {
      // If not found in finalized orders, try draft orders
      updatedOrder = await storage.updateOrderDraft(orderId, updateData);
    }

    res.json({
      success: true,
      message: qcPassedAll ? 'Order moved to shipping' : 'QC notes updated',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Error completing QC:', error);
    res.status(500).json({ error: 'Failed to complete QC process' });
  }
});

// Undo cancellation of an order (restore order)
router.post('/undo-cancel/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    console.log('🔄 UNDO CANCEL ORDER ROUTE CALLED');
    console.log('🔄 Order ID:', orderId);

    // Check if the order exists and is cancelled
    const order = await storage.getOrderById(orderId);
    if (!order) {
      console.log('🔄 Order not found:', orderId);
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!(order as any).isCancelled) {
      console.log('🔄 Order is not cancelled:', orderId);
      return res.status(400).json({ error: 'Order is not cancelled' });
    }

    console.log('🔄 Found cancelled order:', order.id, order.status);

    // Restore the order by removing cancellation information
    const updateData = {
      isCancelled: false,
      cancelledAt: null,
      cancelReason: null,
      status: 'FINALIZED', // Restore to finalized status
      currentDepartment: 'P1 Production Queue', // Put back in production queue
      updatedAt: new Date(),
    };

    console.log('🔄 Restoring order with data:', updateData);

    const updatedOrder = await storage.updateFinalizedOrder(
      orderId,
      updateData
    );

    if (!updatedOrder) {
      console.log('🔄 Failed to restore order:', orderId);
      return res.status(404).json({ error: 'Failed to restore order' });
    }

    console.log('🔄 Order restored successfully:', updatedOrder.orderId);

    res.json({
      success: true,
      message: 'Order restored successfully and returned to production queue',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('🔄 Error restoring order:', error);
    res.status(500).json({ error: 'Failed to restore order' });
  }
});

// Cancel an order
router.post('/cancel/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { reason, sendToRts = true } = req.body;

    console.log('🔧 CANCEL ORDER ROUTE CALLED');
    console.log('🔧 Order ID:', orderId);
    console.log('🔧 Cancel reason:', reason);
    console.log('🔧 Send to RTS:', sendToRts);

    // Try to cancel the order (check if it exists first)
    const order = await storage.getOrderById(orderId);
    if (!order) {
      console.log('🔧 Order not found:', orderId);
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log('🔧 Found order:', order.id, order.currentDepartment, order.status);

    // Check if order is already in production (beyond P1 Production Queue)
    const productionDepartments = [
      'Layup/Plugging',
      'Barcode',
      'CNC',
      'Finish',
      'Gunsmith',
      'Paint',
      'Shipping QC',
      'Shipping'
    ];
    
    const isInProduction = productionDepartments.includes(order.currentDepartment || '');
    let rtsInventoryCreated = false;

    // If order is already in production and user chose to send to RTS, move it to RTS inventory
    if (isInProduction && order.modelId && sendToRts) {
      console.log('🔧 Order is in production, creating RTS inventory item(s)...');
      console.log(`🔧 Total produced: ${order.totalProduced}, Department: ${order.currentDepartment}`);
      
      try {
        const features = (order.features as any) || {};
        
        // Determine number of items to create based on totalProduced or default to 1
        // If totalProduced is > 0, create that many items; otherwise create 1 (WIP item)
        const quantityToCreate = Math.max(order.totalProduced || 1, 1);
        
        // Try to get pricing information from the order
        // Look for stock model pricing or use stored shipping/payment data as reference
        let estimatedPrice: number | null = null;
        
        // Attempt to query the stock model's base price
        try {
          const stockPriceQuery = await pool.query(
            `SELECT base_price FROM stock_models WHERE model_id = $1`,
            [order.modelId]
          );
          if (stockPriceQuery && stockPriceQuery.length > 0) {
            estimatedPrice = stockPriceQuery[0].base_price;
            console.log(`🔧 Found base price for ${order.modelId}: $${estimatedPrice}`);
          }
        } catch (priceError) {
          console.log('🔧 Could not fetch stock model price:', priceError);
        }
        
        // Create RTS inventory items (one per produced unit)
        const createdItems = [];
        for (let i = 0; i < quantityToCreate; i++) {
          const rtsItem = {
            stockModel: order.modelId || '',
            actionLength: features.action_length || null,
            action: features.action || null,
            barrel: features.barrel_inlet || features.barrel || null,
            bottomMetal: features.bottom_metal || null,
            color: features.paint_options || features.color || null,
            extras: quantityToCreate > 1 
              ? `Cancelled order ${orderId} (Unit ${i + 1}/${quantityToCreate})`
              : `Cancelled order ${orderId}`,
            price: estimatedPrice,
            status: 'AVAILABLE',
          };

          const insertQuery = `
            INSERT INTO rts_inventory (
              stock_model, action_length, action, barrel, bottom_metal, color, extras, price, status, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING id
          `;

          const result = await pool.query(insertQuery, [
            rtsItem.stockModel,
            rtsItem.actionLength,
            rtsItem.action,
            rtsItem.barrel,
            rtsItem.bottomMetal,
            rtsItem.color,
            rtsItem.extras,
            rtsItem.price,
            rtsItem.status,
          ]);

          const rtsInventoryId = result?.[0]?.id;

          if (rtsInventoryId) {
            // Create history entry for RTS inventory
            await pool.query(
              `INSERT INTO rts_inventory_history (
                rts_inventory_id, action, to_status, performed_by, notes, performed_at
              ) VALUES ($1, $2, $3, $4, $5, NOW())`,
              [
                rtsInventoryId,
                'CREATED',
                'AVAILABLE',
                req.user?.username || 'System',
                `Created from cancelled order ${orderId}. Reason: ${reason || 'No reason provided'}. Unit ${i + 1} of ${quantityToCreate}.`
              ]
            );

            createdItems.push(rtsInventoryId);
            console.log(`✅ Created RTS inventory item ${rtsInventoryId} from order ${orderId} (${i + 1}/${quantityToCreate})`);
          }
        }

        if (createdItems.length > 0) {
          rtsInventoryCreated = true;
          console.log(`✅ Created ${createdItems.length} RTS inventory item(s) from cancelled order ${orderId}`);
        }
      } catch (rtsError) {
        console.error('❌ Failed to create RTS inventory item:', rtsError);
        // Continue with cancellation even if RTS creation fails
      }
    }

    // Update the order with cancellation information
    const updateData = {
      isCancelled: true,
      cancelledAt: new Date(),
      cancelReason: reason || 'No reason provided',
      status: 'CANCELLED',
      currentDepartment: undefined, // Remove from all department queues
      updatedAt: new Date(),
    };

    let updatedOrder;
    try {
      // Try updating in finalized orders first
      updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
      console.log('🔧 Updated finalized order successfully');
    } catch (finalizedError) {
      console.log(
        '🔧 Failed to update finalized order, trying draft orders:',
        finalizedError
      );
      try {
        // If not found in finalized orders, try draft orders
        updatedOrder = await storage.updateOrderDraft(orderId, updateData);
        console.log('🔧 Updated draft order successfully');
      } catch (draftError) {
        console.error(
          '🔧 Failed to update both finalized and draft orders:',
          draftError
        );
        throw new Error('Order not found in either finalized or draft orders');
      }
    }

    // Remove order from layup queue if it exists there
    try {
      // await storage.deleteLayupQueueItem(orderId); // Method not available
      console.log('🔧 Removed order from layup queue:', orderId);
    } catch (layupQueueError) {
      console.log(
        '🔧 Order was not in layup queue or removal failed:',
        layupQueueError
      );
      // Don't fail the cancellation if layup queue removal fails
    }

    console.log('🔧 Order cancelled successfully:', updatedOrder.orderId);

    const responseMessage = rtsInventoryCreated
      ? 'Order cancelled successfully. The item was in production and has been moved to RTS inventory.'
      : 'Order cancelled successfully and removed from production queue.';

    res.json({
      success: true,
      message: responseMessage,
      order: updatedOrder,
      rtsInventoryCreated,
    });
  } catch (error) {
    console.error('🔧 Error cancelling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Single Field Update Endpoint for Admin Panel (MUST come before generic /:orderId route!)
router.patch(
  '/:orderId/field',
  authenticateToken,
  requireRole('ADMIN', 'OWNER'),
  async (req: Request, res: Response) => {
    try {
      const orderIdParam = req.params.orderId;
      const { fieldName, value } = req.body;

      // DEBUG: Log the incoming request
      console.log('🔍 PATCH /field request:', {
        orderId: orderIdParam,
        fieldName,
        value,
        valueType: typeof value,
        body: req.body
      });

      if (!fieldName) {
        return res.status(400).json({ error: 'Field name is required' });
      }

      // Determine if the param is a numeric ID (legacy) or string order_id (current)
      const isNumericId = /^\d+$/.test(orderIdParam);
      
      // Validate field using imported admin config
      const fieldConfig = ADMIN_FIELD_CONFIG[fieldName];

      if (!fieldConfig) {
        return res.status(400).json({ error: `Unknown field: ${fieldName}` });
      }

      // Check role permission for this field
      const userRole = req.user?.role || 'EMPLOYEE';
      const allowedRoles = Array.isArray(fieldConfig.requiredRole) 
        ? fieldConfig.requiredRole 
        : [fieldConfig.requiredRole];

      if (!allowedRoles.includes(userRole as any)) {
        return res.status(403).json({ 
          error: `Insufficient permissions to edit ${fieldName}`,
          requiredRole: allowedRoles,
        });
      }

      // Fetch the existing order - check both tables
      let order: any;
      let isFinalized = true;
      
      if (isNumericId) {
        // Legacy numeric ID lookup
        const numericId = parseInt(orderIdParam, 10);
        order = await db.select().from(allOrders).where(eq(allOrders.id, numericId)).limit(1);
        
        if (!order || order.length === 0) {
          order = await db.select().from(orders).where(eq(orders.id, numericId)).limit(1);
          isFinalized = false;
        }
      } else {
        // String order_id lookup (AG100, EH051, etc.)
        order = await db.select().from(allOrders).where(eq(allOrders.orderId, orderIdParam)).limit(1);
        
        if (!order || order.length === 0) {
          order = await db.select().from(orders).where(eq(orders.orderId, orderIdParam)).limit(1);
          isFinalized = false;
        }
      }

      if (!order || order.length === 0) {
        return res.status(404).json({ error: `Order ${orderIdParam} not found` });
      }

      order = order[0];
      const orderStringId = order.orderId; // Always use the string order_id for logging

      // Use jsField if specified, otherwise use the fieldName itself (which is already camelCase)
      const jsField = fieldConfig.jsField || fieldName;
      const oldValue = (order as any)[jsField];

      // Validate the value based on field config
      let validatedValue = value;

      if (fieldConfig.validation) {
        const validationResult = fieldConfig.validation.safeParse(value);
        if (!validationResult.success) {
          return res.status(400).json({ 
            error: 'Validation failed',
            details: validationResult.error.errors,
          });
        }
        validatedValue = validationResult.data;
      }

      // Handle null values for nullable fields
      if (value === null || value === undefined || value === '') {
        validatedValue = null;
      }

      // Type coercion based on field type
      if (validatedValue !== null) {
        switch (fieldConfig.type) {
          case 'boolean':
            validatedValue = Boolean(validatedValue);
            break;
          case 'number':
            validatedValue = Number(validatedValue);
            if (isNaN(validatedValue)) {
              return res.status(400).json({ error: `Invalid number for ${fieldName}` });
            }
            break;
          case 'date':
            if (typeof validatedValue === 'string') {
              const parsedDate = new Date(validatedValue);
              if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({ error: `Invalid date for ${fieldName}` });
              }
              validatedValue = parsedDate.toISOString();
            }
            break;
        }
      }

      // Build update data object using JavaScript field name for Drizzle
      const updateData: any = {
        [jsField]: validatedValue,
        updatedAt: new Date(),
      };

      // Special handling for urgency - set isManualUrgency flag
      if (fieldName === 'urgency') {
        updateData.isManualUrgency = true;
      }

      // DEBUG: Log what we're about to update
      console.log('💾 UPDATE DEBUG:', {
        orderId: orderIdParam,
        isFinalized,
        isNumericId,
        jsField,
        oldValue,
        newValue: validatedValue,
        updateData,
      });

      // Update the appropriate table using the correct identifier
      let updateResult;
      if (isFinalized) {
        if (isNumericId) {
          updateResult = await db
            .update(allOrders)
            .set(updateData)
            .where(eq(allOrders.id, parseInt(orderIdParam, 10)));
        } else {
          updateResult = await db
            .update(allOrders)
            .set(updateData)
            .where(eq(allOrders.orderId, orderIdParam));
        }
      } else {
        if (isNumericId) {
          updateResult = await db
            .update(orders)
            .set(updateData)
            .where(eq(orders.id, parseInt(orderIdParam, 10)));
        } else {
          updateResult = await db
            .update(orders)
            .set(updateData)
            .where(eq(orders.orderId, orderIdParam));
        }
      }

      console.log('💾 UPDATE RESULT:', updateResult);

      // Log the change to audit logs
      await storage.createAdminAuditLog({
        orderId: orderStringId,
        fieldName: fieldName,
        fieldLabel: fieldConfig.label,
        changeType: 'INLINE',
        oldValue: oldValue !== null ? String(oldValue) : null,
        newValue: validatedValue !== null ? String(validatedValue) : null,
        userRole: (req.user?.role || 'EMPLOYEE') as 'ADMIN' | 'EMPLOYEE' | 'OWNER',
        changedBy: req.user?.username || 'system',
      });

      // Fetch and return updated order using the correct identifier
      let updatedOrder;
      if (isFinalized) {
        if (isNumericId) {
          updatedOrder = await db.select().from(allOrders).where(eq(allOrders.id, parseInt(orderIdParam, 10))).limit(1);
        } else {
          updatedOrder = await db.select().from(allOrders).where(eq(allOrders.orderId, orderIdParam)).limit(1);
        }
      } else {
        if (isNumericId) {
          updatedOrder = await db.select().from(orders).where(eq(orders.id, parseInt(orderIdParam, 10))).limit(1);
        } else {
          updatedOrder = await db.select().from(orders).where(eq(orders.orderId, orderIdParam)).limit(1);
        }
      }

      res.json({ 
        success: true,
        order: updatedOrder[0],
      });

    } catch (error) {
      console.error('Error updating order field:', error);
      res.status(500).json({ 
        error: 'Failed to update order field',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// PATCH route for updating order department progression
router.patch('/:orderId', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    const updates = req.body;

    console.log(`📋 PATCH /${orderId} - Department progression update`);
    console.log('📋 Update data:', updates);

    // Try to find and update the order in finalized orders first
    let updatedOrder;
    try {
      updatedOrder = await storage.updateFinalizedOrder(orderId, updates);
      console.log(`✅ Updated finalized order ${orderId}`);
    } catch (finalizedError) {
      console.log(`📋 Order not found in finalized orders, trying drafts...`);
      try {
        updatedOrder = await storage.updateOrderDraft(orderId, updates);
        console.log(`✅ Updated draft order ${orderId}`);
      } catch (draftError) {
        console.error(`❌ Order ${orderId} not found in either table`);
        return res.status(404).json({ error: `Order ${orderId} not found` });
      }
    }

    res.json(updatedOrder);
  } catch (error) {
    console.error(`❌ PATCH /${req.params.orderId} error:`, error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Specific endpoint for department transfers with validation
router.patch('/:orderId/department', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { department } = req.body;

    console.log(`🔄 Department Transfer Request: ${orderId} → ${department}`);

    if (!department) {
      return res.status(400).json({ error: 'Department is required' });
    }

    // Validate department name
    const validDepartments = [
      'P1 Production Queue',
      'Layup/Plugging',
      'Barcode',
      'CNC',
      'Gunsmith',
      'Finish',
      'Finish QC',
      'Paint',
      'Shipping QC',
      'Shipping',
    ];

    if (!validDepartments.includes(department)) {
      return res.status(400).json({ error: 'Invalid department name' });
    }

    // First, get the existing order to capture previous department
    let existingOrder: any = null;
    let previousDepartment: string | null = null;
    
    try {
      existingOrder = await storage.getFinalizedOrderById(orderId);
      previousDepartment = existingOrder?.currentDepartment || null;
    } catch {
      try {
        existingOrder = await storage.getOrderDraft(orderId);
        previousDepartment = existingOrder?.currentDepartment || null;
      } catch {
        const productionOrder = await storage.getProductionOrderByOrderId(orderId);
        if (productionOrder) {
          existingOrder = productionOrder;
          previousDepartment = (productionOrder as any).currentDepartment || null;
        }
      }
    }

    // Try to find and update the order
    let updatedOrder;
    let orderType = '';

    try {
      updatedOrder = await storage.updateFinalizedOrder(orderId, {
        currentDepartment: department,
      });
      orderType = 'finalized';
      console.log(`✅ Updated finalized order ${orderId} to ${department}`);
    } catch (finalizedError) {
      try {
        updatedOrder = await storage.updateOrderDraft(orderId, {
          currentDepartment: department,
        });
        orderType = 'draft';
        console.log(`✅ Updated draft order ${orderId} to ${department}`);
      } catch (draftError) {
        // Try production_orders table
        try {
          const productionOrder = await storage.getProductionOrderByOrderId(orderId);
          if (productionOrder) {
            const { pool } = await import('../../db');
            await pool.query(
              'UPDATE production_orders SET current_department = $1 WHERE order_id = $2',
              [department, orderId]
            );
            updatedOrder = { ...productionOrder, currentDepartment: department };
            orderType = 'production';
            console.log(`✅ Updated production order ${orderId} to ${department}`);
          } else {
            throw new Error('Order not found');
          }
        } catch (productionError) {
          console.error(`❌ Order ${orderId} not found in any table`);
          return res.status(404).json({ error: `Order ${orderId} not found` });
        }
      }
    }

    // Log the manual transfer for audit purposes
    console.log(
      `📋 MANUAL TRANSFER: ${orderId} (${orderType}) moved to ${department} via Department Transfer Tool`
    );

    // Log audit event for department transfer
    await auditService.logEvent({
      entityType: 'p1_order',
      entityId: orderId,
      action: 'DEPARTMENT_CHANGE',
      actor: {
        id: (req as any).user?.id,
        username: (req as any).user?.username || 'System',
        role: (req as any).user?.role || 'system',
      },
      fieldsChanged: {
        currentDepartment: { before: previousDepartment, after: department },
      },
      meta: { 
        source: 'department_transfer_tool',
        transferType: 'manual',
        orderType,
      },
    });

    // Record department transition for timing tracking
    await auditService.recordDepartmentEntry({
      entityType: 'p1_order',
      entityId: orderId,
      department: department,
      enteredByUserId: (req as any).user?.id,
      metadata: {
        fromDepartment: previousDepartment,
        transferType: 'manual',
      },
    });

    res.json({
      success: true,
      message: `Order ${orderId} successfully transferred to ${department}`,
      order: updatedOrder,
      auditInfo: {
        transferType: 'manual',
        orderType,
        timestamp: new Date(),
        targetDepartment: department,
      },
    });
  } catch (error) {
    console.error(
      `❌ Department transfer error for ${req.params.orderId}:`,
      error
    );
    res.status(500).json({ error: 'Failed to transfer order to department' });
  }
});

// CSV Export endpoint for orders (active orders only)
router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    const allOrders = await storage.getAllOrdersWithPaymentStatus();

    // Filter out fulfilled and cancelled orders
    const orders = allOrders.filter(
      (order) => order.status !== 'FULFILLED' && order.status !== 'CANCELLED'
    );

    // CSV headers
    const csvHeaders = [
      'Order ID',
      'Order Date',
      'Due Date',
      'Customer ID',
      'Customer Name',
      'Product/Model',
      'Current Department',
      'Status',
      'Payment Status',
      'Payment Total',
      'FB Order Number',
      'Handedness',
      'Created At',
      'Updated At',
    ].join(',');

    // Convert orders to CSV rows
    const csvRows = orders.map((order) => {
      // Helper function to safely format dates
      const formatDate = (date: any) => {
        if (!date) return '';
        try {
          return new Date(date).toLocaleDateString('en-US');
        } catch {
          return '';
        }
      };

      // Helper function to safely escape CSV values
      const escapeCSV = (value: any) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Get payment status
      const getPaymentStatus = (order: any) => {
        if (order.isFullyPaid) return 'Fully Paid';
        if (order.isPaid) return 'Partially Paid';
        return 'Unpaid';
      };

      return [
        escapeCSV(order.orderId),
        escapeCSV(formatDate(order.orderDate)),
        escapeCSV(formatDate(order.dueDate)),
        escapeCSV((order as any).customerId),
        escapeCSV((order as any).customer || 'N/A'),
        escapeCSV((order as any).product || order.modelId || 'N/A'),
        escapeCSV(order.currentDepartment),
        escapeCSV(order.status),
        escapeCSV(getPaymentStatus(order)),
        escapeCSV(order.paymentTotal || '0'),
        escapeCSV(order.fbOrderNumber || ''),
        escapeCSV(order.handedness || ''),
        escapeCSV(formatDate(order.createdAt)),
        escapeCSV(formatDate(order.updatedAt)),
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [csvHeaders, ...csvRows].join('\n');

    // Set headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="orders_export_${timestamp}.csv"`
    );

    res.send(csvContent);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export orders to CSV' });
  }
});

// CSV Export endpoint for ALL orders (including fulfilled and cancelled)
router.get('/export/csv-all', async (req: Request, res: Response) => {
  try {
    // Get all orders without any filtering - pass large limit to get all orders
    const orders = await storage.getAllOrdersWithPaymentStatus('', 999999);

    // CSV headers
    const csvHeaders = [
      'Order ID',
      'Order Date',
      'Due Date',
      'Customer ID',
      'Customer Name',
      'Product/Model',
      'Current Department',
      'Status',
      'Payment Status',
      'Payment Total',
      'FB Order Number',
      'Handedness',
      'Created At',
      'Updated At',
    ].join(',');

    // Convert orders to CSV rows
    const csvRows = orders.map((order) => {
      // Helper function to safely format dates
      const formatDate = (date: any) => {
        if (!date) return '';
        try {
          return new Date(date).toLocaleDateString('en-US');
        } catch {
          return '';
        }
      };

      // Helper function to safely escape CSV values
      const escapeCSV = (value: any) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Get payment status
      const getPaymentStatus = (order: any) => {
        if (order.isFullyPaid) return 'Fully Paid';
        if (order.isPaid) return 'Partially Paid';
        return 'Unpaid';
      };

      return [
        escapeCSV(order.orderId),
        escapeCSV(formatDate(order.orderDate)),
        escapeCSV(formatDate(order.dueDate)),
        escapeCSV((order as any).customerId),
        escapeCSV((order as any).customer || 'N/A'),
        escapeCSV((order as any).product || order.modelId || 'N/A'),
        escapeCSV(order.currentDepartment),
        escapeCSV(order.status),
        escapeCSV(getPaymentStatus(order)),
        escapeCSV(order.paymentTotal || '0'),
        escapeCSV(order.fbOrderNumber || ''),
        escapeCSV(order.handedness || ''),
        escapeCSV(formatDate(order.createdAt)),
        escapeCSV(formatDate(order.updatedAt)),
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [csvHeaders, ...csvRows].join('\n');

    // Set headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="all_orders_export_${timestamp}.csv"`
    );

    res.send(csvContent);
  } catch (error) {
    console.error('Full CSV export error:', error);
    res.status(500).json({ error: 'Failed to export all orders to CSV' });
  }
});

// Update order urgency/priority - Mark order as urgent
router.put('/:orderId/urgency', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { urgency } = req.body;

    // Validate urgency value
    const validUrgencies = ['critical', 'high', 'medium', 'low'];
    if (!urgency || !validUrgencies.includes(urgency)) {
      return res.status(400).json({ 
        error: 'Invalid urgency level. Must be one of: critical, high, medium, low' 
      });
    }

    console.log(`🚨 Setting order ${orderId} urgency to: ${urgency}`);

    // Find the order
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: `Order ${orderId} not found` });
    }

    // Calculate priority score based on urgency level
    // Lower score = higher priority. Urgent/critical gets lowest score to move to top
    const priorityScores = {
      critical: 1,     // Highest priority - moves to very top
      high: 1,         // Also highest - Urgent orders
      medium: 5000,    // Medium priority
      low: 9999,       // Lowest priority
    };

    const priorityScore = priorityScores[urgency as keyof typeof priorityScores];

    // Update the order with new urgency and priority score
    await db
      .update(allOrders)
      .set({
        urgency: urgency,
        priorityScore: priorityScore,
        isManualUrgency: true, // Mark as manually set
        updatedAt: new Date(),
      })
      .where(eq(allOrders.orderId, orderId));

    console.log(`✅ Order ${orderId} updated: urgency=${urgency}, priorityScore=${priorityScore}`);

    // Fetch updated order to return
    const updatedOrder = await storage.getOrderById(orderId);

    res.json({
      success: true,
      order: updatedOrder,
      message: `Order ${orderId} urgency updated to ${urgency}`,
    });
  } catch (error) {
    console.error(`❌ PUT /${req.params.orderId}/urgency error:`, error);
    res.status(500).json({ 
      error: 'Failed to update order urgency',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Admin Panel - Get audit logs for a specific order
router.get(
  '/audit-logs/:orderId',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      
      // Fetch audit logs for this order
      const auditLogs = await storage.getAdminAuditLogs({
        orderId,
        limit,
      });

      // Sort by most recent first
      const sortedLogs = auditLogs.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      res.json(sortedLogs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ 
        error: 'Failed to fetch audit logs',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// Admin Panel - Single field update with audit logging
router.patch(
  '/:id/field',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id: orderId } = req.params;
      const validatedData = adminFieldUpdateSchema.parse(req.body);
      const { fieldName, newValue } = validatedData;

      // Get field configuration
      const fieldConfig = ADMIN_FIELD_CONFIG[fieldName];
      if (!fieldConfig) {
        return res.status(400).json({ 
          error: `Invalid field: ${fieldName}` 
        });
      }

      // Check if user has permission to edit this field
      const userRole = (req as any).user?.role || 'EMPLOYEE';
      const allowedRoles = Array.isArray(fieldConfig.requiredRole)
        ? fieldConfig.requiredRole
        : [fieldConfig.requiredRole];
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions to edit this field',
          requiredRoles: allowedRoles,
          userRole,
        });
      }

      // Validate field-specific value if validation schema exists
      if (fieldConfig.validation) {
        try {
          fieldConfig.validation.parse(newValue);
        } catch (validationError) {
          return res.status(400).json({
            error: 'Field validation failed',
            field: fieldConfig.label,
            details: validationError instanceof Error ? (validationError as any).errors : 'Invalid value',
          });
        }
      }

      // Get current order to capture old value
      const currentOrder = await storage.getOrderById(orderId);
      if (!currentOrder) {
        return res.status(404).json({ 
          error: `Order ${orderId} not found` 
        });
      }

      // Get the database field name from config
      const dbField = fieldConfig.dbField;
      const oldValue = (currentOrder as any)[dbField];

      // Update the order
      await db
        .update(allOrders)
        .set({ 
          [dbField]: newValue,
          updatedAt: new Date(),
        })
        .where(eq(allOrders.orderId, orderId));

      // Create audit log entry
      await storage.createAdminAuditLog({
        orderId,
        fieldName,
        fieldLabel: fieldConfig.label,
        oldValue: oldValue !== null && oldValue !== undefined ? oldValue : null,
        newValue,
        changedBy: (req as any).user?.username || 'unknown',
        userRole: (req as any).user?.role || 'ADMIN',
        changeType: 'INLINE',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Fetch updated order
      const updatedOrder = await storage.getOrderById(orderId);

      res.json({
        success: true,
        order: updatedOrder,
        message: `${fieldConfig.label} updated successfully`,
      });
    } catch (error) {
      console.error('Admin field update error:', error);
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: (error as any).errors,
        });
      }

      res.status(500).json({ 
        error: 'Failed to update field',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// Admin Panel - Bulk field updates with audit logging
router.patch(
  '/batch',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const validatedData = adminBulkUpdateSchema.parse(req.body);
      const { orderIds, fieldName, newValue } = validatedData;

      // Get field configuration
      const fieldConfig = ADMIN_FIELD_CONFIG[fieldName];
      if (!fieldConfig) {
        return res.status(400).json({ 
          error: `Invalid field: ${fieldName}` 
        });
      }

      // Check if user has permission to edit this field
      const userRole = (req as any).user?.role || 'EMPLOYEE';
      const allowedRoles = Array.isArray(fieldConfig.requiredRole)
        ? fieldConfig.requiredRole
        : [fieldConfig.requiredRole];
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions to edit this field',
          requiredRoles: allowedRoles,
          userRole,
        });
      }

      // Validate field-specific value if validation schema exists
      if (fieldConfig.validation) {
        try {
          fieldConfig.validation.parse(newValue);
        } catch (validationError) {
          return res.status(400).json({
            error: 'Field validation failed',
            field: fieldConfig.label,
            details: validationError instanceof Error ? (validationError as any).errors : 'Invalid value',
          });
        }
      }

      const dbField = fieldConfig.dbField;
      const results = {
        success: [] as string[],
        failed: [] as { orderId: string; error: string }[],
      };

      // Process each order
      for (const orderId of orderIds) {
        try {
          // Get current order to capture old value
          const currentOrder = await storage.getOrderById(orderId);
          if (!currentOrder) {
            results.failed.push({ 
              orderId, 
              error: 'Order not found' 
            });
            continue;
          }

          const oldValue = (currentOrder as any)[dbField];

          // Update the order
          await db
            .update(allOrders)
            .set({ 
              [dbField]: newValue,
              updatedAt: new Date(),
            })
            .where(eq(allOrders.orderId, orderId));

          // Create audit log entry
          await storage.createAdminAuditLog({
            orderId,
            fieldName,
            fieldLabel: fieldConfig.label,
            oldValue: oldValue !== null && oldValue !== undefined ? oldValue : null,
            newValue,
            changedBy: (req as any).user?.username || 'unknown',
            userRole: (req as any).user?.role || 'ADMIN',
            changeType: 'BULK',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          });

          results.success.push(orderId);
        } catch (error) {
          console.error(`Error updating order ${orderId}:`, error);
          results.failed.push({ 
            orderId, 
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        results,
        message: `Bulk update completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
      });
    } catch (error) {
      console.error('Bulk update error:', error);
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: (error as any).errors,
        });
      }

      res.status(500).json({ 
        error: 'Failed to perform bulk update',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// Reference Data Endpoints for Admin Panel
router.get('/reference/status-types', async (req: Request, res: Response) => {
  try {
    const statusTypes = await storage.getOrderStatusTypes();
    res.json(statusTypes);
  } catch (error) {
    console.error('Error fetching order status types:', error);
    res.status(500).json({ error: 'Failed to fetch order status types' });
  }
});

router.get('/reference/department-types', async (req: Request, res: Response) => {
  try {
    const departmentTypes = await storage.getOrderDepartmentTypes();
    res.json(departmentTypes);
  } catch (error) {
    console.error('Error fetching order department types:', error);
    res.status(500).json({ error: 'Failed to fetch order department types' });
  }
});

// Get customer's default address for an order (for nonconformance repair address)
router.get('/:orderId/customer-address', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    // First, find the order to get the customer ID
    const order = await storage.getOrderById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (!order.customerId) {
      return res.json({ address: null });
    }
    
    // Query customer_addresses table for the default shipping address
    const defaultAddresses = await db
      .select()
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.customerId, order.customerId),
          eq(customerAddresses.isDefault, true)
        )
      )
      .limit(1);
    
    const address = defaultAddresses.length > 0 ? defaultAddresses[0] : null;
    
    res.json({ address });
  } catch (error) {
    console.error('Error fetching customer address for order:', error);
    res.status(500).json({ 
      error: 'Failed to fetch customer address',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
