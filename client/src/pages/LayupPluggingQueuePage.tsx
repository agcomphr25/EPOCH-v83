
import React, { useMemo, useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Factory, Calendar, ArrowRight, Package, CheckCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfWeek, eachDayOfInterval, isToday, isPast } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { toast } from 'react-hot-toast';
import { apiRequest } from '@/lib/queryClient';

export default function LayupPluggingQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const queryClient = useQueryClient();
  
  // Get current week's layup schedule assignments
  const { data: currentSchedule = [], isLoading: scheduleLoading } = useQuery({
    queryKey: ['layup-schedule'],
    queryFn: async () => {
      const response = await fetch('/api/layup-schedule');
      if (!response.ok) {
        throw new Error('Failed to fetch layup schedule');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Get all available orders from P1 layup queue
  const { data: availableOrders = [] } = useQuery({
    queryKey: ['/api/p1-layup-queue'],
    queryFn: async () => {
      return await apiRequest('/api/p1-layup-queue');
    },
    refetchInterval: 30000,
  });

  // Get orders queued for barcode department (next department after layup)
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
    queryFn: async () => {
      return await apiRequest('/api/orders/all');
    },
  });

  // Get molds data for better display
  const { data: molds = [] } = useQuery({
    queryKey: ['/api/molds'],
    queryFn: async () => {
      return await apiRequest('/api/molds');
    },
  });

  // Calculate current week dates (Monday-Friday)
  const currentWeekDates = useMemo(() => {
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
    return eachDayOfInterval({ start, end: addDays(start, 4) }); // Mon-Fri
  }, []);

  // Enhanced debugging
  React.useEffect(() => {
    console.log('🔍 LAYUP QUEUE DEBUG:');
    console.log('- Schedule entries:', Array.isArray(currentSchedule) ? currentSchedule.length : 0);
    console.log('- Current week dates:', currentWeekDates.length);
    console.log('- Available orders:', availableOrders.length);
    console.log('- Schedule loading:', scheduleLoading);
    
    if (Array.isArray(currentSchedule) && currentSchedule.length > 0) {
      console.log('- First schedule entry:', currentSchedule[0]);
      console.log('- Sample scheduled dates:', currentSchedule.slice(0, 3).map((s: any) => ({
        orderId: s.orderId,
        scheduledDate: s.scheduledDate,
        dateString: new Date(s.scheduledDate).toISOString().split('T')[0]
      })));
    } else {
      console.log('- No schedule entries found - users need to assign orders in Layup Scheduler first');
      console.log('- Current schedule data:', currentSchedule);
    }
    
    console.log('- Current week date strings:', currentWeekDates.map(d => d.toISOString().split('T')[0]));
  }, [currentSchedule, currentWeekDates, availableOrders, scheduleLoading]);

  // Calculate next week dates
  const nextWeekDates = useMemo(() => {
    const today = new Date();
    const nextWeekStart = addDays(startOfWeek(today, { weekStartsOn: 1 }), 7);
    return eachDayOfInterval({ start: nextWeekStart, end: addDays(nextWeekStart, 4) });
  }, []);

  // Get current week scheduled orders grouped by date
  const currentWeekOrdersByDate = useMemo(() => {
    if (!Array.isArray(currentSchedule) || currentSchedule.length === 0 || !currentWeekDates.length) {
      console.log('🔍 No schedule data available for grouping');
      return {};
    }

    try {
      const weekDateStrings = currentWeekDates.map(date => date.toISOString().split('T')[0]);
      console.log('🔍 Week date strings for filtering:', weekDateStrings);
      
      const weekOrders = currentSchedule.filter((scheduleItem: any) => {
        if (!scheduleItem?.scheduledDate) return false;
        try {
          const scheduledDate = new Date(scheduleItem.scheduledDate).toISOString().split('T')[0];
          const isInWeek = weekDateStrings.includes(scheduledDate);
          if (isInWeek) {
            console.log('🔍 Found schedule item for current week:', {
              orderId: scheduleItem.orderId,
              scheduledDate: scheduledDate,
              originalDate: scheduleItem.scheduledDate
            });
          }
          return isInWeek;
        } catch (dateError) {
          console.warn('🔍 Date parsing error for schedule item:', scheduleItem, dateError);
          return false;
        }
      }).map((scheduleItem: any) => {
        // Find matching order from available orders
        const order = availableOrders.find((o: any) => o.orderId === scheduleItem.orderId);
        if (!order) {
          console.log('🔍 Warning: Schedule item has no matching order, creating basic order:', scheduleItem.orderId);
          // Create a basic order object from schedule data
          return {
            orderId: scheduleItem.orderId,
            scheduledDate: scheduleItem.scheduledDate,
            customer: 'Unknown Customer',
            stockModelId: 'unknown',
            modelId: 'unknown',
            features: {},
            source: 'scheduled_order',
            dueDate: null
          };
        }
        // Merge order data with schedule data
        const mergedOrder = { ...order, scheduledDate: scheduleItem.scheduledDate };
        console.log('🔍 Merged order with schedule:', {
          orderId: mergedOrder.orderId,
          hasFeatures: !!mergedOrder.features,
          hasStockModel: !!mergedOrder.stockModelId,
          scheduledDate: mergedOrder.scheduledDate
        });
        return mergedOrder;
      }).filter((order: any) => order.orderId);

      console.log('🔍 Week orders found:', weekOrders.length);

      // Group orders by date
      const grouped: {[key: string]: any[]} = {};
      currentWeekDates.forEach(date => {
        const dateStr = date.toISOString().split('T')[0];
        grouped[dateStr] = weekOrders.filter(order => {
          try {
            const orderDate = new Date(order.scheduledDate).toISOString().split('T')[0];
            return orderDate === dateStr;
          } catch (dateError) {
            console.warn('🔍 Date parsing error for order:', order, dateError);
            return false;
          }
        });
      });

      console.log('🔍 Grouped orders by date:', grouped);
      return grouped;
    } catch (error) {
      console.error('🔍 Error in currentWeekOrdersByDate calculation:', error);
      return {};
    }
  }, [currentSchedule, availableOrders, currentWeekDates]);

  // Get all current week orders for cards view
  const currentWeekOrders = useMemo(() => {
    return Object.values(currentWeekOrdersByDate).flat();
  }, [currentWeekOrdersByDate]);

  // Calculate next week layup count
  const nextWeekLayupCount = useMemo(() => {
    if (!Array.isArray(currentSchedule) || !nextWeekDates.length) {
      return 0;
    }

    try {
      const nextWeekDateStrings = nextWeekDates.map(date => date.toISOString().split('T')[0]);
      console.log('🔍 Next week date strings:', nextWeekDateStrings);
      
      const nextWeekOrders = currentSchedule.filter((scheduleItem: any) => {
        if (!scheduleItem?.scheduledDate) return false;
        try {
          const scheduledDate = new Date(scheduleItem.scheduledDate).toISOString().split('T')[0];
          const isNextWeek = nextWeekDateStrings.includes(scheduledDate);
          if (isNextWeek) {
            console.log('🔍 Found next week order:', scheduleItem.orderId, scheduledDate);
          }
          return isNextWeek;
        } catch (dateError) {
          console.warn('🔍 Date parsing error for next week calculation:', scheduleItem, dateError);
          return false;
        }
      });

      console.log('🔍 Next week layup count:', nextWeekOrders.length);
      return nextWeekOrders.length;
    } catch (error) {
      console.error('🔍 Error calculating next week layup count:', error);
      return 0;
    }
  }, [currentSchedule, nextWeekDates]);

  // Calculate barcode queue count (orders that completed layup/plugging)
  const barcodeQueueCount = useMemo(() => {
    if (!Array.isArray(allOrders)) {
      return 0;
    }
    try {
      return allOrders.filter((order: any) => 
        order?.currentDepartment === 'Barcode' || 
        (order?.department === 'Barcode' && order?.status === 'IN_PROGRESS')
      ).length;
    } catch (error) {
      console.error('🔍 Error calculating barcode queue count:', error);
      return 0;
    }
  }, [allOrders]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: async () => {
      return await apiRequest('/api/stock-models');
    },
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = (stockModels as any[]).find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Handle order selection
  const handleOrderSelect = (orderId: string, checked: boolean) => {
    if (checked) {
      setSelectedOrders(prev => [...prev, orderId]);
    } else {
      setSelectedOrders(prev => prev.filter(id => id !== orderId));
    }
  };

  // Handle moving orders to next department
  const moveToDepartmentMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      return await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: {
          orderIds,
          department: 'Barcode',
          status: 'IN_PROGRESS'
        }
      });
    },
    onSuccess: () => {
      toast.success(`Successfully moved ${selectedOrders.length} orders to Barcode Department`);
      setSelectedOrders([]);
      queryClient.invalidateQueries({ queryKey: ['layup-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error) => {
      console.error('Error moving orders:', error);
      toast.error('Failed to move orders to next department');
    }
  });

  const handleMoveToNextDepartment = () => {
    if (selectedOrders.length === 0) {
      toast.error('Please select orders to move');
      return;
    }
    moveToDepartmentMutation.mutate(selectedOrders);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Factory className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Layup/Plugging Department Queue</h1>
      </div>
      
      {/* Barcode Scanner at top */}
      <BarcodeScanner />
      
      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Next Week Layup Count - Left Corner as requested */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Next Week Layup Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {nextWeekLayupCount}
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Orders scheduled for {format(nextWeekDates[0], 'MMM d')} - {format(nextWeekDates[4], 'MMM d')}
            </p>
            <div className="text-xs text-blue-500 mt-2">
              Generated from Layup Scheduler
            </div>
          </CardContent>
        </Card>



        {/* Barcode Queue Count */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Next: Barcode Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {barcodeQueueCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders ready for barcode processing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Multi-select Actions */}
      {selectedOrders.length > 0 && (
        <Card className="mb-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-blue-800 dark:text-blue-200">
                  {selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedOrders([])}
                  disabled={moveToDepartmentMutation.isPending}
                >
                  Clear Selection
                </Button>
                <Button
                  size="sm"
                  onClick={handleMoveToNextDepartment}
                  disabled={moveToDepartmentMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                >
                  {moveToDepartmentMutation.isPending ? 'Moving...' : 'Move to Barcode Department'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Current Week Layup Queue - Day by Day View */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>Layup/Plugging Queue - Generated from Scheduler</span>
            <div className="flex items-center gap-2">
              {currentWeekOrders.length > 0 && (
                <div className="flex items-center gap-2 mr-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedOrders(currentWeekOrders.map(o => o.orderId))}
                    disabled={selectedOrders.length === currentWeekOrders.length}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedOrders([])}
                    disabled={selectedOrders.length === 0}
                  >
                    Select None
                  </Button>
                </div>
              )}
              <Badge variant="outline">
                {format(currentWeekDates[0], 'MMM d')} - {format(currentWeekDates[4], 'MMM d')}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentWeekOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-medium mb-2">No Orders in Queue</h3>
              <p className="text-sm">Orders from the Layup Scheduler will appear here automatically</p>
              <p className="text-xs text-gray-400 mt-2">Go to Production Scheduling → Layup Scheduler to assign orders</p>
              {scheduleLoading && (
                <p className="text-xs text-blue-500 mt-2">Loading schedule data...</p>
              )}
              <div className="text-xs text-gray-400 mt-4 space-y-1">
                <p>Debug Info:</p>
                <p>Schedule entries: {(currentSchedule as any[]).length}</p>
                <p>Available orders: {availableOrders.length}</p>
                <p>Current week orders: {currentWeekOrders.length}</p>
                <p>Schedule loading: {scheduleLoading ? 'Yes' : 'No'}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {currentWeekDates.map(date => {
                const dateStr = date.toISOString().split('T')[0];
                const dayOrders = currentWeekOrdersByDate[dateStr] || [];
                const dayName = format(date, 'EEEE');
                const dateDisplay = format(date, 'MMM d');
                const isCurrentDay = isToday(date);
                const isPastDay = isPast(date) && !isToday(date);
                
                return (
                  <div key={dateStr} className={`border rounded-lg p-4 ${
                    isCurrentDay ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200' : 
                    isPastDay ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200' : 
                    'bg-white dark:bg-gray-900 border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`font-semibold text-lg ${
                        isCurrentDay ? 'text-blue-700' : isPastDay ? 'text-gray-500' : 'text-gray-900'
                      }`}>
                        {dayName}, {dateDisplay}
                        {isCurrentDay && <span className="ml-2 text-sm font-normal">(Today)</span>}
                      </h3>
                      <Badge variant={dayOrders.length > 0 ? 'default' : 'secondary'}>
                        {dayOrders.length} orders
                      </Badge>
                    </div>
                    
                    {dayOrders.length === 0 ? (
                      <div className="text-center py-4 text-gray-400">
                        No orders scheduled for this day
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {dayOrders.map((order: any) => {
                          const modelId = order.stockModelId || order.modelId;
                          const materialType = modelId?.includes('cf_') ? 'CF' : 
                                             modelId?.includes('fg_') ? 'FG' : null;
                          const isSelected = selectedOrders.includes(order.orderId);
                          
                          // Heavy Fill detection
                          const hasHeavyFill = order.features?.other_options && 
                            Array.isArray(order.features.other_options) && 
                            order.features.other_options.includes('heavy_fill');
                          
                          // Action Length for APR orders  
                          const actionLength = order.features?.action_length;
                          const actionAbbr = actionLength === 'long' ? 'LA' : 
                                           actionLength === 'medium' ? 'MA' : 
                                           actionLength === 'short' ? 'SA' : null;
                          
                          return (
                            <Card key={order.orderId} className={`relative border-l-4 transition-all ${
                              order.source === 'p1_purchase_order' ? 'border-l-green-500' :
                              order.source === 'production_order' ? 'border-l-orange-500' :
                              'border-l-blue-500'
                            } ${isSelected ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                              {/* Checkbox in top-right corner */}
                              <div className="absolute top-3 right-3 z-10">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => handleOrderSelect(order.orderId, !!checked)}
                                  className="bg-white dark:bg-gray-800 border-2 shadow-sm"
                                />
                              </div>
                              
                              <CardHeader className="pb-2 pr-8">
                                <div className="flex justify-between items-start">
                                  <div className="font-semibold">
                                    {getDisplayOrderId(order)}
                                    {order.source === 'p1_purchase_order' && (
                                      <Badge variant="secondary" className="ml-2 text-xs bg-green-100 text-green-800">P1</Badge>
                                    )}
                                    {order.source === 'production_order' && (
                                      <Badge variant="secondary" className="ml-2 text-xs bg-orange-100 text-orange-800">PO</Badge>
                                    )}
                                  </div>
                                </div>
                                {actionAbbr && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {actionAbbr}
                                  </div>
                                )}
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {materialType && (
                                      <Badge variant="secondary" className="text-xs">
                                        {materialType}
                                      </Badge>
                                    )}
                                    {hasHeavyFill && (
                                      <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
                                        Heavy Fill
                                      </Badge>
                                    )}
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {getModelDisplayName(modelId)}
                                    </span>
                                  </div>
                                  
                                  {order.moldId && (
                                    <div className="text-xs text-gray-500">
                                      Mold: {order.moldId}
                                    </div>
                                  )}
                                  
                                  {order.customer && (
                                    <div className="text-xs text-gray-500">
                                      Customer: {order.customer}
                                    </div>
                                  )}
                                  
                                  {order.dueDate && (
                                    <div className="text-xs text-gray-500">
                                      Due: {format(new Date(order.dueDate), 'MMM d, yyyy')}
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
