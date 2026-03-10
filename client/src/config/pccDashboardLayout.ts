import { DashboardLayout } from './dashboardLayouts';

export const PCC_DASHBOARD_LAYOUT: DashboardLayout = {
  id: 'production_control_center',
  name: 'Production Control Center',
  description: 'Comprehensive production monitoring with hero metrics, trends, and pipeline visibility',

  sections: [
    {
      id: 'hero',
      title: undefined,
      columns: 3,
      widgets: [
        {
          id: 'hero-stocks-shipped',
          type: 'hero_metric',
          props: {
            metricSlug: 'orders_completed_today',
            title: 'Stocks Shipped',
            subtitle: 'Operational week (Wed–Tue)',
            accentColor: 'hsl(221, 83%, 53%)',
            target: 110,
            trend: 'up',
            trendLabel: 'Tracking ahead of last week',
          },
        },
        {
          id: 'hero-orders-in-production',
          type: 'hero_metric',
          props: {
            metricSlug: 'orders_in_production',
            title: 'In Production',
            subtitle: 'Active orders across all departments',
            accentColor: 'hsl(262, 83%, 58%)',
          },
        },
        {
          id: 'hero-inventory-shortages',
          type: 'hero_metric',
          props: {
            metricSlug: 'open_inventory_shortages',
            title: 'Inventory Shortages',
            subtitle: 'Open shortages blocking production',
            accentColor: 'hsl(25, 95%, 53%)',
          },
        },
      ],
    },

    {
      id: 'department_metrics',
      title: 'Department Queues',
      columns: 4,
      widgets: [
        {
          id: 'pcc-layup',
          type: 'metric_stat',
          props: { metricSlug: 'layup_queue_size', title: 'Layup' },
        },
        {
          id: 'pcc-cnc',
          type: 'metric_stat',
          props: { metricSlug: 'cnc_queue_size', title: 'CNC' },
        },
        {
          id: 'pcc-gunsmith',
          type: 'metric_stat',
          props: { metricSlug: 'gunsmith_queue_size', title: 'Gunsmith' },
        },
        {
          id: 'pcc-finish',
          type: 'metric_stat',
          props: { metricSlug: 'finish_queue_size', title: 'Finish' },
        },
        {
          id: 'pcc-paint',
          type: 'metric_stat',
          props: { metricSlug: 'paint_queue_size', title: 'Paint' },
        },
        {
          id: 'pcc-shipping',
          type: 'metric_stat',
          props: { metricSlug: 'shipping_queue_size', title: 'Shipping' },
        },
        {
          id: 'pcc-p1-queue',
          type: 'metric_stat',
          props: { metricSlug: 'p1_queue_size', title: 'P1 Queue' },
        },
        {
          id: 'pcc-barcode',
          type: 'metric_stat',
          props: { metricSlug: 'barcode_queue_size', title: 'Barcode' },
        },
      ],
    },

    {
      id: 'charts',
      title: 'Trends & Analysis',
      columns: 2,
      widgets: [
        {
          id: 'pcc-shipment-trend',
          type: 'shipment_trend',
          props: { weeks: 8 },
        },
        {
          id: 'pcc-bubble-chart',
          type: 'bubble_chart',
          props: {},
        },
      ],
    },

    {
      id: 'operational',
      title: 'Operational Status',
      columns: 3,
      widgets: [
        {
          id: 'pcc-kit-progress',
          type: 'kit_progress',
          props: {},
        },
        {
          id: 'pcc-swim-lane',
          type: 'swim_lane_preview',
          props: {},
        },
        {
          id: 'pcc-signal-shortages',
          type: 'signal_card',
          props: {
            metricSlug: 'open_inventory_shortages',
            title: 'Shortage Alert',
            thresholds: [
              { max: 3, color: 'green' },
              { max: 10, color: 'yellow' },
              { max: Infinity, color: 'red' },
            ],
          },
        },
      ],
    },

    {
      id: 'signals',
      title: 'Signal Cards',
      columns: 3,
      widgets: [
        {
          id: 'pcc-signal-cnc',
          type: 'signal_card',
          props: {
            metricSlug: 'cnc_queue_size',
            title: 'CNC Queue Load',
            thresholds: [
              { max: 10, color: 'green' },
              { max: 25, color: 'yellow' },
              { max: Infinity, color: 'red' },
            ],
          },
        },
        {
          id: 'pcc-signal-paint',
          type: 'signal_card',
          props: {
            metricSlug: 'paint_queue_size',
            title: 'Paint Queue Load',
            thresholds: [
              { max: 8, color: 'green' },
              { max: 20, color: 'yellow' },
              { max: Infinity, color: 'red' },
            ],
          },
        },
        {
          id: 'pcc-signal-finish',
          type: 'signal_card',
          props: {
            metricSlug: 'finish_queue_size',
            title: 'Finish Queue Load',
            thresholds: [
              { max: 8, color: 'green' },
              { max: 20, color: 'yellow' },
              { max: Infinity, color: 'red' },
            ],
          },
        },
      ],
    },
  ],
};
