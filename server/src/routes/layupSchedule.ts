import { Router, Request, Response } from 'express';

import { db, pool } from '../../db';
import { molds, productionQueue, allOrders, purchaseOrderItems, poProducts, layupSchedule, stockModels } from '../../schema';
import { eq, and, inArray } from 'drizzle-orm';
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
  workDays?: number[]; // Optional: Days to schedule (1=Mon, 2=Tue, etc). Defaults to [1,2,3,4]
  weekStart?: string; // Optional: ISO date string for week start. Defaults to next Monday
}

// Generate layup schedule preview based on selected items
router.post('/generate', async (req: Request, res: Response) => {
  try {
    console.log('🔄 GENERATE SCHEDULE: Starting schedule generation...');
    
    const { selectedOrderIds = [], selectedPOItems = [], workDays = [1, 2, 3, 4], weekStart }: GenerateScheduleRequest = req.body;
    
    const totalItems = selectedOrderIds.length + selectedPOItems.length;
    console.log(`📊 Total items to schedule: ${totalItems} (${selectedOrderIds.length} regular orders, ${selectedPOItems.length} PO items)`);
    console.log('📦 Selected PO Items received:', JSON.stringify(selectedPOItems.slice(0, 5), null, 2));
    console.log('📦 PO Items total quantity:', selectedPOItems.reduce((sum, item) => sum + item.quantity, 0));
    
    if (totalItems === 0) {
      return res.status(400).json({
        success: false,
        error: 'No items selected for scheduling',
      });
    }
    
    // Fetch stock models with display names for material detection
    const stockModelsList = await db.select({
      name: stockModels.name,
      displayName: stockModels.displayName,
    }).from(stockModels);
    
    // Create a map of model name -> display name for quick lookup
    const stockModelDisplayMap = new Map(
      stockModelsList.map(m => [m.name, m.displayName || ''])
    );
    
    console.log(`📦 Loaded ${stockModelDisplayMap.size} stock models for material detection`);
    
    // Fetch molds with their capacities
    const activeMolds = await db
      .select()
      .from(molds)
      .where(and(eq(molds.enabled, true), eq(molds.isActive, true)));
    
    console.log(`🏭 Found ${activeMolds.length} active molds`);
    if (activeMolds.length > 0) {
      console.log('🔍 Sample molds:', activeMolds.slice(0, 3).map(m => ({ 
        moldId: m.moldId, 
        modelName: m.modelName, 
        stockModels: m.stockModels,
        capacity: m.multiplier
      })));
    }
    
    // Fetch regular orders details from all_orders table
    let regularOrders: any[] = [];
    if (selectedOrderIds.length > 0) {
      console.log(`🔍 Fetching ${selectedOrderIds.length} regular orders:`, selectedOrderIds.slice(0, 5));
      
      const ordersResults = await db
        .select({
          orderId: allOrders.orderId,
          fbOrderNumber: allOrders.fbOrderNumber,
          stockModel: allOrders.modelId,
          customerId: allOrders.customerId,
          customerName: allOrders.customerId, // Using customerId as customerName for now
          dueDate: allOrders.dueDate,
          features: allOrders.features,
        })
        .from(allOrders)
        .where(inArray(allOrders.orderId, selectedOrderIds));
      
      console.log(`📦 Found ${ordersResults.length} regular orders in database`);
      if (ordersResults.length > 0) {
        console.log('🔍 Sample order:', ordersResults[0]);
      }
      
      // Process badge information
      regularOrders = ordersResults.map(order => {
        const features = order.features as any || {};
        const otherOptions = Array.isArray(features.other_options) ? features.other_options : [];
        
        // Extract action length
        let actionLength = features.action_length;
        if (!actionLength || actionLength === 'none') {
          // Try to derive from action_inlet
          const actionInlet = features.action_inlet;
          if (actionInlet) {
            if (actionInlet.includes('short')) {
              actionLength = 'SA';
            } else if (actionInlet.includes('long')) {
              actionLength = 'LA';
            }
          }
        }
        
        // Extract material from stock model display name
        let material = null;
        const displayName = stockModelDisplayMap.get(order.stockModel) || '';
        if (displayName.startsWith('CF ') || displayName.includes(' CF ') || displayName.toLowerCase().includes('carbon')) {
          material = 'Carbon Fiber';
        } else if (displayName.startsWith('FG ') || displayName.includes(' FG ') || displayName.toLowerCase().includes('fiberglass')) {
          material = 'Fiberglass';
        }
        
        // Determine badges
        const lop = features.length_of_pull;
        // LOP badge: any non-empty, non-standard value (matching frontend logic)
        const hasLOP = lop && 
          lop !== 'none' && 
          lop !== 'standard' && 
          lop !== 'std' && 
          lop !== 'no_lop_change' &&
          lop.trim() !== '';
        
        const lopValue = hasLOP ? lop : null;
        
        const bottomMetal = features.bottom_metal;
        const hasADL = bottomMetal && typeof bottomMetal === 'string' && bottomMetal.toLowerCase().includes('adl');
        
        const hasHeavyFill = otherOptions.includes('heavy_fill');
        
        return {
          ...order,
          actionLength,
          material,
          hasLOP,
          lopValue,
          hasADL,
          hasHeavyFill,
        };
      });
    }
    
    // Fetch PO item details and prepare for scheduling
    const poItems: any[] = [];
    
    if (selectedPOItems.length > 0) {
      console.log(`🔍 Preparing ${selectedPOItems.length} PO items for scheduling`);
      
      // Fetch action length from po_products table
      const itemIds = selectedPOItems.map(item => item.itemId);
      const poProductsData = await db
        .select({
          id: poProducts.id,
          actionLength: poProducts.actionLength,
          actionInlet: poProducts.actionInlet,
          stockModel: poProducts.stockModel,
        })
        .from(poProducts)
        .where(inArray(poProducts.id, itemIds));
      
      console.log(`📦 Fetched ${poProductsData.length} PO products with action length data`);
      
      // Create a map for quick lookup
      const poProductMap = new Map(poProductsData.map(p => [p.id, p]));
      
      // Expand by quantity for scheduling
      selectedPOItems.forEach(item => {
        const poProductData = poProductMap.get(item.itemId);
        
        // Extract action length from po_products
        let actionLength = poProductData?.actionLength || null;
        if (!actionLength || actionLength === 'none') {
          // Try to derive from action_inlet
          const actionInlet = poProductData?.actionInlet;
          if (actionInlet) {
            if (actionInlet.includes('short')) {
              actionLength = 'SA';
            } else if (actionInlet.includes('long')) {
              actionLength = 'LA';
            }
          }
        }
        
        // Extract material from stock model display name
        let material = null;
        const displayName = stockModelDisplayMap.get(item.stockModel) || '';
        if (displayName.startsWith('CF ') || displayName.includes(' CF ') || displayName.toLowerCase().includes('carbon')) {
          material = 'Carbon Fiber';
        } else if (displayName.startsWith('FG ') || displayName.includes(' FG ') || displayName.toLowerCase().includes('fiberglass')) {
          material = 'Fiberglass';
        }
        
        for (let i = 0; i < item.quantity; i++) {
          poItems.push({
            orderId: `PO-${item.poNumber}-${item.itemId}-${i + 1}`,
            fbOrderNumber: item.poNumber,
            stockModel: item.stockModel,
            customerId: null,
            customerName: 'Purchase Order',
            dueDate: null,
            quantity: 1,
            actionLength,
            material,
            hasLOP: false,
            hasADL: false,
            hasHeavyFill: false,
          });
        }
      });
    }
    
    const allItems = [...regularOrders, ...poItems];
    console.log(`📦 Prepared ${allItems.length} items for scheduling (${regularOrders.length} regular + ${poItems.length} PO units)`);
    
    // Use provided week start or calculate next Monday
    let weekStartDate: Date;
    if (weekStart) {
      weekStartDate = new Date(weekStart);
      console.log(`📅 Using provided week start: ${format(weekStartDate, 'yyyy-MM-dd')}`);
    } else {
      const today = new Date();
      weekStartDate = startOfWeek(addDays(today, 7), { weekStartsOn: 1 });
      console.log(`📅 Using calculated next Monday: ${format(weekStartDate, 'yyyy-MM-dd')}`);
    }
    const nextMonday = weekStartDate; // For backward compatibility with existing code
    
    // Initialize schedule by day (using selected work days)
    const scheduledItems: any[] = [];
    const overflowItems: any[] = [];
    
    // Track capacity usage per mold per day
    const moldDayCapacity: { [key: string]: { [day: number]: number } } = {};
    activeMolds.forEach(mold => {
      moldDayCapacity[mold.moldId] = {};
      workDays.forEach(day => {
        moldDayCapacity[mold.moldId][day] = 0;
      });
    });
    
    // Round-robin day index for even distribution
    let currentDayIndex = 0;
    
    // Try to schedule each item
    for (const item of allItems) {
      let scheduled = false;
      
      // Find compatible molds for this stock model
      const compatibleMolds = activeMolds.filter(mold => 
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
      
      // Try to find a slot using round-robin distribution across all selected days
      // Start from current day index and try all days in rotation
      const attemptOrder = [...workDays];
      const rotatedDays = [
        ...attemptOrder.slice(currentDayIndex),
        ...attemptOrder.slice(0, currentDayIndex)
      ];
      
      for (const day of rotatedDays) {
        if (scheduled) break;
        
        for (const mold of compatibleMolds) {
          const currentUsage = moldDayCapacity[mold.moldId][day] || 0;
          
          if (currentUsage < mold.multiplier) {
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
              // Additional fields
              actionLength: item.actionLength || null,
              material: item.material || null,
              // Badge information
              hasLOP: item.hasLOP || false,
              lopValue: item.lopValue || null,
              hasADL: item.hasADL || false,
              hasHeavyFill: item.hasHeavyFill || false,
            });
            
            moldDayCapacity[mold.moldId][day] = currentUsage + 1;
            scheduled = true;
            console.log(`✅ Scheduled ${item.orderId} → ${mold.moldId} on ${['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][day]}`);
            
            // Move to next day in rotation for balanced distribution
            currentDayIndex = (currentDayIndex + 1) % workDays.length;
            break;
          }
        }
      }
      
      // If still not scheduled, add to overflow
      if (!scheduled) {
        console.log(`❌ Cannot schedule ${item.orderId} - no capacity available`);
        overflowItems.push({
          ...item,
          reason: 'No available mold capacity in the scheduling window',
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

// Save layup schedule and progress orders to Layup/Plugging department
router.post('/save', async (req: Request, res: Response) => {
  try {
    console.log(
      '💾 SCHEDULE SAVE: Starting layup schedule save and progressing orders to Layup/Plugging...'
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
      // Get existing schedule for this week to decrement PO item counts
      const existingRows = await pool.query<{ order_id: string }>(
        `
        SELECT order_id 
        FROM layup_schedule 
        WHERE scheduled_date >= $1 AND scheduled_date < $1::date + INTERVAL '7 days'
      `,
        [weekStart]
      );
      
      // Decrement PO item counts for items being removed
      const existingPOCounts = new Map<string, number>();
      for (const row of existingRows) {
        const orderId = row.order_id;
        if (orderId.startsWith('PO-')) {
          const parts = orderId.split('-');
          if (parts.length >= 3) {
            const poNumber = parts[1];
            const itemId = parts[2];
            const key = `${poNumber}-${itemId}`;
            existingPOCounts.set(key, (existingPOCounts.get(key) || 0) + 1);
          }
        }
      }
      
      // Decrement counts before clearing
      if (existingPOCounts.size > 0) {
        const poItemEntries = Array.from(existingPOCounts.entries());
        for (const [key, count] of poItemEntries) {
          const [poNumber, itemId] = key.split('-');
          await pool.query(
            `
            UPDATE purchase_order_items
            SET order_count = GREATEST(COALESCE(order_count, 0) - $1, 0),
                updated_at = NOW()
            WHERE id = $2
          `,
            [count, parseInt(itemId)]
          );
          console.log(`📦 Decremented PO item ${itemId}: removed ${count} from order_count`);
        }
      }
      
      // Clear existing schedule for this week
      await pool.query(
        `
        DELETE FROM layup_schedule 
        WHERE scheduled_date >= $1 AND scheduled_date < $1::date + INTERVAL '7 days'
      `,
        [weekStart]
      );

      let savedCount = 0;
      let progressedCount = 0;
      const orderIds: string[] = [];
      const poItemCounts = new Map<string, number>(); // Track PO item counts: "poNumber-itemId" -> count

      // Save schedule entries
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
        
        // Track PO items to update their order counts
        if (orderId.startsWith('PO-')) {
          // Parse PO item ID: PO-{poNumber}-{itemId}-{unitNumber}
          const parts = orderId.split('-');
          if (parts.length >= 3) {
            const poNumber = parts[1];
            const itemId = parts[2];
            const key = `${poNumber}-${itemId}`;
            poItemCounts.set(key, (poItemCounts.get(key) || 0) + 1);
          }
        } else {
          // Track regular order IDs
          orderIds.push(orderId);
        }
        
        console.log(
          `✅ Order ${orderId} scheduled for ${scheduledDate}`
        );
      }

      // Update PO item order counts and track production order numbers
      const productionOrderNumbers = new Set<string>();
      if (poItemCounts.size > 0) {
        const newPOItemEntries = Array.from(poItemCounts.entries());
        for (const [key, count] of newPOItemEntries) {
          const [poNumber, itemId] = key.split('-');
          await pool.query(
            `
            UPDATE purchase_order_items
            SET order_count = COALESCE(order_count, 0) + $1,
                updated_at = NOW()
            WHERE id = $2
          `,
            [count, parseInt(itemId)]
          );
          console.log(`📦 Updated PO item ${itemId}: added ${count} to order_count`);
          
          // Track the production order number for progression
          productionOrderNumbers.add(poNumber);
        }
      }

      // Move regular orders to Layup/Plugging department (not PO items)
      if (orderIds.length > 0) {
        const uniqueOrderIds = Array.from(new Set(orderIds));
        
        const updateResult = await pool.query(
          `
          UPDATE all_orders
          SET current_department = 'Layup/Plugging',
              updated_at = NOW()
          WHERE order_id = ANY($1::text[])
          AND current_department IN ('P1 Production Queue', 'Production Queue')
        `,
          [uniqueOrderIds]
        );
        
        progressedCount = (updateResult as any).rowCount || 0;
        console.log(`📦 Moved ${progressedCount} orders to Layup/Plugging department`);
      }

      // Move production orders to Layup/Plugging department ONLY if ALL items are fully scheduled
      if (productionOrderNumbers.size > 0) {
        const poNumbersArray = Array.from(productionOrderNumbers);
        
        // Check which POs have all items fully scheduled
        const fullyScheduledPOs = [];
        for (const poNumber of poNumbersArray) {
          const checkRows = await pool.query<{ total_items: string; completed_items: string }>(
            `
            SELECT COUNT(*) as total_items,
                   COUNT(*) FILTER (WHERE quantity - COALESCE(order_count, 0) = 0) as completed_items
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.po_id = po.id
            WHERE po.po_number = $1
              AND (poi.stock_status IS NULL OR poi.stock_status != 'no stock')
              AND (poi.item_type = 'stock_model' OR poi.item_type = 'custom_model')
          `,
            [poNumber]
          );
          
          if (checkRows.length > 0) {
            const totalItems = parseInt(checkRows[0].total_items);
            const completedItems = parseInt(checkRows[0].completed_items);
            
            console.log(`📊 PO ${poNumber}: ${completedItems}/${totalItems} items fully scheduled`);
            
            // Only move if ALL items are completed
            if (totalItems > 0 && totalItems === completedItems) {
              fullyScheduledPOs.push(poNumber);
            }
          }
        }
        
        // Move only fully completed production orders
        if (fullyScheduledPOs.length > 0) {
          const poUpdateResult = await pool.query(
            `
            UPDATE production_orders
            SET current_department = 'Layup/Plugging',
                updated_at = NOW()
            WHERE po_number = ANY($1::text[])
            AND current_department = 'P1 Production Queue'
          `,
            [fullyScheduledPOs]
          );
          
          const poProgressedCount = (poUpdateResult as any).rowCount || 0;
          progressedCount += poProgressedCount;
          console.log(`📦 Moved ${poProgressedCount} production orders to Layup/Plugging (all items complete): ${fullyScheduledPOs.join(', ')}`);
        } else {
          console.log(`📦 No production orders ready to move (items still pending)`);
        }
      }

      // Commit transaction
      await pool.query('COMMIT');

      console.log(
        `✅ Successfully saved ${savedCount} schedule entries and progressed ${progressedCount} orders to Layup/Plugging`
      );

      res.json({
        success: true,
        message: `Schedule saved and ${progressedCount} orders progressed to Layup/Plugging`,
        entriesSaved: savedCount,
        ordersProgressed: progressedCount,
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

// Get all orders for a specific layup schedule date (for barcode scanning)
router.get('/by-schedule-date/:scheduleDate', async (req: Request, res: Response) => {
  try {
    const { scheduleDate } = req.params;
    console.log(`📅 Fetching orders for schedule date: ${scheduleDate}`);
    
    // Get all schedule entries for this date
    const scheduleRows = await pool.query<{ order_id: string }>(
      `
      SELECT DISTINCT order_id
      FROM layup_schedule
      WHERE scheduled_date::date = $1::date
         OR layup_day = $1::date
      ORDER BY order_id
      `,
      [scheduleDate]
    );
    
    const scheduleOrderIds = scheduleRows.map((row) => row.order_id);
    console.log(`📋 Found ${scheduleOrderIds.length} schedule entries for ${scheduleDate}`);
    
    // Separate regular orders from PO units
    const regularOrderIds: string[] = [];
    const poUnitIds: string[] = [];
    
    for (const orderId of scheduleOrderIds) {
      if (orderId.startsWith('PO-')) {
        poUnitIds.push(orderId);
      } else {
        regularOrderIds.push(orderId);
      }
    }
    
    console.log(`📦 Regular orders: ${regularOrderIds.length}, PO units: ${poUnitIds.length}`);
    
    // Map PO units to their production_order IDs
    const productionOrderIds = new Set<string>();
    
    if (poUnitIds.length > 0) {
      // Parse PO unit IDs to extract poNumber and poItemId
      // Format: PO-{poNumber}-{itemId}-{unitNumber}
      const poMappings: Array<{ poNumber: string; poItemId: number }> = [];
      
      for (const poUnitId of poUnitIds) {
        const parts = poUnitId.split('-');
        if (parts.length >= 3) {
          const poNumber = parts[1];
          const poItemId = parseInt(parts[2]);
          if (!isNaN(poItemId)) {
            poMappings.push({ poNumber, poItemId });
          }
        }
      }
      
      // Look up production_orders that match these PO numbers and item IDs
      if (poMappings.length > 0) {
        const uniqueMappings = Array.from(
          new Map(poMappings.map(m => [`${m.poNumber}-${m.poItemId}`, m])).values()
        );
        
        for (const mapping of uniqueMappings) {
          const productionOrderRows = await pool.query<{ order_id: string }>(
            `
            SELECT DISTINCT order_id
            FROM production_orders
            WHERE po_number = $1 AND po_item_id = $2
            `,
            [mapping.poNumber, mapping.poItemId]
          );
          
          for (const row of productionOrderRows) {
            productionOrderIds.add(row.order_id);
          }
        }
        
        console.log(`🔗 Mapped ${poUnitIds.length} PO units to ${productionOrderIds.size} production orders`);
      }
    }
    
    // Combine regular order IDs with production order IDs
    const allOrderIds = [...regularOrderIds, ...Array.from(productionOrderIds)];
    
    console.log(`✅ Total orders for barcode scan: ${allOrderIds.length} (${regularOrderIds.length} regular + ${productionOrderIds.size} production orders)`);
    
    res.json({
      success: true,
      scheduleDate,
      orderIds: allOrderIds,
      count: allOrderIds.length
    });
  } catch (error) {
    console.error('❌ Error fetching orders by schedule date:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders for schedule date',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get list of weeks that have schedules (for reprint functionality)
router.get('/weeks', async (req: Request, res: Response) => {
  try {
    console.log('📅 SCHEDULE WEEKS: Fetching list of weeks with schedules...');
    
    const weeks = await pool.query(`
      SELECT 
        DATE_TRUNC('week', layup_day)::date AS week_start,
        MIN(layup_day)::date AS first_day,
        MAX(layup_day)::date AS last_day,
        COUNT(DISTINCT order_id) AS order_count,
        COUNT(DISTINCT CASE WHEN order_id LIKE 'PO-%' THEN order_id END) AS po_order_count,
        COUNT(DISTINCT CASE WHEN order_id NOT LIKE 'PO-%' THEN order_id END) AS regular_order_count
      FROM layup_schedule
      WHERE layup_day IS NOT NULL
      GROUP BY DATE_TRUNC('week', layup_day)
      ORDER BY DATE_TRUNC('week', layup_day) DESC
      LIMIT 52
    `);
    
    console.log(`✅ Found ${weeks.length} weeks with schedules`);
    
    res.json({
      success: true,
      weeks,
    });
  } catch (error) {
    console.error('❌ Error fetching schedule weeks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule weeks',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get full schedule data for a specific week (for reprint functionality)
router.get('/week/:weekStart', async (req: Request, res: Response) => {
  try {
    const { weekStart } = req.params;
    console.log(`📋 SCHEDULE REPRINT: Fetching schedule for week starting ${weekStart}...`);
    
    // Calculate week end date
    const weekEnd = format(addDays(new Date(weekStart), 7), 'yyyy-MM-dd');
    
    // Get all schedule entries for this week
    const scheduleEntries = await pool.query(
      `
      SELECT 
        ls.id,
        ls.order_id,
        ls.layup_day AS scheduled_date,
        ls.mold_id,
        ls.employee_assignments,
        ls.is_override,
        ls.created_at
      FROM layup_schedule ls
      WHERE ls.layup_day >= $1::date 
        AND ls.layup_day < $2::date
      ORDER BY ls.layup_day, ls.order_id
    `,
      [weekStart, weekEnd]
    );
    console.log(`📦 Found ${scheduleEntries.length} schedule entries`);
    
    // Separate PO items and regular orders
    const poOrderIds = scheduleEntries
      .filter((entry: any) => entry.order_id.startsWith('PO-'))
      .map((entry: any) => entry.order_id);
    
    const regularOrderIds = scheduleEntries
      .filter((entry: any) => !entry.order_id.startsWith('PO-'))
      .map((entry: any) => entry.order_id);
    
    console.log(`Regular orders: ${regularOrderIds.length}, PO orders: ${poOrderIds.length}`);
    
    // Fetch regular order details
    let regularOrders = [];
    if (regularOrderIds.length > 0) {
      regularOrders = await pool.query(
        `
        SELECT 
          ao.order_id,
          ao.fb_order_number,
          ao.model_id AS stock_model,
          ao.customer_id AS customer_name,
          ao.features
        FROM all_orders ao
        WHERE ao.order_id = ANY($1::text[])
      `,
        [regularOrderIds]
      );
    }
    
    // Fetch PO order details
    let poOrders = [];
    if (poOrderIds.length > 0) {
      poOrders = await pool.query(
        `
        SELECT 
          po_orders.order_id,
          po_orders.item_id,
          po.po_number,
          po.customer_name,
          poi.item_id AS stock_model,
          poi.item_name,
          poi.specifications AS features
        FROM production_orders po_orders
        JOIN purchase_orders po ON po_orders.po_id = po.id
        JOIN purchase_order_items poi ON po_orders.po_item_id = poi.id
        WHERE po_orders.order_id = ANY($1::text[])
      `,
        [poOrderIds]
      );
    }
    
    // Build unified schedule items with details
    const scheduledItems = scheduleEntries.map((entry: any) => {
      const dayOfWeek = getDay(new Date(entry.scheduled_date));
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
      
      if (entry.order_id.startsWith('PO-')) {
        // Find PO order details
        const poOrder = poOrders.find((po: any) => po.order_id === entry.order_id);
        
        if (!poOrder) {
          return {
            orderId: entry.order_id,
            fbOrderNumber: '',
            stockModel: 'Unknown',
            customerName: 'Unknown',
            scheduledDate: entry.scheduled_date,
            moldId: entry.mold_id,
            dayOfWeek,
            dayName,
          };
        }
        
        const features = poOrder.features || {};
        return {
          orderId: entry.order_id,
          fbOrderNumber: poOrder.po_number || '',
          stockModel: poOrder.stock_model || poOrder.item_name || 'Unknown',
          customerName: poOrder.customer_name || 'Unknown',
          scheduledDate: entry.scheduled_date,
          moldId: entry.mold_id,
          dayOfWeek,
          dayName,
          actionLength: features.action_length || null,
          material: extractMaterial(poOrder.stock_model),
          hasLOP: checkHasLOP(features),
          hasADL: checkHasADL(features),
          hasHeavyFill: checkHasHeavyFill(features),
        };
      } else {
        // Regular order
        const order = regularOrders.find((o: any) => o.order_id === entry.order_id);
        
        if (!order) {
          return {
            orderId: entry.order_id,
            fbOrderNumber: '',
            stockModel: 'Unknown',
            customerName: 'Unknown',
            scheduledDate: entry.scheduled_date,
            moldId: entry.mold_id,
            dayOfWeek,
            dayName,
          };
        }
        
        const features = order.features || {};
        return {
          orderId: entry.order_id,
          fbOrderNumber: order.fb_order_number || '',
          stockModel: order.stock_model || 'Unknown',
          customerName: order.customer_name || 'Unknown',
          scheduledDate: entry.scheduled_date,
          moldId: entry.mold_id,
          dayOfWeek,
          dayName,
          actionLength: features.action_length || null,
          material: extractMaterial(order.stock_model),
          hasLOP: checkHasLOP(features),
          hasADL: checkHasADL(features),
          hasHeavyFill: checkHasHeavyFill(features),
        };
      }
    });
    
    console.log(`✅ Built ${scheduledItems.length} scheduled items with details`);
    
    res.json({
      success: true,
      weekStart,
      scheduledItems,
      totalItems: scheduledItems.length,
    });
  } catch (error) {
    console.error('❌ Error fetching week schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch week schedule',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Helper functions for badge extraction
function extractMaterial(stockModel: string | null): string | null {
  if (!stockModel) return null;
  const model = stockModel.toLowerCase();
  if (model.includes('_fg_') || model.includes('_fg')) return 'Fiberglass';
  if (model.includes('_cf_') || model.includes('_cf')) return 'Carbon Fiber';
  return null;
}

function checkHasLOP(features: any): boolean {
  const lop = features?.length_of_pull;
  return lop && lop !== 'none' && lop !== 'standard' && lop !== 'std' && lop !== 'no_lop_change' && lop.trim() !== '';
}

function checkHasADL(features: any): boolean {
  const bottomMetal = features?.bottom_metal;
  return bottomMetal && typeof bottomMetal === 'string' && bottomMetal.toLowerCase().includes('adl');
}

function checkHasHeavyFill(features: any): boolean {
  const otherOptions = features?.other_options;
  return Array.isArray(otherOptions) && otherOptions.includes('heavy_fill');
}

export default router;
