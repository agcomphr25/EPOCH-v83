import { afterEach, describe, expect, it } from 'vitest';
import {
  areBackgroundJobsEnabled,
  areHighImpactJobsEnabled,
  areOutboundNotificationsEnabled,
  shouldRunBackgroundJob,
} from '../config/backgroundJobControls';

const original = {
  BACKGROUND_JOBS_ENABLED: process.env.BACKGROUND_JOBS_ENABLED,
  OUTBOUND_NOTIFICATIONS_ENABLED: process.env.OUTBOUND_NOTIFICATIONS_ENABLED,
  HIGH_IMPACT_JOBS_ENABLED: process.env.HIGH_IMPACT_JOBS_ENABLED,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('background job controls', () => {
  it('preserves existing behavior when no switches are configured', () => {
    delete process.env.BACKGROUND_JOBS_ENABLED;
    delete process.env.OUTBOUND_NOTIFICATIONS_ENABLED;
    delete process.env.HIGH_IMPACT_JOBS_ENABLED;

    expect(areBackgroundJobsEnabled()).toBe(true);
    expect(areOutboundNotificationsEnabled()).toBe(true);
    expect(areHighImpactJobsEnabled()).toBe(true);
  });

  it('uses the master switch to disable every category', () => {
    process.env.BACKGROUND_JOBS_ENABLED = 'false';
    process.env.OUTBOUND_NOTIFICATIONS_ENABLED = 'true';
    process.env.HIGH_IMPACT_JOBS_ENABLED = 'true';

    expect(shouldRunBackgroundJob('standard')).toBe(false);
    expect(shouldRunBackgroundJob('outbound')).toBe(false);
    expect(shouldRunBackgroundJob('high-impact')).toBe(false);
  });

  it('allows standard jobs while independently pausing outbound and high-impact jobs', () => {
    process.env.BACKGROUND_JOBS_ENABLED = 'true';
    process.env.OUTBOUND_NOTIFICATIONS_ENABLED = 'off';
    process.env.HIGH_IMPACT_JOBS_ENABLED = '0';

    expect(shouldRunBackgroundJob('standard')).toBe(true);
    expect(shouldRunBackgroundJob('outbound')).toBe(false);
    expect(shouldRunBackgroundJob('high-impact')).toBe(false);
  });
});
