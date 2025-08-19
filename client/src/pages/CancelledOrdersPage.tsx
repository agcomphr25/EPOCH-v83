import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Calendar, User, AlertTriangle, XCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerName?: string;
  fbOrderNumber?: string;
  modelId?: string;
  status?: string;
  isCancelled?: boolean;
  cancelReason?: string;
  cancelledAt?: string;
  createdAt: string;
}

export default function CancelledOrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'orderDate' | 'cancelledAt' | 'orderId' | 'customer'>('cancelledAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch all orders
  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/all'],
    queryFn: () => apiRequest('/api/orders/all'),
  });

  // Fetch customers for name resolution
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('/api/customers'),
  });

  const getCustomerName = (customerId: string) => {
    if (!customers || !customerId) return customerId || '';
    const customer = customers.find(c => c.id.toString() === customerId);
    return customer?.name || customerId || '';
  };

  const getCustomerPhone = (customerId: string) => {
    if (!customers || !customerId) return '';
    const customer = customers.find(c => c.id.toString() === customerId);
    return customer?.phone || '';
  };

  // Filter to show only cancelled orders
  const cancelledOrders = useMemo(() => {
    if (!orders) return [];
    
    let filtered = orders.filter(order => order.isCancelled || order.status === 'CANCELLED');
    
    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((order) => {
        // Search by Order ID
        if (order.orderId && order.orderId.toLowerCase().includes(term)) {
          return true;
        }
        
        // Search by Customer Name
        const customerName = getCustomerName(order.customerId);
        if (customerName && customerName.toLowerCase().includes(term)) {
          return true;
        }
        
        // Search by Customer Phone
        const customerPhone = getCustomerPhone(order.customerId);
        if (customerPhone && customerPhone.toLowerCase().includes(term)) {
          return true;
        }
        
        // Search by FB Order Number
        if (order.fbOrderNumber && order.fbOrderNumber.toLowerCase().includes(term)) {
          return true;
        }
        
        // Search by cancellation reason
        if (order.cancelReason && order.cancelReason.toLowerCase().includes(term)) {
          return true;
        }
        
        return false;
      });
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
        case 'cancelledAt':
          aValue = new Date(a.cancelledAt || a.createdAt);
          bValue = new Date(b.cancelledAt || b.createdAt);
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
  }, [orders, customers, searchTerm, sortBy, sortOrder]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getDisplayOrderId = (order: Order) => {
    return order.fbOrderNumber || order.orderId;
  };

  if (ordersLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading cancelled orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Cancelled Orders</h1>
              <p className="text-gray-600">View and manage cancelled orders</p>
            </div>
          </div>

          {/* Search and Filter Controls */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by Order ID, Customer Name, Phone, FB Order #, Cancel Reason..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Sort By */}
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cancelledAt">Cancelled Date</SelectItem>
                  <SelectItem value="orderDate">Order Date</SelectItem>
                  <SelectItem value="orderId">Order ID</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort Order */}
              <Select value={sortOrder} onValueChange={(value: any) => setSortOrder(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest</SelectItem>
                  <SelectItem value="asc">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results Summary */}
            <div className="mt-4 text-sm text-gray-600">
              Showing {cancelledOrders.length} cancelled order{cancelledOrders.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Orders Grid */}
        {cancelledOrders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Cancelled Orders Found</h3>
              <p className="text-gray-600">
                {searchTerm ? 'Try adjusting your search criteria.' : 'No orders have been cancelled yet.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {cancelledOrders.map((order) => (
              <Card key={order.id} className="border-red-200 bg-red-50/50">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="bg-red-600">
                            <XCircle className="h-3 w-3 mr-1" />
                            CANCELLED
                          </Badge>
                          <h3 className="text-lg font-semibold text-gray-900">
                            {getDisplayOrderId(order)}
                          </h3>
                          {order.fbOrderNumber && order.orderId !== order.fbOrderNumber && (
                            <Badge variant="outline" className="text-xs">
                              AG: {order.orderId}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">Customer:</span>
                          <span>{getCustomerName(order.customerId)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">Order Date:</span>
                          <span>{formatDate(order.orderDate)}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">Due Date:</span>
                          <span>{formatDate(order.dueDate)}</span>
                        </div>

                        {order.modelId && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Model:</span>
                            <span>{order.modelId}</span>
                          </div>
                        )}
                      </div>

                      {order.cancelReason && (
                        <div className="mt-4 p-3 bg-red-100 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-medium text-red-900">Cancellation Reason:</span>
                              <p className="text-red-800 mt-1">{order.cancelReason}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-right text-sm text-gray-500">
                      {order.cancelledAt && (
                        <div>
                          Cancelled: {formatDate(order.cancelledAt)}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}