import { afterEach, describe, expect, it } from 'vitest';

import { isP2V2ProductionOrderProvisioningEnabled } from '../src/lib/featureFlags';

describe('P2 V2 production order provisioning feature gate', () => {
  afterEach(
    () => delete process.env.P2_V2_PRODUCTION_ORDER_PROVISIONING_ENABLED
  );

  it.each([undefined, '', 'false', 'TRUE', '1', ' true '])(
    'fails closed for %s',
    (value) => {
      if (value === undefined)
        delete process.env.P2_V2_PRODUCTION_ORDER_PROVISIONING_ENABLED;
      else process.env.P2_V2_PRODUCTION_ORDER_PROVISIONING_ENABLED = value;
      expect(isP2V2ProductionOrderProvisioningEnabled()).toBe(false);
    }
  );

  it('enables only exact lowercase true', () => {
    process.env.P2_V2_PRODUCTION_ORDER_PROVISIONING_ENABLED = 'true';
    expect(isP2V2ProductionOrderProvisioningEnabled()).toBe(true);
  });
});
