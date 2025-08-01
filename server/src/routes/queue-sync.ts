// Queue synchronization utilities
// Ensures queue fetches from same pool/status as scheduler with real-time updates

import { EventEmitter } from 'events';

// Queue synchronization event emitter
export const queueSyncEmitter = new EventEmitter();

// Event types for queue synchronization
export const QUEUE_EVENTS = {
  SCHEDULE_UPDATED: 'schedule_updated',
  ORDER_STATUS_CHANGED: 'order_status_changed', 
  P1_ORDER_CREATED: 'p1_order_created',
  MESA_UNIVERSAL_SCHEDULED: 'mesa_universal_scheduled'
} as const;

// Queue filter interface to ensure consistency
export interface QueueFilters {
  status?: string[];
  orderType?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  departments?: string[];
  sources?: string[];
}

// Default filters used by both scheduler and queue
export const DEFAULT_QUEUE_FILTERS: QueueFilters = {
  status: ['FINALIZED', 'PENDING'], // Include both regular orders and P1 purchase orders
  orderType: ['regular', 'P1'], // Include both regular and P1 orders
  departments: ['Layup'],
  sources: ['main_orders', 'p1_purchase_order', 'production_order']
};

// Filter validation function
export function validateQueueFilters(orders: any[], filters: QueueFilters = DEFAULT_QUEUE_FILTERS): any[] {
  return orders.filter(order => {
    // Status filter
    if (filters.status && !filters.status.includes(order.status)) {
      return false;
    }
    
    // Order type filter
    if (filters.orderType && order.orderType && !filters.orderType.includes(order.orderType)) {
      return false;
    }
    
    // Department filter
    if (filters.departments && !filters.departments.includes(order.department)) {
      return false;
    }
    
    // Source filter
    if (filters.sources && !filters.sources.includes(order.source)) {
      return false;
    }
    
    // Date range filter (if provided)
    if (filters.dateRange) {
      const orderDate = new Date(order.orderDate);
      const startDate = new Date(filters.dateRange.start);
      const endDate = new Date(filters.dateRange.end);
      
      if (orderDate < startDate || orderDate > endDate) {
        return false;
      }
    }
    
    return true;
  });
}

// Emit queue update event
export function emitQueueUpdate(eventType: string, data: any) {
  console.log(`🔄 Queue sync event: ${eventType}`);
  queueSyncEmitter.emit(eventType, data);
}

// Mesa Universal capacity tracking
export class MesaUniversalCapacityTracker {
  private static instance: MesaUniversalCapacityTracker;
  private dailyScheduled: Map<string, number> = new Map(); // date -> count
  
  static getInstance(): MesaUniversalCapacityTracker {
    if (!MesaUniversalCapacityTracker.instance) {
      MesaUniversalCapacityTracker.instance = new MesaUniversalCapacityTracker();
    }
    return MesaUniversalCapacityTracker.instance;
  }
  
  // Check if date has capacity for Mesa Universal orders (8 per day limit)
  hasCapacity(dateString: string): boolean {
    const scheduled = this.dailyScheduled.get(dateString) || 0;
    return scheduled < 8; // Mesa Universal constraint: 8 orders per day max
  }
  
  // Add scheduled Mesa Universal order
  addScheduled(dateString: string): boolean {
    const current = this.dailyScheduled.get(dateString) || 0;
    if (current >= 8) {
      return false; // Cannot exceed capacity
    }
    
    this.dailyScheduled.set(dateString, current + 1);
    emitQueueUpdate(QUEUE_EVENTS.MESA_UNIVERSAL_SCHEDULED, { 
      date: dateString, 
      count: current + 1 
    });
    return true;
  }
  
  // Remove scheduled Mesa Universal order
  removeScheduled(dateString: string): void {
    const current = this.dailyScheduled.get(dateString) || 0;
    if (current > 0) {
      this.dailyScheduled.set(dateString, current - 1);
    }
  }
  
  // Get current scheduled count for date
  getScheduledCount(dateString: string): number {
    return this.dailyScheduled.get(dateString) || 0;
  }
  
  // Reset all scheduling data
  reset(): void {
    this.dailyScheduled.clear();
  }
}