import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

// NEW ENDPOINT: Add regular orders to schedule (excluding OEM priorities)
router.post('/add-regular-orders', async (req, res) => {
  try {
    console.log('📋 Add Regular Orders scheduling started');
    const { maxOrdersPerDay, scheduleDays, workDays, employees: requestEmployees, molds, excludeOEMOrders } = req.body;
    
    // Get unified P1 layup queue to find regular orders (excluding OEM orders)
    const fetch = (await import('node-fetch')).default;
    const p1QueueResponse = await fetch('http://localhost:5000/api/p1-layup-queue');
    const p1QueueData = await p1QueueResponse.json() as any[];
    
    // Filter to only regular orders (exclude OEM/production orders)
    console.log(`📋 Total orders from P1 queue: ${p1QueueData.length}`);
    console.log(`📋 ExcludeOEMOrders flag: ${excludeOEMOrders}`);
    
    let oemFilteredCount = 0;
    let needsSchedulingCount = 0;
    
    const regularOrdersToSchedule = p1QueueData.filter((order: any) => {
      // Exclude OEM orders if flag is set
      if (excludeOEMOrders) {
        const isOemOrder = order.source === 'production_order' || order.source === 'p1_purchase_order';
        if (isOemOrder) {
          oemFilteredCount++;
          console.log(`📋 FILTERED OUT OEM: ${order.orderId} (source: ${order.source})`);
          return false;
        }
      }
      
      // Must need scheduling (not already scheduled)
      const needsScheduling = !order.currentDepartment || 
                            order.currentDepartment === 'Production Queue' ||
                            order.currentDepartment === 'P1 Production Queue';
      
      if (!needsScheduling) {
        console.log(`📋 FILTERED OUT DEPT: ${order.orderId} (dept: ${order.currentDepartment})`);
        return false;
      }
      
      needsSchedulingCount++;
      return true;
    });
    
    console.log(`📋 Filtering results:`);
    console.log(`   - OEM orders filtered out: ${oemFilteredCount}`);
    console.log(`   - Orders needing scheduling: ${needsSchedulingCount}`);
    console.log(`   - Final regular orders to schedule: ${regularOrdersToSchedule.length}`);
    
    if (regularOrdersToSchedule.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No regular orders found needing scheduling',
        allocations: [] 
      });
    }
    
    // Use simplified scheduling for regular orders (basic algorithm)
    // Sort regular orders by due date priority
    regularOrdersToSchedule.sort((a, b) => {
      const dueDateA = new Date(a.dueDate || a.orderDate).getTime();
      const dueDateB = new Date(b.dueDate || b.orderDate).getTime();
      return dueDateA - dueDateB;
    });
    
    // Get active molds
    const activeMolds = await pool.query(`
      SELECT mold_id, model_name, stock_models, multiplier, is_active
      FROM molds WHERE is_active = true
    `);
    
    // Helper function for mold matching (copied from main endpoint)
    const findExactMatchingMolds = (stockModelId: string) => {
      const normalizedStockModel = stockModelId.toLowerCase().replace(/[\s\-]/g, '_');
      return (activeMolds || []).filter((mold: any) => {
        const moldStockModels = mold.stock_models || [];
        return moldStockModels.some((moldModel: string) => {
          const normalizedMoldModel = moldModel.toLowerCase().replace(/[\s\-]/g, '_');
          return normalizedMoldModel === normalizedStockModel;
        });
      });
    };
    
    // Get existing schedule assignments to check for collisions
    const existingSchedule = await pool.query(`
      SELECT mold_id, scheduled_date, order_id
      FROM layup_schedule 
      WHERE scheduled_date >= CURRENT_DATE
    `);
    const existingAssignments = new Set((existingSchedule || []).map((row: any) => {
      // FIXED: Handle both string and Date objects from PostgreSQL
      const dateStr = typeof row.scheduled_date === 'string' 
        ? row.scheduled_date.split('T')[0] 
        : row.scheduled_date.toISOString().split('T')[0];
      return `${row.mold_id}:${dateStr}`;
    }));
    console.log(`📋 Found ${existingSchedule.length} existing schedule assignments to avoid collisions`);

    // Track current scheduling to avoid internal collisions
    const currentAllocations = new Set();
    
    // Get employee data with production rates
    const employeeResult = await pool.query(`
      SELECT id, name, production_rate, is_active 
      FROM employees 
      WHERE is_active = true AND production_rate > 0
    `);
    // FIXED: Properly extract rows from QueryResult object
    const employeeRows = Array.isArray(employeeResult) 
      ? employeeResult 
      : (employeeResult as any).rows ?? [];
    const employees = employeeRows as Array<{id: number, name: string, production_rate: number, is_active: boolean}>;
    
    console.log(`👥 Found ${employees.length} active employees with production rates`);
    
    // Initialize employee capacity tracking per day
    const employeeCapacity = new Map<string, Map<number, number>>();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    
    // Initialize capacity for each work day for next 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      if (workDays.includes(date.getDay())) {
        const dateStr = date.toISOString().split('T')[0];
        employeeCapacity.set(dateStr, new Map<number, number>());
        
        // Set each employee's daily capacity
        for (const emp of employees) {
          employeeCapacity.get(dateStr)!.set(emp.id, emp.production_rate);
        }
      }
    }
    
    const allocations = [];
    
    for (const order of regularOrdersToSchedule) { // FIXED: Process all orders, no limit
      // Find compatible molds
      const compatibleMolds = findExactMatchingMolds(order.stockModelId || order.modelId || 'unknown');
      
      if (compatibleMolds.length === 0) {
        console.log(`📋 Skipping order ${order.orderId} - no compatible molds`);
        continue;
      }
      
      let orderScheduled = false;
      let attemptCount = 0;
      const maxAttempts = 30; // Prevent infinite loops
      
      // Find next available work day with employee capacity
      let currentDate = new Date(startDate);
      let foundSlot = false;
      
      // FIXED: Keep trying same order until scheduled or max attempts reached
      while (!orderScheduled && attemptCount < maxAttempts) {
        attemptCount++;
        
        // Find next work day with available employee capacity
        let daysSearched = 0;
        const maxDaysToSearch = 365; // Prevent infinite loops
        
        while (!foundSlot && attemptCount < maxAttempts && daysSearched < maxDaysToSearch) {
          const dateStr = currentDate.toISOString().split('T')[0];
          daysSearched++;
          
          // Check if it's a work day and has employee capacity
          if (workDays.includes(currentDate.getDay())) {
            // FIXED: Ensure capacity exists for this date (extend beyond 30 days if needed)
            if (!employeeCapacity.has(dateStr)) {
              // Lazily initialize capacity for dates beyond 30 days
              employeeCapacity.set(dateStr, new Map<number, number>());
              for (const emp of employees) {
                employeeCapacity.get(dateStr)!.set(emp.id, emp.production_rate);
              }
            }
            
            const dayCapacity = employeeCapacity.get(dateStr)!;
            // FIXED: Require at least 1 full unit of capacity to prevent overbooking
            const availableEmployee = Array.from(dayCapacity.entries()).find(([empId, capacity]) => capacity >= 1);
            
            if (availableEmployee) {
              foundSlot = true;
              console.log(`📋 Found available slot on ${dateStr} with employee ${availableEmployee[0]} (${availableEmployee[1]} capacity remaining)`);
            } else {
              // Check if ALL employees have zero capacity (deadlock protection)
              const totalCapacity = Array.from(dayCapacity.values()).reduce((sum: number, cap: number) => sum + cap, 0);
              if (totalCapacity === 0) {
                console.log(`📋 ⚠️ All employees at zero capacity on ${dateStr}, skipping to next day`);
              }
              currentDate.setDate(currentDate.getDate() + 1);
            }
          } else {
            currentDate.setDate(currentDate.getDate() + 1);
          }
        }
        
        // FIXED: If we searched too many days without finding capacity, exit gracefully
        if (daysSearched >= maxDaysToSearch) {
          console.log(`📋 ⚠️ Could not find employee capacity within ${maxDaysToSearch} days for order ${order.orderId}`);
          break;
        }
        
        if (foundSlot) {
          // Find first available mold (collision detection)
          const scheduledDateStr = currentDate.toISOString().split('T')[0];
          let selectedMold = null;
          
          for (const mold of compatibleMolds) {
            const moldDateKey = `${mold.mold_id}:${scheduledDateStr}`;
            
            // FIXED: Real-time collision detection - check database for live conflicts
            const liveCollisionCheck = await pool.query(`
              SELECT COUNT(*) as count 
              FROM layup_schedule 
              WHERE mold_id = $1 AND DATE(scheduled_date) = DATE($2)
            `, [mold.mold_id, scheduledDateStr]);
            
            // FIXED: Safer parsing of PostgreSQL result with proper null checks (same fix as OEM scheduler)
            const result = liveCollisionCheck as any;
            const rows = result?.rows || [];
            const collisionCount = rows.length > 0 ? parseInt(rows[0]?.count) || 0 : 0;
            const hasDbCollision = collisionCount > 0;
            const hasMemoryCollision = currentAllocations.has(moldDateKey);
            
            if (!hasDbCollision && !hasMemoryCollision) {
              selectedMold = mold;
              currentAllocations.add(moldDateKey);
              console.log(`📋 ✅ Found available mold: ${mold.mold_id} for ${order.orderId} on ${scheduledDateStr} (DB: ${hasDbCollision ? 'conflict' : 'free'}, Memory: ${hasMemoryCollision ? 'conflict' : 'free'})`);
              break;
            } else {
              console.log(`📋 ❌ Mold collision detected: ${mold.mold_id} already assigned on ${scheduledDateStr} (DB: ${hasDbCollision ? 'conflict' : 'free'}, Memory: ${hasMemoryCollision ? 'conflict' : 'free'})`);
            }
          }
          
          if (selectedMold) {
            // Get the available employee for this day
            const dayCapacity = employeeCapacity.get(scheduledDateStr)!;
            const [employeeId, remainingCapacity] = Array.from(dayCapacity.entries()).find(([empId, capacity]) => capacity >= 1) || [null, 0];
            
            if (employeeId && remainingCapacity >= 1) {
              // Successfully scheduled this order with employee assignment
              allocations.push({
                orderId: order.orderId,
                moldId: selectedMold.mold_id,
                scheduledDate: scheduledDateStr,
                employeeId: employeeId,
                priority: 'regular'
              });
              
              // Decrement employee capacity
              dayCapacity.set(employeeId, remainingCapacity - 1);
              orderScheduled = true;
              console.log(`📋 Scheduled regular order ${order.orderId} → ${selectedMold.mold_id} on ${currentDate.toDateString()} with employee ${employeeId}`);
            } else {
              console.log(`📋 ⚠️ No employee capacity available for ${order.orderId} on ${scheduledDateStr}`);
              foundSlot = false;
              currentDate.setDate(currentDate.getDate() + 1);
            }
          } else {
            // No mold available today, try next day
            console.log(`📋 ⚠️ No available molds for order ${order.orderId} on ${scheduledDateStr} - trying next day (attempt ${attemptCount})`);
            foundSlot = false;
            currentDate.setDate(currentDate.getDate() + 1);
          }
        } else {
          // No slot found, exit loop
          break;
        }
      }
      
      if (!orderScheduled) {
        console.log(`📋 ❌ Could not schedule order ${order.orderId} after ${maxAttempts} attempts`);
      }
    }
    
    console.log(`📋 Scheduled ${allocations.length} regular orders`);
    
    return res.json({
      success: true,
      allocations: allocations,
      message: `Added ${allocations.length} regular orders to schedule`
    });
    
  } catch (error) {
    console.error('❌ Error in add-regular-orders:', error);
    return res.status(500).json({ error: 'Failed to add regular orders to schedule' });
  }
});

// NEW ENDPOINT: Schedule only selected OEM stock orders from OEM Priority Settings
router.post('/oem-priority-only', async (req, res) => {
  try {
    console.log('🟢 OEM Priority-Only Scheduling started');
    console.log('🟢 Request body:', req.body);
    const { vendorId, poId, poNumber, stockItemIds, selectionMode } = req.body;
    
    console.log('🟢 Extracted variables:', { vendorId, poId, poNumber, stockItemIds, selectionMode });
    
    // Validate based on selection mode
    if (!poId) {
      console.log('❌ Validation failed: Missing poId');
      return res.status(400).json({ error: 'Missing required field: poId' });
    }
    
    if (selectionMode === 'entire_po') {
      // For entire PO mode, we don't need individual stockItemIds
      if (!poNumber) {
        console.log('❌ Validation failed: Missing poNumber for entire_po mode');
        return res.status(400).json({ error: 'Missing required field: poNumber for entire_po mode' });
      }
    } else {
      // For individual stock items mode, we need stockItemIds
      if (!stockItemIds || stockItemIds.length === 0) {
        console.log('❌ Validation failed:', { poId, stockItemIds, selectionMode });
        return res.status(400).json({ error: 'Missing required field: stockItemIds for individual stock selection' });
      }
    }
    
    console.log('✅ Validation passed, proceeding with scheduling');
    
    console.log(`🟢 Scheduling OEM stock items from PO ${poId} (mode: ${selectionMode})`);
    
    // Get unified P1 layup queue to find the OEM orders
    const fetch = (await import('node-fetch')).default;
    const p1QueueResponse = await fetch('http://localhost:5000/api/p1-layup-queue');
    const p1QueueData = await p1QueueResponse.json() as any[];
    
    // Filter to only the selected OEM stock items that need scheduling
    const oemOrdersToSchedule = p1QueueData.filter((order: any) => {
      // Must be from production orders (OEM)
      const isOemOrder = order.source === 'production_order' || order.source === 'p1_purchase_order';
      if (!isOemOrder) return false;
      
      // Must need scheduling (not already scheduled)
      const needsScheduling = !order.currentDepartment || 
                            order.currentDepartment === 'Production Queue' ||
                            order.currentDepartment === 'P1 Production Queue';
      if (!needsScheduling) return false;
      
      // Handle different selection modes
      let isSelectedItem = false;
      
      if (selectionMode === 'entire_po') {
        // For entire PO mode, match by PO number
        // Production orders have orderId format: PO-P18261-2-1 where P18261 is the PO number
        if (order.orderId && order.orderId.startsWith('PO-') && poNumber) {
          const orderPoNumber = order.orderId.split('-')[1]; // Extract P18261 from PO-P18261-2-1
          isSelectedItem = orderPoNumber === poNumber; // Match against actual PO number (P18261)
        }
      } else {
        // For individual stock item mode, match by stock item IDs
        isSelectedItem = stockItemIds.includes(order.poItemId?.toString()) || 
                        stockItemIds.includes(order.stockItemId?.toString()) ||
                        stockItemIds.includes(order.id?.toString()) ||
                        // Match production order format: PO-P18261-2-1 where '2' is stock item ID
                        (order.orderId && stockItemIds.some((id: string) => order.orderId.includes(`-${id}-`)));
      }
      
      console.log(`🟢 OEM Order ${order.orderId}: isOEM=${isOemOrder}, needsScheduling=${needsScheduling}, isSelected=${isSelectedItem}`);
      console.log(`🟢   → Selection Mode: ${selectionMode}, PO ID: ${poId}, Stock IDs: ${JSON.stringify(stockItemIds)}`);
      console.log(`🟢   → Order Props: poItemId=${order.poItemId}, stockItemId=${order.stockItemId}, id=${order.id}`);
      
      return isSelectedItem;
    });
    
    console.log(`🟢 Found ${oemOrdersToSchedule.length} OEM orders to schedule`);
    console.log('🟢 Debug - P1 queue data sample:', p1QueueData.slice(0, 3));
    console.log('🟢 Debug - Stock item IDs:', stockItemIds);
    console.log('🟢 Debug - OEM orders to schedule:', oemOrdersToSchedule.map(o => ({
      orderId: o.orderId,
      source: o.source,
      poItemId: o.poItemId,
      stockItemId: o.stockItemId,
      id: o.id
    })));
    
    if (oemOrdersToSchedule.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No OEM orders found needing scheduling',
        scheduled: 0 
      });
    }
    
    // Get active molds
    const activeMoldsResult = await pool.query(`
      SELECT mold_id, model_name, stock_models, multiplier, is_active
      FROM molds WHERE is_active = true
    `);
    
    // Handle Neon serverless QueryResult properly
    console.log('🔧 DEBUG: activeMoldsResult type:', typeof activeMoldsResult);
    console.log('🔧 DEBUG: activeMoldsResult keys:', activeMoldsResult ? Object.keys(activeMoldsResult) : 'null/undefined');
    
    let activeMolds;
    if (activeMoldsResult && (activeMoldsResult as any).rows) {
      activeMolds = (activeMoldsResult as any).rows;
    } else if (Array.isArray(activeMoldsResult)) {
      activeMolds = activeMoldsResult;
    } else {
      console.error('❌ Unexpected activeMoldsResult structure:', activeMoldsResult);
      activeMolds = [];
    }
    
    console.log(`🔧 Found ${activeMolds ? activeMolds.length : 0} active molds from database`);
    if (!activeMolds || activeMolds.length === 0) {
      console.warn('⚠️ No active molds found in database!');
      return res.json({ 
        success: true, 
        message: 'No active molds available for scheduling',
        scheduled: 0 
      });
    }
    
    // Helper function for mold matching
    const findExactMatchingMolds = (stockModelId: string) => {
      const normalizedStockModel = stockModelId.toLowerCase().replace(/[\s\-]/g, '_');
      return activeMolds.filter((mold: any) => {
        const moldStockModels = mold.stock_models || [];
        return moldStockModels.some((moldModel: string) => {
          const normalizedMoldModel = moldModel.toLowerCase().replace(/[\s\-]/g, '_');
          return normalizedMoldModel === normalizedStockModel;
        });
      });
    };
    
    // FIXED: Schedule the OEM orders starting from next work day (Monday)
    const workDays = [1, 2, 3, 4]; // Monday=1, Tuesday=2, Wednesday=3, Thursday=4
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);
    
    // Find the first work day starting from tomorrow
    let currentScheduleDate = new Date(startDate);
    while (!workDays.includes(currentScheduleDate.getDay())) {
      currentScheduleDate.setDate(currentScheduleDate.getDate() + 1);
    }
    
    console.log(`🟢 OEM Priority scheduling starting on first work day: ${currentScheduleDate.toDateString()}`);
    
    // FIXED: Add mold collision detection for OEM priority scheduling
    const existingScheduleResult = await pool.query(`
      SELECT mold_id, scheduled_date, order_id
      FROM layup_schedule 
      WHERE scheduled_date >= CURRENT_DATE
    `);
    
    // FIXED: Properly extract rows from QueryResult object
    const existingScheduleRows = Array.isArray(existingScheduleResult) 
      ? existingScheduleResult 
      : (existingScheduleResult as any).rows ?? [];
    
    const existingAssignments = new Set(existingScheduleRows.map((row: any) => {
      const dateStr = typeof row.scheduled_date === 'string' 
        ? row.scheduled_date.split('T')[0] 
        : row.scheduled_date.toISOString().split('T')[0];
      return `${row.mold_id}:${dateStr}`;
    }));
    
    // Track current OEM allocations to avoid internal collisions
    const currentOemAllocations = new Set();
    
    console.log(`🔍 Found ${existingScheduleRows.length} existing schedule assignments to avoid OEM collisions`);
    
    let scheduledCount = 0;
    
    // Schedule each OEM order
    for (const order of oemOrdersToSchedule) {
      try {
        const matchingMolds = findExactMatchingMolds(order.modelId || order.stockModelId || '');
        
        if (matchingMolds.length === 0) {
          console.warn(`⚠️ No matching molds found for order ${order.orderId} (model: ${order.modelId})`);
          continue;
        }
        
        // FIXED: Capture the exact schedule date for THIS order
        const orderScheduleDate = new Date(currentScheduleDate);
        const scheduledDateStr = orderScheduleDate.toISOString().split('T')[0];
        let selectedMold = null;
        
        console.log(`🔍 Checking collision for ${order.orderId} on ${scheduledDateStr}`);
        
        for (const mold of matchingMolds) {
          const moldDateKey = `${mold.mold_id}:${scheduledDateStr}`;
          
          // FIXED: Real-time collision detection - check database for live conflicts
          console.log(`🔍 Collision check: mold=${mold.mold_id}, date=${scheduledDateStr}`);
          const liveCollisionCheck = await pool.query(`
            SELECT COUNT(*) as count 
            FROM layup_schedule 
            WHERE mold_id = $1 AND DATE(scheduled_date) = DATE($2)
          `, [mold.mold_id, scheduledDateStr]);
          
          // FIXED: Safer parsing of PostgreSQL result with proper null checks
          const result = liveCollisionCheck as any;
          const rows = result?.rows || [];
          const collisionCount = rows.length > 0 ? parseInt(rows[0]?.count) || 0 : 0;
          const hasDbCollision = collisionCount > 0;
          const hasMemoryCollision = currentOemAllocations.has(moldDateKey);
          
          console.log(`🔍 Results: DB collision=${hasDbCollision}, Memory collision=${hasMemoryCollision}, Count=${collisionCount}, Rows=${rows.length}`);
          
          if (!hasDbCollision && !hasMemoryCollision) {
            selectedMold = mold;
            currentOemAllocations.add(moldDateKey);
            console.log(`🟢 ✅ Found available mold for OEM: ${mold.mold_id} for ${order.orderId} on ${scheduledDateStr} (DB: ${hasDbCollision ? 'conflict' : 'free'}, Memory: ${hasMemoryCollision ? 'conflict' : 'free'})`);
            break;
          } else {
            console.log(`🟢 ❌ OEM Mold collision detected: ${mold.mold_id} already assigned on ${scheduledDateStr} (DB: ${hasDbCollision ? 'conflict' : 'free'}, Memory: ${hasMemoryCollision ? 'conflict' : 'free'})`);
          }
        }
        
        if (!selectedMold) {
          console.warn(`⚠️ No available molds for OEM order ${order.orderId} on ${scheduledDateStr} - trying next day`);
          // Move to next work day and try again
          do {
            currentScheduleDate.setDate(currentScheduleDate.getDate() + 1);
          } while (!workDays.includes(currentScheduleDate.getDay()));
          continue; // Try again with new date
        }
        
        // FIXED: Insert using the SAME date that was collision-checked
        const scheduleResult = await pool.query(
          `INSERT INTO layup_schedule (
            order_id, mold_id, employee_assignments, scheduled_date, 
            created_at, updated_at, is_override, overridden_by
          ) VALUES ($1, $2, $3, $4, NOW(), NOW(), true, $5)
          RETURNING *`,
          [
            order.orderId,
            selectedMold.mold_id,
            JSON.stringify({'jessica_pena': 1}), // Employee assignments as JSONB
            scheduledDateStr, // Use the EXACT same date that was collision-checked
            'oem_priority_system' // Mark as overridden by OEM priority system
          ]
        );
        
        console.log(`✅ Scheduled OEM order ${order.orderId} on ${orderScheduleDate.toDateString()}`);
        scheduledCount++;
        
        // FIXED: Move to next work day (not just next day)
        do {
          currentScheduleDate.setDate(currentScheduleDate.getDate() + 1);
        } while (!workDays.includes(currentScheduleDate.getDay()));
        
      } catch (error) {
        console.error(`❌ Failed to schedule OEM order ${order.orderId}:`, error);
      }
    }
    
    console.log(`🟢 OEM Priority scheduling complete: ${scheduledCount} orders scheduled`);
    
    res.json({
      success: true,
      message: `Scheduled ${scheduledCount} OEM priority orders`,
      scheduled: scheduledCount,
      total: oemOrdersToSchedule.length,
      debug: {
        totalP1Orders: p1QueueData.length,
        productionOrders: p1QueueData.filter(o => o.source === 'production_order').length,
        stockItemIds,
        oemOrdersFound: oemOrdersToSchedule.map(o => ({
          orderId: o.orderId,
          source: o.source,
          modelId: o.modelId,
          currentDepartment: o.currentDepartment
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ OEM Priority scheduling error:', error);
    res.status(500).json({ error: 'Failed to schedule OEM priority orders' });
  }
});

router.post('/generate-algorithmic-schedule', async (req, res) => {
  try {
    // Use work days from frontend settings (respecting user configuration)
    // Default to 2 weeks (10 work days) instead of 60 days
    const { scheduleDays = 10, workDays = [1, 2, 3, 4], maxOrdersPerDay = 21, employees = [], molds = [] } = req.body;
    
    // Use the work days passed from the frontend settings
    const enforcedWorkDays = workDays; // Respect user's work day configuration
    console.log(`✅ Using work days from frontend settings: ${enforcedWorkDays.map((d: number) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}`);
    console.log(`✅ Using daily capacity from frontend: ${maxOrdersPerDay} orders/day`);
    
    console.log(`🚀 Starting algorithmic scheduler over ${scheduleDays} days`);
    console.log(`📅 Work days ENFORCED: ${enforcedWorkDays.map((d: number) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')} (${enforcedWorkDays.join(', ')})`);

    // Get unified P1 layup queue including all orders from all_orders + production_orders
    const fetch = (await import('node-fetch')).default;
    const p1QueueResponse = await fetch('http://localhost:5000/api/p1-layup-queue');
    const p1QueueData = await p1QueueResponse.json() as any[];
    
    // Filter out orders that are already scheduled or in later departments
    const ordersToProcess = p1QueueData.filter((order: any) => {
      // Only include orders that need to be scheduled for layup
      const needsScheduling = !order.currentDepartment || 
                            order.currentDepartment === 'Production Queue' ||
                            order.currentDepartment === 'P1 Production Queue';
      return needsScheduling;
    });
    
    console.log(`📋 Found ${p1QueueData.length} total orders in unified P1 production queue`);
    console.log(`📋 Found ${ordersToProcess.length} orders needing scheduling`);

    // Fetch layup employee production rates
    const employeeQueryResult = await pool.query(`
      SELECT employee_id, rate, hours, is_active 
      FROM employee_layup_settings 
      WHERE is_active = true AND department = 'Layup'
    `);
    
    // FIXED: Properly extract rows from QueryResult object
    const employeeResult = Array.isArray(employeeQueryResult) 
      ? employeeQueryResult 
      : (employeeQueryResult as any).rows ?? [];

    // Calculate actual daily employee capacity
    const dbEmployees = employeeResult || []; // Extract query result directly
    const totalDailyCapacity = dbEmployees.reduce((total: number, emp: any) => {
      return total + (emp.rate * emp.hours);
    }, 0);
    
    console.log(`👥 Found ${dbEmployees.length} layup employees with total capacity: ${totalDailyCapacity} parts/day`);
    dbEmployees.forEach((emp: any) => {
      const dailyCapacity = emp.rate * emp.hours;
      console.log(`  ${emp.employee_id}: ${emp.rate} parts/hr × ${emp.hours} hrs = ${dailyCapacity} parts/day`);
    });

    // Use capacity from frontend settings (calculated from UI employee settings)
    const actualDailyCapacity = maxOrdersPerDay || Math.floor(totalDailyCapacity) || 21;
    console.log(`🎯 Using frontend daily capacity: ${actualDailyCapacity} orders/day (passed from UI settings)`);

    // Fetch active molds with capacity and stock models
    const activeMoldsResult = await pool.query(`
      SELECT 
        mold_id,
        model_name,
        stock_models,
        multiplier,
        is_active
      FROM molds 
      WHERE is_active = true
    `);
    const activeMolds = activeMoldsResult || []; // Extract query result directly
    console.log(`🏭 Found ${activeMolds.length} active molds`);

    // Helper function for exact stock model matching
    const findExactMatchingMolds = (stockModelId: string) => {
      const normalizedStockModel = stockModelId.toLowerCase().replace(/[\s\-]/g, '_');
      
      return activeMolds.filter((mold: any) => {
        const moldStockModels = mold.stock_models || [];
        
        // Mesa Universal orders must use Mesa Universal molds ONLY
        if (normalizedStockModel.includes('mesa_universal') || normalizedStockModel.includes('mesauniversal')) {
          return moldStockModels.some((moldModel: string) => {
            const normalizedMoldModel = moldModel.toLowerCase().replace(/[\s\-]/g, '_');
            return normalizedMoldModel === 'mesa_universal';
          });
        }
        
        // For all other orders, use STRICT exact matching ONLY
        // REMOVED: Universal mold logic that was causing Mesa Universal to accept all orders
        const hasMatch = moldStockModels.some((moldModel: string) => {
          const normalizedMoldModel = moldModel.toLowerCase().replace(/[\s\-]/g, '_');
          // Require exact match only - no universal matching for non-Mesa orders
          return normalizedMoldModel === normalizedStockModel;
        });
        
        // CRITICAL: Log any potential mismatches for validation
        if (!hasMatch) {
          console.warn(`🚨 STRICT VALIDATION: No mold match found for stock model "${stockModelId}" (normalized: "${normalizedStockModel}"). Available molds for this model: ${moldStockModels.join(', ')}`);
        }
        
        return hasMatch;
      });
    };

    // Sort orders by priority score and due date before scheduling
    const sortOrdersByPriority = (orders: any[]) => {
      const now = new Date();
      
      return orders.sort((a, b) => {
        // Calculate dynamic priority scores based on business rules
        const calculatePriority = (order: any) => {
          const dueDate = new Date(order.dueDate || order.due_date || order.orderDate || '2099-12-31');
          const daysDiff = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          let priority = 0;
          
          // ALL P1 PO orders get highest priority (1000+)
          if (order.source === 'production_order' || order.source === 'p1_purchase_order' || 
              order.poId || order.productionOrderId) {
            priority += 1000; // Very high priority for ALL P1 PO orders
            console.log(`🏭 P1 PO PRIORITY: Order ${order.orderId} gets +1000 priority (source: ${order.source})`);
          }
          
          // Mesa Universal orders get additional priority boost
          const stockModelId = order.stockModelId || order.modelId || '';
          if (stockModelId.toLowerCase().includes('mesa_universal') || 
              stockModelId.toLowerCase().includes('mesa universal')) {
            priority += 100; // Additional priority for Mesa Universal
            console.log(`🏔️ MESA PRIORITY: Order ${order.orderId} gets +100 additional Mesa priority`);
          }
          
          // Due date urgency scoring (closer due dates = higher priority)
          if (daysDiff < 0) priority += 500; // Overdue orders
          else if (daysDiff <= 7) priority += 300; // Due within a week
          else if (daysDiff <= 14) priority += 200; // Due within 2 weeks
          else if (daysDiff <= 30) priority += 100; // Due within a month
          
          // Existing priority score from database (if available)
          const dbPriority = order.priorityScore || order.priority_score || 0;
          priority += dbPriority;
          
          return priority;
        };
        
        const priorityA = calculatePriority(a);
        const priorityB = calculatePriority(b);
        
        // If priority scores are different, prioritize higher score
        if (priorityA !== priorityB) {
          return priorityB - priorityA; // Higher priority first
        }
        
        // If priority scores are equal, sort by due date (earlier first)
        const dueDateA = new Date(a.dueDate || a.due_date || a.orderDate || '2099-12-31');
        const dueDateB = new Date(b.dueDate || b.due_date || b.orderDate || '2099-12-31');
        
        return dueDateA.getTime() - dueDateB.getTime(); // Earlier due date first
      });
    };

    // Apply priority-based sorting to orders
    const prioritizedOrders = sortOrdersByPriority([...ordersToProcess]);
    console.log(`🎯 Sorted ${prioritizedOrders.length} orders by priority score and due date`);
    
    // Show top priority orders with calculated priorities
    console.log(`📈 Top 10 priority orders:`);
    prioritizedOrders.slice(0, 10).forEach((order, index) => {
      const dueDate = new Date(order.dueDate || order.due_date || order.orderDate || '2099-12-31');
      const stockModelId = order.stockModelId || order.modelId || 'unknown';
      const isMesaUniversal = stockModelId.toLowerCase().includes('mesa_universal') || 
                              stockModelId.toLowerCase().includes('mesa universal');
      const isP1PO = order.source === 'production_order' || order.source === 'p1_purchase_order' || 
                     order.poId || order.productionOrderId;
      let priorityTags = '';
      if (isP1PO) priorityTags += ' [P1 PO - HIGH PRIORITY]';
      if (isMesaUniversal) priorityTags += ' [MESA UNIVERSAL]';
      console.log(`   ${index + 1}. ${order.orderId}: ${stockModelId}, Due ${dueDate.toDateString()}${priorityTags}`);
    });

    // Generate work dates based on configured work days
    const generateWorkDates = (startDate: Date, days: number, allowedWorkDays: number[]): Date[] => {
      const workDates: Date[] = [];
      let currentDate = new Date(startDate);
      
      // Start from next valid work day if current day is not a work day
      while (!allowedWorkDays.includes(currentDate.getDay())) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      let totalDays = 0;
      while (totalDays < days) {
        const dayOfWeek = currentDate.getDay();
        
        // Only include days that are in the allowed work days
        if (allowedWorkDays.includes(dayOfWeek)) {
          const workDate = new Date(currentDate);
          
          // CRITICAL VALIDATION: Ensure Friday is only included if explicitly allowed
          if (workDate.getDay() === 5 && !allowedWorkDays.includes(5)) {
            console.error(`❌ CRITICAL ERROR: Attempted to add Friday ${workDate.toDateString()} but Friday not in allowed work days: [${allowedWorkDays.join(', ')}]`);
            throw new Error(`Friday assignment prevented - not in configured work days`);
          }
          
          workDates.push(workDate);
          const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][workDate.getDay()];
          console.log(`✅ Added work date: ${workDate.toDateString()} (${dayName}, Day ${workDate.getDay()})`);
          totalDays++;
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      const allowedDayNames = allowedWorkDays.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]);
      console.log(`📅 Generated ${workDates.length} work dates for: ${allowedDayNames.join(', ')}`);
      return workDates;
    };

    // For scheduling, start from current date or next Monday
    const today = new Date();
    const startDate = new Date(today);
    // If today is not a work day, advance to next work day
    while (!enforcedWorkDays.includes(startDate.getDay())) {
      startDate.setDate(startDate.getDate() + 1);
    }
    
    console.log(`📅 SCHEDULING WINDOW: Starting from ${startDate.toDateString()}, generating ${scheduleDays} work days`);
    const workDates = generateWorkDates(startDate, scheduleDays, enforcedWorkDays);
    
    console.log(`📅 FINAL WORK DATES (${workDates.length} days):`);
    workDates.forEach((date, index) => {
      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
      console.log(`   ${index + 1}. ${date.toDateString()} (${dayName})`);
    });
    const allocations: any[] = [];
    const dailyMoldUsage = new Map<string, number>();
    const dailyAllocationCount = new Map<string, number>();

    // Initialize daily tracking
    workDates.forEach(date => {
      const dateKey = date.toISOString().split('T')[0];
      dailyAllocationCount.set(dateKey, 0);
      
      activeMolds.forEach((mold: any) => {
        const moldKey = `${dateKey}-${mold.mold_id}`;
        dailyMoldUsage.set(moldKey, 0);
      });
    });

    // CRITICAL VALIDATION: Verify all orders have compatible molds - NO EXCEPTIONS
    console.log('🚨 PERFORMING STRICT MOLD VALIDATION - NO EXCEPTIONS ALLOWED');
    const invalidOrders: any[] = [];
    
    prioritizedOrders.forEach((order: any) => {
      const stockModelId = order.stockModelId || order.modelId || 'unknown';
      const compatibleMolds = findExactMatchingMolds(stockModelId);
      
      if (compatibleMolds.length === 0) {
        console.error(`🚨 CRITICAL VALIDATION FAILURE: Order ${order.orderId} with stock model "${stockModelId}" has NO compatible molds. SCHEDULING BLOCKED.`);
        invalidOrders.push({ orderId: order.orderId, stockModel: stockModelId });
      }
    });
    
    if (invalidOrders.length > 0) {
      console.error(`🚨 SCHEDULING BLOCKED: ${invalidOrders.length} orders have no compatible molds:`, invalidOrders);
      return res.status(400).json({
        success: false,
        error: 'STRICT VALIDATION FAILED - Orders have no compatible molds',
        invalidOrders: invalidOrders,
        message: 'Under no circumstances will a stock model not match the mold. Fix mold configuration before scheduling.'
      });
    }
    
    console.log('✅ STRICT VALIDATION PASSED: All orders have compatible molds');

    // Process each order (now prioritized by score and due date)
    for (const order of prioritizedOrders) {
      const stockModelId = order.stockModelId || order.modelId || 'unknown';
      
      // Extract material prefix (CF/FG)
      const materialPrefix = stockModelId.toLowerCase().startsWith('cf_') ? 'cf' : 
                           stockModelId.toLowerCase().startsWith('fg_') ? 'fg' : 'unknown';
      
      // Extract heavy fill and LOP adjustment from features
      let heavyFill = false;
      let lopAdjustment = false;
      
      if (order.features) {
        try {
          const features = typeof order.features === 'string' ? JSON.parse(order.features) : order.features;
          heavyFill = features.heavyFill === true || features.heavyFill === 'true';
          lopAdjustment = features.lopAdjustment === true || features.lopAdjustment === 'true';
        } catch (e) {
          console.log(`⚠️ Could not parse features for order ${order.orderId}`);
        }
      }

      console.log(`🎯 ORDER: ${order.orderId} → Stock: ${stockModelId} | Material: ${materialPrefix} |`);

      // Find exact matching molds
      const compatibleMolds = findExactMatchingMolds(stockModelId);
      
      // Log exact matches found
      compatibleMolds.forEach(mold => {
        console.log(`✅ EXACT MATCH: ${stockModelId} → ${mold.model_name} (stockModels: ${(mold.stock_models || []).join(', ')})`);
      });

      console.log(`🔍 EXACT MATCHING: ${stockModelId} → Found ${compatibleMolds.length} compatible molds`);
      console.log(`✅ Found ${compatibleMolds.length} compatible molds for ${stockModelId}: ${compatibleMolds.map(m => m.model_name).join(', ')}`);

      if (compatibleMolds.length === 0) {
        console.log(`❌ No compatible molds found for ${stockModelId}`);
        continue;
      }

      let scheduled = false;

      // Try to schedule on each work day (distribute evenly across all work days)
      for (const workDate of workDates) {
        if (scheduled) break;
        
        const dailyKey = workDate.toISOString().split('T')[0];
        const currentDailyCount = dailyAllocationCount.get(dailyKey) || 0;
        const dayOfWeek = workDate.getDay();
        const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek];
        
        // CRITICAL: Verify this is an allowed work day before scheduling
        if (!enforcedWorkDays.includes(dayOfWeek)) {
          console.log(`⚠️ SKIP: ${workDate.toDateString()} (${dayName}) not in allowed work days: [${enforcedWorkDays.join(', ')}]`);
          continue;
        }
        
        // FRIDAY PREVENTION: Extra validation to ensure Friday is never scheduled
        if (dayOfWeek === 5) {
          console.error(`🚨 FRIDAY PREVENTION: Attempted to schedule on Friday ${workDate.toDateString()} - BLOCKED!`);
          continue;
        }
        
        console.log(`🎯 ATTEMPTING: ${workDate.toDateString()} (${dayName}, Day ${dayOfWeek}) - Current count: ${currentDailyCount}/${actualDailyCapacity}`);
        
        // STRICT CAPACITY CHECK: Never exceed daily capacity
        if (currentDailyCount >= actualDailyCapacity) {
          console.log(`⏸️ CAPACITY FULL: ${dayName} already has ${currentDailyCount}/${actualDailyCapacity} orders - STRICT LIMIT ENFORCED`);
          continue;
        }
        
        // Additional safety check: ensure we don't go over even with mold multipliers
        if ((currentDailyCount + 1) > actualDailyCapacity) {
          console.log(`⏸️ SAFETY CHECK: Adding this order would exceed capacity (${currentDailyCount + 1} > ${actualDailyCapacity})`);
          continue;
        }

        // Try each compatible mold with STRICT capacity limits
        for (const mold of compatibleMolds) {
          const moldKey = `${dailyKey}-${mold.mold_id}`;
          const currentUsage = dailyMoldUsage.get(moldKey) || 0;
          // LIMIT MOLD MULTIPLIER: Cap at 3 to prevent over-scheduling
          const moldCapacity = Math.min(mold.multiplier || 1, 3);

          if (currentUsage < moldCapacity) {
            // FINAL CAPACITY CHECK: Ensure this assignment won't exceed daily limit
            const finalDailyCheck = (dailyAllocationCount.get(dailyKey) || 0) + 1;
            if (finalDailyCheck > actualDailyCapacity) {
              console.log(`🚫 FINAL CAPACITY CHECK FAILED: Would exceed daily limit (${finalDailyCheck} > ${actualDailyCapacity})`);
              continue;
            }
            // CRITICAL VALIDATION: Never allow assignments on non-work days
            const scheduleDate = new Date(workDate);
            const scheduleDayOfWeek = scheduleDate.getDay();
            const scheduleDayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][scheduleDayOfWeek];
            
            if (!enforcedWorkDays.includes(scheduleDayOfWeek)) {
              console.error(`❌ CRITICAL: Attempted to schedule ${order.orderId} on ${scheduleDayName} ${scheduleDate.toDateString()}`);
              console.error(`   Allowed work days: [${enforcedWorkDays.map((d: number) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}]`);
              throw new Error(`${scheduleDayName} assignment blocked - not in configured work days`);
            }
            
            // Schedule this order
            allocations.push({
              orderId: order.orderId,
              moldId: mold.mold_id,
              moldName: mold.model_name,
              scheduledDate: workDate.toISOString(),
              stockModelId: stockModelId,
              materialPrefix: materialPrefix,
              heavyFill: heavyFill,
              lopAdjustment: lopAdjustment,
              customer: order.customerName || 'Unknown',
              dueDate: order.dueDate || order.orderDate
            });
            
            // Update usage tracking
            dailyMoldUsage.set(moldKey, currentUsage + 1);
            dailyAllocationCount.set(dailyKey, currentDailyCount + 1);
            
            console.log(`✅ Selected mold ${mold.model_name} for ${order.orderId} (${currentUsage + 1}/${mold.multiplier})`);
            scheduled = true;
            break;
          }
        }
      }
      
      if (!scheduled) {
        console.log(`❌ Could not allocate order ${order.orderId} - no mold capacity available in ${scheduleDays} work days (2 weeks limit)`);
      }
    }

    // Calculate success metrics and return results
    const totalProcessed = prioritizedOrders.length;
    const totalScheduled = allocations.length;
    const successRate = totalProcessed > 0 ? (totalScheduled / totalProcessed) * 100 : 0;
    
    // CAPACITY VALIDATION: Verify we didn't exceed limits
    const dailyBreakdown = new Map<string, number>();
    allocations.forEach(allocation => {
      const dateKey = new Date(allocation.scheduledDate).toISOString().split('T')[0];
      dailyBreakdown.set(dateKey, (dailyBreakdown.get(dateKey) || 0) + 1);
    });
    
    console.log(`📊 ALGORITHMIC SCHEDULING RESULTS:`);
    console.log(`📈 Total orders processed: ${totalProcessed}`);
    console.log(`✅ Successfully scheduled: ${totalScheduled}`);
    console.log(`❌ Unable to schedule: ${totalProcessed - totalScheduled}`);
    console.log(`📊 Success rate: ${successRate.toFixed(1)}%`);
    console.log(`🏗️ Work days in schedule: ${workDates.length}`);
    console.log(`👥 Employee daily capacity: ${actualDailyCapacity} orders/day (based on employee rates)`);
    
    console.log(`📅 DAILY CAPACITY VALIDATION:`);
    let totalCapacityViolations = 0;
    dailyBreakdown.forEach((count, dateKey) => {
      const date = new Date(dateKey);
      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
      const isOverCapacity = count > actualDailyCapacity;
      if (isOverCapacity) totalCapacityViolations++;
      console.log(`   ${date.toDateString()} (${dayName}): ${count}/${actualDailyCapacity} orders ${isOverCapacity ? '⚠️ OVER CAPACITY!' : '✅'}`);
    });
    
    if (totalCapacityViolations > 0) {
      console.error(`🚨 CAPACITY VIOLATIONS DETECTED: ${totalCapacityViolations} days exceed daily capacity of ${actualDailyCapacity} orders/day`);
    }
    
    const theoreticalMaxOrders = workDates.length * actualDailyCapacity;
    console.log(`🧮 CAPACITY MATH CHECK: ${workDates.length} work days × ${actualDailyCapacity} capacity = ${theoreticalMaxOrders} max possible orders`);
    
    if (totalScheduled > theoreticalMaxOrders) {
      console.error(`🚨 IMPOSSIBLE SCHEDULE DETECTED: Scheduled ${totalScheduled} orders but theoretical max is ${theoreticalMaxOrders}`);
    }

    // Analyze failed orders
    const unscheduledOrders = prioritizedOrders.slice(totalScheduled);
    if (unscheduledOrders.length > 0) {
      console.log(`❌ First 10 unscheduled orders:`);
      unscheduledOrders.slice(0, 10).forEach(order => {
        console.log(`   - ${order.orderId}: ${order.stockModelId || order.modelId} (Due: ${new Date(order.dueDate || order.orderDate).toDateString()})`);
      });
      
      // Analysis by failure reason
      const noMoldsCount = unscheduledOrders.filter(order => {
        const compatibleMolds = findExactMatchingMolds(order.stockModelId || order.modelId || 'unknown');
        return compatibleMolds.length === 0;
      }).length;
      
      console.log(`🔍 Analysis of unscheduled orders:`);
      console.log(`   - No compatible molds: ${noMoldsCount}`);
      console.log(`   - Other capacity/timing issues: ${unscheduledOrders.length - noMoldsCount}`);
    }

    // Save the algorithmic schedule results to the layup_schedule table
    if (allocations.length > 0) {
      try {
        // Clear existing schedule for the scheduling window to replace with new algorithmic schedule
        const targetWeekStart = new Date(startDate); // Start of scheduling window
        const targetWeekEnd = new Date(workDates[workDates.length - 1]); // End of last work date
        targetWeekEnd.setDate(targetWeekEnd.getDate() + 1); // Include the last day
        
        console.log(`🗑️ Clearing existing schedule from ${targetWeekStart.toISOString()} to ${targetWeekEnd.toISOString()}`);
        
        await pool.query(`
          DELETE FROM layup_schedule 
          WHERE scheduled_date >= $1 AND scheduled_date <= $2
        `, [targetWeekStart.toISOString(), targetWeekEnd.toISOString()]);

        // Get employee assignments (all active employees for now)
        const allEmployees = employeeResult || [];
        const employeeAssignments = allEmployees.map((emp: any) => ({
          id: emp.id || null,
          name: emp.employee_id,
          rate: emp.rate,
          hours: emp.hours,
          isActive: emp.is_active,
          department: emp.department,
          employeeId: emp.employee_id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));

        // Insert new algorithmic schedule into layup_schedule table
        console.log(`📅 Saving ${allocations.length} algorithmic schedule entries to layup_schedule table`);
        
        for (const allocation of allocations) {
          // FIXED: Create specific employee assignment for this order
          const specificEmployeeAssignment = allocation.employeeId ? 
            { [allocation.employeeId]: 1 } : {}; // Assign 1 unit of work to the specific employee
          
          await pool.query(`
            INSERT INTO layup_schedule (
              order_id, scheduled_date, mold_id, employee_assignments,
              is_override, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            allocation.orderId,
            allocation.scheduledDate,
            allocation.moldId,
            JSON.stringify(specificEmployeeAssignment),
            false, // not an override, this is algorithmic
            new Date().toISOString(),
            new Date().toISOString()
          ]);
        }
        
        console.log(`✅ Successfully saved algorithmic schedule to layup_schedule table`);
      } catch (saveError) {
        console.error('⚠️ Error saving algorithmic schedule to database:', saveError);
        // Don't fail the request if save fails, just log it
      }
    }

    res.json({
      success: true,
      allocations: allocations,
      scheduledAllocations: allocations, // Add this for compatibility
      analytics: {
        totalOrders: totalProcessed,
        scheduledOrders: totalScheduled,
        unscheduledOrders: totalProcessed - totalScheduled,
        efficiency: successRate,
        workDays: scheduleDays,
        dailyCapacity: actualDailyCapacity, // Use actual capacity instead of requested
        materialBreakdown: {
          cf: allocations.filter(a => a.materialPrefix === 'cf').length,
          fg: allocations.filter(a => a.materialPrefix === 'fg').length,
          unknown: allocations.filter(a => a.materialPrefix === 'unknown').length
        }
      }
    });

  } catch (error) {
    console.error('🔄 Algorithmic scheduler error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate algorithmic schedule',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;