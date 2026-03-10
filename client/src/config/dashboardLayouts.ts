import { WidgetConfig } from '@/lib/widgetRegistry';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardSection {
  id: string;
  title?: string;
  /** Number of columns in the grid (1–4). Defaults to 3. */
  columns?: 1 | 2 | 3 | 4;
  widgets: WidgetConfig[];
}

export interface DashboardLayout {
  id: string;
  name: string;
  description?: string;
  sections: DashboardSection[];
}

// ─── Layouts ───────────────────────────────────────────────────────────────────

export const PRODUCTION_OVERVIEW_LAYOUT: DashboardLayout = {
  id: 'production_overview',
  name: 'Production Overview',
  description: 'Live queue sizes across all manufacturing departments',
  sections: [
    {
      id: 'throughput',
      title: 'Throughput',
      columns: 2,
      widgets: [
        {
          id: 'w-orders-in-production',
          type: 'metric_stat',
          props: { metricSlug: 'orders_in_production', title: 'Orders in Production' },
        },
        {
          id: 'w-orders-completed-today',
          type: 'metric_stat',
          props: { metricSlug: 'orders_completed_today', title: 'Completed Today' },
        },
      ],
    },
    {
      id: 'queue-sizes',
      title: 'Department Queues',
      columns: 4,
      widgets: [
        {
          id: 'w-p1-queue',
          type: 'metric_stat',
          props: { metricSlug: 'p1_queue_size', title: 'P1 Production' },
        },
        {
          id: 'w-layup-queue',
          type: 'metric_stat',
          props: { metricSlug: 'layup_queue_size', title: 'Layup' },
        },
        {
          id: 'w-barcode-queue',
          type: 'metric_stat',
          props: { metricSlug: 'barcode_queue_size', title: 'Barcode' },
        },
        {
          id: 'w-cnc-queue',
          type: 'metric_stat',
          props: { metricSlug: 'cnc_queue_size', title: 'CNC' },
        },
        {
          id: 'w-gunsmith-queue',
          type: 'metric_stat',
          props: { metricSlug: 'gunsmith_queue_size', title: 'Gunsmith' },
        },
        {
          id: 'w-finish-queue',
          type: 'metric_stat',
          props: { metricSlug: 'finish_queue_size', title: 'Finish' },
        },
        {
          id: 'w-paint-queue',
          type: 'metric_stat',
          props: { metricSlug: 'paint_queue_size', title: 'Paint' },
        },
        {
          id: 'w-shipping-queue',
          type: 'metric_stat',
          props: { metricSlug: 'shipping_queue_size', title: 'Shipping' },
        },
      ],
    },
    {
      id: 'inventory',
      title: 'Inventory',
      columns: 2,
      widgets: [
        {
          id: 'w-inventory-shortages',
          type: 'metric_stat',
          props: { metricSlug: 'open_inventory_shortages', title: 'Open Shortages' },
        },
      ],
    },
  ],
};

// ─── Registry of all layouts ───────────────────────────────────────────────────

import { PCC_DASHBOARD_LAYOUT } from './pccDashboardLayout';

export const DASHBOARD_LAYOUTS: Record<string, DashboardLayout> = {
  production_overview: PRODUCTION_OVERVIEW_LAYOUT,
  production_control_center: PCC_DASHBOARD_LAYOUT,
};

export function getLayout(id: string): DashboardLayout | undefined {
  return DASHBOARD_LAYOUTS[id];
}
