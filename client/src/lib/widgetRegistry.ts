import { ComponentType, lazy } from 'react';

// ─── Widget Type IDs ──────────────────────────────────────────────────────────
export type WidgetTypeId =
  | 'metric_stat'
  | 'metric_stat_group';

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
});
