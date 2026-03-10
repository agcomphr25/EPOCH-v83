import { useMetric } from '@/hooks/useMetric';
import { Loader2, AlertCircle, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThresholdRule {
  max: number;
  color: 'green' | 'yellow' | 'red';
}

interface SignalCardWidgetProps {
  metricSlug: string;
  title?: string;
  thresholds?: ThresholdRule[];
  invertSignal?: boolean;
  className?: string;
}

const defaultThresholds: ThresholdRule[] = [
  { max: 5, color: 'green' },
  { max: 15, color: 'yellow' },
  { max: Infinity, color: 'red' },
];

const colorConfig = {
  green: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-400',
    value: 'text-green-800 dark:text-green-300',
    icon: CheckCircle2,
  },
  yellow: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    value: 'text-amber-800 dark:text-amber-300',
    icon: AlertTriangle,
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-400',
    value: 'text-red-800 dark:text-red-300',
    icon: XCircle,
  },
};

export default function SignalCardWidget({
  metricSlug,
  title,
  thresholds = defaultThresholds,
  invertSignal = false,
  className,
}: SignalCardWidgetProps) {
  const { data, isLoading, isError } = useMetric(metricSlug);

  const displayTitle = title ?? data?.name ?? metricSlug;
  const value = data?.value ?? 0;

  const resolveColor = (v: number): 'green' | 'yellow' | 'red' => {
    const sorted = [...thresholds].sort((a, b) => a.max - b.max);
    for (const rule of sorted) {
      if (v <= rule.max) return rule.color;
    }
    return 'red';
  };

  const signalColor = invertSignal
    ? resolveColor(-value)
    : resolveColor(value);
  const config = colorConfig[signalColor];
  const SignalIcon = config.icon;

  return (
    <div
      className={cn(
        'rounded-xl border px-5 py-4 shadow-sm flex flex-col gap-2 transition-colors',
        config.bg,
        config.border,
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-semibold uppercase tracking-wide', config.text)}>
          {displayTitle}
        </span>
        <SignalIcon className={cn('h-5 w-5', config.text)} />
      </div>

      <div className="flex items-end gap-2">
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-gray-300 dark:text-gray-600" />
        ) : isError ? (
          <div className="flex items-center gap-1.5 text-red-500 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs">unavailable</span>
          </div>
        ) : (
          <span className={cn('text-3xl font-bold tabular-nums leading-none', config.value)}>
            {value.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
