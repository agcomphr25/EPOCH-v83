import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { LayupOrder } from '../../../shared/schema';

export default function useLayupOrders() {
  const [orders, setOrders] = useState<LayupOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/api/layup-orders?status=FINALIZED');
      const data = await response.json();
      setOrders(data);
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