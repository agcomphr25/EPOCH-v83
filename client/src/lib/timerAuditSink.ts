import type { TimerEvent } from './timerEvents';
import { subscribeToTimerEvents } from './timerEvents';

const AUDIT_STORAGE_KEY = 'timer_audit_log';
const MAX_STORED_EVENTS = 500;

let auditSubscription: (() => void) | null = null;

export function captureAuditEvent(event: TimerEvent): void {
  console.info('[TIMER_EVENT]', JSON.stringify(event));
  
  try {
    const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
    const events: TimerEvent[] = stored ? JSON.parse(stored) : [];
    
    events.push(event);
    
    while (events.length > MAX_STORED_EVENTS) {
      events.shift();
    }
    
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(events));
  } catch (e) {
    console.error('[TIMER_EVENT] Failed to store audit event:', e);
  }
}

export function getAuditLog(): TimerEvent[] {
  try {
    const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('[TIMER_EVENT] Failed to read audit log:', e);
    return [];
  }
}

export function clearAuditLog(): void {
  try {
    localStorage.removeItem(AUDIT_STORAGE_KEY);
  } catch (e) {
    console.error('[TIMER_EVENT] Failed to clear audit log:', e);
  }
}

export function initAuditSink(): () => void {
  if (auditSubscription) {
    return auditSubscription;
  }
  
  auditSubscription = subscribeToTimerEvents(captureAuditEvent);
  return auditSubscription;
}
