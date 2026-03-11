import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Loader2, AlertCircle, ExternalLink, DollarSign, CreditCard, Globe, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

interface PaymentSummary {
  totalAmount: number;
  transactionCount: number;
  averagePerOrder: number;
}

interface PaymentBreakdown {
  phone: { amount: number; count: number; average: number };
  online: { amount: number; count: number; average: number };
}

interface PaymentAnalyticsResponse {
  summary: PaymentSummary;
  breakdown: PaymentBreakdown;
}

interface HistoricalEntry {
  id?: number;
  year: number;
  month: number;
  dataType: string;
  category: string;
  amount: string;
}

interface PaymentAnalyticsWidgetProps {
  className?: string;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtLong(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

export default function PaymentAnalyticsWidget({ className }: PaymentAnalyticsWidgetProps) {
  const [, setLocation] = useLocation();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const currentMonth = month;
  const currentYear = year;

  const { data, isLoading, isError } = useQuery<PaymentAnalyticsResponse>({
    queryKey: ['/api/finance/payment-analytics', month, year],
    queryFn: () => apiRequest(`/api/finance/payment-analytics?month=${month}&year=${year}&mtd=true`),
  });

  const { data: historicalRaw } = useQuery<HistoricalEntry[]>({
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
        <span>Failed to load payment data</span>
      </div>
    );
  }

  const summary = data?.summary ?? { totalAmount: 0, transactionCount: 0, averagePerOrder: 0 };
  const breakdown = data?.breakdown ?? {
    phone: { amount: 0, count: 0, average: 0 },
    online: { amount: 0, count: 0, average: 0 },
  };

  const monthLabel = now.toLocaleDateString('en-US', { month: 'long' });

  const fmt = (val: number) =>
    val >= 1000
      ? `$${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k`
      : `$${val.toFixed(0)}`;

  const phonePct = summary.totalAmount > 0 ? Math.round((breakdown.phone.amount / summary.totalAmount) * 100) : 0;
  const onlinePct = 100 - phonePct;

  // ── CC Processing hover data ──────────────────────────────────────────────
  const ccEntries = (historicalRaw ?? []).filter(e => e.dataType === 'credit_card');

  const getAmt = (y: number, m: number, cat: string) => {
    const e = ccEntries.find(r => r.year === y && r.month === m && r.category === cat);
    return parseFloat(e?.amount ?? '0') || 0;
  };

  const ytdOnline = Array.from({ length: currentMonth }, (_, i) => getAmt(currentYear, i + 1, 'online')).reduce((a, b) => a + b, 0);
  const ytdPhone = Array.from({ length: currentMonth }, (_, i) => getAmt(currentYear, i + 1, 'phone')).reduce((a, b) => a + b, 0);
  const ytdTotal = ytdOnline + ytdPhone;

  const prevYearTotal =
    Array.from({ length: currentMonth }, (_, i) => getAmt(currentYear - 1, i + 1, 'online')).reduce((a, b) => a + b, 0) +
    Array.from({ length: currentMonth }, (_, i) => getAmt(currentYear - 1, i + 1, 'phone')).reduce((a, b) => a + b, 0);

  const ytdChange = prevYearTotal > 0 ? ((ytdTotal - prevYearTotal) / prevYearTotal) * 100 : null;

  const recentMonths: { month: number; year: number }[] = [];
  for (let i = 0; i < 4; i++) {
    let m = currentMonth - i;
    let y = currentYear;
    if (m <= 0) { m += 12; y -= 1; }
    recentMonths.push({ month: m, year: y });
  }
  recentMonths.reverse();

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className={cn('cursor-default', className)}>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} MTD</span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setLocation('/payment-analytics')}>
                <ExternalLink className="h-3 w-3" />
                Full Report
              </Button>
            </div>

            <div className="flex items-end gap-3 mb-1">
              <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                ${summary.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {summary.transactionCount} transaction{summary.transactionCount !== 1 ? 's' : ''}
              {summary.transactionCount > 0 && ` · avg ${fmt(summary.averagePerOrder)}`}
            </p>

            {summary.totalAmount > 0 && (
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full mb-4 overflow-hidden flex">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${phonePct}%` }} />
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${onlinePct}%` }} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <CreditCard className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300">Phone</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {fmt(breakdown.phone.amount)}
                </p>
                <p className="text-[11px] text-muted-foreground">{breakdown.phone.count} txn</p>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Globe className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Online</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {fmt(breakdown.online.amount)}
                </p>
                <p className="text-[11px] text-muted-foreground">{breakdown.online.count} txn</p>
              </div>
            </div>
          </div>
        </div>
      </HoverCardTrigger>

      <HoverCardContent side="right" align="start" className="w-80 p-4 shadow-xl">
        <div className="flex flex-col gap-3">
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
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-2.5 text-center">
              <Globe className="h-3.5 w-3.5 mx-auto mb-1 text-blue-500" />
              <div className="text-[10px] text-gray-500 mb-0.5">Online</div>
              <div className="text-xs font-bold text-blue-700 dark:text-blue-300">{fmtLong(ytdOnline)}</div>
            </div>
            <div className="rounded-lg bg-violet-50 dark:bg-violet-950 p-2.5 text-center">
              <Phone className="h-3.5 w-3.5 mx-auto mb-1 text-violet-500" />
              <div className="text-[10px] text-gray-500 mb-0.5">Phone</div>
              <div className="text-xs font-bold text-violet-700 dark:text-violet-300">{fmtLong(ytdPhone)}</div>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-950 p-2.5 text-center">
              <CreditCard className="h-3.5 w-3.5 mx-auto mb-1 text-green-500" />
              <div className="text-[10px] text-gray-500 mb-0.5">Total</div>
              <div className="text-xs font-bold text-green-700 dark:text-green-300">{fmtLong(ytdTotal)}</div>
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

          <div>
            <div className="text-[10px] text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Recent Months</div>
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
                {recentMonths.map(({ month: m, year: y }) => {
                  const online = getAmt(y, m, 'online');
                  const phone = getAmt(y, m, 'phone');
                  const total = online + phone;
                  const isCurrent = m === currentMonth && y === currentYear;
                  return (
                    <tr
                      key={`${y}-${m}`}
                      className={cn(
                        'border-b border-gray-50 dark:border-gray-900',
                        isCurrent && 'font-semibold'
                      )}
                    >
                      <td className="py-1.5 text-gray-600 dark:text-gray-300">
                        {MONTH_ABBR[m - 1]}{y !== currentYear ? ` ${y}` : ''}
                      </td>
                      <td className="py-1.5 text-right text-blue-600 dark:text-blue-400">
                        {online > 0 ? fmtLong(online) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-1.5 text-right text-violet-600 dark:text-violet-400">
                        {phone > 0 ? fmtLong(phone) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">
                        {total > 0 ? fmtLong(total) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
