import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Settings, ArrowLeft, ArrowRight, ArrowUp, Target, Wrench, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isAfter } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import { useLocation } from 'wouter';

export default function CNCQueuePage() {
  const [selectedGunsimthOrders, setSelectedGunsimthOrders] = useState<Set<string>>(new Set());
  const [selectedFinishOrders, setSelectedFinishOrders] = useState<Set<string>>(new Set());
  const [selectAllGunsmith, setSelectAllGunsmith] = useState(false);
  const [selectAllFinish, setSelectAllFinish] = useState(false);
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

  // Function to handle sales order download
  const handleSalesOrderDownload = (orderId: string) => {
    window.open(`/api/sales-order/${orderId}`, '_blank');
    toast({
      title: "Sales order opened",
      description: `Sales order for ${orderId} opened in new tab for viewing`
    });
  };

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = (stockModels as any[]).find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Features that go to Gunsmith department (using actual feature names from database)
  const gunsimthFeatures = [
    'rail_accessory',    // Rails
    'qd_accessory',      // QD Quick Detach Cups  
    'tripod_tap',        // Tripod tap
    'tripod_mount',      // Tripod tap and mount
    'bipod_accessory',   // Spartan bipod and other bipods
    'spartan_bipod',     // Spartan bipod specifically
    'adjustable_stock'   // Adjustable stock models require gunsmith work
  ];
  
  // Helper function to normalize feature values (handles arrays and strings)
  const normalizeFeatureValue = (value: any): string => {
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : '';
    }
    return typeof value === 'string' ? value : '';
  };

  // Check if order has features that require gunsmith work
  const requiresGunsmith = (order: any) => {
    // Check if it's an adjustable stock model based on modelId/stockModelId
    const modelId = order.modelId || order.stockModelId || '';
    
    // Check both the modelId and the actual stock model display name
    const modelDisplayName = getModelDisplayName(modelId);
    
    // Check for adjustable stock models
    const isAdjustableModel = modelId.toLowerCase().includes('adjustable') || 
        modelId.toLowerCase().includes('adj') ||
        modelDisplayName.toLowerCase().includes('adjustable') ||
        modelDisplayName.toLowerCase().includes('adj');
    
    if (isAdjustableModel) {
      return true;
    }
    
    if (!order.features) return false;
    
    // Check specific gunsmith features with proper array handling
    const railValue = normalizeFeatureValue(order.features.rail_accessory);
    const qdValue = normalizeFeatureValue(order.features.qd_accessory);
    
    // Rail accessory check - anything other than 'no_rail' or 'none' requires gunsmith
    if (railValue && railValue !== 'no_rail' && railValue !== 'none' && railValue !== '') {
      return true;
    }
    
    // QD accessory check - anything other than 'no_qds' or 'none' requires gunsmith  
    if (qdValue && qdValue !== 'no_qds' && qdValue !== 'none' && qdValue !== '') {
      return true;
    }
    
    // Check other gunsmith features
    for (const feature of gunsimthFeatures) {
      if (feature === 'rail_accessory' || feature === 'qd_accessory') {
        continue; // Already checked above
      }
      
      const featureValue = normalizeFeatureValue(order.features[feature]);
      
      // Consider it a gunsmith feature if:
      // - It's true/yes
      // - It's a non-empty string that's not 'none' or 'no'
      if (featureValue === 'true' || 
          featureValue === 'yes' ||
          (featureValue !== 'none' && 
           featureValue !== 'no' && 
           featureValue !== '' && 
           featureValue !== 'false' &&
           (featureValue.toLowerCase().includes('yes') ||
            featureValue.toLowerCase().includes('rail') ||
            featureValue.toLowerCase().includes('qd') ||
            featureValue.toLowerCase().includes('tripod') ||
            featureValue.toLowerCase().includes('bipod') ||
            featureValue.toLowerCase().includes('spartan') ||
            featureValue.toLowerCase().includes('adjustable')))
      ) {
        return true;
      }
    }
    
    return false;
  };

  // Get orders in CNC department, split by destination
  const gunsimthQueue = useMemo(() => {
    const cncOrders = (allOrders as any[]).filter(order => order.currentDepartment === 'CNC');
    const uniqueOrders = cncOrders.filter((order, index, self) => 
      index === self.findIndex(o => o.orderId === order.orderId)
    );
    
    return uniqueOrders
      .filter(order => requiresGunsmith(order))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [allOrders]);

  const finishQueue = useMemo(() => {
    const cncOrders = (allOrders as any[]).filter(order => order.currentDepartment === 'CNC');
    const uniqueOrders = cncOrders.filter((order, index, self) => 
      index === self.findIndex(o => o.orderId === order.orderId)
    );
    
    return uniqueOrders
      .filter(order => !requiresGunsmith(order))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [allOrders]);

  // Count orders in previous department (Barcode)
  const barcodeCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Barcode' || 
      (order.department === 'Barcode' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Count orders in next departments
  const gunsimthCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Gunsmith' || 
      (order.department === 'Gunsmith' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  const finishQCCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Finish' || 
      order.currentDepartment === 'FinishQC' ||
      (order.department === 'Finish' && order.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Selection handlers for Gunsmith queue
  const toggleGunsimthOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedGunsimthOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedGunsimthOrders(newSelected);
    setSelectAllGunsmith(newSelected.size === gunsimthQueue.length);
  };

  const toggleAllGunsimthSelection = () => {
    if (selectAllGunsmith) {
      setSelectedGunsimthOrders(new Set());
    } else {
      setSelectedGunsimthOrders(new Set(gunsimthQueue.map(order => order.orderId)));
    }
    setSelectAllGunsmith(!selectAllGunsmith);
  };

  // Selection handlers for Finish queue
  const toggleFinishOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedFinishOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedFinishOrders(newSelected);
    setSelectAllFinish(newSelected.size === finishQueue.length);
  };

  const toggleAllFinishSelection = () => {
    if (selectAllFinish) {
      setSelectedFinishOrders(new Set());
    } else {
      setSelectedFinishOrders(new Set(finishQueue.map(order => order.orderId)));
    }
    setSelectAllFinish(!selectAllFinish);
  };

  // Progress to Gunsmith mutation
  const progressToGunsmith = useMutation({
    mutationFn: async (orderIds: string[]) => {
      return await apiRequest('/api/orders/progress-department', {
        method: 'POST',
        body: JSON.stringify({ 
          orderIds, 
          toDepartment: 'Gunsmith' 
        })
      });
    },
    onSuccess: () => {
      toast.success(`Progressed ${selectedGunsimthOrders.size} orders to Gunsmith`);
      setSelectedGunsimthOrders(new Set());
      setSelectAllGunsmith(false);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to progress orders: ${error.message || error}`);
    }
  });

  // Progress to Finish mutation
  const progressToFinish = useMutation({
    mutationFn: async (orderIds: string[]) => {
      return await apiRequest('/api/orders/progress-department', {
        method: 'POST',
        body: JSON.stringify({ 
          orderIds, 
          toDepartment: 'Finish' 
        })
      });
    },
    onSuccess: () => {
      toast.success(`Progressed ${selectedFinishOrders.size} orders to Finish`);
      setSelectedFinishOrders(new Set());
      setSelectAllFinish(false);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to progress orders: ${error.message || error}`);
    }
  });

  const handleProgressToGunsmith = () => {
    if (selectedGunsimthOrders.size === 0) {
      toast.error('Please select at least one order');
      return;
    }
    progressToGunsmith.mutate(Array.from(selectedGunsimthOrders));
  };

  const handleProgressToFinish = () => {
    if (selectedFinishOrders.size === 0) {
      toast.error('Please select at least one order');
      return;
    }
    progressToFinish.mutate(Array.from(selectedFinishOrders));
  };



  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-3xl font-bold">CNC Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Previous Department Count */}
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <ArrowLeft className="h-5 w-5" />
              Barcode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {barcodeCount}
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              Orders from previous department
            </p>
          </CardContent>
        </Card>

        {/* Gunsmith Department Count */}
        <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-purple-700 dark:text-purple-300 flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Gunsmith
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {gunsimthCount}
            </div>
            <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
              Orders requiring gunsmith work
            </p>
          </CardContent>
        </Card>

        {/* Finish Department Count */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Finish
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {finishQCCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders in finish department
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gunsmith Queue - Orders with rails, tripods, bipods, QDS, adjustable stocks */}
      <Card className="mb-6">
        <CardHeader className="bg-purple-50 dark:bg-purple-900/20">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-purple-600" />
              <span>Gunsmith Queue</span>
              <Badge variant="outline" className="ml-2 border-purple-300">
                {gunsimthQueue.length} Orders
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectAllGunsmith}
                  onCheckedChange={toggleAllGunsimthSelection}
                />
                Select All
              </label>
              <Button
                onClick={handleProgressToGunsmith}
                disabled={selectedGunsimthOrders.size === 0 || progressToGunsmith.isPending}
                className="bg-purple-600 hover:bg-purple-700"
                size="sm"
              >
                <ArrowRight className="h-4 w-4 mr-1" />
                Progress to Gunsmith ({selectedGunsimthOrders.size})
              </Button>
            </div>
          </CardTitle>
          <p className="text-sm text-purple-600 dark:text-purple-400 mt-2">
            Orders with rails, tripods, bipods, QDS, or adjustable stocks requiring gunsmith work
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {gunsimthQueue.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders requiring gunsmith work
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
              {gunsimthQueue.map((order: any) => {
                const isSelected = selectedGunsimthOrders.has(order.orderId);
                const isOverdue = isAfter(new Date(), new Date(order.dueDate));
                
                return (
                  <div 
                    key={order.orderId}
                    className={`p-2 border-l-4 rounded cursor-pointer transition-all duration-200 ${
                      isOverdue
                        ? 'border-l-red-500 bg-red-50 dark:bg-red-900/20'
                        : isSelected
                        ? 'border-l-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-l-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/10'
                    }`}
                    onClick={() => toggleGunsimthOrderSelection(order.orderId)}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleGunsimthOrderSelection(order.orderId)}
                        className="flex-shrink-0"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm truncate">
                            {getDisplayOrderId(order)}
                          </span>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs ml-1">
                              OVERDUE
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs ml-1 border-blue-300 text-blue-700 dark:text-blue-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSalesOrderDownload(order.orderId);
                            }}
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            Sales Order
                          </Badge>
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 text-xs ml-1 border-orange-300 text-orange-700 dark:text-orange-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleKickbackClick(order.orderId);
                            }}
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Kickback
                          </Badge>
                          {hasKickbacks(order.orderId) && (
                            <Badge
                              variant="destructive"
                              className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ml-1 ${
                                getKickbackStatus(order.orderId) === 'CRITICAL' ? 'bg-red-600 hover:bg-red-700' :
                                getKickbackStatus(order.orderId) === 'HIGH' ? 'bg-orange-600 hover:bg-orange-700' :
                                getKickbackStatus(order.orderId) === 'MEDIUM' ? 'bg-yellow-600 hover:bg-yellow-700' :
                                'bg-gray-600 hover:bg-gray-700'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleKickbackClick(order.orderId);
                              }}
                            >
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Active Kickback
                            </Badge>
                          )}
                        </div>
                        
                        <div className="text-xs text-gray-600 space-y-1">
                          <div>Due: {format(new Date(order.dueDate), 'M/d/yy')}</div>
                          <div className="text-gray-700 dark:text-gray-300 font-medium">
                            {getModelDisplayName(order.modelId || order.stockModelId)}
                          </div>
                          <div className="text-purple-600 font-medium">
                            {(() => {
                              const activeFeatures = [];
                              
                              const railVal = normalizeFeatureValue(order.features?.rail_accessory);
                              if (railVal && railVal !== 'no_rail' && railVal !== 'none' && railVal !== '') {
                                activeFeatures.push('RAILS');
                              }
                              
                              const qdVal = normalizeFeatureValue(order.features?.qd_accessory);
                              if (qdVal && qdVal !== 'no_qds' && qdVal !== 'none' && qdVal !== '') {
                                activeFeatures.push('QDS');
                              }
                              
                              gunsimthFeatures.forEach(feature => {
                                if (feature === 'rail_accessory' || feature === 'qd_accessory') return;
                                
                                const value = normalizeFeatureValue(order.features?.[feature]);
                                if (value === 'true' || value === 'yes' ||
                                    (value !== 'none' && value !== 'no' && value !== '' && value !== 'false')) {
                                  
                                  if (feature === 'tripod_tap') activeFeatures.push('TRIPOD');
                                  else if (feature === 'tripod_mount') activeFeatures.push('TRIPOD');
                                  else if (feature === 'bipod_accessory') activeFeatures.push('BIPOD');
                                  else if (feature === 'spartan_bipod') activeFeatures.push('BIPOD');
                                  else if (feature === 'adjustable_stock') activeFeatures.push('ADJ STOCK');
                                }
                              });
                              
                              return Array.from(new Set(activeFeatures)).join(', ') || 'GUNSMITH';
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Finish Queue - Orders without special features */}
      <Card>
        <CardHeader className="bg-green-50 dark:bg-green-900/20">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-green-600" />
              <span>Finish Queue</span>
              <Badge variant="outline" className="ml-2 border-green-300">
                {finishQueue.length} Orders
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectAllFinish}
                  onCheckedChange={toggleAllFinishSelection}
                />
                Select All
              </label>
              <Button
                onClick={handleProgressToFinish}
                disabled={selectedFinishOrders.size === 0 || progressToFinish.isPending}
                className="bg-green-600 hover:bg-green-700"
                size="sm"
              >
                <ArrowRight className="h-4 w-4 mr-1" />
                Progress to Finish ({selectedFinishOrders.size})
              </Button>
            </div>
          </CardTitle>
          <p className="text-sm text-green-600 dark:text-green-400 mt-2">
            Orders ready for finish work (no gunsmith features required)
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {finishQueue.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders ready for finish
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
              {finishQueue.map((order: any) => {
                const isSelected = selectedFinishOrders.has(order.orderId);
                const isOverdue = isAfter(new Date(), new Date(order.dueDate));
                
                return (
                  <div 
                    key={order.orderId}
                    className={`p-2 border-l-4 rounded cursor-pointer transition-all duration-200 ${
                      isOverdue
                        ? 'border-l-red-500 bg-red-50 dark:bg-red-900/20'
                        : isSelected
                        ? 'border-l-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-l-green-400 hover:bg-green-50 dark:hover:bg-green-900/10'
                    }`}
                    onClick={() => toggleFinishOrderSelection(order.orderId)}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleFinishOrderSelection(order.orderId)}
                        className="flex-shrink-0"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm truncate">
                            {getDisplayOrderId(order)}
                          </span>
                          {isOverdue && (
                            <Badge variant="destructive" className="text-xs ml-1">
                              OVERDUE
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs ml-1 border-blue-300 text-blue-700 dark:text-blue-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSalesOrderDownload(order.orderId);
                            }}
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            Sales Order
                          </Badge>
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 text-xs ml-1 border-orange-300 text-orange-700 dark:text-orange-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleKickbackClick(order.orderId);
                            }}
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Kickback
                          </Badge>
                          {hasKickbacks(order.orderId) && (
                            <Badge
                              variant="destructive"
                              className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ml-1 ${
                                getKickbackStatus(order.orderId) === 'CRITICAL' ? 'bg-red-600 hover:bg-red-700' :
                                getKickbackStatus(order.orderId) === 'HIGH' ? 'bg-orange-600 hover:bg-orange-700' :
                                getKickbackStatus(order.orderId) === 'MEDIUM' ? 'bg-yellow-600 hover:bg-yellow-700' :
                                'bg-gray-600 hover:bg-gray-700'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleKickbackClick(order.orderId);
                              }}
                            >
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Active Kickback
                            </Badge>
                          )}
                        </div>
                        
                        <div className="text-xs text-gray-600 space-y-1">
                          <div>Due: {format(new Date(order.dueDate), 'M/d/yy')}</div>
                          <div className="text-gray-700 dark:text-gray-300 font-medium">
                            {getModelDisplayName(order.modelId || order.stockModelId)}
                          </div>
                          <div className="text-green-600 font-medium">READY FOR FINISH</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating Gunsmith Progression Button */}
      {selectedGunsimthOrders.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <span className="font-medium text-purple-800 dark:text-purple-200">
                  {selectedGunsimthOrders.size} order{selectedGunsimthOrders.size > 1 ? 's' : ''} selected for Gunsmith
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedGunsimthOrders(new Set())}
                  size="sm"
                >
                  Clear Selection
                </Button>
                <Button
                  onClick={handleProgressToGunsmith}
                  disabled={selectedGunsimthOrders.size === 0 || progressToGunsmith.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {progressToGunsmith.isPending 
                    ? 'Progressing...' 
                    : `Progress to Gunsmith (${selectedGunsimthOrders.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Finish Progression Button */}
      {selectedFinishOrders.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  {selectedFinishOrders.size} order{selectedFinishOrders.size > 1 ? 's' : ''} selected for Finish
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedFinishOrders(new Set())}
                  size="sm"
                >
                  Clear Selection
                </Button>
                <Button
                  onClick={handleProgressToFinish}
                  disabled={selectedFinishOrders.size === 0 || progressToFinish.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {progressToFinish.isPending 
                    ? 'Progressing...' 
                    : `Progress to Finish (${selectedFinishOrders.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}