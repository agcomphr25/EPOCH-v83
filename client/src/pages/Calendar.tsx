import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar as BigCalendar,
  momentLocalizer,
  Views,
  Event,
  View,
} from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import moment from 'moment';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useForm, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CalendarIcon,
  Plus,
  FileDown,
  Edit,
  Trash2,
  Printer,
  ChevronDown,
  ChevronRight,
  Lock,
  Globe,
  Settings,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const localizer = momentLocalizer(moment);

const CALENDAR_COLORS = [
  '#3174ad', '#dc2626', '#f59e0b', '#10b981',
  '#6b7280', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#84cc16',
];

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
  calendarId: z.string().optional(),
});

type EventFormData = z.infer<typeof eventFormSchema>;

const calendarFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  color: z.string().default('#3174ad'),
  isPrivate: z.boolean().default(false),
  shareWithUserIds: z.array(z.number()).default([]),
});

type CalendarFormData = z.infer<typeof calendarFormSchema>;

interface CalendarEventExtended extends Event {
  id: number | string;
  description?: string;
  location?: string;
  isAllDay: boolean;
  isPublic: boolean;
  eventType: string;
  createdBy?: string;
  source?: string;
  color?: string;
  colorId?: string;
  calendarId?: number | null;
}

interface UserCalendarWithShares {
  id: number;
  name: string;
  color: string;
  ownerUserId: number;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  shares: Array<{ id: number; calendarId: number; sharedWithUserId: number }>;
}

interface EventPayload {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  allDay: boolean;
  isPublic: boolean;
  eventType: string;
  calendarId: number | null;
}

interface EventUpdatePayload extends EventPayload {
  id: number | string;
}

interface CalendarUpdatePayload extends CalendarFormData {
  id: number;
}

interface CurrentUser {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  role: string;
  employeeId?: number;
}

interface AppUser {
  id: number;
  username: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

interface RawLocalEvent {
  id: number;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  location?: string;
  allDay: boolean;
  isPublic: boolean;
  eventType: string;
  createdByUserId: number;
  calendarId?: number | null;
}

interface RawGoogleEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  location?: string;
  allDay: boolean;
  isPublic: boolean;
  eventType: string;
  createdBy?: string;
  color?: string;
  colorId?: string;
  calendarName?: string;
  calendarId?: string;
}

export default function Calendar() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventExtended | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isCalendarDialogOpen, setIsCalendarDialogOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<UserCalendarWithShares | null>(null);
  const [mySectionOpen, setMySectionOpen] = useState(true);
  const [sharedSectionOpen, setSharedSectionOpen] = useState(true);
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<number>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current user info
  const { data: currentUser } = useQuery<CurrentUser | null>({
    queryKey: ['/api/auth/session'],
    queryFn: async () => {
      const r = await fetch('/api/auth/session', { credentials: 'include' });
      if (!r.ok) return null;
      return r.json() as Promise<CurrentUser>;
    },
    retry: false,
  });

  // Fetch all users for sharing
  const { data: allUsers = [] } = useQuery<AppUser[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const r = await fetch('/api/users', { credentials: 'include' });
      if (!r.ok) return [];
      return r.json() as Promise<AppUser[]>;
    },
    retry: false,
  });

  // Fetch user calendars
  const { data: userCalendars = [], isLoading: isLoadingCalendars } = useQuery<UserCalendarWithShares[]>({
    queryKey: ['/api/calendar/calendars'],
    queryFn: async () => {
      const r = await fetch('/api/calendar/calendars', { credentials: 'include' });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const myCalendars = useMemo(
    () => userCalendars.filter((c) => c.ownerUserId === currentUser?.id),
    [userCalendars, currentUser]
  );
  const sharedCalendars = useMemo(
    () => userCalendars.filter((c) => c.ownerUserId !== currentUser?.id),
    [userCalendars, currentUser]
  );

  // Build a map of calendarId → color
  const calendarColorMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const cal of userCalendars) map[cal.id] = cal.color;
    return map;
  }, [userCalendars]);

  // Fetch local calendar events
  const { data: localEvents = [], isLoading: isLoadingLocal } = useQuery({
    queryKey: ['/api/calendar/events'],
    queryFn: async () => {
      const r = await fetch('/api/calendar/events', { credentials: 'include' });
      if (!r.ok) return [];
      return r.json();
    },
    select: (data: RawLocalEvent[]) => {
      if (!Array.isArray(data)) return [];
      return data.map((event) => {
        let start, end;
        if (event.allDay) {
          const [sy, sm, sd] = event.startDate.split('T')[0].split('-').map(Number);
          const [ey, em, ed] = event.endDate.split('T')[0].split('-').map(Number);
          start = new Date(sy, sm - 1, sd);
          end = new Date(ey, em - 1, ed);
        } else {
          start = new Date(event.startDate);
          end = new Date(event.endDate);
        }
        return {
          id: event.id,
          start,
          end,
          title: event.title || 'Untitled',
          description: event.description || '',
          location: event.location || '',
          isAllDay: event.allDay || false,
          isPublic: event.isPublic !== undefined ? event.isPublic : true,
          eventType: event.eventType || 'meeting',
          createdBy: event.createdByUserId,
          source: 'local',
          calendarId: event.calendarId ?? null,
          resource: event,
        };
      }) as CalendarEventExtended[];
    },
  });

  // Fetch Google Calendar events
  const { data: googleEvents = [], isLoading: isLoadingGoogle, error: googleError } = useQuery({
    queryKey: ['/api/calendar/google-events'],
    queryFn: async () => {
      const r = await fetch('/api/calendar/google-events', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to fetch Google Calendar events');
      return r.json();
    },
    retry: false,
    staleTime: 1000 * 30,
    select: (data: RawGoogleEvent[]) => {
      if (!Array.isArray(data)) return [];
      return data.map((event) => {
        let start, end;
        if (event.allDay) {
          const [sy, sm, sd] = event.startDate.split('T')[0].split('-').map(Number);
          const [ey, em, ed] = event.endDate.split('T')[0].split('-').map(Number);
          start = new Date(sy, sm - 1, sd);
          end = new Date(ey, em - 1, ed);
        } else {
          start = new Date(event.startDate);
          end = new Date(event.endDate);
        }
        return {
          id: event.id,
          start,
          end,
          title: event.title,
          description: event.description,
          location: event.location,
          isAllDay: event.allDay,
          isPublic: event.isPublic,
          eventType: event.eventType || 'meeting',
          createdBy: event.createdBy,
          source: 'google',
          color: event.color,
          colorId: event.colorId,
          resource: event,
        };
      }) as CalendarEventExtended[];
    },
  });

  // Fetch approved PTO requests
  const { data: approvedPTO = [] } = useQuery<{ id: number; employeeId: number; startDate: string; endDate: string; leaveType: string; employeeFirstName?: string | null; employeeLastName?: string | null }[]>({
    queryKey: ['/api/timekeeping/time-off/approved'],
    queryFn: async () => {
      const r = await fetch('/api/timekeeping/time-off/approved', { credentials: 'include' });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  // Convert approved PTO to calendar events (deduplicate by id)
  const ptoEvents = useMemo(() => {
    return approvedPTO.map((pto) => {
      const [sy, sm, sd] = pto.startDate.split('-').map(Number);
      const [ey, em, ed] = pto.endDate.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed + 1); // exclusive end for all-day
      const empName = (pto.employeeFirstName && pto.employeeLastName)
        ? `${pto.employeeFirstName} ${pto.employeeLastName}`
        : `Employee #${pto.employeeId}`;
      return {
        id: `pto-${pto.id}`,
        start,
        end,
        title: `PTO — ${empName}`,
        description: '',
        location: '',
        isAllDay: true,
        isPublic: false,
        eventType: 'other' as const,
        source: 'pto',
        color: '#10b981',
        resource: pto,
      } as CalendarEventExtended;
    });
  }, [approvedPTO]);

  // Filter local events based on hidden calendars
  const visibleLocalEvents = useMemo(() => {
    return localEvents.filter((e) => {
      if (e.calendarId == null) return true;
      return !hiddenCalendarIds.has(e.calendarId);
    });
  }, [localEvents, hiddenCalendarIds]);

  const events = useMemo(() => [...visibleLocalEvents, ...googleEvents, ...ptoEvents], [visibleLocalEvents, googleEvents, ptoEvents]);

  const isLoading = isLoadingLocal || isLoadingCalendars;

  // Calendar mutations
  const createCalendarMutation = useMutation({
    mutationFn: (data: CalendarFormData) => apiRequest('/api/calendar/calendars', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/calendars'] });
      setIsCalendarDialogOpen(false);
      toast({ title: 'Calendar Created', description: 'Your calendar has been created.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create calendar.', variant: 'destructive' }),
  });

  const updateCalendarMutation = useMutation({
    mutationFn: ({ id, ...data }: CalendarUpdatePayload) => apiRequest(`/api/calendar/calendars/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/calendars'] });
      setIsCalendarDialogOpen(false);
      setEditingCalendar(null);
      toast({ title: 'Calendar Updated', description: 'Your calendar has been updated.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update calendar.', variant: 'destructive' }),
  });

  const deleteCalendarMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/calendar/calendars/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/calendars'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      toast({ title: 'Calendar Deleted', description: 'Calendar and its events have been deleted.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete calendar.', variant: 'destructive' }),
  });

  // Event mutations
  const createEventMutation = useMutation({
    mutationFn: (data: EventPayload) => apiRequest('/api/calendar/events', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      setIsCreateDialogOpen(false);
      toast({ title: 'Event Created', description: 'Your event has been created.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to create event.', variant: 'destructive' }),
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, ...data }: EventUpdatePayload) => apiRequest(`/api/calendar/events/${id}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      setIsEditDialogOpen(false);
      setSelectedEvent(null);
      toast({ title: 'Event Updated', description: 'Your event has been updated.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update event.', variant: 'destructive' }),
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/calendar/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      setSelectedEvent(null);
      toast({ title: 'Event Deleted', description: 'Your event has been deleted.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete event.', variant: 'destructive' }),
  });

  // Calendar form
  const calendarForm = useForm<CalendarFormData>({
    resolver: zodResolver(calendarFormSchema),
    defaultValues: { name: '', color: '#3174ad', isPrivate: false, shareWithUserIds: [] },
  });

  // Event forms
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
      calendarId: '',
    },
  });

  const editForm = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
  });

  const handleOpenCalendarDialog = (cal?: UserCalendarWithShares) => {
    if (cal) {
      setEditingCalendar(cal);
      calendarForm.reset({
        name: cal.name,
        color: cal.color,
        isPrivate: cal.isPrivate,
        shareWithUserIds: cal.shares.map((s) => s.sharedWithUserId),
      });
    } else {
      setEditingCalendar(null);
      calendarForm.reset({ name: '', color: '#3174ad', isPrivate: false, shareWithUserIds: [] });
    }
    setIsCalendarDialogOpen(true);
  };

  const onCalendarSubmit = (data: CalendarFormData) => {
    if (editingCalendar) {
      updateCalendarMutation.mutate({ id: editingCalendar.id, ...data });
    } else {
      createCalendarMutation.mutate(data);
    }
  };

  const handleSelectEvent = (event: CalendarEventExtended) => {
    setSelectedEvent(event);
    if (event.source !== 'google') {
      editForm.reset({
        title: String(event.title),
        description: event.description || '',
        startDate: moment(event.start).format('YYYY-MM-DD'),
        endDate: moment(event.end).format('YYYY-MM-DD'),
        startTime: moment(event.start).format('HH:mm'),
        endTime: moment(event.end).format('HH:mm'),
        location: event.location || '',
        isAllDay: event.isAllDay,
        isPublic: event.isPublic,
        eventType: event.eventType as 'meeting' | 'deadline' | 'reminder' | 'task' | 'other',
        calendarId: event.calendarId != null ? String(event.calendarId) : '',
      });
    }
  };

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
      calendarId: myCalendars.length > 0 ? String(myCalendars[0].id) : '',
    });
    setIsCreateDialogOpen(true);
  };

  const onCreateSubmit = (data: EventFormData) => {
    createEventMutation.mutate({
      title: data.title,
      description: data.description,
      startDate: new Date(`${data.startDate}T${data.startTime}`),
      endDate: new Date(`${data.endDate}T${data.endTime}`),
      location: data.location,
      allDay: data.isAllDay,
      isPublic: data.isPublic,
      eventType: data.eventType,
      calendarId: data.calendarId ? parseInt(data.calendarId) : null,
    });
  };

  const onEditSubmit = (data: EventFormData) => {
    if (!selectedEvent) return;
    updateEventMutation.mutate({
      id: selectedEvent.id,
      title: data.title,
      description: data.description,
      startDate: new Date(`${data.startDate}T${data.startTime}`),
      endDate: new Date(`${data.endDate}T${data.endTime}`),
      location: data.location,
      allDay: data.isAllDay,
      isPublic: data.isPublic,
      eventType: data.eventType,
      calendarId: data.calendarId ? parseInt(data.calendarId) : null,
    });
  };

  const handleDeleteEvent = () => {
    if (selectedEvent && selectedEvent.source !== 'google') {
      deleteEventMutation.mutate(selectedEvent.id as number);
    }
  };

  const handleGenerateBlankPDF = async () => {
    try {
      const pdfParams = new URLSearchParams({
        month: moment(currentDate).format('YYYY-MM'),
        view: currentView,
        timestamp: Date.now().toString(),
      });
      const pdfDirectUrl = `${window.location.origin}/api/calendar/blank-pdf?${pdfParams.toString()}`;
      setPdfUrl(pdfDirectUrl);
      setIsPdfModalOpen(true);
      toast({ title: 'PDF Generated', description: 'Your blank calendar PDF is ready to view.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate calendar PDF.', variant: 'destructive' });
    }
  };

  const handleClosePdfModal = () => {
    setIsPdfModalOpen(false);
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
  };

  const toggleCalendarVisibility = (calId: number) => {
    setHiddenCalendarIds((prev) => {
      const next = new Set(prev);
      if (next.has(calId)) next.delete(calId);
      else next.add(calId);
      return next;
    });
  };

  const eventStyleGetter = (event: CalendarEventExtended) => {
    let backgroundColor = '#3174ad';

    if (event.source === 'google') {
      backgroundColor = event.color || '#4285f4';
    } else if (event.source === 'pto') {
      backgroundColor = event.color || '#10b981';
    } else if (event.calendarId != null && calendarColorMap[event.calendarId]) {
      backgroundColor = calendarColorMap[event.calendarId];
    } else {
      switch (event.eventType) {
        case 'meeting': backgroundColor = '#3174ad'; break;
        case 'deadline': backgroundColor = '#dc2626'; break;
        case 'reminder': backgroundColor = '#f59e0b'; break;
        case 'task': backgroundColor = '#10b981'; break;
        default: backgroundColor = '#6b7280';
      }
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.85,
        color: 'white',
        border: event.source === 'google' ? '2px solid #1a73e8' : '0px',
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

  const watchedIsPrivate = calendarForm.watch('isPrivate');
  const watchedShareIds = calendarForm.watch('shareWithUserIds');

  return (
    <div className="p-6 space-y-4">
      {googleError && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm text-yellow-700">
          Unable to load Google Calendar events. Showing local events only.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CalendarIcon className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
          {isLoadingGoogle && <span className="text-sm text-gray-500">(Syncing Google Calendar...)</span>}
        </div>
        <div className="flex items-center space-x-3">
          <Button onClick={handleGenerateBlankPDF} variant="outline" className="flex items-center space-x-2">
            <FileDown className="h-4 w-4" />
            <span>Blank PDF</span>
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
              <EventForm
                form={createForm}
                onSubmit={onCreateSubmit}
                isPending={createEventMutation.isPending}
                onCancel={() => setIsCreateDialogOpen(false)}
                userCalendars={userCalendars}
                submitLabel="Create Event"
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main layout: sidebar + calendar */}
      <div className="flex gap-4">
        {/* Sidebar */}
        <div className="w-60 flex-shrink-0 space-y-2">
          {/* My Calendars */}
          <Card>
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <button
                  className="flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-gray-900"
                  onClick={() => setMySectionOpen(!mySectionOpen)}
                >
                  {mySectionOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  My Calendars
                </button>
                <button
                  onClick={() => handleOpenCalendarDialog()}
                  className="p-0.5 rounded hover:bg-gray-100"
                  title="New Calendar"
                >
                  <Plus className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              {mySectionOpen && (
                <div className="space-y-1">
                  {myCalendars.length === 0 && (
                    <p className="text-xs text-gray-400 pl-1">No calendars yet</p>
                  )}
                  {myCalendars.map((cal) => (
                    <CalendarSidebarItem
                      key={cal.id}
                      calendar={cal}
                      isHidden={hiddenCalendarIds.has(cal.id)}
                      onToggle={() => toggleCalendarVisibility(cal.id)}
                      onEdit={() => handleOpenCalendarDialog(cal)}
                      onDelete={() => {
                        if (confirm(`Delete calendar "${cal.name}" and all its events?`)) {
                          deleteCalendarMutation.mutate(cal.id);
                        }
                      }}
                      isOwner={true}
                    />
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Shared With Me */}
          {sharedCalendars.length > 0 && (
            <Card>
              <div className="p-3">
                <button
                  className="flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-2"
                  onClick={() => setSharedSectionOpen(!sharedSectionOpen)}
                >
                  {sharedSectionOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Shared with Me
                </button>
                {sharedSectionOpen && (
                  <div className="space-y-1">
                    {sharedCalendars.map((cal) => (
                      <CalendarSidebarItem
                        key={cal.id}
                        calendar={cal}
                        isHidden={hiddenCalendarIds.has(cal.id)}
                        onToggle={() => toggleCalendarVisibility(cal.id)}
                        isOwner={false}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Calendar grid */}
        <Card className="flex-1">
          <CardContent className="p-4">
            <div style={{ height: '640px' }}>
              <BigCalendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                onSelectEvent={handleSelectEvent}
                onSelectSlot={handleSelectSlot}
                selectable
                views={[Views.MONTH, Views.WEEK, Views.DAY]}
                view={currentView}
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
      </div>

      {/* Calendar Create/Edit Dialog */}
      <Dialog open={isCalendarDialogOpen} onOpenChange={(o) => { if (!o) { setIsCalendarDialogOpen(false); setEditingCalendar(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCalendar ? 'Edit Calendar' : 'New Calendar'}</DialogTitle>
          </DialogHeader>
          <Form {...calendarForm}>
            <form onSubmit={calendarForm.handleSubmit(onCalendarSubmit)} className="space-y-4">
              <FormField
                control={calendarForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Calendar Name</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Work, Personal" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={calendarForm.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <div className="flex flex-wrap gap-2">
                      {CALENDAR_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => field.onChange(c)}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${field.value === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={calendarForm.control}
                name="isPrivate"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="flex items-center gap-2">
                      <FormLabel className="cursor-pointer">Private Calendar</FormLabel>
                      {field.value ? <Lock className="h-3.5 w-3.5 text-gray-500" /> : <Globe className="h-3.5 w-3.5 text-gray-500" />}
                    </div>
                  </FormItem>
                )}
              />

              {!watchedIsPrivate && allUsers.length > 0 && (
                <FormField
                  control={calendarForm.control}
                  name="shareWithUserIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Share with</FormLabel>
                      <ScrollArea className="h-36 rounded border p-2">
                        <div className="space-y-1">
                          {allUsers
                            .filter((u) => u.id !== currentUser?.id)
                            .map((u) => (
                              <label key={u.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded text-sm">
                                <Checkbox
                                  checked={field.value.includes(u.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...field.value, u.id]);
                                    } else {
                                      field.onChange(field.value.filter((id: number) => id !== u.id));
                                    }
                                  }}
                                />
                                {[u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username || `User ${u.id}`}
                              </label>
                            ))}
                        </div>
                      </ScrollArea>
                      {watchedShareIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {watchedShareIds.map((uid: number) => {
                            const u = allUsers.find((x) => x.id === uid);
                            return u ? (
                              <Badge key={uid} variant="secondary" className="text-xs">
                                {[u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="flex justify-end space-x-3 pt-2">
                <Button type="button" variant="outline" onClick={() => { setIsCalendarDialogOpen(false); setEditingCalendar(null); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCalendarMutation.isPending || updateCalendarMutation.isPending}>
                  {editingCalendar ? 'Save Changes' : 'Create Calendar'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Event Details Dialog */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedEvent.calendarId != null && calendarColorMap[selectedEvent.calendarId] && (
                    <span
                      className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                      style={{ backgroundColor: calendarColorMap[selectedEvent.calendarId] }}
                    />
                  )}
                  <span>{selectedEvent.title}</span>
                  {selectedEvent.source === 'google' && (
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">Google</span>
                  )}
                </div>
                {selectedEvent.source !== 'google' && (
                  <div className="flex items-center space-x-2">
                    <Button size="sm" variant="outline" onClick={() => { setIsEditDialogOpen(true); setSelectedEvent(null); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleDeleteEvent} disabled={deleteEventMutation.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {selectedEvent.source === 'google' && (
                <div className="p-3 bg-blue-50 rounded-md text-sm text-blue-800">
                  This event is from Google Calendar and cannot be edited here.
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-500">Time</p>
                <p className="text-sm">
                  {moment(selectedEvent.start).format('MMM D, YYYY h:mm A')} – {moment(selectedEvent.end).format('MMM D, YYYY h:mm A')}
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
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-500">Type</p>
                  <p className="text-sm capitalize">{selectedEvent.eventType}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">All Day</p>
                  <p className="text-sm">{selectedEvent.isAllDay ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Public</p>
                  <p className="text-sm">{selectedEvent.isPublic ? 'Yes' : 'No'}</p>
                </div>
              </div>
              {selectedEvent.calendarId != null && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Calendar</p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: calendarColorMap[selectedEvent.calendarId] || '#6b7280' }}
                    />
                    <p className="text-sm">
                      {userCalendars.find((c) => c.id === selectedEvent.calendarId)?.name || 'Unknown'}
                    </p>
                  </div>
                </div>
              )}
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
          <EventForm
            form={editForm}
            onSubmit={onEditSubmit}
            isPending={updateEventMutation.isPending}
            onCancel={() => setIsEditDialogOpen(false)}
            userCalendars={userCalendars}
            submitLabel="Update Event"
          />
        </DialogContent>
      </Dialog>

      {/* PDF Modal */}
      <Dialog open={isPdfModalOpen} onOpenChange={handleClosePdfModal}>
        <DialogContent className="max-w-4xl h-[80vh] p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Calendar PDF – {moment(currentDate).format('MMMM YYYY')}</span>
              <div className="flex items-center space-x-2">
                <Button size="sm" variant="outline" onClick={() => { if (pdfUrl) { const w = window.open(pdfUrl, '_blank'); if (w) w.onload = () => w.print(); } }}>
                  <Printer className="h-4 w-4 mr-2" />Print
                </Button>
                <Button size="sm" variant="outline" onClick={() => { if (pdfUrl) { const a = document.createElement('a'); a.href = pdfUrl; a.download = `calendar-${moment(currentDate).format('YYYY-MM')}.pdf`; document.body.appendChild(a); a.click(); document.body.removeChild(a); } }}>
                  <FileDown className="h-4 w-4 mr-2" />Download
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 w-full h-full min-h-[500px] border rounded-lg overflow-hidden bg-gray-100">
            {pdfUrl && (
              <iframe src={pdfUrl} className="w-full h-full border-0" title="Calendar PDF" style={{ minHeight: '500px' }} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CalendarSidebarItem({
  calendar,
  isHidden,
  onToggle,
  onEdit,
  onDelete,
  isOwner,
}: {
  calendar: UserCalendarWithShares;
  isHidden: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isOwner: boolean;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="flex items-center justify-between group rounded px-1 py-0.5 hover:bg-gray-50"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
        <Checkbox
          checked={!isHidden}
          onCheckedChange={onToggle}
          style={{ borderColor: calendar.color, backgroundColor: !isHidden ? calendar.color : 'transparent' }}
          className="flex-shrink-0"
        />
        <span className="text-sm text-gray-700 truncate">{calendar.name}</span>
        {calendar.isPrivate && <Lock className="h-3 w-3 text-gray-400 flex-shrink-0" />}
      </label>
      {isOwner && showActions && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onEdit && (
            <button onClick={onEdit} className="p-0.5 rounded hover:bg-gray-200" title="Edit">
              <Settings className="h-3.5 w-3.5 text-gray-500" />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="p-0.5 rounded hover:bg-red-100" title="Delete">
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EventForm({
  form,
  onSubmit,
  isPending,
  onCancel,
  userCalendars,
  submitLabel,
}: {
  form: UseFormReturn<EventFormData>;
  onSubmit: (data: EventFormData) => void;
  isPending: boolean;
  onCancel: () => void;
  userCalendars: UserCalendarWithShares[];
  submitLabel: string;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Title</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="calendarId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Calendar</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="No calendar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="">No calendar</SelectItem>
                    {userCalendars.map((cal) => (
                      <SelectItem key={cal.id} value={String(cal.id)}>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: cal.color }} />
                          {cal.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="eventType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Location</FormLabel>
                <FormControl><Input {...field} /></FormControl>
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
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Time</FormLabel>
                <FormControl><Input type="time" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Time</FormLabel>
                <FormControl><Input type="time" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="col-span-2 flex items-center space-x-6">
            <FormField
              control={form.control}
              name="isAllDay"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel>All Day</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel>Public Event</FormLabel>
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
