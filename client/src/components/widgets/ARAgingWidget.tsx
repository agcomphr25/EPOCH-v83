import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Loader2, AlertCircle, DollarSign, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgingSummary {
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total_ar: number;
}

interface CustomerAging {
  customerId: string;
  customerName: string;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
}

function fmt(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(val);
}

function pct(part: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

interface BucketRowProps {
  label: string;
  amount: number;
  total: number;
  color: string;
  barColor: string;
}

function BucketRow({ label, amount, total, color, barColor }: BucketRowProps) {
  const ratio = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 text-xs text-gray-500 dark:text-gray-400 shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(ratio, 100)}%` }}
        />
      </div>
      <div className={cn('text-xs font-semibold w-20 text-right shrink-0', color)}>
        {fmt(amount)}
      </div>
      <div className="text-xs text-gray-400 w-9 text-right shrink-0">{pct(amount, total)}</div>
    </div>
  );
}

interface Props {
  className?: string;
}

export default function ARAgingWidget({ className }: Props) {
  const [, setLocation] = useLocation();

  const { data: aging, isLoading: loadingAging } = useQuery<AgingSummary>({
    queryKey: ['/api/ar-invoices/aging'],
  });

  const { data: byCustomer = [], isLoading: loadingCustomers } = useQuery<CustomerAging[]>({
    queryKey: ['/api/ar-invoices/aging/by-customer'],
  });

  const isLoading = loadingAging || loadingCustomers;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!aging) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm py-8 justify-center">
        <AlertCircle className="h-4 w-4" />
        <span>Failed to load AR aging data</span>
      </div>
    );
  }

  const pastDue = aging.days_1_30 + aging.days_31_60 + aging.days_61_90 + aging.days_90_plus;
  const pastDuePct = aging.total_ar > 0 ? Math.round((pastDue / aging.total_ar) * 100) : 0;

  const topCustomers = [...byCustomer]
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  const buckets = [
    { label: 'Current', amount: aging.current, color: 'text-green-700 dark:text-green-400', barColor: 'bg-green-500' },
    { label: '1–30 d', amount: aging.days_1_30, color: 'text-yellow-700 dark:text-yellow-400', barColor: 'bg-yellow-400' },
    { label: '31–60 d', amount: aging.days_31_60, color: 'text-orange-700 dark:text-orange-400', barColor: 'bg-orange-500' },
    { label: '61–90 d', amount: aging.days_61_90, color: 'text-red-600 dark:text-red-400', barColor: 'bg-red-500' },
    { label: '90+ d', amount: aging.days_90_plus, color: 'text-red-800 dark:text-red-300', barColor: 'bg-red-700' },
  ];

  return (
    <div className={cn('flex flex-col gap-3 h-full', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            AR Aging
          </span>
        </div>
        <button
          onClick={() => setLocation('/finance/ar-aging')}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Full View
        </button>
      </div>

      <div className="flex items-end justify-between rounded-lg bg-emerald-50 dark:bg-emerald-950 px-3 py-2.5">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Total Outstanding</div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{fmt(aging.total_ar)}</div>
        </div>
        {pastDue > 0 && (
          <div className="text-right">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Past Due</div>
            <div className={cn(
              'text-sm font-semibold',
              pastDuePct >= 50 ? 'text-red-600 dark:text-red-400' :
              pastDuePct >= 20 ? 'text-orange-600 dark:text-orange-400' :
              'text-yellow-700 dark:text-yellow-400'
            )}>
              {fmt(pastDue)}{' '}
              <span className="text-xs font-normal opacity-70">({pastDuePct}%)</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {buckets.map(b => (
          <BucketRow
            key={b.label}
            label={b.label}
            amount={b.amount}
            total={aging.total_ar}
            color={b.color}
            barColor={b.barColor}
          />
        ))}
      </div>

      {topCustomers.length > 0 && (
        <div className="mt-auto">
          <div className="text-xs text-gray-400 mb-1.5 font-medium">Top Balances</div>
          <table className="w-full text-xs">
            <tbody>
              {topCustomers.map(c => (
                <tr key={c.customerId} className="border-b border-gray-50 dark:border-gray-900 last:border-0">
                  <td className="py-1 text-gray-600 dark:text-gray-300 truncate max-w-[100px]">{c.customerName}</td>
                  <td className="py-1 text-right font-semibold text-gray-800 dark:text-gray-100">{fmt(c.total)}</td>
                  <td className="py-1 text-right pl-2">
                    {c.days_90_plus > 0 ? (
                      <span className="text-red-600 dark:text-red-400">{fmt(c.days_90_plus)} 90d+</span>
                    ) : c.days_61_90 > 0 ? (
                      <span className="text-orange-500 dark:text-orange-400">{fmt(c.days_61_90)} 61-90d</span>
                    ) : c.days_31_60 > 0 ? (
                      <span className="text-yellow-600 dark:text-yellow-400">{fmt(c.days_31_60)} 31-60d</span>
                    ) : (
                      <span className="text-green-600 dark:text-green-400">Current</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
