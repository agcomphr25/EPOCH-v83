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
        
        // Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4
        if (dayOfWeek >= 1 && dayOfWeek <= 4) {
          workDates.push(new Date(currentDate));
          totalDays++;
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
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

    // Process each order
    for (const order of ordersToProcess) {
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
    const totalProcessed = ordersToProcess.length;
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
    const unscheduledOrders = ordersToProcess.slice(totalScheduled);
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

    res.json({
      success: true,
      allocations: allocations,
      analytics: {
        totalOrders: totalProcessed,
        scheduledOrders: totalScheduled,
        unscheduledOrders: totalProcessed - totalScheduled,
        efficiency: successRate,
        workDays: scheduleDays,
        dailyCapacity: maxOrdersPerDay,
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