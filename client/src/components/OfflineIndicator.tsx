import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, CloudOff } from 'lucide-react';

/**
 * Component to show online/offline status and PWA connectivity
 */
export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowStatus(true);
      // Hide status after 3 seconds
      setTimeout(() => setShowStatus(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowStatus(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Only show when status changes or when offline
  if (!showStatus && isOnline) {
    return null;
  }

  return (
    <Card className="fixed top-20 right-4 z-50 shadow-lg">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <>
              <Wifi className="h-4 w-4 text-green-600" />
              <Badge variant="outline" className="text-green-600 border-green-600">
                Connected
              </Badge>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-red-600" />
              <Badge variant="outline" className="text-red-600 border-red-600">
                Offline Mode
              </Badge>
            </>
          )}
        </div>
        {!isOnline && (
          <p className="text-xs text-gray-600 mt-1">
            <CloudOff className="h-3 w-3 inline mr-1" />
            Working offline with cached data
          </p>
        )}
      </CardContent>
    </Card>
  );
}