import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

export default function OfflineIndicator() {
  const { isOffline, isSyncing, queuedMutationCount } = useOfflineStatus();

  if (!isOffline && !isSyncing) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-green-700">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <Wifi className="h-3 w-3" />
        <span className="hidden sm:inline">Online</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-50 border border-yellow-200 text-xs text-yellow-800">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
        </span>
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span className="hidden sm:inline">Syncing changes...</span>
        {queuedMutationCount > 0 && (
          <span className="font-medium">({queuedMutationCount})</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 border border-red-200 text-xs text-red-800">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <WifiOff className="h-3 w-3" />
      <span className="hidden sm:inline">Offline Mode — Changes will sync automatically</span>
      {queuedMutationCount > 0 && (
        <span className="font-medium">({queuedMutationCount})</span>
      )}
    </div>
  );
}
