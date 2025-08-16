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
    select: (data: any) => {
      console.log('🔧 RAW API RESPONSE:', {
        dataType: typeof data,
        isArray: Array.isArray(data),
        length: data?.length || 0,
        hasData: !!data,
        firstItem: data?.[0],
        keys: data ? Object.keys(data) : 'no data'
      });
      
      if (!data) {
        console.error('❌ No data received from API');
        return [];
      }
      
      if (!Array.isArray(data)) {
        console.error('❌ Data is not an array:', typeof data, data);
        return [];
      }
      
      console.log(`✅ Successfully loaded ${data.length} orders from API`);
      return data;
    },
    retry: 3,
    refetchInterval: 5 * 60 * 1000, // Reduced to 5 minutes instead of 30 seconds
    staleTime: 2 * 60 * 1000, // Consider data fresh for 2 minutes
    refetchOnWindowFocus: false, // Don't refetch when user returns to tab
    refetchOnMount: true, // Only refetch when component mounts
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