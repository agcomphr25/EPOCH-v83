import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, RefreshCw, Settings, ChevronRight, Activity } from 'lucide-react';

type Anomaly = {
  id: string;
  detectorKey: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'DISMISSED' | 'ESCALATED';
  detectedAt: string;
  summary: string;
  agPartNumber: string | null;
  performedByDisplayName: string | null;
  approvedByDisplayName: string | null;
  assignedToUserId: number | null;
  assignedToDisplayName: string | null;
  contextJson: Record<string, unknown>;
  ledgerEntryIds: string[];
};

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

type AnomalyDetail = Anomaly & {
  ledgerEntries: Array<{
    id: string;
    transactionNumber: string;
    transactionType: string;
    agPartNumber: string;
    quantityDelta: string;
    quantityBefore: string;
    quantityAfter: string;
    performedByDisplayName: string;
    approvedByDisplayName: string | null;
    reasonCode: string | null;
    notes: string | null;
    sourceModule: string;
    createdAt: string;
  }>;
};

const severityColor: Record<Anomaly['severity'], string> = {
  LOW: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
  MEDIUM: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
};

const statusColor: Record<Anomaly['status'], string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  ACKNOWLEDGED: 'bg-emerald-100 text-emerald-800',
  DISMISSED: 'bg-slate-100 text-slate-700',
  ESCALATED: 'bg-purple-100 text-purple-800',
};

export default function InventoryAnomalyDashboard() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [detectorFilter, setDetectorFilter] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<null | 'ack' | 'dismiss' | 'escalate'>(null);
  const [actionNote, setActionNote] = useState('');

  const params = new URLSearchParams();
  if (statusFilter !== 'ALL') params.set('status', statusFilter);
  if (severityFilter !== 'ALL') params.set('severity', severityFilter);
  if (detectorFilter !== 'ALL') params.set('detectorKey', detectorFilter);

  const anomaliesQuery = useQuery<Anomaly[]>({
    queryKey: ['/api/inventory-anomalies', statusFilter, severityFilter, detectorFilter],
    queryFn: async () => {
      const res = await fetch(`/api/inventory-anomalies?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load anomalies');
      return res.json();
    },
  });

  const detectorsQuery = useQuery<Array<{ key: string; description: string }>>({
    queryKey: ['/api/inventory-anomalies/detectors'],
    queryFn: async () => {
      const res = await fetch('/api/inventory-anomalies/detectors', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load detectors');
      return res.json();
    },
  });

  const detailQuery = useQuery<AnomalyDetail>({
    queryKey: ['/api/inventory-anomalies', selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const res = await fetch(`/api/inventory-anomalies/${selectedId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load anomaly');
      return res.json();
    },
  });

  const runScanMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/inventory-anomalies/run', {}),
    onSuccess: () => {
      toast({ title: 'Scan complete', description: 'Anomaly detection finished.' });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-anomalies'] });
    },
    onError: (err: any) =>
      toast({ title: 'Scan failed', description: err?.message ?? '', variant: 'destructive' }),
  });

  const triageMutation = useMutation({
    mutationFn: async ({ id, kind, body }: { id: string; kind: string; body: any }) =>
      apiRequest('POST', `/api/inventory-anomalies/${id}/${kind}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory-anomalies'] });
      setActionKind(null);
      setActionNote('');
      toast({ title: 'Updated' });
    },
    onError: (err: any) =>
      toast({ title: 'Action failed', description: err?.message ?? '', variant: 'destructive' }),
  });

  const submitAction = () => {
    if (!selectedId || !actionKind) return;
    const body =
      actionKind === 'ack'
        ? { note: actionNote }
        : actionKind === 'dismiss'
          ? { reason: actionNote }
          : { note: actionNote };
    const path = actionKind === 'ack' ? 'acknowledge' : actionKind === 'dismiss' ? 'dismiss' : 'escalate';
    triageMutation.mutate({ id: selectedId, kind: path, body });
  };

  const counts = {
    open: anomaliesQuery.data?.filter((a) => a.status === 'OPEN').length ?? 0,
    high: anomaliesQuery.data?.filter((a) => a.severity === 'HIGH' || a.severity === 'CRITICAL').length ?? 0,
    total: anomaliesQuery.data?.length ?? 0,
  };

  // Group OPEN anomalies by detector so admins see at-a-glance which
  // detector(s) are firing and how many of each are pending triage.
  const openByDetector = (() => {
    const map = new Map<string, { count: number; high: number; latest: string }>();
    for (const a of anomaliesQuery.data ?? []) {
      if (a.status !== 'OPEN') continue;
      const cur = map.get(a.detectorKey) ?? { count: 0, high: 0, latest: a.detectedAt };
      cur.count += 1;
      if (a.severity === 'HIGH' || a.severity === 'CRITICAL') cur.high += 1;
      if (a.detectedAt > cur.latest) cur.latest = a.detectedAt;
      map.set(a.detectorKey, cur);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count);
  })();

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <AlertTriangle className="w-7 h-7 text-orange-500" />
            Inventory Anomaly Detection
          </h1>
          <p className="text-muted-foreground">
            Surfaces fraud and error patterns from the inventory transaction ledger.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => runScanMutation.mutate()}
            disabled={runScanMutation.isPending}
            data-testid="button-run-scan"
          >
            <Activity className="w-4 h-4 mr-1" />
            {runScanMutation.isPending ? 'Scanning…' : 'Run scan now'}
          </Button>
          <Link href="/admin/anomaly-config">
            <Button variant="outline" data-testid="link-detector-config">
              <Settings className="w-4 h-4 mr-1" />
              Detector config
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card data-testid="card-stat-open">
          <CardHeader className="pb-2"><CardDescription>Open</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">{counts.open}</div></CardContent>
        </Card>
        <Card data-testid="card-stat-high">
          <CardHeader className="pb-2"><CardDescription>High / Critical</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold text-orange-600">{counts.high}</div></CardContent>
        </Card>
        <Card data-testid="card-stat-total">
          <CardHeader className="pb-2"><CardDescription>In view</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">{counts.total}</div></CardContent>
        </Card>
      </div>

      <Card data-testid="card-open-by-detector">
        <CardHeader>
          <CardTitle>Open anomalies by detector</CardTitle>
          <CardDescription>Pending triage, grouped by which detector fired.</CardDescription>
        </CardHeader>
        <CardContent>
          {openByDetector.length === 0 ? (
            <div className="text-sm text-muted-foreground">No open anomalies.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {openByDetector.map((g) => (
                <button
                  key={g.key}
                  className="text-left p-3 rounded border hover:bg-accent transition-colors"
                  onClick={() => {
                    setStatusFilter('OPEN');
                    setDetectorFilter(g.key);
                  }}
                  data-testid={`group-detector-${g.key}`}
                >
                  <div className="font-medium">{g.key}</div>
                  <div className="text-sm text-muted-foreground">
                    {g.count} open · {g.high} HIGH/CRITICAL
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48" data-testid="select-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
              <SelectItem value="ESCALATED">Escalated</SelectItem>
              <SelectItem value="DISMISSED">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-48" data-testid="select-severity"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All severities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={detectorFilter} onValueChange={setDetectorFilter}>
            <SelectTrigger className="w-64" data-testid="select-detector"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All detectors</SelectItem>
              {detectorsQuery.data?.map((d) => (
                <SelectItem key={d.key} value={d.key}>{d.key}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anomalies</CardTitle>
        </CardHeader>
        <CardContent>
          {anomaliesQuery.isLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : !anomaliesQuery.data || anomaliesQuery.data.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">No anomalies match the filters.</div>
          ) : (
            <div className="space-y-2">
              {anomaliesQuery.data.map((a) => (
                <button
                  key={a.id}
                  className="w-full text-left p-3 rounded border hover:bg-accent transition-colors flex items-start gap-3"
                  onClick={() => setSelectedId(a.id)}
                  data-testid={`row-anomaly-${a.id}`}
                >
                  <div className="flex flex-col gap-1">
                    <Badge className={severityColor[a.severity]}>{a.severity}</Badge>
                    <Badge variant="outline" className={statusColor[a.status]}>{a.status}</Badge>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{a.summary}</div>
                    <div className="text-sm text-muted-foreground">
                      {a.detectorKey} · {new Date(a.detectedAt).toLocaleString()}
                      {a.agPartNumber ? ` · ${a.agPartNumber}` : ''}
                      {a.performedByDisplayName ? ` · by ${a.performedByDisplayName}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground min-w-[6rem]">
                    <span data-testid={`text-age-${a.id}`}>{ageLabel(a.detectedAt)} old</span>
                    <span data-testid={`text-assignee-${a.id}`}>
                      {a.assignedToDisplayName ? `→ ${a.assignedToDisplayName}` : 'unassigned'}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-detail-title">Anomaly detail</DialogTitle>
          </DialogHeader>
          {detailQuery.data ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge className={severityColor[detailQuery.data.severity]}>{detailQuery.data.severity}</Badge>
                <Badge variant="outline" className={statusColor[detailQuery.data.status]}>{detailQuery.data.status}</Badge>
                <Badge variant="outline">{detailQuery.data.detectorKey}</Badge>
              </div>
              <div className="font-medium">{detailQuery.data.summary}</div>
              <div>
                <div className="text-sm font-semibold mb-1">Context</div>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify(detailQuery.data.contextJson, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Linked ledger entries ({detailQuery.data.ledgerEntries.length})</div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {detailQuery.data.ledgerEntries.map((e) => (
                    <div key={e.id} className="text-xs p-2 border rounded" data-testid={`row-ledger-entry-${e.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono">{e.transactionNumber}</span> · {e.transactionType} · Δ {e.quantityDelta} ({e.quantityBefore} → {e.quantityAfter})
                        </div>
                        <Link
                          href={`/inventory/ledger?search=${encodeURIComponent(e.transactionNumber)}`}
                          data-testid={`link-ledger-${e.id}`}
                        >
                          <span className="text-xs text-blue-600 hover:underline">Open in ledger →</span>
                        </Link>
                      </div>
                      <div className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()} · {e.performedByDisplayName} · {e.sourceModule}</div>
                      {e.reasonCode ? <div>Reason: {e.reasonCode}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-sm text-muted-foreground" data-testid="text-detail-meta">
                Detected {new Date(detailQuery.data.detectedAt).toLocaleString()} · {ageLabel(detailQuery.data.detectedAt)} old · Assignee:{' '}
                {detailQuery.data.assignedToDisplayName ?? 'unassigned'}
              </div>
              {detailQuery.data.status === 'OPEN' || detailQuery.data.status === 'ESCALATED' ? (
                <div className="flex gap-2 pt-2 flex-wrap">
                  <Button onClick={() => setActionKind('ack')} data-testid="button-acknowledge">Acknowledge</Button>
                  <Button variant="outline" onClick={() => setActionKind('dismiss')} data-testid="button-dismiss">Dismiss</Button>
                  {detailQuery.data.status === 'OPEN' && (
                    <Button variant="destructive" onClick={() => setActionKind('escalate')} data-testid="button-escalate">Escalate</Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const name = window.prompt('Assign to (display name):', detailQuery.data?.assignedToDisplayName ?? '');
                      if (name == null) return;
                      triageMutation.mutate({
                        id: detailQuery.data!.id,
                        kind: 'assign',
                        body: { displayName: name.trim() || null },
                      });
                    }}
                    data-testid="button-assign"
                  >
                    Assign…
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div>Loading…</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!actionKind} onOpenChange={(o) => !o && setActionKind(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionKind === 'ack' && 'Acknowledge anomaly'}
              {actionKind === 'dismiss' && 'Dismiss anomaly'}
              {actionKind === 'escalate' && 'Escalate anomaly'}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder={actionKind === 'dismiss' ? 'Reason for dismissal' : 'Note'}
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            data-testid="input-action-note"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionKind(null)}>Cancel</Button>
            <Button
              onClick={submitAction}
              disabled={!actionNote.trim() || triageMutation.isPending}
              data-testid="button-submit-action"
            >
              {triageMutation.isPending ? 'Saving…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
