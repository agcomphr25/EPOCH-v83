import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Percent, Calendar, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';

type SortKey = keyof OrderDetail;
type SortDir = 'asc' | 'desc';

interface AnalyticsSummary {
  totalOrders: number;
  totalDiscounts: number;
  totalRevenue: number;
  totalOrderValue: number;
  averageDiscount: number;
  averageOrderValue: number;
}

interface OrderDetail {
  orderId: string;
  customerId: string;
  orderDate: string;
  updatedAt: string;
  basePrice: number;
  featuresTotal: number;
  shipping: number;
  discountAmount: number;
  orderTotal: number;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  orders: OrderDetail[];
  dateRange: {
    start: string;
    end: string;
  };
}

export default function AnalyticsDashboard() {
  const [datePreset, setDatePreset] = useState('this-month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Calculate date ranges based on preset
  useEffect(() => {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (datePreset) {
      case 'this-month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case 'last-month':
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        break;
      case 'last-3-months':
        start = startOfMonth(subMonths(now, 3));
        end = endOfMonth(now);
        break;
      case 'this-year':
        start = startOfYear(now);
        end = endOfYear(now);
        break;
      case 'custom':
        return;
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
    }

    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    
    setStartDate(startStr);
    setEndDate(endStr);
    
    // Auto-apply when preset changes (except custom)
    if (datePreset !== 'custom') {
      setAppliedStartDate(startStr);
      setAppliedEndDate(endStr);
    }
  }, [datePreset]);

  // Fetch analytics data
  const { data, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: [`/api/reports/analytics/metrics?startDate=${appliedStartDate}&endDate=${appliedEndDate}`],
    enabled: !!appliedStartDate && !!appliedEndDate,
  });

  const handleApply = () => {
    if (startDate && endDate) {
      setAppliedStartDate(startDate);
      setAppliedEndDate(endDate);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'orderId' || key === 'customerId' ? 'asc' : 'desc');
    }
  };

  const sortedOrders = data?.orders ? [...data.orders].sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    let cmp = 0;
    if (typeof valA === 'number' && typeof valB === 'number') {
      cmp = valA - valB;
    } else {
      cmp = String(valA).localeCompare(String(valB));
    }
    return sortDir === 'asc' ? cmp : -cmp;
  }) : [];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3 inline" />
      : <ArrowDown className="ml-1 h-3 w-3 inline" />;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            View key metrics and reports for fulfilled orders
          </p>
        </div>
      </div>

      {/* Date Range Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Date Range
          </CardTitle>
          <CardDescription>Select a time period to analyze</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Preset</Label>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger data-testid="select-date-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="last-3-months">Last 3 Months</SelectItem>
                  <SelectItem value="this-year">This Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={datePreset !== 'custom'}
                data-testid="input-start-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={datePreset !== 'custom'}
                data-testid="input-end-date"
              />
            </div>

            <div className="flex items-end">
              <Button 
                onClick={handleApply} 
                className="w-full"
                data-testid="button-apply-date-range"
              >
                Apply
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-total-orders">
                {data.summary.totalOrders}
              </div>
              <p className="text-xs text-muted-foreground">
                Fulfilled orders in period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Discounts</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-total-discounts">
                {formatCurrency(data.summary.totalDiscounts)}
              </div>
              <p className="text-xs text-muted-foreground">
                Avg: {formatCurrency(data.summary.averageDiscount)}/order
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-total-revenue">
                {formatCurrency(data.summary.totalRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                After discounts applied
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="metric-avg-order-value">
                {formatCurrency(data.summary.averageOrderValue)}
              </div>
              <p className="text-xs text-muted-foreground">
                Per fulfilled order
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Orders Table */}
      {data && data.orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
            <CardDescription>
              {data.orders.length} order{data.orders.length !== 1 ? 's' : ''} fulfilled between{' '}
              {format(new Date(data.dateRange.start), 'MMM d, yyyy')} and{' '}
              {format(new Date(data.dateRange.end), 'MMM d, yyyy')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('orderId')}>Order ID <SortIcon col="orderId" /></TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('customerId')}>Customer ID <SortIcon col="customerId" /></TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('updatedAt')}>Fulfilled Date <SortIcon col="updatedAt" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('basePrice')}>Base Price <SortIcon col="basePrice" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('featuresTotal')}>Features <SortIcon col="featuresTotal" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('shipping')}>Shipping <SortIcon col="shipping" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('discountAmount')}>Discount <SortIcon col="discountAmount" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('orderTotal')}>Total <SortIcon col="orderTotal" /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedOrders.map((order) => (
                    <TableRow key={order.orderId} data-testid={`row-order-${order.orderId}`}>
                      <TableCell className="font-medium">{order.orderId}</TableCell>
                      <TableCell>{order.customerId}</TableCell>
                      <TableCell>{format(new Date(order.updatedAt), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.basePrice)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.featuresTotal)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(order.shipping)}</TableCell>
                      <TableCell className="text-right text-red-600">
                        {order.discountAmount > 0 ? `-${formatCurrency(order.discountAmount)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {formatCurrency(order.orderTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.orders.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Orders Found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              No fulfilled orders were found for the selected date range. Try adjusting your date range or check back later.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
