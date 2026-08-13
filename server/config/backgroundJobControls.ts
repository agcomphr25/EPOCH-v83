export type BackgroundJobCategory = 'standard' | 'outbound' | 'high-impact';

function envFlag(name: string, defaultValue = true): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return defaultValue;
  return !['0', 'false', 'no', 'off', 'disabled'].includes(raw.trim().toLowerCase());
}

export function areBackgroundJobsEnabled(): boolean {
  return envFlag('BACKGROUND_JOBS_ENABLED');
}

export function areOutboundNotificationsEnabled(): boolean {
  return areBackgroundJobsEnabled() && envFlag('OUTBOUND_NOTIFICATIONS_ENABLED');
}

export function areHighImpactJobsEnabled(): boolean {
  return areBackgroundJobsEnabled() && envFlag('HIGH_IMPACT_JOBS_ENABLED');
}

export function shouldRunBackgroundJob(category: BackgroundJobCategory = 'standard'): boolean {
  if (!areBackgroundJobsEnabled()) return false;
  if (category === 'outbound') return areOutboundNotificationsEnabled();
  if (category === 'high-impact') return areHighImpactJobsEnabled();
  return true;
}

export function logBackgroundJobControls(): void {
  console.log('[BackgroundJobs] controls', {
    backgroundJobsEnabled: areBackgroundJobsEnabled(),
    outboundNotificationsEnabled: areOutboundNotificationsEnabled(),
    highImpactJobsEnabled: areHighImpactJobsEnabled(),
  });
}
