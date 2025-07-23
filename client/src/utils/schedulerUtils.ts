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
  hours: number; // working hours per day
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
  // 1. Compute capacities
  const enabledMolds = moldSettings.filter(m => m.enabled);
  const totalDailyMoldCapacity = enabledMolds.reduce((sum, m) => sum + m.multiplier, 0);

  const employeeDailyCapacities = employeeSettings.reduce((map, emp) => {
    map[emp.employeeId] = emp.rate * emp.hours;
    return map;
  }, {} as Record<string, number>);
  
  const totalDailyEmployeeCapacity = Object.values(employeeDailyCapacities).reduce((a, b) => a + b, 0);

  // 2. Sort orders by priorityScore ascending (lower score = higher priority)
  const sortedOrders = [...orders].sort((a, b) => a.priorityScore - b.priorityScore);

  // 3. Track usage per date
  const dateMoldUsage: Record<string, Record<string, number> & { totalUsed: number }> = {};
  const dateEmployeeUsage: Record<string, Record<string, number>> = {};

  // Helper to format date key
  const toKey = (d: Date) => d.toISOString().slice(0, 10);

  // 4. Allocate orders to dates
  const result: ScheduleResult[] = sortedOrders.map(order => {
    let dt = new Date(order.orderDate);
    
    while (true) {
      const key = toKey(dt);
      
      // Initialize if needed
      if (!dateMoldUsage[key]) {
        dateMoldUsage[key] = { totalUsed: 0 };
        enabledMolds.forEach(m => dateMoldUsage[key][m.moldId] = 0);
      }
      if (!dateEmployeeUsage[key]) {
        dateEmployeeUsage[key] = {};
        employeeSettings.forEach(emp => dateEmployeeUsage[key][emp.employeeId] = 0);
      }

      // Find available mold slot
      const moldSlot = enabledMolds.find(m =>
        dateMoldUsage[key][m.moldId] < m.multiplier
      );

      const hasMoldCapacity = dateMoldUsage[key].totalUsed < totalDailyMoldCapacity && !!moldSlot;
      const currentEmployeeUsage = Object.values(dateEmployeeUsage[key]).reduce((a, b) => a + b, 0);
      const hasEmpCapacity = currentEmployeeUsage < totalDailyEmployeeCapacity;

      if (hasMoldCapacity && hasEmpCapacity && moldSlot) {
        // Assign to mold slot
        dateMoldUsage[key][moldSlot.moldId]++;
        dateMoldUsage[key].totalUsed++;

        // Assign to first available employee
        const emp = employeeSettings.find(e =>
          dateEmployeeUsage[key][e.employeeId] < employeeDailyCapacities[e.employeeId]
        );

        if (emp) {
          dateEmployeeUsage[key][emp.employeeId]++;

          return {
            orderId: order.orderId,
            scheduledDate: new Date(dt),
            moldId: moldSlot.moldId,
            employeeAssignments: [
              { employeeId: emp.employeeId, workload: 1 }
            ]
          };
        }
      }

      // Move to next day
      dt = addDays(dt, 1);
    }
  });

  return result;
}

// Export as default for compatibility
export default { generateLayupSchedule };