export type TimerEventType = 
  | 'started'
  | 'paused'
  | 'resumed'
  | 'step_timeout'
  | 'advanced'
  | 'stopped'
  | 'completed';

export interface TimerEvent {
  eventType: TimerEventType;
  runId: string;
  programName: string;
  stepName?: string;
  stepIndex?: number;
  timestamp: string;
  serialNumber?: string;
  inventoryItemId?: number;
}

type TimerEventListener = (event: TimerEvent) => void;

const listeners: Set<TimerEventListener> = new Set();

export function emitTimerEvent(event: TimerEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.error('[TIMER_EVENT] Listener error:', error);
    }
  });
}

export function subscribeToTimerEvents(listener: TimerEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveListenerCount(): number {
  return listeners.size;
}
