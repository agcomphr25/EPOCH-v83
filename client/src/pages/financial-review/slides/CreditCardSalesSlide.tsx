import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';

interface RevenueRow { month: string; revenue: string; }

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function CreditCardSalesSlide() {
  const { data = [], isLoading } = useQuery<RevenueRow[]>({
    queryKey: ['/api/financial-review/live/revenue'],
  });

  const rows = data.map((r) => ({
    month: format(parseISO(`${r.month}-01`), 'MMMM yyyy'),
    revenue: Number(r.revenue),
  }));

  const total = rows.reduce((s, r) => s + r.revenue, 0);
  const avg = rows.length > 0 ? total / rows.length : 0;

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Credit Card Sales</h2>
      <div className="h-1 w-16 bg-blue-500 rounded mb-6" />

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <div className="flex gap-6 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg px-6 py-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">6-Month Total</div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">{fmt(total)}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-6 py-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">Monthly Average</div>
              <div className="text-3xl font-bold text-gray-700 dark:text-gray-200">{fmt(avg)}</div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-500 dark:text-gray-400">Month</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-500 dark:text-gray-400">CC Revenue</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-500 dark:text-gray-400">vs. Average</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const diff = row.revenue - avg;
                  const sign = diff >= 0 ? '+' : '';
                  return (
                    <tr key={row.month} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">{row.month}</td>
                      <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white">{fmt(row.revenue)}</td>
                      <td className={`py-3 px-4 text-right font-medium ${diff >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {sign}{fmt(Math.abs(diff))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="text-xs text-gray-400 mt-2 text-right">payments table</div>
    </div>
  );
}
