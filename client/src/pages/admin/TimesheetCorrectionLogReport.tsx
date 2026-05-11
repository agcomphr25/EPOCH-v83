import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ClipboardPenLine,
  Download,
  FileClock,
  Fingerprint,
  Loader2,
  RefreshCw,
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

interface TimesheetCorrectionLogReportData {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    status: string | null;
    risk: string | null;
  };
  summary: {
    totalCorrections: number;
    pending: number;
    approved: number;
    rejected: number;
    completeEvidence: number;
    incompleteEvidence: number;
    missingAuditLedgerRows: number;
    postPayrollCorrections: number;
    selfReviewedCorrections: number;
    criticalExceptions: number;
    warningExceptions: number;
  };
  corrections: Array<{
    id: number;
    timesheetId: number;
    employeeId: number;
    employeeCode: string | null;
    employeeName: string;
    periodStart: string;
    periodEnd: string;
    timesheetStatus: string;
    totalHours: number;
    requestedByEmployeeId: number;
    requestedByName: string | null;
    requestedAt: string;
    reviewedByUserId: number | null;
    reviewedByName: string | null;
    reviewerEmployeeId: number | null;
    reviewedAt: string | null;
    status: string;
    reason: string;
    reviewerNote: string | null;
    originalSnapshot: unknown;
    proposedChanges: unknown;
    afterSnapshot: unknown;
    beforeAfterSummary: Array<{
      field: string;
      before: unknown;
      after: unknown;
    }>;
    exportedBatchIds: number[];
    auditLedgerRows: Array<{
      id: number;
      action: string;
      entityType: string | null;
      entityId: string | null;
      subjectType: string | null;
      subjectId: string | null;
      sequenceNumber: number | null;
      rowHash: string | null;
      occurredAt: string | null;
      actorName: string | null;
    }>;
    flags: string[];
    severity: Severity;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    correctionId: number;
    timesheetId: number;
  }>;
}

function num(value: number, digits = 0) {
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function compact(value: unknown) {
  if (value == null || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'warning') return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const bad = ['REJECTED', 'CRITICAL', 'APPROVED_MISSING_AFTER_SNAPSHOT', 'SELF_REVIEW', 'MISSING_BEFORE_SNAPSHOT'].includes(normalized);
  const warn = ['PENDING', 'WARNING', 'MISSING_AUDIT_LEDGER_LINK', 'POST_PAYROLL_CORRECTION'].includes(normalized);
  const good = ['APPROVED', 'COMPLETE'].includes(normalized);
  return <Badge variant={bad ? 'destructive' : good ? 'default' : warn ? 'secondary' : 'outline'}>{value.replaceAll('_', ' ')}</Badge>;
}

function downloadCsv(report: TimesheetCorrectionLogReportData) {
  const header = [
    'Correction ID',
    'Timesheet ID',
    'Employee',
    'Period Start',
    'Period End',
    'Timesheet Status',
    'Correction Status',
    'Requested By',
    'Requested At',
    'Reason',
    'Reviewed By',
    'Reviewed At',
    'Reviewer Note',
    'Before/After Summary',
    'Payroll Batch IDs',
    'Audit Ledger Event IDs',
    'Audit Sequences',
    'Severity',
    'Flags',
  ];
  const lines = [
    ['Timesheet Correction Log'],
    ['Generated At', report.generatedAt],
    ['Date Range', `${report.filters.startDate ?? 'All'} through ${report.filters.endDate ?? 'All'}`],
    [],
    header,
    ...report.corrections.map((row) => [
      row.id,
      row.timesheetId,
      row.employeeName,
      row.periodStart,
      row.periodEnd,
      row.timesheetStatus,
      row.status,
      row.requestedByName ?? row.requestedByEmployeeId,
      row.requestedAt,
      row.reason,
      row.reviewedByName ?? row.reviewedByUserId,
      row.reviewedAt,
      row.reviewerNote,
      row.beforeAfterSummary.map((item) => `${item.field}: ${compact(item.before)} -> ${compact(item.after)}`).join('; '),
      row.exportedBatchIds.join('; '),
      row.auditLedgerRows.map((item) => item.id).join('; '),
      row.auditLedgerRows.map((item) => item.sequenceNumber ?? '').join('; '),
      row.severity,
      row.flags.join('; '),
    ]),
    [],
    ['Exceptions'],
    ['Severity', 'Type', 'Message', 'Correction ID', 'Timesheet ID'],
    ...report.exceptions.map((row) => [
      row.severity,
      row.exceptionType,
      row.message,
      row.correctionId,
      row.timesheetId,
    ]),
  ];
  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `timesheet-correction-log-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function TimesheetCorrectionLogReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('all');
  const [risk, setRisk] = useState('all');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (status !== 'all') params.set('status', status);
    if (risk !== 'all') params.set('risk', risk);
    return `/api/edri/timesheet-correction-log${params.toString() ? `?${params.toString()}` : ''}`;
  }, [startDate, endDate, status, risk]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<TimesheetCorrectionLogReportData>({
    queryKey: ['timesheet-correction-log-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardPenLine className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Timesheet Correction Log</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Before/after correction lineage, requester and reviewer evidence, approval decision, reviewer notes, payroll impact, and audit-ledger linkage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/edri/audit-ledger-integrity">
              <Fingerprint className="mr-2 h-4 w-4" />
              Audit Integrity
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button size="sm" onClick={() => data && downloadCsv(data)} disabled={!data}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="start-date">Start date</Label>
          <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="end-date">End date</Label>
          <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Risk</Label>
          <Select value={risk} onValueChange={setRisk}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive">
          <CardContent className="py-6 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load timesheet correction log.'}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building timesheet correction log...
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Corrections</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.totalCorrections}</div>
                <p className="text-xs text-muted-foreground">{data.summary.approved} approved / {data.summary.rejected} rejected / {data.summary.pending} pending</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Complete Evidence</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.completeEvidence}</div>
                <p className="text-xs text-muted-foreground">{data.summary.incompleteEvidence} incomplete evidence chains</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ledger Gaps</CardTitle></CardHeader>
              <CardContent>
                <div className={data.summary.missingAuditLedgerRows > 0 ? 'text-2xl font-bold text-destructive' : 'text-2xl font-bold'}>
                  {data.summary.missingAuditLedgerRows}
                </div>
                <p className="text-xs text-muted-foreground">{data.summary.postPayrollCorrections} post-payroll/export corrections</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Risk Flags</CardTitle></CardHeader>
              <CardContent>
                <div className={data.summary.criticalExceptions > 0 ? 'text-2xl font-bold text-destructive' : 'text-2xl font-bold'}>
                  {data.summary.criticalExceptions}
                </div>
                <p className="text-xs text-muted-foreground">{data.summary.warningExceptions} warning exceptions, {data.summary.selfReviewedCorrections} self-reviewed</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileClock className="h-5 w-5 text-muted-foreground" />
                Correction Chain of Custody
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correction</TableHead>
                    <TableHead>Employee / Period</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Reviewed</TableHead>
                    <TableHead>Before / After</TableHead>
                    <TableHead>Ledger</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.corrections.slice(0, 250).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">Correction {row.id}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <StatusBadge value={row.status} />
                          <SeverityBadge severity={row.severity} />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">Timesheet {row.timesheetId} | {row.timesheetStatus}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeCode ?? row.employeeId}</div>
                        <div className="text-xs text-muted-foreground">{row.periodStart} to {row.periodEnd}</div>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <div>{row.requestedByName ?? row.requestedByEmployeeId}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(row.requestedAt)}</div>
                        <div className="mt-1 text-xs">{row.reason || '-'}</div>
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        <div>{row.reviewedByName ?? row.reviewedByUserId ?? '-'}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(row.reviewedAt)}</div>
                        <div className="mt-1 text-xs">{row.reviewerNote ?? '-'}</div>
                      </TableCell>
                      <TableCell className="min-w-[320px]">
                        {row.beforeAfterSummary.length === 0 ? (
                          <span className="text-sm text-muted-foreground">No field-level summary available</span>
                        ) : (
                          <div className="space-y-1">
                            {row.beforeAfterSummary.slice(0, 4).map((item, idx) => (
                              <div key={`${row.id}-${item.field}-${idx}`} className="text-xs">
                                <span className="font-medium">{item.field}:</span>{' '}
                                <span className="text-muted-foreground">{compact(item.before)}</span>{' '}
                                <span>{'->'}</span>{' '}
                                <span>{compact(item.after)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">Events {row.auditLedgerRows.length}</div>
                        <div className="text-xs text-muted-foreground">
                          Seq {row.auditLedgerRows.map((item) => item.sequenceNumber).filter(Boolean).slice(0, 3).join(', ') || '-'}
                        </div>
                        <div className="text-xs text-muted-foreground">Batches {row.exportedBatchIds.join(', ') || '-'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[260px] flex-wrap gap-1">
                          {row.flags.length ? row.flags.map((flag) => <StatusBadge key={flag} value={flag} />) : <StatusBadge value="COMPLETE" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.corrections.length > 250 ? (
                <p className="mt-3 text-xs text-muted-foreground">Showing first 250 corrections. Export CSV for the full correction log.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                Exception Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.exceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No correction exceptions detected for the current filters.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Correction</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.exceptions.slice(0, 100).map((row, idx) => (
                      <TableRow key={`${row.exceptionType}-${row.correctionId}-${idx}`}>
                        <TableCell><SeverityBadge severity={row.severity} /></TableCell>
                        <TableCell>{row.exceptionType.replaceAll('_', ' ')}</TableCell>
                        <TableCell>{row.message}</TableCell>
                        <TableCell>{row.correctionId}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Generated {formatDateTime(data.generatedAt)}. Audit ledger linkage is matched by correction subject/entity IDs, timesheet correction actions, and supplemental time-entry correction events.
          </p>
        </>
      ) : null}
    </div>
  );
}
