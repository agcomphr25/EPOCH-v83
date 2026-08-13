import { afterEach, describe, expect, it } from 'vitest';

import { isP2V2TravelerProvisioningEnabled } from '../src/lib/featureFlags';

describe('P2 traveler provisioning feature gate', () => {
  afterEach(() => delete process.env.P2_V2_TRAVELER_PROVISIONING_ENABLED);

  for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
    it(`is disabled for ${String(value)}`, () => {
      if (value === undefined)
        delete process.env.P2_V2_TRAVELER_PROVISIONING_ENABLED;
      else process.env.P2_V2_TRAVELER_PROVISIONING_ENABLED = value;
      expect(isP2V2TravelerProvisioningEnabled()).toBe(false);
    });
  }

  it('is enabled only by exact lowercase true', () => {
    process.env.P2_V2_TRAVELER_PROVISIONING_ENABLED = 'true';
    expect(isP2V2TravelerProvisioningEnabled()).toBe(true);
  });
});
