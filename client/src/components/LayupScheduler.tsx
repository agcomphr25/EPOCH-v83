import React, { useState, useMemo } from 'react';
import { generateLayupSchedule } from '../utils/schedulerUtils';
import useMoldSettings from '../hooks/useMoldSettings';
import useEmployeeSettings from '../hooks/useEmployeeSettings';
import useLayupOrders from '../hooks/useLayupOrders';
import { apiRequest } from '@/lib/queryClient';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
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

// Draggable Order Item Component
function DraggableOrderItem({ order, priority }: { order: any, priority: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: order.orderId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="mb-2 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border shadow-sm cursor-grab hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
    >
      <div className="font-medium text-blue-900 dark:text-blue-100 text-sm">
        {order.orderId}
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
        {order.customerName || 'Unknown Customer'}
      </div>
      <div className="text-xs text-blue-600 dark:text-blue-300 mt-1">
        Due: {new Date(order.dueDate).toLocaleDateString()}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Priority: #{priority} • {order.status}
      </div>
    </div>
  );
}

// Droppable Cell Component
function DroppableCell({ 
  moldId, 
  date, 
  orders, 
  onDrop 
}: { 
  moldId: string; 
  date: Date; 
  orders: any[]; 
  onDrop: (orderId: string, moldId: string, date: Date) => void;
}) {
  return (
    <div 
      className="min-h-[100px] border border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-gray-800"
      onDrop={(e) => {
        e.preventDefault();
        const orderId = e.dataTransfer.getData('text/plain');
        onDrop(orderId, moldId, date);
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      <SortableContext items={orders.map(o => o.orderId)} strategy={verticalListSortingStrategy}>
        {orders.map((order, idx) => (
          <DraggableOrderItem
            key={order.orderId}
            order={order}
            priority={order.priorityScore}
          />
        ))}
      </SortableContext>
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

  const { molds, saveMold, deleteMold, toggleMoldStatus, loading: moldsLoading } = useMoldSettings();
  const { employees, saveEmployee, deleteEmployee, toggleEmployeeStatus, loading: employeesLoading, refetch: refetchEmployees } = useEmployeeSettings();
  const { orders, reloadOrders, loading: ordersLoading } = useLayupOrders();

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const orderId = active.id as string;
    const [moldId, dateIso] = (over.id as string).split('|');
    const newDate = new Date(dateIso);

    try {
      await apiRequest(`/api/layup-orders/${orderId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newDate: newDate.toISOString(),
          moldId,
        }),
      });
      reloadOrders();
    } catch (error) {
      console.error('Override failed:', error);
    }
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
    <div className="flex h-full">
      {/* Sidebar for Order Queue */}
      <aside className="w-80 p-4 border-r border-gray-200 dark:border-gray-700 overflow-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Order Queue</CardTitle>
              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                {orders.length} orders
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
                {orders.map((order, index) => (
                  <DraggableOrderItem
                    key={order.orderId}
                    order={order}
                    priority={index + 1}
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

        <DndContext 
          sensors={sensors} 
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
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
                  const cellOrders = schedule.filter(s =>
                    s.moldId === mold.moldId &&
                    isSameDay(s.scheduledDate, date)
                  );
                  const dropId = `${mold.moldId}|${date.toISOString()}`;

                  return (
                    <DroppableCell
                      key={dropId}
                      moldId={mold.moldId}
                      date={date}
                      orders={cellOrders.map(s => ({
                        orderId: s.orderId,
                        priorityScore: orders.find(o => o.orderId === s.orderId)?.priorityScore || 0
                      }))}
                      onDrop={(orderId, moldId, date) => {
                        // Handle drop
                      }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          <DragOverlay>
            {activeId ? (
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded border shadow-lg text-xs">
                {activeId}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}