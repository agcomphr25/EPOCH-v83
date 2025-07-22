import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { Mold, InsertMold } from '../../../shared/schema';

export default function useMoldSettings() {
  const [molds, setMolds] = useState<Mold[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMolds = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/api/molds');
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
      // Check if mold exists
      const existingMold = molds.find(m => m.moldId === updatedMold.moldId);
      
      if (existingMold) {
        // Update existing mold
        const response = await apiRequest(`/api/molds/${updatedMold.moldId}`, {
          method: 'PUT',
          body: updatedMold,
        });
        
        setMolds(ms =>
          ms.map(m => (m.moldId === updatedMold.moldId ? { ...m, ...updatedMold } : m))
        );
      } else {
        // Create new mold
        const newMold = await apiRequest('/api/molds', {
          method: 'POST',
          body: updatedMold,
        });
        setMolds(ms => [...ms, newMold]);
      }
    } catch (error) {
      console.error('Failed to save mold:', error);
    }
  };

  const deleteMold = async (moldId: string) => {
    try {
      await apiRequest(`/api/molds/${moldId}`, {
        method: 'DELETE',
      });
      setMolds(molds.filter(m => m.moldId !== moldId));
    } catch (error) {
      console.error('Failed to delete mold:', error);
    }
  };

  const toggleMoldStatus = async (moldId: string, isActive: boolean) => {
    try {
      const mold = molds.find(m => m.moldId === moldId);
      if (mold) {
        await apiRequest(`/api/molds/${moldId}`, {
          method: 'PUT',
          body: { ...mold, isActive, updatedAt: new Date() },
        });
        setMolds(ms =>
          ms.map(m => (m.moldId === moldId ? { ...m, isActive } : m))
        );
      }
    } catch (error) {
      console.error('Failed to toggle mold status:', error);
    }
  };

  return { molds, saveMold, deleteMold, toggleMoldStatus, loading, refetch: fetchMolds };
}