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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  ClipboardList,
  FileText,
  CheckCircle,
  AlertCircle,
  Award,
  Calendar,
  CalendarOff,
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
  Receipt,
  Upload,
  Send,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import OnboardingDocs from './OnboardingDocs';
import type { ChecklistItem } from '@shared/schema';
import { Textarea } from '@/components/ui/textarea';


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

type RunningTimesheetSession = {
  id: number;
  clockIn: string;
  clockOut: string | null;
  laborClass: string | null;
  source: string;
  chargeCode: string | null;
  travelerId: string | null;
  productionWorkOrderId: string | null;
  hours: number;
  isOpen: boolean;
};

type RunningTimesheetDay = {
  date: string;
  workHours: number;
  breakHours: number;
  regularHours: number;
  overtimeHours: number;
  hasOpenSession: boolean;
  sessions: RunningTimesheetSession[];
};

type RunningTimesheet = {
  employeeId: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  breakHours: number;
  hasOpenSession: boolean;
  persistedTimesheet: HourlyTimesheet | null;
  days: RunningTimesheetDay[];
};

type DailySignOffStatus = {
  date: string;
  hasActivity: boolean;
  isCertified: boolean;
  timesheetStatus: string | null;
  certifiedAt: string | null;
};

type TimeOffRequest = {
  id: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  leaveType: string;
  status: string;
  requestUnit?: string | null;
  requestedHours?: number | null;
  employeeNote?: string | null;
  adminNote?: string | null;
  supervisorNote?: string | null;
  hrNote?: string | null;
  vpNote?: string | null;
  createdAt?: string | Date | null;
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

type CurrentUser = {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  role: string;
  employeeId: number | null;
};

type ExpenseForm = {
  transactionType: 'EMPLOYEE_REIMBURSEMENT' | 'OWNER_EXPENSE';
  transactionDate: string;
  paidByName: string;
  vendorName: string;
  amount: string;
  paymentMethod: string;
  businessPurpose: string;
  projectId: string;
  contractNumber: string;
  directIndirect: 'DIRECT' | 'INDIRECT' | 'UNASSIGNED';
  costCategory: string;
  notes: string;
};

function makeExpenseForm(): ExpenseForm {
  return {
    transactionType: 'EMPLOYEE_REIMBURSEMENT',
    transactionDate: new Date().toISOString().slice(0, 10),
    paidByName: '',
    vendorName: '',
    amount: '',
    paymentMethod: '',
    businessPurpose: '',
    projectId: '',
    contractNumber: '',
    directIndirect: 'DIRECT',
    costCategory: 'MATERIALS',
    notes: '',
  };
}

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

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

const TIME_OFF_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Supervisor',
  pending_supervisor: 'Pending Supervisor',
  pending_hr: 'Pending HR',
  pending_vp: 'Pending VP',
  approved: 'Approved',
  rejected: 'Rejected',
  denied: 'Denied',
  cancelled: 'Cancelled',
};

function TimeOffStatusBadge({ status }: { status: string }) {
  const label = TIME_OFF_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
  const className =
    status.startsWith('pending')
      ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
      : status === 'approved'
      ? 'bg-green-100 text-green-800 border-green-200'
      : status === 'rejected' || status === 'denied'
      ? 'bg-red-100 text-red-800 border-red-200'
      : status === 'cancelled'
      ? 'bg-gray-100 text-gray-700 border-gray-200'
      : 'bg-gray-100 text-gray-700 border-gray-200';
  return <Badge variant="outline" className={`capitalize ${className}`}>{label}</Badge>;
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

type ChargeCode = {
  id: number;
  code: string;
  description: string | null;
  type: string;
};

type PunchMutationInput = {
  type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  costCode?: string;
  dailyCertificationConfirmed?: boolean;
};

function portalFetch(url: string, init?: Parameters<typeof fetch>[1]) {
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

function portalFormFetch(url: string, formData: FormData) {
  const token =
    localStorage.getItem('sessionToken') ||
    localStorage.getItem('jwtToken');
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
}

export default function EmployeePortal({ employeeId }: EmployeePortalProps) {
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const validTabs = ['checklist', 'certifications', 'onboarding', 'work-sessions', 'time-clock', 'my-timesheets', 'time-off', 'expenses'];
    return validTabs.includes(tab ?? '') ? (tab as string) : 'checklist';
  });
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(() => makeExpenseForm());
  const [expenseFiles, setExpenseFiles] = useState<File[]>([]);
  const [selectedClockInChargeCode, setSelectedClockInChargeCode] = useState('none');
  const [dailyPunchOutConfirmed, setDailyPunchOutConfirmed] = useState(false);
  const [showDailyPunchOutCertification, setShowDailyPunchOutCertification] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({
    startDate: '',
    endDate: '',
    requestUnit: 'full_day',
    requestedHours: '',
    employeeNote: '',
  });
  const [, setTick] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().substr(0, 10); // YYYY-MM-DD

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ['/api/auth/session'],
    queryFn: async () => {
      const response = await portalFetch('/api/auth/session');
      if (!response.ok) throw new Error('Failed to fetch session');
      return response.json();
    },
  });

  const canSubmitOwnerExpense =
    currentUser?.role === 'OWNER' || currentUser?.role === 'ADMIN';

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

  // Hourly timesheets: daily sign-off plus pay-period self-certification
  const [certReviewId, setCertReviewId] = useState<number | null>(null);
  const [certConfirmedId, setCertConfirmedId] = useState<number | null>(null);
  const [dailySignOffDate, setDailySignOffDate] = useState(today);

  const {
    data: myTimesheets = [],
    isLoading: timesheetsLoading,
    refetch: refetchTimesheets,
  } = useQuery<HourlyTimesheet[]>({
    queryKey: ['/api/timekeeping/timesheets', 'mine'],
    queryFn: async () => {
      const res = await portalFetch('/api/timekeeping/timesheets/my');
      if (!res.ok) throw new Error('Failed to fetch timesheets');
      return res.json();
    },
    enabled: activeTab === 'my-timesheets',
  });

  const {
    data: runningTimesheet,
    isLoading: runningTimesheetLoading,
  } = useQuery<RunningTimesheet>({
    queryKey: ['/api/timekeeping/timesheets', 'mine', 'running'],
    queryFn: async () => {
      const res = await portalFetch('/api/timekeeping/timesheets/my/running');
      if (!res.ok) throw new Error('Failed to fetch running timesheet');
      return res.json();
    },
    enabled: activeTab === 'my-timesheets',
    refetchInterval: 30000,
  });

  const {
    data: dailySignOffStatus,
    isLoading: dailySignOffLoading,
  } = useQuery<DailySignOffStatus>({
    queryKey: ['/api/timekeeping/daily-sign-off-status', dailySignOffDate],
    queryFn: async () => {
      const res = await portalFetch(`/api/timekeeping/daily-sign-off-status?date=${dailySignOffDate}`);
      if (!res.ok) throw new Error('Failed to fetch daily sign-off status');
      return res.json();
    },
    enabled: activeTab === 'my-timesheets' && !!dailySignOffDate,
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
      setCertReviewId(null);
      setCertConfirmedId(null);
      refetchTimesheets();
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets', 'mine', 'running'] });
    },
    onError: (err: any) => {
      toast({ title: 'Certification failed', description: err?.message ?? 'Unable to certify timesheet.', variant: 'destructive' });
    },
  });

  const prepareTimesheetMutation = useMutation({
    mutationFn: async () => {
      if (!runningTimesheet) throw new Error('Current pay period is not loaded yet.');
      const res = await portalFetch('/api/timekeeping/timesheets/my/prepare', {
        method: 'POST',
        body: JSON.stringify({
          periodStart: runningTimesheet.periodStart,
          periodEnd: runningTimesheet.periodEnd,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? 'Failed to prepare timesheet');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Timesheet ready', description: 'Your pay-period timesheet is ready for certification.' });
      refetchTimesheets();
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets', 'mine', 'running'] });
    },
    onError: (err: any) => {
      toast({ title: 'Could not prepare timesheet', description: err?.message ?? 'Please try again.', variant: 'destructive' });
    },
  });

  const dailySignOffMutation = useMutation({
    mutationFn: async () => {
      const res = await portalFetch('/api/timekeeping/daily-sign-off', {
        method: 'POST',
        body: JSON.stringify({ date: dailySignOffDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? 'Failed to record daily sign-off');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Daily sign-off recorded', description: 'Your daily certification has been saved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/daily-sign-off-status', dailySignOffDate] });
    },
    onError: (err: any) => {
      toast({ title: 'Daily sign-off failed', description: err?.message ?? 'Please try again.', variant: 'destructive' });
    },
  });

  const {
    data: timeOffRequests = [],
    isLoading: timeOffLoading,
  } = useQuery<TimeOffRequest[]>({
    queryKey: ['/api/timekeeping/time-off/my'],
    queryFn: async () => {
      const res = await portalFetch('/api/timekeeping/time-off/my');
      if (!res.ok) throw new Error('Failed to fetch time-off requests');
      return res.json();
    },
    enabled: !!currentUser?.employeeId,
  });

  const submitTimeOffMutation = useMutation({
    mutationFn: async () => {
      if (!timeOffForm.startDate || !timeOffForm.endDate) {
        throw new Error('Start and end dates are required.');
      }
      if (timeOffForm.startDate > timeOffForm.endDate) {
        throw new Error('Start date must not be after end date.');
      }
      if (
        timeOffForm.requestUnit === 'hourly' &&
        (!timeOffForm.requestedHours || Number(timeOffForm.requestedHours) <= 0)
      ) {
        throw new Error('Hours requested is required for hourly PTO.');
      }

      const payload = {
        startDate: timeOffForm.startDate,
        endDate: timeOffForm.endDate,
        leaveType: 'pto',
        requestUnit: timeOffForm.requestUnit,
        requestedHours:
          timeOffForm.requestUnit === 'hourly'
            ? Number(timeOffForm.requestedHours)
            : undefined,
        employeeNote: timeOffForm.employeeNote.trim() || undefined,
      };

      const res = await portalFetch('/api/timekeeping/time-off/my', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error ?? 'Failed to submit time-off request');
      return json;
    },
    onSuccess: () => {
      toast({ title: 'PTO submitted', description: 'Your request is now in the PTO approval queue.' });
      setTimeOffForm({
        startDate: '',
        endDate: '',
        requestUnit: 'full_day',
        requestedHours: '',
        employeeNote: '',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/time-off/my'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/time-off'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/pto-command-center/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/pto-command-center/pipeline'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'PTO submission failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const cancelTimeOffMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await portalFetch(`/api/timekeeping/time-off/${requestId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelled by employee from portal' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error ?? 'Failed to cancel request');
      return json;
    },
    onSuccess: () => {
      toast({ title: 'PTO cancelled', description: 'Your pending request has been cancelled.' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/time-off/my'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/time-off'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/pto-command-center/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/pto-command-center/pipeline'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Cancel failed', description: error.message, variant: 'destructive' });
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

  const { data: clockInChargeCodes = [], isLoading: chargeCodesLoading } = useQuery<ChargeCode[]>({
    queryKey: ['/api/timekeeping/kiosk/charge-codes'],
    queryFn: async () => {
      const res = await portalFetch('/api/timekeeping/kiosk/charge-codes');
      if (!res.ok) throw new Error('Failed to fetch charge codes');
      return res.json();
    },
    enabled: activeTab === 'time-clock',
    staleTime: 5 * 60 * 1000,
  });

  const punchMutation = useMutation({
    mutationFn: async ({ type, costCode, dailyCertificationConfirmed }: PunchMutationInput) => {
      const res = await portalFetch('/api/timekeeping/punches/my', {
        method: 'POST',
        body: JSON.stringify({
          type,
          ...(costCode ? { costCode } : {}),
          ...(type === 'clock_out' ? { dailyCertificationConfirmed } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(
          new Error((body as any).error ?? 'Failed to record punch'),
          { punchRecorded: (body as any).punchRecorded === true },
        );
      }
      return res.json();
    },
    onSuccess: () => {
      setSelectedClockInChargeCode('none');
      setDailyPunchOutConfirmed(false);
      setShowDailyPunchOutCertification(false);
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/punches/my/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets', 'mine', 'running'] });
    },
    onError: (err: Error) => {
      if ((err as Error & { punchRecorded?: boolean }).punchRecorded) {
        toast({
          title: 'Clock out recorded',
          description: 'Your punch was saved, but the daily certification could not be recorded. Please review your timesheet.',
        });
        setDailyPunchOutConfirmed(false);
        setShowDailyPunchOutCertification(false);
        queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/punches/my/current'] });
        queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets', 'mine', 'running'] });
        return;
      }
      toast({ title: 'Punch failed', description: err.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (punchStatus?.status !== 'clocked_in') {
      setDailyPunchOutConfirmed(false);
      setShowDailyPunchOutCertification(false);
    }
  }, [punchStatus?.status]);

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
  const needsCertificationTimesheets = myTimesheets.filter((t) => !t.employeeAttested && t.status === 'draft');
  const historicalTimesheets = myTimesheets.filter((t) => t.employeeAttested || t.status !== 'draft');
  const pendingTimeOffCount = timeOffRequests.filter((r) => r.status.startsWith('pending')).length;

  const renderTimesheetCard = (ts: HourlyTimesheet) => {
    const needsCert = !ts.employeeAttested && ts.status === 'draft';
    const isReviewingCert = certReviewId === ts.id;
    const isChecked = certConfirmedId === ts.id;
    return (
      <div key={ts.id} className={`rounded-lg border p-4 ${needsCert ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <p className="font-semibold text-sm text-gray-900">
              Pay Period: {ts.periodStart} - {ts.periodEnd}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ts.totalHours.toFixed(2)} total hrs &nbsp;|&nbsp; {ts.regularHours.toFixed(2)} regular &nbsp;|&nbsp; {ts.overtimeHours.toFixed(2)} OT
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
            {!isReviewingCert ? (
              <Button
                size="sm"
                onClick={() => {
                  setCertReviewId(ts.id);
                  setCertConfirmedId(null);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                Review Certification
              </Button>
            ) : (
              <>
                <p className="text-xs font-semibold text-amber-900 uppercase">
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
                      Certifying...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Submit Certification
                    </span>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // Unique charge codes from loaded sessions for the filter dropdown
  const uniqueChargeCodes = Array.from(
    new Set(sessions.map((s) => s.chargeCode).filter((c): c is string => c !== null && c !== ''))
  ).sort();

  const chargeCodesByType = clockInChargeCodes.reduce<Record<string, ChargeCode[]>>((acc, code) => {
    const type = code.type || 'OTHER';
    if (!acc[type]) acc[type] = [];
    acc[type].push(code);
    return acc;
  }, {});

  const chargeCodeTypeLabels: Record<string, string> = {
    DIRECT: 'Direct Labor',
    OVERHEAD: 'Overhead',
    G_AND_A: 'G&A',
    IR_AND_D: 'IR&D',
    B_AND_P: 'B&P',
    INDIRECT: 'Indirect',
    OTHER: 'Other',
  };

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
    onError: (_error) => {
      toast({ title: 'Failed to save checklist', variant: 'destructive' });
    },
  });

  const expenseMutation = useMutation({
    mutationFn: async () => {
      if (
        !expenseForm.vendorName.trim() ||
        !expenseForm.amount ||
        !expenseForm.businessPurpose.trim()
      ) {
        throw new Error('Vendor, amount, and business purpose are required.');
      }
      if (expenseForm.transactionType === 'OWNER_EXPENSE' && !canSubmitOwnerExpense) {
        throw new Error('Only owners and admins can submit owner-paid expense documentation.');
      }

      const payload = new FormData();
      Object.entries(expenseForm).forEach(([key, value]) => {
        payload.append(key, String(value ?? ''));
      });
      expenseFiles.forEach((file) => payload.append('files', file));

      const response = await portalFormFetch('/api/accounting-control/portal', payload);
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Failed to submit reimbursement request');
      }
      return response.json();
    },
    onSuccess: (created: { transactionNumber?: string }) => {
      toast({
        title: 'Request submitted',
        description: created.transactionNumber
          ? `${created.transactionNumber} is now in the accounting review queue.`
          : 'Your request is now in the accounting review queue.',
      });
      setExpenseForm(makeExpenseForm());
      setExpenseFiles([]);
    },
    onError: (error: Error) => {
      toast({
        title: 'Submit failed',
        description: error.message,
        variant: 'destructive',
      });
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
        <TabsList className="grid w-full grid-cols-8">
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
            Training Certs
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Onboarding Docs
          </TabsTrigger>
          <TabsTrigger value="work-sessions" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Work Order Sessions
          </TabsTrigger>
          <TabsTrigger value="my-timesheets" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Timesheets
            {needsCertificationTimesheets.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs w-4 h-4">
                {needsCertificationTimesheets.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="time-off" className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4" />
            Time Off
            {pendingTimeOffCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-yellow-500 text-white text-xs w-4 h-4">
                {pendingTimeOffCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Expenses
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

        <TabsContent value="time-off" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarOff className="h-5 w-5" />
                  Request Time Off
                </CardTitle>
                <CardDescription>
                  Submit PTO requests into the same approval queue used by HR, supervisors, and payroll.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Request Type</Label>
                  <Select
                    value={timeOffForm.requestUnit}
                    onValueChange={(value) => setTimeOffForm((prev) => ({
                      ...prev,
                      requestUnit: value,
                      requestedHours: value === 'hourly' ? prev.requestedHours : '',
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_day">Full Day</SelectItem>
                      <SelectItem value="half_day">Half Day</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="multi_day">Multi-Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      min={today}
                      value={timeOffForm.startDate}
                      onChange={(event) => setTimeOffForm((prev) => ({
                        ...prev,
                        startDate: event.target.value,
                        endDate:
                          prev.requestUnit === 'multi_day'
                            ? prev.endDate
                            : event.target.value,
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{timeOffForm.requestUnit === 'multi_day' ? 'End Date' : 'Date'}</Label>
                    <Input
                      type="date"
                      min={timeOffForm.startDate || today}
                      value={timeOffForm.endDate}
                      onChange={(event) => setTimeOffForm((prev) => ({
                        ...prev,
                        endDate: event.target.value,
                      }))}
                    />
                  </div>
                </div>

                {timeOffForm.requestUnit === 'hourly' && (
                  <div className="space-y-2">
                    <Label>Hours Requested</Label>
                    <Input
                      type="number"
                      min="0.5"
                      max="8"
                      step="0.5"
                      placeholder="e.g. 2"
                      value={timeOffForm.requestedHours}
                      onChange={(event) => setTimeOffForm((prev) => ({
                        ...prev,
                        requestedHours: event.target.value,
                      }))}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Note <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    rows={3}
                    className="resize-none"
                    placeholder="Anything your supervisor or HR should know..."
                    value={timeOffForm.employeeNote}
                    onChange={(event) => setTimeOffForm((prev) => ({
                      ...prev,
                      employeeNote: event.target.value,
                    }))}
                  />
                </div>

                <Button
                  className="w-full gap-2"
                  disabled={
                    submitTimeOffMutation.isPending ||
                    !timeOffForm.startDate ||
                    !timeOffForm.endDate ||
                    timeOffForm.startDate > timeOffForm.endDate ||
                    (timeOffForm.requestUnit === 'hourly' && (!timeOffForm.requestedHours || Number(timeOffForm.requestedHours) <= 0))
                  }
                  onClick={() => submitTimeOffMutation.mutate()}
                >
                  {submitTimeOffMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit PTO Request
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  My Time-Off Requests
                </CardTitle>
                <CardDescription>
                  Track PTO status as it moves through supervisor, HR, and VP review.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {timeOffLoading ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading requests...
                  </div>
                ) : timeOffRequests.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <CalendarOff className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p>No PTO requests submitted yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                    {timeOffRequests.map((request) => {
                      const canCancel = ['pending', 'pending_supervisor', 'pending_hr', 'pending_vp'].includes(request.status);
                      const denialNote = request.supervisorNote || request.hrNote || request.vpNote || request.adminNote;
                      return (
                        <div key={request.id} className="rounded-lg border bg-white p-4 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-sm text-gray-900">
                                {request.startDate} - {request.endDate}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {request.leaveType.toUpperCase()}
                                {request.requestUnit && request.requestUnit !== 'full_day' && ` | ${request.requestUnit.replace('_', ' ')}`}
                                {request.requestedHours != null && ` | ${request.requestedHours}h`}
                              </p>
                            </div>
                            <TimeOffStatusBadge status={request.status} />
                          </div>

                          {request.employeeNote && (
                            <p className="text-xs text-gray-600 border-l-2 pl-2">{request.employeeNote}</p>
                          )}

                          {(request.status === 'rejected' || request.status === 'denied') && denialNote && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
                              {denialNote}
                            </p>
                          )}

                          {canCancel && (
                            <div className="pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-700 border-red-200 hover:bg-red-50"
                                disabled={cancelTimeOffMutation.isPending}
                                onClick={() => cancelTimeOffMutation.mutate(request.id)}
                              >
                                Cancel Request
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
          </div>
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Expense Reimbursement Request
              </CardTitle>
              <CardDescription>
                Submit employee reimbursement requests or, for owners, owner-paid expense documentation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={expenseForm.transactionType}
                    onValueChange={(transactionType: 'EMPLOYEE_REIMBURSEMENT' | 'OWNER_EXPENSE') =>
                      setExpenseForm((prev) => ({ ...prev, transactionType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMPLOYEE_REIMBURSEMENT">Employee Reimbursement</SelectItem>
                      {canSubmitOwnerExpense && (
                        <SelectItem value="OWNER_EXPENSE">Owner-Paid Expense Documentation</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={expenseForm.transactionDate}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, transactionDate: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Paid By</Label>
                  <Input
                    value={expenseForm.paidByName}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, paidByName: event.target.value }))}
                    placeholder={currentUser ? `${currentUser.firstName ?? ''} ${currentUser.lastName ?? ''}`.trim() || currentUser.username : 'Your name'}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Input
                    value={expenseForm.vendorName}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, vendorName: event.target.value }))}
                    placeholder="Vendor or merchant"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseForm.amount}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Input
                    value={expenseForm.paymentMethod}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                    placeholder="Personal card, cash, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Project / Job</Label>
                  <Input
                    value={expenseForm.projectId}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, projectId: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contract</Label>
                  <Input
                    value={expenseForm.contractNumber}
                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, contractNumber: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Direct / Indirect</Label>
                  <Select
                    value={expenseForm.directIndirect}
                    onValueChange={(directIndirect: 'DIRECT' | 'INDIRECT' | 'UNASSIGNED') =>
                      setExpenseForm((prev) => ({ ...prev, directIndirect }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DIRECT">Direct</SelectItem>
                      <SelectItem value="INDIRECT">Indirect</SelectItem>
                      <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cost Category</Label>
                  <Select
                    value={expenseForm.costCategory}
                    onValueChange={(costCategory) => setExpenseForm((prev) => ({ ...prev, costCategory }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MATERIALS">Materials</SelectItem>
                      <SelectItem value="SUPPLIES">Supplies</SelectItem>
                      <SelectItem value="TRAVEL">Travel</SelectItem>
                      <SelectItem value="TOOLS">Tools</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Business Purpose</Label>
                <Textarea
                  rows={3}
                  value={expenseForm.businessPurpose}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, businessPurpose: event.target.value }))}
                  placeholder="Explain why this expense was for company business"
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={expenseForm.notes}
                  onChange={(event) => setExpenseForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>

              <div className="rounded-md border p-4 space-y-3">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Receipts / Documents
                </Label>
                <Input
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  capture="environment"
                  onChange={(event) => setExpenseFiles(Array.from(event.target.files ?? []))}
                />
                {expenseFiles.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-amber-700">
                    <AlertCircle className="h-4 w-4" />
                    You can submit without a document, but accounting will see documentation is needed.
                  </div>
                ) : (
                  <div className="space-y-1 text-sm">
                    {expenseFiles.map((file) => (
                      <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                        <span className="truncate">{file.name}</span>
                        <span className="text-xs text-gray-500">{fileSizeLabel(file.size)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={() => expenseMutation.mutate()} disabled={expenseMutation.isPending}>
                {expenseMutation.isPending && <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                Submit Request
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                My Training Certs
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
                Work Order Sessions
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
                <strong>Time clock.</strong> This records when you start and end your workday.
                Select a charge code when you clock in if one applies; detailed work order labor is still tracked in the <strong>Work Order Sessions</strong> tab.
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

                    {punchStatus.status === 'clocked_out' && (
                      <div className="mx-auto max-w-xl rounded-lg border bg-white p-4 space-y-2">
                        <Label htmlFor="portal-clock-in-charge-code">Charge code</Label>
                        <Select
                          value={selectedClockInChargeCode}
                          onValueChange={setSelectedClockInChargeCode}
                          disabled={chargeCodesLoading || punchMutation.isPending}
                        >
                          <SelectTrigger id="portal-clock-in-charge-code" className="w-full">
                            <SelectValue placeholder={chargeCodesLoading ? 'Loading charge codes...' : 'Select charge code'} />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value="none">No charge code</SelectItem>
                            {Object.keys(chargeCodesByType).sort().map((type) => (
                              <SelectGroup key={type}>
                                <SelectLabel>{chargeCodeTypeLabels[type] ?? type}</SelectLabel>
                                {chargeCodesByType[type].map((cc) => (
                                  <SelectItem key={cc.id} value={cc.code}>
                                    {cc.code}{cc.description ? ` - ${cc.description}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          These are the same active charge codes available on the kiosk.
                        </p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3 justify-center">
                      {punchStatus.status === 'clocked_out' && (
                        <Button
                          size="lg"
                          className="bg-green-600 hover:bg-green-700 text-white gap-2 px-8"
                          disabled={punchMutation.isPending}
                          onClick={() => punchMutation.mutate({
                            type: 'clock_in',
                            costCode: selectedClockInChargeCode === 'none' ? undefined : selectedClockInChargeCode,
                          })}
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
                            onClick={() => punchMutation.mutate({ type: 'break_start' })}
                          >
                            <Coffee className="h-5 w-5" />
                            {punchMutation.isPending ? 'Recording…' : 'Start Break'}
                          </Button>
                          {!showDailyPunchOutCertification ? (
                            <Button
                              size="lg"
                              variant="outline"
                              className="border-red-400 text-red-700 hover:bg-red-50 gap-2 px-6"
                              disabled={punchMutation.isPending}
                              onClick={() => setShowDailyPunchOutCertification(true)}
                            >
                              <LogOut className="h-5 w-5" />
                              Clock Out
                            </Button>
                          ) : (
                            <>
                              <label className="flex w-full max-w-xl items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-left">
                                <input
                                  type="checkbox"
                                  checked={dailyPunchOutConfirmed}
                                  onChange={(event) => setDailyPunchOutConfirmed(event.target.checked)}
                                  className="mt-1 h-4 w-4 rounded border-blue-300 text-blue-600"
                                />
                                <span className="text-sm text-blue-900">
                                  I certify that today&apos;s recorded time is complete, accurate, and represents work I actually performed.
                                </span>
                              </label>
                              <Button
                                size="lg"
                                variant="outline"
                                className="border-red-400 text-red-700 hover:bg-red-50 gap-2 px-6"
                                disabled={punchMutation.isPending || !dailyPunchOutConfirmed}
                                onClick={() => punchMutation.mutate({
                                  type: 'clock_out',
                                  dailyCertificationConfirmed: dailyPunchOutConfirmed,
                                })}
                              >
                                <LogOut className="h-5 w-5" />
                            {punchMutation.isPending ? 'Recording…' : 'Clock Out'}
                              </Button>
                            </>
                          )}

                        </>
                      )}

                      {punchStatus.status === 'on_break' && (
                        <Button
                          size="lg"
                          className="bg-amber-600 hover:bg-amber-700 text-white gap-2 px-8"
                          disabled={punchMutation.isPending}
                          onClick={() => punchMutation.mutate({ type: 'break_end' })}
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

        {/* ── Timesheets (hourly self-certification) ───────────────────── */}
        <TabsContent value="my-timesheets" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Timesheets
              </CardTitle>
              <CardDescription>
                Review daily sign-offs, certify pay periods, and view historical timesheets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-gray-900">Current Period</h3>
                      {runningTimesheet?.hasOpenSession && (
                        <Badge className="bg-green-100 text-green-800 border-green-200">Live</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {runningTimesheet
                        ? `${runningTimesheet.periodStart} - ${runningTimesheet.periodEnd}`
                        : 'Current pay period'}
                    </p>
                  </div>
                  {runningTimesheet && (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-white border px-3 py-2">
                        <div className="text-base font-bold text-gray-900">{runningTimesheet.totalHours.toFixed(2)}</div>
                        <div className="text-[11px] text-muted-foreground">Total</div>
                      </div>
                      <div className="rounded-md bg-white border px-3 py-2">
                        <div className="text-base font-bold text-gray-900">{runningTimesheet.regularHours.toFixed(2)}</div>
                        <div className="text-[11px] text-muted-foreground">Regular</div>
                      </div>
                      <div className="rounded-md bg-white border px-3 py-2">
                        <div className="text-base font-bold text-gray-900">{runningTimesheet.overtimeHours.toFixed(2)}</div>
                        <div className="text-[11px] text-muted-foreground">OT</div>
                      </div>
                    </div>
                  )}
                </div>

                {runningTimesheetLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                    Loading running timesheet...
                  </div>
                ) : !runningTimesheet ? (
                  <div className="flex items-center gap-2 rounded-md bg-white border p-3 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    Could not load your running timesheet.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-32">Date</TableHead>
                          <TableHead>Entries</TableHead>
                          <TableHead className="text-right">Regular</TableHead>
                          <TableHead className="text-right">OT</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runningTimesheet.days.map((day) => (
                          <TableRow key={day.date}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </TableCell>
                            <TableCell>
                              {day.sessions.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No punches recorded</span>
                              ) : (
                                <div className="space-y-1">
                                  {day.sessions.map((session) => (
                                    <div key={`${session.id}-${session.clockIn}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                      <Badge variant="outline" className={session.laborClass === 'BREAK' ? 'text-amber-700 border-amber-200' : 'text-blue-700 border-blue-200'}>
                                        {session.laborClass === 'BREAK' ? 'Break' : 'Work'}
                                      </Badge>
                                      <span className="font-medium text-gray-700">
                                        {new Date(session.clockIn).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                        {' - '}
                                        {session.clockOut
                                          ? new Date(session.clockOut).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                                          : 'Now'}
                                      </span>
                                      <span className="text-muted-foreground">{session.hours.toFixed(2)}h</span>
                                      {session.chargeCode && <span className="text-muted-foreground">CC {session.chargeCode}</span>}
                                      {session.travelerId && <span className="text-muted-foreground">Traveler {session.travelerId}</span>}
                                      {session.isOpen && <span className="text-green-700 font-medium">open</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">{day.regularHours.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-medium">{day.overtimeHours.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">{day.workHours.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {runningTimesheet && !runningTimesheet.persistedTimesheet && (
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-blue-200 bg-white p-3">
                  <p className="text-sm text-blue-900">
                    When the period is ready, create the draft record so it appears in Needs Certification.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => prepareTimesheetMutation.mutate()}
                    disabled={prepareTimesheetMutation.isPending || runningTimesheet.totalHours <= 0}
                  >
                    {prepareTimesheetMutation.isPending ? 'Preparing...' : 'Prepare for Certification'}
                  </Button>
                </div>
              )}
              {runningTimesheet?.persistedTimesheet && (
                <div className="mb-6 flex items-center gap-2 rounded-md border border-green-200 bg-white p-3 text-sm text-green-800">
                  <CheckCircle className="h-4 w-4" />
                  This pay period has a saved timesheet record.
                </div>
              )}

              <div className="rounded-lg border p-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-semibold text-sm text-gray-900">Daily Sign-Off</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Certify each day after reviewing the punches recorded for that date.
                    </p>
                  </div>
                  <div className="w-full sm:w-48">
                    <Label htmlFor="daily-sign-off-date" className="sr-only">Daily sign-off date</Label>
                    <Input
                      id="daily-sign-off-date"
                      type="date"
                      value={dailySignOffDate}
                      onChange={(event) => setDailySignOffDate(event.target.value)}
                    />
                  </div>
                </div>

                {dailySignOffLoading ? (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Checking daily sign-off...
                  </div>
                ) : dailySignOffStatus?.isCertified ? (
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldCheck className="h-4 w-4" />
                      Signed off
                    </div>
                    {dailySignOffStatus.certifiedAt && (
                      <p className="mt-1 text-xs text-green-700">
                        Recorded on {new Date(dailySignOffStatus.certifiedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                ) : dailySignOffStatus && !dailySignOffStatus.hasActivity ? (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    No work activity is recorded for this date.
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
                    <p className="text-sm text-gray-700 italic leading-relaxed border-l-4 border-amber-400 pl-3">
                      "{DCAA_CERTIFICATION_STATEMENT}"
                    </p>
                    <Button
                      size="sm"
                      onClick={() => dailySignOffMutation.mutate()}
                      disabled={dailySignOffMutation.isPending || !dailySignOffDate}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {dailySignOffMutation.isPending ? 'Signing off...' : 'Sign Off for This Day'}
                    </Button>
                  </div>
                )}
              </div>

              {timesheetsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  Loading timesheets…
                </div>
              ) : (
                <div className="space-y-6">
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm text-gray-900">Needs Certification</h3>
                      <Badge variant="outline">{needsCertificationTimesheets.length}</Badge>
                    </div>
                    {needsCertificationTimesheets.length === 0 ? (
                      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                        No pay-period timesheets need certification.
                      </div>
                    ) : (
                      needsCertificationTimesheets.map(renderTimesheetCard)
                    )}
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm text-gray-900">History</h3>
                      <Badge variant="outline">{historicalTimesheets.length}</Badge>
                    </div>
                    {historicalTimesheets.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground text-sm rounded-md border bg-muted/30">
                        <FileCheck className="h-8 w-8 opacity-40" />
                        No historical timesheets yet.
                      </div>
                    ) : (
                      historicalTimesheets.map(renderTimesheetCard)
                    )}
                  </section>


                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
