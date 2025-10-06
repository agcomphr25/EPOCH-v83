import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Package, ArrowLeft, ArrowRight, CheckCircle, AlertTriangle, FileText, Eye, TrendingDown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { useLocation } from 'wouter';
import FBNumberSearch from '@/components/FBNumberSearch';
import { OrderSearchBox } from '@/components/OrderSearchBox';
import { SalesOrderModal } from '@/components/SalesOrderModal';

export default function PaintQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [salesOrderModalOpen, setSalesOrderModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Fetch all kickbacks to determine which orders have kickbacks
  const { data: allKickbacks = [] } = useQuery({
    queryKey: ['/api/kickbacks'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Helper function to check if an order has kickbacks
  const hasKickbacks = (orderId: string) => {
    return (allKickbacks as any[]).some((kickback: any) => kickback.orderId === orderId);
  };

  // Helper function to get the most severe kickback status for an order
  const getKickbackStatus = (orderId: string) => {
    const orderKickbacks = (allKickbacks as any[]).filter((kickback: any) => kickback.orderId === orderId);
    if (orderKickbacks.length === 0) return null;

    // Priority order: CRITICAL > HIGH > MEDIUM > LOW
    const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const highestPriority = orderKickbacks.reduce((highest: string, kickback: any) => {
      const currentIndex = priorities.indexOf(kickback.priority);
      const highestIndex = priorities.indexOf(highest);
      return currentIndex < highestIndex ? kickback.priority : highest;
    }, 'LOW');

    return highestPriority;
  };

  // Function to handle kickback badge click
  const handleKickbackClick = (orderId: string) => {
    setLocation('/kickback-tracking');
  };

  // Function to handle sales order modal
  const handleSalesOrderView = (orderId: string) => {
    setSelectedOrderId(orderId);
    setSalesOrderModalOpen(true);
  };

  // Handle order found via FishBowl number search
  const handleOrderFound = (orderId: string) => {
    // Check if the order exists in the current Paint queue
    const orderExists = paintOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      setSelectedOrders(prev => new Set([...Array.from(prev), orderId]));
      toast.success(`Order ${orderId} found and selected`);
    } else {
      // Find the order in all orders to show current department
      const allOrder = (allOrders as any[]).find((order: any) => order.orderId === orderId);
      if (allOrder) {
        toast.error(`Order ${orderId} is currently in ${allOrder.currentDepartment} department, not Paint`);
      } else {
        toast.error(`Order ${orderId} not found`);
      }
    }
  };

  // Handle order search selection
  const handleOrderSearchSelect = (order: any) => {
    const orderExists = paintOrders.some((o: any) => o.orderId === order.orderId);
    if (orderExists) {
      setHighlightedOrderId(order.orderId);
      // Auto-scroll to the highlighted order
      setTimeout(() => {
        const element = document.getElementById(`order-${order.orderId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      toast.success(`Order ${order.orderId} highlighted in the list`);
    } else {
      toast.error(`Order ${order.orderId} is not in the Paint department`);
    }
  };

  // Get orders in Paint department
  const paintOrders = useMemo(() => {
    const filtered = (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Paint' || 
      (order.department === 'Paint' && order.status === 'IN_PROGRESS')
    );

    // Sort orders alphabetically and numerically
    return filtered.sort((a: any, b: any) => {
      const aId = getDisplayOrderId(a);
      const bId = getDisplayOrderId(b);

      // Extract letter prefix and numeric suffix
      const aMatch = aId.match(/^([A-Za-z]+)(\d+)$/);
      const bMatch = bId.match(/^([A-Za-z]+)(\d+)$/);

      if (aMatch && bMatch) {
        const [, aPrefix, aNumber] = aMatch;
        const [, bPrefix, bNumber] = bMatch;
        
        // First sort by prefix alphabetically
        if (aPrefix !== bPrefix) {
          return aPrefix.localeCompare(bPrefix);
        }
        
        // Then sort by number numerically
        return parseInt(aNumber, 10) - parseInt(bNumber, 10);
      }

      // Fallback to string comparison if pattern doesn't match
      return aId.localeCompare(bId);
    });
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
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
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
      setSelectedOrders(prev => new Set([...Array.from(prev), orderId]));
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

  // Helper function to normalize feature values
  const normalizeFeatureValue = (value: any): string => {
    if (!value) return '';
    return String(value).toLowerCase().trim();
  };

  // Helper function to get order features for display
  const getOrderFeatures = (order: any) => {
    if (!order.features) return [];
    const features = order.features;
    const displayFeatures = [];

    // Texture
    if (features.texture && !normalizeFeatureValue(features.texture).includes('no')) {
      displayFeatures.push({ label: 'Texture', value: features.texture });
    }

    // QDs (Quick Detach)
    const qdValue = normalizeFeatureValue(features.qd_accessory);
    if (qdValue && qdValue !== 'no_qds' && qdValue !== 'none' && qdValue !== '') {
      displayFeatures.push({ label: 'QDs', value: features.qd_accessory });
    }

    // Swivels
    if (features.swivel_studs && !normalizeFeatureValue(features.swivel_studs).includes('no')) {
      displayFeatures.push({ label: 'Swivels', value: features.swivel_studs });
    }

    // Rails
    const railValue = normalizeFeatureValue(features.rail_accessory);
    if (railValue && railValue !== 'no_rail' && railValue !== 'none' && railValue !== '') {
      displayFeatures.push({ label: 'Rails', value: features.rail_accessory });
    }

    // Tripod
    if ((features.tripod_tap && normalizeFeatureValue(features.tripod_tap) === 'true') ||
        (features.tripod_mount && !normalizeFeatureValue(features.tripod_mount).includes('no'))) {
      displayFeatures.push({ label: 'Tripod', value: 'Yes' });
    }

    // Bipod
    if ((features.bipod_accessory && !normalizeFeatureValue(features.bipod_accessory).includes('no')) ||
        (features.spartan_bipod && normalizeFeatureValue(features.spartan_bipod) === 'true')) {
      displayFeatures.push({ label: 'Bipod', value: 'Yes' });
    }

    return displayFeatures;
  };



  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Package className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Paint Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* FishBowl Number Search */}
      <FBNumberSearch onOrderFound={handleOrderFound} />

      {/* Order Search Box */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <OrderSearchBox 
              orders={paintOrders}
              placeholder="Search orders by Order ID or FishBowl Number..."
              onOrderSelect={handleOrderSearchSelect}
            />
            {highlightedOrderId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHighlightedOrderId(null)}
                className="text-sm"
              >
                Clear highlight
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
                    id={`order-${order.orderId}`}
                    className={`p-2 border rounded cursor-pointer transition-all duration-200 ${
                      highlightedOrderId === order.orderId
                        ? 'border-yellow-400 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/20 ring-2 ring-yellow-300 shadow-lg'
                        : isOverdue
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
                          
                          {/* Paint and Feature Details */}
                          <div className="space-y-1 mb-2">
                            {/* Paint Color */}
                            <div className="flex items-center gap-1">
                              <Badge 
                                variant="secondary" 
                                className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100"
                                title={paintColor}
                              >
                                🎨 {paintColor.includes('No') ? 'None' : paintColor}
                              </Badge>
                            </div>
                            
                            {/* Additional Features */}
                            {(() => {
                              const orderFeatures = getOrderFeatures(order);
                              if (orderFeatures.length === 0) return null;
                              
                              return (
                                <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 dark:text-gray-400">
                                  {orderFeatures.map((feature, index) => (
                                    <div key={index} className="truncate">
                                      <span className="font-medium">{feature.label}:</span> {feature.value}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs ml-1 border-blue-300 text-blue-700 dark:text-blue-300"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSalesOrderView(order.orderId);
                              }}
                            >
                              <Eye className="w-3 h-3" />
                            </Badge>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleKickbackClick(order.orderId);
                              }}
                              title="Report Kickback"
                              className="h-6 w-6 p-0"
                            >
                              <TrendingDown className="h-3 w-3" />
                            </Button>
                            {hasKickbacks(order.orderId) && (
                              <Badge
                                variant="destructive"
                                className={`cursor-pointer hover:opacity-80 transition-opacity text-xs px-1 py-0 ${
                                  getKickbackStatus(order.orderId) === 'CRITICAL' ? 'bg-red-600 hover:bg-red-700' :
                                  getKickbackStatus(order.orderId) === 'HIGH' ? 'bg-orange-600 hover:bg-orange-700' :
                                  getKickbackStatus(order.orderId) === 'MEDIUM' ? 'bg-yellow-600 hover:bg-yellow-700' :
                                  'bg-gray-600 hover:bg-gray-700'
                                }`}
                                onClick={() => handleKickbackClick(order.orderId)}
                              >
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Kickback
                              </Badge>
                            )}
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

      {/* Sales Order Modal */}
      <SalesOrderModal 
        isOpen={salesOrderModalOpen}
        onClose={() => setSalesOrderModalOpen(false)}
        orderId={selectedOrderId}
      />
    </div>
  );
}