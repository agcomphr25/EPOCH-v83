import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock3,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Signature,
  UserCheck,
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

interface SupervisorApprovalExceptionReportData {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    recordType: string | null;
    exceptionType: string | null;
    staleDays: number;
  };
  policy: {
    certificationRequired: boolean;
    correctionApprovalRequired: boolean;
    lateSubmissionGraceDays: number | null;
    staleApprovalDaysUsed: number;
  };
  summary: {
    exceptionRows: number;
    affectedEmployees: number;
    lackingSupervisorApproval: number;
    staleApprovals: number;
    selfApprovals: number;
    unsignedFinalized: number;
    payrollExportedWithExceptions: number;
    totalHoursAtRisk: number;
    criticalExceptions: number;
    warningExceptions: number;
  };
  rows: Array<{
    recordType: 'HOURLY' | 'SALARIED';
    timesheetId: number;
    employeeId: number;
    employeeCode: string | null;
    employeeName: string;
    department: string | null;
    jobTitle: string | null;
    periodStart: string;
    periodEnd: string;
    status: string;
    totalHours: number;
    submittedAt: string | null;
    certifiedAt: string | null;
    certifiedBy: number | null;
    supervisorEmployeeId: number | null;
    supervisorName: string | null;
    supervisorApprovedAt: string | null;
    supervisorApprovedBy: number | null;
    reviewerEmail: string | null;
    employeeSigned: boolean;
    payrollApprovedAt: string | null;
    payrollApprovedBy: number | null;
    exportedBatchIds: number[];
    daysWaiting: number;
    flags: string[];
    severity: Severity;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    recordType: 'HOURLY' | 'SALARIED';
    timesheetId: number;
    employeeName: string;
  }>;
}

function num(value: number, digits = 2) {
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
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
  const bad = ['MISSING_SUPERVISOR_APPROVAL', 'SELF_APPROVAL', 'UNSIGNED_FINALIZED', 'CRITICAL'].includes(normalized);
  const warn = ['STALE_APPROVAL', 'WARNING', 'OPEN', 'SUBMITTED'].includes(normalized);
  const good = ['HOURLY', 'SALARIED', 'APPROVED', 'CERTIFIED', 'PAYROLL_APPROVED'].includes(normalized);
  return <Badge variant={bad ? 'destructive' : good ? 'default' : warn ? 'secondary' : 'outline'}>{value.replaceAll('_', ' ')}</Badge>;
}

function downloadCsv(report: SupervisorApprovalExceptionReportData) {
  const header = [
    'Record Type',
    'Timesheet ID',
    'Employee ID',
    'Employee Name',
    'Department',
    'Job Title',
    'Period Start',
    'Period End',
    'Status',
    'Hours',
    'Submitted At',
    'Signed',
    'Certified At',
    'Supervisor',
    'Supervisor Approved At',
    'Supervisor Approved By',
    'Payroll Approved At',
    'Exported Batch IDs',
    'Days Waiting',
    'Severity',
    'Flags',
  ];
  const lines = [
    ['Supervisor Approval Exception Report'],
    ['Generated At', report.generatedAt],
    ['Date Range', `${report.filters.startDate ?? 'All'} through ${report.filters.endDate ?? 'All'}`],
    ['Stale Approval Days', report.filters.staleDays],
    [],
    header,
    ...report.rows.map((row) => [
      row.recordType,
      row.timesheetId,
      row.employeeCode ?? row.employeeId,
      row.employeeName,
      row.department,
      row.jobTitle,
      row.periodStart,
      row.periodEnd,
      row.status,
      row.totalHours,
      row.submittedAt,
      row.employeeSigned ? 'YES' : 'NO',
      row.certifiedAt,
      row.supervisorName ?? row.supervisorEmployeeId,
      row.supervisorApprovedAt,
      row.supervisorApprovedBy,
      row.payrollApprovedAt,
      row.exportedBatchIds.join('; '),
      row.daysWaiting,
      row.severity,
      row.flags.join('; '),
    ]),
    [],
    ['Exceptions'],
    ['Severity', 'Type', 'Message', 'Record Type', 'Timesheet ID', 'Employee'],
    ...report.exceptions.map((row) => [
      row.severity,
      row.exceptionType,
      row.message,
      row.recordType,
      row.timesheetId,
      row.employeeName,
    ]),
  ];
  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `supervisor-approval-exceptions-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SupervisorApprovalExceptionReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [recordType, setRecordType] = useState('all');
  const [exceptionType, setExceptionType] = useState('all');
  const [staleDays, setStaleDays] = useState('');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (recordType !== 'all') params.set('recordType', recordType);
    if (exceptionType !== 'all') params.set('exceptionType', exceptionType);
    if (staleDays) params.set('staleDays', staleDays);
    return `/api/edri/supervisor-approval-exceptions${params.toString() ? `?${params.toString()}` : ''}`;
  }, [startDate, endDate, recordType, exceptionType, staleDays]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<SupervisorApprovalExceptionReportData>({
    queryKey: ['supervisor-approval-exception-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Supervisor Approval Exception Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Timekeeping approval-control exceptions for missing reviews, stale approvals, self-approval, and unsigned finalized records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/edri/payroll-export-reconciliation">
              <ShieldAlert className="mr-2 h-4 w-4" />
              Payroll Recon
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor="start-date">Start date</Label>
          <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="end-date">End date</Label>
          <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Record type</Label>
          <Select value={recordType} onValueChange={setRecordType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="HOURLY">Hourly</SelectItem>
              <SelectItem value="SALARIED">Salaried</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Exception</Label>
          <Select value={exceptionType} onValueChange={setExceptionType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="MISSING_SUPERVISOR_APPROVAL">Missing approval</SelectItem>
              <SelectItem value="STALE_APPROVAL">Stale approval</SelectItem>
              <SelectItem value="SELF_APPROVAL">Self approval</SelectItem>
              <SelectItem value="UNSIGNED_FINALIZED">Unsigned finalized</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="stale-days">Stale days</Label>
          <Input id="stale-days" inputMode="numeric" value={staleDays} onChange={(e) => setStaleDays(e.target.value)} placeholder={data ? String(data.policy.staleApprovalDaysUsed) : 'Policy'} />
        </div>
      </div>

      {error ? (
        <Card className="border-destructive">
          <CardContent className="py-6 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load supervisor approval exception report.'}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building supervisor approval exception report...
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Exception Rows</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.exceptionRows}</div>
                <p className="text-xs text-muted-foreground">{data.summary.affectedEmployees} affected employees, {num(data.summary.totalHoursAtRisk)} hours at risk</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Missing Approval</CardTitle></CardHeader>
              <CardContent>
                <div className={data.summary.lackingSupervisorApproval > 0 ? 'text-2xl font-bold text-destructive' : 'text-2xl font-bold'}>
                  {data.summary.lackingSupervisorApproval}
                </div>
                <p className="text-xs text-muted-foreground">{data.summary.payrollExportedWithExceptions} payroll/export-linked exceptions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Stale Approvals</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.staleApprovals}</div>
                <p className="text-xs text-muted-foreground">{data.policy.staleApprovalDaysUsed} day threshold</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Critical Flags</CardTitle></CardHeader>
              <CardContent>
                <div className={data.summary.criticalExceptions > 0 ? 'text-2xl font-bold text-destructive' : 'text-2xl font-bold'}>
                  {data.summary.criticalExceptions}
                </div>
                <p className="text-xs text-muted-foreground">{data.summary.selfApprovals} self approvals, {data.summary.unsignedFinalized} unsigned finalized</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  Approval Exceptions
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Type / Status</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Signature</TableHead>
                      <TableHead>Payroll Evidence</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.slice(0, 300).map((row) => (
                      <TableRow key={`${row.recordType}-${row.timesheetId}`}>
                        <TableCell>
                          <div className="font-medium">{row.employeeName}</div>
                          <div className="text-xs text-muted-foreground">{row.employeeCode ?? row.employeeId} {row.department ? `| ${row.department}` : ''}</div>
                        </TableCell>
                        <TableCell>
                          <div>{row.periodStart} to {row.periodEnd}</div>
                          <div className="text-xs text-muted-foreground">{row.daysWaiting} days waiting</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge value={row.recordType} />
                            <StatusBadge value={row.status} />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">Timesheet {row.timesheetId}</div>
                        </TableCell>
                        <TableCell>
                          <div>{row.supervisorName ?? '-'}</div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(row.supervisorApprovedAt)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.employeeSigned ? 'default' : 'destructive'}>{row.employeeSigned ? 'Signed' : 'Unsigned'}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.certifiedAt)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">Payroll {formatDateTime(row.payrollApprovedAt)}</div>
                          <div className="text-xs text-muted-foreground">Batches {row.exportedBatchIds.length ? row.exportedBatchIds.join(', ') : '-'}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{num(row.totalHours)}</TableCell>
                        <TableCell>
                          <div className="flex max-w-[260px] flex-wrap gap-1">
                            {row.flags.map((flag) => <StatusBadge key={flag} value={flag} />)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {data.rows.length > 300 ? (
                  <p className="mt-3 text-xs text-muted-foreground">Showing first 300 rows. Export CSV for the full exception set.</p>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock3 className="h-5 w-5 text-muted-foreground" />
                    Policy Context
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Certification required</span>
                    <Badge variant={data.policy.certificationRequired ? 'default' : 'secondary'}>{data.policy.certificationRequired ? 'Yes' : 'No'}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Correction approval</span>
                    <Badge variant={data.policy.correctionApprovalRequired ? 'default' : 'secondary'}>{data.policy.correctionApprovalRequired ? 'Yes' : 'No'}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Late grace days</span>
                    <span className="font-medium">{data.policy.lateSubmissionGraceDays ?? '-'}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Signature className="h-5 w-5 text-muted-foreground" />
                    Exception Mix
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Missing approval</span>
                    <span className="font-medium">{data.summary.lackingSupervisorApproval}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Stale approval</span>
                    <span className="font-medium">{data.summary.staleApprovals}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Self approval</span>
                    <span className="font-medium">{data.summary.selfApprovals}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Unsigned finalized</span>
                    <span className="font-medium">{data.summary.unsignedFinalized}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Generated {formatDateTime(data.generatedAt)}. Self-approval detection uses employee ID matches and reviewer email matches where available; delegation-rule support can make this stricter once delegation tables exist.
          </p>
        </>
      ) : null}
    </div>
  );
}
