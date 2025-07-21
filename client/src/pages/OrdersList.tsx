import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Edit, Eye, Package, CalendarDays, User, FileText, Download, QrCode, ArrowRight, Search } from 'lucide-react';
import { format } from 'date-fns';
import CustomerDetailsTooltip from '@/components/CustomerDetailsTooltip';
import OrderPricingTooltip from '@/components/OrderPricingTooltip';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { queryClient, apiRequest } from '@/lib/queryClient';
import toast from 'react-hot-toast';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerPO: string;
  fbOrderNumber: string;
  agrOrderDetails: string;
  isCustomOrder: string | null;
  modelId: string;
  handedness: string;
  features: any;
  featureQuantities: any;
  discountCode: string;
  shipping: number;
  status: string;
  currentDepartment?: string;
  barcode?: string;
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
  const [selectedOrderBarcode, setSelectedOrderBarcode] = useState<{orderId: string, barcode: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Department progression functions
  const getNextDepartment = (currentDepartment: string) => {
    const departmentFlow = [
      'Layup', 'Plugging', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'QC', 'Shipping'
    ];
    const currentIndex = departmentFlow.indexOf(currentDepartment);
    if (currentIndex >= 0 && currentIndex < departmentFlow.length - 1) {
      return departmentFlow[currentIndex + 1];
    }
    return null;
  };

  // Progress order mutation
  const progressOrderMutation = useMutation({
    mutationFn: async ({ orderId, nextDepartment }: { orderId: string, nextDepartment: string }) => {
      return apiRequest(`/api/orders/${orderId}/progress`, {
        method: 'POST',
        body: { nextDepartment }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      toast.success('Order progressed successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to progress order');
    }
  });

  const handleProgressOrder = (orderId: string, nextDepartment: string) => {
    progressOrderMutation.mutate({ orderId, nextDepartment });
  };
  
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
    if (!customers || !customerId) return customerId || '';
    const customer = customers.find(c => c.id.toString() === customerId);
    return customer?.name || customerId || '';
  };

  const getCustomerPhone = (customerId: string) => {
    if (!customers || !customerId) return '';
    const customer = customers.find(c => c.id.toString() === customerId);
    return customer?.phone || '';
  };

  // Filter orders based on search term
  const filteredOrders = useMemo(() => {
    if (!orders || !searchTerm.trim()) {
      return orders || [];
    }
    
    const term = searchTerm.toLowerCase().trim();
    return orders.filter((order) => {
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
      
      return false;
    });
  }, [orders, customers, searchTerm]);

  const getModelDisplayName = (modelId: string) => {
    if (!stockModels) return modelId;
    const model = stockModels.find(m => m.id === modelId);
    return model ? model.displayName : modelId;
  };

  const getStockModelName = (modelId: string | null) => {
    if (!modelId) return '';
    const stockModel = stockModels?.find(sm => sm.id === modelId);
    return stockModel ? stockModel.displayName : '';
  };

  const getActionLengthAbbreviation = (features: any) => {
    if (!features || typeof features !== 'object') return '';
    
    const actionLength = features.action_length;
    if (!actionLength) return '';
    
    switch (actionLength.toLowerCase()) {
      case 'long':
        return 'LA';
      case 'medium':
        return 'MA';
      case 'short':
        return 'SA';
      default:
        return actionLength.toUpperCase().substring(0, 2);
    }
  };

  const getPaintOption = (features: any) => {
    if (!features || typeof features !== 'object') return 'Standard';
    
    const paintOptions = [];
    
    // Check for paint_options_combined first (newer format)
    if (features.paint_options_combined) {
      const combined = features.paint_options_combined;
      if (typeof combined === 'string') {
        // Parse format like "camo_patterns:canyon_rogue" or "cerakote_colors:carbon_black"
        const parts = combined.split(':');
        if (parts.length === 2) {
          const [category, value] = parts;
          // Convert underscore format to display format with proper casing
          let displayValue = value.replace(/_/g, ' ');
          
          // Handle special cases and proper capitalization
          displayValue = displayValue.replace(/\b\w/g, l => l.toUpperCase());
          
          // Fix common formatting issues
          displayValue = displayValue
            .replace(/Rogue/g, 'Rogue')
            .replace(/Camo/g, 'Camo')
            .replace(/Web/g, 'Web')
            .replace(/Desert Night/g, 'Desert Night')
            .replace(/Carbon/g, 'Carbon');
            
          paintOptions.push(displayValue);
        }
      }
    }
    
    // Check for individual paint/coating features
    const paintKeys = [
      'cerakote_color', 
      'cerakote_colors',
      'camo_patterns',
      'paint_finish', 
      'coating', 
      'finish',
      'protective_coatings',
      'surface_treatment',
      'anodizing',
      'powder_coating'
    ];
    
    for (const key of paintKeys) {
      if (features[key] && features[key] !== '' && features[key] !== 'none') {
        // Convert underscore format to display format
        const displayValue = features[key].replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        paintOptions.push(displayValue);
      }
    }
    
    // If no paint options found, return Standard
    if (paintOptions.length === 0) {
      return 'Standard';
    }
    
    // Combine all paint options into a single line
    return paintOptions.join(' + ');
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
        
        {/* Search Input */}
        <div className="flex items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Search by Order ID, Customer Name, or Phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          {searchTerm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchTerm('')}
              className="px-3"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {!filteredOrders || filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              {searchTerm ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No orders match your search</h3>
                  <p className="text-gray-600 mb-4">
                    No orders found for "{searchTerm}". Try a different search term.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setSearchTerm('')}
                  >
                    Clear Search
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No orders found</h3>
                  <p className="text-gray-600 mb-4">
                    You haven't created any orders yet. Start by creating your first order.
                  </p>
                  <Link href="/order-entry">
                    <Button>
                      Create Your First Order
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Orders ({filteredOrders.length}{searchTerm ? ` of ${orders?.length || 0}` : ''})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current Department</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
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
                      <Badge variant="secondary">
                        {order.currentDepartment || 'Not Set'}
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
                        {(() => {
                          const nextDept = getNextDepartment(order.currentDepartment || '');
                          const isComplete = order.currentDepartment === 'Shipping';
                          const isScrapped = order.status === 'SCRAPPED';
                          
                          if (!isScrapped && !isComplete && nextDept) {
                            return (
                              <Button
                                size="sm"
                                onClick={() => handleProgressOrder(order.orderId, nextDept)}
                                disabled={progressOrderMutation.isPending}
                              >
                                <ArrowRight className="w-4 h-4 mr-1" />
                                {nextDept}
                              </Button>
                            );
                          }
                          return null;
                        })()}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setSelectedOrderBarcode({
                                orderId: order.orderId,
                                barcode: order.barcode || `P1-${order.orderId}`
                              })}
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>Order Barcode</DialogTitle>
                            </DialogHeader>
                            {selectedOrderBarcode && (
                              <BarcodeDisplay 
                                orderId={selectedOrderBarcode.orderId}
                                barcode={selectedOrderBarcode.barcode}
                                showTitle={false}
                                customerName={getCustomerName(order.customerId)}
                                orderDate={order.orderDate}
                                dueDate={order.dueDate}
                                status={order.status}
                                actionLength={getActionLengthAbbreviation(order.features)}
                                stockModel={getStockModelName(order.modelId)}
                                paintOption={getPaintOption(order.features)}
                              />
                            )}
                          </DialogContent>
                        </Dialog>
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