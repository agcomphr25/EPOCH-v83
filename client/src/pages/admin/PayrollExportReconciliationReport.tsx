import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type ReconciliationStatus = 'MATCHED' | 'MISSING_FROM_EXPORT' | 'HOURS_MISMATCH' | 'EXPORTED_NOT_CERTIFIED';
type Severity = 'info' | 'warning' | 'critical';

interface PayrollExportReconciliationReportData {
  generatedAt: string;
  filters: {
    periodStart: string;
    periodEnd: string;
  };
  selectedBatch: {
    id: number;
    revisionNumber: number;
    status: string;
    processedAt: string | null;
    csvChecksum: string;
  } | null;
  summary: {
    certifiedTimesheets: number;
    certifiedEmployees: number;
    exportedEmployees: number;
    missingFromExport: number;
    exportedNotCertified: number;
    hourMismatches: number;
    processedBatches: number;
    activeBatches: number;
    supersededBatches: number;
    voidedBatches: number;
    downloadEvents: number;
    checksumFailures: number;
    totalCertifiedRegularHours: number;
    totalCertifiedOvertimeHours: number;
    totalExportedRegularHours: number;
    totalExportedOvertimeHours: number;
  };
  employeeRows: Array<{
    employeeId: number;
    epochEmployeeId: number | null;
    employeeName: string;
    employeeNumber: string | null;
    department: string | null;
    jobTitle: string | null;
    certifiedTimesheetIds: number[];
    exportedTimesheetIds: number[];
    certifiedRegularHours: number;
    certifiedOvertimeHours: number;
    certifiedTotalHours: number;
    exportedRegularHours: number;
    exportedOvertimeHours: number;
    exportedDoubleOvertimeHours: number;
    exportedSickHours: number;
    exportedVacationHours: number;
    regularDifference: number;
    overtimeDifference: number;
    status: ReconciliationStatus;
  }>;
  timesheetRows: Array<{
    timesheetId: number;
    employeeId: number;
    employeeName: string;
    periodStart: string;
    periodEnd: string;
    status: string;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    employeeAttested: boolean;
    attestedAt: string | null;
    certifiedByUserId: number | null;
    reviewedAt: string | null;
    reviewerEmail: string | null;
    includedInSelectedBatch: boolean;
    batchRevisions: string[];
    reconciliationStatus: ReconciliationStatus;
  }>;
  batches: Array<{
    id: number;
    revisionNumber: number;
    status: string;
    exportType: string;
    exportFormat: string;
    rowCount: number;
    employeeCount: number;
    totalRegularHours: number;
    totalOvertimeHours: number;
    totalSickHours: number;
    totalVacationHours: number;
    csvChecksum: string;
    recomputedChecksum: string | null;
    checksumVerified: boolean;
    sourceTimesheetCount: number;
    sourceLeaveEntryCount: number;
    supersedesBatchId: number | null;
    supersededReason: string | null;
    voidedReason: string | null;
    voidedAt: string | null;
    processedAt: string | null;
    processedBy: number | null;
    processedConfirmationNote: string | null;
    createdBy: number;
    createdAt: string | null;
  }>;
  events: Array<{
    id: number;
    batchId: number | null;
    batchRevisionNumber: number | null;
    eventType: string;
    actorId: number;
    actorEmail: string | null;
    actorRole: string | null;
    reason: string | null;
    metadata: unknown;
    ipAddress: string | null;
    createdAt: string | null;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    employeeId: number | null;
    employeeName: string | null;
    timesheetId: number | null;
    batchId: number | null;
  }>;
}

const statusLabel: Record<ReconciliationStatus, string> = {
  MATCHED: 'Matched',
  MISSING_FROM_EXPORT: 'Missing Export',
  HOURS_MISMATCH: 'Hours Mismatch',
  EXPORTED_NOT_CERTIFIED: 'Not Certified',
};

function formatHours(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function StatusBadge({ status }: { status: ReconciliationStatus }) {
  if (status === 'MATCHED') return <Badge className="bg-green-600 hover:bg-green-600">Matched</Badge>;
  if (status === 'HOURS_MISMATCH') return <Badge variant="destructive">Hours Mismatch</Badge>;
  return <Badge variant="secondary">{statusLabel[status]}</Badge>;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'warning') return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

function downloadCsv(report: PayrollExportReconciliationReportData) {
  const employeeHeader = [
    'Employee',
    'Employee Number',
    'Department',
    'Job Title',
    'Certified Timesheets',
    'Exported Timesheets',
    'Certified Regular',
    'Certified OT',
    'Exported Regular',
    'Exported OT',
    'Regular Difference',
    'OT Difference',
    'Sick',
    'Vacation',
    'Status',
  ];
  const batchHeader = [
    'Batch ID',
    'Revision',
    'Status',
    'Rows',
    'Employees',
    'Regular Hours',
    'Overtime Hours',
    'Sick Hours',
    'Vacation Hours',
    'CSV Checksum',
    'Checksum Verified',
    'Processed At',
    'Processed By',
    'Supersedes Batch',
    'Superseded Reason',
    'Voided Reason',
    'Created At',
  ];
  const eventHeader = [
    'Event ID',
    'Batch ID',
    'Revision',
    'Event Type',
    'Actor',
    'Role',
    'Reason',
    'IP Address',
    'Created At',
  ];
  const exceptionHeader = ['Severity', 'Type', 'Message', 'Employee', 'Timesheet ID', 'Batch ID'];

  const lines = [
    ['Payroll Export Reconciliation Report'],
    ['Generated At', report.generatedAt],
    ['Pay Period', `${report.filters.periodStart} through ${report.filters.periodEnd}`],
    ['Selected Batch', report.selectedBatch ? `Batch ${report.selectedBatch.id} rev ${report.selectedBatch.revisionNumber}` : 'None'],
    [],
    ['Employee Reconciliation'],
    employeeHeader,
    ...report.employeeRows.map((row) => [
      row.employeeName,
      row.employeeNumber,
      row.department,
      row.jobTitle,
      row.certifiedTimesheetIds.join(' | '),
      row.exportedTimesheetIds.join(' | '),
      row.certifiedRegularHours,
      row.certifiedOvertimeHours,
      row.exportedRegularHours,
      row.exportedOvertimeHours,
      row.regularDifference,
      row.overtimeDifference,
      row.exportedSickHours,
      row.exportedVacationHours,
      statusLabel[row.status],
    ]),
    [],
    ['Payroll Export Batches'],
    batchHeader,
    ...report.batches.map((batch) => [
      batch.id,
      batch.revisionNumber,
      batch.status,
      batch.rowCount,
      batch.employeeCount,
      batch.totalRegularHours,
      batch.totalOvertimeHours,
      batch.totalSickHours,
      batch.totalVacationHours,
      batch.csvChecksum,
      batch.checksumVerified ? 'Yes' : 'No',
      batch.processedAt,
      batch.processedBy,
      batch.supersedesBatchId,
      batch.supersededReason,
      batch.voidedReason,
      batch.createdAt,
    ]),
    [],
    ['Export Events'],
    eventHeader,
    ...report.events.map((event) => [
      event.id,
      event.batchId,
      event.batchRevisionNumber,
      event.eventType,
      event.actorEmail ?? event.actorId,
      event.actorRole,
      event.reason,
      event.ipAddress,
      event.createdAt,
    ]),
    [],
    ['Exceptions'],
    exceptionHeader,
    ...report.exceptions.map((exception) => [
      exception.severity,
      exception.exceptionType,
      exception.message,
      exception.employeeName ?? exception.employeeId,
      exception.timesheetId,
      exception.batchId,
    ]),
  ];

  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `payroll-export-reconciliation-${report.filters.periodStart}-${report.filters.periodEnd}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PayrollExportReconciliationReport() {
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('periodStart', periodStart);
    params.set('periodEnd', periodEnd);
    return `/api/edri/payroll-export-reconciliation?${params.toString()}`;
  }, [periodStart, periodEnd]);

  const hasPeriod = Boolean(periodStart && periodEnd);
  const { data, isLoading, isFetching, refetch, error } = useQuery<PayrollExportReconciliationReportData>({
    queryKey: ['payroll-export-reconciliation-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
    enabled: hasPeriod,
  });

  const exceptionCount = data?.exceptions.length ?? 0;
  const reconciled = data
    ? exceptionCount === 0 && data.selectedBatch?.status === 'processed' && data.summary.checksumFailures === 0
    : false;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Payroll Export Reconciliation Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Certified and locked timesheets reconciled to payroll export batches, CSV checksums, processed status, and export events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={!hasPeriod || isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button size="sm" onClick={() => data && downloadCsv(data)} disabled={!data}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="period-start">Period start</Label>
          <Input id="period-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="period-end">Period end</Label>
          <Input id="period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
      </div>

      {!hasPeriod ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Select a pay period to reconcile certified timesheets to the payroll export and processed payroll status.
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-destructive">
          <CardContent className="py-6 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Unable to load the report.'}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Building report
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className={reconciled ? 'border-green-600' : exceptionCount > 0 ? 'border-destructive' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Reconciliation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-2xl font-bold">
                  {reconciled ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  {reconciled ? 'Reconciled' : `${exceptionCount} exceptions`}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.missingFromExport} missing, {data.summary.hourMismatches} mismatched, {data.summary.exportedNotCertified} uncertified
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Timesheets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.certifiedTimesheets}</div>
                <p className="text-xs text-muted-foreground">{data.summary.certifiedEmployees} certified/locked employees</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Export Batch</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-semibold">
                  {data.selectedBatch ? `Batch ${data.selectedBatch.id} rev ${data.selectedBatch.revisionNumber}` : 'No batch'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.selectedBatch ? `${data.selectedBatch.status}, processed ${formatDateTime(data.selectedBatch.processedAt)}` : 'No export for period'}
                </p>
              </CardContent>
            </Card>
            <Card className={data.summary.checksumFailures > 0 ? 'border-destructive' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Evidence Trail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.downloadEvents}</div>
                <p className="text-xs text-muted-foreground">
                  downloads, {data.summary.checksumFailures} checksum failures
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="text-center space-y-1">
                <div className="text-sm font-semibold tracking-wide">EPOCH</div>
                <CardTitle>Timekeeping to Payroll Export Reconciliation</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {data.filters.periodStart} through {data.filters.periodEnd}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/80">
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Certified Reg</TableHead>
                      <TableHead className="text-right">Export Reg</TableHead>
                      <TableHead className="text-right">Reg Diff</TableHead>
                      <TableHead className="text-right">Certified OT</TableHead>
                      <TableHead className="text-right">Export OT</TableHead>
                      <TableHead className="text-right">OT Diff</TableHead>
                      <TableHead className="text-right">Sick</TableHead>
                      <TableHead className="text-right">Vacation</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.employeeRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                          No certified or exported payroll rows found for this pay period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.employeeRows.map((row) => (
                        <TableRow key={row.employeeId}>
                          <TableCell>
                            <div className="font-medium whitespace-nowrap">{row.employeeName}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.employeeNumber ?? `TK ${row.employeeId}`} | TS {row.certifiedTimesheetIds.join(', ') || '-'} | Export {row.exportedTimesheetIds.join(', ') || '-'}
                            </div>
                          </TableCell>
                          <TableCell>{row.department ?? '-'}</TableCell>
                          <TableCell className="text-right">{formatHours(row.certifiedRegularHours)}</TableCell>
                          <TableCell className="text-right">{formatHours(row.exportedRegularHours)}</TableCell>
                          <TableCell className={row.regularDifference === 0 ? 'text-right' : 'text-right font-semibold text-destructive'}>
                            {formatHours(row.regularDifference)}
                          </TableCell>
                          <TableCell className="text-right">{formatHours(row.certifiedOvertimeHours)}</TableCell>
                          <TableCell className="text-right">{formatHours(row.exportedOvertimeHours)}</TableCell>
                          <TableCell className={row.overtimeDifference === 0 ? 'text-right' : 'text-right font-semibold text-destructive'}>
                            {formatHours(row.overtimeDifference)}
                          </TableCell>
                          <TableCell className="text-right">{formatHours(row.exportedSickHours)}</TableCell>
                          <TableCell className="text-right">{formatHours(row.exportedVacationHours)}</TableCell>
                          <TableCell><StatusBadge status={row.status} /></TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payroll Export Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead className="text-right">Reg</TableHead>
                      <TableHead className="text-right">OT</TableHead>
                      <TableHead>Checksum</TableHead>
                      <TableHead>Processed</TableHead>
                      <TableHead>Lineage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.batches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No payroll export batches exist for this pay period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.batches.map((batch) => (
                        <TableRow key={batch.id}>
                          <TableCell>
                            <div className="font-medium">Batch {batch.id}</div>
                            <div className="text-xs text-muted-foreground">Revision {batch.revisionNumber}</div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{batch.status}</Badge></TableCell>
                          <TableCell>{batch.rowCount} rows / {batch.employeeCount} employees</TableCell>
                          <TableCell className="text-right">{formatHours(batch.totalRegularHours)}</TableCell>
                          <TableCell className="text-right">{formatHours(batch.totalOvertimeHours)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant={batch.checksumVerified ? 'outline' : 'destructive'}>
                                {batch.checksumVerified ? 'Verified' : 'Mismatch'}
                              </Badge>
                              <span className="font-mono text-xs">{batch.csvChecksum.slice(0, 12)}...</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>{formatDateTime(batch.processedAt)}</div>
                            <div className="text-xs text-muted-foreground">{batch.processedConfirmationNote ?? '-'}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{batch.supersedesBatchId ? `Supersedes ${batch.supersedesBatchId}` : '-'}</div>
                            <div className="text-xs text-muted-foreground">{batch.supersededReason ?? batch.voidedReason ?? '-'}</div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exceptions</CardTitle>
            </CardHeader>
            <CardContent>
              {data.exceptions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No reconciliation exceptions were found for this pay period.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Timesheet</TableHead>
                        <TableHead>Batch</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.exceptions.map((exception, index) => (
                        <TableRow key={`${exception.exceptionType}-${index}`}>
                          <TableCell><SeverityBadge severity={exception.severity} /></TableCell>
                          <TableCell className="font-mono text-xs">{exception.exceptionType}</TableCell>
                          <TableCell>{exception.message}</TableCell>
                          <TableCell>{exception.employeeName ?? exception.employeeId ?? '-'}</TableCell>
                          <TableCell>{exception.timesheetId ?? '-'}</TableCell>
                          <TableCell>{exception.batchId ?? '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.events.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No payroll export events were found for this pay period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.events.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell><Badge variant="outline">{event.eventType}</Badge></TableCell>
                          <TableCell>
                            {event.batchId ? `Batch ${event.batchId}` : '-'}
                            {event.batchRevisionNumber ? ` rev ${event.batchRevisionNumber}` : ''}
                          </TableCell>
                          <TableCell>
                            <div>{event.actorEmail ?? event.actorId}</div>
                            <div className="text-xs text-muted-foreground">{event.actorRole ?? '-'}</div>
                          </TableCell>
                          <TableCell>{event.reason ?? '-'}</TableCell>
                          <TableCell>{event.ipAddress ?? '-'}</TableCell>
                          <TableCell>{formatDateTime(event.createdAt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timesheet Source Detail</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timesheet</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Regular</TableHead>
                      <TableHead className="text-right">OT</TableHead>
                      <TableHead>Attested</TableHead>
                      <TableHead>Reviewed</TableHead>
                      <TableHead>Export</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.timesheetRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No timesheets were found for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.timesheetRows.map((row) => (
                        <TableRow key={row.timesheetId}>
                          <TableCell>
                            <div className="font-medium">#{row.timesheetId}</div>
                            <div className="text-xs text-muted-foreground">{row.periodStart} to {row.periodEnd}</div>
                          </TableCell>
                          <TableCell>{row.employeeName}</TableCell>
                          <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                          <TableCell className="text-right">{formatHours(row.regularHours)}</TableCell>
                          <TableCell className="text-right">{formatHours(row.overtimeHours)}</TableCell>
                          <TableCell>{row.employeeAttested ? formatDateTime(row.attestedAt) : '-'}</TableCell>
                          <TableCell>
                            <div>{formatDateTime(row.reviewedAt)}</div>
                            <div className="text-xs text-muted-foreground">{row.reviewerEmail ?? '-'}</div>
                          </TableCell>
                          <TableCell>
                            <div>{row.includedInSelectedBatch ? 'Selected batch' : '-'}</div>
                            <div className="text-xs text-muted-foreground">{row.batchRevisions.join(' | ') || '-'}</div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
