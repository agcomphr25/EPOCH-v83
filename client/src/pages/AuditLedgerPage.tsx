import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, Download, ShieldCheck, Anchor, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface LedgerRow {
  id: number;
  sequenceNumber: number | null;
  occurredAt: string | null;
  recordedAt: string | null;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  entityType: string | null;
  entityId: string | null;
  sourceService: string | null;
  actorName: string | null;
  actorId: number | null;
  reason: string | null;
  payloadHash: string | null;
  prevHash: string | null;
  rowHash: string | null;
}

interface ReportResponse {
  rows: LedgerRow[];
  total: number;
  limit: number;
  offset: number;
}

interface SavedTemplate {
  key: string;
  title: string;
  description: string;
  framework: 'DCAA' | 'CMMC' | 'INTERNAL';
}

interface ChainResult {
  startSequence: number;
  endSequence: number;
  rowsChecked: number;
  ok: boolean;
  firstMismatchSequence?: number;
  firstMismatchEventId?: number;
  message?: string;
  headRowHash?: string;
}

interface AnchorRow {
  id: string;
  anchoredAt: string;
  headSequence: number;
  headRowHash: string;
  eventCount: number;
  notes: string | null;
  createdBy: string | null;
}

interface RetentionRow {
  eventType: string;
  minRetentionDays: number;
  framework: string | null;
  notes: string | null;
}

function shortHash(h: string | null | undefined) {
  if (!h) return '—';
  return h.slice(0, 10) + '…' + h.slice(-6);
}

export default function AuditLedgerPage() {
  const { toast } = useToast();

  // Filters
  const [eventTypes, setEventTypes] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [sourceService, setSourceService] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeTemplate, setActiveTemplate] = useState<string>('');

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (eventTypes.trim()) p.set('eventTypes', eventTypes.trim());
    if (subjectType.trim()) p.set('subjectType', subjectType.trim());
    if (subjectId.trim()) p.set('subjectId', subjectId.trim());
    if (sourceService.trim()) p.set('sourceService', sourceService.trim());
    if (fromDate) p.set('fromDate', new Date(fromDate).toISOString());
    if (toDate) p.set('toDate', new Date(toDate).toISOString());
    p.set('limit', '200');
    return p.toString();
  }, [eventTypes, subjectType, subjectId, sourceService, fromDate, toDate]);

  const reportPath = activeTemplate
    ? `/api/audit-ledger/report/${activeTemplate}?${filterParams}`
    : `/api/audit-ledger/report?${filterParams}`;

  const { data: report, isLoading: reportLoading, refetch } = useQuery<ReportResponse>({
    queryKey: ['/api/audit-ledger', activeTemplate || 'free', filterParams],
    queryFn: async () => {
      const res = await fetch(reportPath, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load ledger report');
      return res.json();
    },
  });

  const { data: templates = [] } = useQuery<SavedTemplate[]>({
    queryKey: ['/api/audit-ledger/templates'],
  });

  const { data: anchors = [] } = useQuery<AnchorRow[]>({
    queryKey: ['/api/audit-ledger/anchors'],
  });

  const { data: retention = [] } = useQuery<RetentionRow[]>({
    queryKey: ['/api/audit-ledger/retention'],
  });

  const verify = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/audit-ledger/verify', {});
      return (await res.json()) as ChainResult;
    },
    onSuccess: (r) => {
      toast({
        title: r.ok ? 'Chain verified' : 'Chain integrity FAILED',
        description: r.ok
          ? `Walked ${r.rowsChecked} rows up to seq #${r.endSequence}.`
          : r.message ?? 'Mismatch detected.',
        variant: r.ok ? 'default' : 'destructive',
      });
    },
    onError: () =>
      toast({ title: 'Verification failed', variant: 'destructive' }),
  });

  const writeAnchor = useMutation({
    mutationFn: async (notes: string) => {
      const res = await apiRequest('POST', '/api/audit-ledger/anchors', { notes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Anchor recorded' });
      queryClient.invalidateQueries({ queryKey: ['/api/audit-ledger/anchors'] });
    },
    onError: () =>
      toast({ title: 'Failed to write anchor', variant: 'destructive' }),
  });

  async function handleExport() {
    try {
      const res = await fetch(`/api/audit-ledger/export.csv?${filterParams}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('export failed');
      const sha = res.headers.get('X-Audit-Sha256') ?? '';
      const manifestB64 = res.headers.get('X-Audit-Manifest') ?? '';
      const blob = await res.blob();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-ledger-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (manifestB64) {
        const manifestJson = atob(manifestB64);
        const manifestBlob = new Blob([manifestJson], { type: 'application/json' });
        const url2 = URL.createObjectURL(manifestBlob);
        const a2 = document.createElement('a');
        a2.href = url2;
        a2.download = `audit-ledger-${ts}.manifest.json`;
        document.body.appendChild(a2);
        a2.click();
        document.body.removeChild(a2);
        URL.revokeObjectURL(url2);
      }

      toast({
        title: 'Export complete',
        description: sha ? `SHA-256: ${sha.slice(0, 12)}…` : undefined,
      });
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-audit-ledger">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Unified Audit Ledger
          </h1>
          <p className="text-muted-foreground">
            Append-only, hash-chained record of compliance-relevant events (DCAA / CMMC).
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => verify.mutate()}
            disabled={verify.isPending}
            data-testid="button-verify-chain"
          >
            {verify.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Verify chain
          </Button>
          <Button
            variant="outline"
            onClick={() => writeAnchor.mutate(`Manual anchor ${new Date().toISOString()}`)}
            disabled={writeAnchor.isPending}
            data-testid="button-write-anchor"
          >
            <Anchor className="h-4 w-4 mr-2" />
            Anchor head
          </Button>
          <Button onClick={handleExport} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="anchors">Anchors</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>
                Combine free-form filters or pick a saved DCAA / CMMC template.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="tpl">Saved template</Label>
                <Select
                  value={activeTemplate || 'none'}
                  onValueChange={(v) => setActiveTemplate(v === 'none' ? '' : v)}
                >
                  <SelectTrigger data-testid="select-template">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (free-form)</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        [{t.framework}] {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="eventTypes">Event types (comma-separated)</Label>
                <Input
                  id="eventTypes"
                  value={eventTypes}
                  onChange={(e) => setEventTypes(e.target.value)}
                  disabled={!!activeTemplate}
                  data-testid="input-event-types"
                />
              </div>
              <div>
                <Label htmlFor="sourceService">Source service</Label>
                <Input
                  id="sourceService"
                  value={sourceService}
                  onChange={(e) => setSourceService(e.target.value)}
                  data-testid="input-source-service"
                />
              </div>
              <div>
                <Label htmlFor="subjectType">Subject type</Label>
                <Input
                  id="subjectType"
                  value={subjectType}
                  onChange={(e) => setSubjectType(e.target.value)}
                  data-testid="input-subject-type"
                />
              </div>
              <div>
                <Label htmlFor="subjectId">Subject ID</Label>
                <Input
                  id="subjectId"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  data-testid="input-subject-id"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="fromDate">From</Label>
                  <Input
                    id="fromDate"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    data-testid="input-from-date"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="toDate">To</Label>
                  <Input
                    id="toDate"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    data-testid="input-to-date"
                  />
                </div>
              </div>
              <div className="md:col-span-3">
                <Button onClick={() => refetch()} variant="secondary" data-testid="button-apply-filters">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Apply filters
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Events {report ? `(${report.rows.length} of ${report.total})` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reportLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Seq</TableHead>
                        <TableHead>Occurred</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Row hash</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report?.rows ?? []).map((r) => (
                        <TableRow key={r.id} data-testid={`row-event-${r.id}`}>
                          <TableCell className="font-mono">{r.sequenceNumber ?? '—'}</TableCell>
                          <TableCell className="text-xs">
                            {r.occurredAt ? new Date(r.occurredAt).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{r.action}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.subjectType ?? r.entityType}
                            {' / '}
                            <span className="font-mono">{r.subjectId ?? r.entityId}</span>
                          </TableCell>
                          <TableCell className="text-xs">{r.sourceService ?? '—'}</TableCell>
                          <TableCell className="text-xs">
                            {r.actorName ?? (r.actorId != null ? `#${r.actorId}` : '—')}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {shortHash(r.rowHash)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!report || report.rows.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                            No events match these filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anchors">
          <Card>
            <CardHeader>
              <CardTitle>Chain-head anchors</CardTitle>
              <CardDescription>
                Tamper-evident checkpoints recorded by admins or scheduled jobs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anchored at</TableHead>
                    <TableHead>Head seq</TableHead>
                    <TableHead>Head row hash</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anchors.map((a) => (
                    <TableRow key={a.id} data-testid={`row-anchor-${a.id}`}>
                      <TableCell className="text-xs">
                        {new Date(a.anchoredAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono">{a.headSequence}</TableCell>
                      <TableCell className="text-xs font-mono">{shortHash(a.headRowHash)}</TableCell>
                      <TableCell>{a.eventCount}</TableCell>
                      <TableCell className="text-xs">{a.createdBy ?? '—'}</TableCell>
                      <TableCell className="text-xs">{a.notes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {anchors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No anchors recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retention">
          <Card>
            <CardHeader>
              <CardTitle>Retention policies</CardTitle>
              <CardDescription>
                DCAA / CMMC minimum retention windows. The default floor is 7 years.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event type</TableHead>
                    <TableHead>Min retention (days)</TableHead>
                    <TableHead>Framework</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retention.map((r) => (
                    <TableRow key={r.eventType}>
                      <TableCell className="font-mono">{r.eventType}</TableCell>
                      <TableCell>{r.minRetentionDays}</TableCell>
                      <TableCell>{r.framework ?? '—'}</TableCell>
                      <TableCell className="text-xs">{r.notes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
