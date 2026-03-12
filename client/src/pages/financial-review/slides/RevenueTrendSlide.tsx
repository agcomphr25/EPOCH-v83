import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';

interface RevenueRow { month: string; revenue: string; }

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function RevenueTrendSlide() {
  const { data = [], isLoading } = useQuery<RevenueRow[]>({
    queryKey: ['/api/financial-review/live/revenue'],
  });

  const chartData = data.map((r) => ({
    month: format(parseISO(`${r.month}-01`), 'MMM yy'),
    revenue: Number(r.revenue),
  }));

  const total = chartData.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Credit Card Revenue Trend</h2>
      <div className="h-1 w-16 bg-blue-500 rounded mb-6" />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="flex gap-8 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg px-6 py-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">6-Month CC Revenue</div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">{fmt(total)}</div>
            </div>
          </div>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => fmt(v)} />
                <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, 'Revenue']} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === chartData.length - 1 ? '#2563eb' : '#93c5fd'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <div className="text-xs text-gray-400 mt-2 text-right">Live from EPOCH · Credit card payments only</div>
    </div>
  );
}
