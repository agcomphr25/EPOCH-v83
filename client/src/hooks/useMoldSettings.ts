import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { Mold, InsertMold } from '../../../shared/schema';

export default function useMoldSettings() {
  const [molds, setMolds] = useState<Mold[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMolds = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/api/molds');
      const data = await response.json();
      setMolds(data);
    } catch (error) {
      console.error('Failed to fetch molds:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMolds();
  }, []);

  const saveMold = async (updatedMold: Partial<Mold> & { moldId: string }) => {
    try {
      const response = await apiRequest(`/api/molds/${updatedMold.moldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedMold),
      });
      
      if (response.ok) {
        setMolds(ms =>
          ms.map(m => (m.moldId === updatedMold.moldId ? { ...m, ...updatedMold } : m))
        );
      }
    } catch (error) {
      console.error('Failed to update mold:', error);
    }
  };

  return { molds, saveMold, loading, refetch: fetchMolds };
}