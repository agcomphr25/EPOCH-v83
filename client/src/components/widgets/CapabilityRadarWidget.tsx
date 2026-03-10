import { useMetricBulk } from '@/hooks/useMetric';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

interface DepartmentUtilization {
  department: string;
  utilization: number;
  capacity: number;
}

interface CapabilityRadarWidgetProps {
  className?: string;
}

const DEPARTMENT_SLUGS: { slug: string; label: string }[] = [
  { slug: 'layup_queue_size', label: 'Layup' },
  { slug: 'cnc_queue_size', label: 'CNC' },
  { slug: 'finish_queue_size', label: 'Finish' },
  { slug: 'paint_queue_size', label: 'Paint' },
  { slug: 'shipping_queue_size', label: 'Shipping' },
  { slug: 'gunsmith_queue_size', label: 'Quality' },
];

const CAPACITY_BENCHMARKS: Record<string, number> = {
  layup_queue_size: 30,
  cnc_queue_size: 25,
  finish_queue_size: 20,
  paint_queue_size: 20,
  shipping_queue_size: 25,
  gunsmith_queue_size: 15,
};

export default function CapabilityRadarWidget({ className }: CapabilityRadarWidgetProps) {
  const slugs = DEPARTMENT_SLUGS.map((d) => d.slug);
  const { data, isLoading, isError } = useMetricBulk(slugs);

  const cardClasses = cn(
    'rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
    'px-5 py-4 shadow-sm',
    className,
  );

  if (isLoading) {
    return (
      <div className={cn(cardClasses, 'flex items-center justify-center h-64')}>
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn(cardClasses, 'flex items-center justify-center h-64 text-red-500')}>
        <AlertCircle className="h-5 w-5 mr-2" />
        <span className="text-sm">Failed to load capability data</span>
      </div>
    );
  }

  const radarData: DepartmentUtilization[] = DEPARTMENT_SLUGS.map(({ slug, label }) => {
    const queueSize = data?.snapshot?.[slug]?.value ?? 0;
    const capacity = CAPACITY_BENCHMARKS[slug] ?? 20;
    const utilization = Math.min(Math.round((queueSize / capacity) * 100), 100);
    return {
      department: label,
      utilization,
      capacity: 100,
    };
  });

  return (
    <div className={cn(cardClasses, 'flex flex-col gap-3')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
          Capacity Utilization
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid className="stroke-gray-200 dark:stroke-gray-700" />
          <PolarAngleAxis
            dataKey="department"
            tick={{ fontSize: 11, fontWeight: 500 }}
            className="fill-gray-600 dark:fill-gray-300"
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 10 }}
            className="fill-gray-400 dark:fill-gray-500"
            tickFormatter={(v: number) => `${v}%`}
          />
          <Radar
            name="Capacity"
            dataKey="capacity"
            className="stroke-gray-300 dark:stroke-gray-600"
            fill="transparent"
            strokeDasharray="4 4"
          />
          <Radar
            name="Utilization"
            dataKey="utilization"
            stroke="hsl(221, 83%, 53%)"
            fill="hsl(221, 83%, 53%)"
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--background, #fff)',
              border: '1px solid var(--border, #e5e7eb)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => [`${value}%`, name]}
          />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
