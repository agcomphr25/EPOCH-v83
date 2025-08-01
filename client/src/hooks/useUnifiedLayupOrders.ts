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
  const { data: p1Orders = [], isLoading: p1Loading } = useQuery({
    queryKey: ['/api/p1-layup-queue'],
    select: (data: UnifiedLayupOrder[]) => {
      // Performance optimization: Limit processing to first 200 orders for immediate responsiveness
      if (data && data.length > 0) {
        const limitedData = data.slice(0, 200); // Process only first 200 orders
        console.log('⚡ Performance mode: Processing', limitedData.length, 'of', data.length, 'total orders');
        return limitedData;
      }
      return [];
    },
    refetchInterval: false, // Disable automatic refetching completely
    staleTime: 1800000, // 30 minute cache (1.8M ms)
    gcTime: 3600000, // 1 hour garbage collection
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
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