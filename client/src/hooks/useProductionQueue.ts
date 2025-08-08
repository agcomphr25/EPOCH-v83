import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';

// Simple order interface for production queue
interface ProductionQueueItem {
  orderId: string;
  orderDate: string;
  dueDate?: string;
  priorityScore?: number;
  status: string;
  customer?: string;
  customerName?: string;
}

export default function useProductionQueue() {
  const [orders, setOrders] = useState<ProductionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      // Fetch finalized orders from the main orders database where department is "Layup"  
      const data = await apiRequest('/api/orders/all');
      
      // Filter for Layup department and FINALIZED status, map to simplified format
      const productionQueueOrders = data
        .filter((order: any) => 
          order.status === 'FINALIZED' && 
          (order.department === 'Layup' || !order.department) // Include orders without department for now
        )
        .map((order: any) => ({
          orderId: order.orderId,
          orderDate: order.createdAt || order.orderDate,
          dueDate: order.dueDate,
          priorityScore: order.priorityScore || 1,
          status: order.status,
          customer: order.customerName || order.customer,
          customerName: order.customerName || order.customer
        }))
        .sort((a: ProductionQueueItem, b: ProductionQueueItem) => {
          // Sort by due date first (most urgent first)
          const dueDateA = new Date(a.dueDate || a.orderDate);
          const dueDateB = new Date(b.dueDate || b.orderDate);
          const dateDiff = dueDateA.getTime() - dueDateB.getTime();
          
          // If due dates are the same, sort by priority score (lower = higher priority)
          if (dateDiff === 0) {
            return (a.priorityScore || 1) - (b.priorityScore || 1);
          }
          
          return dateDiff;
        });
        
      setOrders(productionQueueOrders);
    } catch (error) {
      console.error('Failed to fetch production queue orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  return { orders, loading, reloadOrders: fetchOrders };
}