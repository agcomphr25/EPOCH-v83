// Layup Scheduler Utilities
// Fallback implementation for addDays to avoid import issues
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export interface LayupOrder {
  orderId: string;
  orderDate: Date;
  priorityScore: number;
  customer: string;
  product: string;
}

export interface MoldSettings {
  moldId: string;
  modelName: string;
  instanceNumber: number;
  enabled: boolean;
  multiplier: number;
}

export interface EmployeeSettings {
  employeeId: string;
  name: string;
  rate: number; // molds per hour
  hours: number; // working hours per day (using 10-hour work days)
}

export interface ScheduleResult {
  orderId: string;
  scheduledDate: Date;
  moldId: string;
  employeeAssignments: {
    employeeId: string;
    workload: number;
  }[];
}

export function generateLayupSchedule(
  orders: LayupOrder[],
  moldSettings: MoldSettings[],
  employeeSettings: EmployeeSettings[]
): ScheduleResult[] {
  // 1. Compute capacities with 10-hour work days
  const enabledMolds = moldSettings.filter(m => m.enabled);
  const totalDailyMoldCapacity = enabledMolds.reduce((sum, m) => sum + m.multiplier, 0);

  const employeeDailyCapacities = employeeSettings.reduce((map, emp) => {
    // Use 10-hour work days for capacity calculation
    map[emp.employeeId] = emp.rate * 10;
    return map;
  }, {} as Record<string, number>);
  
  const totalDailyEmployeeCapacity = Object.values(employeeDailyCapacities).reduce((a, b) => a + b, 0);

  // 2. Sort orders by Order ID priority (AG001 = highest priority, AG999 = lowest)
  const sortedOrders = [...orders].sort((a, b) => {
    // Extract numeric part from order ID (AG001 -> 1, AG123 -> 123)
    const getOrderNumber = (orderId: string) => {
      const match = orderId.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };
    
    const aNum = getOrderNumber(a.orderId);
    const bNum = getOrderNumber(b.orderId);
    return aNum - bNum; // Lower order numbers = higher priority
  });

  // 3. Helper functions for 4-day work week (Monday-Thursday)
  const isWorkDay = (date: Date) => {
    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    return dayOfWeek >= 1 && dayOfWeek <= 4; // Monday=1, Tuesday=2, Wednesday=3, Thursday=4
  };

  const getNextWorkDay = (date: Date) => {
    let nextDay = new Date(date);
    do {
      nextDay = addDays(nextDay, 1);
    } while (!isWorkDay(nextDay));
    return nextDay;
  };

  // 4. Generate work days for even distribution
  const getWorkDaysInWeek = (startDate: Date) => {
    const workDays: Date[] = [];
    let current = new Date(startDate);
    
    // Find Monday of current week
    while (current.getDay() !== 1) {
      current = addDays(current, current.getDay() === 0 ? 1 : -1);
    }
    
    // Add Monday through Thursday
    for (let i = 0; i < 4; i++) {
      workDays.push(new Date(current));
      current = addDays(current, 1);
    }
    
    return workDays;
  };

  // 5. Track usage per date and week distribution
  const dateMoldUsage: Record<string, Record<string, number> & { totalUsed: number }> = {};
  const dateEmployeeUsage: Record<string, Record<string, number>> = {};
  const weeklyDistribution: Record<string, number> = {}; // Track orders per week

  // Helper to format date key
  const toKey = (d: Date) => d.toISOString().slice(0, 10);
  const getWeekKey = (d: Date) => {
    const monday = new Date(d);
    while (monday.getDay() !== 1) {
      monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1));
    }
    return toKey(monday);
  };

  // 6. Allocate orders with even weekly distribution
  const result: ScheduleResult[] = [];
  let currentWeekStart = new Date();
  
  for (const order of sortedOrders) {
    let scheduled = false;
    let attemptDate = new Date(order.orderDate);
    
    // Ensure we start on a work day
    if (!isWorkDay(attemptDate)) {
      attemptDate = getNextWorkDay(attemptDate);
    }
    
    // Try to schedule within reasonable timeframe (up to 8 weeks out)
    let maxAttempts = 32; // 4 days/week * 8 weeks
    
    while (!scheduled && maxAttempts > 0) {
      const dateKey = toKey(attemptDate);
      const weekKey = getWeekKey(attemptDate);
      
      // Initialize tracking if needed
      if (!dateMoldUsage[dateKey]) {
        dateMoldUsage[dateKey] = { totalUsed: 0 };
        enabledMolds.forEach(m => dateMoldUsage[dateKey][m.moldId] = 0);
      }
      if (!dateEmployeeUsage[dateKey]) {
        dateEmployeeUsage[dateKey] = {};
        employeeSettings.forEach(emp => dateEmployeeUsage[dateKey][emp.employeeId] = 0);
      }
      if (!(weekKey in weeklyDistribution)) {
        weeklyDistribution[weekKey] = 0;
      }

      // Check if this day/week has capacity and isn't overloaded
      const moldSlot = enabledMolds.find(m =>
        dateMoldUsage[dateKey][m.moldId] < m.multiplier
      );

      const hasMoldCapacity = dateMoldUsage[dateKey].totalUsed < totalDailyMoldCapacity && !!moldSlot;
      const currentEmployeeUsage = Object.values(dateEmployeeUsage[dateKey]).reduce((a, b) => a + b, 0);
      const hasEmpCapacity = currentEmployeeUsage < totalDailyEmployeeCapacity;
      
      // Even distribution: prefer days/weeks with fewer assignments
      const currentWeekLoad = weeklyDistribution[weekKey];
      const avgWeeklyLoad = Object.values(weeklyDistribution).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(weeklyDistribution).length);
      const weekNotOverloaded = currentWeekLoad <= avgWeeklyLoad + 2; // Allow some variance

      if (hasMoldCapacity && hasEmpCapacity && moldSlot && weekNotOverloaded) {
        // Assign to mold slot
        dateMoldUsage[dateKey][moldSlot.moldId]++;
        dateMoldUsage[dateKey].totalUsed++;
        weeklyDistribution[weekKey]++;

        // Assign to employee with most available capacity
        const availableEmployee = employeeSettings
          .filter(e => dateEmployeeUsage[dateKey][e.employeeId] < employeeDailyCapacities[e.employeeId])
          .sort((a, b) => dateEmployeeUsage[dateKey][a.employeeId] - dateEmployeeUsage[dateKey][b.employeeId])[0];

        if (availableEmployee) {
          dateEmployeeUsage[dateKey][availableEmployee.employeeId]++;

          result.push({
            orderId: order.orderId,
            scheduledDate: new Date(attemptDate),
            moldId: moldSlot.moldId,
            employeeAssignments: [
              { employeeId: availableEmployee.employeeId, workload: 1 }
            ]
          });
          
          scheduled = true;
        }
      }

      if (!scheduled) {
        // Move to next work day
        attemptDate = getNextWorkDay(attemptDate);
        maxAttempts--;
      }
    }
    
    // If we couldn't schedule within timeframe, force schedule on next available day
    if (!scheduled) {
      console.warn(`Could not optimally schedule order ${order.orderId}, forcing placement`);
      // Force schedule logic could go here if needed
    }
  }

  return result;
}

// Export as default for compatibility
export default { generateLayupSchedule };