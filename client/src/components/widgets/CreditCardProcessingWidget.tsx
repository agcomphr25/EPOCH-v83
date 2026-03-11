import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Loader2, AlertCircle, CreditCard, Globe, Phone, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistoricalEntry {
  id?: number;
  year: number;
  month: number;
  dataType: string;
  category: string;
  amount: string;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

interface Props {
  className?: string;
}

export default function CreditCardProcessingWidget({ className }: Props) {
  const [, setLocation] = useLocation();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { data: raw, isLoading, isError } = useQuery<HistoricalEntry[]>({
    queryKey: ['/api/historical-data'],
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
        <span>Failed to load credit card data</span>
      </div>
    );
  }

  const ccEntries = (raw ?? []).filter(e => e.dataType === 'credit_card');

  const getAmount = (year: number, month: number, category: string) => {
    const e = ccEntries.find(r => r.year === year && r.month === month && r.category === category);
    return parseFloat(e?.amount ?? '0') || 0;
  };

  const ytdOnline = Array.from({ length: currentMonth }, (_, i) =>
    getAmount(currentYear, i + 1, 'online')).reduce((a, b) => a + b, 0);
  const ytdPhone = Array.from({ length: currentMonth }, (_, i) =>
    getAmount(currentYear, i + 1, 'phone')).reduce((a, b) => a + b, 0);
  const ytdTotal = ytdOnline + ytdPhone;

  const prevYearOnline = Array.from({ length: currentMonth }, (_, i) =>
    getAmount(currentYear - 1, i + 1, 'online')).reduce((a, b) => a + b, 0);
  const prevYearPhone = Array.from({ length: currentMonth }, (_, i) =>
    getAmount(currentYear - 1, i + 1, 'phone')).reduce((a, b) => a + b, 0);
  const prevYearTotal = prevYearOnline + prevYearPhone;

  const ytdChange = prevYearTotal > 0
    ? ((ytdTotal - prevYearTotal) / prevYearTotal) * 100
    : null;

  const recentMonths: { month: number; year: number }[] = [];
  for (let i = 0; i < 4; i++) {
    let m = currentMonth - i;
    let y = currentYear;
    if (m <= 0) { m += 12; y -= 1; }
    recentMonths.push({ month: m, year: y });
  }
  recentMonths.reverse();

  return (
    <div className={cn('flex flex-col gap-4 h-full', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            CC Processing — {currentYear} YTD
          </span>
        </div>
        <button
          onClick={() => setLocation('/historical-data')}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Full View
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 text-center">
          <Globe className="h-4 w-4 mx-auto mb-1 text-blue-500" />
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Online</div>
          <div className="text-sm font-bold text-blue-700 dark:text-blue-300">{fmt(ytdOnline)}</div>
        </div>
        <div className="rounded-lg bg-violet-50 dark:bg-violet-950 p-3 text-center">
          <Phone className="h-4 w-4 mx-auto mb-1 text-violet-500" />
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Phone</div>
          <div className="text-sm font-bold text-violet-700 dark:text-violet-300">{fmt(ytdPhone)}</div>
        </div>
        <div className="rounded-lg bg-green-50 dark:bg-green-950 p-3 text-center">
          <CreditCard className="h-4 w-4 mx-auto mb-1 text-green-500" />
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Total</div>
          <div className="text-sm font-bold text-green-700 dark:text-green-300">{fmt(ytdTotal)}</div>
        </div>
      </div>

      {ytdChange !== null && (
        <div className={cn(
          'text-xs text-center font-medium rounded-md py-1',
          ytdChange >= 0
            ? 'text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-950'
            : 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950'
        )}>
          {ytdChange >= 0 ? '▲' : '▼'} {Math.abs(ytdChange).toFixed(1)}% vs {currentYear - 1} same period
        </div>
      )}

      <div className="mt-auto">
        <div className="text-xs text-gray-400 mb-1.5 font-medium">Recent Months</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="py-1 text-left text-gray-400 font-medium">Month</th>
              <th className="py-1 text-right text-gray-400 font-medium">Online</th>
              <th className="py-1 text-right text-gray-400 font-medium">Phone</th>
              <th className="py-1 text-right text-gray-400 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {recentMonths.map(({ month, year }) => {
              const online = getAmount(year, month, 'online');
              const phone = getAmount(year, month, 'phone');
              const total = online + phone;
              const isCurrent = month === currentMonth && year === currentYear;
              return (
                <tr
                  key={`${year}-${month}`}
                  className={cn(
                    'border-b border-gray-50 dark:border-gray-900',
                    isCurrent && 'font-semibold'
                  )}
                >
                  <td className="py-1.5 text-gray-600 dark:text-gray-300">
                    {MONTH_ABBR[month - 1]} {year !== currentYear ? year : ''}
                  </td>
                  <td className="py-1.5 text-right text-blue-600 dark:text-blue-400">
                    {online > 0 ? fmt(online) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-1.5 text-right text-violet-600 dark:text-violet-400">
                    {phone > 0 ? fmt(phone) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">
                    {total > 0 ? fmt(total) : <span className="text-gray-300">—</span>}
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
