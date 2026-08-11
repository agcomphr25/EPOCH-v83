import { afterEach, describe, expect, it } from 'vitest';

import { isP2V2ProductionLaunchPreviewEnabled } from '../src/lib/featureFlags';

describe('Production Launch preview feature gate', () => {
  afterEach(() => delete process.env.P2_V2_PRODUCTION_LAUNCH_PREVIEW_ENABLED);

  it.each([undefined, 'false', 'TRUE', ' true ', '1'])(
    'fails closed for %s',
    (value) => {
      if (value === undefined)
        delete process.env.P2_V2_PRODUCTION_LAUNCH_PREVIEW_ENABLED;
      else process.env.P2_V2_PRODUCTION_LAUNCH_PREVIEW_ENABLED = value;
      expect(isP2V2ProductionLaunchPreviewEnabled()).toBe(false);
    }
  );

  it('enables only the exact true value', () => {
    process.env.P2_V2_PRODUCTION_LAUNCH_PREVIEW_ENABLED = 'true';
    expect(isP2V2ProductionLaunchPreviewEnabled()).toBe(true);
  });
});
