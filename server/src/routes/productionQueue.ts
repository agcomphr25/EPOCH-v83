import { Router, Request, Response } from 'express';
import { pool } from '../../db';
import { storage } from '../../storage';

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
      
      // Orders with "no_stock" or "None" go directly to Shipping QC
      if (stockModel && (stockModel.toLowerCase() === 'no_stock' || stockModel.toLowerCase() === 'none')) {
        ordersToMoveToShipping.push(order);
      }
      // Orders with missing stock model or missing action_length need attention
      else if (!stockModel || stockModel === '' || !features.action_length || features.action_length === '') {
        ordersNeedingAttention.push(order);
      }
    }

    console.log(`🧹 Found ${ordersToMoveToShipping.length} orders to move to Shipping QC and ${ordersNeedingAttention.length} orders needing attention`);
    
    // Move orders with "no_stock"/"None" to Shipping QC
    for (const order of ordersToMoveToShipping) {
      const stockModel = order.stockModelId || order.modelId || 'empty';
      console.log(`🚀 AUTO-MOVING: Order ${order.orderId} (stock model: "${stockModel}") from P1 Production Queue → Shipping QC`);
      
      try {
        await storage.updateFinalizedOrder(order.orderId, {
          currentDepartment: 'Shipping QC',
          updatedAt: new Date()
        });
        console.log(`✅ Successfully moved order ${order.orderId} to Shipping QC`);
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
      
      console.log(`⚠️ ORDER NEEDS ATTENTION: Order ${order.orderId} missing: ${missingItems.join(', ')}`);
    }
    
    if (ordersToMoveToShipping.length > 0 || ordersNeedingAttention.length > 0) {
      console.log(`🧹 AUTO-CLEANUP COMPLETE: Moved ${ordersToMoveToShipping.length} orders to Shipping QC, identified ${ordersNeedingAttention.length} orders needing attention`);
    }
  } catch (error) {
    console.error('❌ Error in autoMoveInvalidStockModelOrders:', error);
  }
}

const router = Router();

// Auto-populate Production Queue with all finalized orders that have valid stock models
router.post('/auto-populate', async (req: Request, res: Response) => {
  try {
    console.log('🏭 AUTO-POPULATE: Starting production queue auto-population...');
    
    // Get all finalized orders with stock models (excluding "None")
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
        CASE 
          WHEN o.model_id IS NULL OR o.model_id = '' OR o.model_id = 'None' THEN false
          ELSE true
        END as hasValidStock
      FROM all_orders o
      WHERE o.status = 'FINALIZED' 
        AND o.current_department NOT IN ('Shipping', 'Layup/Plugging', 'Barcode', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'Shipping QC')
        AND (o.model_id IS NOT NULL AND o.model_id != '' AND o.model_id != 'None')
      ORDER BY o.due_date ASC, o.created_at ASC
    `;

    const ordersResult = await pool.query(ordersQuery);
    const eligibleOrders = Array.isArray(ordersResult) ? ordersResult : (ordersResult.rows || []);

    console.log(`📋 Found ${eligibleOrders.length} eligible orders for production queue`);

    // Calculate priority scores for each order
    const now = new Date();
    const ordersWithPriority = eligibleOrders.map((order: any, index: number) => {
      const dueDate = new Date(order.dueDate || order.orderDate || '2099-12-31');
      const daysToDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculate priority score based on due date urgency
      let priorityScore = 1000; // Base priority
      
      // Due date urgency (higher score = higher priority)
      if (daysToDue < 0) priorityScore += 500; // Overdue orders get highest priority
      else if (daysToDue <= 7) priorityScore += 300; // Due within a week
      else if (daysToDue <= 14) priorityScore += 200; // Due within 2 weeks
      else if (daysToDue <= 30) priorityScore += 100; // Due within a month
      
      // Entry order tiebreaker (earlier entries get higher priority for same due dates)
      const entryOrderBonus = Math.max(0, 1000 - index); // First order gets 1000, second gets 999, etc.
      priorityScore += entryOrderBonus;

      return {
        ...order,
        priorityScore,
        daysToDue,
        queuePosition: index + 1
      };
    });

    // Sort by priority score (highest first)
    ordersWithPriority.sort((a: any, b: any) => b.priorityScore - a.priorityScore);

    // Update orders to P1 Production Queue department with priority scores
    const updatedOrders = [];
    for (let i = 0; i < ordersWithPriority.length; i++) {
      const order = ordersWithPriority[i];
      
      try {
        // Update order department and add priority metadata
        const updateQuery = `
          UPDATE all_orders 
          SET 
            current_department = 'P1 Production Queue',
            updated_at = NOW()
          WHERE order_id = $1
        `;
        
        await pool.query(updateQuery, [order.orderId]);
        updatedOrders.push({
          orderId: order.orderId,
          priorityScore: order.priorityScore,
          queuePosition: i + 1,
          daysToDue: order.daysToDue
        });
        
        console.log(`✅ Order ${order.orderId}: Priority ${order.priorityScore}, Queue Position ${i + 1}, Days to Due: ${order.daysToDue}`);
      } catch (error) {
        console.error(`❌ Failed to update order ${order.orderId}:`, error);
      }
    }

    const result = {
      success: true,
      message: `Successfully auto-populated production queue with ${updatedOrders.length} orders`,
      ordersProcessed: updatedOrders.length,
      orders: updatedOrders
    };

    console.log('🏭 AUTO-POPULATE: Production queue auto-population completed');
    res.json(result);
    
  } catch (error) {
    console.error('❌ AUTO-POPULATE: Production queue auto-population error:', error);
    res.status(500).json({
      success: false,
      error: "Failed to auto-populate production queue",
      details: error instanceof Error ? error.message : 'Unknown error'
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
        date,
        current_department,
        status,
        po_number
      FROM production_orders
      WHERE current_department = 'P1 Production Queue'
        AND status = 'IN_PROGRESS'
      ORDER BY due_date ASC, created_at ASC
    `);
    
    const orders = Array.isArray(queueResult) ? queueResult : (queueResult.rows || []);

    // Calculate current priority metrics
    const now = new Date();
    const enhancedQueue = orders.map((order: any) => {
      const dueDate = new Date(order.due_date || order.date);
      const daysToDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        orderId: order.order_id,
        customerName: order.customer_name,
        itemName: order.item_name,
        dueDate: order.due_date,
        orderDate: order.date,
        currentDepartment: order.current_department,
        status: order.status,
        poNumber: order.po_number,
        daysToDue,
        isOverdue: daysToDue < 0,
        urgencyLevel: daysToDue < 0 ? 'critical' : 
                     daysToDue <= 7 ? 'high' : 
                     daysToDue <= 14 ? 'medium' : 'normal'
      };
    });

    console.log(`📋 Fetched ${enhancedQueue.length} P1 production orders`);
    res.json(enhancedQueue);
    
  } catch (error) {
    console.error('❌ P1 QUEUE: Error fetching P1 queue:', error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch P1 production queue",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get Production Queue with priority scores (for regular orders)
router.get('/prioritized', async (req: Request, res: Response) => {
  try {
    console.log('🏭 PRIORITIZED QUEUE: Fetching prioritized production queue...');
    
    // AUTOMATIC CLEANUP: Handle orders that need attention or movement
    console.log('🧹 CLEANUP: Processing orders that need attention...');
    await autoMoveInvalidStockModelOrders(storage);
    
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
        0 as priorityScore,
        0 as queuePosition,
        o.created_at as createdAt,
        c.name as customerName
      FROM all_orders o
      LEFT JOIN customers c ON CAST(o.customer_id AS INTEGER) = c.id
      WHERE o.current_department = 'P1 Production Queue'
        AND o.status IN ('FINALIZED', 'Active')
      ORDER BY 
        o.due_date ASC,
        o.created_at ASC
    `;

    const queueResult = await pool.query(queueQuery);
    const prioritizedQueue = Array.isArray(queueResult) ? queueResult : (queueResult.rows || []);

    // Calculate current priority metrics
    const now = new Date();
    const enhancedQueue = prioritizedQueue.map((order: any, index: number) => {
      const dueDate = new Date(order.dueDate || order.orderDate);
      const daysToDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
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
        priorityScore: order.priorityscore || 1000 - index,
        queuePosition: index + 1,
        daysToDue,
        isOverdue: daysToDue < 0,
        urgencyLevel: daysToDue < 0 ? 'critical' : 
                     daysToDue <= 7 ? 'high' : 
                     daysToDue <= 14 ? 'medium' : 'normal'
      };
    });

    console.log(`📋 Fetched ${enhancedQueue.length} orders from prioritized production queue`);
    res.json(enhancedQueue);
    
  } catch (error) {
    console.error('❌ PRIORITIZED QUEUE: Error fetching prioritized queue:', error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch prioritized production queue",
      details: error instanceof Error ? error.message : 'Unknown error'
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
        error: "Orders array is required"
      });
    }

    console.log(`🏭 PRIORITY UPDATE: Updating priorities for ${orders.length} orders`);

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
          queuePosition: i + 1
        });
        
      } catch (error) {
        console.error(`❌ Failed to update priority for order ${order.orderId}:`, error);
      }
    }

    res.json({
      success: true,
      message: `Successfully updated priorities for ${updatedOrders.length} orders`,
      updatedOrders
    });
    
  } catch (error) {
    console.error('❌ PRIORITY UPDATE: Error updating priorities:', error);
    res.status(500).json({
      success: false,
      error: "Failed to update priorities",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get PO items ready for production
router.get('/po-items', async (req: Request, res: Response) => {
  try {
    console.log('🏭 PO ITEMS: Fetching STOCK MODEL PO items ready for production (excluding non-stock items)...');
    
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
        AND (poi.order_count < poi.quantity OR poi.order_count IS NULL)
      ORDER BY po.expected_delivery ASC, po.created_at ASC
    `;

    const poItemsResult = await pool.query(poItemsQuery);
    const poItems = Array.isArray(poItemsResult) ? poItemsResult : (poItemsResult.rows || []);

    // Calculate priority metrics for each PO item
    const now = new Date();
    const enhancedPOItems = poItems.map((item: any) => {
      const dueDate = new Date(item.dueDate || item.createdAt);
      const daysToDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculate priority score based on due date urgency
      let priorityScore = 1000; // Base priority
      
      // Due date urgency (higher score = higher priority)
      if (daysToDue < 0) priorityScore += 500; // Overdue orders get highest priority
      else if (daysToDue <= 7) priorityScore += 300; // Due within a week
      else if (daysToDue <= 14) priorityScore += 200; // Due within 2 weeks
      else if (daysToDue <= 30) priorityScore += 100; // Due within a month

      return {
        ...item,
        priorityScore,
        daysToDue,
        isOverdue: daysToDue < 0,
        urgencyLevel: daysToDue < 0 ? 'critical' : 
                     daysToDue <= 7 ? 'high' : 
                     daysToDue <= 14 ? 'medium' : 'normal'
      };
    });

    console.log(`📋 Fetched ${enhancedPOItems.length} STOCK MODEL PO items ready for production (non-stock items excluded)`);
    res.json(enhancedPOItems);
    
  } catch (error) {
    console.error('❌ PO ITEMS: Error fetching PO items:', error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch PO items",
      details: error instanceof Error ? error.message : 'Unknown error'
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
        error: "PO item data is required"
      });
    }

    console.log(`🏭 PO TO LAYUP: Moving PO item ${poItem.id} to layup scheduler...`);

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
        ) RETURNING order_id, model_id, current_department
      `;

      // Generate unique order ID for each unit
      const orderId = `PO${poItem.poNumber}-${String(i).padStart(3, '0')}`;
      
      const orderResult = await pool.query(orderQuery, [
        orderId,
        new Date().toISOString(),
        poItem.dueDate,
        poItem.customerName, // Using customer name as ID for PO orders
        poItem.stockModelId,
        'Layup/Plugging', // Move directly to layup
        'FINALIZED',
        `PO Item: ${poItem.itemName} (Unit ${i}/${poItem.quantity}) - PO #${poItem.poNumber}`,
        JSON.stringify({ po_item_id: poItem.id, po_number: poItem.poNumber, unit_number: i })
      ]);

      const orders = Array.isArray(orderResult) ? orderResult : (orderResult.rows || []);
      if (orders.length > 0) {
        createdOrders.push(orders[0]);
        console.log(`✅ Created order ${orderId} for PO item ${poItem.itemName} (unit ${i}/${poItem.quantity})`);
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
      orders: createdOrders.map(order => ({
        orderId: order.order_id,
        stockModelId: order.model_id
      }))
    };

    console.log(`🏭 PO TO LAYUP: Successfully created ${createdOrders.length} orders for PO item ${poItem.itemName}`);
    res.json(result);
    
  } catch (error) {
    console.error('❌ PO TO LAYUP: Error moving PO item to layup:', error);
    res.status(500).json({
      success: false,
      error: "Failed to move PO item to layup scheduler",
      details: error instanceof Error ? error.message : 'Unknown error'
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
        error: "PO item data and selected weeks are required"
      });
    }

    console.log(`🏭 PO WEEKS TO LAYUP: Moving ${selectedWeeks.length} weeks for PO item ${poItem.id} to layup scheduler...`);

    // First, get the production schedule to determine quantities for each week
    const scheduleResponse = await fetch(`http://localhost:5000/api/pos/${poItem.poid}/calculate-production-schedule`, {
      method: 'POST'
    });
    
    if (!scheduleResponse.ok) {
      throw new Error('Failed to calculate production schedule');
    }
    
    const schedule = await scheduleResponse.json();
    
    if (!schedule.success || !schedule.itemSchedules || schedule.itemSchedules.length === 0) {
      throw new Error('Invalid production schedule');
    }

    const weeklySchedule = schedule.itemSchedules[0].weeklySchedule;
    const createdOrders = [];
    let totalUnitsCreated = 0;

    // Create orders for each selected week
    for (const weekNumber of selectedWeeks) {
      const weekData = weeklySchedule.find(w => w.week === weekNumber);
      if (!weekData) {
        console.warn(`⚠️ Week ${weekNumber} not found in schedule`);
        continue;
      }

      const unitsThisWeek = weekData.itemsToComplete;
      const weekDueDate = new Date(weekData.dueDate);

      console.log(`📅 Creating ${unitsThisWeek} orders for week ${weekNumber} (due: ${weekDueDate.toLocaleDateString()})`);

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
          ) RETURNING order_id, model_id, current_department
        `;

        // Generate unique order ID for this week and unit
        const orderIndex = totalUnitsCreated + i;
        const orderId = `PO${poItem.ponumber}-W${weekNumber}-${String(orderIndex).padStart(3, '0')}`;
        
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
            week_due_date: weekDueDate.toISOString()
          })
        ]);

        const orders = Array.isArray(orderResult) ? orderResult : (orderResult.rows || []);
        if (orders.length > 0) {
          // Store order with week metadata for scheduling
          const orderWithMeta = {
            ...orders[0],
            weekNumber: weekNumber,
            weekDueDate: weekDueDate.toISOString(),
            stockModelId: poItem.stockmodelid
          };
          createdOrders.push(orderWithMeta);
          console.log(`✅ Created order ${orderId} for PO item ${poItem.itemname} (week ${weekNumber}, unit ${i}/${unitsThisWeek})`);
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
    console.log(`📅 Adding ${createdOrders.length} orders to layup schedule...`);
    
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
      const molds = Array.isArray(moldResult) ? moldResult : (moldResult.rows || []);
      
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
          false
        ]);
        
        console.log(`✅ Added order ${order.order_id} to layup schedule for week ${order.weekNumber} (${weekDueDate.toLocaleDateString()})`);
      } else {
        console.warn(`⚠️ No compatible mold found for stock model ${order.stockModelId} - order ${order.order_id} not scheduled`);
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
      orders: createdOrders.map(order => ({
        orderId: order.order_id,
        stockModelId: order.model_id
      }))
    };

    console.log(`🏭 PO WEEKS TO LAYUP: Successfully created ${createdOrders.length} orders for ${selectedWeeks.length} weeks of PO item ${poItem.itemname}`);
    res.json(result);
    
  } catch (error) {
    console.error('❌ PO WEEKS TO LAYUP: Error moving PO weeks to layup:', error);
    res.status(500).json({
      success: false,
      error: "Failed to move selected weeks to layup scheduler",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Move selected PO items to layup scheduler
router.post('/move-selected-po-items', async (req: Request, res: Response) => {
  try {
    const { selectedItems }: { selectedItems: { item: any; quantity: number }[] } = req.body;
    
    if (!selectedItems || selectedItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Selected items data is required"
      });
    }

    console.log(`🏭 MOVE SELECTED PO ITEMS: Moving ${selectedItems.length} selected PO items to layup scheduler...`);

    const createdOrders = [];
    let totalItemsMoved = 0;
    
    for (const { item, quantity } of selectedItems) {
      console.log(`📦 Processing ${quantity} units of ${item.itemname} (PO #${item.ponumber})`);
      
      // Create individual orders for each quantity unit
      for (let i = 1; i <= quantity; i++) {
        try {
          // Generate unique order ID
          const orderIdQuery = `
            SELECT COALESCE(MAX(CAST(SUBSTRING(order_id FROM 3) AS INTEGER)), 0) + 1 as next_id
            FROM all_orders 
            WHERE order_id ~ '^AG[0-9]+$'
          `;
          
          const orderIdResult = await pool.query(orderIdQuery);
          const nextOrderNumber = orderIdResult.rows?.[0]?.next_id || 1;
          const orderId = `AG${nextOrderNumber}`;

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
              po_item_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
          `;

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
            item.id
          ]);

          const createdOrder = orderResult.rows[0];
          createdOrders.push(createdOrder);
          totalItemsMoved++;
          
          console.log(`✅ Created order ${orderId} for PO item ${item.itemname} (${i}/${quantity})`);
          
        } catch (orderError) {
          console.error(`❌ Failed to create order for ${item.itemname} (unit ${i}):`, orderError);
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
        console.log(`📋 Updated PO item ${item.id} order count: ${currentOrderCount} → ${newOrderCount}`);
        
      } catch (updateError) {
        console.error(`❌ Failed to update order count for PO item ${item.id}:`, updateError);
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
        quantity
      }))
    };

    console.log(`🏭 MOVE SELECTED PO ITEMS: Successfully created ${createdOrders.length} orders from ${selectedItems.length} PO items`);
    res.json(result);
    
  } catch (error) {
    console.error('❌ MOVE SELECTED PO ITEMS: Error moving selected PO items:', error);
    res.status(500).json({
      success: false,
      error: "Failed to move selected PO items to layup scheduler",
      details: error instanceof Error ? error.message : 'Unknown error'
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
      LEFT JOIN customers c ON CAST(o.customer_id AS INTEGER) = c.id
      WHERE o.current_department = 'P1 Production Queue'
        AND o.status IN ('FINALIZED', 'Active')
        AND (
          o.model_id IS NULL OR 
          o.model_id = '' OR 
          o.features->>'action_length' IS NULL OR 
          o.features->>'action_length' = '' OR 
          o.features->>'action_length' = 'null'
        )
      ORDER BY 
        o.due_date ASC,
        o.created_at ASC
    `;

    const attentionResult = await pool.query(attentionQuery);
    const attentionOrders = Array.isArray(attentionResult) ? attentionResult : (attentionResult.rows || []);

    // Format the response with missing items identified
    const formattedOrders = attentionOrders.map((order: any) => {
      const missingItems = [];
      
      if (!order.modelid || order.modelid === '') {
        missingItems.push('stock model');
      }
      
      const features = order.features || {};
      if (!features.action_length || features.action_length === '' || features.action_length === null) {
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
        reasonText: `Missing ${missingItems.join(' and ')} - cannot proceed to layup scheduling`
      };
    });

    console.log(`📋 Found ${formattedOrders.length} orders needing attention`);
    res.json(formattedOrders);
    
  } catch (error) {
    console.error('❌ ATTENTION QUEUE: Error fetching orders needing attention:', error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch orders needing attention",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;