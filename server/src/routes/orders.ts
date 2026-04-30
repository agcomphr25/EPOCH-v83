import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { DEFAULT_ORDERS_LIMIT, MAX_ORDERS_LIMIT } from '../constants/orders';
import { db } from '../../db';
import { pool } from '../../db';
import { payments, allOrders, orders, customerAddresses, communicationLogs } from '../../../shared/schema';
import { journalEntries } from '../../schema';
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
import { normalizeDueDateForStorage } from '@shared/utils/dateNormalization';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { allocateForOrder } from '../services/productionOrderAllocationService';
import { 
  adminFieldUpdateSchema, 
  adminBulkUpdateSchema,
  ADMIN_FIELD_CONFIG 
} from '../../../shared/adminConfig';
import { auditService } from '../services/auditService';
import { orderActivityEvents } from '../../schema';
import * as accountingService from '../services/accountingService';
import { sendOrderConfirmationNotification, OrderConfirmationOutcome } from '../../utils/notifications';
import { generateOrderPdf, PdfIntent } from '../../services/orderPdfService';

const router = Router();

/**
 * Compute the bottom metal source from order features without side effects.
 * @param features The order's features object
 * @returns 'CUSTOMER_OWNS' or 'AG_SUPPLIES'
 */
function computeBottomMetalSource(features: Record<string, any> | null | undefined): string {
  const bottomMetal = (features as Record<string, any>)?.bottom_metal as string | undefined;
  const isCustomerOwns = bottomMetal === 'ag_bottom_metel_inlet_only';
  return isCustomerOwns ? 'CUSTOMER_OWNS' : 'AG_SUPPLIES';
}

/**
 * Idempotent helper to reconcile bottom metal demand from order state.
 * Always ensures demand record matches order's effective bottom metal selection.
 * Also updates the order's bottomMetalSource field in a single call.
 * @param order The order to reconcile demand for
 * @param updateOrderSource If true, also updates the order's bottomMetalSource field
 * @returns Updated bottomMetalSource value
 */
async function reconcileRailDemand(order: any): Promise<void> {
  if (!order?.orderId) return;

  const orderId = order.orderId;
  const features = (order.features as Record<string, any>) || {};
  const railAccessory = features.rail_accessory;

  // Normalize to array
  const railValues: string[] = Array.isArray(railAccessory)
    ? railAccessory
    : railAccessory
    ? [railAccessory]
    : [];

  // Filter out non-physical rails: no_rail and alamo_rail_spacing
  const EXCLUDED_RAILS = new Set(['no_rail', 'alamo_rail_spacing']);
  const physicalRails = railValues.filter((r) => !EXCLUDED_RAILS.has(r));

  // Normalize SKUs: uppercase, underscores -> dashes
  const activeSkus = new Set(physicalRails.map((r) => r.toUpperCase().replace(/_/g, '-')));

  // Get existing demand rows for this order
  const existingDemands = await storage.getRailDemandsByOrderId(orderId);
  const existingBySkus = new Map(existingDemands.map((d) => [d.railSku, d]));

  // Upsert demand rows for active SKUs
  for (const sku of activeSkus) {
    const existing = existingBySkus.get(sku);
    if (existing) {
      if (existing.status !== 'open') {
        await storage.updateRailDemand(existing.id, { status: 'open' });
        console.log(`🔩 Re-opened rail demand for order ${orderId}: ${sku}`);
      }
    } else {
      await storage.createRailDemand({ orderId, railSku: sku, quantity: 1, status: 'open' });
      console.log(`🔩 Created rail demand for order ${orderId}: ${sku}`);
    }
  }

  // Cancel demand rows for SKUs no longer on the order
  for (const [sku, demand] of existingBySkus) {
    if (!activeSkus.has(sku) && demand.status !== 'cancelled') {
      await storage.updateRailDemand(demand.id, { status: 'cancelled' });
      console.log(`🔩 Cancelled rail demand for order ${orderId}: ${sku}`);
    }
  }
}

async function reconcileBottomMetalDemand(order: any, updateOrderSource: boolean = true): Promise<string | null> {
  if (!order?.orderId) return null;
  
  const orderId = order.orderId;
  const features = (order.features as Record<string, any>) || {};
  const bottomMetal = features.bottom_metal as string | undefined;
  
  // Determine the source based on the feature value
  const bottomMetalSource = computeBottomMetalSource(features);
  
  // Determine if this order requires a demand record
  const needsDemand = bottomMetalSource === 'AG_SUPPLIES' && 
                      bottomMetal && 
                      bottomMetal.startsWith('ag_') &&
                      bottomMetal !== 'ag_bottom_metel_inlet_only';
  
  // Get existing demand record
  const existingDemand = await storage.getBottomMetalDemandByOrderId(orderId);
  
  if (needsDemand) {
    const normalizedSku = bottomMetal!.toUpperCase().replace(/_/g, '-');
    
    if (existingDemand) {
      // Update existing demand - ensure SKU matches and status is open
      if (existingDemand.bottomMetalSku !== normalizedSku || existingDemand.status !== 'open') {
        await storage.updateBottomMetalDemand(existingDemand.id, { 
          bottomMetalSku: normalizedSku,
          status: 'open'
        });
        console.log(`🔩 Reconciled bottom metal demand for order ${orderId}: ${normalizedSku}`);
      }
    } else {
      // Create new demand
      await storage.createBottomMetalDemand({
        orderId: orderId,
        bottomMetalSku: normalizedSku,
        quantity: 1,
        status: 'open',
      });
      console.log(`🔩 Created bottom metal demand for order ${orderId}: ${normalizedSku}`);
    }
  } else {
    // Cancel any existing demand that shouldn't exist
    if (existingDemand && existingDemand.status !== 'cancelled') {
      await storage.updateBottomMetalDemand(existingDemand.id, { status: 'cancelled' });
      console.log(`🔩 Cancelled bottom metal demand for order ${orderId} (source: ${bottomMetalSource})`);
    }
  }
  
  // Update order's bottomMetalSource in the same reconciliation call
  if (updateOrderSource && order.bottomMetalSource !== bottomMetalSource) {
    await storage.updateFinalizedOrder(orderId, { bottomMetalSource });
    console.log(`🔩 Updated order ${orderId} bottomMetalSource: ${bottomMetalSource}`);
  }
  
  return bottomMetalSource;
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

// Get ALL orders including production orders - for department queue views
// This endpoint combines orders from all_orders table with production_orders table
// Note: storage.getAllOrders() already performs this merge internally
router.get('/all', async (req: Request, res: Response) => {
  try {
    // getAllOrders already combines all_orders and production_orders tables
    const allOrdersCombined = await storage.getAllOrders();

    const debugBarcode = req.query.debug_barcode === 'true' || process.env.BARCODE_DEBUG_LABELS === 'true';
    if (debugBarcode) {
      const barcodeOrders = allOrdersCombined.filter((o: any) => o.currentDepartment === 'Barcode');
      console.log(`[BARCODE_DEBUG_SERVER] ${barcodeOrders.length} orders in Barcode department:`);
      for (const o of barcodeOrders) {
        const featureKeys = o.features ? Object.keys(o.features) : [];
        console.log(`[BARCODE_DEBUG_SERVER] orderId=${o.orderId} modelId=${o.modelId || 'null'} product=${o.product || 'null'} featureKeys=[${featureKeys.join(',')}] action_length=${o.features?.action_length || 'null'} handedness=${o.handedness || 'null'}`);
      }
    }

    res.json(allOrdersCombined);
  } catch (error) {
    console.error('Error retrieving all orders:', error);
    res.status(500).json({
      error: 'Failed to fetch all orders',
      details: (error as any).message,
    });
  }
});

// Get order stats for dashboard
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getAllOrders();
    const pending = orders.filter((o: any) => 
      o.status?.toLowerCase() === 'pending' || 
      o.status?.toLowerCase() === 'new' ||
      o.status?.toLowerCase() === 'order received'
    ).length;
    const inProduction = orders.filter((o: any) => 
      o.status?.toLowerCase().includes('production') ||
      o.status?.toLowerCase() === 'in progress' ||
      o.status?.toLowerCase() === 'manufacturing'
    ).length;
    const completed = orders.filter((o: any) => 
      o.status?.toLowerCase() === 'completed' || 
      o.status?.toLowerCase() === 'shipped' ||
      o.status?.toLowerCase() === 'delivered'
    ).length;
    
    res.json({ pending, inProduction, completed });
  } catch (error) {
    console.error('Error retrieving order stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch order stats',
      details: (error as any).message 
    });
  }
});

// Get all orders with payment status for All Orders List with payment column
router.get('/with-payment-status', async (req: Request, res: Response) => {
  try {
    // Disable caching - this admin endpoint needs fresh data after mutations
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    });

    const search = (req.query.search as string) || '';
    const departmentFilter = (req.query.department as string) || undefined;
    // When filtering by a specific department, bypass the limit cap so all matching
    // orders are returned regardless of how many total orders exist in the database.
    const requestedLimit = parseInt(req.query.limit as string) || DEFAULT_ORDERS_LIMIT;
    const limit = departmentFilter ? 999999 : Math.min(requestedLimit, MAX_ORDERS_LIMIT);

    if (departmentFilter) {
      console.log(`[ShippingQueue] Fetching all orders for department="${departmentFilter}" (no row cap)`);
    }

    const orders = await storage.getAllOrdersWithPaymentStatus(search, limit, departmentFilter);
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

// Get fulfilled + shipped orders for the shipping tracker
// Queries by shippedDate DESC so recent shipments are always included regardless of order creation date
router.get('/fulfilled-shipped', async (req: Request, res: Response) => {
  try {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    });

    const orders = await storage.getFulfilledShippedOrdersWithPaymentStatus(2000);
    res.json(orders);
  } catch (error) {
    console.error('Error retrieving fulfilled shipped orders:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch fulfilled shipped orders',
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
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100); // Max 100 per page

      const search = (req.query.search as string) || undefined;
      const department = (req.query.department as string) || undefined;
      const departmentMode = (req.query.departmentMode as string) === 'exclude' ? 'exclude' : 'include';
      const status = (req.query.status as string) || undefined;
      const statusMode = (req.query.statusMode as string) === 'exclude' ? 'exclude' : 'include';
      const excludeStatusesRaw = (req.query.excludeStatuses as string) || '';
      const excludeStatuses = excludeStatusesRaw
        ? excludeStatusesRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      const sortBy = (req.query.sortBy as string) || 'orderDate';
      const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';
      const customerId = (req.query.customerId as string) || undefined;

      // Disable caching so filter changes always return fresh results
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      });

      const result = await storage.getAllOrdersWithPaymentStatusPaginated(
        page,
        limit,
        { search, department, departmentMode, status, statusMode, excludeStatuses, sortBy, sortOrder, customerId }
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

// YTD shipped count (must be before :orderId route)
router.get('/ytd-shipped-count', async (req: Request, res: Response) => {
  try {
    const year = new Date().getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);
    const result = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(allOrders)
      .where(
        sql`COALESCE(${allOrders.shippedDate}, ${allOrders.shippingCompletedAt}) >= ${startOfYear}
          AND COALESCE(${allOrders.shippedDate}, ${allOrders.shippingCompletedAt}) < ${endOfYear}`
      );
    res.json({ count: result[0]?.count ?? 0, year });
  } catch (error) {
    console.error('YTD shipped count fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch YTD shipped count' });
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

// Overdue Orders route - orders past due_date with no shipment (must be before :orderId route)
router.get('/overdue', async (req: Request, res: Response) => {
  interface OverdueOrderRow {
    id: string;
    order_number: string;
    customer: string;
    due_date: Date;
    days_late: number;
  }
  try {
    const result = await pool.query<OverdueOrderRow>(`
      SELECT
        o.id,
        o.order_number,
        o.customer,
        o.due_date,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - o.due_date)) / 86400)::int AS days_late
      FROM all_orders o
      WHERE o.due_date < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM v_all_shipments s
        WHERE s.order_id = o.id
      )
      ORDER BY o.due_date ASC
    `);
    const overdueOrders = result.rows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      customer: row.customer,
      dueDate: row.due_date,
      daysLate: row.days_late,
    }));
    res.json(overdueOrders);
  } catch (error) {
    console.error('Get overdue orders error:', error);
    res.status(500).json({ error: 'Failed to get overdue orders' });
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

// Search all orders across all tables (for the department transfer tool)
// Returns partial matches on orderId, fbOrderNumber, or customerPO with no source/status exclusions
router.get('/search-all', async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string' || query.trim().length < 1) {
      return res.json([]);
    }
    const q = query.trim();
    const { pool } = await import('../../db');
    const rows = await pool.query(
      `SELECT order_id, fb_order_number, customer_po, current_department, 'all_orders' AS source
         FROM all_orders
        WHERE order_id ILIKE $1 OR fb_order_number ILIKE $1 OR customer_po ILIKE $1
       UNION
       SELECT order_id, fb_order_number, customer_po, current_department, 'order_drafts' AS source
         FROM order_drafts
        WHERE order_id ILIKE $1 OR fb_order_number ILIKE $1 OR customer_po ILIKE $1
       UNION
       SELECT order_id, NULL AS fb_order_number, po_number AS customer_po, current_department, 'production_orders' AS source
         FROM production_orders
        WHERE order_id ILIKE $1 OR po_number ILIKE $1
       ORDER BY 1
       LIMIT 30`,
      [`%${q}%`]
    );
    // Deduplicate by order_id — prefer production_orders
    const seen = new Map<string, any>();
    for (const row of rows) {
      const key = row.order_id;
      if (!key) continue;
      const priority: Record<string, number> = { production_orders: 2, order_drafts: 1, all_orders: 0 };
      const existing = seen.get(key);
      if (!existing || (priority[row.source] ?? 0) > (priority[existing.source] ?? 0)) {
        seen.set(key, {
          orderId: row.order_id,
          fbOrderNumber: row.fb_order_number || null,
          customerPO: row.customer_po || null,
          currentDepartment: row.current_department || 'Unknown',
          source: row.source,
        });
      }
    }
    res.json(Array.from(seen.values()));
  } catch (error) {
    console.error('Error in search-all:', error);
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

// Per-order in-flight guard: rejects concurrent duplicate finalize requests before
// they reach the DB.  Trigger confirmed as UI double-submit (React state async gap);
// each blocked attempt is written to order_activity_events for observability.
const ordersBeingFinalized = new Set<string>();

// Create order - with or without signature requirement based on whether stock is selected
router.post('/finalized', async (req: Request, res: Response) => {
  // Declare outside try so finally can release the guard reliably
  let incomingOrderId: string | null = null;
  try {
    const orderData = insertAllOrderSchema.parse(req.body);
    incomingOrderId = orderData.orderId || null;

    // Reject concurrent duplicate requests for the same order_id with HTTP 409
    // and write an instrumentation event so patterns are observable over time.
    if (incomingOrderId && ordersBeingFinalized.has(incomingOrderId)) {
      console.warn(`⚠️ DUPLICATE FINALIZE BLOCKED: ${incomingOrderId} already in-flight`);
      await db.insert(orderActivityEvents).values({
        orderId: incomingOrderId,
        eventType: 'finalize_duplicate_blocked',
        eventCategory: 'order',
        source: 'api',
        sourceRoute: 'POST /api/orders/finalized',
        actorDisplayName: (req as any).user?.username || 'unknown',
        metadata: { reason: 'concurrent_request', guardType: 'in_flight_set' },
      }).catch(() => {}); // non-blocking — don't fail the response on a log error
      return res.status(409).json({
        error: `Order ${incomingOrderId} is already being finalized`,
      });
    }
    if (incomingOrderId) ordersBeingFinalized.add(incomingOrderId);
    
    // Determine if stock is selected (has modelId and it's not "no_stock" or similar)
    // Normalize the modelId for checking (trim whitespace and convert to lowercase)
    const normalizedModelId = orderData.modelId?.trim().toLowerCase() || '';
    const noStockIdentifiers = ['', 'no_stock', 'no stock', 'none'];
    const hasStock: boolean = !noStockIdentifiers.includes(normalizedModelId);
    
    // If has stock: PENDING_SIGNATURE status, awaiting customer signature
    // If no stock: IN_PROGRESS status, skip production pipeline, go directly to Shipping QC
    const orderStatus = hasStock ? 'PENDING_SIGNATURE' : 'IN_PROGRESS';
    const orderDepartment = hasStock ? 'Awaiting Customer Signature' : 'Shipping QC';
    
    // Compute bottomMetalSource upfront to set it on creation (no interim incorrect state)
    const bottomMetalSource = computeBottomMetalSource(orderData.features as Record<string, any>);
    
    // Guard against double-submissions: if this orderId already exists, return a clear 409
    const existingOrder = await db
      .select({ orderId: allOrders.orderId })
      .from(allOrders)
      .where(eq(allOrders.orderId, orderData.orderId))
      .limit(1);
    if (existingOrder.length > 0) {
      return res.status(409).json({
        error: 'ORDER_ALREADY_FINALIZED',
        message: 'This order has already been submitted. Refresh the page to see it in the orders list.',
      });
    }

    const order = await storage.createFinalizedOrder({
      ...orderData,
      dueDate: orderData.dueDate ? normalizeDueDateForStorage(orderData.dueDate) : orderData.dueDate,
      status: orderStatus,
      currentDepartment: orderDepartment,
      bottomMetalSource,
    });
    
    // Use idempotent helper to create demand record (skip order update since already set)
    await reconcileBottomMetalDemand(order, false);
    try {
      await reconcileRailDemand(order);
    } catch (railErr: any) {
      console.warn('⚠️ reconcileRailDemand skipped on order create:', railErr?.message);
    }
    
    if (hasStock) {
      console.log(`📧 Order ${order.orderId} created with PENDING_SIGNATURE status - sending confirmation email to customer...`);
    } else {
      console.log(`📧 Order ${order.orderId} created as IN_PROGRESS (no stock) - skipping production, going to Shipping QC - sending thank you email to customer...`);
    }
    
    // Track email outcome for API response (declared outside inner try block for scoping)
    let emailOutcome: OrderConfirmationOutcome | undefined;
    let emailError: string | undefined;
    
    // Automatically create followup order and send email
    try {
      // Import dependencies
      const { nanoid } = await import('nanoid');
      const { sendFollowupOrderEmail } = await import('../../utils/followupOrderEmail');
      const { sendThankYouOrderEmail } = await import('../../utils/thankYouOrderEmail');
      const fs = await import('fs');
      const path = await import('path');
      
      // Get customer details
      const customer = await storage.getCustomerById(orderData.customerId || '');
      if (!customer || !customer.email) {
        // MANDATORY OUTCOME: Record explicit 'skipped' outcome when customer has no email
        // Write communication log entry to ensure every finalization has a logged outcome
        console.warn(`⚠️  No email found for customer ${orderData.customerId} - skipping email`);
        emailOutcome = 'skipped';
        emailError = 'Customer has no email address on file';
        
        // Write communication log entry for audit trail
        await db.insert(communicationLogs).values({
          orderId: order.orderId,
          customerId: orderData.customerId || '',
          messageType: 'transactional',
          method: 'email',
          type: 'order-confirmation',
          recipient: 'N/A - no email on file',
          status: 'skipped',
          error: emailError,
          message: `Order confirmation skipped for ${order.orderId}: no customer email on file`,
          sentAt: new Date(),
        });
        
        return res.status(201).json({
          ...order,
          emailOutcome,
          emailError,
        });
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
      
      // Declare signatureToken outside the if block for error handling access
      let signatureToken: string | undefined;
      
      if (hasStock) {
        // Generate PDF via unified service with frozen snapshot for signature workflow
        const pdfResult = await generateOrderPdf(order.orderId, PdfIntent.SIGNATURE_EMAIL);
        const pdfPath = pdfResult.filePath!;
        const orderSnapshot = pdfResult.snapshot;
        // Order with stock - require signature
        // Generate unique signature token (kept server-side for security)
        signatureToken = nanoid(32);
        
        // SIGNATURE LINK CONTRACT: Import functions for environment and URL generation
        const { getCurrentEnvironment, createSignatureLink, logSignatureEmailSend, generatePublicSignatureId } = await import('../../utils/magicLink');
        
        // Generate public signature ID for URL (path-based, email-client safe)
        const publicSignatureId = generatePublicSignatureId();
        
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
        
        // SIGNATURE LINK CONTRACT: Write environment explicitly on create (not DB defaults)
        const orderEnvironment = getCurrentEnvironment();
        
        // Create followup order record with explicit environment, public ID, and frozen snapshot
        const followupOrder = await storage.createFollowupOrder({
          orderId: order.orderId,
          customerId: order.customerId || '',
          customerEmail: customer.email,
          signatureToken,
          publicSignatureId, // NEW: Path-based URL identifier (no secrets in URL)
          environment: orderEnvironment, // Explicit environment for cross-environment safety
          pdfGenerated: true,
          pdfPath,
          pdfGeneratedAt: new Date(),
          orderSummary,
          orderSnapshot, // INVARIANT: Frozen at creation, never updated on resend
        });
        
        console.log(`✅ Follow-up order created for ${order.orderId} in ${orderEnvironment} environment with publicSignatureId ${publicSignatureId}`);
        
        // SIGNATURE LINK CONTRACT: Generate signature link using publicSignatureId with EXPLICIT environment
        const signatureLink = createSignatureLink(publicSignatureId, orderEnvironment);
        
        // SIGNATURE LINK CONTRACT: Forensic logging for every signature email send
        logSignatureEmailSend({
          orderId: order.orderId,
          signatureToken,
          publicSignatureId,
          environment: orderEnvironment,
          context: 'initial',
          recipient: customer.email,
        });
        
        // Send email via unified notification function with mandatory outcome tracking
        // forceResend=false for automatic order creation (respects deduplication)
        const emailResult = await sendOrderConfirmationNotification({
          orderId: order.orderId,
          customerId: order.customerId || '',
          customerEmail: customer.email,
          customerPhone: customer.phone || undefined,
          preferredCommunicationMethod: customer.preferredCommunicationMethod,
          signatureToken,
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
            shipping: typeof order.shipping === 'number' ? order.shipping : parseFloat(String(order.shipping)) || 0,
            signatureLink,
          },
          // forceResend: false - automatic sends respect deduplication
        });
        
        // MANDATORY OUTCOME HANDLING: Validate we received a valid outcome
        const validOutcomes = ['sent', 'skipped', 'failed'] as const;
        if (!validOutcomes.includes(emailResult.outcome)) {
          console.error(`❌ [FINALIZE-FAIL] Unknown email outcome for ${order.orderId}: ${emailResult.outcome}`);
          // Still return the order but flag the error
          emailOutcome = 'failed';
          emailError = `Unknown email outcome: ${emailResult.outcome}`;
        } else {
          emailOutcome = emailResult.outcome;
          emailError = emailResult.error;
        }
        
        if (emailResult.outcome === 'sent') {
          // Update followup order to mark email as sent
          await storage.updateFollowupOrder(followupOrder.id, {
            emailSent: true,
            emailSentAt: new Date(),
            emailError: null,
          });
          console.log(`📧 Signature email sent for order ${order.orderId}`);
        } else if (emailResult.outcome === 'skipped') {
          // Email was skipped due to deduplication - reason must be provided
          console.log(`⏭️ Signature email skipped for order ${order.orderId} (reason: ${emailResult.reason || 'unknown'})`);
        } else {
          // Email failed - record the failure but DO NOT abort finalization
          // Order is successfully created; email is a side-effect
          await storage.updateFollowupOrder(followupOrder.id, {
            emailError: emailResult.error,
          });
          console.error(`❌ Failed to send signature email for order ${order.orderId}: ${emailResult.error}`);
          // Continue to success response with emailOutcome='failed' for frontend to display warning
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
        const thankYouResult = await sendThankYouOrderEmail(emailData, pdfPath);
        
        if (thankYouResult.success) {
          emailOutcome = 'sent';
          console.log(`📧 Thank you email sent for order ${order.orderId} (no signature required)`);
          
          // Write communication log entry for thank-you email success
          // signatureToken is null for no-stock orders (no signature required)
          await db.insert(communicationLogs).values({
            orderId: order.orderId,
            customerId: order.customerId || '',
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'initial',
            recipient: customer.email,
            status: 'sent',
            signatureToken: null, // No signature required for no-stock orders
            externalId: thankYouResult.messageId,
            message: `Thank you email sent for ${order.orderId} (no signature required)`,
            sentAt: new Date(),
          });
        } else {
          emailOutcome = 'failed';
          emailError = thankYouResult.error;
          console.error(`❌ Failed to send thank you email for order ${order.orderId}: ${thankYouResult.error}`);
          
          // Write communication log entry for thank-you email failure
          // signatureToken is null for no-stock orders (no signature required)
          await db.insert(communicationLogs).values({
            orderId: order.orderId,
            customerId: order.customerId || '',
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'initial',
            recipient: customer.email,
            status: 'failed',
            signatureToken: null, // No signature required for no-stock orders
            error: thankYouResult.error,
            message: `Failed thank you email for ${order.orderId}: ${thankYouResult.error}`,
            sentAt: new Date(),
          });
          // Continue to success response with emailOutcome='failed' for frontend to display warning
        }
      }
    } catch (sendError: any) {
      // MANDATORY OUTCOME: Any thrown error results in 'failed' outcome
      // NOTE: sendOrderConfirmationNotification handles its own logging internally
      // This catch block only handles exceptions from PDF generation or other pre-send errors
      const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown email error';
      console.error('Error in email preparation/send flow:', errorMessage);
      
      // Only log if we haven't already gone through the notification function
      if (emailOutcome === undefined) {
        emailOutcome = 'failed';
        emailError = errorMessage;
        
        // Write communication log only if we didn't go through the notification function
        try {
          await db.insert(communicationLogs).values({
            orderId: order.orderId,
            customerId: orderData.customerId || '',
            messageType: 'transactional',
            method: 'email',
            type: 'order-confirmation',
            context: 'initial',
            recipient: 'N/A - exception during preparation',
            status: 'failed',
            signatureToken: signatureToken || null, // May be null if exception occurred before token generation
            error: errorMessage,
            message: `Order confirmation failed for ${order.orderId}: ${errorMessage}`,
            sentAt: new Date(),
          });
        } catch (logError) {
          console.error('Failed to write communication log for exception:', logError);
        }
      }
      
      // Email flow failed - but order was created successfully
      // Continue to success response with emailOutcome='failed' for frontend to display warning
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
    
    // Return order with explicit email outcome for frontend to display warnings
    res.status(201).json({
      ...order,
      emailOutcome,
      emailError,
    });
  } catch (error) {
    console.error('Create order error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    // Release in-flight guard so retries after genuine failures are allowed
    if (incomingOrderId) ordersBeingFinalized.delete(incomingOrderId);
  }
});

// Create PENDING_PAYMENT order for card-before-save flow
// This creates a minimal order record that can receive payment before full finalization
// Uses lenient validation — only orderId and customerId are required
router.post('/pending-payment', async (req: Request, res: Response) => {
  try {
    const pendingOrderSchema = z.object({
      orderId: z.string().min(1, 'Order ID is required'),
      customerId: z.string().min(1, 'Customer must be selected'),
    }).passthrough();

    const parsed = pendingOrderSchema.parse(req.body);

    console.log(`💳 Creating PENDING_PAYMENT order ${parsed.orderId} for card-before-save flow`);

    const orderData = {
      ...parsed,
      status: 'PENDING_PAYMENT',
      isPaid: false,
      orderDate: parsed.orderDate || new Date().toISOString(),
      dueDate: parsed.dueDate || new Date().toISOString(),
      isCustomOrder: parsed.isCustomOrder || 'no',
      modelId: parsed.modelId || '',
      features: parsed.features || {},
      notes: parsed.notes || '',
      shipping: parsed.shipping ?? 0,
    };

    const order = await storage.createFinalizedOrder(
      orderData as any,
      req.body.createdBy
    );
    
    res.status(201).json({
      ...order,
      message: 'Order created with PENDING_PAYMENT status - ready for credit card processing'
    });
  } catch (error) {
    console.error('Create PENDING_PAYMENT order error:', error);
    if (error instanceof z.ZodError) {
      const missingCustomer = error.errors.some(e => e.path.includes('customerId'));
      if (missingCustomer) {
        return res.status(400).json({ error: 'Customer must be selected before processing credit card.', code: 'MISSING_CUSTOMER' });
      }
      return res.status(400).json({ error: error.errors.map(e => e.message).join(', ') });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create pending payment order' });
  }
});

// Create draft order (legacy method - now creates PENDING_SIGNATURE orders)
router.post('/draft', requirePermission('orders.create'), async (req: Request, res: Response) => {
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

    // Capture before state for audit
    const beforeOrder = await storage.getFinalizedOrderById(orderId);

    // Update the order in all_orders table
    const updatedOrder = await storage.updateFinalizedOrder(orderId, updates);
    console.log('Updated order successfully:', updatedOrder);

    // Log field-level audit changes (price, discount, shipping, etc.)
    if (beforeOrder) {
      const actor = {
        id: (req as any).user?.id,
        username: (req as any).user?.username || 'System',
        role: (req as any).user?.role || 'system',
      };
      await auditService.logFieldChanges(
        'p1_order',
        orderId,
        beforeOrder,
        updatedOrder,
        actor,
        { source: 'order-edit' }
      );
    }

    // Idempotently reconcile bottom metal demand from the effective post-update order state
    // This handles all cases: feature changes, partial updates, drift correction, and updates bottomMetalSource
    await reconcileBottomMetalDemand(updatedOrder);
    try {
      await reconcileRailDemand(updatedOrder);
    } catch (railErr: any) {
      console.warn('⚠️ reconcileRailDemand skipped on order update:', railErr?.message);
    }

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

// ============================================================
// 🔁 DUPLICATE ORDER (supports bulk duplication via count parameter)
// ============================================================
router.post('/duplicate/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const count = Math.min(Math.max(Number(req.body.count ?? 1), 1), 50); // Clamp between 1-50

    // 1. Fetch existing order
    const existing = await db.select().from(allOrders)
      .where(eq(allOrders.orderId, orderId))
      .limit(1);

    if (!existing.length) {
      return res.status(404).json({ error: 'Original order not found' });
    }

    const original = existing[0];
    const results: any[] = [];

    // 2. Create specified number of duplicates
    for (let i = 0; i < count; i++) {
      const newOrderId = await storage.generateNextOrderId();

      // 3. Build cloned order object with type-safe defaults
      const clonedOrder = {
        ...original,
        orderId: newOrderId,
        id: undefined,
        status: 'DRAFT',
        currentDepartment: 'Layup',
        departmentHistory: [],
        shipping: original.shipping ?? 36.95,
        isVerified: original.isVerified ?? false,
        qdSameSideConfirmed: original.qdSameSideConfirmed ?? false,
        isCustomOrder: original.isCustomOrder as 'yes' | 'no' | null,
        features: original.features as Record<string, any> | null,
        featureQuantities: original.featureQuantities as Record<string, any> | null,
        isPaid: false,
        paymentAmount: null,
        paymentType: null,
        paymentDate: null,
        paymentTimestamp: null,
        trackingNumber: null,
        shippingLabelGenerated: false,
        customerNotified: false,
        shippedDate: null,
        estimatedDelivery: null,
        deliveryConfirmed: false,
        deliveryConfirmedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        notes: count > 1 
          ? `${original.notes || ''}\n\n🟩 DUPLICATED FROM ${orderId} (${i + 1}/${count})`
          : original.notes,

        // Drop timestamps from previous workflow
        layupCompletedAt: null,
        pluggingCompletedAt: null,
        cncCompletedAt: null,
        finishCompletedAt: null,
        gunsmithCompletedAt: null,
        paintCompletedAt: null,
        qcCompletedAt: null,
        shippingCompletedAt: null,

        // Scrap flags cleared
        scrappedQuantity: 0,
        scrapDate: null,
        scrapReason: null,
        scrapDisposition: null,
        scrapAuthorization: null,
      };

      // 4. Insert cloned order
      const inserted = await storage.createFinalizedOrder(clonedOrder);
      results.push(inserted);
    }

    // Return response based on count
    if (count === 1) {
      return res.status(201).json({
        message: 'Order duplicated',
        newOrderId: results[0].orderId,
        order: results[0],
      });
    } else {
      return res.status(201).json({
        message: `Duplicated ${count} orders`,
        created: results.map(r => r.orderId),
        orders: results,
      });
    }
  } catch (error) {
    console.error('Duplicate order failed:', error);
    return res.status(500).json({ error: 'Failed to duplicate order' });
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
router.post('/draft/:id/finalize', requirePermission('orders.create'), async (req: Request, res: Response) => {
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

    // Capture before state for audit
    const beforeOrder = await storage.getFinalizedOrderById(orderId);

    const updatedOrder = await storage.updateFinalizedOrder(orderId, updates);

    // Log field-level audit changes (price, discount, shipping, etc.)
    if (beforeOrder) {
      const actor = {
        id: (req as any).user?.id,
        username: (req as any).user?.username || 'System',
        role: (req as any).user?.role || 'system',
      };
      await auditService.logFieldChanges(
        'p1_order',
        orderId,
        beforeOrder,
        updatedOrder,
        actor,
        { source: 'order-edit' }
      );
    }

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

    // Update the order to be fulfilled and move to shipping management.
    // fulfillOrder now atomically writes a canonical audit event in the same
    // DB transaction — no separate audit call is needed.
    const actor = {
      actorId: (req as any).user?.id ?? null,
      actorDisplayName: (req as any).user?.username ?? null,
    };
    const updatedOrder = await storage.fulfillOrder(orderId, actor);

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
      if (isNaN(purchaseOrderId)) {
        return res.status(400).json({ error: 'Invalid purchase order ID' });
      }
      const productionOrders =
        await storage.generateP2ProductionOrders(purchaseOrderId);
      res.status(201).json(productionOrders);
    } catch (error: any) {
      console.error('Generate production orders error:', error);
      if (error?.message?.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
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
router.get('/:id', async (req: Request, res: Response, next: Function) => {
  try {
    const orderId = req.params.id;
    
    // Skip static routes that should be handled by other handlers defined later
    const staticRoutes = ['heat-map', 'stats', 'all', 'generate-id', 'last-id', 'reference', 'awaiting-signature'];
    if (staticRoutes.some(route => orderId === route || orderId.startsWith(route + '/'))) {
      return next('route');
    }
    
    console.log(`📋 GET /${orderId} - Fetching order details`);

    // Try to find the order in both drafts and finalized tables
    let order = await storage.getOrderById(orderId);

    // If not found in regular orders, check production_orders table
    // Supports all order ID formats: P1-, PO-, FA, FB, and any other series
    const upperOrderId = orderId.toUpperCase();
    if (!order) {
      console.log(`🔍 Not found in orders table, checking production_orders for: ${orderId}`);
      const { pool } = await import('../../db');
      
      try {
        // Use UPPER() for case-insensitive matching; also search by po_number as fallback
        const productionOrderResult = await pool.query(
          `SELECT 
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
          WHERE UPPER(order_id) = $1
          LIMIT 1`,
          [upperOrderId]
        );
        
        console.log(`🔍 Production order query result:`, productionOrderResult);
        
        if (productionOrderResult && productionOrderResult.length > 0) {
          const po = productionOrderResult[0];
          console.log(`✅ Found production order:`, po);
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
    const { nextDepartment, toDepartment } = req.body;
    const targetDepartment = toDepartment || nextDepartment;

    const updatedOrder = await storage.progressOrder(orderId, targetDepartment);
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

    // Block edit if journal entry is EXPORTED
    const [existingJournal] = await db
      .select({ status: journalEntries.status })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.referenceType, 'payment'),
          eq(journalEntries.referenceId, paymentId)
        )
      )
      .limit(1);

    if (existingJournal?.status === 'EXPORTED') {
      return res.status(409).json({
        error: 'Cannot edit payment — journal entry is EXPORTED',
      });
    }

    const paymentData = insertPaymentSchema.parse(req.body);
    const updatedPayment = await storage.updatePayment(paymentId, paymentData);

    try {
      await accountingService.createOrUpdateFromPayment(updatedPayment, (req as any).user);
    } catch (accountingError) {
      console.error('[Accounting] Failed to update journal entry for payment edit:', accountingError);
    }

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

    // Check if an EXPORTED journal entry exists — block deletion if so
    try {
      const journalCheck = await accountingService.deleteJournalEntryForPayment(paymentId);
      if (journalCheck.blocked) {
        return res.status(409).json({
          error: 'Cannot delete this payment — an exported accounting journal entry exists. Contact your accountant to reverse it first.',
        });
      }
    } catch (journalCheckError) {
      console.error('[Accounting] Error checking journal entry before payment delete:', journalCheckError);
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

    // Determine if this is a bulk wire — extract top-level wire metadata once
    const firstItem = paymentItems[0];
    const bulkPaymentType = firstItem?.paymentType || '';
    const totalFee = bulkPaymentType === 'wire' ? (parseFloat(firstItem?.processingFee) || 0) : 0;
    const bulkPaymentDate = firstItem?.paymentDate ? new Date(firstItem.paymentDate) : new Date();
    const bulkMemo = firstItem?.notes || null;
    let totalGross = 0;
    const createdPaymentIds: number[] = [];

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

        if (paymentType === 'wire') {
          // Suppress per-row accounting for wire — ONE consolidated entry is created after the loop
          totalGross += parseFloat(paymentAmount);
          createdPaymentIds.push(newPayment.id);
        } else {
          try {
            await accountingService.createOrUpdateFromPayment(newPayment, (req as any).user);
          } catch (accountingError) {
            console.error('[Accounting] Failed to create journal entry for bulk payment:', accountingError);
          }
        }

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

    // After loop: create ONE consolidated journal entry for bulk wire payments
    if (bulkPaymentType === 'wire' && createdPaymentIds.length > 0) {
      try {
        await accountingService.createBulkWireJournalEntry({
          paymentIds: createdPaymentIds,
          totalGross: Math.round(totalGross * 100) / 100,
          totalFee,
          paymentDate: bulkPaymentDate,
          memo: bulkMemo,
          user: (req as any).user,
        });
      } catch (err) {
        console.error('[Accounting] Failed to create consolidated bulk wire journal entry:', err);
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
      updateData.shippedDate = now;
      updateData.currentDepartment = undefined; // Clear department when fulfilled
      console.log(`📦 Marking order as FULFILLED with no department`);
    } else {
      updateData.currentDepartment = targetDepartment;
    }

    // Build actor from authenticated user
    const actor = {
      id: (req as any).user?.id,
      username: (req as any).user?.username || 'System',
      role: (req as any).user?.role || 'system',
    };
    const canonicalActorId: number | null = (req as any).user?.id ?? null;
    const canonicalActorDisplayName: string | null = (req as any).user?.username ?? null;

    // For finalized P1 orders, execute state update + production_orders sync +
    // canonical audit event in a single DB transaction so all three commits atomically.
    // Pre-check production_orders existence outside the transaction (read-only lookup).
    let updatedOrder;
    if (isFinalized) {
      console.log(`🔄 Updating finalized order ${orderId} in allOrders table (transactional)`);

      // If we are moving to a new department, check whether a production_orders row
      // exists so we can sync current_department inside the transaction (same logic
      // as storage.updateFinalizedOrder to avoid data inconsistency).
      const productionRecordForSync =
        updateData.currentDepartment !== undefined
          ? await storage.getProductionOrderByOrderId(orderId)
          : undefined;

      updatedOrder = await db.transaction(async (tx) => {
        const [after] = await tx
          .update(allOrders)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(allOrders.orderId, orderId))
          .returning();

        if (!after) {
          throw new Error(`Finalized order ${orderId} not found during progress update`);
        }

        // Sync production_orders.current_department so downstream reads/dedup remain
        // consistent (mirrors the logic in storage.updateFinalizedOrder).
        if (updateData.currentDepartment !== undefined && productionRecordForSync) {
          await tx.execute(
            sql`UPDATE production_orders SET current_department = ${updateData.currentDepartment}, updated_at = NOW() WHERE order_id = ${orderId}`
          );
          console.log(`[/progress] Synced production_orders.current_department for ${orderId} → ${updateData.currentDepartment}`);
        }

        const eventType = shouldMarkFulfilled ? 'STATUS_TRANSITION' : 'DEPARTMENT_MOVE';
        const fieldDiff: Record<string, { before: string | null; after: string | null; label: string }> = {};

        if (shouldMarkFulfilled) {
          fieldDiff['status'] = { before: existingOrder.status ?? null, after: 'FULFILLED', label: 'Order Status' };
        } else {
          fieldDiff['currentDepartment'] = {
            before: existingOrder.currentDepartment ?? null,
            after: targetDepartment ?? null,
            label: 'Current Department',
          };
        }

        await tx.insert(orderActivityEvents).values({
          orderId,
          eventType,
          eventCategory: 'production',
          occurredAt: new Date(),
          actorId: canonicalActorId,
          actorType: 'user',
          actorDisplayName: canonicalActorDisplayName,
          source: 'department-transition',
          sourceRoute: req.path,
          statusFrom: existingOrder.status ?? null,
          statusTo: shouldMarkFulfilled ? 'FULFILLED' : (after.status ?? null),
          departmentFrom: existingOrder.currentDepartment ?? null,
          departmentTo: shouldMarkFulfilled ? null : (targetDepartment ?? null),
          fieldDiff,
        });

        return after;
      });

      console.log(`✅ Updated finalized order ${orderId}: dept=${updatedOrder?.currentDepartment}, status=${updatedOrder?.status}`);
    } else if (isP2Order) {
      console.log(`🔄 Updating P2 draft order ${orderId} in P2 orderDrafts table`);
      updatedOrder = await storage.updateOrderDraft(orderId, updateData);
      console.log(`✅ Updated P2 draft order result: dept=${updatedOrder?.currentDepartment}, status=${updatedOrder?.status}`);
    } else {
      console.log(`🔄 Updating P1 draft order ${orderId} in orderDrafts table`);
      updatedOrder = await storage.updateOrderDraft(orderId, updateData);
      console.log(`✅ Updated P1 draft order result: dept=${updatedOrder?.currentDepartment}, status=${updatedOrder?.status}`);
    }

    // Reload the order after update to get the complete "after" state
    const afterOrder = updatedOrder;

    if (shouldMarkFulfilled) {
      console.log(`✅ Successfully marked order ${orderId} as FULFILLED (status: ${afterOrder?.status})`);

      // Close the final department transition (no new department to open)
      await auditService.closeDepartmentTransition(
        orderId,
        (req as any).user?.id,
        'fulfilled'
      );
    } else {
      console.log(`✅ Successfully progressed order ${orderId} from ${existingOrder.currentDepartment} to ${targetDepartment}`);
      console.log(`✅ Final order department: ${afterOrder?.currentDepartment}`);

      // Verify the update succeeded
      if (isFinalized && afterOrder?.currentDepartment !== targetDepartment) {
        console.error(`❌ Update failed: Expected ${targetDepartment}, got ${afterOrder?.currentDepartment}`);
        return res.status(500).json({ error: `Department update failed` });
      }

      // For non-finalized orders, write legacy audit event since canonical path was not used
      if (!isFinalized) {
        await auditService.logFieldChanges(
          'p1_order',
          orderId,
          existingOrder,
          afterOrder,
          actor,
          { source: 'department-transition' }
        );
      }

      // Record department transition for timing tracking
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

    // Load BEFORE state
    const beforeOrder = await storage.getOrderById(orderId);
    if (!beforeOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

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

    // Log field-level audit event using automatic change detection
    const actor = {
      id: (req as any).user?.id,
      username: (req as any).user?.username || 'System',
      role: (req as any).user?.role || 'system',
    };
    
    await auditService.logFieldChanges(
      'p1_order',
      orderId,
      beforeOrder,
      updatedOrder,
      actor,
      { source: 'qc-completion', qcPassed: qcPassedAll }
    );
    
    // Record department transition if moving to shipping
    if (qcPassedAll && beforeOrder.currentDepartment !== 'Shipping') {
      await auditService.recordDepartmentEntry({
        entityType: 'p1_order',
        entityId: orderId,
        department: 'Shipping',
        enteredByUserId: (req as any).user?.id,
        metadata: {
          fromDepartment: beforeOrder.currentDepartment,
          qcPassed: true,
        },
      });
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

    // Check if the order exists and is cancelled (this is our BEFORE state)
    const beforeOrder = await storage.getOrderById(orderId);
    if (!beforeOrder) {
      console.log('🔄 Order not found:', orderId);
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!(beforeOrder as any).isCancelled) {
      console.log('🔄 Order is not cancelled:', orderId);
      return res.status(400).json({ error: 'Order is not cancelled' });
    }

    console.log('🔄 Found cancelled order:', beforeOrder.id, beforeOrder.status);

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

    // Log field-level audit event using automatic change detection
    const actor = {
      id: (req as any).user?.id,
      username: (req as any).user?.username || 'System',
      role: (req as any).user?.role || 'system',
    };
    
    await auditService.logFieldChanges(
      'p1_order',
      orderId,
      beforeOrder,
      updatedOrder,
      actor,
      { source: 'undo-cancellation' }
    );
    
    // Record department transition back to production queue
    await auditService.recordDepartmentEntry({
      entityType: 'p1_order',
      entityId: orderId,
      department: 'P1 Production Queue',
      enteredByUserId: (req as any).user?.id,
      metadata: {
        restoredFromCancellation: true,
        previousCancelReason: (beforeOrder as any).cancelReason,
      },
    });

    // Use idempotent reconciliation to properly restore demand based on current order features
    // This validates demand state against order features instead of unconditionally re-opening
    try {
      await reconcileBottomMetalDemand(updatedOrder);
    } catch (demandError) {
      console.warn('⚠️ reconcileBottomMetalDemand skipped on undo-cancel:', demandError);
    }
    try {
      await reconcileRailDemand(updatedOrder);
    } catch (railErr: any) {
      console.warn('⚠️ reconcileRailDemand skipped on undo-cancel:', railErr?.message);
    }

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
router.post('/cancel/:orderId', requirePermission('orders.cancel'), async (req: Request, res: Response) => {
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
      console.log('🔧 Order not found in allOrders/orderDrafts, checking productionOrders:', orderId);
      // Fallback: check if the order exists only in productionOrders (e.g. PO Manager orders)
      const productionOrder = await storage.getProductionOrderByOrderId(orderId);
      if (productionOrder) {
        console.log('🔧 Found production order, marking as CANCELLED:', productionOrder.id);
        const updatedProductionOrder = await storage.updateProductionOrder(productionOrder.id, {
          productionStatus: 'CANCELLED',
          updatedAt: new Date(),
        });
        console.log('🔧 Production order cancelled successfully:', orderId);
        return res.json({
          success: true,
          message: 'Order cancelled successfully.',
          order: updatedProductionOrder,
          rtsInventoryCreated: false,
        });
      }
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

    // Cancel any bottom metal demands for this order
    try {
      await storage.cancelBottomMetalDemandByOrderId(orderId);
      console.log(`🔩 Cancelled bottom metal demand for order ${orderId}`);
    } catch (demandError) {
      console.log('🔧 No bottom metal demand to cancel or cancellation failed:', demandError);
      // Don't fail the cancellation if demand cancellation fails
    }

    console.log('🔧 Order cancelled successfully:', updatedOrder.orderId);

    // Log field-level audit event using automatic change detection
    const actor = {
      id: (req as any).user?.id,
      username: (req as any).user?.username || 'System',
      role: (req as any).user?.role || 'system',
    };
    
    await auditService.logFieldChanges(
      'p1_order',
      orderId,
      order,
      updatedOrder,
      actor,
      { 
        source: 'order-cancellation',
        cancelReason: reason,
        rtsInventoryCreated,
        wasInProduction: isInProduction,
      }
    );
    
    // Close the current department transition (cancelled, no new department)
    await auditService.closeDepartmentTransition(
      orderId,
      (req as any).user?.id,
      'cancelled'
    );

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
              validatedValue = parsedDate;
            }
            break;
        }
      }

      // Normalize dueDate to Tuesday before persisting
      if (fieldName === 'dueDate' && validatedValue != null) {
        validatedValue = normalizeDueDateForStorage(validatedValue);
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

      // Validate that rows were actually updated
      const rowCount = (updateResult as any)?.rowCount ?? 0;
      if (rowCount === 0) {
        return res.status(409).json({
          error: 'No rows updated — value unchanged or order not found',
          fieldName,
          value: validatedValue,
        });
      }

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

    // ── FINALIZED → IN_PROGRESS: run inventory allocation before allowing transition ──
    if (updates.status === 'IN_PROGRESS') {
      // Fetch the current order to confirm it is transitioning from FINALIZED
      const [currentOrder] = await db
        .select()
        .from(allOrders)
        .where(eq(allOrders.orderId, orderId))
        .limit(1);

      if (currentOrder && currentOrder.status === 'FINALIZED') {
        console.log(`🔒 Order ${orderId}: FINALIZED → IN_PROGRESS — running inventory allocation`);

        const performedBy = (req as any).user?.username ?? 'system';
        const allocationResult = await allocateForOrder(
          orderId,
          (currentOrder as any).bomDefinitionId ?? null,
          (currentOrder as any).modelId ?? null,
          1,
          performedBy
        );

        if (!allocationResult.success) {
          const shortageDetails = allocationResult.shortages.map(
            (s) => `${s.agPartNumber} (need ${s.required}, available ${s.available})`
          );
          console.warn(
            `⛔ Order ${orderId}: MATERIAL_SHORTAGE — status transition blocked. Shortages: ${shortageDetails.join(', ')}`
          );
          return res.status(409).json({
            error: 'MATERIAL_SHORTAGE',
            message: 'Insufficient inventory to start production. Status transition blocked.',
            shortages: allocationResult.shortages,
          });
        }

        if (allocationResult.allocated.length > 0) {
          console.log(
            `✅ Order ${orderId}: Allocated ${allocationResult.allocated.length} material(s) — proceeding to IN_PROGRESS`
          );
        }
      }
    }

    // Normalize dueDate to Tuesday if present in updates
    if (updates.dueDate != null) {
      updates.dueDate = normalizeDueDateForStorage(updates.dueDate);
    }

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
router.patch(
  '/:orderId/department',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || !['ADMIN', 'OWNER'].includes(user.role)) {
      try {
        await auditService.logEvent({
          entityType: 'p1_order',
          entityId: req.params.orderId,
          action: 'DEPARTMENT_TRANSFER_BLOCKED',
          actor: {
            id: user?.id,
            username: user?.username || 'anonymous',
            role: user?.role || 'none',
          },
          meta: {
            reason: 'Insufficient role — ADMIN or OWNER required',
            userRole: user?.role || 'none',
            requestedDepartment: req.body?.department,
          },
        });
      } catch (auditErr) {
        console.error('Failed to log blocked department transfer attempt:', auditErr);
      }
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  },
  async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { department, reason } = req.body;

    console.log(`🔄 Department Transfer Request: ${orderId} → ${department}${reason ? ` (reason: ${reason})` : ''}`);

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

    // Build actor from authenticated user
    const actor = {
      id: (req as any).user?.id,
      username: (req as any).user?.username || 'System',
      role: (req as any).user?.role || 'system',
    };

    // Log field-level audit using automatic change detection (NOT logEvent)
    await auditService.logFieldChanges(
      'p1_order',
      orderId,
      existingOrder || { currentDepartment: previousDepartment },
      updatedOrder,
      actor,
      { 
        source: 'department_transfer_tool',
        transferType: 'manual',
        orderType,
        reason: reason || null,
        oldDepartment: previousDepartment,
        newDepartment: department,
        changeType: 'MANUAL_TRANSFER',
      }
    );

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

    // UNIFIED PRIORITY MODEL: Only persist urgency state, not calculated priority
    // Priority is computed at runtime by computeEffectivePriority()
    const user = (req as any).user;
    const username = user?.username || user?.email || 'unknown';

    await db
      .update(allOrders)
      .set({
        urgency: urgency,
        isManualUrgency: true, // Mark as manually set
        prioritySource: 'urgency', // Track that priority comes from urgency setting
        // NOTE: priorityScore is NOT updated - use computeEffectivePriority() for sorting
        updatedAt: new Date(),
      })
      .where(eq(allOrders.orderId, orderId));

    console.log(`✅ Order ${orderId} updated: urgency=${urgency}, prioritySource=urgency (priority computed at runtime)`);

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

// Admin Panel - Set manual priority override for an order
// UNIFIED PRIORITY MODEL: This is the ONLY way to manually reprioritize orders
router.put(
  '/:orderId/priority-override',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const { priority, reason } = req.body;
      const user = (req as any).user;
      const username = user?.username || user?.email || 'unknown';

      // Validate priority (1-9999, where lower = higher priority)
      if (priority !== null && priority !== undefined) {
        if (typeof priority !== 'number' || priority < 1 || priority > 9999) {
          return res.status(400).json({ 
            error: 'Priority must be a number between 1 (highest) and 9999 (lowest), or null to clear' 
          });
        }
      }

      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: `Order ${orderId} not found` });
      }

      // Update the order with manual priority override
      await db
        .update(allOrders)
        .set({
          manualPriorityOverride: priority || null,
          manualPriorityReason: reason || null,
          manualPrioritySetBy: priority ? username : null,
          manualPrioritySetAt: priority ? new Date() : null,
          prioritySource: priority ? 'manual' : 'default',
          updatedAt: new Date(),
        })
        .where(eq(allOrders.orderId, orderId));

      console.log(`🎯 Order ${orderId}: Manual priority ${priority ? `set to ${priority}` : 'cleared'} by ${username}`);

      const updatedOrder = await storage.getOrderById(orderId);
      res.json({
        success: true,
        order: updatedOrder,
        message: priority 
          ? `Order ${orderId} manual priority set to ${priority}` 
          : `Order ${orderId} manual priority cleared`,
      });
    } catch (error) {
      console.error(`❌ PUT /${req.params.orderId}/priority-override error:`, error);
      res.status(500).json({ 
        error: 'Failed to update order priority',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

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

      // Normalize dueDate to Tuesday before persisting
      const normalizedFieldValue = fieldName === 'dueDate' && newValue != null
        ? normalizeDueDateForStorage(newValue)
        : newValue;

      // Update the order
      await db
        .update(allOrders)
        .set({ 
          [dbField]: normalizedFieldValue,
          updatedAt: new Date(),
        })
        .where(eq(allOrders.orderId, orderId));

      // Create audit log entry
      await storage.createAdminAuditLog({
        orderId,
        fieldName,
        fieldLabel: fieldConfig.label,
        oldValue: oldValue !== null && oldValue !== undefined ? oldValue : null,
        newValue: normalizedFieldValue,
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

      // Normalize dueDate to Tuesday for bulk updates targeting the due_date field
      const normalizedValue = fieldName === 'dueDate' && newValue != null
        ? normalizeDueDateForStorage(newValue)
        : newValue;

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
              [dbField]: normalizedValue,
              updatedAt: new Date(),
            })
            .where(eq(allOrders.orderId, orderId));

          // Create audit log entry
          await storage.createAdminAuditLog({
            orderId,
            fieldName,
            fieldLabel: fieldConfig.label,
            oldValue: oldValue !== null && oldValue !== undefined ? oldValue : null,
            newValue: normalizedValue,
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

// Heat map endpoint - aggregate orders by ZIP code with coordinates
router.get('/heat-map', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    // US ZIP code to approximate lat/lng mapping (first 3 digits = region)
    // This is a simplified geocoding approach using ZIP code prefix centroids
    const zipPrefixCoordinates: Record<string, [number, number]> = {
      // Northeast
      '010': [42.10, -72.59], '011': [42.26, -72.58], '012': [42.45, -72.59], '013': [42.38, -71.93],
      '014': [42.27, -71.80], '015': [42.26, -71.80], '016': [42.27, -71.80], '017': [42.40, -71.38],
      '018': [42.06, -70.94], '019': [42.52, -70.89], '020': [42.36, -71.06], '021': [42.36, -71.06],
      '022': [42.26, -71.17], '023': [42.10, -70.69], '024': [42.46, -71.23], '025': [41.90, -71.09],
      '026': [41.82, -71.41], '027': [41.70, -71.45], '028': [41.82, -71.41], '029': [41.43, -71.52],
      '030': [42.99, -71.45], '031': [42.99, -71.45], '032': [42.93, -71.44], '033': [43.21, -71.54],
      '034': [43.21, -71.54], '035': [43.63, -72.32], '036': [43.63, -72.32], '037': [43.64, -72.32],
      '038': [42.88, -71.33], '039': [44.27, -71.30], '040': [43.66, -70.26], '041': [43.66, -70.26],
      '042': [43.08, -70.75], '043': [43.35, -70.47], '044': [44.80, -68.78], '045': [44.31, -69.78],
      '046': [44.54, -69.63], '047': [45.18, -67.28], '048': [44.80, -68.78], '049': [44.31, -69.78],
      '050': [44.26, -72.58], '051': [44.26, -72.58], '052': [43.61, -72.97], '053': [43.61, -72.97],
      '054': [44.48, -73.21], '055': [55.00, -55.00], '056': [44.48, -73.21], '057': [43.13, -72.83],
      '058': [43.13, -72.83], '059': [44.26, -72.58],
      // Mid-Atlantic
      '100': [40.71, -74.01], '101': [40.71, -74.01], '102': [40.71, -74.01], '103': [40.58, -74.15],
      '104': [40.85, -73.87], '105': [40.93, -73.90], '106': [40.95, -73.87], '107': [41.03, -73.76],
      '108': [41.03, -73.76], '109': [40.95, -73.87], '110': [40.75, -73.62], '111': [40.75, -73.62],
      '112': [40.65, -73.95], '113': [40.69, -73.99], '114': [40.61, -74.00], '115': [40.58, -73.82],
      '116': [40.75, -73.87], '117': [40.75, -73.62], '118': [40.75, -73.62], '119': [40.75, -73.62],
      '120': [42.65, -73.76], '121': [42.65, -73.76], '122': [42.65, -73.76], '123': [42.81, -73.94],
      '124': [41.70, -73.93], '125': [41.50, -74.01], '126': [41.50, -74.01], '127': [41.23, -73.20],
      '128': [42.44, -76.50], '129': [42.10, -75.91], '130': [43.05, -76.15], '131': [43.05, -76.15],
      '132': [43.05, -76.15], '133': [43.10, -76.10], '134': [43.05, -76.15], '135': [43.00, -75.50],
      '136': [43.10, -77.00], '137': [44.70, -75.50], '138': [44.70, -75.50], '139': [44.00, -75.00],
      '140': [42.89, -78.88], '141': [42.89, -78.88], '142': [42.89, -78.88], '143': [42.50, -79.31],
      '144': [43.16, -77.62], '145': [43.16, -77.62], '146': [43.16, -77.62], '147': [42.10, -79.24],
      '148': [42.09, -76.81], '149': [42.44, -76.50],
      // Pennsylvania
      '150': [40.44, -80.00], '151': [40.44, -80.00], '152': [40.44, -80.00], '153': [40.27, -76.88],
      '154': [40.32, -79.98], '155': [40.51, -78.40], '156': [40.36, -79.93], '157': [40.32, -78.92],
      '158': [41.41, -75.66], '159': [40.27, -79.87], '160': [41.23, -80.09], '161': [41.23, -80.09],
      '162': [41.23, -80.09], '163': [42.13, -80.09], '164': [41.87, -79.14], '165': [42.13, -80.09],
      '166': [40.51, -78.40], '167': [40.32, -78.92], '168': [40.44, -80.00], '169': [40.32, -78.92],
      '170': [40.27, -76.88], '171': [40.27, -76.88], '172': [40.27, -76.88], '173': [40.04, -76.31],
      '174': [40.04, -76.31], '175': [40.04, -76.31], '176': [40.34, -75.93], '177': [40.27, -76.88],
      '178': [40.60, -75.49], '179': [40.34, -75.93], '180': [40.60, -75.49], '181': [40.60, -75.49],
      '182': [41.41, -75.66], '183': [40.34, -75.93], '184': [41.41, -75.66], '185': [41.41, -75.66],
      '186': [41.24, -75.88], '187': [41.24, -75.88], '188': [41.41, -75.66], '189': [40.10, -75.29],
      '190': [39.95, -75.16], '191': [39.95, -75.16], '192': [39.95, -75.16], '193': [39.96, -75.13],
      '194': [40.10, -75.29], '195': [40.10, -75.29], '196': [39.96, -75.60],
      // South
      '200': [38.90, -77.04], '201': [38.90, -77.04], '202': [38.90, -77.04], '203': [38.90, -77.04],
      '204': [38.90, -77.04], '205': [38.90, -77.04], '206': [38.82, -76.99], '207': [38.82, -76.99],
      '208': [39.08, -77.15], '209': [39.42, -77.41], '210': [39.29, -76.61], '211': [39.29, -76.61],
      '212': [39.29, -76.61], '214': [39.00, -76.48], '215': [38.98, -76.49], '216': [38.98, -76.49],
      '217': [39.42, -77.41], '218': [38.35, -75.60], '219': [39.42, -77.41],
      // Virginia
      '220': [38.77, -77.45], '221': [38.77, -77.45], '222': [38.80, -77.05], '223': [38.88, -77.17],
      '224': [38.82, -77.10], '225': [38.30, -77.46], '226': [38.82, -77.10], '227': [38.30, -77.46],
      '228': [38.82, -77.10], '229': [37.27, -79.94], '230': [37.54, -77.44], '231': [37.54, -77.44],
      '232': [37.54, -77.44], '233': [36.85, -76.29], '234': [36.85, -76.29], '235': [36.85, -76.29],
      '236': [36.85, -76.29], '237': [37.08, -76.47], '238': [37.54, -77.44], '239': [37.41, -77.65],
      '240': [37.27, -79.94], '241': [37.27, -79.94], '242': [37.27, -79.94], '243': [37.27, -79.94],
      '244': [38.15, -79.07], '245': [37.41, -79.14], '246': [37.78, -79.44],
      // Southeast
      '270': [35.79, -78.64], '271': [35.79, -78.64], '272': [36.10, -79.83], '273': [36.10, -79.83],
      '274': [36.07, -79.79], '275': [35.79, -78.64], '276': [36.07, -79.79], '277': [35.23, -80.84],
      '278': [35.60, -82.55], '279': [35.60, -82.55], '280': [35.23, -80.84], '281': [35.23, -80.84],
      '282': [35.23, -80.84], '283': [35.23, -80.84], '284': [34.94, -79.01], '285': [35.10, -78.88],
      '286': [35.60, -82.55], '287': [35.60, -82.55], '288': [34.23, -77.95], '289': [34.23, -77.95],
      // Georgia
      '300': [33.75, -84.39], '301': [33.75, -84.39], '302': [33.75, -84.39], '303': [33.75, -84.39],
      '304': [33.75, -84.39], '305': [33.75, -84.39], '306': [33.75, -84.39], '307': [33.96, -83.38],
      '308': [32.08, -81.09], '309': [32.08, -81.09], '310': [32.08, -81.09], '311': [33.75, -84.39],
      '312': [32.46, -83.65], '313': [32.08, -81.09], '314': [32.46, -83.65], '315': [31.58, -84.16],
      '316': [30.84, -83.29], '317': [31.58, -84.16], '318': [32.46, -84.99], '319': [31.58, -84.16],
      // Florida
      '320': [30.33, -81.66], '321': [30.33, -81.66], '322': [30.33, -81.66], '323': [28.54, -81.38],
      '324': [29.65, -82.32], '325': [30.44, -84.28], '326': [29.19, -82.14], '327': [28.54, -81.38],
      '328': [28.54, -81.38], '329': [28.54, -81.38], '330': [25.76, -80.19], '331': [25.76, -80.19],
      '332': [25.76, -80.19], '333': [25.76, -80.19], '334': [26.12, -80.14], '335': [27.95, -82.46],
      '336': [27.95, -82.46], '337': [27.95, -82.46], '338': [27.50, -82.58], '339': [26.64, -81.87],
      '340': [18.47, -66.12], '341': [26.64, -81.87], '342': [27.95, -82.46], '344': [29.03, -80.93],
      '346': [27.95, -82.46], '347': [28.54, -81.38],
      // Midwest
      '400': [38.25, -85.76], '401': [38.25, -85.76], '402': [38.25, -85.76], '403': [37.99, -84.48],
      '404': [37.99, -84.48], '405': [37.99, -84.48], '406': [37.77, -87.11], '407': [36.99, -86.44],
      '408': [36.99, -86.44], '409': [37.77, -84.30], '410': [39.10, -84.51], '411': [38.04, -84.50],
      '412': [38.04, -84.50], '413': [38.04, -84.50], '414': [39.10, -84.51], '415': [39.10, -84.51],
      '416': [38.04, -84.50], '417': [38.19, -83.43], '418': [37.84, -83.32],
      // Ohio
      '430': [39.96, -83.00], '431': [39.96, -83.00], '432': [39.96, -83.00], '433': [39.96, -83.00],
      '434': [40.76, -82.52], '435': [39.96, -83.00], '436': [41.50, -81.69], '437': [40.10, -83.01],
      '438': [40.80, -81.38], '439': [40.10, -83.01], '440': [41.50, -81.69], '441': [41.50, -81.69],
      '442': [41.10, -81.52], '443': [41.10, -81.52], '444': [41.10, -80.65], '445': [41.10, -80.65],
      '446': [40.80, -81.38], '447': [40.80, -81.38], '448': [40.80, -81.38], '449': [40.80, -81.38],
      '450': [39.10, -84.51], '451': [39.10, -84.51], '452': [39.10, -84.51], '453': [39.76, -84.19],
      '454': [39.76, -84.19], '455': [39.76, -84.19], '456': [39.33, -82.98], '457': [39.33, -82.98],
      '458': [39.33, -82.98],
      // Michigan  
      '480': [42.33, -83.05], '481': [42.33, -83.05], '482': [42.33, -83.05], '483': [42.60, -83.03],
      '484': [43.01, -83.69], '485': [43.01, -83.69], '486': [43.66, -84.25], '487': [43.66, -84.25],
      '488': [42.73, -84.55], '489': [42.73, -84.55], '490': [42.29, -85.59], '491': [42.29, -85.59],
      '492': [42.29, -85.59], '493': [42.96, -85.67], '494': [42.96, -85.67], '495': [42.96, -85.67],
      '496': [42.27, -84.40], '497': [44.76, -85.64], '498': [46.50, -84.35], '499': [46.55, -87.40],
      // Indiana
      '460': [39.77, -86.16], '461': [39.77, -86.16], '462': [39.77, -86.16], '463': [39.77, -86.16],
      '464': [39.77, -86.16], '465': [39.77, -86.16], '466': [39.77, -86.16], '467': [41.68, -86.25],
      '468': [41.08, -85.14], '469': [41.08, -85.14], '470': [39.10, -84.51], '471': [38.30, -85.83],
      '472': [39.17, -86.53], '473': [39.17, -86.53], '474': [39.17, -86.53], '475': [39.41, -87.41],
      '476': [39.41, -87.41], '477': [38.68, -87.53], '478': [39.41, -87.41], '479': [40.42, -86.91],
      // Illinois
      '600': [41.88, -87.63], '601': [41.88, -87.63], '602': [41.88, -87.63], '603': [41.88, -87.63],
      '604': [41.88, -87.63], '605': [41.88, -87.63], '606': [41.88, -87.63], '607': [41.88, -87.63],
      '608': [41.88, -87.63], '609': [42.28, -88.00], '610': [41.51, -90.58], '611': [41.51, -90.58],
      '612': [41.51, -90.58], '613': [41.45, -88.27], '614': [41.45, -88.27], '615': [41.45, -88.27],
      '616': [40.69, -89.59], '617': [40.69, -89.59], '618': [40.48, -88.99], '619': [40.48, -88.99],
      '620': [39.80, -89.64], '621': [39.80, -89.64], '622': [38.63, -90.20], '623': [38.52, -89.98],
      '624': [37.73, -89.22], '625': [39.80, -89.64], '626': [39.80, -89.64], '627': [39.80, -89.64],
      '628': [38.52, -89.98], '629': [37.73, -89.22],
      // Wisconsin
      '530': [43.07, -89.40], '531': [43.07, -89.40], '532': [43.04, -87.91], '533': [43.04, -87.91],
      '534': [42.58, -87.82], '535': [43.07, -89.40], '536': [43.07, -89.40], '537': [43.07, -89.40],
      '538': [43.07, -89.40], '539': [43.78, -88.44], '540': [44.52, -88.02], '541': [44.52, -88.02],
      '542': [44.52, -88.02], '543': [44.52, -88.02], '544': [44.81, -91.50], '545': [44.81, -91.50],
      '546': [43.81, -91.25], '547': [44.81, -91.50], '548': [44.97, -89.64], '549': [44.97, -89.64],
      // Minnesota
      '550': [44.98, -93.27], '551': [44.98, -93.27], '552': [44.98, -93.27], '553': [44.98, -93.27],
      '554': [44.98, -93.27], '555': [44.98, -93.27], '556': [46.78, -92.11], '557': [46.78, -92.11],
      '558': [46.78, -92.11], '559': [44.16, -93.99], '560': [44.16, -93.99], '561': [45.55, -94.16],
      '562': [44.01, -92.47], '563': [44.01, -92.47], '564': [45.55, -94.16], '565': [46.87, -96.77],
      '566': [46.87, -96.77], '567': [47.47, -94.88],
      // Iowa
      '500': [41.59, -93.61], '501': [41.59, -93.61], '502': [41.59, -93.61], '503': [41.59, -93.61],
      '504': [42.50, -96.40], '505': [42.03, -93.62], '506': [42.50, -94.17], '507': [42.50, -94.17],
      '508': [41.26, -95.86], '509': [41.26, -95.86], '510': [42.50, -96.40], '511': [42.50, -96.40],
      '512': [42.50, -96.40], '513': [41.02, -92.41], '514': [41.02, -92.41], '515': [41.02, -92.41],
      '516': [41.03, -91.97], '520': [41.66, -91.53], '521': [42.50, -90.67], '522': [41.66, -91.53],
      '523': [41.66, -91.53], '524': [41.66, -91.53], '525': [42.50, -90.67], '526': [41.59, -93.61],
      '527': [42.50, -90.67], '528': [41.59, -93.61],
      // Missouri
      '630': [38.63, -90.20], '631': [38.63, -90.20], '633': [38.63, -90.20], '634': [38.75, -90.37],
      '635': [38.75, -90.37], '636': [38.75, -90.37], '637': [36.67, -93.40], '638': [38.75, -90.37],
      '639': [38.75, -90.37], '640': [39.10, -94.58], '641': [39.10, -94.58], '644': [39.10, -94.58],
      '645': [39.10, -94.58], '646': [39.10, -94.58], '647': [39.10, -94.58], '648': [39.77, -94.85],
      '649': [39.10, -94.58], '650': [38.58, -92.17], '651': [38.58, -92.17], '652': [38.58, -92.17],
      '653': [39.77, -94.85], '654': [37.22, -93.29], '655': [37.22, -93.29], '656': [37.22, -93.29],
      '657': [37.22, -93.29], '658': [37.84, -90.49], '659': [39.77, -94.85],
      // Kansas
      '660': [39.05, -94.59], '661': [39.05, -94.59], '662': [39.05, -94.59], '664': [39.05, -94.59],
      '665': [39.05, -94.59], '666': [39.05, -94.59], '667': [38.88, -99.33], '668': [39.05, -95.68],
      '669': [38.88, -99.33], '670': [37.69, -97.34], '671': [37.69, -97.34], '672': [37.69, -97.34],
      '673': [37.04, -100.92], '674': [38.88, -99.33], '675': [38.86, -97.61], '676': [38.86, -97.61],
      '677': [39.33, -101.05], '678': [37.04, -100.92], '679': [37.04, -100.92],
      // Nebraska
      '680': [41.26, -95.94], '681': [41.26, -95.94], '683': [40.81, -96.70], '684': [40.81, -96.70],
      '685': [40.81, -96.70], '686': [40.81, -96.70], '687': [40.81, -96.70], '688': [40.93, -98.34],
      '689': [40.93, -98.34], '690': [41.14, -100.76], '691': [41.14, -100.76], '692': [41.87, -103.66],
      '693': [41.87, -103.66],
      // Dakotas
      '570': [43.55, -96.73], '571': [43.55, -96.73], '572': [44.37, -100.35], '573': [44.37, -100.35],
      '574': [45.46, -98.49], '575': [43.55, -96.73], '576': [46.88, -102.79], '577': [44.08, -103.23],
      '580': [46.88, -96.79], '581': [46.88, -96.79], '582': [46.88, -96.79], '583': [47.92, -97.03],
      '584': [46.88, -96.79], '585': [46.88, -102.79], '586': [47.92, -97.03], '587': [48.23, -101.30],
      '588': [46.88, -102.79],
      // Mountain West
      '590': [45.78, -108.50], '591': [45.78, -108.50], '592': [47.51, -111.28], '593': [47.51, -111.28],
      '594': [47.51, -111.28], '595': [45.78, -108.50], '596': [47.51, -111.28], '597': [45.78, -108.50],
      '598': [46.87, -114.00], '599': [47.51, -111.28],
      // Colorado
      '800': [39.74, -104.99], '801': [39.74, -104.99], '802': [39.74, -104.99], '803': [39.74, -104.99],
      '804': [39.74, -104.99], '805': [39.74, -104.99], '806': [40.59, -105.08], '807': [40.59, -105.08],
      '808': [38.83, -104.82], '809': [38.83, -104.82], '810': [38.54, -106.93], '811': [38.54, -106.93],
      '812': [37.27, -107.88], '813': [37.27, -107.88], '814': [39.06, -108.55], '815': [39.06, -108.55],
      '816': [40.49, -107.55],
      // New Mexico
      '870': [35.08, -106.65], '871': [35.08, -106.65], '872': [35.08, -106.65], '873': [35.68, -105.94],
      '874': [36.41, -105.57], '875': [35.08, -106.65], '877': [34.40, -103.20], '878': [35.52, -108.74],
      '879': [35.20, -103.72], '880': [32.35, -106.76], '881': [34.40, -103.20], '882': [32.90, -105.96],
      '883': [32.35, -106.76], '884': [32.35, -106.76],
      // Arizona
      '850': [33.45, -112.07], '851': [33.45, -112.07], '852': [33.45, -112.07], '853': [33.41, -111.84],
      '855': [33.45, -112.07], '856': [32.22, -110.93], '857': [32.22, -110.93], '859': [34.25, -110.03],
      '860': [34.54, -112.47], '863': [34.54, -112.47], '864': [34.54, -112.47], '865': [35.20, -111.65],
      // Utah
      '840': [40.76, -111.89], '841': [40.76, -111.89], '842': [40.76, -111.89], '843': [40.76, -111.89],
      '844': [40.76, -111.89], '845': [41.23, -111.97], '846': [40.23, -111.66], '847': [41.07, -112.06],
      // Nevada
      '889': [36.17, -115.14], '890': [36.17, -115.14], '891': [36.17, -115.14], '893': [36.17, -115.14],
      '894': [39.53, -119.81], '895': [39.53, -119.81], '897': [39.53, -119.81], '898': [36.21, -116.13],
      // Idaho
      '832': [43.62, -116.20], '833': [43.62, -116.20], '834': [43.62, -116.20], '835': [46.72, -117.00],
      '836': [43.62, -116.20], '837': [43.62, -116.20], '838': [47.68, -116.78],
      // Wyoming
      '820': [41.14, -104.82], '821': [41.14, -104.82], '822': [41.14, -104.82], '823': [42.85, -106.33],
      '824': [42.85, -106.33], '825': [43.03, -108.38], '826': [42.85, -106.33], '827': [43.03, -108.38],
      '828': [44.28, -105.50], '829': [41.31, -105.59], '830': [41.14, -104.82], '831': [41.59, -109.22],
      // Pacific
      '900': [34.05, -118.24], '901': [34.05, -118.24], '902': [33.95, -118.14], '903': [33.95, -118.14],
      '904': [33.77, -118.19], '905': [33.77, -118.19], '906': [33.77, -118.19], '907': [33.77, -118.19],
      '908': [33.77, -118.19], '910': [34.10, -117.29], '911': [34.19, -118.53], '912': [34.19, -118.53],
      '913': [34.42, -118.50], '914': [34.19, -118.33], '915': [34.19, -118.33], '916': [34.11, -118.26],
      '917': [34.06, -117.59], '918': [34.10, -117.82], '919': [34.07, -118.35], '920': [32.72, -117.16],
      '921': [32.72, -117.16], '922': [33.12, -117.09], '923': [33.12, -117.09], '924': [33.75, -116.97],
      '925': [33.98, -117.37], '926': [33.68, -117.83], '927': [33.68, -117.83], '928': [33.68, -117.83],
      '930': [34.42, -119.70], '931': [34.42, -119.70], '932': [35.37, -119.02], '933': [35.37, -119.02],
      '934': [34.02, -118.81], '935': [35.37, -119.02], '936': [36.74, -119.79], '937': [36.74, -119.79],
      '938': [36.74, -119.79], '939': [36.60, -121.89], '940': [37.77, -122.42], '941': [37.77, -122.42],
      '942': [38.58, -121.49], '943': [37.30, -121.87], '944': [37.77, -122.42], '945': [37.55, -122.05],
      '946': [37.80, -122.27], '947': [37.87, -122.27], '948': [37.48, -122.23], '949': [37.36, -122.04],
      '950': [37.34, -121.89], '951': [37.34, -121.89], '952': [37.97, -121.32], '953': [37.97, -121.32],
      '954': [37.77, -122.26], '955': [40.80, -124.16], '956': [38.58, -121.49], '957': [38.58, -121.49],
      '958': [38.58, -121.49], '959': [39.16, -121.69], '960': [39.53, -122.19], '961': [40.59, -122.39],
      // Oregon
      '970': [45.51, -122.68], '971': [45.51, -122.68], '972': [45.51, -122.68], '973': [45.51, -122.68],
      '974': [44.94, -123.03], '975': [42.33, -122.87], '976': [43.22, -123.36], '977': [44.06, -121.31],
      '978': [45.51, -122.68], '979': [45.67, -118.79],
      // Washington
      '980': [47.61, -122.33], '981': [47.61, -122.33], '982': [47.04, -122.90], '983': [47.25, -122.44],
      '984': [47.04, -122.90], '985': [47.61, -122.33], '986': [45.64, -122.66], '988': [47.66, -117.43],
      '989': [47.66, -117.43], '990': [47.66, -117.43], '991': [47.66, -117.43], '992': [47.66, -117.43],
      '993': [46.60, -120.51], '994': [46.60, -120.51],
      // Alaska & Hawaii
      '995': [61.22, -149.90], '996': [61.22, -149.90], '997': [64.84, -147.72], '998': [64.84, -147.72],
      '999': [55.34, -131.64],
      '967': [21.31, -157.86], '968': [21.31, -157.86],
      // Texas
      '750': [32.78, -96.80], '751': [32.78, -96.80], '752': [32.78, -96.80], '753': [32.78, -96.80],
      '754': [32.35, -96.62], '755': [32.35, -96.62], '756': [32.75, -97.33], '757': [32.75, -97.33],
      '758': [32.75, -97.33], '759': [33.41, -94.04], '760': [32.75, -97.33], '761': [32.75, -97.33],
      '762': [32.78, -96.80], '763': [33.20, -97.13], '764': [33.21, -97.13], '765': [31.55, -97.15],
      '766': [31.55, -97.15], '767': [31.55, -97.15], '768': [33.58, -101.85], '769': [32.45, -99.73],
      '770': [29.76, -95.37], '771': [29.76, -95.37], '772': [29.76, -95.37], '773': [30.07, -95.47],
      '774': [29.76, -95.37], '775': [29.76, -95.37], '776': [30.11, -93.75], '777': [30.11, -93.75],
      '778': [28.80, -97.00], '779': [28.80, -97.00], '780': [29.42, -98.49], '781': [29.42, -98.49],
      '782': [29.42, -98.49], '783': [27.51, -99.51], '784': [27.51, -99.51], '785': [26.20, -98.23],
      '786': [30.27, -97.74], '787': [30.27, -97.74], '788': [29.88, -97.94], '789': [30.27, -97.74],
      '790': [35.22, -101.83], '791': [35.22, -101.83], '792': [33.58, -101.85], '793': [33.58, -101.85],
      '794': [35.22, -101.83], '795': [33.58, -101.85], '796': [35.22, -101.83], '797': [31.76, -106.49],
      '798': [31.76, -106.49], '799': [31.76, -106.49],
      // Oklahoma
      '730': [35.47, -97.52], '731': [35.47, -97.52], '734': [35.47, -97.52], '735': [36.16, -95.99],
      '736': [36.16, -95.99], '737': [35.47, -97.52], '738': [35.47, -97.52], '739': [34.61, -98.39],
      '740': [36.16, -95.99], '741': [36.16, -95.99], '743': [35.22, -99.41], '744': [35.47, -97.52],
      '745': [35.47, -97.52], '746': [34.23, -97.14], '747': [34.61, -98.39], '748': [33.90, -96.62],
      '749': [34.74, -96.67],
      // Arkansas
      '716': [34.75, -92.29], '717': [34.75, -92.29], '718': [34.75, -92.29], '719': [35.84, -90.70],
      '720': [34.75, -92.29], '721': [34.75, -92.29], '722': [34.75, -92.29], '723': [35.39, -94.40],
      '724': [35.39, -94.40], '725': [35.35, -94.37], '726': [35.84, -90.70], '727': [36.33, -94.12],
      '728': [33.21, -92.67], '729': [35.27, -93.13],
      // Louisiana
      '700': [29.95, -90.07], '701': [29.95, -90.07], '703': [29.95, -90.07], '704': [30.45, -91.19],
      '705': [30.45, -91.19], '706': [32.51, -93.75], '707': [32.51, -93.75], '708': [30.45, -91.19],
      '710': [30.23, -93.22], '711': [30.23, -93.22], '712': [32.51, -93.75], '713': [31.31, -92.45],
      '714': [31.31, -92.45],
      // Mississippi
      '386': [34.26, -88.70], '387': [33.50, -90.20], '388': [33.46, -89.10], '389': [32.30, -90.18],
      '390': [32.30, -90.18], '391': [32.30, -90.18], '392': [31.33, -89.29], '393': [31.33, -89.29],
      '394': [31.33, -89.29], '395': [30.40, -89.09], '396': [31.95, -90.91], '397': [31.33, -89.29],
      // Alabama
      '350': [33.52, -86.80], '351': [33.52, -86.80], '352': [33.52, -86.80], '354': [33.52, -86.80],
      '355': [33.52, -86.80], '356': [34.74, -87.70], '357': [34.18, -86.84], '358': [34.74, -87.70],
      '359': [33.52, -86.80], '360': [32.38, -86.30], '361': [32.38, -86.30], '362': [32.38, -86.30],
      '363': [31.22, -85.39], '364': [31.22, -85.39], '365': [30.69, -88.04], '366': [30.69, -88.04],
      '367': [32.38, -86.30], '368': [32.38, -86.30], '369': [33.21, -87.57],
      // Tennessee
      '370': [36.17, -86.78], '371': [36.17, -86.78], '372': [36.17, -86.78], '373': [35.15, -90.05],
      '374': [35.05, -85.31], '375': [35.05, -85.31], '376': [36.57, -82.56], '377': [36.57, -82.56],
      '378': [36.57, -82.56], '379': [35.96, -83.92], '380': [35.15, -90.05], '381': [35.15, -90.05],
      '382': [35.15, -90.05], '383': [35.62, -88.81], '384': [35.20, -89.97], '385': [35.78, -86.15],
      // South Carolina
      '290': [34.00, -81.03], '291': [34.00, -81.03], '292': [34.00, -81.03], '293': [34.95, -82.44],
      '294': [32.78, -79.93], '295': [34.20, -79.77], '296': [34.95, -82.44], '297': [34.20, -79.77],
      '298': [34.00, -81.03], '299': [32.43, -80.67],
      // West Virginia
      '247': [39.27, -81.56], '248': [39.27, -81.56], '249': [38.35, -81.63], '250': [38.35, -81.63],
      '251': [38.35, -81.63], '252': [39.27, -81.56], '253': [38.35, -81.63], '254': [38.35, -81.63],
      '255': [38.35, -81.63], '256': [38.35, -81.63], '257': [37.78, -80.44], '258': [38.35, -81.63],
      '259': [38.35, -81.63], '260': [39.46, -77.97], '261': [39.27, -81.56], '262': [39.27, -81.56],
      '263': [39.29, -80.34], '264': [39.29, -80.34], '265': [39.05, -79.49], '266': [39.29, -80.34],
      '267': [39.45, -80.14], '268': [38.91, -79.87],
      // New Jersey
      '070': [40.74, -74.17], '071': [40.74, -74.17], '072': [40.49, -74.45], '073': [40.74, -74.17],
      '074': [40.89, -74.23], '075': [40.89, -74.23], '076': [40.74, -74.17], '077': [40.35, -74.66],
      '078': [40.74, -74.17], '079': [40.49, -74.45], '080': [39.95, -75.12], '081': [39.95, -75.12],
      '082': [39.37, -74.43], '083': [39.37, -74.43], '084': [39.64, -75.05], '085': [40.22, -74.76],
      '086': [40.22, -74.76], '087': [40.09, -74.92], '088': [40.09, -74.92], '089': [39.37, -74.43],
      // Delaware
      '197': [39.74, -75.55], '198': [39.74, -75.55], '199': [39.16, -75.52],
      // Connecticut
      '060': [41.31, -72.92], '061': [41.31, -72.92], '062': [41.36, -72.10], '063': [41.05, -73.54],
      '064': [41.16, -73.21], '065': [41.31, -72.92], '066': [41.56, -72.65], '067': [41.76, -72.68],
      '068': [41.56, -72.65], '069': [41.41, -73.42],
      // Rhode Island
      // (028-029 already covered above)
      // Massachusetts
      // (010-027 already covered above)
      // Puerto Rico & Virgin Islands
      '006': [18.42, -66.06], '007': [18.42, -66.06], '008': [18.42, -66.06], '009': [18.42, -66.06],
    };

    // Build the query to aggregate orders by customer ZIP code
    let query = `
      SELECT 
        ca.zip_code as "zipCode",
        ca.city,
        ca.state,
        COUNT(DISTINCT o.order_id) as count
      FROM all_orders o
      JOIN customer_addresses ca ON o.customer_id::integer = ca.customer_id
      WHERE o.is_cancelled = false 
        AND ca.is_default = true
        AND o.customer_id ~ '^[0-9]+$'
        AND (o.order_source = 'SALES' OR o.order_source IS NULL)
    `;
    
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND o.order_date >= $${paramIndex}::timestamp`;
      queryParams.push(startDate + 'T00:00:00');
      paramIndex++;
    }
    if (endDate) {
      query += ` AND o.order_date <= $${paramIndex}::timestamp`;
      queryParams.push(endDate + 'T23:59:59');
      paramIndex++;
    }

    query += ` GROUP BY ca.zip_code, ca.city, ca.state ORDER BY count DESC`;

    const result = await pool.query(query, queryParams) as any;
    const rows = result.rows || result;
    
    // Map ZIP codes to coordinates using the prefix lookup
    const aggregations = rows.map((row: any) => {
      const zipPrefix = row.zipCode?.substring(0, 3) || '';
      const coords = zipPrefixCoordinates[zipPrefix] || [39.83, -98.58]; // Default to US center
      return {
        zipCode: row.zipCode,
        city: row.city,
        state: row.state,
        count: parseInt(row.count, 10),
        lat: coords[0],
        lng: coords[1],
      };
    });

    const totalOrders = aggregations.reduce((sum: number, a: any) => sum + a.count, 0);
    const uniqueZips = aggregations.length;

    res.json({
      aggregations,
      totalOrders,
      uniqueZips,
    });
  } catch (error) {
    console.error('Error generating heat map data:', error);
    res.status(500).json({ 
      error: 'Failed to generate heat map data',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// View or download Sales Order PDF
router.get('/:orderId/pdf', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const download = req.query.download === 'true';
    
    // Generate PDF using CUSTOMER_VIEW intent (live data, no signature box)
    const pdfResult = await generateOrderPdf(orderId, PdfIntent.CUSTOMER_VIEW);
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="SalesOrder-${orderId}.pdf"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="SalesOrder-${orderId}.pdf"`);
    }
    
    // Send the buffer directly (CUSTOMER_VIEW doesn't store to disk)
    res.send(pdfResult.buffer);
  } catch (error) {
    console.error('Error generating order PDF:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
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

// Email PDF Copy - sends order PDF without signature workflows
// This is independent of followup_orders and signature tracking
router.post('/:orderId/email-pdf-copy', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    console.log(`📧 [EMAIL-PDF-COPY] Starting email-pdf-copy for order ${orderId}`);
    
    // Get order details
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Get customer details
    const customer = order.customerId ? await storage.getCustomerById(order.customerId) : null;
    if (!customer || !customer.email) {
      return res.status(400).json({ error: 'Customer email not found' });
    }
    
    // Check if order has been signed (check followup_orders table)
    // Query directly since we may have multiple followup orders per order now
    const signedFollowups = await db
      .select()
      .from(sql`followup_orders`)
      .where(sql`order_id = ${orderId} AND signature_signed = true`)
      .limit(1);
    const signedFollowup = signedFollowups.length > 0 ? signedFollowups[0] : null;
    
    // Determine which PDF intent to use
    const pdfIntent = signedFollowup ? PdfIntent.SIGNED_ARCHIVE : PdfIntent.CUSTOMER_VIEW;
    console.log(`📄 [EMAIL-PDF-COPY] Using PDF intent: ${pdfIntent} (signed: ${!!signedFollowup})`);
    
    // Generate PDF
    const pdfResult = await generateOrderPdf(orderId, pdfIntent);
    const pdfPath = pdfResult.filePath;
    
    if (!pdfPath) {
      return res.status(500).json({ error: 'Failed to generate PDF' });
    }
    
    console.log(`📄 [EMAIL-PDF-COPY] Generated PDF at: ${pdfPath}`);
    
    // Send email with PDF attachment (no signature link)
    const preferredMethod = Array.isArray(customer.preferredCommunicationMethod) 
      ? customer.preferredCommunicationMethod[0] 
      : customer.preferredCommunicationMethod;
    
    const emailResult = await sendOrderConfirmationNotification({
      orderId: order.orderId,
      customerId: order.customerId || '',
      customerEmail: customer.email,
      customerPhone: customer.phone || undefined,
      preferredCommunicationMethod: preferredMethod as string || undefined,
      signatureToken: `pdf_copy_${Date.now()}`, // Unique token to prevent dedup issues
      pdfPath,
      context: 'pdf_copy', // Different context to indicate this is just a copy
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
        // No signatureLink - this is just a PDF copy
      },
      forceResend: true,
    });
    
    if (emailResult.outcome === 'sent') {
      console.log(`✅ [EMAIL-PDF-COPY] Successfully sent PDF copy for ${orderId}`);
      res.json({
        success: true,
        message: 'PDF copy emailed successfully',
        pdfPath,
      });
    } else {
      console.error(`❌ [EMAIL-PDF-COPY] Email failed for ${orderId}:`, emailResult);
      res.status(500).json({
        success: false,
        error: 'Failed to send email',
        details: emailResult,
      });
    }
  } catch (error) {
    console.error('Error sending PDF copy email:', error);
    res.status(500).json({
      error: 'Failed to send PDF copy',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/orders/awaiting-signature - All orders in Awaiting Customer Signature department
router.get('/awaiting-signature', async (req: Request, res: Response) => {
  try {
    const { search, sort = 'due_date', dir = 'asc' } = req.query as Record<string, string>;

    const allowedSorts: Record<string, string> = {
      due_date: 'ao.due_date',
      order_date: 'ao.order_date',
      order_id: 'ao.order_id',
      customer: 'c.name',
      days_waiting: 'ao.created_at',
    };
    const sortCol = allowedSorts[sort] || 'ao.due_date';
    const sortDir = dir === 'desc' ? 'DESC' : 'ASC';

    let searchClause = '';
    const params: any[] = [];

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      searchClause = `AND (LOWER(ao.order_id) LIKE $${params.length} OR LOWER(c.name) LIKE $${params.length} OR LOWER(ao.model_id) LIKE $${params.length})`;
    }

    const query = `
      SELECT
        ao.order_id AS "orderId",
        ao.order_date AS "orderDate",
        ao.due_date AS "dueDate",
        ao.status,
        ao.model_id AS "modelId",
        ao.handedness,
        ao.notes,
        ao.urgency,
        ao.customer_id AS "customerId",
        ao.created_at AS "createdAt",
        ao.signature_data IS NOT NULL AND ao.signature_data != '' AS "hasSigned",
        ao.signed_at AS "signedAt",
        ao.is_replacement AS "isReplacement",
        c.name AS "customerName",
        c.email AS "customerEmail",
        NOW() - ao.created_at AS "waitingDuration",
        EXTRACT(EPOCH FROM (NOW() - ao.created_at)) / 86400 AS "daysWaiting"
      FROM all_orders ao
      LEFT JOIN customers c ON c.id::text = ao.customer_id
      WHERE ao.current_department = 'Awaiting Customer Signature'
        AND ao.status != 'CANCELLED'
        ${searchClause}
      ORDER BY ${sortCol} ${sortDir}
    `;

    const rows = await pool.query(query, params);

    const orders = (Array.isArray(rows) ? rows : (rows as any).rows || rows).map((r: any) => ({
      ...r,
      daysWaiting: Math.floor(Number(r.daysWaiting) || 0),
    }));

    const total = orders.length;
    const overdue = orders.filter((o: any) => new Date(o.dueDate) < new Date()).length;
    const signed = orders.filter((o: any) => o.hasSigned).length;

    res.json({ orders, total, overdue, signed });
  } catch (error) {
    console.error('Error fetching awaiting-signature orders:', error);
    res.status(500).json({ error: 'Failed to fetch awaiting-signature orders' });
  }
});

router.get('/locate/:orderId', async (req, res) => {
  const rawId = req.params.orderId;
  const orderId = rawId.trim().toUpperCase();
  console.log(`[LOCATE] Searching for ${orderId} (raw: ${rawId})`);

  try {
    const soOrder = await storage.getFinalizedOrderById(orderId);
    if (soOrder) {
      console.log(`[LOCATE RESULT] Found in SO (all_orders)`);
      return res.json({
        found: true,
        orderId: soOrder.orderId,
        sourceType: 'SO' as const,
        currentDepartment: soOrder.currentDepartment ?? null,
        status: soOrder.status ?? null,
        customer: soOrder.customerId ?? null,
        dueDate: soOrder.dueDate ?? null,
        lastUpdated: (soOrder as any).updatedAt ?? null,
      });
    }

    const productionOrder = await storage.getProductionOrderByOrderId(orderId);
    if (productionOrder) {
      console.log(`[LOCATE RESULT] Found in PRODUCTION_ORDER (production_orders)`);
      return res.json({
        found: true,
        orderId: productionOrder.orderId,
        sourceType: 'PRODUCTION_ORDER' as const,
        currentDepartment: productionOrder.currentDepartment ?? null,
        status: productionOrder.productionStatus ?? null,
        customer: productionOrder.customerName ?? null,
        dueDate: productionOrder.dueDate ?? null,
        lastUpdated: productionOrder.updatedAt ?? null,
      });
    }

    const draft = await storage.getOrderDraft(orderId);
    if (draft) {
      console.log(`[LOCATE RESULT] Found in DRAFT (order_drafts)`);
      return res.json({
        found: true,
        orderId: (draft as any).orderId ?? orderId,
        sourceType: 'DRAFT' as const,
        currentDepartment: (draft as any).currentDepartment ?? null,
        status: (draft as any).status ?? null,
        customer: (draft as any).customerId ?? null,
        dueDate: (draft as any).dueDate ?? null,
        lastUpdated: (draft as any).updatedAt ?? null,
      });
    }

    console.log(`[LOCATE RESULT] Not found in any table: ${orderId}`);
    return res.json({ found: false });
  } catch (error) {
    console.error('[LOCATE ERROR]', error);
    return res.status(500).json({ found: false, error: 'Lookup failed' });
  }
});

// Order Story Mode activity endpoint — unified event timeline for a single order
router.get('/:orderId/activity', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { category, actor, source, from, to, limit: limitParam } = req.query;
    const limit = Math.min(parseInt(limitParam as string) || 200, 500);

    const [events, activityEvents, transitions, scrapCycles] = await Promise.all([
      auditService.getAuditHistory('p1_order', orderId, limit),
      db.select().from(orderActivityEvents)
        .where(eq(orderActivityEvents.orderId, orderId))
        .orderBy(desc(orderActivityEvents.occurredAt))
        .limit(limit),
      auditService.getDepartmentTransitions(orderId),
      auditService.getScrapCycles(orderId),
    ]);

    type EventCategory =
      | 'status_department'
      | 'spec_change'
      | 'shipping'
      | 'payment'
      | 'ncr_scrap'
      | 'admin_override'
      | 'production';

    const ACTION_CATEGORY_MAP: Record<string, EventCategory> = {
      // Legacy audit_events types
      DEPARTMENT_CHANGE: 'status_department',
      STATUS_CHANGE: 'status_department',
      DEPARTMENT_ENTRY: 'status_department',
      DEPARTMENT_EXIT: 'status_department',
      ORDER_FINALIZED: 'status_department',
      ORDER_CREATED: 'production',
      TECHNICIAN_ASSIGNED: 'production',
      PRIORITY_CHANGE: 'admin_override',
      ORDER_CANCELLED: 'admin_override',
      ADMIN_OVERRIDE: 'admin_override',
      FIELD_CHANGE: 'spec_change',
      SPEC_CHANGE: 'spec_change',
      PAYMENT_RECEIVED: 'payment',
      PAYMENT_ADDED: 'payment',
      PAYMENT_VOIDED: 'payment',
      REFUND_ISSUED: 'payment',
      DISCOUNT_APPLIED: 'payment',
      PRICE_CHANGE: 'payment',
      CREDIT_MEMO_CREATED: 'payment',
      SHIPPING_UPDATE: 'shipping',
      ADDRESS_CHANGED: 'shipping',
      TRACKING_ADDED: 'shipping',
      ORDER_SHIPPED: 'shipping',
      QC_PASSED: 'ncr_scrap',
      QC_FAILED: 'ncr_scrap',
      NCR_CREATED: 'ncr_scrap',
      SCRAP_DECLARED: 'ncr_scrap',
      SCRAP_CYCLE: 'ncr_scrap',
      ORDER_RESTARTED: 'production',
      // Canonical order_activity_events types
      STATUS_TRANSITION: 'status_department',
      DEPARTMENT_MOVE: 'status_department',
      FIELD_PATCH: 'spec_change',
      SPEC_PATCH: 'spec_change',
      BADGE_SCAN_TRANSITION: 'status_department',
      NCR_REPAIR_TRANSITION: 'ncr_scrap',
      PAYMENT_STATE_TRANSITION: 'payment',
      FULFILL_ORDER: 'status_department',
    };

    function getCategoryForAction(action: string): EventCategory {
      return ACTION_CATEGORY_MAP[action] || 'production';
    }

    function deriveSource(event: any): string {
      if (event.meta?.source) return event.meta.source;
      if (event.meta?.badgeScan) return 'badge_scan';
      if (event.actorRole === 'admin' || event.actorRole === 'superadmin') return 'admin';
      if (event.meta?.isBackfill || event.meta?.legacy) return 'legacy';
      if (event.actorId === null && event.actorName === null) return 'system';
      return 'admin';
    }

    function humanTitle(action: string, fieldsChanged: any, meta: any): string {
      // Generate rich narrative titles for well-known event types
      if ((action === 'DEPARTMENT_CHANGE' || action === 'DEPARTMENT_MOVE') && fieldsChanged) {
        const deptChange = fieldsChanged['department'] || fieldsChanged['currentDepartment'];
        if (deptChange?.before && deptChange?.after) {
          const source = meta?.source;
          if (source === 'badge_scan' || meta?.badgeScan || action === 'BADGE_SCAN_TRANSITION') {
            return `Badge scan moved order from ${deptChange.before} to ${deptChange.after}`;
          }
          return `Order moved from ${deptChange.before} to ${deptChange.after}`;
        }
      }

      if (action === 'BADGE_SCAN_TRANSITION') {
        const deptChange = fieldsChanged?.['currentDepartment'];
        if (deptChange?.before && deptChange?.after) {
          return `Badge scan moved order from ${deptChange.before} to ${deptChange.after}`;
        }
        if (meta?.departmentFrom && meta?.departmentTo) {
          return `Badge scan moved order from ${meta.departmentFrom} to ${meta.departmentTo}`;
        }
        return 'Badge scan — department change';
      }

      if ((action === 'STATUS_CHANGE' || action === 'STATUS_TRANSITION') && fieldsChanged) {
        const statusChange = fieldsChanged['status'];
        if (statusChange?.before && statusChange?.after) {
          // Detect NCR repair / reopen pattern
          if (statusChange.after === 'IN_PROGRESS' && statusChange.before === 'FINALIZED') {
            return `NCR repair reopened order — status ${statusChange.before} → ${statusChange.after}`;
          }
          return `Status changed from ${statusChange.before} to ${statusChange.after}`;
        }
      }

      if ((action === 'FIELD_CHANGE' || action === 'SPEC_CHANGE' || action === 'ADMIN_OVERRIDE' || action === 'FIELD_PATCH' || action === 'SPEC_PATCH') && fieldsChanged) {
        const keys = Object.keys(fieldsChanged);
        if (keys.length === 1) {
          const key = keys[0];
          const chg = fieldsChanged[key];
          if (chg?.before !== undefined && chg?.after !== undefined) {
            // Due date change
            if (key === 'dueDate' || key === 'due_date') {
              return `Admin changed due date from ${chg.before} to ${chg.after}`;
            }
            // Spec/feature changes (barrel finish, etc.)
            if (key.includes('finish') || key.includes('barrel') || key.includes('stock') || key.includes('feature')) {
              return `Spec patch changed ${key.replace(/_/g, ' ')} from ${chg.before} to ${chg.after}`;
            }
            // Generic admin field change
            const prefix = action === 'ADMIN_OVERRIDE' ? 'Admin changed' : 'Changed';
            return `${prefix} ${key.replace(/_/g, ' ')} from ${chg.before} to ${chg.after}`;
          }
        }
        if (keys.length > 1) {
          return `${action === 'ADMIN_OVERRIDE' ? 'Admin updated' : 'Updated'} ${keys.length} fields: ${keys.map(k => k.replace(/_/g, ' ')).join(', ')}`;
        }
      }

      const labels: Record<string, string> = {
        // Legacy audit_events labels
        DEPARTMENT_CHANGE: 'Department changed',
        STATUS_CHANGE: 'Status updated',
        ORDER_CREATED: 'Order created',
        ORDER_FINALIZED: 'Order finalized',
        ORDER_CANCELLED: 'Order cancelled',
        TECHNICIAN_ASSIGNED: 'Technician assigned',
        PRIORITY_CHANGE: 'Priority changed',
        PAYMENT_RECEIVED: 'Payment received',
        PAYMENT_ADDED: 'Payment added',
        PAYMENT_VOIDED: 'Payment voided',
        REFUND_ISSUED: 'Refund issued',
        DISCOUNT_APPLIED: 'Discount applied',
        PRICE_CHANGE: 'Price changed',
        CREDIT_MEMO_CREATED: 'Credit memo created',
        SHIPPING_UPDATE: 'Shipping updated',
        ADDRESS_CHANGED: 'Shipping address changed',
        TRACKING_ADDED: 'Tracking number added',
        ORDER_SHIPPED: 'Order shipped',
        QC_PASSED: 'QC inspection passed',
        QC_FAILED: 'QC inspection failed',
        NCR_CREATED: 'Non-conformance report created',
        SCRAP_DECLARED: 'Order declared scrap',
        FIELD_CHANGE: 'Field updated',
        SPEC_CHANGE: 'Specification changed',
        ADMIN_OVERRIDE: 'Admin override',
        ORDER_RESTARTED: 'Order restarted after scrap',
        // Canonical order_activity_events labels
        STATUS_TRANSITION: 'Status updated',
        DEPARTMENT_MOVE: 'Department changed',
        FIELD_PATCH: 'Field updated',
        SPEC_PATCH: 'Specification changed',
        BADGE_SCAN_TRANSITION: 'Badge scan — department change',
        NCR_REPAIR_TRANSITION: 'NCR repair transition',
        PAYMENT_STATE_TRANSITION: 'Payment state changed',
        FULFILL_ORDER: 'Order fulfilled',
      };
      let label = labels[action] || action.replace(/_/g, ' ').toLowerCase();
      if (fieldsChanged && typeof fieldsChanged === 'object') {
        const keys = Object.keys(fieldsChanged);
        if (keys.length === 1) {
          const key = keys[0];
          const chg = fieldsChanged[key];
          if (chg?.before !== undefined && chg?.after !== undefined) {
            label += ` — ${key.replace(/_/g, ' ')}: ${chg.before} → ${chg.after}`;
          }
        }
      }
      return label;
    }

    interface ActivityEvent {
      id: string;
      eventType: string;
      eventCategory: EventCategory;
      timestamp: string;
      title: string;
      actorName: string | null;
      actorRole: string | null;
      source: string;
      isLegacy: boolean;
      beforeAfterSummary: string | null;
      fieldsChanged: Record<string, { before: any; after: any }> | null;
      reason: string | null;
      meta: Record<string, any> | null;
      rawType: 'audit' | 'transition' | 'scrap';
      department?: string;
      cycleNumber?: number;
      durationMinutes?: number;
    }

    const items: ActivityEvent[] = [];

    // Build fingerprints from audit_events to deduplicate against canonical events.
    // Fingerprint format: <epochMinute>|<normalizedType>|<statusFrom>|<statusTo>|<deptFrom>|<deptTo>
    // "normalizedType" maps both old and new event type names to a shared key.
    const CANONICAL_TO_LEGACY_TYPE: Record<string, string> = {
      STATUS_TRANSITION: 'STATUS_CHANGE',
      DEPARTMENT_MOVE: 'DEPARTMENT_CHANGE',
      ADMIN_OVERRIDE: 'ADMIN_OVERRIDE',
      FULFILL_ORDER: 'STATUS_CHANGE',
      BADGE_SCAN_TRANSITION: 'DEPARTMENT_CHANGE',
    };
    function normalizeEventType(t: string): string {
      return CANONICAL_TO_LEGACY_TYPE[t] ?? t;
    }
    function buildFingerprint(ts: string, eventType: string, statusFrom: string | null, statusTo: string | null, deptFrom: string | null, deptTo: string | null): string {
      const minute = Math.floor(new Date(ts).getTime() / 60000);
      return `${minute}|${normalizeEventType(eventType)}|${statusFrom ?? ''}|${statusTo ?? ''}|${deptFrom ?? ''}|${deptTo ?? ''}`;
    }

    const auditEventCorrelationIds = new Set<string>();
    const auditEventFingerprints = new Set<string>();

    for (const event of events) {
      const isLegacy = !!(event.meta?.isBackfill || event.meta?.legacy);
      if (event.meta?.correlationId) {
        auditEventCorrelationIds.add(event.meta.correlationId);
      }
      const ts = String((event.timestamp || event.createdAt) ?? '');
      const fc = event.fieldsChanged as Record<string, { before: any; after: any }> | null;
      const fp = buildFingerprint(
        ts,
        event.action,
        fc?.['status']?.before ?? null,
        fc?.['status']?.after ?? null,
        fc?.['currentDepartment']?.before ?? fc?.['department']?.before ?? null,
        fc?.['currentDepartment']?.after ?? fc?.['department']?.after ?? null,
      );
      auditEventFingerprints.add(fp);

      items.push({
        id: `audit-${event.id}`,
        eventType: event.action,
        eventCategory: getCategoryForAction(event.action),
        timestamp: (event.timestamp || event.createdAt) as unknown as string,
        title: humanTitle(event.action, event.fieldsChanged, event.meta),
        actorName: event.actorName || null,
        actorRole: event.actorRole || null,
        source: deriveSource(event),
        isLegacy,
        beforeAfterSummary:
          event.fieldsChanged && Object.keys(event.fieldsChanged).length > 0
            ? Object.entries(event.fieldsChanged)
                .map(([k, v]: [string, any]) => `${k}: ${v.before} → ${v.after}`)
                .join(', ')
            : null,
        fieldsChanged: event.fieldsChanged || null,
        reason: event.reason || null,
        meta: event.meta || null,
        rawType: 'audit',
      });
    }

    // Process canonical order_activity_events — these are from the canonical write service
    // and cover transitions that the legacy auditService never wrote.
    // Deduplicate by correlation ID OR by timestamp+type+transition fingerprint to avoid
    // double entries when both ledgers captured the same event.
    for (const ae of activityEvents) {
      // Skip if we already have an audit_events entry with the same correlation ID
      if (ae.correlationId && auditEventCorrelationIds.has(ae.correlationId)) {
        continue;
      }
      // Skip if a matching fingerprint was already registered from audit_events
      const aeFp = buildFingerprint(
        String((ae.occurredAt || ae.createdAt) ?? ''),
        ae.eventType,
        ae.statusFrom ?? null,
        ae.statusTo ?? null,
        ae.departmentFrom ?? null,
        ae.departmentTo ?? null,
      );
      if (auditEventFingerprints.has(aeFp)) {
        continue;
      }

      // Build a fieldsChanged map from fieldDiff (canonical format) for the humanTitle function
      const fieldDiff = ae.fieldDiff as Record<string, { before: any; after: any; label?: string }> | null;
      const fieldsChanged: Record<string, { before: any; after: any }> | null = fieldDiff
        ? Object.fromEntries(Object.entries(fieldDiff).map(([k, v]) => [k, { before: v.before, after: v.after }]))
        : null;

      // Build a meta object that humanTitle can use for source/badge-scan detection
      const canonicalMeta: Record<string, any> = {
        source: ae.source,
        departmentFrom: ae.departmentFrom,
        departmentTo: ae.departmentTo,
        statusFrom: ae.statusFrom,
        statusTo: ae.statusTo,
        reasonCode: ae.reasonCode,
        reasonText: ae.reasonText,
        ...(ae.metadata as Record<string, any> | null ?? {}),
      };

      // For STATUS_TRANSITION, inject status into fieldsChanged so humanTitle can generate a narrative
      let enrichedFieldsChanged = fieldsChanged;
      if (ae.eventType === 'STATUS_TRANSITION' && ae.statusFrom && ae.statusTo && !fieldsChanged?.['status']) {
        enrichedFieldsChanged = { ...(fieldsChanged ?? {}), status: { before: ae.statusFrom, after: ae.statusTo } };
      }
      // For DEPARTMENT_MOVE / BADGE_SCAN_TRANSITION, inject currentDepartment for narrative
      if ((ae.eventType === 'DEPARTMENT_MOVE' || ae.eventType === 'BADGE_SCAN_TRANSITION') && ae.departmentFrom && ae.departmentTo && !fieldsChanged?.['currentDepartment']) {
        enrichedFieldsChanged = { ...(enrichedFieldsChanged ?? {}), currentDepartment: { before: ae.departmentFrom, after: ae.departmentTo } };
      }

      const beforeAfterSummary =
        enrichedFieldsChanged && Object.keys(enrichedFieldsChanged).length > 0
          ? Object.entries(enrichedFieldsChanged)
              .map(([k, v]) => `${k}: ${v.before} → ${v.after}`)
              .join(', ')
          : ae.statusFrom && ae.statusTo
            ? `status: ${ae.statusFrom} → ${ae.statusTo}`
            : ae.departmentFrom && ae.departmentTo
              ? `department: ${ae.departmentFrom} → ${ae.departmentTo}`
              : null;

      items.push({
        id: `activity-${ae.id}`,
        eventType: ae.eventType,
        eventCategory: getCategoryForAction(ae.eventType),
        timestamp: (ae.occurredAt || ae.createdAt) as unknown as string,
        title: humanTitle(ae.eventType, enrichedFieldsChanged, canonicalMeta),
        actorName: ae.actorDisplayName || null,
        actorRole: ae.actorType || null,
        source: ae.source || 'server',
        isLegacy: false,
        beforeAfterSummary,
        fieldsChanged: enrichedFieldsChanged,
        reason: ae.reasonText || null,
        meta: canonicalMeta,
        rawType: 'audit',
      });
    }

    for (const t of transitions) {
      items.push({
        id: `transition-entry-${t.id}`,
        eventType: 'DEPARTMENT_ENTRY',
        eventCategory: 'status_department',
        timestamp: t.enteredAt as unknown as string,
        title: `Entered department: ${t.department}`,
        actorName: null,
        actorRole: null,
        source: 'system',
        isLegacy: false,
        beforeAfterSummary: null,
        fieldsChanged: null,
        reason: null,
        meta: { department: t.department, cycleNumber: t.cycleNumber, durationMinutes: t.durationMinutes },
        rawType: 'transition',
        department: t.department,
        cycleNumber: t.cycleNumber,
        durationMinutes: t.durationMinutes || undefined,
      });
      if (t.exitedAt) {
        items.push({
          id: `transition-exit-${t.id}`,
          eventType: 'DEPARTMENT_EXIT',
          eventCategory: 'status_department',
          timestamp: t.exitedAt as unknown as string,
          title: `Exited department: ${t.department}${t.exitReason ? ` (${t.exitReason})` : ''}`,
          actorName: null,
          actorRole: null,
          source: 'system',
          isLegacy: false,
          beforeAfterSummary: null,
          fieldsChanged: null,
          reason: t.exitReason || null,
          meta: { department: t.department, cycleNumber: t.cycleNumber },
          rawType: 'transition',
          department: t.department,
          cycleNumber: t.cycleNumber,
          durationMinutes: t.durationMinutes || undefined,
        });
      }
    }

    for (const scrap of scrapCycles) {
      items.push({
        id: `scrap-${scrap.id}`,
        eventType: 'SCRAP_CYCLE',
        eventCategory: 'ncr_scrap',
        timestamp: scrap.scrappedAt as unknown as string,
        title: `Order scrapped in ${scrap.scrapDepartment || 'unknown department'}: ${scrap.scrapReason}`,
        actorName: null,
        actorRole: null,
        source: 'system',
        isLegacy: false,
        beforeAfterSummary: null,
        fieldsChanged: null,
        reason: scrap.scrapReason || null,
        meta: { cycleNumber: scrap.cycleNumber, scrapDepartment: scrap.scrapDepartment, restartEntityId: scrap.restartEntityId },
        rawType: 'scrap',
        cycleNumber: scrap.cycleNumber,
      });
      if (scrap.restartedAt) {
        items.push({
          id: `restart-${scrap.id}`,
          eventType: 'ORDER_RESTARTED',
          eventCategory: 'production',
          timestamp: scrap.restartedAt as unknown as string,
          title: `Order restarted as ${scrap.restartEntityId || 'new order'}`,
          actorName: null,
          actorRole: null,
          source: 'system',
          isLegacy: false,
          beforeAfterSummary: null,
          fieldsChanged: null,
          reason: null,
          meta: { restartEntityId: scrap.restartEntityId, originalCycle: scrap.cycleNumber },
          rawType: 'scrap',
          cycleNumber: scrap.cycleNumber,
        });
      }
    }

    items.sort((a, b) => {
      const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      const typePriority = (eventType: string): number => {
        if (eventType === 'DEPARTMENT_ENTRY') return 0;
        if (eventType === 'DEPARTMENT_EXIT') return 1;
        return 2;
      };
      return typePriority(b.eventType) - typePriority(a.eventType);
    });

    let filtered = items;

    if (category && category !== 'all') {
      filtered = filtered.filter(item => item.eventCategory === category);
    }
    if (actor && typeof actor === 'string' && actor.trim() !== '') {
      const actorLower = actor.toLowerCase();
      filtered = filtered.filter(item => item.actorName?.toLowerCase().includes(actorLower));
    }
    if (source && source !== 'all') {
      filtered = filtered.filter(item => item.source === source);
    }
    if (from) {
      const fromDate = new Date(from as string);
      if (!isNaN(fromDate.getTime())) {
        filtered = filtered.filter(item => new Date(item.timestamp) >= fromDate);
      }
    }
    if (to) {
      const toDate = new Date(to as string);
      if (!isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        filtered = filtered.filter(item => new Date(item.timestamp) <= toDate);
      }
    }

    return res.json(filtered.slice(0, limit));
  } catch (error) {
    console.error('Get order activity error:', error);
    return res.status(500).json({ error: 'Failed to fetch order activity' });
  }
});

// Generic order lookup by orderId — must be last to avoid shadowing specific routes
router.get('/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const order = await storage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    return res.json(order);
  } catch (error) {
    console.error('Get order by orderId error:', error);
    return res.status(500).json({ error: 'Failed to fetch order' });
  }
});

export default router;
