import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Filter,
  Download,
  Search,
  X,
  ChevronDown,
  FileSpreadsheet,
  AlertCircle,
  ShieldX,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { getDisplayOrderId } from '@/lib/orderUtils';
import OrderSummaryModal from '@/components/OrderSummaryModal';
import { useLocation, Link } from 'wouter';

const ALLOWED_USERS = ['glennj'];

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
}

interface Customer {
  id: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
}

const ORDER_STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'FINALIZED', label: 'Finalized' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'SCRAPPED', label: 'Scrapped' },
  { value: 'ON_HOLD', label: 'On Hold' },
];

export default function FilteredOrdersReport() {
  const [, setLocation] = useLocation();
  
  // Check user access
  const { data: currentUser, isLoading: userLoading } = useQuery<{ username: string }>({
    queryKey: ['/api/auth/me'],
  });
  
  // Filter states - must be declared before any conditional returns
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [excludedCustomers, setExcludedCustomers] = useState<Set<string>>(new Set());
  const [excludeDropdownOpen, setExcludeDropdownOpen] = useState(false);

  // Fetch orders - must be declared before any conditional returns
  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
  });

  // Fetch customers for exclusion lookup
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
  });

  // Helper to get model display name
  const getModelDisplayName = (modelId: string) => {
    if (!modelId || !stockModels || stockModels.length === 0) {
      return modelId || 'Unknown Model';
    }
    const model = (stockModels as any[]).find((m: any) => m && m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Get customer name for an order
  const getCustomerName = (order: Order): string => {
    return order.customer || 'Unknown Customer';
  };

  // Get unique customer names from orders for exclusion list
  const uniqueCustomerNames = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((order) => {
      const name = getCustomerName(order);
      if (name && name !== 'Unknown Customer') {
        names.add(name);
      }
    });
    return Array.from(names).sort();
  }, [orders]);

  // Filter customers based on search
  const filteredCustomersForExclusion = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const searchLower = customerSearch.toLowerCase();
    return uniqueCustomerNames.filter((name) =>
      name.toLowerCase().includes(searchLower)
    ).slice(0, 10); // Limit to 10 results
  }, [uniqueCustomerNames, customerSearch]);

  // Apply all filters - must be before conditional return
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Filter by selected statuses
    if (selectedStatuses.length > 0) {
      result = result.filter((order) => {
        const orderStatus = order.status?.toUpperCase() || '';
        const isCancelled = order.isCancelled === true;
        
        // Handle cancelled status specially
        if (selectedStatuses.includes('CANCELLED')) {
          if (isCancelled || orderStatus === 'CANCELLED') {
            return true;
          }
        }
        
        return selectedStatuses.includes(orderStatus);
      });
    }

    // Filter by date range
    if (startDate) {
      result = result.filter((order) => {
        const orderDate = order.orderDate?.split('T')[0];
        return orderDate && orderDate >= startDate;
      });
    }
    if (endDate) {
      result = result.filter((order) => {
        const orderDate = order.orderDate?.split('T')[0];
        return orderDate && orderDate <= endDate;
      });
    }

    // Exclude selected customers
    if (excludedCustomers.size > 0) {
      result = result.filter((order) => {
        const customerName = getCustomerName(order);
        return !excludedCustomers.has(customerName);
      });
    }

    return result;
  }, [orders, selectedStatuses, startDate, endDate, excludedCustomers]);
  
  // Access check
  const hasAccess = currentUser?.username && ALLOWED_USERS.includes(currentUser.username);

  // Show access denied if user doesn't have access (after all hooks)
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

  // Toggle customer exclusion
  const toggleCustomerExclusion = (customerName: string) => {
    setExcludedCustomers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(customerName)) {
        newSet.delete(customerName);
      } else {
        newSet.add(customerName);
      }
      return newSet;
    });
  };

  // Toggle status selection
  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  // Format date for display
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

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      'Order ID',
      'FB Order #',
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

    const rows = filteredOrders.map((order) => [
      getDisplayOrderId(order),
      order.fbOrderNumber || '',
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
    link.download = `filtered_orders_report_${timestamp}.csv`;
    link.click();
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedStatuses([]);
    setStartDate('');
    setEndDate('');
    setCustomerSearch('');
    setExcludedCustomers(new Set());
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

  const hasActiveFilters = selectedStatuses.length > 0 || startDate || endDate || excludedCustomers.size > 0;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
          Filtered Orders Report
        </h1>
        <p className="text-muted-foreground mt-2">
          Filter orders by status, date range, and exclude specific customers
        </p>
      </div>

      {/* Filters Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Filter */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Order Status (select one or more)</Label>
            <div className="flex flex-wrap gap-2">
              {ORDER_STATUSES.map((status) => (
                <div key={status.value} className="flex items-center">
                  <Button
                    type="button"
                    variant={selectedStatuses.includes(status.value) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleStatus(status.value)}
                    data-testid={`button-status-${status.value.toLowerCase()}`}
                  >
                    {status.label}
                    {selectedStatuses.includes(status.value) && (
                      <X className="h-3 w-3 ml-1" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
            {selectedStatuses.length > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Selected: {selectedStatuses.map((s) => ORDER_STATUSES.find((st) => st.value === s)?.label).join(', ')}
              </p>
            )}
          </div>

          {/* Date Range Filter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start-date">Start Date (optional)</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            <div>
              <Label htmlFor="end-date">End Date (optional)</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
          </div>

          {/* Customer Exclusion */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Exclude Customers</Label>
            <div className="flex gap-2 items-start">
              <Popover open={excludeDropdownOpen} onOpenChange={setExcludeDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-80 justify-between" data-testid="button-exclude-customers">
                    <span className="flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Type to search and exclude customers...
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="start">
                  <div className="p-2 border-b">
                    <Input
                      placeholder="Type customer name..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      autoFocus
                      data-testid="input-customer-search"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {customerSearch.trim() === '' ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        Start typing to search for customers
                      </div>
                    ) : filteredCustomersForExclusion.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        No customers found matching "{customerSearch}"
                      </div>
                    ) : (
                      filteredCustomersForExclusion.map((name) => (
                        <div
                          key={name}
                          className="flex items-center gap-2 p-2 hover:bg-muted cursor-pointer"
                          onClick={() => toggleCustomerExclusion(name)}
                          data-testid={`option-customer-${name.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          <Checkbox
                            checked={excludedCustomers.has(name)}
                            onCheckedChange={() => toggleCustomerExclusion(name)}
                          />
                          <span className="text-sm">{name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Show excluded customers */}
            {excludedCustomers.size > 0 && (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground mb-2">Excluded customers:</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(excludedCustomers).map((name) => (
                    <Badge
                      key={name}
                      variant="secondary"
                      className="flex items-center gap-1 cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => toggleCustomerExclusion(name)}
                      data-testid={`badge-excluded-${name.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {name}
                      <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4 mr-2" />
              Clear All Filters
            </Button>
            <Button
              onClick={exportToCSV}
              disabled={filteredOrders.length === 0}
              data-testid="button-export-csv"
            >
              <Download className="h-4 w-4 mr-2" />
              Export to CSV ({filteredOrders.length} orders)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              Results ({filteredOrders.length} of {orders.length} orders)
            </span>
            {!hasActiveFilters && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-normal">
                <AlertCircle className="h-4 w-4" />
                Select at least one status filter to narrow results
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {hasActiveFilters
                ? 'No orders match the selected filters'
                : 'Select filters above to see results'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Customer PO</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Current Dept</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.slice(0, 500).map((order) => (
                    <TableRow
                      key={order.orderId}
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
              {filteredOrders.length > 500 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Showing first 500 of {filteredOrders.length} orders. Export to CSV for full list.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
