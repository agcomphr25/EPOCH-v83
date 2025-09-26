import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpDown, Download, Filter, RefreshCw } from "lucide-react";
import { format } from "date-fns";

interface PastDueOrder {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerName: string;
  modelId: string;
  currentDepartment: string;
  status: string;
  daysOverdue: number;
  notes?: string;
  barcode?: string;
}

interface FilterOptions {
  status: string;
  department: string;
  daysOverdue: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  limit: number;
  offset: number;
}

const DEPARTMENTS = [
  'Layup',
  'Plugging', 
  'CNC',
  'Finish',
  'Gunsmith',
  'Paint',
  'QC',
  'Shipping'
];

const STATUS_OPTIONS = [
  'FINALIZED',
  'IN_PROGRESS',
  'PENDING',
  'READY_TO_SHIP'
];

export default function PastDueOrdersTracker() {
  const [filters, setFilters] = useState<FilterOptions>({
    status: '',
    department: '',
    daysOverdue: '',
    sortBy: 'dueDate',
    sortOrder: 'asc',
    limit: 100,
    offset: 0
  });

  const { data: orders = [], isLoading, error, refetch } = useQuery({
    queryKey: ['/api/orders/past-due', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value.toString());
      });

      const response = await fetch(`/api/orders/past-due?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch past due orders');
      }
      return response.json();
    }
  });

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      offset: 0 // Reset to first page when filtering
    }));
  };

  const handleSort = (column: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'asc' ? 'desc' : 'asc'
    }));
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      department: '',
      daysOverdue: '',
      sortBy: 'dueDate',
      sortOrder: 'asc',
      limit: 100,
      offset: 0
    });
  };

  const getDaysOverdueBadgeVariant = (days: number) => {
    if (days <= 7) return 'secondary';
    if (days <= 30) return 'default';
    return 'destructive';
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Order ID', 'Customer', 'Model', 'Due Date', 'Days Overdue', 'Department', 'Status', 'Notes'].join(','),
      ...orders.map((order: PastDueOrder) => [
        order.orderId,
        order.customerName || 'Unknown',
        order.modelId || 'N/A',
        format(new Date(order.dueDate), 'yyyy-MM-dd'),
        order.daysOverdue,
        order.currentDepartment,
        order.status,
        (order.notes || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `past-due-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="past-due-orders-tracker">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100" data-testid="title-past-due-orders">
            Past Due Orders Tracker
          </h1>
          <p className="text-gray-600 dark:text-gray-400" data-testid="subtitle-description">
            Monitor and manage orders that are past their due date
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            variant="outline" 
            onClick={exportToCSV}
            disabled={!orders.length}
            data-testid="button-export"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Past Due
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="count-total-past-due">
              {orders.length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              1-7 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="count-1-7-days">
              {orders.filter((o: PastDueOrder) => o.daysOverdue <= 7).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              8-30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600" data-testid="count-8-30-days">
              {orders.filter((o: PastDueOrder) => o.daysOverdue > 7 && o.daysOverdue <= 30).length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              30+ Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="count-30-plus-days">
              {orders.filter((o: PastDueOrder) => o.daysOverdue > 30).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map(status => (
                    <SelectItem key={status} value={status}>
                      {status.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Department</label>
              <Select value={filters.department} onValueChange={(value) => handleFilterChange('department', value)}>
                <SelectTrigger data-testid="select-department-filter">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Departments</SelectItem>
                  {DEPARTMENTS.map(dept => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Days Overdue</label>
              <Select value={filters.daysOverdue} onValueChange={(value) => handleFilterChange('daysOverdue', value)}>
                <SelectTrigger data-testid="select-days-overdue-filter">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="1">1+ Days</SelectItem>
                  <SelectItem value="7">7+ Days</SelectItem>
                  <SelectItem value="30">30+ Days</SelectItem>
                  <SelectItem value="60">60+ Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Sort By</label>
              <Select value={filters.sortBy} onValueChange={(value) => handleFilterChange('sortBy', value)}>
                <SelectTrigger data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dueDate">Due Date</SelectItem>
                  <SelectItem value="customerName">Customer</SelectItem>
                  <SelectItem value="currentDepartment">Department</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="orderDate">Order Date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button 
                variant="outline" 
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8" data-testid="loading-indicator">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Loading past due orders...
            </div>
          ) : error ? (
            <div className="text-red-600 text-center py-8" data-testid="error-message">
              Error loading orders: {error.message}
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-gray-500" data-testid="no-orders-message">
              No past due orders found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      onClick={() => handleSort('orderId')}
                      className="h-auto p-0 font-semibold"
                      data-testid="sort-order-id"
                    >
                      Order ID <ArrowUpDown className="ml-1 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      onClick={() => handleSort('customerName')}
                      className="h-auto p-0 font-semibold"
                      data-testid="sort-customer"
                    >
                      Customer <ArrowUpDown className="ml-1 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      onClick={() => handleSort('dueDate')}
                      className="h-auto p-0 font-semibold"
                      data-testid="sort-due-date"
                    >
                      Due Date <ArrowUpDown className="ml-1 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Days Overdue</TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      onClick={() => handleSort('currentDepartment')}
                      className="h-auto p-0 font-semibold"
                      data-testid="sort-department"
                    >
                      Department <ArrowUpDown className="ml-1 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button 
                      variant="ghost" 
                      onClick={() => handleSort('status')}
                      className="h-auto p-0 font-semibold"
                      data-testid="sort-status"
                    >
                      Status <ArrowUpDown className="ml-1 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order: PastDueOrder) => (
                  <TableRow key={order.id} data-testid={`row-order-${order.orderId}`}>
                    <TableCell className="font-medium" data-testid={`cell-order-id-${order.orderId}`}>
                      {order.orderId}
                    </TableCell>
                    <TableCell data-testid={`cell-customer-${order.orderId}`}>
                      {order.customerName || 'Unknown Customer'}
                    </TableCell>
                    <TableCell data-testid={`cell-model-${order.orderId}`}>
                      {order.modelId || 'N/A'}
                    </TableCell>
                    <TableCell data-testid={`cell-due-date-${order.orderId}`}>
                      {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell data-testid={`cell-days-overdue-${order.orderId}`}>
                      <Badge variant={getDaysOverdueBadgeVariant(order.daysOverdue)}>
                        {order.daysOverdue} days
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`cell-department-${order.orderId}`}>
                      <Badge variant="outline">{order.currentDepartment}</Badge>
                    </TableCell>
                    <TableCell data-testid={`cell-status-${order.orderId}`}>
                      <Badge variant="secondary">{order.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" data-testid={`cell-notes-${order.orderId}`}>
                      {order.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}