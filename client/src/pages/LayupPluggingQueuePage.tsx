
import React, { useMemo } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Factory, Calendar, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUnifiedLayupOrders } from '@/hooks/useUnifiedLayupOrders';
import { format, addDays, startOfWeek, eachDayOfInterval } from 'date-fns';
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

  // Get current week scheduled orders
  const currentWeekOrders = useMemo(() => {
    const weekDateStrings = currentWeekDates.map(date => date.toISOString().split('T')[0]);
    
    return currentSchedule.filter((scheduleItem: any) => {
      const scheduledDate = new Date(scheduleItem.scheduledDate).toISOString().split('T')[0];
      return weekDateStrings.includes(scheduledDate);
    }).map((scheduleItem: any) => {
      const order = orders.find(o => o.orderId === scheduleItem.orderId);
      return { ...order, ...scheduleItem };
    }).filter(order => order.orderId);
  }, [currentSchedule, orders, currentWeekDates]);

  // Calculate next week layup count
  const nextWeekLayupCount = useMemo(() => {
    const nextWeekDateStrings = nextWeekDates.map(date => date.toISOString().split('T')[0]);
    
    return currentSchedule.filter((scheduleItem: any) => {
      const scheduledDate = new Date(scheduleItem.scheduledDate).toISOString().split('T')[0];
      return nextWeekDateStrings.includes(scheduledDate);
    }).length;
  }, [currentSchedule, nextWeekDates]);

  // Calculate barcode queue count (orders that completed layup/plugging)
  const barcodeQueueCount = useMemo(() => {
    return allOrders.filter((order: any) => 
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
    const model = stockModels.find((m: any) => m.id === modelId);
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Next Week Layup Count */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Next Week Layup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {nextWeekLayupCount}
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Orders scheduled for {format(nextWeekDates[0], 'MMM d')} - {format(nextWeekDates[4], 'MMM d')}
            </p>
          </CardContent>
        </Card>

        {/* Barcode Queue Count */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Barcode Queue
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
      
      {/* Current Week Layup Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Current Week Layup Schedule</span>
            <Badge variant="outline" className="ml-2">
              {format(currentWeekDates[0], 'MMM d')} - {format(currentWeekDates[4], 'MMM d')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentWeekOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No orders scheduled for this week
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {currentWeekOrders.map((order: any) => {
                const scheduledDate = new Date(order.scheduledDate);
                const modelId = order.stockModelId || order.modelId;
                const materialType = modelId?.startsWith('cf_') ? 'CF' : 
                                   modelId?.startsWith('fg_') ? 'FG' : null;
                
                return (
                  <Card key={order.orderId} className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div className="font-semibold text-lg">
                          {getDisplayOrderId(order)}
                          {order.source === 'p1_purchase_order' && (
                            <Badge variant="secondary" className="ml-2 text-xs">P1</Badge>
                          )}
                          {order.source === 'production_order' && (
                            <Badge variant="secondary" className="ml-2 text-xs">PO</Badge>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {format(scheduledDate, 'MMM d')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
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
        </CardContent>
      </Card>
    </div>
  );
}
