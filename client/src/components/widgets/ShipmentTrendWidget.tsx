import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Loader2, AlertCircle, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface WeekData {
  week: string;
  shipped: number;
  movingAvg: number | null;
}

interface WeeklyHistoryEntry {
  operationalWeek: number;
  operationalYear: number;
  weekLabel: string;
  dateRange: string;
  shipped: number;
}

interface ShipmentTrendWidgetProps {
  className?: string;
  weeks?: number;
}

function computeMovingAverage(data: { shipped: number }[], window: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < window - 1) return null;
    const slice = data.slice(i - window + 1, i + 1);
    const sum = slice.reduce((acc, d) => acc + d.shipped, 0);
    return Math.round((sum / window) * 10) / 10;
  });
}

export default function ShipmentTrendWidget({ className, weeks = 8 }: ShipmentTrendWidgetProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { timeRange, businessContext } = useDashboardFilters();

  const { data: historyData, isLoading, isError } = useQuery<{ weeks: WeeklyHistoryEntry[] }>({
    queryKey: ['/api/shipping/weekly-history', { timeRange, businessContext }],
    queryFn: async () => {
      const params = new URLSearchParams({ timeRange, businessContext });
      const res = await fetch(`/api/shipping/weekly-history?${params}`);
      if (!res.ok) throw new Error('Failed to fetch weekly history');
      return res.json();
    },
  });

  const chartData: WeekData[] = useMemo(() => {
    if (!historyData?.weeks?.length) return [];

    const weekEntries = historyData.weeks.slice(-weeks);

    const rawData = weekEntries.map((w) => ({
      week: w.weekLabel,
      shipped: w.shipped,
      movingAvg: null as number | null,
    }));

    const avgs = computeMovingAverage(rawData, 4);
    rawData.forEach((w, i) => {
      w.movingAvg = avgs[i];
    });

    return rawData;
  }, [historyData, weeks]);

  const displayedWeeks = chartData.length;
  const timeLabel = timeRange === 'ytd' ? 'Year to Date' : timeRange === 'mtd' ? 'Month to Date' : `Last ${displayedWeeks} Weeks`;

  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
        'px-5 py-4 shadow-sm flex flex-col gap-3',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
          Weekly Shipment Trend
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {timeLabel}{businessContext !== 'company' ? ` · ${businessContext.toUpperCase()}` : ''}
          </span>
          <button
            onClick={() => setSheetOpen(true)}
            title="Open details"
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300 dark:text-gray-600" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-48 gap-2 text-red-500 text-sm">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load shipment data</span>
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11 }}
                className="fill-gray-500 dark:fill-gray-400"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="fill-gray-500 dark:fill-gray-400"
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--background, #fff)',
                  border: '1px solid var(--border, #e5e7eb)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar
                dataKey="shipped"
                name="Shipped"
                fill="hsl(221, 83%, 53%)"
                radius={[4, 4, 0, 0]}
                barSize={18}
              />
              <Line
                dataKey="movingAvg"
                name="4-Week Avg"
                type="monotone"
                stroke="hsl(25, 95%, 53%)"
                strokeWidth={3}
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[600px] sm:max-w-[700px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Weekly Shipment Trend</SheetTitle>
          </SheetHeader>
          <div className="mt-6 h-80">
            {chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} className="fill-gray-500 dark:fill-gray-400" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-gray-500 dark:fill-gray-400" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--background, #fff)',
                      border: '1px solid var(--border, #e5e7eb)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="shipped" name="Shipped" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} barSize={24} />
                  <Line dataKey="movingAvg" name="4-Week Avg" type="monotone" stroke="hsl(25, 95%, 53%)" strokeWidth={3} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400 text-xs uppercase">
                  <th className="text-left pb-2">Week</th>
                  <th className="text-right pb-2">Shipped</th>
                  <th className="text-right pb-2">4-Wk Avg</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => (
                  <tr key={row.week} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 text-gray-700 dark:text-gray-300">{row.week}</td>
                    <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-gray-100">{row.shipped}</td>
                    <td className="py-1.5 text-right text-gray-500 dark:text-gray-400">{row.movingAvg ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
