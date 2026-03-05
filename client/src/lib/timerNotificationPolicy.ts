import type { TimerEvent, TimerEventType } from './timerEvents';

const PREFS_STORAGE_KEY = 'timer_notification_preferences';

export interface TimerNotificationPreferences {
  audibleAlertsEnabled: boolean;
  browserNotificationsEnabled: boolean;
  toastsEnabled: boolean;
  alertVolume: number;
  vibrationEnabled: boolean;
}

const defaultPreferences: TimerNotificationPreferences = {
  audibleAlertsEnabled: true,
  browserNotificationsEnabled: true,
  toastsEnabled: true,
  alertVolume: 0.8,
  vibrationEnabled: true,
};

export function getTimerNotificationPreferences(): TimerNotificationPreferences {
  try {
    const stored = localStorage.getItem(PREFS_STORAGE_KEY);
    if (stored) {
      return { ...defaultPreferences, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to read timer notification preferences:', e);
  }
  return { ...defaultPreferences };
}

export function setTimerNotificationPreferences(prefs: Partial<TimerNotificationPreferences>): TimerNotificationPreferences {
  const current = getTimerNotificationPreferences();
  const updated = { ...current, ...prefs };
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save timer notification preferences:', e);
  }
  return updated;
}

export function shouldPlayAudibleAlert(event: TimerEvent, prefs: TimerNotificationPreferences): boolean {
  if (!prefs.audibleAlertsEnabled) {
    return false;
  }
  return event.eventType === 'step_timeout';
}

export function shouldShowBrowserNotification(event: TimerEvent, prefs: TimerNotificationPreferences): boolean {
  if (!prefs.browserNotificationsEnabled) {
    return false;
  }
  return event.eventType === 'step_timeout';
}

export function shouldStopLoopingAlert(eventType: TimerEventType): boolean {
  return eventType === 'resumed' || eventType === 'advanced' || eventType === 'stopped' || eventType === 'completed';
}

export function shouldShowToast(event: TimerEvent, prefs: TimerNotificationPreferences): boolean {
  if (!prefs.toastsEnabled) {
    return false;
  }
  const toastableEvents: TimerEventType[] = ['started', 'paused', 'resumed', 'step_timeout', 'advanced', 'stopped'];
  return toastableEvents.includes(event.eventType);
}

export function getToastMessage(event: TimerEvent): { title: string; description?: string } | null {
  switch (event.eventType) {
    case 'started':
      return { title: 'Timer started successfully' };
    case 'paused':
      return { title: 'Timer paused' };
    case 'resumed':
      return { title: 'Timer resumed' };
    case 'step_timeout':
      return { title: 'Step time completed!', description: 'Press Next Step to continue' };
    case 'advanced':
      return { title: 'Advanced to next step' };
    case 'stopped':
      return { title: 'Timer stopped' };
    case 'completed':
      return { title: 'Timer completed' };
    default:
      return null;
  }
}
