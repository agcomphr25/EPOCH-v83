import { Router, Request, Response } from 'express';
import { pool } from '../../db';

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
    const eligibleOrders = ordersResult || [];

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
            updated_at = NOW(),
            priority_score = $1,
            queue_position = $2
          WHERE order_id = $3
        `;
        
        await pool.query(updateQuery, [order.priorityScore, i + 1, order.orderId]);
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
    
    const orders = queueResult.rows || [];

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
        NULL as priorityScore,
        NULL as queuePosition,
        o.created_at as createdAt,
        c.name as customerName
      FROM all_orders o
      LEFT JOIN customers c ON CAST(o.customer_id AS INTEGER) = c.id
      WHERE o.current_department = 'P1 Production Queue'
        AND o.status = 'FINALIZED'
      ORDER BY 
        COALESCE(o.priority_score, 0) DESC,
        COALESCE(o.queue_position, 999999) ASC,
        o.due_date ASC,
        o.created_at ASC
    `;

    const queueResult = await pool.query(queueQuery);
    const prioritizedQueue = queueResult.rows || [];

    // Calculate current priority metrics
    const now = new Date();
    const enhancedQueue = prioritizedQueue.map((order: any) => {
      const dueDate = new Date(order.dueDate || order.orderDate);
      const daysToDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        ...order,
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
            priority_score = $1,
            queue_position = $2,
            updated_at = NOW()
          WHERE order_id = $3
        `;
        
        await pool.query(updateQuery, [order.priorityScore, i + 1, order.orderId]);
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

export default router;