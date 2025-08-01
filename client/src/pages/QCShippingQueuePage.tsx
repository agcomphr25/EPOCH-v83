import React, { useMemo } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, ArrowLeft, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';

export default function QCShippingQueuePage() {
  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get features for order customization display
  const { data: features = [] } = useQuery({
    queryKey: ['/api/features'],
  });

  // Get orders in QC/Shipping department
  const qcShippingOrders = useMemo(() => {
    const orders = allOrders as any[];
    return orders.filter((order: any) => 
      order.currentDepartment === 'QC' || 
      order.currentDepartment === 'Shipping' ||
      (order.department === 'QC' && order.status === 'IN_PROGRESS') ||
      (order.department === 'Shipping' && order.status === 'IN_PROGRESS')
    );
  }, [allOrders]);

  // Count orders in previous department (Paint)
  const paintCount = useMemo(() => {
    const orders = allOrders as any[];
    return orders.filter((order: any) => 
      order.currentDepartment === 'Paint' || 
      (order.department === 'Paint' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Count completed orders (shipped)
  const completedCount = useMemo(() => {
    const orders = allOrders as any[];
    return orders.filter((order: any) => 
      order.status === 'COMPLETED' || 
      order.status === 'SHIPPED'
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

  // Helper function to get feature display name
  const getFeatureDisplayName = (featureId: string, optionValue: string) => {
    const featureList = features as any[];
    const feature = featureList.find((f: any) => f.id === featureId);
    if (!feature) return optionValue;
    
    const option = feature.options?.find((opt: any) => opt.value === optionValue);
    return option?.label || optionValue;
  };

  // Helper function to format order features for tooltip
  const formatOrderFeatures = (order: any) => {
    if (!order.features) return 'No customizations';
    
    const featureEntries = Object.entries(order.features);
    if (featureEntries.length === 0) return 'No customizations';
    
    return featureEntries.map(([key, value]) => {
      const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      if (Array.isArray(value)) {
        const displayValues = value.map(v => getFeatureDisplayName(key, v)).join(', ');
        return `• ${displayKey}: ${displayValues}`;
      } else {
        const displayValue = getFeatureDisplayName(key, value as string);
        return `• ${displayKey}: ${displayValue}`;
      }
    }).join('\n');
  };

  // Helper function to format complete order details for tooltip
  const formatOrderDetails = (order: any) => {
    const details = [];
    
    // Basic order info
    details.push(`Order: ${getDisplayOrderId(order)}`);
    details.push(`Customer: ${order.customer || 'Unknown'}`);
    details.push(`Model: ${getModelDisplayName(order.stockModelId || order.modelId)}`);
    
    if (order.product) {
      details.push(`Product: ${order.product}`);
    }
    
    if (order.orderDate) {
      details.push(`Order Date: ${format(new Date(order.orderDate), 'MMM dd, yyyy')}`);
    }
    
    if (order.dueDate) {
      details.push(`Due Date: ${format(new Date(order.dueDate), 'MMM dd, yyyy')}`);
    }
    
    details.push(`Status: ${order.status || 'Unknown'}`);
    
    // Add separator
    details.push('');
    details.push('CUSTOMIZATIONS:');
    
    // Add features
    const featuresText = formatOrderFeatures(order);
    details.push(featuresText);
    
    return details.join('\n');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Shipping QC Department Queue</h1>
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
              Paint
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {paintCount}
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              Orders in previous department
            </p>
          </CardContent>
        </Card>

        {/* Completed Orders Count */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {completedCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders shipped/completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Department Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Shipping QC Department Queue</span>
            <Badge variant="outline" className="ml-2">
              {qcShippingOrders.length} Orders
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {qcShippingOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders in Shipping QC queue
            </div>
          ) : (
            <TooltipProvider>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {qcShippingOrders.map((order: any) => {
                  const modelId = order.stockModelId || order.modelId;
                  const materialType = modelId?.startsWith('cf_') ? 'CF' : 
                                     modelId?.startsWith('fg_') ? 'FG' : null;
                  const orderDetails = formatOrderDetails(order);

                  return (
                    <Tooltip key={order.orderId}>
                      <TooltipTrigger asChild>
                        <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-shadow duration-200 cursor-pointer">
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

                              <div className="text-xs text-blue-500 mt-2 italic">
                                Hover for order details
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-2">
                          <div className="font-semibold text-blue-600 dark:text-blue-400 border-b border-gray-200 dark:border-gray-600 pb-2 mb-3">
                            Order Details
                          </div>
                          <div className="text-sm whitespace-pre-line text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
                            {orderDetails}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
}