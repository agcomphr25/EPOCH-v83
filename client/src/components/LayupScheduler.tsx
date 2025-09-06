import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { generateLayupSchedule } from '../utils/schedulerUtils';
import { scheduleLOPAdjustments, identifyLOPOrders, getLOPStatus } from '../utils/lopScheduler';
import useMoldSettings from '../hooks/useMoldSettings';
import useEmployeeSettings from '../hooks/useEmployeeSettings';
import { useUnifiedLayupOrders } from '../hooks/useUnifiedLayupOrders';
import { apiRequest } from '@/lib/queryClient';
import AlgorithmicScheduler from './AlgorithmicScheduler';
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
  closestCenter,
  closestCorners,
} from '@dnd-kit/core';
// SortableContext removed - using basic drag and drop instead
import { CSS } from '@dnd-kit/utilities';
import {
  addDays,
  format,
  isSameDay,
  startOfWeek,
  endOfWeek,
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
import { ChevronLeft, ChevronRight, Calendar, Grid3X3, Calendar1, Settings, Users, Plus, Zap, Printer, ArrowRight, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { getDisplayOrderId, validateNoFridayAssignments } from '@/lib/orderUtils';
import { useToast } from '@/hooks/use-toast';


// Draggable Order Item Component with responsive sizing - memoized for performance
const DraggableOrderItem = React.memo(({ order, priority, totalOrdersInCell, moldInfo, getModelDisplayName, features, processedOrders, isLocked }: { order: any, priority: number, totalOrdersInCell?: number, moldInfo?: { moldId: string, instanceNumber?: number }, getModelDisplayName?: (modelId: string) => string, features?: any[], processedOrders?: any[], isLocked?: boolean }) => {
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
    },
    disabled: isLocked || false
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
    // Direct CF prefixes
    if (modelId.startsWith('cf_')) return 'CF';
    // Direct FG prefixes
    if (modelId.startsWith('fg_')) return 'FG';
    // Exact FG match
    if (modelId === 'fg') return 'FG';
    // Material keywords
    if (modelId.includes('carbon')) return 'CF';
    if (modelId.includes('fiberglass')) return 'FG';
    // FG suffix patterns
    if (modelId.endsWith('_fg')) return 'FG';
    // Default patterns for common models
    if (modelId.includes('alpine_hunter_tikka') && !modelId.endsWith('_fg')) return 'CF';
    if (modelId.includes('privateer-tikka') && !modelId.endsWith('_fg')) return 'CF';
    if (modelId.includes('apr_hunter')) return 'CF';
    return null;
  };

  const modelId = order.stockModelId || order.modelId;
  const materialType = getMaterialType(modelId || '');

  // Debug logging for material type detection (can be removed after verification)
  if (['AG079', 'AG073', 'AG072', 'AG070', 'AG078'].includes(order.orderId)) {
    console.log(`🎨 CARD COLOR DEBUG for ${order.orderId}:`, {
      source: order.source,
      modelId: modelId,
      stockModelId: order.stockModelId,
      orderModelId: order.modelId,
      materialType: materialType,
      expectedColor:
        order.source === 'production_order' ? 'PURPLE (Purchase Order)' :
        materialType === 'CF' ? 'DEEP ORANGE (CF)' :
        materialType === 'FG' ? 'LIGHT ORANGE (FG)' : 'GRAY (Unknown)'
    });
  }

  // Determine card styling based on source and material
  const getCardStyling = () => {
    // Check if this is a purchase order (has poId or productionOrderId)
    // BUT exclude Mesa Universal orders - they should always be colored by material type
    if ((order.poId || order.productionOrderId || order.source === 'production_order') && 
        modelId !== 'mesa_universal') {
      return {
        bg: 'bg-purple-100 dark:bg-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-800/70 border-2 border-purple-300 dark:border-purple-600',
        text: 'text-purple-800 dark:text-purple-200'
      };
    } else if (materialType === 'CF') {
      // CF cards: Orange-200 (light orange)
      return {
        bg: 'bg-orange-200 dark:bg-orange-800/50 hover:bg-orange-300 dark:hover:bg-orange-800/70 border-2 border-orange-300 dark:border-orange-600',
        text: 'text-orange-800 dark:text-orange-200'
      };
    } else if (materialType === 'FG') {
      // FG cards: Orange-600 (darker orange)
      return {
        bg: 'bg-orange-600 dark:bg-orange-700/80 hover:bg-orange-700 dark:hover:bg-orange-800/90 border-2 border-orange-700 dark:border-orange-800',
        text: 'text-white dark:text-orange-100'
      };
    } else {
      // Default/unknown material
      return {
        bg: 'bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-800/70 border-2 border-gray-300 dark:border-gray-600',
        text: 'text-gray-800 dark:text-gray-200'
      };
    }
  };

  const cardStyling = getCardStyling();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(isLocked ? {} : listeners)}
      className={`${sizing.padding} ${sizing.margin} ${sizing.height} ${cardStyling.bg} rounded-lg shadow-md transition-all duration-200 touch-manipulation select-none ${
        isLocked ? 'cursor-default opacity-75 border-dashed' : 'cursor-grab active:cursor-grabbing'
      }`}
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
});

// Droppable Cell Component with responsive height
function DroppableCell({
  moldId,
  date,
  orders,
  onDrop,
  moldInfo,
  getModelDisplayName,
  features,
  processedOrders,
  selectedWorkDays = [1, 2, 3, 4], // Default Mon-Thu
  isWeekLocked
}: {
  moldId: string;
  date: Date;
  orders: any[];
  onDrop: (orderId: string, moldId: string, date: Date) => void;
  moldInfo?: { moldId: string, instanceNumber?: number };
  getModelDisplayName?: (modelId: string) => string;
  features?: any[];
  processedOrders?: any[];
  selectedWorkDays?: number[];
  isWeekLocked: (date: Date) => boolean;
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



  const dayOfWeek = date.getDay();
  const isNonWorkDay = !selectedWorkDays.includes(dayOfWeek);
  const isFriday = dayOfWeek === 5;
  const isWorkDay = selectedWorkDays.includes(dayOfWeek);
  const hasOrders = orders.length > 0;

  // FIXED LOGIC: Never hide cells that have orders, always show work days, show Friday for manual adjustments
  const weekIsLocked = isWeekLocked(date);
  const shouldHideCell = false; // Never hide cells with orders - this was causing Monday to disappear
  const shouldHideEmptyCell = !hasOrders && !isWorkDay && !isFriday; // Only hide empty non-work, non-Friday cells

  return (
    <div
      ref={setNodeRef}
      className={`${cellHeight} border p-1 transition-all duration-200 ${
        shouldHideCell || shouldHideEmptyCell
          ? 'border-transparent bg-transparent opacity-0 pointer-events-none'
          : isOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : isNonWorkDay
              ? 'border-amber-200 dark:border-amber-700 bg-amber-25 dark:bg-amber-900/10 opacity-75'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
    >
      {!(shouldHideCell || shouldHideEmptyCell) && (
        <>
          {orders.length > 0 && (
            <div className="text-xs text-gray-500 mb-1">
              {orders.length} order(s)
            </div>
          )}
          {orders.map((order, idx) => {
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
                isLocked={weekIsLocked}
              />
            );
          })}
          {orders.length === 0 && !weekIsLocked && (
            <div className="text-xs text-gray-400 text-center py-2 opacity-50">
              {isNonWorkDay ? 'Non-work day' : 'Available'}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function LayupScheduler() {
  const [viewType, setViewType] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(() => {
    // FORCE CURRENT WEEK: Initialize to start of current week to fix auto-advance issue
    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    console.log(`📅 FORCE CURRENT WEEK: Initialized to ${currentWeekStart.toDateString()}`);
    return currentWeekStart;
  });
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
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [selectedWorkDays, setSelectedWorkDays] = useState<number[]>([1, 2, 3, 4]); // Default: Mon-Thu
  
  // Apply button state management
  const [pendingWorkDays, setPendingWorkDays] = useState<number[]>([1, 2, 3, 4]);
  const [pendingEmployeeChanges, setPendingEmployeeChanges] = useState<{[key: string]: {rate: number, dailyCapacity: number, hours: number}}>({});
  const [pendingMoldChanges, setPendingMoldChanges] = useState<{[key: string]: {enabled: boolean, multiplier: number}}>({});
  const [isApplyingChanges, setIsApplyingChanges] = useState(false);

  // Track order assignments (orderId -> { moldId, date })
  const [orderAssignments, setOrderAssignments] = useState<{[orderId: string]: { moldId: string, date: string }}>({});

  // Clear schedule function for testing
  const clearSchedule = useCallback(async () => {
    console.log('🧹 CLEARING ALL SCHEDULE ASSIGNMENTS AND DATABASE');
    
    try {
      // Clear frontend state
      setOrderAssignments({});
      
      // Reset auto-schedule trigger so it can run again
      hasTriggeredAutoSchedule.current = false;
      
      // Clear database schedule entries and remove any Friday assignments
      const response = await fetch('/api/layup-schedule', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleanupFridays: true })
      });
      
      if (response.ok) {
        toast({
          title: "Schedule Cleared",
          description: "All assignments cleared and auto-schedule reset. Ready for fresh scheduling.",
        });
      } else {
        toast({
          title: "Schedule Cleared (Frontend Only)",
          description: "Frontend cleared successfully. Database cleanup may need manual attention.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error clearing database schedule:', error);
      toast({
        title: "Schedule Cleared (Frontend Only)", 
        description: "Frontend cleared successfully. Database cleanup failed.",
        variant: "destructive"
      });
    }
  }, []);
  const [initialFridayCleanup, setInitialFridayCleanup] = useState(false);
  const hasTriggeredAutoSchedule = useRef(false);
  // Week-specific lock state instead of global lock
  const [lockedWeeks, setLockedWeeks] = useState<{[weekKey: string]: boolean}>({
    '2025-08-18': true, // Week of 8/18-8/22 is locked
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Apply functions for settings
  const applyWorkDayChanges = () => {
    setIsApplyingChanges(true);
    
    // Handle capacity redistribution logic (same as before)
    const removedDays = selectedWorkDays.filter(day => !pendingWorkDays.includes(day));
    
    if (removedDays.length > 0) {
      removedDays.forEach(day => {
        const ordersOnRemovedDay = Object.entries(orderAssignments).filter(([orderId, assignment]) => {
          const assignmentDate = new Date(assignment.date);
          return assignmentDate.getDay() === day;
        });
        
        if (ordersOnRemovedDay.length > 0) {
          console.log(`🔄 Handling capacity reduction: ${ordersOnRemovedDay.length} orders affected by removing work day ${day}`);
          
          const newWorkDays = pendingWorkDays;
          const dailyCapacity = 20;
          const newTotalCapacity = newWorkDays.length * dailyCapacity * 4;
          
          const allAssignedOrders = Object.entries(orderAssignments)
            .filter(([orderId, assignment]) => {
              const assignmentDate = new Date(assignment.date);
              return newWorkDays.includes(assignmentDate.getDay());
            })
            .map(([orderId, assignment]) => {
              const orderData = orders.find((o: any) => o.orderId === orderId);
              return {
                orderId,
                assignment,
                priorityScore: orderData?.priorityScore || 99,
                source: orderData?.source || 'regular'
              };
            });
          
          const ordersFromRemovedDay = ordersOnRemovedDay.map(([orderId]) => {
            const orderData = orders.find((o: any) => o.orderId === orderId);
            return {
              orderId,
              assignment: null,
              priorityScore: orderData?.priorityScore || 99,
              source: orderData?.source || 'regular'
            };
          });
          
          const allOrdersByPriority = [...allAssignedOrders, ...ordersFromRemovedDay]
            .sort((a, b) => {
              const aIsP1PO = a.source === 'p1_purchase_order';
              const bIsP1PO = b.source === 'p1_purchase_order';
              if (aIsP1PO && !bIsP1PO) return -1;
              if (!aIsP1PO && bIsP1PO) return 1;
              return a.priorityScore - b.priorityScore;
            });
          
          const ordersToKeep = allOrdersByPriority.slice(0, Math.floor(newTotalCapacity * 0.8));
          const ordersToRemove = allOrdersByPriority.slice(Math.floor(newTotalCapacity * 0.8));
          
          const updatedAssignments = { ...orderAssignments };
          
          ordersOnRemovedDay.forEach(([orderId]) => {
            delete updatedAssignments[orderId];
          });
          
          ordersToRemove.forEach(order => {
            if (order.assignment) {
              delete updatedAssignments[order.orderId];
            }
          });
          
          setOrderAssignments(updatedAssignments);
          setHasUnsavedChanges(true);
          
          const removedCount = ordersOnRemovedDay.length + ordersToRemove.filter(o => o.assignment).length;
          toast({
            title: "Work Day Removed",
            description: `Redistributed schedule: ${ordersToKeep.filter(o => !o.assignment).length} orders kept, ${removedCount} lowest priority orders moved to production queue`,
          });
        }
      });
    }
    
    setSelectedWorkDays(pendingWorkDays);
    setIsApplyingChanges(false);
    
    toast({
      title: "Work Days Updated",
      description: `Work days set to: ${pendingWorkDays.map(d => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][d]).join(', ')}`,
    });
  };
  
  const applyEmployeeChanges = async () => {
    setIsApplyingChanges(true);
    
    try {
      const updates = Object.entries(pendingEmployeeChanges);
      
      for (const [employeeId, changes] of updates) {
        // Convert moldsPerHour to rate for API compatibility
        const apiPayload = {
          rate: changes.moldsPerHour || 1.25,
          hours: changes.hours || 8,
          dailyCapacity: changes.dailyCapacity || Math.floor((changes.hours || 8) * (changes.moldsPerHour || 1.25))
        };
        
        const response = await fetch(`/api/layup-employee-settings/${employeeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(apiPayload)
        });
        
        if (!response.ok) {
          throw new Error(`Failed to update employee ${employeeId}`);
        }
      }
      
      setPendingEmployeeChanges({});
      
      toast({
        title: "Employee Settings Updated",
        description: `Updated ${updates.length} employee(s) successfully`,
      });
      
      // Refresh data
      window.location.reload();
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Failed to update employee settings",
        variant: "destructive"
      });
    } finally {
      setIsApplyingChanges(false);
    }
  };
  
  const applyMoldChanges = async () => {
    setIsApplyingChanges(true);
    
    try {
      const updates = Object.entries(pendingMoldChanges);
      
      for (const [moldId, changes] of updates) {
        const mold = molds.find(m => m.moldId === moldId);
        if (mold) {
          await saveMold({ ...mold, ...changes });
        }
      }
      
      setPendingMoldChanges({});
      
      toast({
        title: "Mold Settings Updated",
        description: `Updated ${updates.length} mold(s) successfully`,
      });
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Failed to update mold settings",
        variant: "destructive"
      });
    } finally {
      setIsApplyingChanges(false);
    }
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Drag handlers
  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const orderId = active.id as string;
    const dropTargetId = over.id as string;
    
    // Parse drop target ID correctly - should be "moldId|date" 
    const [moldId, date] = dropTargetId.split('|');

    if (!date || !moldId) {
      console.error('❌ DRAG ERROR: Invalid drop target format:', dropTargetId);
      return;
    }

    // Check if target week is locked
    const targetDate = new Date(date);
    if (isWeekLocked(targetDate)) {
      console.log('❌ Cannot drop to locked week');
      toast({
        title: "Week Locked",
        description: `Cannot schedule to week of ${format(targetDate, 'MM/dd')} - week is locked`,
        variant: "destructive"
      });
      return;
    }

    console.log(`🎯 DRAG OPERATION: Moving order ${orderId} to mold ${moldId} on ${date}`);

    // Update order assignments immediately for UI responsiveness
    const newAssignment = { moldId, date };
    setOrderAssignments(prev => ({
      ...prev,
      [orderId]: newAssignment
    }));

    setHasUnsavedChanges(true);

    // Auto-save the assignment to prevent disappearing cards
    try {
      console.log(`💾 AUTO-SAVE: Saving assignment - Order: ${orderId}, Mold: ${moldId}, Date: ${date}`);
      
      // Delete existing schedule entry for this order
      await apiRequest(`/api/layup-schedule/by-order/${orderId}`, {
        method: 'DELETE'
      }).catch(err => {
        console.log('Note: No existing schedule found for order', orderId);
      });

      // Create new schedule entry with correct data
      const scheduleEntry = {
        orderId,
        scheduledDate: new Date(date),
        moldId: moldId,
        employeeAssignments: [],
        isOverride: true,
        overriddenBy: 'user'
      };

      console.log('📝 SCHEDULE ENTRY:', scheduleEntry);

      await apiRequest('/api/layup-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleEntry)
      });

      console.log(`✅ AUTO-SAVE: Successfully saved ${orderId} assignment to ${moldId}`);
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p1-layup-queue'] });

      // Reset unsaved changes since we just saved
      setHasUnsavedChanges(false);

      toast({
        title: "Assignment Saved",
        description: `Order ${orderId} assigned to ${moldId}`,
      });

    } catch (error) {
      console.error('❌ AUTO-SAVE ERROR: Failed to save assignment:', error);
      toast({
        title: "Save Failed",
        description: `Failed to save assignment for ${orderId}. Please try again.`,
        variant: "destructive"
      });
    }
  };

  // Handle manual Friday assignment
  const handleManualFridayAssignment = (orderId: string, source: string) => {
    toast({
      title: "Manual Friday Assignment",
      description: `Order ${orderId} can be manually assigned to Friday if needed.`,
    });
  };



  const { molds, saveMold, deleteMold, toggleMoldStatus, loading: moldsLoading } = useMoldSettings();


  const { employees, saveEmployee, deleteEmployee, toggleEmployeeStatus, loading: employeesLoading, refetch: refetchEmployees } = useEmployeeSettings();

  // Load existing schedule data from database, filtering out Friday assignments
  const { data: existingSchedule, isLoading: scheduleLoading } = useQuery({
    queryKey: ['/api/layup-schedule'],
    enabled: true,
    select: (data) => {
      if (!data || !Array.isArray(data)) return data;

      console.log(`🔍 RAW SCHEDULE DATA FROM DATABASE: ${data.length} total entries`);
      
      // Debug: Show first few entries with detailed date parsing
      data.slice(0, 5).forEach((assignment, index) => {
        const date = new Date(assignment.scheduledDate);
        const dayOfWeek = date.getDay();
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
        console.log(`  Entry ${index}: ${assignment.orderId} → ${assignment.scheduledDate} → ${date.toDateString()} (${dayName}, day ${dayOfWeek})`);
      });

      // Filter out assignments for days not in selectedWorkDays
      const filteredData = data.filter(assignment => {
        const date = new Date(assignment.scheduledDate);
        const dayOfWeek = date.getDay();
        const isWorkDay = selectedWorkDays.includes(dayOfWeek);
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
        
        if (!isWorkDay) {
          console.log(`🗑️ DATABASE FILTER: Removing ${dayName} assignment - ${assignment.orderId} on ${date.toDateString()}`);
        } else {
          console.log(`✅ DATABASE FILTER: Keeping ${dayName} assignment - ${assignment.orderId} on ${date.toDateString()}`);
        }
        
        return isWorkDay;
      });

      console.log(`📋 Database filter: Removed ${data.length - filteredData.length} non-work-day assignments, kept ${filteredData.length} work-day assignments`);
      console.log(`📋 Selected work days: ${selectedWorkDays.map(d => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][d]).join(', ')}`);

      return filteredData;
    }
  });

  // Update local assignments when schedule data loads
  useEffect(() => {
    if (existingSchedule && Array.isArray(existingSchedule) && existingSchedule.length > 0) {
      console.log('🔍 ASSIGNMENT LOADING DEBUG: Loading existing schedule from database:', existingSchedule.length, 'entries');

      const assignments: {[orderId: string]: { moldId: string, date: string }} = {};
      let mondayCount = 0;
      let tuesdayCount = 0;
      let wednesdayCount = 0;
      let thursdayCount = 0;
      let fridayCount = 0;

      (existingSchedule as any[]).forEach((entry: any) => {
        const schedDate = new Date(entry.scheduledDate);
        const dayOfWeek = schedDate.getDay();
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

        // Count by day
        if (dayOfWeek === 1) mondayCount++;
        else if (dayOfWeek === 2) tuesdayCount++;
        else if (dayOfWeek === 3) wednesdayCount++;
        else if (dayOfWeek === 4) thursdayCount++;
        else if (dayOfWeek === 5) fridayCount++;

        // ALWAYS load assignments regardless of selectedWorkDays to show existing schedule
        assignments[entry.orderId] = {
          moldId: entry.moldId,
          date: entry.scheduledDate
        };

        // Log Monday orders specifically
        if (dayOfWeek === 1) {
          console.log(`📅 MONDAY ORDER LOADED: ${entry.orderId} → ${entry.moldId} on ${schedDate.toDateString()}`);
        }
      });

      console.log('📊 ASSIGNMENT LOADING SUMMARY:');
      console.log(`   Monday: ${mondayCount} orders loaded`);
      console.log(`   Tuesday: ${tuesdayCount} orders loaded`);
      console.log(`   Wednesday: ${wednesdayCount} orders loaded`);
      console.log(`   Thursday: ${thursdayCount} orders loaded`);
      console.log(`   Friday: ${fridayCount} orders loaded`);
      console.log(`   Total assignments loaded: ${Object.keys(assignments).length}`);

      setOrderAssignments(assignments);
    } else {
      console.log('🔍 ASSIGNMENT LOADING DEBUG: No schedule data to load');
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
          body: JSON.stringify(entry)
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

    console.log('🏭 PRODUCTION FLOW: Starting complete save and department push workflow...');
    setIsSaving(true);

    try {
      // Step 1: Save the layup schedule to database
      console.log('🏭 PRODUCTION FLOW: Step 1 - Saving layup schedule to database...');
      await saveScheduleMutation.mutateAsync(orderAssignments);

      // Step 2: Push ALL scheduled orders to Layup/Plugging Department Manager (not just current week)
      console.log('🏭 PRODUCTION FLOW: Step 2 - Pushing ALL scheduled orders to department manager...');
      const allScheduledOrders = getAllScheduledOrders();

      if (allScheduledOrders.length > 0) {
        const scheduledOrderIds = allScheduledOrders.map(order => order.orderId);
        console.log(`🏭 PRODUCTION FLOW: Pushing ${scheduledOrderIds.length} total scheduled orders to Layup/Plugging department`);

        await pushToLayupPluggingMutation.mutateAsync(scheduledOrderIds);

        console.log('✅ PRODUCTION FLOW: Complete workflow finished successfully!');
        console.log('✅ PRODUCTION FLOW: All scheduled orders are now available in Layup/Plugging Department Manager');

        toast({
          title: "Production Flow Complete",
          description: `Schedule locked and ${scheduledOrderIds.length} total orders pushed to Layup/Plugging department`,
        });
      } else {
        console.log('🏭 PRODUCTION FLOW: No scheduled orders to push to department');
        toast({
          title: "Schedule Saved",
          description: "Layup schedule saved successfully (no orders to push)",
        });
      }

    } catch (error) {
      console.error('❌ PRODUCTION FLOW: Error in complete workflow:', error);
      toast({
        title: "Error",
        description: "Failed to complete production flow workflow",
        variant: "destructive"
      });
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
        body: JSON.stringify({ orderIds })
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
        body: JSON.stringify(schedulerData)
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

        // Apply Friday validation to algorithmic schedule (never allow Friday)
        const validatedAssignments = validateNoFridayAssignments(newAssignments);
        setOrderAssignments(validatedAssignments);
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

  // Add API-based layup schedule generation
  const generateLayupScheduleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/layup-schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
    },
    onSuccess: (result) => {
      console.log('🏭 Layup schedule generated:', result);
      toast({
        title: "Schedule Generated",
        description: `Generated ${result.entriesGenerated || 0} schedule entries from production queue`,
      });
      // Refresh the schedule data
      queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
    },
    onError: (error) => {
      console.error('❌ Failed to generate schedule:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate layup schedule from production queue",
        variant: "destructive"
      });
    }
  });

  const handleGenerateSchedule = async () => {
    await generateLayupScheduleMutation.mutateAsync();
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

  // Helper function to get ALL scheduled orders (not just current week)
  const getAllScheduledOrders = () => {
    return processedOrders.filter(order => {
      const assignment = orderAssignments[order.orderId];
      return assignment !== undefined; // Any order with an assignment
    });
  };

  // Helper function to get week key for locking (format: YYYY-MM-DD of Monday)
  const getWeekKey = (date: Date) => {
    const monday = startOfWeek(date, { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  };

  // Helper function to check if current week is locked
  const isCurrentWeekLocked = () => {
    const weekKey = getWeekKey(currentDate);
    return lockedWeeks[weekKey] || false;
  };

  // Helper function to check if a specific date's week is locked
  const isWeekLocked = (date: Date) => {
    const weekKey = getWeekKey(date);
    return lockedWeeks[weekKey] || false;
  };


  // Fetch generated layup schedule from API
  const { data: generatedSchedule = [], isLoading: isLoadingSchedule } = useQuery({
    queryKey: ['/api/layup-schedule'],
    enabled: true,
  }) as { data: any[]; isLoading: boolean };

  const { orders: allOrders, reloadOrders, loading: ordersLoading } = useUnifiedLayupOrders();

  // Include all orders from the production queue (regular orders, Mesa production orders, P1 purchase orders)
  const orders = useMemo(() => {
    // CRITICAL MESA UNIVERSAL DEBUGGING
    const mesaUniversalOrders = allOrders?.filter(order => order.modelId === 'mesa_universal') || [];
    console.log('🏔️ MESA UNIVERSAL DEBUG:', {
      totalOrders: allOrders?.length || 0,
      mesaUniversalCount: mesaUniversalOrders.length,
      mesaOrders: mesaUniversalOrders.slice(0, 3).map(o => ({ orderId: o.orderId, modelId: o.modelId, product: o.product }))
    });
    
    console.log('🔍 LayupScheduler orders debug:', {
      allOrdersCount: allOrders?.length || 0,
      loading: ordersLoading,
      rawData: allOrders ? 'has data' : 'no data',
      dataType: typeof allOrders,
      isArray: Array.isArray(allOrders),
      sourceCounts: allOrders?.reduce((acc: any, order) => {
        acc[order.source] = (acc[order.source] || 0) + 1;
        return acc;
      }, {}) || {},
      sampleOrders: allOrders?.slice(0, 3)?.map(o => ({ id: o.orderId, product: o.product, source: o.source }))
    });

    // If we have no orders but backend shows orders, there's a data loading issue
    if (!allOrders || allOrders.length === 0) {
      console.error('❌ LayupScheduler: No orders loaded from useUnifiedLayupOrders');
      console.error('❌ Backend shows orders but frontend received empty array');
    }

    // CRITICAL: Check Mesa Universal orders before returning
    const finalMesaCount = allOrders?.filter(order => order.modelId === 'mesa_universal').length || 0;
    console.log(`🏔️ FINAL ORDERS: Returning ${allOrders?.length || 0} total orders, ${finalMesaCount} are Mesa Universal`);

    // Return ALL orders from the production queue - no filtering by source
    return allOrders || [];
  }, [allOrders, ordersLoading]);

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
  }, [orders, allOrders]);

  // Debug filtering results
  useEffect(() => {
    const regularOrders = orders.filter(order => order.source === 'main_orders');
    const p1Orders = orders.filter(order => order.source === 'p1_purchase_order');
    console.log('🏭 LayupScheduler: Total orders from API:', allOrders.length);
    console.log('🏭 LayupScheduler: Regular orders for scheduling:', regularOrders.length);
    console.log('🏭 LayupScheduler: P1 PO orders for scheduling:', p1Orders.length);
    if (regularOrders.length > 0) {
      console.log('🏭 LayupScheduler: Sample regular order for scheduling:', regularOrders[0]);
      console.log('🏭 LayupScheduler: First 5 regular orders:', regularOrders.slice(0, 5).map(o => ({
        orderId: o.orderId,
        source: o.source,
        stockModelId: o.stockModelId,
        customer: o.customer
      })));
    }

    // Log all order sources from filtered orders
    const sourceCounts = orders.reduce((acc, order) => {
      acc[order.source] = (acc[order.source] || 0) + 1;
      return acc;
    }, {} as {[key: string]: number});
    console.log('🏭 LayupScheduler: Filtered orders by source:', sourceCounts);

    // CONTROLLED AUTO-SCHEDULE: Only trigger once when data is loaded and no assignments exist
    if (orders.length > 0 && molds.length > 0 && employees.length > 0) {
      console.log('🚀 LayupScheduler: All data loaded, checking if auto-schedule needed');

      // Only auto-schedule if no assignments exist yet
      const hasAssignments = Object.keys(orderAssignments).length > 0;
      if (!hasAssignments && orders.length > 0) {
        console.log('🎯 One-time auto-scheduling triggered for:', orders.length, 'orders');
        // Use a ref to ensure this only runs once
        if (!hasTriggeredAutoSchedule.current) {
          hasTriggeredAutoSchedule.current = true;
          setTimeout(() => {
            handleAutoSchedule();
          }, 1000);
        }
      } else {
        console.log('📋 Assignments already exist, skipping auto-schedule');
      }
    } else {
      console.log('❌ LayupScheduler: Missing data for auto-schedule:', {
        orders: orders.length,
        molds: molds.length,
        employees: employees.length
      });
    }
  }, [orders, molds, employees, orderAssignments]);

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

    // Get work days for dynamic window based on selected days
    const getWorkDaysInWeek = (startDate: Date) => {
      const workDays: Date[] = [];
      let current = new Date(startDate);

      // Find Monday of current week
      while (current.getDay() !== 1) {
        current = new Date(current.getTime() + (current.getDay() === 0 ? 1 : -1) * 24 * 60 * 60 * 1000);
      }

      // Add selected work days only (never include Friday unless explicitly selected)
      for (let i = 0; i < 7; i++) {
        const workDay = new Date(current);
        const dayOfWeek = workDay.getDay();

        // CRITICAL: Only include days that are explicitly selected by the user
        // This enforces Monday-Thursday [1,2,3,4] by default
        if (selectedWorkDays.includes(dayOfWeek)) {
          workDays.push(workDay);
        }

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

    // CRITICAL VALIDATION: Ensure no Friday dates made it into allWorkDays
    const fridayDatesInAllWorkDays = allWorkDays.filter(date => date.getDay() === 5);
    if (fridayDatesInAllWorkDays.length > 0) {
      console.error(`❌ CRITICAL BUG DETECTED: Found ${fridayDatesInAllWorkDays.length} Friday dates in allWorkDays!`);
      fridayDatesInAllWorkDays.forEach(date => {
        console.error(`   - Friday found in work days: ${date.toDateString()}`);
      });

      // Remove all Friday dates from allWorkDays
      const cleanedWorkDays = allWorkDays.filter(date => date.getDay() !== 5);
      allWorkDays.splice(0, allWorkDays.length, ...cleanedWorkDays);
      console.log(`🔧 Cleaned allWorkDays: removed ${fridayDatesInAllWorkDays.length} Friday dates, ${allWorkDays.length} work days remaining`);
    }

    console.log(`📅 Final allWorkDays validation: ${allWorkDays.length} work days generated (all Monday-Thursday)`);

    // Enhanced intelligent stock model detection (define before usage)
    const getOrderStockModelId = (order: any) => {
      // If already has stockModelId, use it
      if (order.stockModelId) return order.stockModelId;
      if (order.modelId) return order.modelId;

      // Intelligent detection based on features and action configuration
      if (order.features) {
        const actionLength = order.features.action_length;
        const actionInlet = order.features.action_inlet;

        // Mesa Universal - Remington 700 actions
        if (actionInlet?.includes('rem_700') || actionInlet?.includes('remington_700')) {
          return 'mesa_universal';
        }

        // K2 variants - based on action length
        if (actionLength === 'medium' || actionInlet?.includes('k2')) {
          return 'fg_k2';
        }

        // Alpine Hunter variants - precision actions
        if (actionInlet?.includes('terminus') || actionInlet?.includes('defiance')) {
          return 'cf_alpine_hunter';
        }

        // Privateer - tactical configurations
        if (order.features.rail_accessory || order.features.qd_accessory) {
          return 'cf_privateer';
        }

        // Sportsman - traditional configurations
        return 'fg_sportsman';
      }

      // Fallback based on product name
      if (order.product?.includes('Mesa')) return 'mesa_universal';
      if (order.product?.includes('K2')) return 'fg_k2';
      if (order.product?.includes('Alpine')) return 'cf_alpine_hunter';
      if (order.product?.includes('Privateer')) return 'cf_privateer';
      if (order.product?.includes('Sportsman')) return 'fg_sportsman';

      return 'unknown';
    };

    // Sort orders with intelligent stock model detection
    const sortedOrders = [...orders].sort((a, b) => {
      // Use intelligent detection for stock model identification
      const aDetectedModel = getOrderStockModelId(a);
      const bDetectedModel = getOrderStockModelId(b);

      // Priority 1: Mesa Universal orders get highest priority
      const aMesaUniversal = (aDetectedModel === 'mesa_universal' || a.product === 'Mesa - Universal');
      const bMesaUniversal = (bDetectedModel === 'mesa_universal' || b.product === 'Mesa - Universal');

      if (aMesaUniversal && !bMesaUniversal) return -1; // Mesa Universal first
      if (!aMesaUniversal && bMesaUniversal) return 1;  // Mesa Universal first

      // Priority 2: Sort by priority score (lower = higher priority)
      const aPriority = a.priorityScore || 99;
      const bPriority = b.priorityScore || 99;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Priority 3: Sort by due date (earliest first)
      const aDueDate = new Date(a.dueDate || a.orderDate).getTime();
      const bDueDate = new Date(b.dueDate || b.orderDate).getTime();
      return aDueDate - bDueDate;
    });

    // Count Mesa Universal orders for logging using intelligent detection
    const mesaUniversalOrders = sortedOrders.filter(o => {
      const detectedModel = getOrderStockModelId(o);
      return detectedModel === 'mesa_universal' || o.product === 'Mesa - Universal';
    });
    console.log(`🏔️ Found ${mesaUniversalOrders.length} Mesa Universal orders (8/day limit will be enforced)`);

    // Debug order analysis
    console.log('🔍 ORDER ANALYSIS FOR STOCK MODEL DETECTION:');
    sortedOrders.slice(0, 10).forEach((order, i) => {
      const detectedModel = getOrderStockModelId(order);
      console.log(`Order ${i + 1}: ${order.orderId} → Model: ${detectedModel}`, {
        originalModelId: order.modelId,
        originalStockModelId: order.stockModelId,
        product: order.product,
        features: order.features ? Object.keys(order.features) : 'no features',
        detectedModel
      });
    });

    // Find compatible molds for each order
    const getCompatibleMolds = (order: any) => {
      // Use the intelligent stock model detection function defined above
      let modelId = getOrderStockModelId(order);

      if (!modelId || modelId === 'unknown') {
        console.log('⚠️ Order has no valid modelId:', order.orderId, 'Source:', order.source, 'Detected model:', modelId);
        return [];
      }

      // CRITICAL DEBUG: Enhanced logging for Mesa Universal
      if (modelId === 'mesa_universal' || order.orderId === 'AG1563') {
        console.log(`🏔️ MESA DEBUG: Order ${order.orderId} → Stock model: ${modelId} → Source: ${order.source}`);
      }

      console.log(`🔍 Checking compatibility for Order ${order.orderId} with stock model: ${modelId}`);

      const compatibleMolds = molds.filter(mold => {
        if (!mold.enabled) return false;

        // STRICT RULE: Molds must have explicit stock model restrictions to be compatible
        // Empty or undefined stockModels means the mold is not configured properly
        if (!mold.stockModels || mold.stockModels.length === 0) {
          console.log(`❌ Mold ${mold.moldId} has no stock model restrictions configured - REJECTING`);
          return false;
        }

        // MESA UNIVERSAL RESTRICTION: Mesa Universal orders can ONLY use Mesa Universal molds
        if (modelId === 'mesa_universal') {
          const isMesaMold = mold.stockModels.includes('mesa_universal');
          console.log(`🏔️ MESA MOLD CHECK: ${order.orderId} checking mold ${mold.moldId} → Stock models: [${mold.stockModels.join(', ')}] → Mesa compatible: ${isMesaMold}`);
          
          if (isMesaMold) {
            console.log(`✅ MESA UNIVERSAL MATCH: Order ${order.orderId} (${modelId}) → Mold ${mold.moldId}`);
            return true;
          } else {
            console.log(`❌ MESA RESTRICTION: Order ${order.orderId} (mesa_universal) CANNOT use Mold ${mold.moldId} (stockModels: ${mold.stockModels.join(', ')})`);
            return false;
          }
        }

        // For NON-mesa universal orders, check for exact match first
        const exactMatch = mold.stockModels.includes(modelId);
        if (exactMatch) {
          console.log(`✅ EXACT MATCH: Order ${order.orderId} (${modelId}) → Mold ${mold.moldId}`);
          return true;
        }

        // For NON-mesa universal orders, check for universal compatibility
        const hasUniversal = mold.stockModels.includes('universal');
        if (hasUniversal) {
          console.log(`✅ UNIVERSAL MATCH: Order ${order.orderId} (${modelId}) → Mold ${mold.moldId} (universal)`);
          return true;
        }

        // Log incompatible molds for debugging
        console.log(`❌ NO MATCH: Order ${order.orderId} (${modelId}) vs Mold ${mold.moldId} (stockModels: ${mold.stockModels.join(', ')})`);
        return false;
      });

      console.log(`🎯 Order ${order.orderId} (${modelId}) → ${compatibleMolds.length} compatible molds:`, compatibleMolds.map(m => m.moldId));

      // If no compatible molds found, this order should NOT be scheduled
      if (compatibleMolds.length === 0) {
        console.warn(`⚠️ SCHEDULING BLOCKED: Order ${order.orderId} (${modelId}) has no compatible molds - removing from schedule`);
      }

      return compatibleMolds;
    };

    // Track cell assignments to ensure ONE ORDER PER CELL
    const cellAssignments = new Set<string>(); // Format: `${moldId}-${dateKey}`
    const newAssignments: { [orderId: string]: { moldId: string, date: string } } = {};

    // Track daily assignments for logging

    console.log('🎯 Starting single-card-per-cell assignment algorithm with Mesa Universal constraints');
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

    // Filter orders to exclude canceled orders and only include those with compatible molds
    const activeOrders = sortedOrders.filter(order => {
      // Exclude canceled orders
      if (order.status === 'canceled' || order.status === 'cancelled') {
        console.log(`🚫 Excluding canceled order: ${order.orderId}`);
        return false;
      }
      // Exclude orders with canceled in the notes or special instructions
      if (order.specialInstructions?.toLowerCase().includes('cancel') ||
          order.notes?.toLowerCase().includes('cancel')) {
        console.log(`🚫 Excluding order with cancel in notes: ${order.orderId}`);
        return false;
      }
      return true;
    });

    const schedulableOrders = activeOrders.filter(order => {
      const compatibleMolds = getCompatibleMolds(order);
      const hasCompatibleMolds = compatibleMolds.length > 0;
      
      // CRITICAL DEBUG: Log Mesa Universal filtering
      if (order.modelId === 'mesa_universal') {
        console.log(`🏔️ MESA FILTER: ${order.orderId} → Compatible molds: ${compatibleMolds.length} → Schedulable: ${hasCompatibleMolds}`);
      }
      
      return hasCompatibleMolds;
    });

    console.log(`📦 Filtered orders: ${sortedOrders.length} total → ${schedulableOrders.length} schedulable (${sortedOrders.length - schedulableOrders.length} excluded due to no compatible molds)`);

    schedulableOrders.forEach((order, index) => {
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

        // Mesa Universal orders are now limited only by P1 purchase order selection and mold capacity
        const isMesaUniversal = (order.stockModelId === 'mesa_universal' || order.product === 'Mesa - Universal');

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
        const logPrefix = isMesaUniversal ? '🏔️ MESA UNIVERSAL ASSIGNED:' :
                         order.source === 'production_order' ? '🏭 PRODUCTION ORDER ASSIGNED:' : '✅ Assigned';
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


    // Apply Friday validation before setting smart assignments
    const validatedSmartAssignments = validateNoFridayAssignments(newAssignments);
    setOrderAssignments(validatedSmartAssignments);
    setHasUnsavedScheduleChanges(true);
  }, [orders, molds, employees, currentDate]);

  // AUTO-ADVANCE DISABLED: Prevent automatic date advancement to stop reloading
  useEffect(() => {
    // DISABLED: Auto-advance was causing continuous reloading
    console.log('📅 AUTO-ADVANCE: DISABLED to prevent continuous reloading');
    console.log('💡 Use navigation buttons to manually change weeks');
    
    // Only check if we're not loading and have data
    if (ordersLoading || isLoadingSchedule) {
      return;
    }
  }, [ordersLoading, isLoadingSchedule]);

  // Function to generate algorithmic schedule automatically
  const generateAlgorithmicSchedule = useCallback(async () => {
    if (!orders.length || !molds.length || !employees.length) {
      console.log('❌ Cannot generate algorithmic schedule: missing data');
      return;
    }

    console.log('🤖 Generating algorithmic schedule...');

    try {
      console.log('🏭 PRODUCTION FLOW: Processing production queue with algorithmic scheduler...');
      const response = await apiRequest('/api/algorithmic-schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxOrdersPerDay: Math.floor(employees.reduce((total, emp) => total + (emp.rate || 1.5) * (emp.hours || 8), 0)) || 21, // Use actual employee capacity settings
          scheduleDays: 10,    // Limit schedule to next 2 weeks (10 work days)
          priorityWeighting: 'urgent', // Prioritize by due date and priority score
          workDays: selectedWorkDays, // Pass current work day settings
          employees: employees, // Pass employee settings
          molds: molds.filter(m => m.enabled) // Pass enabled molds only
        }),
      });

      console.log('🏭 PRODUCTION FLOW: Algorithmic schedule response:', response);

      if (response.success && response.allocations) {
        console.log(`✅ PRODUCTION FLOW: Generated ${response.allocations.length} order allocations`);
        console.log('✅ PRODUCTION FLOW: Sample allocations:', response.allocations.slice(0, 3));

        // Convert to schedule assignments format for the calendar
        const scheduleAssignments: {[orderId: string]: { moldId: string, date: string }} = {};

        response.allocations.forEach((allocation: any) => {
          scheduleAssignments[allocation.orderId] = {
            moldId: allocation.moldId,
            date: allocation.scheduledDate
          };
        });

        console.log(`📅 PRODUCTION FLOW: Assigning ${Object.keys(scheduleAssignments).length} orders to schedule`);

        // Apply Friday validation to algorithmic schedule based on work days setting
        const validatedAssignments = selectedWorkDays.includes(5) ? scheduleAssignments : validateNoFridayAssignments(scheduleAssignments);
        setOrderAssignments(validatedAssignments);

        // Log mold assignments for verification
        const moldAssignments = response.allocations.reduce((acc: any, alloc: any) => {
          acc[alloc.moldId] = (acc[alloc.moldId] || 0) + 1;
          return acc;
        }, {});
        console.log('🔧 PRODUCTION FLOW: Mold assignments:', moldAssignments);

        console.log('📅 PRODUCTION FLOW: Schedule ready for review and adjustment');
      } else {
        console.error('❌ PRODUCTION FLOW: Failed to generate schedule:', response);
      }
    } catch (error) {
      console.error('❌ PRODUCTION FLOW: Error generating schedule:', error);
      toast({
        title: "Schedule Generation Failed",
        description: "Failed to generate algorithmic schedule. Please try again.",
        variant: "destructive"
      });
    }
  }, [orders, molds, employees]);

  // Load generated schedule into order assignments
  useEffect(() => {
    if (generatedSchedule && generatedSchedule.length > 0) {
      console.log('📋 Loading generated schedule with', generatedSchedule.length, 'entries');
      console.log('📋 Sample generated schedule entry:', generatedSchedule[0]);

      const scheduleAssignments: {[orderId: string]: { moldId: string, date: string }} = {};

      generatedSchedule.forEach((entry: any) => {
        console.log('📋 Processing schedule entry:', entry.orderId, entry.moldId, entry.scheduledDate);
        scheduleAssignments[entry.orderId] = {
          moldId: entry.moldId,
          date: entry.scheduledDate
        };
      });

      console.log('📋 Generated schedule assignments:', Object.keys(scheduleAssignments).length);
      console.log('📋 Sample assignment:', Object.entries(scheduleAssignments)[0]);
      console.log('📋 Current processedOrders count:', processedOrders?.length || 0);
      console.log('📋 Sample processedOrders IDs:', processedOrders?.slice(0, 5)?.map(o => o.orderId) || []);

      // Apply Friday validation to auto-generated schedule (never allow Friday)
      const validatedAssignments = validateNoFridayAssignments(scheduleAssignments);
      setOrderAssignments(validatedAssignments);
      console.log('📋 Order assignments state updated');

      // Force calendar re-render by triggering a state change
      setTimeout(() => {
        console.log('📋 Calendar should now display orders for assignments:', Object.keys(scheduleAssignments).length);
      }, 100);
    }
  }, [generatedSchedule]);

  // Calculate dates based on view type
  const dates = useMemo(() => {
    if (viewType === 'week') {
      const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Start on Monday
      return Array.from({ length: 5 }, (_, i) => addDays(startDate, i)); // Monday to Friday
    } else if (viewType === 'day') {
      return [currentDate];
    } else {
      // Month view - return all days in month
      return eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate)
      });
    }
  }, [viewType, currentDate]);

  // Auto-trigger algorithmic scheduling when production queue has orders
  useEffect(() => {
    console.log('🎯 Production Flow Auto-schedule check:', {
      orders: orders.length,
      molds: molds.length,
      employees: employees.length,
      isLoading: isLoadingSchedule,
      ordersLoading: ordersLoading,
      hasAssignments: Object.keys(orderAssignments).length > 0,
      hasGeneratedSchedule: generatedSchedule && generatedSchedule.length > 0
    });

    // Wait for all data to be loaded
    if (ordersLoading || isLoadingSchedule) {
      console.log('⏳ Still loading data, waiting...');
      return;
    }

    // Only trigger if we have production queue orders and they significantly outnumber scheduled orders
    if (orders.length > 0 && molds.length > 0 && employees.length > 0) {
      const filteredOrders = orders;
      const hasAssignments = Object.keys(orderAssignments).length > 0;
      const hasGeneratedSchedule = generatedSchedule && generatedSchedule.length > 0;
      const scheduledOrderCount = Object.keys(orderAssignments).length; // Use actual assignments, not generatedSchedule
      const unscheduledOrderCount = Math.max(0, orders.length - scheduledOrderCount); // Prevent negative numbers

      console.log('📊 SCHEDULE ANALYSIS:', {
        totalOrders: orders.length,
        scheduledOrders: scheduledOrderCount,
        unscheduledOrders: unscheduledOrderCount,
        assignmentKeys: Object.keys(orderAssignments).length,
        hasTooManyAssignments: scheduledOrderCount > orders.length * 0.8,
        needsScheduling: unscheduledOrderCount > 10
      });

      // Clear stale assignments if we have way too many (indicates old/stale data)
      if (scheduledOrderCount > orders.length * 0.8 && orders.length > 100) {
        console.log('🧹 DETECTED STALE ASSIGNMENTS: Clearing old schedule data');
        console.log(`   Had ${scheduledOrderCount} assignments for ${orders.length} orders - clearing stale data`);
        setOrderAssignments({});
        return; // Exit early, let it re-run with clean state
      }

      // AUTO-TRIGGER DISABLED: User must manually click Auto Schedule button
      console.log('📊 SCHEDULE STATUS: Ready for manual scheduling (2-week limit) -', unscheduledOrderCount, 'unscheduled orders');
    } else {
      console.log('❌ PRODUCTION FLOW: Missing resources for scheduling:', {
        orders: orders.length,
        molds: molds.length,
        employees: employees.length
      });
    }
  }, [orders.length, molds.length, employees.length, isLoadingSchedule, ordersLoading, orderAssignments, generatedSchedule, generateAlgorithmicSchedule]);

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
        let actionLengthValue = order.features.action_length || order.features.actionLength;

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
      const compatibleMolds = molds.filter(mold => {
        if (!mold.enabled) return false;
        if (!mold.stockModels || mold.stockModels.length === 0) return true;
        
        // STRICT VALIDATION: Stock model MUST match exactly - NO EXCEPTIONS
        const hasExactMatch = mold.stockModels.includes(modelId);
        
        // CRITICAL: Log any mismatches for validation
        if (!hasExactMatch && mold.stockModels.length > 0) {
          console.warn(`🚨 STRICT VALIDATION: Order ${order.orderId} with model "${modelId}" does not match mold ${mold.moldId} stock models: [${mold.stockModels.join(', ')}]`);
        }
        
        return hasExactMatch;
      });
      
      // FAIL SAFE: If no compatible molds found, log critical error
      if (compatibleMolds.length === 0) {
        console.error(`🚨 CRITICAL: No compatible molds found for order ${order.orderId} with stock model "${modelId}". This order cannot be scheduled.`);
      }
      
      return compatibleMolds;
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
            .order-id {
              font-size: 10px;
              font-weight: bold;
            }
            .model-name {
              font-size: 12px;
              font-weight: bold;
              margin: 1px 0;
            }
            .action-length {
              font-size: 12px;
              font-weight: bold;
              background: #f0f0f0;
              border-radius: 2px;
              padding: 1px 2px;
              margin: 1px 0;
            }
            .mold-info {
              font-size: 12px;
              font-weight: bold;
              color: #444;
              margin: 1px 0;
            }
            .order-card.p1_po {
              background: #fff5e6;
              border-color: #ffc069;
              color: #d46b08;
            }
            .order-card.production {
              background: #f3e8ff;
              border-color: #c084fc;
              color: #7c3aed;
            }
            .order-card.fg {
              background: #7c3aed;
              border-color: #6d28d9;
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
              font-size: 10px;
              margin-top: 1px;
              opacity: 0.9;
              font-weight: bold;
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
              font-size: 10px;
              margin-top: 1px;
              font-weight: bold;
              opacity: 0.9;
            }
            @media print {
              * {
                box-sizing: border-box !important;
              }
              body {
                margin: 0 !important;
                padding: 20px 8px 8px 8px !important;
                font-family: Arial, sans-serif !important;
                font-size: 10px !important;
                line-height: 1.2 !important;
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              @page {
                margin: 0.75in 0.5in 0.5in 0.5in !important;
              }
              .header {
                margin: 0 0 8px 0 !important;
                padding: 4px 0 !important;
                border-bottom: 1px solid #000 !important;
                page-break-inside: avoid !important;
              }
              .header h1 {
                font-size: 14px !important;
                margin: 0 0 2px 0 !important;
                font-weight: bold !important;
              }
              .header h2 {
                font-size: 12px !important;
                margin: 0 0 2px 0 !important;
                font-weight: normal !important;
              }
              .header p {
                font-size: 9px !important;
                margin: 0 !important;
                color: #666 !important;
              }
              .stats {
                margin-bottom: 8px !important;
                display: flex !important;
                gap: 12px !important;
                page-break-inside: avoid !important;
              }
              .stat {
                padding: 2px 4px !important;
                font-size: 9px !important;
                background: #f0f0f0 !important;
                border: 1px solid #ccc !important;
                border-radius: 3px !important;
              }
              .schedule-table {
                width: 100% !important;
                border-collapse: collapse !important;
                margin: 0 0 12px 0 !important;
                page-break-inside: avoid !important;
                table-layout: fixed !important;
              }
              /* Daily section with better page break handling */
              .daily-section {
                page-break-inside: avoid !important;
                margin-bottom: 30px !important;
              }
              .day-header {
                page-break-after: avoid !important;
                page-break-inside: avoid !important;
              }
              .mold-section {
                page-break-inside: avoid !important;
                margin-bottom: 15px !important;
              }
              .order-item {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .schedule-table th {
                padding: 4px 2px !important;
                font-size: 9px !important;
                font-weight: bold !important;
                border: 1px solid #333 !important;
                background: #e8e8e8 !important;
                text-align: center !important;
                vertical-align: middle !important;
              }
              .schedule-table .mold-header {
                padding: 4px 2px !important;
                font-size: 8px !important;
                width: 80px !important;
                background: #d4edda !important;
                border: 1px solid #333 !important;
                text-align: left !important;
                vertical-align: middle !important;
                word-wrap: break-word !important;
              }
              .schedule-table .cell {
                padding: 2px !important;
                border: 1px solid #333 !important;
                vertical-align: top !important;
                min-height: 40px !important;
                width: auto !important;
                overflow: hidden !important;
              }
              .order-card {
                margin: 0 0 2px 0 !important;
                padding: 3px 4px !important;
                font-size: 8px !important;
                border: 1px solid #666 !important;
                border-radius: 2px !important;
                background: white !important;
                color: black !important;
                line-height: 1.1 !important;
                display: block !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .order-id {
                font-size: 8px !important;
                font-weight: bold !important;
                margin: 0 !important;
                color: black !important;
              }
              .order-details {
                font-size: 7px !important;
                font-weight: normal !important;
                line-height: 1.1 !important;
                margin: 1px 0 0 0 !important;
                color: #333 !important;
              }
              .mold-info {
                font-size: 7px !important;
                font-weight: normal !important;
                line-height: 1.1 !important;
                margin: 1px 0 0 0 !important;
                color: #666 !important;
              }
              .material-badge, .po-badge, .heavy-fill-badge, .lop-badge {
                font-size: 6px !important;
                padding: 1px 2px !important;
                margin: 0 1px 0 0 !important;
                display: inline-block !important;
                border: 1px solid #999 !important;
                border-radius: 2px !important;
                background: #f5f5f5 !important;
                color: black !important;
              }
              .material-badge.cf {
                background: #e3f2fd !important;
                border-color: #1976d2 !important;
              }
              .material-badge.fg {
                background: #f3e5f5 !important;
                border-color: #7b1fa2 !important;
              }
              .po-badge {
                background: #fff3e0 !important;
                border-color: #f57c00 !important;
              }
              .heavy-fill-badge {
                background: #ffebee !important;
                border-color: #d32f2f !important;
              }
              .lop-badge {
                background: #fffde7 !important;
                border-color: #f57f17 !important;
              }
              .order-count {
                font-size: 7px !important;
                color: #666 !important;
              }
              /* Page break controls */
              .page-break {
                page-break-before: always !important;
              }
              .no-break {
                page-break-inside: avoid !important;
              }
              /* Ensure headers don't get orphaned */
              .mold-title {
                page-break-after: avoid !important;
              }
              /* Add margin for better spacing on page breaks */
              .daily-section:not(:first-child) {
                margin-top: 20px !important;
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

          <!-- Daily Layup Schedule for Production Floor -->
          ${(() => {
            // Build map of all mold-date-orders combinations that have assignments
            const assignmentMap = new Map();
            console.log('🖨️ PRINT DEBUG: Processing orderAssignments for print:', Object.keys(orderAssignments).length, 'total assignments');

            Object.entries(orderAssignments).forEach(([orderId, assignment]) => {
              const order = orders.find(o => o.orderId === orderId);
              if (!order) return;

              // Ensure consistent date format (YYYY-MM-DD)
              const assignmentDateOnly = assignment.date.split('T')[0];
              const assignmentDate = new Date(assignmentDateOnly + 'T12:00:00'); // Add noon to avoid timezone issues
              const dayOfWeek = assignmentDate.getDay();
              const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];

              // FILTER OUT NON-WORK DAYS: Skip assignments for days not in selectedWorkDays
              if (!selectedWorkDays.includes(dayOfWeek)) {
                console.log(`🖨️ PRINT FILTER: Skipping ${dayName} assignment - ${orderId} → ${assignment.moldId} (not a selected work day)`);
                return;
              }

              // Log Thursday assignments specifically
              if (dayOfWeek === 4) {
                console.log(`🖨️ THURSDAY ASSIGNMENT FOUND: ${orderId} → ${assignment.moldId} on ${assignmentDateOnly} (${dayName})`);
                console.log(`   Full assignment object:`, assignment);
                console.log(`   Order found:`, order ? 'YES' : 'NO');
              }

              const key = assignmentDateOnly; // Use consistent YYYY-MM-DD format

              if (!assignmentMap.has(key)) {
                assignmentMap.set(key, {
                  date: assignmentDateOnly,
                  moldAssignments: new Map()
                });
              }

              const dayData = assignmentMap.get(key);
              if (!dayData.moldAssignments.has(assignment.moldId)) {
                dayData.moldAssignments.set(assignment.moldId, []);
              }
              dayData.moldAssignments.get(assignment.moldId).push(order);
            });

            // Debug: Show what dates we have in assignmentMap
            console.log('🖨️ PRINT DEBUG: assignmentMap dates:', Array.from(assignmentMap.keys()).map(dateStr => {
              const date = new Date(dateStr);
              const dayOfWeek = date.getDay();
              const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
              return `${dateStr} (${dayName})`;
            }));

            console.log('🖨️ RAW ORDER ASSIGNMENTS FOR PRINT:');
            Object.entries(orderAssignments).forEach(([orderId, assignment]) => {
              const assignmentDate = new Date(assignment.date);
              const dayOfWeek = assignmentDate.getDay();
              const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
              console.log(`   ${orderId} → ${assignment.moldId} on ${assignmentDate.toDateString()} (${dayName}, day ${dayOfWeek})`);
            });

            if (assignmentMap.size === 0) {
              return '<div style="text-align: center; padding: 20px; font-size: 16px;">No Orders Scheduled This Week</div>';
            }

            // Filter dates to only include current week (Monday-Thursday only for production schedule)
            const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
            const currentWeekThursday = addDays(currentWeekStart, 3); // Thursday (Monday + 3 days)

            // Debug: Show current week calculation
            console.log('🖨️ CURRENT WEEK DEBUG:', {
              currentDate: currentDate.toString(),
              weekStart: currentWeekStart.toString(),
              weekThursday: currentWeekThursday.toString(),
              today: new Date().toString()
            });

            const sortedDates = Array.from(assignmentMap.keys())
              .sort()
              .filter(dateStr => {
                const date = new Date(dateStr + 'T12:00:00'); // Add noon to avoid timezone issues
                const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
                const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
                const isWorkDay = selectedWorkDays.includes(dayOfWeek); // Only include selected work days

                // Compare dates using the same noon approach to avoid timezone issues
                const weekStart = new Date(currentWeekStart);
                weekStart.setHours(12, 0, 0, 0);
                const weekThursday = new Date(currentWeekThursday);
                weekThursday.setHours(12, 0, 0, 0);

                const inCurrentWeek = date >= weekStart && date <= weekThursday;

                console.log(`🖨️ DATE FILTER: ${dateStr} (${dayName}, day ${dayOfWeek}) - WorkDay: ${isWorkDay}, InWeek: ${inCurrentWeek}, Include: ${isWorkDay && inCurrentWeek}`);
                console.log(`   Date comparison: ${date.toISOString()} vs Week: ${weekStart.toISOString()} to ${weekThursday.toISOString()}`);

                // Only Monday through Friday AND within current week
                return isWorkDay && inCurrentWeek;
              });

            console.log('🖨️ FINAL SORTED DATES FOR PRINT:', sortedDates.map(dateStr => {
              const date = new Date(dateStr + 'T12:00:00'); // Add noon for consistent timezone handling
              const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
              return `${dateStr} (${dayName})`;
            }));

            return sortedDates.map(dateStr => {
              const date = new Date(dateStr + 'T12:00:00'); // Add noon for consistent timezone handling
              const dayData = assignmentMap.get(dateStr);
              const isFriday = date.getDay() === 5;

              return `
                <div class="daily-section" style="margin-bottom: 30px; page-break-inside: avoid;">
                  <div class="day-header" style="background: ${isFriday ? '#fff3cd' : '#f8f9fa'}; padding: 10px; border: 2px solid #333; margin-bottom: 10px;">
                    <h2 style="margin: 0; font-size: 16px; text-align: center;">
                      ${format(date, 'EEEE, MMMM d, yyyy')}
                      ${isFriday ? ' (MANUAL ONLY - Backup Day)' : ''}
                    </h2>
                  </div>

                  <div class="mold-assignments" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
                    ${(Array.from(dayData.moldAssignments.entries()) as Array<[string, any[]]>).map((entry) => {
                      const [moldId, orders] = entry;
                      const mold = molds.find(m => m.moldId === moldId);

                      return `
                        <div class="mold-section" style="border: 1px solid #333; padding: 10px; background: white;">
                          <div class="mold-title" style="background: #e9ecef; padding: 5px; text-align: center; font-weight: bold; margin-bottom: 10px;">
                            ${moldId}${mold?.instanceNumber ? ` #${mold.instanceNumber}` : ''}
                            <div style="font-size: 10px; font-weight: normal;">${orders.length} Order(s)</div>
                          </div>

                          <div class="orders-list">
                            ${orders.sort((a: any, b: any) => {
                              // Sort by priority score (lower = higher priority), then by order ID
                              const aPriority = a.priorityScore || 99;
                              const bPriority = b.priorityScore || 99;
                              if (aPriority !== bPriority) return aPriority - bPriority;
                              return (a.orderId || '').localeCompare(b.orderId || '');
                            }).map((order: any, index: number) => {
                              const modelId = order.stockModelId || order.modelId;
                              const materialType = getMaterialType(modelId || '');
                              const isProduction = order.source === 'production_order';
                              const displayId = getDisplayOrderId(order) || 'No ID';
                              const modelName = getModelDisplayName(modelId || '');
                              const actionLength = getActionLengthDisplay(order);
                              const lopDisplay = getLOPDisplay(order);
                              const hasHeavyFill = getHeavyFillDisplay(order);
                              const customer = order.customerName || order.customer || order.customerId || 'Unknown Customer';

                              return `
                                <div class="order-item" style="border-bottom: 1px solid #ddd; padding: 8px 0; ${index === orders.length - 1 ? 'border-bottom: none;' : ''}">
                                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <div class="order-number" style="font-weight: bold; font-size: 12px;">
                                      ${displayId}
                                      ${isProduction ? '<span style="background: purple; color: white; padding: 1px 4px; border-radius: 2px; font-size: 8px; margin-left: 4px;">PO</span>' : ''}
                                    </div>
                                    <div class="material-type" style="background: ${materialType === 'CF' ? '#fed7aa' : materialType === 'FG' ? '#fbbf24' : '#e5e7eb'}; padding: 2px 6px; border-radius: 3px; font-size: 8px; font-weight: bold;">
                                      ${materialType || 'UNK'}
                                    </div>
                                  </div>

                                  <div class="order-details" style="font-size: 10px; line-height: 1.3;">
                                    <div><strong>Customer:</strong> ${customer}</div>
                                    <div><strong>Model:</strong> ${modelName}</div>
                                    ${actionLength ? `<div><strong>Action:</strong> ${actionLength}</div>` : ''}
                                    ${lopDisplay ? `<div><strong>LOP:</strong> ${lopDisplay}</div>` : ''}
                                    ${hasHeavyFill ? '<div style="color: #dc2626;"><strong>⚠ HEAVY FILL</strong></div>' : ''}
                                  </div>

                                  <div class="completion-checkbox" style="margin-top: 6px; display: flex; align-items: center;">
                                    <input type="checkbox" style="margin-right: 6px; transform: scale(1.2);">
                                    <label style="font-size: 9px; color: #666;">Layup Complete</label>
                                  </div>
                                </div>
                              `;
                            }).join('')}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>

                  <div class="day-summary" style="margin-top: 15px; padding: 8px; background: #f8f9fa; border: 1px solid #ddd; font-size: 10px;">
                    <strong>Daily Summary:</strong>
                    ${[...dayData.moldAssignments.values()].reduce((total: number, orders: any) => total + (orders as any[]).length, 0)} total orders across
                    ${dayData.moldAssignments.size} mold(s)
                    ${isFriday ? ' • <span style="color: #856404;">MANUAL SCHEDULING ONLY</span>' : ''}
                  </div>
                </div>
              `;
            }).join('');
          })()}
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

  // Helper to get order's model ID for compatibility checks
  const getOrderModelId = (order: any) => {
    // Prioritize stockModelId, then modelId
    return order.stockModelId || order.modelId;
  };

  // Key normalization function to convert FB Order Numbers back to Order IDs
  const normalizeOrderKey = useCallback((key: string): string => {
    // If key is already a valid Order ID, return it
    const isValidOrderId = processedOrders.some(order => order.orderId === key);
    if (isValidOrderId) {
      return key;
    }

    // Try to find order by FB Order Number
    const orderByFbNumber = processedOrders.find(order => {
      // Safely handle order object - cast to any to avoid type issues
      const orderAny = order as any;
      return getDisplayOrderId({ orderId: orderAny.orderId, fbOrderNumber: orderAny.fbOrderNumber }) === key;
    });
    if (orderByFbNumber) {
      console.warn(`🔧 KEY NORMALIZATION: Converting FB Order Number "${key}" to Order ID "${(orderByFbNumber as any).orderId}"`);
      return (orderByFbNumber as any).orderId;
    }

    console.warn(`⚠️ KEY NORMALIZATION: Unknown key "${key}" - keeping as is`);
    return key;
  }, [processedOrders]);

  // Friday validation function: Remove Friday assignments from automatic scheduling only
  const validateNoFridayAssignments = React.useCallback((assignments: { [orderId: string]: { moldId: string, date: string } }, allowManualFriday: boolean = false) => {
    const fridayAssignments = Object.entries(assignments).filter(([orderId, assignment]) => {
      const assignmentDate = new Date(assignment.date);
      return assignmentDate.getDay() === 5; // Friday check
    });

    if (fridayAssignments.length > 0) {
      console.log(`🔧 AUTO-SCHEDULER FRIDAY FILTER: Found ${fridayAssignments.length} Friday assignments from automatic scheduling`);
      fridayAssignments.forEach(([orderId, assignment]) => {
        console.log(`   - Removing auto-scheduled Friday: ${orderId} on ${new Date(assignment.date).toDateString()}`);
      });

      // Remove Friday assignments from automatic scheduling
      const cleanedAssignments = { ...assignments };
      fridayAssignments.forEach(([orderId]) => {
        delete cleanedAssignments[orderId];
      });

      console.log(`✅ Friday filter: Removed ${fridayAssignments.length} auto-scheduled Friday assignments, kept ${Object.keys(cleanedAssignments).length} Monday-Thursday assignments`);
      return cleanedAssignments;
    }

    return assignments;
  }, []);

  // FRIDAY VALIDATION: Verify no Friday assignments exist
  if (Object.keys(orderAssignments).length > 0) {
    const fridayAssignments = Object.entries(orderAssignments).filter(([orderId, assignment]) => {
      const assignmentDate = new Date(assignment.date);
      return assignmentDate.getDay() === 5;
    });

    if (fridayAssignments.length > 0) {
      console.error(`🚨 FRIDAY ASSIGNMENTS DETECTED:`, fridayAssignments.map(([id]) => id));
    } else {
      console.log(`✅ FRIDAY VALIDATION PASSED: ${Object.keys(orderAssignments).length} assignments, no Friday conflicts`);
    }
  }

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dragData = e.dataTransfer.getData('text/plain');
    const { orderId, source } = JSON.parse(dragData);

    const targetElement = e.target as HTMLElement;
    const dayCell = targetElement.closest('[data-day]');

    if (!dayCell) return;

    const day = parseInt(dayCell.getAttribute('data-day') || '0');
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];

    // Find the order being dropped
    const order = allOrders.find(o => o.orderId === orderId);
    if (!order) {
      toast({
        title: "Error",
        description: "Order not found",
        variant: "destructive",
      });
      return;
    }

    // Check mold compatibility
    const modelId = getOrderModelId(order);
    const compatibleMolds = molds.filter(mold => {
      if (!mold.enabled) return false;
      if (!mold.stockModels || mold.stockModels.length === 0) return true;
      if (mold.stockModels.includes(modelId)) return true;
      if (mold.stockModels.includes('universal')) return true;

      const normalizedModelId = modelId?.toLowerCase().replace(/[_-]/g, '') || '';
      return mold.stockModels.some(supported => {
        const normalizedSupported = supported.toLowerCase().replace(/[_-]/g, '');
        return normalizedSupported === normalizedModelId;
      });
    });

    if (compatibleMolds.length === 0) {
      toast({
        title: "Incompatible Mold Assignment",
        description: `Order ${orderId} (${modelId}) has no compatible molds available. Please check mold configurations.`,
        variant: "destructive",
      });
      return;
    }

    if (day === 5) { // Friday
      // Handle manual Friday assignment
      handleManualFridayAssignment(orderId, source);
    } else {
      toast({
        title: "Invalid Drop",
        description: `Can only manually assign orders to Friday. Today is ${dayName}.`,
        variant: "destructive",
      });
    }
  }, [toast, allOrders, molds]);

  // Initial Friday cleanup effect - run once when orderAssignments are first loaded (disabled to prevent cycles)
  React.useEffect(() => {
    if (!initialFridayCleanup && Object.keys(orderAssignments).length > 0) {
      console.log('🔧 Initial Friday cleanup: DISABLED to prevent scheduling cycles');
      console.log(`📊 Loaded ${Object.keys(orderAssignments).length} existing assignments`);
      setInitialFridayCleanup(true);
    }
  }, [orderAssignments, initialFridayCleanup]);

  // Auto-schedule function to automatically assign orders to molds and dates
  const handleAutoSchedule = () => {
    console.log('🤖 Starting automatic scheduling...');
    console.log('📊 Total processed orders available:', processedOrders.length);
    console.log('📊 Current order assignments:', Object.keys(orderAssignments).length);

    const unassignedOrders = processedOrders.filter(order => !orderAssignments[order.orderId]);
    console.log(`📋 Scheduling ${unassignedOrders.length} unassigned orders`);
    console.log('📋 First 10 unassigned orders:', unassignedOrders.slice(0, 10).map(o => ({
      orderId: o.orderId,
      source: o.source,
      stockModelId: o.stockModelId || o.modelId,
      dueDate: o.dueDate
    })));

    if (unassignedOrders.length === 0) {
      toast({
        title: "No Orders to Schedule",
        description: "All orders are already scheduled",
      });
      return;
    }

    // Get work days for scheduling based on selected days
    const getWorkDays = (startDate: Date, weeksCount: number = 8) => {
      const workDays: Date[] = [];
      console.log(`📅 Generating work days starting from: ${startDate.toDateString()} (Day: ${startDate.getDay()})`);
      console.log(`📅 Selected work days: ${selectedWorkDays.map(d => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][d]).join(', ')}`);

      for (let week = 0; week < weeksCount; week++) {
        const weekStart = startOfWeek(startDate, { weekStartsOn: 1 }); // Get Monday of current week
        const actualWeekStart = addDays(weekStart, week * 7); // Add weeks

        // Generate days based on user selection (Monday = 0 offset, Tuesday = 1 offset, etc.)
        for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
          const dayOfWeek = dayOffset + 1; // Monday = 1, Tuesday = 2, etc.
          if (selectedWorkDays.includes(dayOfWeek)) {
            const workDay = addDays(actualWeekStart, dayOffset);
            workDays.push(workDay);
          }
        }
      }

      return workDays;
    };

    const workDays = getWorkDays(currentDate, 8);
    const newAssignments = { ...orderAssignments };

    // Sort orders by priority and due date
    const sortedOrders = [...unassignedOrders].sort((a, b) => {
      // Priority by source: P1 purchase orders first, then regular orders
      if (a.source === 'p1_purchase_order' && b.source !== 'p1_purchase_order') return -1;
      if (b.source === 'p1_purchase_order' && a.source !== 'p1_purchase_order') return 1;

      // Then by priority score
      const aPriority = a.priorityScore || 99;
      const bPriority = b.priorityScore || 99;
      if (aPriority !== bPriority) return aPriority - bPriority;

      // Then by due date
      const aDueDate = new Date(a.dueDate || a.orderDate).getTime();
      const bDueDate = new Date(b.dueDate || b.orderDate).getTime();
      return aDueDate - bDueDate;
    });

    // Get compatible molds for an order - ENHANCED LOGGING
    const getCompatibleMolds = (order: any) => {
      const modelId = order.stockModelId || order.modelId;
      
      // DEBUG: Log what we're looking for
      console.log(`🔍 MOLD MATCH: Order ${order.orderId} looking for model "${modelId}"`);
      
      const compatibleMolds = molds.filter(mold => {
        if (!mold.enabled) return false;
        if (!mold.stockModels || mold.stockModels.length === 0) return true;
        
        const hasMatch = mold.stockModels.includes(modelId);
        
        // DEBUG: Log specific mold checking for Mesa Universal
        if (modelId === 'mesa_universal' || mold.moldId.includes('Mesa')) {
          console.log(`🔍 MESA MOLD CHECK: ${mold.moldId} stockModels=[${mold.stockModels.join(', ')}] → Match: ${hasMatch}`);
        }
        
        return hasMatch;
      });

      if (compatibleMolds.length === 0) {
        console.warn(`❌ No compatible molds for order ${order.orderId} with model ${modelId}`);
        console.warn('Available Mesa molds:', molds.filter(m => m.enabled && m.moldId.includes('Mesa')).map(m => ({ moldId: m.moldId, stockModels: m.stockModels })));
      } else if (modelId === 'mesa_universal') {
        console.log(`✅ MESA MATCH: Order ${order.orderId} found ${compatibleMolds.length} compatible Mesa molds: ${compatibleMolds.map(m => m.moldId).join(', ')}`);
      }

      return compatibleMolds;
    };

    // Track mold capacity per day
    const moldCapacity: {[key: string]: number} = {};

    let assignedCount = 0;
    let skippedCount = 0;

    // Schedule each order
    sortedOrders.forEach((order, index) => {
      const compatibleMolds = getCompatibleMolds(order);

      if (compatibleMolds.length === 0) {
        console.warn(`❌ No compatible molds found for order ${order.orderId} (${index + 1}/${sortedOrders.length})`);
        skippedCount++;
        return;
      }

      let assigned = false;

      // Try to assign to each work day (Monday-Thursday only)
      for (const date of workDays) {
        if (assigned) break;

        const dateString = date.toISOString();

        // Try each compatible mold
        for (const mold of compatibleMolds) {
          const moldCapacityKey = `${mold.moldId}|${dateString}`;
          const currentCapacity = moldCapacity[moldCapacityKey] || 0;
          const maxCapacity = mold.multiplier || 2;

          // Check if mold has capacity on this date
          if (currentCapacity < maxCapacity) {
            // Assign the order
            newAssignments[order.orderId] = {
              moldId: mold.moldId,
              date: dateString
            };

            // Update capacity tracking
            moldCapacity[moldCapacityKey] = currentCapacity + 1;
            assignedCount++;
            assigned = true;

            if (assignedCount <= 5 || assignedCount % 10 === 0) {
              console.log(`✅ Assigned ${order.orderId} to ${mold.moldId} on ${format(date, 'MM/dd')} (${assignedCount}/${sortedOrders.length})`);
            }
            break;
          }
        }
      }

      if (!assigned) {
        console.warn(`❌ Could not assign order ${order.orderId} - no available capacity (${index + 1}/${sortedOrders.length})`);
        skippedCount++;
      }
    });

    // Since getWorkDays() only generates Monday-Thursday, no Friday validation needed
    // Just set assignments directly - they're guaranteed to be valid workdays
    console.log(`🔒 Setting ${Object.keys(newAssignments).length} assignments (all pre-validated Mon-Thu only)`);
    setOrderAssignments(newAssignments);
    setHasUnsavedScheduleChanges(true);

    // Show results
    toast({
      title: "Auto-Schedule Complete",
      description: `Scheduled ${assignedCount} orders. ${skippedCount > 0 ? `${skippedCount} orders could not be scheduled.` : ''}`,
    });

    console.log(`🎯 Auto-schedule results: ${assignedCount} assigned, ${skippedCount} skipped`);
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
                <span className="text-blue-700 dark:text-blue-300 font-medium">{orders.length} Orders in Production Queue</span>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                <span className="text-green-700 dark:text-green-300 font-medium">
                  {Object.keys(orderAssignments).length} Scheduled Orders
                </span>
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-900/20 px-3 py-2 rounded-lg">
                <span className="text-cyan-700 dark:text-cyan-300 font-medium">{molds.filter(m => m.enabled).length} Active Molds</span>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-lg">
                <span className="text-purple-700 dark:text-purple-300 font-medium">{employees.length} Employees</span>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 px-3 py-2 rounded-lg">
                <span className="text-orange-700 dark:text-orange-300 font-medium">Mesa Universal: 8/day limit</span>
              </div>
            </div>
          </div>
        </div>

        {/* Control Bar */}
        <div className="px-6 pb-4">
          <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex space-x-2">

              {/* Settings Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <Dialog>
                    <DialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Calendar className="w-4 h-4 mr-2" />
                        Work Days
                      </DropdownMenuItem>
                    </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Work Day Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Select which days should be included when generating layup schedules.
                        All days Monday-Friday will remain visible in the calendar.
                      </p>
                      <div className="space-y-3">
                        {[
                          { day: 1, label: 'Monday' },
                          { day: 2, label: 'Tuesday' },
                          { day: 3, label: 'Wednesday' },
                          { day: 4, label: 'Thursday' },
                          { day: 5, label: 'Friday' }
                        ].map(({ day, label }) => (
                          <div key={day} className="flex items-center space-x-2">
                            <Checkbox
                              id={`day-${day}`}
                              checked={pendingWorkDays.includes(day)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setPendingWorkDays(prev => [...prev, day].sort());
                                } else {
                                  setPendingWorkDays(prev => prev.filter(d => d !== day));
                                }
                              }}
                            />
                            <label
                              htmlFor={`day-${day}`}
                              className={`text-sm cursor-pointer font-medium ${
                                day === 5 ? 'text-amber-700 dark:text-amber-300' : ''
                              }`}
                            >
                              {label}
                              {day === 5 && ' (Backup Day)'}
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          <strong>Current days:</strong> {selectedWorkDays.length === 0 ? 'None selected' :
                            selectedWorkDays.map(d => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][d]).join(', ')}
                        </p>
                        {JSON.stringify(pendingWorkDays) !== JSON.stringify(selectedWorkDays) && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            <strong>Pending changes:</strong> {pendingWorkDays.length === 0 ? 'None selected' :
                              pendingWorkDays.map(d => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][d]).join(', ')}
                          </p>
                        )}
                      </div>
                      
                      {/* Apply button */}
                      {JSON.stringify(pendingWorkDays) !== JSON.stringify(selectedWorkDays) && (
                        <div className="flex justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPendingWorkDays(selectedWorkDays)}
                            disabled={isApplyingChanges}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={applyWorkDayChanges}
                            disabled={isApplyingChanges}
                          >
                            {isApplyingChanges ? 'Applying...' : 'Apply Changes'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>


                <Dialog>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Settings className="w-4 h-4 mr-2" />
                      Mold Settings
                    </DropdownMenuItem>
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
                          checked={pendingMoldChanges[mold.moldId]?.enabled ?? (mold.enabled ?? true)}
                          onCheckedChange={(checked) => {
                            const currentChanges = pendingMoldChanges[mold.moldId] || {};
                            setPendingMoldChanges(prev => ({
                              ...prev,
                              [mold.moldId]: {
                                ...currentChanges,
                                enabled: !!checked,
                                multiplier: currentChanges.multiplier ?? mold.multiplier
                              }
                            }));
                          }}
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
                            value={pendingMoldChanges[mold.moldId]?.multiplier ?? mold.multiplier}
                            min={1}
                            onChange={(e) => {
                              const currentChanges = pendingMoldChanges[mold.moldId] || {};
                              setPendingMoldChanges(prev => ({
                                ...prev,
                                [mold.moldId]: {
                                  ...currentChanges,
                                  enabled: currentChanges.enabled ?? (mold.enabled ?? true),
                                  multiplier: +e.target.value
                                }
                              }));
                            }}
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
                        Adjust daily capacity to reflect each mold's production capability. Click Apply to save changes.
                      </p>
                    )}
                  </div>
                  
                  {/* Apply button */}
                  {Object.keys(pendingMoldChanges).length > 0 && (
                    <div className="flex justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPendingMoldChanges({})}
                        disabled={isApplyingChanges}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={applyMoldChanges}
                        disabled={isApplyingChanges}
                      >
                        {isApplyingChanges ? 'Applying...' : 'Apply Changes'}
                      </Button>
                    </div>
                  )}
                </div>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Users className="w-4 h-4 mr-2" />
                      Employee Settings
                    </DropdownMenuItem>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Employee Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Configure employee assignments and capacity settings for production scheduling.
                      </p>
                      <div className="space-y-4">
                        {employees.map((employee: any) => (
                          <div key={employee.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-sm">{employee.name}</div>
                                  <div className="text-xs text-gray-500">{employee.department || 'Layup Department'}</div>
                                </div>
                                <div className="text-xs text-gray-500">
                                  ID: {employee.employeeId}
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                                    Hours per Day
                                  </label>
                                  <div className="flex items-center space-x-2">
                                    <Input
                                      type="number"
                                      value={pendingEmployeeChanges[employee.id]?.hours ?? (employee.hours || 8)}
                                      min={1}
                                      max={12}
                                      step="0.5"
                                      onChange={(e) => {
                                        const newHours = parseFloat(e.target.value) || 8;
                                        const currentChanges = pendingEmployeeChanges[employee.id] || {};
                                        const moldsPerHour = currentChanges.moldsPerHour ?? (employee.moldsPerHour || 1.25);
                                        setPendingEmployeeChanges(prev => ({
                                          ...prev,
                                          [employee.id]: {
                                            ...currentChanges,
                                            hours: newHours,
                                            moldsPerHour,
                                            dailyCapacity: Math.floor(newHours * moldsPerHour)
                                          }
                                        }));
                                      }}
                                      className="w-20 text-sm"
                                    />
                                    <span className="text-xs text-gray-500">hours/day</span>
                                  </div>
                                </div>
                                
                                <div>
                                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                                    Molds per Hour
                                  </label>
                                  <div className="flex items-center space-x-2">
                                    <Input
                                      type="number"
                                      step="0.25"
                                      value={pendingEmployeeChanges[employee.id]?.moldsPerHour ?? (employee.moldsPerHour || 1.25)}
                                      min={0.25}
                                      max={5}
                                      onChange={(e) => {
                                        const newMoldsPerHour = parseFloat(e.target.value) || 1.25;
                                        const currentChanges = pendingEmployeeChanges[employee.id] || {};
                                        const hours = currentChanges.hours ?? (employee.hours || 8);
                                        setPendingEmployeeChanges(prev => ({
                                          ...prev,
                                          [employee.id]: {
                                            ...currentChanges,
                                            hours,
                                            moldsPerHour: newMoldsPerHour,
                                            dailyCapacity: Math.floor(hours * newMoldsPerHour)
                                          }
                                        }));
                                      }}
                                      className="w-20 text-sm"
                                    />
                                    <span className="text-xs text-gray-500">molds/hour</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                                <div className="text-xs text-gray-500">
                                  Calculated Daily Capacity:
                                </div>
                                <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                  {(() => {
                                    const changes = pendingEmployeeChanges[employee.id];
                                    const hours = changes?.hours ?? (employee.hours || 8);
                                    const moldsPerHour = changes?.moldsPerHour ?? (employee.moldsPerHour || 1.25);
                                    return Math.floor(hours * moldsPerHour);
                                  })()} molds/day
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          <strong>How to use:</strong> Set hours per day and molds per hour for each employee. 
                          Daily capacity is calculated automatically (hours × molds/hour).
                          Click Apply to save changes to the scheduling system.
                        </p>
                      </div>
                      
                      {/* Apply button */}
                      {Object.keys(pendingEmployeeChanges).length > 0 && (
                        <div className="flex justify-end space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPendingEmployeeChanges({})}
                            disabled={isApplyingChanges}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={applyEmployeeChanges}
                            disabled={isApplyingChanges}
                          >
                            {isApplyingChanges ? 'Applying...' : 'Apply Changes'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </DropdownMenuContent>
            </DropdownMenu>

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
            {/* Old global lock button removed - replaced with week-specific locking */}

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
                  const dayOfWeek = date.getDay();
                  const isWorkDay = selectedWorkDays.includes(dayOfWeek);
                  const dateWeekLocked = isWeekLocked(date);

                  return (
                    <div
                      key={date.toISOString()}
                      className={`p-3 border text-center font-semibold text-sm ${
                        dateWeekLocked
                          ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                          : isWorkDay
                            ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
                            : 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10 opacity-75'
                      }`}
                    >
                      {format(date, 'MM/dd')}
                      {dateWeekLocked && (
                        <div className="text-xs text-red-600 dark:text-red-400">
                          🔒 LOCKED
                        </div>
                      )}
                      <div className={`text-xs mt-1 ${
                        dateWeekLocked
                          ? 'text-red-600 dark:text-red-400'
                          : isWorkDay
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {format(date, 'EEE')}
                        <div className="text-[10px] font-medium">
                          {dateWeekLocked ? 'Week Locked' : isWorkDay ? 'Work Day' : 'Manual Only'}
                        </div>
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
          collisionDetection={closestCorners}
        >
          <div className="px-6 pb-6">
            {viewType === 'week' || viewType === 'day' ? (
              <div className="space-y-6">
                {/* Auto-Schedule Controls */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Layup Schedule
                        </h3>
                        {isCurrentWeekLocked() && (
                          <Badge variant="destructive" className="animate-pulse">
                            🔒 THIS WEEK LOCKED
                          </Badge>
                        )}
                        {!isCurrentWeekLocked() && Object.keys(orderAssignments).length > 0 && (
                          <Badge variant="secondary">
                            📝 EDITING THIS WEEK
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {isCurrentWeekLocked() 
                          ? `Current week (${format(currentDate, 'MM/dd')}) is locked with assignments • ${Object.keys(orderAssignments).length} total orders scheduled`
                          : `${processedOrders.filter(o => !orderAssignments[o.orderId]).length} orders ready to schedule • ${Object.keys(orderAssignments).length} orders currently scheduled`
                        }
                      </p>
                    </div>
                    <div className="space-x-2">
                      <Button
                        onClick={generateAlgorithmicSchedule}
                        disabled={processedOrders.filter(o => !orderAssignments[o.orderId]).length === 0}
                        className="bg-blue-600 hover:bg-blue-700"
                        size="sm"
                      >
                        <Zap className="w-4 h-4 mr-1" />
                        Auto Schedule ({processedOrders.filter(o => !orderAssignments[o.orderId]).length} orders)
                      </Button>
                      <Button
                        onClick={clearSchedule}
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50"
                        size="sm"
                      >
                        Clear Schedule
                      </Button>
                      {Object.keys(orderAssignments).length > 0 && (
                        <>
                          <Button
                            onClick={async () => {
                              const weekKey = getWeekKey(currentDate);
                              const currentWeekLocked = isCurrentWeekLocked();
                              
                              if (currentWeekLocked) {
                                // Unlock current week
                                setLockedWeeks(prev => {
                                  const updated = { ...prev };
                                  delete updated[weekKey];
                                  return updated;
                                });
                                toast({
                                  title: "Week Unlocked",
                                  description: `Week of ${format(currentDate, 'MM/dd')} unlocked for editing`,
                                });
                              } else {
                                // Save and lock current week
                                try {
                                  // Prepare schedule entries for saving (without moving orders)
                                  const scheduleEntries = Object.entries(orderAssignments).map(([orderId, assignment]) => ({
                                    orderId,
                                    scheduledDate: assignment.date,
                                    moldId: assignment.moldId,
                                    employeeId: null, // Assignment object doesn't include employeeId in this context
                                    isOverride: false // Manual schedule save, always treated as override
                                  }));

                                  console.log('💾 Saving weekly schedule only:', scheduleEntries.length, 'entries');

                                  // Save schedule entries only (no department changes)
                                  const response = await fetch('/api/layup-schedule/save', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      entries: scheduleEntries,
                                      weekStart: dates[0].toISOString(),
                                      workDays: selectedWorkDays
                                    })
                                  });

                                  const result = await response.json();

                                  if (result.success) {
                                    console.log('✅ Weekly schedule saved successfully');
                                    setLockedWeeks(prev => ({ ...prev, [weekKey]: true }));

                                    // Show success feedback
                                    toast({
                                      title: "Week Locked",
                                      description: `Week of ${format(currentDate, 'MM/dd')} locked with ${scheduleEntries.length} assignments.`,
                                    });

                                    // Keep the schedule visible (don't clear orderAssignments)
                                    // This allows viewing the saved schedule and making adjustments
                                  } else {
                                    console.error('❌ Failed to save schedule:', result.error);
                                    alert('Failed to save schedule: ' + result.error);
                                  }
                                } catch (error) {
                                  console.error('❌ Error saving schedule:', error);
                                  alert('Error saving schedule. Please try again.');
                                }
                              }
                            }}
                            className={`${isCurrentWeekLocked()
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-green-600 hover:bg-green-700'
                            }`}
                            size="sm"
                          >
                            {isCurrentWeekLocked() ? (
                              <>
                                <ArrowRight className="w-4 h-4 mr-1" />
                                Unlock Week ({format(currentDate, 'MM/dd')})
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4 mr-1" />
                                Lock Week ({format(currentDate, 'MM/dd')})
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={() => setOrderAssignments({})}
                            variant="outline"
                            size="sm"
                          >
                            Clear All
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main Content: Schedule Grid (Full Width) */}
                <div>
                  {/* Schedule Grid */}
                  <div>
                    <div
                      className="grid gap-1"
                      style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}
                    >
                  {/* Rows for each mold - Show relevant molds sorted by order count (most orders first) */}
                  {(() => {
                    // Get molds that are compatible with any order in the current queue
                    const getCompatibleMolds = (order: any) => {
                      const modelId = getOrderModelId(order);
                      return molds.filter(mold => {
                        if (!mold.enabled) return false;
                        if (!mold.stockModels || mold.stockModels.length === 0) return true; // No restrictions
                        if (mold.stockModels.includes(modelId)) return true; // Exact match
                        if (mold.stockModels.includes('universal')) return true; // Universal mold

                        // Normalize and compare stock models for variations
                        const normalizedModelId = modelId?.toLowerCase().replace(/[_-]/g, '') || '';
                        return mold.stockModels.some(supported => {
                          const normalizedSupported = supported.toLowerCase().replace(/[_-]/g, '');
                          return normalizedSupported === normalizedModelId;
                        });
                      });
                    };

                    // Find molds that have actual order assignments only (hide empty molds)
                    const relevantMolds = molds.filter(m => {
                      if (!m.enabled) return false;

                      // Only include molds that have orders assigned
                      const hasAssignments = Object.values(orderAssignments).some(assignment => assignment.moldId === m.moldId);
                      return hasAssignments;
                    });

                    // Calculate order counts for relevant molds
                    const moldOrderCounts = relevantMolds.map(mold => {
                      const totalOrdersForMold = dates.reduce((count, date) => {
                        const dateString = date.toISOString();
                        const cellDateOnly = dateString.split('T')[0];

                        const ordersForThisMoldDate = Object.entries(orderAssignments).filter(([orderId, assignment]) => {
                          const assignmentDateOnly = assignment.date.split('T')[0];
                          // CRITICAL FIX: Use UTC date comparison to prevent timezone bugs
                          const assignmentDate = new Date(assignment.date);
                          const cellDate = new Date(dateString);

                          const assignmentDateStr = assignmentDate.toISOString().split('T')[0];
                          const cellDateStr = cellDate.toISOString().split('T')[0];

                          return assignment.moldId === mold.moldId && assignmentDateStr === cellDateStr;
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

                    // Use only relevant molds
                    const activeMolds = sortedMolds.map(({ mold }) => mold);

                    // Debug Monday assignments specifically
                    const mondayDate = dates.find(date => date.getDay() === 1);
                    if (mondayDate) {
                      const mondayDateStr = mondayDate.toISOString().split('T')[0];
                      const mondayAssignments = Object.entries(orderAssignments).filter(([_, assignment]) => {
                        return assignment.date.split('T')[0] === mondayDateStr;
                      });
                      console.log(`📅 MONDAY DEBUG: Date ${mondayDateStr}, ${mondayAssignments.length} assignments found`);
                      mondayAssignments.forEach(([orderId, assignment]) => {
                        console.log(`   📅 ${orderId} → ${assignment.moldId}`);
                      });
                    }

                    return activeMolds.map(mold => (
                      <React.Fragment key={mold.moldId}>
                        {(() => {
                          // Show ALL dates for this mold to ensure complete grid structure
                          return dates.map(date => {
                            const dateString = date.toISOString();

                            // Get orders assigned to this mold/date combination
                            const cellOrders = Object.entries(orderAssignments)
                              .filter(([orderId, assignment]) => {
                                const assignmentDate = new Date(assignment.date);
                                const cellDate = new Date(dateString);

                                // Use date-only comparison to avoid timezone issues
                                const assignmentDateStr = assignmentDate.toISOString().split('T')[0];
                                const cellDateStr = cellDate.toISOString().split('T')[0];
                                const moldMatch = assignment.moldId === mold.moldId;
                                const dateMatch = assignmentDateStr === cellDateStr;
                                const isMatch = moldMatch && dateMatch;

                                // Debug Monday assignments specifically
                                if (cellDate.getDay() === 1 && isMatch) {
                                  console.log(`✅ Monday assignment found: ${orderId} → ${assignment.moldId} on ${cellDateStr}`);
                                }

                                // FRIDAY HANDLING: Remove Friday assignments (should not exist)
                                if (cellDate.getDay() === 5 && isMatch) {
                                  console.warn(`⚠️ Friday assignment detected and will be filtered out: ${orderId} on ${cellDate.toDateString()}`);
                                  return false; // Exclude Friday assignments
                                }

                                // DEBUG: Specific check for AI141 and AG822 (AI266)
                                if (orderId === 'AG822') {
                                  console.error(`🔍 AG822 (AI266) MATCHING DEBUG:`);
                                  console.error(`   Calendar date: ${date.toDateString()} (day ${date.getDay()})`);
                                  console.error(`   Assignment date: ${assignment.date}`);
                                  console.error(`   Assignment date only: ${assignment.date.split('T')[0]}`);
                                  console.error(`   Calendar date only: ${dateString.split('T')[0]}`);
                                  console.error(`   Is match: ${isMatch}`);
                                  console.error(`   Mold: ${assignment.moldId}`);
                                }

                                // DEBUG: FB Order Number key detection - AI141 should be normalized to AH005
                                if (orderId.match(/^[A-Z]{2}\d{3}$/) && !processedOrders.some(o => o.orderId === orderId)) {
                                  console.error(`👻 FB ORDER NUMBER AS KEY DETECTED: ${orderId}`);
                                  console.error(`   Calendar date: ${date.toDateString()} (day ${date.getDay()})`);
                                  console.error(`   Assignment date: ${assignment.date}`);
                                  console.error(`   Assignment date only: ${assignment.date.split('T')[0]}`);
                                  console.error(`   Calendar date only: ${dateString.split('T')[0]}`);
                                  console.error(`   Is match: ${isMatch}`);
                                  console.error(`   Mold: ${assignment.moldId}`);
                                  console.error(`   ❗ This is an FB Order Number being used as a key - should be normalized!`);

                                  // Try to find the actual order
                                  const actualOrder = processedOrders.find(o => {
                                    const orderAny = o as any;
                                    return getDisplayOrderId({ orderId: orderAny.orderId, fbOrderNumber: orderAny.fbOrderNumber }) === orderId;
                                  });
                                  if (actualOrder) {
                                    console.error(`   🔧 Should be Order ID: ${(actualOrder as any).orderId}`);
                                  }
                                }

                                // DEBUG: Log Friday assignments being displayed
                                if (isMatch && date.getDay() === 5) {
                                  console.error(`🚨 DISPLAYING FRIDAY ORDER: ${orderId} on ${date.toDateString()}`);
                                  console.error(`   Assignment date: ${assignment.date}`);
                                  console.error(`   Mold: ${assignment.moldId}`);
                                  console.error(`   Order lookup result:`, processedOrders.find(o => o.orderId === orderId) ? 'FOUND' : 'NOT FOUND');

                                  // Check if this is an FB Order Number key issue
                                  const actualOrder = processedOrders.find(o => {
                                    const orderAny = o as any;
                                    return getDisplayOrderId({ orderId: orderAny.orderId, fbOrderNumber: orderAny.fbOrderNumber }) === orderId;
                                  });
                                  if (actualOrder) {
                                    console.error(`   🔧 KEY ISSUE: ${orderId} is FB Order Number, should be ${(actualOrder as any).orderId}`);
                                  }

                                  // Add to debug info state to show in UI
                                  const orderForDisplay = processedOrders.find(o => (o as any).orderId === orderId);
                                  const displayOrderId = orderForDisplay
                                    ? getDisplayOrderId({ orderId: (orderForDisplay as any).orderId, fbOrderNumber: (orderForDisplay as any).fbOrderNumber })
                                    : actualOrder ? `${orderId} (FB#)` : orderId;
                                  const errorMsg = `🚨 FRIDAY ORDER ON CALENDAR: ${orderId} (${displayOrderId}) on ${date.toDateString()} mold ${assignment.moldId}`;
                                  setDebugInfo(prev => {
                                    if (!prev.includes(errorMsg)) {
                                      return [...prev, errorMsg];
                                    }
                                    return prev;
                                  });
                                }

                                return isMatch;
                              })
                              .map(([orderId]) => {
                                // First try to find in processedOrders
                                let order = processedOrders.find(o => o.orderId === orderId);
                                
                                // If not found, try in original orders array
                                if (!order) {
                                  order = orders.find(o => o.orderId === orderId);
                                }
                                
                                if (!order) {
                                  // Log missing order for debugging
                                  console.warn(`⚠️ Order ${orderId} not found in processedOrders or orders arrays`);
                                  
                                  // Return a placeholder that shows the order is scheduled but missing from queue
                                  return {
                                    orderId: orderId,
                                    product: `SCHEDULED: ${orderId}`,
                                    customer: 'Order Missing from Queue',
                                    quantity: 1,
                                    id: orderId,
                                    orderDate: new Date().toISOString(),
                                    status: 'scheduled',
                                    department: 'layup',
                                    currentDepartment: 'layup',
                                    priorityScore: 1,
                                    source: 'production_order',
                                    stockModelId: 'mesa_universal',
                                    features: { action_length: 'Short' },
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date().toISOString()
                                  };
                                }
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
                                selectedWorkDays={selectedWorkDays}
                                isWeekLocked={isWeekLocked}
                              />
                            );
                          });
                        })()}
                      </React.Fragment>
                    ));
                  })()}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Month view not yet implemented
              </div>
            )}
          </div>
          
          {/* Drag Overlay for visual feedback during drag operations */}
          <DragOverlay>
            {activeId ? (
              <div className="p-2 bg-blue-100 dark:bg-blue-900 border-2 border-blue-300 dark:border-blue-600 rounded-lg shadow-lg opacity-90 transform rotate-2">
                <div className="text-sm font-bold text-blue-800 dark:text-blue-200">
                  {getDisplayOrderId({ orderId: activeId }) || activeId}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-300">
                  Dragging...
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}