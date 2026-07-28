import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { handleWebSocketMessage } from '@/lib/punchNotificationHandlers';
import { waitForServerReady } from '@/lib/serverReadiness';

function getSessionToken(): string | null {
  const fromStorage = localStorage.getItem('sessionToken');
  if (fromStorage) return fromStorage;

  const match = document.cookie.match(/(?:^|;\s*)sessionToken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function useWebSocketNotifications() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttemptsRef = useRef(0);
  const { toast } = useToast();

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      await waitForServerReady();
    } catch {
      reconnectTimeoutRef.current = setTimeout(connect, 10000);
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getSessionToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/ws/notifications${tokenParam}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          handleWebSocketMessage(event.data as string, {
            dispatchEvent: (e) => window.dispatchEvent(e),
            toast,
          });
        } catch {
        }
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        if (event.code === 4001) {
          reconnectTimeoutRef.current = setTimeout(connect, 10000);
          return;
        }
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
      };
    } catch (err) {
    }
  }, [toast]);

  useEffect(() => {
    const initialDelay = setTimeout(connect, 2000);

    return () => {
      clearTimeout(initialDelay);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect]);
}
