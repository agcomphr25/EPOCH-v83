import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { generateLayupSchedule } from '../utils/schedulerUtils';
import { scheduleLOPAdjustments, identifyLOPOrders, getLOPStatus } from '../utils/lopScheduler';
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
// SortableContext removed - using basic drag and drop instead
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
import { ChevronLeft, ChevronRight, Calendar, Grid3X3, Calendar1, Settings, Users, Plus, Zap, Printer, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { getDisplayOrderId } from '@/lib/orderUtils';
import { useToast } from '@/hooks/use-toast';


// Draggable Order Item Component with responsive sizing
function DraggableOrderItem({ order, priority, totalOrdersInCell, moldInfo, getModelDisplayName, features, processedOrders }: { order: any, priority: number, totalOrdersInCell?: number, moldInfo?: { moldId: string, instanceNumber?: number }, getModelDisplayName?: (modelId: string) => string, features?: any[], processedOrders?: any[] }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ 
    id: order.orderId,
    data: {
      type: 'order',
      orderId: order.orderId,
      source: order.source
    }
  });

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
    if (order.source === 'production_order') {
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
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`${sizing.padding} ${sizing.margin} ${sizing.height} ${cardStyling.bg} rounded-lg shadow-md cursor-grab transition-all duration-200`}
    >
      <div className={`${cardStyling.text} ${sizing.textSize} text-center flex flex-col items-center justify-center h-full`}>
        <div className="flex items-center font-bold">
          {getDisplayOrderId(order) || 'No ID'}
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

        {/* Show Action Length (Action Inlet) Display */}
        {(() => {
          const modelId = order.stockModelId || order.modelId;
          const isAPR = modelId && modelId.toLowerCase().includes('apr');

          // For APR orders, show both action type AND action length
          if (isAPR) {
            const getAPRActionDisplay = (orderFeatures: any) => {
              if (!orderFeatures) return null;

              // Check for action_inlet field first (more specific)
              let actionType = orderFeatures.action_inlet;
              if (!actionType) {
                // Fallback to action field
                actionType = orderFeatures.action;
              }

              // Get action length for APR orders
              let actionLength = orderFeatures.action_length;
              if (!actionLength || actionLength === 'none') {
                // Try to derive from action_inlet
                if (actionType && actionType.includes('short')) actionLength = 'SA';
                else if (actionType && actionType.includes('long')) actionLength = 'LA';
                else actionLength = 'SA'; // Default for APR
              }

              // Convert action length to abbreviation
              const lengthMap: {[key: string]: string} = {
                'Long': 'LA', 'Medium': 'MA', 'Short': 'SA',
                'long': 'LA', 'medium': 'MA', 'short': 'SA',
                'LA': 'LA', 'MA': 'MA', 'SA': 'SA'
              };

              const actionLengthAbbr = lengthMap[actionLength] || actionLength;

              if (!actionType || actionType === 'none') {
                // Show just action length if no action type
                return actionLengthAbbr;
              }

              // Convert common action types to readable format
              const actionMap: {[key: string]: string} = {
                'anti_ten_hunter_def': 'Anti-X Hunter',
                'apr': 'APR',
                'rem_700': 'Rem 700',
                'tikka': 'Tikka',
                'savage': 'Savage'
              };

              const actionDisplay = actionMap[actionType] || actionType.replace(/_/g, ' ').toUpperCase();

              // Combine action length and action type for APR orders
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

        {/* Show LOP Adjustment Status */}
        {(() => {
          // Use the processed orders that have been run through LOP scheduler
          const lopOrder = processedOrders?.find(o => o.orderId === order.orderId) || identifyLOPOrders([order])[0];
          const lopStatus = getLOPStatus(lopOrder);

          if (lopStatus.status === 'none') return null;

          return (
            <div className="text-xs mt-1">
              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                lopStatus.status === 'scheduled'
                  ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                  : lopStatus.status === 'deferred'
                  ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
                  : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
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
  features,
  processedOrders
}: { 
  moldId: string; 
  date: Date; 
  orders: any[]; 
  onDrop: (orderId: string, moldId: string, date: Date) => void;
  moldInfo?: { moldId: string, instanceNumber?: number };
  getModelDisplayName?: (modelId: string) => string;
  features?: any[];
  processedOrders?: any[];
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
    id: `${moldId}|${date.toISOString()}`,
    data: {
      type: 'cell',
      moldId: moldId,
      date: date.toISOString()
    }
  });

  // Debug logging for each cell
  console.log(`🔍 DroppableCell [${moldId}]: ${orders.length} orders`, orders.map(o => o?.orderId));

  const isFriday = date.getDay() === 5;

  return (
    <div 
      ref={setNodeRef}
      className={`${cellHeight} border p-1 transition-all duration-200 ${
        isOver 
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
          : isFriday 
            ? 'border-amber-200 dark:border-amber-700 bg-amber-25 dark:bg-amber-900/10' 
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
    >
      {orders.length > 0 && (
        <div className="text-xs text-gray-500 mb-1">
          {orders.length} order(s)
        </div>
      )}
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
            processedOrders={processedOrders}
          />
        );
      })}
      {orders.length === 0 && (
        <div className="text-xs text-gray-400 text-center py-2 opacity-50">
          Available
        </div>
      )}
    </div>
  );
}

export default function LayupScheduler() {
  console.log("LayupScheduler component rendering...");
  const [viewType, setViewType] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newMold, setNewMold] = useState({ moldName: '', stockModels: [] as string[], instanceNumber: 1, multiplier: 2 });
  const [bulkMoldCount, setBulkMoldCount] = useState(1);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ employeeId: '', rate: 1.5, hours: 8 });
  const [employeeChanges, setEmployeeChanges] = useState<{[key: string]: {rate: number, hours: number}}>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingMoldId, setEditingMoldId] = useState<string | null>(null);
  const [editingMoldStockModels, setEditingMoldStockModels] = useState<string[]>([]);
  const [editingMoldName, setEditingMoldName] = useState<string>('');

  // Track order assignments (orderId -> { moldId, date })
  const [orderAssignments, setOrderAssignments] = useState<{[orderId: string]: { moldId: string, date: string }}>({});

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { molds, saveMold, deleteMold, toggleMoldStatus, loading: moldsLoading } = useMoldSettings();

  // Debug molds data
  console.log('🔧 LayupScheduler: Molds data:', { molds, moldsLength: molds.length, moldsLoading });
  const { employees, saveEmployee, deleteEmployee, toggleEmployeeStatus, loading: employeesLoading, refetch: refetchEmployees } = useEmployeeSettings();

  // Load existing schedule data from database
  const { data: existingSchedule, isLoading: scheduleLoading } = useQuery({
    queryKey: ['/api/layup-schedule'],
    enabled: true,
  });

  // Update local assignments when schedule data loads
  useEffect(() => {
    if (existingSchedule && Array.isArray(existingSchedule) && existingSchedule.length > 0) {
      const assignments: {[orderId: string]: { moldId: string, date: string }} = {};
      (existingSchedule as any[]).forEach((entry: any) => {
        assignments[entry.orderId] = {
          moldId: entry.moldId,
          date: entry.scheduledDate
        };
      });

      console.log('📅 Loading existing schedule assignments:', Object.keys(assignments).length, 'assignments');
      setOrderAssignments(assignments);
    }
  }, [existingSchedule]);

  // Save functionality
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedScheduleChanges, setHasUnsavedScheduleChanges] = useState(false);

  const saveScheduleMutation = useMutation({
    mutationFn: async (assignments: {[orderId: string]: { moldId: string, date: string }}) => {
      // First, clear existing schedule entries for these orders
      const orderIds = Object.keys(assignments);
      console.log('💾 Saving schedule for', orderIds.length, 'orders');

      // Delete existing entries for these orders
      const deletePromises = orderIds.map(orderId => 
        apiRequest(`/api/layup-schedule/by-order/${orderId}`, {
          method: 'DELETE'
        }).catch(err => {
          // Ignore errors for non-existent entries
          console.log('Note: No existing schedule found for order', orderId);
        })
      );

      await Promise.all(deletePromises);

      // Convert assignments to schedule entries
      const scheduleEntries = Object.entries(assignments).map(([orderId, assignment]) => ({
        orderId,
        scheduledDate: new Date(assignment.date),
        moldId: assignment.moldId,
        employeeAssignments: [], // Will be calculated by backend
        isOverride: true, // Mark as manual assignment
        overriddenBy: 'user' // Could be enhanced with actual user info
      }));

      // Save each schedule entry
      const savePromises = scheduleEntries.map(entry => 
        apiRequest('/api/layup-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: entry
        })
      );

      return Promise.all(savePromises);
    },
    onSuccess: () => {
      setHasUnsavedScheduleChanges(false);
      console.log('✅ Schedule saved successfully');
      // Optionally refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
    },
    onError: (error) => {
      console.error('❌ Failed to save schedule:', error);
    }
  });

  const handleSaveSchedule = async () => {
    if (Object.keys(orderAssignments).length === 0) {
      console.log('No assignments to save');
      return;
    }

    setIsSaving(true);
    try {
      await saveScheduleMutation.mutateAsync(orderAssignments);
    } finally {
      setIsSaving(false);
    }
  };

  // Push to Layup/Plugging Queue workflow
  const pushToLayupPluggingMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      return apiRequest('/api/push-to-layup-plugging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { orderIds }
      });
    },
    onSuccess: (result) => {
      console.log('✅ Orders pushed to layup/plugging queue:', result);
      toast({
        title: "Orders Moved",
        description: `${result.updatedOrders?.length || 0} orders moved to layup/plugging phase`,
      });
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/p1-layup-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error) => {
      console.error('❌ Failed to push orders:', error);
      toast({
        title: "Error",
        description: "Failed to move orders to layup/plugging phase",
        variant: "destructive"
      });
    }
  });

  const handlePushScheduledToQueue = async () => {
    // Get all currently scheduled orders from this week
    const currentWeekOrders = getOrdersForCurrentWeek();
    const scheduledOrderIds = currentWeekOrders.map(order => order.orderId);
    
    if (scheduledOrderIds.length === 0) {
      toast({
        title: "No Orders",
        description: "No orders are currently scheduled for this week",
        variant: "destructive"
      });
      return;
    }

    await pushToLayupPluggingMutation.mutateAsync(scheduledOrderIds);
  };

  // Python scheduler integration
  const pythonSchedulerMutation = useMutation({
    mutationFn: async () => {
      const schedulerData = {
        orders: processedOrders.slice(0, 100), // Limit for testing
        molds: molds,
        employees: employees
      };
      
      return apiRequest('/api/python-scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: schedulerData
      });
    },
    onSuccess: (result) => {
      console.log('🐍 Python scheduler result:', result);
      toast({
        title: "Python Scheduler Complete",
        description: `Scheduled ${result.schedule?.length || 0} orders with Mesa Universal constraints`,
      });
      
      // Apply the Python scheduler results to our local state
      if (result.schedule && Array.isArray(result.schedule)) {
        const newAssignments: {[orderId: string]: { moldId: string, date: string }} = {};
        
        result.schedule.forEach((slot: any) => {
          newAssignments[slot.order_id] = {
            moldId: slot.mold_id,
            date: slot.scheduled_date
          };
        });
        
        setOrderAssignments(newAssignments);
        setHasUnsavedScheduleChanges(true);
      }
    },
    onError: (error) => {
      console.error('❌ Python scheduler failed:', error);
      toast({
        title: "Scheduler Error",
        description: "Failed to run Python scheduler with Mesa Universal constraints",
        variant: "destructive"
      });
    }
  });

  const handleRunPythonScheduler = async () => {
    if (processedOrders.length === 0) {
      toast({
        title: "No Orders",
        description: "No orders available for scheduling",
        variant: "destructive"
      });
      return;
    }

    await pythonSchedulerMutation.mutateAsync();
  };

  // Helper function to get current week's orders
  const getOrdersForCurrentWeek = () => {
    const startOfCurrentWeek = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
    const endOfCurrentWeek = addDays(startOfCurrentWeek, 4); // Friday end
    
    return processedOrders.filter(order => {
      // Check if order is assigned to this week
      const assignment = orderAssignments[order.orderId];
      if (assignment) {
        const assignedDate = new Date(assignment.date);
        return assignedDate >= startOfCurrentWeek && assignedDate <= endOfCurrentWeek;
      }
      return false;
    });
  };


  const { orders, reloadOrders, loading: ordersLoading } = useUnifiedLayupOrders();

  // Auto-run LOP scheduler when orders are loaded to ensure proper scheduling
  const processedOrders = useMemo(() => {
    if (orders.length === 0) return [];

    const lopOrders = identifyLOPOrders(orders as any[]);
    const scheduledOrders = scheduleLOPAdjustments(lopOrders);

    const lopOrdersNeedingAdjustment = lopOrders.filter(o => o.needsLOPAdjustment);

    console.log('🔧 LOP Scheduler auto-run:', {
      totalOrders: orders.length,
      lopOrdersNeedingAdjustment: lopOrdersNeedingAdjustment.length,
      today: new Date().toDateString(),
      isMonday: new Date().getDay() === 1,
      sampleLOPOrders: lopOrdersNeedingAdjustment.slice(0, 3).map(o => ({
        orderId: o.orderId,
        needsLOP: o.needsLOPAdjustment,
        scheduledDate: o.scheduledLOPAdjustmentDate?.toDateString()
      }))
    });

    return scheduledOrders;
  }, [orders]);

  // Debug production orders specifically
  useEffect(() => {
    const productionOrders = orders.filter(order => order.source === 'production_order' || order.source === 'p1_purchase_order');
    console.log('🏭 LayupScheduler: Total orders loaded:', orders.length);
    console.log('🏭 LayupScheduler: Production orders found:', productionOrders.length);
    if (productionOrders.length > 0) {
      console.log('🏭 LayupScheduler: Sample production order:', productionOrders[0]);
      console.log('🏭 LayupScheduler: First 5 production orders:', productionOrders.slice(0, 5).map(o => ({
        orderId: o.orderId,
        source: o.source,
        stockModelId: o.stockModelId,
        customer: o.customer
      })));
    }

    // Log all order sources
    const sourceCounts = orders.reduce((acc, order) => {
      acc[order.source] = (acc[order.source] || 0) + 1;
      return acc;
    }, {} as {[key: string]: number});
    console.log('🏭 LayupScheduler: Orders by source:', sourceCounts);

    // Log when auto-schedule should run
    if (orders.length > 0 && molds.length > 0 && employees.length > 0) {
      console.log('🚀 LayupScheduler: All data loaded, auto-schedule should run');
    } else {
      console.log('❌ LayupScheduler: Missing data for auto-schedule:', {
        orders: orders.length,
        molds: molds.length,
        employees: employees.length
      });
    }
  }, [orders, molds, employees]);

  // Auto-schedule system using local data
  const generateAutoSchedule = useCallback(() => {
    if (!orders.length || !molds.length || !employees.length) {
      console.log('❌ Cannot generate schedule: missing data');
      return;
    }

    // Re-enabled auto-scheduling to place production orders in calendar

    console.log('🚀 Generating auto-schedule for', orders.length, 'orders');

    // Calculate dynamic scheduling window based on order due dates
    const calculateSchedulingWindow = () => {
      // Find the latest due date in orders
      const latestDueDate = Math.max(...orders.map(o => {
        const dueDate = o.dueDate || o.orderDate;
        return new Date(dueDate).getTime();
      }));

      const currentTime = currentDate.getTime();
      const weeksNeeded = Math.ceil((latestDueDate - currentTime) / (7 * 24 * 60 * 60 * 1000));

      // Min 2 weeks, max 8 weeks for performance
      const schedulingWeeks = Math.max(2, Math.min(weeksNeeded, 8));

      console.log(`📅 Dynamic scheduling window: ${schedulingWeeks} weeks (based on due dates extending to ${new Date(latestDueDate).toDateString()})`);

      return schedulingWeeks;
    };

    // Get work days for dynamic window (Mon-Thu primary scheduling)
    const getWorkDaysInWeek = (startDate: Date) => {
      const workDays: Date[] = [];
      let current = new Date(startDate);

      // Find Monday of current week
      while (current.getDay() !== 1) {
        current = new Date(current.getTime() + (current.getDay() === 0 ? 1 : -1) * 24 * 60 * 60 * 1000);
      }

      // Add Monday through Thursday (primary work days)
      for (let i = 0; i < 4; i++) {
        workDays.push(new Date(current));
        current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
      }

      return workDays;
    };

    // Generate all work days for the dynamic window
    const schedulingWeeks = calculateSchedulingWindow();
    const allWorkDays: Date[] = [];

    for (let week = 0; week < schedulingWeeks; week++) {
      const weekStartDate = new Date(currentDate.getTime() + week * 7 * 24 * 60 * 60 * 1000);
      const weekDays = getWorkDaysInWeek(weekStartDate);
      allWorkDays.push(...weekDays);
    }

    // Sort orders by due date priority
    const sortedOrders = [...orders].sort((a, b) => {
      const aDueDate = new Date(a.dueDate || a.orderDate).getTime();
      const bDueDate = new Date(b.dueDate || b.orderDate).getTime();
      return aDueDate - bDueDate;
    });

    // Find compatible molds for each order
    const getCompatibleMolds = (order: any) => {
      let modelId = order.stockModelId || order.modelId;

      // For production orders and P1 purchase orders, try to use the part name as the stock model
      if ((order.source === 'production_order' || order.source === 'p1_purchase_order') && order.product) {
        modelId = order.product;
      }

      if (!modelId) {
        console.log('⚠️ Order has no modelId:', order.orderId, 'Source:', order.source);
        return [];
      }

      // Extra debugging for production orders and P1 purchase orders
      if (order.source === 'production_order' || order.source === 'p1_purchase_order') {
        console.log('🏭 DETAILED PRODUCTION/P1 ORDER COMPATIBILITY CHECK:', {
          orderId: order.orderId,
          product: order.product,
          modelId,
          stockModelId: order.stockModelId,
          source: order.source,
          availableMolds: molds.filter(m => m.enabled).map(m => m.moldId),
          moldsWithModelId: molds.filter(m => m.enabled && m.stockModels?.includes(modelId)).map(m => m.moldId),
          allEnabledMolds: molds.filter(m => m.enabled).map(m => ({ moldId: m.moldId, stockModels: m.stockModels }))
        });
      }

      const compatibleMolds = molds.filter(mold => {
        if (!mold.enabled) return false;
        if (!mold.stockModels || mold.stockModels.length === 0) {
          console.log(`🔧 Mold ${mold.moldId} has no stock model restrictions - compatible with all`);
          return true; // No restrictions
        }
        const isCompatible = mold.stockModels.includes(modelId);
        if (order.source === 'production_order' || order.source === 'p1_purchase_order') {
          console.log(`🏭 MOLD CHECK: Order ${order.orderId} (${modelId}) vs Mold ${mold.moldId} (${mold.stockModels?.join(', ')}) = ${isCompatible ? '✅ COMPATIBLE' : '❌ NOT COMPATIBLE'}`);
        }
        if (!isCompatible && order.source !== 'production_order' && order.source !== 'p1_purchase_order') {
          console.log(`❌ Order ${order.orderId} (${modelId}) not compatible with mold ${mold.moldId} (has: ${mold.stockModels?.slice(0, 3).join(', ')}...)`);
        }
        return isCompatible;
      });

      console.log(`🎯 Order ${order.orderId} (${modelId}) → ${compatibleMolds.length} compatible molds:`, compatibleMolds.map(m => m.moldId));
      return compatibleMolds;
    };

    // Track cell assignments to ensure ONE ORDER PER CELL
    const cellAssignments = new Set<string>(); // Format: `${moldId}-${dateKey}`
    const newAssignments: { [orderId: string]: { moldId: string, date: string } } = {};

    console.log('🎯 Starting single-card-per-cell assignment algorithm');
    console.log(`📦 Processing ${orders.length} orders with ${molds.filter(m => m.enabled).length} enabled molds`);

    // Debug mold configurations
    molds.filter(m => m.enabled).forEach(mold => {
      console.log(`🔧 Mold ${mold.moldId}: ${mold.stockModels?.length || 0} stock models configured`);
    });

    // Calculate total daily employee capacity (orders per day)
    const totalEmployeeCapacity = employees.reduce((total, emp) => {
      return total + (emp.rate || 1.5) * (emp.hours || 8);
    }, 0);

    const maxOrdersPerDay = Math.floor(totalEmployeeCapacity); // Convert to whole orders
    console.log(`👥 Employee capacity: ${totalEmployeeCapacity.toFixed(1)} → ${maxOrdersPerDay} orders per day max`);

    // Track assignments per day and per mold
    const dailyAssignments: { [dateKey: string]: number } = {};
    const moldNextDate: { [moldId: string]: number } = {};

    // Initialize tracking
    allWorkDays.forEach(date => {
      const dateKey = date.toISOString().split('T')[0];
      dailyAssignments[dateKey] = 0;
    });

    molds.filter(m => m.enabled).forEach(mold => {
      moldNextDate[mold.moldId] = 0;
    });

    sortedOrders.forEach((order, index) => {
      const compatibleMolds = getCompatibleMolds(order);

      // Special logging for production orders and P1 purchase orders
      if (order.source === 'production_order' || order.source === 'p1_purchase_order') {
        console.log(`🏭 PROCESSING PRODUCTION ORDER ${order.orderId}:`, {
          stockModelId: order.stockModelId,
          modelId: order.modelId,
          product: order.product,
          compatibleMolds: compatibleMolds.length,
          compatibleMoldIds: compatibleMolds.map(m => m.moldId),
          allEnabledMolds: molds.filter(m => m.enabled).length,
          moldsWithMesaUniversal: molds.filter(m => m.enabled && m.stockModels?.includes('mesa_universal')).length
        });
      }

      if (compatibleMolds.length === 0) {
        console.log('⚠️ No compatible molds for order:', order.orderId, 'Source:', order.source);
        if (order.source === 'production_order') {
          console.log('❌ CRITICAL: Production order has no compatible molds!', {
            orderId: order.orderId,
            stockModelId: order.stockModelId,
            modelId: order.modelId,
            enabledMolds: molds.filter(m => m.enabled).length,
            moldsWithMesaUniversal: molds.filter(m => m.enabled && m.stockModels?.includes('mesa_universal')).map(m => m.moldId),
            allMoldsDetail: molds.filter(m => m.enabled).map(m => ({ moldId: m.moldId, stockModels: m.stockModels }))
          });
        }
        return;
      }

      let assigned = false;

      // Find the mold with the earliest available slot (no gaps allowed)
      let bestMold = null;
      let bestDateIndex = Infinity;

      for (const mold of compatibleMolds) {
        const nextDateIndex = moldNextDate[mold.moldId] || 0;

        // Must fill sequentially - use the EXACT next date for this mold
        if (nextDateIndex < allWorkDays.length && nextDateIndex < bestDateIndex) {
          const targetDate = allWorkDays[nextDateIndex];
          const dateKey = targetDate.toISOString().split('T')[0];
          const currentDailyLoad = dailyAssignments[dateKey] || 0;

          // Only assign if we haven't exceeded daily employee capacity
          if (currentDailyLoad < maxOrdersPerDay) {
            bestDateIndex = nextDateIndex;
            bestMold = mold;
          }
        }
      }

      if (bestMold && bestDateIndex < allWorkDays.length) {
        const targetDate = allWorkDays[bestDateIndex];
        const dateKey = targetDate.toISOString().split('T')[0];
        const cellKey = `${bestMold.moldId}-${dateKey}`;

        // Assign order to this cell
        newAssignments[order.orderId] = {
          moldId: bestMold.moldId,
          date: targetDate.toISOString()
        };

        // Update tracking
        cellAssignments.add(cellKey);
        dailyAssignments[dateKey] = (dailyAssignments[dateKey] || 0) + 1;
        moldNextDate[bestMold.moldId] = bestDateIndex + 1;

        assigned = true;
        const logPrefix = order.source === 'production_order' ? '🏭 PRODUCTION ORDER ASSIGNED:' : '✅ Assigned';
        console.log(`${logPrefix} ${order.orderId} to ${bestMold.moldId} on ${format(targetDate, 'MM/dd')} (${dailyAssignments[dateKey]}/${maxOrdersPerDay} daily capacity)`);
      }

      if (!assigned) {
        console.warn(`❌ Could not find available cell for order: ${order.orderId} - may exceed employee capacity`);
      }
    });

    console.log('📅 Generated schedule assignments:', Object.keys(newAssignments).length, 'orders assigned');
    console.log('🔒 Cell assignments (one per cell):', cellAssignments.size, 'cells occupied');
    // Show final mold distribution to verify no gaps
    console.log('🔧 Final mold distribution (next available date index):');
    Object.entries(moldNextDate).forEach(([moldId, dateIndex]) => {
      console.log(`  ${moldId}: filled up to day ${dateIndex} (${dateIndex > 0 ? format(allWorkDays[dateIndex - 1], 'MM/dd') : 'none'})`);
    });

    console.log('👥 Daily capacity usage:', Object.entries(dailyAssignments).map(([date, count]) => 
      `${format(new Date(date), 'MM/dd')}: ${count}/${maxOrdersPerDay} orders`
    ).slice(0, 8));

    setOrderAssignments(newAssignments);
    setHasUnsavedScheduleChanges(true);
  }, [orders, molds, employees, currentDate]);

  // Fetch stock models to get display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  }) as { data: any[] };

  const { data: features = [] } = useQuery({
    queryKey: ['/api/features'],
  }) as { data: any[] };

  // Print functionality
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Get current date range for title
    const dateRange = viewType === 'week' 
      ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'M/d')} - ${format(addDays(startOfWeek(currentDate, { weekStartsOn: 1 }), 4), 'M/d/yyyy')}`
      : format(currentDate, 'MMMM yyyy');

    // Helper function to get material type
    const getMaterialType = (modelId: string) => {
      if (!modelId) return null;
      if (modelId.startsWith('cf_')) return 'CF';
      if (modelId.startsWith('fg_')) return 'FG';
      if (modelId.includes('carbon')) return 'CF';
      if (modelId.includes('fiberglass')) return 'FG';
      return null;
    };

    // Helper function to get action length display
    const getActionLengthDisplay = (order: any) => {
      if (!order.features) return null;

      const modelId = order.stockModelId || order.modelId;
      const isAPR = modelId && modelId.toLowerCase().includes('apr');

      if (isAPR) {
        // For APR orders, show both action type AND action length
        let actionType = order.features.action_inlet || order.features.action;
        let actionLength = order.features.action_length;

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
      } else {
        // For non-APR orders, show action length
        let actionLengthValue = order.features.action_length;

        if ((!actionLengthValue || actionLengthValue === 'none') && order.features.action_inlet) {
          const inletToLengthMap: {[key: string]: string} = {
            'anti_ten_hunter_def': 'SA',
            'remington_700': 'SA',
            'rem_700': 'SA',
            'tikka_t3': 'SA',
            'savage_short': 'SA',
            'savage_long': 'LA'
          };
          actionLengthValue = inletToLengthMap[order.features.action_inlet] || 'SA';
        }

        if (!actionLengthValue || actionLengthValue === 'none') return null;

        const displayMap: {[key: string]: string} = {
          'Long': 'LA', 'Medium': 'MA', 'Short': 'SA',
          'long': 'LA', 'medium': 'MA', 'short': 'SA',
          'LA': 'LA', 'MA': 'MA', 'SA': 'SA'
        };

        return displayMap[actionLengthValue] || actionLengthValue;
      }
    };

    // Helper function to get LOP display
    const getLOPDisplay = (order: any) => {
      if (!order.features) return null;

      const lopValue = order.features.length_of_pull;

      if (!lopValue || 
          lopValue === 'none' || 
          lopValue === 'standard' || 
          lopValue === 'std' ||
          lopValue === 'no_lop_change' ||
          lopValue.toLowerCase().includes('std') ||
          lopValue.toLowerCase().includes('no extra')) {
        return null;
      }

      return lopValue;
    };

    // Helper function to check for heavy fill
    const getHeavyFillDisplay = (order: any) => {
      if (!order.features) return false;

      const otherOptions = order.features.other_options;
      if (Array.isArray(otherOptions) && otherOptions.includes('heavy_fill')) {
        return true;
      }

      const heavyFillValue = order.features.heavy_fill || order.features.heavyFill;
      return heavyFillValue === 'true' || heavyFillValue === true || heavyFillValue === 'yes';
    };

    // Get relevant molds (same logic as scheduler)
    const getCompatibleMolds = (order: any) => {
      const modelId = order.stockModelId || order.modelId;
      return molds.filter(mold => {
        if (!mold.enabled) return false;
        if (!mold.stockModels || mold.stockModels.length === 0) return true;
        return mold.stockModels.includes(modelId);
      });
    };

    const compatibleMoldIds = new Set<string>();
    orders.forEach(order => {
      const compatible = getCompatibleMolds(order);
      compatible.forEach(mold => compatibleMoldIds.add(mold.moldId));
    });

    const relevantMolds = molds.filter(m => {
      if (!m.enabled) return false;
      const hasAssignments = Object.values(orderAssignments).some(assignment => assignment.moldId === m.moldId);
      const isCompatibleWithQueue = compatibleMoldIds.has(m.moldId);
      return hasAssignments || isCompatibleWithQueue;
    });

    // Calculate order counts for sorting
    const moldOrderCounts = relevantMolds.map(mold => {
      const totalOrdersForMold = dates.reduce((count, date) => {
        const dateString = date.toISOString();
        const cellDateOnly = dateString.split('T')[0];

        const ordersForThisMoldDate = Object.entries(orderAssignments).filter(([orderId, assignment]) => {
          const assignmentDateOnly = assignment.date.split('T')[0];
          return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly;
        }).length;

        return count + ordersForThisMoldDate;
      }, 0);

      return { mold, orderCount: totalOrdersForMold };
    });

    // Sort molds by order count (descending)
    const sortedMolds = moldOrderCounts.sort((a, b) => {
      if (b.orderCount !== a.orderCount) {
        return b.orderCount - a.orderCount;
      }
      return a.mold.moldId.localeCompare(b.mold.moldId);
    });

    const activeMolds = sortedMolds.map(({ mold }) => mold);

    // Generate print content with exact card styling
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Layup Schedule - ${dateRange}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; 
              padding: 0;
              font-size: 9px;
              line-height: 1.1;
            }
            .header { 
              text-align: center; 
              margin: 0;
              margin-bottom: 2px; 
              border-bottom: 1px solid #333; 
              padding: 0;
              padding-bottom: 1px; 
            }
            .header h1 { 
              margin: 0; 
              padding: 0;
              font-size: 12px; 
            }
            .header h2 { 
              margin: 0; 
              padding: 0;
              font-size: 10px; 
              color: #666;
            }
            .header p { 
              margin: 0; 
              padding: 0;
              font-size: 8px; 
              color: #888;
            }
            .stats { 
              display: flex; 
              justify-content: space-between; 
              margin: 0;
              margin-bottom: 2px; 
              padding: 0;
              gap: 1px;
            }
            .stat { 
              background: #f5f5f5; 
              padding: 2px 3px; 
              border-radius: 1px; 
              text-align: center;
              font-size: 8px;
              font-weight: bold;
            }
            .schedule-grid { 
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #333; 
              background: white;
            }
            .schedule-table { 
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #333; 
            }
            .schedule-table th,
            .schedule-table td { 
              border: 1px solid #ccc;
              padding: 0.5px;
              vertical-align: top;
              text-align: center;
            }
            .schedule-table th { 
              background: #f5f5f5; 
              font-weight: bold; 
              font-size: 8px;
              padding: 2px 1px;
            }
            .schedule-table th.friday {
              background: #fff3cd;
              color: #856404;
            }
            .schedule-table .mold-header { 
              background: #e5e5e5; 
              font-weight: bold; 
              font-size: 8px;
              text-align: center;
              padding: 2px 1px;
              width: 50px;
            }
            .schedule-table .cell { 
              background: white;
              padding: 0.5px; 
              min-height: 25px; 
              width: auto;
            }
            .schedule-table .cell.friday {
              background: #fffbf0;
            }
            .order-count {
              font-size: 8px;
              color: #666;
              margin-bottom: 1px;
            }
            .order-card { 
              margin: 0 0 1px 0; 
              padding: 2px 3px; 
              border-radius: 2px; 
              font-size: 8px;
              border: 1px solid;
              text-align: center;
              line-height: 1.1;
            }
            .order-card.production { 
              background: #fff5e6; 
              border-color: #ffc069;
              color: #d46b08;
            }
            .order-card.fg { 
              background: #1e40af; 
              border-color: #1e3a8a;
              color: white;
            }
            .order-card.regular { 
              background: #e6f3ff; 
              border-color: #69b7ff;
              color: #1e40af;
            }
            .order-id {
              font-weight: bold;
              font-size: 8px;
            }
            .order-details {
              font-size: 7px;
              margin-top: 1px;
              opacity: 0.9;
            }
            .material-badge {
              display: inline-block;
              background: rgba(255,255,255,0.3);
              padding: 1px 2px;
              border-radius: 2px;
              font-weight: bold;
              font-size: 6px;
              margin-right: 2px;
            }
            .po-badge {
              display: inline-block;
              background: #ffc069;
              color: #d46b08;
              padding: 1px 2px;
              border-radius: 2px;
              font-weight: bold;
              font-size: 6px;
              margin-left: 2px;
            }
            .heavy-fill-badge {
              display: inline-block;
              background: #ff7875;
              color: white;
              padding: 1px 2px;
              border-radius: 2px;
              font-weight: bold;
              font-size: 6px;
              margin-top: 1px;
            }
            .lop-badge {
              display: inline-block;
              background: #ffec3d;
              color: #874d00;
              padding: 1px 2px;
              border-radius: 2px;
              font-weight: bold;
              font-size: 6px;
              margin-top: 1px;
            }
            .mold-info {
              font-size: 7px;
              margin-top: 1px;
              font-weight: bold;
              opacity: 0.8;
            }
            @media print { 
              body { 
                margin: 0 !important; 
                padding: 0 !important; 
                font-size: 8px !important;
                line-height: 1.1 !important;
              }
              .header { 
                margin: 0 !important;
                margin-bottom: 2px !important; 
                padding: 0 !important;
                padding-bottom: 2px !important; 
              }
              .header h1 { 
                font-size: 10px !important; 
              }
              .header h2 { 
                font-size: 8px !important; 
              }
              .header p { 
                font-size: 6px !important; 
              }
              .stats { 
                margin-bottom: 1px !important; 
              }
              .stat { 
                padding: 1px 2px !important; 
                font-size: 6px !important;
              }
              .schedule-table { 
                break-inside: avoid; 
                margin: 0 !important;
              }
              .schedule-table th { 
                padding: 1px !important; 
                font-size: 6px !important;
              }
              .schedule-table .mold-header { 
                padding: 1px !important; 
                font-size: 6px !important;
                width: 40px !important;
              }
              .schedule-table .cell { 
                padding: 0.5px !important; 
                min-height: 25px !important; 
              }
              .order-card { 
                margin: 0 0 0.5px 0 !important; 
                padding: 1px 2px !important; 
                font-size: 6px !important;
              }
              .order-id {
                font-size: 6px !important;
              }
              .order-details {
                font-size: 5px !important;
              }
              .mold-info {
                font-size: 5px !important;
              }
              .material-badge, .po-badge, .heavy-fill-badge, .lop-badge {
                font-size: 4px !important;
                padding: 0.5px 1px !important;
              }
              .order-count {
                font-size: 6px !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>P1 Layup Production Schedule</h1>
            <h2>${dateRange}</h2>
            <p>Generated on ${format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
          </div>

          <div class="stats">
            <div class="stat">Total Orders: ${orders.length}</div>
            <div class="stat">Production Orders: ${orders.filter(o => o.source === 'production_order').length}</div>
            <div class="stat">Active Molds: ${activeMolds.length}</div>
            <div class="stat">Employees: ${employees.length}</div>
          </div>

          <table class="schedule-table">
            ${(() => {
              // Find all dates that have at least one order assigned
              const datesWithOrders = dates.filter(date => {
                const dateString = date.toISOString();
                const cellDateOnly = dateString.split('T')[0];

                return Object.values(orderAssignments).some(assignment => {
                  const assignmentDateOnly = assignment.date.split('T')[0];
                  return assignmentDateOnly === cellDateOnly;
                });
              });

              if (datesWithOrders.length === 0) {
                return '<tr><th colspan="2">No Orders Scheduled</th></tr>';
              }

              // Create header row
              const headerRow = `
                <tr>
                  <th class="mold-header">Mold</th>
                  ${datesWithOrders.map(date => {
                    const isFriday = date.getDay() === 5;
                    return `
                      <th class="${isFriday ? 'friday' : ''}">
                        ${format(date, 'MM/dd')}<br>
                        <small>${format(date, 'EEE')}</small>
                        ${isFriday ? '<br><small style="font-size: 6px;">Backup</small>' : ''}
                      </th>
                    `;
                  }).join('')}
                </tr>
              `;

              // Create mold rows - only for molds that have orders
              const moldRows = activeMolds.filter(mold => {
                // Check if this mold has any orders
                return datesWithOrders.some(date => {
                  const dateString = date.toISOString();
                  const cellDateOnly = dateString.split('T')[0];
                  
                  return Object.entries(orderAssignments).some(([orderId, assignment]) => {
                    const assignmentDateOnly = assignment.date.split('T')[0];
                    return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly;
                  });
                });
              }).map(mold => {
                return `
                  <tr>
                    <td class="mold-header">
                      ${mold.moldId}<br><small>#${mold.instanceNumber}</small>
                    </td>
                    ${datesWithOrders.map(date => {
                      const dateString = date.toISOString();
                      const cellDateOnly = dateString.split('T')[0];
                      const isFriday = date.getDay() === 5;

                      const cellOrders = Object.entries(orderAssignments)
                        .filter(([orderId, assignment]) => {
                          const assignmentDateOnly = assignment.date.split('T')[0];
                          return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly;
                        })
                        .map(([orderId]) => orders.find(o => o.orderId === orderId))
                        .filter(order => order !== undefined);

                      if (cellOrders.length === 0) {
                        return '<td class="cell"></td>';
                      }

                      return `
                        <td class="cell ${isFriday ? 'friday' : ''}">
                          <div class="order-count">${cellOrders.length} order(s)</div>
                          ${cellOrders.map(order => {
                            const modelId = order.stockModelId || order.modelId;
                            const materialType = getMaterialType(modelId || '');
                            const isProduction = order.source === 'production_order';
                            const displayId = getDisplayOrderId(order) || 'No ID';
                            const modelName = getModelDisplayName(modelId || '');
                            const actionLength = getActionLengthDisplay(order);
                            const lopDisplay = getLOPDisplay(order);
                            const hasHeavyFill = getHeavyFillDisplay(order);

                            let cardClass = 'regular';
                            if (isProduction) cardClass = 'production';
                            else if (materialType === 'FG') cardClass = 'fg';

                            return `
                              <div class="order-card ${cardClass}">
                                <div class="order-id">
                                  ${displayId}
                                  ${isProduction ? '<span class="po-badge">PO</span>' : ''}
                                </div>
                                <div class="order-details">
                                  ${materialType ? `<span class="material-badge">${materialType}</span>` : ''}
                                  ${modelName}
                                </div>
                                ${actionLength ? `<div class="order-details">${actionLength}</div>` : ''}
                                <div class="mold-info">
                                  ${actionLength ? `${actionLength} ` : ''}${mold.moldId}${mold.instanceNumber ? ` #${mold.instanceNumber}` : ''}
                                </div>
                                ${lopDisplay ? `<div class="lop-badge">LOP: ${lopDisplay}</div>` : ''}
                                ${hasHeavyFill ? '<div class="heavy-fill-badge">Heavy Fill</div>' : ''}
                              </div>
                            `;
                          }).join('')}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `;
              }).join('');

              return headerRow + moldRows;
            })()}
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  // Helper function to get model display name
  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';

    const model = (stockModels as any[]).find((m: any) => m.id === modelId);
    if (model?.displayName) {
      return model.displayName;
    }

    // If no display name found, try to create a readable version from the ID
    if (modelId.includes('_')) {
      // Convert technical IDs like "cf_adj_chalk_branch" to "CF Adj Chalk Branch"
      return modelId
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    return model?.name || modelId;
  };

  // Debug logging with emojis for visibility
  console.log('🎯 LayupScheduler - Orders data:', orders);
  console.log('📊 LayupScheduler - Orders count:', orders?.length);
  console.log('🔍 LayupScheduler - Sample order:', orders?.[0]);

  // Debug production orders and P1 purchase orders specifically
  const productionOrders = orders.filter(order => order.source === 'production_order' || order.source === 'p1_purchase_order');
  console.log('🏭 LayupScheduler - Production/P1 orders:', productionOrders.length);
  if (productionOrders.length > 0) {
    console.log('🏭 LayupScheduler - Sample production/P1 order:', productionOrders[0]);
    console.log('🏭 LayupScheduler - Production/P1 order stockModelId:', productionOrders[0].stockModelId);
    console.log('🏭 LayupScheduler - Production/P1 order modelId:', productionOrders[0].modelId);

    // Check if production/P1 orders are being assigned
    const assignedProductionOrders = productionOrders.filter(order => orderAssignments[order.orderId]);
    console.log('🏭 LayupScheduler - Assigned production/P1 orders:', assignedProductionOrders.length);
    if (assignedProductionOrders.length === 0) {
      console.log('❌ NO PRODUCTION/P1 ORDERS ASSIGNED! This is why they are not visible');
    } else {
      console.log('✅ Production/P1 orders assigned:', assignedProductionOrders.map(o => o.orderId));
    }
  }

  // Force auto-schedule trigger when production/P1 orders are loaded
  if (productionOrders.length > 0 && molds?.length > 0 && employees?.length > 0) {
    console.log('🏭 Triggering auto-schedule for production/P1 orders...');
  }

  // Debug Mesa Universal molds
  const mesaMolds = molds?.filter(m => m.moldId.includes('Mesa'));
  console.log('🏔️ LayupScheduler - Mesa molds:', mesaMolds?.map(m => ({ moldId: m.moldId, stockModels: m.stockModels })));

  console.log('📋 LayupScheduler - Order Assignments:', orderAssignments);
  console.log('🏭 LayupScheduler - All Molds:', molds?.map(m => ({ moldId: m.moldId, instanceNumber: m.instanceNumber, stockModels: m.stockModels })));
  console.log('⚙️ LayupScheduler - Employees:', employees?.length, 'employees loaded');

  // Debug unassigned orders - especially production and P1 purchase orders
  const unassignedOrders = orders.filter(order => !orderAssignments[order.orderId]);
  const unassignedProductionOrders = unassignedOrders.filter(o => o.source === 'production_order' || o.source === 'p1_purchase_order');
  console.log('🔄 Unassigned orders:', unassignedOrders.length, unassignedOrders.map(o => o.orderId));
  console.log('🏭 Unassigned PRODUCTION/P1 orders:', unassignedProductionOrders.length, unassignedProductionOrders.map(o => o.orderId));


  // Auto-generate schedule when data is loaded OR when production/P1 orders are present
  useEffect(() => {
    const productionOrders = orders.filter(o => o.source === 'production_order' || o.source === 'p1_purchase_order');
    const unassignedProductionOrders = productionOrders.filter(o => !orderAssignments[o.orderId]);

    const shouldRunAutoSchedule = orders.length > 0 && molds.length > 0 && employees.length > 0 && (
      Object.keys(orderAssignments).length === 0 || // Initial run
      unassignedProductionOrders.length > 0 // New production orders need assignment
    );

    if (shouldRunAutoSchedule) {
      console.log("🚀 Auto-running schedule generation");
      console.log("📊 Data available:", { orders: orders.length, molds: molds.length, employees: employees.length });
      console.log("🏭 Production orders in data:", productionOrders.length);
      console.log("🏭 Unassigned production orders:", unassignedProductionOrders.length);
      setTimeout(() => generateAutoSchedule(), 1000); // Delay to let UI render
    }
  }, [orders.length,molds.length, employees.length, orderAssignments, generateAutoSchedule]);




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
      dueDate: order.dueDate ? new Date(order.dueDate) : undefined,
      priorityScore: order.priorityScore,
      customer: order.customer,
      product: order.product,
      modelId: order.modelId,
      stockModelId: order.stockModelId,
      source: order.source, // Include source field for production order detection
    }));

    const moldData = molds.map(mold => ({
      moldId: mold.moldId,
      modelName: mold.modelName,
      instanceNumber: mold.instanceNumber,
      enabled: mold.enabled ?? true,
      multiplier: mold.multiplier,
      stockModels: mold.stockModels || [], // Include stock model compatibility for P1 purchase orders
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
      console.log('🚀 Applying automatic schedule:', schedule.length, 'assignments');

      // Debug production orders and P1 purchase orders in schedule
      const productionScheduleItems = schedule.filter(item => {
        const order = orders.find(o => o.orderId === item.orderId);
        return order?.source === 'production_order' || order?.source === 'p1_purchase_order';
      });
      console.log('🏭 Production/P1 orders in schedule:', productionScheduleItems.length);

      const autoAssignments: {[orderId: string]: { moldId: string, date: string }} = {};

      schedule.forEach(item => {
        const order = orders.find(o => o.orderId === item.orderId);
        const isProduction = order?.source === 'production_order' || order?.source === 'p1_purchase_order';
        if (isProduction) {
          console.log(`🏭 PRODUCTION/P1 ORDER ASSIGNMENT: ${item.orderId} (${order?.source}) → mold ${item.moldId} on ${item.scheduledDate.toDateString()}`);
        }

        autoAssignments[item.orderId] = {
          moldId: item.moldId,
          date: item.scheduledDate.toISOString()
        };
      });

      setOrderAssignments(autoAssignments);
      setHasUnsavedScheduleChanges(true);
      console.log('✅ Auto-assigned orders:', Object.keys(autoAssignments).length);
      console.log('✅ Production/P1 orders assigned:', Object.keys(autoAssignments).filter(orderId => {
        const order = orders.find(o => o.orderId === orderId);
        return order?.source === 'production_order' || order?.source === 'p1_purchase_order';
      }).length);
    } else {
      console.log('❌ Not applying auto-schedule:', {
        scheduleLength: schedule.length,
        existingAssignments: Object.keys(orderAssignments).length
      });
    }
  }, [schedule, orderAssignments]);

  // Build date columns
  // Generate date ranges based on view type - Mon-Thu primary with Fri as backup
  const dates = useMemo(() => {
    if (viewType === 'day') return [currentDate];
    if (viewType === 'week') {
      // Show work week: Monday through Friday (with Friday as backup)
      const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
      return eachDayOfInterval({ start, end: addDays(start, 4) }); // 5 days (Mon-Fri)
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
    const dropTargetId = over.id as string;

    // Parse the drop target ID (format: moldId|dateISO)
    const [moldId, dateIso] = dropTargetId.split('|');

    if (!moldId || !dateIso) {
      console.warn('Invalid drop target:', dropTargetId);
      return;
    }

    console.log(`Moving order ${orderId} to mold ${moldId} on ${dateIso}`);

    // Update local assignment state
    setOrderAssignments(prev => ({
      ...prev,
      [orderId]: { moldId, date: dateIso }
    }));

    // Mark as having unsaved changes
    setHasUnsavedScheduleChanges(true);
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
    console.log(`📝 Employee change: ${employeeId} ${field} = ${value}`);

    setEmployeeChanges(prev => {
      const newChanges = {
        ...prev,
        [employeeId]: {
          ...prev[employeeId],
          [field]: value
        }
      };
      console.log('Updated employee changes:', newChanges);
      return newChanges;
    });
    setHasUnsavedChanges(true);
    console.log('Unsaved changes flag set to true');
  };

  const handleSaveEmployeeChanges = async () => {
    try {
      console.log('💾 EMPLOYEE SAVE DEBUG - Starting save process');
      console.log('Employee changes to save:', employeeChanges);

      // Save all changes
      const savePromises = Object.entries(employeeChanges).map(([employeeId, changes]) => {
        const employee = employees.find(emp => emp.employeeId === employeeId);
        console.log(`Saving employee ${employeeId}:`, { employee, changes });

        if (employee) {
          const updatedEmployee = {
            ...employee,
            ...changes
          };
          console.log(`Final employee data for ${employeeId}:`, updatedEmployee);
          return saveEmployee(updatedEmployee);
        }
        return Promise.resolve();
      });

      console.log(`Executing ${savePromises.length} save operations`);
      await Promise.all(savePromises);

      console.log('✅ All employee changes saved successfully');

      // Clear unsaved changes
      setEmployeeChanges({});
      setHasUnsavedChanges(false);

      // Refresh the employee list
      console.log('🔄 Refreshing employee list to verify changes');
      await refetchEmployees();

      console.log('💾 EMPLOYEE SAVE DEBUG - Complete');
    } catch (error) {
      console.error('❌ Failed to save employee changes:', error);
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
    <div className="h-full flex flex-col">
      {/* Sticky Header Container */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        {/* Navigation Header */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Layup Scheduler</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">P1 Order Production Scheduling</p>
            </div>
            <div className="flex items-center space-x-4 text-sm">
              <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
                <span className="text-blue-700 dark:text-blue-300 font-medium">{orders.length} Total Orders</span>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                <span className="text-green-700 dark:text-green-300 font-medium">
                  {orders.filter(o => o.source === 'p1_purchase_order').length} P1 Purchase Orders
                </span>
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-900/20 px-3 py-2 rounded-lg">
                <span className="text-cyan-700 dark:text-cyan-300 font-medium">{molds.filter(m => m.enabled).length} Active Molds</span>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-lg">
                <span className="text-purple-700 dark:text-purple-300 font-medium">{employees.length} Employees</span>
              </div>
            </div>
          </div>
        </div>

        {/* Control Bar */}
        <div className="px-6 pb-4">
          <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex space-x-2">

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
                            {editingMoldId === mold.moldId ? (
                              <Input
                                value={editingMoldName}
                                onChange={(e) => setEditingMoldName(e.target.value)}
                                className="font-medium text-base h-6 px-2"
                                placeholder="Mold Name"
                              />
                            ) : (
                              <div className="font-medium text-base">
                                {mold.modelName} #{mold.instanceNumber}
                              </div>
                            )}
                            <Badge variant={mold.isActive ? "default" : "secondary"}>
                              {mold.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            Mold ID: {mold.moldId}
                          </div>

                          {/* Edit Controls */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Configuration:</span>
                              {editingMoldId === mold.moldId ? (
                                <div className="space-x-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      saveMold({ 
                                        ...mold, 
                                        modelName: editingMoldName.trim() || mold.modelName,
                                        stockModels: editingMoldStockModels 
                                      });
                                      setEditingMoldId(null);
                                      setEditingMoldStockModels([]);
                                      setEditingMoldName('');
                                    }}
                                    className="h-6 px-2 text-xs"
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingMoldId(null);
                                      setEditingMoldStockModels([]);
                                      setEditingMoldName('');
                                    }}
                                    className="h-6 px-2 text-xs"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingMoldId(mold.moldId);
                                    setEditingMoldStockModels(mold.stockModels || []);
                                    setEditingMoldName(mold.modelName || '');
                                  }}
                                  className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700"
                                >
                                  Edit
                                </Button>
                              )}
                            </div>

                            {/* Stock Models Display */}
                            <div>
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Stock Models:</span>

                              {editingMoldId === mold.moldId ? (
                              <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2 bg-white dark:bg-gray-900">
                                {stockModels.map((model: any) => (
                                  <div key={model.id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`edit-stock-${mold.moldId}-${model.id}`}
                                      checked={editingMoldStockModels.includes(model.id)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setEditingMoldStockModels(prev => [...prev, model.id]);
                                        } else {
                                          setEditingMoldStockModels(prev => prev.filter(id => id !== model.id));
                                        }
                                      }}
                                    />
                                    <label 
                                      htmlFor={`edit-stock-${mold.moldId}-${model.id}`}
                                      className="text-xs cursor-pointer"
                                    >
                                      {model.displayName || model.name || model.id}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {mold.stockModels && mold.stockModels.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {mold.stockModels.map((stockModelId: string) => {
                                      const stockModel = stockModels.find((sm: any) => sm.id === stockModelId);
                                      return (
                                        <span key={stockModelId} className="bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-md text-xs">
                                          {stockModel?.displayName || stockModel?.name || stockModelId}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="italic">No stock models assigned</span>
                                )}
                              </div>
                              )}
                            </div>
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
            {hasUnsavedScheduleChanges && (
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveSchedule}
                disabled={isSaving}
                className="mr-2 bg-green-600 hover:bg-green-700 text-white"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Save Schedule
                  </>
                )}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="mr-4"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Schedule
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handlePushScheduledToQueue}
              disabled={pushToLayupPluggingMutation.isPending}
              className="mr-4 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {pushToLayupPluggingMutation.isPending ? (
                <>
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Processing...
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Push to Queue
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRunPythonScheduler}
              disabled={pythonSchedulerMutation.isPending}
              className="mr-4"
            >
              {pythonSchedulerMutation.isPending ? (
                <>
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Running...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Python Scheduler
                </>
              )}
            </Button>

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
      </div>

        {/* Sticky Date Headers */}
        {(viewType === 'week' || viewType === 'day') && (
          <div className="sticky top-[calc(theme(spacing.20)+theme(spacing.32))] z-[9] bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-2">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}
            >
              {dates.map(date => {
                const isFriday = date.getDay() === 5;
                return (
                  <div
                    key={date.toISOString()}
                    className={`p-3 border text-center font-semibold text-sm ${
                      isFriday 
                        ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20' 
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                    }`}
                  >
                    {format(date, 'MM/dd')}
                    <div className={`text-xs mt-1 ${
                      isFriday 
                        ? 'text-amber-600 dark:text-amber-400' 
                        : 'text-gray-500'
                    }`}>
                      {format(date, 'EEE')}
                      {isFriday && <div className="text-[10px] font-medium">Backup</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-auto">
        <DndContext 
          sensors={sensors} 
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="px-6 pb-6">
            {/* Week-based Calendar Layout */}
            {viewType === 'week' || viewType === 'day' ? (
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}
              >

              {/* Rows for each mold - Show relevant molds sorted by order count (most orders first) */}
              {(() => {
                console.log(`📊 DEBUG: Calendar Display Summary`);
                console.log(`  • Total enabled molds: ${molds.filter(m => m.enabled).length}`);
                console.log(`  • Total order assignments: ${Object.keys(orderAssignments).length}`);

                // Get molds that either have orders OR are compatible with existing orders in queue
                const getCompatibleMolds = (order: any) => {
                  const modelId = order.stockModelId || order.modelId;
                  return molds.filter(mold => {
                    if (!mold.enabled) return false;
                    if (!mold.stockModels || mold.stockModels.length === 0) return true; // No restrictions
                    return mold.stockModels.includes(modelId);
                  });
                };

                // Find molds that are compatible with any order in the current queue
                const compatibleMoldIds = new Set<string>();
                orders.forEach(order => {
                  const compatible = getCompatibleMolds(order);
                  compatible.forEach(mold => compatibleMoldIds.add(mold.moldId));
                });

                // Get molds that either have assignments OR are compatible with queue orders
                const relevantMolds = molds.filter(m => {
                  if (!m.enabled) return false;

                  // Include if mold has orders assigned
                  const hasAssignments = Object.values(orderAssignments).some(assignment => assignment.moldId === m.moldId);
                  if (hasAssignments) return true;

                  // Include if mold is compatible with orders in queue (genuinely available)
                  const isCompatibleWithQueue = compatibleMoldIds.has(m.moldId);
                  return isCompatibleWithQueue;
                });

                // Calculate order counts for relevant molds
                const moldOrderCounts = relevantMolds.map(mold => {
                  const totalOrdersForMold = dates.reduce((count, date) => {
                    const dateString = date.toISOString();
                    const cellDateOnly = dateString.split('T')[0];

                    const ordersForThisMoldDate = Object.entries(orderAssignments).filter(([orderId, assignment]) => {
                      const assignmentDateOnly = assignment.date.split('T')[0];
                      return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly;
                    }).length;

                    return count + ordersForThisMoldDate;
                  }, 0);

                  return { mold, orderCount: totalOrdersForMold };
                });

                // Sort molds by order count (descending) - molds with most orders at top, available molds at bottom
                const sortedMolds = moldOrderCounts.sort((a, b) => {
                  if (b.orderCount !== a.orderCount) {
                    return b.orderCount - a.orderCount; // Primary sort: more orders first
                  }
                  // Secondary sort: alphabetical by mold ID for consistent ordering
                  return a.mold.moldId.localeCompare(b.mold.moldId);
                });

                console.log(`  • Relevant molds (with orders or compatible): ${relevantMolds.length}/${molds.filter(m => m.enabled).length}`);
                console.log(`  • Mold order counts:`, sortedMolds.map(({ mold, orderCount }) => 
                  `${mold.moldId}: ${orderCount} orders`
                ));

                // Use only relevant molds
                const activeMolds = sortedMolds.map(({ mold }) => mold);

                return activeMolds.map(mold => (
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
                        processedOrders={processedOrders}
                      />
                    );
                  })}
                </React.Fragment>
                ));
              })()}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Month view not yet implemented
              </div>
            )}
          </div>

          <DragOverlay>
            {activeId ? (
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded border shadow-lg text-xs">
                {activeId}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}