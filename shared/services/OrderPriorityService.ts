import { Order } from '../schema';

export interface PriorityOrder extends Order {
  priorityScore: number;
  priorityReason: string;
  orderType: 'production_order' | 'needs_information';
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface PriorityRules {
  productionOrderBase: number;
  needsInformationBase: number;
  urgencyBonus: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  dueDateWeight: number;
}

export class OrderPriorityService {
  private rules: PriorityRules;

  constructor(rules?: Partial<PriorityRules>) {
    this.rules = {
      productionOrderBase: 50, // Regular orders and PO orders (including Mesa Universal) are same priority
      needsInformationBase: 99, // Orders lacking required info go to end of queue
      urgencyBonus: {
        critical: -10,
        high: -5,
        medium: 0,
        low: 5,
      },
      dueDateWeight: 0.1,
      ...rules,
    };
  }

  /**
   * Determines the order type based on order properties
   */
  private determineOrderType(order: Order): PriorityOrder['orderType'] {
    // Check if order has sufficient information to be scheduled
    if (!order.stockModelId || 
        order.stockModelId.toLowerCase() === 'none' ||
        order.stockModelId.toLowerCase() === 'unprocessed' ||
        order.stockModelId.toLowerCase() === 'universal') {
      return 'needs_information';
    }

    // All orders with valid stock models are production orders
    // This includes: regular orders, PO orders, Mesa Universal orders
    return 'production_order';
  }

  /**
   * Calculates urgency level based on due date
   */
  private calculateUrgencyLevel(order: Order): PriorityOrder['urgencyLevel'] {
    if (!order.dueDate) return 'low';

    const now = new Date();
    const dueDate = new Date(order.dueDate);
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) return 'critical'; // Overdue
    if (daysUntilDue <= 2) return 'critical';
    if (daysUntilDue <= 5) return 'high';
    if (daysUntilDue <= 10) return 'medium';
    return 'low';
  }

  /**
   * Calculates priority score for a single order
   */
  private calculatePriorityScore(order: Order, orderType: PriorityOrder['orderType'], urgencyLevel: PriorityOrder['urgencyLevel']): number {
    let baseScore: number;

    // Base score by order type
    switch (orderType) {
      case 'production_order':
        baseScore = this.rules.productionOrderBase;
        break;
      case 'needs_information':
        baseScore = this.rules.needsInformationBase;
        break;
      default:
        baseScore = this.rules.productionOrderBase;
        break;
    }

    // Apply urgency bonus (negative numbers = higher priority)
    const urgencyBonus = this.rules.urgencyBonus[urgencyLevel];
    
    // Apply due date weight
    let dueDateAdjustment = 0;
    if (order.dueDate) {
      const now = new Date();
      const dueDate = new Date(order.dueDate);
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      dueDateAdjustment = daysUntilDue * this.rules.dueDateWeight;
    }

    return baseScore + urgencyBonus + dueDateAdjustment;
  }

  /**
   * Generates a human-readable reason for the priority assignment
   */
  private generatePriorityReason(orderType: PriorityOrder['orderType'], urgencyLevel: PriorityOrder['urgencyLevel']): string {
    const typeReasons = {
      production_order: 'Production order (ready for scheduling)',
      needs_information: 'Needs more information to schedule',
    };

    const urgencyReasons = {
      critical: 'critical urgency',
      high: 'high urgency',
      medium: 'medium urgency',
      low: 'low urgency',
    };

    return `${typeReasons[orderType]} - ${urgencyReasons[urgencyLevel]}`;
  }

  /**
   * Assigns priority to a single order
   */
  assignPriority(order: Order): PriorityOrder {
    const orderType = this.determineOrderType(order);
    const urgencyLevel = this.calculateUrgencyLevel(order);
    const priorityScore = this.calculatePriorityScore(order, orderType, urgencyLevel);
    const priorityReason = this.generatePriorityReason(orderType, urgencyLevel);

    return {
      ...order,
      priorityScore,
      priorityReason,
      orderType,
      urgencyLevel,
    };
  }

  /**
   * Sorts a list of orders by priority (lowest score = highest priority)
   */
  sortOrdersByPriority(orders: Order[]): PriorityOrder[] {
    const prioritizedOrders = orders.map(order => this.assignPriority(order));

    return prioritizedOrders.sort((a, b) => {
      // Primary sort: priority score (lower = higher priority)
      if (a.priorityScore !== b.priorityScore) {
        return a.priorityScore - b.priorityScore;
      }

      // Secondary sort: due date (earlier = higher priority)
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }

      // Tertiary sort: order entry time (earlier = higher priority)
      if (a.orderDate && b.orderDate) {
        return new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime();
      }

      // Final sort: order ID
      return (a.orderId || '').localeCompare(b.orderId || '');
    });
  }

  /**
   * Filters orders by type for specialized processing
   */
  filterOrdersByType(orders: PriorityOrder[], orderType: PriorityOrder['orderType']): PriorityOrder[] {
    return orders.filter(order => order.orderType === orderType);
  }

  /**
   * Groups orders by urgency level
   */
  groupOrdersByUrgency(orders: PriorityOrder[]): Record<PriorityOrder['urgencyLevel'], PriorityOrder[]> {
    return orders.reduce((groups, order) => {
      if (!groups[order.urgencyLevel]) {
        groups[order.urgencyLevel] = [];
      }
      groups[order.urgencyLevel].push(order);
      return groups;
    }, {} as Record<PriorityOrder['urgencyLevel'], PriorityOrder[]>);
  }

  /**
   * Updates priority rules (useful for configuration changes)
   */
  updateRules(newRules: Partial<PriorityRules>): void {
    this.rules = { ...this.rules, ...newRules };
  }

  /**
   * Gets current priority rules (useful for debugging)
   */
  getRules(): PriorityRules {
    return { ...this.rules };
  }
}

// Factory function for easy instantiation
export function createOrderPriorityService(rules?: Partial<PriorityRules>): OrderPriorityService {
  return new OrderPriorityService(rules);
}

// Default instance for common use
export const defaultOrderPriorityService = createOrderPriorityService();