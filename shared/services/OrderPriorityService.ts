import { Order } from '../schema';

export interface PriorityOrder extends Order {
  priorityScore: number;
  priorityReason: string;
  orderType: 'mesa_universal' | 'production_order' | 'regular_order' | 'po_order';
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface PriorityRules {
  mesaUniversalBase: number;
  productionOrderBase: number;
  regularOrderBase: number;
  poOrderBase: number;
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
      mesaUniversalBase: 10,
      productionOrderBase: 20,
      regularOrderBase: 50,
      poOrderBase: 30,
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
    // Mesa Universal orders (highest priority)
    if (order.stockModelId?.toLowerCase().includes('mesa universal')) {
      return 'mesa_universal';
    }

    // Production orders (from manufacturing pipeline)
    if (order.currentDepartment === 'Production' || order.poId) {
      return 'production_order';
    }

    // PO orders (purchase orders)
    if (order.poId || order.orderId?.startsWith('PO-')) {
      return 'po_order';
    }

    // Regular orders
    return 'regular_order';
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
      case 'mesa_universal':
        baseScore = this.rules.mesaUniversalBase;
        break;
      case 'production_order':
        baseScore = this.rules.productionOrderBase;
        break;
      case 'po_order':
        baseScore = this.rules.poOrderBase;
        break;
      case 'regular_order':
        baseScore = this.rules.regularOrderBase;
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
      mesa_universal: 'Mesa Universal (highest priority)',
      production_order: 'Production order',
      po_order: 'Purchase order',
      regular_order: 'Regular order',
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