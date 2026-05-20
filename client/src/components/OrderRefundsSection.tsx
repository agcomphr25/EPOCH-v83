import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

interface RefundRequest {
  id: number;
  orderId: string;
  refundType: string;
  amount: number | null;
  refundAmount: number | null;
  reason: string;
  status: string;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface CreditApplication {
  id: number;
  creditMemoId: number;
  memoNumber: string;
  amountApplied: number;
  appliedDate: string;
  appliedBy: string;
  notes: string | null;
}

interface OrderRefundsSectionProps {
  orderId: string | null;
}

const CENTRAL_TIMEZONE = 'America/Chicago';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const zonedDate = toZonedTime(date, CENTRAL_TIMEZONE);
  return format(zonedDate, 'MMM d, yyyy h:mm a');
}

export default function OrderRefundsSection({ orderId }: OrderRefundsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: rawRefunds = [], isLoading: refundsLoading } = useQuery<RefundRequest[]>({
    queryKey: ['/api/refund-requests/order', orderId],
    queryFn: () => apiRequest(`/api/refund-requests/order/${orderId}`),
    enabled: !!orderId && orderId !== 'Loading...',
  });

  const { data: rawCreditApplications = [], isLoading: creditsLoading } = useQuery<CreditApplication[]>({
    queryKey: ['/api/credit-memos/order', orderId, 'applications'],
    queryFn: () => apiRequest(`/api/credit-memos/order/${orderId}/applications`),
    enabled: !!orderId && orderId !== 'Loading...',
  });
  const refunds: RefundRequest[] = Array.isArray(rawRefunds) ? rawRefunds : [];
  const creditApplications: CreditApplication[] = Array.isArray(rawCreditApplications)
    ? rawCreditApplications
    : [];

  const hasData = refunds.length > 0 || creditApplications.length > 0;

  if (!orderId || orderId === 'Loading...' || (!hasData && !refundsLoading && !creditsLoading)) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PROCESSED':
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'PENDING':
        return <Clock className="h-3 w-3 text-yellow-600" />;
      case 'REJECTED':
        return <AlertCircle className="h-3 w-3 text-red-600" />;
      default:
        return <Clock className="h-3 w-3 text-blue-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PROCESSED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return colors[status.toUpperCase()] || 'bg-gray-100 text-gray-800';
  };

  const totalRefunded = refunds
    .filter((r) => r.status.toUpperCase() === 'PROCESSED')
    .reduce((sum, r) => sum + (r.refundAmount || r.amount || 0), 0);

  const totalCreditsApplied = creditApplications.reduce((sum, c) => sum + c.amountApplied, 0);

  return (
    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
      <CardContent className="p-3">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
          data-testid="refunds-section-toggle"
        >
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-amber-600" />
            <span className="font-medium text-amber-700 dark:text-amber-400">
              Refunds & Credits Applied:
            </span>
            {totalRefunded > 0 && (
              <Badge variant="secondary" className="bg-red-600 text-white">
                -${totalRefunded.toFixed(2)} refunded
              </Badge>
            )}
            {totalCreditsApplied > 0 && (
              <Badge variant="secondary" className="bg-green-600 text-white">
                ${totalCreditsApplied.toFixed(2)} credits
              </Badge>
            )}
          </div>
          <button className="p-1">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-3 space-y-3">
            {refundsLoading || creditsLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <>
                {refunds.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase">
                      Refund Requests
                    </div>
                    {refunds.map((refund) => (
                      <div
                        key={refund.id}
                        className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border"
                        data-testid={`refund-item-${refund.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(refund.status)}
                            <span className="text-sm font-medium" data-testid={`text-refund-amount-${refund.id}`}>
                              ${(refund.refundAmount || refund.amount || 0).toFixed(2)}
                            </span>
                            <Badge className={getStatusBadge(refund.status)}>
                              {refund.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {refund.reason}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Requested by {refund.requestedBy} on {formatDate(refund.requestedAt)}
                          </div>
                          {refund.processedAt && (
                            <div className="text-xs text-muted-foreground">
                              Processed by {refund.processedBy} on {formatDate(refund.processedAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {creditApplications.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase">
                      Credits Applied
                    </div>
                    {creditApplications.map((credit) => (
                      <div
                        key={credit.id}
                        className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border"
                        data-testid={`credit-application-${credit.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-3 w-3 text-green-600" />
                            <span className="text-sm font-medium" data-testid={`text-credit-amount-${credit.id}`}>
                              ${credit.amountApplied.toFixed(2)}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {credit.memoNumber}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Applied by {credit.appliedBy} on {formatDate(credit.appliedDate)}
                          </div>
                          {credit.notes && (
                            <div className="text-xs text-muted-foreground">{credit.notes}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {refunds.length === 0 && creditApplications.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No refunds or credits applied to this order
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
