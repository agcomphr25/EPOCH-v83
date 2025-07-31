import { useQuery } from "@tanstack/react-query";

export interface UnifiedLayupOrder {
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
  stockModelId?: string;
  modelId?: string;
  features?: any;
  createdAt: string;
  updatedAt: string;
  poId?: number;
  poItemId?: number;
  productionOrderId?: number;
  specifications?: any;
}

export function useUnifiedLayupOrders() {
  // Get P1 orders (regular orders + P1 purchase order items)
  const { data: p1Orders = [], isLoading: p1Loading } = useQuery({
    queryKey: ['/api/p1-layup-queue'],
    select: (data: UnifiedLayupOrder[]) => data || [],
    refetchInterval: 30000,
  });

  // Get P2 production orders
  const { data: p2Orders = [], isLoading: p2Loading } = useQuery({
    queryKey: ['/api/p2-layup-queue'],
    select: (data: UnifiedLayupOrder[]) => data || [],
    refetchInterval: 15000, // More frequent refresh for production orders
  });

  // Combine all orders and sort by priority
  const combinedOrders = [...p1Orders, ...p2Orders].sort((a, b) => {
    // Lower priority score = higher priority
    return a.priorityScore - b.priorityScore;
  });

  const loading = p1Loading || p2Loading;

  const reloadOrders = () => {
    // This will be handled by React Query's refetch functionality
  };

  return {
    orders: combinedOrders,
    loading,
    reloadOrders
  };
}