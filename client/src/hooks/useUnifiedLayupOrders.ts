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
  // Get P1 orders only (regular orders + P1 purchase order items)
  // P2 orders are now handled separately in P2LayupScheduler
  const { data: p1Orders = [], isLoading: p1Loading, error } = useQuery({
    queryKey: ['/api/p1-layup-queue'],
    select: (data: UnifiedLayupOrder[]) => {
      console.log('🔧 useUnifiedLayupOrders select function:', {
        dataType: typeof data,
        isArray: Array.isArray(data),
        length: data?.length || 0,
        hasData: !!data
      });
      return data || [];
    },
    refetchInterval: 30000,
  });

  console.log('🔧 useUnifiedLayupOrders hook state:', {
    p1OrdersCount: p1Orders?.length || 0,
    loading: p1Loading,
    error: error,
    hasData: !!p1Orders
  });

  // Only P1 orders now - P2 orders excluded from unified scheduler
  const combinedOrders = [...p1Orders].sort((a, b) => {
    // Lower priority score = higher priority
    return a.priorityScore - b.priorityScore;
  });

  const loading = p1Loading;

  const reloadOrders = () => {
    // This will be handled by React Query's refetch functionality
  };

  return {
    orders: combinedOrders,
    loading,
    reloadOrders
  };
}