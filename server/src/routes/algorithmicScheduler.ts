import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

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
    const employeeResult = await pool.query(`
      SELECT employee_id, rate, hours, is_active 
      FROM employee_layup_settings 
      WHERE is_active = true AND department = 'Layup'
    `);

    // Calculate actual daily employee capacity
    const dbEmployees = employeeResult || [];
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
    const moldsResult = await pool.query(`
      SELECT 
        mold_id,
        model_name,
        stock_models,
        multiplier,
        is_active
      FROM molds 
      WHERE is_active = true
    `);

    const activeMolds = moldsResult || [];
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
        
        // For all other orders, use STRICT exact matching OR universal molds
        const hasMatch = moldStockModels.some((moldModel: string) => {
          const normalizedMoldModel = moldModel.toLowerCase().replace(/[\s\-]/g, '_');
          // Universal molds work with any stock model
          if (normalizedMoldModel === 'universal') {
            return true;
          }
          // Otherwise require exact match
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
        const employees = employeeResult || [];
        const employeeAssignments = employees.map(emp => ({
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
          await pool.query(`
            INSERT INTO layup_schedule (
              order_id, scheduled_date, mold_id, employee_assignments,
              is_override, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            allocation.orderId,
            allocation.scheduledDate,
            allocation.moldId,
            JSON.stringify(employeeAssignments),
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