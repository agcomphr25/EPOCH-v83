import { describe, expect, it } from 'vitest';
import {
  createInitialDatabaseHealth,
  runDatabaseHealthCheck,
  type DatabaseHealthTarget,
} from '../bootstrap/dbHealth';

const target: DatabaseHealthTarget = {
  source: 'DATABASE_URL',
  host: 'db.example.com',
  database: 'epoch',
  user: 'app',
  redactedUrl: 'postgres://app:***@db.example.com/epoch',
};

describe('db health', () => {
  it('starts in an unknown state', () => {
    expect(createInitialDatabaseHealth(target)).toEqual({
      status: 'unknown',
      checkedAt: null,
      latencyMs: null,
      error: null,
      target,
    });
  });

  it('returns a healthy result when the query succeeds', async () => {
    const result = await runDatabaseHealthCheck(async () => undefined, target, 1000);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('healthy');
    expect(result.error).toBeNull();
    expect(result.target).toEqual(target);
    expect(result.checkedAt).toEqual(expect.any(String));
    expect(result.latencyMs).toEqual(expect.any(Number));
  });

  it('returns an unhealthy result when the query fails', async () => {
    const result = await runDatabaseHealthCheck(
      async () => {
        throw new Error('connection refused');
      },
      target,
      1000,
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('unhealthy');
    expect(result.error).toBe('connection refused');
    expect(result.target).toEqual(target);
  });
});
