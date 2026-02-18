import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  timestamp: string;
}

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

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
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
          const payload: NotificationPayload = JSON.parse(event.data);

          if (payload.type === 'connected') return;

          if (payload.type === 'ticket_assigned') {
            toast({
              title: payload.title || 'Ticket Assigned',
              description: payload.message,
              duration: 8000,
            });
          } else if (payload.type === 'ticket_unassigned') {
            toast({
              title: payload.title || 'Ticket Update',
              description: payload.message,
              duration: 5000,
            });
          } else {
            toast({
              title: payload.title || 'Notification',
              description: payload.message,
              duration: 5000,
            });
          }
        } catch (err) {
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
