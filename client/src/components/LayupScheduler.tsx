import React, { useState, useMemo } from 'react';
import { generateLayupSchedule } from '../utils/schedulerUtils';
import useMoldSettings from '../hooks/useMoldSettings';
import useEmployeeSettings from '../hooks/useEmployeeSettings';
import { useUnifiedLayupOrders } from '../hooks/useUnifiedLayupOrders';
import { apiRequest } from '@/lib/queryClient';
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
import { ChevronLeft, ChevronRight, Calendar, Grid3X3, Calendar1, Settings, Users, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

// Draggable Order Item Component with responsive sizing
function DraggableOrderItem({ order, priority, totalOrdersInCell, moldInfo }: { order: any, priority: number, totalOrdersInCell?: number, moldInfo?: { moldId: string, instanceNumber?: number } }) {
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
        {moldInfo && (
          <div className="text-xs font-semibold opacity-80 mt-0.5">
            {moldInfo.instanceNumber ? `Mold ${moldInfo.instanceNumber}` : moldInfo.moldId}
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
  moldInfo
}: { 
  moldId: string; 
  date: Date; 
  orders: any[]; 
  onDrop: (orderId: string, moldId: string, date: Date) => void;
  moldInfo?: { moldId: string, instanceNumber?: number };
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
  const [newMold, setNewMold] = useState({ modelName: '', instanceNumber: 1, multiplier: 2 });
  const [newEmployee, setNewEmployee] = useState({ employeeId: '', rate: 1.5, hours: 8 });
  const [employeeChanges, setEmployeeChanges] = useState<{[key: string]: {rate: number, hours: number}}>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Track order assignments (orderId -> { moldId, date })
  const [orderAssignments, setOrderAssignments] = useState<{[orderId: string]: { moldId: string, date: string }}>({});

  const { molds, saveMold, deleteMold, toggleMoldStatus, loading: moldsLoading } = useMoldSettings();
  const { employees, saveEmployee, deleteEmployee, toggleEmployeeStatus, loading: employeesLoading, refetch: refetchEmployees } = useEmployeeSettings();
  const { orders, reloadOrders, loading: ordersLoading } = useUnifiedLayupOrders();

  // Debug logging with emojis for visibility
  console.log('🎯 LayupScheduler - Orders data:', orders);
  console.log('📊 LayupScheduler - Orders count:', orders?.length);
  console.log('🔍 LayupScheduler - Sample order:', orders?.[0]);
  console.log('📋 LayupScheduler - Order Assignments:', orderAssignments);
  console.log('🏭 LayupScheduler - Molds:', molds?.map(m => ({ moldId: m.moldId, instanceNumber: m.instanceNumber })));
  console.log('⚙️ LayupScheduler - Employees:', employees?.length, 'employees loaded');

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
  const dates = useMemo(() => {
    if (viewType === 'day') return [currentDate];
    if (viewType === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end: addDays(start, 6) });
    }
    // month
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return eachDayOfInterval({ start, end });
  }, [viewType, currentDate]);

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
    if (!newMold.modelName.trim()) return;
    
    const moldId = `${newMold.modelName}-${newMold.instanceNumber}`;
    await saveMold({
      moldId,
      modelName: newMold.modelName,
      instanceNumber: newMold.instanceNumber,
      multiplier: newMold.multiplier,
      enabled: true
    });
    setNewMold({ modelName: '', instanceNumber: 1, multiplier: 2 });
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
                </div>
              ) : (
                <div className="space-y-2">
                  {orders
                    .filter(order => !orderAssignments[order.orderId]) // Only show unassigned orders in queue
                    .map((order, index) => (
                      <DraggableOrderItem
                        key={order.orderId}
                        order={order}
                        priority={index + 1}
                        totalOrdersInCell={orders.filter(o => !orderAssignments[o.orderId]).length}
                      />
                    ))}
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
                console.log('🔧 TEST ASSIGNMENT CLICKED!');
                alert('TEST ASSIGNMENT CLICKED!');
                console.log('Orders available:', orders?.length, orders?.map(o => o.orderId));
                console.log('Molds available:', molds?.length, molds?.map(m => m.moldId));
                
                if (orders && orders.length > 0 && molds && molds.length > 0) {
                  const testAssignments: {[orderId: string]: { moldId: string, date: string }} = {};
                  const firstMold = molds.find(m => m.enabled);
                  const today = new Date();
                  
                  console.log('Using mold:', firstMold?.moldId);
                  
                  orders.forEach((order, index) => {
                    if (firstMold) {
                      const assignDate = new Date(today);
                      assignDate.setDate(today.getDate() + index);
                      testAssignments[order.orderId] = {
                        moldId: firstMold.moldId,
                        date: assignDate.toISOString()
                      };
                      console.log(`🎯 Test assigning ${order.orderId} to ${firstMold.moldId} on ${assignDate.toDateString()}`);
                    }
                  });
                  console.log('Setting assignments:', testAssignments);
                  setOrderAssignments(testAssignments);
                  console.log('✅ Manual test assignments completed');
                } else {
                  console.log('❌ Missing data - Orders:', orders?.length, 'Molds:', molds?.length);
                }
              }}
            >
              🧪 TEST ASSIGNMENT
            </button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                console.log('🚀 Resetting assignments, applying auto-schedule:', schedule);
                const autoAssignments: {[orderId: string]: { moldId: string, date: string }} = {};
                schedule.forEach(item => {
                  autoAssignments[item.orderId] = {
                    moldId: item.moldId,
                    date: item.scheduledDate.toISOString()
                  };
                });
                setOrderAssignments(autoAssignments);
              }}
            >
              Auto-Schedule Orders
            </Button>
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
                        <label className="text-sm font-medium mb-1 block">Model Name</label>
                        <Input
                          placeholder="e.g., M001, CF_Tactical, etc."
                          value={newMold.modelName}
                          onChange={(e) => setNewMold(prev => ({...prev, modelName: e.target.value}))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium mb-1 block">Instance Number</label>
                          <Input
                            type="number"
                            placeholder="1"
                            value={newMold.instanceNumber}
                            min={1}
                            onChange={(e) => setNewMold(prev => ({...prev, instanceNumber: +e.target.value}))}
                          />
                          <p className="text-xs text-gray-500 mt-1">If you have multiple molds of the same model (e.g., M001-1, M001-2)</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-1 block">Daily Capacity</label>
                          <Input
                            type="number"
                            placeholder="2"
                            value={newMold.multiplier}
                            min={1}
                            onChange={(e) => setNewMold(prev => ({...prev, multiplier: +e.target.value}))}
                          />
                          <p className="text-xs text-gray-500 mt-1">Units this mold can produce per day</p>
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={handleAddMold} 
                      className="mt-3" 
                      size="sm"
                      disabled={!newMold.modelName.trim()}
                    >
                      Add Mold
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
              onClick={() => setCurrentDate(prev => addDays(prev, -1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 text-sm font-medium">
              {format(currentDate, viewType === 'week' ? 'MM/dd/yyyy' : 'MMMM yyyy')}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(prev => addDays(prev, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

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
              </div>
            ))}

            {/* Rows for each mold */}
            {molds.filter(m => m.enabled).map(mold => (
              <React.Fragment key={mold.moldId}>
                {dates.map(date => {
                  const dateString = date.toISOString();
                  
                  // Get orders assigned to this mold/date combination
                  const cellOrders = Object.entries(orderAssignments)
                    .filter(([orderId, assignment]) => 
                      assignment.moldId === mold.moldId && 
                      assignment.date === dateString
                    )
                    .map(([orderId]) => orders.find(o => o.orderId === orderId))
                    .filter(order => order !== undefined) as any[];

                  // Enhanced debug logging for all cells
                  console.log(`📅 Cell [${mold.moldId}|${format(date, 'MM/dd')}]:`, {
                    dateString: dateString.substring(0, 10), // Show just date part
                    assignmentsForThisMold: Object.entries(orderAssignments).filter(([_, assignment]) => assignment.moldId === mold.moldId),
                    cellOrdersCount: cellOrders.length,
                    cellOrderIds: cellOrders.map(o => o?.orderId),
                    allOrders: orders?.map(o => o.orderId),
                    allAssignments: Object.keys(orderAssignments)
                  });

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
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>

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