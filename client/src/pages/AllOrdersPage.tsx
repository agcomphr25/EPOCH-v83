import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, X, Download } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

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
}

export default function AllOrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status', 'v2'],
    queryFn: () => apiRequest('/api/orders/with-payment-status'),
    refetchInterval: 30000
  });

  // Filter orders based on search and department
  const filteredOrders = orders.filter(order => {
    // Department filter
    const departmentMatch = selectedDepartment === 'all' || order.currentDepartment === selectedDepartment;

    // Search filter - search in multiple fields including FB Order Number
    if (!searchTerm.trim()) {
      return departmentMatch;
    }

    const searchLower = searchTerm.toLowerCase();
    const searchFields = [
      order.orderId?.toLowerCase(),
      order.fbOrderNumber?.toLowerCase(), // Include FB Order Number in search
      order.customer?.toLowerCase(),
      order.customerId?.toLowerCase(),
      order.product?.toLowerCase(),
      order.modelId?.toLowerCase()
    ].filter(Boolean);

    const searchMatch = searchFields.some(field => field?.includes(searchLower));

    return departmentMatch && searchMatch;
  });

  const departments = ['P1 Production Queue', 'Layup', 'Plugging', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'QC', 'Shipping'];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">All Orders</h1>
          <div className="text-sm text-gray-500">
            Order Management & Department Progression
          </div>
        </div>
        <Card>
          <CardContent>
            <div className="text-center py-8">Loading orders...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">All Orders</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            View and manage all created orders - with CSV export
          </div>
          <Button variant="outline" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>📋 All Orders</span>
              <span className="text-sm text-gray-500">Orders ({filteredOrders.length})</span>
            </div>
            <div className="flex items-center gap-4">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by Order ID, Customer Name, Phone, or FB Order #..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-96"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-6 w-6 p-0"
                    onClick={() => setSearchTerm('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Department:</span>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Sort by:</span>
                <Select defaultValue="orderDate">
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orderDate">Order Date</SelectItem>
                    <SelectItem value="dueDate">Due Date</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Current Department</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map(order => (
                <TableRow key={order.orderId}>
                  <TableCell className="font-medium">
                    {order.fbOrderNumber || order.orderId}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {order.currentDepartment}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.customer || 'N/A'}</TableCell>
                  <TableCell>{order.product || order.modelId}</TableCell>
                  <TableCell>
                    {order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell>
                    {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={order.status === 'SCRAPPED' ? 'destructive' : 'default'}>
                      {order.status || 'ACTIVE'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredOrders.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No orders found for the selected criteria
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}