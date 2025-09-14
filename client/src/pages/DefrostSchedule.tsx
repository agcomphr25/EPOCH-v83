import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Snowflake, 
  Clock, 
  MapPin, 
  User, 
  Plus, 
  Calendar as CalendarIcon, 
  Building,
  AlertCircle,
  CheckCircle,
  PlayCircle,
  PauseCircle
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format, addDays, parseISO } from 'date-fns';

interface DefrostSchedule {
  id: number;
  freezerId: string;
  freezerName: string;
  locationBuilding: string;
  locationRoom: string;
  scheduledDate: string;
  scheduledTime: string;
  assignedTo: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  notes: string;
}

export default function DefrostSchedule() {
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [filterStatus, setFilterStatus] = useState('all');
  const [newSchedule, setNewSchedule] = useState({
    freezerId: '',
    freezerName: '',
    locationBuilding: 'Building A',
    locationRoom: '',
    scheduledDate: '',
    scheduledTime: '06:00',
    assignedTo: '',
    notes: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get defrost schedule
  const { data: schedules = [], isLoading } = useQuery<DefrostSchedule[]>({
    queryKey: ['/api/defrost-schedule'],
    refetchInterval: 60000 // Refresh every minute
  });

  // Filter schedules
  const filteredSchedules = schedules.filter(schedule => {
    if (filterStatus === 'all') return true;
    return schedule.status === filterStatus;
  });

  // Group schedules by date for calendar view
  const schedulesByDate = schedules.reduce((acc, schedule) => {
    const date = schedule.scheduledDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(schedule);
    return acc;
  }, {} as Record<string, DefrostSchedule[]>);

  // Add defrost schedule mutation
  const addScheduleMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/defrost-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to add defrost schedule');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/defrost-schedule'] });
      setShowAddSchedule(false);
      setNewSchedule({
        freezerId: '',
        freezerName: '',
        locationBuilding: 'Building A',
        locationRoom: '',
        scheduledDate: '',
        scheduledTime: '06:00',
        assignedTo: '',
        notes: ''
      });
      toast({
        title: "Success",
        description: "Defrost schedule added",
      });
    }
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number, status: string, notes?: string }) => {
      const response = await fetch(`/api/defrost-schedule/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/defrost-schedule'] });
      toast({
        title: "Success",
        description: "Status updated",
      });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200';
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled': return <Clock className="h-4 w-4" />;
      case 'in_progress': return <PlayCircle className="h-4 w-4" />;
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'cancelled': return <PauseCircle className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  // Calculate summary stats
  const totalScheduled = schedules.filter(s => s.status === 'scheduled').length;
  const inProgress = schedules.filter(s => s.status === 'in_progress').length;
  const completed = schedules.filter(s => s.status === 'completed').length;
  const overdue = schedules.filter(s => 
    s.status === 'scheduled' && 
    new Date(`${s.scheduledDate} ${s.scheduledTime}`) < new Date()
  ).length;

  // Generate next 14 days for bulk scheduling
  const generateBulkSchedules = () => {
    const freezers = Array.from({ length: 20 }, (_, i) => ({
      id: `F${(i + 1).toString().padStart(3, '0')}`,
      name: `Freezer ${i + 1} - ${i < 10 ? 'Production' : i < 15 ? 'Storage' : 'Backup'}`,
      building: i < 10 ? 'Building A' : i < 15 ? 'Building B' : 'Building C',
      room: i < 10 ? 'Production Floor' : i < 15 ? 'Storage Room' : 'Utility Room'
    }));

    const today = new Date();
    const bulkSchedules = [];

    for (let i = 0; i < 14; i++) {
      const scheduleDate = addDays(today, i + 1);
      const dailyCount = Math.ceil(20 / 14); // Distribute 20 freezers over 14 days
      const startIndex = i * dailyCount;
      
      for (let j = 0; j < dailyCount && startIndex + j < 20; j++) {
        const freezer = freezers[startIndex + j];
        const time = `${6 + Math.floor(j / 2)}:${j % 2 === 0 ? '00' : '30'}`;
        
        bulkSchedules.push({
          freezerId: freezer.id,
          freezerName: freezer.name,
          locationBuilding: freezer.building,
          locationRoom: freezer.room,
          scheduledDate: format(scheduleDate, 'yyyy-MM-dd'),
          scheduledTime: time,
          assignedTo: '',
          notes: 'Auto-generated bulk schedule'
        });
      }
    }

    return bulkSchedules;
  };

  const handleBulkSchedule = async () => {
    const bulkSchedules = generateBulkSchedules();
    
    for (const schedule of bulkSchedules) {
      await addScheduleMutation.mutateAsync(schedule);
    }
    
    toast({
      title: "Bulk Schedule Created",
      description: `Added ${bulkSchedules.length} defrost schedules for the next 2 weeks`,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Snowflake className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Defrost Schedule Manager</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBulkSchedule}>
            Auto-Schedule 2 Weeks
          </Button>
          <Button onClick={() => setShowAddSchedule(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Schedule
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
          <CardContent className="pt-6 text-center">
            <Clock className="h-8 w-8 mx-auto text-blue-600 mb-2" />
            <div className="text-2xl font-bold text-blue-600">{totalScheduled}</div>
            <div className="text-sm text-blue-600">Scheduled</div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200">
          <CardContent className="pt-6 text-center">
            <PlayCircle className="h-8 w-8 mx-auto text-yellow-600 mb-2" />
            <div className="text-2xl font-bold text-yellow-600">{inProgress}</div>
            <div className="text-sm text-yellow-600">In Progress</div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-8 w-8 mx-auto text-green-600 mb-2" />
            <div className="text-2xl font-bold text-green-600">{completed}</div>
            <div className="text-sm text-green-600">Completed</div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-red-600 mb-2" />
            <div className="text-2xl font-bold text-red-600">{overdue}</div>
            <div className="text-sm text-red-600">Overdue</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <Button 
                variant={viewMode === 'list' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setViewMode('list')}
              >
                List View
              </Button>
              <Button 
                variant={viewMode === 'calendar' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setViewMode('calendar')}
              >
                Calendar View
              </Button>
            </div>

            <div className="ml-auto">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule List/Calendar */}
      {viewMode === 'list' ? (
        <div className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-gray-500">Loading defrost schedules...</div>
              </CardContent>
            </Card>
          ) : filteredSchedules.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-gray-500">
                  <Snowflake className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  No defrost schedules found
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredSchedules.map(schedule => (
              <Card key={schedule.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Snowflake className="h-5 w-5 text-cyan-600" />
                      <h3 className="text-lg font-semibold">{schedule.freezerName}</h3>
                      <Badge className={getStatusColor(schedule.status)}>
                        {getStatusIcon(schedule.status)}
                        <span className="ml-1 capitalize">{schedule.status.replace('_', ' ')}</span>
                      </Badge>
                    </div>
                    
                    <div className="flex gap-2">
                      {schedule.status === 'scheduled' && (
                        <Button 
                          size="sm" 
                          onClick={() => updateStatusMutation.mutate({ 
                            id: schedule.id, 
                            status: 'in_progress' 
                          })}
                        >
                          Start Defrost
                        </Button>
                      )}
                      {schedule.status === 'in_progress' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ 
                            id: schedule.id, 
                            status: 'completed' 
                          })}
                        >
                          Mark Complete
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="font-medium flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        Scheduled
                      </div>
                      <div>{format(parseISO(schedule.scheduledDate), 'MMM dd, yyyy')}</div>
                      <div className="text-gray-500">{schedule.scheduledTime}</div>
                    </div>

                    <div>
                      <div className="font-medium flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Location
                      </div>
                      <div>{schedule.locationBuilding}</div>
                      <div className="text-gray-500">{schedule.locationRoom}</div>
                    </div>

                    <div>
                      <div className="font-medium flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Assigned To
                      </div>
                      <div>{schedule.assignedTo || 'Unassigned'}</div>
                      <div className="text-gray-500">ID: {schedule.freezerId}</div>
                    </div>

                    <div>
                      <div className="font-medium">Duration</div>
                      <div>
                        {schedule.durationMinutes ? `${schedule.durationMinutes} min` : 'Not completed'}
                      </div>
                      {schedule.completedAt && (
                        <div className="text-gray-500">
                          {format(parseISO(schedule.completedAt), 'HH:mm')}
                        </div>
                      )}
                    </div>
                  </div>

                  {schedule.notes && (
                    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
                      <div className="font-medium text-sm">Notes</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{schedule.notes}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-gray-500">
              Calendar view coming soon...
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Schedule Dialog */}
      <Dialog open={showAddSchedule} onOpenChange={setShowAddSchedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Defrost Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="freezer-id">Freezer ID</Label>
                <Input
                  id="freezer-id"
                  value={newSchedule.freezerId}
                  onChange={(e) => setNewSchedule(prev => ({ ...prev, freezerId: e.target.value }))}
                  placeholder="e.g. F001"
                />
              </div>
              <div>
                <Label htmlFor="freezer-name">Freezer Name</Label>
                <Input
                  id="freezer-name"
                  value={newSchedule.freezerName}
                  onChange={(e) => setNewSchedule(prev => ({ ...prev, freezerName: e.target.value }))}
                  placeholder="e.g. Freezer 1 - Production"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="building">Building</Label>
                <Select value={newSchedule.locationBuilding} onValueChange={(value) => setNewSchedule(prev => ({ ...prev, locationBuilding: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Building A">Building A</SelectItem>
                    <SelectItem value="Building B">Building B</SelectItem>
                    <SelectItem value="Building C">Building C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="room">Room</Label>
                <Input
                  id="room"
                  value={newSchedule.locationRoom}
                  onChange={(e) => setNewSchedule(prev => ({ ...prev, locationRoom: e.target.value }))}
                  placeholder="e.g. Production Floor"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="scheduled-date">Scheduled Date</Label>
                <Input
                  id="scheduled-date"
                  type="date"
                  value={newSchedule.scheduledDate}
                  onChange={(e) => setNewSchedule(prev => ({ ...prev, scheduledDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="scheduled-time">Scheduled Time</Label>
                <Input
                  id="scheduled-time"
                  type="time"
                  value={newSchedule.scheduledTime}
                  onChange={(e) => setNewSchedule(prev => ({ ...prev, scheduledTime: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="assigned-to">Assigned To</Label>
              <Select value={newSchedule.assignedTo} onValueChange={(value) => setNewSchedule(prev => ({ ...prev, assignedTo: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOMAS">Tomas</SelectItem>
                  <SelectItem value="AG">AG</SelectItem>
                  <SelectItem value="TIMMY">Timmy</SelectItem>
                  <SelectItem value="GLENN">Glenn</SelectItem>
                  <SelectItem value="BRAD">Brad</SelectItem>
                  <SelectItem value="JOEY">Joey</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={newSchedule.notes}
                onChange={(e) => setNewSchedule(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any special instructions or notes..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddSchedule(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => addScheduleMutation.mutate(newSchedule)} 
                disabled={addScheduleMutation.isPending || !newSchedule.freezerId || !newSchedule.scheduledDate}
              >
                Add Schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}