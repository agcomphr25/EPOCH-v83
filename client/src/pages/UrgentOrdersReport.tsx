import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  AlertTriangle,
  ShieldX,
  ArrowUpDown,
  Zap,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { getDisplayOrderId } from '@/lib/orderUtils';
import OrderSummaryModal from '@/components/OrderSummaryModal';
import { useLocation, Link } from 'wouter';
import { hasFullAccess } from '@/config/userPermissions';

const ALLOWED_USERS = ['agrace'];

type SortColumn = 'orderId' | 'orderDate' | 'customer' | 'customerPO' | 'product' | 'department' | 'dueDate' | 'payment' | 'status' | 'urgency';
type SortDirection = 'asc' | 'desc';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customer?: string;
  customerPO?: string;
  product?: string;
  modelId: string;
  currentDepartment: string;
  status: string;
  fbOrderNumber?: string;
  paymentTotal?: number;
  isFullyPaid?: boolean;
  isVerified?: boolean;
  isCancelled?: boolean;
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  priorityScore?: number;
  isManualUrgency?: boolean;
}

export default function UrgentOrdersReport() {
  const [, setLocation] = useLocation();

  const { data: currentUser, isLoading: userLoading } = useQuery<{ username: string; role?: string }>({
    queryKey: ['/api/auth/session'],
  });

  const [sortColumn, setSortColumn] = useState<SortColumn>('dueDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
  });

  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId || !stockModels || stockModels.length === 0) {
      return modelId || 'Unknown Model';
    }
    const model = (stockModels as any[]).find((m: any) => m && m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  const getCustomerName = (order: Order): string => {
    return order.customer || 'Unknown Customer';
  };

  const urgentOrders = useMemo(() => {
    let result = orders.filter(
      (order) =>
        (order.urgency === 'high' || order.urgency === 'critical') &&
        order.status !== 'FULFILLED' &&
        order.status !== 'CANCELLED' &&
        order.currentDepartment !== 'Shipping Management'
    );

    result.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortColumn) {
        case 'orderId':
          aVal = a.orderId || '';
          bVal = b.orderId || '';
          break;
        case 'orderDate':
          aVal = a.orderDate || '';
          bVal = b.orderDate || '';
          break;
        case 'customer':
          aVal = getCustomerName(a).toLowerCase();
          bVal = getCustomerName(b).toLowerCase();
          break;
        case 'customerPO':
          aVal = (a.customerPO || '').toLowerCase();
          bVal = (b.customerPO || '').toLowerCase();
          break;
        case 'product':
          aVal = (a.product || getModelDisplayName(a.modelId)).toLowerCase();
          bVal = (b.product || getModelDisplayName(b.modelId)).toLowerCase();
          break;
        case 'department':
          aVal = (a.currentDepartment || '').toLowerCase();
          bVal = (b.currentDepartment || '').toLowerCase();
          break;
        case 'dueDate':
          aVal = a.dueDate || '';
          bVal = b.dueDate || '';
          break;
        case 'payment':
          aVal = a.paymentTotal || 0;
          bVal = b.paymentTotal || 0;
          break;
        case 'status':
          aVal = (a.isCancelled ? 'CANCELLED' : a.status || '').toLowerCase();
          bVal = (b.isCancelled ? 'CANCELLED' : b.status || '').toLowerCase();
          break;
        case 'urgency':
          aVal = a.urgency === 'critical' ? 1 : 2;
          bVal = b.urgency === 'critical' ? 1 : 2;
          break;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [orders, sortColumn, sortDirection, stockModels]);

  const hasAccess = currentUser?.username && (hasFullAccess(currentUser.username) || ALLOWED_USERS.includes(currentUser.username));

  if (!userLoading && !hasAccess) {
    return (
      <div className="container mx-auto p-6">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center">
            <ShieldX className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-destructive mb-2">Access Restricted</h2>
            <p className="text-muted-foreground mb-4">
              This report is currently restricted to specific users only.
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
      if (dateStr.includes('T')) {
        const [year, month, day] = dateStr.split('T')[0].split('-');
        return `${month}/${day}/${year}`;
      }
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'UTC',
      });
    } catch {
      return dateStr;
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Order ID',
      'FB Order #',
      'Urgency',
      'Order Date',
      'Customer',
      'Customer PO',
      'Product',
      'Current Department',
      'Due Date',
      'Status',
      'Payment Total',
      'Fully Paid',
    ];

    const rows = urgentOrders.map((order) => [
      getDisplayOrderId(order),
      order.fbOrderNumber || '',
      (order.urgency || '').toUpperCase(),
      formatDate(order.orderDate),
      getCustomerName(order),
      order.customerPO || '',
      order.product || getModelDisplayName(order.modelId),
      order.currentDepartment || '',
      formatDate(order.dueDate),
      order.isCancelled ? 'CANCELLED' : order.status,
      order.paymentTotal?.toFixed(2) || '0.00',
      order.isFullyPaid ? 'Yes' : 'No',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().split('T')[0];
    link.download = `urgent_orders_report_${timestamp}.csv`;
    link.click();
  };

  const getStatusBadgeColor = (status: string, isCancelled?: boolean) => {
    if (isCancelled) return 'bg-red-600';
    switch (status?.toUpperCase()) {
      case 'DRAFT':
        return 'bg-gray-500';
      case 'FINALIZED':
        return 'bg-blue-600';
      case 'IN_PROGRESS':
        return 'bg-yellow-600';
      case 'FULFILLED':
        return 'bg-green-600';
      case 'SHIPPED':
        return 'bg-purple-600';
      case 'CANCELLED':
        return 'bg-red-600';
      case 'SCRAPPED':
        return 'bg-orange-600';
      case 'ON_HOLD':
        return 'bg-amber-600';
      default:
        return 'bg-gray-500';
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    if (urgency === 'critical') {
      return (
        <Badge className="bg-red-600 text-white text-xs px-2 py-0.5 font-bold animate-pulse">
          <Zap className="h-3 w-3 mr-1 inline" />
          CRITICAL
        </Badge>
      );
    }
    return (
      <Badge className="bg-orange-500 text-white text-xs px-2 py-0.5 font-bold animate-pulse">
        <Zap className="h-3 w-3 mr-1 inline" />
        URGENT
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <AlertTriangle className="h-8 w-8 text-orange-500" />
          Urgent Orders Report
        </h1>
        <p className="text-muted-foreground mt-2">
          All orders currently flagged as Urgent or Critical priority
        </p>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{urgentOrders.length}</span> urgent order{urgentOrders.length !== 1 ? 's' : ''} found
              </div>
            </div>
            <Button
              onClick={exportToCSV}
              disabled={urgentOrders.length === 0}
              data-testid="button-export-csv"
            >
              <Download className="h-4 w-4 mr-2" />
              Export to CSV ({urgentOrders.length} orders)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Urgent Orders ({urgentOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
          ) : urgentOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders are currently flagged as urgent.
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
                      onClick={() => handleSort('urgency')}
                    >
                      <div className="flex items-center">
                        Priority
                        <SortIndicator column="urgency" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('orderDate')}
                    >
                      <div className="flex items-center">
                        Order Date
                        <SortIndicator column="orderDate" />
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
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('customerPO')}
                    >
                      <div className="flex items-center">
                        Customer PO
                        <SortIndicator column="customerPO" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('product')}
                    >
                      <div className="flex items-center">
                        Product
                        <SortIndicator column="product" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('department')}
                    >
                      <div className="flex items-center">
                        Current Dept
                        <SortIndicator column="department" />
                      </div>
                    </TableHead>
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
                      onClick={() => handleSort('payment')}
                    >
                      <div className="flex items-center">
                        Payment
                        <SortIndicator column="payment" />
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {urgentOrders.slice(0, 500).map((order, index) => (
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
                      <TableCell>
                        {getUrgencyBadge(order.urgency || 'high')}
                      </TableCell>
                      <TableCell>{formatDate(order.orderDate)}</TableCell>
                      <TableCell>{getCustomerName(order)}</TableCell>
                      <TableCell>{order.customerPO || '-'}</TableCell>
                      <TableCell>{order.product || getModelDisplayName(order.modelId)}</TableCell>
                      <TableCell>{order.currentDepartment || '-'}</TableCell>
                      <TableCell>{formatDate(order.dueDate)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          ${(order.paymentTotal || 0).toFixed(2)}
                          {order.isFullyPaid && (
                            <Badge variant="outline" className="text-xs bg-green-100 text-green-800">
                              Paid
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getStatusBadgeColor(order.status, order.isCancelled)} text-white`}>
                          {order.isCancelled ? 'CANCELLED' : order.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {urgentOrders.length > 500 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Showing first 500 of {urgentOrders.length} orders. Export to CSV for full list.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
