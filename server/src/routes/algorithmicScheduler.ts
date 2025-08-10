/**
 * Algorithmic Scheduler API Routes
 * Provides backend endpoints for intelligent order scheduling
 */

import { Router } from 'express';

const router = Router();

// Generate algorithmic schedule endpoint
router.post('/generate-algorithmic-schedule', async (req, res) => {
  try {
    const { 
      stockModelFilter, 
      maxOrdersPerDay, 
      scheduleDays,
      priorityWeighting 
    } = req.body;



    const { storage } = await import('../../storage');

    // Fetch all necessary data using the same approach as P1 layup queue
    const [allOrders, productionOrders, allMolds, employees] = await Promise.all([
      storage.getAllOrders(),
      storage.getAllProductionOrders(),
      storage.getAllMolds(),
      storage.getLayupEmployeeSettings()
    ]);

    // Build unified production queue (same logic as P1 layup queue endpoint)
    const unscheduledOrders = allOrders.filter(order => 
      order.currentDepartment === 'P1 Production Queue'
    );
    
    const mesaOrders = productionOrders.filter(order => 
      order.itemName && order.itemName.includes('Mesa')
    );
    
    // Helper function to calculate priority score
    const calculatePriorityScore = (dueDate: string | Date | null): number => {
      if (!dueDate) return 100;
      const due = new Date(dueDate);
      const now = new Date();
      const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue < 0) return 1;
      if (daysUntilDue <= 7) return 10;
      return 50;
    };
    
    // Combine both order types into unified production queue
    const combinedQueue = [
      ...unscheduledOrders.map((order: any) => ({
        ...order,
        source: 'regular_order',
        priorityScore: calculatePriorityScore(order.dueDate),
        orderId: order.orderId
      })),
      ...mesaOrders.map((order: any) => ({
        ...order,
        source: 'mesa_production_order',
        priorityScore: calculatePriorityScore(order.dueDate),
        orderId: order.orderId,
        features: order.specifications || {},
        product: order.itemName || 'Mesa Universal',
        stockModelId: order.itemName?.includes('Mesa') ? 'mesa_universal' : 'unknown'
      }))
    ];
    
    // Use the combined queue as unscheduledOrders
    const unifiedProductionQueue = combinedQueue;



    // Filter active molds
    const activeMolds = allMolds.filter((mold: any) => mold.enabled);

    // Prepare order data with stock model categorization
    const categorizedOrders = unifiedProductionQueue.map((order: any) => ({
      orderId: order.orderId,
      stockModelId: order.stockModelId || 'universal',
      stockModelName: order.stockModel?.displayName || order.stockModelId,
      dueDate: order.dueDate || order.orderDate,
      priorityScore: order.priorityScore || 1,
      customer: order.customerName || order.customer || 'Unknown',
      orderDate: order.orderDate,
      features: order.features || {},
      product: order.product || order.stockModel?.displayName,
      quantity: order.quantity || 1,
      department: order.department || 'layup',
      status: order.status || 'pending',
      source: order.source || 'production_order'
    }));

    // Apply stock model filter if specified
    const filteredOrders = stockModelFilter 
      ? categorizedOrders.filter((order: any) => 
          order.stockModelId.toLowerCase().includes(stockModelFilter.toLowerCase()) ||
          (order.stockModelName || '').toLowerCase().includes(stockModelFilter.toLowerCase())
        )
      : categorizedOrders;



    // Group orders by stock model
    const stockModelGroups = new Map();
    filteredOrders.forEach((order: any) => {
      const key = order.stockModelId;
      if (!stockModelGroups.has(key)) {
        stockModelGroups.set(key, []);
      }
      stockModelGroups.get(key).push(order);
    });

    // Calculate realistic daily capacity - much higher to fill up the schedule
    const dailyCapacity = maxOrdersPerDay || Math.max(
      30, // Minimum 30 orders per day
      activeMolds.length * 15 // 15 orders per mold per day to fill schedule
    );



    // Generate schedule using simplified algorithm
    const allocations: any[] = [];
    const workDates = generateWorkDates(new Date(), scheduleDays || 60); // More days to spread orders
    
    // Track daily allocations
    const dailyAllocationCount = new Map();
    workDates.forEach(date => {
      dailyAllocationCount.set(date.toISOString().split('T')[0], 0);
    });

    // Process stock models in priority order
    const sortedStockModels = Array.from(stockModelGroups.entries())
      .sort(([, ordersA], [, ordersB]) => {
        // Sort by urgency (most urgent orders first)
        const urgentA = ordersA.filter((o: any) => isUrgent(o.dueDate)).length;
        const urgentB = ordersB.filter((o: any) => isUrgent(o.dueDate)).length;
        return urgentB - urgentA;
      });

    for (const [stockModelId, orders] of sortedStockModels) {

      
      // Find compatible molds with strict matching logic
      const compatibleMolds = activeMolds.filter((mold: any) => {

        
        // MESA UNIVERSAL: Only use Mesa molds, never APR
        if (stockModelId === 'mesa_universal') {
          const isMesaMold = mold.modelName.toLowerCase().includes('mesa') || 
                            mold.moldId.toLowerCase().includes('mesa');

          return isMesaMold;
        }
        
        // UNIVERSAL: Use Mesa molds for universal compatibility
        if (stockModelId === 'universal') {
          const isMesaMold = mold.modelName.toLowerCase().includes('mesa') || 
                            mold.moldId.toLowerCase().includes('mesa');

          return isMesaMold;
        }
        
        // APR orders: Only use APR molds
        if (stockModelId.toLowerCase().includes('apr')) {
          const isAPRMold = mold.modelName.toLowerCase().includes('apr') || 
                           mold.moldId.toLowerCase().includes('apr');

          return isAPRMold;
        }
        
        // CF orders: Only use CF molds
        if (stockModelId.toLowerCase().includes('cf_')) {
          const isCFMold = mold.modelName.toLowerCase().includes('cf') || 
                          mold.moldId.toLowerCase().includes('cf');

          return isCFMold;
        }
        
        // FG orders: Only use FG molds  
        if (stockModelId.toLowerCase().includes('fg_')) {
          const isFGMold = mold.modelName.toLowerCase().includes('fg') || 
                          mold.moldId.toLowerCase().includes('fg');

          return isFGMold;
        }
        
        // Direct stock model match as fallback
        if (mold.stockModels && mold.stockModels.includes(stockModelId)) {

          return true;
        }
        

        return false;
      });



      if (compatibleMolds.length === 0) {

        continue;
      }

      // Sort orders by priority and due date
      const sortedOrders = orders.sort((a: any, b: any) => {
        const dueDateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dueDateDiff === 0) {
          return (a.priorityScore || 1) - (b.priorityScore || 1);
        }
        return dueDateDiff;
      });

      // Allocate orders
      for (const order of sortedOrders) {
        let allocated = false;

        for (const workDate of workDates) {
          const dateKey = workDate.toISOString().split('T')[0];
          const currentAllocations = dailyAllocationCount.get(dateKey) || 0;

          // Allow many more orders per day to fill up the schedule
          if (currentAllocations >= dailyCapacity) {
            continue;
          }

          // Select best mold (round-robin for simplicity)
          const moldIndex = currentAllocations % compatibleMolds.length;
          const selectedMold = compatibleMolds[moldIndex];

          allocations.push({
            orderId: order.orderId,
            moldId: selectedMold.moldId,
            scheduledDate: workDate.toISOString(),
            priorityScore: order.priorityScore || 1,
            stockModelId: order.stockModelId,
            allocationReason: `Auto-scheduled for ${stockModelId}`
          });

          dailyAllocationCount.set(dateKey, currentAllocations + 1);
          allocated = true;
          break;
        }

        if (!allocated) {

        }
      }
    }

    // Generate efficiency analysis
    const efficiency = filteredOrders.length > 0 ? (allocations.length / filteredOrders.length) * 100 : 100;
    
    const moldUtilization: any = {};
    activeMolds.forEach((mold: any) => {
      const usage = allocations.filter((a: any) => a.moldId === mold.moldId).length;
      moldUtilization[mold.moldId] = allocations.length > 0 ? (usage / allocations.length) * 100 : 0;
    });

    // Log scheduling results
    const unscheduledOrdersList = filteredOrders.filter((order: any) => 
      !allocations.some((allocation: any) => allocation.orderId === order.orderId)
    );

    console.log(`\n📊 ALGORITHMIC SCHEDULING RESULTS:`);
    console.log(`📈 Total orders processed: ${filteredOrders.length}`);
    console.log(`✅ Successfully scheduled: ${allocations.length}`);
    console.log(`❌ Unable to schedule: ${unscheduledOrdersList.length}`);
    console.log(`📊 Success rate: ${efficiency.toFixed(1)}%`);
    console.log(`🏗️ Work days in schedule: ${workDates.length}`);
    console.log(`👥 Daily capacity: ${dailyCapacity} orders/day`);
    
    if (unscheduledOrdersList.length > 0) {
      console.log(`\n❌ First 10 unscheduled orders:`);
      unscheduledOrdersList.slice(0, 10).forEach((order: any) => {
        const stockModel = order.stockModel || order.stockModelId;
        console.log(`   - ${order.orderId}: ${stockModel} (Due: ${order.dueDate ? new Date(order.dueDate).toDateString() : 'N/A'})`);
      });
      
      // Analyze reasons
      const moldCompatibilityIssues = unscheduledOrdersList.filter((order: any) => {
        const stockModelId = order.stockModelId?.toLowerCase() || '';
        const compatibleMolds = activeMolds.filter((mold: any) => {
          if (stockModelId.includes('mesa') || stockModelId === 'universal') {
            return mold.modelName.toLowerCase().includes('mesa') || mold.moldId.toLowerCase().includes('mesa');
          }
          if (stockModelId.includes('apr')) {
            return mold.modelName.toLowerCase().includes('apr') || mold.moldId.toLowerCase().includes('apr');
          }
          if (stockModelId.includes('cf_')) {
            return mold.modelName.toLowerCase().includes('cf') || mold.moldId.toLowerCase().includes('cf');
          }
          if (stockModelId.includes('fg_')) {
            return mold.modelName.toLowerCase().includes('fg') || mold.moldId.toLowerCase().includes('fg');
          }
          return mold.stockModels?.includes(order.stockModelId);
        });
        return compatibleMolds.length === 0;
      });
      
      console.log(`\n🔍 Analysis of unscheduled orders:`);
      console.log(`   - No compatible molds: ${moldCompatibilityIssues.length}`);
      console.log(`   - Other capacity/timing issues: ${unscheduledOrdersList.length - moldCompatibilityIssues.length}`);
    }

    res.json({
      success: true,
      allocations,
      analytics: {
        totalOrders: filteredOrders.length,
        scheduledOrders: allocations.length,
        efficiency: efficiency,
        moldUtilization,
        dailyCapacity,
        scheduleDays: workDates.length
      },
      stockModelGroups: Array.from(stockModelGroups.entries()).map(([id, orders]) => ({
        stockModelId: id,
        orderCount: orders.length,
        urgentCount: orders.filter((o: any) => isUrgent(o.dueDate)).length
      }))
    });

  } catch (error) {
    console.error('🔄 Algorithmic scheduler error:', error);
    res.status(500).json({ 
      error: 'Failed to generate algorithmic schedule',
      details: (error as Error).message 
    });
  }
});

// Helper function to generate work dates (Monday-Thursday)
function generateWorkDates(startDate: Date, dayCount: number): Date[] {
  const dates = [];
  let currentDate = new Date(startDate);
  
  // Start from next Monday if today is Friday-Sunday
  while (currentDate.getDay() === 0 || currentDate.getDay() === 5 || currentDate.getDay() === 6) {
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
  }
  
  while (dates.length < dayCount) {
    const dayOfWeek = currentDate.getDay();
    
    // Only Monday (1) through Thursday (4)
    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      dates.push(new Date(currentDate));
    }
    
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    
    // Skip weekend
    if (dayOfWeek === 4) {
      currentDate = new Date(currentDate.getTime() + 4 * 24 * 60 * 60 * 1000);
    }
  }
  
  return dates;
}

// Helper function to check if order is urgent (due within 7 days)
function isUrgent(dueDate: string): boolean {
  const due = new Date(dueDate);
  const now = new Date();
  const daysDiff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 7;
}

export default router;