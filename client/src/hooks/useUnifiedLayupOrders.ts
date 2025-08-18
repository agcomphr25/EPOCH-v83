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
    queryFn: async () => {
      console.log('🚀 Making direct API call to /api/p1-layup-queue');
      const response = await fetch('/api/p1-layup-queue');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('🎯 Direct API response:', {
        status: response.status,
        length: data?.length,
        firstItem: data?.[0]?.orderId
      });
      return data;
    },
    select: (data: any) => {
      console.log('🔧 RAW API RESPONSE:', {
        dataType: typeof data,
        isArray: Array.isArray(data),
        length: data?.length || 0,
        hasData: !!data,
        firstItem: data?.[0],
        keys: data ? Object.keys(data) : 'no data',
        fullResponse: data
      });
      
      if (!data) {
        console.error('❌ No data received from API - data is falsy');
        return [];
      }
      
      if (!Array.isArray(data)) {
        console.error('❌ Data is not an array:', typeof data, data);
        return [];
      }
      
      console.log(`✅ Successfully loaded ${data.length} orders from API`);
      if (data.length > 0) {
        console.log('✅ Sample order data:', data[0]);
      }
      return data;
    },
    retry: 1,
    refetchInterval: false, // Disable automatic refetching for debugging
    staleTime: 0, // Always consider data stale for debugging
    refetchOnWindowFocus: false,
    refetchOnMount: true
  });

  console.log('🔧 useUnifiedLayupOrders hook state:', {
    p1OrdersCount: p1Orders?.length || 0,
    loading: p1Loading,
    error: error,
    hasData: !!p1Orders,
    p1OrdersFirst3: p1Orders?.slice(0, 3)
  });

  if (error) {
    console.error('❌ API Error in useUnifiedLayupOrders:', error);
  }

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