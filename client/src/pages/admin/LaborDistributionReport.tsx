import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Landmark,
  Loader2,
  RefreshCw,
  UsersRound,
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

interface LaborDistributionReportData {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    employeeId: number | null;
    chargeCodeId: number | null;
    classification: string | null;
  };
  summary: {
    rowCount: number;
    employeeCount: number;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    correctionHours: number;
    totalLaborDollars: number;
    directLaborDollars: number;
    indirectLaborDollars: number;
    certifiedTimesheetHours: number;
    distributedHoursVariance: number;
    payrollExportHours: number;
    payrollHoursVariance: number;
    payrollProcessedBatches: number;
    glPostedDollars: number;
    glUnpostedDollars: number;
    glJournalDebitDollars: number;
    glVariance: number;
    jobCostLinkedDollars: number;
    jobCostUnlinkedDollars: number;
    exceptionsCount: number;
  };
  rows: Array<{
    id: number;
    employeeId: number | null;
    employeeCode: string | null;
    employeeName: string;
    department: string | null;
    laborClass: string | null;
    workDate: string;
    payPeriod: string;
    accountingPeriod: string;
    chargeCodeId: number | null;
    chargeCode: string | null;
    chargeCodeDescription: string | null;
    chargeCodeActive: boolean | null;
    directIndirect: string;
    costHandling: string | null;
    workOrderNumber: string | null;
    projectCode: string | null;
    projectName: string | null;
    contractNumber: string | null;
    glAccountId: number | null;
    glAccountName: string | null;
    glStatus: string;
    regularHours: number;
    overtimeHours: number;
    correctionHours: number;
    totalHours: number;
    rateUsed: number;
    totalLaborDollars: number;
    rateSource: string;
    source: string;
    canonicalId: string | null;
    payrollBatchIds: number[];
    journalEntryId: number | null;
    certifiedAt: string | null;
    payrollApprovedAt: string | null;
    flags: string[];
  }>;
  reconciliation: Array<{
    area: string;
    systemOfRecord: string;
    sourceAmount: number;
    distributedAmount: number;
    variance: number;
    status: 'PASS' | 'WARN' | 'FAIL';
    note: string;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    laborCostRecordId: number | null;
    employeeName: string | null;
  }>;
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
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

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const bad = ['FAIL', 'CRITICAL', 'INACTIVE', 'UNPOSTED', 'VOIDED'].includes(normalized);
  const warn = ['WARN', 'WARNING', 'DRAFT'].includes(normalized);
  const good = ['PASS', 'DIRECT', 'POSTED', 'EXPORTED', 'PROCESSED', 'ACTIVE'].includes(normalized);
  return <Badge variant={bad ? 'destructive' : good ? 'default' : warn ? 'secondary' : 'outline'}>{value.replaceAll('_', ' ')}</Badge>;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'warning') return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

function downloadCsv(report: LaborDistributionReportData) {
  const detailHeader = [
    'Employee ID',
    'Employee Name',
    'Department',
    'Labor Class',
    'Work Date',
    'Pay Period',
    'Accounting Period',
    'Charge Code',
    'Charge Code Description',
    'Direct/Indirect',
    'Cost Handling',
    'Work Order',
    'Project',
    'Contract',
    'GL Account',
    'GL Status',
    'Regular Hours',
    'Overtime Hours',
    'Correction Hours',
    'Total Hours',
    'Rate Used',
    'Labor Dollars',
    'Rate Source',
    'Payroll Batch IDs',
    'Journal Entry ID',
    'Flags',
  ];
  const lines = [
    ['Labor Distribution Report'],
    ['Generated At', report.generatedAt],
    ['Date Range', `${report.filters.startDate ?? 'All'} through ${report.filters.endDate ?? 'All'}`],
    [],
    ['Reconciliation'],
    ['Area', 'System Of Record', 'Source Amount', 'Distributed Amount', 'Variance', 'Status', 'Note'],
    ...report.reconciliation.map((row) => [
      row.area,
      row.systemOfRecord,
      row.sourceAmount,
      row.distributedAmount,
      row.variance,
      row.status,
      row.note,
    ]),
    [],
    detailHeader,
    ...report.rows.map((row) => [
      row.employeeCode ?? row.employeeId,
      row.employeeName,
      row.department,
      row.laborClass,
      row.workDate,
      row.payPeriod,
      row.accountingPeriod,
      row.chargeCode,
      row.chargeCodeDescription,
      row.directIndirect,
      row.costHandling,
      row.workOrderNumber,
      row.projectCode ?? row.projectName,
      row.contractNumber,
      row.glAccountName,
      row.glStatus,
      row.regularHours,
      row.overtimeHours,
      row.correctionHours,
      row.totalHours,
      row.rateUsed,
      row.totalLaborDollars,
      row.rateSource,
      row.payrollBatchIds.join('; '),
      row.journalEntryId,
      row.flags.join('; '),
    ]),
    [],
    ['Exceptions'],
    ['Severity', 'Type', 'Message', 'Record ID', 'Employee'],
    ...report.exceptions.map((row) => [
      row.severity,
      row.exceptionType,
      row.message,
      row.laborCostRecordId,
      row.employeeName,
    ]),
  ];
  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `labor-distribution-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function LaborDistributionReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [classification, setClassification] = useState('all');
  const [employeeId, setEmployeeId] = useState('');
  const [chargeCodeId, setChargeCodeId] = useState('');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (classification !== 'all') params.set('classification', classification);
    if (employeeId) params.set('employeeId', employeeId);
    if (chargeCodeId) params.set('chargeCodeId', chargeCodeId);
    return `/api/edri/labor-distribution${params.toString() ? `?${params.toString()}` : ''}`;
  }, [startDate, endDate, classification, employeeId, chargeCodeId]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<LaborDistributionReportData>({
    queryKey: ['labor-distribution-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  const criticalExceptions = data?.exceptions.filter((row) => row.severity === 'critical').length ?? 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <UsersRound className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Labor Distribution Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Labor hours and dollars by employee, charge code, classification, job cost target, and GL account with payroll and posting tie-outs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/charge-codes">
              <Landmark className="mr-2 h-4 w-4" />
              Charge Codes
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
          <Label>Classification</Label>
          <Select value={classification} onValueChange={setClassification}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="DIRECT">Direct</SelectItem>
              <SelectItem value="INDIRECT">Indirect</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="employee-id">Employee ID</Label>
          <Input id="employee-id" inputMode="numeric" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="All" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="charge-code-id">Charge code ID</Label>
          <Input id="charge-code-id" inputMode="numeric" value={chargeCodeId} onChange={(e) => setChargeCodeId(e.target.value)} placeholder="All" />
        </div>
      </div>

      {error ? (
        <Card className="border-destructive">
          <CardContent className="py-6 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load labor distribution report.'}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building labor distribution report...
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Labor Dollars</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{money(data.summary.totalLaborDollars)}</div>
                <p className="text-xs text-muted-foreground">{money(data.summary.directLaborDollars)} direct / {money(data.summary.indirectLaborDollars)} indirect</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Hours</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{num(data.summary.totalHours)}</div>
                <p className="text-xs text-muted-foreground">{data.summary.employeeCount} employees across {data.summary.rowCount} lines</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Payroll Variance</CardTitle></CardHeader>
              <CardContent>
                <div className={data.summary.payrollHoursVariance === 0 ? 'text-2xl font-bold' : 'text-2xl font-bold text-destructive'}>
                  {num(data.summary.payrollHoursVariance)}
                </div>
                <p className="text-xs text-muted-foreground">{num(data.summary.payrollExportHours)} export hours, {data.summary.payrollProcessedBatches} processed batches</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Exceptions</CardTitle></CardHeader>
              <CardContent>
                <div className={criticalExceptions > 0 ? 'text-2xl font-bold text-destructive' : 'text-2xl font-bold'}>
                  {data.summary.exceptionsCount}
                </div>
                <p className="text-xs text-muted-foreground">{criticalExceptions} critical, {money(data.summary.glUnpostedDollars)} unposted to GL</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                Reconciliation Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>System of record</TableHead>
                    <TableHead className="text-right">Source</TableHead>
                    <TableHead className="text-right">Distributed</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reconciliation.map((row) => (
                    <TableRow key={row.area}>
                      <TableCell>
                        <div className="font-medium">{row.area}</div>
                        <div className="text-xs text-muted-foreground">{row.note}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.systemOfRecord}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.sourceAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.distributedAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.variance)}</TableCell>
                      <TableCell><StatusBadge value={row.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                Labor Allocation Detail
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Work Date</TableHead>
                    <TableHead>Charge Code</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Work Order / Project</TableHead>
                    <TableHead>GL Account</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Dollars</TableHead>
                    <TableHead>Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.slice(0, 300).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.employeeName}</div>
                        <div className="text-xs text-muted-foreground">{row.employeeCode ?? row.employeeId ?? '-'} {row.department ? `| ${row.department}` : ''}</div>
                      </TableCell>
                      <TableCell>
                        <div>{row.workDate}</div>
                        <div className="text-xs text-muted-foreground">{row.accountingPeriod}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.chargeCode ?? '-'}</div>
                        <div className="text-xs text-muted-foreground">{row.chargeCodeDescription ?? '-'}</div>
                      </TableCell>
                      <TableCell><StatusBadge value={row.directIndirect} /></TableCell>
                      <TableCell>
                        <div>{row.workOrderNumber ?? row.projectCode ?? '-'}</div>
                        <div className="text-xs text-muted-foreground">{row.projectName ?? row.contractNumber ?? '-'}</div>
                      </TableCell>
                      <TableCell>
                        <div>{row.glAccountName ?? '-'}</div>
                        <div className="text-xs text-muted-foreground">{row.glStatus}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{num(row.totalHours)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.totalLaborDollars)}</TableCell>
                      <TableCell>
                        <div className="text-xs">JE {row.journalEntryId ?? '-'}</div>
                        <div className="text-xs text-muted-foreground">Batches {row.payrollBatchIds.length ? row.payrollBatchIds.join(', ') : '-'}</div>
                        {row.flags.length ? <div className="mt-1"><StatusBadge value={row.flags[0]} /></div> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.rows.length > 300 ? (
                <p className="mt-3 text-xs text-muted-foreground">Showing first 300 rows. Export CSV for the full report.</p>
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
                <p className="text-sm text-muted-foreground">No exceptions detected for the current filters.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Record</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.exceptions.slice(0, 100).map((row, idx) => (
                      <TableRow key={`${row.exceptionType}-${row.laborCostRecordId}-${idx}`}>
                        <TableCell><SeverityBadge severity={row.severity} /></TableCell>
                        <TableCell>{row.exceptionType.replaceAll('_', ' ')}</TableCell>
                        <TableCell>{row.message}</TableCell>
                        <TableCell>{row.laborCostRecordId ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Generated {formatDateTime(data.generatedAt)}. Payroll export currently reconciles hours; payroll-dollar reconciliation will become exact once processed payroll gross/net dollars are stored on export rows or imported confirmations.
          </p>
        </>
      ) : null}
    </div>
  );
}
