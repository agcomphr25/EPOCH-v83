import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { FileWarning, ArrowLeft, Download, RefreshCw, FileX2, AlertOctagon, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { countTotalMissingEvidence } from '@/lib/edriScorecard';

const DOMAIN_LABELS: Record<string, string> = {
  TIMEKEEPING: 'Timekeeping', CHARGE_CODE: 'Charge Code', ACCOUNTING: 'Accounting',
  PROCUREMENT: 'Procurement', INVENTORY: 'Inventory', POLICY: 'Policy',
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

export default function EdriMissingEvidence() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/edri/snapshot/latest'],
  });

  const generateMutation = useMutation({
    mutationFn: ({ snapshotId, domainKey }: { snapshotId: number; domainKey?: string }) =>
      apiRequest('POST', '/api/edri/evidence/generate', { snapshotId, domainKey: domainKey ?? null }),
    onSuccess: () => toast({ title: 'Evidence packet generation started' }),
    onError: () => toast({ title: 'Failed to generate packet', variant: 'destructive' }),
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;
  if (!data) return <div className="p-6 text-center text-muted-foreground">No EDRI data available.</div>;

  const { snapshot, domainScores, redFlags } = data;
  const activeFlags = (redFlags ?? []).filter((f: any) => f.isActive);

  // Collect SCORER_UNAVAILABLE evidence items per domain from domain scores
  const unavailableByDomain: Record<string, Array<{ label: string; domainKey: string; relatedFlag: any | null }>> = {};
  for (const ds of (domainScores ?? [])) {
    const items: Array<{ label: string; value: unknown }> = ds.evidenceItems ?? [];
    const unavailable = items.filter(ev => ev.value === 'SCORER_UNAVAILABLE');
    if (unavailable.length > 0) {
      // Try to associate each unavailable evidence item with a red flag in the same domain
      const domainFlags = activeFlags.filter((f: any) => f.domainKey === ds.domainKey);
      unavailableByDomain[ds.domainKey] = unavailable.map(ev => ({
        label: ev.label,
        domainKey: ds.domainKey,
        relatedFlag: domainFlags[0] ?? null,
      }));
    }
  }
  const totalUnavailable = countTotalMissingEvidence(domainScores ?? []);

  // Group active red flags by domain for the compliance gaps section
  const flagsByDomain: Record<string, any[]> = {};
  for (const flag of activeFlags) {
    if (!flagsByDomain[flag.domainKey]) flagsByDomain[flag.domainKey] = [];
    flagsByDomain[flag.domainKey].push(flag);
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/edri"><ArrowLeft className="h-4 w-4 mr-1" />EDRI Dashboard</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileWarning className="h-8 w-8 text-orange-500" />
            Missing Evidence Report
          </h1>
          <p className="text-muted-foreground">All identified compliance gaps and unverifiable data points per domain</p>
        </div>
        <Button
          onClick={() => generateMutation.mutate({ snapshotId: snapshot.id })}
          disabled={generateMutation.isPending}
          variant="outline"
        >
          {generateMutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><Download className="h-4 w-4 mr-2" />Generate All Evidence</>}
        </Button>
      </div>

      {/* Summary counts */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <div><span className="font-bold text-2xl text-red-600">{activeFlags.filter((f: any) => f.severity === 'CRITICAL').length}</span><br /><span className="text-muted-foreground">Critical Gaps</span></div>
            <div><span className="font-bold text-2xl text-orange-600">{activeFlags.filter((f: any) => f.severity === 'HIGH').length}</span><br /><span className="text-muted-foreground">High Gaps</span></div>
            <div><span className="font-bold text-2xl text-yellow-600">{activeFlags.filter((f: any) => f.severity === 'MEDIUM').length}</span><br /><span className="text-muted-foreground">Medium Gaps</span></div>
            <div><span className="font-bold text-2xl">{activeFlags.length}</span><br /><span className="text-muted-foreground">Total Gaps</span></div>
            <div className="border-l pl-6 ml-2">
              <span className={`font-bold text-2xl ${totalUnavailable > 0 ? 'text-orange-600' : 'text-green-600'}`}>{totalUnavailable}</span>
              <br /><span className="text-muted-foreground">SCORER_UNAVAILABLE Items</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SCORER_UNAVAILABLE evidence items grouped by domain */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <FileX2 className="h-5 w-5 text-orange-500" />
          Unverifiable Data Points (SCORER_UNAVAILABLE)
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          These evidence items could not be retrieved during scoring because the underlying data was inaccessible or the table did not exist. Each gap may be suppressing the domain score.
        </p>

        {totalUnavailable === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-lg border border-dashed">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="text-muted-foreground">All evidence data points were successfully retrieved — no SCORER_UNAVAILABLE items</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(unavailableByDomain).map(([domain, items]) => (
              <Card key={domain} className="border-orange-200 dark:border-orange-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileX2 className="h-4 w-4 text-orange-500" />
                      {DOMAIN_LABELS[domain] ?? domain}
                      <Badge className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200">
                        {items.length} unavailable
                      </Badge>
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generateMutation.mutate({ snapshotId: snapshot.id, domainKey: domain })}
                      disabled={generateMutation.isPending}
                    >
                      <Download className="h-3 w-3 mr-1" />Generate Evidence
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-orange-50 dark:bg-orange-950 border border-orange-100 dark:border-orange-900">
                        <FileX2 className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Data unavailable — this evidence point could not be collected during scoring.
                          </p>
                          {item.relatedFlag && (
                            <Link
                              href={`/admin/edri/domain/${item.domainKey}`}
                              className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium hover:underline mt-1"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {item.relatedFlag.title}
                              {item.relatedFlag.farCitation && (
                                <span className="text-blue-600 dark:text-blue-400 font-mono ml-1">{item.relatedFlag.farCitation}</span>
                              )}
                              <ExternalLink className="h-3 w-3 ml-0.5 opacity-60" />
                            </Link>
                          )}
                        </div>
                        {item.relatedFlag && (
                          <SeverityBadge severity={item.relatedFlag.severity} />
                        )}
                      </div>
                    ))}
                  </div>
                  {items[0]?.relatedFlag && (
                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                      <AlertOctagon className="h-3 w-3 text-orange-500" />
                      Resolve these data gaps to improve the <strong>{DOMAIN_LABELS[domain] ?? domain}</strong> domain score.
                      Missing evidence may directly prevent score recovery from associated red flags.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Compliance gaps by domain (active red flags) */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <AlertOctagon className="h-5 w-5 text-red-500" />
          Compliance Gaps by Domain (Active Red Flags)
        </h2>

        {Object.entries(flagsByDomain).map(([domain, flags]) => (
          <Card key={domain} className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{DOMAIN_LABELS[domain] ?? domain} ({flags.length} gaps)</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateMutation.mutate({ snapshotId: snapshot.id, domainKey: domain })}
                  disabled={generateMutation.isPending}
                >
                  <Download className="h-3 w-3 mr-1" />Generate Evidence
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Gap Description</TableHead>
                    <TableHead>DCAA Standard Violated</TableHead>
                    <TableHead>Recovery</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flags.map((flag: any) => (
                    <TableRow key={flag.id}>
                      <TableCell><SeverityBadge severity={flag.severity} /></TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{flag.title}</p>
                        <p className="text-xs text-muted-foreground">{flag.description}</p>
                        {/* Show count of SCORER_UNAVAILABLE items linked to this domain */}
                        {unavailableByDomain[flag.domainKey]?.length > 0 && (
                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-1">
                            <FileX2 className="h-3 w-3" />
                            {unavailableByDomain[flag.domainKey].length} evidence item{unavailableByDomain[flag.domainKey].length > 1 ? 's' : ''} unavailable in this domain
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {flag.farCitation ? (
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-mono">{flag.farCitation}</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-medium text-green-600">+{flag.potentialScoreRecovery ?? 0} pts</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        {activeFlags.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileWarning className="h-12 w-12 text-green-500" />
            <p className="text-muted-foreground">No active compliance gaps detected</p>
          </div>
        )}
      </div>
    </div>
  );
}
