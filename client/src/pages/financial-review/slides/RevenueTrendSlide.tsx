import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import TrendSparkline, { type TrendPoint } from './TrendSparkline';

interface SummaryData {
  trends?: {
    creditCards?: TrendPoint[];
  };
}

function fmt(n: number | null | undefined) {
  if (n == null) return '-';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function RevenueTrendSlide({ monthKey }: { monthKey?: string }) {
  const { data, isLoading } = useQuery<SummaryData>({
    queryKey: ['/api/financial-review/summary', monthKey, 'credit-card-trend-slide'],
    queryFn: async () => {
      const suffix = monthKey ? `?monthKey=${encodeURIComponent(monthKey)}` : '';
      const res = await fetch(`/api/financial-review/summary${suffix}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load business review summary');
      return res.json();
    },
  });

  const trend = data?.trends?.creditCards ?? [];
  const total = trend.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
  const first = trend.find((point) => typeof point.value === 'number')?.value;
  const last = [...trend].reverse().find((point) => typeof point.value === 'number')?.value;
  const change = first && last != null ? ((last - first) / first) * 100 : null;

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Credit Card Revenue Trend</h2>
      <div className="h-1 w-16 bg-blue-500 rounded mb-6" />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="flex gap-8 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg px-6 py-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">6-Month CC Revenue</div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">{fmt(total)}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-6 py-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">First to Latest</div>
              <div className={`text-3xl font-bold ${change != null && change >= 0 ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'}`}>
                {change == null ? '-' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}
              </div>
            </div>
          </div>
          <div className="flex-1">
            <TrendSparkline data={trend} color="#2563eb" valueFormatter={fmt} />
          </div>
        </>
      )}
      <div className="text-xs text-gray-400 mt-2 text-right">/payment-analytics</div>
    </div>
  );
}
