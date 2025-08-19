import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Settings, ArrowLeft, ArrowRight, ArrowUp, Target, Wrench } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isAfter } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';

export default function CNCQueuePage() {
  const [selectedGunsimthOrders, setSelectedGunsimthOrders] = useState<Set<string>>(new Set());
  const [selectedFinishOrders, setSelectedFinishOrders] = useState<Set<string>>(new Set());
  const [selectAllGunsmith, setSelectAllGunsmith] = useState(false);
  const [selectAllFinish, setSelectAllFinish] = useState(false);
  const queryClient = useQueryClient();

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Features that go to Gunsmith department (using actual feature names from database)
  const gunsimthFeatures = [
    'rail_accessory',    // Rails
    'qd_accessory',      // QD Quick Detach Cups  
    'tripod_tap',        // Tripod tap
    'tripod_mount',      // Tripod tap and mount
    'bipod_accessory',   // Spartan bipod and other bipods
    'adjustable_stock',  // Adjustable stocks
    'spartan_bipod'      // Spartan bipod specifically
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
            featureValue.toLowerCase().includes('spartan')))
      ) {
        return true;
      }
    }
    
    return false;
  };

  // Get orders in CNC department, split by destination
  const { gunsimthQueue, finishQueue } = useMemo(() => {
    const cncOrders = (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'CNC' || 
      (order.department === 'CNC' && order.status === 'IN_PROGRESS')
    );

    const gunsmith = cncOrders.filter(requiresGunsmith).sort((a, b) => 
      new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
    
    const finish = cncOrders.filter(order => !requiresGunsmith(order)).sort((a, b) => 
      new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );

    return {
      gunsimthQueue: gunsmith,
      finishQueue: finish
    };
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

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

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
      return await apiRequest('/api/orders/progress-department', 'POST', { 
        orderIds, 
        toDepartment: 'Gunsmith' 
      });
    },
    onSuccess: () => {
      toast.success(`Progressed ${selectedGunsimthOrders.size} orders to Gunsmith`);
      setSelectedGunsimthOrders(new Set());
      setSelectAllGunsmith(false);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error) => {
      toast.error(`Failed to progress orders: ${error}`);
    }
  });

  // Progress to Finish mutation
  const progressToFinish = useMutation({
    mutationFn: async (orderIds: string[]) => {
      return await apiRequest('/api/orders/progress-department', 'POST', { 
        orderIds, 
        toDepartment: 'Finish' 
      });
    },
    onSuccess: () => {
      toast.success(`Progressed ${selectedFinishOrders.size} orders to Finish`);
      setSelectedFinishOrders(new Set());
      setSelectAllFinish(false);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error) => {
      toast.error(`Failed to progress orders: ${error}`);
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
                  onChange={toggleAllGunsimthSelection}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {gunsimthQueue.map((order: any) => {
                const isSelected = selectedGunsimthOrders.has(order.orderId);
                const isOverdue = isAfter(new Date(), new Date(order.dueDate));
                
                return (
                  <Card 
                    key={order.orderId}
                    className={`transition-all duration-200 border-l-4 ${
                      isOverdue
                        ? 'border-l-red-500 bg-red-50 dark:bg-red-900/20'
                        : isSelected
                        ? 'border-l-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-l-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/10'
                    }`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleGunsimthOrderSelection(order.orderId)}
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
                              <Target className="h-3 w-3 text-gray-500" />
                              <span className={`font-medium ${isOverdue ? 'text-red-700' : ''}`}>
                                Due: {format(new Date(order.dueDate), 'M/d/yy')}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <ArrowUp className="h-3 w-3 text-purple-500" />
                              <span className="font-bold text-sm text-purple-600">
                                GUNSMITH FEATURES
                              </span>
                            </div>
                            
                            {/* Show which features require gunsmith work */}
                            <div className="text-xs text-gray-600">
                              {(() => {
                                const activeFeatures = [];
                                
                                // Check rail accessory (with array handling)
                                const railVal = normalizeFeatureValue(order.features?.rail_accessory);
                                if (railVal && railVal !== 'no_rail' && railVal !== 'none' && railVal !== '') {
                                  activeFeatures.push('RAILS');
                                }
                                
                                // Check QD accessory (with array handling)
                                const qdVal = normalizeFeatureValue(order.features?.qd_accessory);
                                if (qdVal && qdVal !== 'no_qds' && qdVal !== 'none' && qdVal !== '') {
                                  activeFeatures.push('QD CUPS');
                                }
                                
                                // Check other gunsmith features
                                gunsimthFeatures.forEach(feature => {
                                  if (feature === 'rail_accessory' || feature === 'qd_accessory') {
                                    return; // Already handled above
                                  }
                                  
                                  const value = normalizeFeatureValue(order.features?.[feature]);
                                  if (value === 'true' || value === 'yes' ||
                                      (value !== 'none' && value !== 'no' && value !== '' && value !== 'false')) {
                                    
                                    if (feature === 'tripod_tap') activeFeatures.push('TRIPOD TAP');
                                    else if (feature === 'tripod_mount') activeFeatures.push('TRIPOD MOUNT');
                                    else if (feature === 'bipod_accessory') activeFeatures.push('BIPOD');
                                    else if (feature === 'spartan_bipod') activeFeatures.push('SPARTAN BIPOD');
                                    else if (feature === 'adjustable_stock') activeFeatures.push('ADJUSTABLE STOCK');
                                  }
                                });
                                
                                return [...new Set(activeFeatures)].join(', ') || 'GUNSMITH REQUIRED';
                              })()}
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
                  onChange={toggleAllFinishSelection}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {finishQueue.map((order: any) => {
                const isSelected = selectedFinishOrders.has(order.orderId);
                const isOverdue = isAfter(new Date(), new Date(order.dueDate));
                
                return (
                  <Card 
                    key={order.orderId}
                    className={`transition-all duration-200 border-l-4 ${
                      isOverdue
                        ? 'border-l-red-500 bg-red-50 dark:bg-red-900/20'
                        : isSelected
                        ? 'border-l-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-l-green-400 hover:bg-green-50 dark:hover:bg-green-900/10'
                    }`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleFinishOrderSelection(order.orderId)}
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
                              <Target className="h-3 w-3 text-gray-500" />
                              <span className={`font-medium ${isOverdue ? 'text-red-700' : ''}`}>
                                Due: {format(new Date(order.dueDate), 'M/d/yy')}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <ArrowUp className="h-3 w-3 text-green-500" />
                              <span className="font-bold text-sm text-green-600">
                                READY FOR FINISH
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}