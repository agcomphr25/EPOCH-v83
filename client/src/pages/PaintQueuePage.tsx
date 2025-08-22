import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Package, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';

export default function PaintQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const queryClient = useQueryClient();

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get orders in Paint department
  const paintOrders = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Paint' || 
      (order.department === 'Paint' && order.status === 'IN_PROGRESS')
    );
  }, [allOrders]);

  // Count orders in previous department (Finish QC)
  const finishQCCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Finish' || 
      order.currentDepartment === 'FinishQC' ||
      (order.department === 'Finish' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Count orders in next department (QC/Shipping)
  const qcShippingCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'QC' || 
      order.currentDepartment === 'Shipping' ||
      (order.department === 'QC' && order.status === 'IN_PROGRESS') ||
      (order.department === 'Shipping' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  // Multi-select functions
  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedOrders.size === paintOrders.length) {
      setSelectedOrders(new Set());
      setSelectAll(false);
    } else {
      setSelectedOrders(new Set(paintOrders.map((order: any) => order.orderId)));
      setSelectAll(true);
    }
  };

  const handleClearSelection = () => {
    setSelectedOrders(new Set());
    setSelectAll(false);
  };

  // Progress orders to Shipping QC mutation
  const progressToShippingQCMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify({
          orderIds: orderIds,
          department: 'Shipping QC',
          status: 'IN_PROGRESS'
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      toast.success(`${selectedOrders.size} orders moved to Shipping QC department`);
      setSelectedOrders(new Set());
      setSelectAll(false);
    },
    onError: () => {
      toast.error("Failed to move orders to Shipping QC");
    }
  });

  const handleProgressToShippingQC = () => {
    if (selectedOrders.size === 0) return;
    progressToShippingQCMutation.mutate(Array.from(selectedOrders));
  };

  // Auto-select order when scanned
  const handleOrderScanned = (orderId: string) => {
    // Check if the order exists in the current queue
    const orderExists = paintOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      setSelectedOrders(prev => new Set([...prev, orderId]));
      toast.success(`Order ${orderId} selected automatically`);
    } else {
      toast.error(`Order ${orderId} is not in the Paint department`);
    }
  };

  // Helper function to get paint color information
  const getPaintColor = (order: any) => {
    if (!order.features) return 'No paint';
    const features = order.features;
    
    // Check paint_options_combined first (newer format)
    if (features.paint_options_combined) {
      const paintOption = features.paint_options_combined;
      if (paintOption.includes(':')) {
        const [type, color] = paintOption.split(':');
        // Only return the subcategory name, not the category
        return color.replace(/_/g, ' ');
      }
      // For simple values, just format them
      return paintOption.replace(/_/g, ' ');
    }
    
    // Check paint_options (older format)
    if (features.paint_options) {
      if (features.paint_options === 'no_paint') {
        return 'No paint';
      }
      // Format paint option name, removing common category prefixes
      let paintName = features.paint_options.replace(/_/g, ' ');
      
      // Remove category prefixes like "metallic finishes" or "special effects"
      paintName = paintName
        .replace(/^metallic finishes\s*/i, '')
        .replace(/^special effects\s*/i, '')
        .replace(/^cerakote\s*/i, '')
        .replace(/^paint options\s*/i, '');
      
      return paintName || 'Paint';
    }
    
    return 'No paint';
  };



  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Package className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Paint Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Previous Department Count */}
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <ArrowLeft className="h-5 w-5" />
              Finish QC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {finishQCCount}
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
              Shipping QC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {qcShippingCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders in next department
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Paint Orders */}
      <Card>
        <CardHeader className="bg-pink-50 dark:bg-pink-900/20">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-pink-600" />
              <span>Paint Orders</span>
              <Badge variant="outline" className="ml-2 border-pink-300">
                {paintOrders.length} Orders
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              {/* Multi-select Controls */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                  />
                  Select All
                </label>
                <Button
                  onClick={handleProgressToShippingQC}
                  disabled={selectedOrders.size === 0 || progressToShippingQCMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Move to Shipping QC ({selectedOrders.size})
                </Button>
                {selectedOrders.size > 0 && (
                  <Button
                    onClick={handleClearSelection}
                    variant="outline"
                    size="sm"
                  >
                    Clear Selection
                  </Button>
                )}
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {paintOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders in paint queue
            </div>
          ) : (
            <div className="grid gap-1.5 md:grid-cols-2 lg:grid-cols-3">
              {paintOrders.map((order: any) => {
                const isSelected = selectedOrders.has(order.orderId);
                const isOverdue = order.dueDate && new Date() > new Date(order.dueDate);
                const paintColor = getPaintColor(order);
                
                return (
                  <div 
                    key={order.orderId}
                    className={`p-2 border rounded cursor-pointer transition-all duration-200 ${
                      isOverdue
                        ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                        : isSelected
                          ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                    }`}
                    onClick={() => handleSelectOrder(order.orderId)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelectOrder(order.orderId)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 flex-shrink-0"
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="font-medium text-sm truncate">{getDisplayOrderId(order)}</span>
                            {order.fbOrderNumber && (
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                {order.fbOrderNumber}
                              </Badge>
                            )}
                            {order.isPaid && (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-xs px-1 py-0">
                                $
                              </Badge>
                            )}
                          </div>
                          
                          <div className="text-xs text-gray-600 dark:text-gray-400 truncate mb-1">
                            {order.customerName}
                          </div>
                          
                          {/* Paint Color Badge */}
                          <div className="flex items-center gap-1">
                            <Badge 
                              variant="secondary" 
                              className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100 truncate max-w-full"
                              title={paintColor}
                            >
                              🎨 {paintColor.includes('No') ? 'None' : paintColor.split(' ').slice(0, 2).join(' ')}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        {order.dueDate && (
                          <Badge 
                            variant={isOverdue ? "destructive" : "outline"} 
                            className="text-xs px-1 py-0"
                          >
                            {format(new Date(order.dueDate), 'M/d')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating Progression Button */}
      {selectedOrders.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <span className="font-medium text-purple-800 dark:text-purple-200">
                  {selectedOrders.size} order{selectedOrders.size > 1 ? 's' : ''} selected for progression
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedOrders(new Set())}
                  size="sm"
                >
                  Clear Selection
                </Button>
                <Button
                  onClick={handleProgressToShippingQC}
                  disabled={selectedOrders.size === 0 || progressToShippingQCMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {progressToShippingQCMutation.isPending 
                    ? 'Progressing...' 
                    : `Progress to Shipping QC (${selectedOrders.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}