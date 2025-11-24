import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Printer, Calendar, Download } from 'lucide-react';
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

interface P2SerializedItem {
  id: string;
  serialNumber: string;
  barcode: string;
  poNumber: string;
  partNumber: string;
  partName: string;
  customerId: string;
  customerName: string;
  currentDepartment: string;
  status: string;
}

interface P2LayupSchedule {
  id: string;
  serializedItemId: string;
  barcode: string;
  poNumber: string;
  partNumber: string;
  partName: string;
  customerId: string;
  customerName: string;
  scheduledDate: string;
  scheduledBy: string;
  assignedTechnician: string | null;
  status: string;
  notes: string | null;
}

// Draggable unscheduled item
function DraggableSerializedItem({ item }: { item: P2SerializedItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { type: 'item', item },
  });

  const style = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 mb-2 bg-orange-100 dark:bg-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-800/70 border-2 border-orange-300 dark:border-orange-600 rounded-lg cursor-grab active:cursor-grabbing transition-all"
      data-testid={`draggable-item-${item.barcode}`}
    >
      <div className="font-semibold text-sm text-orange-900 dark:text-orange-100">
        {item.barcode}
      </div>
      <div className="text-xs text-orange-700 dark:text-orange-300 mt-1">
        {item.partName}
      </div>
      <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
        PO: {item.poNumber}
      </div>
      <div className="text-xs text-orange-600 dark:text-orange-400">
        {item.customerName}
      </div>
    </div>
  );
}

// Scheduled item with status controls
function ScheduledItemCard({ schedule, onUpdate }: { schedule: P2LayupSchedule; onUpdate: () => void }) {
  const [isLinkingPacket, setIsLinkingPacket] = useState(false);
  const [packetId, setPacketId] = useState('');
  const [packetNumber, setPacketNumber] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest(`/api/p2/layup-schedules/${schedule.id}/status`, { 
        method: 'PATCH', 
        body: { status, username: 'Current User' } 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/layup-schedules'] });
      toast({ title: 'Status updated' });
      onUpdate();
    },
  });

  const linkPacketMutation = useMutation({
    mutationFn: async (data: { packetId: string; packetNumber: string }) => {
      return apiRequest(`/api/p2/layup-schedules/${schedule.id}/link-packet`, { 
        method: 'PATCH', 
        body: data 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/layup-schedules'] });
      toast({ title: 'Cutting packet linked' });
      setIsLinkingPacket(false);
      setPacketId('');
      setPacketNumber('');
      onUpdate();
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return 'bg-blue-100 dark:bg-blue-800/40 border-blue-300 dark:border-blue-600 text-blue-900 dark:text-blue-100';
      case 'IN_PROGRESS': return 'bg-yellow-100 dark:bg-yellow-800/40 border-yellow-300 dark:border-yellow-600 text-yellow-900 dark:text-yellow-100';
      case 'COMPLETED': return 'bg-green-100 dark:bg-green-800/40 border-green-300 dark:border-green-600 text-green-900 dark:text-green-100';
      case 'CANCELLED': return 'bg-gray-100 dark:bg-gray-800/40 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100';
      default: return 'bg-gray-100 dark:bg-gray-800/40 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100';
    }
  };

  return (
    <div className={`p-2 mb-1.5 border rounded text-xs ${getStatusColor(schedule.status)}`} data-testid={`scheduled-item-${schedule.barcode}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="font-semibold">{schedule.barcode}</div>
          <div className="text-[10px] mt-0.5">{schedule.partName}</div>
          <Badge variant="outline" className="text-[9px] mt-1">{schedule.status}</Badge>
        </div>
        <div className="flex flex-col gap-0.5">
          {schedule.status === 'SCHEDULED' && (
            <Button size="sm" variant="ghost" className="h-5 px-1 text-[9px]" onClick={() => updateStatusMutation.mutate('IN_PROGRESS')} data-testid={`btn-start-${schedule.barcode}`}>
              Start
            </Button>
          )}
          {schedule.status === 'IN_PROGRESS' && (
            <Button size="sm" variant="ghost" className="h-5 px-1 text-[9px]" onClick={() => updateStatusMutation.mutate('COMPLETED')} data-testid={`btn-complete-${schedule.barcode}`}>
              Done
            </Button>
          )}
          <Dialog open={isLinkingPacket} onOpenChange={setIsLinkingPacket}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-5 px-1 text-[9px]" data-testid={`btn-link-packet-${schedule.barcode}`}>
                Link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link Cutting Packet</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="packetId">Cutting Packet ID</Label>
                  <Input id="packetId" value={packetId} onChange={(e) => setPacketId(e.target.value)} placeholder="Enter packet ID" data-testid="input-packet-id" />
                </div>
                <div>
                  <Label htmlFor="packetNumber">Cutting Packet Number</Label>
                  <Input id="packetNumber" value={packetNumber} onChange={(e) => setPacketNumber(e.target.value)} placeholder="Enter packet number" data-testid="input-packet-number" />
                </div>
                <Button onClick={() => linkPacketMutation.mutate({ packetId, packetNumber })} disabled={!packetId || !packetNumber} data-testid="btn-submit-link-packet">
                  Link Packet
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

// Droppable date cell
function DroppableDateCell({ 
  date, 
  schedules,
  onUpdate
}: { 
  date: Date;
  schedules: P2LayupSchedule[];
  onUpdate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: date.toISOString(),
    data: { type: 'date', date },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] border-2 p-2 rounded-lg transition-all ${
        isOver
          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
      data-testid={`date-cell-${format(date, 'yyyy-MM-dd')}`}
    >
      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {format(date, 'EEE MM/dd')}
      </div>
      {schedules.map((schedule) => (
        <ScheduledItemCard key={schedule.id} schedule={schedule} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

function OldDroppableDateCellNOTUSED({ 
  date, 
  schedules 
}: { 
  date: Date;
  schedules: P2LayupSchedule[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: date.toISOString(),
    data: { type: 'date', date },
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] border-2 p-2 rounded-lg transition-all ${
        isOver
          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }`}
      data-testid={`date-cell-${format(date, 'yyyy-MM-dd')}`}
    >
      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {format(date, 'EEE MM/dd')}
      </div>
      {schedules.map((schedule) => (
        <div
          key={schedule.id}
          className="p-2 mb-1.5 bg-green-100 dark:bg-green-800/40 border border-green-300 dark:border-green-600 rounded text-xs"
          data-testid={`scheduled-item-${schedule.barcode}`}
        >
          <div className="font-semibold text-green-900 dark:text-green-100">
            {schedule.barcode}
          </div>
          <div className="text-green-700 dark:text-green-300 text-[10px] mt-0.5">
            {schedule.partName.substring(0, 20)}
          </div>
        </div>
      ))}
      {schedules.length === 0 && (
        <div className="text-xs text-gray-400 text-center py-4">
          Drop items here
        </div>
      )}
    </div>
  );
}

export default function P2SerializedItemScheduler() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).filter(
    (day) => day.getDay() !== 0 && day.getDay() !== 6 // Exclude weekends
  );

  // Fetch unscheduled items
  const { data: unscheduledItems = [], isLoading: loadingItems } = useQuery<P2SerializedItem[]>({
    queryKey: ['/api/p2/layup-schedules/unscheduled'],
  });

  // Fetch schedules for current week
  const { data: schedules = [], isLoading: loadingSchedules } = useQuery<P2LayupSchedule[]>({
    queryKey: ['/api/p2/layup-schedules', format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')],
    queryFn: async () => {
      const response = await fetch(
        `/api/p2/layup-schedules?startDate=${format(weekStart, 'yyyy-MM-dd')}&endDate=${format(weekEnd, 'yyyy-MM-dd')}`
      );
      if (!response.ok) throw new Error('Failed to fetch schedules');
      return response.json();
    },
  });

  // Create schedule mutation
  const createScheduleMutation = useMutation({
    mutationFn: async (data: { 
      serializedItemId: string;
      barcode: string;
      poNumber: string;
      partNumber: string;
      partName: string;
      customerId: string;
      customerName: string;
      scheduledDate: string;
      scheduledBy: string;
    }) => {
      return apiRequest('/api/p2/layup-schedules', { method: 'POST', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/layup-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/layup-schedules/unscheduled'] });
      toast({
        title: 'Success',
        description: 'Item scheduled successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to schedule item',
        variant: 'destructive',
      });
    },
  });

  // Handle drag end
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !active.data.current) return;

    const item = active.data.current.item as P2SerializedItem;
    const targetDate = over.data.current?.date as Date;

    if (!item || !targetDate) return;

    // Create schedule
    createScheduleMutation.mutate({
      serializedItemId: item.id,
      barcode: item.barcode,
      poNumber: item.poNumber,
      partNumber: item.partNumber,
      partName: item.partName,
      customerId: item.customerId,
      customerName: item.customerName,
      scheduledDate: format(targetDate, 'yyyy-MM-dd'),
      scheduledBy: 'current-user', // TODO: Get from auth context
    });
  }

  // Print barcodes for selected date
  async function printBarcodes(date: Date) {
    try {
      const response = await fetch('/api/p2/layup-schedules/print-barcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: format(date, 'yyyy-MM-dd') }),
      });

      if (!response.ok) throw new Error('Failed to generate barcodes');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `p2-layup-barcodes-${format(date, 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Success',
        description: 'Barcode labels downloaded',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to print barcodes',
        variant: 'destructive',
      });
    }
  }

  const activeItem = activeId ? unscheduledItems.find(item => item.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={({ active }) => setActiveId(active.id as string)} onDragEnd={handleDragEnd}>
      <div className="container mx-auto p-6 max-w-7xl">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>P2 Layup Scheduler - Composite Parts</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                  data-testid="button-previous-week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentWeek(new Date())}
                  data-testid="button-current-week"
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                  data-testid="button-next-week"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Week of {format(weekStart, 'MMM dd')} - {format(weekEnd, 'MMM dd, yyyy')}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 gap-4">
              {/* Unscheduled items queue */}
              <div className="col-span-1 border-r pr-4">
                <h3 className="font-semibold text-sm mb-3 text-gray-700 dark:text-gray-300">
                  Unscheduled Items
                  <Badge variant="secondary" className="ml-2">{unscheduledItems.length}</Badge>
                </h3>
                <div className="max-h-[600px] overflow-y-auto space-y-2">
                  {loadingItems && <div className="text-sm text-gray-500">Loading...</div>}
                  {unscheduledItems.map((item) => (
                    <DraggableSerializedItem key={item.id} item={item} />
                  ))}
                  {unscheduledItems.length === 0 && !loadingItems && (
                    <div className="text-sm text-gray-500 text-center py-8">
                      No unscheduled items
                    </div>
                  )}
                </div>
              </div>

              {/* Weekly calendar */}
              <div className="col-span-5">
                <div className="grid grid-cols-5 gap-3">
                  {weekDays.map((day) => {
                    const daySchedules = schedules.filter(s => {
                      // Parse the date string properly (YYYY-MM-DD format from database)
                      const scheduleDate = format(parseISO(s.scheduledDate + 'T00:00:00'), 'yyyy-MM-dd');
                      const targetDate = format(day, 'yyyy-MM-dd');
                      return scheduleDate === targetDate;
                    });
                    return (
                      <div key={day.toISOString()}>
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                            {format(day, 'EEEE')}
                          </h3>
                          {daySchedules.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => printBarcodes(day)}
                              className="h-6 px-2"
                              data-testid={`button-print-${format(day, 'yyyy-MM-dd')}`}
                            >
                              <Printer className="w-3 h-3 mr-1" />
                              <span className="text-xs">Print</span>
                            </Button>
                          )}
                        </div>
                        <DroppableDateCell 
                          date={day} 
                          schedules={daySchedules}
                          onUpdate={() => {
                            queryClient.invalidateQueries({ queryKey: ['/api/p2/layup-schedules'] });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeItem ? (
          <div className="p-3 bg-orange-200 dark:bg-orange-700 border-2 border-orange-400 rounded-lg shadow-lg">
            <div className="font-semibold text-sm">{activeItem.barcode}</div>
            <div className="text-xs mt-1">{activeItem.partName}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
