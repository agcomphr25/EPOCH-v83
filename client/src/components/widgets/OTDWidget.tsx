import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Loader2, AlertCircle, CheckCircle2, XCircle, ExternalLink, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Order {
  orderId: string;
  dueDate?: string;
  status: string;
  shippedDate?: string;
  shippingCompletedAt?: string;
  updatedAt: string;
}

function getCompletionDate(order: Order): string | null {
  if (order.shippedDate) {
    return typeof order.shippedDate === 'string'
      ? order.shippedDate.split('T')[0]
      : new Date(order.shippedDate).toISOString().split('T')[0];
  }
  if (order.shippingCompletedAt) {
    return typeof order.shippingCompletedAt === 'string'
      ? order.shippingCompletedAt.split('T')[0]
      : new Date(order.shippingCompletedAt).toISOString().split('T')[0];
  }
  if (order.updatedAt) {
    return typeof order.updatedAt === 'string'
      ? order.updatedAt.split('T')[0]
      : new Date(order.updatedAt).toISOString().split('T')[0];
  }
  return null;
}

interface OTDWidgetProps {
  className?: string;
}

export default function OTDWidget({ className }: OTDWidgetProps) {
  const [, setLocation] = useLocation();
  const { data: orders = [], isLoading, isError } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
  });

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const completed = orders.filter((o) => {
      if (o.status !== 'SHIPPED' && o.status !== 'FULFILLED') return false;
      if (!o.dueDate) return false;
      const comp = getCompletionDate(o);
      if (!comp) return false;
      return comp >= monthStart && comp <= today;
    });

    let onTime = 0;
    let late = 0;
    for (const order of completed) {
      const comp = getCompletionDate(order)!;
      const due = order.dueDate.split('T')[0];
      if (comp <= due) {
        onTime++;
      } else {
        late++;
      }
    }

    const total = completed.length;
    const pct = total > 0 ? Math.round((onTime / total) * 100) : 0;

    return { total, onTime, late, pct };
  }, [orders]);

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
        <span>Failed to load OTD data</span>
      </div>
    );
  }

  const pctColor =
    stats.pct >= 95
      ? 'text-green-600 dark:text-green-400'
      : stats.pct >= 85
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';

  const barColor =
    stats.pct >= 95
      ? 'bg-green-500'
      : stats.pct >= 85
        ? 'bg-amber-500'
        : 'bg-red-500';

  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className={className}>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{monthLabel}</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setLocation('/otd-report')}>
            <ExternalLink className="h-3 w-3" />
            Full Report
          </Button>
        </div>

        <div className="flex items-end gap-3 mb-4">
          <span className={`text-4xl font-bold tabular-nums ${pctColor}`}>{stats.pct}%</span>
          <span className="text-sm text-muted-foreground mb-1">on-time delivery</span>
        </div>

        <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full mb-4 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${stats.pct}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground">Total</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <p className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">{stats.onTime}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">On Time</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-red-500" />
              <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{stats.late}</p>
            </div>
            <p className="text-[11px] text-muted-foreground">Late</p>
          </div>
        </div>
      </div>
    </div>
  );
}
