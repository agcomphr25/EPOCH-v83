import { ComponentType } from 'react';

// ─── Widget Type IDs ──────────────────────────────────────────────────────────
export type WidgetTypeId =
  | 'metric_stat'
  | 'metric_stat_group'
  | 'hero_metric'
  | 'stocks_shipped'
  | 'department_status'
  | 'shipment_trend'
  | 'bubble_chart'
  | 'kit_progress'
  | 'signal_card'
  | 'swim_lane_preview'
  | 'capability_radar'
  | 'pipeline_board'
  | 'otd_summary'
  | 'payment_analytics'
  | 'forecast_accuracy'
  | 'cc_processing'
  | 'ar_aging';

// ─── Widget Config ─────────────────────────────────────────────────────────────
// The serialisable description of a single widget on a dashboard.
export interface WidgetConfig {
  id: string;
  type: WidgetTypeId;
  props: Record<string, unknown>;
  /** Tailwind col-span class, e.g. "col-span-1", "col-span-2". Default: "col-span-1" */
  colSpan?: string;
}

// ─── Registry Entry ────────────────────────────────────────────────────────────
// Everything the system knows about a widget type.
export interface WidgetRegistryEntry {
  id: WidgetTypeId;
  displayName: string;
  description: string;
  category: 'metric' | 'table' | 'chart' | 'status' | 'misc';
  /** The React component to render. Accept any props via Record. */
  component: ComponentType<Record<string, unknown>>;
  /** Prop names that are required when placing this widget */
  requiredProps: string[];
  /** Default props merged before required props */
  defaultProps?: Record<string, unknown>;
  /** Declared types for required props — used to coerce stored strings to correct runtime types */
  propTypes?: Record<string, 'string' | 'string[]' | 'number'>;
}

// ─── Registry Map ──────────────────────────────────────────────────────────────
// Populated below — import widget components directly (no lazy needed for hooks
// to work; lazy-load only if the bundle warrants it).
const _registry = new Map<WidgetTypeId, WidgetRegistryEntry>();

export function registerWidget(entry: WidgetRegistryEntry) {
  _registry.set(entry.id, entry);
}

export function getWidget(type: WidgetTypeId): WidgetRegistryEntry | undefined {
  return _registry.get(type);
}

export function getAllWidgets(): WidgetRegistryEntry[] {
  return Array.from(_registry.values());
}

export function getWidgetsByCategory(
  category: WidgetRegistryEntry['category'],
): WidgetRegistryEntry[] {
  return getAllWidgets().filter((e) => e.category === category);
}

// ─── Register built-in widgets ─────────────────────────────────────────────────
// Import synchronously so the registry is populated before any renderer runs.
import MetricStatWidget from '@/components/widgets/MetricStatWidget';
import MetricStatGroup from '@/components/widgets/MetricStatGroup';
import HeroMetricWidget from '@/components/widgets/HeroMetricWidget';
import ShipmentTrendWidget from '@/components/widgets/ShipmentTrendWidget';
import BubbleChartWidget from '@/components/widgets/BubbleChartWidget';
import KitProgressWidget from '@/components/widgets/KitProgressWidget';
import SignalCardWidget from '@/components/widgets/SignalCardWidget';
import SwimLanePreviewWidget from '@/components/widgets/SwimLanePreviewWidget';
import CapabilityRadarWidget from '@/components/widgets/CapabilityRadarWidget';
import DepartmentStatusWidget from '@/components/widgets/DepartmentStatusWidget';
import PipelineBoardWidget from '@/components/widgets/PipelineBoardWidget';
import OTDWidget from '@/components/widgets/OTDWidget';
import PaymentAnalyticsWidget from '@/components/widgets/PaymentAnalyticsWidget';
import ForecastAccuracyWidget from '@/components/widgets/ForecastAccuracyWidget';
import CreditCardProcessingWidget from '@/components/widgets/CreditCardProcessingWidget';
import ARAgingWidget from '@/components/widgets/ARAgingWidget';

registerWidget({
  id: 'metric_stat',
  displayName: 'Metric Stat Card',
  description: 'Displays a single live metric value fetched from the metrics API.',
  category: 'metric',
  component: MetricStatWidget as ComponentType<Record<string, unknown>>,
  requiredProps: ['metricSlug'],
  defaultProps: {},
});

registerWidget({
  id: 'metric_stat_group',
  displayName: 'Metric Stat Group',
  description: 'Displays a horizontal row of multiple metric stat cards from a list of slugs.',
  category: 'metric',
  component: MetricStatGroup as ComponentType<Record<string, unknown>>,
  requiredProps: ['slugs'],
  defaultProps: { label: '' },
  propTypes: { slugs: 'string[]' },
});

registerWidget({
  id: 'hero_metric',
  displayName: 'Hero Metric Card',
  description: 'Large-format KPI card with progress bar, trend arrow, and accent color.',
  category: 'metric',
  component: HeroMetricWidget as ComponentType<Record<string, unknown>>,
  requiredProps: ['metricSlug'],
  defaultProps: {},
});

registerWidget({
  id: 'stocks_shipped',
  displayName: 'Stocks Shipped',
  description: 'Hero KPI card showing stocks shipped for the current operational week (Wed–Tue) with a weekly goal of 70.',
  category: 'metric',
  component: HeroMetricWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {
    metricSlug: 'orders_completed_today',
    title: 'Stocks Shipped',
    subtitle: 'Operational week (Wed–Tue)',
    accentColor: 'hsl(221, 83%, 53%)',
    target: 70,
    trend: 'up',
    trendLabel: 'Tracking ahead of last week',
    enableFlip: true,
  },
});

registerWidget({
  id: 'shipment_trend',
  displayName: 'Shipment Trend Chart',
  description: 'Weekly shipment bar chart with 4-week moving average line overlay.',
  category: 'chart',
  component: ShipmentTrendWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: { weeks: 8 },
});

registerWidget({
  id: 'bubble_chart',
  displayName: 'Stock Model Popularity',
  description: 'Bubble chart showing stock model popularity by weekly shipments, avg price, and total revenue.',
  category: 'chart',
  component: BubbleChartWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'kit_progress',
  displayName: 'Kit Progress Tracker',
  description: 'BOM/kit completion tracker with progress bars and bottleneck identification.',
  category: 'status',
  component: KitProgressWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'signal_card',
  displayName: 'Signal Card',
  description: 'Conditionally styled alert card (green/yellow/red) based on threshold rules.',
  category: 'status',
  component: SignalCardWidget as ComponentType<Record<string, unknown>>,
  requiredProps: ['metricSlug'],
  defaultProps: {},
});

registerWidget({
  id: 'swim_lane_preview',
  displayName: 'Swim Lane Preview',
  description: 'Compact production pipeline visualization with expandable detail sheet.',
  category: 'status',
  component: SwimLanePreviewWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'capability_radar',
  displayName: 'Capability Radar',
  description: 'Radar chart showing department capacity utilization across Layup, CNC, Finish, Paint, Shipping, and Quality.',
  category: 'chart',
  component: CapabilityRadarWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'department_status',
  displayName: 'Department Status',
  description: 'Consolidated table of all department queues with sparkline trends.',
  category: 'table',
  component: DepartmentStatusWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'pipeline_board',
  displayName: 'Project Pipeline',
  description: 'Compact kanban view of the P2 project pipeline across all stages.',
  category: 'status',
  component: PipelineBoardWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'otd_summary',
  displayName: 'OTD Summary',
  description: 'On-time delivery percentage and breakdown for the current month.',
  category: 'metric',
  component: OTDWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'payment_analytics',
  displayName: 'Payment Analytics',
  description: 'Month-to-date revenue summary with phone vs online breakdown.',
  category: 'metric',
  component: PaymentAnalyticsWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'forecast_accuracy',
  displayName: 'Forecast Accuracy',
  description: 'Shows forecast vs. actual completion accuracy with error metrics and trend breakdown.',
  category: 'metric',
  component: ForecastAccuracyWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'cc_processing',
  displayName: 'Credit Card Processing',
  description: 'YTD credit card volume breakdown (Online vs Phone) from historical data, with recent months detail.',
  category: 'metric',
  component: CreditCardProcessingWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});

registerWidget({
  id: 'ar_aging',
  displayName: 'AR Aging Summary',
  description: 'Outstanding accounts receivable broken down by aging bucket with top customer balances.',
  category: 'metric',
  component: ARAgingWidget as ComponentType<Record<string, unknown>>,
  requiredProps: [],
  defaultProps: {},
});
