import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ArrowLeft, CheckCircle, ArrowRight, FileText, Calendar, Truck, DollarSign, Package } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import UPSLabelCreator from '@/components/UPSLabelCreator';
import { apiRequest } from '@/lib/queryClient';
import { format, differenceInDays } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { useToast } from '@/hooks/use-toast';

export default function QCShippingQueuePage() {
  // State for selected orders
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showLabelCreator, setShowLabelCreator] = useState(false);
  const [labelData, setLabelData] = useState<any>(null);
  const [showLabelViewer, setShowLabelViewer] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get features for order customization display
  const { data: features = [] } = useQuery({
    queryKey: ['/api/features'],
  });

  // Get orders in QC/Shipping department and categorize by due date
  const qcShippingOrders = useMemo(() => {
    const orders = allOrders as any[];
    const filteredOrders = orders.filter((order: any) => 
      order.currentDepartment === 'Shipping QC' || 
      order.currentDepartment === 'QC' || 
      (order.department === 'QC' && order.status === 'IN_PROGRESS') ||
      (order.department === 'Shipping QC' && order.status === 'IN_PROGRESS')
    );
    
    // Sort orders by due date
    return filteredOrders.sort((a: any, b: any) => {
      const dateA = new Date(a.dueDate);
      const dateB = new Date(b.dueDate);
      return dateA.getTime() - dateB.getTime();
    });
  }, [allOrders]);

  // Categorize orders by due date
  const categorizedOrders = useMemo(() => {
    const today = new Date();
    const categories = {
      overdue: [] as any[],
      dueToday: [] as any[],
      dueTomorrow: [] as any[],
      dueThisWeek: [] as any[],
      dueNextWeek: [] as any[],
      dueLater: [] as any[]
    };

    qcShippingOrders.forEach(order => {
      const dueDate = new Date(order.dueDate);
      const daysDiff = differenceInDays(dueDate, today);
      
      if (daysDiff < 0) {
        categories.overdue.push(order);
      } else if (daysDiff === 0) {
        categories.dueToday.push(order);
      } else if (daysDiff === 1) {
        categories.dueTomorrow.push(order);
      } else if (daysDiff <= 7) {
        categories.dueThisWeek.push(order);
      } else if (daysDiff <= 14) {
        categories.dueNextWeek.push(order);
      } else {
        categories.dueLater.push(order);
      }
    });

    return categories;
  }, [qcShippingOrders]);

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

  // Handle checkbox selection
  const handleOrderSelection = (orderId: string, checked: boolean) => {
    const newSelected = new Set(selectedOrders);
    if (checked) {
      newSelected.add(orderId);
    } else {
      newSelected.delete(orderId);
    }
    setSelectedOrders(newSelected);
  };

  // Handle select all/none
  const handleSelectAll = () => {
    if (selectedOrders.size === qcShippingOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(qcShippingOrders.map(order => order.orderId)));
    }
  };

  // Progress selected orders to shipping
  const progressToShipping = async () => {
    if (selectedOrders.size === 0) return;
    
    try {
      // Update each selected order to move to shipping department
      for (const orderId of Array.from(selectedOrders)) {
        await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            currentDepartment: 'Shipping',
            department: 'Shipping',
            status: 'IN_PROGRESS' 
          })
        });
      }
      
      // Clear selections and refresh data
      setSelectedOrders(new Set());
      // Force refresh the orders data
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    } catch (error) {
      console.error('Error progressing orders to shipping:', error);
    }
  };

  // Handle sales order download
  const handleSalesOrderDownload = (orderId: string) => {
    window.open(`/api/sales-order/${orderId}`, '_blank');
  };

  // Handler functions for UPS label functionality (moved from ShippingManagement.tsx)
  const handleCreateLabel = (orderId: string) => {
    setSelectedOrderId(orderId);
    setShowLabelCreator(true);
  };

  const handleLabelSuccess = (data: any) => {
    setLabelData(data);
    setShowLabelViewer(true);
    queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] }); // Refresh orders list
  };

  const downloadLabel = (labelBase64: string, trackingNumber: string, orderId: string) => {
    const link = document.createElement('a');
    link.href = `data:image/gif;base64,${labelBase64}`;
    link.download = `UPS_Label_${orderId}_${trackingNumber}.gif`;
    link.click();
  };

  // Mark order as shipped mutation (moved from ShippingManagement.tsx)
  const markShippedMutation = useMutation({
    mutationFn: ({ orderId, trackingData }: { orderId: string, trackingData: any }) => 
      apiRequest(`/api/shipping/mark-shipped/${orderId}`, {
        method: 'POST',
        body: trackingData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
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

  const handleMarkShipped = (order: any) => {
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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Shipping QC Department Manager</h1>
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
            <span>Shipping QC Department Manager</span>
            <div className="flex items-center gap-2">
              {qcShippingOrders.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="text-xs"
                >
                  {selectedOrders.size === qcShippingOrders.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
              <Badge variant="outline" className="ml-2">
                {qcShippingOrders.length} Orders
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {qcShippingOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders in Shipping QC queue
            </div>
          ) : (
            <div className="space-y-8">
              {/* Overdue Orders */}
              {categorizedOrders.overdue.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-red-600" />
                    <h3 className="text-lg font-semibold text-red-600">Overdue ({categorizedOrders.overdue.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.overdue.map((order: any) => (
                      <Card 
                        key={order.orderId}
                        className={`border-l-4 border-l-red-500 ${selectedOrders.has(order.orderId) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span>{getDisplayOrderId(order)}</span>
                            <Checkbox
                              checked={selectedOrders.has(order.orderId)}
                              onCheckedChange={(checked) => handleOrderSelection(order.orderId, checked as boolean)}
                            />
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <p className="text-sm font-medium truncate">{order.customer || 'Unknown Customer'}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {getModelDisplayName(order.stockModelId || order.modelId)}
                          </p>
                          {order.dueDate && (
                            <p className="text-xs text-red-600 font-medium">
                              Due: {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                            </p>
                          )}
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSalesOrderDownload(order.orderId)}
                              className="flex-1 text-xs"
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Sales Order
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCreateLabel(order.orderId)}
                              className="flex-1 text-xs"
                            >
                              <Truck className="h-3 w-3 mr-1" />
                              Ship Label
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Today */}
              {categorizedOrders.dueToday.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-orange-600" />
                    <h3 className="text-lg font-semibold text-orange-600">Due Today ({categorizedOrders.dueToday.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueToday.map((order: any) => (
                      <Card 
                        key={order.orderId}
                        className={`border-l-4 border-l-orange-500 ${selectedOrders.has(order.orderId) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span>{getDisplayOrderId(order)}</span>
                            <Checkbox
                              checked={selectedOrders.has(order.orderId)}
                              onCheckedChange={(checked) => handleOrderSelection(order.orderId, checked as boolean)}
                            />
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <p className="text-sm font-medium truncate">{order.customer || 'Unknown Customer'}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {getModelDisplayName(order.stockModelId || order.modelId)}
                          </p>
                          {order.dueDate && (
                            <p className="text-xs text-orange-600 font-medium">
                              Due: {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQCChecklistDownload(order.orderId)}
                            className="w-full mt-2 text-xs"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            QC Checklist
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Tomorrow */}
              {categorizedOrders.dueTomorrow.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-yellow-600" />
                    <h3 className="text-lg font-semibold text-yellow-600">Due Tomorrow ({categorizedOrders.dueTomorrow.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueTomorrow.map((order: any) => (
                      <Card 
                        key={order.orderId}
                        className={`border-l-4 border-l-yellow-500 ${selectedOrders.has(order.orderId) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span>{getDisplayOrderId(order)}</span>
                            <Checkbox
                              checked={selectedOrders.has(order.orderId)}
                              onCheckedChange={(checked) => handleOrderSelection(order.orderId, checked as boolean)}
                            />
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <p className="text-sm font-medium truncate">{order.customer || 'Unknown Customer'}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {getModelDisplayName(order.stockModelId || order.modelId)}
                          </p>
                          {order.dueDate && (
                            <p className="text-xs text-yellow-600 font-medium">
                              Due: {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQCChecklistDownload(order.orderId)}
                            className="w-full mt-2 text-xs"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            QC Checklist
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Due This Week */}
              {categorizedOrders.dueThisWeek.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-blue-600">Due This Week ({categorizedOrders.dueThisWeek.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueThisWeek.map((order: any) => (
                      <Card 
                        key={order.orderId}
                        className={`border-l-4 border-l-blue-500 ${selectedOrders.has(order.orderId) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span>{getDisplayOrderId(order)}</span>
                            <Checkbox
                              checked={selectedOrders.has(order.orderId)}
                              onCheckedChange={(checked) => handleOrderSelection(order.orderId, checked as boolean)}
                            />
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <p className="text-sm font-medium truncate">{order.customer || 'Unknown Customer'}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {getModelDisplayName(order.stockModelId || order.modelId)}
                          </p>
                          {order.dueDate && (
                            <p className="text-xs text-blue-600 font-medium">
                              Due: {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQCChecklistDownload(order.orderId)}
                            className="w-full mt-2 text-xs"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            QC Checklist
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Next Week */}
              {categorizedOrders.dueNextWeek.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-green-600">Due Next Week ({categorizedOrders.dueNextWeek.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueNextWeek.map((order: any) => (
                      <Card 
                        key={order.orderId}
                        className={`border-l-4 border-l-green-500 ${selectedOrders.has(order.orderId) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span>{getDisplayOrderId(order)}</span>
                            <Checkbox
                              checked={selectedOrders.has(order.orderId)}
                              onCheckedChange={(checked) => handleOrderSelection(order.orderId, checked as boolean)}
                            />
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <p className="text-sm font-medium truncate">{order.customer || 'Unknown Customer'}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {getModelDisplayName(order.stockModelId || order.modelId)}
                          </p>
                          {order.dueDate && (
                            <p className="text-xs text-green-600 font-medium">
                              Due: {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQCChecklistDownload(order.orderId)}
                            className="w-full mt-2 text-xs"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            QC Checklist
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Later */}
              {categorizedOrders.dueLater.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-5 w-5 text-gray-600" />
                    <h3 className="text-lg font-semibold text-gray-600">Due Later ({categorizedOrders.dueLater.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {categorizedOrders.dueLater.map((order: any) => (
                      <Card 
                        key={order.orderId}
                        className={`border-l-4 border-l-gray-500 ${selectedOrders.has(order.orderId) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span>{getDisplayOrderId(order)}</span>
                            <Checkbox
                              checked={selectedOrders.has(order.orderId)}
                              onCheckedChange={(checked) => handleOrderSelection(order.orderId, checked as boolean)}
                            />
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <p className="text-sm font-medium truncate">{order.customer || 'Unknown Customer'}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            {getModelDisplayName(order.stockModelId || order.modelId)}
                          </p>
                          {order.dueDate && (
                            <p className="text-xs text-gray-600 font-medium">
                              Due: {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                            </p>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleQCChecklistDownload(order.orderId)}
                            className="w-full mt-2 text-xs"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            QC Checklist
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Progress to Shipping Button */}
      {selectedOrders.size > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={progressToShipping}
            size="lg"
            className="bg-green-600 hover:bg-green-700 text-white shadow-lg"
          >
            <ArrowRight className="mr-2 h-5 w-5" />
            Progress {selectedOrders.size} Order{selectedOrders.size !== 1 ? 's' : ''} to Shipping
          </Button>
        </div>
      )}
    </div>
  );
}