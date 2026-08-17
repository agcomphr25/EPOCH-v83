import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Calendar,
  Download,
  CreditCard,
  DollarSign,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import PaymentSettlementWorkspace from '@/components/finance/PaymentSettlementWorkspace';

interface ReconciliationRow {
  paymentId: number;
  orderId: string;
  paymentType: string;
  paymentAmount: number;
  paymentDate: string;
  paymentNotes: string | null;
  orderDate: string | null;
  customerId: string | null;
  cctId: number | null;
  lastFourDigits: string | null;
  cardType: string | null;
  transactionId: string | null;
  gateway: string | null;
  cctStatus: string | null;
}

interface ReconciliationResponse {
  rows: ReconciliationRow[];
  summary: {
    count: number;
    totalAmount: number;
  };
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  credit_card: 'Credit Card',
  check: 'Check',
  cash: 'Cash',
  ach: 'ACH',
  wire: 'Wire',
  agr: 'AGR',
};

const getPaymentTypeLabel = (type: string) =>
  PAYMENT_TYPE_LABELS[type] || type;

type SortField = 'paymentDate' | 'paymentAmount' | 'orderId' | 'paymentType';
type SortDir = 'asc' | 'desc';

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getFirstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function PaymentReconciliationPage() {
  const [startDate, setStartDate] = useState(getFirstOfMonthStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [queryDates, setQueryDates] = useState<{ start: string; end: string } | null>(null);
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('paymentDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, isError } = useQuery<ReconciliationResponse>({
    queryKey: ['/api/payments/reconciliation', queryDates?.start, queryDates?.end],
    enabled: !!queryDates,
    queryFn: () =>
      apiRequest(
        `/api/payments/reconciliation?startDate=${queryDates!.start}&endDate=${queryDates!.end}`
      ),
  });

  const [dateError, setDateError] = useState<string | null>(null);

  const handleSearch = () => {
    if (!startDate || !endDate) return;
    if (new Date(startDate) > new Date(endDate)) {
      setDateError('Start date must be on or before end date.');
      return;
    }
    setDateError(null);
    setQueryDates({ start: startDate, end: endDate });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    if (paymentTypeFilter !== 'all') {
      rows = rows.filter((r) => r.paymentType === paymentTypeFilter);
    }
    rows = [...rows].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      if (sortField === 'paymentDate') {
        aVal = a.paymentDate ? new Date(a.paymentDate).getTime() : 0;
        bVal = b.paymentDate ? new Date(b.paymentDate).getTime() : 0;
      } else if (sortField === 'paymentAmount') {
        aVal = a.paymentAmount;
        bVal = b.paymentAmount;
      } else if (sortField === 'orderId') {
        aVal = a.orderId;
        bVal = b.orderId;
      } else {
        aVal = a.paymentType;
        bVal = b.paymentType;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data, paymentTypeFilter, sortField, sortDir]);

  const filteredTotal = useMemo(
    () => filteredRows.reduce((sum, r) => sum + (r.paymentAmount || 0), 0),
    [filteredRows]
  );

  const uniquePaymentTypes = useMemo(() => {
    if (!data?.rows) return [];
    return Array.from(new Set(data.rows.map((r) => r.paymentType)));
  }, [data]);

  const exportCSV = () => {
    if (!filteredRows.length) return;
    const headers = [
      'Order ID',
      'Customer',
      'Order Date',
      'Payment Type',
      'Payment Amount',
      'Payment Date',
      'Last Four',
      'Card Type',
      'Transaction ID',
      'Gateway',
      'CC Status',
    ];
    const csvRows = filteredRows.map((r) => [
      r.orderId,
      r.customerId || '',
      formatDate(r.orderDate),
      getPaymentTypeLabel(r.paymentType),
      r.paymentAmount?.toFixed(2) || '0.00',
      formatDateTime(r.paymentDate),
      r.lastFourDigits || '',
      r.cardType || '',
      r.transactionId || '',
      r.gateway || '',
      r.cctStatus || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...csvRows.map((row) =>
        row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-reconciliation-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 ml-1 inline" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 inline" />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Reconciliation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review all payments in a date range and verify credit card transactions against processor records.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={exportCSV}
          disabled={!filteredRows.length}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <PaymentSettlementWorkspace />

      {/* Date Range Picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Date Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Button onClick={handleSearch} disabled={!startDate || !endDate}>
                Search
              </Button>
              {dateError && (
                <p className="text-xs text-red-500">{dateError}</p>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Filter className="h-4 w-4 text-gray-500" />
              <Label className="text-sm text-gray-600">Filter by type:</Label>
              <Select value={paymentTypeFilter} onValueChange={setPaymentTypeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {uniquePaymentTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {getPaymentTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Payments</p>
                  <p className="text-lg font-bold">{filteredRows.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Amount</p>
                  <p className="text-lg font-bold">{formatCurrency(filteredTotal)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-100 p-2">
                  <CreditCard className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Credit Card Payments</p>
                  <p className="text-lg font-bold">
                    {filteredRows.filter((r) => r.paymentType === 'credit_card').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results Table */}
      {!queryDates && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Select a date range and click Search to load payment data.
          </CardContent>
        </Card>
      )}

      {queryDates && isLoading && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {queryDates && isError && (
        <Card>
          <CardContent className="py-12 text-center text-red-500">
            Failed to load reconciliation data. Please try again.
          </CardContent>
        </Card>
      )}

      {queryDates && data && !isLoading && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Payments {queryDates.start} to {queryDates.end}
              {paymentTypeFilter !== 'all' && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  — filtered by {getPaymentTypeLabel(paymentTypeFilter)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th
                      className="px-4 py-3 font-medium text-gray-600 cursor-pointer whitespace-nowrap"
                      onClick={() => handleSort('orderId')}
                    >
                      Order ID <SortIcon field="orderId" />
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">Customer</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Order Date</th>
                    <th
                      className="px-4 py-3 font-medium text-gray-600 cursor-pointer whitespace-nowrap"
                      onClick={() => handleSort('paymentType')}
                    >
                      Payment Type <SortIcon field="paymentType" />
                    </th>
                    <th
                      className="px-4 py-3 font-medium text-gray-600 cursor-pointer whitespace-nowrap text-right"
                      onClick={() => handleSort('paymentAmount')}
                    >
                      Amount <SortIcon field="paymentAmount" />
                    </th>
                    <th
                      className="px-4 py-3 font-medium text-gray-600 cursor-pointer whitespace-nowrap"
                      onClick={() => handleSort('paymentDate')}
                    >
                      Payment Date <SortIcon field="paymentDate" />
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">Last Four</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Card Type</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Transaction ID</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Gateway</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                        No payments found for the selected period and filter.
                      </td>
                    </tr>
                  )}
                  {filteredRows.map((row, idx) => {
                    const isCreditCard = row.paymentType === 'credit_card';
                    return (
                      <tr
                        key={row.paymentId}
                        className={`border-b last:border-0 ${
                          isCreditCard
                            ? 'bg-purple-50 hover:bg-purple-100'
                            : idx % 2 === 0
                            ? 'hover:bg-gray-50'
                            : 'bg-gray-50/50 hover:bg-gray-100'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-medium">
                          {row.orderId}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {row.customerId || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {formatDate(row.orderDate)}
                        </td>
                        <td className="px-4 py-3">
                          {isCreditCard ? (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100">
                              <CreditCard className="h-3 w-3 mr-1 inline" />
                              Credit Card
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              {getPaymentTypeLabel(row.paymentType)}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(row.paymentAmount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {formatDateTime(row.paymentDate)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {row.lastFourDigits ? `••••${row.lastFourDigits}` : '—'}
                        </td>
                        <td className="px-4 py-3">{row.cardType || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {row.transactionId || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {isCreditCard ? row.gateway || 'Accept.Blue' : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-gray-100 font-semibold">
                      <td colSpan={4} className="px-4 py-3 text-gray-700">
                        Total ({filteredRows.length} payments)
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(filteredTotal)}</td>
                      <td colSpan={5} className="px-4 py-3" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
