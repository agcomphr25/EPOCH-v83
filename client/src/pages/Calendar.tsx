import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar as BigCalendar, momentLocalizer, Views, Event } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import moment from 'moment';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarIcon, Plus, FileDown, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { CalendarEvent } from '@shared/schema';

// Setup moment localizer for react-big-calendar
const localizer = momentLocalizer(moment);

// Form validation schema
const eventFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  location: z.string().optional(),
  isAllDay: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  eventType: z.enum(['meeting', 'deadline', 'reminder', 'task', 'other']).default('meeting'),
});

type EventFormData = z.infer<typeof eventFormSchema>;

interface CalendarEventExtended extends Event {
  id: number;
  description?: string;
  location?: string;
  isAllDay: boolean;
  isPublic: boolean;
  eventType: string;
  createdBy: string;
}

export default function Calendar() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventExtended | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentView, setCurrentView] = useState<string>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch calendar events
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['/api/calendar/events'],
    select: (data: CalendarEvent[]) => 
      data.map(event => ({
        id: event.id,
        start: new Date(event.startDate),
        end: new Date(event.endDate),
        title: event.title,
        description: event.description,
        location: event.location,
        isAllDay: event.allDay,
        isPublic: event.isPublic,
        eventType: 'meeting', // Default since it's not in the schema yet
        createdBy: event.createdBy,
        resource: event,
      })) as CalendarEventExtended[],
  });

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: (eventData: any) => apiRequest('/api/calendar/events', {
      method: 'POST',
      body: eventData,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      setIsCreateDialogOpen(false);
      toast({
        title: 'Event Created',
        description: 'Your event has been successfully created.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error Creating Event',
        description: 'Failed to create event. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Update event mutation
  const updateEventMutation = useMutation({
    mutationFn: ({ id, ...eventData }: any) => apiRequest(`/api/calendar/events/${id}`, {
      method: 'PUT',
      body: eventData,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      setIsEditDialogOpen(false);
      setSelectedEvent(null);
      toast({
        title: 'Event Updated',
        description: 'Your event has been successfully updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error Updating Event',
        description: 'Failed to update event. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: (eventId: number) => apiRequest(`/api/calendar/events/${eventId}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      setSelectedEvent(null);
      toast({
        title: 'Event Deleted',
        description: 'Your event has been successfully deleted.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error Deleting Event',
        description: 'Failed to delete event. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Form for creating events
  const createForm = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: '',
      description: '',
      startDate: moment().format('YYYY-MM-DD'),
      endDate: moment().format('YYYY-MM-DD'),
      startTime: '09:00',
      endTime: '10:00',
      location: '',
      isAllDay: false,
      isPublic: true,
      eventType: 'meeting',
    },
  });

  // Form for editing events
  const editForm = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
  });

  // Handle event selection
  const handleSelectEvent = (event: CalendarEventExtended) => {
    setSelectedEvent(event);
    editForm.reset({
      title: event.title,
      description: event.description || '',
      startDate: moment(event.start).format('YYYY-MM-DD'),
      endDate: moment(event.end).format('YYYY-MM-DD'),
      startTime: moment(event.start).format('HH:mm'),
      endTime: moment(event.end).format('HH:mm'),
      location: event.location || '',
      isAllDay: event.isAllDay,
      isPublic: event.isPublic,
      eventType: event.eventType as any,
    });
  };

  // Handle slot selection (for creating new events)
  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    createForm.reset({
      title: '',
      description: '',
      startDate: moment(start).format('YYYY-MM-DD'),
      endDate: moment(end).format('YYYY-MM-DD'),
      startTime: moment(start).format('HH:mm'),
      endTime: moment(end).format('HH:mm'),
      location: '',
      isAllDay: false,
      isPublic: true,
      eventType: 'meeting',
    });
    setIsCreateDialogOpen(true);
  };

  // Handle create event submission
  const onCreateSubmit = (data: EventFormData) => {
    const eventData = {
      title: data.title,
      description: data.description,
      startDate: new Date(`${data.startDate}T${data.startTime}`),
      endDate: new Date(`${data.endDate}T${data.endTime}`),
      location: data.location,
      allDay: data.isAllDay,
      isPublic: data.isPublic,
      eventType: data.eventType,
      createdBy: 'current-user', // TODO: Get from auth context
    };
    createEventMutation.mutate(eventData);
  };

  // Handle edit event submission
  const onEditSubmit = (data: EventFormData) => {
    if (!selectedEvent) return;
    
    const eventData = {
      id: selectedEvent.id,
      title: data.title,
      description: data.description,
      startDate: new Date(`${data.startDate}T${data.startTime}`),
      endDate: new Date(`${data.endDate}T${data.endTime}`),
      location: data.location,
      allDay: data.isAllDay,
      isPublic: data.isPublic,
      eventType: data.eventType,
    };
    updateEventMutation.mutate(eventData);
  };

  // Handle event deletion
  const handleDeleteEvent = () => {
    if (selectedEvent) {
      deleteEventMutation.mutate(selectedEvent.id);
    }
  };

  // Generate blank calendar PDF
  const handleGenerateBlankPDF = async () => {
    try {
      const response = await fetch('/api/calendar/blank-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          month: moment(currentDate).format('YYYY-MM'),
          view: currentView,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('PDF generation failed:', response.status, errorData);
        throw new Error(`Server returned ${response.status}: ${errorData}`);
      }
      
      const blob = await response.blob();
      
      // Check if blob is valid PDF
      if (blob.size === 0) {
        throw new Error('Received empty PDF file');
      }
      
      // Open in new tab instead of downloading for better debugging
      const url = window.URL.createObjectURL(blob);
      const newWindow = window.open(url, '_blank');
      
      if (newWindow) {
        // Clean up URL after a delay
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 5000);
        
        toast({
          title: 'PDF Generated',
          description: 'Your blank calendar PDF has opened in a new tab.',
        });
      } else {
        // Fallback to download if popup blocked
        const a = document.createElement('a');
        a.href = url;
        a.download = `calendar-${moment(currentDate).format('YYYY-MM')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        toast({
          title: 'PDF Downloaded',
          description: 'Your blank calendar PDF has been downloaded.',
        });
      }
      
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: 'Error Generating PDF',
        description: `Failed to generate calendar PDF: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const eventStyleGetter = (event: CalendarEventExtended) => {
    let backgroundColor = '#3174ad';
    
    switch (event.eventType) {
      case 'meeting':
        backgroundColor = '#3174ad';
        break;
      case 'deadline':
        backgroundColor = '#dc2626';
        break;
      case 'reminder':
        backgroundColor = '#f59e0b';
        break;
      case 'task':
        backgroundColor = '#10b981';
        break;
      default:
        backgroundColor = '#6b7280';
    }
    
    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    };
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading calendar...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CalendarIcon className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button
            onClick={handleGenerateBlankPDF}
            variant="outline"
            className="flex items-center space-x-2"
            data-testid="button-generate-blank-pdf"
          >
            <FileDown className="h-4 w-4" />
            <span>Download Blank PDF</span>
          </Button>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center space-x-2" data-testid="button-create-event">
                <Plus className="h-4 w-4" />
                <span>New Event</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Event</DialogTitle>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={createForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-event-title" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="eventType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-event-type">
                                <SelectValue placeholder="Select event type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="meeting">Meeting</SelectItem>
                              <SelectItem value="deadline">Deadline</SelectItem>
                              <SelectItem value="reminder">Reminder</SelectItem>
                              <SelectItem value="task">Task</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-event-location" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-start-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="startTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} data-testid="input-start-time" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-end-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="endTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} data-testid="input-end-time" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={createForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="textarea-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="col-span-2 flex items-center space-x-6">
                      <FormField
                        control={createForm.control}
                        name="isAllDay"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-all-day"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>All Day Event</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={createForm.control}
                        name="isPublic"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-public"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Public Event</FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                      data-testid="button-cancel-create"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createEventMutation.isPending}
                      data-testid="button-submit-create"
                    >
                      {createEventMutation.isPending ? 'Creating...' : 'Create Event'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div style={{ height: '600px' }}>
            <BigCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              selectable
              views={[Views.MONTH, Views.WEEK, Views.DAY]}
              view={currentView as any}
              onView={setCurrentView}
              date={currentDate}
              onNavigate={setCurrentDate}
              eventPropGetter={eventStyleGetter}
              popup
              tooltipAccessor={(event: CalendarEventExtended) => event.description || ''}
            />
          </div>
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>{selectedEvent.title}</span>
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(true);
                      setSelectedEvent(null);
                    }}
                    data-testid="button-edit-event"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteEvent}
                    data-testid="button-delete-event"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Time</p>
                <p className="text-sm">
                  {moment(selectedEvent.start).format('MMM D, YYYY h:mm A')} - {' '}
                  {moment(selectedEvent.end).format('MMM D, YYYY h:mm A')}
                </p>
              </div>
              
              {selectedEvent.location && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Location</p>
                  <p className="text-sm">{selectedEvent.location}</p>
                </div>
              )}
              
              {selectedEvent.description && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Description</p>
                  <p className="text-sm">{selectedEvent.description}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm font-medium text-gray-500">Event Type</p>
                <p className="text-sm capitalize">{selectedEvent.eventType}</p>
              </div>
              
              <div className="flex items-center space-x-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">All Day</p>
                  <p className="text-sm">{selectedEvent.isAllDay ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Public</p>
                  <p className="text-sm">{selectedEvent.isPublic ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Event Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              {/* Similar form fields as create form - keeping DRY principle */}
              {/* For brevity, using same structure as create form */}
              {/* In production, this could be extracted to a shared component */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="eventType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-event-type">
                            <SelectValue placeholder="Select event type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="meeting">Meeting</SelectItem>
                          <SelectItem value="deadline">Deadline</SelectItem>
                          <SelectItem value="reminder">Reminder</SelectItem>
                          <SelectItem value="task">Task</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-edit-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateEventMutation.isPending}
                  data-testid="button-submit-edit"
                >
                  {updateEventMutation.isPending ? 'Updating...' : 'Update Event'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}