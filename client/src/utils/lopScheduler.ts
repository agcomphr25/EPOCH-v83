import { LayupOrder } from '@shared/schema';

interface LOPOrder extends Omit<LayupOrder, 'priority'> {
  needsLOPAdjustment: boolean;
  priority: number;
  priorityChangedAt: Date | null;
  lastScheduledLOPAdjustmentDate: Date | null;
  scheduledLOPAdjustmentDate: Date | null;
  lopAdjustmentOverrideReason: string | null;
}

function todayIsMonday(date: Date = new Date()): boolean {
  return date.getDay() === 1; // Monday is 1 (Sunday is 0)
}

function nextMonday(fromDate: Date = new Date()): Date {
  const day = fromDate.getDay();
  // Days until next Monday: if today is Sunday (0), next Monday is 1 day. 
  // If today is Monday (1), next Monday is 7 days, etc.
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const result = new Date(fromDate);
  result.setDate(result.getDate() + daysUntilMonday);
  return result;
}

// Main LOP scheduling function - call this daily or on order updates
export function scheduleLOPAdjustments(orders: LOPOrder[]): LOPOrder[] {
  const today = new Date();
  const updatedOrders = [...orders];

  for (const order of updatedOrders) {
    if (!order.needsLOPAdjustment) continue;

    let priorityEscalated = false;
    if (order.priorityChangedAt) {
      // Priority has changed since last LOP scheduling
      priorityEscalated = !order.lastScheduledLOPAdjustmentDate ||
        order.priorityChangedAt > order.lastScheduledLOPAdjustmentDate;
    }

    if (todayIsMonday(today) || priorityEscalated) {
      order.scheduledLOPAdjustmentDate = today;
      order.lopAdjustmentOverrideReason = todayIsMonday(today)
        ? "Scheduled for Monday"
        : "Priority escalation";
    } else {
      order.scheduledLOPAdjustmentDate = nextMonday(today);
      order.lopAdjustmentOverrideReason = "Deferred for Monday";
    }

    // Update last scheduled date for future comparisons
    order.lastScheduledLOPAdjustmentDate = today;

    console.log(
      `Order ${order.orderId}: LOP scheduled for ${order.scheduledLOPAdjustmentDate?.toDateString()} (${order.lopAdjustmentOverrideReason})`
    );
  }

  return updatedOrders;
}

// Helper function to identify orders needing LOP adjustment
export function identifyLOPOrders(orders: LayupOrder[]): LOPOrder[] {
  return orders.map(order => ({
    ...order,
    needsLOPAdjustment: order.needsLOPAdjustment ?? false,
    priority: order.priority ?? 50,
    priorityChangedAt: order.priorityChangedAt || null,
    lastScheduledLOPAdjustmentDate: order.lastScheduledLOPAdjustmentDate || null,
    scheduledLOPAdjustmentDate: order.scheduledLOPAdjustmentDate || null,
    lopAdjustmentOverrideReason: order.lopAdjustmentOverrideReason || null,
  }));
}

// Function to update order priority and trigger LOP rescheduling
export function updateOrderPriority(
  orders: LOPOrder[], 
  orderId: string, 
  newPriority: number
): LOPOrder[] {
  const updatedOrders = orders.map(order => {
    if (order.orderId === orderId) {
      return {
        ...order,
        priority: newPriority,
        priorityChangedAt: new Date(),
        needsLOPAdjustment: true // Mark for LOP adjustment
      };
    }
    return order;
  });

  // Automatically reschedule LOP adjustments after priority change
  return scheduleLOPAdjustments(updatedOrders);
}

// Check if an order needs immediate LOP attention
export function needsImmediateLOPAttention(order: LOPOrder): boolean {
  if (!order.needsLOPAdjustment) return false;
  
  const today = new Date();
  
  // If scheduled for today and not yet processed
  if (order.scheduledLOPAdjustmentDate && 
      order.scheduledLOPAdjustmentDate.toDateString() === today.toDateString()) {
    return true;
  }
  
  // If priority was recently escalated
  if (order.priorityChangedAt && 
      order.priorityChangedAt > (order.lastScheduledLOPAdjustmentDate || new Date(0))) {
    return true;
  }
  
  return false;
}

// Get LOP status for display
export function getLOPStatus(order: LOPOrder): {
  status: 'none' | 'scheduled' | 'immediate' | 'deferred';
  message: string;
  color: string;
} {
  if (!order.needsLOPAdjustment) {
    return {
      status: 'none',
      message: 'No LOP adjustment needed',
      color: 'text-gray-500'
    };
  }

  if (needsImmediateLOPAttention(order)) {
    return {
      status: 'immediate',
      message: 'Immediate LOP attention required',
      color: 'text-red-600'
    };
  }

  if (order.scheduledLOPAdjustmentDate) {
    const scheduleDate = order.scheduledLOPAdjustmentDate.toDateString();
    return {
      status: 'scheduled',
      message: `LOP scheduled for ${scheduleDate}`,
      color: 'text-orange-600'
    };
  }

  return {
    status: 'deferred',
    message: 'LOP adjustment deferred',
    color: 'text-yellow-600'
  };
}