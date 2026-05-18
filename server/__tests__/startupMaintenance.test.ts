import { afterEach, describe, expect, it } from 'vitest';
import {
  getLegacyStartupDbMaintenanceSkipMessage,
  shouldRunLegacyStartupDbMaintenance,
} from '../bootstrap/startupMaintenance';

const originalFlag = process.env.RUN_STARTUP_DB_MAINTENANCE;

afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.RUN_STARTUP_DB_MAINTENANCE;
  } else {
    process.env.RUN_STARTUP_DB_MAINTENANCE = originalFlag;
  }
});

describe('startup maintenance flag', () => {
  it('keeps legacy startup DB maintenance disabled by default', () => {
    delete process.env.RUN_STARTUP_DB_MAINTENANCE;

    expect(shouldRunLegacyStartupDbMaintenance()).toBe(false);
  });

  it('requires an explicit truthy flag to run legacy startup DB maintenance', () => {
    process.env.RUN_STARTUP_DB_MAINTENANCE = 'true';

    expect(shouldRunLegacyStartupDbMaintenance()).toBe(true);
  });

  it('points operators to the safe maintenance path when skipped', () => {
    expect(getLegacyStartupDbMaintenanceSkipMessage()).toContain('maintenance:safe-migrations');
  });
});
