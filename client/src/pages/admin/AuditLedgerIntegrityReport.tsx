import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Anchor,
  CheckCircle2,
  Download,
  Fingerprint,
  Hash,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import EdriSubNav from '@/components/EdriSubNav';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Severity = 'info' | 'warning' | 'critical';

interface AuditLedgerIntegrityReportData {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    windowSize: number;
  };
  summary: {
    totalLedgerEvents: number;
    chainedEvents: number;
    chainCoveragePercent: number;
    chainOk: boolean;
    rowsVerified: number;
    latestSequence: number;
    latestAnchorSequence: number | null;
    latestAnchorAt: string | null;
    anchorLagEvents: number | null;
    retentionPolicyCount: number;
    belowFloorPolicies: number;
    tamperAttempts: number;
    unresolvedTamperAttempts: number;
    exportRowCount: number;
    exportSha256: string;
  };
  chainVerification: {
    ok: boolean;
    startSequence: number;
    endSequence: number;
    rowsChecked: number;
    firstMismatchSequence: number | null;
    firstMismatchEventId: number | null;
    headRowHash: string | null;
    message: string | null;
    verifiedAt: string;
    windowSize: number;
  };
  latestAnchors: Array<{
    id: number;
    anchoredAt: string;
    headEventId: number | null;
    headRowHash: string | null;
    headSequence: number | null;
    eventCount: number | null;
    notes: string | null;
    exportedTo: string | null;
    createdBy: string | null;
  }>;
  retentionPolicies: Array<{
    id: number;
    eventType: string;
    minRetentionDays: number;
    archiveAfterDays: number | null;
    description: string | null;
    updatedAt: string;
    belowDcaaFloor: boolean;
  }>;
  tamperAttempts: Array<{
    id: number;
    attemptedAt: string | null;
    op: string | null;
    dbRole: string | null;
    sessionUser: string | null;
    clientAddr: string | null;
    applicationName: string | null;
    targetId: string | null;
    targetSequence: number | null;
    drainedAt: string | null;
    drainedEventId: number | null;
  }>;
  exportManifest: {
    generatedAt: string;
    rowCount: number;
    sha256: string;
    columns: string[];
    filters: Record<string, unknown>;
  };
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
  }>;
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function shortHash(value: string | null) {
  if (!value) return '-';
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'warning') return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

function IntegrityBadge({ ok }: { ok: boolean }) {
  return <Badge variant={ok ? 'default' : 'destructive'}>{ok ? 'Verified' : 'Failed'}</Badge>;
}

function downloadCsv(report: AuditLedgerIntegrityReportData) {
  const lines = [
    ['Audit Ledger Integrity Report'],
    ['Generated At', report.generatedAt],
    ['Date Range', `${report.filters.startDate ?? 'All'} through ${report.filters.endDate ?? 'All'}`],
    ['Verification Window', report.filters.windowSize],
    [],
    ['Summary'],
    ['Total Ledger Events', report.summary.totalLedgerEvents],
    ['Chained Events', report.summary.chainedEvents],
    ['Chain Coverage Percent', report.summary.chainCoveragePercent],
    ['Chain OK', report.summary.chainOk ? 'Yes' : 'No'],
    ['Rows Verified', report.summary.rowsVerified],
    ['Latest Sequence', report.summary.latestSequence],
    ['Latest Anchor Sequence', report.summary.latestAnchorSequence],
    ['Anchor Lag Events', report.summary.anchorLagEvents],
    ['Tamper Attempts', report.summary.tamperAttempts],
    ['Unresolved Tamper Attempts', report.summary.unresolvedTamperAttempts],
    ['Export Row Count', report.summary.exportRowCount],
    ['Export SHA-256', report.summary.exportSha256],
    [],
    ['Anchors'],
    ['Anchored At', 'Head Sequence', 'Head Event ID', 'Head Row Hash', 'Event Count', 'Exported To', 'Created By', 'Notes'],
    ...report.latestAnchors.map((row) => [
      row.anchoredAt,
      row.headSequence,
      row.headEventId,
      row.headRowHash,
      row.eventCount,
      row.exportedTo,
      row.createdBy,
      row.notes,
    ]),
    [],
    ['Retention Policies'],
    ['Event Type', 'Min Retention Days', 'Archive After Days', 'Below DCAA Floor', 'Updated At', 'Description'],
    ...report.retentionPolicies.map((row) => [
      row.eventType,
      row.minRetentionDays,
      row.archiveAfterDays,
      row.belowDcaaFloor ? 'Yes' : 'No',
      row.updatedAt,
      row.description,
    ]),
    [],
    ['Tamper Attempts'],
    ['Attempted At', 'Operation', 'DB Role', 'Target ID', 'Target Sequence', 'Drained At', 'Drained Event ID'],
    ...report.tamperAttempts.map((row) => [
      row.attemptedAt,
      row.op,
      row.dbRole,
      row.targetId,
      row.targetSequence,
      row.drainedAt,
      row.drainedEventId,
    ]),
    [],
    ['Exceptions'],
    ['Severity', 'Type', 'Message'],
    ...report.exceptions.map((row) => [row.severity, row.exceptionType, row.message]),
  ];
  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `audit-ledger-integrity-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AuditLedgerIntegrityReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [windowSize, setWindowSize] = useState('5000');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (windowSize !== '5000') params.set('windowSize', windowSize);
    return `/api/edri/audit-ledger-integrity${params.toString() ? `?${params.toString()}` : ''}`;
  }, [startDate, endDate, windowSize]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<AuditLedgerIntegrityReportData>({
    queryKey: ['audit-ledger-integrity-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  const criticalExceptions = data?.exceptions.filter((row) => row.severity === 'critical').length ?? 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Fingerprint className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Audit Ledger Integrity Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Hash-chain verification, latest anchors, retention settings, tamper attempts, and CSV export manifest evidence with SHA-256.
          </p>
          {data && <p className="text-xs text-muted-foreground">Generated {formatDateTime(data.generatedAt)}.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={() => data && downloadCsv(data)} disabled={!data}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="start-date">Start date</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">End date</Label>
            <Input id="end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Verification window</Label>
            <Select value={windowSize} onValueChange={setWindowSize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1000">Last 1,000 events</SelectItem>
                <SelectItem value="5000">Last 5,000 events</SelectItem>
                <SelectItem value="10000">Last 10,000 events</SelectItem>
                <SelectItem value="50000">Last 50,000 events</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Unable to load audit ledger integrity report.'}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Chain Status</p>
                <p className="text-2xl font-bold">{data?.summary.chainOk ? 'Verified' : 'Review'}</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.rowsVerified ?? 0} rows verified</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Chain Coverage</p>
                <p className="text-2xl font-bold">{data?.summary.chainCoveragePercent ?? 0}%</p>
              </div>
              <Hash className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.chainedEvents ?? 0} of {data?.summary.totalLedgerEvents ?? 0} events chained</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Latest Anchor</p>
                <p className="text-2xl font-bold">{data?.summary.latestAnchorSequence ?? '-'}</p>
              </div>
              <Anchor className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.anchorLagEvents ?? '-'} event lag</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Exceptions</p>
                <p className="text-2xl font-bold">{criticalExceptions}</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.tamperAttempts ?? 0} tamper attempts</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chain Verification</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-24 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              Verifying ledger chain...
            </div>
          ) : data && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-2"><IntegrityBadge ok={data.chainVerification.ok} /></div>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Sequence Range</p>
                <p className="mt-2 font-medium">{data.chainVerification.startSequence} to {data.chainVerification.endSequence}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Head Hash</p>
                <p className="mt-2 font-mono text-xs">{shortHash(data.chainVerification.headRowHash)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Verified At</p>
                <p className="mt-2 text-sm">{formatDateTime(data.chainVerification.verifiedAt)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest Anchors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anchored At</TableHead>
                    <TableHead>Head Seq</TableHead>
                    <TableHead>Hash</TableHead>
                    <TableHead>Export</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.latestAnchors ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateTime(row.anchoredAt)}</TableCell>
                      <TableCell>{row.headSequence ?? '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{shortHash(row.headRowHash)}</TableCell>
                      <TableCell>{row.exportedTo ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && (data?.latestAnchors.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">No anchors recorded.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CSV Export Manifest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">SHA-256</p>
              <p className="mt-2 break-all font-mono text-xs">{data?.exportManifest.sha256 ?? '-'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Rows</p>
                <p className="mt-2 font-medium">{data?.exportManifest.rowCount ?? 0}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Generated</p>
                <p className="mt-2">{formatDateTime(data?.exportManifest.generatedAt ?? null)}</p>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Columns</p>
              <p className="mt-2 text-xs text-muted-foreground">{data?.exportManifest.columns.join(', ') ?? '-'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Retention Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Min Days</TableHead>
                  <TableHead>Archive After</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.retentionPolicies ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.eventType}</TableCell>
                    <TableCell>{row.minRetentionDays}</TableCell>
                    <TableCell>{row.archiveAfterDays ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={row.belowDcaaFloor ? 'destructive' : 'default'}>
                        {row.belowDcaaFloor ? 'Below floor' : 'OK'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(row.updatedAt)}</TableCell>
                  </TableRow>
                ))}
                {!isLoading && (data?.retentionPolicies.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No retention policies configured.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Exceptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(data?.exceptions ?? []).map((row) => (
              <div key={row.exceptionType} className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex items-center gap-2">
                  <SeverityBadge severity={row.severity} />
                  <span className="font-medium">{row.exceptionType.replaceAll('_', ' ')}</span>
                </div>
                <p className="text-muted-foreground">{row.message}</p>
              </div>
            ))}
            {!isLoading && (data?.exceptions.length ?? 0) === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No audit ledger integrity exceptions were found.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
