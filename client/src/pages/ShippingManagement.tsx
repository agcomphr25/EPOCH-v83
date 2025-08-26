import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Truck, Package, Search, Filter, Send, CheckCircle, Clock, Download, FileText, DollarSign, ExternalLink } from 'lucide-react';
// Removed ShippingTracker import since we're using the simpler Track Order button approach
// Removed UPSLabelCreator import since we're now using Track Order instead of Create Label
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface OrderWithTracking {
  orderId: string;
  customer: string;
  product: string;
  currentDepartment: string;
  status: string;
  trackingNumber?: string;
  shippingCarrier?: string;
  shippedDate?: string;
  estimatedDelivery?: string;
  customerNotified?: boolean;
  notificationMethod?: string;
  deliveryConfirmed?: boolean;
  shippingCost?: number;
  labelGenerated?: boolean;
  labelGeneratedAt?: string;
}

export default function ShippingManagement() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  // Removed unused label creator state variables since we're now using Track Order instead of Create Label

  // Get shipping-ready orders
  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['/api/shipping/ready-for-shipping'],
  });

  // Mark order as shipped mutation
  const markShippedMutation = useMutation({
    mutationFn: ({ orderId, trackingData }: { orderId: string, trackingData: any }) => 
      apiRequest(`/api/shipping/mark-shipped/${orderId}`, {
        method: 'POST',
        body: trackingData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shipping/ready-for-shipping'] });
      toast({
        title: 'Order Shipped',
        description: 'Order has been marked as shipped and customer notified',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark order as shipped',
        variant: 'destructive',
      });
    },
  });

  const filteredOrders = orders?.filter((order: OrderWithTracking) => {
    const matchesSearch = order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (order.trackingNumber && order.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (filterStatus === 'all') return matchesSearch;
    if (filterStatus === 'shipped') return matchesSearch && order.trackingNumber;
    if (filterStatus === 'pending') return matchesSearch && !order.trackingNumber;
    if (filterStatus === 'delivered') return matchesSearch && order.deliveryConfirmed;
    if (filterStatus === 'notified') return matchesSearch && order.customerNotified;
    
    return matchesSearch;
  });

  const getStatusIcon = (order: OrderWithTracking) => {
    if (order.deliveryConfirmed) {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    } else if (order.trackingNumber) {
      return <Truck className="h-4 w-4 text-blue-600" />;
    } else {
      return <Package className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = (order: OrderWithTracking) => {
    if (order.deliveryConfirmed) {
      return 'Delivered';
    } else if (order.trackingNumber) {
      return 'Shipped';
    } else {
      return 'Pending';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString();
  };

  // Handler function for UPS tracking
  const handleTrackOrder = async (trackingNumber: string, orderId: string) => {
    try {
      // First try to get tracking data from our API
      const response = await fetch(`/api/shipping-pdf/track-ups/${trackingNumber}`);
      const data = await response.json();
      
      if (data.success) {
        // Show tracking information
        toast({
          title: "Tracking Information",
          description: `Order ${orderId} - Tracking: ${trackingNumber}`,
        });
        
        // Open UPS tracking page in new tab
        window.open(data.upsTrackingUrl, '_blank');
      } else {
        // Fallback to UPS website
        window.open(data.fallbackUrl || `https://www.ups.com/track?tracknum=${trackingNumber}`, '_blank');
        toast({
          title: "Tracking",
          description: `Opened UPS tracking for ${trackingNumber}`,
        });
      }
    } catch (error) {
      // Fallback to UPS website
      window.open(`https://www.ups.com/track?tracknum=${trackingNumber}`, '_blank');
      toast({
        title: "Tracking",
        description: `Opened UPS tracking for ${trackingNumber}`,
      });
    }
  };

  // Removed label creation functions since we're now using Track Order instead of Create Label

  const handleMarkShipped = (order: OrderWithTracking) => {
    if (!order.trackingNumber) {
      toast({
        title: 'No Tracking Number',
        description: 'Please create a shipping label first',
        variant: 'destructive',
      });
      return;
    }

    markShippedMutation.mutate({
      orderId: order.orderId,
      trackingData: {
        trackingNumber: order.trackingNumber,
        shippingCarrier: order.shippingCarrier || 'UPS',
        shippingMethod: 'Ground',
        sendNotification: true,
        notificationMethod: 'email',
      },
    });
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Fulfilled Orders</h1>
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6 text-blue-600" />
          <span className="text-sm text-gray-600">
            {filteredOrders?.length || 0} orders
          </span>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label htmlFor="search" className="block text-sm font-medium mb-1">
                Search Orders
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search by order ID, customer, or tracking number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-48">
              <label htmlFor="status" className="block text-sm font-medium mb-1">
                Status
              </label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="pending">Pending Shipment</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="notified">Customer Notified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Shipping Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="h-6 w-6 animate-spin mr-2" />
              Loading orders...
            </div>
          ) : filteredOrders?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders found matching your criteria
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Tracking Number</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Shipped Date</TableHead>
                  <TableHead>Customer Notified</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders?.map((order: OrderWithTracking) => (
                  <TableRow key={order.orderId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(order)}
                        <span className="text-sm">{getStatusText(order)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{order.orderId}</TableCell>
                    <TableCell>{order.customer}</TableCell>
                    <TableCell>{order.product}</TableCell>
                    <TableCell>
                      {order.trackingNumber ? (
                        <Badge variant="outline" className="font-mono">
                          {order.trackingNumber}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell>{order.shippingCarrier || 'UPS'}</TableCell>
                    <TableCell>{formatDate(order.shippedDate)}</TableCell>
                    <TableCell>
                      {order.customerNotified ? (
                        <Badge variant="default" className="flex items-center gap-1 w-fit">
                          <Send className="h-3 w-3" />
                          {order.notificationMethod || 'Yes'}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {order.trackingNumber ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleTrackOrder(order.trackingNumber!, order.orderId)}
                              className="flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Track Order
                            </Button>
                            {order.shippingCost && (
                              <Badge variant="outline" className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                ${order.shippingCost.toFixed(2)}
                              </Badge>
                            )}
                            {!order.shippedDate && (
                              <Button
                                size="sm"
                                onClick={() => handleMarkShipped(order)}
                                disabled={markShippedMutation.isPending}
                                className="flex items-center gap-1"
                              >
                                <Truck className="h-3 w-3" />
                                Mark Shipped
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            No Tracking Number
                          </Badge>
                        )}
                      </div>
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