
import React, { useMemo } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Factory, Calendar, ArrowRight, Clock, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUnifiedLayupOrders } from '@/hooks/useUnifiedLayupOrders';
import { format, addDays, startOfWeek, eachDayOfInterval, isToday, isPast } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';

export default function LayupPluggingQueuePage() {
  const { orders } = useUnifiedLayupOrders();
  
  // Get current week's layup schedule assignments
  const { data: currentSchedule = [] } = useQuery({
    queryKey: ['/api/layup-schedule'],
  });

  // Get orders queued for barcode department (next department after layup)
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Get molds data for better display
  const { data: molds = [] } = useQuery({
    queryKey: ['/api/molds'],
  });

  // Calculate current week dates (Monday-Friday)
  const currentWeekDates = useMemo(() => {
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
    return eachDayOfInterval({ start, end: addDays(start, 4) }); // Mon-Fri
  }, []);

  // Calculate next week dates
  const nextWeekDates = useMemo(() => {
    const today = new Date();
    const nextWeekStart = addDays(startOfWeek(today, { weekStartsOn: 1 }), 7);
    return eachDayOfInterval({ start: nextWeekStart, end: addDays(nextWeekStart, 4) });
  }, []);

  // Get current week scheduled orders grouped by date
  const currentWeekOrdersByDate = useMemo(() => {
    const weekDateStrings = currentWeekDates.map(date => date.toISOString().split('T')[0]);
    
    const weekOrders = (currentSchedule as any[]).filter((scheduleItem: any) => {
      const scheduledDate = new Date(scheduleItem.scheduledDate).toISOString().split('T')[0];
      return weekDateStrings.includes(scheduledDate);
    }).map((scheduleItem: any) => {
      const order = orders.find((o: any) => o.orderId === scheduleItem.orderId);
      return { ...order, ...scheduleItem };
    }).filter((order: any) => order.orderId);

    // Group orders by date
    const grouped: {[key: string]: any[]} = {};
    currentWeekDates.forEach(date => {
      const dateStr = date.toISOString().split('T')[0];
      grouped[dateStr] = weekOrders.filter(order => {
        const orderDate = new Date(order.scheduledDate).toISOString().split('T')[0];
        return orderDate === dateStr;
      });
    });

    return grouped;
  }, [currentSchedule, orders, currentWeekDates]);

  // Get all current week orders for cards view
  const currentWeekOrders = useMemo(() => {
    return Object.values(currentWeekOrdersByDate).flat();
  }, [currentWeekOrdersByDate]);

  // Calculate next week layup count
  const nextWeekLayupCount = useMemo(() => {
    const nextWeekDateStrings = nextWeekDates.map(date => date.toISOString().split('T')[0]);
    
    return (currentSchedule as any[]).filter((scheduleItem: any) => {
      const scheduledDate = new Date(scheduleItem.scheduledDate).toISOString().split('T')[0];
      return nextWeekDateStrings.includes(scheduledDate);
    }).length;
  }, [currentSchedule, nextWeekDates]);

  // Calculate barcode queue count (orders that completed layup/plugging)
  const barcodeQueueCount = useMemo(() => {
    return (allOrders as any[]).filter((order: any) => 
      order.currentDepartment === 'Barcode' || 
      (order.department === 'Barcode' && order.status === 'IN_PROGRESS')
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Factory className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Layup/Plugging Department Queue</h1>
      </div>
      
      {/* Barcode Scanner at top */}
      <BarcodeScanner />
      
      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

        {/* Current Week Progress */}
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-700 dark:text-orange-300 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              This Week Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {currentWeekOrders.length}
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              Orders in layup queue this week
            </p>
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
      
      {/* Current Week Layup Queue - Day by Day View */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Layup/Plugging Queue - Generated from Scheduler</span>
            <Badge variant="outline" className="ml-2">
              {format(currentWeekDates[0], 'MMM d')} - {format(currentWeekDates[4], 'MMM d')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentWeekOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium mb-2">No Orders Scheduled</h3>
              <p className="text-sm">Use the Layup Scheduler to assign orders to this week</p>
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
                          
                          return (
                            <Card key={order.orderId} className={`border-l-4 ${
                              order.source === 'p1_purchase_order' ? 'border-l-green-500' :
                              order.source === 'production_order' ? 'border-l-orange-500' :
                              'border-l-blue-500'
                            }`}>
                              <CardHeader className="pb-2">
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
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    {materialType && (
                                      <Badge variant="secondary" className="text-xs">
                                        {materialType}
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
