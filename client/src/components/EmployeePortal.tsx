import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  UserCheck,
  ClipboardList,
  FileText,
  CheckCircle,
  AlertCircle,
  Award,
  Calendar,
  Download,
  Clock,
  Timer,
  LogIn,
  LogOut,
  Coffee,
  Play,
  Pause,
  FileCheck,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import OnboardingDocs from './OnboardingDocs';
import type { ChecklistItem } from '@shared/schema';


const DCAA_CERTIFICATION_STATEMENT =
  "I certify that the time recorded for this period is complete, accurate, and represents work I actually performed.";

type HourlyTimesheet = {
  id: number;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  employeeAttested: boolean;
  attestedAt: string | null;
  certifiedByUserId: number | null;
  certificationStatement: string | null;
  certificationVersion: number | null;
};

type WorkSession = {
  id: number;
  employeeId: string;
  chargeCode: string | null;
  projectId: string | null;
  workOrderId: string | null;
  travelerId: string | null;
  startedAt: string;
  endedAt: string | null;
  totalHours: number | null;
  status: string;
  notes: string | null;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDistanceAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatElapsed(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const totalMins = Math.floor(ms / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function SessionStatusBadge({ status }: { status: string }) {
  if (status === 'open')
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 animate-pulse">
        Open
      </Badge>
    );
  if (status === 'closed')
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Closed
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-destructive border-destructive/40">
      Cancelled
    </Badge>
  );
}

interface EmployeePortalProps {
  employeeId: string;
}

type PunchStatus = 'clocked_in' | 'clocked_out' | 'on_break';

interface MyPunchStatus {
  employeeId: number;
  status: PunchStatus;
  lastPunch?: { type: string; punchedAt: string } | null;
  clockedInAt: string | null;
  hoursToday: number;
  openEntry?: Record<string, unknown> | null;
}

function portalFetch(url: string, init?: RequestInit) {
  const token =
    localStorage.getItem('sessionToken') ||
    localStorage.getItem('jwtToken');
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export default function EmployeePortal({ employeeId }: EmployeePortalProps) {
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const validTabs = ['checklist', 'certifications', 'onboarding', 'work-sessions', 'time-clock'];
    return validTabs.includes(tab ?? '') ? (tab as string) : 'checklist';
  });
  const [, setTick] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().substr(0, 10); // YYYY-MM-DD

  // Load daily checklist
  const { data: checklist = [], isLoading: checklistLoading } = useQuery({
    queryKey: ['/api/checklist', employeeId, today],
    queryFn: async () => {
      const response = await fetch(
        `/api/checklist?employeeId=${employeeId}&date=${today}`
      );
      if (!response.ok) throw new Error('Failed to fetch checklist');
      return response.json() as Promise<ChecklistItem[]>;
    },
  });

  const SESSIONS_PAGE_SIZE = 200;

  // Pagination state for the session history list
  const [sessionsPage, setSessionsPage] = useState(0);
  const [allSessions, setAllSessions] = useState<WorkSession[]>([]);
  const [hasMoreSessions, setHasMoreSessions] = useState(false);

  // Load work sessions — one page at a time
  const { data: sessions = [], isLoading: sessionsLoading, isError: sessionsError } = useQuery<WorkSession[]>({
    queryKey: ['/api/labor/sessions', employeeId, sessionsPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        employeeId: String(employeeId),
        offset: String(sessionsPage * SESSIONS_PAGE_SIZE),
      });
      const response = await fetch(`/api/labor/sessions?${params}`);
      if (!response.ok) throw new Error('Failed to fetch work sessions');
      return response.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as WorkSession[] | undefined;
      return data?.some((s) => s.status === 'open') ? 60000 : 30000;
    },
  });

  // Accumulate sessions across pages; reset when page resets to 0
  useEffect(() => {
    if (sessionsPage === 0) {
      setAllSessions(sessions);
    } else {
      setAllSessions((prev) => [...prev, ...sessions]);
    }
    setHasMoreSessions(sessions.length === SESSIONS_PAGE_SIZE);
  }, [sessions, sessionsPage]);

  // Work sessions filter state — initialised from URL search params so filters
  // survive page refreshes and can be shared via URL. Falls back to localStorage
  // for sort order so the preference also survives when no ?sort= param is present.
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'highest-hours'>(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('sort');
    if (s === 'oldest' || s === 'highest-hours') return s;
    const stored = localStorage.getItem('workSessions.sortOrder');
    if (stored === 'oldest' || stored === 'highest-hours') return stored;
    return 'newest';
  });

  useEffect(() => {
    localStorage.setItem('workSessions.sortOrder', sortOrder);
  }, [sortOrder]);


  const [filterChargeCode, setFilterChargeCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('cc') ?? localStorage.getItem('workSessions.filterChargeCode') ?? 'all';
  });
  const [filterDateFrom, setFilterDateFrom] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('from') ?? localStorage.getItem('workSessions.filterDateFrom') ?? '';
  });
  const [filterDateTo, setFilterDateTo] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('to') ?? localStorage.getItem('workSessions.filterDateTo') ?? '';
  });

  useEffect(() => {
    localStorage.setItem('workSessions.filterChargeCode', filterChargeCode);
  }, [filterChargeCode]);

  useEffect(() => {
    localStorage.setItem('workSessions.filterDateFrom', filterDateFrom);
  }, [filterDateFrom]);

  useEffect(() => {
    localStorage.setItem('workSessions.filterDateTo', filterDateTo);
  }, [filterDateTo]);

  // Hourly "My Timesheets" — self-certification
  const [certConfirmedId, setCertConfirmedId] = useState<number | null>(null);

  const {
    data: myTimesheets = [],
    isLoading: timesheetsLoading,
    refetch: refetchTimesheets,
  } = useQuery<HourlyTimesheet[]>({
    queryKey: ['/api/timekeeping/timesheets', 'mine', employeeId],
    queryFn: async () => {
      const params = new URLSearchParams({ employeeId: String(employeeId) });
      const res = await portalFetch(`/api/timekeeping/timesheets?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch timesheets');
      return res.json();
    },
    enabled: activeTab === 'my-timesheets',
  });

  const certifyMutation = useMutation({
    mutationFn: async (timesheetId: number) => {
      const res = await portalFetch(`/api/timekeeping/timesheets/${timesheetId}/attest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificationConfirmed: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? 'Failed to certify timesheet');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Timesheet Certified', description: 'Your certification has been recorded.' });
      setCertConfirmedId(null);
      refetchTimesheets();
    },
    onError: (err: any) => {
      toast({ title: 'Certification failed', description: err?.message ?? 'Unable to certify timesheet.', variant: 'destructive' });
    },
  });

  // Always fetch the open session independently of any filter state so the
  // Active Session card remains visible even when filters would exclude it.
  const { data: openSessions = [] } = useQuery<WorkSession[]>({
    queryKey: ['/api/labor/sessions', employeeId, 'open'],
    queryFn: async () => {
      const params = new URLSearchParams({ employeeId: String(employeeId), status: 'open' });
      const response = await fetch(`/api/labor/sessions?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch open session');
      return response.json();
    },
    refetchInterval: 60000,
  });

  // Keep URL in sync with tab and filter state so they survive refreshes and can be shared.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab && activeTab !== 'checklist') {
      params.set('tab', activeTab);
    } else {
      params.delete('tab');
    }
    if (filterChargeCode && filterChargeCode !== 'all') {
      params.set('cc', filterChargeCode);
    } else {
      params.delete('cc');
    }
    if (filterDateFrom) {
      params.set('from', filterDateFrom);
    } else {
      params.delete('from');
    }
    if (filterDateTo) {
      params.set('to', filterDateTo);
    } else {
      params.delete('to');
    }
    if (sortOrder && sortOrder !== 'newest') {
      params.set('sort', sortOrder);
    } else {
      params.delete('sort');
    }
    const newSearch = params.toString();
    const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`;
    window.history.replaceState(null, '', newUrl);
  }, [activeTab, filterChargeCode, filterDateFrom, filterDateTo, sortOrder]);

  // Punch status — attendance clock (NOT WAD labor attribution)
  const {
    data: punchStatus,
    isLoading: punchStatusLoading,
    error: punchStatusError,
  } = useQuery<MyPunchStatus | null>({
    queryKey: ['/api/timekeeping/punches/my/current'],
    queryFn: async () => {
      const res = await portalFetch('/api/timekeeping/punches/my/current');
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch punch status');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const punchMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await portalFetch('/api/timekeeping/punches/my', {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? 'Failed to record punch');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/punches/my/current'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Punch failed', description: err.message, variant: 'destructive' });
    },
  });

  // Derive active session from the dedicated open-session query so it remains
  // visible even when date or charge code filters exclude it from history.
  const activeSession = openSessions.find((s) => s.status === 'open') ?? null;

  // Keep a displayed copy of the session so we can animate it out rather than
  // blinking it out the instant the query returns empty.
  const [displayedSession, setDisplayedSession] = useState(activeSession);
  const [sessionFadingOut, setSessionFadingOut] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeSession) {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      setSessionFadingOut(false);
      setDisplayedSession(activeSession);
    } else if (displayedSession && !sessionFadingOut) {
      setSessionFadingOut(true);
      fadeTimerRef.current = setTimeout(() => {
        setDisplayedSession(null);
        setSessionFadingOut(false);
        fadeTimerRef.current = null;
      }, 300);
    }
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  // `displayedSession` and `sessionFadingOut` are intentionally excluded: we only
  // want this effect to fire when `activeSession` itself changes, not on every
  // intermediate state update that the effect itself triggers. Including them
  // would cause repeated re-runs and break the one-shot timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession]);

  const toLocalDateStr = (iso: string): string => {
    const d = new Date(iso);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dy}`;
  };

  // Sort client-side based on selected order, then apply charge code / date filters.
  const filteredSessions = [...allSessions].sort((a, b) => {
    if (sortOrder === 'oldest') {
      return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
    }
    if (sortOrder === 'highest-hours') {
      return (b.totalHours ?? 0) - (a.totalHours ?? 0);
    }
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  }).filter((s) => {
    if (filterChargeCode !== 'all' && s.chargeCode !== filterChargeCode) return false;
    const sessionDate = toLocalDateStr(s.startedAt);
    if (filterDateFrom && sessionDate < filterDateFrom) return false;
    if (filterDateTo && sessionDate > filterDateTo) return false;
    return true;
  });

  const hasActiveFilters = filterChargeCode !== 'all' || filterDateFrom || filterDateTo;

  // Unique charge codes from loaded sessions for the filter dropdown
  const uniqueChargeCodes = Array.from(
    new Set(sessions.map((s) => s.chargeCode).filter((c): c is string => c !== null && c !== ''))
  ).sort();

  const clearFilters = () => {
    setFilterChargeCode('all');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  // Tick every second when a work session is open OR when clocked in / on break
  const clockedInOrOnBreak =
    punchStatus?.status === 'clocked_in' || punchStatus?.status === 'on_break';
  useEffect(() => {
    const needsTick =
      (activeSession && activeTab === 'work-sessions') || clockedInOrOnBreak;
    if (!needsTick) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession?.id, activeTab, clockedInOrOnBreak]);

  // Load employee certifications
  const { data: certifications = [], isLoading: certificationsLoading } = useQuery({
    queryKey: ['/api/employees', employeeId, 'certifications'],
    queryFn: async () => {
      const response = await fetch(`/api/employees/${employeeId}/certifications`);
      if (!response.ok) throw new Error('Failed to fetch certifications');
      return response.json();
    },
  });

  // Save checklist mutation
  const saveChecklistMutation = useMutation({
    mutationFn: async (items: ChecklistItem[]) => {
      const response = await fetch('/api/checklist/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          date: today,
          items,
        }),
      });
      if (!response.ok) throw new Error('Failed to save checklist');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/checklist', employeeId, today],
      });
      toast({ title: 'Checklist saved successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Failed to save checklist', variant: 'destructive' });
    },
  });

  // Update checklist item
  const updateItem = (id: number, value: string | boolean) => {
    queryClient.setQueryData(
      ['/api/checklist', employeeId, today],
      (old: ChecklistItem[] | undefined) => {
        if (!old) return [];
        return old.map((item) =>
          item.id === id ? { ...item, value: String(value) } : item
        );
      }
    );
  };

  // Check if all required fields are complete
  const allComplete = checklist.every((item) =>
    item.required ? Boolean(item.value) : true
  );

  const handleSaveChecklist = () => {
    saveChecklistMutation.mutate(checklist);
  };

  const getCompletionStats = () => {
    const completed = checklist.filter((item) => Boolean(item.value)).length;
    const total = checklist.length;
    const required = checklist.filter((item) => item.required).length;
    const requiredCompleted = checklist.filter(
      (item) => item.required && Boolean(item.value)
    ).length;

    return { completed, total, required, requiredCompleted };
  };

  const stats = getCompletionStats();

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employee Portal</h1>
          <p className="text-gray-600 mt-2">Employee ID: {employeeId}</p>
        </div>
        {!punchStatusLoading && (() => {
          if (punchStatus?.status === 'clocked_in' && punchStatus.clockedInAt) {
            return (
              <span className="inline-flex items-center gap-2 rounded-full bg-green-100 text-green-800 border border-green-300 px-4 py-1.5 text-sm font-medium">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Clocked In &middot; {formatElapsed(punchStatus.clockedInAt)}
              </span>
            );
          }
          if (punchStatus?.status === 'on_break' && punchStatus.lastPunch?.punchedAt) {
            return (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-4 py-1.5 text-sm font-medium">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                On Break &middot; {formatElapsed(punchStatus.lastPunch.punchedAt)}
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 text-gray-500 border border-gray-200 px-4 py-1.5 text-sm font-medium">
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              Not Clocked In
            </span>
          );
        })()}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="time-clock" className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Time Clock
            {!punchStatusLoading && (() => {
              if (punchStatus?.status === 'clocked_in') {
                return <span className="h-2 w-2 rounded-full bg-green-500" />;
              }
              if (punchStatus?.status === 'on_break') {
                return <span className="h-2 w-2 rounded-full bg-amber-500" />;
              }
              return null;
            })()}
          </TabsTrigger>
          <TabsTrigger value="checklist" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Daily Checklist
          </TabsTrigger>
          <TabsTrigger value="certifications" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            Certifications
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Onboarding Docs
          </TabsTrigger>
          <TabsTrigger value="work-sessions" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Work Sessions
          </TabsTrigger>
          <TabsTrigger value="my-timesheets" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            My Timesheets
            {myTimesheets.filter(t => !t.employeeAttested && t.status === 'draft').length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs w-4 h-4">
                {myTimesheets.filter(t => !t.employeeAttested && t.status === 'draft').length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Daily Checklist
              </CardTitle>
              <CardDescription>
                Complete your daily tasks and requirements
              </CardDescription>

              {/* Progress Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.completed}/{stats.total}
                  </div>
                  <div className="text-sm text-blue-700">Total Completed</div>
                </div>

                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {stats.requiredCompleted}/{stats.required}
                  </div>
                  <div className="text-sm text-green-700">
                    Required Completed
                  </div>
                </div>

                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {allComplete
                      ? '100%'
                      : Math.round(
                          (stats.requiredCompleted / stats.required) * 100
                        ) + '%'}
                  </div>
                  <div className="text-sm text-yellow-700">Progress</div>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {checklistLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : checklist.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ClipboardList className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No checklist items found for today</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {checklist.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Label className="flex-1 font-medium">
                          {item.label}
                          {item.required && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </Label>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.type === 'checkbox' && (
                          <Checkbox
                            checked={Boolean(item.value)}
                            onCheckedChange={(checked) =>
                              updateItem(item.id, checked)
                            }
                          />
                        )}

                        {item.type === 'dropdown' && (
                          <Select
                            value={item.value || ''}
                            onValueChange={(value) =>
                              updateItem(item.id, value)
                            }
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {((item.options as string[]) || []).map(
                                (option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        )}

                        {item.type === 'text' && (
                          <Input
                            value={item.value || ''}
                            onChange={(e) =>
                              updateItem(item.id, e.target.value)
                            }
                            placeholder="Enter value..."
                            className="w-48"
                          />
                        )}

                        {Boolean(item.value) && (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}

                        {item.required && !Boolean(item.value) && (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-center pt-4">
                    <Button
                      onClick={handleSaveChecklist}
                      disabled={!allComplete || saveChecklistMutation.isPending}
                      className={`px-6 py-3 ${
                        allComplete
                          ? 'bg-blue-500 hover:bg-blue-600'
                          : 'bg-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {saveChecklistMutation.isPending
                        ? 'Saving...'
                        : 'Save Checklist'}
                    </Button>
                  </div>

                  {!allComplete && (
                    <div className="text-center text-sm text-gray-500">
                      Complete all required items to save and enable clock out
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                My Certifications
              </CardTitle>
              <CardDescription>
                View your completed certifications and training records
              </CardDescription>
            </CardHeader>
            <CardContent>
              {certificationsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : certifications.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Award className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No certifications found</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {certifications.map((cert: any) => (
                    <Card key={cert.id} className="border-l-4 border-l-blue-500">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle className="text-lg">
                              {cert.certificationName || 'Certification'}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {cert.certificationDescription || 'No description available'}
                            </CardDescription>
                          </div>
                          <Badge
                            variant={
                              cert.status === 'ACTIVE'
                                ? 'default'
                                : cert.status === 'EXPIRED'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {cert.status || 'N/A'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Date Obtained</p>
                            <p className="font-medium flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {cert.dateObtained
                                ? new Date(cert.dateObtained).toLocaleDateString()
                                : 'N/A'}
                            </p>
                          </div>
                          {cert.expiryDate && (
                            <div>
                              <p className="text-muted-foreground">Expires</p>
                              <p className="font-medium flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(cert.expiryDate).toLocaleDateString()}
                              </p>
                            </div>
                          )}
                          {cert.trainerName && (
                            <div>
                              <p className="text-muted-foreground">Trainer</p>
                              <p className="font-medium">{cert.trainerName}</p>
                            </div>
                          )}
                          {cert.trainingDate && (
                            <div>
                              <p className="text-muted-foreground">Training Date</p>
                              <p className="font-medium">
                                {new Date(cert.trainingDate).toLocaleDateString()}
                              </p>
                            </div>
                          )}
                        </div>

                        {cert.notes && (
                          <div className="mt-3 p-3 bg-muted rounded-md">
                            <p className="text-sm">
                              <strong>Notes:</strong> {cert.notes}
                            </p>
                          </div>
                        )}

                        {cert.uploadedFiles && cert.uploadedFiles.length > 0 && (
                          <div className="mt-3">
                            <p className="text-sm font-medium mb-2">Attached Files:</p>
                            <div className="space-y-2">
                              {cert.uploadedFiles.map((file: any) => (
                                <div
                                  key={file.id}
                                  className="flex items-center justify-between p-2 bg-muted rounded-md text-sm"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    <span>{file.name}</span>
                                    <span className="text-muted-foreground">
                                      ({(file.size / 1024).toFixed(1)} KB)
                                    </span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      window.location.href = `/api/certifications/${cert.id}/download-file/${file.id}`;
                                    }}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onboarding" className="mt-6">
          <OnboardingDocs employeeId={employeeId} />
        </TabsContent>

        <TabsContent value="work-sessions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Work Sessions
              </CardTitle>
              <CardDescription>
                Your clock-in / clock-out history across work orders and travelers
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Active session highlight — rendered independently of filter/history state
                  so the card stays visible even when filters exclude the open session.
                  Uses a fade-out transition when the session closes so it doesn't blink away. */}
              {displayedSession && (
                <div
                  className="p-4 border-b overflow-hidden transition-all duration-300 ease-in-out"
                  style={sessionFadingOut ? { opacity: 0, maxHeight: 0, paddingTop: 0, paddingBottom: 0 } : { opacity: 1, maxHeight: '500px' }}
                >
                  <div className="rounded-lg border border-green-300 bg-green-50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="font-semibold text-green-800">Active Session</span>
                      <span className="text-sm text-green-700 ml-1">
                        — started {formatDistanceAgo(displayedSession.startedAt)}
                      </span>
                      <span className="ml-auto font-mono font-bold text-green-800 text-base">
                        {formatElapsed(displayedSession.startedAt)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm text-green-900">
                      {displayedSession.chargeCode && (
                        <div>
                          <span className="text-green-700">Charge Code: </span>
                          <span className="font-mono font-bold">{displayedSession.chargeCode}</span>
                        </div>
                      )}
                      {displayedSession.workOrderId && (
                        <div>
                          <span className="text-green-700">Work Order: </span>
                          {displayedSession.workOrderId}
                        </div>
                      )}
                      {displayedSession.travelerId && (
                        <div>
                          <span className="text-green-700">Traveler: </span>
                          {displayedSession.travelerId}
                        </div>
                      )}
                      {displayedSession.projectId && (
                        <div>
                          <span className="text-green-700">Project: </span>
                          {displayedSession.projectId}
                        </div>
                      )}
                      <div>
                        <span className="text-green-700">Started: </span>
                        {formatDateTime(displayedSession.startedAt)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* History section — loading / error / empty / filter bar + table */}
              {sessionsLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : sessionsError ? (
                <div className="text-center py-12 text-destructive">
                  <AlertCircle className="h-10 w-10 mx-auto mb-3" />
                  <p>Failed to load work sessions. Please try again later.</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  {hasActiveFilters ? (
                    <>
                      <p>No sessions match the current filters.</p>
                      <button
                        onClick={clearFilters}
                        className="mt-2 text-sm text-primary underline underline-offset-2"
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    <p>No work sessions found yet.</p>
                  )}
                </div>
              ) : (
                <>
                  {/* Filter bar */}
                  <div className="p-4 border-b bg-muted/30">
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs text-muted-foreground">Charge Code</Label>
                        <Select
                          value={filterChargeCode}
                          onValueChange={setFilterChargeCode}
                        >
                          <SelectTrigger className="h-8 text-sm bg-background">
                            <SelectValue placeholder="All codes" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All codes</SelectItem>
                            {uniqueChargeCodes.map((code) => (
                              <SelectItem key={code} value={code}>
                                {code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">From</Label>
                        <Input
                          type="date"
                          value={filterDateFrom}
                          onChange={(e) => setFilterDateFrom(e.target.value)}
                          className="h-8 text-sm w-36 bg-background"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">To</Label>
                        <Input
                          type="date"
                          value={filterDateTo}
                          onChange={(e) => setFilterDateTo(e.target.value)}
                          className="h-8 text-sm w-36 bg-background"
                        />
                      </div>

                      <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs text-muted-foreground">Sort by</Label>
                        <Select
                          value={sortOrder}
                          onValueChange={(v) => setSortOrder(v as 'newest' | 'oldest' | 'highest-hours')}
                        >
                          <SelectTrigger className="h-8 text-sm bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="newest">Newest first</SelectItem>
                            <SelectItem value="oldest">Oldest first</SelectItem>
                            <SelectItem value="highest-hours">Highest hours</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {hasActiveFilters && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearFilters}
                          className="h-8 text-sm text-muted-foreground hover:text-foreground"
                        >
                          Clear filters
                        </Button>
                      )}

                      <span className="ml-auto self-end text-xs text-muted-foreground">
                        {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Session history table */}
                  {filteredSessions.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Clock className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p>No sessions match the current filters.</p>
                    </div>
                  ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Charge Code</TableHead>
                        <TableHead>Work Order / Traveler</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Ended</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSessions.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono font-bold">
                            {s.chargeCode ?? ''}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm space-y-0.5">
                              {s.workOrderId && (
                                <div>
                                  <span className="text-muted-foreground text-xs">WO: </span>
                                  {s.workOrderId}
                                </div>
                              )}
                              {s.travelerId && (
                                <div>
                                  <span className="text-muted-foreground text-xs">Traveler: </span>
                                  {s.travelerId}
                                </div>
                              )}
                              {s.projectId && (
                                <div>
                                  <span className="text-muted-foreground text-xs">Project: </span>
                                  {s.projectId}
                                </div>
                              )}
                              {!s.workOrderId && !s.travelerId && !s.projectId && (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {formatDateTime(s.startedAt)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {s.endedAt ? formatDateTime(s.endedAt) : '—'}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {s.totalHours != null ? `${s.totalHours.toFixed(2)}h` : '—'}
                          </TableCell>
                          <TableCell>
                            <SessionStatusBadge status={s.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  )}
                  {hasMoreSessions && (
                    <div className="mt-4 flex justify-center">
                      <Button
                        variant="outline"
                        onClick={() => setSessionsPage((p) => p + 1)}
                        disabled={sessionsLoading}
                      >
                        {sessionsLoading ? 'Loading…' : 'Load More'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="time-clock" className="mt-6">
          <div className="space-y-4">
            {/* Attendance / WAD separation notice */}
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
              <span>
                <strong>Attendance only.</strong> This records when you start and end your workday.
                Project/job labor attribution is tracked separately in the <strong>Work Sessions</strong> tab.
              </span>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-5 w-5" />
                  Time Clock
                </CardTitle>
                <CardDescription>Clock in and out to record your attendance</CardDescription>
              </CardHeader>
              <CardContent>
                {punchStatusLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
                ) : punchStatusError ? (
                  <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>Could not load time clock status. Please refresh and try again.</span>
                  </div>
                ) : punchStatus === null ? (
                  <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <span>
                      Your employee record is not yet enrolled in timekeeping.
                      Please contact your supervisor or HR to get set up.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Current status banner */}
                    <div className={`rounded-xl p-6 text-center ${
                      punchStatus.status === 'clocked_in'
                        ? 'bg-green-50 border border-green-200'
                        : punchStatus.status === 'on_break'
                        ? 'bg-amber-50 border border-amber-200'
                        : 'bg-gray-50 border border-gray-200'
                    }`}>
                      <div className={`inline-flex items-center gap-2 text-2xl font-bold mb-2 ${
                        punchStatus.status === 'clocked_in'
                          ? 'text-green-700'
                          : punchStatus.status === 'on_break'
                          ? 'text-amber-700'
                          : 'text-gray-600'
                      }`}>
                        {punchStatus.status === 'clocked_in' && <><Play className="h-6 w-6" /> Clocked In</>}
                        {punchStatus.status === 'on_break' && <><Pause className="h-6 w-6" /> On Break</>}
                        {punchStatus.status === 'clocked_out' && <><LogOut className="h-6 w-6" /> Clocked Out</>}
                      </div>

                      {punchStatus.status !== 'clocked_out' && punchStatus.clockedInAt && (
                        <p className="text-sm text-muted-foreground">
                          Since {new Date(punchStatus.clockedInAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          {' · '}
                          {punchStatus.hoursToday.toFixed(2)} hrs today
                        </p>
                      )}
                      {punchStatus.status === 'clocked_out' && punchStatus.hoursToday > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {punchStatus.hoursToday.toFixed(2)} hrs recorded today
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3 justify-center">
                      {punchStatus.status === 'clocked_out' && (
                        <Button
                          size="lg"
                          className="bg-green-600 hover:bg-green-700 text-white gap-2 px-8"
                          disabled={punchMutation.isPending}
                          onClick={() => punchMutation.mutate('clock_in')}
                        >
                          <LogIn className="h-5 w-5" />
                          {punchMutation.isPending ? 'Recording…' : 'Clock In'}
                        </Button>
                      )}

                      {punchStatus.status === 'clocked_in' && (
                        <>
                          <Button
                            size="lg"
                            variant="outline"
                            className="border-amber-400 text-amber-700 hover:bg-amber-50 gap-2 px-6"
                            disabled={punchMutation.isPending}
                            onClick={() => punchMutation.mutate('break_start')}
                          >
                            <Coffee className="h-5 w-5" />
                            {punchMutation.isPending ? 'Recording…' : 'Start Break'}
                          </Button>
                          <Button
                            size="lg"
                            variant="outline"
                            className="border-red-400 text-red-700 hover:bg-red-50 gap-2 px-6"
                            disabled={punchMutation.isPending}
                            onClick={() => punchMutation.mutate('clock_out')}
                          >
                            <LogOut className="h-5 w-5" />
                            {punchMutation.isPending ? 'Recording…' : 'Clock Out'}
                          </Button>
                        </>
                      )}

                      {punchStatus.status === 'on_break' && (
                        <Button
                          size="lg"
                          className="bg-amber-600 hover:bg-amber-700 text-white gap-2 px-8"
                          disabled={punchMutation.isPending}
                          onClick={() => punchMutation.mutate('break_end')}
                        >
                          <Play className="h-5 w-5" />
                          {punchMutation.isPending ? 'Recording…' : 'End Break'}
                        </Button>
                      )}
                    </div>

                    {/* Last punch info */}
                    {punchStatus.lastPunch && (
                      <div className="text-center text-sm text-muted-foreground border-t pt-4">
                        Last punch:{' '}
                        <span className="font-medium capitalize">
                          {punchStatus.lastPunch.type.replace(/_/g, ' ')}
                        </span>
                        {' at '}
                        {new Date(punchStatus.lastPunch.punchedAt).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {', '}
                        {new Date(punchStatus.lastPunch.punchedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── My Timesheets (hourly self-certification) ───────────────────── */}
        <TabsContent value="my-timesheets" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                My Timesheets
              </CardTitle>
              <CardDescription>
                Review and certify your recorded hours each pay period. DCAA regulations require you to personally certify that your timesheets are complete and accurate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timesheetsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  Loading timesheets…
                </div>
              ) : myTimesheets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
                  <FileCheck className="h-8 w-8 opacity-40" />
                  No timesheets found for your employee record.
                </div>
              ) : (
                <div className="space-y-6">
                  {myTimesheets.map((ts) => {
                    const needsCert = !ts.employeeAttested && ts.status === 'draft';
                    const isChecked = certConfirmedId === ts.id;
                    return (
                      <div key={ts.id} className={`rounded-lg border p-4 ${needsCert ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div>
                            <p className="font-semibold text-sm text-gray-900">
                              Pay Period: {ts.periodStart} – {ts.periodEnd}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {ts.totalHours.toFixed(2)} total hrs &nbsp;·&nbsp; {ts.regularHours.toFixed(2)} regular &nbsp;·&nbsp; {ts.overtimeHours.toFixed(2)} OT
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {ts.employeeAttested ? (
                              <Badge className="bg-green-100 text-green-800 border-green-200 flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" />
                                Certified
                              </Badge>
                            ) : ts.status === 'draft' ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                                Needs Certification
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground capitalize">
                                {ts.status}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {ts.employeeAttested && ts.certificationStatement && (
                          <div className="mt-2 rounded bg-green-50 border border-green-200 p-3 text-xs text-green-800">
                            <p className="font-semibold mb-1">Certification recorded</p>
                            <p className="italic">"{ts.certificationStatement}"</p>
                            {ts.attestedAt && (
                              <p className="mt-1 text-green-700">
                                Certified on {new Date(ts.attestedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        )}

                        {needsCert && (
                          <div className="mt-3 rounded-lg border border-amber-400 bg-amber-50 p-4 space-y-3">
                            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                              DCAA Certification Required
                            </p>
                            <p className="text-sm text-gray-700 italic leading-relaxed border-l-4 border-amber-400 pl-3">
                              "{DCAA_CERTIFICATION_STATEMENT}"
                            </p>
                            <label className="flex items-start gap-3 cursor-pointer select-none">
                              <Checkbox
                                id={`cert-${ts.id}`}
                                checked={isChecked}
                                onCheckedChange={(checked) => setCertConfirmedId(checked ? ts.id : null)}
                                className="mt-0.5 border-amber-500 data-[state=checked]:bg-amber-500"
                              />
                              <span className="text-sm text-gray-800 font-medium leading-snug">
                                I have read the above statement and certify that it is true and accurate for this pay period.
                              </span>
                            </label>
                            <Button
                              size="sm"
                              disabled={!isChecked || certifyMutation.isPending}
                              onClick={() => certifyMutation.mutate(ts.id)}
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              {certifyMutation.isPending && certConfirmedId === ts.id ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                  Certifying…
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <ShieldCheck className="h-4 w-4" />
                                  Submit Certification
                                </span>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
