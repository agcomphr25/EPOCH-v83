import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Settings, RefreshCw, Save, ArrowRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ProductionOrder {
  orderId: string;
  fbOrderNumber?: string;
  customerName: string;
  modelId: string;
  stockModelId: string;
  dueDate: string;
  priorityScore: number;
  daysToDue: number;
  urgencyLevel: string;
}

interface ScheduleEntry {
  orderId: string;
  scheduledDate: string;
  moldId: string;
  employeeAssignments: any[];
}

interface DayCellProps {
  date: Date;
  orders: ProductionOrder[];
  isWorkDay: boolean;
  onMoveOrder: (orderId: string, targetDate: string) => void;
  onRemoveOrder: (orderId: string) => void;
}

function SortableOrder({ order, onRemove }: { order: ProductionOrder, onRemove: (id: string) => void }) {
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

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-100 border-red-300 text-red-800';
      case 'high': return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'medium': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      default: return 'bg-green-100 border-green-300 text-green-800';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-2 mb-2 rounded border cursor-move ${getUrgencyColor(order.urgencyLevel)}`}
    >
      <div className="text-xs font-semibold">{order.fbOrderNumber || order.orderId}</div>
      <div className="text-xs text-gray-600">{order.customerName}</div>
      <div className="text-xs">{order.stockModelId}</div>
      <div className="flex justify-between items-center mt-1">
        <span className="text-xs">Due: {order.daysToDue}d</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(order.orderId);
          }}
          className="text-red-500 hover:text-red-700 text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function DayCell({ date, orders, isWorkDay, onMoveOrder, onRemoveOrder }: DayCellProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const activeIndex = orders.findIndex(order => order.orderId === active.id);
      const overIndex = orders.findIndex(order => order.orderId === over.id);
      // Handle reordering within day if needed
    }
  };

  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNumber = date.getDate();
  
  return (
    <div className={`border rounded-lg p-2 min-h-[200px] ${isWorkDay ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex justify-between items-center mb-2">
        <div className="font-semibold text-sm">
          {dayName} {dayNumber}
        </div>
        {isWorkDay && (
          <Badge className="bg-blue-500 text-white text-xs">Work Day</Badge>
        )}
      </div>
      
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orders.map(o => o.orderId)} strategy={verticalListSortingStrategy}>
          {orders.map(order => (
            <SortableOrder 
              key={order.orderId} 
              order={order} 
              onRemove={onRemoveOrder}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

export default function EnhancedLayupScheduler() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedWorkDays, setSelectedWorkDays] = useState<number[]>([1, 2, 3, 4]); // Monday-Thursday
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [schedule, setSchedule] = useState<{ [date: string]: ProductionOrder[] }>({});
  const [isScheduleSaved, setIsScheduleSaved] = useState(false);

  // Get production queue data
  const { data: productionQueue = [], isLoading: queueLoading } = useQuery<ProductionOrder[]>({
    queryKey: ['/api/production-queue/prioritized'],
    queryFn: () => apiRequest('/api/production-queue/prioritized'),
  });

  // Get employee settings
  const { data: employeeSettings = [] } = useQuery({
    queryKey: ['/api/molds/employee-settings'],
    queryFn: () => apiRequest('/api/molds/employee-settings'),
  });

  // Get mold settings
  const { data: moldSettings = [] } = useQuery({
    queryKey: ['/api/molds'],
    queryFn: () => apiRequest('/api/molds'),
  });

  // Generate schedule mutation
  const generateScheduleMutation = useMutation({
    mutationFn: () => {
      console.log('🎯 ENHANCED SCHEDULER: Generating schedule with work days:', selectedWorkDays);
      return apiRequest('/api/scheduler/generate-algorithmic-schedule', {
        method: 'POST',
        body: JSON.stringify({
          maxOrdersPerDay: Math.floor(totalCapacity) || 50,
          scheduleDays: 5,
          workDays: selectedWorkDays // This is the key - must be respected
        })
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: "Schedule Generated",
        description: `Successfully scheduled ${result.totalScheduled || 0} orders`,
      });
      // Convert result to our schedule format
      if (result.allocations) {
        const newSchedule: { [date: string]: ProductionOrder[] } = {};
        result.allocations.forEach((allocation: any) => {
          const dateKey = allocation.scheduledDate.split('T')[0];
          if (!newSchedule[dateKey]) newSchedule[dateKey] = [];
          
          // Find the order in production queue
          const order = productionQueue.find(o => o.orderId === allocation.orderId);
          if (order) {
            newSchedule[dateKey].push(order);
          }
        });
        setSchedule(newSchedule);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Schedule Generation Failed",
        description: error.message || "Failed to generate schedule",
        variant: "destructive",
      });
    }
  });

  // Save schedule mutation
  const saveScheduleMutation = useMutation({
    mutationFn: (scheduleData: any) =>
      apiRequest('/api/layup-schedule/save', {
        method: 'POST',
        body: JSON.stringify(scheduleData)
      }),
    onSuccess: () => {
      toast({
        title: "Schedule Saved",
        description: "Schedule saved and orders moved to Layup/Plugging department",
      });
      setIsScheduleSaved(true);
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save schedule",
        variant: "destructive",
      });
    }
  });

  // Generate week dates (Monday-Friday)
  const weekDates = useMemo(() => {
    const startOfWeek = new Date(currentWeek);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    startOfWeek.setDate(diff);
    
    const dates = [];
    for (let i = 0; i < 5; i++) { // Monday to Friday
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, [currentWeek]);

  const moveOrder = (orderId: string, targetDate: string) => {
    const newSchedule = { ...schedule };
    
    // Remove order from current location
    Object.keys(newSchedule).forEach(date => {
      newSchedule[date] = newSchedule[date].filter(order => order.orderId !== orderId);
    });
    
    // Add to new location
    const order = productionQueue.find(o => o.orderId === orderId);
    if (order) {
      if (!newSchedule[targetDate]) newSchedule[targetDate] = [];
      newSchedule[targetDate].push(order);
    }
    
    setSchedule(newSchedule);
  };

  const removeOrderFromSchedule = (orderId: string) => {
    const newSchedule = { ...schedule };
    Object.keys(newSchedule).forEach(date => {
      newSchedule[date] = newSchedule[date].filter(order => order.orderId !== orderId);
    });
    setSchedule(newSchedule);
  };

  const handleSaveSchedule = () => {
    // Convert schedule to format expected by backend
    const scheduleEntries: ScheduleEntry[] = [];
    Object.entries(schedule).forEach(([date, orders]) => {
      orders.forEach(order => {
        scheduleEntries.push({
          orderId: order.orderId,
          scheduledDate: date,
          moldId: 'auto', // Let backend determine best mold
          employeeAssignments: employeeSettings
        });
      });
    });

    saveScheduleMutation.mutate({
      entries: scheduleEntries,
      workDays: selectedWorkDays,
      weekStart: weekDates[0].toISOString().split('T')[0]
    });
  };

  const totalCapacity = employeeSettings.reduce((total: number, emp: any) => 
    total + (emp.rate * emp.hours), 0
  );

  const totalScheduled = Object.values(schedule).reduce((total, orders) => total + orders.length, 0);
  const unscheduledOrders = productionQueue.filter(order => 
    !Object.values(schedule).some(dayOrders => 
      dayOrders.some(schedOrder => schedOrder.orderId === order.orderId)
    )
  );

  if (queueLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">Loading scheduler...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enhanced Layup Scheduler</h1>
          <p className="text-sm text-gray-500 mt-1">
            Comprehensive production scheduling with manual adjustments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => generateScheduleMutation.mutate()}
            disabled={generateScheduleMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Auto-Schedule
          </Button>
          <Button
            onClick={handleSaveSchedule}
            disabled={saveScheduleMutation.isPending || totalScheduled === 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            Save & Lock Schedule
          </Button>
        </div>
      </div>

      {/* Schedule Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Daily Capacity</div>
            <div className="text-xl font-bold">{Math.floor(totalCapacity)} parts/day</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Queue Size</div>
            <div className="text-xl font-bold">{productionQueue.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Scheduled</div>
            <div className="text-xl font-bold">{totalScheduled}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Unscheduled</div>
            <div className="text-xl font-bold">{unscheduledOrders.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Work Day Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Work Day Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Select work days:</span>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day, index) => (
              <label key={day} className="flex items-center gap-2">
                <Checkbox
                  checked={selectedWorkDays.includes(index + 1)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedWorkDays([...selectedWorkDays, index + 1]);
                    } else {
                      setSelectedWorkDays(selectedWorkDays.filter(d => d !== index + 1));
                    }
                  }}
                />
                <span className="text-sm">{day}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Schedule Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Weekly Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {weekDates.map((date) => {
              const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Convert Sunday from 0 to 7
              const isWorkDay = selectedWorkDays.includes(dayOfWeek);
              const dateKey = date.toISOString().split('T')[0];
              const dayOrders = schedule[dateKey] || [];
              
              return (
                <DayCell
                  key={dateKey}
                  date={date}
                  orders={dayOrders}
                  isWorkDay={isWorkDay}
                  onMoveOrder={moveOrder}
                  onRemoveOrder={removeOrderFromSchedule}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Unscheduled Orders */}
      {unscheduledOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Unscheduled Orders ({unscheduledOrders.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2 max-h-60 overflow-y-auto">
              {unscheduledOrders.map(order => (
                <div key={order.orderId} className="p-2 border rounded bg-gray-50">
                  <div className="text-xs font-semibold">{order.fbOrderNumber || order.orderId}</div>
                  <div className="text-xs text-gray-600">{order.customerName}</div>
                  <div className="text-xs">{order.stockModelId}</div>
                  <Badge className="text-xs mt-1" variant={
                    order.urgencyLevel === 'critical' ? 'destructive' : 'default'
                  }>
                    {order.urgencyLevel}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isScheduleSaved && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-green-800">
              <ArrowRight className="w-5 h-5" />
              <span className="font-semibold">Schedule Saved!</span>
              <span>Scheduled orders have been moved to Layup/Plugging department.</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}