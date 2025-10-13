import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { InventoryItem } from '@shared/schema';

export function useInventory() {
  const { data: inventory = [], isLoading, refetch } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
    queryFn: () => apiRequest('/api/inventory'),
  });

  return { 
    inventory, 
    loading: isLoading, 
    refresh: refetch 
  };
}