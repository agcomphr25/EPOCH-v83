import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export interface RepairOrder {
  orderId: string;
  repairNotes: string;
  repairDepartment: string;
  disposition: string;
}

export function useRepairOrders() {
  // Fetch all nonconformance records
  const { data: nonconformanceRecords = [] } = useQuery<any[]>({
    queryKey: ['/api/nonconformance'],
  });

  // Create a Set of repair order IDs for O(1) lookup performance
  const repairOrderIds = useMemo(() => {
    return new Set(
      (nonconformanceRecords as any[])
        .filter((record: any) => record.disposition === 'Repair')
        .map((record: any) => record.orderId)
    );
  }, [nonconformanceRecords]);

  // Create a Map of repair notes by order ID for O(1) lookup
  const repairNotesMap = useMemo(() => {
    const map = new Map<string, string>();
    (nonconformanceRecords as any[])
      .filter((record: any) => record.disposition === 'Repair')
      .forEach((record: any) => {
        map.set(record.orderId, record.repairNotes || '');
      });
    return map;
  }, [nonconformanceRecords]);

  // Function to check if an order is a repair order
  const isRepairOrder = (orderId: string): boolean => {
    return repairOrderIds.has(orderId);
  };

  // Function to get repair notes for an order
  const getRepairNotes = (orderId: string): string | null => {
    return repairNotesMap.get(orderId) || null;
  };

  return {
    isRepairOrder,
    getRepairNotes,
    repairOrders: Array.from(repairOrderIds),
  };
}
