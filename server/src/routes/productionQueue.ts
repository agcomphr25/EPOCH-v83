import { Router, Request, Response } from 'express';
import { pool } from '../../db';
import { storage } from '../../storage';
import { authorizeApiRoute } from '../../middleware/routeAuthorization';
import { computeEffectivePriority, getEffectivePriorityScore, compareOrderPriority } from '../../../shared/utils/computeEffectivePriority';
import { auditUpdateOrders } from '../services/orderAuditWrapper';

function logDuplicatePrevention(event: string, details: Record<string, any>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'DUPLICATE_PREVENTION',
    event,
    ...details
  }));
}

const router = Router();

// Helper function to automatically handle orders that need attention or movement
async function autoMoveInvalidStockModelOrders(storage: any) {
  try {
    const allOrders = await storage.getAllOrders();

    // Split orders into two categories: those to move to Shipping QC vs those needing attention
    const ordersToMoveToShipping = [];
    const ordersNeedingAttention = [];

    for (const order of allOrders) {
      const currentDept = order.currentDepartment;
      const stockModel = order.stockModelId || order.modelId;
      const features = order.features || {};

      // Only check orders in P1 Production Queue
      if (currentDept !== 'P1 Production Queue') {
        continue;
      }

      // Orders with "no_stock", "no stock", or "None" go directly to Shipping QC
      if (
        stockModel &&
        (stockModel.toLowerCase() === 'no_stock' ||
          stockModel.toLowerCase() === 'no stock' ||
          stockModel.toLowerCase() === 'none')
      ) {
        ordersToMoveToShipping.push(order);
      }
      // Orders with missing stock model or missing action_length need attention
      // Flattop orders are excluded - they never need attention
      // M1A models are excluded from action_length/action_inlet/barrel_inlet/bottom_metal checks
      else if (
        !order.isFlattop &&
        (!stockModel ||
        stockModel === '' ||
        (!features.action_length &&
          features.action_length !== 0 &&
          !(stockModel && stockModel.toLowerCase().includes('m1a'))))
      ) {
        ordersNeedingAttention.push(order);
      }
    }

    console.log(
      `🧹 Found ${ordersToMoveToShipping.length} orders to move to Shipping QC and ${ordersNeedingAttention.length} orders needing attention`
    );

    // Move orders with "no_stock"/"None" to Shipping QC
    for (const order of ordersToMoveToShipping) {
      const stockModel = order.stockModelId || order.modelId || 'empty';
      console.log(
        `🚀 AUTO-MOVING: Order ${order.orderId} (stock model: "${stockModel}") from P1 Production Queue → Shipping QC`
      );

      try {
        await storage.updateFinalizedOrder(order.orderId, {
          currentDepartment: 'Shipping QC',
          updatedAt: new Date(),
        });
        console.log(
          `✅ Successfully moved order ${order.orderId} to Shipping QC`
        );
      } catch (error) {
        console.error(`❌ Failed to move order ${order.orderId}:`, error);
      }
    }

    // Log orders needing attention (these will be returned by a separate endpoint)
    for (const order of ordersNeedingAttention) {
      const stockModel = order.stockModelId || order.modelId || 'empty';
      const features = order.features || {};
      const missingItems = [];

      if (!stockModel || stockModel === '') {
        missingItems.push('stock model');
      }
      if (!features.action_length || features.action_length === '') {
        missingItems.push('action length');
      }

      console.log(
        `⚠️ ORDER NEEDS ATTENTION: Order ${order.orderId} missing: ${missingItems.join(', ')}`
      );
    }

    if (
      ordersToMoveToShipping.length > 0 ||
      ordersNeedingAttention.length > 0
    ) {
      console.log(
        `🧹 AUTO-CLEANUP COMPLETE: Moved ${ordersToMoveToShipping.length} orders to Shipping QC, identified ${ordersNeedingAttention.length} orders needing attention`
      );
    }
  } catch (error) {
    console.error('❌ Error in autoMoveInvalidStockModelOrders:', error);
  }
}

// Apply authorization middleware to all routes AFTER the debug endpoint
router.use(authorizeApiRoute());

// Auto-populate Production Queue with all finalized orders that have valid stock models
router.post('/auto-populate', async (req: Request, res: Response) => {
  try {
    console.log(
      '🏭 AUTO-POPULATE: Starting production queue auto-population...'
    );

    // UNIFIED PRIORITY MODEL: Include all priority fields for computeEffectivePriority()
    const ordersQuery = `
      SELECT 
        o.order_id as orderId,
        o.model_id as modelId,
        o.model_id as stockModelId,
        o.due_date as dueDate,
        o.order_date as orderDate,
        o.current_department as currentDepartment,
        o.status,
        o.features,
        o.created_at as createdAt,
        o.urgency,
        o.is_manual_urgency as isManualUrgency,
        o.manual_priority_override as manualPriorityOverride,
        o.priority_source as prioritySource,
        CASE 
          WHEN o.model_id IS NULL OR o.model_id = '' OR o.model_id = 'None' OR LOWER(o.model_id) = 'no stock' OR LOWER(o.model_id) = 'no_stock' THEN false
          ELSE true
        END as hasValidStock
      FROM all_orders o
      WHERE (o.status = 'FINALIZED' OR (o.status = 'IN_PROGRESS' AND o.current_department = 'P1 Production Queue'))
        AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
        AND o.current_department NOT IN ('Shipping', 'Layup/Plugging', 'Barcode', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'Shipping QC')
        AND (o.model_id IS NOT NULL AND o.model_id != '' AND o.model_id != 'None' 
             AND LOWER(o.model_id) != 'no stock' AND LOWER(o.model_id) != 'no_stock')
      ORDER BY o.due_date ASC, o.created_at ASC
    `;

    const ordersResult = await pool.query(ordersQuery);
    const eligibleOrders = Array.isArray(ordersResult)
      ? ordersResult
      : ordersResult.rows || [];

    console.log(
      `📋 Found ${eligibleOrders.length} eligible orders for production queue`
    );

    // Calculate priority scores for each order
    const now = new Date();
    const ordersWithPriority = eligibleOrders.map(
      (order: any, index: number) => {
        const dueDate = new Date(
          order.dueDate || order.orderDate || '2099-12-31'
        );
        const daysToDue = Math.floor(
          (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        // UNIFIED PRIORITY MODEL: Use computeEffectivePriority() for runtime calculation
        const priorityResult = computeEffectivePriority({
          dueDate: order.dueDate,
          urgency: order.urgency,
          isManualUrgency: order.isManualUrgency,
          manualPriorityOverride: order.manualPriorityOverride,
        });

        return {
          ...order,
          priorityScore: priorityResult.score, // COMPUTED, not persisted
          prioritySource: priorityResult.source,
          priorityReason: priorityResult.reason,
          daysToDue,
          queuePosition: index + 1,
        };
      }
    );

    // UNIFIED PRIORITY MODEL: Sort using shared compareOrderPriority comparator
    ordersWithPriority.sort(compareOrderPriority);

    // Update orders to P1 Production Queue department with priority scores
    const updatedOrders = [];
    for (let i = 0; i < ordersWithPriority.length; i++) {
      const order = ordersWithPriority[i];

      try {
        // Update order department and add priority metadata
        await auditUpdateOrders({
          db: pool,
          orderIds: [order.orderId],
          changes: {
            current_department: 'P1 Production Queue',
          },
          source: 'AUTO_POPULATE',
          user: (req as any).user,
          reason: 'Auto populate production queue',
          ip: req.ip,
          userAgent: req.headers['user-agent'] as string | null,
        });
        updatedOrders.push({
          orderId: order.orderId,
          priorityScore: order.priorityScore,
          queuePosition: i + 1,
          daysToDue: order.daysToDue,
        });

        console.log(
          `✅ Order ${order.orderId}: Priority ${order.priorityScore}, Queue Position ${i + 1}, Days to Due: ${order.daysToDue}`
        );
      } catch (error) {
        console.error(`❌ Failed to update order ${order.orderId}:`, error);
      }
    }

    const result = {
      success: true,
      message: `Successfully auto-populated production queue with ${updatedOrders.length} orders`,
      ordersProcessed: updatedOrders.length,
      orders: updatedOrders,
    };

    console.log('🏭 AUTO-POPULATE: Production queue auto-population completed');
    res.json(result);
  } catch (error) {
    console.error(
      '❌ AUTO-POPULATE: Production queue auto-population error:',
      error
    );
    res.status(500).json({
      success: false,
      error: 'Failed to auto-populate production queue',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get P1 Production Queue (for P1 purchase orders)
router.get('/p1-queue', async (req: Request, res: Response) => {
  try {
    console.log('🏭 P1 QUEUE: Fetching P1 production queue...');

    const queueResult = await pool.query(`
      SELECT 
        order_id,
        customer_name,
        item_name,
        due_date,
        order_date,
        current_department,
        production_status,
        po_number
      FROM production_orders
      WHERE current_department = 'P1 Production Queue'
        AND production_status IN ('PENDING', 'IN_PROGRESS')
      ORDER BY due_date ASC, created_at ASC
    `);

    const orders = Array.isArray(queueResult)
      ? queueResult
      : queueResult.rows || [];

    // Calculate current priority metrics
    const now = new Date();
    const enhancedQueue = orders.map((order: any) => {
      const dueDate = new Date(order.due_date || order.date);
      const daysToDue = Math.floor(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        orderId: order.order_id,
        customerName: order.customer_name,
        itemName: order.item_name,
        dueDate: order.due_date,
        orderDate: order.order_date,
        currentDepartment: order.current_department,
        status: order.production_status,
        poNumber: order.po_number,
        daysToDue,
        isOverdue: daysToDue < 0,
        urgencyLevel:
          daysToDue < 0
            ? 'critical'
            : daysToDue <= 7
              ? 'high'
              : daysToDue <= 14
                ? 'medium'
                : 'normal',
      };
    });

    console.log(`📋 Fetched ${enhancedQueue.length} P1 production orders`);
    res.json(enhancedQueue);
  } catch (error) {
    console.error('❌ P1 QUEUE: Error fetching P1 queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch P1 production queue',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get Production Queue with priority scores (for regular orders)
router.get('/prioritized', async (req: Request, res: Response) => {
  try {
    const requestUser = req.user;
    console.log(
      `🏭 PRIORITIZED QUEUE: Fetching for user ${requestUser?.username} (role: ${requestUser?.role})...`
    );

    // DIAGNOSTIC: Count orders at each filter stage to debug production issues
    try {
      // Schema-safe diagnostic query - avoid referencing columns that may not exist
      const diagnosticQuery = `
        SELECT 
          COUNT(*) as total_in_dept,
          COUNT(*) FILTER (WHERE status IN ('FINALIZED', 'Active', 'IN_PROGRESS')) as valid_status,
          COUNT(*) FILTER (WHERE is_cancelled IS NULL OR is_cancelled = false) as not_cancelled,
          COUNT(*) FILTER (WHERE model_id IS NOT NULL AND model_id != '' AND model_id != 'None') as has_model,
          COUNT(*) FILTER (WHERE features->>'action_length' IS NOT NULL AND features->>'action_length' != '' AND features->>'action_length' != 'null') as has_action_length,
          COUNT(*) FILTER (
            WHERE status IN ('FINALIZED', 'Active', 'IN_PROGRESS')
            AND (is_cancelled IS NULL OR is_cancelled = false)
            AND model_id IS NOT NULL AND model_id != '' AND model_id != 'None'
            AND LOWER(model_id) NOT IN ('no stock', 'no_stock')
            AND (
              features->>'action_length' IS NOT NULL AND features->>'action_length' != '' AND features->>'action_length' != 'null'
              OR LOWER(model_id) LIKE '%m1a%'
              OR is_flattop = true
            )
          ) as passes_all_filters
        FROM all_orders 
        WHERE current_department = 'P1 Production Queue'
      `;
      const diagResult = await pool.query(diagnosticQuery);
      const diagData = Array.isArray(diagResult) ? diagResult[0] : diagResult.rows?.[0];
      console.log(`🔍 PRODUCTION QUEUE DIAGNOSTICS:`, JSON.stringify(diagData));
    } catch (diagErr) {
      console.error('Diagnostic query failed:', diagErr);
    }

    // AUTOMATIC CLEANUP: Handle orders that need attention or movement
    console.log('🧹 CLEANUP: Processing orders that need attention...');
    await autoMoveInvalidStockModelOrders(storage);

    // Schema-safe query: avoid referencing columns that may not exist in all environments
    // UNIFIED PRIORITY MODEL: Include all priority-related fields for computeEffectivePriority()
    // NOTE: P1 PO orders are handled separately in their dedicated P1 Purchase Orders queue
    // This query only includes regular customer orders from all_orders
    const queueQuery = `
      SELECT 
        o.order_id as orderId,
        o.fb_order_number as fbOrderNumber,
        o.model_id as modelId,
        o.model_id as stockModelId,
        o.due_date as dueDate,
        o.order_date as orderDate,
        o.current_department as currentDepartment,
        o.status,
        o.customer_id as customerId,
        o.features,
        o.urgency,
        o.is_manual_urgency as isManualUrgency,
        NULL as manual_priority_override,
        NULL as prioritySource,
        'ready' as productionReadinessStatus,
        0 as queuePosition,
        o.created_at as createdAt,
        COALESCE(c.name, 'Customer ' || o.customer_id) as customerName,
        'SALES' as orderSource,
        o.is_flattop as "isFlattop"
      FROM all_orders o
      LEFT JOIN customers c ON o.customer_id ~ '^[0-9]+$' AND CAST(o.customer_id AS INTEGER) = c.id
      WHERE o.current_department = 'P1 Production Queue'
        AND o.status IN ('FINALIZED', 'Active', 'IN_PROGRESS')
        AND (o.is_cancelled IS NULL OR o.is_cancelled = false)
        AND o.model_id IS NOT NULL 
        AND o.model_id != '' 
        AND o.model_id != 'None'
        AND LOWER(o.model_id) != 'no stock'
        AND LOWER(o.model_id) != 'no_stock'
        AND (
          (o.features->>'action_length' IS NOT NULL AND o.features->>'action_length' != '' AND o.features->>'action_length' != 'null')
          OR LOWER(o.model_id) LIKE '%m1a%'
          OR o.is_flattop = true
        )
      ORDER BY 
        o.due_date ASC,
        o.created_at ASC
    `;

    const queueResult = await pool.query(queueQuery);
    console.log(`🏭 PRIORITIZED QUEUE: Raw result type: ${typeof queueResult}, isArray: ${Array.isArray(queueResult)}`);
    console.log(`🏭 PRIORITIZED QUEUE: Raw result length/rows: ${Array.isArray(queueResult) ? queueResult.length : (queueResult?.rows?.length || 'no rows')}`);
    
    const prioritizedQueue = Array.isArray(queueResult)
      ? queueResult
      : queueResult.rows || [];
    
    console.log(`🏭 PRIORITIZED QUEUE: Processed queue length: ${prioritizedQueue.length}`);

    // Calculate current priority metrics
    const now = new Date();
    const enhancedQueue = prioritizedQueue.map((order: any, index: number) => {
      const dueDate = new Date(order.dueDate || order.orderDate);
      const daysToDue = Math.floor(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // If manual urgency is set, use that; otherwise calculate from due date
      let urgencyLevel: 'critical' | 'high' | 'medium' | 'normal';
      if (order.ismanualurgency && order.urgency) {
        // Map database urgency values to urgencyLevel
        urgencyLevel = order.urgency === 'critical' ? 'critical'
                     : order.urgency === 'high' ? 'high'
                     : order.urgency === 'medium' ? 'medium'
                     : 'normal';
      } else {
        // Calculate from due date
        urgencyLevel = daysToDue < 0 ? 'critical'
                     : daysToDue <= 7 ? 'high'
                     : daysToDue <= 14 ? 'medium'
                     : 'normal';
      }

      // UNIFIED PRIORITY MODEL: Compute priority at runtime, never read from DB
      const priorityResult = computeEffectivePriority({
        dueDate: order.duedate,
        urgency: order.urgency,
        isManualUrgency: order.ismanualurgency,
        manualPriorityOverride: order.manual_priority_override,
      });

      return {
        orderId: order.orderid,
        fbOrderNumber: order.fbordernumber,
        modelId: order.modelid,
        stockModelId: order.modelid,
        dueDate: order.duedate,
        orderDate: order.orderdate,
        currentDepartment: order.currentdepartment,
        status: order.status,
        customerId: order.customerid,
        customerName: order.customername,
        features: order.features,
        priorityScore: priorityResult.score, // COMPUTED, not from DB
        prioritySource: priorityResult.source,
        priorityReason: priorityResult.reason,
        urgency: order.urgency,
        isManualUrgency: order.ismanualurgency,
        queuePosition: index + 1, // Will be re-assigned after sorting
        daysToDue,
        isOverdue: daysToDue < 0,
        urgencyLevel,
      };
    });

    // UNIFIED PRIORITY MODEL: Sort using shared compareOrderPriority comparator
    enhancedQueue.sort(compareOrderPriority);

    // Re-assign queue positions after sorting
    enhancedQueue.forEach((order: any, idx: number) => {
      order.queuePosition = idx + 1;
    });

    console.log(
      `📋 Fetched ${enhancedQueue.length} orders from prioritized production queue`
    );
    res.json(enhancedQueue);
  } catch (error) {
    console.error(
      '❌ PRIORITIZED QUEUE: Error fetching prioritized queue:',
      error
    );
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prioritized production queue',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update priority scores manually
router.post('/update-priorities', async (req: Request, res: Response) => {
  try {
    const { orders } = req.body;

    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({
        success: false,
        error: 'Orders array is required',
      });
    }

    console.log(
      `🏭 PRIORITY UPDATE: Updating priorities for ${orders.length} orders`
    );

    const updatedOrders = [];
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];

      try {
        const updateQuery = `
          UPDATE all_orders 
          SET 
            updated_at = NOW()
          WHERE order_id = $1
        `;

        await pool.query(updateQuery, [order.orderId]);
        updatedOrders.push({
          orderId: order.orderId,
          priorityScore: order.priorityScore,
          queuePosition: i + 1,
        });
      } catch (error) {
        console.error(
          `❌ Failed to update priority for order ${order.orderId}:`,
          error
        );
      }
    }

    res.json({
      success: true,
      message: `Successfully updated priorities for ${updatedOrders.length} orders`,
      updatedOrders,
    });
  } catch (error) {
    console.error('❌ PRIORITY UPDATE: Error updating priorities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update priorities',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get PO items ready for production
router.get('/po-items', async (req: Request, res: Response) => {
  try {
    console.log(
      '🏭 PO ITEMS: Fetching STOCK MODEL PO items ready for production (excluding non-stock items)...'
    );

    const poItemsQuery = `
      SELECT 
        poi.id,
        poi.po_id as poid,
        po.po_number as ponumber,
        poi.item_name as itemname,
        poi.item_id as stockmodelid,
        poi.item_name as stockmodelname,
        poi.quantity,
        poi.unit_price as unitprice,
        poi.total_price as totalprice,
        poi.order_count as ordercount,
        poi.specifications,
        poi.notes,
        poi.item_type as itemtype,
        po.customer_name as customername,
        po.expected_delivery as duedate,
        po.created_at as createdAt
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.po_id = po.id
      LEFT JOIN po_products pp ON (poi.item_type = 'custom_model' AND poi.item_id = pp.id::text)
      WHERE poi.quantity > 0 
        AND (poi.item_id IS NOT NULL AND poi.item_id != '' AND poi.item_id != 'None')
        AND (
          poi.item_type = 'stock_model' 
          OR (poi.item_type = 'custom_model' AND pp.product_type = 'stock')
        )
        AND po.status != 'CANCELED'
        AND (po.is_cancelled IS NULL OR po.is_cancelled = false)
        AND (poi.order_count < poi.quantity OR poi.order_count IS NULL)
        AND (poi.stock_status IS NULL OR poi.stock_status NOT IN ('SHIPPED', 'FULFILLED'))
      ORDER BY po.expected_delivery ASC, po.created_at ASC
    `;

    const poItemsResult = await pool.query(poItemsQuery);
    const poItems = Array.isArray(poItemsResult)
      ? poItemsResult
      : poItemsResult.rows || [];

    // UNIFIED PRIORITY MODEL: Use computeEffectivePriority() for runtime calculation
    const now = new Date();
    const enhancedPOItems = poItems.map((item: any) => {
      const dueDate = new Date(item.dueDate || item.createdAt);
      const daysToDue = Math.floor(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Use centralized priority calculation
      const priorityResult = computeEffectivePriority({
        dueDate: item.dueDate,
        urgency: item.urgency,
        isManualUrgency: item.isManualUrgency,
        manualPriorityOverride: item.manualPriorityOverride,
      });

      return {
        ...item,
        priorityScore: priorityResult.score, // COMPUTED, not persisted
        prioritySource: priorityResult.source,
        priorityReason: priorityResult.reason,
        daysToDue,
        isOverdue: daysToDue < 0,
        urgencyLevel:
          daysToDue < 0
            ? 'critical'
            : daysToDue <= 7
              ? 'high'
              : daysToDue <= 14
                ? 'medium'
                : 'normal',
      };
    });

    console.log(
      `📋 Fetched ${enhancedPOItems.length} STOCK MODEL PO items ready for production (non-stock items excluded)`
    );
    res.json(enhancedPOItems);
  } catch (error) {
    console.error('❌ PO ITEMS: Error fetching PO items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch PO items',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Move PO item to layup scheduler
router.post('/po-to-layup', async (req: Request, res: Response) => {
  try {
    const { poItem } = req.body;

    if (!poItem || !poItem.id) {
      return res.status(400).json({
        success: false,
        error: 'PO item data is required',
      });
    }

    console.log(
      `🏭 PO TO LAYUP: Moving PO item ${poItem.id} to layup scheduler...`
    );

    // Create regular orders for the PO item quantity that go into the layup scheduler
    // Each unit will become a separate order in the all_orders table
    const createdOrders = [];

    for (let i = 1; i <= poItem.quantity; i++) {
      const orderQuery = `
        INSERT INTO all_orders (
          order_id,
          order_date,
          due_date,
          customer_id,
          model_id,
          current_department,
          status,
          notes,
          features,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
        )
        ON CONFLICT (order_id) DO NOTHING
        RETURNING order_id, model_id, current_department
      `;

      // CENTRALIZED: Use atomic order ID generator instead of inline pattern
      const orderId = await storage.generateNextOrderId();

      const poMaterial = poItem.specifications?.material || poItem.product?.material || poItem.material || null;
      const orderResult = await pool.query(orderQuery, [
        orderId,
        new Date().toISOString(),
        poItem.dueDate,
        poItem.customerName, // Using customer name as ID for PO orders
        poItem.stockModelId,
        'Layup/Plugging', // Move directly to layup
        'FINALIZED',
        `PO Item: ${poItem.itemName} (Unit ${i}/${poItem.quantity}) - PO #${poItem.poNumber}`,
        JSON.stringify({
          po_item_id: poItem.id,
          po_number: poItem.poNumber,
          unit_number: i,
          ...(poMaterial ? { material: poMaterial } : {}),
        }),
      ]);

      const orders = Array.isArray(orderResult)
        ? orderResult
        : orderResult.rows || [];
      if (orders.length > 0) {
        createdOrders.push(orders[0]);
        console.log(
          `✅ Created order ${orderId} for PO item ${poItem.itemName} (unit ${i}/${poItem.quantity})`
        );
        await pool.query(
          `INSERT INTO admin_audit_log
             (order_id, field_name, field_label, old_value, new_value, changed_by, user_role, change_type, reason, ip_address, user_agent, timestamp)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW())`,
          [
            orders[0].order_id,
            'ORDER_CREATED',
            'Order Created',
            JSON.stringify(null),
            JSON.stringify(orders[0]),
            (req as any).user?.username || 'SYSTEM',
            (req as any).user?.role || 'SYSTEM',
            'ORDER_CREATE',
            `Order created from PO item: ${poItem.itemName}`,
            req.ip ?? null,
            req.headers['user-agent'] ?? null,
          ]
        );
      }
    }

    // Update the PO item to track that it's been moved to production
    const updatePOItemQuery = `
      UPDATE purchase_order_items 
      SET 
        order_count = $1,
        updated_at = NOW()
      WHERE id = $2
    `;

    await pool.query(updatePOItemQuery, [poItem.quantity, poItem.id]);

    const result = {
      success: true,
      message: `Successfully moved ${poItem.itemName} (${poItem.quantity} units) to layup scheduler`,
      itemName: poItem.itemName,
      quantity: poItem.quantity,
      createdOrders: createdOrders.length,
      orders: createdOrders.map((order) => ({
        orderId: order.order_id,
        stockModelId: order.model_id,
      })),
    };

    console.log(
      `🏭 PO TO LAYUP: Successfully created ${createdOrders.length} orders for PO item ${poItem.itemName}`
    );
    res.json(result);
  } catch (error) {
    console.error('❌ PO TO LAYUP: Error moving PO item to layup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to move PO item to layup scheduler',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Move selected weeks from PO item to layup scheduler
router.post('/po-weeks-to-layup', async (req: Request, res: Response) => {
  try {
    const { poItem, selectedWeeks } = req.body;

    if (!poItem || !poItem.id || !selectedWeeks || selectedWeeks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'PO item data and selected weeks are required',
      });
    }

    console.log(
      `🏭 PO WEEKS TO LAYUP: Moving ${selectedWeeks.length} weeks for PO item ${poItem.id} to layup scheduler...`
    );

    // First, get the production schedule to determine quantities for each week
    const scheduleResponse = await fetch(
      `http://localhost:5000/api/pos/${poItem.poid}/calculate-production-schedule`,
      {
        method: 'POST',
      }
    );

    if (!scheduleResponse.ok) {
      throw new Error('Failed to calculate production schedule');
    }

    const schedule = await scheduleResponse.json();

    if (
      !schedule.success ||
      !schedule.itemSchedules ||
      schedule.itemSchedules.length === 0
    ) {
      throw new Error('Invalid production schedule');
    }

    const weeklySchedule = schedule.itemSchedules[0].weeklySchedule;
    const createdOrders = [];
    let totalUnitsCreated = 0;

    // Create orders for each selected week
    for (const weekNumber of selectedWeeks) {
      const weekData = weeklySchedule.find((w) => w.week === weekNumber);
      if (!weekData) {
        console.warn(`⚠️ Week ${weekNumber} not found in schedule`);
        continue;
      }

      const unitsThisWeek = weekData.itemsToComplete;
      const weekDueDate = new Date(weekData.dueDate);

      console.log(
        `📅 Creating ${unitsThisWeek} orders for week ${weekNumber} (due: ${weekDueDate.toLocaleDateString()})`
      );

      // Create individual orders for this week's quantity
      for (let i = 1; i <= unitsThisWeek; i++) {
        const orderQuery = `
          INSERT INTO all_orders (
            order_id,
            order_date,
            due_date,
            customer_id,
            model_id,
            current_department,
            status,
            notes,
            features,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
          )
          ON CONFLICT (order_id) DO NOTHING
          RETURNING order_id, model_id, current_department
        `;

        // CENTRALIZED: Use atomic order ID generator instead of inline pattern
        const orderId = await storage.generateNextOrderId();

        const weekPoMaterial = poItem.specifications?.material || poItem.product?.material || poItem.material || null;
        const orderResult = await pool.query(orderQuery, [
          orderId,
          new Date().toISOString(),
          weekDueDate.toISOString(),
          poItem.customername || 'PO Customer',
          poItem.stockmodelid,
          'Layup/Plugging', // Move directly to layup
          'FINALIZED',
          `PO Item: ${poItem.itemname} (Week ${weekNumber}, Unit ${i}/${unitsThisWeek}) - PO #${poItem.ponumber}`,
          JSON.stringify({
            po_item_id: poItem.id,
            po_number: poItem.ponumber,
            week_number: weekNumber,
            unit_number: orderIndex,
            week_due_date: weekDueDate.toISOString(),
            ...(weekPoMaterial ? { material: weekPoMaterial } : {}),
          }),
        ]);

        const orders = Array.isArray(orderResult)
          ? orderResult
          : orderResult.rows || [];
        if (orders.length > 0) {
          // Store order with week metadata for scheduling
          const orderWithMeta = {
            ...orders[0],
            weekNumber: weekNumber,
            weekDueDate: weekDueDate.toISOString(),
            stockModelId: poItem.stockmodelid,
          };
          createdOrders.push(orderWithMeta);
          console.log(
            `✅ Created order ${orderId} for PO item ${poItem.itemname} (week ${weekNumber}, unit ${i}/${unitsThisWeek})`
          );
          await pool.query(
            `INSERT INTO admin_audit_log
               (order_id, field_name, field_label, old_value, new_value, changed_by, user_role, change_type, reason, ip_address, user_agent, timestamp)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW())`,
            [
              orders[0].order_id,
              'ORDER_CREATED',
              'Order Created',
              JSON.stringify(null),
              JSON.stringify(orders[0]),
              (req as any).user?.username || 'SYSTEM',
              (req as any).user?.role || 'SYSTEM',
              'ORDER_CREATE',
              `Order created from PO item: ${poItem.itemname} (week ${weekNumber})`,
              req.ip ?? null,
              req.headers['user-agent'] ?? null,
            ]
          );
        }
      }

      totalUnitsCreated += unitsThisWeek;
    }

    // Update the PO item to track partial production
    const updatePOItemQuery = `
      UPDATE purchase_order_items 
      SET 
        order_count = COALESCE(order_count, 0) + $1,
        updated_at = NOW()
      WHERE id = $2
    `;

    await pool.query(updatePOItemQuery, [totalUnitsCreated, poItem.id]);

    // Add created orders to layup schedule for their respective weeks
    console.log(
      `📅 Adding ${createdOrders.length} orders to layup schedule...`
    );

    for (const order of createdOrders) {
      // Use the metadata we stored with the order
      const weekDueDate = new Date(order.weekDueDate);

      // Find a compatible mold for this stock model
      const moldsQuery = `
        SELECT mold_id, stock_models
        FROM molds 
        WHERE enabled = true 
        AND stock_models ? $1
        LIMIT 1
      `;

      const moldResult = await pool.query(moldsQuery, [order.stockModelId]);
      const molds = Array.isArray(moldResult)
        ? moldResult
        : moldResult.rows || [];

      if (molds.length > 0) {
        const mold = molds[0];

        // Add to layup schedule
        const scheduleQuery = `
          INSERT INTO layup_schedule (
            order_id,
            scheduled_date,
            mold_id,
            employee_id,
            priority_score,
            is_locked,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, NOW(), NOW()
          )
        `;

        await pool.query(scheduleQuery, [
          order.order_id,
          weekDueDate.toISOString(),
          mold.mold_id,
          null, // No specific employee assigned yet
          1500, // High priority for PO items
          false,
        ]);

        console.log(
          `✅ Added order ${order.order_id} to layup schedule for week ${order.weekNumber} (${weekDueDate.toLocaleDateString()})`
        );
      } else {
        console.warn(
          `⚠️ No compatible mold found for stock model ${order.stockModelId} - order ${order.order_id} not scheduled`
        );
      }
    }

    const result = {
      success: true,
      message: `Successfully moved ${selectedWeeks.length} weeks (${totalUnitsCreated} units) to layup scheduler`,
      itemName: poItem.itemname,
      weeksSelected: selectedWeeks.length,
      totalUnits: totalUnitsCreated,
      createdOrders: createdOrders.length,
      weeks: selectedWeeks,
      orders: createdOrders.map((order) => ({
        orderId: order.order_id,
        stockModelId: order.model_id,
      })),
    };

    console.log(
      `🏭 PO WEEKS TO LAYUP: Successfully created ${createdOrders.length} orders for ${selectedWeeks.length} weeks of PO item ${poItem.itemname}`
    );
    res.json(result);
  } catch (error) {
    console.error(
      '❌ PO WEEKS TO LAYUP: Error moving PO weeks to layup:',
      error
    );
    res.status(500).json({
      success: false,
      error: 'Failed to move selected weeks to layup scheduler',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Move selected PO items to layup scheduler
router.post('/move-selected-po-items', async (req: Request, res: Response) => {
  try {
    const {
      selectedItems,
    }: { selectedItems: { item: any; quantity: number }[] } = req.body;

    if (!selectedItems || selectedItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selected items data is required',
      });
    }

    console.log(
      `🏭 MOVE SELECTED PO ITEMS: Moving ${selectedItems.length} selected PO items to layup scheduler...`
    );

    const createdOrders = [];
    let totalItemsMoved = 0;

    for (const { item, quantity } of selectedItems) {
      console.log(
        `📦 Processing ${quantity} units of ${item.itemname} (PO #${item.ponumber})`
      );

      // Create individual orders for each quantity unit
      for (let i = 1; i <= quantity; i++) {
        try {
          // CENTRALIZED: Use atomic order ID generator instead of inline MAX() query
          const orderId = await storage.generateNextOrderId();

          // Create order in all_orders table
          const orderQuery = `
            INSERT INTO all_orders (
              order_id,
              order_date,
              due_date,
              customer_id,
              model_id,
              current_department,
              status,
              notes,
              total_price,
              is_priority,
              priority_score,
              created_at,
              po_reference,
              po_item_id,
              features
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (order_id) DO NOTHING
            RETURNING *
          `;

          const selectedItemMaterial = item.specifications?.material || item.product?.material || item.material || null;
          const orderResult = await pool.query(orderQuery, [
            orderId,
            new Date().toISOString(),
            item.duedate,
            item.customername || 'PO Customer',
            item.stockmodelid,
            'P1 Production Queue',
            'ACTIVE',
            `Created from PO #${item.ponumber} - ${item.itemname}`,
            parseFloat(item.unitprice) || 0,
            true, // Mark as priority since it's from PO
            item.priorityScore || 1000,
            new Date().toISOString(),
            item.ponumber,
            item.id,
            JSON.stringify({
              po_item_id: item.id,
              po_number: item.ponumber,
              ...(selectedItemMaterial ? { material: selectedItemMaterial } : {}),
            }),
          ]);

          if (orderResult.rows.length > 0) {
            const createdOrder = orderResult.rows[0];
            createdOrders.push(createdOrder);
            totalItemsMoved++;

            console.log(
              `✅ Created order ${orderId} for PO item ${item.itemname} (${i}/${quantity})`
            );

            await pool.query(
              `INSERT INTO admin_audit_log
                 (order_id, field_name, field_label, old_value, new_value, changed_by, user_role, change_type, reason, ip_address, user_agent, timestamp)
               VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, NOW())`,
              [
                orderId,
                'ORDER_CREATED',
                'Order Created',
                JSON.stringify(null),
                JSON.stringify(createdOrder),
                (req as any).user?.username || 'SYSTEM',
                (req as any).user?.role || 'SYSTEM',
                'ORDER_CREATE',
                `Order created from PO item: ${item.itemname}`,
                req.ip ?? null,
                req.headers['user-agent'] ?? null,
              ]
            );
          } else {
            console.warn(
              `⚠️ Order ${orderId} already exists in all_orders — skipping duplicate insert for PO item ${item.itemname} (${i}/${quantity})`
            );
          }
        } catch (orderError) {
          console.error(
            `❌ Failed to create order for ${item.itemname} (unit ${i}):`,
            orderError
          );
        }
      }

      // Update the order count for the PO item
      try {
        const currentOrderCount = item.ordercount || 0;
        const newOrderCount = currentOrderCount + quantity;

        const updatePOItemQuery = `
          UPDATE purchase_order_items 
          SET order_count = $1 
          WHERE id = $2
        `;

        await pool.query(updatePOItemQuery, [newOrderCount, item.id]);
        console.log(
          `📋 Updated PO item ${item.id} order count: ${currentOrderCount} → ${newOrderCount}`
        );
      } catch (updateError) {
        console.error(
          `❌ Failed to update order count for PO item ${item.id}:`,
          updateError
        );
      }
    }

    const result = {
      success: true,
      message: `Successfully moved ${totalItemsMoved} items to production queue`,
      totalItemsMoved,
      createdOrders: createdOrders.length,
      items: selectedItems.map(({ item, quantity }) => ({
        itemName: item.itemname,
        poNumber: item.ponumber,
        quantity,
      })),
    };

    console.log(
      `🏭 MOVE SELECTED PO ITEMS: Successfully created ${createdOrders.length} orders from ${selectedItems.length} PO items`
    );
    res.json(result);
  } catch (error) {
    console.error(
      '❌ MOVE SELECTED PO ITEMS: Error moving selected PO items:',
      error
    );
    res.status(500).json({
      success: false,
      error: 'Failed to move selected PO items to layup scheduler',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get Orders That Need Attention (missing critical information for layup scheduling)
router.get('/attention', async (req: Request, res: Response) => {
  try {
    console.log('🏭 ATTENTION QUEUE: Fetching orders that need attention...');

    const attentionQuery = `
      SELECT 
        o.order_id as orderId,
        o.fb_order_number as fbOrderNumber,
        o.model_id as modelId,
        o.model_id as stockModelId,
        o.due_date as dueDate,
        o.order_date as orderDate,
        o.current_department as currentDepartment,
        o.status,
        o.customer_id as customerId,
        o.features,
        o.created_at as createdAt,
        c.name as customerName
      FROM all_orders o
      LEFT JOIN customers c ON (
        CASE 
          WHEN o.customer_id ~ '^[0-9]+$' THEN CAST(o.customer_id AS INTEGER) = c.id
          ELSE FALSE
        END
      )
      WHERE o.current_department = 'P1 Production Queue'
        AND o.status IN ('FINALIZED', 'Active')
        AND o.features->>'po_item_id' IS NULL
        AND (o.is_flattop IS NULL OR o.is_flattop = false)
        AND (
          (o.model_id IS NULL OR o.model_id = '' OR o.model_id = 'None') OR
          (
            (o.features->>'action_length' IS NULL OR o.features->>'action_length' = '' OR o.features->>'action_length' = 'null')
            AND (LOWER(o.model_id) NOT LIKE '%m1a%')
          )
        )
      ORDER BY 
        o.due_date ASC,
        o.created_at ASC
    `;

    const attentionResult = await pool.query(attentionQuery);
    const attentionOrders = Array.isArray(attentionResult)
      ? attentionResult
      : attentionResult.rows || [];

    // Format the response with missing items identified
    const formattedOrders = attentionOrders.map((order: any) => {
      const missingItems = [];

      if (!order.modelid || order.modelid === '') {
        missingItems.push('stock model');
      }

      const features = order.features || {};
      if (
        !features.action_length ||
        features.action_length === '' ||
        features.action_length === null
      ) {
        missingItems.push('action length');
      }

      return {
        orderId: order.orderid,
        fbOrderNumber: order.fbordernumber,
        modelId: order.modelid,
        stockModelId: order.modelid,
        dueDate: order.duedate,
        orderDate: order.orderdate,
        currentDepartment: order.currentdepartment,
        status: order.status,
        customerId: order.customerid,
        customerName: order.customername,
        features: order.features,
        createdAt: order.createdat,
        missingItems: missingItems,
        reasonText: `Missing ${missingItems.join(' and ')} - cannot proceed to layup scheduling`,
      };
    });

    console.log(`📋 Found ${formattedOrders.length} orders needing attention`);
    res.json(formattedOrders);
  } catch (error) {
    console.error(
      '❌ ATTENTION QUEUE: Error fetching orders needing attention:',
      error
    );
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders needing attention',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
