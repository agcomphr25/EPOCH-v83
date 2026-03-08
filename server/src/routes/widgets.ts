import { Router, Request, Response } from 'express';

// ─── Widget Type Catalogue ─────────────────────────────────────────────────────
// Mirrors client/src/lib/widgetRegistry.ts.
// This is the backend source of truth so the builder UI discovers types from the
// API rather than reading client-side code. Add entries here whenever a new
// widget type is registered on the frontend.

const WIDGET_TYPES = [
  {
    id: 'metric_stat',
    displayName: 'Metric Stat Card',
    description: 'Displays a single live metric value with optional icon and trend label.',
    category: 'metric',
    requiredProps: ['metricSlug'],
    defaultProps: {},
    propSchema: [
      { name: 'metricSlug', type: 'metric_slug', label: 'Metric',                    required: true  },
      { name: 'title',      type: 'string',      label: 'Title override (optional)',  required: false },
      { name: 'unit',       type: 'string',      label: 'Unit override (optional)',   required: false },
    ],
  },
  {
    id: 'metric_stat_group',
    displayName: 'Metric Stat Group',
    description: 'Renders multiple metric stat cards in a row from a single bulk API fetch.',
    category: 'metric',
    requiredProps: ['slugs'],
    defaultProps: { label: '' },
    propSchema: [
      { name: 'slugs', type: 'metric_slug_array', label: 'Metrics',       required: true  },
      { name: 'label', type: 'string',            label: 'Section label', required: false },
    ],
  },
];

// ─── Dashboard Catalogue ───────────────────────────────────────────────────────
// Serialisable representations of all defined dashboard layouts.
// Currently static (mirrors client/src/config/dashboardLayouts.ts).
// TODO: persist user-created dashboards to a `dashboard_layouts` DB table and
//       merge DB rows with this static seed on GET.

const STATIC_DASHBOARDS = [
  {
    id: 'production_overview',
    name: 'Production Overview',
    description: 'Live queue sizes across all manufacturing departments',
    isSystem: true,
    sections: [
      {
        id: 'throughput',
        title: 'Throughput',
        columns: 2,
        widgets: [
          { id: 'w-orders-in-production',   type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'orders_in_production',  title: 'Orders in Production' } },
          { id: 'w-orders-completed-today', type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'orders_completed_today', title: 'Completed Today'       } },
        ],
      },
      {
        id: 'queue-sizes',
        title: 'Department Queues',
        columns: 4,
        widgets: [
          { id: 'w-p1-queue',       type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'p1_queue_size',       title: 'P1 Production' } },
          { id: 'w-layup-queue',    type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'layup_queue_size',    title: 'Layup'         } },
          { id: 'w-barcode-queue',  type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'barcode_queue_size',  title: 'Barcode'       } },
          { id: 'w-cnc-queue',      type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'cnc_queue_size',      title: 'CNC'           } },
          { id: 'w-gunsmith-queue', type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'gunsmith_queue_size', title: 'Gunsmith'      } },
          { id: 'w-finish-queue',   type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'finish_queue_size',   title: 'Finish'        } },
          { id: 'w-paint-queue',    type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'paint_queue_size',    title: 'Paint'         } },
          { id: 'w-shipping-queue', type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'shipping_queue_size', title: 'Shipping'      } },
        ],
      },
      {
        id: 'inventory',
        title: 'Inventory',
        columns: 2,
        widgets: [
          { id: 'w-inventory-shortages', type: 'metric_stat', colSpan: 'col-span-1', props: { metricSlug: 'open_inventory_shortages', title: 'Open Shortages' } },
        ],
      },
    ],
  },
];

// ─── /api/widgets router ───────────────────────────────────────────────────────

export const widgetTypesRouter = Router();

// GET /api/widgets/types
// Returns every registered widget type with its prop schema.
widgetTypesRouter.get('/types', (_req: Request, res: Response) => {
  res.json({
    types: WIDGET_TYPES,
    total: WIDGET_TYPES.length,
  });
});

// ─── /api/dashboards router ────────────────────────────────────────────────────

export const dashboardsRouter = Router();

// GET /api/dashboards
// Returns all known dashboard layouts.
dashboardsRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    dashboards: STATIC_DASHBOARDS,
    total: STATIC_DASHBOARDS.length,
  });
});

// GET /api/dashboards/:id
// Returns a single dashboard layout by ID.
dashboardsRouter.get('/:id', (req: Request, res: Response) => {
  const dashboard = STATIC_DASHBOARDS.find((d) => d.id === req.params.id);
  if (!dashboard) {
    return res.status(404).json({ error: `Dashboard not found: ${req.params.id}` });
  }
  res.json(dashboard);
});
