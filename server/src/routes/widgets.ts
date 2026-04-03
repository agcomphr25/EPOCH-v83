import { Router, Request, Response } from 'express';

// ─── Widget Type Catalogue ─────────────────────────────────────────────────────
// Mirrors client/src/lib/widgetRegistry.ts.
// This is the backend source of truth so the builder UI discovers types from the
// API rather than reading client-side code. Add entries here whenever a new
// widget type is registered on the frontend.

const WIDGET_TYPES = [
  // ── Metric widgets ────────────────────────────────────────────────────────
  {
    id: 'metric_stat',
    displayName: 'Metric Stat Card',
    description: 'Displays a single live metric value with optional icon and trend label.',
    category: 'metric',
    requiredProps: ['metricSlug'],
    defaultProps: {},
    propSchema: [
      { name: 'metricSlug', type: 'metric_slug', label: 'Metric',                   required: true  },
      { name: 'title',      type: 'string',      label: 'Title override (optional)', required: false },
      { name: 'unit',       type: 'string',      label: 'Unit override (optional)',  required: false },
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
      { name: 'label', type: 'string',             label: 'Section label', required: false },
    ],
  },
  {
    id: 'hero_metric',
    displayName: 'Hero Metric Card',
    description: 'Large-format KPI card with progress bar, trend arrow, and accent color.',
    category: 'metric',
    requiredProps: ['metricSlug'],
    defaultProps: {},
    propSchema: [
      { name: 'metricSlug', type: 'metric_slug', label: 'Metric', required: true },
    ],
  },
  {
    id: 'otd_summary',
    displayName: 'OTD Summary',
    description: 'On-time delivery percentage and breakdown for the current month.',
    category: 'metric',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  {
    id: 'payment_analytics',
    displayName: 'Payment Analytics',
    description: 'Month-to-date revenue summary with phone vs online breakdown.',
    category: 'metric',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  {
    id: 'forecast_accuracy',
    displayName: 'Forecast Accuracy',
    description: 'Shows forecast vs. actual completion accuracy with error metrics and trend breakdown.',
    category: 'metric',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  {
    id: 'cc_processing',
    displayName: 'Credit Card Processing',
    description: 'YTD credit card volume breakdown (Online vs Phone) from historical data, with recent months detail.',
    category: 'metric',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  {
    id: 'ar_aging',
    displayName: 'AR Aging Summary',
    description: 'Outstanding accounts receivable broken down by aging bucket with top customer balances.',
    category: 'metric',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  // ── Chart widgets ─────────────────────────────────────────────────────────
  {
    id: 'shipment_trend',
    displayName: 'Shipment Trend Chart',
    description: 'Weekly shipment bar chart with 4-week moving average line overlay.',
    category: 'chart',
    requiredProps: [],
    defaultProps: { weeks: 8 },
    propSchema: [
      { name: 'weeks', type: 'number', label: 'Weeks of history', required: false },
    ],
  },
  {
    id: 'bubble_chart',
    displayName: 'Stock Model Popularity',
    description: 'Bubble chart showing stock model popularity by weekly shipments, avg price, and total revenue.',
    category: 'chart',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  {
    id: 'capability_radar',
    displayName: 'Capability Radar',
    description: 'Radar chart showing department capacity utilization across Layup, CNC, Finish, Paint, Shipping, and Quality.',
    category: 'chart',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  // ── Status widgets ────────────────────────────────────────────────────────
  {
    id: 'signal_card',
    displayName: 'Signal Card',
    description: 'Conditionally styled alert card (green/yellow/red) based on threshold rules.',
    category: 'status',
    requiredProps: ['metricSlug'],
    defaultProps: {},
    propSchema: [
      { name: 'metricSlug',      type: 'metric_slug', label: 'Metric',           required: true  },
      { name: 'warnThreshold',   type: 'number',       label: 'Warn threshold',   required: false },
      { name: 'dangerThreshold', type: 'number',       label: 'Danger threshold', required: false },
    ],
  },
  {
    id: 'swim_lane_preview',
    displayName: 'Swim Lane Preview',
    description: 'Compact production pipeline visualization with expandable detail sheet.',
    category: 'status',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  {
    id: 'kit_progress',
    displayName: 'Kit Progress Tracker',
    description: 'BOM/kit completion tracker with progress bars and bottleneck identification.',
    category: 'status',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  {
    id: 'pipeline_board',
    displayName: 'Project Pipeline',
    description: 'Compact kanban view of the P2 project pipeline across all stages.',
    category: 'status',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  // ── Table widgets ─────────────────────────────────────────────────────────
  {
    id: 'department_status',
    displayName: 'Department Status',
    description: 'Consolidated table of all department queues with sparkline trends.',
    category: 'table',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
  },
  {
    id: 'department_exits',
    displayName: 'Department Exits',
    description: 'Orders that exited each department within a selected timeframe (day, week, or month).',
    category: 'table',
    requiredProps: [],
    defaultProps: {},
    propSchema: [],
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
      {
        id: 'dept-exits',
        title: 'Department Exits',
        columns: 2,
        widgets: [
          { id: 'w-department-exits', type: 'department_exits', colSpan: 'col-span-2', props: {} },
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

// GET /api/widgets/types/:id
// Returns a single widget type definition.
widgetTypesRouter.get('/types/:id', (req: Request, res: Response) => {
  const type = WIDGET_TYPES.find((t) => t.id === req.params.id);
  if (!type) return res.status(404).json({ error: `Widget type not found: ${req.params.id}` });
  res.json(type);
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
