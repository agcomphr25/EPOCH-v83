import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Bug, CheckCircle2, Clock, ChevronLeft, ChevronRight,
  AlertOctagon, ShieldCheck, Eye, Filter, History, RefreshCw, ShieldAlert, BadgeCheck
} from 'lucide-react';
import { format } from 'date-fns';
import EdriSubNav from '@/components/EdriSubNav';

interface DcaaFinding {
  id: number;
  ruleId: string;
  domain: string;
  severity: string;
  entityType: string;
  entityId: string;
  description: string;
  evidence: Record<string, unknown>;
  detectedAt: string;
  status: string;
  resolutionNotes: string | null;
}

interface ForensicRule {
  ruleId: string;
  domain: string;
  severity: string;
  description: string;
  farCitation: string;
  remediationGuidance: string;
  enforcedAtWriteTime: boolean;
  enforcementNote: string | null;
}

interface FindingsResult {
  findings: DcaaFinding[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ScanHistoryRow {
  id: number;
  ranAt: string;
  triggeredBy: string;
  newFindings: number;
  violationsClosed: number;
  rulesRun: number;
  rulesFailed: number;
}

interface ScanHistoryResult {
  history: ScanHistoryRow[];
  count: number;
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

const SEVERITY_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  critical: {
    label: 'Critical',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    dot: 'bg-red-500',
  },
  high: {
    label: 'High',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    dot: 'bg-orange-500',
  },
  medium: {
    label: 'Medium',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    dot: 'bg-yellow-500',
  },
  low: {
    label: 'Low',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    dot: 'bg-blue-400',
  },
};

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  open: { label: 'Open', badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  acknowledged: { label: 'Acknowledged', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  resolved: { label: 'Resolved', badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
};

const DOMAIN_LABELS: Record<string, string> = {
  TIMEKEEPING: 'Timekeeping',
  CHARGE_CODE: 'Charge Code',
  ACCOUNTING: 'Accounting',
  PROCUREMENT: 'Procurement',
  INVENTORY: 'Inventory',
  POLICY: 'Policy',
  GOVT_PROPERTY: 'Govt. Property',
};

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity.toLowerCase()] ?? SEVERITY_CONFIG.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

export default function DcaaFindings() {
  const { toast } = useToast();

  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [domainFilter, setDomainFilter] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    finding: DcaaFinding | null;
    targetStatus: 'acknowledged' | 'resolved';
  }>({ open: false, finding: null, targetStatus: 'acknowledged' });
  const [notes, setNotes] = useState('');

  const [detailDialog, setDetailDialog] = useState<{ open: boolean; finding: DcaaFinding | null }>({
    open: false,
    finding: null,
  });

  const params = new URLSearchParams();
  if (severityFilter !== 'all') params.set('severity', severityFilter);
  if (statusFilter !== 'all') params.set('status', statusFilter);
  if (domainFilter !== 'all') params.set('domain', domainFilter);
  params.set('page', String(page));
  params.set('pageSize', String(PAGE_SIZE));

  const queryKey = ['/api/forensic-audit/findings', severityFilter, statusFilter, domainFilter, page];

  const { data, isLoading, dataUpdatedAt, refetch: refetchFindings } = useQuery<FindingsResult>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/forensic-audit/findings?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load findings');
      return res.json();
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['/api/forensic-audit/summary'],
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const { data: allRules = [] } = useQuery<ForensicRule[]>({
    queryKey: ['/api/forensic-audit/rules'],
    queryFn: async () => {
      const res = await fetch('/api/forensic-audit/rules', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load rules');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const enforcedRules = allRules.filter(r => r.enforcedAtWriteTime);
  const enforcedRuleIds = new Set(enforcedRules.map(r => r.ruleId));

  const { data: scanHistoryData, isLoading: isHistoryLoading } = useQuery<ScanHistoryResult>({
    queryKey: ['/api/forensic-audit/scan-history'],
    queryFn: async () => {
      const res = await fetch('/api/forensic-audit/scan-history?limit=20', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load scan history');
      return res.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, status, resolutionNotes }: { id: number; status: string; resolutionNotes?: string }) =>
      apiRequest(`/api/forensic-audit/findings/${id}`, { method: 'PATCH', body: { status, resolutionNotes } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/findings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/summary'] });
      toast({ title: 'Finding updated successfully' });
      setActionDialog({ open: false, finding: null, targetStatus: 'acknowledged' });
      setNotes('');
    },
    onError: () => {
      toast({ title: 'Failed to update finding', variant: 'destructive' });
    },
  });

  function openAction(finding: DcaaFinding, targetStatus: 'acknowledged' | 'resolved') {
    setActionDialog({ open: true, finding, targetStatus });
    setNotes('');
  }

  function submitAction() {
    if (!actionDialog.finding) return;
    patchMutation.mutate({
      id: actionDialog.finding.id,
      status: actionDialog.targetStatus,
      resolutionNotes: notes.trim() || undefined,
    });
  }

  function handleFilterChange() {
    setPage(1);
  }

  const findings = data?.findings ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  const groupedBySeverity = SEVERITY_ORDER.reduce<Record<string, DcaaFinding[]>>((acc, sev) => {
    const group = findings.filter(f => f.severity.toLowerCase() === sev);
    if (group.length > 0) acc[sev] = group;
    return acc;
  }, {});
  const hasGrouping = severityFilter === 'all' && Object.keys(groupedBySeverity).length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <EdriSubNav />

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bug className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            <h1 className="text-2xl font-bold">DCAA Forensic Findings</h1>
          </div>
          {summary && (
            <div className="flex gap-2 ml-auto">
              {summary.criticalOpen > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                  {summary.criticalOpen} Critical
                </span>
              )}
              {summary.highOpen > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                  {summary.highOpen} High
                </span>
              )}
              {summary.mediumOpen > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                  {summary.mediumOpen} Medium
                </span>
              )}
              {summary.lowOpen > 0 && (
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {summary.lowOpen} Low
                </span>
              )}
              {summary.totalOpen === 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <CheckCircle2 className="h-3 w-3" /> All Clear
                </span>
              )}
            </div>
          )}
        </div>

        {/* Write-Time Enforcement Status Panel */}
        {enforcedRules.length > 0 && (
          <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                <CardTitle className="text-sm font-semibold text-green-800 dark:text-green-300">
                  Write-Time Enforcement Active — {enforcedRules.length} Rule{enforcedRules.length !== 1 ? 's' : ''} Now Block Violations at the API Layer
                </CardTitle>
              </div>
              <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                The following rules are enforced at write time — non-compliant requests are rejected before the data is saved. Historical violations may still appear in findings below, but new violations are impossible going forward.
              </p>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="grid gap-2 sm:grid-cols-3">
                {enforcedRules.map(rule => (
                  <div key={rule.ruleId} className="rounded-md bg-white dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 px-1.5 py-0.5 rounded">
                        {rule.ruleId}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400">
                        <ShieldCheck className="h-3 w-3" /> Enforced at Write Time
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{rule.description}</p>
                    {rule.enforcementNote && (
                      <p className="text-xs text-green-700 dark:text-green-500 line-clamp-2 italic">{rule.enforcementNote}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">Filters:</span>

              <Select
                value={severityFilter}
                onValueChange={v => { setSeverityFilter(v); handleFilterChange(); }}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={v => { setStatusFilter(v); handleFilterChange(); }}
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={domainFilter}
                onValueChange={v => { setDomainFilter(v); handleFilterChange(); }}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Domain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {isLoading ? 'Loading...' : `${total} finding${total !== 1 ? 's' : ''}`}
                  {!isLoading && dataUpdatedAt > 0 && (
                    <span className="ml-1 text-muted-foreground/60">
                      · updated {format(new Date(dataUpdatedAt), 'HH:mm:ss')}
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => refetchFindings()}
                  title="Refresh findings"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Findings Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : findings.length === 0 ? (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-3">
              <ShieldCheck className="h-12 w-12 text-green-500" />
              <p className="text-lg font-medium text-muted-foreground">No findings match the current filters</p>
              <p className="text-sm text-muted-foreground">
                {statusFilter === 'open'
                  ? 'No open violations — run a forensic scan to check for new issues.'
                  : 'Try adjusting your filters to view more results.'}
              </p>
            </CardContent>
          </Card>
        ) : hasGrouping ? (
          <div className="space-y-6">
            {SEVERITY_ORDER.filter(sev => groupedBySeverity[sev]).map(sev => (
              <div key={sev} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_CONFIG[sev].dot}`} />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {SEVERITY_CONFIG[sev].label} — {groupedBySeverity[sev].length} finding{groupedBySeverity[sev].length !== 1 ? 's' : ''}
                  </h2>
                </div>
                <FindingsTable
                  findings={groupedBySeverity[sev]}
                  onAcknowledge={f => openAction(f, 'acknowledged')}
                  onResolve={f => openAction(f, 'resolved')}
                  onDetail={f => setDetailDialog({ open: true, finding: f })}
                  isPending={patchMutation.isPending}
                  enforcedRuleIds={enforcedRuleIds}
                />
              </div>
            ))}
          </div>
        ) : (
          <FindingsTable
            findings={findings}
            onAcknowledge={f => openAction(f, 'acknowledged')}
            onResolve={f => openAction(f, 'resolved')}
            onDetail={f => setDetailDialog({ open: true, finding: f })}
            isPending={patchMutation.isPending}
            enforcedRuleIds={enforcedRuleIds}
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Scan History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Nightly Scan History
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isHistoryLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : !scanHistoryData || scanHistoryData.history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No scan runs recorded yet. History is appended after each completed nightly scan.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left pb-2 pr-4 font-medium">Run At</th>
                      <th className="text-left pb-2 pr-4 font-medium">Triggered By</th>
                      <th className="text-right pb-2 pr-4 font-medium">New Findings</th>
                      <th className="text-right pb-2 pr-4 font-medium">Closed</th>
                      <th className="text-right pb-2 pr-4 font-medium">Rules Run</th>
                      <th className="text-right pb-2 font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {scanHistoryData.history.map(row => (
                      <tr key={row.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">
                          {(() => {
                            try { return format(new Date(row.ranAt), 'MMM d, yyyy HH:mm'); }
                            catch { return row.ranAt; }
                          })()}
                        </td>
                        <td className="py-2 pr-4 capitalize text-muted-foreground text-xs">{row.triggeredBy}</td>
                        <td className="py-2 pr-4 text-right">
                          {row.newFindings > 0 ? (
                            <span className="font-semibold text-red-600 dark:text-red-400">{row.newFindings}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {row.violationsClosed > 0 ? (
                            <span className="font-semibold text-green-600 dark:text-green-400">{row.violationsClosed}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right text-muted-foreground">{row.rulesRun}</td>
                        <td className="py-2 text-right">
                          {row.rulesFailed > 0 ? (
                            <span className="text-orange-600 dark:text-orange-400">{row.rulesFailed}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Acknowledge / Resolve Dialog */}
      <Dialog
        open={actionDialog.open}
        onOpenChange={open => {
          if (!open) setActionDialog({ open: false, finding: null, targetStatus: 'acknowledged' });
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog.targetStatus === 'acknowledged' ? 'Acknowledge Finding' : 'Resolve Finding'}
            </DialogTitle>
          </DialogHeader>
          {actionDialog.finding && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 border p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">{actionDialog.finding.ruleId}</span>
                  <SeverityBadge severity={actionDialog.finding.severity} />
                </div>
                <p className="text-sm">{actionDialog.finding.description}</p>
                <p className="text-xs text-muted-foreground">
                  {actionDialog.finding.entityType} · {actionDialog.finding.entityId}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Resolution notes{actionDialog.targetStatus === 'resolved' ? '' : ' (optional)'}
                </label>
                <Textarea
                  placeholder={
                    actionDialog.targetStatus === 'acknowledged'
                      ? 'Describe why this finding is being acknowledged...'
                      : 'Describe how this violation was resolved...'
                  }
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialog({ open: false, finding: null, targetStatus: 'acknowledged' })}
            >
              Cancel
            </Button>
            <Button
              onClick={submitAction}
              disabled={patchMutation.isPending}
              className={
                actionDialog.targetStatus === 'resolved'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white'
              }
            >
              {patchMutation.isPending
                ? 'Saving...'
                : actionDialog.targetStatus === 'acknowledged'
                  ? 'Acknowledge'
                  : 'Mark Resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog
        open={detailDialog.open}
        onOpenChange={open => { if (!open) setDetailDialog({ open: false, finding: null }); }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-orange-500" />
              Finding Detail
            </DialogTitle>
          </DialogHeader>
          {detailDialog.finding && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Rule ID</p>
                  <p className="font-mono font-semibold">{detailDialog.finding.ruleId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Severity</p>
                  <SeverityBadge severity={detailDialog.finding.severity} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Domain</p>
                  <p>{DOMAIN_LABELS[detailDialog.finding.domain] ?? detailDialog.finding.domain}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</p>
                  <StatusBadge status={detailDialog.finding.status} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Entity Type</p>
                  <p>{detailDialog.finding.entityType}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Entity ID</p>
                  <p className="font-mono text-xs">{detailDialog.finding.entityId}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Detected</p>
                  <p className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {format(new Date(detailDialog.finding.detectedAt), 'MMM d, yyyy HH:mm')}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm">{detailDialog.finding.description}</p>
                </div>
              </div>

              {Object.keys(detailDialog.finding.evidence).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Evidence</p>
                  <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(detailDialog.finding.evidence, null, 2)}
                  </pre>
                </div>
              )}

              {detailDialog.finding.resolutionNotes && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Resolution Notes</p>
                  <p className="text-sm bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-3">
                    {detailDialog.finding.resolutionNotes}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {detailDialog.finding?.status === 'open' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-yellow-400 text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                  onClick={() => {
                    openAction(detailDialog.finding!, 'acknowledged');
                    setDetailDialog({ open: false, finding: null });
                  }}
                >
                  Acknowledge
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-green-500 text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                  onClick={() => {
                    openAction(detailDialog.finding!, 'resolved');
                    setDetailDialog({ open: false, finding: null });
                  }}
                >
                  Mark Resolved
                </Button>
              </>
            )}
            {detailDialog.finding?.status === 'acknowledged' && (
              <Button
                variant="outline"
                size="sm"
                className="border-green-500 text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                onClick={() => {
                  openAction(detailDialog.finding!, 'resolved');
                  setDetailDialog({ open: false, finding: null });
                }}
              >
                Mark Resolved
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setDetailDialog({ open: false, finding: null })}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FindingsTable({
  findings,
  onAcknowledge,
  onResolve,
  onDetail,
  isPending,
  enforcedRuleIds = new Set<string>(),
}: {
  findings: DcaaFinding[];
  onAcknowledge: (f: DcaaFinding) => void;
  onResolve: (f: DcaaFinding) => void;
  onDetail: (f: DcaaFinding) => void;
  isPending: boolean;
  enforcedRuleIds?: Set<string>;
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Rule</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Severity</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Entity</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Description</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide hidden lg:table-cell">Detected</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {findings.map(finding => (
            <tr
              key={finding.id}
              className="hover:bg-muted/30 transition-colors group"
            >
              <td className="px-4 py-3">
                <button
                  onClick={() => onDetail(finding)}
                  className="font-mono text-xs font-medium text-purple-700 dark:text-purple-400 hover:underline flex items-center gap-1"
                >
                  {finding.ruleId}
                  <Eye className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                {enforcedRuleIds.has(finding.ruleId) && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400 font-medium mt-0.5">
                    <ShieldCheck className="h-3 w-3" /> Enforced
                  </span>
                )}
                {!enforcedRuleIds.has(finding.ruleId) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {DOMAIN_LABELS[finding.domain] ?? finding.domain}
                  </p>
                )}
              </td>
              <td className="px-4 py-3">
                <SeverityBadge severity={finding.severity} />
              </td>
              <td className="px-4 py-3">
                <p className="text-xs font-medium">{finding.entityType}</p>
                <p className="text-xs text-muted-foreground font-mono truncate max-w-[120px]" title={finding.entityId}>
                  {finding.entityId}
                </p>
              </td>
              <td className="px-4 py-3 hidden md:table-cell max-w-xs">
                <p className="text-sm leading-snug line-clamp-2" title={finding.description}>
                  {finding.description}
                </p>
              </td>
              <td className="px-4 py-3 hidden lg:table-cell">
                <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  {format(new Date(finding.detectedAt), 'MMM d, yyyy')}
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={finding.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  {finding.status === 'open' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs border-yellow-400 text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                        disabled={isPending}
                        onClick={() => onAcknowledge(finding)}
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs border-green-500 text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                        disabled={isPending}
                        onClick={() => onResolve(finding)}
                      >
                        Resolve
                      </Button>
                    </>
                  )}
                  {finding.status === 'acknowledged' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs border-green-500 text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                      disabled={isPending}
                      onClick={() => onResolve(finding)}
                    >
                      Resolve
                    </Button>
                  )}
                  {finding.status === 'resolved' && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Done
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
