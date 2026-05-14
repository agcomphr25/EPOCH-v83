import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Download,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ShieldX,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { getDisplayOrderId } from '@/lib/orderUtils';
import OrderSummaryModal from '@/components/OrderSummaryModal';
import { useLocation, Link } from 'wouter';
import { hasFullAccess } from '@/config/userPermissions';

type SortColumn = 'orderId' | 'customer' | 'dueDate' | 'completionDate' | 'status' | 'onTime';
type SortDirection = 'asc' | 'desc';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customer?: string;
  customerName?: string;
  customerPO?: string;
  product?: string;
  modelId: string;
  modelDisplayName?: string;
  currentDepartment: string;
  status: string;
  fbOrderNumber?: string;
  shippedDate?: string;
  shippingCompletedAt?: string;
  updatedAt: string;
  isCancelled?: boolean;
}

function getMonthStart(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function getTodayStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function isOnTime(completionDate: string, dueDate: string): boolean {
  return completionDate <= dueDate;
}

export default function OTDReport() {
  const [, setLocation] = useLocation();

  const { data: currentUser, isLoading: userLoading } = useQuery<{ username: string }>({
    queryKey: ['/api/auth/session'],
  });

  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(getTodayStr);
  const [sortColumn, setSortColumn] = useState<SortColumn>('completionDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const {
    data: orders = [],
    isLoading: ordersLoading,
    isError: ordersError,
    error: ordersQueryError,
  } = useQuery<Order[]>({
    queryKey: ['/api/orders/fulfilled-shipped'],
  });

  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
  });

  const getModelDisplayName = (order: Order) => {
    if (order.modelDisplayName) return order.modelDisplayName;
    if (order.product) return order.product;
    if (!order.modelId || !stockModels || stockModels.length === 0) {
      return order.modelId || 'Unknown';
    }
    const model = (stockModels as any[]).find((m: any) => m && m.id === order.modelId);
    return model?.displayName || model?.name || order.modelId;
  };

  const getCustomerName = (order: Order): string => {
    return order.customerName || order.customer || 'Unknown Customer';
  };

  const otdData = useMemo(() => {
    const completedOrders = orders.filter((order) => {
      const status = order.status?.toUpperCase();
      if (status !== 'SHIPPED' && status !== 'FULFILLED') return false;
      if (!order.dueDate) return false;

      const completionDate = getCompletionDate(order);
      if (!completionDate) return false;

      if (startDate && completionDate < startDate) return false;
      if (endDate && completionDate > endDate) return false;

      return true;
    });

    const enriched = completedOrders.map((order) => {
      const completionDate = getCompletionDate(order)!;
      const dueDateNorm = order.dueDate.split('T')[0];
      const onTime = isOnTime(completionDate, dueDateNorm);
      return { ...order, completionDate, dueDateNorm, onTime };
    });

    enriched.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortColumn) {
        case 'orderId':
          aVal = a.orderId || '';
          bVal = b.orderId || '';
          break;
        case 'customer':
          aVal = getCustomerName(a).toLowerCase();
          bVal = getCustomerName(b).toLowerCase();
          break;
        case 'dueDate':
          aVal = a.dueDateNorm;
          bVal = b.dueDateNorm;
          break;
        case 'completionDate':
          aVal = a.completionDate;
          bVal = b.completionDate;
          break;
        case 'status':
          aVal = a.status.toLowerCase();
          bVal = b.status.toLowerCase();
          break;
        case 'onTime':
          aVal = a.onTime ? 0 : 1;
          bVal = b.onTime ? 0 : 1;
          break;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    const onTimeCount = enriched.filter((o) => o.onTime).length;
    const totalCount = enriched.length;
    const otdPercentage = totalCount > 0 ? ((onTimeCount / totalCount) * 100) : 0;

    return { orders: enriched, onTimeCount, lateCount: totalCount - onTimeCount, totalCount, otdPercentage };
  }, [orders, startDate, endDate, sortColumn, sortDirection]);

  const hasAccess = currentUser?.username && hasFullAccess(currentUser.username);

  if (!userLoading && !hasAccess) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <ShieldX className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-destructive mb-2">Access Restricted</h2>
            <p className="text-muted-foreground mb-4">
              This report is currently restricted to admin users only.
            </p>
            <Link href="/">
              <Button>Return to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    }
    return sortDirection === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-1" />
      : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const [year, month, day] = datePart.split('-');
      return `${month}/${day}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Order ID',
      'FB Order #',
      'Customer',
      'Product',
      'Due Date',
      'Completion Date',
      'Status',
      'On Time',
    ];

    const rows = otdData.orders.map((order) => [
      getDisplayOrderId(order),
      order.fbOrderNumber || '',
      getCustomerName(order),
      getModelDisplayName(order),
      formatDate(order.dueDateNorm),
      formatDate(order.completionDate),
      order.status,
      order.onTime ? 'Yes' : 'No',
    ]);

    rows.push([]);
    rows.push(['OTD Summary']);
    rows.push(['Total Orders', String(otdData.totalCount)]);
    rows.push(['On Time', String(otdData.onTimeCount)]);
    rows.push(['Late', String(otdData.lateCount)]);
    rows.push(['OTD %', `${otdData.otdPercentage.toFixed(1)}%`]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().split('T')[0];
    link.download = `otd_report_${timestamp}.csv`;
    link.click();
  };

  const getOtdColor = (pct: number) => {
    if (pct >= 95) return 'text-green-600';
    if (pct >= 85) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getOtdBgColor = (pct: number) => {
    if (pct >= 95) return 'bg-green-50 border-green-200';
    if (pct >= 85) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const ordersErrorMessage =
    (ordersQueryError as any)?.responseData?.details ||
    (ordersQueryError as any)?.responseData?.error ||
    (ordersQueryError as any)?.message ||
    'Failed to load OTD data';

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <TrendingUp className="h-8 w-8 text-primary" />
          On-Time Delivery (OTD) Report
        </h1>
        <p className="text-muted-foreground mt-2">
          Percentage of orders shipped or fulfilled on or before their due date
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Date Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div>
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className={`border-2 ${getOtdBgColor(otdData.otdPercentage)}`}>
          <CardContent className="pt-6 text-center">
            <div className={`text-4xl font-bold ${getOtdColor(otdData.otdPercentage)}`}>
              {otdData.totalCount > 0 ? `${otdData.otdPercentage.toFixed(1)}%` : 'N/A'}
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-semibold">OTD</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-foreground">{otdData.totalCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Total Orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-green-600">{otdData.onTimeCount}</div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              On Time
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-red-600">{otdData.lateCount}</div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <XCircle className="h-4 w-4 text-red-600" />
              Late
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Order Details ({otdData.totalCount})</span>
            <Button
              onClick={exportToCSV}
              disabled={otdData.totalCount === 0}
              data-testid="button-export-csv"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
          ) : ordersError ? (
            <div className="text-center py-8 text-red-600">
              Error loading OTD report: {ordersErrorMessage}
            </div>
          ) : otdData.totalCount === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No shipped or fulfilled orders found in the selected date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('orderId')}
                    >
                      <div className="flex items-center">
                        Order ID
                        <SortIndicator column="orderId" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('customer')}
                    >
                      <div className="flex items-center">
                        Customer
                        <SortIndicator column="customer" />
                      </div>
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('dueDate')}
                    >
                      <div className="flex items-center">
                        Due Date
                        <SortIndicator column="dueDate" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('completionDate')}
                    >
                      <div className="flex items-center">
                        Completion Date
                        <SortIndicator column="completionDate" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center">
                        Status
                        <SortIndicator column="status" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('onTime')}
                    >
                      <div className="flex items-center">
                        OTD
                        <SortIndicator column="onTime" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {otdData.orders.slice(0, 500).map((order, index) => (
                    <TableRow
                      key={`${order.orderId}-${index}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setLocation(`/order-entry?draft=${order.orderId}`)}
                      data-testid={`row-order-${order.orderId}`}
                    >
                      <TableCell className="font-medium">
                        <OrderSummaryModal orderId={order.orderId}>
                          <span className="font-medium hover:text-blue-600">
                            {getDisplayOrderId(order)}
                          </span>
                        </OrderSummaryModal>
                      </TableCell>
                      <TableCell>{getCustomerName(order)}</TableCell>
                      <TableCell>{getModelDisplayName(order)}</TableCell>
                      <TableCell>{formatDate(order.dueDateNorm)}</TableCell>
                      <TableCell>{formatDate(order.completionDate)}</TableCell>
                      <TableCell>
                        <Badge className={`${order.status?.toUpperCase() === 'SHIPPED' ? 'bg-purple-600' : 'bg-green-600'} text-white`}>
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.onTime ? (
                          <Badge className="bg-green-100 text-green-800 border border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            On Time
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 border border-red-300">
                            <XCircle className="h-3 w-3 mr-1" />
                            Late
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {otdData.totalCount > 500 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Showing first 500 of {otdData.totalCount} orders. Export to CSV for full list.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
