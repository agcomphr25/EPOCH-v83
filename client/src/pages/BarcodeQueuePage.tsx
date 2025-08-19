import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Scan, ArrowLeft, ArrowRight, QrCode, ArrowUp, Calendar, Target, Printer, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isAfter } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';

export default function BarcodeQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const queryClient = useQueryClient();

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get orders in barcode department
  const barcodeOrders = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Barcode'
    );
  }, [allOrders]);

  // Count orders in previous department (Layup/Plugging)
  const layupCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Layup' || 
      order.currentDepartment === 'Layup/Plugging'
    ).length;
  }, [allOrders]);

  // Count orders in next department (CNC)
  const cncCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'CNC'
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = (stockModels as any[]).find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Categorize orders by stock model and action length, sorted by due date
  const categorizedOrders = useMemo(() => {
    const categories: Record<string, any[]> = {};
    
    barcodeOrders.forEach((order: any) => {
      const modelId = order.modelId;
      const actionLength = order.features?.action_length || 'unknown';
      const stockModel = (stockModels as any[]).find((m: any) => m.id === modelId);
      const categoryKey = `${stockModel?.displayName || stockModel?.name || modelId}_${actionLength}`;
      
      if (!categories[categoryKey]) {
        categories[categoryKey] = [];
      }
      categories[categoryKey].push(order);
    });

    // Sort each category by due date (closest first) and overdue status
    Object.keys(categories).forEach(key => {
      categories[key].sort((a, b) => {
        const aOverdue = isAfter(new Date(), new Date(a.dueDate));
        const bOverdue = isAfter(new Date(), new Date(b.dueDate));
        
        // Overdue orders first
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        
        // Then by due date (closest first)
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    });

    // Sort categories by action length priority (short first), then by stock model
    const sortedCategories = Object.entries(categories).sort(([keyA], [keyB]) => {
      const actionA = keyA.split('_').pop();
      const actionB = keyB.split('_').pop();
      
      if (actionA === 'short' && actionB !== 'short') return -1;
      if (actionA !== 'short' && actionB === 'short') return 1;
      
      return keyA.localeCompare(keyB);
    });

    return Object.fromEntries(sortedCategories);
  }, [barcodeOrders, stockModels]);

  // Handle order selection
  const toggleOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
    setSelectAll(newSelected.size === barcodeOrders.length);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(barcodeOrders.map((order: any) => order.orderId)));
    }
    setSelectAll(!selectAll);
  };

  // Create barcode labels mutation
  const createBarcodeLabels = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await fetch('/api/barcode/create-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create labels');
      }
      
      // Open PDF in new tab/popup for viewing and printing
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const newWindow = window.open(url, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
      
      if (!newWindow) {
        // Fallback if popup blocked - create download link
        const link = document.createElement('a');
        link.href = url;
        link.download = `barcode-labels-${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      // Clean up URL after a delay
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 10000);
      
      return { success: true };
    },
    onSuccess: () => {
      toast.success(`Barcode labels opened in new tab for ${selectedOrders.size} orders`);
      setShowLabelDialog(false);
    },
    onError: (error) => {
      console.error('Label creation error:', error);
      toast.error(`Failed to create barcode labels: ${error.message}`);
    }
  });

  // Progress to CNC mutation
  const progressToCNC = useMutation({
    mutationFn: async (orderIds: string[]) => {
      return await apiRequest('/api/orders/progress-department', 'POST', { 
        orderIds, 
        toDepartment: 'CNC' 
      });
    },
    onSuccess: () => {
      toast.success(`Progressed ${selectedOrders.size} orders to CNC`);
      setSelectedOrders(new Set());
      setSelectAll(false);
      // Refetch orders to update the display
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error) => {
      toast.error(`Failed to progress orders: ${error}`);
    }
  });

  const handleCreateBarcodes = () => {
    if (selectedOrders.size === 0) {
      toast.error('Please select at least one order');
      return;
    }
    setShowLabelDialog(true);
  };

  const handlePrintLabels = (orderIds: string[]) => {
    createBarcodeLabels.mutate(orderIds);
  };

  const handleProgressToCNC = () => {
    if (selectedOrders.size === 0) {
      toast.error('Please select at least one order');
      return;
    }
    progressToCNC.mutate(Array.from(selectedOrders));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Scan className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Barcode Department Manager</h1>
        </div>
        
        {/* Multi-Select Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectAll}
              onCheckedChange={toggleSelectAll}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
              Select All ({selectedOrders.size}/{barcodeOrders.length})
            </label>
          </div>
          
          {selectedOrders.size > 0 && (
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCreateBarcodes}
                disabled={createBarcodeLabels.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <QrCode className="h-4 w-4 mr-2" />
                Create Avery Labels ({selectedOrders.size})
              </Button>
              <Button
                onClick={handleProgressToCNC}
                disabled={progressToCNC.isPending}
                variant="outline"
                className="border-green-500 text-green-700 hover:bg-green-50"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Progress to CNC ({selectedOrders.size})
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Barcode Scanner */}
      <BarcodeScanner />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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

        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              CNC
              <ArrowRight className="h-5 w-5" />
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

      {/* Categorized Order Queues */}
      {Object.keys(categorizedOrders).length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-gray-500 dark:text-gray-400">
            No orders currently in Barcode department
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(categorizedOrders).map(([categoryKey, orders]) => {
            const [modelName, actionLength] = categoryKey.split('_');
            const actionDisplay = actionLength === 'short' ? 'Short Action' : 
                                 actionLength === 'long' ? 'Long Action' : 
                                 'Unknown Action';
            
            return (
              <Card key={categoryKey} className="overflow-hidden">
                <CardHeader className={`pb-4 ${
                  actionLength === 'short' 
                    ? 'bg-red-50 dark:bg-red-900/20 border-b-red-200' 
                    : actionLength === 'long'
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-b-blue-200'
                    : 'bg-gray-50 dark:bg-gray-900/20'
                }`}>
                  <CardTitle className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Target className={`h-5 w-5 ${
                        actionLength === 'short' ? 'text-red-600' : 
                        actionLength === 'long' ? 'text-blue-600' : 'text-gray-600'
                      }`} />
                      <span className="text-lg font-bold">{modelName}</span>
                    </div>
                    <Badge variant="outline" className={`${
                      actionLength === 'short' 
                        ? 'border-red-300 text-red-700 bg-red-100' 
                        : actionLength === 'long'
                        ? 'border-blue-300 text-blue-700 bg-blue-100'
                        : 'border-gray-300 text-gray-700'
                    }`}>
                      <ArrowUp className="h-3 w-3 mr-1" />
                      {actionDisplay}
                    </Badge>
                    <Badge variant="secondary" className="ml-auto">
                      {orders.length} Orders
                    </Badge>
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="p-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {orders.map((order: any) => {
                      const isSelected = selectedOrders.has(order.orderId);
                      const isOverdue = isAfter(new Date(), new Date(order.dueDate));
                      
                      return (
                        <Card 
                          key={order.orderId} 
                          className={`cursor-pointer transition-all duration-200 border-l-4 ${
                            isSelected 
                              ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20 border-l-blue-500' 
                              : isOverdue
                              ? 'border-l-red-500 bg-red-50 dark:bg-red-900/20'
                              : actionLength === 'short'
                              ? 'border-l-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10'
                              : 'border-l-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/10'
                          }`}
                          onClick={() => toggleOrderSelection(order.orderId)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={isSelected}
                                onChange={() => toggleOrderSelection(order.orderId)}
                                className="mt-1"
                              />
                              
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-lg">
                                    {getDisplayOrderId(order)}
                                  </span>
                                  {isOverdue && (
                                    <Badge variant="destructive" className="text-xs">
                                      OVERDUE
                                    </Badge>
                                  )}
                                </div>
                                
                                <div className="space-y-1 text-sm">
                                  <div className="flex items-center gap-2">
                                    <Calendar className="h-3 w-3 text-gray-500" />
                                    <span className={`font-medium ${isOverdue ? 'text-red-700' : ''}`}>
                                      Due: {format(new Date(order.dueDate), 'M/d/yy')}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    <ArrowUp className={`h-3 w-3 ${
                                      actionLength === 'short' ? 'text-red-500' : 'text-blue-500'
                                    }`} />
                                    <span className="font-bold text-lg">
                                      {actionDisplay.toUpperCase()}
                                    </span>
                                  </div>
                                  
                                  {order.customerPO && (
                                    <div className="text-xs text-gray-600">
                                      PO: {order.customerPO}
                                    </div>
                                  )}
                                  
                                  {order.fbOrderNumber && (
                                    <div className="text-xs text-gray-600">
                                      FB: {order.fbOrderNumber}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Label Selection Dialog */}
      <Dialog open={showLabelDialog} onOpenChange={setShowLabelDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Create Barcode Labels - {selectedOrders.size} Orders Selected
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Selected Orders Summary */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Selected Orders Summary:</h3>
              <div className="grid gap-2">
                {Object.entries(categorizedOrders).map(([categoryKey, orders]) => {
                  const categoryOrders = orders.filter(order => selectedOrders.has(order.orderId));
                  if (categoryOrders.length === 0) return null;
                  
                  const [modelName, actionLength] = categoryKey.split('_');
                  const actionDisplay = actionLength === 'short' ? 'Short Action' : 
                                       actionLength === 'long' ? 'Long Action' : 'Unknown Action';
                  
                  return (
                    <div key={categoryKey} className="flex items-center justify-between">
                      <span className="font-medium">{modelName} - {actionDisplay}</span>
                      <Badge variant="outline">{categoryOrders.length} orders</Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Individual Order Cards for Label Selection */}
            <div className="space-y-4">
              <h3 className="font-semibold">Individual Orders - Click to Print Labels:</h3>
              {Object.entries(categorizedOrders).map(([categoryKey, orders]) => {
                const categoryOrders = orders.filter(order => selectedOrders.has(order.orderId));
                if (categoryOrders.length === 0) return null;
                
                const [modelName, actionLength] = categoryKey.split('_');
                const actionDisplay = actionLength === 'short' ? 'Short Action' : 
                                     actionLength === 'long' ? 'Long Action' : 'Unknown Action';
                
                return (
                  <Card key={categoryKey} className="overflow-hidden">
                    <CardHeader className={`pb-3 ${
                      actionLength === 'short' 
                        ? 'bg-red-50 dark:bg-red-900/20' 
                        : actionLength === 'long'
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'bg-gray-50 dark:bg-gray-900/20'
                    }`}>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className={`h-4 w-4 ${
                          actionLength === 'short' ? 'text-red-600' : 
                          actionLength === 'long' ? 'text-blue-600' : 'text-gray-600'
                        }`} />
                        {modelName} - {actionDisplay}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {categoryOrders.map((order: any) => {
                          const isOverdue = isAfter(new Date(), new Date(order.dueDate));
                          
                          return (
                            <Card 
                              key={order.orderId} 
                              className={`cursor-pointer transition-all duration-200 border-l-4 hover:shadow-md ${
                                isOverdue
                                  ? 'border-l-red-500 bg-red-50 dark:bg-red-900/20'
                                  : actionLength === 'short'
                                  ? 'border-l-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/10'
                                  : 'border-l-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/10'
                              }`}
                              onClick={() => handlePrintLabels([order.orderId])}
                            >
                              <CardContent className="p-3">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-lg">
                                      {getDisplayOrderId(order)}
                                    </span>
                                    {isOverdue && (
                                      <Badge variant="destructive" className="text-xs">
                                        OVERDUE
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  <div className="space-y-1 text-sm">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-3 w-3 text-gray-500" />
                                      <span className={`font-medium ${isOverdue ? 'text-red-700' : ''}`}>
                                        Due: {format(new Date(order.dueDate), 'M/d/yy')}
                                      </span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <Printer className="h-3 w-3 text-gray-500" />
                                      <span className="text-xs text-gray-600">
                                        Click to print individual label
                                      </span>
                                    </div>
                                    
                                    {order.customerPO && (
                                      <div className="text-xs text-gray-600">
                                        PO: {order.customerPO}
                                      </div>
                                    )}
                                    
                                    {order.fbOrderNumber && (
                                      <div className="text-xs text-gray-600">
                                        FB: {order.fbOrderNumber}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowLabelDialog(false)}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => handlePrintLabels(Array.from(selectedOrders))}
                  disabled={createBarcodeLabels.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Print All {selectedOrders.size} Labels
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}