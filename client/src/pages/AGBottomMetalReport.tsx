import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, FileText, Filter, DollarSign, TrendingUp, Package } from 'lucide-react';
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

interface PriceAnalysis {
  bottomMetalType: string;
  displayName: string;
  price: number;
  quantity: number;
  totalValue: number;
}

export default function AGBottomMetalReport() {
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [viewMode, setViewMode] = useState<'summary' | 'details'>('summary');

  // Fetch all orders instead of just drafts
  const { data: orders = [], isLoading, error } = useQuery<Order[]>({
    queryKey: ['/api/orders/all-orders'],
    queryFn: () => apiRequest('/api/orders/all-orders'),
  });

  // Filter orders with bottom metal that begins with "AG" and exclude cancelled
  const filteredOrders = orders.filter(order => {
    if (!order.features || typeof order.features !== 'object') {
      return false;
    }
    
    const bottomMetal = order.features.bottom_metal;
    if (!bottomMetal || typeof bottomMetal !== 'string') {
      return false;
    }
    
    return bottomMetal.toLowerCase().startsWith('ag') && order.status !== 'CANCELLED';
  });

  // AG Bottom Metal Price Analysis
  const priceAnalysis = useMemo(() => {
    const analysis: Record<string, PriceAnalysis> = {};
    
    // Define price mappings based on feature configurations
    const priceMap: Record<string, { price: number; displayName: string }> = {
      'ag_bottom_metel_inlet_only': { price: 0, displayName: 'AG Bottom Metal Inlet Only' },
      'ag_m5_sa': { price: 149, displayName: 'AG-M5-SA' },
      'ag_m5_la': { price: 149, displayName: 'AG-M5-LA' },
      'ag_m5_la_cip': { price: 149, displayName: 'AG-M5-LA-CIP' },
      'ag_bdl_sa': { price: 149, displayName: 'AG-BDL-SA' },
      'ag_bdl_la': { price: 149, displayName: 'AG-BDL-LA' },
      'ag_m5bdl_sa': { price: 199, displayName: 'AG-M5/BDL-SA Custom' },
      'ag_m5bdl_la': { price: 199, displayName: 'AG-M5/BDL-LA Custom' },
      'ag_m5bdl_la_cip': { price: 199, displayName: 'AG-M5/BDL-LA CIP Custom' },
    };

    filteredOrders.forEach(order => {
      const bottomMetal = order.features.bottom_metal;
      const priceInfo = priceMap[bottomMetal] || { price: 0, displayName: bottomMetal };
      
      if (!analysis[bottomMetal]) {
        analysis[bottomMetal] = {
          bottomMetalType: bottomMetal,
          displayName: priceInfo.displayName,
          price: priceInfo.price,
          quantity: 0,
          totalValue: 0
        };
      }
      
      analysis[bottomMetal].quantity += 1;
      analysis[bottomMetal].totalValue = analysis[bottomMetal].quantity * analysis[bottomMetal].price;
    });

    return Object.values(analysis).sort((a, b) => b.quantity - a.quantity);
  }, [filteredOrders]);

  // Group by price tiers
  const priceTiers = useMemo(() => {
    const tiers = {
      tier0: priceAnalysis.filter(item => item.price === 0),
      tier149: priceAnalysis.filter(item => item.price === 149),
      tier199: priceAnalysis.filter(item => item.price === 199),
    };
    
    return {
      ...tiers,
      summary: {
        tier0Total: tiers.tier0.reduce((sum, item) => sum + item.quantity, 0),
        tier149Total: tiers.tier149.reduce((sum, item) => sum + item.quantity, 0),
        tier199Total: tiers.tier199.reduce((sum, item) => sum + item.quantity, 0),
        tier149Revenue: tiers.tier149.reduce((sum, item) => sum + item.totalValue, 0),
        tier199Revenue: tiers.tier199.reduce((sum, item) => sum + item.totalValue, 0),
        totalOrders: filteredOrders.length,
        totalRevenue: priceAnalysis.reduce((sum, item) => sum + item.totalValue, 0)
      }
    };
  }, [priceAnalysis, filteredOrders]);

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

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      return format(date, 'MM/dd/yyyy');
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Function to export pricing analysis to CSV
  const exportPricingAnalysis = () => {
    const headers = [
      'Bottom Metal Type',
      'Display Name',
      'Price Tier',
      'Unit Price',
      'Quantity',
      'Total Value'
    ];

    const csvData = priceAnalysis.map(item => [
      item.bottomMetalType,
      item.displayName,
      `$${item.price}`,
      `$${item.price.toFixed(2)}`,
      item.quantity.toString(),
      `$${item.totalValue.toFixed(2)}`
    ]);

    // Add summary rows
    csvData.push([]);
    csvData.push(['SUMMARY', '', '', '', '', '']);
    csvData.push(['$0 Tier Total', '', '', '', priceTiers.summary.tier0Total.toString(), '$0.00']);
    csvData.push(['$149 Tier Total', '', '', '', priceTiers.summary.tier149Total.toString(), `$${priceTiers.summary.tier149Revenue.toFixed(2)}`]);
    csvData.push(['$199 Tier Total', '', '', '', priceTiers.summary.tier199Total.toString(), `$${priceTiers.summary.tier199Revenue.toFixed(2)}`]);
    csvData.push(['GRAND TOTAL', '', '', '', priceTiers.summary.totalOrders.toString(), `$${priceTiers.summary.totalRevenue.toFixed(2)}`]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ag-bottom-metal-pricing-analysis-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to export detailed orders to CSV
  const exportDetailedOrders = () => {
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
      'Bottom Metal Price',
      'Status',
      'Shipping'
    ];

    const csvData = filteredOrders.map(order => {
      const bottomMetal = order.features.bottom_metal;
      const priceInfo = priceAnalysis.find(p => p.bottomMetalType === bottomMetal);
      
      return [
        order.order_id,
        formatDate(order.order_date),
        formatDate(order.due_date),
        order.customer_id || 'N/A',
        order.customer_po || 'N/A',
        order.fb_order_number || 'N/A',
        order.model_id || 'N/A',
        order.handedness || 'N/A',
        priceInfo?.displayName || formatBottomMetal(bottomMetal),
        `$${priceInfo?.price?.toFixed(2) || '0.00'}`,
        order.status,
        `$${order.shipping?.toFixed(2) || '0.00'}`
      ];
    });

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ag-bottom-metal-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`);
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
            <DollarSign className="h-6 w-6" />
            AG Bottom Metal Pricing Analysis
          </h1>
          <p className="text-gray-600 mt-1">
            Comprehensive pricing breakdown for AG bottom metal orders by feature price tiers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            <Package className="h-3 w-3 mr-1" />
            {priceTiers.summary.totalOrders} total orders
          </Badge>
          <Badge variant="outline" className="text-sm">
            <DollarSign className="h-3 w-3 mr-1" />
            ${priceTiers.summary.totalRevenue.toLocaleString()} revenue
          </Badge>
          <Button
            variant={viewMode === 'summary' ? 'default' : 'outline'}
            onClick={() => setViewMode('summary')}
            size="sm"
          >
            Summary
          </Button>
          <Button
            variant={viewMode === 'details' ? 'default' : 'outline'}
            onClick={() => setViewMode('details')}
            size="sm"
          >
            Order Details
          </Button>
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
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="font-medium">Export Options:</h3>
              <Button
                onClick={exportPricingAnalysis}
                className="inline-flex items-center gap-2 bg-green-600 text-white hover:bg-green-700"
                size="sm"
              >
                <Download className="h-3 w-3" />
                Pricing Analysis CSV
              </Button>
              <Button
                onClick={exportDetailedOrders}
                className="inline-flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700"
                size="sm"
              >
                <Download className="h-3 w-3" />
                Order Details CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-gray-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">$0 Tier</p>
                <p className="text-2xl font-bold text-gray-900">{priceTiers.summary.tier0Total}</p>
                <p className="text-xs text-gray-500">Free options</p>
              </div>
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">$149 Tier</p>
                <p className="text-2xl font-bold text-blue-900">{priceTiers.summary.tier149Total}</p>
                <p className="text-xs text-blue-500">${priceTiers.summary.tier149Revenue.toLocaleString()} revenue</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">$199 Tier</p>
                <p className="text-2xl font-bold text-green-900">{priceTiers.summary.tier199Total}</p>
                <p className="text-xs text-green-500">${priceTiers.summary.tier199Revenue.toLocaleString()} revenue</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Total</p>
                <p className="text-2xl font-bold text-purple-900">{priceTiers.summary.totalOrders}</p>
                <p className="text-xs text-purple-500">${priceTiers.summary.totalRevenue.toLocaleString()} revenue</p>
              </div>
              <FileText className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      {viewMode === 'summary' ? (
        <>
          {/* Price Tier Analysis Tables */}
          {priceTiers.tier149.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                  $149 Price Tier - Standard AG Bottom Metals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bottom Metal</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceTiers.tier149.map((item) => (
                      <TableRow key={item.bottomMetalType}>
                        <TableCell className="font-mono text-sm">{item.bottomMetalType}</TableCell>
                        <TableCell className="font-medium">{item.displayName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-blue-600">
                            ${item.price}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold">{item.quantity}</TableCell>
                        <TableCell className="font-bold text-blue-600">
                          ${item.totalValue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {priceTiers.tier199.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  $199 Price Tier - Custom AG Bottom Metals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bottom Metal</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceTiers.tier199.map((item) => (
                      <TableRow key={item.bottomMetalType}>
                        <TableCell className="font-mono text-sm">{item.bottomMetalType}</TableCell>
                        <TableCell className="font-medium">{item.displayName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-green-600">
                            ${item.price}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold">{item.quantity}</TableCell>
                        <TableCell className="font-bold text-green-600">
                          ${item.totalValue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {priceTiers.tier0.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-gray-600" />
                  $0 Price Tier - Free Options
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bottom Metal</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceTiers.tier0.map((item) => (
                      <TableRow key={item.bottomMetalType}>
                        <TableCell className="font-mono text-sm">{item.bottomMetalType}</TableCell>
                        <TableCell className="font-medium">{item.displayName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-gray-600">
                            ${item.price}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold">{item.quantity}</TableCell>
                        <TableCell className="font-bold text-gray-600">
                          ${item.totalValue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* Order Details View */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Order Details - AG Bottom Metal Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredOrders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No orders found with AG bottom metal specifications
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
                      <TableHead>Feature Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Shipping</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => {
                      const bottomMetal = order.features.bottom_metal;
                      const priceInfo = priceAnalysis.find(p => p.bottomMetalType === bottomMetal);
                      
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">
                            {order.order_id}
                          </TableCell>
                          <TableCell>
                            {formatDate(order.order_date)}
                          </TableCell>
                          <TableCell>
                            {formatDate(order.due_date)}
                          </TableCell>
                          <TableCell>{order.customer_id || 'N/A'}</TableCell>
                          <TableCell>{order.customer_po || 'N/A'}</TableCell>
                          <TableCell>{order.model_id || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {priceInfo?.displayName || formatBottomMetal(bottomMetal)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline" 
                              className={
                                priceInfo?.price === 149 ? "text-blue-600" :
                                priceInfo?.price === 199 ? "text-green-600" : 
                                "text-gray-600"
                              }
                            >
                              ${priceInfo?.price || 0}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(order.status)}>
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell>${order.shipping?.toFixed(2) || '0.00'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Footer */}
      <Card className="border-purple-200 bg-purple-50">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
            <div className="text-center">
              <span className="block font-medium text-purple-900">Total Orders</span>
              <span className="text-xl font-bold text-purple-600">{priceTiers.summary.totalOrders}</span>
            </div>
            <div className="text-center">
              <span className="block font-medium text-gray-700">$0 Tier</span>
              <span className="text-xl font-bold text-gray-600">{priceTiers.summary.tier0Total}</span>
            </div>
            <div className="text-center">
              <span className="block font-medium text-blue-700">$149 Tier</span>
              <span className="text-xl font-bold text-blue-600">{priceTiers.summary.tier149Total}</span>
            </div>
            <div className="text-center">
              <span className="block font-medium text-green-700">$199 Tier</span>
              <span className="text-xl font-bold text-green-600">{priceTiers.summary.tier199Total}</span>
            </div>
            <div className="text-center">
              <span className="block font-medium text-purple-700">Total Revenue</span>
              <span className="text-xl font-bold text-purple-600">${priceTiers.summary.totalRevenue.toLocaleString()}</span>
            </div>
            <div className="text-center">
              <span className="block font-medium text-purple-700">Avg Revenue/Order</span>
              <span className="text-xl font-bold text-purple-600">
                ${priceTiers.summary.totalOrders > 0 ? Math.round(priceTiers.summary.totalRevenue / priceTiers.summary.totalOrders) : 0}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}