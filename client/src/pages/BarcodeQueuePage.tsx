import React, { useMemo } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scan, ArrowLeft, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';

export default function BarcodeQueuePage() {
  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get orders in barcode department
  const barcodeOrders = useMemo(() => {
    return allOrders.filter((order: any) => 
      order.currentDepartment === 'Barcode' || 
      (order.department === 'Barcode' && order.status === 'IN_PROGRESS')
    );
  }, [allOrders]);

  // Count orders in previous department (Layup/Plugging)
  const layupCount = useMemo(() => {
    return allOrders.filter((order: any) => 
      order.currentDepartment === 'Layup' || 
      order.currentDepartment === 'Plugging' ||
      (order.department === 'Layup' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Count orders in next department (CNC)
  const cncCount = useMemo(() => {
    return allOrders.filter((order: any) => 
      order.currentDepartment === 'CNC' || 
      (order.department === 'CNC' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = stockModels.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Scan className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Barcode Department Queue</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Previous Department Count */}
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <ArrowLeft className="h-5 w-5" />
              Layup/Plugging
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {layupCount}
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              Orders in previous department
            </p>
          </CardContent>
        </Card>

        {/* Next Department Count */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              CNC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {cncCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders in next department
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Department Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Barcode Department Queue</span>
            <Badge variant="outline" className="ml-2">
              {barcodeOrders.length} Orders
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {barcodeOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders in barcode queue
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {barcodeOrders.map((order: any) => {
                const modelId = order.stockModelId || order.modelId;
                const materialType = modelId?.startsWith('cf_') ? 'CF' : 
                                   modelId?.startsWith('fg_') ? 'FG' : null;

                return (
                  <Card key={order.orderId} className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div className="font-semibold text-lg">
                          {getDisplayOrderId(order)}
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {order.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {materialType && (
                            <Badge variant="secondary" className="text-xs">
                              {materialType}
                            </Badge>
                          )}
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {getModelDisplayName(modelId)}
                          </span>
                        </div>

                        {order.customer && (
                          <div className="text-xs text-gray-500">
                            Customer: {order.customer}
                          </div>
                        )}

                        {order.dueDate && (
                          <div className="text-xs text-gray-500">
                            Due: {format(new Date(order.dueDate), 'MMM d, yyyy')}
                          </div>
                        )}

                        {order.createdAt && (
                          <div className="text-xs text-gray-500">
                            In Dept: {Math.floor((Date.now() - new Date(order.updatedAt || order.createdAt).getTime()) / (1000 * 60 * 60 * 24))} days
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