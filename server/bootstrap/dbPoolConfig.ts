import type { PoolConfig } from 'pg';

type Env = Record<string, string | undefined>;

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (['1', 'true', 'yes', 'require'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'disable'].includes(normalized)) return false;
  return fallback;
}

function isLocalDatabaseHost(hostname: string | null) {
  if (!hostname) return false;
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

export function shouldUseSsl(connectionString: string, env: Env = process.env) {
  const explicitSsl = env.DB_SSL || env.PGSSLMODE;
  if (explicitSsl) {
    return parseBoolean(explicitSsl, true);
  }

  try {
    const parsed = new URL(connectionString);
    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (sslMode === 'disable') return false;
    if (sslMode && sslMode !== 'prefer') return true;
    return !isLocalDatabaseHost(parsed.hostname);
  } catch {
    return env.NODE_ENV === 'production';
  }
}

export function buildPgPoolConfig(connectionString: string, env: Env = process.env): PoolConfig {
  const useSsl = shouldUseSsl(connectionString, env);

  return {
    connectionString,
    max: parsePositiveInt(env.DB_POOL_MAX, 10),
    idleTimeoutMillis: parsePositiveInt(env.DB_POOL_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis: parsePositiveInt(env.DB_POOL_CONNECTION_TIMEOUT_MS, 10_000),
    query_timeout: parsePositiveInt(env.DB_QUERY_TIMEOUT_MS, 60_000),
    statement_timeout: parsePositiveInt(env.DB_STATEMENT_TIMEOUT_MS, 60_000),
    ssl: useSsl
      ? { rejectUnauthorized: parseBoolean(env.DB_SSL_REJECT_UNAUTHORIZED, false) }
      : false,
  };
}

export function getDbHealthcheckTimeoutMs(env: Env = process.env) {
  return parsePositiveInt(env.DB_HEALTHCHECK_TIMEOUT_MS, 10_000);
}
