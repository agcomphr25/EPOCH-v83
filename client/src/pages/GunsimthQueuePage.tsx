import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OrderTooltip } from '@/components/OrderTooltip';
import { Target, ArrowLeft, ArrowRight, CheckSquare, Square, ArrowRightCircle, CheckCircle, AlertTriangle, FileText, Eye, TrendingDown } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import FBNumberSearch from '@/components/FBNumberSearch';
import { SalesOrderModal } from '@/components/SalesOrderModal';

export default function GunsimthQueuePage() {
  // Multi-select state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [salesOrderModalOpen, setSalesOrderModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const queryClient = useQueryClient();
  const { toast } = useToast();
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

  // Get orders in Gunsmith department
  const gunsmithOrders = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Gunsmith'
    );
  }, [allOrders]);

  // Categorize orders by due date
  const categorizedOrders = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const overdue = [];
    const dueToday = [];
    const dueTomorrow = [];
    const dueThisWeek = [];
    const dueNextWeek = [];
    const futureDue = [];
    const noDueDate = [];

    for (const order of gunsmithOrders) {
      if (!order.dueDate) {
        noDueDate.push(order);
        continue;
      }

      const dueDate = new Date(order.dueDate);
      dueDate.setHours(0, 0, 0, 0); // Normalize to start of day
      const todayNorm = new Date(today);
      todayNorm.setHours(0, 0, 0, 0);

      if (dueDate < todayNorm) {
        overdue.push(order);
      } else if (dueDate.getTime() === todayNorm.getTime()) {
        dueToday.push(order);
      } else if (dueDate.getTime() === tomorrow.getTime()) {
        dueTomorrow.push(order);
      } else if (dueDate <= new Date(todayNorm.getTime() + 7 * 24 * 60 * 60 * 1000)) {
        dueThisWeek.push(order);
      } else if (dueDate <= new Date(todayNorm.getTime() + 14 * 24 * 60 * 60 * 1000)) {
        dueNextWeek.push(order);
      } else {
        futureDue.push(order);
      }
    }

    // Sort each category by due date and order ID
    const sortFn = (a: any, b: any) => {
      if (a.dueDate && b.dueDate) {
        const dateCompare = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dateCompare !== 0) return dateCompare;
      }
      return a.orderId.localeCompare(b.orderId);
    };

    return {
      overdue: overdue.sort(sortFn),
      dueToday: dueToday.sort(sortFn),
      dueTomorrow: dueTomorrow.sort(sortFn),
      dueThisWeek: dueThisWeek.sort(sortFn),
      dueNextWeek: dueNextWeek.sort(sortFn),
      futureDue: futureDue.sort(sortFn),
      noDueDate: noDueDate.sort((a, b) => a.orderId.localeCompare(b.orderId))
    };
  }, [gunsmithOrders]);

  // Count orders in previous department (CNC)
  const cncCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'CNC'
    ).length;
  }, [allOrders]);

  // Count orders in next department (Finish)
  const finishCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Finish'
    ).length;
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = stockModels.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Function to extract detailed gunsmith tasks from order features
  const getGunsimthTasks = (order: any) => {
    const tasks = [];
    const features = order.features || {};

    // Check for QD accessories with location details - exclude no_qds, none, and empty values
    if (features.qd_accessory && 
        features.qd_accessory !== 'no_qds' && 
        features.qd_accessory !== 'none' && 
        features.qd_accessory !== '' && 
        features.qd_accessory !== null && 
        features.qd_accessory !== undefined &&
        !features.qd_accessory.toLowerCase().includes('no')) {
      let qdDetail = 'QDs';
      const qdValue = features.qd_accessory;
      
      if (qdValue.includes('qd_2_left')) qdDetail = 'QDs (2 Left)';
      else if (qdValue.includes('qd_2_right')) qdDetail = 'QDs (2 Right)';
      else if (qdValue.includes('qd_2_both')) qdDetail = 'QDs (2 Both Sides)';
      else if (qdValue.includes('qd_1_left')) qdDetail = 'QDs (1 Left)';
      else if (qdValue.includes('qd_1_right')) qdDetail = 'QDs (1 Right)';
      else if (qdValue.includes('left')) qdDetail = 'QDs (Left)';
      else if (qdValue.includes('right')) qdDetail = 'QDs (Right)';
      else if (qdValue.includes('both')) qdDetail = 'QDs (Both Sides)';
      
      tasks.push(qdDetail);
    }

    // Check for rails with type details - exclude no_rail, none, and empty values
    if (features.rail_accessory && 
        features.rail_accessory !== 'no_rail' && 
        features.rail_accessory !== 'none' && 
        features.rail_accessory !== '' && 
        features.rail_accessory !== null && 
        features.rail_accessory !== undefined) {
      let railDetails = [];
      const railValue = features.rail_accessory;
      
      if (Array.isArray(railValue)) {
        railDetails = railValue
          .filter(rail => rail && rail !== 'no_rail' && rail !== 'none' && rail !== '')
          .map(rail => {
            if (rail.includes('arca_6')) return 'ARCA 6"';
            if (rail.includes('arca_12')) return 'ARCA 12"';
            if (rail.includes('arca_18')) return 'ARCA 18"';
            if (rail.includes('mlok')) return 'M-LOK';
            if (rail.includes('picatinny')) return 'Picatinny';
            return rail;
          });
      } else if (typeof railValue === 'string' && railValue.toLowerCase() !== 'no rail') {
        if (railValue.includes('arca_6')) railDetails.push('ARCA 6"');
        else if (railValue.includes('arca_12')) railDetails.push('ARCA 12"');
        else if (railValue.includes('arca_18')) railDetails.push('ARCA 18"');
        else if (railValue.includes('mlok')) railDetails.push('M-LOK');
        else if (railValue.includes('picatinny')) railDetails.push('Picatinny');
        else if (!railValue.toLowerCase().includes('no')) railDetails.push(railValue);
      }
      
      if (railDetails.length > 0) {
        tasks.push(`Rails (${railDetails.join(', ')})`);
      }
    }

    // Check for tripod mount and tap
    if (features.other_options && Array.isArray(features.other_options)) {
      if (features.other_options.includes('tripod_mount') || features.other_options.includes('mount_and_tap')) {
        tasks.push('Mount & Tap');
      }
      if (features.other_options.includes('tripod')) {
        tasks.push('Tripod');
      }
    }

    // Check for bipod with type details - exclude no_bipod, none, and empty values
    if (features.bipod_accessory && 
        features.bipod_accessory !== 'no_bipod' && 
        features.bipod_accessory !== 'none' && 
        features.bipod_accessory !== '' && 
        features.bipod_accessory !== null && 
        features.bipod_accessory !== undefined &&
        !features.bipod_accessory.toLowerCase().includes('no')) {
      let bipodDetail = 'Bipod';
      const bipodValue = features.bipod_accessory;
      
      if (bipodValue.includes('spartan_javelin')) bipodDetail = 'Spartan Javelin';
      else if (bipodValue.includes('spartan_tac')) bipodDetail = 'Spartan TAC';
      else if (bipodValue.includes('spartan')) bipodDetail = 'Spartan Bipod';
      else if (bipodValue.includes('harris')) bipodDetail = 'Harris Bipod';
      else if (bipodValue.includes('atlas')) bipodDetail = 'Atlas Bipod';
      
      tasks.push(bipodDetail);
    }

    return tasks;
  };

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
    if (selectedOrders.size === gunsmithOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(gunsmithOrders.map((order: any) => order.orderId)));
    }
  };

  const handleClearSelection = () => {
    setSelectedOrders(new Set());
  };

  // Progress orders to Finish mutation (natural progression from Gunsmith)
  const progressToFinishMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify({
          orderIds: orderIds,
          department: 'Finish',
          status: 'IN_PROGRESS'
        })
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      toast({
        title: "Success",
        description: `${selectedOrders.size} orders moved to Finish department`,
      });
      setSelectedOrders(new Set());
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to move orders to Finish",
        variant: "destructive",
      });
    }
  });

  const handleProgressToFinish = () => {
    if (selectedOrders.size === 0) return;
    progressToFinishMutation.mutate(Array.from(selectedOrders));
  };

  // Auto-select order when scanned
  const handleOrderScanned = (orderId: string) => {
    // Check if the order exists in the current queue
    const orderExists = gunsmithOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      setSelectedOrders(prev => new Set([...prev, orderId]));
      toast({
        title: "Success",
        description: `Order ${orderId} selected automatically`,
      });
    } else {
      toast({
        title: "Error",
        description: `Order ${orderId} is not in the Gunsmith department`,
        variant: "destructive",
      });
    }
  };

  // Handle order found via Facebook number search
  const handleOrderFound = (orderId: string) => {
    // Check if the order exists in the current Gunsmith queue
    const orderExists = gunsmithOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      setSelectedOrders(prev => new Set([...prev, orderId]));
      toast({
        title: "Success",
        description: `Order ${orderId} found and selected`,
      });
    } else {
      // Find the order in all orders to show current department
      const allOrder = (allOrders as any[]).find((order: any) => order.orderId === orderId);
      if (allOrder) {
        toast({
          title: "Error",
          description: `Order ${orderId} is currently in ${allOrder.currentDepartment} department, not Gunsmith`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: `Order ${orderId} not found`,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Target className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Gunsmith Department Manager</h1>
      </div>

      {/* Barcode Scanner at top */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* Facebook Number Search */}
      <FBNumberSearch onOrderFound={handleOrderFound} />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Previous Department Count */}
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <ArrowLeft className="h-5 w-5" />
              CNC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {cncCount}
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
              Finish
              <ArrowRight className="h-5 w-5" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {finishCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders in next department
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Gunsmith Orders */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Gunsmith Orders ({gunsmithOrders.length})
            </CardTitle>
            
            {gunsmithOrders.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="flex items-center gap-2"
                >
                  {selectedOrders.size === gunsmithOrders.length ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {selectedOrders.size === gunsmithOrders.length ? 'Deselect All' : 'Select All'}
                </Button>
                
                {selectedOrders.size > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearSelection}
                    >
                      Clear ({selectedOrders.size})
                    </Button>
                    
                    <Button
                      onClick={handleProgressToFinish}
                      disabled={progressToFinishMutation.isPending}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                    >
                      <ArrowRightCircle className="h-4 w-4" />
                      Move to Finish ({selectedOrders.size})
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {gunsmithOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No orders currently in Gunsmith department
            </div>
          ) : (
            <div className="space-y-6">
              {/* Overdue Orders - Critical Priority */}
              {categorizedOrders.overdue.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                      🚨 Overdue ({categorizedOrders.overdue.length})
                    </h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categorizedOrders.overdue.map((order: any) => (
                      <div key={order.id} className="relative">
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox
                            checked={selectedOrders.has(order.orderId)}
                            onCheckedChange={() => handleSelectOrder(order.orderId)}
                            className="bg-white dark:bg-gray-800 border-2"
                          />
                        </div>
                        <Card 
                          className={`${selectedOrders.has(order.orderId) 
                            ? 'bg-red-100 dark:bg-red-800/40 border-red-400 dark:border-red-600 ring-2 ring-red-300 dark:ring-red-700' 
                            : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                          } pl-8`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">{getDisplayOrderId(order)}</div>
                              {order.dueDate && (
                                <Badge variant="destructive" className="text-xs">
                                  Due: {format(new Date(order.dueDate), 'M/d')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                              {order.customerName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {getModelDisplayName(order.modelId)}
                            </div>
                            {getGunsimthTasks(order).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {getGunsimthTasks(order).map((task, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {task}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex gap-1 flex-wrap">
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
                              {hasKickbacks(order.orderId) && (
                                <Badge
                                  variant="destructive"
                                  className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ${
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
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Today - High Priority */}
              {categorizedOrders.dueToday.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                      🔥 Due Today ({categorizedOrders.dueToday.length})
                    </h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categorizedOrders.dueToday.map((order: any) => (
                      <div key={order.id} className="relative">
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox
                            checked={selectedOrders.has(order.orderId)}
                            onCheckedChange={() => handleSelectOrder(order.orderId)}
                            className="bg-white dark:bg-gray-800 border-2"
                          />
                        </div>
                        <Card 
                          className={`${selectedOrders.has(order.orderId) 
                            ? 'bg-orange-100 dark:bg-orange-800/40 border-orange-400 dark:border-orange-600 ring-2 ring-orange-300 dark:ring-orange-700' 
                            : 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                          } pl-8`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">{getDisplayOrderId(order)}</div>
                              {order.dueDate && (
                                <Badge variant="destructive" className="text-xs">
                                  Due: {format(new Date(order.dueDate), 'M/d')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                              {order.customerName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {getModelDisplayName(order.modelId)}
                            </div>
                            {getGunsimthTasks(order).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {getGunsimthTasks(order).map((task, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {task}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex gap-1 flex-wrap">
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
                              {hasKickbacks(order.orderId) && (
                                <Badge
                                  variant="destructive"
                                  className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ${
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
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Tomorrow - Medium Priority */}
              {categorizedOrders.dueTomorrow.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">
                      ⚡ Due Tomorrow ({categorizedOrders.dueTomorrow.length})
                    </h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categorizedOrders.dueTomorrow.map((order: any) => (
                      <div key={order.id} className="relative">
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox
                            checked={selectedOrders.has(order.orderId)}
                            onCheckedChange={() => handleSelectOrder(order.orderId)}
                            className="bg-white dark:bg-gray-800 border-2"
                          />
                        </div>
                        <Card 
                          className={`${selectedOrders.has(order.orderId) 
                            ? 'bg-yellow-100 dark:bg-yellow-800/40 border-yellow-400 dark:border-yellow-600 ring-2 ring-yellow-300 dark:ring-yellow-700' 
                            : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
                          } pl-8`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">{getDisplayOrderId(order)}</div>
                              {order.dueDate && (
                                <Badge variant="secondary" className="text-xs">
                                  Due: {format(new Date(order.dueDate), 'M/d')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                              {order.customerName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {getModelDisplayName(order.modelId)}
                            </div>
                            {getGunsimthTasks(order).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {getGunsimthTasks(order).map((task, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {task}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex gap-1 flex-wrap">
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
                              {hasKickbacks(order.orderId) && (
                                <Badge
                                  variant="destructive"
                                  className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ${
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
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Due This Week */}
              {categorizedOrders.dueThisWeek.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      📅 Due This Week ({categorizedOrders.dueThisWeek.length})
                    </h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categorizedOrders.dueThisWeek.map((order: any) => (
                      <div key={order.id} className="relative">
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox
                            checked={selectedOrders.has(order.orderId)}
                            onCheckedChange={() => handleSelectOrder(order.orderId)}
                            className="bg-white dark:bg-gray-800 border-2"
                          />
                        </div>
                        <Card 
                          className={`${selectedOrders.has(order.orderId) 
                            ? 'bg-blue-100 dark:bg-blue-800/40 border-blue-400 dark:border-blue-600 ring-2 ring-blue-300 dark:ring-blue-700' 
                            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                          } pl-8`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">{getDisplayOrderId(order)}</div>
                              {order.dueDate && (
                                <Badge variant="outline" className="text-xs">
                                  Due: {format(new Date(order.dueDate), 'M/d')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                              {order.customerName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {getModelDisplayName(order.modelId)}
                            </div>
                            {getGunsimthTasks(order).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {getGunsimthTasks(order).map((task, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {task}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex gap-1 flex-wrap">
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
                              {hasKickbacks(order.orderId) && (
                                <Badge
                                  variant="destructive"
                                  className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ${
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
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Next Week */}
              {categorizedOrders.dueNextWeek.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">
                      📆 Due Next Week ({categorizedOrders.dueNextWeek.length})
                    </h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categorizedOrders.dueNextWeek.map((order: any) => (
                      <div key={order.id} className="relative">
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox
                            checked={selectedOrders.has(order.orderId)}
                            onCheckedChange={() => handleSelectOrder(order.orderId)}
                            className="bg-white dark:bg-gray-800 border-2"
                          />
                        </div>
                        <Card 
                          className={`${selectedOrders.has(order.orderId) 
                            ? 'bg-green-100 dark:bg-green-800/40 border-green-400 dark:border-green-600 ring-2 ring-green-300 dark:ring-green-700' 
                            : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                          } pl-8`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">{getDisplayOrderId(order)}</div>
                              {order.dueDate && (
                                <Badge variant="outline" className="text-xs">
                                  Due: {format(new Date(order.dueDate), 'M/d')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                              {order.customerName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {getModelDisplayName(order.modelId)}
                            </div>
                            {getGunsimthTasks(order).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {getGunsimthTasks(order).map((task, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {task}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex gap-1 flex-wrap">
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
                              {hasKickbacks(order.orderId) && (
                                <Badge
                                  variant="destructive"
                                  className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ${
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
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Future Due */}
              {categorizedOrders.futureDue.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                      🗓️ Future Due ({categorizedOrders.futureDue.length})
                    </h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categorizedOrders.futureDue.map((order: any) => (
                      <div key={order.id} className="relative">
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox
                            checked={selectedOrders.has(order.orderId)}
                            onCheckedChange={() => handleSelectOrder(order.orderId)}
                            className="bg-white dark:bg-gray-800 border-2"
                          />
                        </div>
                        <Card 
                          className={`${selectedOrders.has(order.orderId) 
                            ? 'bg-purple-100 dark:bg-purple-800/40 border-purple-400 dark:border-purple-600 ring-2 ring-purple-300 dark:ring-purple-700' 
                            : 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700'
                          } pl-8`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">{getDisplayOrderId(order)}</div>
                              {order.dueDate && (
                                <Badge variant="outline" className="text-xs">
                                  Due: {format(new Date(order.dueDate), 'M/d')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                              {order.customerName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {getModelDisplayName(order.modelId)}
                            </div>
                            {getGunsimthTasks(order).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {getGunsimthTasks(order).map((task, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {task}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex gap-1 flex-wrap">
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
                              {hasKickbacks(order.orderId) && (
                                <Badge
                                  variant="destructive"
                                  className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ${
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
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Due Date */}
              {categorizedOrders.noDueDate.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                      ❓ No Due Date ({categorizedOrders.noDueDate.length})
                    </h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categorizedOrders.noDueDate.map((order: any) => (
                      <div key={order.id} className="relative">
                        <div className="absolute top-2 left-2 z-10">
                          <Checkbox
                            checked={selectedOrders.has(order.orderId)}
                            onCheckedChange={() => handleSelectOrder(order.orderId)}
                            className="bg-white dark:bg-gray-800 border-2"
                          />
                        </div>
                        <Card 
                          className={`${selectedOrders.has(order.orderId) 
                            ? 'bg-gray-100 dark:bg-gray-800/40 border-gray-400 dark:border-gray-600 ring-2 ring-gray-300 dark:ring-gray-700' 
                            : 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700'
                          } pl-8`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold">{getDisplayOrderId(order)}</div>
                              <Badge variant="secondary" className="text-xs">
                                No Due Date
                              </Badge>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                              {order.customerName}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {getModelDisplayName(order.modelId)}
                            </div>
                            {getGunsimthTasks(order).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {getGunsimthTasks(order).map((task, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {task}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex gap-1 flex-wrap">
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
                              {hasKickbacks(order.orderId) && (
                                <Badge
                                  variant="destructive"
                                  className={`cursor-pointer hover:opacity-80 transition-opacity text-xs ${
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
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-800 dark:text-blue-200">
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
                  onClick={handleProgressOrders}
                  disabled={selectedOrders.size === 0 || progressMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {progressMutation.isPending 
                    ? 'Progressing...' 
                    : `Progress to Finish (${selectedOrders.size})`}
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