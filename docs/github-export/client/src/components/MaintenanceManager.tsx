import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Clock, Settings, Plus, Wrench, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { insertMaintenanceScheduleSchema } from '@shared/schema';
import { z } from 'zod';
import type { MaintenanceSchedule, MaintenanceLog } from '@shared/schema';

export default function MaintenanceManager() {
  const [activeTab, setActiveTab] = useState("schedules");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof insertMaintenanceScheduleSchema>>({
    resolver: zodResolver(insertMaintenanceScheduleSchema),
    defaultValues: {
      equipment: '',
      frequency: 'QUARTERLY',
      startDate: new Date(),
      description: '',
      isActive: true,
    },
  });

  const createScheduleMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertMaintenanceScheduleSchema>) => {
      const response = await fetch('/api/maintenance-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create maintenance schedule');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/maintenance-schedules'] });
      toast({ title: 'Maintenance schedule created successfully' });
      setIsModalOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({ title: 'Error creating maintenance schedule', description: error.message, variant: 'destructive' });
    },
  });

  const onSubmit = (data: z.infer<typeof insertMaintenanceScheduleSchema>) => {
    createScheduleMutation.mutate(data);
  };

  // Fetch maintenance schedules
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['/api/maintenance-schedules'],
    queryFn: async () => {
      const response = await fetch('/api/maintenance-schedules');
      if (!response.ok) throw new Error('Failed to fetch maintenance schedules');
      return response.json() as Promise<MaintenanceSchedule[]>;
    }
  });

  // Fetch maintenance logs
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['/api/maintenance-logs'],
    queryFn: async () => {
      const response = await fetch('/api/maintenance-logs');
      if (!response.ok) throw new Error('Failed to fetch maintenance logs');
      return response.json() as Promise<MaintenanceLog[]>;
    }
  });

  const getFrequencyBadge = (frequency: string) => {
    const colors = {
      ANNUAL: 'bg-blue-100 text-blue-800 border-blue-200',
      SEMIANNUAL: 'bg-green-100 text-green-800 border-green-200',
      QUARTERLY: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      BIWEEKLY: 'bg-red-100 text-red-800 border-red-200'
    };
    return <Badge className={colors[frequency as keyof typeof colors]}>{frequency}</Badge>;
  };

  const getNextDueDate = (schedule: MaintenanceSchedule) => {
    const startDate = new Date(schedule.startDate);
    const now = new Date();
    
    let nextDue = new Date(startDate);
    
    const intervals = {
      ANNUAL: 365,
      SEMIANNUAL: 182,
      QUARTERLY: 91,
      BIWEEKLY: 14
    };
    
    const interval = intervals[schedule.frequency as keyof typeof intervals];
    
    while (nextDue < now) {
      nextDue.setDate(nextDue.getDate() + interval);
    }
    
    return nextDue;
  };

  const isOverdue = (schedule: MaintenanceSchedule) => {
    const nextDue = getNextDueDate(schedule);
    return nextDue < new Date();
  };

  const formatDate = (dateString: string | Date) => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const overdueSchedules = schedules.filter(isOverdue);
  const upcomingSchedules = schedules.filter(s => !isOverdue(s));

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Preventive Maintenance</h1>
          <p className="text-gray-600 mt-2">Manage equipment maintenance schedules and logs</p>
        </div>
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Maintenance Schedule</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="equipment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter equipment name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ANNUAL">Annual</SelectItem>
                          <SelectItem value="SEMIANNUAL">Semi-Annual</SelectItem>
                          <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                          <SelectItem value="BIWEEKLY">Bi-Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : field.value}
                          onChange={(e) => field.onChange(new Date(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter maintenance description" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createScheduleMutation.isPending}>
                    {createScheduleMutation.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Alert for overdue maintenance */}
      {overdueSchedules.length > 0 && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              Overdue Maintenance ({overdueSchedules.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueSchedules.map((schedule) => (
                <div key={schedule.id} className="flex justify-between items-center p-2 bg-white rounded border">
                  <div>
                    <span className="font-medium">{schedule.equipment}</span>
                    <span className="text-sm text-gray-600 ml-2">
                      Due: {formatDate(getNextDueDate(schedule))}
                    </span>
                  </div>
                  {getFrequencyBadge(schedule.frequency)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="schedules">Maintenance Schedules</TabsTrigger>
          <TabsTrigger value="logs">Maintenance Logs</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="schedules" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Maintenance Schedules
              </CardTitle>
              <CardDescription>
                Manage preventive maintenance schedules for equipment
              </CardDescription>
            </CardHeader>
            <CardContent>
              {schedulesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : schedules.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No maintenance schedules found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {schedules.map((schedule) => {
                    const nextDue = getNextDueDate(schedule);
                    const overdue = isOverdue(schedule);
                    
                    return (
                      <div key={schedule.id} className={`border rounded-lg p-4 ${overdue ? 'border-red-200 bg-red-50' : 'hover:bg-gray-50'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-semibold text-lg">{schedule.equipment}</h3>
                            {schedule.description && (
                              <p className="text-sm text-gray-600">{schedule.description}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {getFrequencyBadge(schedule.frequency)}
                            {schedule.isActive && (
                              <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                            )}
                            {overdue && (
                              <Badge className="bg-red-100 text-red-800 border-red-200">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Overdue
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Start Date:</span> {formatDate(schedule.startDate)}
                          </div>
                          <div>
                            <span className="font-medium">Next Due:</span> {formatDate(nextDue)}
                          </div>
                          <div>
                            <span className="font-medium">Frequency:</span> {schedule.frequency}
                          </div>
                          <div>
                            <span className="font-medium">Created:</span> {formatDate(schedule.createdAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Maintenance Logs
              </CardTitle>
              <CardDescription>
                View completed maintenance activities and records
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Wrench className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No maintenance logs found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {logs.map((log) => (
                    <div key={log.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold">Maintenance Log #{log.id}</h3>
                          <p className="text-sm text-gray-600">Schedule ID: {log.scheduleId}</p>
                        </div>
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Completed:</span> {formatDateTime(log.completedAt)}
                        </div>
                        <div>
                          <span className="font-medium">Completed by:</span> {log.completedBy || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Next Due:</span> {log.nextDueDate ? formatDate(log.nextDueDate) : 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Logged:</span> {formatDate(log.createdAt)}
                        </div>
                      </div>
                      
                      {log.notes && (
                        <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
                          <span className="font-medium">Notes:</span> {log.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Schedules</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{schedules.length}</div>
                <p className="text-sm text-gray-600">Active maintenance schedules</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{overdueSchedules.length}</div>
                <p className="text-sm text-gray-600">Require immediate attention</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{logs.length}</div>
                <p className="text-sm text-gray-600">Maintenance activities logged</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Up to Date</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{upcomingSchedules.length}</div>
                <p className="text-sm text-gray-600">Schedules on track</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-center gap-3 py-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <div className="flex-1">
                    <p className="text-sm">
                      Maintenance completed for Schedule #{log.scheduleId}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(log.completedAt)} by {log.completedBy || 'Unknown'}
                    </p>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="text-gray-500 text-sm">No recent maintenance activity</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}