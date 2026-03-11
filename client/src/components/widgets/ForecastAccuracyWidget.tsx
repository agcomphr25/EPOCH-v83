import { useQuery } from '@tanstack/react-query';
import { Loader2, Target, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccuracyData {
  totalCompleted: number;
  totalWithForecasts: number;
  avgErrorDays: number;
  medianErrorDays: number;
  avgAbsErrorDays: number;
  withinOneDayPct: number;
  withinThreeDaysPct: number;
  withinFiveDaysPct: number;
  overestimatedPct: number;
  underestimatedPct: number;
}

export default function ForecastAccuracyWidget() {
  const { data, isLoading, isError } = useQuery<AccuracyData>({
    queryKey: ['/api/admin/forecast-accuracy'],
    refetchInterval: 300_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm flex items-center justify-center min-h-[160px]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm min-h-[160px]">
        <p className="text-sm text-gray-500 dark:text-gray-400">Unable to load forecast accuracy</p>
      </div>
    );
  }

  const hasData = data.totalWithForecasts > 0;
  const accuracy = data.withinThreeDaysPct;
  const avgErr = data.avgAbsErrorDays;

  let accentColor = 'text-green-600 dark:text-green-400';
  let bgAccent = 'bg-green-50 dark:bg-green-950/30';
  let borderAccent = 'border-green-200 dark:border-green-800';
  if (accuracy < 70) {
    accentColor = 'text-red-600 dark:text-red-400';
    bgAccent = 'bg-red-50 dark:bg-red-950/30';
    borderAccent = 'border-red-200 dark:border-red-800';
  } else if (accuracy < 85) {
    accentColor = 'text-amber-600 dark:text-amber-400';
    bgAccent = 'bg-amber-50 dark:bg-amber-950/30';
    borderAccent = 'border-amber-200 dark:border-amber-800';
  }

  return (
    <div className={cn('rounded-xl border p-5 shadow-sm', bgAccent, borderAccent)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className={cn('h-5 w-5', accentColor)} />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Forecast Accuracy
          </span>
        </div>
        <BarChart3 className="h-4 w-4 text-gray-400 dark:text-gray-500" />
      </div>

      {!hasData ? (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No forecast data yet
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Accuracy metrics appear after orders ship with forecasts
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Within 3 days
              </p>
              <p className={cn('text-3xl font-bold tabular-nums leading-none mt-1', accentColor)}>
                {accuracy}%
              </p>
            </div>
            <div className="flex-1" />
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">Avg error</p>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                {avgErr} days
              </p>
            </div>
          </div>

          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={cn('h-2 rounded-full transition-all', {
                'bg-green-500': accuracy >= 85,
                'bg-amber-500': accuracy >= 70 && accuracy < 85,
                'bg-red-500': accuracy < 70,
              })}
              style={{ width: `${Math.min(accuracy, 100)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500">Median</p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                {data.medianErrorDays}d
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center justify-center gap-0.5">
                <TrendingDown className="h-3 w-3" /> Early
              </p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                {data.overestimatedPct}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center justify-center gap-0.5">
                <TrendingUp className="h-3 w-3" /> Late
              </p>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                {data.underestimatedPct}%
              </p>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right">
            {data.totalWithForecasts} orders tracked
          </p>
        </div>
      )}
    </div>
  );
}
