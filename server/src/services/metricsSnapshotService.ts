import { pool } from '../../db';
import { METRIC_FUNCTIONS, type MetricSlug } from './metricsService';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SnapshotPeriod = 'live' | 'hourly' | 'daily';

export interface MetricSnapshot {
  metricSlug: string;
  period: SnapshotPeriod;
  value: number;
  valueJson: Record<string, unknown>;
  computedAt: Date;
  expiresAt: Date;
  fromCache: boolean;
}

// ─── TTL configuration per period ──────────────────────────────────────────────
// 'live'   → 60 s  (still cuts DB load for concurrent widget renders)
// 'hourly' → 1 h   (reserved for future heavy aggregates)
// 'daily'  → 24 h  (reserved for future nightly roll-ups)

const TTL_SECONDS: Record<SnapshotPeriod, number> = {
  live:   60,
  hourly: 3_600,
  daily:  86_400,
};

// ─── getSnapshot ───────────────────────────────────────────────────────────────
// Returns a cached snapshot if it exists and has not expired.
// Returns null on a cache miss (expired or never computed).

export async function getSnapshot(
  slug: string,
  period: SnapshotPeriod = 'live',
): Promise<MetricSnapshot | null> {
  try {
    const rows = await pool.query(
      `SELECT metric_slug, period, value_json, computed_at, expires_at
       FROM metric_snapshots
       WHERE metric_slug = $1
         AND period      = $2
         AND expires_at  > NOW()`,
      [slug, period],
    ) as any[];

    if (!rows.length) return null;

    const row = rows[0];
    const valueJson = row.value_json as Record<string, unknown>;

    return {
      metricSlug: row.metric_slug,
      period:     row.period as SnapshotPeriod,
      value:      typeof valueJson.value === 'number' ? valueJson.value : 0,
      valueJson,
      computedAt: new Date(row.computed_at),
      expiresAt:  new Date(row.expires_at),
      fromCache:  true,
    };
  } catch (err: any) {
    console.warn(`[snapshot] getSnapshot(${slug}, ${period}) failed:`, err.message);
    return null;
  }
}

// ─── refreshSnapshot ───────────────────────────────────────────────────────────
// Computes the metric live and upserts the result into metric_snapshots.
// Always returns the freshly computed snapshot.
// Throws if the slug is unknown or computation fails.

export async function refreshSnapshot(
  slug: string,
  period: SnapshotPeriod = 'live',
): Promise<MetricSnapshot> {
  const fn = METRIC_FUNCTIONS[slug as MetricSlug];
  if (!fn) throw new Error(`No metric function registered for slug: ${slug}`);

  const value = await fn();
  const valueJson = { value };
  const ttl = TTL_SECONDS[period];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000);

  await pool.query(
    `INSERT INTO metric_snapshots (metric_slug, period, value_json, computed_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (metric_slug, period) DO UPDATE SET
       value_json  = EXCLUDED.value_json,
       computed_at = EXCLUDED.computed_at,
       expires_at  = EXCLUDED.expires_at`,
    [slug, period, JSON.stringify(valueJson), now, expiresAt],
  );

  return {
    metricSlug: slug,
    period,
    value,
    valueJson,
    computedAt: now,
    expiresAt,
    fromCache: false,
  };
}

// ─── getOrComputeSnapshot ──────────────────────────────────────────────────────
// The primary call site: checks cache first, falls back to live compute + store.
// fromCache tells the caller whether the DB or live SQL was hit.

export async function getOrComputeSnapshot(
  slug: string,
  period: SnapshotPeriod = 'live',
): Promise<MetricSnapshot> {
  const cached = await getSnapshot(slug, period);
  if (cached) return cached;
  return refreshSnapshot(slug, period);
}

// ─── purgeExpiredSnapshots ─────────────────────────────────────────────────────
// Housekeeping: remove rows that have definitely expired.
// Called at server startup and can be scheduled periodically.

export async function purgeExpiredSnapshots(): Promise<number> {
  try {
    const rows = await pool.query(
      `DELETE FROM metric_snapshots WHERE expires_at < NOW() RETURNING id`,
    ) as any[];
    return rows.length;
  } catch (err: any) {
    console.warn('[snapshot] purgeExpiredSnapshots failed:', err.message);
    return 0;
  }
}
