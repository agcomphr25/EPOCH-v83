import { Fragment, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSearch,
  Loader2,
  RefreshCw,
  Tag,
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

interface ChargeCodeUsageReportData {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
  };
  summary: {
    totalChargeCodes: number;
    activeChargeCodes: number;
    inactiveChargeCodes: number;
    usedChargeCodes: number;
    totalLaborEntries: number;
    totalLaborHours: number;
    directLaborHours: number;
    indirectLaborHours: number;
    invalidLaborEntries: number;
    inactiveLaborEntries: number;
    approvalExceptionEntries: number;
  };
  masterRows: Array<{
    id: number | null;
    code: string;
    description: string | null;
    active: boolean;
    type: string;
    costHandling: string;
    requiresApproval: boolean;
    billable: boolean;
    department: string | null;
    contractReference: string | null;
    usageCount: number;
    totalHours: number;
    lastUsedAt: string | null;
    exceptionCount: number;
  }>;
  distributionRows: Array<{
    employeeName: string | null;
    employeeId: string;
    indexCode: string;
    accountCode: string | null;
    position: string | null;
    suffix: string;
    positionTitle: string | null;
    hiringOrg: string | null;
    distributionPercent: number;
    jobStartDate: string | null;
    jobEndDate: string | null;
    laborDistStartDate: string | null;
    laborDistEndDate: string | null;
    totalHours: number;
    chargeCodeStatus: 'ACTIVE' | 'INACTIVE' | 'INVALID';
  }>;
  exceptions: Array<{
    entryId: number;
    exceptionType: 'INVALID_CODE' | 'INACTIVE_CODE' | 'APPROVAL_REQUIRED';
    workDate: string;
    employeeId: string;
    employeeName: string | null;
    chargeCode: string | null;
    hours: number;
    clockIn: string | null;
    clockOut: string | null;
    department: string | null;
    operation: string | null;
    approvalStatus: string | null;
    laborApprovalId: number | null;
  }>;
}

type DistributionRow = ChargeCodeUsageReportData['distributionRows'][number];

const handlingLabel: Record<string, string> = {
  DIRECT_CONTRACT: 'Direct Contract',
  IRAD: 'IR&D',
  BID_PROPOSAL: 'B&P',
  FRINGE: 'Fringe',
  OVERHEAD: 'Overhead',
  G_AND_A: 'G&A',
  UNALLOWABLE: 'Unallowable',
  UNMAPPED: 'Unmapped',
  OTHER: 'Other',
};

function formatHours(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} hrs`;
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(report: ChargeCodeUsageReportData) {
  const distributionHeader = [
    'Employee Name',
    'Employee ID',
    'Index Code',
    'Account Code',
    'Position',
    'Suffix',
    'Position Title',
    'Hiring Org',
    'Dist%',
    'Job Start Date',
    'Job End Date',
    'Labor Dist Start Date',
    'Labor Dist End Date',
    'Hours',
    'Charge Code Status',
  ];
  const distributionRows = report.distributionRows.map((row) => [
    row.employeeName,
    row.employeeId,
    row.indexCode,
    row.accountCode,
    row.position,
    row.suffix,
    row.positionTitle,
    row.hiringOrg,
    row.distributionPercent,
    row.jobStartDate,
    row.jobEndDate,
    row.laborDistStartDate,
    row.laborDistEndDate,
    row.totalHours,
    row.chargeCodeStatus,
  ]);

  const masterHeader = [
    'Code',
    'Description',
    'Active',
    'Direct/Indirect Type',
    'DCAA Handling',
    'Requires Approval',
    'Billable',
    'Department',
    'Contract Reference',
    'Usage Count',
    'Total Hours',
    'Last Used',
    'Exception Count',
  ];
  const masterRows = report.masterRows.map((row) => [
    row.code,
    row.description,
    row.active ? 'Active' : 'Inactive',
    row.type,
    handlingLabel[row.costHandling] ?? row.costHandling,
    row.requiresApproval ? 'Yes' : 'No',
    row.billable ? 'Yes' : 'No',
    row.department,
    row.contractReference,
    row.usageCount,
    row.totalHours,
    row.lastUsedAt,
    row.exceptionCount,
  ]);

  const exceptionHeader = [
    'Exception Type',
    'Entry ID',
    'Work Date',
    'Employee ID',
    'Employee Name',
    'Charge Code',
    'Hours',
    'Department',
    'Operation',
    'Approval Status',
  ];
  const exceptionRows = report.exceptions.map((row) => [
    row.exceptionType,
    row.entryId,
    row.workDate,
    row.employeeId,
    row.employeeName,
    row.chargeCode,
    row.hours,
    row.department,
    row.operation,
    row.approvalStatus,
  ]);

  const lines = [
    ['Charge Code Master And Usage Report'],
    ['Generated At', report.generatedAt],
    ['Start Date', report.filters.startDate ?? ''],
    ['End Date', report.filters.endDate ?? ''],
    [],
    ['Active Labor Distribution by Charge Code'],
    distributionHeader,
    ...distributionRows,
    [],
    ['Charge Code Master'],
    masterHeader,
    ...masterRows,
    [],
    ['Exceptions'],
    exceptionHeader,
    ...exceptionRows,
  ];

  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `charge-code-master-usage-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadDistributionCsv(report: ChargeCodeUsageReportData) {
  const lines = [
    ['EPOCH Active Labor Distribution by Charge Code'],
    ['Report Period', `${report.filters.startDate ?? 'All'} through ${report.filters.endDate ?? 'All'}`],
    [],
    [
      'Employee Name',
      'Employee ID',
      'Index Code',
      'Account Code',
      'Position',
      'Suffix',
      'Position Title',
      'Hiring Org',
      'Dist%',
      'Job Start Date',
      'Job End Date',
      'Labor Dist Start Date',
      'Labor Dist End Date',
      'Hours',
      'Charge Code Status',
    ],
    ...report.distributionRows.map((row) => [
      row.employeeName,
      row.employeeId,
      row.indexCode,
      row.accountCode,
      row.position,
      row.suffix,
      row.positionTitle,
      row.hiringOrg,
      row.distributionPercent,
      row.jobStartDate,
      row.jobEndDate,
      row.laborDistStartDate,
      row.laborDistEndDate,
      row.totalHours,
      row.chargeCodeStatus,
    ]),
  ];

  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `active-labor-distribution-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExceptionBadge({ type }: { type: ChargeCodeUsageReportData['exceptions'][number]['exceptionType'] }) {
  const label = {
    INVALID_CODE: 'Invalid Code',
    INACTIVE_CODE: 'Inactive Code',
    APPROVAL_REQUIRED: 'Approval Required',
  }[type];
  return <Badge variant="destructive">{label}</Badge>;
}

export default function ChargeCodeUsageReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return `/api/edri/charge-code-usage${params.toString() ? `?${params.toString()}` : ''}`;
  }, [startDate, endDate]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<ChargeCodeUsageReportData>({
    queryKey: ['charge-code-usage-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  const totalExceptions = (data?.summary.invalidLaborEntries ?? 0)
    + (data?.summary.inactiveLaborEntries ?? 0)
    + (data?.summary.approvalExceptionEntries ?? 0);

  const distributionGroups = useMemo(() => {
    const groups: Array<{
      employeeId: string;
      employeeName: string;
      totalHours: number;
      rows: DistributionRow[];
    }> = [];
    const byEmployee = new Map<string, (typeof groups)[number]>();

    for (const row of data?.distributionRows ?? []) {
      const key = row.employeeId;
      let group = byEmployee.get(key);
      if (!group) {
        group = {
          employeeId: row.employeeId,
          employeeName: row.employeeName ?? row.employeeId,
          totalHours: 0,
          rows: [],
        };
        byEmployee.set(key, group);
        groups.push(group);
      }

      group.rows.push(row);
      group.totalHours += row.totalHours;
    }

    return groups;
  }, [data?.distributionRows]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSearch className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Charge Code Master And Usage Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Active and inactive charge code controls, DCAA handling, approval flags, and labor usage exceptions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/charge-codes">
              <Tag className="mr-2 h-4 w-4" />
              Manage Codes
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
          <Button variant="outline" size="sm" onClick={() => data && downloadDistributionCsv(data)} disabled={!data}>
            <Download className="mr-2 h-4 w-4" />
            Distribution CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="start-date">Start date</Label>
          <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="end-date">End date</Label>
          <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

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
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Master Codes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.totalChargeCodes}</div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.activeChargeCodes} active, {data.summary.inactiveChargeCodes} inactive
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Labor Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatHours(data.summary.totalLaborHours)}</div>
                <p className="text-xs text-muted-foreground">{data.summary.totalLaborEntries} labor entries</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Direct / Indirect</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-semibold">{formatHours(data.summary.directLaborHours)} direct</div>
                <p className="text-xs text-muted-foreground">{formatHours(data.summary.indirectLaborHours)} indirect</p>
              </CardContent>
            </Card>
            <Card className={totalExceptions > 0 ? 'border-destructive' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Exceptions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-2xl font-bold">
                  {totalExceptions > 0 ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  {totalExceptions}
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.invalidLaborEntries} invalid, {data.summary.inactiveLaborEntries} inactive, {data.summary.approvalExceptionEntries} approval
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="text-center space-y-1">
                <div className="text-sm font-semibold tracking-wide">EPOCH</div>
                <CardTitle>Active Labor Distribution by Charge Code</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {data.filters.startDate ?? 'All dates'} through {data.filters.endDate ?? 'All dates'}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/80">
                      <TableHead>Employee Name</TableHead>
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Index Code</TableHead>
                      <TableHead>Account Code</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Suffix</TableHead>
                      <TableHead>Position Title</TableHead>
                      <TableHead>Hiring Org</TableHead>
                      <TableHead className="text-right">Employee Dist%</TableHead>
                      <TableHead>Job Start Date</TableHead>
                      <TableHead>Job End Date</TableHead>
                      <TableHead>Labor Dist Start Date</TableHead>
                      <TableHead>Labor Dist End Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.distributionRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                          No labor distribution rows found for the selected period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      distributionGroups.map((group, groupIndex) => (
                        <Fragment key={group.employeeId}>
                          <TableRow className={groupIndex % 2 === 0 ? 'bg-slate-100/90 hover:bg-slate-100/90' : 'bg-blue-50/80 hover:bg-blue-50/80'}>
                            <TableCell colSpan={13} className="py-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div className="font-semibold">{group.employeeName}</div>
                                  <div className="text-xs text-muted-foreground">{group.employeeId}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <Badge variant="outline">{group.rows.length} charge code{group.rows.length === 1 ? '' : 's'}</Badge>
                                  <Badge variant="secondary">{formatHours(group.totalHours)}</Badge>
                                  <span>Rows total 100% of this employee's selected-period hours</span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                          {group.rows.map((row, rowIndex) => (
                            <TableRow
                              key={`${row.employeeId}-${row.indexCode}-${rowIndex}`}
                              className={groupIndex % 2 === 0 ? 'bg-background' : 'bg-blue-50/25'}
                            >
                              <TableCell className="whitespace-nowrap pl-8">{row.employeeName ?? row.employeeId}</TableCell>
                              <TableCell className="whitespace-nowrap">{row.employeeId}</TableCell>
                              <TableCell className="font-mono">{row.indexCode}</TableCell>
                              <TableCell>{handlingLabel[row.accountCode ?? ''] ?? row.accountCode ?? '-'}</TableCell>
                              <TableCell>{row.position ?? '-'}</TableCell>
                              <TableCell>{row.suffix}</TableCell>
                              <TableCell className="whitespace-nowrap">{row.positionTitle ?? '-'}</TableCell>
                              <TableCell>{row.hiringOrg ?? '-'}</TableCell>
                              <TableCell className="text-right font-medium">{row.distributionPercent.toFixed(2)}</TableCell>
                              <TableCell>{row.jobStartDate ?? '-'}</TableCell>
                              <TableCell>{row.jobEndDate ?? '-'}</TableCell>
                              <TableCell>{row.laborDistStartDate ?? '-'}</TableCell>
                              <TableCell>{row.laborDistEndDate ?? '-'}</TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Master Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>DCAA Handling</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className="text-right">Exceptions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.masterRows.map((row) => (
                      <TableRow key={`${row.id ?? 'invalid'}-${row.code}`}>
                        <TableCell>
                          <div className="font-mono font-medium">{row.code}</div>
                          <div className="text-xs text-muted-foreground max-w-[280px] truncate">{row.description ?? '-'}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.active ? 'default' : 'secondary'}>{row.active ? 'Active' : 'Inactive'}</Badge>
                        </TableCell>
                        <TableCell><Badge variant="outline">{row.type}</Badge></TableCell>
                        <TableCell>{handlingLabel[row.costHandling] ?? row.costHandling}</TableCell>
                        <TableCell>{row.requiresApproval ? 'Required' : '-'}</TableCell>
                        <TableCell className="text-right">{row.usageCount}</TableCell>
                        <TableCell className="text-right">{row.totalHours.toLocaleString()}</TableCell>
                        <TableCell>{formatDateTime(row.lastUsedAt)}</TableCell>
                        <TableCell className="text-right">
                          {row.exceptionCount > 0 ? <Badge variant="destructive">{row.exceptionCount}</Badge> : <span className="text-muted-foreground">0</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Labor Exceptions</CardTitle>
            </CardHeader>
            <CardContent>
              {data.exceptions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No invalid, inactive, or approval-required charge code labor exceptions were found.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Exception</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Charge Code</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Approval</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.exceptions.map((row) => (
                        <TableRow key={row.entryId}>
                          <TableCell><ExceptionBadge type={row.exceptionType} /></TableCell>
                          <TableCell>{row.workDate}</TableCell>
                          <TableCell>
                            <div>{row.employeeName ?? row.employeeId}</div>
                            <div className="text-xs text-muted-foreground">{row.employeeId}</div>
                          </TableCell>
                          <TableCell className="font-mono">{row.chargeCode ?? '-'}</TableCell>
                          <TableCell className="text-right">{row.hours.toLocaleString()}</TableCell>
                          <TableCell>{row.department ?? '-'}</TableCell>
                          <TableCell>{row.approvalStatus ?? '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
