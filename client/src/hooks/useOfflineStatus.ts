import { useState, useEffect, useCallback } from 'react';
import { db } from '../offline/offlineDB';

interface OfflineStatus {
  isOffline: boolean;
  isSyncing: boolean;
  queuedMutationCount: number;
}

export function useOfflineStatus(): OfflineStatus {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(async () => {
    try {
      const count = await db.mutationQueue
        .where('status')
        .equals('pending')
        .count();
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 3000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  const isSyncing = !isOffline && pendingCount > 0;

  return { isOffline, isSyncing, queuedMutationCount: pendingCount };
}
