import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, Globe, DollarSign, TrendingUp, Calendar } from 'lucide-react';

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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function PaymentAnalytics() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [isMTD, setIsMTD] = useState(true);

  const { data, isLoading, error } = useQuery<PaymentAnalyticsResponse>({
    queryKey: ['/api/finance/payment-analytics', month, year, isMTD],
    queryFn: async () => {
      const res = await fetch(`/api/finance/payment-analytics?month=${month}&year=${year}&mtd=${isMTD}`);
      if (!res.ok) throw new Error('Failed to fetch payment analytics');
      return res.json();
    },
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
          <Button
            variant={isMTD ? 'default' : 'outline'}
            onClick={() => setIsMTD(!isMTD)}
            data-testid="toggle-mtd"
          >
            <Calendar className="h-4 w-4 mr-2" />
            {isMTD ? 'Month to Date' : 'Full Month'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
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
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Transaction Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.payments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No payments found for this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payments.map((payment) => (
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
                          <Badge variant={payment.paymentLabel === 'Phone' ? 'default' : 'secondary'}>
                            {payment.paymentLabel === 'Phone' ? (
                              <Phone className="h-3 w-3 mr-1" />
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
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
