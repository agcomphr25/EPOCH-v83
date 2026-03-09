import { useQuery, UseQueryOptions } from '@tanstack/react-query';

export interface MetricResult {
  metric: string;
  name: string;
  value: number;
  unit: string;
  category: string;
  defaultVisual: string;
  isLive: boolean;
  computedAt: string;
}

export interface BulkSnapshotResult {
  snapshot: Record<string, MetricResult & { slug: string }>;
  computedAt: string;
  total: number;
}

export function useMetric(
  slug: string,
  options?: Omit<UseQueryOptions<MetricResult>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<MetricResult>({
    queryKey: ['metric', slug],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/${slug}`);
      if (!res.ok) throw new Error(`Metric fetch failed for: ${slug}`);
      return res.json();
    },
    staleTime: 30_000,
    ...options,
  });
}

export function useMetricBulk(
  slugs: string[],
  options?: Omit<UseQueryOptions<BulkSnapshotResult>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<BulkSnapshotResult>({
    queryKey: ['metric', 'bulk', ...slugs],
    queryFn: async () => {
      const params = slugs.length ? `?slugs=${slugs.join(',')}` : '';
      const res = await fetch(`/api/metrics/bulk/snapshot${params}`);
      if (!res.ok) throw new Error('Bulk metric fetch failed');
      return res.json();
    },
    staleTime: 30_000,
    ...options,
  });
}
