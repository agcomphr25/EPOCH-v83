import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useParams, Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, FileText, Wrench,
  Activity, Target, AlertOctagon, FileX2, ShieldAlert
} from 'lucide-react';
import {
  topFlagBySeverity,
  computeDomainTarget,
  countMissingEvidence,
  filterOpenItems,
  topP1Item,
} from '@/lib/edriScorecard';

const DOMAIN_LABELS: Record<string, string> = {
  TIMEKEEPING: 'Timekeeping',
  CHARGE_CODE: 'Charge Code',
  ACCOUNTING: 'Accounting',
  PROCUREMENT: 'Procurement',
  INVENTORY: 'Inventory',
  POLICY: 'Policy',
  GOVT_PROPERTY: 'Govt. Property',
};

function CheckValueIcon({ val }: { val: number }) {
  if (val === 1) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (val === 0.5) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function CheckLabel({ val }: { val: number }) {
  if (val === 1) return <span className="text-green-600 dark:text-green-400 text-xs font-medium">PASS</span>;
  if (val === 0.5) return <span className="text-yellow-600 dark:text-yellow-400 text-xs font-medium">PARTIAL</span>;
  return <span className="text-red-600 dark:text-red-400 text-xs font-medium">FAIL</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[severity] ?? ''}`}>{severity}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const labels: Record<string, string> = { P1_CRITICAL: 'P1 Critical', P2_HIGH: 'P2 High', P3_MEDIUM: 'P3 Medium', P4_LOW: 'P4 Low' };
  const colors: Record<string, string> = {
    P1_CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    P2_HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    P3_MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    P4_LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[priority] ?? ''}`}>{labels[priority] ?? priority}</span>;
}

export default function EdriDomainDetail() {
  const { domainKey } = useParams<{ domainKey: string }>();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: snapshot, isLoading } = useQuery<any>({
    queryKey: ['/api/edri/snapshot/latest'],
  });

  const { data: backfillRows } = useQuery<Array<{ id: number }>>({
    queryKey: ['/api/vendor-pos/compliance-backfill'],
    enabled: domainKey === 'PROCUREMENT',
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const backfillCount = backfillRows?.length ?? 0;

  const evidenceMutation = useMutation({
    mutationFn: (snapshotId: number) => apiRequest('POST', '/api/edri/evidence/generate', { snapshotId, domainKey }),
    onSuccess: () => toast({ title: 'Evidence packet generation started' }),
    onError: () => toast({ title: 'Failed to generate evidence packet', variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest('PATCH', `/api/edri/remediation/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/edri/snapshot/latest'] });
      toast({ title: 'Status updated' });
    },
    onError: () => toast({ title: 'Failed to update status', variant: 'destructive' }),
  });

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-64" /></div>;
  if (!snapshot) return <div className="p-6 text-center text-muted-foreground">No snapshot data available. Compute a score first.</div>;

  const { snapshot: snap, domainScores, redFlags, remediationItems } = snapshot;

  const domainScore = domainScores?.find((d: any) => d.domainKey === domainKey);
  const domainFlags = redFlags?.filter((f: any) => f.domainKey === domainKey) ?? [];
  const domainRem = remediationItems?.filter((r: any) => r.domainKey === domainKey) ?? [];
  const checks = domainScore?.subScores ?? {};
  const evidenceItems: Array<{ label: string; value: unknown }> = domainScore?.evidenceItems ?? [];

  const score = Number(domainScore?.rawScore ?? 0);
  const weight = Number(domainScore?.weight ?? 0);
  const compositeScore = Number(snap?.compositeScore ?? 0);

  // Auditor scorecard derived fields for this domain
  const activeFlags = domainFlags.filter((f: any) => f.isActive);
  const topFailureFlag = topFlagBySeverity(activeFlags);
  const openDomainItems = filterOpenItems(domainRem);
  const topP1 = topP1Item(openDomainItems);
  const missingEvidenceCount = countMissingEvidence(evidenceItems);
  const domainTarget = computeDomainTarget(compositeScore, score, weight);
  const meetsTarget = score >= domainTarget;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/edri"><ArrowLeft className="h-4 w-4 mr-1" />EDRI Dashboard</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{DOMAIN_LABELS[domainKey ?? ''] ?? domainKey} Domain</h1>
          <p className="text-muted-foreground">Detailed compliance check results and evidence for this domain</p>
        </div>
        <Button
          variant="outline"
          onClick={() => evidenceMutation.mutate(snap?.id)}
          disabled={evidenceMutation.isPending || !snap?.id}
        >
          <FileText className="h-4 w-4 mr-2" />
          {evidenceMutation.isPending ? 'Generating...' : 'Generate Evidence Packet'}
        </Button>
      </div>

      {/* Auditor-grade five-field summary banner */}
      <div className={`rounded-lg border-2 p-5 ${meetsTarget ? 'border-green-300 bg-green-50 dark:bg-green-950' : 'border-red-300 bg-red-50 dark:bg-red-950'}`}>
        <div className="flex items-center gap-3 mb-4">
          {meetsTarget
            ? <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400 flex-shrink-0" />
            : <XCircle className="h-7 w-7 text-red-600 dark:text-red-400 flex-shrink-0" />
          }
          <div>
            <h2 className={`text-lg font-bold ${meetsTarget ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {meetsTarget ? 'Domain meets target score' : `Domain is ${(domainTarget - score).toFixed(1)} points below the ${domainTarget.toFixed(0)} target`}
            </h2>
            <p className="text-xs text-muted-foreground">{DOMAIN_LABELS[domainKey ?? ''] ?? domainKey} · {(weight * 100).toFixed(0)}% portfolio weight</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-4 border-t border-current/10">
          {/* Field 1: Current Score */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <Activity className="h-3 w-3" /> Current Score
            </p>
            <p className={`text-2xl font-bold ${meetsTarget ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {score.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">raw domain score</p>
          </div>

          {/* Field 2: Target Score */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <Target className="h-3 w-3" /> Target Score
            </p>
            <p className="text-2xl font-bold text-foreground">{domainTarget.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">min. to contribute to passing composite</p>
          </div>

          {/* Field 3: Failure Reason */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <AlertOctagon className="h-3 w-3" /> Failure Reason
            </p>
            {topFailureFlag ? (
              <>
                <div className="flex items-center gap-1 flex-wrap">
                  <SeverityBadge severity={topFailureFlag.severity} />
                </div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300 leading-tight">{topFailureFlag.title}</p>
                {topFailureFlag.farCitation && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">{topFailureFlag.farCitation}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">None — no active flags</p>
            )}
          </div>

          {/* Field 4: Evidence Missing */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <FileX2 className="h-3 w-3" /> Evidence Missing
            </p>
            <p className={`text-2xl font-bold ${missingEvidenceCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
              {missingEvidenceCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {missingEvidenceCount === 0
                ? 'all data verified'
                : `of ${evidenceItems.length} items unavailable`}
            </p>
          </div>

          {/* Field 5: Remediation Required */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
              <Wrench className="h-3 w-3" /> Remediation Required
            </p>
            <p className={`text-2xl font-bold ${openDomainItems.length > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
              {openDomainItems.length}
            </p>
            {topP1 ? (
              <p className="text-xs text-muted-foreground" title={topP1.title}>
                Top: {(topP1.title ?? '').slice(0, 40)}{(topP1.title ?? '').length > 40 ? '…' : ''}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">open items</p>
            )}
          </div>
        </div>
      </div>

      {/* Domain score summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold">{score.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground mt-1">Raw Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold">{(weight * 100).toFixed(0)}%</p>
            <p className="text-sm text-muted-foreground mt-1">Portfolio Weight</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold">{(score * weight).toFixed(1)}</p>
            <p className="text-sm text-muted-foreground mt-1">Weighted Contribution</p>
          </CardContent>
        </Card>
      </div>

      {/* Check-by-check breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance Checks</CardTitle>
          <CardDescription>Each check contributes equally to the domain raw score ({Object.keys(checks).length} checks, {evidenceItems.length} evidence items collected)</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(checks).length === 0 ? (
            <p className="text-sm text-muted-foreground">No checks available for this domain.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(checks).map(([checkKey, val]: [string, any]) => (
                <div key={checkKey} className="flex items-center gap-3 p-2 rounded-md border">
                  <CheckValueIcon val={Number(val)} />
                  <span className="flex-1 text-sm font-mono">{checkKey}</span>
                  <CheckLabel val={Number(val)} />
                  <div className="w-16 bg-muted rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${Number(val) === 1 ? 'bg-green-500' : Number(val) === 0.5 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${Number(val) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Procurement: FAR_FLOWDOWN backfill queue CTA */}
      {domainKey === 'PROCUREMENT' && (
        <Card className={backfillCount > 0 ? 'border-orange-300 dark:border-orange-700' : ''}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className={`h-5 w-5 ${backfillCount > 0 ? 'text-orange-500' : 'text-green-500'}`} />
              FAR_FLOWDOWN — Compliance Backfill Queue
            </CardTitle>
            <CardDescription>
              Issued POs with compliance gaps that are directly hurting the FAR_FLOWDOWN score.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                {backfillCount === 0 ? (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">No issued POs require remediation</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{backfillCount}</p>
                    <p className="text-sm text-muted-foreground">issued {backfillCount === 1 ? 'PO requires' : 'POs require'} remediation</p>
                  </div>
                )}
              </div>
              <Button
                variant={backfillCount > 0 ? 'default' : 'outline'}
                onClick={() => setLocation('/vendor-pos/compliance-backfill')}
              >
                <ShieldAlert className="h-4 w-4 mr-2" />
                Open Backfill Queue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evidence items */}
      {evidenceItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evidence Items</CardTitle>
            <CardDescription>
              Data points collected during this compliance assessment ({evidenceItems.length} items
              {missingEvidenceCount > 0 && `, ${missingEvidenceCount} unavailable`})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {evidenceItems.map((ev, i) => {
                const isUnavailable = ev.value === 'SCORER_UNAVAILABLE';
                return (
                  <div key={i} className={`p-2 rounded-md border text-sm ${isUnavailable ? 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800' : 'bg-muted/50'}`}>
                    <p className="font-medium text-xs text-muted-foreground truncate">{ev.label}</p>
                    {isUnavailable ? (
                      <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mt-0.5 flex items-center gap-1">
                        <FileX2 className="h-3 w-3" /> Data unavailable
                      </p>
                    ) : (
                      <p className="font-mono text-sm mt-0.5 truncate">{String(ev.value)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Red flags for this domain */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Red Flags ({domainFlags.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {domainFlags.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" /><span className="text-sm">No red flags in this domain</span>
            </div>
          ) : (
            <div className="space-y-3">
              {domainFlags.map((flag: any) => (
                <div key={flag.id} className={`p-3 rounded-md border space-y-1 ${flag.isActive && flag.severity === 'CRITICAL' ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950' : ''}`}>
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={flag.severity} />
                    <span className="font-medium text-sm">{flag.title}</span>
                    {!flag.isActive && <Badge variant="outline" className="text-green-600 border-green-300">Resolved</Badge>}
                    {flag.isActive && flag === topFailureFlag && (
                      <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200">Top Failure Reason</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{flag.description}</p>
                  {flag.farCitation && <p className="text-xs text-blue-600 dark:text-blue-400">FAR Citation: {flag.farCitation}</p>}
                  <p className="text-xs text-muted-foreground">Potential recovery: +{flag.potentialScoreRecovery ?? 0} pts</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open remediation items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-500" />
            Open Remediation Items ({domainRem.filter((r: any) => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {domainRem.filter((r: any) => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length === 0 ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" /><span className="text-sm">No open remediation items</span>
            </div>
          ) : (
            <div className="space-y-3">
              {domainRem.filter((r: any) => r.status === 'OPEN' || r.status === 'IN_PROGRESS').map((item: any) => (
                <div key={item.id} className="p-3 rounded-md border space-y-2">
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={item.priority} />
                    <span className="font-medium text-sm">{item.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    {item.assignedToDisplayName && (
                      <span className="text-xs text-muted-foreground">Assigned: {item.assignedToDisplayName}</span>
                    )}
                    {item.dueDate && (
                      <span className="text-xs text-muted-foreground">Due: {item.dueDate}</span>
                    )}
                    <span className="text-xs text-muted-foreground">+{item.potentialScoreRecovery ?? 0} pts recovery</span>
                    <div className="ml-auto">
                      <Select
                        value={item.status}
                        onValueChange={(val) => statusMutation.mutate({ id: item.id, status: val })}
                        disabled={statusMutation.isPending}
                      >
                        <SelectTrigger className="h-7 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OPEN">Open</SelectItem>
                          <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                          <SelectItem value="RESOLVED">Resolved</SelectItem>
                          <SelectItem value="WAIVED">Waived</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
