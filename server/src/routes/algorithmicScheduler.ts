import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

router.post('/generate-algorithmic-schedule', async (req, res) => {
  try {
    const { maxOrdersPerDay = 50, scheduleDays = 60 } = req.body;
    
    console.log(`🚀 Starting algorithmic scheduler with ${maxOrdersPerDay} orders/day over ${scheduleDays} days`);

    // Get unified P1 layup queue including all orders from all_orders + production_orders
    const fetch = (await import('node-fetch')).default;
    const p1QueueResponse = await fetch('http://localhost:5000/api/p1-layup-queue');
    const p1QueueData = await p1QueueResponse.json();
    
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
    const employees = employeeResult || [];
    const totalDailyCapacity = employees.reduce((total: number, emp: any) => {
      return total + (emp.rate * emp.hours);
    }, 0);
    
    console.log(`👥 Found ${employees.length} layup employees with total capacity: ${totalDailyCapacity} parts/day`);
    employees.forEach((emp: any) => {
      const dailyCapacity = emp.rate * emp.hours;
      console.log(`  ${emp.employee_id}: ${emp.rate} parts/hr × ${emp.hours} hrs = ${dailyCapacity} parts/day`);
    });

    // Use actual employee capacity instead of arbitrary maxOrdersPerDay
    const actualDailyCapacity = Math.floor(totalDailyCapacity) || 1;
    console.log(`🎯 Using realistic daily capacity: ${actualDailyCapacity} orders/day (was ${maxOrdersPerDay})`);

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
      return activeMolds.filter((mold: any) => {
        const moldStockModels = mold.stock_models || [];
        return moldStockModels.some((moldModel: string) => {
          const normalizedMoldModel = moldModel.toLowerCase().replace(/[\s\-]/g, '_');
          const normalizedStockModel = stockModelId.toLowerCase().replace(/[\s\-]/g, '_');
          return normalizedMoldModel === normalizedStockModel;
        });
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
          
          // Mesa Universal orders get highest priority (business requirement)
          const stockModelId = order.stockModelId || order.modelId || '';
          if (stockModelId.toLowerCase().includes('mesa_universal') || 
              stockModelId.toLowerCase().includes('mesa universal')) {
            priority += 1000; // Very high priority
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
      console.log(`   ${index + 1}. ${order.orderId}: ${stockModelId}, Due ${dueDate.toDateString()}${isMesaUniversal ? ' [MESA UNIVERSAL - HIGH PRIORITY]' : ''}`);
    });

    // Generate work dates (Monday-Thursday only)
    const generateWorkDates = (startDate: Date, days: number): Date[] => {
      const workDates: Date[] = [];
      let currentDate = new Date(startDate);
      
      // Start from next Monday if today is Friday/weekend
      while (currentDate.getDay() === 0 || currentDate.getDay() === 5 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      let totalDays = 0;
      while (totalDays < days) {
        const dayOfWeek = currentDate.getDay();
        
        // CRITICAL: Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4 - NEVER Friday (5)
        if (dayOfWeek >= 1 && dayOfWeek <= 4) {
          const workDate = new Date(currentDate);
          
          // CRITICAL VALIDATION: Double-check this is not Friday
          if (workDate.getDay() === 5) {
            console.error(`❌ CRITICAL ERROR: Attempted to add Friday ${workDate.toDateString()} to work schedule`);
            console.error(`   Current date: ${currentDate.toDateString()}`);
            console.error(`   Day of week: ${workDate.getDay()} (5=Friday)`);
            throw new Error(`Friday assignment prevented in backend scheduler`);
          }
          
          workDates.push(workDate);
          console.log(`✅ Added work date: ${workDate.toDateString()} (Day ${workDate.getDay()})`);
          totalDays++;
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      console.log(`📅 Generated ${workDates.length} work dates (Monday-Thursday only)`);
      return workDates;
    };

    const workDates = generateWorkDates(new Date(), scheduleDays);
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

      // Try to schedule on each work day
      for (const workDate of workDates) {
        if (scheduled) break;
        
        const dailyKey = workDate.toISOString().split('T')[0];
        const currentDailyCount = dailyAllocationCount.get(dailyKey) || 0;
        
        // Check daily capacity based on actual employee production rates
        if (currentDailyCount >= actualDailyCapacity) {
          continue;
        }

        // Try each compatible mold
        for (const mold of compatibleMolds) {
          const moldKey = `${dailyKey}-${mold.mold_id}`;
          const currentUsage = dailyMoldUsage.get(moldKey) || 0;
          const moldCapacity = mold.multiplier || 1; // Use realistic mold capacity per day

          if (currentUsage < moldCapacity) {
            // CRITICAL VALIDATION: Never allow Friday assignments
            const scheduleDate = new Date(workDate);
            if (scheduleDate.getDay() === 5) {
              console.error(`❌ CRITICAL: Attempted to schedule ${order.orderId} on Friday ${scheduleDate.toDateString()}`);
              console.error(`   Work date: ${workDate.toDateString()}`);
              console.error(`   Schedule date: ${scheduleDate.toDateString()}`);
              console.error(`   Day of week: ${scheduleDate.getDay()}`);
              throw new Error(`Friday assignment blocked for order ${order.orderId}`);
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
        console.log(`❌ Could not allocate order ${order.orderId} - no mold capacity available in ${scheduleDays} work days`);
      }
    }

    // Calculate success metrics and return results
    const totalProcessed = prioritizedOrders.length;
    const totalScheduled = allocations.length;
    const successRate = totalProcessed > 0 ? (totalScheduled / totalProcessed) * 100 : 0;
    
    console.log(`📊 ALGORITHMIC SCHEDULING RESULTS:`);
    console.log(`📈 Total orders processed: ${totalProcessed}`);
    console.log(`✅ Successfully scheduled: ${totalScheduled}`);
    console.log(`❌ Unable to schedule: ${totalProcessed - totalScheduled}`);
    console.log(`📊 Success rate: ${successRate.toFixed(1)}%`);
    console.log(`🏗️ Work days in schedule: ${scheduleDays}`);
    console.log(`👥 Employee daily capacity: ${actualDailyCapacity} orders/day (requested: ${maxOrdersPerDay})`);

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
        // Clear existing schedule for the current week to replace with new algorithmic schedule
        const now = new Date();
        const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1);
        const nextWeekEnd = new Date(currentWeekStart.getTime() + (14 * 24 * 60 * 60 * 1000)); // 2 weeks
        
        console.log(`🗑️ Clearing existing schedule from ${currentWeekStart.toISOString()} to ${nextWeekEnd.toISOString()}`);
        
        await pool.query(`
          DELETE FROM layup_schedule 
          WHERE scheduled_date >= $1 AND scheduled_date <= $2
        `, [currentWeekStart.toISOString(), nextWeekEnd.toISOString()]);

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