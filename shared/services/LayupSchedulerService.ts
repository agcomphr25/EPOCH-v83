import { Order } from '../schema';
import { OrderPriorityService, PriorityOrder, createOrderPriorityService } from './OrderPriorityService';

export interface ScheduledOrder extends PriorityOrder {
  scheduledDay: number; // 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday
  scheduledWeek: string; // ISO week string like "2025-W03"
  moldAssignment?: string;
  employeeAssignment?: string;
  estimatedHours?: number;
}

export interface MoldCapacity {
  moldId: string;
  dailyCapacity: number;
  compatibleStockModels: string[];
}

export interface EmployeeCapacity {
  employeeId: string;
  dailyHours: number;
  availableDays: number[]; // 1-5 for Mon-Fri
}

export interface ScheduleConfig {
  workDays: number[]; // Default: [1, 2, 3, 4] for Mon-Thu
  startDate: Date;
  weeksToSchedule: number;
}

export class LayupSchedulerService {
  private priorityService: OrderPriorityService;
  private config: ScheduleConfig;

  constructor(priorityService?: OrderPriorityService, config?: Partial<ScheduleConfig>) {
    this.priorityService = priorityService || createOrderPriorityService();
    this.config = {
      workDays: [1, 2, 3, 4], // Monday through Thursday
      startDate: new Date(),
      weeksToSchedule: 4,
      ...config,
    };
  }

  /**
   * Main scheduling function - separates concerns clearly
   */
  generateSchedule(
    orders: Order[],
    moldCapacities: MoldCapacity[],
    employeeCapacities: EmployeeCapacity[]
  ): ScheduledOrder[] {
    // Step 1: Prioritize all orders using the dedicated service
    const prioritizedOrders = this.priorityService.sortOrdersByPriority(orders);

    // Step 2: Filter orders that can be scheduled (have valid stock models)
    const schedulableOrders = this.filterSchedulableOrders(prioritizedOrders);

    // Step 3: Generate schedule allocations
    const scheduledOrders = this.allocateOrdersToSchedule(
      schedulableOrders,
      moldCapacities,
      employeeCapacities
    );

    return scheduledOrders;
  }

  /**
   * Filters orders that have valid stock models and can be scheduled
   */
  private filterSchedulableOrders(orders: PriorityOrder[]): PriorityOrder[] {
    return orders.filter(order => {
      // Exclude orders with "None" or empty stock models
      if (!order.stockModelId || order.stockModelId.toLowerCase() === 'none') {
        return false;
      }

      // Include orders in departments that need layup scheduling, or orders without department set
      const validDepartments = ['P1 Production Queue', 'Layup', 'Plugging'];
      const currentDept = order.currentDepartment || '';
      
      // Include if in valid department OR if no department is set (likely unprocessed orders)
      return validDepartments.includes(currentDept) || currentDept === '';
    });
  }

  /**
   * Allocates orders to specific days and weeks
   */
  private allocateOrdersToSchedule(
    orders: PriorityOrder[],
    moldCapacities: MoldCapacity[],
    employeeCapacities: EmployeeCapacity[]
  ): ScheduledOrder[] {
    const scheduledOrders: ScheduledOrder[] = [];
    const capacityTracker = this.initializeCapacityTracker(moldCapacities, employeeCapacities);

    for (const order of orders) {
      const assignment = this.findBestScheduleSlot(order, capacityTracker, moldCapacities, employeeCapacities);
      
      if (assignment) {
        const scheduledOrder: ScheduledOrder = {
          ...order,
          scheduledDay: assignment.day,
          scheduledWeek: assignment.week,
          moldAssignment: assignment.moldId,
          employeeAssignment: assignment.employeeId,
          estimatedHours: assignment.estimatedHours,
        };

        scheduledOrders.push(scheduledOrder);
        this.updateCapacityTracker(capacityTracker, assignment);
      }
    }

    return scheduledOrders;
  }

  /**
   * Finds the best available schedule slot for an order
   */
  private findBestScheduleSlot(
    order: PriorityOrder,
    capacityTracker: any,
    moldCapacities: MoldCapacity[],
    employeeCapacities: EmployeeCapacity[]
  ) {
    // Find compatible molds for this order's stock model
    const compatibleMolds = moldCapacities.filter(mold =>
      mold.compatibleStockModels.includes(order.stockModelId || '')
    );

    if (compatibleMolds.length === 0) {
      return null; // No compatible molds
    }

    // Estimate hours needed for this order
    const estimatedHours = this.estimateOrderHours(order);

    // Try to schedule within work days, starting from current week
    for (let weekOffset = 0; weekOffset < this.config.weeksToSchedule; weekOffset++) {
      const week = this.getWeekString(this.config.startDate, weekOffset);
      
      for (const day of this.config.workDays) {
        for (const mold of compatibleMolds) {
          const availableEmployee = this.findAvailableEmployee(
            day, week, estimatedHours, employeeCapacities, capacityTracker
          );

          if (availableEmployee && this.hasMoldCapacity(mold.moldId, day, week, capacityTracker)) {
            return {
              day,
              week,
              moldId: mold.moldId,
              employeeId: availableEmployee.employeeId,
              estimatedHours,
            };
          }
        }
      }
    }

    return null; // No available slot found
  }

  /**
   * Estimates hours needed for an order based on features and complexity
   */
  private estimateOrderHours(order: PriorityOrder): number {
    let baseHours = 4; // Default base hours

    // Adjust based on order type
    switch (order.orderType) {
      case 'production_order':
        baseHours = 5; // All production orders (including Mesa Universal and PO orders)
        break;
      case 'needs_information':
        baseHours = 0; // Cannot schedule orders that need more information
        break;
      default:
        baseHours = 4;
    }

    // Note: Features field doesn't exist in the Order schema
    // This logic can be added when features are implemented
    // For now, use order type and basic estimation

    return Math.min(baseHours, 8); // Cap at 8 hours per order
  }

  /**
   * Gets available orders by priority level for display purposes
   */
  getOrdersByPriority(orders: Order[]): Record<string, PriorityOrder[]> {
    const prioritizedOrders = this.priorityService.sortOrdersByPriority(orders);
    return this.priorityService.groupOrdersByUrgency(prioritizedOrders);
  }

  /**
   * Gets orders filtered by type (useful for separate PO handling)
   */
  getOrdersByType(orders: Order[], orderType: PriorityOrder['orderType']): PriorityOrder[] {
    const prioritizedOrders = this.priorityService.sortOrdersByPriority(orders);
    return this.priorityService.filterOrdersByType(prioritizedOrders, orderType);
  }

  /**
   * Updates scheduling configuration
   */
  updateConfig(newConfig: Partial<ScheduleConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Updates priority rules
   */
  updatePriorityRules(rules: Parameters<OrderPriorityService['updateRules']>[0]): void {
    this.priorityService.updateRules(rules);
  }

  // Helper methods for internal use
  private initializeCapacityTracker(moldCapacities: MoldCapacity[], employeeCapacities: EmployeeCapacity[]) {
    // Initialize tracking structure for capacity management
    return {
      molds: new Map(),
      employees: new Map(),
    };
  }

  private updateCapacityTracker(tracker: any, assignment: any): void {
    // Update capacity tracking after assignment
    // Implementation would track used capacity per day/week
  }

  private findAvailableEmployee(day: number, week: string, hours: number, employees: EmployeeCapacity[], tracker: any) {
    // Find employee with available capacity
    return employees.find(emp => emp.availableDays.includes(day));
  }

  private hasMoldCapacity(moldId: string, day: number, week: string, tracker: any): boolean {
    // Check if mold has available capacity
    return true; // Simplified for now
  }

  private getWeekString(startDate: Date, weekOffset: number): string {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (weekOffset * 7));
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
}

// Factory function for easy instantiation
export function createLayupSchedulerService(
  priorityService?: OrderPriorityService,
  config?: Partial<ScheduleConfig>
): LayupSchedulerService {
  return new LayupSchedulerService(priorityService, config);
}

// Default instance for common use
export const defaultLayupSchedulerService = createLayupSchedulerService();