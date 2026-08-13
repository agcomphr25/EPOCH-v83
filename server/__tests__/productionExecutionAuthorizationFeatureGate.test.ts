import { afterEach, describe, expect, it } from 'vitest';

import { isP2V2ExecutionAuthorizationEnabled } from '../src/lib/featureFlags';

describe('P2 V2 execution authorization feature gate', () => {
  afterEach(() => delete process.env.P2_V2_EXECUTION_AUTHORIZATION_ENABLED);

  it.each([undefined, '', 'false', 'TRUE', '1', ' true '])(
    'fails closed for %s',
    (value) => {
      if (value === undefined)
        delete process.env.P2_V2_EXECUTION_AUTHORIZATION_ENABLED;
      else process.env.P2_V2_EXECUTION_AUTHORIZATION_ENABLED = value;
      expect(isP2V2ExecutionAuthorizationEnabled()).toBe(false);
    }
  );

  it('enables only exact lowercase true', () => {
    process.env.P2_V2_EXECUTION_AUTHORIZATION_ENABLED = 'true';
    expect(isP2V2ExecutionAuthorizationEnabled()).toBe(true);
  });
});
