import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Truck,
  Search,
  Package,
  Eye,
  Clock,
  CheckCircle,
} from 'lucide-react';

interface RTSOrder {
  id: number;
  orderId: string;
  customer: string;
  customerId: string | null;
  product: string | null;
  modelId: string | null;
  orderDate: Date;
  dueDate: Date;
  currentDepartment: string;
  status: string;
  trackingNumber: string | null;
  shippedDate: Date | null;
}

export default function RTSPage() {
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all orders and filter for RTS (Shipping QC and Shipping departments)
  const { data: allOrders, isLoading } = useQuery<RTSOrder[]>({
    queryKey: ['/api/orders/with-payment-status'],
  });

  // Filter for ready-to-ship orders
  const rtsOrders = allOrders?.filter(
    (order) =>
      (order.currentDepartment === 'Shipping QC' ||
        order.currentDepartment === 'Shipping') &&
      order.status !== 'FULFILLED' &&
      order.status !== 'CANCELLED' &&
      order.status !== 'SCRAPPED'
  );

  // Apply search filter
  const filteredOrders = rtsOrders?.filter((order) => {
    if (!searchTerm.trim()) return true;

    const searchLower = searchTerm.toLowerCase();
    return (
      order.orderId?.toLowerCase().includes(searchLower) ||
      order.customer?.toLowerCase().includes(searchLower) ||
      order.customerId?.toLowerCase().includes(searchLower) ||
      order.product?.toLowerCase().includes(searchLower) ||
      order.modelId?.toLowerCase().includes(searchLower)
    );
  });

  const handleViewSalesOrder = (orderId: string) => {
    window.open(`/api/shipping-pdf/sales-order/${orderId}`, '_blank');
  };

  const getDaysUntilDue = (dueDate: Date | null | undefined) => {
    if (!dueDate) return null;
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getDueDateBadge = (dueDate: Date | null | undefined) => {
    const daysUntilDue = getDaysUntilDue(dueDate);

    if (daysUntilDue === null) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          No due date
        </Badge>
      );
    }

    if (daysUntilDue < 0) {
      return (
        <Badge variant="destructive" className="gap-1">
          <Clock className="h-3 w-3" />
          {Math.abs(daysUntilDue)} days overdue
        </Badge>
      );
    } else if (daysUntilDue === 0) {
      return (
        <Badge variant="destructive" className="gap-1">
          <Clock className="h-3 w-3" />
          Due today
        </Badge>
      );
    } else if (daysUntilDue <= 3) {
      return (
        <Badge className="bg-orange-100 text-orange-800 gap-1">
          <Clock className="h-3 w-3" />
          Due in {daysUntilDue} days
        </Badge>
      );
    } else if (daysUntilDue <= 7) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 gap-1">
          <Clock className="h-3 w-3" />
          Due in {daysUntilDue} days
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          Due in {daysUntilDue} days
        </Badge>
      );
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Ready to Ship (RTS)</h1>
            <p className="text-sm text-gray-600">
              Orders in Shipping QC and Shipping departments ready for shipment
            </p>
          </div>
        </div>
        {filteredOrders && (
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {filteredOrders.length} Order{filteredOrders.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by Order ID, Customer, or Product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-rts"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Ready to Ship Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Clock className="h-6 w-6 animate-spin mr-2" />
              Loading orders...
            </div>
          ) : !filteredOrders || filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p className="text-lg font-medium">No orders ready to ship</p>
              <p className="text-sm">All orders have been shipped or are in earlier departments</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.orderId} data-testid={`row-rts-${order.orderId}`}>
                      <TableCell className="font-mono font-medium" data-testid={`text-order-id-${order.orderId}`}>
                        {order.orderId}
                      </TableCell>
                      <TableCell data-testid={`text-customer-${order.orderId}`}>
                        {order.customer}
                      </TableCell>
                      <TableCell data-testid={`text-product-${order.orderId}`}>
                        {order.product || order.modelId || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {order.currentDepartment}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(order.orderDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {getDueDateBadge(order.dueDate)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            order.trackingNumber
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }
                        >
                          {order.trackingNumber ? 'Tracking Added' : 'Pending Tracking'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewSalesOrder(order.orderId)}
                            className="flex items-center gap-1"
                            data-testid={`button-view-order-${order.orderId}`}
                          >
                            <Eye className="h-3 w-3" />
                            View Order
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
