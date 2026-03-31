import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, ChevronDown, ChevronRight, DollarSign, Calendar, User, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/queryClient';

interface BatchSummary {
  id: number;
  createdAt: string;
  createdBy: string;
  customerId: string;
  totalAmount: number;
  paymentMethod: string;
  notes: string | null;
  orderCount: number;
}

interface BatchPayment {
  paymentId: number;
  orderId: string;
  paymentAmount: number;
  paymentDate: string;
  paymentType: string;
  notes: string | null;
}

interface BatchDetail {
  batch: {
    id: number;
    createdAt: string;
    createdBy: string;
    customerId: string;
    totalAmount: number;
    paymentMethod: string;
    notes: string | null;
  };
  payments: BatchPayment[];
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const methodLabel = (method: string) => {
  const labels: Record<string, string> = {
    credit_card: 'Credit Card',
    cash: 'Cash',
    check: 'Check',
    ach: 'ACH',
    wire: 'Wire',
    agr: 'AGR',
  };
  return labels[method] || method;
};

const methodVariant = (method: string): 'default' | 'secondary' | 'outline' => {
  if (method === 'credit_card') return 'default';
  if (method === 'cash' || method === 'check') return 'secondary';
  return 'outline';
};

function BatchRow({ batch }: { batch: BatchSummary }) {
  const [expanded, setExpanded] = useState(false);

  const { data: detail, isLoading: loadingDetail } = useQuery<BatchDetail>({
    queryKey: ['/api/payments/batches', batch.id],
    queryFn: () => apiRequest(`/api/payments/batches/${batch.id}`),
    enabled: expanded,
  });

  return (
    <>
      <tr
        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-4 py-3 w-8">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(batch.createdAt)}
        </td>
        <td className="px-4 py-3 text-sm font-medium">
          {batch.customerId}
        </td>
        <td className="px-4 py-3">
          <Badge variant={methodVariant(batch.paymentMethod)}>
            {methodLabel(batch.paymentMethod)}
          </Badge>
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-right">
          {formatCurrency(batch.totalAmount)}
        </td>
        <td className="px-4 py-3 text-sm text-center">
          <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
            {batch.orderCount}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {batch.createdBy}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={7} className="px-6 pb-4 pt-2">
            {loadingDetail ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : detail && detail.payments.length > 0 ? (
              <div className="rounded border overflow-hidden mt-1">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Order ID</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 text-left font-medium">Payment Date</th>
                      <th className="px-4 py-2 text-left font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payments.map((p) => (
                      <tr key={p.paymentId} className="border-t hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 font-mono font-medium">{p.orderId}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(p.paymentAmount)}</td>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                          {new Date(p.paymentDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground max-w-xs truncate">
                          {p.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">No order details found for this batch.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function BulkPaymentHistoryPage() {
  const { data, isLoading } = useQuery<{ batches: BatchSummary[] }>({
    queryKey: ['/api/payments/batches'],
    queryFn: () => apiRequest('/api/payments/batches'),
  });

  const batches = data?.batches ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <History className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Bulk Payment History</h1>
          <p className="text-muted-foreground">
            Audit log of all bulk payment batches — click a row to see individual order allocations
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-5 w-5" />
            Payment Batches
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No bulk payment batches yet</p>
              <p className="text-sm mt-1">Batches will appear here after bulk payments are submitted.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 w-8" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Date
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Method
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <span className="flex items-center justify-end gap-1">
                        <DollarSign className="h-3 w-3" />
                        Total
                      </span>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Orders
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Created By
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <BatchRow key={batch.id} batch={batch} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
