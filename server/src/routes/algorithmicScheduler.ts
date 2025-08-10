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

    console.log('🔄 Algorithmic schedule generation requested');
    console.log('📊 Parameters:', { stockModelFilter, maxOrdersPerDay, scheduleDays, priorityWeighting });

    const { storage } = await import('../../storage');

    // Fetch all necessary data
    const [unscheduledOrders, allMolds, employees] = await Promise.all([
      storage.getUnifiedProductionQueue(),
      storage.getAllMolds(),
      storage.getLayupEmployeeSettings()
    ]);

    console.log(`📊 Data loaded: ${unscheduledOrders.length} orders, ${allMolds.length} molds, ${employees.length} employees`);

    // Filter active molds
    const activeMolds = allMolds.filter((mold: any) => mold.enabled);

    // Prepare order data with stock model categorization
    const categorizedOrders = unscheduledOrders.map((order: any) => ({
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

    console.log(`📊 Filtered orders: ${filteredOrders.length} (filter: ${stockModelFilter || 'none'})`);

    // Group orders by stock model
    const stockModelGroups = new Map();
    filteredOrders.forEach((order: any) => {
      const key = order.stockModelId;
      if (!stockModelGroups.has(key)) {
        stockModelGroups.set(key, []);
      }
      stockModelGroups.get(key).push(order);
    });

    // Calculate capacity metrics
    const dailyCapacity = maxOrdersPerDay || Math.min(
      activeMolds.length * 8, // 8 orders per mold per day max
      employees.reduce((sum: any, emp: any) => sum + emp.hours, 0) * 0.5 // 0.5 orders per employee hour
    );

    console.log(`📊 Daily capacity: ${dailyCapacity} orders`);

    // Generate schedule using simplified algorithm
    const allocations: any[] = [];
    const workDates = generateWorkDates(new Date(), scheduleDays || 20);
    
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
      console.log(`🔄 Processing ${stockModelId}: ${orders.length} orders`);
      
      // Find compatible molds
      const compatibleMolds = activeMolds.filter((mold: any) => 
        mold.stockModels.includes(stockModelId) || 
        mold.stockModels.includes('universal') ||
        mold.modelName.toLowerCase().includes(stockModelId.toLowerCase())
      );

      if (compatibleMolds.length === 0) {
        console.log(`⚠️ No compatible molds for ${stockModelId}`);
        continue;
      }

      // Sort orders by priority and due date
      const sortedOrders = orders.sort((a, b) => {
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
          console.log(`⚠️ Could not schedule order ${order.orderId}`);
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

    console.log(`✅ Generated ${allocations.length} allocations with ${efficiency.toFixed(1)}% efficiency`);

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