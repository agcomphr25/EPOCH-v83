
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
import { useUnifiedLayupOrders } from '@/hooks/useUnifiedLayupOrders';
import { identifyLOPOrders, scheduleLOPAdjustments, getLOPStatus } from '@/utils/lopScheduler';

// Queue Order Item Component - simplified version of DraggableOrderItem for display only
function QueueOrderItem({ order, getModelDisplayName, processedOrders }: { 
  order: any, 
  getModelDisplayName?: (modelId: string) => string, 
  processedOrders?: any[] 
}) {
  // Determine material type for styling
  const getMaterialType = (modelId: string) => {
    if (modelId.startsWith('cf_')) return 'CF';
    if (modelId.startsWith('fg_')) return 'FG';
    if (modelId.includes('carbon')) return 'CF';
    if (modelId.includes('fiberglass')) return 'FG';
    return null;
  };
  
  const modelId = order.stockModelId || order.modelId;
  const materialType = getMaterialType(modelId || '');
  
  // Determine card styling based on source and material
  const getCardStyling = () => {
    if (order.source === 'p1_purchase_order') {
      return {
        bg: 'bg-green-100 dark:bg-green-800/50 hover:bg-green-200 dark:hover:bg-green-800/70 border-2 border-green-300 dark:border-green-600',
        text: 'text-green-800 dark:text-green-200'
      };
    } else if (order.source === 'production_order') {
      return {
        bg: 'bg-orange-100 dark:bg-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-800/70 border-2 border-orange-300 dark:border-orange-600',
        text: 'text-orange-800 dark:text-orange-200'
      };
    } else if (materialType === 'FG') {
      return {
        bg: 'bg-blue-600 dark:bg-blue-900/70 hover:bg-blue-700 dark:hover:bg-blue-900/90 border-2 border-blue-700 dark:border-blue-800',
        text: 'text-white dark:text-blue-100'
      };
    } else {
      return {
        bg: 'bg-blue-100 dark:bg-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-800/70 border-2 border-blue-300 dark:border-blue-600',
        text: 'text-blue-800 dark:text-blue-200'
      };
    }
  };
  
  const cardStyling = getCardStyling();

  return (
    <div className={`p-3 mb-2 min-h-[3rem] ${cardStyling.bg} rounded-lg shadow-md transition-all duration-200`}>
      <div className={`${cardStyling.text} text-base font-bold text-center flex flex-col items-center justify-center h-full`}>
        <div className="flex items-center font-bold">
          {getDisplayOrderId(order) || 'No ID'}
          {order.source === 'p1_purchase_order' && <span className="text-xs ml-1 bg-green-200 dark:bg-green-700 px-1 rounded">P1</span>}
          {order.source === 'production_order' && <span className="text-xs ml-1 bg-orange-200 dark:bg-orange-700 px-1 rounded">PO</span>}
        </div>
        
        {/* Show stock model display name with material type */}
        {(() => {
          if (!getModelDisplayName || !modelId) return null;
          
          const displayName = getModelDisplayName(modelId);
          
          return (
            <div className="text-xs opacity-80 mt-0.5 font-medium">
              {materialType && <span className="bg-gray-200 dark:bg-gray-600 px-1 rounded mr-1 text-xs font-bold">{materialType}</span>}
              {displayName}
            </div>
          );
        })()}
        
        {/* Show Action Length Display */}
        {(() => {
          const modelId = order.stockModelId || order.modelId;
          const isAPR = modelId && modelId.toLowerCase().includes('apr');
          
          // For APR orders, show both action type AND action length
          if (isAPR) {
            const getAPRActionDisplay = (orderFeatures: any) => {
              if (!orderFeatures) return null;
              
              let actionType = orderFeatures.action_inlet;
              if (!actionType) {
                actionType = orderFeatures.action;
              }
              
              let actionLength = orderFeatures.action_length;
              if (!actionLength || actionLength === 'none') {
                if (actionType && actionType.includes('short')) actionLength = 'SA';
                else if (actionType && actionType.includes('long')) actionLength = 'LA';
                else actionLength = 'SA';
              }
              
              const lengthMap: {[key: string]: string} = {
                'Long': 'LA', 'Medium': 'MA', 'Short': 'SA',
                'long': 'LA', 'medium': 'MA', 'short': 'SA',
                'LA': 'LA', 'MA': 'MA', 'SA': 'SA'
              };
              
              const actionLengthAbbr = lengthMap[actionLength] || actionLength;
              
              if (!actionType || actionType === 'none') {
                return actionLengthAbbr;
              }
              
              const actionMap: {[key: string]: string} = {
                'anti_ten_hunter_def': 'Anti-X Hunter',
                'apr': 'APR',
                'rem_700': 'Rem 700',
                'tikka': 'Tikka',
                'savage': 'Savage'
              };
              
              const actionDisplay = actionMap[actionType] || actionType.replace(/_/g, ' ').toUpperCase();
              
              return `${actionLengthAbbr} ${actionDisplay}`;
            };
            
            const aprActionDisplay = getAPRActionDisplay(order.features);
            
            return aprActionDisplay ? (
              <div className="text-xs opacity-80 mt-0.5 font-medium">
                {aprActionDisplay}
              </div>
            ) : null;
          }
          
          // For non-APR orders, show action length
          const getActionInletDisplayNonAPR = (orderFeatures: any) => {
            if (!orderFeatures) return null;
            
            let actionLengthValue = orderFeatures.action_length;
            
            if ((!actionLengthValue || actionLengthValue === 'none') && orderFeatures.action_inlet) {
              const actionInlet = orderFeatures.action_inlet;
              
              const inletToLengthMap: {[key: string]: string} = {
                'anti_ten_hunter_def': 'SA',
                'remington_700': 'SA',
                'remington_700_long': 'LA',
                'rem_700': 'SA',
                'rem_700_short': 'SA',
                'rem_700_long': 'LA', 
                'tikka_t3': 'SA',
                'tikka_short': 'SA',
                'tikka_long': 'LA',
                'savage_short': 'SA',
                'savage_long': 'LA',
                'savage_110': 'LA',
                'winchester_70': 'LA',
                'howa_1500': 'SA',
                'bergara_b14': 'SA',
                'carbon_six_medium': 'MA'
              };
              
              actionLengthValue = inletToLengthMap[actionInlet] || 'SA';
            }
            
            if (!actionLengthValue || actionLengthValue === 'none') return null;
            
            const displayMap: {[key: string]: string} = {
              'Long': 'LA', 'Medium': 'MA', 'Short': 'SA',
              'long': 'LA', 'medium': 'MA', 'short': 'SA',
              'LA': 'LA', 'MA': 'MA', 'SA': 'SA'
            };
            
            return displayMap[actionLengthValue] || actionLengthValue;
          };
          
          const actionInletDisplayNonAPR = getActionInletDisplayNonAPR(order.features);
          
          return actionInletDisplayNonAPR ? (
            <div className="text-xs opacity-80 mt-0.5 font-medium">
              {actionInletDisplayNonAPR}
            </div>
          ) : null;
        })()}

        {/* Show LOP Adjustment Status */}
        {(() => {
          const lopOrder = processedOrders?.find(o => o.orderId === order.orderId) || identifyLOPOrders([order])[0];
          const lopStatus = getLOPStatus(lopOrder);
          
          if (lopStatus.status === 'none') return null;
          
          return (
            <div className="text-xs mt-1">
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                lopStatus.status === 'scheduled' 
                  ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  : lopStatus.status === 'scheduled'
                  ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                  : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
              }`}>
                {lopStatus.status === 'scheduled' && '📅 '}
                {lopStatus.status === 'deferred' && '⏰ '}
                LOP {lopStatus.status.toUpperCase()}
              </span>
            </div>
          );
        })()}
        
        {/* Show Heavy Fill if selected */}
        {(() => {
          const getHeavyFillDisplay = (orderFeatures: any) => {
            if (!orderFeatures) return null;
            
            const otherOptions = orderFeatures.other_options;
            if (Array.isArray(otherOptions) && otherOptions.includes('heavy_fill')) {
              return 'Heavy Fill';
            }
            
            const heavyFillValue = orderFeatures.heavy_fill || 
                                   orderFeatures.heavyFill || 
                                   orderFeatures.heavy_fill_option ||
                                   orderFeatures['heavy-fill'];
            
            if (heavyFillValue === 'true' || 
                heavyFillValue === true || 
                heavyFillValue === 'yes' ||
                heavyFillValue === 'heavy_fill') {
              return 'Heavy Fill';
            }
            
            return null;
          };
          
          const heavyFillDisplay = getHeavyFillDisplay(order.features);
          
          return heavyFillDisplay ? (
            <div className="text-xs mt-0.5">
              <span className="bg-orange-200 dark:bg-orange-700 px-1 rounded text-xs font-bold">
                {heavyFillDisplay}
              </span>
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
}

export default function LayupPluggingQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0); // 0 = current week, 1 = next week, -1 = previous week
  const queryClient = useQueryClient();
  
  // Calculate week info first  
  const weekInfo = useMemo(() => {
    const today = new Date();
    const baseStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekStart = addDays(baseStart, currentWeekOffset * 7);
    const weekEnd = addDays(weekStart, 4);
    
    const getWeekLabel = () => {
      if (currentWeekOffset === 0) return 'Current Week';
      if (currentWeekOffset === 1) return 'Next Week';
      if (currentWeekOffset === -1) return 'Previous Week';
      return `${currentWeekOffset > 0 ? '+' : ''}${currentWeekOffset} weeks`;
    };

    return {
      label: getWeekLabel(),
      start: weekStart,
      end: weekEnd,
      dateRange: `${format(weekStart, 'MMM dd')} - ${format(weekEnd, 'MMM dd, yyyy')}`
    };
  }, [currentWeekOffset]);
  
  // Get layup schedule assignments filtered by selected week
  const { data: currentSchedule = [], isLoading: scheduleLoading } = useQuery({
    queryKey: ['layup-schedule', currentWeekOffset],
    queryFn: async () => {
      const response = await fetch(`/api/layup-schedule?weekStart=${weekInfo.start.toISOString()}&weekEnd=${weekInfo.end.toISOString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch layup schedule');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Get ALL orders to find details for scheduled orders
  const { orders: availableOrders, loading: ordersLoading } = useUnifiedLayupOrders();
  
  // Build processed orders from the SCHEDULE, not the raw queue
  const processedOrders = useMemo(() => {
    if (!currentSchedule || currentSchedule.length === 0 || availableOrders.length === 0) return [];
    
    // Map scheduled orders to their full order details
    const scheduledOrdersWithDetails = currentSchedule.map((scheduleEntry: any) => {
      const orderDetails = availableOrders.find((order: any) => order.orderId === scheduleEntry.orderId);
      if (!orderDetails) {
        console.warn(`⚠️ Scheduled order ${scheduleEntry.orderId} not found in available orders`);
        return null;
      }
      
      return {
        ...orderDetails,
        scheduledDate: scheduleEntry.scheduledDate,
        moldId: scheduleEntry.moldId,
        employeeId: scheduleEntry.employeeId,
        scheduleId: scheduleEntry.id
      };
    }).filter(Boolean);
    
    console.log(`📋 Department Manager: Found ${scheduledOrdersWithDetails.length} scheduled orders out of ${currentSchedule.length} schedule entries`);
    return scheduledOrdersWithDetails;
  }, [currentSchedule, availableOrders]);

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

  // Calculate week dates based on current offset (Monday-Friday)
  const currentWeekDates = useMemo(() => {
    const today = new Date();
    const baseStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
    const start = addDays(baseStart, currentWeekOffset * 7); // Offset by weeks
    return eachDayOfInterval({ start, end: addDays(start, 4) }); // Mon-Fri
  }, [currentWeekOffset]);



  // Display orders exactly as scheduled in the layup scheduler
  const currentWeekOrdersByDate = useMemo(() => {
    if (!Array.isArray(currentSchedule) || currentSchedule.length === 0 || !currentWeekDates.length) {
      console.log('🔍 No schedule data available - showing unscheduled orders. Schedule length:', (currentSchedule as any[]).length);
      
      // If no schedule data, return empty - Department Manager only shows SCHEDULED orders
      console.log('📋 No orders scheduled yet. Use Layup Scheduler to schedule orders first.');
      return {};
    }

    try {
      const weekDateStrings = currentWeekDates.map(date => date.toISOString().split('T')[0]);
      console.log('🔍 Week date strings for filtering:', weekDateStrings);
      console.log('🔍 Total schedule entries to process:', currentSchedule.length);
      
      // Process all schedule entries for current week - use actual scheduled dates
      const weekOrders = currentSchedule.map((scheduleItem: any) => {
        if (!scheduleItem?.scheduledDate || !scheduleItem?.orderId) {
          console.log('🔍 Invalid schedule item:', scheduleItem);
          return null;
        }

        try {
          const scheduledDate = new Date(scheduleItem.scheduledDate).toISOString().split('T')[0];
          const isInWeek = weekDateStrings.includes(scheduledDate);
          
          if (!isInWeek) {
            return null; // Not in current week
          }

          console.log('🔍 Processing schedule item for current week:', {
            orderId: scheduleItem.orderId,
            scheduledDate: scheduledDate,
            originalDate: scheduleItem.scheduledDate
          });

          // Find matching order from processed orders (includes LOP processing)
          const matchingOrder = processedOrders.find((o: any) => o.orderId === scheduleItem.orderId);
          
          if (matchingOrder) {
            // Use the full processed order data with exact schedule date
            const mergedOrder = { 
              ...matchingOrder, 
              scheduledDate: scheduleItem.scheduledDate,
              source: matchingOrder.source || 'main_orders'
            };
            console.log('🔍 Found matching processed order:', {
              orderId: mergedOrder.orderId,
              hasFeatures: !!mergedOrder.features,
              stockModelId: mergedOrder.stockModelId,
              source: mergedOrder.source,
              hasLOPProcessing: !!mergedOrder.needsLOPAdjustment
            });
            return mergedOrder;
          } else {
            // Fallback to original available orders
            const fallbackOrder = availableOrders.find((o: any) => o.orderId === scheduleItem.orderId);
            if (fallbackOrder) {
              return { 
                ...fallbackOrder, 
                scheduledDate: scheduleItem.scheduledDate,
                source: fallbackOrder.source || 'main_orders'
              };
            }
            
            // Create a minimal order from schedule data if no match found
            console.log('🔍 No matching order found, creating minimal order for:', scheduleItem.orderId);
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
        } catch (dateError) {
          console.warn('🔍 Date parsing error for schedule item:', scheduleItem, dateError);
          return null;
        }
      }).filter((order: any) => order !== null);

      console.log('🔍 Processed week orders:', weekOrders.length);

      // Group orders by date
      const grouped: {[key: string]: any[]} = {};
      currentWeekDates.forEach(date => {
        const dateStr = date.toISOString().split('T')[0];
        grouped[dateStr] = [];
      });

      // Distribute orders into date groups
      weekOrders.forEach(order => {
        try {
          const orderDate = new Date(order.scheduledDate).toISOString().split('T')[0];
          if (grouped[orderDate]) {
            grouped[orderDate].push(order);
          }
        } catch (dateError) {
          console.warn('🔍 Date parsing error for grouping:', order, dateError);
        }
      });

      console.log('🔍 Final grouped orders by date:', Object.entries(grouped).map(([date, orders]) => ({
        date,
        count: orders.length,
        orderIds: orders.map(o => o.orderId)
      })));
      
      return grouped;
    } catch (error) {
      console.error('🔍 Error in currentWeekOrdersByDate calculation:', error);
      return {};
    }
  }, [currentSchedule, processedOrders, availableOrders, currentWeekDates]);

  // Get all current week orders for cards view
  const currentWeekOrders = useMemo(() => {
    return Object.values(currentWeekOrdersByDate).flat();
  }, [currentWeekOrdersByDate]);

  // Enhanced debugging
  React.useEffect(() => {
    console.log('🔍 LAYUP QUEUE TRANSFER DEBUG:');
    console.log('- Schedule entries:', Array.isArray(currentSchedule) ? currentSchedule.length : 0);
    console.log('- Current week dates:', currentWeekDates.length);
    console.log('- Available orders (raw):', availableOrders.length);
    console.log('- Processed orders (with LOP):', processedOrders.length);
    console.log('- Schedule loading:', scheduleLoading);
    console.log('- Orders loading:', ordersLoading);
    console.log('- Current week orders calculated:', currentWeekOrders.length);
    
    if (Array.isArray(currentSchedule) && currentSchedule.length > 0) {
      console.log('- Schedule entries sample:', currentSchedule.slice(0, 5).map((s: any) => ({
        orderId: s.orderId,
        scheduledDate: s.scheduledDate,
        dateString: new Date(s.scheduledDate).toISOString().split('T')[0]
      })));
      
      console.log('- All scheduled order IDs:', currentSchedule.map((s: any) => s.orderId));
    } else {
      console.log('- No schedule entries found - users need to assign orders in Layup Scheduler first');
      console.log('- Current schedule data type:', typeof currentSchedule);
      console.log('- Current schedule value:', currentSchedule);
    }
    
    console.log('- Current week date strings:', currentWeekDates.map(d => d.toISOString().split('T')[0]));
    
    if (availableOrders.length > 0) {
      console.log('- Available orders sample:', availableOrders.slice(0, 3).map((o: any) => ({
        orderId: o.orderId,
        source: o.source,
        stockModelId: o.stockModelId
      })));
    }
    
    if (processedOrders.length > 0) {
      console.log('- Processed orders sample:', processedOrders.slice(0, 3).map((o: any) => ({
        orderId: o.orderId,
        source: o.source,
        stockModelId: o.stockModelId,
        needsLOPAdjustment: o.needsLOPAdjustment
      })));
    }
    
    console.log('- Orders by date breakdown:', Object.entries(currentWeekOrdersByDate).map(([date, orders]) => ({
      date,
      count: orders.length,
      orderIds: orders.map((o: any) => o.orderId)
    })));
  }, [currentSchedule, currentWeekDates, availableOrders, processedOrders, scheduleLoading, ordersLoading, currentWeekOrders, currentWeekOrdersByDate]);

  // Calculate next week layup count (relative to currently viewed week)
  const nextWeekLayupCount = useMemo(() => {
    if (!Array.isArray(currentSchedule)) {
      return 0;
    }

    try {
      const today = new Date();
      const baseStart = startOfWeek(today, { weekStartsOn: 1 });
      const nextWeekStart = addDays(baseStart, (currentWeekOffset + 1) * 7);
      const nextWeekDates = eachDayOfInterval({ start: nextWeekStart, end: addDays(nextWeekStart, 4) });
      const nextWeekDateStrings = nextWeekDates.map(date => date.toISOString().split('T')[0]);
      
      const nextWeekOrders = currentSchedule.filter((scheduleItem: any) => {
        if (!scheduleItem?.scheduledDate) return false;
        try {
          const scheduledDate = new Date(scheduleItem.scheduledDate).toISOString().split('T')[0];
          return nextWeekDateStrings.includes(scheduledDate);
        } catch (dateError) {
          return false;
        }
      });

      return nextWeekOrders.length;
    } catch (error) {
      console.error('🔍 Error calculating next week layup count:', error);
      return 0;
    }
  }, [currentSchedule, currentWeekOffset]);

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
        <h1 className="text-3xl font-bold">Layup/Plugging Department Manager</h1>
      </div>
      
      {/* Barcode Scanner at top */}
      <BarcodeScanner />
      
      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Current View Summary */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {currentWeekOffset === 0 ? 'Current Week Schedule' : 
               currentWeekOffset === 1 ? 'Next Week Schedule' :
               `Week ${currentWeekOffset > 0 ? '+' : ''}${currentWeekOffset}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {currentWeekOrders.length}
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Orders scheduled for {weekInfo.dateRange}
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

      {/* Multi-select Actions - Sticky at bottom when items selected */}
      {selectedOrders.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4">
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-blue-800 dark:text-blue-200">
                      {selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected for progression
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
                      {moveToDepartmentMutation.isPending ? 'Moving...' : 'Progress to Barcode Department →'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Spacer for sticky bottom bar */}
      {selectedOrders.length > 0 && <div className="h-24"></div>}
      
      {/* Week Layup Queue - Day by Day View */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span>Layup/Plugging Manager</span>
              <Badge variant="secondary" className="text-sm">
                {weekInfo.label}
              </Badge>
            </div>
            
            {/* Week Navigation Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentWeekOffset(currentWeekOffset - 1)}
                disabled={scheduleLoading}
              >
                ← Previous Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentWeekOffset(0)}
                disabled={currentWeekOffset === 0 || scheduleLoading}
              >
                Current Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentWeekOffset(currentWeekOffset + 1)}
                disabled={scheduleLoading}
              >
                Next Week →
              </Button>
            </div>
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {weekInfo.dateRange} • Generated from Layup Scheduler
          </p>
        </CardHeader>
        <CardContent>
          {/* Selection Controls */}
          {currentWeekOrders.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-2 mr-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedOrders(currentWeekOrders.map(o => o.orderId))}
                  disabled={selectedOrders.length === currentWeekOrders.length}
                >
                  Select All ({currentWeekOrders.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedOrders([])}
                  disabled={selectedOrders.length === 0}
                >
                  Clear ({selectedOrders.length})
                </Button>
              </div>
              {selectedOrders.length > 0 && (
                <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                  {selectedOrders.length} Selected
                </Badge>
              )}
            </div>
          )}
          {currentWeekOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-medium mb-2">No Orders in Queue</h3>
              <p className="text-sm">Orders from the Layup Scheduler will appear here automatically</p>
              <p className="text-xs text-gray-400 mt-2">Go to Production Scheduling → Layup Scheduler to assign orders</p>
              {(scheduleLoading || ordersLoading) && (
                <p className="text-xs text-blue-500 mt-2">Loading schedule data...</p>
              )}
              <div className="text-xs text-gray-400 mt-4 space-y-1">
                <p>Debug Info:</p>
                <p>Schedule entries: {(currentSchedule as any[]).length}</p>
                <p>Available orders: {availableOrders.length}</p>
                <p>Processed orders: {processedOrders.length}</p>
                <p>Current week orders: {currentWeekOrders.length}</p>
                <p>Schedule loading: {scheduleLoading ? 'Yes' : 'No'}</p>
                <p>Orders loading: {ordersLoading ? 'Yes' : 'No'}</p>
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
                      <div className="flex items-center gap-2">
                        {dayOrders.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const dayOrderIds = dayOrders.map(o => o.orderId);
                              const allSelected = dayOrderIds.every(id => selectedOrders.includes(id));
                              if (allSelected) {
                                setSelectedOrders(prev => prev.filter(id => !dayOrderIds.includes(id)));
                              } else {
                                setSelectedOrders(prev => [...Array.from(new Set([...prev, ...dayOrderIds]))]);
                              }
                            }}
                            className="text-xs h-6"
                          >
                            {dayOrders.every(o => selectedOrders.includes(o.orderId)) ? 'Deselect Day' : 'Select Day'}
                          </Button>
                        )}
                        <Badge variant={dayOrders.length > 0 ? 'default' : 'secondary'}>
                          {dayOrders.length} orders
                        </Badge>
                      </div>
                    </div>
                    
                    {dayOrders.length === 0 ? (
                      <div className="text-center py-4 text-gray-400">
                        No orders scheduled for this day
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {dayOrders.map((order: any) => {
                          const isSelected = selectedOrders.includes(order.orderId);
                          
                          return (
                            <Card key={order.orderId} className={`relative border-l-4 transition-all cursor-pointer ${
                              order.source === 'p1_purchase_order' ? 'border-l-green-500' :
                              order.source === 'production_order' ? 'border-l-orange-500' :
                              'border-l-blue-500'
                            } ${isSelected ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                            onClick={() => handleOrderSelect(order.orderId, !isSelected)}>
                              {/* Checkbox in top-right corner */}
                              <div className="absolute top-2 right-2 z-10">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => handleOrderSelect(order.orderId, !!checked)}
                                  className="bg-white dark:bg-gray-800 border-2 shadow-sm"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              
                              <CardContent className="p-0 pr-8">
                                <QueueOrderItem
                                  order={order}
                                  getModelDisplayName={getModelDisplayName}
                                  processedOrders={processedOrders}
                                />
                                
                                {/* Additional queue-specific info */}
                                <div className="px-3 pb-3 pt-0">
                                  <div className="space-y-1 text-xs text-gray-500">
                                    {order.moldId && (
                                      <div>Mold: {order.moldId}</div>
                                    )}
                                    
                                    {order.customer && (
                                      <div>Customer: {order.customer}</div>
                                    )}
                                    
                                    {order.dueDate && (
                                      <div>Due: {format(new Date(order.dueDate), 'MMM d, yyyy')}</div>
                                    )}
                                  </div>
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
