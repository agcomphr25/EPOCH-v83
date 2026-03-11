import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Loader2, AlertCircle, ExternalLink, DollarSign, CreditCard, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';

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

interface PaymentAnalyticsWidgetProps {
  className?: string;
}

export default function PaymentAnalyticsWidget({ className }: PaymentAnalyticsWidgetProps) {
  const [, setLocation] = useLocation();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data, isLoading, isError } = useQuery<PaymentAnalyticsResponse>({
    queryKey: ['/api/finance/payment-analytics', month, year],
    queryFn: () => apiRequest(`/api/finance/payment-analytics?month=${month}&year=${year}&mtd=true`),
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

  return (
    <div className={className}>
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
            <div
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${phonePct}%` }}
            />
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${onlinePct}%` }}
            />
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
  );
}
