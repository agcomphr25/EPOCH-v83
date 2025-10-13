
import { useQuery } from "@tanstack/react-query";

export interface P2LayupOrder {
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
  source: 'production_order';
  productionOrderId: number;
  stockModelId?: string;
  specifications?: any;
  createdAt: string;
  updatedAt: string;
}

export function useP2LayupOrders() {
  const { data: orders = [], isLoading: loading, refetch: reloadOrders } = useQuery({
    queryKey: ['/api/p2-layup-queue'],
    select: (data: P2LayupOrder[]) => data || [],
    refetchInterval: 30000, // Refresh every 30 seconds to get new P2 production orders
  });

  return {
    orders,
    loading,
    reloadOrders
  };
}
