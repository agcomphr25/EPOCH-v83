import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
          {order.orderId || 'No ID'}
          {order.source === 'p1_purchase_order' && <span className="text-xs ml-1 bg-green-200 dark:bg-green-700 px-1 rounded">P1</span>}
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
            if (!orderFeatures) {
              console.log(`❌ No features for order ${order.orderId}`);
              return null;
            }
            
            console.log(`🔍 Checking action length for ${order.orderId}:`, {
              action_length: orderFeatures.action_length,
              action_inlet: orderFeatures.action_inlet,
              action: orderFeatures.action,
              modelId: modelId
            });
            
            // Look for action_length field first
            let actionLengthValue = orderFeatures.action_length;
            
            // If action_length is empty or 'none', try to derive from action_inlet or action field
            if (!actionLengthValue || actionLengthValue === 'none') {
              const actionField = orderFeatures.action_inlet || orderFeatures.action;
              
              if (actionField) {
                // Map common action inlets/actions to action lengths based on actual data patterns
                const actionToLengthMap: {[key: string]: string} = {
                  // Standard action inlet mappings
                  'anti_ten_hunter_def': 'SA', // Short action
                  'def_dev_hunter_rem': 'LA', // Long action based on database data
                  'def_anti': 'SA', // Defiance Anti action - Short
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
                  // Bergara actions
                  'bergara_b14': 'SA',
                  'bergara_premier': 'SA',
                  'bergara_hmr': 'SA',
                  'carbon_six_medium': 'MA',
                  // Lone Peak actions
                  'lone_peak_fuzion': 'SA',
                  'lone_peak_razorback': 'SA',
                  'lone_peak_ascent': 'SA',
                  // Defiance actions
                  'defiance_deviant': 'SA',
                  'defiance_rebel': 'SA',
                  'def_deviant': 'SA',
                  'def_deviant_hunter': 'SA',
                  // Mack Bros actions
                  'mack_bros_evo_ii': 'SA',
                  'mack_bros_evo': 'SA',
                  // APR actions
                  'apr': 'SA',
                  'american_rifle_company': 'SA',
                  // Zermatt actions
                  'zermatt_origin': 'SA',
                  'zermatt_tl3': 'SA',
                  // Terminus actions
                  'terminus_apollo': 'SA',
                  'terminus_kratos': 'SA',
                  // Impact actions
                  'impact_737r': 'SA',
                  'impact_nbk': 'SA',
                  // Bighorn actions
                  'bighorn_origin': 'SA',
                  'bighorn_tl3': 'SA',
                  // Curtis actions
                  'curtis_axiom': 'SA',
                  // Default fallback for unknown actions (most are short action)
                  'unknown': 'SA'
                };
                
                actionLengthValue = actionToLengthMap[actionField];
                console.log(`🎯 Mapped ${actionField} to ${actionLengthValue}`);
              }
            }
            
            // If still no action length found, apply comprehensive fallback logic
            if (!actionLengthValue) {
              // Skip orders that don't need action length display
              const skipActionLength = modelId && (
                modelId.toLowerCase().includes('tikka') || 
                modelId.toLowerCase().includes('mesa_universal') ||
                (orderFeatures.action_inlet && orderFeatures.action_inlet.toLowerCase().includes('tikka')) ||
                (orderFeatures.action && orderFeatures.action.toLowerCase().includes('tikka'))
              );
              
              if (skipActionLength) {
                console.log(`⏭️ Skipping ${modelId} order ${order.orderId} - no action length needed`);
                return null;
              }
              
              // For all non-Tikka orders, provide a fallback action length
              if (modelId) {
                if (modelId.includes('alpine') || modelId.includes('hunter')) {
                  actionLengthValue = 'SA';
                  console.log(`🎯 Defaulting Alpine Hunter ${modelId} to SA (Short Action)`);
                } else {
                  // Default fallback for any other non-Tikka order
                  actionLengthValue = 'SA'; // Most actions are short action
                  console.log(`🔧 Fallback: Setting ${order.orderId} to SA (default for unknown action)`);
                }
              } else {
                // Final fallback - every non-Tikka order gets SA
                actionLengthValue = 'SA';
                console.log(`🔧 Final fallback: Setting ${order.orderId} to SA`);
              }
            }
            
            if (!actionLengthValue || actionLengthValue === 'none') {
              console.log(`❌ No action length found for ${order.orderId}`);
              return null;
            }
            
            // Simple abbreviation mapping without depending on features API
            const displayMap: {[key: string]: string} = {
              'Long': 'LA', 'Medium': 'MA', 'Short': 'SA',
              'long': 'LA', 'medium': 'MA', 'short': 'SA',
              'LA': 'LA', 'MA': 'MA', 'SA': 'SA'
            };
            
            const result = displayMap[actionLengthValue] || actionLengthValue;
            console.log(`✅ Final action length for ${order.orderId}: ${result}`);
            return result;
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

  // Auto-schedule system using Monday-only LOP constraints
  const generateAutoSchedule = useCallback(() => {
    if (!orders.length || !molds.length || !employees.length) {
      console.log('❌ Cannot generate schedule: missing data');
      return;
    }

    console.log('🚀 Generating auto-schedule with LOP Monday-only constraints for', orders.length, 'orders');
    
    try {
      // Convert orders to scheduler format with proper feature inclusion
      const layupOrders = orders.map(order => ({
        orderId: order.orderId,
        orderDate: new Date(order.orderDate),
        dueDate: new Date(order.dueDate || order.orderDate),
        priorityScore: order.priorityScore || 5,
        customer: order.customer,
        product: order.product,
        modelId: (order as any).stockModelId || (order as any).modelId,
        stockModelId: (order as any).stockModelId || (order as any).modelId,
        features: (order as any).features || {}, // Include features for LOP detection
        source: (order as any).source || 'main_orders'
      }));

      // Convert molds to scheduler format
      const moldSettings = molds.filter(m => m.enabled).map(mold => ({
        moldId: mold.moldId,
        modelName: mold.modelName,
        instanceNumber: mold.instanceNumber || 1,
        enabled: true,
        multiplier: mold.multiplier || 1,
        stockModels: mold.stockModels || []
      }));

      // Convert employees to scheduler format
      const employeeSettings = employees.map(emp => ({
        employeeId: emp.employeeId,
        name: emp.name || emp.employeeId,
        rate: emp.rate || 1.5,
        hours: emp.hours || 8
      }));

      console.log('🔧 Calling generateLayupSchedule with Monday-only LOP constraints...');
      console.log(`📊 Input data: ${layupOrders.length} orders, ${moldSettings.length} molds, ${employeeSettings.length} employees`);
      
      // Debug: Show order distribution by source
      const ordersBySource = layupOrders.reduce((acc, order) => {
        const source = order.source || 'unknown';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('📊 Orders by source:', ordersBySource);
      console.log('📋 Sample P1 orders:', layupOrders.filter(o => o.source === 'p1_purchase_order').slice(0, 3).map(o => ({ orderId: o.orderId, customer: o.customer })));
      console.log('📋 Sample P2 orders:', layupOrders.filter(o => o.source === 'p2_production_order').slice(0, 3).map(o => ({ orderId: o.orderId, customer: o.customer })));
      
      // Use the proper scheduler utility with LOP Monday-only logic
      const scheduleResults = generateLayupSchedule(layupOrders, moldSettings, employeeSettings);
      
      console.log(`📊 Raw scheduler response:`, scheduleResults);
      
      console.log(`📅 Scheduler returned ${scheduleResults.length} assignments`);

      // Convert schedule results to assignment format
      const newAssignments: { [orderId: string]: { moldId: string, date: string } } = {};
      
      scheduleResults.forEach(result => {
        newAssignments[result.orderId] = {
          moldId: result.moldId,
          date: result.scheduledDate.toISOString()
        };
        console.log(`📌 Assignment: ${result.orderId} → ${result.moldId} on ${format(result.scheduledDate, 'MM/dd (EEEE)')}`);
      });
      
      console.log('✅ Schedule generation complete with LOP Monday-only constraints applied');
      setOrderAssignments(newAssignments);
      
    } catch (error) {
      console.error('❌ Error in auto-schedule generation:', error);
    }
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
  
  // Debug Mesa Universal orders specifically
  const mesaOrders = orders.filter(order => order.orderId?.includes('MESA'));
  console.log('🏔️ Mesa Universal orders found:', mesaOrders.length);
  if (mesaOrders.length > 0) {
    console.log('🏔️ Mesa orders sample:', mesaOrders.slice(0, 3).map(o => ({ 
      orderId: o.orderId, 
      stockModelId: o.stockModelId,
      source: (o as any).source 
    })));
  }
  
  // Debug unassigned orders
  const unassignedOrders = orders.filter(order => !orderAssignments[order.orderId]);
  console.log('🔄 Unassigned orders:', unassignedOrders.length, unassignedOrders.map(o => o.orderId));


  // Auto-generate schedule when data is loaded
  useEffect(() => {
    console.log(`🔍 Schedule check: orders=${orders.length}, molds=${molds.length}, employees=${employees.length}, assignments=${Object.keys(orderAssignments).length}`);
    
    if (orders.length > 0 && molds.length > 0 && employees.length > 0) {
      console.log("🚀 Auto-running schedule generation with LOP Monday-only constraints");
      setTimeout(() => generateAutoSchedule(), 1000); // Delay to let UI render
    } else {
      console.log("⏳ Waiting for data to load before generating schedule");
    }
  }, [orders.length, molds.length, employees.length, generateAutoSchedule]);

  // Force clear assignments and regenerate schedule for testing LOP constraints
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('clearSchedule') === 'true') {
      console.log('🔄 Clearing schedule and regenerating with LOP constraints...');
      setOrderAssignments({});
      setTimeout(() => generateAutoSchedule(), 500);
    }
  }, [generateAutoSchedule]);




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
      // Show work week only: Monday through Thursday (4-day work week)
      const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
      return eachDayOfInterval({ start, end: addDays(start, 3) }); // Only 4 days (Mon-Thu)
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
      // Only include work days (Monday = 1, Tuesday = 2, Wednesday = 3, Thursday = 4)
      const dayOfWeek = date.getDay();
      const isWorkDay = dayOfWeek >= 1 && dayOfWeek <= 4;
      
      if (isWorkDay) {
        currentWeek.push(date);
      }
      
      // Complete the week on Thursday (4) or at the end
      if (dayOfWeek === 4 || index === dates.length - 1) {
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
    const targetDate = new Date(dateIso);

    // Find the order being dragged to check if it's a LOP order
    const draggedOrder = orders.find(order => order.orderId === orderId);
    
    if (draggedOrder) {
      // Check if this is a LOP adjustment order
      const lopValue = (draggedOrder as any).features?.length_of_pull;
      const isLOPOrder = lopValue && 
        lopValue !== 'none' && 
        lopValue !== 'standard' && 
        lopValue !== 'std' &&
        lopValue !== 'std_length' &&
        lopValue !== 'standard_length' &&
        lopValue !== 'no_extra_length' &&
        lopValue !== 'std_no_extra_length' &&
        lopValue !== 'no_lop_change' &&
        lopValue !== '' && 
        lopValue !== '0' &&
        lopValue !== 'normal' &&
        !lopValue.toLowerCase().includes('std') &&
        !lopValue.toLowerCase().includes('standard') &&
        !lopValue.toLowerCase().includes('no extra');

      // If it's a LOP order, only allow Monday drops
      if (isLOPOrder && targetDate.getDay() !== 1) { // Monday = 1
        console.warn(`🚫 LOP order ${orderId} (LOP: ${lopValue}) cannot be scheduled on ${format(targetDate, 'EEEE')} - LOP orders must be scheduled on Monday only`);
        return; // Prevent the drop
      }

      if (isLOPOrder) {
        console.log(`✅ LOP order ${orderId} (LOP: ${lopValue}) correctly placed on Monday ${format(targetDate, 'MM/dd')}`);
      }
    }

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

  // Filter orders by type
  const p1Orders = orders.filter(order => 
    (order as any).source === 'main_orders' || (order as any).source === 'p1_purchase_order' || !(order as any).source
  );
  const p2Orders = orders.filter(order => 
    (order as any).source === 'p2_production_order'
  );

  console.log('📊 Order Distribution:', {
    total: orders.length,
    p1Orders: p1Orders.length, 
    p2Orders: p2Orders.length,
    p1Sample: p1Orders.slice(0, 2).map(o => ({ orderId: o.orderId, source: (o as any).source })),
    p2Sample: p2Orders.slice(0, 2).map(o => ({ orderId: o.orderId, source: (o as any).source }))
  });

  return (
    <div className="h-full">
      {/* Navigation Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Layup Scheduler</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Production Scheduling Management</p>
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <div className="bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
              <span className="text-blue-700 dark:text-blue-300 font-medium">{orders.length} Total Orders</span>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
              <span className="text-green-700 dark:text-green-300 font-medium">{molds.filter(m => m.enabled).length} Active Molds</span>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-lg">
              <span className="text-purple-700 dark:text-purple-300 font-medium">{employees.length} Employees</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabbed Interface */}
      <Tabs defaultValue="p1" className="h-full flex flex-col">
        <div className="bg-gray-50 dark:bg-gray-800 px-6 py-2 border-b border-gray-200 dark:border-gray-700">
          <TabsList className="grid w-auto grid-cols-2">
            <TabsTrigger value="p1" className="flex items-center space-x-2">
              <span>P1 Layup Scheduler</span>
              <Badge variant="secondary" className="ml-2">{p1Orders.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="p2" className="flex items-center space-x-2">
              <span>P2 Layup Scheduler</span>
              <Badge variant="secondary" className="ml-2">{p2Orders.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* P1 Layup Scheduler Tab */}
        <TabsContent value="p1" className="flex-1 overflow-hidden">
          <DndContext 
            sensors={sensors} 
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full">{/* Order queue removed per user request */}

              {/* Calendar - Full Width */}
              <main className="flex-1 p-6 overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <div className="flex space-x-2">
                  {/* Temporary debug button to force schedule regeneration */}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      console.log('🔄 FORCE CLEAR AND REGENERATE SCHEDULE - BUTTON CLICKED');
                      console.log('Current orders:', orders.length);
                      console.log('Current molds:', molds.length);
                      console.log('Current employees:', employees.length);
                      console.log('Current assignments before clear:', Object.keys(orderAssignments).length);
                      
                      // Force clear assignments immediately
                      setOrderAssignments({});
                      
                      setTimeout(() => {
                        console.log('🔄 About to call generateAutoSchedule after force clear...');
                        generateAutoSchedule();
                      }, 200);
                    }}
                    className="bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Force Regenerate
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
                          </div>
                          <Button 
                            onClick={handleAddMold} 
                            className="mt-3" 
                            size="sm"
                            disabled={!newMold.moldName.trim()}
                          >
                            Add Mold
                          </Button>
                        </div>
                        
                        <Separator />
                        
                        {/* Show existing molds if any */}
                        {molds.length > 0 && molds.map(mold => (
                          <div key={mold.moldId} className="flex items-center justify-between p-3 border rounded">
                            <span>{mold.modelName} #{mold.instanceNumber}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteMold(mold.moldId)}
                              className="text-red-600"
                            >
                              Delete
                            </Button>
                          </div>
                        ))}
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
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newDate = new Date(currentDate);
                      newDate.setDate(newDate.getDate() - (viewType === 'day' ? 1 : viewType === 'week' ? 7 : 30));
                      setCurrentDate(newDate);
                    }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>

                  <Select value={viewType} onValueChange={(value: 'day' | 'week' | 'month') => setViewType(value)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">
                        <div className="flex items-center">
                          <Calendar1 className="w-4 h-4 mr-2" />
                          Day
                        </div>
                      </SelectItem>
                      <SelectItem value="week">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2" />
                          Week
                        </div>
                      </SelectItem>
                      <SelectItem value="month">
                        <div className="flex items-center">
                          <Grid3X3 className="w-4 h-4 mr-2" />
                          Month
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newDate = new Date(currentDate);
                      newDate.setDate(newDate.getDate() + (viewType === 'day' ? 1 : viewType === 'week' ? 7 : 30));
                      setCurrentDate(newDate);
                    }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Calendar Display */}
              {viewType === 'day' ? (
                /* Day view - single column */
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-center text-sm font-medium">
                    {format(currentDate, 'EEEE, MMMM d, yyyy')}
                  </div>
                  <div className="min-h-96 bg-white dark:bg-gray-900 rounded border p-4">
                    {/* Day content */}
                    <p className="text-center text-gray-500">Day view for {format(currentDate, 'MMM d')}</p>
                  </div>
                </div>
              ) : viewType === 'week' ? (
                /* Week view - grid layout */
                <div
                  className="grid border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}
                >
                  {/* Day Headers */}
                  {dates.map(date => (
                    <div
                      key={date.toISOString()}
                      className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center text-sm font-medium"
                    >
                      {format(date, 'EEE MM/dd')}
                    </div>
                  ))}

                  {/* Rows for each mold - Only show molds with assigned orders */}
                  {(() => {
                    // Get molds that have orders assigned to them  
                    const usedMoldIds = new Set(Object.values(orderAssignments).map(assignment => assignment.moldId));
                    const activeMolds = molds.filter(m => m.enabled && usedMoldIds.has(m.moldId));
                    
                    return activeMolds.map(mold => (
                    <React.Fragment key={mold.moldId}>
                      {dates.map(date => {
                        const dateString = date.toISOString();
                        
                        // Get orders assigned to this mold/date combination using p1Orders for filtering
                        const cellOrders = Object.entries(orderAssignments)
                          .filter(([orderId, assignment]) => {
                            const assignmentDateOnly = assignment.date.split('T')[0];
                            const cellDateOnly = dateString.split('T')[0];
                            const orderInP1 = p1Orders.some(o => o.orderId === orderId);
                            return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly && orderInP1;
                          })
                          .map(([orderId]) => {
                            const order = p1Orders.find(o => o.orderId === orderId);
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
                    ));
                  })()}
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
                        {(() => {
                          const usedMoldIds = new Set(Object.values(orderAssignments).map(assignment => assignment.moldId));
                          const activeMolds = molds.filter(m => m.enabled && usedMoldIds.has(m.moldId));
                          
                          return activeMolds.map(mold => (
                          <React.Fragment key={`${weekIndex}-${mold.moldId}`}>
                            {week.map(date => {
                              const dateString = date.toISOString();
                              const cellDateOnly = dateString.split('T')[0];
                              
                              // Get orders assigned to this mold/date using p1Orders
                              const cellOrders = Object.entries(orderAssignments)
                                .filter(([orderId, assignment]) => {
                                  const assignmentDateOnly = assignment.date.split('T')[0];
                                  const orderInP1 = p1Orders.some(o => o.orderId === orderId);
                                  return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly && orderInP1;
                                })
                                .map(([orderId]) => p1Orders.find(o => o.orderId === orderId))
                                .filter(order => order !== undefined) as any[];

                              return (
                                <DroppableCell
                                  key={`${weekIndex}-${mold.moldId}-${date.toISOString()}`}
                                  moldId={mold.moldId}
                                  date={date}
                                  orders={cellOrders}
                                  onDrop={(orderId, moldId, date) => {
                                    // Handle drop
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
                          ));
                        })()}
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
        </TabsContent>

        {/* P2 Layup Scheduler Tab */}
        <TabsContent value="p2" className="flex-1 overflow-hidden">
          <DndContext 
            sensors={sensors} 
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full">

              {/* Calendar - Full Width */}
              <main className="flex-1 p-6 overflow-auto">
              <div className="flex justify-between items-center mb-4">
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
                          </div>
                          <Button 
                            onClick={handleAddMold} 
                            className="mt-3" 
                            size="sm"
                            disabled={!newMold.moldName.trim()}
                          >
                            Add Mold
                          </Button>
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
                          <Button 
                            onClick={handleAddEmployee} 
                            className="mt-3" 
                            size="sm"
                            disabled={!newEmployee.employeeId.trim()}
                          >
                            Add Employee
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newDate = new Date(currentDate);
                      newDate.setDate(newDate.getDate() - (viewType === 'day' ? 1 : viewType === 'week' ? 7 : 30));
                      setCurrentDate(newDate);
                    }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>

                  <Select value={viewType} onValueChange={(value: 'day' | 'week' | 'month') => setViewType(value)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">
                        <div className="flex items-center">
                          <Calendar1 className="w-4 h-4 mr-2" />
                          Day
                        </div>
                      </SelectItem>
                      <SelectItem value="week">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2" />
                          Week
                        </div>
                      </SelectItem>
                      <SelectItem value="month">
                        <div className="flex items-center">
                          <Grid3X3 className="w-4 h-4 mr-2" />
                          Month
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newDate = new Date(currentDate);
                      newDate.setDate(newDate.getDate() + (viewType === 'day' ? 1 : viewType === 'week' ? 7 : 30));
                      setCurrentDate(newDate);
                    }}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Calendar Display for P2 Orders */}
              {viewType === 'day' ? (
                /* Day view - single column */
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-center text-sm font-medium">
                    {format(currentDate, 'EEEE, MMMM d, yyyy')}
                  </div>
                  <div className="min-h-96 bg-white dark:bg-gray-900 rounded border p-4">
                    <p className="text-center text-gray-500">P2 Day view for {format(currentDate, 'MMM d')}</p>
                  </div>
                </div>
              ) : viewType === 'week' ? (
                /* Week view - grid layout for P2 */
                <div
                  className="grid border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}
                >
                  {/* Day Headers */}
                  {dates.map(date => (
                    <div
                      key={date.toISOString()}
                      className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center text-sm font-medium"
                    >
                      {format(date, 'EEE MM/dd')}
                    </div>
                  ))}

                  {/* Rows for each mold - P2 Orders */}
                  {(() => {
                    // Get molds that have P2 orders assigned to them  
                    const usedMoldIds = new Set(Object.values(orderAssignments).map(assignment => assignment.moldId));
                    const activeMolds = molds.filter(m => m.enabled && usedMoldIds.has(m.moldId));
                    
                    return activeMolds.map(mold => (
                    <React.Fragment key={mold.moldId}>
                      {dates.map(date => {
                        const dateString = date.toISOString();
                        
                        // Get P2 orders assigned to this mold/date combination
                        const cellOrders = Object.entries(orderAssignments)
                          .filter(([orderId, assignment]) => {
                            const assignmentDateOnly = assignment.date.split('T')[0];
                            const cellDateOnly = dateString.split('T')[0];
                            const orderInP2 = p2Orders.some(o => o.orderId === orderId);
                            return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly && orderInP2;
                          })
                          .map(([orderId]) => {
                            const order = p2Orders.find(o => o.orderId === orderId);
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
                    ));
                  })()}
                </div>
              ) : (
                /* Month view for P2 orders */
                <div className="space-y-4">
                  {weekGroups?.map((week, weekIndex) => (
                    <div key={`week-${weekIndex}`} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      {/* Week Header */}
                      <div className="bg-green-50 dark:bg-green-900/20 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                          P2 Week of {format(week[0], 'MMM d')} - {format(week[week.length - 1], 'MMM d')}
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

                        {/* Mold Rows for this week - P2 Orders */}
                        {(() => {
                          const usedMoldIds = new Set(Object.values(orderAssignments).map(assignment => assignment.moldId));
                          const activeMolds = molds.filter(m => m.enabled && usedMoldIds.has(m.moldId));
                          
                          return activeMolds.map(mold => (
                          <React.Fragment key={`${weekIndex}-${mold.moldId}`}>
                            {week.map(date => {
                              const dateString = date.toISOString();
                              const cellDateOnly = dateString.split('T')[0];
                              
                              // Get P2 orders assigned to this mold/date
                              const cellOrders = Object.entries(orderAssignments)
                                .filter(([orderId, assignment]) => {
                                  const assignmentDateOnly = assignment.date.split('T')[0];
                                  const orderInP2 = p2Orders.some(o => o.orderId === orderId);
                                  return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly && orderInP2;
                                })
                                .map(([orderId]) => p2Orders.find(o => o.orderId === orderId))
                                .filter(order => order !== undefined) as any[];

                              return (
                                <DroppableCell
                                  key={`${weekIndex}-${mold.moldId}-${date.toISOString()}`}
                                  moldId={mold.moldId}
                                  date={date}
                                  orders={cellOrders}
                                  onDrop={(orderId, moldId, date) => {
                                    // Handle drop
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
                          ));
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              </main>
            </div>
            
            <DragOverlay>
              {activeId ? (
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded border shadow-lg text-xs">
                  {activeId}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </TabsContent>
      </Tabs>
    </div>
  );
}
