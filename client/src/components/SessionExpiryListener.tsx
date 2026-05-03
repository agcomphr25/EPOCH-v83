import { useEffect } from 'react';

import { useToast } from '@/hooks/use-toast';

/**
 * SessionExpiryListener
 *
 * Listens for the `session:expired` custom event dispatched by queryClient.ts
 * whenever a 401/403 confirms that the user's session has ended.
 * Shows a clear toast notification before the redirect fires.
 *
 * Mount this component once inside the QueryClientProvider tree so it can
 * call useToast(). It renders nothing.
 */
export default function SessionExpiryListener() {
  const { toast } = useToast();

  useEffect(() => {
    function handleSessionExpired(event: Event) {
      const detail = (event as CustomEvent).detail as { reason?: string } | undefined;
      const isUnauthorized = detail?.reason === 'unauthorized';

      console.warn('[AUTH] session:expired event received — showing toast');

      toast({
        title: isUnauthorized
          ? 'Access denied'
          : 'Your session has expired',
        description: isUnauthorized
          ? 'You do not have permission to access this resource. Redirecting to login…'
          : 'Please log in again to continue. Redirecting to login…',
        variant: 'destructive',
        duration: 5000,
      });
    }

    window.addEventListener('session:expired', handleSessionExpired);
    return () => window.removeEventListener('session:expired', handleSessionExpired);
  }, [toast]);

  return null;
}
