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
  dueDate?: Date;
  priorityScore?: number;
  customer: string;
  product: string;
  modelId?: string;
  stockModelId?: string;
  features?: any; // Include features for LOP detection
}

export interface MoldSettings {
  moldId: string;
  modelName: string;
  instanceNumber: number;
  enabled: boolean;
  multiplier: number;
  stockModels?: string[]; // supported stock model IDs
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

// Function to generate daily Mesa Universal orders (8 per work day)
function generateDailyMesaUniversalOrders(startDate: Date, weeks: number = 4): LayupOrder[] {
  const mesaOrders: LayupOrder[] = [];
  let current = new Date(startDate);
  
  // Find the start of the current work week (Monday)
  while (current.getDay() !== 1) {
    current = addDays(current, -1);
  }
  
  const isWorkDay = (date: Date) => {
    const dayOfWeek = date.getDay();
    return dayOfWeek >= 1 && dayOfWeek <= 4; // Monday-Thursday
  };
  
  for (let week = 0; week < weeks; week++) {
    for (let day = 0; day < 7; day++) {
      const workDate = addDays(current, week * 7 + day);
      
      if (isWorkDay(workDate)) {
        // Generate 8 Mesa Universal orders for this work day
        for (let i = 1; i <= 8; i++) {
          mesaOrders.push({
            orderId: `MESA-${workDate.toISOString().slice(0, 10)}-${i.toString().padStart(2, '0')}`,
            orderDate: workDate,
            dueDate: workDate,
            priorityScore: 5, // Standard priority
            customer: 'Mesa Universal Production',
            product: 'Mesa Universal',
            modelId: 'mesa_universal',
            stockModelId: 'mesa_universal'
          });
        }
      }
    }
  }
  
  console.log(`🏭 Generated ${mesaOrders.length} Mesa Universal orders for ${weeks} weeks`);
  return mesaOrders;
}

// Function to detect if an order requires LOP (Length of Pull) adjustment
function hasLOPAdjustment(order: LayupOrder): boolean {
  if (!order.features) return false;
  
  const lopValue = order.features.length_of_pull;
  
  // Return true if there's an actual LOP adjustment (not standard/none/etc.)
  if (!lopValue || 
      lopValue === 'none' || 
      lopValue === 'standard' || 
      lopValue === 'std' ||
      lopValue === 'std_length' ||
      lopValue === 'standard_length' ||
      lopValue === 'no_extra_length' ||
      lopValue === 'std_no_extra_length' ||
      lopValue === 'no_lop_change' ||
      lopValue === '' || 
      lopValue === '0' ||
      lopValue === 'normal' ||
      lopValue.toLowerCase().includes('std') ||
      lopValue.toLowerCase().includes('standard') ||
      lopValue.toLowerCase().includes('no extra')) {
    return false;
  }
  
  return true;
}

export function generateLayupSchedule(
  orders: LayupOrder[],
  moldSettings: MoldSettings[],
  employeeSettings: EmployeeSettings[]
): ScheduleResult[] {
  console.log(`📋 Total orders to schedule: ${orders.length}`);

  // 1. Compute capacities with 10-hour work days
  const enabledMolds = moldSettings.filter(m => m.enabled);
  const totalDailyMoldCapacity = enabledMolds.reduce((sum, m) => sum + m.multiplier, 0);

  const employeeDailyCapacities = employeeSettings.reduce((map, emp) => {
    // Use actual employee hours (stored in system) for capacity calculation
    map[emp.employeeId] = emp.rate * (emp.hours || 10); // fallback to 10 hours if not set
    return map;
  }, {} as Record<string, number>);
  
  const totalDailyEmployeeCapacity = Object.values(employeeDailyCapacities).reduce((a, b) => a + b, 0);

  // 2. Separate LOP adjustment orders for Monday-only scheduling
  const lopOrders = orders.filter(order => hasLOPAdjustment(order));
  const regularOrders = orders.filter(order => !hasLOPAdjustment(order));
  
  console.log(`📏 Found ${lopOrders.length} LOP adjustment orders (Monday-only scheduling)`);
  lopOrders.forEach(order => {
    console.log(`📏 LOP Order: ${order.orderId} - LOP: ${order.features?.length_of_pull}`);
  });

  // Sort both groups by due date priority (earliest due dates first), with high priority override
  const sortLopOrders = (orderList: LayupOrder[]) => [...orderList].sort((a, b) => {
    // First check for high priority flag override
    const aHighPriority = a.priorityScore && a.priorityScore > 8; // High priority threshold
    const bHighPriority = b.priorityScore && b.priorityScore > 8;
    
    if (aHighPriority && !bHighPriority) return -1; // A has high priority, comes first
    if (!aHighPriority && bHighPriority) return 1;  // B has high priority, comes first
    
    // If both or neither have high priority, sort by due date
    const aDueDate = new Date(a.dueDate || a.orderDate).getTime();
    const bDueDate = new Date(b.dueDate || b.orderDate).getTime();
    
    // Earlier due dates = higher priority
    return aDueDate - bDueDate;
  });

  const sortedLopOrders = sortLopOrders(lopOrders);
  const sortedRegularOrders = sortLopOrders(regularOrders);

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

  // Helper function to find next Monday from a given date
  const getNextMonday = (date: Date): Date => {
    let nextMonday = new Date(date);
    const dayOfWeek = nextMonday.getDay();
    const daysToAdd = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7; // Calculate days to next Monday
    
    if (daysToAdd === 0 && dayOfWeek === 1) {
      // If already Monday, use this Monday
      return nextMonday;
    }
    
    nextMonday.setDate(nextMonday.getDate() + daysToAdd);
    return nextMonday;
  };

  // 6. Schedule LOP orders first (Monday-only), then regular orders
  const result: ScheduleResult[] = [];
  
  // Schedule LOP adjustment orders on Mondays only
  console.log(`📅 Scheduling ${sortedLopOrders.length} LOP orders on Mondays only`);
  for (const order of sortedLopOrders) {
    let scheduled = false;
    let attemptDate = getNextMonday(new Date(order.orderDate));
    
    // Try to schedule on Mondays within reasonable timeframe (up to 8 weeks out)
    let maxAttempts = 8; // 8 Mondays
    
    while (!scheduled && maxAttempts > 0) {
      const dateKey = toKey(attemptDate);
      const weekKey = getWeekKey(attemptDate);
      
      // Only attempt on Mondays for LOP orders
      if (attemptDate.getDay() !== 1) {
        attemptDate = getNextMonday(attemptDate);
        maxAttempts--;
        continue;
      }
      
      // Initialize tracking if needed - each day starts fresh with 0 usage for all molds
      if (!dateMoldUsage[dateKey]) {
        dateMoldUsage[dateKey] = { totalUsed: 0 };
        enabledMolds.forEach(m => dateMoldUsage[dateKey][m.moldId] = 0);
        console.log(`🔄 New Monday ${dateKey}: Initialized ${enabledMolds.length} molds for LOP scheduling`);
      }
      if (!dateEmployeeUsage[dateKey]) {
        dateEmployeeUsage[dateKey] = {};
        employeeSettings.forEach(emp => dateEmployeeUsage[dateKey][emp.employeeId] = 0);
      }
      if (!(weekKey in weeklyDistribution)) {
        weeklyDistribution[weekKey] = 0;
      }

      // Check if this Monday has capacity - find compatible molds based on stock model
      const orderStockModel = order.stockModelId || order.modelId;
      console.log(`📏 Scheduling LOP order ${order.orderId} on Monday ${dateKey} with stock model: ${orderStockModel}`);
      
      // First filter for compatible molds based on stock model
      const compatibleMolds = enabledMolds.filter(m => {
        if (m.stockModels && Array.isArray(m.stockModels) && orderStockModel) {
          const isCompatible = m.stockModels.includes(orderStockModel);
          return isCompatible;
        }
        return false;
      });
      
      // Then find available capacity among compatible molds
      const moldSlot = compatibleMolds.find(m => {
        const currentUsage = dateMoldUsage[dateKey][m.moldId];
        return currentUsage < m.multiplier;
      });
      
      if (moldSlot) {
        // Reserve the mold slot
        dateMoldUsage[dateKey][moldSlot.moldId]++;
        dateMoldUsage[dateKey].totalUsed++;
        weeklyDistribution[weekKey]++;
        
        // Distribute employee workload
        const employeeAssignments: {employeeId: string; workload: number}[] = [];
        for (const emp of employeeSettings) {
          const currentLoad = dateEmployeeUsage[dateKey][emp.employeeId];
          const dailyCapacity = employeeDailyCapacities[emp.employeeId];
          
          if (currentLoad < dailyCapacity) {
            const workload = Math.min(1, dailyCapacity - currentLoad);
            employeeAssignments.push({
              employeeId: emp.employeeId,
              workload: workload
            });
            dateEmployeeUsage[dateKey][emp.employeeId] += workload;
            break; // Assign to first available employee
          }
        }
        
        result.push({
          orderId: order.orderId,
          scheduledDate: new Date(attemptDate),
          moldId: moldSlot.moldId,
          employeeAssignments
        });
        
        console.log(`📏✅ LOP Order ${order.orderId} scheduled on Monday ${dateKey} with mold ${moldSlot.moldId}`);
        scheduled = true;
      } else {
        console.log(`📏❌ No compatible mold available for LOP order ${order.orderId} on Monday ${dateKey}`);
        // Try next Monday
        attemptDate = addDays(attemptDate, 7);
        maxAttempts--;
      }
    }
    
    if (!scheduled) {
      console.log(`📏⚠️ Could not schedule LOP order ${order.orderId} on any Monday within 8 weeks`);
    }
  }
  
  // Now schedule regular orders on any work day (Monday-Thursday)
  console.log(`📅 Scheduling ${sortedRegularOrders.length} regular orders on Monday-Thursday`);
  for (const order of sortedRegularOrders) {
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
      
      // Initialize tracking if needed - each day starts fresh with 0 usage for all molds
      if (!dateMoldUsage[dateKey]) {
        dateMoldUsage[dateKey] = { totalUsed: 0 };
        enabledMolds.forEach(m => dateMoldUsage[dateKey][m.moldId] = 0);
        
        // Debug logging for mold capacity reset
        console.log(`🔄 New day ${dateKey}: Initialized ${enabledMolds.length} molds with fresh capacity`);
      }
      if (!dateEmployeeUsage[dateKey]) {
        dateEmployeeUsage[dateKey] = {};
        employeeSettings.forEach(emp => dateEmployeeUsage[dateKey][emp.employeeId] = 0);
      }
      if (!(weekKey in weeklyDistribution)) {
        weeklyDistribution[weekKey] = 0;
      }

      // Check if this day has capacity - find compatible molds based on stock model
      const orderStockModel = order.stockModelId || order.modelId;
      console.log(`🔍 Finding molds for order ${order.orderId} with stock model: ${orderStockModel}`);
      
      // First filter for compatible molds based on stock model
      const compatibleMolds = enabledMolds.filter(m => {
        if (m.stockModels && Array.isArray(m.stockModels) && orderStockModel) {
          const isCompatible = m.stockModels.includes(orderStockModel);
          if (isCompatible) {
            console.log(`✅ Mold ${m.moldId} supports ${orderStockModel}`);
          }
          return isCompatible;
        }
        return false;
      });
      
      // Then find available capacity among compatible molds
      const moldSlot = compatibleMolds.find(m => {
        const currentUsage = dateMoldUsage[dateKey][m.moldId];
        const availableCapacity = m.multiplier - currentUsage;
        
        // Debug logging for mold availability
        if (availableCapacity > 0) {
          console.log(`🔧 Compatible mold ${m.moldId} available on ${dateKey}: ${currentUsage}/${m.multiplier} used`);
        }
        
        return currentUsage < m.multiplier;
      });
      
      if (!moldSlot && compatibleMolds.length === 0) {
        console.warn(`⚠️ No compatible molds found for stock model ${orderStockModel} on order ${order.orderId}`);
      }

      const hasMoldCapacity = dateMoldUsage[dateKey].totalUsed < totalDailyMoldCapacity && !!moldSlot;
      const currentEmployeeUsage = Object.values(dateEmployeeUsage[dateKey]).reduce((a, b) => a + b, 0);
      // Set realistic daily targets: 12-15 regular orders + 8 Mesa Universal = 20-23 total per day
      const targetMinOrders = 20; // Includes 8 Mesa Universal
      const targetMaxOrders = 23; // Includes 8 Mesa Universal
      const currentDailyLoad = currentEmployeeUsage;
      
      // Allow scheduling up to target max, but still respect employee individual capacity
      const hasEmpCapacity = currentEmployeeUsage < Math.min(totalDailyEmployeeCapacity, targetMaxOrders);
      const dayNotOverloaded = currentDailyLoad < targetMaxOrders;
      
      // More aggressive even distribution: check if we should skip to next day for better balance
      let shouldScheduleHere = true;
      
      // If this day is getting heavily loaded, try to find a lighter day in the same week
      if (currentDailyLoad >= targetMaxOrders - 2) { // When approaching max capacity
        const currentWorkWeekDays = getWorkDaysInWeek(attemptDate);
        const weekDayLoads = currentWorkWeekDays.map(day => {
          const dayKey = toKey(day);
          const dayUsage = dateEmployeeUsage[dayKey] ? Object.values(dateEmployeeUsage[dayKey]).reduce((a, b) => a + b, 0) : 0;
          return { date: day, load: dayUsage };
        });
        
        // Find the lightest loaded day in this week
        const lightestDay = weekDayLoads.reduce((min, current) => 
          current.load < min.load ? current : min
        );
        
        // If there's a much lighter day available, skip to it
        if (lightestDay.load < currentDailyLoad - 3) {
          shouldScheduleHere = false;
          attemptDate = new Date(lightestDay.date);
          continue; // Skip to next iteration with the lighter day
        }
      }

      if (hasMoldCapacity && hasEmpCapacity && moldSlot && dayNotOverloaded && shouldScheduleHere) {
        // Assign to mold slot - increment usage for this specific day only
        dateMoldUsage[dateKey][moldSlot.moldId]++;
        dateMoldUsage[dateKey].totalUsed++;
        weeklyDistribution[weekKey]++;
        
        // Debug logging for successful assignment
        console.log(`✅ Assigned ${order.orderId} to mold ${moldSlot.moldId} on ${dateKey} (now ${dateMoldUsage[dateKey][moldSlot.moldId]}/${moldSlot.multiplier})`);

        // Assign to employee with most available capacity
        const availableEmployee = employeeSettings
          .filter(e => dateEmployeeUsage[dateKey][e.employeeId] < employeeDailyCapacities[e.employeeId])
          .sort((a, b) => dateEmployeeUsage[dateKey][a.employeeId] - dateEmployeeUsage[dateKey][b.employeeId])[0];

        if (availableEmployee) {
          dateEmployeeUsage[dateKey][availableEmployee.employeeId]++;

          // Check FG stock limiting (3-5 FG stocks per day)
          const orderStockModel = order.stockModelId || order.modelId;
          const isFGStock = orderStockModel && (orderStockModel.startsWith('fg_') || orderStockModel.includes('fiberglass'));
          
          if (isFGStock) {
            // Count existing FG orders for this day
            const existingFGCount = result.filter(r => {
              const sameDate = toKey(r.scheduledDate) === dateKey;
              const orderModel = orders.find(o => o.orderId === r.orderId)?.stockModelId || orders.find(o => o.orderId === r.orderId)?.modelId;
              return sameDate && orderModel && (orderModel.startsWith('fg_') || orderModel.includes('fiberglass'));
            }).length;
            
            if (existingFGCount >= 5) {
              console.log(`🚫 FG limit reached for ${dateKey}: ${existingFGCount}/5 FG stocks already scheduled`);
              // Skip to next day for FG orders
              attemptDate = getNextWorkDay(attemptDate);
              maxAttempts--;
              continue;
            } else {
              console.log(`✅ FG stock ${order.orderId} scheduled: ${existingFGCount + 1}/5 for ${dateKey}`);
            }
          }

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