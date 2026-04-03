import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';

type Timeframe = 'day' | 'week' | 'month';

interface DepartmentExitRow {
  department: string;
  count: number;
}

interface DepartmentExitsResponse {
  timeframe: Timeframe;
  data: DepartmentExitRow[];
}

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  day: 'Today',
  week: 'This Week',
  month: 'This Month',
};

interface DepartmentExitsWidgetProps {
  className?: string;
}

export default function DepartmentExitsWidget({ className }: DepartmentExitsWidgetProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('day');

  const { data, isLoading, isError } = useQuery<DepartmentExitsResponse>({
    queryKey: ['/api/reports/department-exits', timeframe],
    queryFn: async () => {
      const res = await fetch(`/api/reports/department-exits?timeframe=${timeframe}`);
      if (!res.ok) throw new Error('Failed to fetch department exits');
      return res.json();
    },
    staleTime: 30_000,
  });

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
        <span>Failed to load department exits data</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex justify-end mb-3">
        <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-medium">
          {(['day', 'week', 'month'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={
                tf === timeframe
                  ? 'px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 transition-colors'
                  : 'px-3 py-1.5 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
              }
            >
              {TIMEFRAME_LABELS[tf]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Department
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Exits
              </th>
            </tr>
          </thead>
          <tbody>
            {(data?.data ?? []).map((row, idx, arr) => (
              <tr
                key={row.department}
                className={idx < arr.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}
              >
                <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                  {row.department}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                  {row.count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
