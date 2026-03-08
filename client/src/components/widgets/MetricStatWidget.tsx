import { useMetric } from '@/hooks/useMetric';
import { Loader2, AlertCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricStatWidgetProps {
  metricSlug: string;
  title?: string;
  unit?: string;
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  onClick?: () => void;
}

export default function MetricStatWidget({
  metricSlug,
  title,
  unit,
  icon,
  className,
  valueClassName,
  trend,
  trendLabel,
  onClick,
}: MetricStatWidgetProps) {
  const { data, isLoading, isError } = useMetric(metricSlug);

  const displayTitle = title ?? data?.name ?? metricSlug;
  const displayUnit  = unit  ?? data?.unit  ?? '';

  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
        'px-5 py-4 shadow-sm flex flex-col gap-1',
        onClick && 'cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all',
        className,
      )}
      onClick={onClick}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-none">
          {displayTitle}
        </span>
        {icon ? (
          <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        ) : (
          <TrendingUp className="h-4 w-4 text-gray-300 dark:text-gray-600" />
        )}
      </div>

      {/* Value */}
      <div className="flex items-end gap-2">
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-gray-300 dark:text-gray-600" />
        ) : isError ? (
          <div className="flex items-center gap-1.5 text-red-500 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs">unavailable</span>
          </div>
        ) : (
          <>
            <span
              className={cn(
                'text-3xl font-bold tabular-nums leading-none text-gray-900 dark:text-gray-100',
                valueClassName,
              )}
            >
              {data?.value?.toLocaleString() ?? '—'}
            </span>
            {displayUnit && (
              <span className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 leading-tight">
                {displayUnit}
              </span>
            )}
          </>
        )}
      </div>

      {/* Trend label */}
      {trendLabel && !isLoading && !isError && (
        <div
          className={cn(
            'text-xs mt-0.5',
            trend === 'up'      && 'text-green-600 dark:text-green-400',
            trend === 'down'    && 'text-red-500 dark:text-red-400',
            trend === 'neutral' && 'text-gray-400',
            !trend              && 'text-gray-400',
          )}
        >
          {trendLabel}
        </div>
      )}
    </div>
  );
}
