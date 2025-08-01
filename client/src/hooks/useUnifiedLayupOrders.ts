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
      console.log('🔄 useUnifiedLayupOrders: Raw data received:', data?.length || 0, 'orders');
      console.log('🔄 useUnifiedLayupOrders: Full data array:', data);
      if (data && data.length > 0) {
        const p1PurchaseOrders = data.filter(o => o.source === 'p1_purchase_order');
        const mainOrders = data.filter(o => o.source === 'main_orders');
        const productionOrders = data.filter(o => o.source === 'production_order');
        console.log('🔄 useUnifiedLayupOrders: P1 Purchase orders:', p1PurchaseOrders.length);
        console.log('🔄 useUnifiedLayupOrders: Main orders:', mainOrders.length);
        console.log('🔄 useUnifiedLayupOrders: Production orders:', productionOrders.length);
        
        if (p1PurchaseOrders.length > 0) {
          console.log('🔄 useUnifiedLayupOrders: Sample P1 PO:', {
            orderId: p1PurchaseOrders[0].orderId,
            product: p1PurchaseOrders[0].product,
            stockModelId: p1PurchaseOrders[0].stockModelId,
            source: p1PurchaseOrders[0].source
          });
          console.log('🔄 useUnifiedLayupOrders: First 3 P1 POs:', p1PurchaseOrders.slice(0, 3).map(o => ({
            orderId: o.orderId,
            source: o.source,
            product: o.product
          })));
        } else {
          console.warn('❌ useUnifiedLayupOrders: NO P1 PURCHASE ORDERS FOUND IN DATA!');
        }
        
        // Check for orders that might have Mesa product
        const mesaOrders = data.filter(o => o.product && o.product.includes('Mesa'));
        console.log('🔄 useUnifiedLayupOrders: Mesa orders found:', mesaOrders.length);
        if (mesaOrders.length > 0) {
          console.log('🔄 useUnifiedLayupOrders: Sample Mesa order:', mesaOrders[0]);
        }
      } else {
        console.warn('❌ useUnifiedLayupOrders: NO DATA RECEIVED FROM API!');
      }
      return data || [];
    },
    refetchInterval: 10000, // Even more frequent updates
    staleTime: 1000, // Very short cache time
    gcTime: 5000 // Garbage collect after 5 seconds
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