import { useMetric } from '@/hooks/useMetric';
import { Loader2, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeroMetricWidgetProps {
  metricSlug: string;
  title?: string;
  subtitle?: string;
  unit?: string;
  icon?: React.ReactNode;
  className?: string;
  accentColor?: string;
  target?: number;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  onClick?: () => void;
}

function getProgressColor(pct: number): { bar: string; text: string; bg: string } {
  if (pct >= 75) return { bar: 'bg-green-500', text: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' };
  if (pct >= 50) return { bar: 'bg-yellow-500', text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' };
  return { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' };
}

export default function HeroMetricWidget({
  metricSlug,
  title,
  subtitle,
  unit,
  icon,
  className,
  accentColor = 'hsl(221, 83%, 53%)',
  target,
  trend,
  trendLabel,
  onClick,
}: HeroMetricWidgetProps) {
  const { data, isLoading, isError } = useMetric(metricSlug);

  const displayTitle = title ?? data?.name ?? metricSlug;
  const displayUnit = unit ?? data?.unit ?? '';
  const value = data?.value ?? 0;
  const progressPct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const progressColors = progressPct !== null ? getProgressColor(progressPct) : null;

  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
        'px-6 py-5 shadow-sm flex flex-col gap-2 relative overflow-hidden',
        onClick && 'cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all',
        className,
      )}
      onClick={onClick}
    >
      <div
        className="absolute top-0 left-0 w-full h-1 rounded-t-xl"
        style={{ backgroundColor: accentColor }}
      />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
          {displayTitle}
        </span>
        {icon ? (
          <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        ) : (
          <TrendingUp className="h-5 w-5 text-gray-300 dark:text-gray-600" />
        )}
      </div>

      {subtitle && (
        <div className="flex items-center gap-1.5 -mt-1">
          <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
            {subtitle}
          </span>
        </div>
      )}

      <div className="flex items-end gap-3 mt-1">
        {isLoading ? (
          <Loader2 className="h-8 w-8 animate-spin text-gray-300 dark:text-gray-600" />
        ) : isError ? (
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>unavailable</span>
          </div>
        ) : (
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-extrabold tabular-nums leading-none text-gray-900 dark:text-gray-100">
              {value.toLocaleString()}
            </span>
            {target && target > 0 ? (
              <span className="text-lg font-semibold text-gray-400 dark:text-gray-500">
                / {target.toLocaleString()} goal
              </span>
            ) : displayUnit ? (
              <span className="text-sm text-gray-400 dark:text-gray-500 mb-1">
                {displayUnit}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {progressPct !== null && progressColors && !isLoading && !isError && (
        <div className="flex flex-col gap-1.5 mt-1">
          <div className={cn('w-full h-3 rounded-full overflow-hidden', progressColors.bg)}>
            <div
              className={cn('h-full rounded-full transition-all duration-500', progressColors.bar)}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className={cn('text-xs font-semibold', progressColors.text)}>
              {progressPct}% of target
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {progressPct >= 75 ? 'On pace' : progressPct >= 50 ? 'At risk' : 'Behind pace'}
            </span>
          </div>
        </div>
      )}

      {trendLabel && !isLoading && !isError && (
        <div
          className={cn(
            'flex items-center gap-1.5 mt-1 px-2 py-1 rounded-md w-fit',
            trend === 'up' && 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
            trend === 'down' && 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400',
            trend === 'neutral' && 'bg-gray-50 dark:bg-gray-800 text-gray-400',
            !trend && 'bg-gray-50 dark:bg-gray-800 text-gray-400',
          )}
        >
          <TrendIcon className="h-4 w-4" />
          <span className="text-xs font-semibold">{trendLabel}</span>
        </div>
      )}
    </div>
  );
}
