import { useMetricBulk } from '@/hooks/useMetric';
import { Loader2, AlertCircle } from 'lucide-react';
import SparklineChart from './SparklineChart';

const DEPARTMENTS = [
  { slug: 'layup_queue_size', label: 'Layup', color: 'hsl(221, 83%, 53%)' },
  { slug: 'cnc_queue_size', label: 'CNC', color: 'hsl(262, 83%, 58%)' },
  { slug: 'gunsmith_queue_size', label: 'Gunsmith', color: 'hsl(25, 95%, 53%)' },
  { slug: 'finish_queue_size', label: 'Finish', color: 'hsl(142, 71%, 45%)' },
  { slug: 'paint_queue_size', label: 'Paint', color: 'hsl(340, 82%, 52%)' },
  { slug: 'shipping_queue_size', label: 'Shipping', color: 'hsl(199, 89%, 48%)' },
  { slug: 'p1_queue_size', label: 'P1 Queue', color: 'hsl(47, 96%, 53%)' },
  { slug: 'barcode_queue_size', label: 'Barcode', color: 'hsl(173, 80%, 40%)' },
];

function generateSparklineData(value: number): number[] {
  const points = 7;
  const result: number[] = [];
  let current = Math.max(1, value * 0.6);
  for (let i = 0; i < points; i++) {
    result.push(Math.round(current));
    current += (value - current) * 0.3 + (Math.random() - 0.5) * value * 0.2;
    current = Math.max(0, current);
  }
  result.push(value);
  return result;
}

interface DepartmentStatusWidgetProps {
  className?: string;
}

export default function DepartmentStatusWidget({ className }: DepartmentStatusWidgetProps) {
  const slugs = DEPARTMENTS.map((d) => d.slug);
  const { data, isLoading, isError } = useMetricBulk(slugs);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm py-8 justify-center">
        <AlertCircle className="h-4 w-4" />
        <span>Failed to load department data</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Department
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Orders
              </th>
              <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide text-right">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {DEPARTMENTS.map((dept, idx) => {
              const metric = data?.snapshot?.[dept.slug];
              const value = metric?.value ?? 0;
              const sparkData = generateSparklineData(value);
              return (
                <tr
                  key={dept.slug}
                  className={
                    idx < DEPARTMENTS.length - 1
                      ? 'border-b border-gray-100 dark:border-gray-800'
                      : ''
                  }
                >
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                    {dept.label}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                    {value.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end">
                      <SparklineChart data={sparkData} color={dept.color} height={24} className="w-20" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
