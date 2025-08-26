import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Search, Filter, SortAsc, SortDesc, RefreshCw } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customer?: string;
  product?: string;
  modelId: string;
  currentDepartment: string;
  status: string;
  fbOrderNumber?: string;
  paymentTotal?: number;
  isFullyPaid?: boolean;
  isPaid?: boolean;
  handedness?: string;
  createdAt: string;
  updatedAt: string;
}

interface Customer {
  id: number;
  name: string;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
}

const DEPARTMENTS = [
  'P1 Production Queue',
  'Layup/Plugging', 
  'Barcode',
  'CNC',
  'Finish',
  'Gunsmith',
  'Finish QC',
  'Paint',
  'Shipping QC',
  'Shipping'
];

export default function OrdersManagementPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('orderDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isExporting, setIsExporting] = useState(false);
  
  const { toast } = useToast();

  // Fetch orders data
  const { data: orders = [], isLoading, error, refetch } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
    queryFn: () => apiRequest('/api/orders/with-payment-status'),
    refetchOnWindowFocus: false,
  });

  // Fetch customers for name lookup
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('/api/customers'),
  });

  // Fetch stock models for product names
  const { data: stockModels = [] } = useQuery<StockModel[]>({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
  });

  // Helper functions
  const getCustomerName = (customerId: string) => {
    const customer = customers.find(c => c.id.toString() === customerId);
    return customer?.name || customerId || 'Unknown';
  };

  const getProductName = (order: Order) => {
    if (order.product) return order.product;
    if (order.modelId) {
      const model = stockModels.find(m => m.id === order.modelId);
      return model?.displayName || order.modelId;
    }
    return 'Unknown Product';
  };

  const getPaymentStatus = (order: Order) => {
    if (order.isFullyPaid) return 'Fully Paid';
    if (order.isPaid) return 'Partially Paid';
    return 'Unpaid';
  };

  const getDepartmentBadgeColor = (department: string) => {
    const colors: { [key: string]: string } = {
      'P1 Production Queue': 'bg-slate-600',
      'Layup/Plugging': 'bg-blue-500',
      'Barcode': 'bg-cyan-500',
      'CNC': 'bg-green-500',
      'Finish': 'bg-yellow-500',
      'Gunsmith': 'bg-purple-500',
      'Finish QC': 'bg-yellow-600',
      'Paint': 'bg-pink-500',
      'Shipping QC': 'bg-indigo-500',
      'Shipping': 'bg-gray-500'
    };
    return colors[department] || 'bg-gray-400';
  };

  const getStatusBadgeColor = (status: string) => {
    const colors: { [key: string]: string } = {
      'FINALIZED': 'bg-green-600',
      'IN_PROGRESS': 'bg-blue-600',
      'DRAFT': 'bg-gray-600',
      'COMPLETED': 'bg-emerald-600',
      'CANCELLED': 'bg-red-600',
      'SHIPPED': 'bg-teal-600'
    };
    return colors[status] || 'bg-gray-500';
  };

  // Filter and sort orders
  const filteredAndSortedOrders = useMemo(() => {
    let filtered = [...orders];

    // Exclude fulfilled orders
    filtered = filtered.filter(order => order.status !== 'FULFILLED');

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(order => 
        order.orderId?.toLowerCase().includes(term) ||
        order.fbOrderNumber?.toLowerCase().includes(term) ||
        getCustomerName(order.customerId).toLowerCase().includes(term) ||
        getProductName(order).toLowerCase().includes(term)
      );
    }

    // Apply department filter
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(order => order.currentDepartment === departmentFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'orderId':
          aValue = a.orderId;
          bValue = b.orderId;
          break;
        case 'customer':
          aValue = getCustomerName(a.customerId);
          bValue = getCustomerName(b.customerId);
          break;
        case 'product':
          aValue = getProductName(a);
          bValue = getProductName(b);
          break;
        case 'department':
          aValue = a.currentDepartment;
          bValue = b.currentDepartment;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'dueDate':
          aValue = new Date(a.dueDate);
          bValue = new Date(b.dueDate);
          break;
        case 'orderDate':
        default:
          aValue = new Date(a.orderDate);
          bValue = new Date(b.orderDate);
          break;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [orders, searchTerm, departmentFilter, statusFilter, sortBy, sortOrder, customers, stockModels]);

  // Get unique statuses for filter
  const uniqueStatuses = useMemo(() => {
    const statusSet = new Set(orders.map(order => order.status));
    const statuses = Array.from(statusSet).filter(Boolean);
    return statuses.sort();
  }, [orders]);

  // Handle CSV export
  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const response = await fetch('/api/orders/export/csv');
      
      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `orders_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "Orders have been exported to CSV file.",
      });
    } catch (error) {
      console.error('CSV export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export orders. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
    refetch();
    toast({
      title: "Data Refreshed",
      description: "Orders data has been refreshed.",
    });
  };

  // Format date helper
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US');
    } catch {
      return 'Invalid Date';
    }
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">
              Error loading orders: {(error as Error).message}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Orders Management</span>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                onClick={handleExportCSV}
                disabled={isExporting || isLoading}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters and Controls */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            {/* Search */}
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search Order ID, Customer, Product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {DEPARTMENTS.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {uniqueStatuses.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort By */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="orderDate">Order Date</SelectItem>
                <SelectItem value="dueDate">Due Date</SelectItem>
                <SelectItem value="orderId">Order ID</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="department">Department</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Order */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-2"
            >
              {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
              {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            </Button>
          </div>

          {/* Results Summary */}
          <div className="mb-4 text-sm text-muted-foreground">
            Showing {filteredAndSortedOrders.length} of {orders.length} orders
            {searchTerm && ` matching "${searchTerm}"`}
            {departmentFilter !== 'all' && ` in ${departmentFilter}`}
            {statusFilter !== 'all' && ` with status ${statusFilter}`}
          </div>

          {/* Orders Table */}
          {isLoading ? (
            <div className="text-center py-8">Loading orders...</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Current Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Payment Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No orders found matching your criteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAndSortedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.orderId}</TableCell>
                        <TableCell>{formatDate(order.orderDate)}</TableCell>
                        <TableCell>{formatDate(order.dueDate)}</TableCell>
                        <TableCell>{getCustomerName(order.customerId)}</TableCell>
                        <TableCell>{getProductName(order)}</TableCell>
                        <TableCell>
                          <Badge className={`${getDepartmentBadgeColor(order.currentDepartment)} text-white`}>
                            {order.currentDepartment}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getStatusBadgeColor(order.status)} text-white`}>
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={order.isFullyPaid ? 'default' : order.isPaid ? 'secondary' : 'destructive'}>
                            {getPaymentStatus(order)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          ${(order.paymentTotal || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}