import { useQuery } from '@tanstack/react-query';
import { useMetric } from '@/hooks/useMetric';
import { Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import FlippableCard from './FlippableCard';

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
  enableFlip?: boolean;
}

interface HeroBacksideData {
  ytdShipments: number;
  lastMonthSameWeek: number;
  fourWeekAvg: number;
  avgRevenuePerStock: number;
}

function getProgressColor(pct: number): { gradient: string; text: string; bg: string } {
  if (pct >= 75) return { gradient: 'linear-gradient(90deg, #22c55e, #4ade80)', text: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' };
  if (pct >= 50) return { gradient: 'linear-gradient(90deg, #eab308, #facc15)', text: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' };
  return { gradient: 'linear-gradient(90deg, #ef4444, #f87171)', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' };
}

function getProjectedTotal(current: number, target: number): { projected: number; onPace: boolean } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const daysMap: Record<number, number> = { 3: 0, 4: 1, 5: 2, 6: 3, 0: 4, 1: 5, 2: 6 };
  const elapsedDays = (daysMap[dayOfWeek] ?? 0) + (hour / 24);
  const totalDays = 7;
  if (elapsedDays <= 0) return { projected: current, onPace: current >= target };
  const projected = Math.round((current / elapsedDays) * totalDays);
  return { projected, onPace: projected >= target };
}

function HeroFront({
  displayTitle,
  subtitle,
  icon,
  accentColor,
  value,
  target,
  displayUnit,
  trend,
  trendLabel,
  isLoading,
  isError,
  enableFlip,
}: {
  displayTitle: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accentColor: string;
  value: number;
  target?: number;
  displayUnit: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  isLoading: boolean;
  isError: boolean;
  enableFlip?: boolean;
}) {
  const progressPct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const progressColors = progressPct !== null ? getProgressColor(progressPct) : null;

  return (
    <div className="rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 px-6 py-5 shadow-sm flex flex-col gap-2 relative overflow-hidden h-full">
      <div className="absolute top-0 left-0 w-full h-1 rounded-t-xl" style={{ backgroundColor: accentColor }} />
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
          {displayTitle}
        </span>
        <div className="flex items-center gap-1.5">
          {enableFlip && (
            <RotateCcw className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
          )}
          {icon ? (
            <span className="text-gray-400 dark:text-gray-500">{icon}</span>
          ) : (
            <TrendingUp className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          )}
        </div>
      </div>

      {subtitle && (
        <div className="flex items-center gap-1.5 -mt-1">
          <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{subtitle}</span>
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
              <span className="text-sm text-gray-400 dark:text-gray-500 mb-1">{displayUnit}</span>
            ) : null}
          </div>
        )}
      </div>

      {progressPct !== null && progressColors && !isLoading && !isError && (
        <div className="flex flex-col gap-1.5 mt-1">
          <div className={cn('w-full rounded-lg overflow-hidden', progressColors.bg)} style={{ height: '12px' }}>
            <div
              className="h-full rounded-lg transition-all duration-500"
              style={{ width: `${progressPct}%`, background: progressColors.gradient }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className={cn('text-xs font-semibold', progressColors.text)}>
              {progressPct}% of target
            </span>
            {target && target > 0 && (() => {
              const { projected, onPace } = getProjectedTotal(value, target);
              return (
                <span className={cn(
                  'text-xs font-semibold',
                  onPace ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                )}>
                  Projected: {projected} {onPace ? '▲ On pace' : '▼ Behind pace'}
                </span>
              );
            })()}
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

function HeroBack({ accentColor, backsideData, isLoading }: { accentColor: string; backsideData?: HeroBacksideData; isLoading: boolean }) {
  const stats = [
    { label: 'YTD Shipments', value: backsideData?.ytdShipments ?? 0 },
    { label: 'Last Month Same Week', value: backsideData?.lastMonthSameWeek ?? 0 },
    { label: '4-Week Average', value: backsideData?.fourWeekAvg ?? 0 },
    { label: 'Avg Revenue / Stock', value: backsideData?.avgRevenuePerStock ?? 0, isCurrency: true },
  ];

  return (
    <div className="rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 px-6 py-5 shadow-sm flex flex-col gap-3 relative overflow-hidden h-full">
      <div className="absolute top-0 left-0 w-full h-1 rounded-t-xl" style={{ backgroundColor: accentColor }} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
          Shipping Insights
        </span>
        <RotateCcw className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300 dark:text-gray-600" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-1">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                {s.label}
              </span>
              <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {s.isCurrency ? `$${s.value.toLocaleString()}` : s.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  enableFlip = false,
}: HeroMetricWidgetProps) {
  const { businessContext } = useDashboardFilters();
  const { data, isLoading, isError } = useMetric(metricSlug);

  const { data: backsideData, isLoading: backsideLoading } = useQuery<HeroBacksideData>({
    queryKey: ['/api/shipping/hero-backside', { businessContext }],
    queryFn: async () => {
      const params = new URLSearchParams({ businessContext });
      const res = await fetch(`/api/shipping/hero-backside?${params}`);
      if (!res.ok) throw new Error('Failed to fetch hero backside');
      return res.json();
    },
    enabled: enableFlip,
  });

  const displayTitle = title ?? data?.name ?? metricSlug;
  const displayUnit = unit ?? data?.unit ?? '';
  const value = data?.value ?? 0;

  const frontContent = (
    <HeroFront
      displayTitle={displayTitle}
      subtitle={subtitle}
      icon={icon}
      accentColor={accentColor}
      value={value}
      target={target}
      displayUnit={displayUnit}
      trend={trend}
      trendLabel={trendLabel}
      isLoading={isLoading}
      isError={isError}
      enableFlip={enableFlip}
    />
  );

  if (!enableFlip) {
    return (
      <div className={cn(onClick && 'cursor-pointer', className)} onClick={onClick}>
        {frontContent}
      </div>
    );
  }

  const backContent = (
    <HeroBack accentColor={accentColor} backsideData={backsideData} isLoading={backsideLoading} />
  );

  return (
    <FlippableCard
      front={frontContent}
      back={backContent}
      className={className}
    />
  );
}
