import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface BubbleDataPoint {
  name: string;
  modelId: string;
  weeklyShipments: number;
  avgPrice: number;
  totalRevenue: number;
}

interface BubbleChartWidgetProps {
  className?: string;
}

const BUBBLE_COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(142, 71%, 45%)',
  'hsl(25, 95%, 53%)',
  'hsl(262, 83%, 58%)',
  'hsl(340, 75%, 55%)',
  'hsl(47, 96%, 53%)',
  'hsl(189, 94%, 43%)',
  'hsl(0, 72%, 51%)',
  'hsl(160, 60%, 45%)',
  'hsl(280, 60%, 50%)',
  'hsl(30, 80%, 55%)',
  'hsl(200, 70%, 50%)',
  'hsl(350, 65%, 48%)',
  'hsl(100, 55%, 45%)',
  'hsl(240, 60%, 55%)',
];

function formatCurrency(val: number) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val}`;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as BubbleDataPoint;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-xs shadow-xl backdrop-blur-sm">
      <p className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-2 border-b border-gray-100 dark:border-gray-800 pb-1.5">{d.name}</p>
      <div className="space-y-1">
        <p className="text-gray-600 dark:text-gray-400 flex justify-between gap-4">
          <span>Weekly Shipments</span>
          <span className="font-semibold text-gray-900 dark:text-gray-200">{d.weeklyShipments}</span>
        </p>
        <p className="text-gray-600 dark:text-gray-400 flex justify-between gap-4">
          <span>Avg Price</span>
          <span className="font-semibold text-gray-900 dark:text-gray-200">${d.avgPrice.toLocaleString()}</span>
        </p>
        <p className="text-gray-600 dark:text-gray-400 flex justify-between gap-4">
          <span>Total Revenue</span>
          <span className="font-semibold text-gray-900 dark:text-gray-200">{formatCurrency(d.totalRevenue)}</span>
        </p>
      </div>
    </div>
  );
}

export default function BubbleChartWidget({ className }: BubbleChartWidgetProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { timeRange, businessContext } = useDashboardFilters();

  const { data, isLoading, isError } = useQuery<{ bubbles: BubbleDataPoint[]; weeksAnalyzed: number }>({
    queryKey: ['/api/shipping/stock-model-bubbles', { timeRange, businessContext }],
    queryFn: async () => {
      const params = new URLSearchParams({ timeRange, businessContext });
      const res = await fetch(`/api/shipping/stock-model-bubbles?${params}`);
      if (!res.ok) throw new Error('Failed to fetch bubble data');
      return res.json();
    },
  });

  const bubbleData = data?.bubbles ?? [];
  const weeksAnalyzed = data?.weeksAnalyzed ?? 12;

  const timeLabel = timeRange === 'ytd' ? 'Year to Date' : timeRange === 'mtd' ? 'Month to Date' : `Last ${weeksAnalyzed} weeks`;

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
          Stock Model Popularity
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
          <span>Failed to load model data</span>
        </div>
      ) : bubbleData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
          No shipped orders with model data found
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="weeklyShipments"
                name="Weekly Shipments"
                tick={{ fontSize: 11 }}
                className="fill-gray-500 dark:fill-gray-400"
                label={{ value: 'Weekly Shipments', position: 'insideBottom', offset: -3, fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis
                dataKey="avgPrice"
                name="Avg Price ($)"
                tick={{ fontSize: 11 }}
                className="fill-gray-500 dark:fill-gray-400"
                label={{ value: 'Avg Price ($)', angle: -90, position: 'insideLeft', offset: 15, fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={(v) => `$${v}`}
              />
              <ZAxis dataKey="totalRevenue" range={[200, 1400]} name="Total Revenue" />
              <Tooltip content={<CustomTooltip />} />
              <Scatter data={bubbleData}>
                {bubbleData.map((_, idx) => (
                  <Cell key={idx} fill={BUBBLE_COLORS[idx % BUBBLE_COLORS.length]} fillOpacity={0.8} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[560px] sm:max-w-[640px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Stock Model Popularity</SheetTitle>
          </SheetHeader>
          <div className="mt-6 h-72">
            {bubbleData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="weeklyShipments" name="Weekly Shipments" tick={{ fontSize: 11 }} className="fill-gray-500 dark:fill-gray-400" />
                  <YAxis dataKey="avgPrice" name="Avg Price ($)" tick={{ fontSize: 11 }} className="fill-gray-500 dark:fill-gray-400" tickFormatter={(v) => `$${v}`} />
                  <ZAxis dataKey="totalRevenue" range={[200, 1400]} name="Total Revenue" />
                  <Tooltip content={<CustomTooltip />} />
                  <Scatter data={bubbleData}>
                    {bubbleData.map((_, idx) => (
                      <Cell key={idx} fill={BUBBLE_COLORS[idx % BUBBLE_COLORS.length]} fillOpacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400 text-xs uppercase">
                  <th className="text-left pb-2">Model</th>
                  <th className="text-right pb-2">Shipments/wk</th>
                  <th className="text-right pb-2">Avg Price</th>
                  <th className="text-right pb-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {bubbleData
                  .slice()
                  .sort((a, b) => b.totalRevenue - a.totalRevenue)
                  .map((d, idx) => (
                    <tr key={d.modelId} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-1.5 text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: BUBBLE_COLORS[idx % BUBBLE_COLORS.length] }} />
                        {d.name}
                      </td>
                      <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-gray-100">{d.weeklyShipments}</td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">${d.avgPrice.toLocaleString()}</td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{formatCurrency(d.totalRevenue)}</td>
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
