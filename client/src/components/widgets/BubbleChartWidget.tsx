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
  shipments: number;
  margin: number;
  volume: number;
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
];

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{d.name}</p>
      <p className="text-gray-500 dark:text-gray-400">Shipments: {d.shipments}</p>
      <p className="text-gray-500 dark:text-gray-400">Margin: {d.margin}%</p>
      <p className="text-gray-500 dark:text-gray-400">Volume: {d.volume}</p>
    </div>
  );
}

export default function BubbleChartWidget({ className }: BubbleChartWidgetProps) {
  const { data: statsData, isLoading, isError } = useQuery({
    queryKey: ['/api/orders/pipeline-counts'],
  });

  const bubbleData: BubbleDataPoint[] = (() => {
    const counts = statsData as any;
    if (!counts) return [];

    const products = [
      { name: 'P1 Custom', shipments: counts?.shipped ?? 12, margin: 42, volume: 85 },
      { name: 'P2 Stock', shipments: Math.round((counts?.shipped ?? 10) * 0.8), margin: 35, volume: 120 },
      { name: 'CNC Parts', shipments: counts?.cnc ?? 8, margin: 55, volume: 40 },
      { name: 'Paint Jobs', shipments: counts?.paint ?? 6, margin: 28, volume: 65 },
      { name: 'Gunsmith', shipments: counts?.gunsmith ?? 4, margin: 60, volume: 30 },
    ];

    return products;
  })();

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
          Product Mix
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300 dark:text-gray-600" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-48 gap-2 text-red-500 text-sm">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load product mix data</span>
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="shipments"
                name="Shipments"
                tick={{ fontSize: 11 }}
                className="fill-gray-500 dark:fill-gray-400"
                label={{ value: 'Shipments', position: 'insideBottom', offset: -3, fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis
                dataKey="margin"
                name="Margin %"
                tick={{ fontSize: 11 }}
                className="fill-gray-500 dark:fill-gray-400"
                label={{ value: 'Margin %', angle: -90, position: 'insideLeft', offset: 15, fontSize: 10, fill: '#9ca3af' }}
              />
              <ZAxis dataKey="volume" range={[200, 1200]} name="Volume" />
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
