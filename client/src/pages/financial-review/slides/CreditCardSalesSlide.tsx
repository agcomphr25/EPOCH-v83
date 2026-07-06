import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import TrendSparkline, { type TrendPoint } from './TrendSparkline';

interface SummaryData {
  paymentAnalytics?: {
    reviewMonthKey: string;
    reviewMonthAmount: number;
    mtdAmount: number;
    transactionCount: number;
    fullMonthEstimate: number;
    elapsedDays: number;
    daysInMonth: number;
    source: string;
  };
  trends?: {
    creditCards?: TrendPoint[];
  };
}

function fmt(n: number | null | undefined) {
  if (n == null) return '-';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function CreditCardSalesSlide({ monthKey }: { monthKey?: string }) {
  const { data, isLoading } = useQuery<SummaryData>({
    queryKey: ['/api/financial-review/summary', monthKey, 'credit-card-slide'],
    queryFn: async () => {
      const suffix = monthKey ? `?monthKey=${encodeURIComponent(monthKey)}` : '';
      const res = await fetch(`/api/financial-review/summary${suffix}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load business review summary');
      return res.json();
    },
  });

  const analytics = data?.paymentAnalytics;
  const trend = data?.trends?.creditCards ?? [];
  const trendTotal = trend.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
  const trendAverage = trend.length > 0 ? trendTotal / trend.length : 0;
  const reviewPoint = trend.find((point) => point.month === analytics?.reviewMonthKey) ?? trend[trend.length - 1];

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Credit Card Sales</h2>
      <div className="h-1 w-16 bg-blue-500 rounded mb-6" />

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <div className="flex gap-6 mb-6">
            <div className="flex-[1.15] bg-blue-50 dark:bg-blue-900/30 rounded-lg px-6 py-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Review Month{reviewPoint?.label ? ` (${reviewPoint.label})` : ''}
              </div>
              <div className="text-4xl font-bold text-blue-600 dark:text-blue-300">{fmt(analytics?.reviewMonthAmount ?? reviewPoint?.value)}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Closed month total</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-6 py-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">Current MTD</div>
              <div className="text-3xl font-bold text-gray-700 dark:text-gray-200">
                {fmt(analytics?.mtdAmount)}
                <span className="ml-2 text-xl font-semibold text-gray-400">({fmt(analytics?.fullMonthEstimate)} est.)</span>
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {analytics?.transactionCount ?? 0} transaction{analytics?.transactionCount === 1 ? '' : 's'}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-6 py-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">6-Month Average</div>
              <div className="text-3xl font-bold text-gray-700 dark:text-gray-200">{fmt(trendAverage)}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Previous full months
              </div>
            </div>
          </div>

          <div className="flex-1">
            <TrendSparkline data={trend} color="#2563eb" valueFormatter={fmt} />
          </div>
        </>
      )}
      <div className="text-xs text-gray-400 mt-2 text-right">{analytics?.source ?? '/payment-analytics'}</div>
    </div>
  );
}
