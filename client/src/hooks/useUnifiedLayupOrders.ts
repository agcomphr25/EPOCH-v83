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
      return Array.isArray(data) ? data : [];
    },
    select: (data: any[]) => {
      // Simplified, stable select transform
      if (!Array.isArray(data)) {
        console.warn('⚠️ Non-array data received:', typeof data);
        return [];
      }
      console.log(`✅ Processing ${data.length} orders in select transform`);
      return data;
    },
    retry: 3,
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    refetchOnWindowFocus: false, // DISABLED: Prevent auto-refresh when window focus changes  
    refetchOnMount: true,
    refetchInterval: false, // DISABLED: Stop 30-second auto-refresh to prevent continuous reloading
    gcTime: 1000 * 60 * 10 // Keep data in cache for 10 minutes
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

  // More detailed logging for debugging data issues
  console.log('🔧 Final hook return:', {
    ordersReturned: combinedOrders.length,
    isLoading: loading,
    hasError: !!error,
    firstOrderId: combinedOrders[0]?.orderId
  });

  return {
    orders: combinedOrders,
    loading,
    reloadOrders,
    error
  };
}