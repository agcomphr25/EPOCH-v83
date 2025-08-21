import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Paintbrush, ArrowLeft, ArrowRight, Users, ArrowUp, CheckSquare, Square, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';

export default function FinishQueuePage() {
  // Multi-select state
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const queryClient = useQueryClient();

  // Finish technicians list
  const finishTechnicians = [
    'Tomas',
    'AG',
    'Timmy'
  ];

  // Get all orders from production pipeline
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get orders in Finish department
  const finishOrders = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Finish'
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

    for (const order of finishOrders) {
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
  }, [finishOrders]);

  // Count orders in previous department (CNC)
  const cncCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'CNC'
    ).length;
  }, [allOrders]);

  // Count orders in next department (Finish QC)
  const finishQCCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Finish QC'
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
    if (selectedOrders.size === finishOrders.length) {
      setSelectedOrders(new Set());
      setSelectAll(false);
    } else {
      setSelectedOrders(new Set(finishOrders.map((order: any) => order.orderId)));
      setSelectAll(true);
    }
  };

  const handleClearSelection = () => {
    setSelectedOrders(new Set());
    setSelectAll(false);
  };

  // Move orders to Finish QC with technician assignment
  const moveToFinishQCMutation = useMutation({
    mutationFn: async ({ orderIds, technician }: { orderIds: string[], technician: string }) => {
      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify({
          orderIds: orderIds,
          department: 'Finish QC',
          status: 'IN_PROGRESS',
          assignedTechnician: technician
        })
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department', 'Finish QC'] });
      toast.success(`${selectedOrders.size} orders moved to Finish QC (${selectedTechnician})`);
      setSelectedOrders(new Set());
      setSelectAll(false);
      setSelectedTechnician('');
    },
    onError: () => {
      toast.error("Failed to move orders to Finish QC");
    }
  });

  // Move orders directly to Paint (skip Finish QC)
  const moveToPaintMutation = useMutation({
    mutationFn: async ({ orderIds }: { orderIds: string[] }) => {
      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify({
          orderIds: orderIds,
          department: 'Paint',
          status: 'IN_PROGRESS'
        })
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/department', 'Paint'] });
      toast.success(`${selectedOrders.size} orders moved to Paint`);
      setSelectedOrders(new Set());
      setSelectAll(false);
    },
    onError: () => {
      toast.error("Failed to move orders to Paint");
    }
  });

  const handleMoveToFinishQC = () => {
    if (selectedOrders.size === 0) {
      toast.error('Please select orders to move');
      return;
    }
    if (!selectedTechnician) {
      toast.error('Please select a technician');
      return;
    }
    moveToFinishQCMutation.mutate({ 
      orderIds: Array.from(selectedOrders), 
      technician: selectedTechnician 
    });
  };

  const handleMoveToPaint = () => {
    if (selectedOrders.size === 0) {
      toast.error('Please select orders to move');
      return;
    }
    moveToPaintMutation.mutate({ 
      orderIds: Array.from(selectedOrders)
    });
  };

  // Auto-select order when scanned
  const handleOrderScanned = (orderId: string) => {
    // Check if the order exists in the current queue
    const orderExists = finishOrders.some((order: any) => order.orderId === orderId);
    if (orderExists) {
      setSelectedOrders(prev => new Set([...prev, orderId]));
      toast.success(`Order ${orderId} selected automatically`);
    } else {
      toast.error(`Order ${orderId} is not in the Finish department`);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Paintbrush className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Finish Department Manager</h1>
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
              Finish QC
              <ArrowRight className="h-5 w-5" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {finishQCCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders in next department
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current Finish Orders */}
      <Card>
        <CardHeader className="bg-blue-50 dark:bg-blue-900/20">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paintbrush className="h-5 w-5 text-blue-600" />
              <span>Finish Orders</span>
              <Badge variant="outline" className="ml-2 border-blue-300">
                {finishOrders.length} Orders
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              {/* Technician Selection */}
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-600" />
                <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select Technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {finishTechnicians.map((tech) => (
                      <SelectItem key={tech} value={tech}>
                        {tech}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Multi-select Controls */}
              {finishOrders.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    className="flex items-center gap-2"
                  >
                    {selectedOrders.size === finishOrders.length ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    {selectedOrders.size === finishOrders.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  
                  {selectedOrders.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearSelection}
                    >
                      Clear ({selectedOrders.size})
                    </Button>
                  )}

                  {selectedOrders.size > 0 && (
                    <div className="flex items-center gap-2">
                      {selectedTechnician && (
                        <Button
                          onClick={handleMoveToFinishQC}
                          disabled={moveToFinishQCMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700"
                          size="sm"
                        >
                          <ArrowRight className="h-4 w-4 mr-1" />
                          Move to Finish QC ({selectedOrders.size})
                        </Button>
                      )}
                      
                      <Button
                        onClick={handleMoveToPaint}
                        disabled={moveToPaintMutation.isPending}
                        className="bg-purple-600 hover:bg-purple-700"
                        size="sm"
                      >
                        <Paintbrush className="h-4 w-4 mr-1" />
                        Skip to Paint ({selectedOrders.size})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardTitle>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
            Assigned to {selectedTechnician || 'No technician selected'} • Select orders and route to next department
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {finishOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No orders currently in Finish department
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
                            {order.isPaid && (
                              <Badge variant="secondary" className="text-xs">
                                PAID
                              </Badge>
                            )}
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
                            {order.isPaid && (
                              <Badge variant="secondary" className="text-xs">
                                PAID
                              </Badge>
                            )}
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
                            {order.isPaid && (
                              <Badge variant="secondary" className="text-xs">
                                PAID
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Due This Week - Normal Priority */}
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
                            {order.isPaid && (
                              <Badge variant="secondary" className="text-xs">
                                PAID
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Due Next Week - Lower Priority */}
              {categorizedOrders.dueNextWeek.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-green-600 dark:text-green-400">
                      📋 Due Next Week ({categorizedOrders.dueNextWeek.length})
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
                            {order.isPaid && (
                              <Badge variant="secondary" className="text-xs">
                                PAID
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Future Due - Lowest Priority */}
              {categorizedOrders.futureDue.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                      📆 Future Orders ({categorizedOrders.futureDue.length})
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
                            ? 'bg-gray-100 dark:bg-gray-800/40 border-gray-400 dark:border-gray-600 ring-2 ring-gray-300 dark:ring-gray-700' 
                            : 'bg-gray-50 dark:bg-gray-900/20 border-gray-300 dark:border-gray-700'
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
                            {order.isPaid && (
                              <Badge variant="secondary" className="text-xs">
                                PAID
                              </Badge>
                            )}
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
                    <h3 className="text-lg font-semibold text-gray-500 dark:text-gray-400">
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
                            {order.isPaid && (
                              <Badge variant="secondary" className="text-xs">
                                PAID
                              </Badge>
                            )}
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
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-800 dark:text-green-200">
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
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {progressMutation.isPending 
                    ? 'Progressing...' 
                    : `Progress to Finish QC (${selectedOrders.size})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}