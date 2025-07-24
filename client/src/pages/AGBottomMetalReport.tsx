import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, FileText, Filter } from 'lucide-react';
import { format } from 'date-fns';

interface Order {
  id: number;
  order_id: string;
  order_date: string;
  due_date: string;
  customer_id: string;
  customer_po: string;
  fb_order_number: string;
  agr_order_details: string;
  model_id: string;
  handedness: string;
  features: any;
  feature_quantities: any;
  discount_code: string;
  shipping: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function AGBottomMetalReport() {
  const [showExportOptions, setShowExportOptions] = useState(false);

  const { data: orders = [], isLoading, error } = useQuery<Order[]>({
    queryKey: ['/api/orders/drafts'],
  });

  // Filter orders with bottom metal that begins with "AG"
  const filteredOrders = orders.filter(order => {
    if (!order.features || typeof order.features !== 'object') {
      return false;
    }
    
    const bottomMetal = order.features.bottom_metal;
    if (!bottomMetal || typeof bottomMetal !== 'string') {
      return false;
    }
    
    return bottomMetal.toLowerCase().startsWith('ag');
  });

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

  const formatBottomMetal = (bottomMetal: string) => {
    return bottomMetal
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Function to export to CSV
  const exportToCSV = () => {
    const headers = [
      'Order ID',
      'Order Date', 
      'Due Date',
      'Customer ID',
      'Customer PO',
      'FB Order Number',
      'Model ID',
      'Handedness',
      'Bottom Metal',
      'Status',
      'Shipping'
    ];

    const csvData = filteredOrders.map(order => [
      order.order_id,
      format(new Date(order.order_date), 'MM/dd/yyyy'),
      format(new Date(order.due_date), 'MM/dd/yyyy'),
      order.customer_id || 'N/A',
      order.customer_po || 'N/A',
      order.fb_order_number || 'N/A',
      order.model_id || 'N/A',
      order.handedness || 'N/A',
      formatBottomMetal(order.features.bottom_metal),
      order.status,
      `$${order.shipping?.toFixed(2) || '0.00'}`
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ag-bottom-metal-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Loading orders...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6" />
            AG Bottom Metal Report
          </h1>
          <p className="text-gray-600 mt-1">
            Orders with bottom metal specifications beginning with "AG"
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            <Filter className="h-3 w-3 mr-1" />
            {filteredOrders.length} orders found
          </Badge>
          <Button
            variant="outline"
            onClick={() => setShowExportOptions(!showExportOptions)}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {showExportOptions && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <h3 className="font-medium">Export Options:</h3>
              <Button
                onClick={exportToCSV}
                className="inline-flex items-center gap-2 bg-green-600 text-white hover:bg-green-700"
              >
                <Download className="h-3 w-3" />
                Download CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Filtered Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders found with bottom metal specifications beginning with "AG"
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Customer PO</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Bottom Metal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Shipping</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">
                        {order.order_id}
                      </TableCell>
                      <TableCell>
                        {format(new Date(order.order_date), 'MM/dd/yyyy')}
                      </TableCell>
                      <TableCell>
                        {format(new Date(order.due_date), 'MM/dd/yyyy')}
                      </TableCell>
                      <TableCell>{order.customer_id || 'N/A'}</TableCell>
                      <TableCell>{order.customer_po || 'N/A'}</TableCell>
                      <TableCell>{order.model_id || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {formatBottomMetal(order.features.bottom_metal)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(order.status)}>
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>${order.shipping?.toFixed(2) || '0.00'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {filteredOrders.length > 0 && (
        <Card className="border-gray-200">
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-medium">Total Orders:</span> {filteredOrders.length}
              </div>
              <div>
                <span className="font-medium">Draft Orders:</span> {filteredOrders.filter(o => o.status === 'DRAFT').length}
              </div>
              <div>
                <span className="font-medium">Finalized Orders:</span> {filteredOrders.filter(o => o.status === 'FINALIZED').length}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}