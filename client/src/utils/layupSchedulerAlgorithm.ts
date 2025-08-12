/**
 * Algorithmic Layup Scheduler - Intelligent order allocation system
 * Categorizes orders by stock model and allocates based on due date and priority scores
 */

export interface SchedulerOrder {
  orderId: string;
  stockModelId: string;
  stockModelName?: string;
  dueDate: string;
  priorityScore: number;
  customer: string;
  orderDate: string;
  features?: any;
  product?: string;
  quantity?: number;
  department?: string;
  status?: string;
  source?: string;
}

export interface MoldCapacity {
  moldId: string;
  modelName: string;
  stockModels: string[];
  dailyCapacity: number;
  enabled: boolean;
}

export interface EmployeeCapacity {
  employeeId: string;
  name: string;
  dailyHours: number;
  rate: number; // orders per hour
  isActive: boolean;
}

export interface ScheduleAllocation {
  orderId: string;
  moldId: string;
  scheduledDate: string;
  priorityScore: number;
  allocationReason: string;
}

export interface StockModelGroup {
  stockModelId: string;
  orders: SchedulerOrder[];
  totalOrders: number;
  urgentOrders: number; // orders due within 7 days
  averagePriority: number;
}

/**
 * Categorizes orders by stock model with priority analytics
 */
export function categorizeOrdersByStockModel(orders: SchedulerOrder[]): StockModelGroup[] {
  const stockModelGroups = new Map<string, SchedulerOrder[]>();
  
  // Group orders by stock model
  orders.forEach(order => {
    const stockModelId = order.stockModelId || 'unknown';
    if (!stockModelGroups.has(stockModelId)) {
      stockModelGroups.set(stockModelId, []);
    }
    stockModelGroups.get(stockModelId)!.push(order);
  });

  // Convert to structured groups with analytics
  const groups: StockModelGroup[] = [];
  const currentDate = new Date();
  const urgentThreshold = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

  for (const [stockModelId, orderList] of stockModelGroups) {
    const urgentOrders = orderList.filter(order => 
      new Date(order.dueDate) <= urgentThreshold
    ).length;

    const averagePriority = orderList.reduce((sum, order) => 
      sum + (order.priorityScore || 1), 0
    ) / orderList.length;

    groups.push({
      stockModelId,
      orders: orderList.sort((a, b) => {
        // Sort by due date first, then priority score
        const dueDateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dueDateDiff === 0) {
          return (a.priorityScore || 1) - (b.priorityScore || 1);
        }
        return dueDateDiff;
      }),
      totalOrders: orderList.length,
      urgentOrders,
      averagePriority
    });
  }

  // Sort groups by urgency and priority
  return groups.sort((a, b) => {
    // Prioritize groups with urgent orders
    if (a.urgentOrders !== b.urgentOrders) {
      return b.urgentOrders - a.urgentOrders;
    }
    // Then by average priority (lower score = higher priority)
    return a.averagePriority - b.averagePriority;
  });
}

/**
 * Calculates daily capacity for the scheduling period
 */
export function calculateDailyCapacity(
  molds: MoldCapacity[], 
  employees: EmployeeCapacity[]
): number {
  const activeMolds = molds.filter(m => m.enabled);
  const activeEmployees = employees.filter(e => e.isActive);
  
  if (activeMolds.length === 0 || activeEmployees.length === 0) {
    return 0;
  }

  // Calculate theoretical capacity based on molds and employee hours
  const totalEmployeeHours = activeEmployees.reduce((sum, emp) => sum + emp.dailyHours, 0);
  const averageEmployeeRate = activeEmployees.reduce((sum, emp) => sum + emp.rate, 0) / activeEmployees.length;
  
  // Capacity is limited by the number of molds available
  const moldConstrainedCapacity = activeMolds.length * 8; // Assume 8 orders per mold per day max
  const employeeConstrainedCapacity = totalEmployeeHours * averageEmployeeRate;
  
  // Return the limiting factor with a 20% efficiency buffer
  return Math.floor(Math.min(moldConstrainedCapacity, employeeConstrainedCapacity) * 0.8);
}

/**
 * Gets compatible molds for a stock model
 */
export function getCompatibleMolds(stockModelId: string, molds: MoldCapacity[]): MoldCapacity[] {
  return molds.filter(mold => 
    mold.enabled && 
    (mold.stockModels.includes(stockModelId) || mold.stockModels.includes('universal'))
  );
}

/**
 * Generates work dates for Monday-Thursday schedule
 */
export function generateWorkDates(startDate: Date, dayCount: number): Date[] {
  const dates: Date[] = [];
  let currentDate = new Date(startDate);
  
  // Ensure we start on a Monday
  while (currentDate.getDay() !== 1) { // 1 = Monday
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
  }
  
  while (dates.length < dayCount) {
    const dayOfWeek = currentDate.getDay();
    
    // Only add Monday (1) through Thursday (4)
    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      dates.push(new Date(currentDate));
    }
    
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    
    // Skip to next Monday after Thursday
    if (dayOfWeek === 4) { // Thursday
      currentDate = new Date(currentDate.getTime() + 4 * 24 * 60 * 60 * 1000); // Skip to Monday
    }
  }
  
  return dates;
}

/**
 * Main algorithmic scheduler - allocates orders intelligently
 */
export function generateScheduleAllocations(
  orders: SchedulerOrder[],
  molds: MoldCapacity[],
  employees: EmployeeCapacity[],
  targetScheduleDays: number = 20 // 4 weeks of Mon-Thu
): ScheduleAllocation[] {
  console.log('🔄 Starting algorithmic schedule generation...');
  console.log(`📊 Input: ${orders.length} orders, ${molds.length} molds, ${employees.length} employees`);
  
  const allocations: ScheduleAllocation[] = [];
  const stockModelGroups = categorizeOrdersByStockModel(orders);
  const dailyCapacity = calculateDailyCapacity(molds, employees);
  const workDates = generateWorkDates(new Date(), targetScheduleDays);
  
  console.log(`📊 Daily capacity: ${dailyCapacity} orders`);
  console.log(`📊 Stock model groups: ${stockModelGroups.length}`);
  console.log(`📊 Work dates: ${workDates.length} days`);
  
  // Track daily allocations to respect capacity limits
  const dailyAllocations = new Map<string, number>();
  workDates.forEach(date => {
    dailyAllocations.set(date.toISOString().split('T')[0], 0);
  });
  
  // Track mold usage per day to distribute load
  const moldDailyUsage = new Map<string, Map<string, number>>();
  molds.forEach(mold => {
    moldDailyUsage.set(mold.moldId, new Map());
    workDates.forEach(date => {
      moldDailyUsage.get(mold.moldId)!.set(date.toISOString().split('T')[0], 0);
    });
  });
  
  // Process each stock model group in priority order
  for (const group of stockModelGroups) {
    console.log(`🔄 Processing ${group.stockModelId}: ${group.totalOrders} orders (${group.urgentOrders} urgent)`);
    
    const compatibleMolds = getCompatibleMolds(group.stockModelId, molds);
    if (compatibleMolds.length === 0) {
      console.log(`⚠️ No compatible molds found for ${group.stockModelId}`);
      continue;
    }
    
    // Allocate orders from this group
    for (const order of group.orders) {
      let allocated = false;
      
      // Try to schedule on the earliest available date that respects capacity
      for (const workDate of workDates) {
        const dateKey = workDate.toISOString().split('T')[0];
        const currentDayAllocations = dailyAllocations.get(dateKey) || 0;
        
        if (currentDayAllocations >= dailyCapacity) {
          continue; // This day is at capacity
        }
        
        // Find the best mold for this day (least used compatible mold)
        const bestMold = compatibleMolds
          .filter(mold => mold.enabled)
          .sort((a, b) => {
            const usageA = moldDailyUsage.get(a.moldId)?.get(dateKey) || 0;
            const usageB = moldDailyUsage.get(b.moldId)?.get(dateKey) || 0;
            return usageA - usageB;
          })[0];
        
        if (bestMold) {
          // Allocate this order
          allocations.push({
            orderId: order.orderId,
            moldId: bestMold.moldId,
            scheduledDate: workDate.toISOString(),
            priorityScore: order.priorityScore || 1,
            allocationReason: `Stock model: ${group.stockModelId}, Priority: ${order.priorityScore}, Due: ${order.dueDate}`
          });
          
          // Update tracking
          dailyAllocations.set(dateKey, currentDayAllocations + 1);
          const moldUsage = moldDailyUsage.get(bestMold.moldId)!;
          moldUsage.set(dateKey, (moldUsage.get(dateKey) || 0) + 1);
          
          allocated = true;
          break;
        }
      }
      
      if (!allocated) {
        console.log(`⚠️ Could not allocate order ${order.orderId} within schedule window`);
      }
    }
  }
  
  console.log(`✅ Algorithm complete: ${allocations.length} orders allocated`);
  
  return allocations.sort((a, b) => 
    new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
  );
}

/**
 * Analyzes the current schedule and provides recommendations
 */
export function analyzeScheduleEfficiency(
  allocations: ScheduleAllocation[],
  orders: SchedulerOrder[],
  molds: MoldCapacity[]
): {
  efficiency: number;
  moldUtilization: { [moldId: string]: number };
  recommendations: string[];
} {
  const totalOrders = orders.length;
  const scheduledOrders = allocations.length;
  const efficiency = totalOrders > 0 ? (scheduledOrders / totalOrders) * 100 : 0;
  
  // Calculate mold utilization
  const moldUtilization: { [moldId: string]: number } = {};
  const moldUsageCounts: { [moldId: string]: number } = {};
  
  molds.forEach(mold => {
    moldUsageCounts[mold.moldId] = 0;
  });
  
  allocations.forEach(allocation => {
    moldUsageCounts[allocation.moldId] = (moldUsageCounts[allocation.moldId] || 0) + 1;
  });
  
  const maxPossibleUsage = allocations.length / molds.filter(m => m.enabled).length;
  molds.forEach(mold => {
    const usage = moldUsageCounts[mold.moldId] || 0;
    moldUtilization[mold.moldId] = maxPossibleUsage > 0 ? (usage / maxPossibleUsage) * 100 : 0;
  });
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  if (efficiency < 80) {
    recommendations.push('Consider increasing daily capacity or extending schedule window');
  }
  
  const underutilizedMolds = Object.entries(moldUtilization)
    .filter(([_, utilization]) => utilization < 50)
    .map(([moldId]) => moldId);
  
  if (underutilizedMolds.length > 0) {
    recommendations.push(`Underutilized molds: ${underutilizedMolds.join(', ')}`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Schedule is well-optimized');
  }
  
  return {
    efficiency,
    moldUtilization,
    recommendations
  };
}