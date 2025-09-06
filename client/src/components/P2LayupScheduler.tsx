
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { generateLayupSchedule } from '../utils/schedulerUtils';
import { scheduleLOPAdjustments, identifyLOPOrders, getLOPStatus } from '../utils/lopScheduler';
import useMoldSettings from '../hooks/useMoldSettings';
import useEmployeeSettings from '../hooks/useEmployeeSettings';
import { useP2LayupOrders } from '../hooks/useP2LayupOrders';
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
import { ChevronLeft, ChevronRight, Calendar, Grid3X3, Calendar1, Settings, Users, Plus, Zap, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { getDisplayOrderId } from '@/lib/orderUtils';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Draggable Order Item Component for P2 orders
function DraggableP2OrderItem({ order, priority, totalOrdersInCell, moldInfo, getModelDisplayName, features, processedOrders }: { order: any, priority: number, totalOrdersInCell?: number, moldInfo?: { moldId: string, instanceNumber?: number }, getModelDisplayName?: (modelId: string) => string, features?: any[], processedOrders?: any[] }) {
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
      return {
        padding: 'p-1.5',
        margin: 'mb-0.5',
        textSize: 'text-xs font-semibold',
        height: 'min-h-[1.5rem]'
      };
    }
  };

  const sizing = getCardSizing(totalOrdersInCell || 1);
  
  // P2 Production orders always use orange styling
  const cardStyling = {
    bg: 'bg-orange-100 dark:bg-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-800/70 border-2 border-orange-300 dark:border-orange-600',
    text: 'text-orange-800 dark:text-orange-200'
  };

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
          <span className="text-xs ml-1 bg-orange-200 dark:bg-orange-700 px-1 rounded">P2</span>
        </div>
        
        {/* Show product name for P2 orders */}
        <div className="text-xs opacity-80 mt-0.5 font-medium">
          {order.product || 'Unknown Product'}
        </div>

        {/* Show Mold Name if assigned */}
        {moldInfo && (
          <div className="text-xs font-semibold opacity-80 mt-0.5">
            {moldInfo.moldId}
            {moldInfo.instanceNumber && ` #${moldInfo.instanceNumber}`}
          </div>
        )}
        
        {/* Show Due Date for Queue Cards */}
        {!moldInfo && order.dueDate && (
          <div className="text-xs opacity-70 mt-0.5 font-medium">
            Due: {format(new Date(order.dueDate), 'MM/dd')}
          </div>
        )}
      </div>
    </div>
  );
}

// Droppable Cell Component for P2 scheduler
function DroppableP2Cell({ 
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
  const getCellHeight = (orderCount: number) => {
    if (orderCount === 0) return 'min-h-[100px]';
    if (orderCount <= 2) return 'min-h-[100px]';
    if (orderCount <= 5) return 'min-h-[120px]';
    if (orderCount <= 8) return 'min-h-[140px]';
    return 'min-h-[160px] max-h-[200px] overflow-y-auto';
  };

  const cellHeight = getCellHeight(orders.length);
  
  const {
    setNodeRef,
    isOver,
  } = useDroppable({
    id: `p2-${moldId}|${date.toISOString()}`,
    data: {
      type: 'cell',
      moldId: moldId,
      date: date.toISOString()
    }
  });

  const isFriday = date.getDay() === 5;

  return (
    <div 
      ref={setNodeRef}
      className={`${cellHeight} border p-1 transition-all duration-200 ${
        isOver 
          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' 
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
      {orders.map((order, idx) => (
        <DraggableP2OrderItem
          key={order?.orderId || `order-${idx}`}
          order={order}
          priority={order?.priorityScore || 0}
          totalOrdersInCell={orders.length}
          moldInfo={moldInfo}
          getModelDisplayName={getModelDisplayName}
          features={features}
          processedOrders={processedOrders}
        />
      ))}
      {orders.length === 0 && (
        <div className="text-xs text-gray-400 text-center py-2 opacity-50">
          Available
        </div>
      )}
    </div>
  );
}

export default function P2LayupScheduler() {
  console.log("P2LayupScheduler component rendering...");
  const [viewType, setViewType] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Track P2 order assignments (orderId -> { moldId, date })
  const [p2OrderAssignments, setP2OrderAssignments] = useState<{[orderId: string]: { moldId: string, date: string }}>({});

  // P2 Mold and Employee Management State
  const [showP2MoldSettings, setShowP2MoldSettings] = useState(false);
  const [showP2EmployeeSettings, setShowP2EmployeeSettings] = useState(false);
  const [editingP2Mold, setEditingP2Mold] = useState<any>(null);
  const [editingP2Employee, setEditingP2Employee] = useState<any>(null);
  const [newP2Mold, setNewP2Mold] = useState({
    moldId: '',
    modelName: '',
    instanceNumber: 1,
    enabled: true,
    multiplier: 1,
    stockModels: []
  });
  const [newP2Employee, setNewP2Employee] = useState({
    employeeId: '',
    rate: 1.5,
    hours: 8,
    department: 'P2-Layup',
    isActive: true
  });

  const queryClient = useQueryClient();
  
  const { molds, saveMold, deleteMold, toggleMoldStatus, loading: moldsLoading } = useMoldSettings();
  const { employees, saveEmployee, deleteEmployee, toggleEmployeeStatus, loading: employeesLoading, refetch: refetchEmployees } = useEmployeeSettings();

  // Load existing P2 schedule data from database
  const { data: existingP2Schedule, isLoading: scheduleLoading } = useQuery({
    queryKey: ['/api/p2-layup-schedule'],
    enabled: true,
  });

  // Update local assignments when P2 schedule data loads
  useEffect(() => {
    if (existingP2Schedule && Array.isArray(existingP2Schedule) && existingP2Schedule.length > 0) {
      const assignments: {[orderId: string]: { moldId: string, date: string }} = {};
      (existingP2Schedule as any[]).forEach((entry: any) => {
        assignments[entry.orderId] = {
          moldId: entry.moldId,
          date: entry.scheduledDate
        };
      });
      
      console.log('📅 Loading existing P2 schedule assignments:', Object.keys(assignments).length, 'assignments');
      setP2OrderAssignments(assignments);
    }
  }, [existingP2Schedule]);

  // Save functionality for P2 schedule
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedP2ScheduleChanges, setHasUnsavedP2ScheduleChanges] = useState(false);

  const saveP2ScheduleMutation = useMutation({
    mutationFn: async (assignments: {[orderId: string]: { moldId: string, date: string }}) => {
      const orderIds = Object.keys(assignments);
      console.log('💾 Saving P2 schedule for', orderIds.length, 'orders');
      
      // Delete existing entries for these P2 orders
      const deletePromises = orderIds.map(orderId => 
        apiRequest(`/api/p2-layup-schedule/by-order/${orderId}`, {
          method: 'DELETE'
        }).catch(err => {
          console.log('Note: No existing P2 schedule found for order', orderId);
        })
      );
      
      await Promise.all(deletePromises);
      
      // Convert assignments to P2 schedule entries
      const scheduleEntries = Object.entries(assignments).map(([orderId, assignment]) => ({
        orderId,
        scheduledDate: new Date(assignment.date),
        moldId: assignment.moldId,
        employeeAssignments: [],
        isOverride: true,
        overriddenBy: 'user'
      }));

      // Save each P2 schedule entry
      const savePromises = scheduleEntries.map(entry => 
        apiRequest('/api/p2-layup-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: entry
        })
      );

      return Promise.all(savePromises);
    },
    onSuccess: () => {
      setHasUnsavedP2ScheduleChanges(false);
      console.log('✅ P2 Schedule saved successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/p2-layup-schedule'] });
    },
    onError: (error) => {
      console.error('❌ Failed to save P2 schedule:', error);
    }
  });

  const handleSaveP2Schedule = async () => {
    if (Object.keys(p2OrderAssignments).length === 0) {
      console.log('No P2 assignments to save');
      return;
    }

    setIsSaving(true);
    try {
      await saveP2ScheduleMutation.mutateAsync(p2OrderAssignments);
    } finally {
      setIsSaving(false);
    }
  };

  // P2 Mold Management Handlers
  const handleSaveP2Mold = async (moldData: any) => {
    try {
      if (editingP2Mold) {
        await saveMold({ ...moldData, id: editingP2Mold.id });
      } else {
        await saveMold(moldData);
      }
      setShowP2MoldSettings(false);
      setEditingP2Mold(null);
      setNewP2Mold({
        moldId: '',
        modelName: '',
        instanceNumber: 1,
        enabled: true,
        multiplier: 1,
        stockModels: []
      });
    } catch (error) {
      console.error('Failed to save P2 mold:', error);
    }
  };

  const handleDeleteP2Mold = async (moldId: string) => {
    try {
      await deleteMold(moldId);
    } catch (error) {
      console.error('Failed to delete P2 mold:', error);
    }
  };

  // P2 Employee Management Handlers
  const handleSaveP2Employee = async (employeeData: any) => {
    try {
      if (editingP2Employee) {
        await saveEmployee(editingP2Employee.employeeId, employeeData);
      } else {
        await saveEmployee(employeeData.employeeId, employeeData);
      }
      setShowP2EmployeeSettings(false);
      setEditingP2Employee(null);
      setNewP2Employee({
        employeeId: '',
        rate: 1.5,
        hours: 8,
        department: 'P2-Layup',
        isActive: true
      });
    } catch (error) {
      console.error('Failed to save P2 employee:', error);
    }
  };

  const handleDeleteP2Employee = async (employeeId: string) => {
    try {
      await deleteEmployee(employeeId);
    } catch (error) {
      console.error('Failed to delete P2 employee:', error);
    }
  };

  // Use P2 orders only
  const { orders: p2Orders, reloadOrders, loading: ordersLoading } = useP2LayupOrders();
  
  // Auto-run LOP scheduler for P2 orders
  const processedOrders = useMemo(() => {
    if (p2Orders.length === 0) return [];
    
    const lopOrders = identifyLOPOrders(p2Orders as any[]);
    const scheduledOrders = scheduleLOPAdjustments(lopOrders);
    
    console.log('🔧 P2 LOP Scheduler auto-run:', {
      totalP2Orders: p2Orders.length,
      lopOrdersNeedingAdjustment: lopOrders.filter(o => o.needsLOPAdjustment).length
    });
    
    return scheduledOrders;
  }, [p2Orders]);
  
  // Debug P2 orders
  useEffect(() => {
    console.log('🏭 P2LayupScheduler: P2 orders loaded:', p2Orders.length);
    if (p2Orders.length > 0) {
      console.log('🏭 P2LayupScheduler: Sample P2 order:', p2Orders[0]);
      console.log('🏭 P2LayupScheduler: First 5 P2 orders:', p2Orders.slice(0, 5).map(o => ({
        orderId: o.orderId,
        source: o.source,
        stockModelId: o.stockModelId,
        customer: o.customer,
        product: o.product
      })));
    }
  }, [p2Orders]);

  // Auto-schedule system for P2 orders
  const generateP2AutoSchedule = useCallback(() => {
    if (!p2Orders.length || !molds.length || !employees.length) {
      console.log('❌ Cannot generate P2 schedule: missing data');
      return;
    }
    
    console.log('🚀 Generating P2 auto-schedule for', p2Orders.length, 'P2 orders');
    
    // Get work days for scheduling (Mon-Thu ONLY - Never Friday)
    const getWorkDaysInWeek = (startDate: Date) => {
      const workDays: Date[] = [];
      let current = new Date(startDate);
      
      while (current.getDay() !== 1) {
        current = new Date(current.getTime() + (current.getDay() === 0 ? 1 : -1) * 24 * 60 * 60 * 1000);
      }
      
      for (let i = 0; i < 4; i++) {
        const workDay = new Date(current);
        // Double-check: ensure we never include Friday in P2 scheduling
        if (workDay.getDay() === 5) {
          console.error(`❌ CRITICAL: P2 getWorkDaysInWeek attempted to include a Friday! Date: ${workDay.toDateString()}`);
          break; // Stop adding days if we hit Friday
        }
        workDays.push(workDay);
        current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
      }
      
      // Final validation for P2: ensure no Fridays made it into the work days
      const fridayCheck = workDays.filter(date => date.getDay() === 5);
      if (fridayCheck.length > 0) {
        console.error(`❌ CRITICAL: P2 Found ${fridayCheck.length} Friday dates in work days!`, fridayCheck.map(d => d.toDateString()));
        return workDays.filter(date => date.getDay() !== 5); // Remove any Fridays
      }
      
      return workDays;
    };

    // Generate 4 weeks of work days for P2 scheduling
    const allWorkDays: Date[] = [];
    for (let week = 0; week < 4; week++) {
      const weekStartDate = new Date(currentDate.getTime() + week * 7 * 24 * 60 * 60 * 1000);
      const weekDays = getWorkDaysInWeek(weekStartDate);
      allWorkDays.push(...weekDays);
    }

    // Sort P2 orders by due date priority
    const sortedP2Orders = [...p2Orders].sort((a, b) => {
      const aDueDate = new Date(a.dueDate || a.orderDate).getTime();
      const bDueDate = new Date(b.dueDate || b.orderDate).getTime();
      return aDueDate - bDueDate;
    });

    // Find compatible molds for P2 orders (P2 orders use orderId as stockModelId)
    const getCompatibleMolds = (order: any) => {
      const modelId = order.stockModelId || order.orderId; // P2 orders use orderId as modelId
      
      const compatibleMolds = molds.filter(mold => {
        if (!mold.enabled) return false;
        if (!mold.stockModels || mold.stockModels.length === 0) {
          return true; // No restrictions - compatible with all
        }
        return mold.stockModels.includes(modelId);
      });
      
      console.log(`🎯 P2 Order ${order.orderId} (${modelId}) → ${compatibleMolds.length} compatible molds:`, compatibleMolds.map(m => m.moldId));
      return compatibleMolds;
    };

    // Track cell assignments for P2 scheduler
    const cellAssignments = new Set<string>();
    const newP2Assignments: { [orderId: string]: { moldId: string, date: string } } = {};

    // Calculate employee capacity
    const totalEmployeeCapacity = employees.reduce((total, emp) => {
      return total + (emp.rate || 1.5) * (emp.hours || 8);
    }, 0);

    const maxOrdersPerDay = Math.floor(totalEmployeeCapacity);
    console.log(`👥 P2 Employee capacity: ${maxOrdersPerDay} orders per day max`);

    // Track assignments per day and per mold for P2
    const dailyAssignments: { [dateKey: string]: number } = {};
    const moldNextDate: { [moldId: string]: number } = {};
    
    allWorkDays.forEach(date => {
      const dateKey = date.toISOString().split('T')[0];
      dailyAssignments[dateKey] = 0;
    });

    molds.filter(m => m.enabled).forEach(mold => {
      moldNextDate[mold.moldId] = 0;
    });

    sortedP2Orders.forEach((order) => {
      const compatibleMolds = getCompatibleMolds(order);
      
      if (compatibleMolds.length === 0) {
        console.log('⚠️ No compatible molds for P2 order:', order.orderId);
        return;
      }

      let assigned = false;
      let bestMold = null;
      let bestDateIndex = Infinity;

      for (const mold of compatibleMolds) {
        const nextDateIndex = moldNextDate[mold.moldId] || 0;
        
        if (nextDateIndex < allWorkDays.length && nextDateIndex < bestDateIndex) {
          const targetDate = allWorkDays[nextDateIndex];
          const dateKey = targetDate.toISOString().split('T')[0];
          const currentDailyLoad = dailyAssignments[dateKey] || 0;

          if (currentDailyLoad < maxOrdersPerDay) {
            bestDateIndex = nextDateIndex;
            bestMold = mold;
          }
        }
      }

      if (bestMold && bestDateIndex < allWorkDays.length) {
        const targetDate = allWorkDays[bestDateIndex];
        const dateKey = targetDate.toISOString().split('T')[0];
        const cellKey = `p2-${bestMold.moldId}-${dateKey}`;

        newP2Assignments[order.orderId] = {
          moldId: bestMold.moldId,
          date: targetDate.toISOString()
        };

        cellAssignments.add(cellKey);
        dailyAssignments[dateKey] = (dailyAssignments[dateKey] || 0) + 1;
        moldNextDate[bestMold.moldId] = bestDateIndex + 1;
        
        assigned = true;
        console.log(`🏭 P2 ORDER ASSIGNED: ${order.orderId} to ${bestMold.moldId} on ${format(targetDate, 'MM/dd')} (${dailyAssignments[dateKey]}/${maxOrdersPerDay} daily capacity)`);
      }

      if (!assigned) {
        console.warn(`❌ Could not find available cell for P2 order: ${order.orderId}`);
      }
    });

    console.log('📅 Generated P2 schedule assignments:', Object.keys(newP2Assignments).length, 'P2 orders assigned');
    
    setP2OrderAssignments(newP2Assignments);
    setHasUnsavedP2ScheduleChanges(true);
  }, [p2Orders, molds, employees, currentDate]);

  // Fetch stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  }) as { data: any[] };

  const { data: features = [] } = useQuery({
    queryKey: ['/api/features'],
  }) as { data: any[] };

  // Helper function to get model display name for P2 orders
  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Product';
    
    const model = (stockModels as any[]).find((m: any) => m.id === modelId);
    if (model?.displayName) {
      return model.displayName;
    }
    
    // For P2 orders, often the modelId is the order ID itself
    if (modelId.includes('_')) {
      return modelId
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    
    return modelId;
  };

  // Auto-generate P2 schedule when data is loaded
  useEffect(() => {
    const shouldRunP2AutoSchedule = p2Orders.length > 0 && molds.length > 0 && employees.length > 0 && 
      Object.keys(p2OrderAssignments).length === 0;
    
    if (shouldRunP2AutoSchedule) {
      console.log("🚀 Auto-running P2 schedule generation");
      console.log("📊 P2 Data available:", { p2Orders: p2Orders.length, molds: molds.length, employees: employees.length });
      setTimeout(() => generateP2AutoSchedule(), 1000);
    }
  }, [p2Orders.length, molds.length, employees.length, p2OrderAssignments, generateP2AutoSchedule]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Build date columns (work week: Monday through Friday)
  const dates = useMemo(() => {
    if (viewType === 'day') return [currentDate];
    if (viewType === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end: addDays(start, 4) });
    }
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [viewType, currentDate]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const orderId = active.id as string;
    const dropTargetId = over.id as string;
    
    // Parse the P2 drop target ID (format: p2-moldId|dateISO)
    const [prefix, moldDatePart] = dropTargetId.split('-', 2);
    if (prefix !== 'p2') return; // Only handle P2 drops
    
    const [moldId, dateIso] = moldDatePart.split('|');
    
    if (!moldId || !dateIso) {
      console.warn('Invalid P2 drop target:', dropTargetId);
      return;
    }

    console.log(`Moving P2 order ${orderId} to mold ${moldId} on ${dateIso}`);

    setP2OrderAssignments(prev => ({
      ...prev,
      [orderId]: { moldId, date: dateIso }
    }));
    
    setHasUnsavedP2ScheduleChanges(true);
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  if (moldsLoading || employeesLoading || ordersLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Loading P2 scheduler...</div>
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
              <h1 className="text-2xl font-bold text-orange-900 dark:text-orange-100">P2 Layup Scheduler</h1>
              <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">P2 Production Order Scheduling</p>
            </div>
            <div className="flex items-center space-x-4 text-sm">
              <div className="bg-orange-50 dark:bg-orange-900/20 px-3 py-2 rounded-lg">
                <span className="text-orange-700 dark:text-orange-300 font-medium">{p2Orders.length} P2 Orders</span>
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

        {/* Control Bar */}
        <div className="px-6 pb-4">
          <div className="flex justify-between items-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="flex space-x-2">
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
              {hasUnsavedP2ScheduleChanges && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveP2Schedule}
                  disabled={isSaving}
                  className="mr-2 bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Save P2 Schedule
                    </>
                  )}
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (viewType === 'week') {
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
                    const nextWeekStart = startOfWeek(addDays(currentDate, 7), { weekStartsOn: 1 });
                    setCurrentDate(nextWeekStart);
                  } else {
                    setCurrentDate(prev => addDays(prev, 1));
                  }
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              
              <Separator orientation="vertical" className="h-6" />
              
              <Dialog open={showP2MoldSettings} onOpenChange={setShowP2MoldSettings}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-1" />
                    P2 Molds
                  </Button>
                </DialogTrigger>
              </Dialog>
              
              <Dialog open={showP2EmployeeSettings} onOpenChange={setShowP2EmployeeSettings}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Users className="w-4 h-4 mr-1" />
                    P2 Employees
                  </Button>
                </DialogTrigger>
              </Dialog>
              
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
                        : 'border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-800'
                    }`}
                  >
                    {format(date, 'MM/dd')}
                    <div className={`text-xs mt-1 ${
                      isFriday 
                        ? 'text-amber-600 dark:text-amber-400' 
                        : 'text-orange-500'
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
            {/* Week-based Calendar Layout for P2 */}
            {viewType === 'week' || viewType === 'day' ? (
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${dates.length}, 1fr)` }}
              >
                {/* Rows for each mold - Show molds with P2 order assignments */}
                {(() => {
                  // Get molds that have P2 assignments or are compatible with P2 orders
                  const getCompatibleMolds = (order: any) => {
                    const modelId = order.stockModelId || order.orderId;
                    return molds.filter(mold => {
                      if (!mold.enabled) return false;
                      if (!mold.stockModels || mold.stockModels.length === 0) return true;
                      return mold.stockModels.includes(modelId);
                    });
                  };
                  
                  const compatibleMoldIds = new Set<string>();
                  p2Orders.forEach(order => {
                    const compatible = getCompatibleMolds(order);
                    compatible.forEach(mold => compatibleMoldIds.add(mold.moldId));
                  });
                  
                  const relevantMolds = molds.filter(m => {
                    if (!m.enabled) return false;
                    const hasP2Assignments = Object.values(p2OrderAssignments).some(assignment => assignment.moldId === m.moldId);
                    const isCompatibleWithP2Queue = compatibleMoldIds.has(m.moldId);
                    return hasP2Assignments || isCompatibleWithP2Queue;
                  });
                  
                  // Calculate P2 order counts for sorting
                  const moldOrderCounts = relevantMolds.map(mold => {
                    const totalP2OrdersForMold = dates.reduce((count, date) => {
                      const dateString = date.toISOString();
                      const cellDateOnly = dateString.split('T')[0];
                      
                      const ordersForThisMoldDate = Object.entries(p2OrderAssignments).filter(([orderId, assignment]) => {
                        const assignmentDateOnly = assignment.date.split('T')[0];
                        return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly;
                      }).length;
                      
                      return count + ordersForThisMoldDate;
                    }, 0);
                    
                    return { mold, orderCount: totalP2OrdersForMold };
                  });
                  
                  // Sort molds by P2 order count (descending)
                  const sortedMolds = moldOrderCounts.sort((a, b) => {
                    if (b.orderCount !== a.orderCount) {
                      return b.orderCount - a.orderCount;
                    }
                    return a.mold.moldId.localeCompare(b.mold.moldId);
                  });
                  
                  console.log(`🏭 P2 Relevant molds: ${relevantMolds.length}/${molds.filter(m => m.enabled).length}`);
                  console.log(`🏭 P2 Mold order counts:`, sortedMolds.map(({ mold, orderCount }) => 
                    `${mold.moldId}: ${orderCount} P2 orders`
                  ));
                  
                  const activeMolds = sortedMolds.map(({ mold }) => mold);
                  
                  return activeMolds.map(mold => (
                    <React.Fragment key={mold.moldId}>
                      {dates.map(date => {
                        const dateString = date.toISOString();
                        
                        // Get P2 orders assigned to this mold/date combination
                        const cellP2Orders = Object.entries(p2OrderAssignments)
                          .filter(([orderId, assignment]) => {
                            const assignmentDateOnly = assignment.date.split('T')[0];
                            const cellDateOnly = dateString.split('T')[0];
                            return assignment.moldId === mold.moldId && assignmentDateOnly === cellDateOnly;
                          })
                          .map(([orderId]) => {
                            const order = p2Orders.find(o => o.orderId === orderId);
                            return order;
                          })
                          .filter(order => order !== undefined) as any[];

                        const dropId = `p2-${mold.moldId}|${dateString}`;

                        return (
                          <DroppableP2Cell
                            key={dropId}
                            moldId={mold.moldId}
                            date={date}
                            orders={cellP2Orders}
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
                Month view not yet implemented for P2
              </div>
            )}
          </div>
          
          <DragOverlay>
            {activeId ? (
              <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded border shadow-lg text-xs">
                {activeId}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      
      {/* P2 Mold Settings Dialog */}
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>P2 Mold Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Add New P2 Mold Form */}
          <div className="border p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20">
            <h3 className="font-semibold mb-3">Add New P2 Mold</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Mold ID</Label>
                <Input
                  value={newP2Mold.moldId}
                  onChange={(e) => setNewP2Mold(prev => ({ ...prev, moldId: e.target.value }))}
                  placeholder="P2-APR-1"
                />
              </div>
              <div>
                <Label>Model Name</Label>
                <Input
                  value={newP2Mold.modelName}
                  onChange={(e) => setNewP2Mold(prev => ({ ...prev, modelName: e.target.value }))}
                  placeholder="P2 Model"
                />
              </div>
              <div>
                <Label>Instance Number</Label>
                <Input
                  type="number"
                  value={newP2Mold.instanceNumber}
                  onChange={(e) => setNewP2Mold(prev => ({ ...prev, instanceNumber: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div>
                <Label>Daily Capacity</Label>
                <Input
                  type="number"
                  value={newP2Mold.multiplier}
                  onChange={(e) => setNewP2Mold(prev => ({ ...prev, multiplier: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center space-x-2">
              <Checkbox
                checked={newP2Mold.enabled}
                onCheckedChange={(checked) => setNewP2Mold(prev => ({ ...prev, enabled: checked }))}
              />
              <Label>Enabled</Label>
            </div>
            <Button
              onClick={() => handleSaveP2Mold(newP2Mold)}
              disabled={!newP2Mold.moldId || !newP2Mold.modelName}
              className="mt-4 bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add P2 Mold
            </Button>
          </div>

          {/* Existing P2 Molds List */}
          <div>
            <h3 className="font-semibold mb-3">Existing P2 Molds</h3>
            <div className="grid grid-cols-1 gap-2">
              {molds.filter(m => m.moldId.includes('P2') || m.modelName.includes('P2')).map(mold => (
                <div key={mold.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Badge variant={mold.enabled ? "default" : "secondary"}>
                      {mold.moldId}
                    </Badge>
                    <span className="text-sm">{mold.modelName}</span>
                    <span className="text-xs text-gray-500">
                      Instance: {mold.instanceNumber} | Capacity: {mold.multiplier}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleMoldStatus(mold.moldId)}
                    >
                      {mold.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingP2Mold(mold);
                        setNewP2Mold({
                          moldId: mold.moldId,
                          modelName: mold.modelName,
                          instanceNumber: mold.instanceNumber,
                          enabled: mold.enabled,
                          multiplier: mold.multiplier,
                          stockModels: mold.stockModels || []
                        });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteP2Mold(mold.moldId)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>

      {/* P2 Employee Settings Dialog */}
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>P2 Employee Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Add New P2 Employee Form */}
          <div className="border p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20">
            <h3 className="font-semibold mb-3">Add New P2 Employee</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Employee ID/Name</Label>
                <Input
                  value={newP2Employee.employeeId}
                  onChange={(e) => setNewP2Employee(prev => ({ ...prev, employeeId: e.target.value }))}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label>Department</Label>
                <Input
                  value={newP2Employee.department}
                  onChange={(e) => setNewP2Employee(prev => ({ ...prev, department: e.target.value }))}
                  placeholder="P2-Layup"
                />
              </div>
              <div>
                <Label>Rate (orders/hour)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newP2Employee.rate}
                  onChange={(e) => setNewP2Employee(prev => ({ ...prev, rate: parseFloat(e.target.value) || 1.5 }))}
                />
              </div>
              <div>
                <Label>Hours/Day</Label>
                <Input
                  type="number"
                  value={newP2Employee.hours}
                  onChange={(e) => setNewP2Employee(prev => ({ ...prev, hours: parseFloat(e.target.value) || 8 }))}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center space-x-2">
              <Checkbox
                checked={newP2Employee.isActive}
                onCheckedChange={(checked) => setNewP2Employee(prev => ({ ...prev, isActive: checked }))}
              />
              <Label>Active</Label>
            </div>
            <Button
              onClick={() => handleSaveP2Employee(newP2Employee)}
              disabled={!newP2Employee.employeeId}
              className="mt-4 bg-orange-600 hover:bg-orange-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add P2 Employee
            </Button>
          </div>

          {/* Existing P2 Employees List */}
          <div>
            <h3 className="font-semibold mb-3">Existing P2 Employees</h3>
            <div className="grid grid-cols-1 gap-2">
              {employees.filter(emp => emp.department?.includes('P2') || emp.employeeId.includes('P2')).map(employee => (
                <div key={employee.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <Badge variant={employee.isActive ? "default" : "secondary"}>
                      {employee.employeeId}
                    </Badge>
                    <span className="text-sm">{employee.department}</span>
                    <span className="text-xs text-gray-500">
                      Rate: {employee.rate}/hr | Hours: {employee.hours}/day
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleEmployeeStatus(employee.employeeId)}
                    >
                      {employee.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingP2Employee(employee);
                        setNewP2Employee({
                          employeeId: employee.employeeId,
                          rate: employee.rate,
                          hours: employee.hours,
                          department: employee.department,
                          isActive: employee.isActive
                        });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteP2Employee(employee.employeeId)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </div>
  );
}
