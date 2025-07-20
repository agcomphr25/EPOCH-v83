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
import { ChevronLeft, ChevronRight, Calendar, Grid3X3, Calendar1, Settings, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
      className="mb-1 p-2 bg-blue-50 dark:bg-blue-900/30 rounded border shadow-sm text-xs cursor-grab hover:bg-blue-100 dark:hover:bg-blue-900/50"
    >
      <div className="font-medium">{order.orderId}</div>
      <div className="text-gray-600 dark:text-gray-400">#{priority}</div>
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

  const { molds, saveMold, loading: moldsLoading } = useMoldSettings();
  const { employees, saveEmployee, loading: employeesLoading } = useEmployeeSettings();
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

  if (moldsLoading || employeesLoading || ordersLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg">Loading scheduler...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-1/4 p-4 space-y-6 border-r border-gray-200 dark:border-gray-700 overflow-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mold Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {molds.map(mold => (
              <div key={mold.moldId} className="flex items-center space-x-2">
                <Checkbox
                  checked={mold.enabled ?? true}
                  onCheckedChange={(checked) => 
                    saveMold({ ...mold, enabled: !!checked })
                  }
                />
                <span className="flex-1 text-sm">
                  {mold.modelName} #{mold.instanceNumber}
                </span>
                <Input
                  type="number"
                  value={mold.multiplier}
                  min={1}
                  onChange={(e) =>
                    saveMold({ ...mold, multiplier: +e.target.value })
                  }
                  className="w-16 h-8"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Employee Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {employees.map(emp => (
              <div key={emp.employeeId} className="space-y-2">
                <div className="font-medium text-sm">{emp.name}</div>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    value={emp.rate}
                    onChange={(e) =>
                      saveEmployee({ ...emp, rate: +e.target.value })
                    }
                    className="w-16 h-8"
                  />
                  <span className="text-xs">molds/hr</span>
                  <Input
                    type="number"
                    value={emp.hours}
                    onChange={(e) =>
                      saveEmployee({ ...emp, hours: +e.target.value })
                    }
                    className="w-16 h-8"
                  />
                  <span className="text-xs">hrs</span>
                </div>
              </div>
            ))}
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
                  {molds.map(mold => (
                    <div key={mold.moldId} className="flex items-center space-x-4 p-3 border rounded">
                      <Checkbox
                        checked={mold.enabled ?? true}
                        onCheckedChange={(checked) => 
                          saveMold({ ...mold, enabled: !!checked })
                        }
                      />
                      <div className="flex-1">
                        <span className="font-medium">
                          {mold.modelName} #{mold.instanceNumber}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <label className="text-sm">Multiplier:</label>
                        <Input
                          type="number"
                          value={mold.multiplier}
                          min={1}
                          onChange={(e) =>
                            saveMold({ ...mold, multiplier: +e.target.value })
                          }
                          className="w-20"
                        />
                      </div>
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
                  {employees.map(emp => (
                    <div key={emp.employeeId} className="p-3 border rounded">
                      <div className="font-medium mb-2">{emp.name}</div>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <label className="text-sm">Rate:</label>
                          <Input
                            type="number"
                            value={emp.rate}
                            onChange={(e) =>
                              saveEmployee({ ...emp, rate: +e.target.value })
                            }
                            className="w-20"
                          />
                          <span className="text-sm">molds/hr</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <label className="text-sm">Hours:</label>
                          <Input
                            type="number"
                            value={emp.hours}
                            onChange={(e) =>
                              saveEmployee({ ...emp, hours: +e.target.value })
                            }
                            className="w-20"
                          />
                          <span className="text-sm">hrs/day</span>
                        </div>
                      </div>
                    </div>
                  ))}
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