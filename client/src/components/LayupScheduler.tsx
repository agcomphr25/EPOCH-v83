import React, { useState, useMemo } from 'react';
import { generateLayupSchedule } from '../utils/schedulerUtils';
import useMoldSettings from '../hooks/useMoldSettings';
import useEmployeeSettings from '../hooks/useEmployeeSettings';
import { useUnifiedLayupOrders } from '../hooks/useUnifiedLayupOrders';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  addDays,
  format,
  isSameDay,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Calendar, Grid3X3, Calendar1, Settings, Users, Plus, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

// Draggable Order Item Component with responsive sizing
function DraggableOrderItem({ order, priority, totalOrdersInCell, moldInfo, getModelDisplayName, features }: { order: any, priority: number, totalOrdersInCell?: number, moldInfo?: { moldId: string, instanceNumber?: number }, getModelDisplayName?: (modelId: string) => string, features?: any[] }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: order.orderId });

  const style = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : 'none',
    opacity: isDragging ? 0.5 : 1,
  };

  // Responsive sizing based on number of orders in cell
  const getCardSizing = (orderCount: number) => {
    if (orderCount <= 2) {
      return {
        padding: 'p-3',
        margin: 'mb-2',
        textSize: 'text-base font-bold',
        height: 'min-h-[3rem]'
      };
    } else if (orderCount <= 5) {
      return {
        padding: 'p-2',
        margin: 'mb-1.5',
        textSize: 'text-sm font-bold',
        height: 'min-h-[2.5rem]'
      };
    } else if (orderCount <= 8) {
      return {
        padding: 'p-2',
        margin: 'mb-1',
        textSize: 'text-sm font-semibold',
        height: 'min-h-[2rem]'
      };
    } else {
      // Many orders - ultra compact
      return {
        padding: 'p-1.5',
        margin: 'mb-0.5',
        textSize: 'text-xs font-semibold',
        height: 'min-h-[1.5rem]'
      };
    }
  };

  const sizing = getCardSizing(totalOrdersInCell || 1);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`${sizing.padding} ${sizing.margin} ${sizing.height} ${order.source === 'p1_purchase_order' ? 'bg-green-100 dark:bg-green-800/50 hover:bg-green-200 dark:hover:bg-green-800/70 border-2 border-green-300 dark:border-green-600' : 'bg-blue-100 dark:bg-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-800/70 border-2 border-blue-300 dark:border-blue-600'} rounded-lg shadow-md cursor-grab transition-all duration-200`}
    >
      <div className={`${order.source === 'p1_purchase_order' ? 'text-green-800 dark:text-green-200' : 'text-blue-800 dark:text-blue-200'} ${sizing.textSize} text-center flex flex-col items-center justify-center h-full`}>
        <div className="flex items-center font-bold">
          {order.orderId || 'No ID'}
          {order.source === 'p1_purchase_order' && <span className="text-xs ml-1 bg-green-200 dark:bg-green-700 px-1 rounded">P1</span>}
        </div>
        {/* Show stock model display name with material type */}
        {(() => {
          const modelId = order.stockModelId || order.modelId; // P1 orders use stockModelId, regular orders use modelId
          if (!getModelDisplayName || !modelId) return null;
          
          const displayName = getModelDisplayName(modelId);
          
          // Determine material type from model ID
          const getMaterialType = (id: string) => {
            if (id.startsWith('cf_')) return 'CF';
            if (id.startsWith('fg_')) return 'FG';
            if (id.includes('carbon')) return 'CF';
            if (id.includes('fiberglass')) return 'FG';
            return null;
          };
          
          const materialType = getMaterialType(modelId);
          
          return (
            <div className="text-xs opacity-80 mt-0.5 font-medium">
              {materialType && <span className="bg-gray-200 dark:bg-gray-600 px-1 rounded mr-1 text-xs font-bold">{materialType}</span>}
              {displayName}
            </div>
          );
        })()}
        
        {/* Show Action Length (Action Inlet) Display */}
        {(() => {
          const modelId = order.stockModelId || order.modelId;
          const isAPR = modelId && modelId.toLowerCase().includes('apr');
          
          // For APR orders, show action type instead of action length
          if (isAPR) {
            const getAPRActionDisplay = (orderFeatures: any) => {
              if (!orderFeatures) return null;
              
              // Check for action_inlet field first (more specific)
              let actionType = orderFeatures.action_inlet;
              if (!actionType) {
                // Fallback to action field
                actionType = orderFeatures.action;
              }
              
              if (!actionType || actionType === 'none') return null;
              
              // Convert common action types to readable format
              const actionMap: {[key: string]: string} = {
                'anti_ten_hunter_def': 'Anti-X Hunter',
                'apr': 'APR',
                'rem_700': 'Rem 700',
                'tikka': 'Tikka',
                'savage': 'Savage'
              };
              
              return actionMap[actionType] || actionType.replace(/_/g, ' ').toUpperCase();
            };
            
            const aprActionDisplay = getAPRActionDisplay(order.features);
            
            return aprActionDisplay ? (
              <div className="text-xs opacity-80 mt-0.5 font-medium">
                Action: {aprActionDisplay}
              </div>
            ) : null;
          }
          
          // For non-APR orders, show action length
          const getActionInletDisplayNonAPR = (orderFeatures: any) => {
            if (!orderFeatures) return null;
            
            // Look for action_length field first
            let actionLengthValue = orderFeatures.action_length;
            
            // If action_length is empty or 'none', try to derive from action_inlet
            if ((!actionLengthValue || actionLengthValue === 'none') && orderFeatures.action_inlet) {
              const actionInlet = orderFeatures.action_inlet;
              
              // Map common action inlets to action lengths based on actual data patterns
              const inletToLengthMap: {[key: string]: string} = {
                'anti_ten_hunter_def': 'SA', // Short action
                'remington_700': 'SA', // Most common Rem 700 is short action
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
              
              actionLengthValue = inletToLengthMap[actionInlet] || 'SA'; // Default to SA if not found
            }
            
            if (!actionLengthValue || actionLengthValue === 'none') return null;
            
            // Simple abbreviation mapping without depending on features API
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

        {/* Show Mold Name with Action Length prefix from mold configuration */}
        {moldInfo && (
          <div className="text-xs font-semibold opacity-80 mt-0.5">
            {(() => {
              // Get action length prefix
              const getActionPrefix = (orderFeatures: any) => {
                if (!orderFeatures || !features) return '';
                
                const actionLengthValue = orderFeatures.action_length;
                if (!actionLengthValue || actionLengthValue === 'none') return '';
                
                // Find the action-length feature definition in Feature Manager
                const actionLengthFeature = features.find((f: any) => f.id === 'action-length');
                
                if (!actionLengthFeature || !actionLengthFeature.options) {
                  // Fallback to abbreviations if Feature Manager data not available
                  const displayMap: {[key: string]: string} = {
                    'Long': 'LA', 'Medium': 'MA', 'Short': 'SA',
                    'long': 'LA', 'medium': 'MA', 'short': 'SA'
                  };
                  return displayMap[actionLengthValue] || actionLengthValue;
                }
                
                // Use Feature Manager option label and convert to abbreviation
                const option = actionLengthFeature.options.find((opt: any) => opt.value === actionLengthValue);
                if (option && option.label) {
                  const label = option.label;
                  if (label.toLowerCase().includes('long')) return 'LA';
                  if (label.toLowerCase().includes('medium')) return 'MA';
                  if (label.toLowerCase().includes('short')) return 'SA';
                  return label.substring(0, 2).toUpperCase(); // First 2 chars as fallback
                }
                
                return actionLengthValue;
              };

              const actionPrefix = getActionPrefix(order.features);
              const moldName = moldInfo.moldId;
              const instanceText = moldInfo.instanceNumber ? ` #${moldInfo.instanceNumber}` : '';
              
              return actionPrefix ? `${actionPrefix} ${moldName}${instanceText}` : `${moldName}${instanceText}`;
            })()}
          </div>
        )}

        {/* Show LOP (Length of Pull) only if there's an extra length specified */}
        {(() => {
          const getLOPDisplay = (orderFeatures: any) => {
            if (!orderFeatures || !features) return null;
            
            // Look for length_of_pull field (NOT action_length)
            const lopValue = orderFeatures.length_of_pull;
            
            // Don't show if empty, none, standard, std, or any variation indicating no extra length
            if (!lopValue || 
                lopValue === 'none' || 
                lopValue === 'standard' || 
                lopValue === 'std' ||
                lopValue === 'std_length' ||
                lopValue === 'standard_length' ||
                lopValue === 'no_extra_length' ||
                lopValue === 'std_no_extra_length' ||
                lopValue === 'no_lop_change' ||
                lopValue === '' || 
                lopValue === '0' ||
                lopValue === 'normal' ||
                lopValue.toLowerCase().includes('std') ||
                lopValue.toLowerCase().includes('standard') ||
                lopValue.toLowerCase().includes('no extra')) {
              return null;
            }
            
            // Find the length_of_pull feature definition in Feature Manager
            const lopFeature = features.find((f: any) => f.id === 'length_of_pull');
            
            if (lopFeature && lopFeature.options) {
              // Use Feature Manager option label
              const option = lopFeature.options.find((opt: any) => opt.value === lopValue);
              if (option && option.label) {
                return option.label;
              }
            }
            
            // Return raw value as fallback only if it indicates extra length
            return lopValue;
          };
          
          const lopDisplay = getLOPDisplay(order.features);
          
          return lopDisplay ? (
            <div className="text-xs opacity-80 mt-0.5 font-medium">
              LOP: {lopDisplay}
            </div>
          ) : null;
        })()}
        
        {/* Show Heavy Fill if selected */}
        {(() => {
          const getHeavyFillDisplay = (orderFeatures: any) => {
            console.log('Heavy Fill detection for order:', {
              orderId: order.orderId,
              orderFeatures,
              otherOptions: orderFeatures?.other_options
            });
            
            if (!orderFeatures) return null;
            
            // Check if heavy_fill is in the other_options array
            const otherOptions = orderFeatures.other_options;
            if (Array.isArray(otherOptions) && otherOptions.includes('heavy_fill')) {
              return 'Heavy Fill';
            }
            
            // Fallback: check direct field for backward compatibility
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
        

        
        {/* Show Due Date for Queue Cards (when not in calendar) */}
        {!moldInfo && order.dueDate && (
          <div className="text-xs opacity-70 mt-0.5 font-medium">
            Due: {format(new Date(order.dueDate), 'MM/dd')}
          </div>
        )}
      </div>
    </div>
  );
}

// Droppable Cell Component with responsive height
function DroppableCell({ 
  moldId, 
  date, 
  orders, 
  onDrop,
  moldInfo,
  getModelDisplayName,
  features
}: { 
  moldId: string; 
  date: Date; 
  orders: any[]; 
  onDrop: (orderId: string, moldId: string, date: Date) => void;
  moldInfo?: { moldId: string, instanceNumber?: number };
  getModelDisplayName?: (modelId: string) => string;
  features?: any[];
}) {
  // Responsive cell height based on order count
  const getCellHeight = (orderCount: number) => {
    if (orderCount === 0) return 'min-h-[100px]';
    if (orderCount <= 2) return 'min-h-[100px]';
    if (orderCount <= 5) return 'min-h-[120px]';
    if (orderCount <= 8) return 'min-h-[140px]';
    return 'min-h-[160px] max-h-[200px] overflow-y-auto'; // Scrollable for many orders
  };

  const cellHeight = getCellHeight(orders.length);
  
  const {
    setNodeRef,
    isOver,
  } = useDroppable({
    id: `${moldId}|${date.toISOString()}`
  });

  // Debug logging for each cell
  console.log(`🔍 DroppableCell [${moldId}]: ${orders.length} orders`, orders.map(o => o?.orderId));

  return (
    <div 
      ref={setNodeRef}
      className={`${cellHeight} border ${isOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'} p-1 bg-white dark:bg-gray-800 transition-all duration-200`}
    >
      {orders.length > 0 && (
        <div className="text-xs text-gray-500 mb-1">
          {orders.length} order(s)
        </div>
      )}
      <SortableContext items={orders.map(o => o?.orderId || 'unknown')} strategy={verticalListSortingStrategy}>
        {orders.map((order, idx) => {
          console.log(`🎯 Rendering order in cell:`, order);
          return (
            <DraggableOrderItem
              key={order?.orderId || `order-${idx}`}
              order={order}
              priority={order?.priorityScore || 0}
              totalOrdersInCell={orders.length}
              moldInfo={moldInfo}
              getModelDisplayName={getModelDisplayName}
              features={features}
            />
          );
        })}
      </SortableContext>
      {orders.length === 0 && (
        <div className="text-xs text-gray-400 text-center py-4">
          Empty cell
        </div>
      )}
    </div>
  );
}

export default function LayupScheduler() {
  const [viewType, setViewType] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newMold, setNewMold] = useState({ moldName: '', stockModels: [] as string[], instanceNumber: 1, multiplier: 2 });
  const [bulkMoldCount, setBulkMoldCount] = useState(1);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ employeeId: '', rate: 1.5, hours: 8 });
  const [employeeChanges, setEmployeeChanges] = useState<{[key: string]: {rate: number, hours: number}}>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Track order assignments (orderId -> { moldId, date })
  const [orderAssignments, setOrderAssignments] = useState<{[orderId: string]: { moldId: string, date: string }}>({});

  const queryClient = useQueryClient();
  
  const { molds, saveMold, deleteMold, toggleMoldStatus, loading: moldsLoading } = useMoldSettings();
  const { employees, saveEmployee, deleteEmployee, toggleEmployeeStatus, loading: employeesLoading, refetch: refetchEmployees } = useEmployeeSettings();
  const { orders, reloadOrders, loading: ordersLoading } = useUnifiedLayupOrders();

  // Auto-schedule system using local data
  const generateAutoSchedule = useCallback(() => {
    if (!orders.length || !molds.length || !employees.length) {
      console.log('❌ Cannot generate schedule: missing data');
      return;
    }

    console.log('🚀 Generating auto-schedule for', orders.length, 'orders');
    
    // Get work days for current and next week
    const getWorkDaysInWeek = (startDate: Date) => {
      const workDays: Date[] = [];
      let current = new Date(startDate);
      
      // Find Monday of current week
      while (current.getDay() !== 1) {
        current = new Date(current.getTime() + (current.getDay() === 0 ? 1 : -1) * 24 * 60 * 60 * 1000);
      }
      
      // Add Monday through Thursday
      for (let i = 0; i < 4; i++) {
        workDays.push(new Date(current));
        current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
      }
      
      return workDays;
    };

    const currentWeekDays = getWorkDaysInWeek(currentDate);
    const nextWeekDays = getWorkDaysInWeek(new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000));
    const allWorkDays = [...currentWeekDays, ...nextWeekDays];

    // Sort orders by due date priority
    const sortedOrders = [...orders].sort((a, b) => {
      const aDueDate = new Date(a.dueDate || a.orderDate).getTime();
      const bDueDate = new Date(b.dueDate || b.orderDate).getTime();
      return aDueDate - bDueDate;
    });

    // Find compatible molds for each order
    const getCompatibleMolds = (order: any) => {
      const modelId = order.modelId || order.stockModelId;
      if (!modelId) return [];
      
      return molds.filter(mold => {
        if (!mold.enabled) return false;
        if (!mold.stockModels || mold.stockModels.length === 0) return true; // No restrictions
        return mold.stockModels.includes(modelId);
      });
    };

    // Track daily assignments per mold
    const dailyMoldUsage: { [dateKey: string]: { [moldId: string]: number } } = {};
    const newAssignments: { [orderId: string]: { moldId: string, date: string } } = {};

    // Target 12-15 orders per day, distribute evenly
    const targetOrdersPerDay = 14;
    let currentDayIndex = 0;

    sortedOrders.forEach((order, index) => {
      const compatibleMolds = getCompatibleMolds(order);
      
      if (compatibleMolds.length === 0) {
        console.log('⚠️ No compatible molds for order:', order.orderId);
        return;
      }

      // Cycle through work days to distribute evenly
      const targetDate = allWorkDays[currentDayIndex % allWorkDays.length];
      const dateKey = targetDate.toISOString().split('T')[0];

      // Initialize daily usage tracking
      if (!dailyMoldUsage[dateKey]) {
        dailyMoldUsage[dateKey] = {};
      }

      // Find best mold (least used on this day)
      const bestMold = compatibleMolds.reduce((best, mold) => {
        const currentUsage = dailyMoldUsage[dateKey][mold.moldId] || 0;
        const bestUsage = dailyMoldUsage[dateKey][best.moldId] || 0;
        return currentUsage < bestUsage ? mold : best;
      });

      // Assign order to mold and date
      newAssignments[order.orderId] = {
        moldId: bestMold.moldId,
        date: targetDate.toISOString()
      };

      // Update usage tracking
      dailyMoldUsage[dateKey][bestMold.moldId] = (dailyMoldUsage[dateKey][bestMold.moldId] || 0) + 1;

      // Move to next day when we hit target orders per day
      const totalOrdersOnThisDay = Object.values(dailyMoldUsage[dateKey]).reduce((sum, count) => sum + count, 0);
      if (totalOrdersOnThisDay >= targetOrdersPerDay) {
        currentDayIndex++;
      }
    });

    console.log('📅 Generated schedule assignments:', newAssignments);
    console.log('📊 Daily distribution:', dailyMoldUsage);
    
    setOrderAssignments(newAssignments);
  }, [orders, molds, employees, currentDate]);

  // Fetch stock models to get display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  }) as { data: any[] };

  const { data: features = [] } = useQuery({
    queryKey: ['/api/features'],
  }) as { data: any[] };

  // Helper function to get model display name
  const getModelDisplayName = (modelId: string) => {
    const model = (stockModels as any[]).find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Debug logging with emojis for visibility
  console.log('🎯 LayupScheduler - Orders data:', orders);
  console.log('📊 LayupScheduler - Orders count:', orders?.length);
  console.log('🔍 LayupScheduler - Sample order:', orders?.[0]);
  console.log('📋 LayupScheduler - Order Assignments:', orderAssignments);
  console.log('🏭 LayupScheduler - Molds:', molds?.map(m => ({ moldId: m.moldId, instanceNumber: m.instanceNumber })));
  console.log('⚙️ LayupScheduler - Employees:', employees?.length, 'employees loaded');
  
  // Debug unassigned orders
  const unassignedOrders = orders.filter(order => !orderAssignments[order.orderId]);
  console.log('🔄 Unassigned orders:', unassignedOrders.length, unassignedOrders.map(o => o.orderId));

  // Auto-generate schedule when data is loaded
  useEffect(() => {
    if (orders.length > 0 && molds.length > 0 && employees.length > 0 && Object.keys(orderAssignments).length === 0) {
      console.log('🚀 Auto-running initial schedule generation');
      setTimeout(() => generateAutoSchedule(), 1000); // Delay to let UI render
    }
  }, [orders.length, molds.length, employees.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Generate schedule
  const schedule = useMemo(() => {
    if (!orders.length || !molds.length || !employees.length) return [];
    
    const orderData = orders.map(order => ({
      orderId: order.orderId,
      orderDate: new Date(order.orderDate),
      priorityScore: order.priorityScore,
      customer: order.customer,
      product: order.product,
    }));

    const moldData = molds.map(mold => ({
      moldId: mold.moldId,
      modelName: mold.modelName,
      instanceNumber: mold.instanceNumber,
      enabled: mold.enabled ?? true,
      multiplier: mold.multiplier,
    }));

    const employeeData = employees.map(emp => ({
      employeeId: emp.employeeId,
      name: emp.name,
      rate: emp.rate,
      hours: emp.hours,
    }));

    return generateLayupSchedule(orderData, moldData, employeeData);
  }, [orders, molds, employees]);

  // Apply automatic schedule to orderAssignments when schedule changes
  React.useEffect(() => {
    if (schedule.length > 0 && Object.keys(orderAssignments).length === 0) {
      console.log('🚀 Applying automatic schedule:', schedule);
      const autoAssignments: {[orderId: string]: { moldId: string, date: string }} = {};
      
      schedule.forEach(item => {
        console.log(`📋 Assigning ${item.orderId} to mold ${item.moldId} on ${item.scheduledDate}`);
        autoAssignments[item.orderId] = {
          moldId: item.moldId,
          date: item.scheduledDate.toISOString()
        };
      });
      
      setOrderAssignments(autoAssignments);
      console.log('✅ Auto-assigned orders:', autoAssignments);
      console.log('🔢 Total assignments made:', Object.keys(autoAssignments).length);
    } else {
      console.log('❌ Not applying auto-schedule:', {
        scheduleLength: schedule.length,
        existingAssignments: Object.keys(orderAssignments).length,
        schedule: schedule
      });
    }
  }, [schedule, orderAssignments]);

  // Build date columns
  // Generate date ranges based on view type - work week focus (Mon-Fri only)
  const dates = useMemo(() => {
    if (viewType === 'day') return [currentDate];
    if (viewType === 'week') {
      // Show work week only: Monday through Friday
      const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
      return eachDayOfInterval({ start, end: addDays(start, 4) }); // Only 5 days (Mon-Fri)
    }
    // month - organize by weeks
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [viewType, currentDate]);

  // For week-based organization, group dates into work week sections (Mon-Fri only)
  const weekGroups = useMemo(() => {
    if (viewType !== 'month') return null;
    
    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];
    
    dates.forEach((date, index) => {
      // Only include work days (Monday = 1, Tuesday = 2, ..., Friday = 5)
      const dayOfWeek = date.getDay();
      const isWorkDay = dayOfWeek >= 1 && dayOfWeek <= 5;
      
      if (isWorkDay) {
        currentWeek.push(date);
      }
      
      // Complete the week on Friday (5) or at the end
      if (dayOfWeek === 5 || index === dates.length - 1) {
        if (currentWeek.length > 0) {
          weeks.push(currentWeek);
          currentWeek = [];
        }
      }
    });
    
    return weeks;
  }, [dates, viewType]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const orderId = active.id as string;
    const [moldId, dateIso] = (over.id as string).split('|');

    // Update local assignment state
    setOrderAssignments(prev => ({
      ...prev,
      [orderId]: { moldId, date: dateIso }
    }));
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleAddMold = async () => {
    if (!newMold.moldName.trim()) return;
    
    if (isBulkMode && bulkMoldCount > 1) {
      // Create multiple molds with different instance numbers
      for (let i = 1; i <= bulkMoldCount; i++) {
        const moldId = `${newMold.moldName}-${i}`;
        await saveMold({
          moldId,
          modelName: newMold.moldName,
          stockModels: newMold.stockModels,
          instanceNumber: i,
          multiplier: newMold.multiplier,
          enabled: true
        });
      }
    } else {
      // Create single mold
      const moldId = `${newMold.moldName}-${newMold.instanceNumber}`;
      await saveMold({
        moldId,
        modelName: newMold.moldName,
        stockModels: newMold.stockModels,
        instanceNumber: newMold.instanceNumber,
        multiplier: newMold.multiplier,
        enabled: true
      });
    }
    
    setNewMold({ moldName: '', stockModels: [], instanceNumber: 1, multiplier: 2 });
    setBulkMoldCount(1);
    setIsBulkMode(false);
  };

  const handleAddEmployee = async () => {
    if (!newEmployee.employeeId.trim()) return;
    
    await saveEmployee({
      employeeId: newEmployee.employeeId,
      rate: newEmployee.rate,
      hours: newEmployee.hours,
      department: 'Layup',
      isActive: true
    });
    setNewEmployee({ employeeId: '', rate: 1.5, hours: 8 });
    // Refresh the employee list to show the newly added employee
    await refetchEmployees();
  };

  const handleEmployeeChange = (employeeId: string, field: 'rate' | 'hours', value: number) => {
    setEmployeeChanges(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [field]: value
      }
    }));
    setHasUnsavedChanges(true);
  };

  const handleSaveEmployeeChanges = async () => {
    try {
      // Save all changes
      const savePromises = Object.entries(employeeChanges).map(([employeeId, changes]) => {
        const employee = employees.find(emp => emp.employeeId === employeeId);
        if (employee) {
          return saveEmployee({
            ...employee,
            ...changes
          });
        }
        return Promise.resolve();
      });

      await Promise.all(savePromises);
      
      // Clear unsaved changes
      setEmployeeChanges({});
      setHasUnsavedChanges(false);
      
      // Refresh the employee list
      await refetchEmployees();
    } catch (error) {
      console.error('Failed to save employee changes:', error);
    }
  };

  if (moldsLoading || employeesLoading || ordersLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Loading scheduler...</div>
      </div>
    );
  }

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full">
        {/* Sidebar for Order Queue */}
        <aside className="w-80 p-4 border-r border-gray-200 dark:border-gray-700 overflow-auto">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Order Queue</CardTitle>
                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                  {orders.filter(o => !orderAssignments[o.orderId]).length} orders
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <div className="text-sm">No orders in queue</div>
                  <div className="text-xs mt-1">Orders will appear here when available</div>
                  <div className="text-xs mt-1 bg-yellow-100 p-2 rounded">Debug: Loading={ordersLoading.toString()}</div>
                </div>
              ) : (
                <div className="space-y-2">

                  {orders
                    .filter(order => !orderAssignments[order.orderId]) // Only show unassigned orders in queue
                    .map((order, index) => {
                      console.log('🃏 Rendering order card:', order.orderId, order);
                      return (
                        <DraggableOrderItem
                          key={order.orderId}
                          order={order}
                          priority={index + 1}
                          totalOrdersInCell={1} // Force consistent sizing for queue cards
                          moldInfo={undefined} // No mold info in queue
                          getModelDisplayName={getModelDisplayName}
                          features={features}
                        />
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Calendar */}
        <main className="flex-1 p-4 overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <div className="flex space-x-2">
            <button 
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              onClick={(e) => {
                console.log('🔧 BUTTON CLICKED - START');
                
                console.log('Current orderAssignments before:', orderAssignments);
                console.log('Orders available:', orders?.length, orders?.map(o => o.orderId));
                console.log('Molds available:', molds?.length, molds?.map(m => m.moldId));
                
                // Force assignment regardless of data checks
                const testAssignments: {[orderId: string]: { moldId: string, date: string }} = {};
                const today = new Date();
                
                if (orders && orders.length > 0 && molds && molds.length > 0) {
                  const firstMold = molds.find(m => m.enabled);
                  console.log('Using mold:', firstMold?.moldId);
                  
                  orders.forEach((order, index) => {
                    if (firstMold) {
                      const assignDate = new Date(today);
                      assignDate.setDate(today.getDate() + index);
                      testAssignments[order.orderId] = {
                        moldId: firstMold.moldId,
                        date: assignDate.toISOString()
                      };
                      console.log(`Assigning ${order.orderId} to ${firstMold.moldId} on ${assignDate.toDateString()}`);
                    }
                  });
                } else {
                  // Force a test assignment even with dummy data
                  testAssignments['AG389'] = {
                    moldId: 'Alpine Hunter-1',
                    date: today.toISOString()
                  };
                  console.log('Force assigning AG389 to Alpine Hunter-1');
                }
                
                console.log('Test assignments to set:', testAssignments);
                setOrderAssignments(testAssignments);
                
                // Check assignments after setting
                setTimeout(() => {
                  console.log('Assignments after setState:', testAssignments);
                }, 100);
                
                console.log('🔧 BUTTON CLICKED - END');
              }}
            >
              🧪 TEST ASSIGNMENT
            </button>

            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                console.log('Clearing all assignments');
                setOrderAssignments({});
              }}
            >
              Clear Schedule
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Mold Settings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Mold Configuration</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {/* Add New Mold Form */}
                  <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg">
                    <div className="flex items-center mb-3">
                      <Plus className="w-4 h-4 mr-2" />
                      <span className="font-medium">Add New Mold</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Mold Name</label>
                        <Input
                          placeholder="e.g., Alpine Hunter, Tactical Hunter, etc."
                          value={newMold.moldName}
                          onChange={(e) => setNewMold(prev => ({...prev, moldName: e.target.value}))}
                        />
                        <p className="text-xs text-gray-500 mt-1">Enter a descriptive name for this mold</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Associated Stock Models</label>
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                          {stockModels.map((model: any) => (
                            <div key={model.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`stock-${model.id}`}
                                checked={newMold.stockModels.includes(model.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setNewMold(prev => ({
                                      ...prev,
                                      stockModels: [...prev.stockModels, model.id]
                                    }));
                                  } else {
                                    setNewMold(prev => ({
                                      ...prev,
                                      stockModels: prev.stockModels.filter(id => id !== model.id)
                                    }));
                                  }
                                }}
                              />
                              <label 
                                htmlFor={`stock-${model.id}`}
                                className="text-sm cursor-pointer"
                              >
                                {model.displayName || model.name || model.id}
                              </label>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Select all stock models that can be produced with this mold</p>
                      </div>
                      {/* Bulk Creation Option */}
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="bulk-mode"
                            checked={isBulkMode}
                            onCheckedChange={(checked) => setIsBulkMode(!!checked)}
                          />
                          <label 
                            htmlFor="bulk-mode" 
                            className="text-sm font-medium cursor-pointer"
                          >
                            Create multiple molds at once
                          </label>
                        </div>
                        
                        {isBulkMode && (
                          <div>
                            <label className="text-sm font-medium mb-1 block">Number of Molds</label>
                            <Input
                              type="number"
                              placeholder="14"
                              value={bulkMoldCount}
                              min={1}
                              max={50}
                              onChange={(e) => setBulkMoldCount(+e.target.value)}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Creates {bulkMoldCount} molds: {newMold.moldName}-1, {newMold.moldName}-2, ..., {newMold.moldName}-{bulkMoldCount}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {!isBulkMode && (
                          <div>
                            <label className="text-sm font-medium mb-1 block">Instance Number</label>
                            <Input
                              type="number"
                              placeholder="1"
                              value={newMold.instanceNumber}
                              min={1}
                              onChange={(e) => setNewMold(prev => ({...prev, instanceNumber: +e.target.value}))}
                            />
                            <p className="text-xs text-gray-500 mt-1">For single molds with custom instance numbers</p>
                          </div>
                        )}
                        <div className={isBulkMode ? 'col-span-2' : ''}>
                          <label className="text-sm font-medium mb-1 block">Daily Capacity</label>
                          <Input
                            type="number"
                            placeholder="2"
                            value={newMold.multiplier}
                            min={1}
                            onChange={(e) => setNewMold(prev => ({...prev, multiplier: +e.target.value}))}
                          />
                          <p className="text-xs text-gray-500 mt-1">Units each mold can produce per day</p>
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={handleAddMold} 
                      className="mt-3" 
                      size="sm"
                      disabled={!newMold.moldName.trim()}
                    >
                      {isBulkMode ? `Add ${bulkMoldCount} Molds` : 'Add Mold'}
                    </Button>
                  </div>

                  <Separator />

                  {/* Existing Molds */}
                  {molds.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No molds configured yet. Use the form above to add your first mold.
                    </div>
                  ) : (
                    molds.map(mold => (
                      <div key={mold.moldId} className="flex items-center space-x-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
                        <Checkbox
                          checked={mold.enabled ?? true}
                          onCheckedChange={(checked) => 
                            saveMold({ ...mold, enabled: !!checked })
                          }
                        />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <div className="font-medium text-base">
                              {mold.modelName} #{mold.instanceNumber}
                            </div>
                            <Badge variant={mold.isActive ? "default" : "secondary"}>
                              {mold.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Mold ID: {mold.moldId}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <label className="text-sm font-medium">Daily Capacity:</label>
                          <Input
                            type="number"
                            value={mold.multiplier}
                            min={1}
                            onChange={(e) =>
                              saveMold({ ...mold, multiplier: +e.target.value })
                            }
                            className="w-24"
                          />
                          <span className="text-sm text-gray-600">units/day</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleMoldStatus(mold.moldId, !mold.isActive)}
                            className={mold.isActive ? "text-orange-600 hover:text-orange-700" : "text-green-600 hover:text-green-700"}
                          >
                            {mold.isActive ? "Mark Inactive" : "Reactivate"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteMold(mold.moldId)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                  
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                      <strong>How to Add Molds:</strong>
                    </p>
                    <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 list-disc list-inside">
                      <li><strong>Model Name:</strong> Enter your mold model (e.g., "M001", "CF_Tactical", "Hunter_Stock")</li>
                      <li><strong>Instance Number:</strong> Use "1" for your first mold of this model. If you get a second identical mold, use "2", and so on</li>
                      <li><strong>Daily Capacity:</strong> How many units this specific mold can produce in one day</li>
                    </ul>
                    {molds.length > 0 && (
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-3">
                        <strong>Tip:</strong> Enable/disable molds to control which ones appear in the scheduler. 
                        Adjust daily capacity to reflect each mold's production capability.
                      </p>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Users className="w-4 h-4 mr-2" />
                  Employee Settings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Employee Configuration</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {/* Add New Employee Form */}
                  <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg">
                    <div className="flex items-center mb-3">
                      <Plus className="w-4 h-4 mr-2" />
                      <span className="font-medium">Add New Employee</span>
                    </div>
                    <div className="mb-3">
                      <Input
                        placeholder="Employee ID (e.g., EMP004)"
                        value={newEmployee.employeeId}
                        onChange={(e) => setNewEmployee(prev => ({...prev, employeeId: e.target.value}))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center space-x-2">
                        <label className="text-sm">Rate:</label>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="1.5"
                          value={newEmployee.rate}
                          onChange={(e) => setNewEmployee(prev => ({...prev, rate: +e.target.value}))}
                          className="w-20"
                        />
                        <span className="text-xs">units/hr</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <label className="text-sm">Hours:</label>
                        <Input
                          type="number"
                          step="0.5"
                          placeholder="8"
                          value={newEmployee.hours}
                          min={1}
                          max={12}
                          onChange={(e) => setNewEmployee(prev => ({...prev, hours: +e.target.value}))}
                          className="w-20"
                        />
                        <span className="text-xs">hrs/day</span>
                      </div>
                    </div>
                    <Button 
                      onClick={handleAddEmployee} 
                      className="mt-3" 
                      size="sm"
                      disabled={!newEmployee.employeeId.trim()}
                    >
                      Add Employee
                    </Button>
                  </div>

                  <Separator />

                  {/* Existing Employees */}
                  {employees.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No employees configured yet. Use the form above to add your first employee.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {employees.map(emp => {
                        const changes = employeeChanges[emp.employeeId];
                        const currentRate = changes?.rate ?? emp.rate;
                        const currentHours = changes?.hours ?? emp.hours;
                        
                        return (
                          <div key={emp.employeeId} className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <div className="font-medium text-base">{emp.name}</div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  Employee ID: {emp.employeeId} | Department: {emp.department}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge variant={emp.isActive ? "default" : "secondary"}>
                                  {emp.isActive ? "Active" : "Inactive"}
                                </Badge>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleEmployeeStatus(emp.employeeId, !emp.isActive)}
                                  className={emp.isActive ? "text-orange-600 hover:text-orange-700" : "text-green-600 hover:text-green-700"}
                                >
                                  {emp.isActive ? "Mark Inactive" : "Reactivate"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deleteEmployee(emp.employeeId)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-center space-x-2">
                                <label className="text-sm font-medium">Production Rate:</label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={currentRate}
                                  onChange={(e) =>
                                    handleEmployeeChange(emp.employeeId, 'rate', +e.target.value)
                                  }
                                  className="w-24"
                                />
                                <span className="text-sm text-gray-600">units/hr</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <label className="text-sm font-medium">Daily Hours:</label>
                                <Input
                                  type="number"
                                  step="0.5"
                                  value={currentHours}
                                  min={1}
                                  max={12}
                                  onChange={(e) =>
                                    handleEmployeeChange(emp.employeeId, 'hours', +e.target.value)
                                  }
                                  className="w-24"
                                />
                                <span className="text-sm text-gray-600">hrs/day</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Save Button */}
                      {hasUnsavedChanges && (
                        <div className="flex justify-center pt-4 border-t">
                          <Button 
                            onClick={handleSaveEmployeeChanges}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            Save Changes
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {employees.length > 0 && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-sm text-green-700 dark:text-green-300">
                        <strong>Tip:</strong> Set realistic production rates and daily hours for accurate scheduling. 
                        The system will automatically distribute work based on these settings.
                      </p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Auto-Schedule Button */}
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                console.log('🔄 Auto-schedule button clicked');
                generateAutoSchedule();
              }}
              disabled={!orders.length || !molds.filter(m => m.enabled).length || !employees.length}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Zap className="w-4 h-4 mr-2" />
              Auto-Schedule
            </Button>

            <Button
              variant={viewType === 'day' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewType('day')}
            >
              <Calendar1 className="w-4 h-4 mr-1" />
              Day
            </Button>
            <Button
              variant={viewType === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewType('week')}
            >
              <Calendar className="w-4 h-4 mr-1" />
              Week
            </Button>
            <Button
              variant={viewType === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewType('month')}
            >
              <Grid3X3 className="w-4 h-4 mr-1" />
              Month
            </Button>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (viewType === 'week') {
                  // Jump to previous work week (skip weekends)
                  const prevWeekStart = startOfWeek(addDays(currentDate, -7), { weekStartsOn: 1 });
                  setCurrentDate(prevWeekStart);
                } else {
                  setCurrentDate(prev => addDays(prev, -1));
                }
              }}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 text-sm font-medium">
              {viewType === 'week' 
                ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'M/d')} - ${format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), 4), 'M/d')}`
                : format(currentDate, 'MMMM yyyy')
              }
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (viewType === 'week') {
                  // Jump to next work week (skip weekends)
                  const nextWeekStart = startOfWeek(addDays(currentDate, 7), { weekStartsOn: 1 });
                  setCurrentDate(nextWeekStart);
                } else {
                  setCurrentDate(prev => addDays(prev, 1));
                }
              }}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            
            {/* Quick Next Week Button */}
            {viewType === 'week' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextWeekStart = startOfWeek(addDays(currentDate, 7), { weekStartsOn: 1 });
                  setCurrentDate(nextWeekStart);
                }}
                className="ml-2 text-xs"
              >
                Next Week
              </Button>
            )}
          </div>
        </div>

          {/* Week-based Calendar Layout */}
          {viewType === 'week' || viewType === 'day' ? (
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}
            >
              {/* Header */}
              {dates.map(date => (
                <div
                  key={date.toISOString()}
                  className="p-3 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center font-semibold text-sm"
                >
                  {format(date, 'MM/dd')}
                  <div className="text-xs text-gray-500 mt-1">
                    {format(date, 'EEE')}
                  </div>
                </div>
              ))}

              {/* Rows for each mold */}
              {molds.filter(m => m.enabled).map(mold => (
                <React.Fragment key={mold.moldId}>
                  {dates.map(date => {
                    const dateString = date.toISOString();
                    
                    // Get orders assigned to this mold/date combination
                    const cellOrders = Object.entries(orderAssignments)
                      .filter(([orderId, assignment]) => {
                        const assignmentDateOnly = assignment.date.split('T')[0];
                        const cellDateOnly = dateString.split('T')[0];
                        return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly;
                      })
                      .map(([orderId]) => {
                        const order = orders.find(o => o.orderId === orderId);
                        return order;
                      })
                      .filter(order => order !== undefined) as any[];

                    const dropId = `${mold.moldId}|${dateString}`;

                    return (
                      <DroppableCell
                        key={dropId}
                        moldId={mold.moldId}
                        date={date}
                        orders={cellOrders}
                        onDrop={(orderId, moldId, date) => {
                          // Handle drop (this is handled by DndContext now)
                        }}
                        moldInfo={{
                          moldId: mold.moldId,
                          instanceNumber: mold.instanceNumber
                        }}
                        getModelDisplayName={getModelDisplayName}
                        features={features}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          ) : (
            /* Month view - organized by weeks */
            <div className="space-y-4">
              {weekGroups?.map((week, weekIndex) => (
                <div key={`week-${weekIndex}`} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  {/* Week Header */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                      Week of {format(week[0], 'MMM d')} - {format(week[week.length - 1], 'MMM d')}
                    </h3>
                  </div>
                  
                  {/* Week Calendar Grid */}
                  <div
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${week.length}, 1fr)` }}
                  >
                    {/* Day Headers */}
                    {week.map(date => (
                      <div
                        key={date.toISOString()}
                        className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center text-xs font-medium"
                      >
                        {format(date, 'EEE MM/dd')}
                      </div>
                    ))}

                    {/* Mold Rows for this week */}
                    {molds.filter(m => m.enabled).map(mold => (
                      <React.Fragment key={`${weekIndex}-${mold.moldId}`}>
                        {week.map(date => {
                          const dateString = date.toISOString();
                          
                          const cellOrders = Object.entries(orderAssignments)
                            .filter(([orderId, assignment]) => {
                              const assignmentDateOnly = assignment.date.split('T')[0];
                              const cellDateOnly = dateString.split('T')[0];
                              return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly;
                            })
                            .map(([orderId]) => {
                              const order = orders.find(o => o.orderId === orderId);
                              return order;
                            })
                            .filter(order => order !== undefined) as any[];

                          const dropId = `${mold.moldId}|${dateString}`;

                          return (
                            <DroppableCell
                              key={dropId}
                              moldId={mold.moldId}
                              date={date}
                              orders={cellOrders}
                              onDrop={(orderId, moldId, date) => {
                                // Handle drop (this is handled by DndContext now)
                              }}
                              moldInfo={{
                                moldId: mold.moldId,
                                instanceNumber: mold.instanceNumber
                              }}
                              getModelDisplayName={getModelDisplayName}
                              features={features}
                            />
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

        </main>
      </div>
      
      <DragOverlay>
        {activeId ? (
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded border shadow-lg text-xs">
            {activeId}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}