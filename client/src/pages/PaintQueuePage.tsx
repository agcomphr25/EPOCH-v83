import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Package, ArrowLeft, ArrowRight } from 'lucide-react';
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



  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Package className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Paint Department Manager</h1>
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
        <CardContent>
          {paintOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders in paint queue
            </div>
          ) : (
            <div className="grid gap-2">
              {paintOrders.map((order: any) => {
                const isSelected = selectedOrders.has(order.orderId);
                const isOverdue = order.dueDate && new Date() > new Date(order.dueDate);
                
                return (
                  <OrderTooltip key={order.orderId} order={order} stockModels={stockModels as any[]}>
                    <div 
                      className={`p-2 border-l-4 rounded cursor-pointer transition-all duration-200 ${
                        isOverdue
                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                          : isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-pink-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => handleSelectOrder(order.orderId)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => handleSelectOrder(order.orderId)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{order.orderId}</span>
                              {order.fbOrderNumber && (
                                <Badge variant="outline" className="text-xs">
                                  FB: {order.fbOrderNumber}
                                </Badge>
                              )}
                              {order.isPaid && (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-xs">
                                  PAID
                                </Badge>
                              )}
                            </div>
                            
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {order.customerName}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {order.currentDepartment}
                            </Badge>
                            {order.dueDate && (
                              <Badge variant={isOverdue ? "destructive" : "outline"} className="text-xs">
                                Due: {format(new Date(order.dueDate), 'M/d')}
                              </Badge>
                            )}
                          </div>
                          <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                            {order.orderDate && format(new Date(order.orderDate), 'M/d/yy')}
                          </div>
                        </div>
                      </div>
                    </div>
                  </OrderTooltip>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}