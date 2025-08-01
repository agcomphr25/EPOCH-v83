import React, { useMemo } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';

export default function ShippingQueuePage() {
  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get orders in Shipping department
  const shippingOrders = useMemo(() => {
    const orders = allOrders as any[];
    return orders.filter((order: any) => 
      order.currentDepartment === 'Shipping' || 
      (order.department === 'Shipping' && order.status === 'IN_PROGRESS')
    );
  }, [allOrders]);

  // Count orders in previous department (Shipping QC)
  const shippingQCCount = useMemo(() => {
    const orders = allOrders as any[];
    return orders.filter((order: any) => 
      order.currentDepartment === 'QC' || 
      (order.department === 'QC' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const models = stockModels as any[];
    const model = models.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Package className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Shipping Department Queue</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Previous Department Count */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <ArrowLeft className="h-5 w-5" />
              Shipping QC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {shippingQCCount}
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Orders in previous department
            </p>
          </CardContent>
        </Card>

        {/* Current Department */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300">
              Ready to Ship
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {shippingOrders.length}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders ready for shipping
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Department Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Shipping Department Queue</span>
            <Badge variant="outline" className="ml-2">
              {shippingOrders.length} Orders
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shippingOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders in Shipping queue
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {shippingOrders.map((order: any) => {
                const modelId = order.stockModelId || order.modelId;
                const materialType = modelId?.startsWith('cf_') ? 'CF' : 
                                   modelId?.startsWith('fg_') ? 'FG' : null;

                return (
                  <Card key={order.id} className="hover:shadow-md transition-shadow border border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm font-semibold text-blue-600">
                          {getDisplayOrderId(order.orderId)}
                        </div>
                        {materialType && (
                          <Badge variant="secondary" className="text-xs">
                            {materialType}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-sm">
                        <div className="text-gray-600">
                          <span className="font-medium">Customer:</span> {order.customer}
                        </div>
                        <div className="text-gray-600">
                          <span className="font-medium">Model:</span> {getModelDisplayName(modelId)}
                        </div>
                        <div className="text-gray-600">
                          <span className="font-medium">Order Date:</span> {format(new Date(order.orderDate), 'MMM dd, yyyy')}
                        </div>
                        {order.dueDate && (
                          <div className="text-gray-600">
                            <span className="font-medium">Due Date:</span> {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}