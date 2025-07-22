import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';

// Simple order interface for layup scheduling
interface LayupOrder {
  orderId: string;
  orderDate: string;
  dueDate?: string;
  priorityScore?: number;
  status: string;
  customer?: string;
  customerName?: string;
}

export default function useLayupOrders() {
  const [orders, setOrders] = useState<LayupOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      // Fetch finalized orders from the main orders database where department is "Layup"  
      const data = await apiRequest('/api/orders/all');
      
      // Filter for Layup department and FINALIZED status, map to simplified format
      const layupOrders = data
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
        }));
        
      setOrders(layupOrders);
    } catch (error) {
      console.error('Failed to fetch layup orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  return { orders, loading, reloadOrders: fetchOrders };
}