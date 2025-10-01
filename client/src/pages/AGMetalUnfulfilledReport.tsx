import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, FileText, Package, Wrench, BarChart3, Calendar, Factory } from 'lucide-react';
import { format } from 'date-fns';

interface Order {
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  currentDepartment: string;
  modelId: string;
  handedness: string;
}

interface AGBottomMetal {
  bottomMetalType: string;
  displayName: string;
  count: number;
  orders: Order[];
}

interface RailType {
  railType: string;
  displayName: string;
  count: number;
  orders: Order[];
}

interface DepartmentBreakdown {
  department: string;
  count: number;
}

interface AGMetalReportData {
  agBottomMetals: AGBottomMetal[];
  railTypes: RailType[];
  summary: {
    totalUnfulfilledOrders: number;
    totalAGBottomMetals: number;
    totalRailOrders: number;
    departmentBreakdown: DepartmentBreakdown[];
  };
}

export default function AGMetalUnfulfilledReport() {
  const [selectedTab, setSelectedTab] = useState('summary');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: reportData, isLoading, error } = useQuery<AGMetalReportData>({
    queryKey: ['/api/reports/ag-metal-report'],
    queryFn: () => apiRequest('/api/reports/ag-metal-report'),
  });

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const getDepartmentColor = (department: string) => {
    const colors: Record<string, string> = {
      'P1 Production Queue': 'bg-blue-100 text-blue-800',
      'Layup/Plugging': 'bg-purple-100 text-purple-800',
      'Barcode': 'bg-yellow-100 text-yellow-800',
      'CNC': 'bg-orange-100 text-orange-800',
      'Gunsmith': 'bg-red-100 text-red-800',
      'Finish': 'bg-green-100 text-green-800',
      'Finish QC': 'bg-teal-100 text-teal-800',
      'Paint': 'bg-indigo-100 text-indigo-800',
      'Shipping QC': 'bg-pink-100 text-pink-800',
    };
    return colors[department] || 'bg-gray-100 text-gray-800';
  };

  const exportToCsv = () => {
    if (!reportData) return;

    const csvContent = [
      // Headers
      ['Type', 'Item', 'Count', 'Order ID', 'Order Date', 'Due Date', 'Customer', 'Department', 'Model', 'Handedness'].join(','),
      
      // AG Bottom Metals
      ...reportData.agBottomMetals.flatMap(metal => 
        metal.orders.map(order => [
          'AG Bottom Metal',
          metal.displayName,
          metal.count,
          order.orderId,
          format(new Date(order.orderDate), 'MM/dd/yyyy'),
          format(new Date(order.dueDate), 'MM/dd/yyyy'),
          order.customerId,
          order.currentDepartment,
          order.modelId,
          order.handedness || 'N/A'
        ].join(','))
      ),
      
      // Rails
      ...reportData.railTypes.flatMap(rail => 
        rail.orders.map(order => [
          'Rail',
          rail.displayName,
          rail.count,
          order.orderId,
          format(new Date(order.orderDate), 'MM/dd/yyyy'),
          format(new Date(order.dueDate), 'MM/dd/yyyy'),
          order.customerId,
          order.currentDepartment,
          order.modelId,
          order.handedness || 'N/A'
        ].join(','))
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ag-metal-unfulfilled-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading AG Metal Report...</p>
        </div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Error loading report data</p>
          <p className="text-gray-500 mt-2">Please try again later</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6" data-testid="ag-metal-unfulfilled-report">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Wrench className="h-8 w-8 text-blue-600" />
                AG Metal Products - Unfulfilled Orders Report
              </h1>
              <p className="text-gray-600 mt-2">
                All AG metal products and rails on orders that have not been fulfilled
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={exportToCsv} variant="outline" data-testid="button-export-csv">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Unfulfilled Orders</p>
                  <p className="text-3xl font-bold text-gray-900">{reportData.summary.totalUnfulfilledOrders}</p>
                </div>
                <Factory className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">AG Bottom Metal Orders</p>
                  <p className="text-3xl font-bold text-blue-600">{reportData.summary.totalAGBottomMetals}</p>
                </div>
                <Package className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Rail Accessory Orders</p>
                  <p className="text-3xl font-bold text-green-600">{reportData.summary.totalRailOrders}</p>
                </div>
                <Wrench className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">AG Metal Types</p>
                  <p className="text-3xl font-bold text-purple-600">{reportData.agBottomMetals.length}</p>
                </div>
                <BarChart3 className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="ag-bottom-metals">AG Bottom Metals</TabsTrigger>
            <TabsTrigger value="rails">Rails</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* AG Bottom Metals Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    AG Bottom Metals Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {reportData.agBottomMetals.slice(0, 5).map((metal) => (
                      <div key={metal.bottomMetalType} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{metal.displayName}</p>
                          <p className="text-sm text-gray-500">{metal.bottomMetalType}</p>
                        </div>
                        <Badge variant="secondary">{metal.count} orders</Badge>
                      </div>
                    ))}
                    {reportData.agBottomMetals.length > 5 && (
                      <p className="text-sm text-gray-500 text-center">
                        ...and {reportData.agBottomMetals.length - 5} more types
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Rails Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    Rails Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {reportData.railTypes.slice(0, 5).map((rail) => (
                      <div key={rail.railType} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{rail.displayName}</p>
                        </div>
                        <Badge variant="secondary">{rail.count} orders</Badge>
                      </div>
                    ))}
                    {reportData.railTypes.length > 5 && (
                      <p className="text-sm text-gray-500 text-center">
                        ...and {reportData.railTypes.length - 5} more types
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* AG Bottom Metals Tab */}
          <TabsContent value="ag-bottom-metals">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  AG Bottom Metals on Unfulfilled Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reportData.agBottomMetals.map((metal) => (
                    <div key={metal.bottomMetalType} className="border rounded-lg p-4">
                      <div 
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => toggleRowExpansion(metal.bottomMetalType)}
                      >
                        <div>
                          <h3 className="font-semibold text-lg">{metal.displayName}</h3>
                          <p className="text-sm text-gray-500">{metal.bottomMetalType}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="default">{metal.count} orders</Badge>
                          <span className="text-sm text-gray-500">
                            {expandedRows.has(metal.bottomMetalType) ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>
                      
                      {expandedRows.has(metal.bottomMetalType) && (
                        <div className="mt-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Order ID</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Model</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Due Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {metal.orders.map((order) => (
                                <TableRow key={order.orderId}>
                                  <TableCell className="font-medium">{order.orderId}</TableCell>
                                  <TableCell>{order.customerId}</TableCell>
                                  <TableCell>{order.modelId}</TableCell>
                                  <TableCell>
                                    <Badge className={getDepartmentColor(order.currentDepartment)}>
                                      {order.currentDepartment}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{format(new Date(order.dueDate), 'MM/dd/yyyy')}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rails Tab */}
          <TabsContent value="rails">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Rails on Unfulfilled Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {reportData.railTypes.map((rail) => (
                    <div key={rail.railType} className="border rounded-lg p-4">
                      <div 
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => toggleRowExpansion(rail.railType)}
                      >
                        <div>
                          <h3 className="font-semibold text-lg">{rail.displayName}</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="default">{rail.count} orders</Badge>
                          <span className="text-sm text-gray-500">
                            {expandedRows.has(rail.railType) ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>
                      
                      {expandedRows.has(rail.railType) && (
                        <div className="mt-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Order ID</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Model</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Due Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rail.orders.map((order) => (
                                <TableRow key={order.orderId}>
                                  <TableCell className="font-medium">{order.orderId}</TableCell>
                                  <TableCell>{order.customerId}</TableCell>
                                  <TableCell>{order.modelId}</TableCell>
                                  <TableCell>
                                    <Badge className={getDepartmentColor(order.currentDepartment)}>
                                      {order.currentDepartment}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{format(new Date(order.dueDate), 'MM/dd/yyyy')}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Departments Tab */}
          <TabsContent value="departments">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5" />
                  Department Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead>Order Count</TableHead>
                      <TableHead>Percentage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.summary.departmentBreakdown.map((dept) => (
                      <TableRow key={dept.department}>
                        <TableCell>
                          <Badge className={getDepartmentColor(dept.department)}>
                            {dept.department}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{dept.count}</TableCell>
                        <TableCell>
                          {((dept.count / reportData.summary.totalUnfulfilledOrders) * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}