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
  // State for selected orders and shipping functionality
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
    
    // Separate orders with stock models from orders without stock models
    const regularOrders = filteredOrders.filter((order: any) => 
      order.modelId && order.modelId.trim() !== '' && order.modelId.toLowerCase() !== 'none'
    );
    
    // Sort orders by due date
    return regularOrders.sort((a: any, b: any) => {
      const dateA = new Date(a.dueDate);
      const dateB = new Date(b.dueDate);
      return dateA.getTime() - dateB.getTime();
    });
  }, [allOrders]);

  // Get orders with no stock model - these are special handling orders
  const noStockModelOrders = useMemo(() => {
    const orders = allOrders as any[];
    const filteredOrders = orders.filter((order: any) => 
      (order.currentDepartment === 'Shipping QC' || 
       order.currentDepartment === 'QC' || 
       (order.department === 'QC' && order.status === 'IN_PROGRESS') ||
       (order.department === 'Shipping QC' && order.status === 'IN_PROGRESS')) &&
      (!order.modelId || order.modelId.trim() === '' || order.modelId.toLowerCase() === 'none')
    );
    
    // Sort by due date
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

  // Helper function to check for specific bottom metals
  const hasSpecificBottomMetal = (order: any) => {
    const bottomMetal = order.features?.bottom_metal;
    const specificBottomMetals = ['AG-M5-SA', 'AG-M5-LA', 'AG-M5-LA-CIP', 'AG-BDL-SA', 'AG-BDL-LA'];
    return bottomMetal && specificBottomMetals.includes(bottomMetal);
  };

  // Helper function to check for paid other options (shirt, hat, touch-up paint)
  const getPaidOtherOptions = (order: any) => {
    const paidOptions: string[] = [];
    
    // ONLY check the other_options array - this is where these items should be explicitly listed
    if (order.features?.other_options && Array.isArray(order.features.other_options)) {
      order.features.other_options.forEach((option: string) => {
        const optionLower = option.toLowerCase();
        
        // Very specific matching to avoid false positives
        if (optionLower === 'shirt' || optionLower.includes('t-shirt') || optionLower.includes('tshirt')) {
          paidOptions.push('Shirt');
        }
        if (optionLower === 'hat' || optionLower.includes('cap') || optionLower.includes('beanie')) {
          paidOptions.push('Hat');
        }
        // Only match explicit touch-up paint, not just any paint mention
        if ((optionLower.includes('touch-up') || optionLower.includes('touchup')) && optionLower.includes('paint')) {
          paidOptions.push('Touch-up Paint');
        }
      });
    }

    return paidOptions;
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

  // Mutation for progressing orders to shipping
  const progressOrderMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const results = [];
      for (const orderId of orderIds) {
        const result = await apiRequest(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            currentDepartment: 'Shipping',
            department: 'Shipping',
            status: 'IN_PROGRESS' 
          })
        });
        results.push(result);
      }
      return results;
    },
    onSuccess: (_, orderIds) => {
      toast({
        title: 'Orders Progressed',
        description: `${orderIds.length} orders moved to Shipping department`,
      });
      // Clear selection and invalidate cache
      setSelectedOrders(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
    },
    onError: (error: any) => {
      console.error('Error progressing orders to shipping:', error);
      toast({
        title: 'Error',
        description: 'Failed to progress orders to shipping',
        variant: 'destructive',
      });
    }
  });

  // Progress selected orders to shipping
  const progressToShipping = () => {
    if (selectedOrders.size === 0) return;
    const orderIds = Array.from(selectedOrders);
    progressOrderMutation.mutate(orderIds);
  };

  // Handle QC checklist download
  const handleQCChecklistDownload = (orderId: string) => {
    try {
      window.open(`/api/shipping-pdf/qc-checklist/${orderId}`, '_blank');
      toast({
        title: "QC checklist opened",
        description: `QC checklist for order ${orderId} opened in new tab for inspection`
      });
    } catch (error) {
      console.error('Error generating QC checklist:', error);
      toast({
        title: "Error generating QC checklist",
        description: "Failed to generate QC checklist PDF",
        variant: "destructive"
      });
    }
  };

  // Handle sales order download - Updated to remove QC checklist functionality
  const handleSalesOrderDownload = (orderId: string) => {
    window.open(`/api/sales-order/${orderId}`, '_blank');
    toast({
      title: "Sales order opened",
      description: `Sales order for ${orderId} opened in new tab for viewing`
    });
  };

  // UPS Label functionality moved from ShippingManagement.tsx
  const handleCreateLabel = (orderId: string) => {
    setSelectedOrderId(orderId);
    setShowLabelCreator(true);
  };

  const handleLabelSuccess = (data: any) => {
    setLabelData(data);
    setShowLabelViewer(true);
    queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    toast({
      title: "Shipping label created",
      description: "Label has been generated successfully"
    });
  };

  const downloadLabel = (labelBase64: string, trackingNumber: string, orderId: string) => {
    const link = document.createElement('a');
    link.href = `data:image/gif;base64,${labelBase64}`;
    link.download = `UPS_Label_${orderId}_${trackingNumber}.gif`;
    link.click();
  };

  // Mark order as shipped mutation
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

  // Order card component with updated buttons - Sales Order + Shipping Label
  const OrderCard = ({ order, borderColor, dueDateColor }: { 
    order: any, 
    borderColor: string, 
    dueDateColor: string 
  }) => (
    <Card 
      key={order.orderId}
      className={`border-l-4 ${borderColor} ${selectedOrders.has(order.orderId) ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`}
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
          <p className={`text-xs font-medium ${dueDateColor}`}>
            Due: {format(new Date(order.dueDate), 'MMM dd, yyyy')}
          </p>
        )}
        
        {/* QC Checkboxes for specific items */}
        <div className="space-y-1 mt-2 mb-2">
          {/* Bottom Metal Checkbox */}
          {hasSpecificBottomMetal(order) && (
            <div className="flex items-center space-x-2">
              <Checkbox id={`bottom-metal-${order.orderId}`} />
              <label 
                htmlFor={`bottom-metal-${order.orderId}`} 
                className="text-xs font-medium text-blue-700 dark:text-blue-300"
              >
                Bottom Metal ({order.features.bottom_metal})
              </label>
            </div>
          )}
          
          {/* Paid Other Options Checkboxes */}
          {getPaidOtherOptions(order).map((option, index) => (
            <div key={index} className="flex items-center space-x-2">
              <Checkbox id={`paid-option-${order.orderId}-${index}`} />
              <label 
                htmlFor={`paid-option-${order.orderId}-${index}`} 
                className="text-xs font-medium text-green-700 dark:text-green-300"
              >
                {option}
              </label>
            </div>
          ))}
        </div>

        <div className="flex gap-1 mt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleQCChecklistDownload(order.orderId)}
            className="flex-1 text-xs"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            QC Checklist
          </Button>
        </div>
      </CardContent>
    </Card>
  );

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
              Orders awaiting QC review
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
                      <OrderCard 
                        key={order.orderId} 
                        order={order} 
                        borderColor="border-l-red-500" 
                        dueDateColor="text-red-600"
                      />
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
                      <OrderCard 
                        key={order.orderId} 
                        order={order} 
                        borderColor="border-l-orange-500" 
                        dueDateColor="text-orange-600"
                      />
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
                      <OrderCard 
                        key={order.orderId} 
                        order={order} 
                        borderColor="border-l-yellow-500" 
                        dueDateColor="text-yellow-600"
                      />
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
                      <OrderCard 
                        key={order.orderId} 
                        order={order} 
                        borderColor="border-l-blue-500" 
                        dueDateColor="text-blue-600"
                      />
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
                      <OrderCard 
                        key={order.orderId} 
                        order={order} 
                        borderColor="border-l-green-500" 
                        dueDateColor="text-green-600"
                      />
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
                      <OrderCard 
                        key={order.orderId} 
                        order={order} 
                        borderColor="border-l-gray-500" 
                        dueDateColor="text-gray-600"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* No Stock Model Orders - Special Handling Queue */}
      {noStockModelOrders.length > 0 && (
        <Card className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-6 w-6 text-purple-600" />
                <span className="text-purple-700 dark:text-purple-300">Special Handling Orders (No Stock Model)</span>
              </div>
              <Badge variant="outline" className="border-purple-300 text-purple-700 dark:text-purple-300">
                {noStockModelOrders.length} Orders
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-sm text-purple-600 dark:text-purple-400">
                These orders have no stock model selected and require special handling before shipping.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {noStockModelOrders.map((order: any) => (
                <OrderCard 
                  key={order.orderId} 
                  order={order} 
                  borderColor="border-l-purple-500" 
                  dueDateColor="text-purple-600"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {selectedOrders.size > 0 && (
        <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
            {selectedOrders.size} orders selected
          </span>
          <Button
            onClick={progressToShipping}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={selectedOrders.size === 0 || progressOrderMutation.isPending}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            {progressOrderMutation.isPending 
              ? 'Progressing...' 
              : `Progress to Shipping (${selectedOrders.size})`}
          </Button>
        </div>
      )}

      {/* UPS Label Creator Dialog */}
      {showLabelCreator && selectedOrderId && (
        <UPSLabelCreator
          orderId={selectedOrderId}
          isOpen={showLabelCreator}
          onClose={() => {
            setShowLabelCreator(false);
            setSelectedOrderId(null);
          }}
          onSuccess={handleLabelSuccess}
        />
      )}

      {/* Label Viewer Dialog */}
      {showLabelViewer && labelData && (
        <Dialog open={showLabelViewer} onOpenChange={setShowLabelViewer}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Shipping Label Generated</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <p className="text-sm"><strong>Tracking Number:</strong> {labelData.trackingNumber}</p>
                <p className="text-sm"><strong>Service:</strong> {labelData.serviceDescription}</p>
                <p className="text-sm"><strong>Cost:</strong> ${labelData.totalCharges}</p>
              </div>
              {labelData.labelImageFormat && (
                <div className="text-center">
                  <Button
                    onClick={() => downloadLabel(labelData.graphicImage, labelData.trackingNumber, selectedOrderId!)}
                    className="mb-4"
                  >
                    Download Label
                  </Button>
                  <div className="border rounded-lg p-4 bg-white">
                    <img 
                      src={`data:image/gif;base64,${labelData.graphicImage}`}
                      alt="Shipping Label"
                      className="mx-auto max-w-full h-auto"
                    />
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}