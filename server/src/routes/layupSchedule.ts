import { Router, Request, Response } from 'express';

import { pool } from '../../db';
import { format, addDays, startOfWeek, getDay } from 'date-fns';

const router = Router();

interface GenerateScheduleRequest {
  selectedOrderIds: string[]; // Regular production queue order IDs
  selectedPOItems: {
    poNumber: string;
    itemId: number;
    stockModel: string;
    quantity: number;
  }[];
}

// Generate layup schedule preview based on selected items
router.post('/generate', async (req: Request, res: Response) => {
  try {
    console.log('🔄 GENERATE SCHEDULE: Starting schedule generation...');
    
    const { selectedOrderIds = [], selectedPOItems = [] }: GenerateScheduleRequest = req.body;
    
    const totalItems = selectedOrderIds.length + selectedPOItems.length;
    console.log(`📊 Total items to schedule: ${totalItems} (${selectedOrderIds.length} regular orders, ${selectedPOItems.length} PO items)`);
    
    if (totalItems === 0) {
      return res.status(400).json({
        success: false,
        error: 'No items selected for scheduling',
      });
    }
    
    // Fetch molds with their capacities
    const moldsResult = await pool.query(`
      SELECT 
        mold_id as "moldId",
        model_name as "modelName",
        stock_models as "stockModels",
        multiplier as "capacity",
        enabled,
        is_active as "isActive"
      FROM molds
      WHERE enabled = true AND is_active = true
      ORDER BY mold_id
    `);
    
    const molds = moldsResult.rows || [];
    console.log(`🏭 Found ${molds.length} active molds`);
    
    // Fetch regular orders details
    const regularOrders = [];
    if (selectedOrderIds.length > 0) {
      const ordersResult = await pool.query(
        `
        SELECT 
          pq.order_id as "orderId",
          pq.fb_order_number as "fbOrderNumber",
          pq.model_id as "stockModel",
          pq.customer_id as "customerId",
          c.customer_name as "customerName",
          pq.due_date as "dueDate"
        FROM production_queue pq
        LEFT JOIN customers c ON pq.customer_id = c.id::text
        WHERE pq.order_id = ANY($1)
        `,
        [selectedOrderIds]
      );
      regularOrders.push(...(ordersResult.rows || []));
    }
    
    // Prepare PO items for scheduling
    const poItems = selectedPOItems.map(item => ({
      orderId: `PO-${item.poNumber}-${item.itemId}`,
      fbOrderNumber: item.poNumber,
      stockModel: item.stockModel,
      customerId: null,
      customerName: 'Purchase Order',
      dueDate: null,
      quantity: item.quantity,
    }));
    
    const allItems = [...regularOrders, ...poItems];
    console.log(`📦 Prepared ${allItems.length} items for scheduling`);
    
    // Calculate start date (next Monday)
    const today = new Date();
    const nextMonday = startOfWeek(addDays(today, 7), { weekStartsOn: 1 });
    
    // Initialize schedule by day (Monday = 1, Thursday = 4, Friday = 5)
    const workDays = [1, 2, 3, 4]; // Monday through Thursday
    const scheduledItems: any[] = [];
    const overflowItems: any[] = [];
    
    // Track capacity usage per mold per day
    const moldDayCapacity: { [key: string]: { [day: number]: number } } = {};
    molds.forEach(mold => {
      moldDayCapacity[mold.moldId] = {};
      workDays.forEach(day => {
        moldDayCapacity[mold.moldId][day] = 0;
      });
    });
    
    // Try to schedule each item
    for (const item of allItems) {
      let scheduled = false;
      
      // Find compatible molds for this stock model
      const compatibleMolds = molds.filter(mold => 
        mold.stockModels && mold.stockModels.includes(item.stockModel)
      );
      
      if (compatibleMolds.length === 0) {
        console.log(`⚠️ No compatible molds for ${item.orderId} (${item.stockModel})`);
        overflowItems.push({
          ...item,
          reason: `No compatible molds for stock model: ${item.stockModel}`,
        });
        continue;
      }
      
      // Try to find a slot (Monday through Thursday first)
      for (const day of workDays) {
        if (scheduled) break;
        
        for (const mold of compatibleMolds) {
          const currentUsage = moldDayCapacity[mold.moldId][day] || 0;
          
          if (currentUsage < mold.capacity) {
            // Found available capacity!
            const scheduledDate = addDays(nextMonday, day - 1);
            
            scheduledItems.push({
              orderId: item.orderId,
              fbOrderNumber: item.fbOrderNumber,
              stockModel: item.stockModel,
              customerName: item.customerName,
              scheduledDate: format(scheduledDate, 'yyyy-MM-dd'),
              moldId: mold.moldId,
              dayOfWeek: day,
              dayName: ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][day],
            });
            
            moldDayCapacity[mold.moldId][day] = currentUsage + 1;
            scheduled = true;
            console.log(`✅ Scheduled ${item.orderId} → ${mold.moldId} on ${['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][day]}`);
            break;
          }
        }
      }
      
      // If not scheduled on Mon-Thu, try Friday (day 5)
      if (!scheduled) {
        for (const mold of compatibleMolds) {
          if (!moldDayCapacity[mold.moldId][5]) {
            moldDayCapacity[mold.moldId][5] = 0;
          }
          
          const currentUsage = moldDayCapacity[mold.moldId][5] || 0;
          
          if (currentUsage < mold.capacity) {
            const scheduledDate = addDays(nextMonday, 4); // Friday
            
            scheduledItems.push({
              orderId: item.orderId,
              fbOrderNumber: item.fbOrderNumber,
              stockModel: item.stockModel,
              customerName: item.customerName,
              scheduledDate: format(scheduledDate, 'yyyy-MM-dd'),
              moldId: mold.moldId,
              dayOfWeek: 5,
              dayName: 'Friday',
            });
            
            moldDayCapacity[mold.moldId][5] = currentUsage + 1;
            scheduled = true;
            console.log(`⚠️ Scheduled ${item.orderId} → ${mold.moldId} on Friday (overflow)`);
            break;
          }
        }
      }
      
      // If still not scheduled, add to overflow
      if (!scheduled) {
        console.log(`❌ Cannot schedule ${item.orderId} - no capacity available`);
        overflowItems.push({
          ...item,
          reason: 'No available mold capacity in the scheduling window (Mon-Fri)',
        });
      }
    }
    
    console.log(`✅ Generated schedule: ${scheduledItems.length} scheduled, ${overflowItems.length} overflow`);
    
    res.json({
      success: true,
      scheduledItems,
      overflowItems,
      weekStart: format(nextMonday, 'yyyy-MM-dd'),
      totalItems: allItems.length,
      scheduledCount: scheduledItems.length,
      overflowCount: overflowItems.length,
    });
  } catch (error) {
    console.error('❌ GENERATE SCHEDULE: Error generating schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate layup schedule',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Save layup schedule and move orders to Layup/Plugging department
router.post('/save', async (req: Request, res: Response) => {
  try {
    console.log(
      '💾 SCHEDULE SAVE: Starting layup schedule save and department progression...'
    );

    const { entries, workDays, weekStart } = req.body;

    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid schedule entries provided',
      });
    }

    console.log(
      `📋 Processing ${entries.length} schedule entries for week starting ${weekStart}`
    );
    console.log(
      `📅 Configured work days: ${workDays.map((d: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`
    );

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Clear existing schedule for this week
      await pool.query(
        `
        DELETE FROM layup_schedule 
        WHERE scheduled_date >= $1 AND scheduled_date < $1::date + INTERVAL '7 days'
      `,
        [weekStart]
      );

      let savedCount = 0;
      const progressedCount = 0;

      // Save schedule entries and progress orders
      for (const entry of entries) {
        const { orderId, scheduledDate, moldId, employeeAssignments } = entry;

        // Validate required fields
        if (!orderId || !scheduledDate) {
          console.log(`⚠️ Skipping invalid entry: ${JSON.stringify(entry)}`);
          continue;
        }

        // Convert scheduledDate to Date object if it's a string
        const processedScheduledDate =
          typeof scheduledDate === 'string'
            ? new Date(scheduledDate)
            : scheduledDate;

        // Insert schedule entry
        await pool.query(
          `
          INSERT INTO layup_schedule (
            order_id, scheduled_date, mold_id, employee_assignments,
            is_override, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          [
            orderId,
            processedScheduledDate,
            moldId || 'auto',
            JSON.stringify(employeeAssignments || []),
            true, // This is a manual schedule save
            new Date().toISOString(),
            new Date().toISOString(),
          ]
        );

        savedCount++;
        console.log(
          `✅ Order ${orderId} scheduled for ${scheduledDate} (schedule only, no department change)`
        );
      }

      // Commit transaction
      await pool.query('COMMIT');

      console.log(
        `✅ Successfully saved ${savedCount} schedule entries (no department changes)`
      );

      res.json({
        success: true,
        message: `Weekly schedule saved successfully`,
        entriesSaved: savedCount,
        weekStart: weekStart,
        workDays: workDays,
      });
    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }
  } catch (error) {
    console.error('❌ SCHEDULE SAVE: Error saving layup schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save layup schedule',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get current week's schedule
router.get('/current-week', async (req: Request, res: Response) => {
  try {
    console.log('📅 CURRENT WEEK: Fetching current week layup schedule...');

    // Get start of current week (Monday)
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const scheduleQuery = `
      SELECT 
        ls.order_id as orderId,
        ls.scheduled_date as scheduledDate,
        ls.mold_id as moldId,
        ls.employee_assignments as employeeAssignments,
        ls.is_override as isOverride,
        o.fb_order_number as fbOrderNumber,
        o.model_id as stockModelId,
        o.customer_id as customerId,
        c.customer_name as customerName,
        po.po_number as poNumber,
        po.id as poId,
        po.id as productionOrderId,
        CASE 
          WHEN po.order_id IS NOT NULL THEN 'production_order'
          ELSE 'main_orders'
        END as source
      FROM layup_schedule ls
      LEFT JOIN all_orders o ON ls.order_id = o.order_id
      LEFT JOIN production_orders po ON ls.order_id = po.order_id
      LEFT JOIN customers c ON o.customer_id = c.id::text
      WHERE ls.scheduled_date >= $1 AND ls.scheduled_date <= $2
      ORDER BY ls.scheduled_date ASC
    `;

    const scheduleResult = await pool.query(scheduleQuery, [
      startOfWeek.toISOString(),
      endOfWeek.toISOString(),
    ]);

    const scheduleEntries = scheduleResult || [];

    console.log(
      `📋 Found ${scheduleEntries.length} schedule entries for current week`
    );

    res.json({
      success: true,
      schedule: scheduleEntries,
      weekStart: startOfWeek.toISOString(),
      weekEnd: endOfWeek.toISOString(),
      totalEntries: scheduleEntries.length,
    });
  } catch (error) {
    console.error(
      '❌ CURRENT WEEK: Error fetching current week schedule:',
      error
    );
    res.status(500).json({
      success: false,
      error: 'Failed to fetch current week schedule',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Add individual order assignment endpoint for drag and drop
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('💾 INDIVIDUAL SAVE: Saving single order assignment...');

    const {
      orderId,
      scheduledDate,
      moldId,
      instanceNumber,
      employeeAssignments,
      isOverride,
      overriddenBy,
    } = req.body;

    if (!orderId || !scheduledDate || !moldId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, scheduledDate, moldId',
      });
    }

    console.log(
      `📋 Saving assignment: ${orderId} → ${moldId} on ${scheduledDate}`
    );

    // Convert scheduledDate to Date object if it's a string
    const processedScheduledDate =
      typeof scheduledDate === 'string'
        ? new Date(scheduledDate)
        : scheduledDate;

    // Insert schedule entry
    await pool.query(
      `
      INSERT INTO layup_schedule (
        order_id, scheduled_date, mold_id, employee_assignments,
        is_override, overridden_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        orderId,
        processedScheduledDate,
        moldId,
        JSON.stringify(employeeAssignments || []),
        isOverride || true,
        overriddenBy || 'user',
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    console.log(`✅ Successfully saved assignment: ${orderId} → ${moldId}`);

    res.json({
      success: true,
      message: `Order ${orderId} assigned to ${moldId}`,
      orderId,
      moldId,
      scheduledDate: processedScheduledDate,
    });
  } catch (error) {
    console.error('❌ INDIVIDUAL SAVE ERROR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save order assignment',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete individual order assignment endpoint for drag and drop
router.delete('/by-order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    console.log(
      `🗑️ INDIVIDUAL DELETE: Removing assignment for order ${orderId}`
    );

    const result = await pool.query(
      `
      DELETE FROM layup_schedule 
      WHERE order_id = $1
    `,
      [orderId]
    );

    const deletedRows = (result as any).rowCount || 0;

    if (deletedRows > 0) {
      console.log(
        `✅ Successfully deleted ${deletedRows} assignment(s) for order ${orderId}`
      );
    } else {
      console.log(`ℹ️ No existing assignment found for order ${orderId}`);
    }

    res.json({
      success: true,
      message: `Removed ${deletedRows} assignment(s) for order ${orderId}`,
      orderId,
      deletedRows,
    });
  } catch (error) {
    console.error('❌ INDIVIDUAL DELETE ERROR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete order assignment',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
