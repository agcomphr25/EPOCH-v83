export interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface WebSocketMessageDeps {
  dispatchEvent: (event: Event) => void;
  toast: (opts: { title: string; description?: string; duration?: number }) => void;
}

export function handleWebSocketMessage(
  rawData: string,
  deps: WebSocketMessageDeps,
): void {
  let payload: NotificationPayload;
  try {
    payload = JSON.parse(rawData) as NotificationPayload;
  } catch {
    return;
  }

  if (payload.type === 'connected') return;

  if (payload.type === 'ticket_assigned') {
    deps.toast({
      title: payload.title || 'Ticket Assigned',
      description: payload.message,
      duration: 8000,
    });
  } else if (payload.type === 'ticket_unassigned') {
    deps.toast({
      title: payload.title || 'Ticket Update',
      description: payload.message,
      duration: 5000,
    });
  } else if (payload.type === 'forensic_scan_complete') {
    deps.dispatchEvent(new CustomEvent('forensic_scan_complete', { detail: payload.data }));
  } else if (payload.type === 'punch_recorded') {
    deps.dispatchEvent(new CustomEvent('punch_recorded', { detail: payload.data }));
  } else {
    deps.toast({
      title: payload.title || 'Notification',
      description: payload.message,
      duration: 5000,
    });
  }
}
