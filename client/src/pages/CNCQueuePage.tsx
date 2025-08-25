import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Settings, ArrowLeft, ArrowRight, ArrowUp, Target, Wrench, CheckCircle, AlertTriangle, FileText, Eye, TrendingDown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isAfter } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import { useLocation } from 'wouter';
import FBNumberSearch from '@/components/FBNumberSearch';

export default function CNCQueuePage() {
  const [selectedGunsimthOrders, setSelectedGunsimthOrders] = useState<Set<string>>(new Set());
  const [selectedFinishOrders, setSelectedFinishOrders] = useState<Set<string>>(new Set());
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAllGunsmith, setSelectAllGunsmith] = useState(false);
  const [selectAllFinish, setSelectAllFinish] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [salesOrderModalOpen, setSalesOrderModalOpen] = useState(false);
  const [salesOrderContent, setSalesOrderContent] = useState('');
  const [salesOrderLoading, setSalesOrderLoading] = useState(false);
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

  // Function to handle sales order view in modal
  const handleSalesOrderView = async (orderId: string) => {
    setSalesOrderLoading(true);
    setSalesOrderModalOpen(true);
    
    try {
      const response = await fetch(`/api/shipping-pdf/sales-order/${orderId}`);
      if (response.ok) {
        const htmlContent = await response.text();
        setSalesOrderContent(htmlContent);
      } else {
        setSalesOrderContent('<p>Error loading sales order. Please try again.</p>');
      }
    } catch (error) {
      setSalesOrderContent('<p>Error loading sales order. Please try again.</p>');
    } finally {
      setSalesOrderLoading(false);
    }
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

  // Helper function to convert feature values to display names
  const getFeatureDisplayValue = (featureType: string, value: string) => {
    if (!value) return '';
    
    switch (featureType) {
      case 'action_length':
        if (value.includes('short')) return 'Short Action';
        if (value.includes('long')) return 'Long Action';
        if (value.includes('medium')) return 'Medium Action';
        return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
      case 'action_inlet':
        return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
      case 'handedness':
        if (value === 'left') return 'Left Hand';
        if (value === 'right') return 'Right Hand';
        return value.replace(/\b\w/g, l => l.toUpperCase());
        
      case 'bottom_metal':
        return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
      case 'barrel_inlet':
        return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
      default:
        return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
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

  // Get all CNC orders with department type for unified queue
  const cncOrders = useMemo(() => {
    const allCncOrders = (allOrders as any[]).filter(order => order.currentDepartment === 'CNC');
    const uniqueOrders = allCncOrders.filter((order, index, self) => 
      index === self.findIndex(o => o.orderId === order.orderId)
    );
    
    return uniqueOrders
      .map(order => ({
        ...order,
        departmentType: requiresGunsmith(order) ? 'gunsmith' : 'finish'
      }))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [allOrders]);

  // Legacy queues for count calculations  
  const gunsimthQueue = cncOrders.filter(order => order.departmentType === 'gunsmith');
  const finishQueue = cncOrders.filter(order => order.departmentType === 'finish');

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

  // Unified selection handlers
  const toggleOrderSelection = (orderId: string, departmentType: string) => {
    if (departmentType === 'gunsmith') {
      const newSelected = new Set(selectedGunsimthOrders);
      if (newSelected.has(orderId)) {
        newSelected.delete(orderId);
      } else {
        newSelected.add(orderId);
      }
      setSelectedGunsimthOrders(newSelected);
    } else {
      const newSelected = new Set(selectedFinishOrders);
      if (newSelected.has(orderId)) {
        newSelected.delete(orderId);
      } else {
        newSelected.add(orderId);
      }
      setSelectedFinishOrders(newSelected);
    }
  };

  const toggleAllSelection = () => {
    if (selectAll) {
      setSelectedGunsimthOrders(new Set());
      setSelectedFinishOrders(new Set());
    } else {
      setSelectedGunsimthOrders(new Set(gunsimthQueue.map(order => order.orderId)));
      setSelectedFinishOrders(new Set(finishQueue.map(order => order.orderId)));
    }
    setSelectAll(!selectAll);
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

  // Auto-select order when scanned
  const handleOrderScanned = (orderId: string) => {
    // Check if the order exists in the current CNC queue
    const orderExists = cncOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      const order = cncOrders.find((order: any) => order.orderId === orderId);
      if (order) {
        toggleOrderSelection(order.orderId, order.departmentType);
        toast.success(`Order ${orderId} selected automatically`);
      }
    } else {
      toast.error(`Order ${orderId} is not in the CNC department`);
    }
  };

  // Handle order found via Facebook number search
  const handleOrderFound = (orderId: string) => {
    // Check if the order exists in the current CNC queue
    const orderExists = cncOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      const order = cncOrders.find((order: any) => order.orderId === orderId);
      if (order) {
        toggleOrderSelection(order.orderId, order.departmentType);
        toast.success(`Order ${orderId} found and selected`);
      }
    } else {
      // Find the order in all orders to show current department
      const allOrder = (allOrders as any[]).find((order: any) => order.orderId === orderId);
      if (allOrder) {
        toast.error(`Order ${orderId} is currently in ${allOrder.currentDepartment} department, not CNC`);
      } else {
        toast.error(`Order ${orderId} not found`);
      }
    }
  };



  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-3xl font-bold">CNC Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* Facebook Number Search */}
      <FBNumberSearch onOrderFound={handleOrderFound} />

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

      {/* Unified CNC Queue - All orders with color coding by department */}
      <Card className="mb-6">
        <CardHeader className="bg-gray-50 dark:bg-gray-900/20">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-600" />
              <span>CNC Queue</span>
              <Badge variant="outline" className="ml-2 border-gray-300">
                {cncOrders.length} Orders
              </Badge>
              <Badge variant="outline" className="ml-2 border-purple-300 text-purple-700">
                {gunsimthQueue.length} Gunsmith
              </Badge>
              <Badge variant="outline" className="ml-2 border-green-300 text-green-700">
                {finishQueue.length} Finish
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleProgressToGunsmith}
                disabled={selectedGunsimthOrders.size === 0 || progressToGunsmith.isPending}
                className="bg-purple-600 hover:bg-purple-700"
                size="sm"
              >
                <ArrowRight className="h-4 w-4 mr-1" />
                Progress to Gunsmith ({selectedGunsimthOrders.size})
              </Button>
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
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Purple borders: Gunsmith required • Green borders: Ready for Finish
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {cncOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders in CNC department
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
              {cncOrders.map((order: any) => {
                const isGunsmith = order.departmentType === 'gunsmith';
                const isSelected = isGunsmith ? selectedGunsimthOrders.has(order.orderId) : selectedFinishOrders.has(order.orderId);
                const isOverdue = isAfter(new Date(), new Date(order.dueDate));
                
                return (
                  <div 
                    key={order.orderId}
                    className={`p-2 border-l-4 rounded cursor-pointer transition-all duration-200 ${
                      isOverdue
                        ? 'border-l-red-500 bg-red-50 dark:bg-red-900/20'
                        : isSelected
                        ? isGunsmith 
                          ? 'border-l-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-l-green-500 bg-green-50 dark:bg-green-900/20'
                        : isGunsmith
                        ? 'border-l-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/10'
                        : 'border-l-green-400 hover:bg-green-50 dark:hover:bg-green-900/10'
                    }`}
                    onClick={() => toggleOrderSelection(order.orderId, order.departmentType)}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOrderSelection(order.orderId, order.departmentType)}
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
                          
                          {/* Order Details */}
                          <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                            {(() => {
                              const modelName = getModelDisplayName(order.modelId || order.stockModelId);
                              const isTikka = modelName.toLowerCase().includes('tikka');
                              
                              if (isTikka) {
                                // For Tikka orders, only show what's available in the requested order
                                return (
                                  <>
                                    {order.handedness && (
                                      <div><span className="font-medium">Handedness:</span> {getFeatureDisplayValue('handedness', order.handedness)}</div>
                                    )}
                                    {order.features?.barrel_inlet && (
                                      <div><span className="font-medium">Barrel Inlet:</span> {getFeatureDisplayValue('barrel_inlet', order.features.barrel_inlet)}</div>
                                    )}
                                    {order.features?.action_length && (
                                      <div><span className="font-medium">Action Length:</span> {getFeatureDisplayValue('action_length', order.features.action_length)}</div>
                                    )}
                                    {order.features?.action_inlet && (
                                      <div><span className="font-medium">Action Inlet:</span> {getFeatureDisplayValue('action_inlet', order.features.action_inlet)}</div>
                                    )}
                                    {order.features?.bottom_metal && (
                                      <div><span className="font-medium">Bottom Metal:</span> {getFeatureDisplayValue('bottom_metal', order.features.bottom_metal)}</div>
                                    )}
                                  </>
                                );
                              } else {
                                // For all non-Tikka orders, always show all 5 fields in the requested order
                                return (
                                  <>
                                    <div><span className="font-medium">Handedness:</span> {order.handedness ? getFeatureDisplayValue('handedness', order.handedness) : 'Not specified'}</div>
                                    <div><span className="font-medium">Barrel Inlet:</span> {order.features?.barrel_inlet ? getFeatureDisplayValue('barrel_inlet', order.features.barrel_inlet) : 'Not specified'}</div>
                                    <div><span className="font-medium">Action Length:</span> {order.features?.action_length ? getFeatureDisplayValue('action_length', order.features.action_length) : 'Not specified'}</div>
                                    <div><span className="font-medium">Action Inlet:</span> {order.features?.action_inlet ? getFeatureDisplayValue('action_inlet', order.features.action_inlet) : 'Not specified'}</div>
                                    <div><span className="font-medium">Bottom Metal:</span> {order.features?.bottom_metal ? getFeatureDisplayValue('bottom_metal', order.features.bottom_metal) : 'Not specified'}</div>
                                  </>
                                );
                              }
                            })()}
                          </div>
                          
                          <div className={`font-medium ${isGunsmith ? 'text-purple-600' : 'text-green-600'}`}>
                            {isGunsmith ? (
                              (() => {
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
                              })()
                            ) : (
                              'READY FOR FINISH'
                            )}
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

      {/* Sales Order Modal */}
      <Dialog open={salesOrderModalOpen} onOpenChange={setSalesOrderModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sales Order</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {salesOrderLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <span className="ml-2">Loading sales order...</span>
              </div>
            ) : (
              <div 
                className="sales-order-content"
                dangerouslySetInnerHTML={{ __html: salesOrderContent }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}