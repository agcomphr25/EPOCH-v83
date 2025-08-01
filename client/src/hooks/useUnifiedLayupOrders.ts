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
      // Reduced logging to improve performance
      if (data && data.length > 0) {
        console.log('📊 useUnifiedLayupOrders: Loaded', data.length, 'orders');
        const sourceCounts = data.reduce((acc, o) => {
          acc[o.source] = (acc[o.source] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.log('📊 Order sources:', sourceCounts);
      }
      return data || [];
    },
    refetchInterval: 300000, // 5 minutes instead of 10 seconds
    staleTime: 600000, // 10 minute cache instead of 1 second
    gcTime: 900000 // 15 minute garbage collection
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