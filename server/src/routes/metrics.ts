import { Router, Request, Response } from 'express';
import { pool } from '../../db';
import { METRIC_FUNCTIONS, type MetricSlug } from '../services/metricsService';
import {
  getOrComputeSnapshot,
  refreshSnapshot,
  purgeExpiredSnapshots,
  type SnapshotPeriod,
} from '../services/metricsSnapshotService';

const router = Router();

const REGISTRY: Array<{
  slug: MetricSlug;
  name: string;
  description: string;
  category: string;
  unit: string;
  defaultVisual: string;
  isLive: boolean;
}> = [
  {
    slug: 'cnc_queue_size',
    name: 'CNC Queue',
    description: 'Number of active orders currently in the CNC department',
    category: 'production',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'gunsmith_queue_size',
    name: 'Gunsmith Queue',
    description: 'Number of active orders currently in the Gunsmith department',
    category: 'production',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'finish_queue_size',
    name: 'Finish Queue',
    description: 'Number of active orders in Finish or Finish QC',
    category: 'production',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'orders_in_production',
    name: 'Orders in Production',
    description: 'Total active orders across all mid-pipeline departments',
    category: 'production',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'orders_completed_today',
    name: 'Completed Today',
    description: 'Orders fulfilled on the current calendar day',
    category: 'throughput',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'p1_queue_size',
    name: 'P1 Production Queue',
    description: 'Orders waiting to enter production',
    category: 'production',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'layup_queue_size',
    name: 'Layup Queue',
    description: 'Orders currently in Layup/Plugging',
    category: 'production',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'barcode_queue_size',
    name: 'Barcode Queue',
    description: 'Orders currently in the Barcode department',
    category: 'production',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'paint_queue_size',
    name: 'Paint Queue',
    description: 'Orders currently in the Paint department',
    category: 'production',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'shipping_queue_size',
    name: 'Shipping Queue',
    description: 'Orders in Shipping QC or Shipping',
    category: 'production',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'open_inventory_shortages',
    name: 'Inventory Shortages',
    description: 'Number of inventory items with negative available or on-hand quantity',
    category: 'inventory',
    unit: 'items',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'p2_open_pos',
    name: 'Open P2 POs',
    description: 'Active P2 purchase orders not yet completed or cancelled',
    category: 'p2',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'p2_pending_boms',
    name: 'P2 Pending BOMs',
    description: 'Open P2 purchase orders still awaiting BOM configuration',
    category: 'p2',
    unit: 'orders',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'p2_items_in_production',
    name: 'P2 Items in Production',
    description: 'Serialized P2 items actively moving through the production pipeline',
    category: 'p2',
    unit: 'items',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'p2_items_pending_qc',
    name: 'P2 Items Pending QC',
    description: 'Serialized P2 items currently in Final QC',
    category: 'p2',
    unit: 'items',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'p2_items_completed_week',
    name: 'P2 Completed (7 Days)',
    description: 'Serialized P2 items completed in the last 7 days',
    category: 'p2',
    unit: 'items',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'cutting_table_active_items',
    name: 'Cutting Table Active',
    description: 'P2 production orders currently active on the cutting table',
    category: 'production',
    unit: 'items',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'open_credit_memos',
    name: 'Open Credit Memos',
    description: 'Active credit memos not yet fully applied',
    category: 'finance',
    unit: 'memos',
    defaultVisual: 'stat_card',
    isLive: true,
  },
  {
    slug: 'open_tickets',
    name: 'Open Tickets',
    description: 'Support tickets not yet closed or resolved',
    category: 'operations',
    unit: 'tickets',
    defaultVisual: 'stat_card',
    isLive: true,
  },
];

// ─── Startup tasks ─────────────────────────────────────────────────────────────

async function ensureRegistrySeeded(): Promise<void> {
  try {
    for (const entry of REGISTRY) {
      await pool.query(
        `INSERT INTO metrics_registry
           (slug, name, description, category, unit, calculation_function, default_visual, is_live)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (slug) DO UPDATE SET
           name                 = EXCLUDED.name,
           description          = EXCLUDED.description,
           category             = EXCLUDED.category,
           unit                 = EXCLUDED.unit,
           calculation_function = EXCLUDED.calculation_function,
           default_visual       = EXCLUDED.default_visual,
           is_live              = EXCLUDED.is_live`,
        [
          entry.slug,
          entry.name,
          entry.description,
          entry.category,
          entry.unit,
          entry.slug,
          entry.defaultVisual,
          entry.isLive,
        ],
      );
    }
  } catch (err) {
    console.warn('[metrics] Registry seed skipped (table may not exist yet):', (err as any).message);
  }
}

async function startupHousekeeping(): Promise<void> {
  await ensureRegistrySeeded();
  const purged = await purgeExpiredSnapshots();
  if (purged > 0) console.log(`[metrics] Purged ${purged} expired snapshot(s) on startup`);
}

startupHousekeeping();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parsePeriod(raw: unknown): SnapshotPeriod {
  if (raw === 'hourly' || raw === 'daily') return raw;
  return 'live';
}

// ─── GET /api/metrics/ — Registry list ────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  const rows = REGISTRY.map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description,
    category: r.category,
    unit: r.unit,
    defaultVisual: r.defaultVisual,
    isLive: r.isLive,
  }));
  res.json({ metrics: rows, total: rows.length });
});

// ─── GET /api/metrics/bulk/snapshot ───────────────────────────────────────────
// Must be declared BEFORE /:slug so Express doesn't swallow "bulk" as a slug.

router.get('/bulk/snapshot', async (req: Request, res: Response) => {
  const period = parsePeriod(req.query.period);
  const bypass = req.query.bypass === '1';

  const requested = req.query.slugs
    ? (req.query.slugs as string).split(',').map((s) => s.trim()) as MetricSlug[]
    : (Object.keys(METRIC_FUNCTIONS) as MetricSlug[]);

  const results = await Promise.allSettled(
    requested.map(async (slug) => {
      if (!METRIC_FUNCTIONS[slug]) throw new Error(`Unknown slug: ${slug}`);
      const snap = bypass
        ? await refreshSnapshot(slug, period)
        : await getOrComputeSnapshot(slug, period);
      const entry = REGISTRY.find((r) => r.slug === slug);
      return {
        slug,
        name:      entry?.name     ?? slug,
        value:     snap.value,
        unit:      entry?.unit     ?? '',
        category:  entry?.category ?? '',
        fromCache: snap.fromCache,
        computedAt: snap.computedAt.toISOString(),
        expiresAt:  snap.expiresAt.toISOString(),
      };
    }),
  );

  const snapshot: Record<string, any> = {};
  for (let i = 0; i < requested.length; i++) {
    const result = results[i];
    const slug = requested[i];
    if (result.status === 'fulfilled') {
      snapshot[slug] = result.value;
    } else {
      snapshot[slug] = { slug, error: result.reason?.message ?? 'failed' };
    }
  }

  res.json({
    snapshot,
    period,
    computedAt: new Date().toISOString(),
    total: requested.length,
  });
});

// ─── GET /api/metrics/:slug ────────────────────────────────────────────────────

router.get('/:slug', async (req: Request, res: Response) => {
  const slug = req.params.slug as MetricSlug;
  const period = parsePeriod(req.query.period);
  const bypass = req.query.bypass === '1';

  const entry = REGISTRY.find((r) => r.slug === slug);
  if (!entry) {
    return res.status(404).json({ error: `Unknown metric: ${slug}` });
  }

  if (!METRIC_FUNCTIONS[slug]) {
    return res.status(501).json({ error: `No calculation function for metric: ${slug}` });
  }

  try {
    const snap = bypass
      ? await refreshSnapshot(slug, period)
      : await getOrComputeSnapshot(slug, period);

    res.json({
      metric:       slug,
      name:         entry.name,
      value:        snap.value,
      unit:         entry.unit,
      category:     entry.category,
      defaultVisual: entry.defaultVisual,
      isLive:       entry.isLive,
      fromCache:    snap.fromCache,
      computedAt:   snap.computedAt.toISOString(),
      expiresAt:    snap.expiresAt.toISOString(),
    });
  } catch (err: any) {
    console.error(`[metrics] Error computing ${slug}:`, err.message);
    res.status(500).json({ error: `Failed to compute metric: ${slug}`, message: err.message });
  }
});

export default router;
