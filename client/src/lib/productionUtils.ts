import { apiRequest } from "@/lib/queryClient";

// Production Order Types
export interface ProductionOrder {
  id: number;
  orderId: string;
  poId: number;
  poItemId: number;
  customerId: string;
  customerName: string;
  poNumber: string;
  itemType: 'stock_model' | 'custom_model' | 'feature_item';
  itemId: string;
  itemName: string;
  specifications?: any;
  orderDate: string;
  dueDate: string;
  productionStatus: 'PENDING' | 'LAID_UP' | 'SHIPPED';
  laidUpAt?: string;
  shippedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionOrderUpdate {
  productionStatus?: 'PENDING' | 'LAID_UP' | 'SHIPPED';
  laidUpAt?: string;
  shippedAt?: string;
  notes?: string;
}

// Production Order API Functions
export async function fetchProductionOrders(): Promise<ProductionOrder[]> {
  const response = await apiRequest('/api/production-orders');
  return response;
}

export async function updateProductionOrder(id: number, data: ProductionOrderUpdate): Promise<ProductionOrder> {
  const response = await apiRequest(`/api/production-orders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json'
    }
  });
  return response;
}

export async function generateProductionOrdersFromPO(poId: number): Promise<{ success: boolean; message: string; orders: ProductionOrder[] }> {
  const response = await apiRequest(`/api/pos/${poId}/generate-production-orders`, {
    method: 'POST'
  });
  return response;
}

// Helper functions for production tracking
export function getProductionSummary(orders: ProductionOrder[]) {
  const summary = {
    total: orders.length,
    pending: 0,
    laidUp: 0,
    shipped: 0
  };

  orders.forEach(order => {
    switch (order.productionStatus) {
      case 'PENDING':
        summary.pending++;
        break;
      case 'LAID_UP':
        summary.laidUp++;
        break;
      case 'SHIPPED':
        summary.shipped++;
        break;
    }
  });

  return summary;
}

export function getProductionSummaryByPO(orders: ProductionOrder[]) {
  const summaryByPO: Record<string, {
    poNumber: string;
    customerName: string;
    total: number;
    pending: number;
    laidUp: number;
    shipped: number;
    remainingToLayup: number;
    remainingToShip: number;
  }> = {};

  orders.forEach(order => {
    const key = `${order.poId}-${order.poNumber}`;
    
    if (!summaryByPO[key]) {
      summaryByPO[key] = {
        poNumber: order.poNumber,
        customerName: order.customerName,
        total: 0,
        pending: 0,
        laidUp: 0,
        shipped: 0,
        remainingToLayup: 0,
        remainingToShip: 0
      };
    }

    const summary = summaryByPO[key];
    summary.total++;

    switch (order.productionStatus) {
      case 'PENDING':
        summary.pending++;
        break;
      case 'LAID_UP':
        summary.laidUp++;
        break;
      case 'SHIPPED':
        summary.shipped++;
        break;
    }
  });

  // Calculate remaining counts
  Object.values(summaryByPO).forEach(summary => {
    summary.remainingToLayup = summary.pending;
    summary.remainingToShip = summary.pending + summary.laidUp;
  });

  return Object.values(summaryByPO);
}