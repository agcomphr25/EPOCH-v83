import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Edit, Eye, Package, CalendarDays, User, FileText, Download } from 'lucide-react';
import { format } from 'date-fns';
import CustomerDetailsTooltip from '@/components/CustomerDetailsTooltip';
import OrderPricingTooltip from '@/components/OrderPricingTooltip';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerPO: string;
  fbOrderNumber: string;
  agrOrderDetails: string;
  modelId: string;
  handedness: string;
  features: any;
  featureQuantities: any;
  discountCode: string;
  shipping: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  customerType: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function OrdersList() {
  console.log('OrdersList component rendering - with CSV export');
  
  const handleExportCSV = async () => {
    try {
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
    } catch (error) {
      console.error('CSV export error:', error);
      alert('Failed to export CSV. Please try again.');
    }
  };
  
  try {
    const { data: orders, isLoading, error } = useQuery<Order[]>({
      queryKey: ['/api/orders/all'],
      refetchInterval: 30000, // Auto-refresh every 30 seconds
      refetchOnWindowFocus: true, // Refresh when window regains focus
    });

    const { data: customers } = useQuery<Customer[]>({
      queryKey: ['/api/customers'],
    });

    const { data: stockModels } = useQuery<StockModel[]>({
      queryKey: ['/api/stock-models'],
    });

    console.log('Orders data:', orders);
    console.log('Customers data:', customers);
    console.log('Loading state:', isLoading);
    console.log('Error state:', error);

  const getCustomerName = (customerId: string) => {
    if (!customers) return customerId;
    const customer = customers.find(c => c.id.toString() === customerId);
    return customer ? customer.name : customerId;
  };

  const getModelDisplayName = (modelId: string) => {
    if (!stockModels) return modelId;
    const model = stockModels.find(m => m.id === modelId);
    return model ? model.displayName : modelId;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              Error loading orders. Please try again later.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'DRAFT':
        return 'bg-yellow-100 text-yellow-800';
      case 'FINALIZED':
        return 'bg-green-100 text-green-800';
      case 'SHIPPED':
        return 'bg-blue-100 text-blue-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="h-6 w-6" />
              All Orders
            </h1>
            <p className="text-gray-600 mt-1">
              View and manage all created orders - with CSV export
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={handleExportCSV}
              variant="outline" 
              className="flex items-center gap-2"
              data-testid="export-csv-button"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Link href="/order-entry">
              <Button className="flex items-center gap-2" data-testid="create-order-button">
                <FileText className="h-4 w-4" />
                Create New Order
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {!orders || orders.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No orders found</h3>
              <p className="text-gray-600 mb-4">
                You haven't created any orders yet. Start by creating your first order.
              </p>
              <Link href="/order-entry">
                <Button>
                  Create Your First Order
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Orders ({orders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow 
                    key={order.id}
                    className={order.isCustomOrder === 'yes' ? 'bg-pink-50 hover:bg-pink-100' : ''}
                  >
                    <TableCell className="font-medium">
                      <OrderPricingTooltip orderId={order.orderId}>
                        <span className="text-blue-600 hover:text-blue-800 cursor-pointer">
                          {order.orderId}
                        </span>
                      </OrderPricingTooltip>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <CustomerDetailsTooltip 
                        customerId={order.customerId} 
                        customerName={getCustomerName(order.customerId) || 'N/A'}
                      >
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          {getCustomerName(order.customerId) || 'N/A'}
                        </div>
                      </CustomerDetailsTooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-400" />
                        {getModelDisplayName(order.modelId) || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-gray-400" />
                        {format(new Date(order.orderDate), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-gray-400" />
                        {format(new Date(order.dueDate), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link href={`/order-entry?draft=${order.id}`}>
                          <Button variant="outline" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
  } catch (error) {
    console.error('Error in OrdersList component:', error);
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Orders</h3>
            <p className="text-red-700">An error occurred while loading the orders page. Please try refreshing the page.</p>
            <p className="text-sm text-red-600 mt-2">Error: {error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      </div>
    );
  }
}