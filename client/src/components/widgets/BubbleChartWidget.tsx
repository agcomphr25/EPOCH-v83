import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{d.name}</p>
      <p className="text-gray-500 dark:text-gray-400">Weekly Shipments: {d.weeklyShipments}</p>
      <p className="text-gray-500 dark:text-gray-400">Avg Price: ${d.avgPrice.toLocaleString()}</p>
      <p className="text-gray-500 dark:text-gray-400">Total Revenue: {formatCurrency(d.totalRevenue)}</p>
    </div>
  );
}

export default function BubbleChartWidget({ className }: BubbleChartWidgetProps) {
  const { data, isLoading, isError } = useQuery<{ bubbles: BubbleDataPoint[]; weeksAnalyzed: number }>({
    queryKey: ['/api/shipping/stock-model-bubbles'],
  });

  const bubbleData = data?.bubbles ?? [];
  const weeksAnalyzed = data?.weeksAnalyzed ?? 12;

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
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          Last {weeksAnalyzed} weeks
        </span>
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
                  <Cell key={idx} fill={BUBBLE_COLORS[idx % BUBBLE_COLORS.length]} fillOpacity={0.7} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
