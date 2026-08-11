import { afterEach, describe, expect, it } from 'vitest';

import { isP2V2ProductionLaunchPersistenceEnabled } from '../src/lib/featureFlags';

describe('Production Launch persistence feature gate', () => {
  afterEach(
    () => delete process.env.P2_V2_PRODUCTION_LAUNCH_PERSISTENCE_ENABLED
  );

  it.each([undefined, '', 'false', 'TRUE', '1'])(
    'is disabled for %s',
    (value) => {
      if (value === undefined)
        delete process.env.P2_V2_PRODUCTION_LAUNCH_PERSISTENCE_ENABLED;
      else process.env.P2_V2_PRODUCTION_LAUNCH_PERSISTENCE_ENABLED = value;
      expect(isP2V2ProductionLaunchPersistenceEnabled()).toBe(false);
    }
  );

  it('enables only for the exact server-side value true', () => {
    process.env.P2_V2_PRODUCTION_LAUNCH_PERSISTENCE_ENABLED = 'true';
    expect(isP2V2ProductionLaunchPersistenceEnabled()).toBe(true);
  });
});
