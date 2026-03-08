import { useMetricBulk } from '@/hooks/useMetric';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricStatGroupProps {
  slugs: string[];
  label?: string;
  className?: string;
}

export default function MetricStatGroup({ slugs, label, className }: MetricStatGroupProps) {
  const { data, isLoading, isError } = useMetricBulk(slugs);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && (
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-0.5">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-3">
        {slugs.map((slug) => {
          const entry = data?.snapshot?.[slug];
          return (
            <div
              key={slug}
              className="flex-1 min-w-[120px] rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 px-4 py-3 shadow-sm"
            >
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 truncate">
                {entry?.name ?? slug}
              </div>
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-gray-300 dark:text-gray-600" />
              ) : isError ? (
                <div className="flex items-center gap-1 text-red-400 text-xs">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>unavailable</span>
                </div>
              ) : (
                <div className="flex items-end gap-1.5">
                  <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100 leading-none">
                    {entry?.value?.toLocaleString() ?? '—'}
                  </span>
                  {entry?.unit && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
                      {entry.unit}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
