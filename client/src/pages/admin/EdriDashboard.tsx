import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import EdriSubNav from '@/components/EdriSubNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, RefreshCw, TrendingUp,
  TrendingDown, Activity, CheckCircle2, XCircle, Clock, BarChart3,
  FileWarning, Wrench, ChevronRight, AlertOctagon, SlidersHorizontal,
  Target, FileX2, Search, Bug, Eye, BookOpen, Shield, CalendarClock, Save, Timer
} from 'lucide-react';
import {
  topFlagBySeverity,
  computeDomainTarget,
  countTotalMissingEvidence,
  filterOpenItems,
  topP1Item,
  topFailureFlagForDashboard,
  DOMAIN_LABELS,
} from '@/lib/edriScorecard';

function formatTimeUntil(ms: number): string {
  if (ms <= 0) return 'imminently';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (minutes === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours} hr ${minutes} min`;
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return '—';
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const BAND_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  AUDIT_DEFENSIBLE: { label: 'Audit Defensible', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950', border: 'border-green-200 dark:border-green-800' },
  CONDITIONALLY_PASSABLE: { label: 'Conditionally Passable', color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950', border: 'border-yellow-200 dark:border-yellow-800' },
  HIGH_RISK: { label: 'High Risk', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950', border: 'border-orange-200 dark:border-orange-800' },
  MATERIAL_DEFICIENCY: { label: 'Material Deficiency', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950', border: 'border-red-200 dark:border-red-800' },
  AUDIT_FAILURE: { label: 'Audit Failure', color: 'text-red-900 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-950', border: 'border-red-400 dark:border-red-700' },
};


function getDomainColor(score: number): string {
  if (score >= 95) return 'bg-green-500';
  if (score >= 85) return 'bg-yellow-400';
  if (score >= 70) return 'bg-orange-500';
  if (score >= 55) return 'bg-red-500';
  return 'bg-red-900';
}

function getDomainBorderColor(score: number): string {
  if (score >= 95) return 'border-green-200 dark:border-green-800';
  if (score >= 85) return 'border-yellow-200 dark:border-yellow-800';
  if (score >= 70) return 'border-orange-200 dark:border-orange-800';
  if (score >= 55) return 'border-red-200 dark:border-red-800';
  return 'border-red-400 dark:border-red-700';
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const circumference = 2 * Math.PI * 45;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
          <circle
            cx="50" cy="50" r="45" fill="none" strokeWidth="8"
            strokeDasharray={`${dash} ${circumference}`}
            className={score >= 95 ? 'stroke-green-500' : score >= 85 ? 'stroke-yellow-400' : score >= 70 ? 'stroke-orange-500' : 'stroke-red-500'}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold">{Math.round(score)}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[severity] ?? 'bg-gray-100 text-gray-800'}`}>
      {severity}
    </span>
  );
}

interface ParsedEvidence {
  recordId: string;
  recordType: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeDisplay: string | null;
  workDate: string | null;
  punchedAt: string | null;
  violationText: string;
  extraDetail: string | null;
}

function parseEvidenceFromFinding(finding: { entityId: string; entityType: string; description: string; evidence?: any }): ParsedEvidence {
  const ev = finding.evidence && typeof finding.evidence === 'object' ? finding.evidence : null;

  const desc = finding.description;
  const parenEnd = desc.indexOf(')');
  const violationText = parenEnd >= 0 ? desc.slice(parenEnd + 1).replace(/^\s*[—–\-]\s*/, '').trim() : desc;

  if (ev && Object.keys(ev).length > 0) {
    const workDate = ev.workDate ?? (ev.punchedAt ? String(ev.punchedAt).split('T')[0] : null) ?? null;
    const employeeDisplay = ev.employeeName ?? (ev.employeeId ? `#${ev.employeeId}` : null);
    let extraDetail: string | null = null;
    if (ev.hoursRecorded != null) extraDetail = `${ev.hoursRecorded} hours recorded`;
    else if (ev.chargeCode) extraDetail = `Charge code: ${ev.chargeCode}`;
    else if (ev.editNote === null && 'editNote' in ev) extraDetail = 'No edit reason documented';
    return {
      recordId: finding.entityId,
      recordType: finding.entityType.replace(/_/g, ' '),
      employeeId: ev.employeeId != null ? String(ev.employeeId) : null,
      employeeName: ev.employeeName ?? null,
      employeeDisplay,
      workDate,
      punchedAt: ev.punchedAt ?? null,
      violationText: violationText || desc,
      extraDetail,
    };
  }

  const employeeMatch = desc.match(/employee\s+(\d+)/i);
  const dateMatch = desc.match(/(?:work date|date)\s+(\d{4}-\d{2}-\d{2})|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/i);
  const hoursMatch = desc.match(/(\d+(?:\.\d+)?)\s+hours/i);
  const chargeCodeMatch = desc.match(/charge code\s+'([^']+)'/i);
  let extraDetail: string | null = null;
  if (hoursMatch) extraDetail = `${hoursMatch[1]} hours recorded`;
  else if (chargeCodeMatch) extraDetail = `Charge code: ${chargeCodeMatch[1]}`;
  const employeeId = employeeMatch ? employeeMatch[1] : null;
  return {
    recordId: finding.entityId,
    recordType: finding.entityType.replace(/_/g, ' '),
    employeeId,
    employeeName: null,
    employeeDisplay: employeeId ? `#${employeeId}` : null,
    workDate: dateMatch ? (dateMatch[1] ?? dateMatch[2]?.split('T')[0] ?? null) : null,
    punchedAt: null,
    violationText: violationText || desc,
    extraDetail,
  };
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    P1_CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    P2_HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    P3_MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    P4_LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };
  const labels: Record<string, string> = { P1_CRITICAL: 'P1', P2_HIGH: 'P2', P3_MEDIUM: 'P3', P4_LOW: 'P4' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[priority] ?? 'bg-gray-100 text-gray-800'}`}>
      {labels[priority] ?? priority}
    </span>
  );
}


export default function EdriDashboard() {
  const { toast } = useToast();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideDomainKey, setOverrideDomainKey] = useState('');
  const [overrideScore, setOverrideScore] = useState('');
  const [overrideJustification, setOverrideJustification] = useState('');
  const [drilldownRuleId, setDrilldownRuleId] = useState<string | null>(null);
  const [drilldownDomainKey, setDrilldownDomainKey] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(true);
  const [scheduleTime, setScheduleTime] = useState<string>('02:30');
  const [scheduleInitialized, setScheduleInitialized] = useState(false);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ['/api/edri/snapshot/latest'],
  });

  const { data: session } = useQuery<any>({
    queryKey: ['/api/auth/session'],
  });

  const { data: overrides = [] } = useQuery<any[]>({
    queryKey: ['/api/edri/overrides'],
    enabled: session?.role === 'OWNER',
  });

  const { data: forensicSummary, refetch: refetchForensic } = useQuery<any>({
    queryKey: ['/api/forensic-audit/summary'],
  });

  const { data: lastAutomatedScan } = useQuery<{ hasRun: boolean; lastScan: { ranAt: string; summary: { newFindings: number; violationsClosed: number; rulesRun: number } } | null }>({
    queryKey: ['/api/forensic-audit/last-automated-scan'],
    refetchInterval: 60_000,
  });

  const { data: scheduleInfo } = useQuery<{
    scheduleExpression: string;
    intervalHours: number;
    lastComputedAt: string | null;
    nextRefreshAt: string;
    msUntilNext: number;
    isBehindSchedule: boolean;
  }>({
    queryKey: ['/api/edri/schedule'],
    refetchInterval: 60_000,
  });

  const { data: forensicRules = [] } = useQuery<any[]>({
    queryKey: ['/api/forensic-audit/rules'],
  });

  const isAdminOrOwner = session?.role === 'ADMIN' || session?.role === 'OWNER';

  const { data: scheduleConfig } = useQuery<{ isScheduleEnabled: boolean; scheduledTime: string }>({
    queryKey: ['/api/forensic-audit/schedule-config'],
    enabled: isAdminOrOwner,
  });

  const saveScheduleMutation = useMutation({
    mutationFn: (cfg: { isScheduleEnabled: boolean; scheduledTime: string }) =>
      apiRequest('PUT', '/api/forensic-audit/schedule-config', cfg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/schedule-config'] });
      toast({ title: 'Schedule saved', description: 'The forensic audit schedule has been updated.' });
    },
    onError: () => {
      toast({ title: 'Save failed', description: 'Could not update the forensic audit schedule.', variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (scheduleConfig && !scheduleInitialized) {
      setScheduleEnabled(scheduleConfig.isScheduleEnabled);
      setScheduleTime(scheduleConfig.scheduledTime);
      setScheduleInitialized(true);
    }
  }, [scheduleConfig, scheduleInitialized]);

  useEffect(() => {
    function handleScanComplete() {
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/last-automated-scan'] });
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/summary'] });
    }
    window.addEventListener('forensic_scan_complete', handleScanComplete);
    return () => window.removeEventListener('forensic_scan_complete', handleScanComplete);
  }, []);

  const { data: drilldownFindings, isLoading: drilldownLoading } = useQuery<any>({
    queryKey: ['/api/forensic-audit/findings', drilldownRuleId, 'active'],
    enabled: !!drilldownRuleId,
    queryFn: async () => {
      const params = new URLSearchParams({
        ruleId: drilldownRuleId!,
        status: 'open,acknowledged',
        pageSize: '200',
      });
      const res = await fetch(`/api/forensic-audit/findings?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch findings');
      return res.json();
    },
  });

  const updateFindingMutation = useMutation<unknown, Error, { id: number; status: 'acknowledged' | 'resolved' }>({
    mutationFn: async ({ id, status }) =>
      apiRequest('PATCH', `/api/forensic-audit/findings/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/findings', drilldownRuleId, 'active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/summary'] });
      toast({ title: 'Finding updated', description: 'The violation status has been saved.' });
    },
    onError: () => {
      toast({ title: 'Update failed', description: 'Could not update the finding status.', variant: 'destructive' });
    },
  });

  // Derived forensic counts — computed early so they're available in the empty state too
  const forensicTotalOpen: number = forensicSummary?.totalOpen ?? 0;
  const forensicCriticalOpen: number = forensicSummary?.criticalOpen ?? 0;
  const forensicHighOpen: number = forensicSummary?.highOpen ?? 0;

  const forensicScanMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/forensic-audit/run', {}),
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/findings'] });
      const s = data?.summary;
      const failNote = s?.rulesFailed > 0 ? ` · ${s.rulesFailed} rule${s.rulesFailed > 1 ? 's' : ''} failed (${s.failedRuleIds?.join(', ')})` : '';
      try {
        await apiRequest('POST', '/api/edri/recompute', {});
      } catch {
        // recompute failure is non-critical; snapshot will still refresh
      }
      queryClient.invalidateQueries({ queryKey: ['/api/edri/snapshot/latest'] });
      toast({
        title: s?.rulesFailed > 0 ? 'Forensic scan completed with errors' : 'Forensic scan complete',
        description: s ? `${s.rulesRun} rules run · ${s.newFindings} new violations · ${s.violationsClosed} closed${failNote}` : 'Scan finished.',
        variant: s?.rulesFailed > 0 ? 'destructive' : 'default',
      });
    },
    onError: () => toast({ title: 'Forensic scan failed', variant: 'destructive' }),
  });

  const computeMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/edri/compute', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/edri/snapshot/latest'] });
      toast({ title: 'EDRI score computed successfully' });
    },
    onError: () => toast({ title: 'Failed to compute score', variant: 'destructive' }),
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/edri/recompute', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/edri/snapshot/latest'] });
      toast({ title: 'EDRI score refreshed', description: 'The dashboard now reflects the latest data.' });
    },
    onError: () => toast({ title: 'Refresh failed', description: 'Could not refresh the EDRI score. Please try again.', variant: 'destructive' }),
  });

  const overrideMutation = useMutation({
    mutationFn: (payload: { domainKey: string; overrideScore: number; justification: string }) =>
      apiRequest('POST', '/api/edri/override', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/edri/snapshot/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/edri/overrides'] });
      toast({ title: 'Override applied — score will reflect next compute' });
      setOverrideDialogOpen(false);
      setOverrideDomainKey('');
      setOverrideScore('');
      setOverrideJustification('');
    },
    onError: () => toast({ title: 'Failed to apply override', variant: 'destructive' }),
  });

  function handleApplyOverride() {
    if (!overrideDomainKey || !overrideScore || !overrideJustification.trim()) {
      toast({ title: 'All fields are required for an override', variant: 'destructive' });
      return;
    }
    const score = parseFloat(overrideScore);
    if (isNaN(score) || score < 0 || score > 100) {
      toast({ title: 'Override score must be between 0 and 100', variant: 'destructive' });
      return;
    }
    if (overrideJustification.trim().length < 20) {
      toast({ title: 'Justification must be at least 20 characters', variant: 'destructive' });
      return;
    }
    overrideMutation.mutate({ domainKey: overrideDomainKey, overrideScore: score, justification: overrideJustification.trim() });
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No EDRI Data Available</h2>
        <p className="text-muted-foreground text-center max-w-md">
          No EDRI score snapshot has been computed yet. Click the button below to run the initial scoring.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button onClick={() => computeMutation.mutate()} disabled={computeMutation.isPending} size="lg">
            {computeMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Computing...</> : <><Activity className="h-4 w-4 mr-2" />Compute Initial Score</>}
          </Button>
          {(session?.role === 'ADMIN' || session?.role === 'OWNER') && (
            <Button
              size="lg"
              variant="outline"
              onClick={() => forensicScanMutation.mutate()}
              disabled={forensicScanMutation.isPending}
              className="border-purple-400 text-purple-700 dark:text-purple-300"
            >
              {forensicScanMutation.isPending
                ? <><Search className="h-4 w-4 mr-2 animate-spin" />Scanning...</>
                : <><Bug className="h-4 w-4 mr-2" />Run Forensic Scan</>}
            </Button>
          )}
        </div>
        {forensicTotalOpen > 0 && (
          <div className="mt-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-center">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {forensicTotalOpen} active forensic violation{forensicTotalOpen !== 1 ? 's' : ''} detected
              {forensicCriticalOpen > 0 && ` (${forensicCriticalOpen} critical)`}
            </p>
          </div>
        )}
      </div>
    );
  }

  const { snapshot, domainScores, redFlags, remediationItems } = data;
  const compositeScore = Number(snapshot.compositeScore);
  const subScore = Number(snapshot.subcontractorScore);
  const primeScore = Number(snapshot.primeScore);
  const futureScore = Number(snapshot.futureStateScore);
  const failureProbability = Number(snapshot.failureProbability);
  const band = snapshot.scoringBand;
  const bandConfig = BAND_CONFIG[band] ?? BAND_CONFIG['HIGH_RISK'];
  // Would Fail Today: red if composite score < 70 OR any forensic critical violation is open
  const wouldFailDueToScore = compositeScore < 70;
  const wouldFailDueToForensic = (forensicSummary?.criticalOpen ?? 0) > 0;
  const wouldPass = !wouldFailDueToScore && !wouldFailDueToForensic;

  const activeRedFlags = redFlags?.filter((f: any) => f.isActive) ?? [];
  const criticalFlags = activeRedFlags.filter((f: any) => f.severity === 'CRITICAL');
  const highFlags = activeRedFlags.filter((f: any) => f.severity === 'HIGH');
  const openItems = filterOpenItems(remediationItems ?? []);
  const p1Items = openItems.filter((r: any) => r.priority === 'P1_CRITICAL').length;
  const p2Items = openItems.filter((r: any) => r.priority === 'P2_HIGH').length;
  const p3Items = openItems.filter((r: any) => r.priority === 'P3_MEDIUM').length;

  // Auditor scorecard — composite-level derived fields
  // Verdict card: failure reason is the top CRITICAL or HIGH flag only (lower severity = not a pass-blocking failure)
  const topFailureFlag = topFailureFlagForDashboard(activeRedFlags);
  const topP1 = topP1Item(openItems);

  // Count all SCORER_UNAVAILABLE evidence items across all domains
  const totalEvidenceMissing = countTotalMissingEvidence(domainScores ?? []);

  const domainScoreMap: Record<string, number> = {};
  if (snapshot.domainScores) {
    for (const [k, v] of Object.entries(snapshot.domainScores as Record<string, number>)) {
      domainScoreMap[k] = Number(v);
    }
  }

  // Build per-domain lookup maps for the five-field scorecard
  const domainFlagsMap: Record<string, any[]> = {};
  const domainRemMap: Record<string, any[]> = {};
  const domainEvidenceMissingMap: Record<string, number> = {};
  const domainWeightMap: Record<string, number> = {};

  for (const flag of activeRedFlags) {
    if (!domainFlagsMap[flag.domainKey]) domainFlagsMap[flag.domainKey] = [];
    domainFlagsMap[flag.domainKey].push(flag);
  }
  for (const item of openItems) {
    if (!domainRemMap[item.domainKey]) domainRemMap[item.domainKey] = [];
    domainRemMap[item.domainKey].push(item);
  }
  for (const ds of (domainScores ?? [])) {
    const items: Array<{ label: string; value: unknown }> = ds.evidenceItems ?? [];
    domainEvidenceMissingMap[ds.domainKey] = items.filter(ev => ev.value === 'SCORER_UNAVAILABLE').length;
    domainWeightMap[ds.domainKey] = Number(ds.weight ?? 0);
  }

  // Build per-domain forensic violation counts from byRule summary
  const domainViolationCountMap: Record<string, number> = {};
  for (const rule of (forensicSummary?.byRule ?? [])) {
    if (rule.open > 0) {
      const dk = (rule.domain ?? '').toUpperCase();
      domainViolationCountMap[dk] = (domainViolationCountMap[dk] ?? 0) + rule.open;
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <EdriSubNav />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">EDRI Dashboard</h1>
            <Badge variant="outline" className="text-xs ml-2">EPOCH DCAA Readiness Index</Badge>
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            Last updated:{' '}
            <span
              title={snapshot.computedAt ? new Date(snapshot.computedAt).toLocaleString() : ''}
              className="cursor-default"
            >
              {formatRelativeTime(snapshot.computedAt)}
            </span>
            {snapshot.isOverride && <span className="ml-1 text-orange-500">(Override Applied)</span>}
          </p>
          {scheduleInfo && (
            <p className={`mt-0.5 flex items-center gap-1.5 text-sm ${scheduleInfo.isBehindSchedule ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
              {scheduleInfo.isBehindSchedule
                ? <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                : <Timer className="h-3.5 w-3.5 flex-shrink-0" />
              }
              {scheduleInfo.isBehindSchedule
                ? <span>Auto-refresh is overdue — next scheduled update expected</span>
                : <span>Next automatic refresh in{' '}
                    <span
                      title={`Scheduled at ${new Date(scheduleInfo.nextRefreshAt).toLocaleString()}`}
                      className="font-medium cursor-default"
                    >
                      {formatTimeUntil(scheduleInfo.msUntilNext)}
                    </span>
                  </span>
              }
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" asChild><Link href="/admin/edri/history">My Score History</Link></Button>
          {(session?.role === 'ADMIN' || session?.role === 'OWNER') && (
            <Button
              variant="outline"
              onClick={() => forensicScanMutation.mutate()}
              disabled={forensicScanMutation.isPending}
              className="border-purple-400 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950"
            >
              {forensicScanMutation.isPending
                ? <><Search className="h-4 w-4 mr-2 animate-spin" />Scanning...</>
                : <><Bug className="h-4 w-4 mr-2" />Run Forensic Scan</>}
            </Button>
          )}
          {(session?.role === 'ADMIN' || session?.role === 'OWNER') && (
            <Button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending
                ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Refreshing...</>
                : <><RefreshCw className="h-4 w-4 mr-2" />Refresh Now</>}
            </Button>
          )}
        </div>
      </div>

      {/* Would We Pass Today? — Auditor-Grade Verdict Card */}
      <div className={`rounded-lg border-2 p-5 ${wouldPass ? 'border-green-300 bg-green-50 dark:bg-green-950' : 'border-red-300 bg-red-50 dark:bg-red-950'}`}>
        <div className="flex items-center gap-4 mb-4">
          {wouldPass
            ? <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400 flex-shrink-0" />
            : <XCircle className="h-10 w-10 text-red-600 dark:text-red-400 flex-shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className={`text-2xl font-bold ${wouldPass ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                Would Fail Audit Today? {wouldPass ? 'NO — Conditionally Ready' : 'YES — Not Audit Ready'}
              </h2>
              {forensicTotalOpen > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border border-red-300 dark:border-red-700">
                  <Bug className="h-3.5 w-3.5" />
                  {forensicTotalOpen} Active Violations
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-1">
              <p className="text-sm text-muted-foreground">
                Audit Risk Level: <span className={`font-semibold ${bandConfig.color}`}>{bandConfig.label}</span>
              </p>
              {wouldFailDueToForensic && (
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                  {forensicCriticalOpen} critical forensic violation{forensicCriticalOpen !== 1 ? 's' : ''} blocking audit clearance
                </p>
              )}
              {wouldFailDueToScore && !wouldFailDueToForensic && (
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                  Score {compositeScore.toFixed(1)} is below the 70-point minimum
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Five auditor scorecard fields */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-4 border-t border-current/10">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <Activity className="h-3 w-3" /> Current Score
            </p>
            <p className={`text-2xl font-bold ${wouldPass ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {compositeScore.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">composite</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <Target className="h-3 w-3" /> Compliance Thresholds
            </p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400">70</p>
              <p className="text-xs text-muted-foreground">floor</p>
              <span className="text-muted-foreground/40 mx-0.5">·</span>
              <p className="text-xl font-bold text-green-700 dark:text-green-400">85</p>
              <p className="text-xs text-muted-foreground">target</p>
            </div>
            <p className="text-xs text-muted-foreground">min compliance · audit-defensible</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <AlertOctagon className="h-3 w-3" /> Failure Reason
            </p>
            {topFailureFlag ? (
              <>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300 leading-tight">{topFailureFlag.title}</p>
                {topFailureFlag.farCitation && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">{topFailureFlag.farCitation}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">None — no critical flags active</p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <FileX2 className="h-3 w-3" /> Evidence Missing
            </p>
            <p className={`text-2xl font-bold ${totalEvidenceMissing > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
              {totalEvidenceMissing}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalEvidenceMissing === 0 ? 'all evidence verified' : 'data points unavailable'}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <Wrench className="h-3 w-3" /> Remediation Required
            </p>
            <p className={`text-2xl font-bold ${openItems.length > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
              {openItems.length}
            </p>
            {topP1 ? (
              <p className="text-xs text-muted-foreground truncate" title={topP1.title}>
                {topP1.priority === 'P1_CRITICAL' ? 'P1' : 'P2'}: {topP1.title}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">open items</p>
            )}
          </div>
        </div>
      </div>

      {/* Score overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="md:col-span-2 flex items-center justify-around p-6">
          <ScoreGauge score={compositeScore} label="Composite Score" />
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Current State</p>
              <p className="text-3xl font-bold">{compositeScore.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Future State (if remediated)</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{futureScore.toFixed(1)}</p>
              {futureScore > compositeScore && (
                <p className="text-xs text-green-600">+{(futureScore - compositeScore).toFixed(1)} potential improvement</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Failure Probability</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-4xl font-bold ${failureProbability > 50 ? 'text-red-600' : failureProbability > 25 ? 'text-orange-500' : 'text-green-600'}`}>
              {failureProbability.toFixed(0)}%
            </p>
            <Progress value={failureProbability} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {criticalFlags.length} critical, {highFlags.length} high flags
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Dual Readiness Scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Subcontractor</span>
                <span className="font-bold">{subScore.toFixed(1)}</span>
              </div>
              <Progress value={subScore} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Prime Contractor</span>
                <span className="font-bold">{primeScore.toFixed(1)}</span>
              </div>
              <Progress value={primeScore} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Domain scorecards — five-field per domain */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Domain Scores</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/edri/heatmap">View Heatmap <ChevronRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(DOMAIN_LABELS).filter(([k]) => k !== 'GOVT_PROPERTY').map(([key, label]) => {
            const scoreRaw = domainScoreMap[key];
            if (scoreRaw === undefined) {
              return (
                <Link key={key} href={`/admin/edri/domain/${key}`}>
                  <div className="rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow border border-muted bg-card">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
                        <p className="text-sm font-semibold">{label}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">— Score data unavailable</p>
                  </div>
                </Link>
              );
            }
            const score = Number(scoreRaw);
            const domainWeight = domainWeightMap[key] ?? 0;
            const domainTarget = computeDomainTarget(compositeScore, score, domainWeight);
            const domainTopFlag = topFlagBySeverity(domainFlagsMap[key] ?? []);
            const domainOpenCount = (domainRemMap[key] ?? []).length;
            const domainEvidMissing = domainEvidenceMissingMap[key] ?? 0;
            const domainTopP1 = (domainRemMap[key] ?? []).find((r: any) => r.priority === 'P1_CRITICAL')
              ?? (domainRemMap[key] ?? []).find((r: any) => r.priority === 'P2_HIGH')
              ?? null;

            // Count forensic rules that cover this domain.
            // Currently only TIMEKEEPING has deep forensic rule coverage (TK-001 through TK-009).
            // Other domains have scoring-model coverage but forensic enforcement rules are in development.
            const domainForensicRuleCount = forensicRules.filter(
              (r: any) => (r.domain ?? '').toUpperCase() === key
            ).length;

            return (
              <Link key={key} href={`/admin/edri/domain/${key}`}>
                <div className={`rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow border ${getDomainBorderColor(score)} bg-card`}>
                  {/* Domain header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${getDomainColor(score)}`} />
                      <p className="text-sm font-semibold">{label}</p>
                      {(() => {
                        const violCount = domainViolationCountMap[key] ?? 0;
                        if (violCount === 0) return null;
                        return (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDrilldownDomainKey(key);
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border border-purple-300 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                            title={`${violCount} open forensic violation${violCount !== 1 ? 's' : ''} — click to view`}
                          >
                            <Bug className="h-3 w-3" />
                            {violCount}
                          </button>
                        );
                      })()}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Score bar */}
                  <div className="mb-3">
                    <div className="flex items-end justify-between mb-1">
                      <span className="text-2xl font-bold">{score.toFixed(0)}</span>
                      <span className="text-xs text-muted-foreground">target: {domainTarget.toFixed(0)}</span>
                    </div>
                    <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`absolute inset-y-0 left-0 rounded-full ${getDomainColor(score)}`} style={{ width: `${score}%` }} />
                      <div className="absolute inset-y-0 border-l-2 border-foreground/40" style={{ left: `${domainTarget}%` }} />
                    </div>
                  </div>

                  {/* Five scorecard fields */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                        <Target className="h-3 w-3" /> Target
                      </span>
                      <span className={`font-medium ${score >= domainTarget ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {score >= domainTarget ? `✓ Met (${domainTarget.toFixed(0)})` : `${(domainTarget - score).toFixed(0)} pts below ${domainTarget.toFixed(0)}`}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                          <AlertOctagon className="h-3 w-3" /> Failure Reason
                        </span>
                        {domainTopFlag ? (
                          <span className="font-medium text-red-600 dark:text-red-400 text-right truncate max-w-[60%]" title={domainTopFlag.title}>
                            {domainTopFlag.title}
                          </span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400 font-medium">None</span>
                        )}
                      </div>
                      {domainTopFlag?.farCitation && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-mono text-right">{domainTopFlag.farCitation}</p>
                      )}
                    </div>

                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                        <FileX2 className="h-3 w-3" /> Evidence Missing
                      </span>
                      <span className={`font-medium ${domainEvidMissing > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                        {domainEvidMissing === 0 ? 'None' : `${domainEvidMissing} item${domainEvidMissing > 1 ? 's' : ''}`}
                      </span>
                    </div>

                    <div className="flex justify-between items-start gap-2">
                      <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                        <Wrench className="h-3 w-3" /> Remediation
                      </span>
                      {domainOpenCount > 0 ? (
                        <span className="text-orange-600 dark:text-orange-400 font-medium text-right">
                          {domainOpenCount} open{domainTopP1 ? ` · ${domainTopP1.priority === 'P1_CRITICAL' ? 'P1' : 'P2'}: ${domainTopP1.title.slice(0, 30)}${domainTopP1.title.length > 30 ? '…' : ''}` : ''}
                        </span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400 font-medium">None</span>
                      )}
                    </div>

                    <div className="flex justify-between items-center gap-2 pt-1 border-t border-muted/50 mt-1">
                      <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                        <Bug className="h-3 w-3" /> Forensic Rules
                      </span>
                      {domainForensicRuleCount > 0 ? (
                        <span className="font-medium text-purple-600 dark:text-purple-400">
                          {domainForensicRuleCount} active
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">In progress</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {/* GOVT_PROPERTY — 0-weight optional domain, shown as disabled */}
          <div className="rounded-lg p-4 border border-dashed border-muted-foreground/30 opacity-50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-muted" />
              <p className="text-sm font-semibold">{DOMAIN_LABELS['GOVT_PROPERTY']}</p>
            </div>
            <p className="text-xs text-muted-foreground italic">Not Implemented</p>
            <p className="text-xs text-muted-foreground">Weight: 0% — deferred domain</p>
          </div>
        </div>
      </div>

      {/* Procurement Population Callout */}
      {(() => {
        const procDomain = (domainScores ?? []).find((ds: any) => ds.domainKey === 'PROCUREMENT');
        const evItems: Array<{ label: string; value: unknown }> = procDomain?.evidenceItems ?? [];
        const getEv = (label: string) => evItems.find((e) => e.label === label)?.value;

        const effectiveDate = getEv('Compliance Effective Date (enforcement begins)');
        const totalAll = getEv('Total issued POs (all populations)');
        const totalLegacy = getEv('Legacy pre-policy POs (pre-date, not exception-flagged)');
        const totalException = getEv('Legacy POs promoted to enforcement (exception-flagged)');
        const enforced = getEv('Enforced POs evaluated (post-effective-date + exception-flagged)');

        if (!effectiveDate) return null;

        const enforcedNum = Number(enforced ?? 0);
        const legacyNum = Number(totalLegacy ?? 0);
        const exceptionNum = Number(totalException ?? 0);
        const totalNum = Number(totalAll ?? 0);

        return (
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <Shield className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">Procurement Enforcement Scope</span>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-xl font-bold text-blue-800 dark:text-blue-300">{enforcedNum}</p>
                  <p className="text-xs text-blue-700 dark:text-blue-400">Enforced POs</p>
                  <p className="text-xs text-muted-foreground">(scored by ERDI)</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{legacyNum}</p>
                  <p className="text-xs text-amber-800 dark:text-amber-300">Legacy Pre-Policy</p>
                  <p className="text-xs text-muted-foreground">(excluded from score)</p>
                </div>
                {exceptionNum > 0 && (
                  <div>
                    <p className="text-xl font-bold text-orange-700 dark:text-orange-400">{exceptionNum}</p>
                    <p className="text-xs text-orange-800 dark:text-orange-300">Exception-Flagged</p>
                    <p className="text-xs text-muted-foreground">(legacy → enforced)</p>
                  </div>
                )}
                <div>
                  <p className="text-xl font-bold text-foreground">{totalNum}</p>
                  <p className="text-xs text-muted-foreground">Total Issued POs</p>
                  <p className="text-xs text-muted-foreground">(all populations)</p>
                </div>
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-400 shrink-0 text-right">
                <CalendarClock className="h-3 w-3 inline mr-0.5" />
                Effective date: <strong>{String(effectiveDate)}</strong>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              POs issued before <strong>{String(effectiveDate)}</strong> are classified as legacy pre-policy transactions and are not counted against the ERDI Procurement score unless individually flagged for Exception Review.
            </p>
          </div>
        );
      })()}

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top critical red flags */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertOctagon className="h-5 w-5 text-red-500" />
                Critical Red Flags
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/edri/red-flags">View All <ChevronRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {criticalFlags.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm">No critical flags detected</span>
              </div>
            ) : (
              <div className="space-y-2">
                {criticalFlags.slice(0, 3).map((flag: any) => (
                  <div key={flag.id} className="flex items-start gap-3 p-2 rounded-md bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900">
                    <AlertOctagon className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{flag.title}</p>
                      <p className="text-xs text-muted-foreground">{DOMAIN_LABELS[flag.domainKey] ?? flag.domainKey} · {flag.farCitation}</p>
                    </div>
                  </div>
                ))}
                {criticalFlags.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">+{criticalFlags.length - 3} more critical flags</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Remediation queue summary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-blue-500" />
                Remediation Queue
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/edri/remediation">View All <ChevronRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            </div>
            <CardDescription>{openItems.length} open items</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: 'P1 Critical', count: p1Items, color: 'bg-red-500' },
                { label: 'P2 High', count: p2Items, color: 'bg-orange-500' },
                { label: 'P3 Medium', count: p3Items, color: 'bg-yellow-500' },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${color}`} />
                  <span className="text-sm flex-1">{label}</span>
                  <span className="font-bold text-sm">{count}</span>
                  <div className="w-24 bg-muted rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${color}`} style={{ width: openItems.length > 0 ? `${(count / openItems.length) * 100}%` : '0%' }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t grid grid-cols-4 gap-3 text-center">
              <Link href="/admin/edri/missing-evidence">
                <div className="group hover:bg-muted rounded-md p-2 cursor-pointer transition-colors">
                  <FileWarning className="h-5 w-5 mx-auto text-muted-foreground group-hover:text-foreground" />
                  <p className="text-xs mt-1 text-muted-foreground group-hover:text-foreground">Missing Evidence</p>
                </div>
              </Link>
              <Link href="/admin/edri/heatmap">
                <div className="group hover:bg-muted rounded-md p-2 cursor-pointer transition-colors">
                  <BarChart3 className="h-5 w-5 mx-auto text-muted-foreground group-hover:text-foreground" />
                  <p className="text-xs mt-1 text-muted-foreground group-hover:text-foreground">Heatmap</p>
                </div>
              </Link>
              <Link href="/admin/edri/history">
                <div className="group hover:bg-muted rounded-md p-2 cursor-pointer transition-colors">
                  <Activity className="h-5 w-5 mx-auto text-muted-foreground group-hover:text-foreground" />
                  <p className="text-xs mt-1 text-muted-foreground group-hover:text-foreground">My Score History</p>
                </div>
              </Link>
              <Link href="/admin/edri/executive-matrix">
                <div className="group hover:bg-muted rounded-md p-2 cursor-pointer transition-colors">
                  <Target className="h-5 w-5 mx-auto text-amber-500 group-hover:text-amber-600" />
                  <p className="text-xs mt-1 text-muted-foreground group-hover:text-foreground leading-tight">Executive Readiness Matrix</p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Forensic Audit Violations Panel */}
      {forensicSummary && (forensicTotalOpen > 0 || forensicSummary.byRule?.length > 0 || lastAutomatedScan?.hasRun) && (
        <div className="rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h3 className="font-semibold text-purple-700 dark:text-purple-300">Forensic Audit Violations</h3>
              <Badge variant="outline" className="text-purple-600 border-purple-400 text-xs">TIMEKEEPING</Badge>
            </div>
            <div className="flex items-center gap-2">
              {forensicCriticalOpen > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                  {forensicCriticalOpen} Critical
                </span>
              )}
              {forensicHighOpen > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                  {forensicHighOpen} High
                </span>
              )}
              {forensicSummary?.mediumOpen > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                  {forensicSummary.mediumOpen} Medium
                </span>
              )}
              {forensicTotalOpen === 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <CheckCircle2 className="h-3 w-3" /> No Open Violations
                </span>
              )}
            </div>
          </div>

          {/* Forensic domain coverage maturity — honest about where rule depth exists today */}
          <div className="flex items-start gap-2 text-xs bg-purple-100/60 dark:bg-purple-900/30 rounded p-2.5 border border-purple-200 dark:border-purple-700">
            <Shield className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400 mt-0.5 flex-shrink-0" />
            <span className="text-purple-700 dark:text-purple-300">
              <strong>Coverage:</strong> Forensic enforcement is deepest in Timekeeping
              {forensicRules.length > 0 ? ` (${forensicRules.filter((r: any) => (r.domain ?? '').toUpperCase() === 'TIMEKEEPING').length} of ${forensicRules.length} active rules)` : ''}.
              {' '}Accounting, Procurement, Inventory, and Policy domains use scoring-model readiness today — independent forensic rule sets for those domains are in development.
            </span>
          </div>

          {forensicSummary?.byRule?.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {forensicSummary.byRule.filter((r: any) => r.open > 0).map((rule: any) => (
                <button
                  key={rule.ruleId}
                  onClick={() => setDrilldownRuleId(rule.ruleId)}
                  className="flex items-start gap-2 bg-white dark:bg-gray-900 rounded p-2.5 border border-purple-100 dark:border-purple-800 text-sm w-full text-left hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-sm transition-all group"
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    rule.severity === 'critical' ? 'bg-red-500' :
                    rule.severity === 'high' ? 'bg-orange-500' :
                    rule.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-400'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-muted-foreground">{rule.ruleId}</p>
                    <p className="font-medium text-foreground">{rule.open} open violation{rule.open !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-muted-foreground capitalize">{rule.severity} · {rule.domain}</p>
                  </div>
                  <Eye className="h-3.5 w-3.5 text-muted-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 mt-0.5 flex-shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No forensic violations found. Run a forensic scan to detect evidence-based compliance violations.</p>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3">
            {(session?.role === 'ADMIN' || session?.role === 'OWNER') && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-purple-400 text-purple-700 dark:text-purple-300"
                  onClick={() => forensicScanMutation.mutate()}
                  disabled={forensicScanMutation.isPending}
                >
                  {forensicScanMutation.isPending
                    ? <><Search className="h-3.5 w-3.5 mr-1.5 animate-spin" />Scanning...</>
                    : <><Bug className="h-3.5 w-3.5 mr-1.5" />Re-run Scan</>}
                </Button>
                <Link href="/admin/dcaa-findings">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-purple-400 text-purple-700 dark:text-purple-300"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Review All Findings
                  </Button>
                </Link>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              {lastAutomatedScan?.hasRun && lastAutomatedScan.lastScan ? (
                <span>
                  Auto-scan: {new Date(lastAutomatedScan.lastScan.ranAt).toLocaleString()} &mdash; {lastAutomatedScan.lastScan.summary.newFindings} new, {lastAutomatedScan.lastScan.summary.violationsClosed} closed
                </span>
              ) : (
                <span className="text-muted-foreground">
                No automated scan has run yet
                {scheduleConfig
                  ? scheduleConfig.isScheduleEnabled
                    ? ` (scheduled daily at ${scheduleConfig.scheduledTime})`
                    : ' (automated scan is currently disabled)'
                  : ' (scheduled nightly at 02:30)'}
              </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forensic Audit Schedule Settings — Admin/Owner only */}
      {isAdminOrOwner && (
        <div className="rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-950 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <h3 className="font-semibold text-purple-700 dark:text-purple-300">Forensic Audit Schedule</h3>
            <Badge variant="outline" className="text-purple-600 border-purple-400 text-xs">ADMIN</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure when the automated nightly DCAA forensic scan runs. Changes take effect immediately — no server restart required.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Automated Scan</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={scheduleEnabled ? 'default' : 'outline'}
                  className={scheduleEnabled ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
                  onClick={() => setScheduleEnabled(true)}
                >
                  Enabled
                </Button>
                <Button
                  size="sm"
                  variant={!scheduleEnabled ? 'default' : 'outline'}
                  className={!scheduleEnabled ? 'bg-gray-500 hover:bg-gray-600 text-white' : ''}
                  onClick={() => setScheduleEnabled(false)}
                >
                  Disabled
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="forensicScheduleTime" className="text-sm font-medium">Run Time (HH:MM, 24-hour)</Label>
              <Input
                id="forensicScheduleTime"
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                disabled={!scheduleEnabled}
                className="w-36"
              />
            </div>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={saveScheduleMutation.isPending}
              onClick={() => saveScheduleMutation.mutate({ isScheduleEnabled: scheduleEnabled, scheduledTime: scheduleTime })}
            >
              {saveScheduleMutation.isPending
                ? <><Save className="h-3.5 w-3.5 mr-1.5 animate-pulse" />Saving…</>
                : <><Save className="h-3.5 w-3.5 mr-1.5" />Save Schedule</>}
            </Button>
          </div>
          {scheduleConfig && (
            <p className="text-xs text-muted-foreground">
              Current server setting: {scheduleConfig.isScheduleEnabled
                ? `Enabled — runs daily at ${scheduleConfig.scheduledTime}`
                : 'Disabled'}
            </p>
          )}
        </div>
      )}

      {/* OWNER-only: Admin Override Panel */}
      {session?.role === 'OWNER' && (
        <div className="border-2 border-orange-300 dark:border-orange-700 rounded-lg p-5 space-y-4 bg-orange-50 dark:bg-orange-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <h3 className="font-semibold text-orange-700 dark:text-orange-300">Owner Score Overrides</h3>
              <Badge variant="outline" className="text-orange-600 border-orange-400 text-xs">OWNER ONLY</Badge>
            </div>
            <Button size="sm" variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900" onClick={() => setOverrideDialogOpen(true)}>
              Apply Override
            </Button>
          </div>
          <p className="text-sm text-orange-700 dark:text-orange-300">
            Overrides allow you to manually set a domain score and will be factored into the next composite computation. Each override requires a mandatory written justification for audit trail purposes.
          </p>
          {overrides.length > 0 ? (
            <div className="space-y-2">
              {overrides.slice(0, 5).map((ov: any) => (
                <div key={ov.id} className="flex items-center gap-3 text-sm bg-white dark:bg-gray-900 rounded p-2 border border-orange-200 dark:border-orange-800">
                  <Badge variant="outline" className="text-xs">{ov.domainKey}</Badge>
                  <span className="font-mono font-bold">{Number(ov.overrideScore).toFixed(1)}</span>
                  <span className="flex-1 text-muted-foreground truncate">{ov.justification}</span>
                  <span className="text-xs text-muted-foreground">{ov.appliedAt ? new Date(ov.appliedAt).toLocaleDateString() : ''}</span>
                  {ov.isActive && <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-300">Active</Badge>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No overrides applied yet.</p>
          )}
        </div>
      )}

      {/* Forensic Violation Drilldown Dialog */}
      <Dialog open={!!drilldownRuleId} onOpenChange={(open) => { if (!open) setDrilldownRuleId(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          {(() => {
            const ruleMeta = forensicRules.find((r: any) => r.ruleId === drilldownRuleId);
            const findings: any[] = drilldownFindings?.findings ?? [];
            const total: number = drilldownFindings?.total ?? 0;
            const severityColor =
              ruleMeta?.severity === 'critical' ? 'text-red-600 dark:text-red-400' :
              ruleMeta?.severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
              ruleMeta?.severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
              'text-blue-600 dark:text-blue-400';
            return (
              <>
                <DialogHeader className="flex-shrink-0">
                  <div className="flex items-start gap-3">
                    <Bug className="h-5 w-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <DialogTitle className="text-lg font-semibold">
                          Violation Evidence: {drilldownRuleId}
                        </DialogTitle>
                        {ruleMeta?.severity && (
                          <span className={`text-xs font-semibold uppercase ${severityColor}`}>{ruleMeta.severity}</span>
                        )}
                      </div>
                      {ruleMeta?.description && (
                        <p className="text-sm text-muted-foreground mt-1 leading-snug">{ruleMeta.description}</p>
                      )}
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-4 min-h-0">
                  {ruleMeta && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-shrink-0">
                      {ruleMeta.farCitation && (
                        <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <BookOpen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">FAR Citation</span>
                          </div>
                          <p className="text-sm font-mono font-bold text-blue-800 dark:text-blue-200">{ruleMeta.farCitation}</p>
                        </div>
                      )}
                      {ruleMeta.remediationGuidance && (
                        <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Wrench className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Remediation</span>
                          </div>
                          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{ruleMeta.remediationGuidance}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">
                      Violating Records
                    </h3>
                    {!drilldownLoading && (
                      <span className="text-xs text-muted-foreground">
                        {total} open/acknowledged record{total !== 1 ? 's' : ''} triggering this rule
                      </span>
                    )}
                  </div>

                  <ScrollArea className="flex-1 border rounded-md">
                    {drilldownLoading ? (
                      <div className="p-4 space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-20 w-full" />
                        ))}
                      </div>
                    ) : findings.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                        No open violations found for this rule.
                      </div>
                    ) : (
                      <div className="divide-y">
                        {findings.map((finding: any) => {
                          const ev = parseEvidenceFromFinding(finding);
                          const isAcknowledged = finding.status === 'acknowledged';
                          const isPending = updateFindingMutation.isPending && updateFindingMutation.variables?.id === finding.id;
                          return (
                            <div key={finding.id} className={`p-3 transition-colors ${isAcknowledged ? 'bg-yellow-50/60 dark:bg-yellow-950/30' : 'hover:bg-muted/30'}`}>
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0 space-y-2">
                                  {/* Status and severity badges */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <SeverityBadge severity={finding.severity.toUpperCase()} />
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                      finding.status === 'open'
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                    }`}>
                                      {finding.status}
                                    </span>
                                    {finding.detectedAt && (
                                      <span className="text-xs text-muted-foreground">
                                        Detected {new Date(finding.detectedAt).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>

                                  {/* Structured evidence fields */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 bg-muted/40 rounded p-2 text-xs">
                                    <div>
                                      <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Record Type</span>
                                      <span className="font-medium capitalize">{ev.recordType}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">
                                        {ev.recordType.includes('punch') ? 'Punch ID' : 'Timesheet ID'}
                                      </span>
                                      <span className="font-mono font-semibold">{ev.recordId}</span>
                                    </div>
                                    {ev.employeeDisplay && (
                                      <div>
                                        <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Employee</span>
                                        <span className="font-medium">{ev.employeeDisplay}</span>
                                      </div>
                                    )}
                                    {ev.workDate && (
                                      <div>
                                        <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Work Date</span>
                                        <span className="font-medium">{ev.workDate}</span>
                                      </div>
                                    )}
                                    {ev.punchedAt && ev.punchedAt !== ev.workDate && (
                                      <div>
                                        <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Punched At</span>
                                        <span className="font-medium">{new Date(ev.punchedAt).toLocaleString()}</span>
                                      </div>
                                    )}
                                    {ev.extraDetail && (
                                      <div className="col-span-2">
                                        <span className="text-muted-foreground block uppercase tracking-wide text-[10px] font-semibold">Detail</span>
                                        <span className="font-medium">{ev.extraDetail}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Violation reason */}
                                  <p className="text-sm text-foreground leading-snug">
                                    <span className="font-medium text-muted-foreground">Violation: </span>
                                    {ev.violationText}
                                  </p>
                                </div>

                                {/* Action buttons */}
                                <div className="flex flex-col gap-1.5 flex-shrink-0">
                                  {!isAcknowledged && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs border-yellow-400 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                                      disabled={isPending}
                                      onClick={() => updateFindingMutation.mutate({ id: finding.id, status: 'acknowledged' })}
                                    >
                                      <Clock className="h-3 w-3 mr-1" />
                                      Acknowledge
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-green-400 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950"
                                    disabled={isPending}
                                    onClick={() => updateFindingMutation.mutate({ id: finding.id, status: 'resolved' })}
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Resolve
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {total > findings.length && (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            Showing {findings.length} of {total} active records
                          </div>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                <DialogFooter className="flex-shrink-0">
                  <Button variant="outline" onClick={() => setDrilldownRuleId(null)}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Domain Violations Dialog — shows all rules with open violations for a selected domain */}
      <Dialog open={!!drilldownDomainKey} onOpenChange={(open) => { if (!open) setDrilldownDomainKey(null); }}>
        <DialogContent className="max-w-lg">
          {drilldownDomainKey && (() => {
            const domainLabel = DOMAIN_LABELS[drilldownDomainKey] ?? drilldownDomainKey;
            const domainRules = (forensicSummary?.byRule ?? []).filter(
              (r: any) => (r.domain ?? '').toUpperCase() === drilldownDomainKey && r.open > 0
            );
            const totalViolations = domainRules.reduce((sum: number, r: any) => sum + r.open, 0);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Bug className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    {domainLabel} — Forensic Violations
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">
                    {totalViolations} open violation{totalViolations !== 1 ? 's' : ''} across {domainRules.length} rule{domainRules.length !== 1 ? 's' : ''}. Click a rule to view the violating records.
                  </p>
                  <div className="space-y-2">
                    {domainRules.map((rule: any) => (
                      <button
                        key={rule.ruleId}
                        onClick={() => { setDrilldownDomainKey(null); setDrilldownRuleId(rule.ruleId); }}
                        className="flex items-start gap-3 w-full text-left bg-muted/40 hover:bg-muted rounded-md p-3 transition-colors group"
                      >
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          rule.severity === 'critical' ? 'bg-red-500' :
                          rule.severity === 'high' ? 'bg-orange-500' :
                          rule.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs text-muted-foreground">{rule.ruleId}</p>
                          <p className="text-sm font-medium">{rule.open} open violation{rule.open !== 1 ? 's' : ''}</p>
                          <p className="text-xs text-muted-foreground capitalize">{rule.severity}</p>
                        </div>
                        <Eye className="h-4 w-4 text-muted-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 mt-0.5 flex-shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDrilldownDomainKey(null)}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Apply Domain Score Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="overrideDomain">Domain</Label>
              <Select value={overrideDomainKey} onValueChange={setOverrideDomainKey}>
                <SelectTrigger id="overrideDomain">
                  <SelectValue placeholder="Select domain…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOMAIN_LABELS).filter(([k]) => k !== 'GOVT_PROPERTY').map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="overrideScore">Override Score (0–100)</Label>
              <Input id="overrideScore" type="number" min="0" max="100" step="0.1" placeholder="e.g. 85.0" value={overrideScore} onChange={e => setOverrideScore(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="overrideJustification">Justification (required, min 20 chars)</Label>
              <Textarea id="overrideJustification" placeholder="Describe the reason for this override…" rows={3} value={overrideJustification} onChange={e => setOverrideJustification(e.target.value)} />
              <p className={`text-xs ${overrideJustification.trim().length < 20 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {overrideJustification.trim().length}/20 minimum characters
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleApplyOverride}
              disabled={overrideMutation.isPending}
            >
              {overrideMutation.isPending ? 'Applying…' : 'Apply Override'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
