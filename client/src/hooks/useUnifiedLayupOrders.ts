import { useQuery } from "@tanstack/react-query";

export interface LayupOrder {
  id: string;
  orderId: string;
  orderDate: string;
  customer: string;
  product: string;
  quantity: number;
  status: string;
  department: string;
  currentDepartment: string;
  priorityScore: number;
  dueDate?: string;
  source: 'main_orders' | 'p1_purchase_order' | 'production_order';
  poId?: number;
  poItemId?: number;
  stockModelId?: string;
  modelId?: string;
  productionOrderId?: number;
  specifications?: any;
  features?: any;
  createdAt: string;
  updatedAt: string;
}

export function useUnifiedLayupOrders() {
  const { data: orders = [], isLoading: loading, refetch: reloadOrders } = useQuery({
    queryKey: ['/api/layup-queue'],
    select: (data: LayupOrder[]) => data || [],
    refetchInterval: 30000, // Refresh every 30 seconds to get new P1 POs
  });

  return {
    orders,
    loading,
    reloadOrders
  };
}