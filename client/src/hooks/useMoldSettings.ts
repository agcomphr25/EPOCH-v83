import { useState, useEffect } from 'react';

import type { Mold, InsertMold } from '../../../shared/schema';

import { apiRequest } from '@/lib/queryClient';

export default function useMoldSettings() {
  const [molds, setMolds] = useState<Mold[]>([]);
  const [loading, setLoading] = useState(true);

  // Debug state changes
  useEffect(() => {
    console.log('🔧 useMoldSettings: Molds state changed:', molds);
  }, [molds]);

  const fetchMolds = async () => {
    try {
      setLoading(true);
      console.log('🔧 useMoldSettings: Fetching molds from /api/molds...');
      const data = await apiRequest('/api/molds');
      console.log('🔧 useMoldSettings: Received molds data:', data);
      console.log(
        '🔧 useMoldSettings: Data type:',
        typeof data,
        'Array?',
        Array.isArray(data)
      );
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
    // Check if mold exists
    const existingMold = molds.find((m) => m.moldId === updatedMold.moldId);

    if (existingMold) {
      // Update existing mold
      const response = await apiRequest(`/api/molds/${updatedMold.moldId}`, {
        method: 'PUT',
        body: updatedMold,
      });

      setMolds((ms) =>
        ms.map((m) =>
          m.moldId === updatedMold.moldId ? { ...m, ...updatedMold } : m
        )
      );
      return response;
    } else {
      // Create new mold
      const newMold = await apiRequest('/api/molds', {
        method: 'POST',
        body: updatedMold,
      });
      setMolds((ms) => [...ms, newMold]);
      return newMold;
    }
  };

  const deleteMold = async (moldId: string) => {
    await apiRequest(`/api/molds/${moldId}`, {
      method: 'DELETE',
    });
    setMolds(molds.filter((m) => m.moldId !== moldId));
  };

  const toggleMoldStatus = async (moldId: string, isActive: boolean) => {
    const mold = molds.find((m) => m.moldId === moldId);
    if (mold) {
      await apiRequest(`/api/molds/${moldId}`, {
        method: 'PUT',
        body: { ...mold, isActive, updatedAt: new Date() },
      });
      setMolds((ms) =>
        ms.map((m) => (m.moldId === moldId ? { ...m, isActive } : m))
      );
    }
  };

  return {
    molds,
    saveMold,
    deleteMold,
    toggleMoldStatus,
    loading,
    refetch: fetchMolds,
  };
}
