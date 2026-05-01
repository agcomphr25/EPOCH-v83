import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft, Package, Calendar, TrendingUp, Briefcase, Hash, History,
  ShieldCheck, ShieldX, Clock, AlertTriangle, CheckCircle, XCircle,
  Send, RefreshCw, Loader2, Shield, Wand2, ChevronDown, ChevronUp,
  Cpu, FileText, Route, BookOpen, ClipboardCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { format, formatDistanceToNow } from 'date-fns';
import AuditTimeline from '@/components/AuditTimeline';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type ProductionWorkOrder = {
  id: string;
  workOrderNumber: string;
  projectId: string | null;
  partNumber: string | null;
  description: string | null;
  quantity: number | null;
  status: string;
  departmentBudgets: Record<string, number> | null;
  totalBudgetHours: string | null;
  startDate: string | null;
  dueDate: string | null;
  warningThreshold: string | null;
  blockedThreshold: string | null;
  defaultChargeCodeId: number | null;
  createdAt: string;
  updatedAt: string;
};

type LaborStatus = 'OK' | 'WARNING' | 'BLOCKED';

type LaborStatusResult = {
  workOrderId: string;
  totalHours: number;
  totalBudget: number | null;
  percentUsed: number | null;
  status: LaborStatus;
  latestApprovalId: number | null;
  latestApprovalAt: string | null;
};

type LaborBudgetOverride = {
  id: number;
  productionWorkOrderId: string;
  operatorEmployeeId: string;
  operatorDisplayName: string;
  requestedHours: string;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
  supervisorEmployeeId: string | null;
  supervisorDisplayName: string | null;
  supervisorNote: string | null;
  resolvedAt: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  requestedAt: string;
};

const statusColors: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-800',
  READY: 'bg-blue-100 text-blue-800',
  RELEASED: 'bg-indigo-100 text-indigo-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETE: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-200 text-gray-600',
};

const laborStatusConfig: Record<LaborStatus, { label: string; badgeClass: string; barClass: string }> = {
  OK: { label: 'OK', badgeClass: 'bg-green-100 text-green-800', barClass: 'bg-green-500' },
  WARNING: { label: 'WARNING', badgeClass: 'bg-yellow-100 text-yellow-800', barClass: 'bg-yellow-500' },
  BLOCKED: { label: 'BLOCKED', badgeClass: 'bg-red-100 text-red-800', barClass: 'bg-red-500' },
};

const overrideStatusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  PENDING: { label: 'Pending', icon: Clock, className: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  APPROVED: { label: 'Approved', icon: CheckCircle, className: 'text-green-700 bg-green-50 border-green-200' },
  DENIED: { label: 'Denied', icon: XCircle, className: 'text-red-700 bg-red-50 border-red-200' },
};

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return format(new Date(d), 'MMM d, yyyy');
  } catch {
    return d;
  }
}

function formatDateTime(d: string | null) {
  if (!d) return '—';
  try {
    return format(new Date(d), 'MMM d, h:mm a');
  } catch {
    return d;
  }
}

// ─── Operator override request form ─────────────────────────────────────────

function OverrideRequestPanel({ woId }: { woId: string }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    operatorEmployeeId: '',
    operatorDisplayName: '',
    requestedHours: '2',
    note: '',
  });
  const [submittedOverrideId, setSubmittedOverrideId] = useState<number | null>(null);
  // Canonical employee ID returned from the API (DB numeric ID) — used for polling
  const [canonicalOperatorId, setCanonicalOperatorId] = useState<string | null>(null);

  const requestMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      return await apiRequest(`/api/work-orders/production/${woId}/budget-overrides`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (result) => {
      const ov = result.override;
      setSubmittedOverrideId(ov?.id ?? null);
      // Use the canonical operator ID from the response for polling
      setCanonicalOperatorId(ov?.operatorEmployeeId ?? form.operatorEmployeeId);
      toast({ title: 'Override request submitted', description: 'Waiting for supervisor approval.' });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production', woId, 'budget-overrides'] });
    },
    onError: (err: Error) => {
      let message = err.message;
      try {
        const body = JSON.parse(err.message) as { message?: string; existingOverride?: { id: number; operatorEmployeeId: string } };
        if (body?.message) message = body.message;
        if (body?.existingOverride) {
          setSubmittedOverrideId(body.existingOverride.id);
          setCanonicalOperatorId(body.existingOverride.operatorEmployeeId ?? form.operatorEmployeeId);
          return;
        }
      } catch { /* ignore */ }
      toast({ title: 'Failed to submit override', description: message, variant: 'destructive' });
    },
  });

  // Poll for status after submitting — use canonical operator ID from API response
  const { data: overrides, isLoading: overridesLoading } = useQuery<LaborBudgetOverride[]>({
    queryKey: ['/api/work-orders/production', woId, 'budget-overrides', canonicalOperatorId],
    queryFn: async () => {
      if (!canonicalOperatorId) return [];
      const res = await fetch(`/api/work-orders/production/${woId}/budget-overrides?operatorEmployeeId=${encodeURIComponent(canonicalOperatorId)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!submittedOverrideId && !!canonicalOperatorId,
    refetchInterval: (query) => {
      const list = (query.state.data as LaborBudgetOverride[]) ?? [];
      const latest = list.find(o => o.id === submittedOverrideId);
      return latest?.status === 'PENDING' ? 3000 : false;
    },
  });

  const submittedOverride = overrides?.find(o => o.id === submittedOverrideId);

  if (submittedOverrideId && submittedOverride) {
    const cfg = overrideStatusConfig[submittedOverride.status];
    const Icon = cfg.icon;
    return (
      <div className={`rounded-md border px-4 py-3 space-y-2 ${cfg.className}`}>
        <div className="flex items-center gap-2 font-medium text-sm">
          <Icon className="h-4 w-4" />
          {submittedOverride.status === 'PENDING' && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Waiting for supervisor approval…
            </span>
          )}
          {submittedOverride.status === 'APPROVED' && 'Supervisor approved — you may clock in'}
          {submittedOverride.status === 'DENIED' && 'Request denied'}
        </div>
        {submittedOverride.status === 'APPROVED' && submittedOverride.expiresAt && (
          <p className="text-xs">
            Valid until {formatDateTime(submittedOverride.expiresAt)} (
            {formatDistanceToNow(new Date(submittedOverride.expiresAt), { addSuffix: true })})
          </p>
        )}
        {submittedOverride.status === 'DENIED' && submittedOverride.supervisorNote && (
          <p className="text-xs">Note: {submittedOverride.supervisorNote}</p>
        )}
        {submittedOverride.status === 'DENIED' && (
          <Button
            size="sm"
            variant="outline"
            className="mt-1"
            onClick={() => setSubmittedOverrideId(null)}
          >
            Submit a new request
          </Button>
        )}
      </div>
    );
  }

  if (submittedOverrideId && !submittedOverride && overridesLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking override status…
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-orange-200 bg-orange-50 p-3">
      <p className="text-sm font-medium text-orange-800 flex items-center gap-1">
        <Shield className="h-4 w-4" /> Request Supervisor Override
      </p>
      <p className="text-xs text-orange-700">
        Your clock-in is blocked because this work order&apos;s labor budget has been exhausted.
        Submit a request and a supervisor will approve or deny it.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-orange-800">Your Employee ID *</Label>
          <Input
            value={form.operatorEmployeeId}
            onChange={(e) => setForm({ ...form, operatorEmployeeId: e.target.value })}
            placeholder="e.g. EMP-001"
            className="mt-1 h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-orange-800">Your Name *</Label>
          <Input
            value={form.operatorDisplayName}
            onChange={(e) => setForm({ ...form, operatorDisplayName: e.target.value })}
            placeholder="First Last"
            className="mt-1 h-8 text-sm"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs text-orange-800">Additional hours needed *</Label>
        <Input
          type="number"
          min="0.5"
          max="24"
          step="0.5"
          value={form.requestedHours}
          onChange={(e) => setForm({ ...form, requestedHours: e.target.value })}
          className="mt-1 h-8 text-sm w-32"
        />
      </div>
      <div>
        <Label className="text-xs text-orange-800">Reason (optional)</Label>
        <Textarea
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="Why do you need additional hours?"
          rows={2}
          className="mt-1 text-sm"
        />
      </div>
      <Button
        size="sm"
        className="bg-orange-600 hover:bg-orange-700 text-white"
        onClick={() => requestMutation.mutate(form)}
        disabled={
          !form.operatorEmployeeId.trim() ||
          !form.operatorDisplayName.trim() ||
          !form.requestedHours ||
          requestMutation.isPending
        }
      >
        {requestMutation.isPending ? (
          <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Submitting…</>
        ) : (
          <><Send className="h-3 w-3 mr-1" /> Request Override</>
        )}
      </Button>
    </div>
  );
}

// ─── Supervisor override approval panel ─────────────────────────────────────

function OverrideApprovalsPanel({ woId }: { woId: string }) {
  const { toast } = useToast();
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolveForm, setResolveForm] = useState<{
    action: 'APPROVED' | 'DENIED';
    supervisorEmployeeId: string;
    supervisorNote: string;
    additionalHours: string;
  }>({ action: 'APPROVED', supervisorEmployeeId: '', supervisorNote: '', additionalHours: '8' });

  const { data: overrides = [], isLoading, refetch } = useQuery<LaborBudgetOverride[]>({
    queryKey: ['/api/work-orders/production', woId, 'budget-overrides'],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/production/${woId}/budget-overrides`);
      if (!res.ok) throw new Error('Failed to fetch overrides');
      return res.json();
    },
    refetchInterval: 15000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof resolveForm }) => {
      type ResolveBody = { action: string; supervisorEmployeeId: string; supervisorNote?: string; additionalHours?: number };
      const body: ResolveBody = { action: data.action, supervisorEmployeeId: data.supervisorEmployeeId };
      if (data.supervisorNote.trim()) body.supervisorNote = data.supervisorNote.trim();
      if (data.action === 'APPROVED' && data.additionalHours) {
        body.additionalHours = parseFloat(data.additionalHours);
      }
      return await apiRequest(`/api/work-orders/production/${woId}/budget-overrides/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (_, { data }) => {
      setResolvingId(null);
      setResolveForm({ action: 'APPROVED', supervisorEmployeeId: '', supervisorNote: '', additionalHours: '8' });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production', woId, 'budget-overrides'] });
      toast({
        title: data.action === 'APPROVED' ? 'Override approved' : 'Override denied',
        description: data.action === 'APPROVED'
          ? 'The operator can now clock in for the approved period.'
          : 'The operator has been notified that their request was denied.',
      });
    },
    onError: (err: Error) => {
      let message = err.message;
      try { const body = JSON.parse(err.message) as { message?: string }; if (body?.message) message = body.message; } catch { /* ignore */ }
      toast({ title: 'Failed to resolve override', description: message, variant: 'destructive' });
    },
  });

  const pending = overrides.filter(o => o.status === 'PENDING');
  const resolved = overrides.filter(o => o.status !== 'PENDING');

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Override Requests
            {pending.length > 0 && (
              <Badge className="bg-orange-100 text-orange-800 ml-1">{pending.length} pending</Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        <CardDescription>
          Operators blocked by budget exhaustion can request a shift-level unlock here
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {overrides.length === 0 && (
          <p className="text-sm text-gray-400">No override requests for this work order.</p>
        )}

        {pending.map(override => (
          <div key={override.id} className="rounded-md border border-orange-200 bg-orange-50 p-3 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{override.operatorDisplayName}</p>
                <p className="text-xs text-gray-500">
                  ID: {override.operatorEmployeeId} · Requested {parseFloat(override.requestedHours).toFixed(1)} hrs
                  · {formatDistanceToNow(new Date(override.requestedAt), { addSuffix: true })}
                </p>
                {override.note && (
                  <p className="text-xs text-gray-600 mt-1 italic">"{override.note}"</p>
                )}
              </div>
              <Badge className="bg-yellow-100 text-yellow-800 shrink-0">Pending</Badge>
            </div>

            {resolvingId === override.id ? (
              <div className="space-y-2 pt-2 border-t border-orange-200">
                <div>
                  <Label className="text-xs">Your Employee ID *</Label>
                  <Input
                    value={resolveForm.supervisorEmployeeId}
                    onChange={(e) => setResolveForm({ ...resolveForm, supervisorEmployeeId: e.target.value })}
                    placeholder="Supervisor employee ID"
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                {resolveForm.action === 'APPROVED' && (
                  <div>
                    <Label className="text-xs">Unlock hours (default = 8 hrs shift)</Label>
                    <Input
                      type="number"
                      min="0.5"
                      max="24"
                      step="0.5"
                      value={resolveForm.additionalHours}
                      onChange={(e) => setResolveForm({ ...resolveForm, additionalHours: e.target.value })}
                      className="mt-1 h-8 text-sm w-28"
                    />
                  </div>
                )}
                <div>
                  <Label className="text-xs">{resolveForm.action === 'DENIED' ? 'Denial reason *' : 'Note (optional)'}</Label>
                  <Textarea
                    value={resolveForm.supervisorNote}
                    onChange={(e) => setResolveForm({ ...resolveForm, supervisorNote: e.target.value })}
                    placeholder={resolveForm.action === 'DENIED' ? 'Explain why the request is denied…' : 'Optional note for operator…'}
                    rows={2}
                    className="mt-1 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResolvingId(null)}
                    disabled={resolveMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className={resolveForm.action === 'APPROVED' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
                    onClick={() => resolveMutation.mutate({ id: override.id, data: resolveForm })}
                    disabled={
                      !resolveForm.supervisorEmployeeId.trim() ||
                      (resolveForm.action === 'DENIED' && !resolveForm.supervisorNote.trim()) ||
                      resolveMutation.isPending
                    }
                  >
                    {resolveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                      resolveForm.action === 'APPROVED'
                        ? <><ShieldCheck className="h-3 w-3 mr-1" /> Confirm Approval</>
                        : <><ShieldX className="h-3 w-3 mr-1" /> Confirm Denial</>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white h-7 px-3 text-xs"
                  onClick={() => {
                    setResolvingId(override.id);
                    setResolveForm({ action: 'APPROVED', supervisorEmployeeId: '', supervisorNote: '', additionalHours: '8' });
                  }}
                >
                  <ShieldCheck className="h-3 w-3 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 px-3 text-xs"
                  onClick={() => {
                    setResolvingId(override.id);
                    setResolveForm({ action: 'DENIED', supervisorEmployeeId: '', supervisorNote: '', additionalHours: '8' });
                  }}
                >
                  <ShieldX className="h-3 w-3 mr-1" /> Deny
                </Button>
              </div>
            )}
          </div>
        ))}

        {resolved.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">History</p>
            {resolved.map(override => {
              const cfg = overrideStatusConfig[override.status];
              const Icon = cfg.icon;
              return (
                <div key={override.id} className={`rounded-md border px-3 py-2 text-sm ${cfg.className}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{override.operatorDisplayName}</span>
                    <div className="flex items-center gap-1 text-xs">
                      <Icon className="h-3 w-3" /> {cfg.label}
                    </div>
                  </div>
                  <p className="text-xs opacity-75 mt-0.5">
                    Requested {parseFloat(override.requestedHours).toFixed(1)} hrs ·{' '}
                    {override.resolvedAt ? `${override.status === 'APPROVED' ? 'Approved' : 'Denied'} by ${override.supervisorDisplayName} · ${formatDateTime(override.resolvedAt)}` : ''}
                    {override.status === 'APPROVED' && override.consumedAt && (
                      <span> · Used {formatDateTime(override.consumedAt)}</span>
                    )}
                    {override.status === 'APPROVED' && !override.consumedAt && override.expiresAt && (
                      <span> · Expires {formatDateTime(override.expiresAt)}</span>
                    )}
                  </p>
                  {override.supervisorNote && (
                    <p className="text-xs opacity-75 mt-0.5 italic">"{override.supervisorNote}"</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Types for Step 6 ───────────────────────────────────────────────────────

const PART_TYPES_LIST = [
  'Composite', 'CNC Machined', 'Assembly', 'Sub-Assembly',
  'Paint / Finish', 'Special Process', 'Shipping / Final Inspection Only',
];

const PRODUCTION_TYPES_LIST = [
  'New Part', 'Repeat Part', 'Revision Change', 'First Article', 'Rework', 'Prototype',
];

type ControlFlags = {
  routingRequired: boolean;
  travelerRequired: boolean;
  workInstructionRequired: boolean;
  specSheetRequired: boolean;
  finalQcOnly: boolean;
  inProcessInspectionRequired: boolean;
  spotCheckPlanRequired: boolean;
  certRequired: boolean;
};

type AIRecommendation = {
  flags: ControlFlags;
  reason: string;
  suggestedTemplates: Record<string, string | null>;
  suggestedTemplatesEnriched: Record<string, { id: string; name: string; version: number; templateType: string } | null>;
  availableTemplates: Array<{ id: string; name: string; templateType: string; routingType: string | null; version: number }>;
  confidenceScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
};

type WadProductionControls = {
  id: string;
  workOrderId: string;
  partType: string;
  productionType: string;
  routingRequired: boolean;
  travelerRequired: boolean;
  workInstructionRequired: boolean;
  specSheetRequired: boolean;
  finalQcOnly: boolean;
  inProcessInspectionRequired: boolean;
  spotCheckPlanRequired: boolean;
  certRequired: boolean;
  aiReason: string | null;
  aiConfidenceScore: string | null;
  aiRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  selectedTemplateIds: Record<string, string | null> | null;
  provisionedAt: string | null;
  provisionSummary: {
    artifacts: Array<{ type: string; id: string | null; templateName: string | null; templateVersion: number | null }>;
  } | null;
};

const CONTROL_FLAG_LABELS: Record<keyof ControlFlags, string> = {
  routingRequired: 'Routing Required',
  travelerRequired: 'Traveler Required',
  workInstructionRequired: 'Work Instruction Required',
  specSheetRequired: 'Spec Sheet Required',
  finalQcOnly: 'Final QC Only',
  inProcessInspectionRequired: 'In-Process Inspection',
  spotCheckPlanRequired: 'Spot Check Plan',
  certRequired: 'Cert Required',
};

const CONTROL_FLAG_KEYS: (keyof ControlFlags)[] = [
  'routingRequired', 'travelerRequired', 'workInstructionRequired', 'specSheetRequired',
  'finalQcOnly', 'inProcessInspectionRequired', 'spotCheckPlanRequired', 'certRequired',
];

const ARTIFACT_ICONS: Record<string, typeof Route> = {
  routing: Route,
  traveler: FileText,
  qc_plan: ClipboardCheck,
  work_instruction: BookOpen,
  spec_sheet: BookOpen,
};

const riskBadge: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-red-100 text-red-800',
};

// ─── Step 6 Production Control Card ─────────────────────────────────────────

const SUPERVISOR_ROLES_FE = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'];

function Step6ProductionControlCard({ wo }: { wo: { id: string; workOrderNumber: string; status: string } }) {
  const { toast } = useToast();
  const [partType, setPartType] = useState('');
  const [productionType, setProductionType] = useState('');
  const [recommendation, setRecommendation] = useState<AIRecommendation | null>(null);
  const [editingFlags, setEditingFlags] = useState(false);
  const [overrideFlags, setOverrideFlags] = useState<ControlFlags | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Record<string, string | null>>({});
  const [collapsed, setCollapsed] = useState(false);

  const { data: currentUser } = useQuery<{ id: number; username: string; role: string } | null>({
    queryKey: ['currentUser'],
  });
  const isSupervisorUser = currentUser ? SUPERVISOR_ROLES_FE.includes(currentUser.role) : false;

  // Check if already provisioned
  const { data: existingControls } = useQuery<WadProductionControls | null>({
    queryKey: ['/api/work-orders/production', wo.id, 'production-controls'],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/production/${wo.id}/production-controls`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    retry: false,
  });

  const recommendMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/work-orders/production/${wo.id}/production-controls/recommend`, {
        method: 'POST',
        body: JSON.stringify({ partType, productionType }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: (data: AIRecommendation) => {
      setRecommendation(data);
      setOverrideFlags({ ...data.flags });
      setSelectedTemplateIds({ ...data.suggestedTemplates } as Record<string, string | null>);
    },
    onError: (e: Error) => toast({ title: 'AI recommendation failed', description: e.message, variant: 'destructive' }),
  });

  const provisionMutation = useMutation({
    mutationFn: () => {
      const flags = overrideFlags ?? recommendation!.flags;
      return apiRequest(`/api/work-orders/production/${wo.id}/production-controls`, {
        method: 'POST',
        body: JSON.stringify({
          partType,
          productionType,
          ...flags,
          aiReason: recommendation?.reason ?? null,
          aiConfidenceScore: recommendation?.confidenceScore?.toFixed(2) ?? null,
          aiRiskLevel: recommendation?.riskLevel ?? null,
          selectedTemplateIds,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({ title: 'Production controls provisioned', description: 'Routing, traveler, and QC artifacts generated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production', wo.id, 'production-controls'] });
      setCollapsed(true);
    },
    onError: (e: Error) => {
      let msg = e.message;
      try { const b = JSON.parse(e.message) as { error?: string }; if (b.error) msg = b.error; } catch { /* ignore */ }
      toast({ title: 'Provisioning failed', description: msg, variant: 'destructive' });
    },
  });

  const flags = overrideFlags ?? recommendation?.flags;
  const riskLevel = recommendation?.riskLevel;
  const isHighRisk = riskLevel === 'HIGH';
  const isPlanned = wo.status === 'PLANNED';
  const isProvisioned = !!(existingControls?.provisionedAt);

  if (existingControls?.provisionedAt) {
    const summary = existingControls.provisionSummary;
    return (
      <Card className="border-green-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 text-green-800">
              <CheckCircle className="h-4 w-4" /> Step 6 — Production Controls (Provisioned)
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
          <CardDescription>
            {existingControls.partType} · {existingControls.productionType}
            {existingControls.aiRiskLevel && (
              <Badge className={`ml-2 ${riskBadge[existingControls.aiRiskLevel]}`}>
                {existingControls.aiRiskLevel} RISK
              </Badge>
            )}
          </CardDescription>
        </CardHeader>
        {!collapsed && (
          <CardContent className="space-y-3">
            {summary?.artifacts && summary.artifacts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Generated Artifacts</p>
                <div className="space-y-1.5">
                  {summary.artifacts.map((a, i) => {
                    const Icon = ARTIFACT_ICONS[a.type] ?? FileText;
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm bg-green-50 rounded px-3 py-2">
                        <Icon className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <span className="capitalize font-medium">{a.type.replace('_', ' ')}</span>
                        {a.templateName && (
                          <span className="text-gray-500 text-xs">
                            from <em>{a.templateName}</em> v{a.templateVersion}
                          </span>
                        )}
                        {a.id && (
                          <span className="font-mono text-xs text-gray-400 ml-auto truncate max-w-[140px]">{a.id}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {existingControls.aiReason && (
              <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-600 italic">
                "{existingControls.aiReason}"
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  }

  if (!isPlanned) return null;

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-blue-800">
          <Cpu className="h-4 w-4" /> Step 6 — Production Control Requirements
        </CardTitle>
        <CardDescription>
          AI-assisted selection of routing, traveler, and QC templates for this WAD
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Part Type + Production Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Part Type *</Label>
            <Select value={partType} onValueChange={setPartType}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select part type" />
              </SelectTrigger>
              <SelectContent>
                {PART_TYPES_LIST.map((pt) => (
                  <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Production Type *</Label>
            <Select value={productionType} onValueChange={setProductionType}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select production type" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCTION_TYPES_LIST.map((pt) => (
                  <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          variant="outline"
          disabled={!partType || !productionType || recommendMutation.isPending}
          onClick={() => recommendMutation.mutate()}
          className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          {recommendMutation.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Getting AI Recommendation…</>
            : <><Wand2 className="h-4 w-4 mr-2" /> Get AI Recommendation</>}
        </Button>

        {/* Recommendation Card */}
        {recommendation && flags && (
          <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">AI Recommendation</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Confidence: {Math.round(recommendation.confidenceScore * 100)}%
                </p>
              </div>
              <div className="flex gap-1.5">
                <Badge className={riskBadge[recommendation.riskLevel]}>
                  {recommendation.riskLevel} RISK
                </Badge>
              </div>
            </div>

            {/* Reason */}
            {recommendation.reason && (
              <p className="text-xs text-gray-600 bg-white rounded border px-3 py-2 italic">
                {recommendation.reason}
              </p>
            )}

            {/* Control Flags */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Control Flags</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => setEditingFlags(!editingFlags)}
                >
                  {editingFlags ? 'Done Editing' : 'Edit Requirements'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CONTROL_FLAG_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-2 text-xs bg-white rounded border px-2 py-1.5">
                    {editingFlags ? (
                      <Switch
                        checked={flags[key]}
                        onCheckedChange={(checked) => {
                          if (overrideFlags) setOverrideFlags({ ...overrideFlags, [key]: checked });
                        }}
                        className="scale-75"
                      />
                    ) : (
                      flags[key]
                        ? <CheckCircle className="h-3 w-3 text-green-600 shrink-0" />
                        : <XCircle className="h-3 w-3 text-gray-300 shrink-0" />
                    )}
                    <span className={flags[key] ? 'text-gray-800' : 'text-gray-400'}>{CONTROL_FLAG_LABELS[key]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested Templates */}
            {Object.keys(recommendation.suggestedTemplatesEnriched).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Suggested Templates</p>
                <div className="space-y-1.5">
                  {Object.entries(recommendation.suggestedTemplatesEnriched).map(([key, tmpl]) => {
                    const availableForType = (recommendation.availableTemplates ?? []).filter(
                      (t) => t.templateType.toLowerCase() === key.replace('_', '').toLowerCase() ||
                        t.templateType === key.toUpperCase() ||
                        t.templateType === key.toUpperCase().replace('_', '_')
                    );
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs bg-white rounded border px-2 py-1.5">
                        <span className="w-28 text-gray-500 capitalize shrink-0">{key.replace('_', ' ')}</span>
                        {availableForType.length > 0 ? (
                          <Select
                            value={selectedTemplateIds[key] ?? ''}
                            onValueChange={(v) => setSelectedTemplateIds((prev) => ({ ...prev, [key]: v || null }))}
                          >
                            <SelectTrigger className="h-6 text-xs flex-1">
                              <SelectValue placeholder="— none —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">— none —</SelectItem>
                              {availableForType.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name} v{t.version}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-gray-400 italic flex-1">
                            {tmpl ? `${tmpl.name} v${tmpl.version}` : 'No matching templates'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* HIGH RISK warning — shown to all users */}
            {isHighRisk && (
              <div className="flex items-start gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  HIGH risk WAD — {isSupervisorUser
                    ? 'you have supervisor authority to approve this WAD.'
                    : 'a supervisor or admin must approve this WAD. Contact your supervisor.'}
                </span>
              </div>
            )}

            {/* Approve & Generate — disabled for non-supervisors on HIGH risk */}
            <Button
              className="w-full bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={provisionMutation.isPending || (isHighRisk && !isSupervisorUser)}
              onClick={() => provisionMutation.mutate()}
              title={isHighRisk && !isSupervisorUser ? 'Supervisor or admin role required for HIGH risk WADs' : undefined}
            >
              {provisionMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
                : <><CheckCircle className="h-4 w-4 mr-2" /> Approve &amp; Generate</>}
            </Button>
            {isHighRisk && !isSupervisorUser && (
              <p className="text-xs text-red-600 text-center">
                This button is disabled — supervisor or admin role required to generate artifacts for HIGH risk WADs.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Labor Budget Card (enhanced) ───────────────────────────────────────────

function LaborBudgetCard({ woId }: { woId: string }) {
  const { data, isLoading, isError } = useQuery<LaborStatusResult | null>({
    queryKey: ['/api/work-orders', woId, 'labor-status'],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${woId}/labor-status`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch labor status');
      return res.json();
    },
    retry: false,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Labor Budget
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <Skeleton className="h-16 w-full" />}
        {isError && <p className="text-sm text-red-500">Unable to load labor status.</p>}
        {!isLoading && !isError && !data && (
          <p className="text-sm text-gray-400">No budget configured for this work order.</p>
        )}
        {!isLoading && !isError && data && data.totalBudget != null && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {data.totalHours.toFixed(1)} / {data.totalBudget.toFixed(1)} hrs
              </span>
              <Badge className={laborStatusConfig[data.status]?.badgeClass ?? ''}>
                {laborStatusConfig[data.status]?.label ?? data.status}
              </Badge>
            </div>
            <Progress
              value={Math.min(data.percentUsed ?? 0, 100)}
              className="h-2"
            />
            <p className="text-xs text-gray-400">
              {data.percentUsed != null ? `${data.percentUsed.toFixed(1)}% of budget used` : ''}
            </p>

            {data.status === 'WARNING' && (
              <div className="flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Approaching budget limit. Clock-in may be blocked soon.</span>
              </div>
            )}

            {data.status === 'BLOCKED' && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Labor budget exhausted. New clock-ins are blocked pending an override approval.</span>
              </div>
            )}
          </>
        )}

        {!isLoading && !isError && data && data.status === 'BLOCKED' && (
          <OverrideRequestPanel woId={woId} />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ProductionWorkOrderDetailPage({ params }: { params: { id: string } }) {
  const [, setLocation] = useLocation();
  const { id } = params;

  const { data: wo, isLoading } = useQuery<ProductionWorkOrder>({
    queryKey: ['/api/work-orders', id],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="p-6">
        <p className="text-red-500">Work order not found.</p>
        <Button variant="outline" className="mt-2" onClick={() => setLocation('/command-center')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  const deptBudgets = wo.departmentBudgets ? Object.entries(wo.departmentBudgets) : [];

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/command-center')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Command Center
        </Button>
        <h1 className="text-xl font-bold">{wo.workOrderNumber}</h1>
        <Badge className={statusColors[wo.status] ?? 'bg-gray-100 text-gray-800'}>
          {wo.status.replace('_', ' ')}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Work Order Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-y-2">
              <span className="text-gray-500 flex items-center gap-1">
                <Hash className="h-3 w-3" /> WO Number
              </span>
              <span className="font-mono font-medium">{wo.workOrderNumber}</span>

              <span className="text-gray-500 flex items-center gap-1">
                <Package className="h-3 w-3" /> Part Number
              </span>
              <span>{wo.partNumber ?? '—'}</span>

              <span className="text-gray-500">Project</span>
              <span className="font-mono text-xs">{wo.projectId ?? '—'}</span>

              <span className="text-gray-500">Quantity</span>
              <span>{wo.quantity ?? '—'}</span>

              {wo.description && (
                <>
                  <span className="text-gray-500 col-span-2">Description</span>
                  <span className="col-span-2 bg-gray-50 rounded p-2">{wo.description}</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-y-2">
              <span className="text-gray-500">Start Date</span>
              <span>{formatDate(wo.startDate)}</span>

              <span className="text-gray-500">Due Date</span>
              <span className={
                wo.dueDate && new Date(wo.dueDate) < new Date()
                  ? 'text-red-600 font-medium'
                  : ''
              }>
                {formatDate(wo.dueDate)}
              </span>

              <span className="text-gray-500">Created</span>
              <span>{formatDate(wo.createdAt)}</span>

              <span className="text-gray-500">Updated</span>
              <span>{formatDate(wo.updatedAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Step6ProductionControlCard wo={{ id: wo.id, workOrderNumber: wo.workOrderNumber, status: wo.status }} />

      <LaborBudgetCard woId={id} />

      {deptBudgets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Department Budgets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {deptBudgets.map(([dept, hours]) => (
                <div key={dept} className="text-sm bg-gray-50 rounded p-2">
                  <div className="text-gray-500 text-xs uppercase tracking-wide">{dept}</div>
                  <div className="font-semibold">{Number(hours).toFixed(1)} hrs</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <OverrideApprovalsPanel woId={id} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Audit History
          </CardTitle>
          <CardDescription>
            Timeline of release, labor approval, and override events for this work order
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditTimeline
            entityType="work_order"
            entityId={id}
            filterActions={[
              'WORK_ORDER_RELEASED',
              'LABOR_OVERRUN_APPROVED',
              'LABOR_BUDGET_OVERRIDE_REQUESTED',
              'LABOR_BUDGET_OVERRIDE_APPROVED',
              'LABOR_BUDGET_OVERRIDE_DENIED',
            ]}
            emptyMessage="No audit events recorded for this work order yet"
          />
        </CardContent>
      </Card>
    </div>
  );
}
