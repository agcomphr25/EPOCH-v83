import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ShieldCheck, ShieldAlert, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { filterOpenItems } from '@/lib/edriScorecard';

const DOMAIN_LABELS: Record<string, string> = {
  TIMEKEEPING: 'Timekeeping', CHARGE_CODE: 'Charge Code', ACCOUNTING: 'Accounting',
  PROCUREMENT: 'Procurement', INVENTORY: 'Inventory', POLICY: 'Policy', GOVT_PROPERTY: 'Govt. Property',
};

const BAND_CONFIG: Record<string, { label: string; color: string }> = {
  AUDIT_DEFENSIBLE: { label: 'Audit Defensible', color: 'text-green-600 dark:text-green-400' },
  CONDITIONALLY_PASSABLE: { label: 'Conditionally Passable', color: 'text-yellow-600 dark:text-yellow-400' },
  HIGH_RISK: { label: 'High Risk', color: 'text-orange-600 dark:text-orange-400' },
  MATERIAL_DEFICIENCY: { label: 'Material Deficiency', color: 'text-red-600 dark:text-red-400' },
  AUDIT_FAILURE: { label: 'Audit Failure', color: 'text-red-800 dark:text-red-300' },
};

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[severity] ?? ''}`}>{severity}</span>;
}

function CheckIcon({ val }: { val: number }) {
  if (val === 1) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (val === 0.5) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

export default function EdriSnapshotDetail() {
  const { snapshotId } = useParams<{ snapshotId: string }>();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/edri/snapshot', snapshotId],
    queryFn: async () => {
      const res = await fetch(`/api/edri/snapshot/${snapshotId}`);
      if (!res.ok) throw new Error('Snapshot not found');
      return res.json();
    },
  });

  if (isLoading) return <div className="p-6 space-y-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (!data) return <div className="p-6 text-center text-muted-foreground">Snapshot not found.</div>;

  const { snapshot, domainScores, redFlags, remediationItems } = data;
  const compositeScore = Number(snapshot.compositeScore);
  const band = BAND_CONFIG[snapshot.scoringBand] ?? BAND_CONFIG['HIGH_RISK'];
  const wouldPass = snapshot.scoringBand === 'AUDIT_DEFENSIBLE' || snapshot.scoringBand === 'CONDITIONALLY_PASSABLE';

  const criticalFlags = (redFlags ?? []).filter((f: any) => f.severity === 'CRITICAL' && f.isActive);
  const openItems = filterOpenItems(remediationItems ?? []);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/edri/history"><ArrowLeft className="h-4 w-4 mr-1" />Score History</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/edri"><ArrowLeft className="h-4 w-4 mr-1" />EDRI Dashboard</Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            {wouldPass
              ? <ShieldCheck className="h-8 w-8 text-green-500" />
              : <ShieldAlert className="h-8 w-8 text-red-500" />
            }
            <h1 className="text-3xl font-bold">Snapshot #{snapshotId}</h1>
            {snapshot.isOverride && <Badge variant="outline" className="text-orange-600 border-orange-300">Override Applied</Badge>}
          </div>
          <p className="text-muted-foreground mt-1">
            Computed: {snapshot.computedAt ? format(new Date(snapshot.computedAt), 'MMMM d, yyyy h:mm a') : '—'}
            {snapshot.computedByDisplayName && ` by ${snapshot.computedByDisplayName}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/edri/snapshot/${snapshotId}/evidence`}>Generate Evidence Packet</Link>
          </Button>
        </div>
      </div>

      {/* Score overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold">{compositeScore.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground mt-1">Composite Score</p>
            <p className={`text-xs font-medium mt-1 ${band.color}`}>{band.label}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold">{Number(snapshot.subcontractorScore ?? 0).toFixed(1)}</p>
            <p className="text-sm text-muted-foreground mt-1">Subcontractor</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold">{Number(snapshot.primeScore ?? 0).toFixed(1)}</p>
            <p className="text-sm text-muted-foreground mt-1">Prime Contractor</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-4xl font-bold text-red-500">{Number(snapshot.failureProbability ?? 0).toFixed(0)}%</p>
            <p className="text-sm text-muted-foreground mt-1">Failure Probability</p>
          </CardContent>
        </Card>
      </div>

      {/* Domain scores */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Scores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(domainScores ?? []).map((ds: any) => (
            <div key={ds.domainKey}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{DOMAIN_LABELS[ds.domainKey] ?? ds.domainKey}</span>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>Weight: {(Number(ds.weight) * 100).toFixed(0)}%</span>
                  <span className="font-bold text-foreground">{Number(ds.rawScore ?? 0).toFixed(1)}</span>
                </div>
              </div>
              <Progress value={Number(ds.rawScore ?? 0)} className="h-2" />
              {/* Sub-scores */}
              {ds.subScores && Object.keys(ds.subScores).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(ds.subScores as Record<string, number>).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CheckIcon val={Number(val)} />
                      <span className="font-mono">{key}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Red flags */}
      <Card>
        <CardHeader>
          <CardTitle>Red Flags ({(redFlags ?? []).length} total, {criticalFlags.length} critical active)</CardTitle>
        </CardHeader>
        <CardContent>
          {(redFlags ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No red flags detected in this snapshot.</p>
          ) : (
            <div className="space-y-2">
              {(redFlags ?? []).map((flag: any) => (
                <div key={flag.id} className={`flex items-start gap-3 p-2 rounded-md border ${!flag.isActive ? 'opacity-60' : ''}`}>
                  <SeverityBadge severity={flag.severity} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{flag.title}</p>
                    <p className="text-xs text-muted-foreground">{DOMAIN_LABELS[flag.domainKey] ?? flag.domainKey} · {flag.farCitation}</p>
                  </div>
                  {!flag.isActive && <Badge variant="outline" className="text-green-600 text-xs">Resolved</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remediation items */}
      <Card>
        <CardHeader>
          <CardTitle>Remediation Items ({openItems.length} open of {(remediationItems ?? []).length} total)</CardTitle>
        </CardHeader>
        <CardContent>
          {(remediationItems ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No remediation items in this snapshot.</p>
          ) : (
            <div className="space-y-2">
              {(remediationItems ?? []).map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-md border">
                  <Badge variant="outline" className="text-xs">{item.priority}</Badge>
                  <span className="text-sm flex-1">{item.title}</span>
                  <Badge variant="outline" className={`text-xs ${item.status === 'RESOLVED' ? 'text-green-600' : ''}`}>{item.status}</Badge>
                  <span className="text-xs text-muted-foreground">+{item.potentialScoreRecovery}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
