import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, DollarSign, TrendingUp, CreditCard, Calendar } from 'lucide-react';
import { Link } from 'wouter';

interface DashboardWidgetData {
  totalRevenue: number;
  averagePayment: number;
  prevMonthCCRevenue: number;
  lastYearCCRevenue: number;
  metadata: {
    currentMonth: number;
    currentYear: number;
    prevMonth: number;
    prevMonthYear: number;
    lastYearMonth: number;
    lastYear: number;
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function TANDYMTestDashboard() {
  const { data, isLoading, error } = useQuery<DashboardWidgetData>({
    queryKey: ['/api/finance/dashboard-widgets'],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-600">Error loading dashboard data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const prevMonthName = data ? MONTHS[data.metadata.prevMonth - 1] : '';
  const lastYearMonthName = data ? MONTHS[data.metadata.lastYearMonth - 1] : '';

  return (
    <div className="p-6 space-y-6" data-testid="tandym-dashboard">
      <h1 className="text-2xl font-bold" data-testid="page-title">Tandym Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="h-48" data-testid="widget-placeholder-1">
            <CardHeader>
              <CardTitle className="text-lg">Gross Margin</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-400">--</p>
              <p className="text-sm text-muted-foreground mt-2">Coming soon</p>
            </CardContent>
          </Card>

          <Card className="h-48" data-testid="widget-placeholder-2">
            <CardHeader>
              <CardTitle className="text-lg">Operating Cash Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-400">--</p>
              <p className="text-sm text-muted-foreground mt-2">Coming soon</p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="h-48" data-testid="widget-placeholder-3">
            <CardHeader>
              <CardTitle className="text-lg">Accounts Receivable Aging</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-400">--</p>
              <p className="text-sm text-muted-foreground mt-2">Coming soon</p>
            </CardContent>
          </Card>

          <Card className="h-48" data-testid="widget-placeholder-4">
            <CardHeader>
              <CardTitle className="text-lg">Working Capital Ratio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-400">--</p>
              <p className="text-sm text-muted-foreground mt-2">Coming soon</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-2xl">
        <Link href="/payment-analytics" data-testid="link-total-revenue">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full" data-testid="widget-total-revenue">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {data ? formatCurrency(data.totalRevenue) : '--'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Month to date</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payment-analytics" data-testid="link-average-payment">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full" data-testid="widget-average-payment">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                Average Payment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                {data ? formatCurrency(data.averagePayment) : '--'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Per transaction</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payment-analytics" data-testid="link-prev-month-cc">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full" data-testid="widget-prev-month-cc">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-purple-600" />
                CC Revenue (Last Month)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-purple-600">
                {data ? formatCurrency(data.prevMonthCCRevenue) : '--'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {prevMonthName} {data?.metadata.prevMonthYear}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payment-analytics" data-testid="link-last-year-cc">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full" data-testid="widget-last-year-cc">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-orange-600" />
                CC Revenue (Same Month Last Year)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-orange-600">
                {data ? formatCurrency(data.lastYearCCRevenue) : '--'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {lastYearMonthName} {data?.metadata.lastYear}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
