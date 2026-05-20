import { describe, expect, it } from 'vitest';
import {
  buildPgPoolConfig,
  getDbHealthcheckTimeoutMs,
  shouldUseSsl,
} from '../bootstrap/dbPoolConfig';

describe('db pool config', () => {
  it('uses bounded pool and timeout defaults', () => {
    const config = buildPgPoolConfig('postgres://user:pass@db.example.com/app', {});

    expect(config.max).toBe(10);
    expect(config.idleTimeoutMillis).toBe(30_000);
    expect(config.connectionTimeoutMillis).toBe(10_000);
    expect(config.query_timeout).toBe(60_000);
    expect(config.statement_timeout).toBe(60_000);
  });

  it('enables ssl by default for non-local database hosts', () => {
    const config = buildPgPoolConfig('postgres://user:pass@db.example.com/app', {});

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('does not force ssl for local database hosts', () => {
    expect(shouldUseSsl('postgres://user:pass@localhost/app', {})).toBe(false);
    expect(shouldUseSsl('postgres://user:pass@127.0.0.1/app', {})).toBe(false);
  });

  it('allows ssl and pool settings to be overridden by environment', () => {
    const config = buildPgPoolConfig('postgres://user:pass@db.example.com/app', {
      DB_POOL_MAX: '4',
      DB_POOL_IDLE_TIMEOUT_MS: '5000',
      DB_POOL_CONNECTION_TIMEOUT_MS: '3000',
      DB_QUERY_TIMEOUT_MS: '45000',
      DB_STATEMENT_TIMEOUT_MS: '40000',
      DB_SSL: 'false',
    });

    expect(config.max).toBe(4);
    expect(config.idleTimeoutMillis).toBe(5_000);
    expect(config.connectionTimeoutMillis).toBe(3_000);
    expect(config.query_timeout).toBe(45_000);
    expect(config.statement_timeout).toBe(40_000);
    expect(config.ssl).toBe(false);
  });

  it('uses a shorter DB healthcheck timeout by default', () => {
    expect(getDbHealthcheckTimeoutMs({})).toBe(10_000);
    expect(getDbHealthcheckTimeoutMs({ DB_HEALTHCHECK_TIMEOUT_MS: '2500' })).toBe(2_500);
  });
});
