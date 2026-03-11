import { DashboardLayout } from './dashboardLayouts';

export const PCC_DASHBOARD_LAYOUT: DashboardLayout = {
  id: 'production_control_center',
  name: 'Production Control Center',
  description: 'Comprehensive production monitoring with hero metrics, trends, and pipeline visibility',

  sections: [
    {
      id: 'hero',
      title: 'Executive Metrics',
      columns: 4,
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
            enableFlip: true,
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
          id: 'hero-otd-summary',
          type: 'otd_summary',
          props: {},
        },
      ],
    },

    {
      id: 'project_pipeline',
      title: 'Project Pipeline',
      columns: 1,
      widgets: [
        {
          id: 'pcc-pipeline-board',
          type: 'pipeline_board',
          props: {},
          colSpan: 'col-span-1',
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
          id: 'pcc-payment-analytics',
          type: 'payment_analytics',
          props: {},
        },
        {
          id: 'pcc-swim-lane',
          type: 'swim_lane_preview',
          props: {},
        },
        {
          id: 'pcc-capability-radar',
          type: 'capability_radar',
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
      title: 'Signals',
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
