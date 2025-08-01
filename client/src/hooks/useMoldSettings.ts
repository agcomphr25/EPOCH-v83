import { useState, useEffect, useMemo } from 'react';
import { apiRequest } from '@/lib/queryClient';
import type { Mold, InsertMold } from '../../../shared/schema';

export default function useMoldSettings() {
  const [molds, setMolds] = useState<Mold[]>([]);
  const [loading, setLoading] = useState(true);

  // Memoize expensive calculations
  const enabledMolds = useMemo(() => molds.filter(m => m.enabled), [molds]);
  const activeMolds = useMemo(() => molds.filter(m => m.isActive), [molds]);

  // Debug state changes only when count changes significantly
  useEffect(() => {
    if (molds.length > 0) {
      console.log('🔧 useMoldSettings: Molds loaded:', molds.length);
    }
  }, [molds.length]);

  const fetchMolds = async () => {
    try {
      setLoading(true);
      console.log('🔧 useMoldSettings: Fetching molds from /api/molds...');
      const data = await apiRequest('/api/molds');
      console.log('🔧 useMoldSettings: Received molds data:', data);
      console.log('🔧 useMoldSettings: Data type:', typeof data, 'Array?', Array.isArray(data));
      setMolds(data);
      console.log('🔧 useMoldSettings: Set molds state to:', data);
    } catch (error) {
      console.error('🔧 useMoldSettings: Failed to fetch molds:', error);
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
        // Create new mold with better error handling
        const newMold = await apiRequest('/api/molds', {
          method: 'POST',
          body: updatedMold,
        });
        setMolds(ms => [...ms, newMold]);
      }
    } catch (error: any) {
      console.error('Failed to save mold:', error);
      // Re-throw the error with better context for the UI
      if (error?.response?.status === 409) {
        const err = new Error(`Mold ${updatedMold.moldId} already exists`);
        (err as any).response = { status: 409 };
        throw err;
      }
      throw error;
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

  return { 
    molds, 
    enabledMolds, 
    activeMolds, 
    saveMold, 
    deleteMold, 
    toggleMoldStatus, 
    loading, 
    refetch: fetchMolds 
  };
}