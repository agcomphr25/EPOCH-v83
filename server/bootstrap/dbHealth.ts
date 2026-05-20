export type DatabaseHealthTarget = {
  source: string;
  host: string | null;
  database: string | null;
  user: string | null;
  redactedUrl: string | null;
};

export type DatabaseHealthSnapshot = {
  status: 'unknown' | 'healthy' | 'unhealthy';
  checkedAt: string | null;
  latencyMs: number | null;
  error: string | null;
  target: DatabaseHealthTarget;
};

export type DatabaseHealthCheckResult = DatabaseHealthSnapshot & {
  ok: boolean;
};

type QueryHealthcheck = () => Promise<unknown>;

function timeoutAfter(timeoutMs: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Database healthcheck timeout after ${timeoutMs}ms`)), timeoutMs);
  });
}

export function createInitialDatabaseHealth(target: DatabaseHealthTarget): DatabaseHealthSnapshot {
  return {
    status: 'unknown',
    checkedAt: null,
    latencyMs: null,
    error: null,
    target,
  };
}

export async function runDatabaseHealthCheck(
  queryHealthcheck: QueryHealthcheck,
  target: DatabaseHealthTarget,
  timeoutMs: number,
): Promise<DatabaseHealthCheckResult> {
  const started = Date.now();

  try {
    await Promise.race([queryHealthcheck(), timeoutAfter(timeoutMs)]);
    return {
      ok: true,
      status: 'healthy',
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      error: null,
      target,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'unhealthy',
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      target,
    };
  }
}
