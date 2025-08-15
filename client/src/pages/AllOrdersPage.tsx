import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Search, X, Download, MoreHorizontal, XCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
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
  isCancelled?: boolean;
  cancelledAt?: string;
  cancelReason?: string;
}

export default function AllOrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [sortBy, setSortBy] = useState<'orderDate' | 'dueDate' | 'customer' | 'model'>('orderDate');
  const [cancelReason, setCancelReason] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string>('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status', 'v2'],
    queryFn: () => apiRequest('/api/orders/with-payment-status'),
    refetchInterval: 30000
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      return apiRequest(`/api/orders/cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      toast({
        title: "Order Cancelled",
        description: "The order has been cancelled successfully.",
      });
      setIsDialogOpen(false);
      setCancelReason('');
      setOrderToCancel('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to cancel order: " + (error.message || 'Unknown error'),
        variant: "destructive",
      });
    }
  });

  const handleCancelOrder = (orderId: string) => {
    setOrderToCancel(orderId);
    setIsDialogOpen(true);
  };

  const confirmCancel = () => {
    if (orderToCancel && cancelReason.trim()) {
      cancelOrderMutation.mutate({ orderId: orderToCancel, reason: cancelReason });
    }
  };

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

  // Sort orders based on selected sort option
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    switch (sortBy) {
      case 'orderDate':
        return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(); // Newest first
      case 'dueDate':
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(); // Earliest due date first
      case 'customer':
        return (a.customer || '').localeCompare(b.customer || '');
      case 'model':
        return (a.modelId || '').localeCompare(b.modelId || '');
      default:
        return 0;
    }
  });

  const departments = ['P1 Production Queue', 'Layup/Plugging', 'Barcode', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'Shipping QC', 'Shipping'];

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
              <span className="text-sm text-gray-500">Orders ({sortedOrders.length})</span>
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
                <Select value={sortBy} onValueChange={(value: 'orderDate' | 'dueDate' | 'customer' | 'model') => setSortBy(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orderDate">Order Date</SelectItem>
                    <SelectItem value="dueDate">Due Date</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="model">Model</SelectItem>
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedOrders.map(order => (
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
                    <div className="flex items-center gap-2">
                      <Badge variant={order.status === 'SCRAPPED' ? 'destructive' : 'default'}>
                        {order.status || 'ACTIVE'}
                      </Badge>
                      {order.isFullyPaid ? (
                        <Badge className="bg-green-500 hover:bg-green-600 text-white">
                          PAID
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500 hover:bg-red-600 text-white">
                          NOT PAID
                        </Badge>
                      )}
                      {order.isCancelled && (
                        <Badge variant="destructive" className="bg-red-100 text-red-800">
                          CANCELLED
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!order.isCancelled && (
                          <DropdownMenuItem 
                            onClick={() => handleCancelOrder(order.orderId)}
                            className="text-red-600"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancel Order
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {sortedOrders.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No orders found for the selected criteria
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Order Dialog */}
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel order {orderToCancel}? This action cannot be undone.
              Please provide a reason for cancellation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Textarea
              placeholder="Enter reason for cancellation..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              disabled={!cancelReason.trim() || cancelOrderMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelOrderMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}