import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../../db';
import { pool } from '../../db';
import { metricSnapshots, type MetricSnapshotRow } from '../../schema';
import { METRIC_FUNCTIONS, type MetricSlug } from './metricsService';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SnapshotPeriod = 'live' | 'hourly' | 'daily';

// Service return type — augments the raw DB row with a computed `fromCache` flag
// and a scalar `value` extracted from the JSONB blob.
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
// 'live'   → 60 s  (cuts DB load across concurrent widget renders)
// 'hourly' → 1 h   (reserved for future heavy aggregates)
// 'daily'  → 24 h  (reserved for future nightly roll-ups)

const TTL_SECONDS: Record<SnapshotPeriod, number> = {
  live:   60,
  hourly: 3_600,
  daily:  86_400,
};

// ─── rowToSnapshot ─────────────────────────────────────────────────────────────
// Converts a typed MetricSnapshotRow (Drizzle select result) into the service's
// MetricSnapshot shape. Centralises the mapping in one place.

function rowToSnapshot(row: MetricSnapshotRow, fromCache: boolean): MetricSnapshot {
  const valueJson = (row.valueJson ?? {}) as Record<string, unknown>;
  return {
    metricSlug: row.metricSlug,
    period:     row.period as SnapshotPeriod,
    value:      typeof valueJson.value === 'number' ? valueJson.value : 0,
    valueJson,
    computedAt: row.computedAt,
    expiresAt:  row.expiresAt,
    fromCache,
  };
}

// ─── getSnapshot ───────────────────────────────────────────────────────────────
// Returns a fresh cached snapshot via Drizzle ORM typed select.
// Returns null on a cache miss (expired or never computed).

export async function getSnapshot(
  slug: string,
  period: SnapshotPeriod = 'live',
): Promise<MetricSnapshot | null> {
  try {
    const rows: MetricSnapshotRow[] = await db
      .select()
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.metricSlug, slug),
          eq(metricSnapshots.period, period),
          gt(metricSnapshots.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!rows.length) return null;
    return rowToSnapshot(rows[0], true);
  } catch (err: any) {
    console.warn(`[snapshot] getSnapshot(${slug}, ${period}) failed:`, err.message);
    return null;
  }
}

// ─── refreshSnapshot ───────────────────────────────────────────────────────────
// Computes the metric live and upserts the result into metric_snapshots.
// Uses raw SQL for the upsert to leverage ON CONFLICT DO UPDATE cleanly.
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
// The primary call site: cache-hit path first, falls back to live compute + store.
// `fromCache` on the return tells the caller which path was taken.

export async function getOrComputeSnapshot(
  slug: string,
  period: SnapshotPeriod = 'live',
): Promise<MetricSnapshot> {
  const cached = await getSnapshot(slug, period);
  if (cached) return cached;
  return refreshSnapshot(slug, period);
}

// ─── purgeExpiredSnapshots ─────────────────────────────────────────────────────
// Housekeeping: remove rows whose expires_at has passed.
// Called at server startup via metrics.ts; can also be scheduled periodically.

export async function purgeExpiredSnapshots(): Promise<number> {
  try {
    const deleted = await db
      .delete(metricSnapshots)
      .where(lt(metricSnapshots.expiresAt, new Date()))
      .returning({ id: metricSnapshots.id });
    return deleted.length;
  } catch (err: any) {
    console.warn('[snapshot] purgeExpiredSnapshots failed:', err.message);
    return 0;
  }
}
