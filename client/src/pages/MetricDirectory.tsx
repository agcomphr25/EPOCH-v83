import { useQuery } from '@tanstack/react-query';
import { Database } from 'lucide-react';

interface MetricRegistryEntry {
  slug: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  defaultVisual: string;
  isLive: boolean;
}

interface MetricRegistryResponse {
  metrics: MetricRegistryEntry[];
  total: number;
}

interface BulkSnapshotResponse {
  snapshot: Record<string, { slug: string; value: number; error?: string }>;
  computedAt: string;
  total: number;
}

function formatValue(value: number, unit: string): string {
  if (unit === 'dollars') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }
  if (unit === '%') {
    return `${value.toFixed(1)}%`;
  }
  return value.toLocaleString();
}

const CATEGORY_ORDER = ['production', 'throughput', 'p2', 'finance', 'inventory', 'operations', 'pipeline', 'Sales'];

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    production: 'Production',
    throughput: 'Throughput',
    p2: 'P2 / Purchase Orders',
    finance: 'Finance',
    inventory: 'Inventory',
    operations: 'Operations',
    pipeline: 'Pipeline',
    Sales: 'Sales',
  };
  return map[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

export default function MetricDirectory() {
  const registryQuery = useQuery<MetricRegistryResponse>({
    queryKey: ['/api/metrics/'],
    queryFn: async () => {
      const res = await fetch('/api/metrics/');
      if (!res.ok) throw new Error('Failed to fetch metric registry');
      return res.json();
    },
    staleTime: 60_000,
  });

  const slugs = registryQuery.data?.metrics.map((m) => m.slug) ?? [];

  const bulkQuery = useQuery<BulkSnapshotResponse>({
    queryKey: ['/api/metrics/bulk/snapshot', ...slugs],
    queryFn: async () => {
      if (slugs.length === 0) return { snapshot: {}, computedAt: new Date().toISOString(), total: 0 };
      const params = `?slugs=${slugs.join(',')}`;
      const res = await fetch(`/api/metrics/bulk/snapshot${params}`);
      if (!res.ok) throw new Error('Failed to fetch bulk metric snapshot');
      return res.json();
    },
    enabled: slugs.length > 0,
    staleTime: 30_000,
  });

  const metrics = registryQuery.data?.metrics ?? [];

  const grouped = metrics.reduce<Record<string, MetricRegistryEntry[]>>((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {});

  const categoryKeys = [
    ...CATEGORY_ORDER.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto space-y-8">

        <div className="border-b border-gray-200 dark:border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Metric Directory
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                All registered system metrics grouped by category
                {registryQuery.data && (
                  <span className="ml-2 text-gray-400 dark:text-gray-500">
                    ({registryQuery.data.total} total)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {registryQuery.isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {registryQuery.isError && (
          <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-300 text-sm">
            Failed to load metric registry. Please try refreshing.
          </div>
        )}

        {!registryQuery.isLoading && !registryQuery.isError && categoryKeys.map((cat) => (
          <section key={cat}>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
              {categoryLabel(cat)}
            </h2>

            <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-48">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-44">Slug</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-24">Unit</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Description</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-32">Live Value</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[cat].map((metric, idx) => {
                    const snap = bulkQuery.data?.snapshot[metric.slug];
                    const isLoading = bulkQuery.isLoading;
                    const hasError = snap && 'error' in snap && snap.error;

                    return (
                      <tr
                        key={metric.slug}
                        className={`border-b last:border-0 border-gray-100 dark:border-gray-800 ${
                          idx % 2 === 0
                            ? 'bg-white dark:bg-gray-900'
                            : 'bg-gray-50/50 dark:bg-gray-900/50'
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {metric.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                          {metric.slug}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                          {metric.unit}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs leading-relaxed">
                          {metric.description}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {isLoading ? (
                            <span className="inline-block w-10 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                          ) : hasError ? (
                            <span className="text-red-500 dark:text-red-400 text-xs">error</span>
                          ) : snap !== undefined ? (
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {formatValue(snap.value, metric.unit)}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

      </div>
    </div>
  );
}
