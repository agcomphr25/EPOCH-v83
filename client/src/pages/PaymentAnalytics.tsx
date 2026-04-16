import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, Phone, Globe, DollarSign, TrendingUp, Calendar, CreditCard, ArrowUpDown, ArrowUp, ArrowDown, Download, Layers } from 'lucide-react';

interface PaymentData {
  id: number;
  orderId: string;
  paymentType: string;
  paymentLabel: string;
  amount: number;
  date: string;
  notes: string;
  customerPO: string;
  fbOrderNumber: string;
  modelId: string;
  customerName: string;
}

interface BatchData {
  batchId: number;
  date: string;
  customerId: string;
  customerName: string;
  paymentMethod: string;
  paymentLabel: string;
  orderCount: number;
  totalAmount: number;
  notes: string;
}

interface PaymentAnalyticsResponse {
  month: number;
  year: number;
  isMTD: boolean;
  startDate: string;
  endDate: string;
  summary: {
    totalAmount: number;
    transactionCount: number;
    averagePerOrder: number;
  };
  breakdown: {
    phone: { amount: number; count: number; average: number };
    online: { amount: number; count: number; average: number };
  };
  payments: PaymentData[];
  dailyTotals: { date: string; amount: number; count: number }[];
}

interface BatchAnalyticsResponse {
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  batches: BatchData[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

type SortColumn = 'date' | 'orderId' | 'customerName' | 'paymentLabel' | 'amount';
type SortDirection = 'asc' | 'desc';
type BatchSortColumn = 'date' | 'customerName' | 'paymentLabel' | 'orderCount' | 'totalAmount';

export default function PaymentAnalytics() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [viewMode, setViewMode] = useState<'mtd' | 'full' | 'ytd'>('mtd');
  const [typeFilter, setTypeFilter] = useState<'all' | 'phone' | 'online'>('all');
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [groupMode, setGroupMode] = useState<'individual' | 'batch'>('individual');
  const [batchSortColumn, setBatchSortColumn] = useState<BatchSortColumn>('date');
  const [batchSortDirection, setBatchSortDirection] = useState<SortDirection>('desc');

  const { data, isLoading, error } = useQuery<PaymentAnalyticsResponse>({
    queryKey: ['/api/finance/payment-analytics', month, year, viewMode],
    queryFn: async () => {
      const res = await fetch(`/api/finance/payment-analytics?month=${month}&year=${year}&mode=${viewMode}`);
      if (!res.ok) throw new Error('Failed to fetch payment analytics');
      return res.json();
    },
  });

  const { data: batchData, isLoading: batchLoading } = useQuery<BatchAnalyticsResponse>({
    queryKey: ['/api/finance/payment-analytics/batches', month, year, viewMode, typeFilter],
    queryFn: async () => {
      const res = await fetch(
        `/api/finance/payment-analytics/batches?month=${month}&year=${year}&mode=${viewMode}&type=${typeFilter}`
      );
      if (!res.ok) throw new Error('Failed to fetch batch analytics');
      return res.json();
    },
    enabled: groupMode === 'batch',
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleBatchSort = (column: BatchSortColumn) => {
    if (batchSortColumn === column) {
      setBatchSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setBatchSortColumn(column);
      setBatchSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const BatchSortIcon = ({ column }: { column: BatchSortColumn }) => {
    if (batchSortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return batchSortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const getFilteredSortedPayments = () => {
    if (!data) return [];
    const filtered = data.payments.filter(p => {
      if (typeFilter === 'all') return true;
      if (typeFilter === 'phone') return p.paymentLabel === 'Phone';
      return p.paymentLabel === 'Live' || p.paymentLabel === 'Online';
    });
    return [...filtered].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (sortColumn) {
        case 'date': aVal = a.date; bVal = b.date; break;
        case 'orderId': aVal = a.orderId; bVal = b.orderId; break;
        case 'customerName': aVal = (a.customerName || '').toLowerCase(); bVal = (b.customerName || '').toLowerCase(); break;
        case 'paymentLabel': aVal = a.paymentLabel; bVal = b.paymentLabel; break;
        case 'amount': aVal = a.amount; bVal = b.amount; break;
        default: aVal = a.date; bVal = b.date;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const getSortedBatches = () => {
    if (!batchData) return [];
    return [...batchData.batches].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      switch (batchSortColumn) {
        case 'date': aVal = a.date; bVal = b.date; break;
        case 'customerName': aVal = (a.customerName || '').toLowerCase(); bVal = (b.customerName || '').toLowerCase(); break;
        case 'paymentLabel': aVal = a.paymentLabel; bVal = b.paymentLabel; break;
        case 'orderCount': aVal = a.orderCount; bVal = b.orderCount; break;
        case 'totalAmount': aVal = a.totalAmount; bVal = b.totalAmount; break;
        default: aVal = a.date; bVal = b.date;
      }
      if (aVal < bVal) return batchSortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return batchSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleExportCSV = () => {
    if (groupMode === 'batch') {
      const batches = getSortedBatches();
      const periodLabel = viewMode === 'ytd'
        ? `YTD-${year}`
        : `${MONTHS[month - 1]}-${year}`;
      const filename = `payment-analytics-batches-${periodLabel}.csv`;
      const header = ['Date', 'Customer', 'Payment Method', 'Order Count', 'Total Amount'];
      const rows = batches.map(b => [
        formatDate(b.date),
        b.customerName,
        b.paymentLabel,
        b.orderCount.toString(),
        b.totalAmount.toFixed(2),
      ]);
      const csvContent = [header, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const payments = getFilteredSortedPayments();
      const periodLabel = viewMode === 'ytd'
        ? `YTD-${year}`
        : `${MONTHS[month - 1]}-${year}`;
      const filename = `payment-analytics-${periodLabel}.csv`;
      const header = ['Date', 'Order ID', 'Customer', 'Type', 'Amount'];
      const rows = payments.map(p => [
        formatDate(p.date),
        p.orderId,
        p.customerName || 'N/A',
        p.paymentLabel,
        p.amount.toFixed(2),
      ]);
      const csvContent = [header, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-600">Error loading payment analytics. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="payment-analytics-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-testid="page-title">Payment Analytics</h1>
        <div className="flex items-center gap-4">
          {viewMode !== 'ytd' && (
            <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
              <SelectTrigger className="w-[140px]" data-testid="select-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, idx) => (
                  <SelectItem key={idx} value={(idx + 1).toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]" data-testid="select-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center border rounded-md overflow-hidden">
            <Button
              variant={viewMode === 'mtd' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode('mtd')}
              data-testid="toggle-mtd"
            >
              Month to Date
            </Button>
            <Button
              variant={viewMode === 'full' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode('full')}
              data-testid="toggle-full"
            >
              Full Month
            </Button>
            <Button
              variant={viewMode === 'ytd' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode('ytd')}
              data-testid="toggle-ytd"
            >
              Year to Date
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          {(() => {
            const startParts = data.startDate.slice(0, 10).split('-').map(Number);
            const endParts = data.endDate.slice(0, 10).split('-').map(Number);
            const startUtc = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
            const endUtc = Date.UTC(endParts[0], endParts[1] - 1, endParts[2]);
            const daysElapsed = Math.max(1, Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1);
            const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
            const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
            const estFullMonth = (data.summary.totalAmount / daysElapsed) * daysInMonth;
            const phoneDailyAvg = data.breakdown.phone.amount / daysElapsed;
            const onlineDailyAvg = data.breakdown.online.amount / daysElapsed;
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card data-testid="card-total">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Total Revenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" data-testid="text-total-amount">
                      {formatCurrency(data.summary.totalAmount)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {data.summary.transactionCount} transactions
                    </p>
                    {viewMode === 'mtd' && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Est. full month: {formatCurrency(estFullMonth)}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card data-testid="card-phone">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone (Accept.Blue)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-blue-600" data-testid="text-phone-amount">
                      {formatCurrency(data.breakdown.phone.amount)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {data.breakdown.phone.count} transactions | Avg: {formatCurrency(data.breakdown.phone.average)}
                    </p>
                    {viewMode === 'mtd' && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Daily avg: {formatCurrency(phoneDailyAvg)}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card data-testid="card-online">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Online
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-green-600" data-testid="text-online-amount">
                      {formatCurrency(data.breakdown.online.amount)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {data.breakdown.online.count} transactions | Avg: {formatCurrency(data.breakdown.online.average)}
                    </p>
                    {viewMode === 'mtd' && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Daily avg: {formatCurrency(onlineDailyAvg)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          <Card>
            <CardContent className="pt-6">
              <Accordion type="single" collapsible defaultValue="transactions">
                <AccordionItem value="transactions" className="border-none">
                  <AccordionTrigger className="hover:no-underline py-0" data-testid="accordion-transactions">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      <span className="font-semibold">Transaction Details</span>
                      {groupMode === 'individual' && (
                        <span className="text-sm text-muted-foreground ml-2">
                          ({getFilteredSortedPayments().length} transactions)
                        </span>
                      )}
                      {groupMode === 'batch' && batchData && (
                        <span className="text-sm text-muted-foreground ml-2">
                          ({getSortedBatches().length} batches)
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4">
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <span className="text-sm text-muted-foreground mr-1">Filter by type:</span>
                      <Button
                        variant={typeFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTypeFilter('all')}
                      >
                        All
                      </Button>
                      <Button
                        variant={typeFilter === 'phone' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTypeFilter('phone')}
                      >
                        <Phone className="h-3 w-3 mr-1" />
                        Phone
                      </Button>
                      <Button
                        variant={typeFilter === 'online' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTypeFilter('online')}
                      >
                        <Globe className="h-3 w-3 mr-1" />
                        Online
                      </Button>

                      <div className="flex items-center border rounded-md overflow-hidden ml-4">
                        <Button
                          variant={groupMode === 'individual' ? 'default' : 'ghost'}
                          size="sm"
                          className="rounded-none"
                          onClick={() => setGroupMode('individual')}
                          data-testid="toggle-individual"
                        >
                          Individual
                        </Button>
                        <Button
                          variant={groupMode === 'batch' ? 'default' : 'ghost'}
                          size="sm"
                          className="rounded-none"
                          onClick={() => setGroupMode('batch')}
                          data-testid="toggle-by-batch"
                        >
                          <Layers className="h-3 w-3 mr-1" />
                          By Batch
                        </Button>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCSV}
                        className="ml-auto"
                        data-testid="btn-export-csv"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Export CSV
                      </Button>
                    </div>

                    {groupMode === 'individual' ? (
                      data.payments.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No payments found for this period.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('date')}>
                                <span className="flex items-center">Date<SortIcon column="date" /></span>
                              </TableHead>
                              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('orderId')}>
                                <span className="flex items-center">Order ID<SortIcon column="orderId" /></span>
                              </TableHead>
                              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('customerName')}>
                                <span className="flex items-center">Customer<SortIcon column="customerName" /></span>
                              </TableHead>
                              <TableHead className="cursor-pointer select-none" onClick={() => handleSort('paymentLabel')}>
                                <span className="flex items-center">Type<SortIcon column="paymentLabel" /></span>
                              </TableHead>
                              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('amount')}>
                                <span className="flex items-center justify-end">Amount<SortIcon column="amount" /></span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getFilteredSortedPayments().map((payment) => (
                              <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                                <TableCell className="text-sm">{formatDate(payment.date)}</TableCell>
                                <TableCell>
                                  <span className="font-mono">{payment.orderId}</span>
                                  {payment.fbOrderNumber && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      (FB: {payment.fbOrderNumber})
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>{payment.customerName || 'N/A'}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={payment.paymentLabel === 'Phone' ? 'default' : payment.paymentLabel === 'Live' ? 'outline' : 'secondary'}
                                    className={payment.paymentLabel === 'Live' ? 'border-purple-500 text-purple-600' : ''}
                                  >
                                    {payment.paymentLabel === 'Phone' ? (
                                      <Phone className="h-3 w-3 mr-1" />
                                    ) : payment.paymentLabel === 'Live' ? (
                                      <CreditCard className="h-3 w-3 mr-1" />
                                    ) : (
                                      <Globe className="h-3 w-3 mr-1" />
                                    )}
                                    {payment.paymentLabel}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(payment.amount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )
                    ) : (
                      batchLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      ) : !batchData || batchData.batches.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No batch payments found for this period.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="cursor-pointer select-none" onClick={() => handleBatchSort('date')}>
                                <span className="flex items-center">Date<BatchSortIcon column="date" /></span>
                              </TableHead>
                              <TableHead className="cursor-pointer select-none" onClick={() => handleBatchSort('customerName')}>
                                <span className="flex items-center">Customer<BatchSortIcon column="customerName" /></span>
                              </TableHead>
                              <TableHead className="cursor-pointer select-none" onClick={() => handleBatchSort('paymentLabel')}>
                                <span className="flex items-center">Method<BatchSortIcon column="paymentLabel" /></span>
                              </TableHead>
                              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleBatchSort('orderCount')}>
                                <span className="flex items-center justify-end">Orders<BatchSortIcon column="orderCount" /></span>
                              </TableHead>
                              <TableHead className="text-right cursor-pointer select-none" onClick={() => handleBatchSort('totalAmount')}>
                                <span className="flex items-center justify-end">Batch Total<BatchSortIcon column="totalAmount" /></span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getSortedBatches().map((batch) => (
                              <TableRow key={batch.batchId} data-testid={`row-batch-${batch.batchId}`}>
                                <TableCell className="text-sm">{formatDate(batch.date)}</TableCell>
                                <TableCell>{batch.customerName}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={batch.paymentLabel === 'Phone' ? 'default' : 'secondary'}
                                  >
                                    {batch.paymentLabel === 'Phone' ? (
                                      <Phone className="h-3 w-3 mr-1" />
                                    ) : (
                                      <Globe className="h-3 w-3 mr-1" />
                                    )}
                                    {batch.paymentLabel}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {batch.orderCount}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(batch.totalAmount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
