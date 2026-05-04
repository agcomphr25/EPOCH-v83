import { useState, useRef, useEffect, Fragment } from 'react';
import { runCreatePunch, buildAddPunchFetchDep } from '@/lib/addPunchHandler';
import { runEditPunch, buildEditPunchFetchDep } from '@/lib/editPunchHandler';
import { runDeletePunch, buildDeletePunchFetchDep } from '@/lib/deletePunchHandler';
import { AuditTrailPanel } from '@/components/timekeeping/AuditTrailPanel';
import { ComplianceExceptionDashboard } from '@/components/timekeeping/ComplianceExceptionDashboard';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ToastAction } from '@/components/ui/toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Clock,
  FileText,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Edit2,
  Trash2,
  CalendarRange,
  UserCheck,
  Plus,
  Send,
  X,
  LogOut,
  FilePen,
  ChevronDown,
  ChevronUp,
  History,
} from 'lucide-react';

interface PolicySettings {
  id: number;
  certificationRequired: boolean;
  correctionApprovalRequired: boolean;
  minimumHoursPerWeek: number | null;
  lateSubmissionGraceDays: number | null;
  lateSubmissionBlock: boolean;
  certificationStatement: string;
  certificationVersion: number;
}

interface DashboardSummary {
  totalEmployees: number;
  activeEmployees: number;
  clockedInNow: number;
  onBreakNow: number;
  pendingTimesheets: number;
  pendingTimeOffRequests?: number;
  hoursThisWeek: number;
  overtimeHoursThisWeek: number;
  expiringCertifications?: number;
  missingPunchCount: number;
}

interface EmployeeHours {
  employeeId: number;
  name: string;
  department: string | null;
  totalHours: number;
  regularHours: number;
}

interface TimeOffRequest {
  id: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  leaveType: string;
  status: 'pending' | 'pending_supervisor' | 'pending_hr' | 'pending_vp' | 'approved' | 'rejected' | 'denied';
  requestUnit?: string | null;
  requestedHours?: number | null;
  employeeNote: string | null;
  adminNote: string | null;
  supervisorNote: string | null;
  supervisorDecision: string | null;
  hrNote: string | null;
  hrDecision: string | null;
  vpNote: string | null;
  vpDecision: string | null;
  reviewedAt: string | null;
  createdAt: string;
  employeeFirstName: string | null;
  employeeLastName: string | null;
}

interface EmployeeRecord {
  id: number;
  epochEmployeeId?: number | null;
  firstName: string;
  lastName: string;
  employeeNumber: string | null;
  department: string | null;
  jobTitle: string | null;
  status: 'active' | 'inactive';
  pin: string | null;
  timezone: string;
}

interface EmployeeStatusEntry {
  employee: EmployeeRecord;
  status: 'clocked_in' | 'on_break' | 'clocked_out';
  clockedInAt?: string;
  hoursToday?: number;
}

interface PunchRecordedDetail {
  employeeId?: number;
  action?: string;
}

interface RecentPunch {
  sessionId: number;
  employeeId: number;
  employeeName: string;
  department: string | null;
  punchType: 'clock_in' | 'clock_out' | 'break_start' | 'break_end' | 'other';
  punchedAt: string;
  source: 'kiosk' | 'legacy';
}

interface RecentPunchesResult {
  punches: RecentPunch[];
  orphanedCount: number;
}

interface UnapprovedGroup {
  employeeId: string;
  employeeName: string | null;
  productionWorkOrderId: string;
  sessionCount: number;
  totalHours: number;
  earliestClockIn: string;
  latestClockOut: string | null;
  punchLedgerIds: number[];
}

interface LaborApprovalRecord {
  id: number;
  productionWorkOrderId: string;
  employeeId: string;
  approvedBy: string;
  reason: string;
  approvedAt: string | null;
  hoursAtApproval: string | null;
}

interface Timesheet {
  id: number;
  employeeId: number;
  periodStart: string;
  periodEnd: string;
  status: 'draft' | 'submitted' | 'certified' | 'locked' | 'correction_requested' | 'correction_approved';
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  rejectionNote: string | null;
  employeeAttested: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  attestedAt?: string | null;
  certifiedByUserId?: number | null;
  certificationStatement?: string | null;
  certificationVersion?: number | null;
}

interface Punch {
  id: number;
  sessionId: number;
  employeeId: number;
  type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  punchedAt: string;
  timezone?: string;
  note: string | null;
  source: string;
  isEdited: boolean;
  editNote: string | null;
  costCode: string | null;
  hasMissingClockOut: boolean;
}

interface DcaaViolation {
  ruleId: string;
  reason: string;
  remediation: string;
}

interface TimesheetCorrection {
  id: number;
  timesheetId: number;
  requestedByEmployeeId: number;
  requestedAt: string;
  reason: string;
  originalSnapshot: Record<string, unknown>;
  proposedChanges: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
  afterSnapshot: Record<string, unknown> | null;
  createdAt: string;
  employeeName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Salaried Timesheets Admin Panel (Phase 1 — read-only placeholder)
// ---------------------------------------------------------------------------

interface SalariedTimesheetRow {
  timesheet: {
    id: number;
    employeeId: number;
    periodStart: string;
    periodEnd: string;
    status: string;
    totalActualHours: number;
    createdAt: string;
  };
  employeeName: string | null;
  pendingDraftCount: number;
  needsReviewDraftCount: number;
}

function SalariedTimesheetsAdminPanel() {
  const { data: reviewQueue, isLoading, error } = useQuery<SalariedTimesheetRow[]>({
    queryKey: ['/api/timekeeping/salaried-timesheet/admin/review'],
    queryFn: async () => {
      const res = await fetch('/api/timekeeping/salaried-timesheet/admin/review');
      if (res.status === 404) return [];
      if (!res.ok) throw new Error('Failed to load salaried timesheet review queue');
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const featureDisabled = !isLoading && !error && Array.isArray(reviewQueue) && reviewQueue.length === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Salaried Timesheet Admin Review
            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">Phase 1</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            <strong>Salaried Timesheet Admin Review (Phase 1)</strong> — Review queue and approvals begin in Phase 2.
            This view shows all initialized weekly timesheets for salaried employees.
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600">
              Error loading salaried timesheets. The feature may not be enabled yet.
            </div>
          ) : !reviewQueue || reviewQueue.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {featureDisabled
                ? 'The salaried timesheet feature is not yet enabled. Enable it in Timekeeping Settings.'
                : 'No salaried timesheets found.'}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Drafts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewQueue.map((row) => (
                    <TableRow key={row.timesheet.id}>
                      <TableCell className="font-medium">
                        {row.employeeName ?? `Employee #${row.timesheet.employeeId}`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.timesheet.periodStart} → {row.timesheet.periodEnd}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          row.timesheet.status === 'OPEN'
                            ? 'bg-yellow-100 text-yellow-800'
                            : row.timesheet.status === 'SUBMITTED'
                            ? 'bg-blue-100 text-blue-800'
                            : row.timesheet.status === 'APPROVED'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {row.timesheet.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.timesheet.totalActualHours.toFixed(2)}h
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {row.needsReviewDraftCount > 0 && (
                            <span
                              title={`${row.needsReviewDraftCount} draft(s) need review — will block payroll approval`}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800"
                            >
                              {row.needsReviewDraftCount} needs review
                            </span>
                          )}
                          {row.pendingDraftCount > 0 && row.needsReviewDraftCount === 0 && (
                            <span
                              title={`${row.pendingDraftCount} pending draft(s) — will be posted at payroll approval`}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                            >
                              {row.pendingDraftCount} pending
                            </span>
                          )}
                          {row.pendingDraftCount > 0 && row.needsReviewDraftCount > 0 && (
                            <span
                              title={`${row.pendingDraftCount} total pending draft(s)`}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
                            >
                              {row.pendingDraftCount} total
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function fmtHours(h: number) {
  return `${h.toFixed(2)}h`;
}

function punchTypeLabel(t: string) {
  const map: Record<string, string> = {
    clock_in: 'Clock In',
    clock_out: 'Clock Out',
    break_start: 'Break Start',
    break_end: 'Break End',
    other: 'Other',
  };
  return map[t] ?? t;
}

/** Computes the current bi-weekly pay period (anchored 2024-01-01, same as server). */
function getCurrentPayPeriod(): { start: string; end: string } {
  const ANCHOR = Date.UTC(2024, 0, 1);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const PERIOD_DAYS = 14;
  const now = new Date();
  const inputUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceAnchor = Math.round((inputUTC - ANCHOR) / DAY_MS);
  const periodIndex = Math.floor(daysSinceAnchor / PERIOD_DAYS);
  const startUTC = ANCHOR + periodIndex * PERIOD_DAYS * DAY_MS;
  const endUTC = startUTC + (PERIOD_DAYS - 1) * DAY_MS;
  const startDate = new Date(startUTC);
  const endDate = new Date(endUTC);
  return {
    start: `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDate.getUTCDate()).padStart(2, '0')}`,
    end: `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`,
  };
}

const PTO_STAGE_LABELS: Record<string, string> = {
  pending: 'Pending Supervisor',
  pending_supervisor: 'Pending Supervisor',
  pending_hr: 'Pending HR',
  pending_vp: 'Pending VP',
  approved: 'Approved',
  rejected: 'Rejected',
  denied: 'Rejected',
  draft: 'Draft',
  submitted: 'Submitted',
  certified: 'Certified',
  locked: 'Locked',
  correction_requested: 'Correction Requested',
  correction_approved: 'Correction Approved',
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    denied: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    pending_supervisor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    pending_hr: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    pending_vp: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    certified: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    locked: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
    correction_requested: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    correction_approved: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    clocked_in: 'bg-green-100 text-green-800',
    on_break: 'bg-yellow-100 text-yellow-800',
    clocked_out: 'bg-gray-100 text-gray-600',
  };
  const label = PTO_STAGE_LABELS[status] ?? status.replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="rounded-lg shadow-md">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <Icon className={`h-8 w-8 ${color} opacity-70`} />
        </div>
      </CardContent>
    </Card>
  );
}

function DevSeedPunchesPanel() {
  const { toast } = useToast();
  const [daysBack, setDaysBack] = useState(14);
  const [maxSessions, setMaxSessions] = useState(2);
  const [seeding, setSeeding] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleSeed = async () => {
    setSeeding(true);
    setLastResult(null);
    try {
      const res = await fetch(`/api/dev/timekeeping/seed-punches?daysBack=${daysBack}&maxSessions=${maxSessions}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Seed failed', description: data.error ?? 'Unknown error', variant: 'destructive' });
        return;
      }
      setLastResult(data.message);
      toast({ title: 'Seed complete', description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping'] });
    } catch {
      toast({ title: 'Seed failed', description: 'Network error', variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    setLastResult(null);
    try {
      const res = await fetch('/api/dev/timekeeping/seed-punches', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Cleanup failed', description: data.error ?? 'Unknown error', variant: 'destructive' });
        return;
      }
      setLastResult(data.message);
      toast({ title: 'Cleanup complete', description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping'] });
    } catch {
      toast({ title: 'Cleanup failed', description: 'Network error', variant: 'destructive' });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Card className="mt-6 border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Stress Test Data Seeder
          <Badge variant="outline" className="text-xs font-normal text-amber-600 border-amber-300">DEV ONLY</Badge>
        </CardTitle>
        <CardDescription>
          Generate realistic punch history for all employees with a kiosk PIN. Seeded records use source "SEED" and can be cleaned up without affecting real data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Days back</Label>
            <Input
              data-testid="input-seed-days-back"
              type="number"
              min={1}
              max={90}
              value={daysBack}
              onChange={(e) => setDaysBack(Math.max(1, Math.min(90, parseInt(e.target.value) || 14)))}
              className="w-24 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Max sessions/day</Label>
            <Input
              data-testid="input-seed-max-sessions"
              type="number"
              min={1}
              max={4}
              value={maxSessions}
              onChange={(e) => setMaxSessions(Math.max(1, Math.min(4, parseInt(e.target.value) || 2)))}
              className="w-24 text-sm"
            />
          </div>
          <Button
            data-testid="button-seed-punches"
            onClick={handleSeed}
            disabled={seeding || cleaning}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {seeding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Seeding…</> : 'Seed Punch Data'}
          </Button>
          <Button
            data-testid="button-cleanup-seed"
            onClick={handleCleanup}
            disabled={seeding || cleaning}
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50"
          >
            {cleaning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cleaning…</> : <><Trash2 className="h-4 w-4 mr-2" />Clean Up Seeded Data</>}
          </Button>
        </div>
        {lastResult && (
          <div className="text-sm text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-md px-3 py-2">
            {lastResult}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TimeClockAdminPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('compliance');
  const [inOutBoardUpdatedAt, setInOutBoardUpdatedAt] = useState<Date | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<UnapprovedGroup | null>(null);
  const [approvalReason, setApprovalReason] = useState('');
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<number | null>(null);
  const [lastPunchAction, setLastPunchAction] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [policyDraft, setPolicyDraft] = useState<Partial<PolicySettings>>({});

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<DashboardSummary>({
    queryKey: ['/api/timekeeping/dashboard/summary'],
    refetchInterval: 60_000,
  });

  const { data: employeeStatus, isLoading: clockedInLoading, refetch: refetchClockedIn } = useQuery<EmployeeStatusEntry[]>({
    queryKey: ['/api/timekeeping/dashboard/employee-status'],
    refetchInterval: 60_000,
  });

  const { data: recentPunchesData, isLoading: recentPunchesLoading } = useQuery<RecentPunchesResult>({
    queryKey: ['/api/timekeeping/dashboard/recent-punches'],
    refetchInterval: 300_000,
  });
  const recentPunches = recentPunchesData?.punches;
  const orphanedPunchCount = recentPunchesData?.orphanedCount ?? 0;

  useEffect(() => {
    function handlePunchRecorded(e: Event) {
      const detail = (e as CustomEvent<PunchRecordedDetail>).detail;
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/recent-punches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/employee-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/summary'] });
      setInOutBoardUpdatedAt(new Date());
      if (detail?.employeeId != null) {
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        setHighlightedEmployeeId(detail.employeeId);
        setLastPunchAction(detail.action ?? null);
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedEmployeeId(null);
          setLastPunchAction(null);
        }, 1500);
      }
    }
    window.addEventListener('punch_recorded', handlePunchRecorded);
    return () => {
      window.removeEventListener('punch_recorded', handlePunchRecorded);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  const [hoursFrom, setHoursFrom] = useState(() => {
    const { start } = getCurrentPayPeriod();
    return start;
  });
  const [hoursTo, setHoursTo] = useState(() => {
    const { end } = getCurrentPayPeriod();
    return end;
  });

  const { data: employeeHours, isLoading: employeeHoursLoading, isError: employeeHoursError } = useQuery<EmployeeHours[]>({
    queryKey: ['/api/timekeeping/dashboard/employee-hours', hoursFrom, hoursTo],
    queryFn: async () => {
      const qs = `?from=${hoursFrom}&to=${hoursTo}`;
      let res: Response;
      try {
        res = await fetch(`/api/timekeeping/dashboard/employee-hours${qs}`, { credentials: 'include' });
      } catch (networkErr) {
        console.error('[employee-hours] network error', networkErr);
        throw new Error('Failed to load employee hours');
      }
      if (!res.ok) {
        let body: unknown;
        try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
        console.error('[employee-hours] query failed', { status: res.status, body });
        throw new Error('Failed to load employee hours');
      }
      return res.json();
    },
  });

  const { data: employees } = useQuery<EmployeeRecord[]>({
    queryKey: ['/api/timekeeping/employees'],
  });

  // Current user's capability set for capability-aware UI rendering
  const { data: myPermissions } = useQuery<{ permissions: string[] }>({
    queryKey: ['/api/permissions/me'],
    staleTime: 1000 * 60 * 5,
  });
  const myPermSet = new Set(myPermissions?.permissions ?? []);

  const employeeMap = (employees ?? []).reduce<Record<number, EmployeeRecord>>((m, e) => {
    m[e.id] = e; return m;
  }, {});

  const {
    data: unapprovedGroups,
    isLoading: unapprovedLoading,
    refetch: refetchUnapproved,
  } = useQuery<UnapprovedGroup[]>({
    queryKey: ['/api/timekeeping/labor-approvals/unapproved'],
    enabled: activeTab === 'labor-approvals',
  });

  const createApprovalMutation = useMutation({
    mutationFn: (payload: { productionWorkOrderId: string; employeeId: string; reason: string }) =>
      apiRequest('/api/timekeeping/labor-approvals', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/labor-approvals/unapproved'] });
      setApprovalTarget(null);
      setApprovalReason('');
      toast({ title: 'Labor approved', description: 'Approval record created and audit trail updated.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  const [tsStatusFilter, setTsStatusFilter] = useState<string>('all');
  const { data: timesheets, isLoading: tsLoading, refetch: refetchTs } = useQuery<Timesheet[]>({
    queryKey: ['/api/timekeeping/timesheets', tsStatusFilter],
    queryFn: async () => {
      const qs = tsStatusFilter && tsStatusFilter !== 'all' ? `?status=${tsStatusFilter}` : '';
      const res = await fetch(`/api/timekeeping/timesheets${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load timesheets');
      return res.json();
    },
  });

  const [rejectDialogTs, setRejectDialogTs] = useState<Timesheet | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');
  const [attestDialogTs, setAttestDialogTs] = useState<Timesheet | null>(null);
  const [attestCertChecked, setAttestCertChecked] = useState(false);
  const [attestOverrideReason, setAttestOverrideReason] = useState('');

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/timekeeping/timesheets/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Timesheet certified', description: 'The timesheet has been certified.' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/summary'] });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to certify timesheet.', variant: 'destructive' }),
  });

  const lockMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/timekeeping/timesheets/${id}/lock`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Timesheet locked', description: 'The timesheet is now locked. Changes require a formal correction request.' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets'] });
    },
    onError: (err: unknown) => toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to lock timesheet.', variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      apiRequest(`/api/timekeeping/timesheets/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionNote: note }),
      }),
    onSuccess: () => {
      toast({ title: 'Timesheet rejected', description: 'The timesheet has been returned for correction.' });
      setRejectDialogTs(null);
      setRejectionNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/summary'] });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to reject timesheet.', variant: 'destructive' }),
  });

  const recalcMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/timekeeping/timesheets/${id}/recalculate`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Recalculated', description: 'Timesheet hours have been recalculated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets'] });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to recalculate.', variant: 'destructive' }),
  });

  const attestMutation = useMutation({
    mutationFn: ({ id, overrideReason }: { id: number; overrideReason: string }) =>
      apiRequest(`/api/timekeeping/timesheets/${id}/certify-admin`, {
        method: 'POST',
        body: JSON.stringify({ certificationConfirmed: true, overrideReason }),
      }),
    onSuccess: () => {
      toast({ title: 'Certified (Admin Override)', description: 'Admin override certification recorded on behalf of employee. Timesheet is ready to submit.' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets'] });
      setAttestDialogTs(null);
      setAttestCertChecked(false);
      setAttestOverrideReason('');
    },
    onError: (err: any) => {
      toast({
        title: 'Certification failed',
        description: err?.message ?? 'Unable to record admin certification.',
        variant: 'destructive',
      });
      setAttestDialogTs(null);
      setAttestCertChecked(false);
      setAttestOverrideReason('');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/timekeeping/timesheets/${id}/submit`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Submitted for approval', description: 'A supervisor can now review and approve this timesheet.' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/summary'] });
    },
    onError: (err: any) => toast({
      title: 'Submission failed',
      description: err?.message ?? 'Unable to submit timesheet.',
      variant: 'destructive',
    }),
  });

  const [correctionDialogTs, setCorrectionDialogTs] = useState<Timesheet | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionDescText, setCorrectionDescText] = useState('');

  const [auditTrailTs, setAuditTrailTs] = useState<Timesheet | null>(null);

  const [correctionReviewTarget, setCorrectionReviewTarget] = useState<TimesheetCorrection | null>(null);
  const [correctionReviewNote, setCorrectionReviewNote] = useState('');
  const [correctionSnapshotExpanded, setCorrectionSnapshotExpanded] = useState(false);

  const { data: allCorrections, isLoading: correctionsLoading, refetch: refetchCorrections } = useQuery<TimesheetCorrection[]>({
    queryKey: ['/api/timekeeping/corrections'],
    queryFn: async () => {
      const res = await fetch('/api/timekeeping/corrections', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load corrections');
      return res.json();
    },
    enabled: activeTab === 'corrections',
  });

  const { data: tsTabCorrections } = useQuery<TimesheetCorrection[]>({
    queryKey: ['/api/timekeeping/corrections', 'timesheets-tab'],
    queryFn: async () => {
      const res = await fetch('/api/timekeeping/corrections', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === 'timesheets',
    staleTime: 60_000,
  });

  const correctionsByTimesheetId = (tsTabCorrections ?? []).reduce<Record<number, TimesheetCorrection[]>>((acc, c) => {
    if (!acc[c.timesheetId]) acc[c.timesheetId] = [];
    acc[c.timesheetId].push(c);
    return acc;
  }, {});

  const [correctionStatusFilter, setCorrectionStatusFilter] = useState<string>('pending');

  const { data: policySettings, isLoading: policyLoading } = useQuery<PolicySettings>({
    queryKey: ['/api/timekeeping/policy-settings'],
    enabled: activeTab === 'policy',
  });

  const updatePolicyMutation = useMutation({
    mutationFn: (data: Partial<PolicySettings>) =>
      apiRequest('/api/timekeeping/policy-settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({ title: 'Policy saved', description: 'Compliance policy settings have been updated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/policy-settings'] });
      setPolicyDraft({});
    },
    onError: () => {
      toast({ title: 'Save failed', description: 'Could not save policy settings. Please try again.', variant: 'destructive' });
    },
  });

  const requestCorrectionMutation = useMutation({
    mutationFn: ({ timesheetId, reason, proposedChanges }: { timesheetId: number; reason: string; proposedChanges: Record<string, unknown> }) =>
      apiRequest('/api/timekeeping/corrections', {
        method: 'POST',
        body: JSON.stringify({ timesheetId, reason, proposedChanges }),
      }),
    onSuccess: () => {
      toast({ title: 'Correction requested', description: 'Your correction request has been submitted for manager review.' });
      setCorrectionDialogTs(null);
      setCorrectionReason('');
      setCorrectionDescText('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/corrections'] });
    },
    onError: (err: any) => toast({
      title: 'Request failed',
      description: err?.message ?? 'Unable to submit correction request.',
      variant: 'destructive',
    }),
  });

  const approveCorrectionMutation = useMutation({
    mutationFn: ({ id, reviewerNote }: { id: number; reviewerNote: string }) =>
      apiRequest(`/api/timekeeping/corrections/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ reviewerNote }),
      }),
    onSuccess: () => {
      toast({ title: 'Correction approved', description: 'The correction request has been approved and the audit log updated.' });
      setCorrectionReviewTarget(null);
      setCorrectionReviewNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/corrections'] });
    },
    onError: (err: any) => toast({
      title: 'Approval failed',
      description: err?.message ?? 'Unable to approve correction.',
      variant: 'destructive',
    }),
  });

  const rejectCorrectionMutation = useMutation({
    mutationFn: ({ id, reviewerNote }: { id: number; reviewerNote: string }) =>
      apiRequest(`/api/timekeeping/corrections/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reviewerNote }),
      }),
    onSuccess: () => {
      toast({ title: 'Correction rejected', description: 'The correction request has been rejected.' });
      setCorrectionReviewTarget(null);
      setCorrectionReviewNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/corrections'] });
    },
    onError: (err: any) => toast({
      title: 'Rejection failed',
      description: err?.message ?? 'Unable to reject correction.',
      variant: 'destructive',
    }),
  });

  const [reviewTsOpen, setReviewTsOpen] = useState(false);
  const [reviewTsEmployeeId, setReviewTsEmployeeId] = useState('');
  const [reviewTsPeriodStart, setReviewTsPeriodStart] = useState('');
  const [reviewTsPeriodEnd, setReviewTsPeriodEnd] = useState('');
  const [highlightedTsId, setHighlightedTsId] = useState<number | null>(null);
  const [pinnedTs, setPinnedTs] = useState<Timesheet | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  const reviewTsMutation = useMutation({
    mutationFn: async ({ employeeId, periodStart, periodEnd }: { employeeId: number; periodStart: string; periodEnd: string }) => {
      const params = new URLSearchParams({ employeeId: String(employeeId), periodStart, periodEnd });
      const res = await fetch(`/api/timekeeping/timesheets/by-period?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      return data as { created: false; reason: 'no_punches' } | (Timesheet & { created?: never });
    },
    onSuccess: (data) => {
      if ('reason' in data && data.reason === 'no_punches') {
        toast({
          title: 'No punch data found',
          description: 'No punch data found for this employee and period — timesheet not created.',
        });
        return;
      }
      const ts = data as Timesheet;
      setHighlightedTsId(ts.id);
      setPinnedTs(ts);
      setReviewTsOpen(false);
      setReviewTsEmployeeId('');
      setReviewTsPeriodStart('');
      setReviewTsPeriodEnd('');
      setTsStatusFilter('all');
      setActiveTab('timesheets');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/summary'] });
      toast({
        title: 'Timesheet ready',
        description: 'Draft timesheet loaded from punch data. Attest and submit to advance for approval.',
        action: (
          <ToastAction
            altText="Jump to timesheet row"
            onClick={() => {
              highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            View
          </ToastAction>
        ),
      });
    },
    onError: (err: any) => toast({
      title: 'Review failed',
      description: err?.message ?? 'Unable to load timesheet.',
      variant: 'destructive',
    }),
  });

  useEffect(() => {
    if (!highlightedTsId || !timesheets) return;
    const found = timesheets.find(ts => ts.id === highlightedTsId);
    if (!found) return;
    const scrollTimer = setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    const clearTimer = setTimeout(() => setHighlightedTsId(null), 5000);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [highlightedTsId, timesheets]);

  useEffect(() => {
    if (!pinnedTs) return;
    const clearTimer = setTimeout(() => setPinnedTs(null), 30000);
    return () => clearTimeout(clearTimer);
  }, [pinnedTs]);

  useEffect(() => {
    if (!pinnedTs || !timesheets) return;
    const fresh = timesheets.find(ts => ts.id === pinnedTs.id);
    if (fresh && fresh.status !== pinnedTs.status) {
      setPinnedTs(fresh);
    }
  }, [timesheets]);

  const [punchFrom, setPunchFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [punchTo, setPunchTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: punches, isLoading: punchesLoading, refetch: refetchPunches } = useQuery<Punch[]>({
    queryKey: ['/api/timekeeping/punches', punchFrom, punchTo],
    queryFn: async () => {
      const res = await fetch(
        `/api/timekeeping/punches?from=${punchFrom}&to=${punchTo}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to load punches');
      return res.json();
    },
    enabled: activeTab === 'punches',
  });

  const [addPunchOpen, setAddPunchOpen] = useState(false);
  const [addPunchEmployeeId, setAddPunchEmployeeId] = useState('');
  const [addPunchType, setAddPunchType] = useState('clock_in');
  const [addPunchAt, setAddPunchAt] = useState('');
  const [addPunchCostCode, setAddPunchCostCode] = useState('');
  const [addPunchNote, setAddPunchNote] = useState('');
  const [addPunchDcaaError, setAddPunchDcaaError] = useState<DcaaViolation | null>(null);

  const createPunchMutation = useMutation({
    mutationFn: (params: {
      employeeId: string;
      type: string;
      punchedAt: string;
      costCode: string;
      note: string;
    }) => runCreatePunch(params, buildAddPunchFetchDep()),
    onSuccess: () => {
      toast({ title: 'Punch created', description: 'The punch has been recorded.' });
      setAddPunchOpen(false);
      setAddPunchEmployeeId('');
      setAddPunchType('clock_in');
      setAddPunchAt('');
      setAddPunchCostCode('');
      setAddPunchNote('');
      setAddPunchDcaaError(null);
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/punches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/summary'] });
    },
    onError: (err: Error & { dcaaViolation?: DcaaViolation }) => {
      if (err.dcaaViolation) {
        setAddPunchDcaaError(err.dcaaViolation);
      } else {
        toast({ title: 'Error', description: err?.message ?? 'Failed to create punch.', variant: 'destructive' });
      }
    },
  });

  function openAddPunch() {
    const now = new Date();
    now.setSeconds(0, 0);
    setAddPunchAt(now.toISOString().slice(0, 16));
    setAddPunchEmployeeId('');
    setAddPunchType('clock_in');
    setAddPunchCostCode('');
    setAddPunchNote('');
    setAddPunchDcaaError(null);
    setAddPunchOpen(true);
  }

  const [toStatusFilter, setToStatusFilter] = useState<string>('all');
  const { data: timeOffRequests, isLoading: toLoading, refetch: refetchTimeOff } = useQuery<TimeOffRequest[]>({
    queryKey: ['/api/timekeeping/time-off', toStatusFilter],
    queryFn: async () => {
      const qs = toStatusFilter && toStatusFilter !== 'all' ? `?status=${toStatusFilter}` : '';
      const res = await fetch(`/api/timekeeping/time-off${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load time-off requests');
      return res.json();
    },
    enabled: activeTab === 'timeoff',
  });

  const [toReviewDialog, setToReviewDialog] = useState<{ req: TimeOffRequest; decision: 'approved' | 'denied'; stage: string } | null>(null);
  const [toAdminNote, setToAdminNote] = useState('');

  // On-behalf PTO submission state
  const [toOnBehalfOpen, setToOnBehalfOpen] = useState(false);
  const [toOnBehalfEmployeeId, setToOnBehalfEmployeeId] = useState('');
  const [toOnBehalfStart, setToOnBehalfStart] = useState('');
  const [toOnBehalfEnd, setToOnBehalfEnd] = useState('');
  const [toOnBehalfUnit, setToOnBehalfUnit] = useState('full_day');
  const [toOnBehalfHours, setToOnBehalfHours] = useState('');
  const [toOnBehalfNote, setToOnBehalfNote] = useState('');

  const reviewTimeOffMutation = useMutation({
    mutationFn: ({ id, decision, stage, note }: { id: number; decision: string; stage: string; note: string }) =>
      apiRequest(`/api/timekeeping/time-off/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, stage, note: note || undefined }),
      }),
    onSuccess: (_data, vars) => {
      toast({
        title: vars.decision === 'approved' ? 'Stage approved' : 'Request denied',
        description: vars.decision === 'approved'
          ? 'The request has been advanced to the next stage.'
          : 'The time-off request has been rejected.',
      });
      setToReviewDialog(null);
      setToAdminNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/time-off'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/summary'] });
    },
    onError: (err: Error) => toast({ title: 'Error', description: err.message ?? 'Failed to update request.', variant: 'destructive' }),
  });

  const submitOnBehalfMutation = useMutation({
    mutationFn: (data: { employeeId: number; startDate: string; endDate: string; requestUnit: string; requestedHours?: number; employeeNote?: string }) =>
      apiRequest('/api/timekeeping/time-off', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({ title: 'PTO submitted', description: 'Time-off request submitted on behalf of the employee.' });
      setToOnBehalfOpen(false);
      setToOnBehalfEmployeeId('');
      setToOnBehalfStart('');
      setToOnBehalfEnd('');
      setToOnBehalfUnit('full_day');
      setToOnBehalfHours('');
      setToOnBehalfNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/time-off'] });
    },
    onError: (err: Error) => toast({ title: 'Submission failed', description: err.message, variant: 'destructive' }),
  });

  const { data: chargeCodes = [] } = useQuery<{ id: number; code: string; description: string | null; department: string | null }[]>({
    queryKey: ['/api/timekeeping/charge-codes'],
  });

  const [editPunch, setEditPunch] = useState<Punch | null>(null);
  const [editEmployeeName, setEditEmployeeName] = useState('');
  const [editPunchDate, setEditPunchDate] = useState('');
  const [editPayDate, setEditPayDate] = useState('');
  const [editPunchTime, setEditPunchTime] = useState('');
  const [editPunchAmPm, setEditPunchAmPm] = useState<'AM' | 'PM'>('AM');
  const [editNote, setEditNote] = useState('');
  const [editCostCode, setEditCostCode] = useState('');

  const [deletePunchTarget, setDeletePunchTarget] = useState<Punch | null>(null);
  const [deleteNote, setDeleteNote] = useState('');

  const [closeSessionPunch, setCloseSessionPunch] = useState<Punch | null>(null);
  const [closeSessionTime, setCloseSessionTime] = useState('');
  const [closeSessionNote, setCloseSessionNote] = useState('');
  const [closeSessionTimeError, setCloseSessionTimeError] = useState<string | null>(null);

  const deletePunchMutation = useMutation({
    mutationFn: ({ id, editNote }: { id: number; editNote: string }) =>
      runDeletePunch({ id, editNote }, buildDeletePunchFetchDep()),
    onSuccess: () => {
      toast({ title: 'Session deleted', description: 'The punch session and any paired clock-out have been removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/punches'] });
      setDeletePunchTarget(null);
      setDeleteNote('');
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete punch session.', variant: 'destructive' }),
  });

  const updatePunchMutation = useMutation({
    mutationFn: ({ id, punchType, punchedAt, note, chargeCodeId }: { id: number; punchType: Punch['type']; punchedAt: string; note: string; chargeCodeId: number | null }) =>
      runEditPunch({ id, punchType, punchedAt, note, chargeCodeId }, buildEditPunchFetchDep()),
    onSuccess: () => {
      toast({ title: 'Punch updated', description: 'The punch has been corrected.' });
      setEditPunch(null);
      setEditEmployeeName('');
      setEditPunchDate('');
      setEditPayDate('');
      setEditPunchTime('');
      setEditPunchAmPm('AM');
      setEditNote('');
      setEditCostCode('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/punches'] });
    },
    onError: (err: Error) => toast({
      title: 'Punch update failed',
      description: err.message ?? 'Failed to update punch.',
      variant: 'destructive',
    }),
  });

  function openEditPunch(p: Punch, employeeName?: string) {
    setEditPunch(p);
    setEditEmployeeName(employeeName ?? `Employee #${p.employeeId}`);
    const parsed = p.punchedAt ? new Date(p.punchedAt) : new Date();
    const dt = isNaN(parsed.getTime()) ? new Date() : parsed;
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const hours24 = dt.getHours();
    const minutes = dt.getMinutes();
    const ampm: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const timeStr = `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setEditPunchDate(dateStr);
    setEditPayDate(dateStr);
    setEditPunchTime(timeStr);
    setEditPunchAmPm(ampm);
    setEditNote('');
    setEditCostCode(p.costCode ?? '');
  }

  const closeSessionMutation = useMutation({
    mutationFn: ({ id, clockOut, editNote }: { id: number; clockOut: string; editNote: string }) =>
      apiRequest(`/api/timekeeping/punches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ clockOut, editNote }),
      }),
    onSuccess: () => {
      toast({ title: 'Session closed', description: 'The missing clock-out has been recorded.' });
      setCloseSessionPunch(null);
      setCloseSessionTime('');
      setCloseSessionNote('');
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/punches'] });
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/dashboard/summary'] });
    },
    onError: (err: Error) => toast({
      title: 'Failed to close session',
      description: err.message ?? 'Could not record the clock-out.',
      variant: 'destructive',
    }),
  });

  function toLocalDatetimeInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openCloseSession(p: Punch) {
    setCloseSessionPunch(p);
    setCloseSessionTime(toLocalDatetimeInput(new Date()));
    setCloseSessionNote('');
  }

  const [gustoPeriodStart, setGustoPeriodStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) - 7;
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
  });
  const [gustoPeriodEnd, setGustoPeriodEnd] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) - 7 + 6;
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
  });
  const [exportLoading, setExportLoading] = useState(false);

  async function handleGustoExport() {
    if (!gustoPeriodStart || !gustoPeriodEnd) {
      toast({ title: 'Missing dates', description: 'Please select both period start and end.', variant: 'destructive' });
      return;
    }
    if (gustoPeriodStart > gustoPeriodEnd) {
      toast({ title: 'Invalid range', description: 'Period start must not be after period end.', variant: 'destructive' });
      return;
    }
    setExportLoading(true);
    try {
      const res = await fetch(
        `/api/timekeeping/admin/export/gusto?periodStart=${gustoPeriodStart}&periodEnd=${gustoPeriodEnd}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gusto-export-${gustoPeriodStart}-to-${gustoPeriodEnd}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Export downloaded', description: 'Gusto CSV export is ready.' });
    } catch (err: unknown) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Time Clock Admin</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage attendance, timesheet approvals, and payroll export
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchSummary(); refetchClockedIn(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-10">
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timesheets">
            Timesheets
            {(summary?.pendingTimesheets ?? 0) > 0 && (
              <span className="ml-2 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {summary!.pendingTimesheets}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="punches">Punch Review</TabsTrigger>
          <TabsTrigger value="timeoff">
            Time Off
            {(summary?.pendingTimeOffRequests ?? 0) > 0 && (
              <span className="ml-2 bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {summary!.pendingTimeOffRequests}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="corrections">
            Corrections
          </TabsTrigger>
          <TabsTrigger value="export">Gusto Export</TabsTrigger>
          <TabsTrigger value="salaried">Salaried</TabsTrigger>
          <TabsTrigger value="labor-approvals">
            Labor Approvals
            {(unapprovedGroups?.length ?? 0) > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {unapprovedGroups!.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
        </TabsList>

        {/* ── COMPLIANCE TAB ── */}
        <TabsContent value="compliance" className="space-y-4">
          <ComplianceExceptionDashboard
            onNavigateToTimesheets={() => setActiveTab('timesheets')}
            onNavigateToCorrections={() => setActiveTab('corrections')}
          />
        </TabsContent>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-6">
          {summaryLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label="Active Employees" value={summary?.activeEmployees ?? 0} />
              <StatCard
                icon={UserCheck}
                label="Clocked In Now"
                value={summary?.clockedInNow ?? 0}
                sub={summary?.onBreakNow ? `${summary.onBreakNow} on break` : undefined}
              />
              <StatCard
                icon={AlertTriangle}
                label="Pending Approvals"
                value={summary?.pendingTimesheets ?? 0}
              />
              <StatCard
                icon={Clock}
                label="Hours This Week"
                value={fmtHours(summary?.hoursThisWeek ?? 0)}
                sub={summary?.overtimeHoursThisWeek ? `${fmtHours(summary.overtimeHoursThisWeek)} OT` : undefined}
              />
            </div>
          )}

          {/* Missing Punch Alert Card */}
          {!summaryLoading && (() => {
            const count = summary?.missingPunchCount ?? 0;
            const hasIssues = count > 0;
            if (!hasIssues) {
              return (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30 text-green-700 dark:text-green-300">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium">All Clear — No Missing Punches</span>
                </div>
              );
            }
            return (
              <button
                type="button"
                className="w-full text-left rounded-lg border px-5 py-4 flex items-center gap-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-950/50"
                onClick={() => setActiveTab('punches')}
                aria-label={`${count} missing punches — go to Punch Review`}
              >
                <div className="flex-shrink-0 rounded-full p-2 bg-orange-100 dark:bg-orange-900/40">
                  <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-orange-800 dark:text-orange-300">
                    {count} employee{count !== 1 ? 's' : ''} with missing punches
                  </p>
                  <p className="text-xs mt-0.5 text-orange-600 dark:text-orange-400">
                    Stale open sessions detected in the current pay period. Click to review punches.
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs font-medium text-orange-700 dark:text-orange-300 underline underline-offset-2">
                  Review →
                </span>
              </button>
            );
          })()}

          {/* Side-by-side: Pay Period Hours (left) + In/Out Board (right) */}
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/* Left column — Pay Period Hours (~60%) */}
            <Card className="w-full lg:w-[60%]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Pay Period Hours by Employee
                  </CardTitle>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <CalendarRange className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <Input
                      type="date"
                      value={hoursFrom}
                      onChange={e => setHoursFrom(e.target.value)}
                      className="w-32 h-7 text-xs"
                    />
                    <span className="text-muted-foreground text-xs">to</span>
                    <Input
                      type="date"
                      value={hoursTo}
                      onChange={e => setHoursTo(e.target.value)}
                      className="w-32 h-7 text-xs"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-1 px-3 pb-3">
                {employeeHoursLoading ? (
                  <div className="flex items-center justify-center h-20">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : employeeHoursError ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                    <p className="text-sm font-medium text-destructive">Unable to load pay period hours</p>
                    <p className="text-xs text-muted-foreground">There was a problem retrieving employee hours data. Please refresh the page or contact your system administrator if the issue persists.</p>
                  </div>
                ) : !employeeHours?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No active employees found.</p>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-2 font-semibold text-gray-900">Name</TableHead>
                          <TableHead className="text-xs py-2 font-semibold text-gray-900">Dept</TableHead>
                          <TableHead className="text-xs py-2 text-right font-semibold text-gray-900">Reg</TableHead>
                          <TableHead className="text-xs py-2 text-right font-semibold text-gray-900">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employeeHours.map(row => (
                          <TableRow key={row.employeeId} className="text-xs hover:bg-muted/50">
                            <TableCell className="font-medium py-1.5">{row.name}</TableCell>
                            <TableCell className="text-muted-foreground py-1.5">
                              {row.department ?? '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground py-1.5">
                              {fmtHours(row.regularHours)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium py-1.5">
                              {row.totalHours > 0
                                ? <span className={row.totalHours > row.regularHours ? 'text-orange-600' : undefined}>{fmtHours(row.totalHours)}</span>
                                : <span className="text-muted-foreground">0.00h</span>
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right column — Tabbed In/Out Board (~40%) */}
            <Card className="w-full lg:w-[40%]">
              <Tabs defaultValue="inout">
                <CardHeader className="pb-0 pt-3 px-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <TabsList className="h-8 flex-1">
                      <TabsTrigger value="inout" className="flex-1 text-xs h-7">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1.5" />
                        In / Out Board
                      </TabsTrigger>
                      <TabsTrigger value="recent" className="flex-1 text-xs h-7">
                        Recent Punches
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  {inOutBoardUpdatedAt && (
                    <p className="text-[10px] text-muted-foreground text-right leading-none mb-1">
                      Updated {inOutBoardUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  )}
                </CardHeader>
                <TabsContent value="inout" className="mt-0">
                  <CardContent className="pt-3 px-3 pb-3">
                    {clockedInLoading ? (
                      <div className="flex items-center justify-center h-20">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !employeeStatus?.length ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No active employees found.</p>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-1">
                        {employeeStatus.map((entry) => {
                          const initials = `${entry.employee.firstName?.[0] ?? ''}${entry.employee.lastName?.[0] ?? ''}`.toUpperCase();
                          const avatarColor =
                            entry.status === 'clocked_in' ? 'bg-green-500' :
                            entry.status === 'on_break' ? 'bg-amber-500' :
                            'bg-slate-300';
                          const isHighlighted = highlightedEmployeeId === entry.employee.id;
                          const highlightBg = isHighlighted
                            ? (lastPunchAction === 'clock_out' || lastPunchAction === 'break_start'
                              ? 'bg-amber-100 dark:bg-amber-900/30'
                              : 'bg-green-100 dark:bg-green-900/30')
                            : '';
                          return (
                            <div key={entry.employee.id} data-testid={`employee-row-${entry.employee.id}`} className={`flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors duration-500 ${highlightBg}`}>
                              <div className={`flex-shrink-0 w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-semibold`}>
                                {initials}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight truncate">
                                  {entry.employee.firstName} {entry.employee.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground leading-tight">
                                  {entry.employee.department ? `${entry.employee.department}` : ''}
                                  {entry.clockedInAt ? ` · ${fmtTime(entry.clockedInAt)}` : ''}
                                </p>
                              </div>
                              <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                                {entry.status === 'clocked_in' && (
                                  <Badge className="h-5 px-1.5 text-[10px] bg-green-100 text-green-700 hover:bg-green-100 border-green-200">In</Badge>
                                )}
                                {entry.status === 'on_break' && (
                                  <Badge className="h-5 px-1.5 text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Break</Badge>
                                )}
                                {entry.status === 'clocked_out' && (
                                  <Badge className="h-5 px-1.5 text-[10px] bg-gray-100 text-gray-600 hover:bg-gray-100 border border-gray-300">Out</Badge>
                                )}
                                {entry.hoursToday != null && (
                                  <span className="text-xs font-mono text-muted-foreground">{fmtHours(entry.hoursToday)}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </TabsContent>
                <TabsContent value="recent" className="mt-0">
                  <CardContent className="pt-3 px-3 pb-3">
                    {orphanedPunchCount > 0 && (
                      <div className="flex items-start gap-2 mb-3 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-3 py-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-300 leading-snug">
                          <span className="font-semibold">{orphanedPunchCount} punch record{orphanedPunchCount !== 1 ? 's' : ''} omitted</span>
                          {' '}— the referenced employee{orphanedPunchCount !== 1 ? 's' : ''} could not be resolved (deleted or deactivated). Check the server logs for details.
                        </p>
                      </div>
                    )}
                    {recentPunchesLoading ? (
                      <div className="flex items-center justify-center h-20">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : !recentPunches?.length ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No recent punch activity.</p>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-1">
                        {recentPunches.map((punch) => {
                          const initials = punch.employeeName
                            .split(' ')
                            .map((n) => n[0] ?? '')
                            .slice(0, 2)
                            .join('')
                            .toUpperCase();

                          const badgeConfig: Record<string, { avatar: string; badge: string; label: string }> = {
                            clock_in:    { avatar: 'bg-green-500',  badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',   label: 'IN' },
                            clock_out:   { avatar: 'bg-slate-400',  badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',       label: 'OUT' },
                            break_start: { avatar: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',    label: 'Break' },
                            break_end:   { avatar: 'bg-blue-400',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',        label: 'Break End' },
                            other:       { avatar: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',           label: 'Other' },
                          };
                          const cfg = badgeConfig[punch.punchType] ?? badgeConfig['other'];

                          return (
                            <div key={punch.sessionId} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors">
                              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${cfg.avatar}`}>
                                {initials}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight truncate">{punch.employeeName}</p>
                                <p className="text-xs text-muted-foreground leading-tight">
                                  {punch.department ? `${punch.department} · ` : ''}{fmtTime(punch.punchedAt)}
                                </p>
                              </div>
                              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cfg.badge}`}>
                                  {cfg.label}
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${punch.source === 'kiosk' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                  {punch.source === 'kiosk' ? 'Kiosk' : 'Admin Entry'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </TabsContent>
              </Tabs>
            </Card>
          </div>
        </TabsContent>

        {/* ── TIMESHEETS TAB ── */}
        <TabsContent value="timesheets" className="space-y-4">
          {pinnedTs && (
            <div className="flex items-center gap-3 rounded-md border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40 px-4 py-2.5 text-sm text-blue-800 dark:text-blue-200">
              <FileText className="h-4 w-4 shrink-0 text-blue-500" />
              <span className="flex-1 min-w-0">
                <span className="font-medium">
                  {employeeMap[pinnedTs.employeeId]
                    ? `${employeeMap[pinnedTs.employeeId].firstName} ${employeeMap[pinnedTs.employeeId].lastName}`
                    : `Employee #${pinnedTs.employeeId}`}
                </span>
                {' '}— {pinnedTs.periodStart} to {pinnedTs.periodEnd}
                {' '}<StatusBadge status={pinnedTs.status} />
              </span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900"
                onClick={() => {
                  if (tsStatusFilter !== 'all' && tsStatusFilter !== pinnedTs.status) {
                    setTsStatusFilter('all');
                  }
                  setHighlightedTsId(pinnedTs.id);
                }}
              >
                Jump to row
              </Button>
              <button
                className="shrink-0 ml-1 rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-500 dark:text-blue-400"
                aria-label="Dismiss"
                onClick={() => setPinnedTs(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-sm">Filter by status:</Label>
            {([
              { value: 'all', label: 'All' },
              { value: 'draft', label: 'Draft' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'certified', label: 'Certified' },
              { value: 'locked', label: 'Locked' },
              { value: 'correction_requested', label: 'Correction' },
            ] as const).map(({ value, label }) => (
              <Button
                key={value}
                size="sm"
                variant={tsStatusFilter === value ? 'default' : 'outline'}
                onClick={() => setTsStatusFilter(value)}
              >
                {label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => refetchTs()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => setReviewTsOpen(true)}
            >
              <FileText className="h-4 w-4 mr-1" />
              Review Timesheet
            </Button>
          </div>

          <Card>
            <CardContent className="pt-0">
              {tsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !timesheets?.length ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No timesheets found for the selected filter.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Regular</TableHead>
                      <TableHead className="text-right">OT</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timesheets.map(ts => {
                      const emp = employeeMap[ts.employeeId];
                      const empName = emp
                        ? `${emp.firstName} ${emp.lastName}`
                        : `Employee #${ts.employeeId}`;
                      const isHighlighted = ts.id === highlightedTsId;
                      return (
                        <Fragment key={ts.id}>
                        <TableRow
                          ref={isHighlighted ? highlightedRowRef : undefined}
                          className={isHighlighted ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-300 dark:ring-blue-700 transition-colors' : undefined}
                        >
                          <TableCell className="font-medium">{empName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {ts.periodStart} – {ts.periodEnd}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={ts.status} />
                            {ts.certificationStatement ? (
                              <span
                                className="ml-1 text-xs text-green-700 font-medium"
                                title={`Certified — Statement: ${ts.certificationStatement}${ts.attestedAt ? ` | At: ${new Date(ts.attestedAt).toLocaleString()}` : ''}`}
                              >
                                ✓ certified
                              </span>
                            ) : ts.employeeAttested ? (
                              <span className="ml-1 text-xs text-green-600">✓ attested</span>
                            ) : null}
                            {(() => {
                              const tsCorrections = correctionsByTimesheetId[ts.id];
                              if (!tsCorrections?.length) return null;
                              const latest = tsCorrections[tsCorrections.length - 1];
                              const corrBadgeColors: Record<string, string> = {
                                pending: 'bg-yellow-50 border-yellow-300 text-yellow-700',
                                approved: 'bg-purple-50 border-purple-300 text-purple-700',
                                rejected: 'bg-red-50 border-red-300 text-red-600',
                              };
                              return (
                                <span
                                  className={`ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-xs font-medium ${corrBadgeColors[latest.status] ?? 'bg-gray-50 border-gray-200 text-gray-600'}`}
                                  title={`Correction ${latest.status}: ${latest.reason}`}
                                >
                                  <FilePen className="h-2.5 w-2.5" />
                                  {latest.status === 'pending' ? 'Correction Pending' : latest.status === 'approved' ? 'Correction Approved' : 'Correction Rejected'}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtHours(ts.totalHours)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {fmtHours(ts.regularHours)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">
                            {ts.overtimeHours > 0
                              ? <span className="text-orange-600">{fmtHours(ts.overtimeHours)}</span>
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                title="View audit trail for this timesheet"
                                className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                onClick={() => setAuditTrailTs(ts)}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Recalculate hours from punch data"
                                onClick={() => recalcMutation.mutate(ts.id)}
                                disabled={recalcMutation.isPending || ts.status !== 'draft'}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                              {ts.status === 'draft' && !ts.employeeAttested && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Admin Override: Certify on behalf of employee (use only when employee is unable to self-certify)"
                                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                  onClick={() => { setAttestDialogTs(ts); setAttestCertChecked(false); setAttestOverrideReason(''); }}
                                  disabled={attestMutation.isPending}
                                >
                                  <UserCheck className="h-4 w-4" />
                                </Button>
                              )}
                              {ts.status === 'draft' && ts.employeeAttested && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Submit for supervisor approval"
                                  className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                  onClick={() => submitMutation.mutate(ts.id)}
                                  disabled={submitMutation.isPending}
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                              )}
                              {ts.status === 'submitted' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Certify timesheet (supervisor approval)"
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={() => approveMutation.mutate(ts.id)}
                                    disabled={approveMutation.isPending}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Reject and return for correction"
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => { setRejectDialogTs(ts); setRejectionNote(''); }}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {ts.status === 'certified' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Lock this certified timesheet (admin only) — after locking, changes require a formal correction request"
                                  className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                                  onClick={() => lockMutation.mutate(ts.id)}
                                  disabled={lockMutation.isPending}
                                >
                                  <LogOut className="h-4 w-4" />
                                </Button>
                              )}
                              {ts.status === 'locked' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Request a DCAA correction to this locked timesheet"
                                  className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                  onClick={() => {
                                    setCorrectionDialogTs(ts);
                                    setCorrectionReason('');
                                    setCorrectionDescText('');
                                  }}
                                >
                                  <FilePen className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* Certification detail sub-row — visible only when certified */}
                        {ts.certificationStatement && (
                          <TableRow key={`cert-${ts.id}`} className="bg-green-50/60 hover:bg-green-50/60 border-t-0">
                            <TableCell colSpan={7} className="py-2 px-4">
                              <div className="flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-green-800">
                                <span className="font-semibold uppercase tracking-wide text-green-700 mr-1">DCAA Certified</span>
                                <span>
                                  <span className="font-medium">Certified By:</span>{' '}
                                  {ts.certifiedByUserId ? `User ID ${ts.certifiedByUserId}` : '—'}
                                </span>
                                <span>
                                  <span className="font-medium">Certified At:</span>{' '}
                                  {ts.attestedAt ? new Date(ts.attestedAt).toLocaleString() : '—'}
                                </span>
                                <span className="italic text-green-700">
                                  "{ts.certificationStatement}"
                                </span>
                                {ts.certificationVersion && (
                                  <span className="text-green-600">v{ts.certificationVersion}</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CORRECTIONS TAB ── */}
        <TabsContent value="corrections" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FilePen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">DCAA Timesheet Correction Requests</span>
            </div>
            <div className="flex gap-1 ml-2">
              {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={correctionStatusFilter === s ? 'default' : 'outline'}
                  onClick={() => setCorrectionStatusFilter(s)}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => refetchCorrections()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-md border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 mb-2">
            <strong>DCAA Compliance Note:</strong> Corrections to locked timesheets require manager/admin review. The original timesheet is never modified until a correction is approved. All actions are permanently recorded in the audit log.
          </div>

          <Card>
            <CardContent className="pt-0">
              {correctionsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !allCorrections?.length ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No correction requests found.
                </p>
              ) : (() => {
                const filtered = correctionStatusFilter === 'all'
                  ? allCorrections
                  : allCorrections.filter(c => c.status === correctionStatusFilter);
                if (!filtered.length) {
                  return (
                    <p className="text-sm text-muted-foreground text-center py-12">
                      No {correctionStatusFilter} correction requests found.
                    </p>
                  );
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timesheet</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(correction => {
                        const statusColors: Record<string, string> = {
                          pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
                          approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                          rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                        };
                        return (
                          <TableRow key={correction.id}>
                            <TableCell className="font-medium text-sm">
                              <div>{correction.employeeName ?? `Employee #${correction.requestedByEmployeeId}`}</div>
                              {correction.periodStart && correction.periodEnd && (
                                <div className="text-xs text-muted-foreground">{correction.periodStart} – {correction.periodEnd}</div>
                              )}
                              <div className="text-xs text-muted-foreground">TS #{correction.timesheetId}</div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(correction.requestedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </TableCell>
                            <TableCell className="text-sm max-w-xs truncate" title={correction.reason}>
                              {correction.reason}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[correction.status] ?? 'bg-gray-100 text-gray-700'}`}>
                                {correction.status}
                              </span>
                              {correction.reviewerNote && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs" title={correction.reviewerNote}>
                                  Note: {correction.reviewerNote}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setCorrectionReviewTarget(correction);
                                  setCorrectionReviewNote('');
                                  setCorrectionSnapshotExpanded(false);
                                }}
                              >
                                {correction.status === 'pending' ? 'Review' : 'View'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PUNCH REVIEW TAB ── */}
        <TabsContent value="punches" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={punchFrom}
                onChange={e => setPunchFrom(e.target.value)}
                className="w-40"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <Input
                type="date"
                value={punchTo}
                onChange={e => setPunchTo(e.target.value)}
                className="w-40"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => refetchPunches()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Load
            </Button>
            <Button size="sm" className="ml-auto" onClick={openAddPunch}>
              <Plus className="h-4 w-4 mr-1" />
              Add Punch
            </Button>
          </div>

          <Card>
            <CardContent className="pt-0">
              {punchesLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !punches?.length ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No punches found for this date range.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Punched At</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {punches.map(p => {
                      const emp = employeeMap[p.employeeId];
                      const empName = emp
                        ? `${emp.firstName} ${emp.lastName}`
                        : `Employee #${p.employeeId}`;
                      return (
                        <TableRow key={`${p.sessionId}-${p.type}`} className={p.hasMissingClockOut ? 'bg-amber-50/60 dark:bg-amber-900/10' : p.isEdited ? 'bg-yellow-50/40 dark:bg-yellow-900/10' : undefined}>
                          <TableCell className="font-medium">{empName}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-xs">
                                {punchTypeLabel(p.type)}
                              </Badge>
                              {p.hasMissingClockOut && (
                                <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
                                  Missing Clock Out
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {fmtTime(p.punchedAt)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground capitalize">
                            {p.source}
                            {p.costCode && <span className="ml-1 text-xs">({p.costCode})</span>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                            {p.isEdited && (
                              <span className="text-yellow-600 mr-1 text-xs">✎ edited:</span>
                            )}
                            {p.editNote ?? p.note ?? '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {p.hasMissingClockOut && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  title="Close session — record missing clock-out"
                                  onClick={() => openCloseSession(p)}
                                >
                                  <LogOut className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditPunch(p, empName)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => {
                                  setDeletePunchTarget(p);
                                  setDeleteNote('');
                                }}
                                disabled={deletePunchMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TIME OFF TAB ── */}
        <TabsContent value="timeoff" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-sm">Filter by status:</Label>
            {[
              { value: 'all', label: 'All' },
              { value: 'pending_supervisor', label: 'Supervisor' },
              { value: 'pending_hr', label: 'HR' },
              { value: 'pending_vp', label: 'VP' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ].map(s => (
              <Button
                key={s.value}
                size="sm"
                variant={toStatusFilter === s.value ? 'default' : 'outline'}
                onClick={() => setToStatusFilter(s.value)}
              >
                {s.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => refetchTimeOff()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="default" onClick={() => setToOnBehalfOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />Submit On Behalf
            </Button>
          </div>

          <Card>
            <CardContent className="pt-0">
              {toLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !timeOffRequests?.length ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No time-off requests found for the selected filter.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Employee Note</TableHead>
                      <TableHead>Admin Note</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeOffRequests.map(req => {
                      const empName = (req.employeeFirstName && req.employeeLastName)
                        ? `${req.employeeFirstName} ${req.employeeLastName}`
                        : `Employee #${req.employeeId}`;
                      return (
                        <TableRow key={req.id}>
                          <TableCell className="font-medium">{empName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {req.startDate} – {req.endDate}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-xs">
                              {req.leaveType.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={req.status} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                            {req.employeeNote ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                            {req.adminNote ?? '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {(() => {
                              const stageMap: Record<string, string> = {
                                pending_supervisor: 'supervisor',
                                pending: 'supervisor',
                                pending_hr: 'hr',
                                pending_vp: 'vp',
                              };
                              const stage = stageMap[req.status];
                              if (!stage) return null;
                              const stageCapMap: Record<string, string> = {
                                supervisor: 'timekeeping.pto.approve_supervisor',
                                hr: 'timekeeping.pto.approve_hr',
                                vp: 'timekeeping.pto.approve_vp',
                              };
                              const requiredCap = stageCapMap[stage];
                              // Show buttons while permissions are loading, or if user has the capability
                              const canReview = !myPermissions || myPermSet.has(requiredCap);
                              if (!canReview) return null;
                              return (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title={`Approve at ${stage} stage`}
                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                    onClick={() => { setToReviewDialog({ req, decision: 'approved', stage }); setToAdminNote(''); }}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title={`Deny at ${stage} stage`}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => { setToReviewDialog({ req, decision: 'denied', stage }); setToAdminNote(''); }}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </div>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GUSTO EXPORT TAB ── */}
        <TabsContent value="export" className="space-y-4">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Gusto Payroll Export
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Exports certified and locked timesheet hours for the selected pay period in Gusto CSV format.
                Only <strong>certified</strong> or <strong>locked</strong> timesheets are included.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Period Start</Label>
                  <Input
                    type="date"
                    value={gustoPeriodStart}
                    onChange={e => setGustoPeriodStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Period End</Label>
                  <Input
                    type="date"
                    value={gustoPeriodEnd}
                    onChange={e => setGustoPeriodEnd(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={handleGustoExport}
                disabled={exportLoading || !gustoPeriodStart || !gustoPeriodEnd}
                className="w-full"
              >
                {exportLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Preparing export…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download Gusto CSV
                  </>
                )}
              </Button>

              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">CSV columns:</p>
                <p>first_name, last_name, regular_hours, overtime_hours, double_overtime_hours, sick_hours, vacation_hours</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SALARIED TIMESHEETS TAB ── */}
        <TabsContent value="salaried" className="space-y-4">
          <SalariedTimesheetsAdminPanel />
        </TabsContent>

        {/* ── LABOR APPROVALS TAB ── */}
        <TabsContent value="labor-approvals" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Labor Approval Review Queue</h2>
              <p className="text-sm text-muted-foreground">
                WAD-linked labor sessions awaiting supervisor approval. Each row is one employee + work order group.
                One approval covers all sessions in the group.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchUnapproved()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {unapprovedLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading unapproved sessions…
            </div>
          ) : !unapprovedGroups || unapprovedGroups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
                <p className="font-medium">No unapproved labor sessions</p>
                <p className="text-sm text-muted-foreground mt-1">
                  All WAD-linked closed sessions have a supervisor approval record.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Work Order ID</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Total Hours</TableHead>
                      <TableHead>Earliest In</TableHead>
                      <TableHead>Latest Out</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unapprovedGroups.map((g) => (
                      <TableRow key={`${g.employeeId}-${g.productionWorkOrderId}`}>
                        <TableCell className="font-medium">
                          {g.employeeName ?? `Employee #${g.employeeId}`}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {g.productionWorkOrderId.slice(0, 8)}…
                        </TableCell>
                        <TableCell className="text-right">{g.sessionCount}</TableCell>
                        <TableCell className="text-right">{g.totalHours.toFixed(2)}h</TableCell>
                        <TableCell className="text-xs">
                          {new Date(g.earliestClockIn).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">
                          {g.latestClockOut ? new Date(g.latestClockOut).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setApprovalTarget(g); setApprovalReason(''); }}
                          >
                            <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                            Approve
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                DCAA Compliance Note
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>
                FAR 31.201-2(c) requires supervisor review of all labor charged to government contracts.
                Each approval covers all sessions for an employee on a given work order.
              </p>
              <p>
                The EDRI scorer checks <code className="bg-muted px-1 rounded">labor_approvals</code> for
                matching <code className="bg-muted px-1 rounded">employee_id + production_work_order_id</code>.
                Unapproved groups above are the exact set the scorer counts as non-compliant.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── POLICY TAB ── */}
        <TabsContent value="policy" className="space-y-6">
          {policyLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Effective values (merged: saved + any unsaved draft overrides) */}
              {(() => {
                const effective: PolicySettings = { ...(policySettings ?? {
                  id: 0,
                  certificationRequired: true,
                  correctionApprovalRequired: true,
                  minimumHoursPerWeek: null,
                  lateSubmissionGraceDays: null,
                  lateSubmissionBlock: false,
                  certificationStatement: 'I certify that the time recorded for this period is complete, accurate, and represents work I actually performed.',
                  certificationVersion: 1,
                }), ...policyDraft };

                return (
                  <div className="space-y-6">
                    {/* Certification */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Employee Certification</CardTitle>
                        <CardDescription>Controls whether employees must check a certification box before submitting their timesheet, and what statement they certify to.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Require employee attestation</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">When enabled, employees must check the certification box before they can submit a timesheet.</p>
                          </div>
                          <Switch
                            checked={effective.certificationRequired}
                            onCheckedChange={(v) => setPolicyDraft(d => ({ ...d, certificationRequired: v }))}
                          />
                        </div>
                        <Separator />
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Certification statement</Label>
                          <p className="text-xs text-muted-foreground">This exact text is stored on the timesheet at the moment of attestation and appears in the audit log.</p>
                          <Textarea
                            value={effective.certificationStatement}
                            onChange={(e) => setPolicyDraft(d => ({ ...d, certificationStatement: e.target.value }))}
                            rows={3}
                            className="resize-none text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Certification version</Label>
                          <p className="text-xs text-muted-foreground">Increment this when you update the statement text so historical attestations remain tied to the version they certified.</p>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={effective.certificationVersion}
                            onChange={(e) => setPolicyDraft(d => ({ ...d, certificationVersion: parseInt(e.target.value, 10) || 1 }))}
                            className="w-24 text-sm"
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Correction Approval */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Correction Approval Workflow</CardTitle>
                        <CardDescription>Controls whether timesheet corrections require manager review and approval, or are applied immediately when requested.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Require approval for corrections</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">When disabled, corrections submitted on locked timesheets are applied immediately without waiting for manager approval. The correction record and audit entry are still created.</p>
                          </div>
                          <Switch
                            checked={effective.correctionApprovalRequired}
                            onCheckedChange={(v) => setPolicyDraft(d => ({ ...d, correctionApprovalRequired: v }))}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Minimum Hours */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Minimum Hours Threshold</CardTitle>
                        <CardDescription>Optionally require a minimum number of hours before a timesheet can be submitted. Leave blank to disable.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Minimum hours per week</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={168}
                              step={0.5}
                              placeholder="No minimum"
                              value={effective.minimumHoursPerWeek ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                setPolicyDraft(d => ({ ...d, minimumHoursPerWeek: val }));
                              }}
                              className="w-36 text-sm"
                            />
                            <span className="text-sm text-muted-foreground">hours</span>
                            {effective.minimumHoursPerWeek != null && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-muted-foreground"
                                onClick={() => setPolicyDraft(d => ({ ...d, minimumHoursPerWeek: null }))}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Submissions with fewer hours than this threshold will be rejected with a 422 error.</p>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Late Submission */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Late Submission Policy</CardTitle>
                        <CardDescription>Optionally warn or block submissions when the timesheet covers a period that ended more than N days ago. Leave grace days blank to disable.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Grace period (days)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              placeholder="No limit"
                              value={effective.lateSubmissionGraceDays ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                                setPolicyDraft(d => ({ ...d, lateSubmissionGraceDays: val }));
                              }}
                              className="w-36 text-sm"
                            />
                            <span className="text-sm text-muted-foreground">days after period end</span>
                            {effective.lateSubmissionGraceDays != null && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-muted-foreground"
                                onClick={() => setPolicyDraft(d => ({ ...d, lateSubmissionGraceDays: null }))}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm font-medium">Block late submissions</Label>
                            <p className="text-xs text-muted-foreground mt-0.5">When enabled, submissions past the grace window are rejected with an error. When disabled, a warning is returned but the submission proceeds.</p>
                          </div>
                          <Switch
                            checked={effective.lateSubmissionBlock}
                            disabled={effective.lateSubmissionGraceDays == null}
                            onCheckedChange={(v) => setPolicyDraft(d => ({ ...d, lateSubmissionBlock: v }))}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Save */}
                    {Object.keys(policyDraft).length > 0 && (
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => setPolicyDraft({})}
                          disabled={updatePolicyMutation.isPending}
                        >
                          Discard changes
                        </Button>
                        <Button
                          onClick={() => updatePolicyMutation.mutate(policyDraft)}
                          disabled={updatePolicyMutation.isPending}
                        >
                          {updatePolicyMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                          ) : 'Save Policy'}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {import.meta.env.DEV && (
            <DevSeedPunchesPanel />
          )}
        </TabsContent>
      </Tabs>

      {/* Labor Approval Dialog */}
      <Dialog
        open={!!approvalTarget}
        onOpenChange={(o) => { if (!o) { setApprovalTarget(null); setApprovalReason(''); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Labor — Supervisor Sign-off</DialogTitle>
          </DialogHeader>
          {approvalTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p><span className="font-medium">Employee:</span> {approvalTarget.employeeName ?? `#${approvalTarget.employeeId}`}</p>
                <p><span className="font-medium">Work Order:</span> <span className="font-mono text-xs">{approvalTarget.productionWorkOrderId}</span></p>
                <p><span className="font-medium">Sessions:</span> {approvalTarget.sessionCount} ({approvalTarget.totalHours.toFixed(2)}h total)</p>
                <p><span className="font-medium">Period:</span> {new Date(approvalTarget.earliestClockIn).toLocaleDateString()} – {approvalTarget.latestClockOut ? new Date(approvalTarget.latestClockOut).toLocaleDateString() : 'open'}</p>
              </div>
              <div className="space-y-1">
                <Label>Approval Reason <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Supervisor authorization reason (FAR 31.201-2(c) required)…"
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  This reason is recorded in the audit trail. Your identity is captured server-side.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApprovalTarget(null); setApprovalReason(''); }}>
              Cancel
            </Button>
            <Button
              disabled={!approvalReason.trim() || createApprovalMutation.isPending}
              onClick={() => {
                if (!approvalTarget) return;
                createApprovalMutation.mutate({
                  productionWorkOrderId: approvalTarget.productionWorkOrderId,
                  employeeId: approvalTarget.employeeId,
                  reason: approvalReason.trim(),
                });
              }}
            >
              {createApprovalMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              ) : (
                <><UserCheck className="h-4 w-4 mr-2" />Confirm Approval</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DCAA Admin Override Certification Dialog */}
      <Dialog open={!!attestDialogTs} onOpenChange={(o) => { if (!o) { setAttestDialogTs(null); setAttestCertChecked(false); setAttestOverrideReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Admin Override: Certify on Behalf of Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
              <strong>Note:</strong> This is an administrative override. Normally, the employee should self-certify their own timesheet. This action will be recorded as an admin-override certification in the audit trail.
            </div>
            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">DCAA Certification Statement</p>
            <p className="text-sm text-gray-700 italic leading-relaxed border-l-4 border-amber-400 pl-3">
              "I certify that the time recorded for this period is complete, accurate, and represents work I actually performed."
            </p>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Reason for Admin Override (required)</Label>
              <Textarea
                placeholder="e.g. Employee is on leave and unavailable to certify; records verified against sign-in sheet…"
                value={attestOverrideReason}
                onChange={e => setAttestOverrideReason(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={attestCertChecked}
                onChange={e => setAttestCertChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-800 font-medium">
                I confirm the above certification statement accurately describes the recorded time, and I am authorized to certify on behalf of this employee.
              </span>
            </label>
            {attestDialogTs && (
              <p className="text-xs text-muted-foreground">
                Timesheet: {attestDialogTs.periodStart} – {attestDialogTs.periodEnd} &nbsp;·&nbsp; {attestDialogTs.totalHours.toFixed(2)} hrs
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAttestDialogTs(null); setAttestCertChecked(false); setAttestOverrideReason(''); }}>
              Cancel
            </Button>
            <Button
              disabled={!attestCertChecked || attestOverrideReason.trim().length < 5 || attestMutation.isPending}
              onClick={() => { if (attestDialogTs) attestMutation.mutate({ id: attestDialogTs.id, overrideReason: attestOverrideReason.trim() }); }}
            >
              {attestMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Certifying…</>
              ) : 'Admin Override — Certify'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Timesheet Dialog */}
      <Dialog open={!!rejectDialogTs} onOpenChange={(o) => { if (!o) setRejectDialogTs(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Timesheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              This will return the timesheet to the employee for correction. A rejection note is required.
            </p>
            <Textarea
              placeholder="Explain what needs to be corrected…"
              value={rejectionNote}
              onChange={e => setRejectionNote(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogTs(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectionNote.trim() || rejectMutation.isPending}
              onClick={() => {
                if (rejectDialogTs) {
                  rejectMutation.mutate({ id: rejectDialogTs.id, note: rejectionNote.trim() });
                }
              }}
            >
              {rejectMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rejecting…</>
              ) : 'Reject Timesheet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Timesheet Dialog */}
      <Dialog open={reviewTsOpen} onOpenChange={(o) => { if (!o) setReviewTsOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Timesheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Specify an employee and pay period. The system will load the existing timesheet or
              auto-create a draft from punch data. If no punches exist for the period, no timesheet
              will be created.
            </p>
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select value={reviewTsEmployeeId} onValueChange={setReviewTsEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.firstName} {e.lastName}
                      {e.employeeNumber ? ` (${e.employeeNumber})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={reviewTsPeriodStart}
                  onChange={e => setReviewTsPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={reviewTsPeriodEnd}
                  onChange={e => setReviewTsPeriodEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Hours are computed from existing punch records within this period.
              Only certified or locked timesheets satisfy the DCAA labor record coverage requirement.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTsOpen(false)}>Cancel</Button>
            <Button
              disabled={
                !reviewTsEmployeeId ||
                !reviewTsPeriodStart ||
                !reviewTsPeriodEnd ||
                reviewTsPeriodStart > reviewTsPeriodEnd ||
                reviewTsMutation.isPending
              }
              onClick={() => {
                reviewTsMutation.mutate({
                  employeeId: parseInt(reviewTsEmployeeId, 10),
                  periodStart: reviewTsPeriodStart,
                  periodEnd: reviewTsPeriodEnd,
                });
              }}
            >
              {reviewTsMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading…</>
              ) : (
                <><FileText className="h-4 w-4 mr-2" />Review Timesheet</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Punch Dialog */}
      <Dialog open={addPunchOpen} onOpenChange={(o) => { if (!o) { setAddPunchOpen(false); setAddPunchDcaaError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Punch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Admin-created punches are subject to the same DCAA charge code policies as kiosk punches.
            </p>
            <div className="space-y-1">
              <Label>Employee <span className="text-red-500">*</span></Label>
              <Select value={addPunchEmployeeId} onValueChange={(v) => { setAddPunchEmployeeId(v); setAddPunchDcaaError(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.firstName} {e.lastName}
                      {e.employeeNumber ? ` (${e.employeeNumber})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Punch Type <span className="text-red-500">*</span></Label>
              <Select value={addPunchType} onValueChange={(v) => { setAddPunchType(v); setAddPunchDcaaError(null); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clock_in">Clock In</SelectItem>
                  <SelectItem value="clock_out">Clock Out</SelectItem>
                  <SelectItem value="break_start">Break Start</SelectItem>
                  <SelectItem value="break_end">Break End</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Punched At <span className="text-red-500">*</span></Label>
              <Input
                type="datetime-local"
                value={addPunchAt}
                onChange={e => setAddPunchAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Charge Code</Label>
              <Select value={addPunchCostCode || '__none__'} onValueChange={(v) => { setAddPunchCostCode(v === '__none__' ? '' : v); setAddPunchDcaaError(null); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select charge code…" />
                </SelectTrigger>
                <SelectContent>
                  {chargeCodes.length === 0 ? (
                    <SelectItem value="__none__" disabled>No charge codes configured yet</SelectItem>
                  ) : (
                    <>
                      <SelectItem value="__none__">No charge code</SelectItem>
                      {chargeCodes.map(cc => (
                        <SelectItem key={cc.id} value={cc.code}>
                          {cc.code}{cc.description ? ` — ${cc.description}` : ''}{cc.department ? ` (${cc.department})` : ''}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Required for clock-in punches on charge-code-tracked projects. DCAA policy is enforced.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Input
                placeholder="Optional note…"
                value={addPunchNote}
                onChange={e => setAddPunchNote(e.target.value)}
              />
            </div>
            {addPunchDcaaError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm space-y-1">
                <p className="font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  [{addPunchDcaaError.ruleId}] DCAA Policy Violation
                </p>
                <p className="text-destructive">{addPunchDcaaError.reason}</p>
                <p className="text-destructive/70 text-xs">{addPunchDcaaError.remediation}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddPunchOpen(false); setAddPunchDcaaError(null); }}>
              Cancel
            </Button>
            <Button
              disabled={
                !addPunchEmployeeId ||
                !addPunchAt ||
                createPunchMutation.isPending
              }
              onClick={() => {
                setAddPunchDcaaError(null);
                createPunchMutation.mutate({
                  employeeId: addPunchEmployeeId,
                  type: addPunchType,
                  punchedAt: new Date(addPunchAt).toISOString(),
                  costCode: addPunchCostCode.trim(),
                  note: addPunchNote.trim(),
                });
              }}
            >
              {createPunchMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" />Create Punch</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* On-Behalf PTO Submission Dialog */}
      <Dialog open={toOnBehalfOpen} onOpenChange={(o) => { if (!o) setToOnBehalfOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit PTO On Behalf of Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select value={toOnBehalfEmployeeId} onValueChange={setToOnBehalfEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((e) => (
                    <SelectItem key={e.epochEmployeeId ?? e.id} value={String(e.epochEmployeeId ?? e.id)}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Request Type</Label>
              <Select value={toOnBehalfUnit} onValueChange={setToOnBehalfUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_day">Full Day</SelectItem>
                  <SelectItem value="half_day">Half Day</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="multi_day">Multi-Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={toOnBehalfStart} onChange={e => setToOnBehalfStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={toOnBehalfEnd} onChange={e => setToOnBehalfEnd(e.target.value)} min={toOnBehalfStart} />
              </div>
            </div>
            {toOnBehalfUnit === 'hourly' && (
              <div className="space-y-1">
                <Label>Hours</Label>
                <Input type="number" min="0.5" max="8" step="0.5" placeholder="e.g. 2" value={toOnBehalfHours} onChange={e => setToOnBehalfHours(e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea placeholder="Reason for on-behalf submission…" value={toOnBehalfNote} onChange={e => setToOnBehalfNote(e.target.value)} rows={2} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToOnBehalfOpen(false)}>Cancel</Button>
            <Button
              disabled={
                !toOnBehalfEmployeeId || !toOnBehalfStart || !toOnBehalfEnd || toOnBehalfStart > toOnBehalfEnd ||
                (toOnBehalfUnit === 'hourly' && (!toOnBehalfHours || parseFloat(toOnBehalfHours) <= 0)) ||
                submitOnBehalfMutation.isPending
              }
              onClick={() => {
                const empId = parseInt(toOnBehalfEmployeeId, 10);
                if (!empId) return;
                submitOnBehalfMutation.mutate({
                  employeeId: empId,
                  startDate: toOnBehalfStart,
                  endDate: toOnBehalfEnd,
                  requestUnit: toOnBehalfUnit,
                  requestedHours: toOnBehalfUnit === 'hourly' && toOnBehalfHours ? parseFloat(toOnBehalfHours) : undefined,
                  employeeNote: toOnBehalfNote.trim() || undefined,
                });
              }}
            >
              {submitOnBehalfMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time Off Review Dialog */}
      <Dialog open={!!toReviewDialog} onOpenChange={(o) => { if (!o) { setToReviewDialog(null); setToAdminNote(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {toReviewDialog?.decision === 'approved'
                ? `Approve — ${toReviewDialog.stage.toUpperCase()} Stage`
                : `Reject — ${toReviewDialog?.stage.toUpperCase()} Stage`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {toReviewDialog && (
              <p className="text-sm text-muted-foreground">
                {(() => {
                  const r = toReviewDialog.req;
                  const empName = (r.employeeFirstName && r.employeeLastName)
                    ? `${r.employeeFirstName} ${r.employeeLastName}`
                    : `Employee #${r.employeeId}`;
                  const unitLabel = r.requestUnit && r.requestUnit !== 'full_day'
                    ? ` · ${r.requestUnit.replace(/_/g, ' ')}`
                    : '';
                  const hoursLabel = r.requestedHours != null ? ` · ${r.requestedHours}h` : '';
                  return `${empName} — ${r.startDate} to ${r.endDate} (${r.leaveType.toUpperCase()}${unitLabel}${hoursLabel})`;
                })()}
              </p>
            )}
            {/* Show audit trail of previous stages */}
            {toReviewDialog && (toReviewDialog.req.supervisorDecision || toReviewDialog.req.hrDecision) && (
              <div className="text-xs space-y-0.5 text-muted-foreground border rounded p-2 bg-muted/30">
                {toReviewDialog.req.supervisorDecision && (
                  <div>Supervisor: <span className="font-medium capitalize">{toReviewDialog.req.supervisorDecision}</span>{toReviewDialog.req.supervisorNote ? ` — ${toReviewDialog.req.supervisorNote}` : ''}</div>
                )}
                {toReviewDialog.req.hrDecision && (
                  <div>HR: <span className="font-medium capitalize">{toReviewDialog.req.hrDecision}</span>{toReviewDialog.req.hrNote ? ` — ${toReviewDialog.req.hrNote}` : ''}</div>
                )}
              </div>
            )}
            <div className="space-y-1">
              <Label>
                {toReviewDialog?.decision === 'denied'
                  ? <span>Rejection Reason <span className="text-red-500">*</span></span>
                  : <span>Note <span className="text-muted-foreground text-xs">(optional)</span></span>
                }
              </Label>
              <Textarea
                placeholder={toReviewDialog?.decision === 'denied' ? 'Required — reason for rejection…' : 'Optional note to the employee…'}
                value={toAdminNote}
                onChange={e => setToAdminNote(e.target.value)}
                rows={3}
                className={`resize-none ${toReviewDialog?.decision === 'denied' && !toAdminNote.trim() ? 'border-red-400' : ''}`}
              />
              {toReviewDialog?.decision === 'denied' && !toAdminNote.trim() && (
                <p className="text-xs text-red-500">A rejection reason is required.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setToReviewDialog(null); setToAdminNote(''); }}>
              Cancel
            </Button>
            <Button
              variant={toReviewDialog?.decision === 'approved' ? 'default' : 'destructive'}
              disabled={
                reviewTimeOffMutation.isPending ||
                (toReviewDialog?.decision === 'denied' && !toAdminNote.trim())
              }
              onClick={() => {
                if (toReviewDialog) {
                  if (toReviewDialog.decision === 'denied' && !toAdminNote.trim()) return;
                  reviewTimeOffMutation.mutate({
                    id: toReviewDialog.req.id,
                    decision: toReviewDialog.decision,
                    stage: toReviewDialog.stage,
                    note: toAdminNote.trim(),
                  });
                }
              }}
            >
              {reviewTimeOffMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              ) : toReviewDialog?.decision === 'approved' ? (
                <><CheckCircle className="h-4 w-4 mr-2" />Approve</>
              ) : (
                <><XCircle className="h-4 w-4 mr-2" />Reject</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Session Dialog */}
      <Dialog open={!!closeSessionPunch} onOpenChange={(o) => { if (!o) { setCloseSessionPunch(null); setCloseSessionTime(''); setCloseSessionNote(''); setCloseSessionTimeError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close Session — Record Missing Clock-Out</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Set the clock-out time for this session and provide a required edit note for the DCAA audit trail.
            </p>
            <div className="space-y-1">
              <Label>Clock-Out Time (local time)</Label>
              <Input
                type="datetime-local"
                value={closeSessionTime}
                min={closeSessionPunch ? toLocalDatetimeInput(new Date(closeSessionPunch.punchedAt)) : undefined}
                onChange={e => {
                  setCloseSessionTime(e.target.value);
                  setCloseSessionTimeError(null);
                }}
              />
              {closeSessionTimeError && (
                <p className="text-sm text-destructive">{closeSessionTimeError}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Edit Note <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Reason for this correction…"
                value={closeSessionNote}
                onChange={e => setCloseSessionNote(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCloseSessionPunch(null); setCloseSessionTime(''); setCloseSessionNote(''); setCloseSessionTimeError(null); }}>Cancel</Button>
            <Button
              disabled={!closeSessionNote.trim() || !closeSessionTime || !!closeSessionTimeError || closeSessionMutation.isPending}
              onClick={() => {
                if (!closeSessionPunch) return;
                const parsed = closeSessionTime ? new Date(closeSessionTime) : null;
                if (!parsed || isNaN(parsed.getTime())) {
                  setCloseSessionTimeError('Please enter a valid clock-out date and time.');
                  return;
                }
                const clockInTime = new Date(closeSessionPunch.punchedAt);
                if (parsed <= clockInTime) {
                  setCloseSessionTimeError(
                    `Clock-out must be after the original clock-in (${clockInTime.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}).`
                  );
                  return;
                }
                closeSessionMutation.mutate({
                  id: closeSessionPunch.id,
                  clockOut: parsed.toISOString(),
                  editNote: closeSessionNote.trim(),
                });
              }}
            >
              {closeSessionMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              ) : 'Close Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Punch Dialog */}
      <Dialog open={!!editPunch} onOpenChange={(o) => { if (!o) { setEditPunch(null); setEditEmployeeName(''); setEditPunchDate(''); setEditPayDate(''); setEditPunchTime(''); setEditPunchAmPm('AM'); setEditNote(''); setEditCostCode(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editPunch?.type === 'clock_out' ? 'Clock-Out' : editPunch?.type === 'break_end' ? 'Break End' : editPunch?.type === 'break_start' ? 'Break Start' : 'Clock-In'}
              {editEmployeeName ? ` — ${editEmployeeName}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              An edit note is required for all punch corrections (DCAA audit trail). If you change the charge code, it must be in the active registry.
            </p>

            {/* Punch Date */}
            <div className="space-y-1">
              <Label>Punch Date</Label>
              <Input
                type="date"
                value={editPunchDate}
                onChange={e => setEditPunchDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If correcting a missed clock-out from the previous day, set Punch Date to yesterday.
              </p>
            </div>

            {/* Pay Date */}
            <div className="space-y-1">
              <Label>Pay Date</Label>
              <Input
                type="date"
                value={editPayDate}
                onChange={e => setEditPayDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The payroll period date this punch should count toward. Usually the same as Punch Date.
              </p>
            </div>

            {/* Time */}
            <div className="space-y-1">
              <Label>Time</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="hh:mm"
                  value={editPunchTime}
                  onChange={e => {
                    let v = e.target.value.replace(/[^0-9:]/g, '');
                    if (v.length === 2 && !v.includes(':') && editPunchTime.length === 1) v = v + ':';
                    if (v.length > 5) v = v.slice(0, 5);
                    setEditPunchTime(v);
                  }}
                  className="w-24"
                  maxLength={5}
                />
                <Select value={editPunchAmPm} onValueChange={(v) => setEditPunchAmPm(v as 'AM' | 'PM')}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </span>
              </div>
            </div>

            {/* Charge Code */}
            <div className="space-y-1">
              <Label>Charge Code</Label>
              <Select value={editCostCode || '__none__'} onValueChange={(v) => setEditCostCode(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select charge code…" />
                </SelectTrigger>
                <SelectContent>
                  {chargeCodes.length === 0 ? (
                    <SelectItem value="__none__" disabled>No charge codes configured yet</SelectItem>
                  ) : (
                    <>
                      <SelectItem value="__none__">No charge code</SelectItem>
                      {chargeCodes.map(cc => (
                        <SelectItem key={cc.id} value={cc.code}>
                          {cc.code}{cc.description ? ` — ${cc.description}` : ''}{cc.department ? ` (${cc.department})` : ''}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Only active charge codes are shown. Inactive codes will be rejected.</p>
            </div>

            {/* Edit Note */}
            <div className="space-y-1">
              <Label>Edit Note <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Reason for this correction…"
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditPunch(null); setEditEmployeeName(''); setEditPunchDate(''); setEditPayDate(''); setEditPunchTime(''); setEditPunchAmPm('AM'); setEditNote(''); setEditCostCode(''); }}>Cancel</Button>
            <Button
              disabled={!editNote.trim() || !editPunchDate || !editPunchTime || !editPayDate || updatePunchMutation.isPending}
              onClick={() => {
                if (!editPunch) return;
                const timeMatch = editPunchTime.match(/^(\d{1,2}):(\d{2})$/);
                if (!timeMatch) {
                  toast({ title: 'Invalid time', description: 'Please enter a valid time in hh:mm format.', variant: 'destructive' });
                  return;
                }
                let hours = parseInt(timeMatch[1], 10);
                const mins = parseInt(timeMatch[2], 10);
                if (hours < 1 || hours > 12 || mins < 0 || mins > 59) {
                  toast({ title: 'Invalid time', description: 'Please enter a valid 12-hour time.', variant: 'destructive' });
                  return;
                }
                if (editPunchAmPm === 'AM') {
                  if (hours === 12) hours = 0;
                } else {
                  if (hours !== 12) hours += 12;
                }
                const combinedIso = new Date(`${editPunchDate}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`).toISOString();
                const resolvedChargeCodeId = editCostCode
                  ? (chargeCodes.find(cc => cc.code === editCostCode)?.id ?? null)
                  : null;
                let finalNote = editNote.trim();
                if (editPayDate && editPayDate !== editPunchDate) {
                  finalNote = `${finalNote}\nPay Date: ${editPayDate}`;
                }
                updatePunchMutation.mutate({
                  id: editPunch.id,
                  punchType: editPunch.type,
                  punchedAt: combinedIso,
                  note: finalNote,
                  chargeCodeId: resolvedChargeCodeId,
                });
              }}
            >
              {updatePunchMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              ) : 'Save Correction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Punch Session Confirmation Dialog */}
      <Dialog open={!!deletePunchTarget} onOpenChange={(o) => { if (!o) { setDeletePunchTarget(null); setDeleteNote(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Punch Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This will permanently delete the entire session record — both the clock-in and any paired clock-out time will be removed. This action cannot be undone.
            </p>
            {deletePunchTarget && (
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <div><span className="font-medium">Employee:</span> {(() => { const e = employeeMap[deletePunchTarget.employeeId]; return e ? `${e.firstName} ${e.lastName}` : `Employee #${deletePunchTarget.employeeId}`; })()}</div>
                <div><span className="font-medium">Session ID:</span> {deletePunchTarget.sessionId}</div>
                <div><span className="font-medium">Event:</span> {deletePunchTarget.type === 'clock_in' ? 'Clock-In' : deletePunchTarget.type === 'clock_out' ? 'Clock-Out' : deletePunchTarget.type}</div>
                <div><span className="font-medium">Time:</span> {new Date(deletePunchTarget.punchedAt).toLocaleString()}</div>
              </div>
            )}
            <div className="space-y-1">
              <Label>Reason for deletion <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Required for DCAA audit trail…"
                value={deleteNote}
                onChange={e => setDeleteNote(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeletePunchTarget(null); setDeleteNote(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!deleteNote.trim() || deletePunchMutation.isPending}
              onClick={() => {
                if (!deletePunchTarget) return;
                deletePunchMutation.mutate({ id: deletePunchTarget.id, editNote: deleteNote.trim() });
              }}
            >
              {deletePunchMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting…</>
              ) : 'Delete Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── REQUEST CORRECTION DIALOG ── */}
      <Dialog open={!!correctionDialogTs} onOpenChange={(o) => { if (!o) { setCorrectionDialogTs(null); setCorrectionReason(''); setCorrectionDescText(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePen className="h-5 w-5 text-purple-600" />
              Request Timesheet Correction
            </DialogTitle>
          </DialogHeader>
          {correctionDialogTs && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-sm space-y-1">
                <p className="font-medium text-purple-800 dark:text-purple-300">
                  Timesheet #{correctionDialogTs.id}
                </p>
                <p className="text-purple-700 dark:text-purple-400 text-xs">
                  Period: {correctionDialogTs.periodStart} – {correctionDialogTs.periodEnd} · Status: {correctionDialogTs.status}
                </p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                  This timesheet is locked. Submitting a correction request creates an audited review request. A manager will review and, if approved, the timesheet will be reopened to "draft" status so corrections can be applied and the timesheet recertified. No changes occur until a manager approves.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Reason for correction <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Describe why this timesheet needs correction (e.g. wrong charge code on 3/15, missing overtime hours)…"
                  value={correctionReason}
                  onChange={e => setCorrectionReason(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">At least 5 characters required. This will be recorded in the audit log.</p>
              </div>
              <div className="space-y-1">
                <Label>Proposed changes <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Describe exactly what should be changed (e.g. 'Change charge code on 3/15 from 1234 to 5678; add 2 hours overtime on 3/16')…"
                  value={correctionDescText}
                  onChange={e => setCorrectionDescText(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">Describe the specific punch or time changes required.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCorrectionDialogTs(null); setCorrectionReason(''); setCorrectionDescText(''); }}>
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={
                !correctionReason.trim() ||
                correctionReason.trim().length < 5 ||
                !correctionDescText.trim() ||
                requestCorrectionMutation.isPending
              }
              onClick={() => {
                if (!correctionDialogTs) return;
                requestCorrectionMutation.mutate({
                  timesheetId: correctionDialogTs.id,
                  reason: correctionReason.trim(),
                  proposedChanges: {
                    mode: 'reopen',
                    description: correctionDescText.trim(),
                    punchEdits: [],
                  },
                });
              }}
            >
              {requestCorrectionMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>
              ) : 'Submit Correction Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CORRECTION REVIEW DIALOG (Admin) ── */}
      <Dialog open={!!correctionReviewTarget} onOpenChange={(o) => { if (!o) { setCorrectionReviewTarget(null); setCorrectionReviewNote(''); setCorrectionSnapshotExpanded(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePen className="h-5 w-5 text-purple-600" />
              {correctionReviewTarget?.status === 'pending' ? 'Review Correction Request' : 'Correction Request Detail'}
            </DialogTitle>
          </DialogHeader>
          {correctionReviewTarget && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Employee</p>
                  <p className="font-medium">{correctionReviewTarget.employeeName ?? `#${correctionReviewTarget.requestedByEmployeeId}`}</p>
                  {correctionReviewTarget.periodStart && correctionReviewTarget.periodEnd && (
                    <p className="text-xs text-muted-foreground">{correctionReviewTarget.periodStart} – {correctionReviewTarget.periodEnd}</p>
                  )}
                  <p className="text-xs text-muted-foreground">TS #{correctionReviewTarget.timesheetId}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Requested</p>
                  <p>{new Date(correctionReviewTarget.requestedAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    correctionReviewTarget.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    correctionReviewTarget.status === 'approved' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {correctionReviewTarget.status}
                  </span>
                </div>
                {correctionReviewTarget.reviewedAt && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reviewed</p>
                    <p>{new Date(correctionReviewTarget.reviewedAt).toLocaleString()}</p>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reason</p>
                <div className="rounded-md bg-muted p-3 text-sm">{correctionReviewTarget.reason}</div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Proposed Changes</p>
                <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                  {typeof correctionReviewTarget.proposedChanges === 'object' && 'description' in correctionReviewTarget.proposedChanges
                    ? String(correctionReviewTarget.proposedChanges.description)
                    : JSON.stringify(correctionReviewTarget.proposedChanges, null, 2)}
                </div>
              </div>

              <div className="space-y-1">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
                  onClick={() => setCorrectionSnapshotExpanded(v => !v)}
                >
                  {correctionSnapshotExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Original Snapshot (at time of request)
                </button>
                {correctionSnapshotExpanded && (
                  <div className="rounded-md bg-muted p-3 text-xs font-mono overflow-auto max-h-48">
                    <pre>{JSON.stringify(correctionReviewTarget.originalSnapshot, null, 2)}</pre>
                  </div>
                )}
              </div>

              {correctionReviewTarget.afterSnapshot && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">After-Approval Snapshot</p>
                  <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-xs font-mono overflow-auto max-h-32">
                    <pre>{JSON.stringify(correctionReviewTarget.afterSnapshot, null, 2)}</pre>
                  </div>
                </div>
              )}

              {correctionReviewTarget.reviewerNote && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reviewer Note</p>
                  <div className="rounded-md bg-muted p-3 text-sm">{correctionReviewTarget.reviewerNote}</div>
                </div>
              )}

              {correctionReviewTarget.status === 'pending' && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <strong>On approval:</strong> The timesheet will be reopened (status set to "draft") so the required corrections can be applied. The timesheet must then be resubmitted and re-approved following the standard workflow.
                </div>
              )}

              {correctionReviewTarget.status === 'pending' && (
                <div className="space-y-2 border-t pt-4">
                  <Label>Reviewer note <span className="text-red-500">*</span></Label>
                  <Textarea
                    placeholder="Required — explain your decision (e.g. 'Verified with supervisor, charge code correction confirmed')…"
                    value={correctionReviewNote}
                    onChange={e => setCorrectionReviewNote(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">This note will be permanently recorded in the audit log alongside your decision.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCorrectionReviewTarget(null); setCorrectionReviewNote(''); setCorrectionSnapshotExpanded(false); }}>
              {correctionReviewTarget?.status === 'pending' ? 'Cancel' : 'Close'}
            </Button>
            {correctionReviewTarget?.status === 'pending' && (
              <>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  disabled={correctionReviewNote.trim().length < 3 || rejectCorrectionMutation.isPending || approveCorrectionMutation.isPending}
                  onClick={() => {
                    if (!correctionReviewTarget) return;
                    rejectCorrectionMutation.mutate({ id: correctionReviewTarget.id, reviewerNote: correctionReviewNote.trim() });
                  }}
                >
                  {rejectCorrectionMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rejecting…</> : 'Reject'}
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={correctionReviewNote.trim().length < 3 || approveCorrectionMutation.isPending || rejectCorrectionMutation.isPending}
                  onClick={() => {
                    if (!correctionReviewTarget) return;
                    approveCorrectionMutation.mutate({ id: correctionReviewTarget.id, reviewerNote: correctionReviewNote.trim() });
                  }}
                >
                  {approveCorrectionMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Approving…</> : 'Approve Correction'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Trail Panel */}
      <AuditTrailPanel
        timesheetId={auditTrailTs?.id ?? null}
        timesheetLabel={
          auditTrailTs
            ? (() => {
                const emp = employeeMap[auditTrailTs.employeeId];
                const name = emp ? `${emp.firstName} ${emp.lastName}` : `Employee #${auditTrailTs.employeeId}`;
                return `${name} · ${auditTrailTs.periodStart} – ${auditTrailTs.periodEnd}`;
              })()
            : undefined
        }
        open={auditTrailTs !== null}
        onOpenChange={(o) => { if (!o) setAuditTrailTs(null); }}
      />
    </div>
  );
}
