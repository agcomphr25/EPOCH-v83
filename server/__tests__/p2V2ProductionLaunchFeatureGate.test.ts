import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db', () => ({
  db: { transaction: mocks.transaction },
  pool: {},
}));
vi.mock('../src/services/auditLedgerService', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { isP2V2ProductionLaunchEnabled } from '../src/lib/featureFlags';
import {
  launchProduction,
  ProjectPreproductionError,
} from '../src/services/projectPreproductionReadinessService';

const actor = {
  userId: 7,
  username: 'quality.manager',
  displayName: 'Quality Manager',
  role: 'QUALITY_MANAGER',
};

describe('P2 V2 Production Launch feature gate', () => {
  afterEach(() => {
    delete process.env.P2_V2_PRODUCTION_LAUNCH_ENABLED;
    mocks.transaction.mockReset();
    mocks.recordAuditEvent.mockClear();
  });

  it.each([
    ['missing', undefined],
    ['explicit false', 'false'],
    ['malformed', 'enabled'],
    ['unknown', '1'],
    ['whitespace-wrapped true', ' true '],
    ['uppercase true', 'TRUE'],
    ['mixed-case true', 'True'],
  ])('fails closed when configuration is %s', async (_label, value) => {
    if (value === undefined) {
      delete process.env.P2_V2_PRODUCTION_LAUNCH_ENABLED;
    } else {
      process.env.P2_V2_PRODUCTION_LAUNCH_ENABLED = value;
    }

    expect(isP2V2ProductionLaunchEnabled()).toBe(false);
    await expect(
      launchProduction('project-1', 'request-key-123', actor)
    ).rejects.toMatchObject<ProjectPreproductionError>({
      code: 'P2_V2_PRODUCTION_LAUNCH_DISABLED',
      status: 503,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'P2_V2_PRODUCTION_LAUNCH_BLOCKED',
        subjectId: 'project-1',
      })
    );
    expect(mocks.recordAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'P2_V2_PRODUCTION_LAUNCHED',
      }),
      expect.anything()
    );
  });

  it('enables only the exact true configuration', () => {
    process.env.P2_V2_PRODUCTION_LAUNCH_ENABLED = 'true';
    expect(isP2V2ProductionLaunchEnabled()).toBe(true);
  });
});
