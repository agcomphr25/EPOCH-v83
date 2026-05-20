import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Download,
  Loader2,
  Percent,
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
type RateType = 'PROVISIONAL' | 'BILLING' | 'FINAL';

interface IndirectCostBurdenRateReportData {
  generatedAt: string;
  filters: {
    asOfDate: string;
    rateType: string;
    year: number | null;
    month: number | null;
  };
  summary: {
    totalPools: number;
    activePools: number;
    inactivePools: number;
    activeBases: number;
    poolsMissingCurrentRate: number;
    completedRuns: number;
    selectedRunId: number | null;
    appliedRecordCount: number;
    totalBaseAmount: number;
    totalBurdenAmount: number;
    trueUpAmount: number;
  };
  pools: Array<{
    poolId: number;
    poolCode: string;
    poolName: string;
    poolType: string;
    poolDescription: string | null;
    isActive: boolean;
    applyOrder: number;
    baseId: number | null;
    baseCode: string | null;
    baseName: string | null;
    baseDescription: string | null;
    resolverKind: string | null;
    accountMappingStatus: 'PENDING_ACCOUNT_MAPPING';
    currentRateId: number | null;
    currentRateType: string | null;
    currentRate: number | null;
    currentEffectiveFrom: string | null;
    currentNotes: string | null;
    currentCreatedBy: string | null;
    currentCreatedAt: string | null;
  }>;
  rates: Array<{
    rateId: number;
    poolId: number;
    poolCode: string;
    poolName: string;
    rateType: string;
    rate: number;
    effectiveFrom: string;
    notes: string | null;
    createdBy: string;
    createdAt: string | null;
    isCurrentForSelectedType: boolean;
  }>;
  runs: Array<{
    runId: number;
    periodYear: number;
    periodMonth: number;
    runType: string;
    rateType: string;
    status: string;
    supersedesRunId: number | null;
    appliedBy: string;
    recordCount: number;
    totalBurden: number;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  poolApplicationSummary: Array<{
    poolId: number;
    poolCode: string;
    poolName: string;
    rateType: string;
    rateUsed: number;
    rateEffectiveFrom: string;
    sourceRecordCount: number;
    totalBaseAmount: number;
    totalBurdenAmount: number;
    trueUpAmount: number;
  }>;
  appliedCalculations: Array<{
    appliedId: number;
    runId: number;
    sourceRecordId: number;
    employeeName: string | null;
    employeeCode: string | null;
    departmentCode: string | null;
    jobCode: string | null;
    costType: string;
    hoursWorked: number;
    dollarCost: number;
    poolCode: string;
    poolName: string;
    rateType: string;
    rateEffectiveFrom: string;
    baseAmount: number;
    rateUsed: number;
    burdenAmount: number;
    isTrueUp: boolean;
    priorAmount: number | null;
    appliedAt: string | null;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    poolId: number | null;
    runId: number | null;
  }>;
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatRate(value: number | null) {
  if (value == null) return '-';
  return `${(value * 100).toFixed(4)}%`;
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

function downloadCsv(report: IndirectCostBurdenRateReportData) {
  const poolHeader = [
    'Pool Code',
    'Pool Name',
    'Pool Type',
    'Active',
    'Apply Order',
    'Allocation Base',
    'Resolver Kind',
    'Account Mapping',
    'Current Rate Type',
    'Current Rate',
    'Effective From',
    'Notes',
  ];
  const summaryHeader = [
    'Pool Code',
    'Pool Name',
    'Rate Type',
    'Rate Used',
    'Rate Effective From',
    'Source Records',
    'Total Base',
    'Total Burden',
    'True-Up Amount',
  ];
  const appliedHeader = [
    'Applied ID',
    'Run ID',
    'Source Record',
    'Employee',
    'Employee Code',
    'Department',
    'Job Code',
    'Cost Type',
    'Hours',
    'Dollar Cost',
    'Pool',
    'Rate Type',
    'Rate Effective From',
    'Base Amount',
    'Rate Used',
    'Burden Amount',
    'True-Up',
    'Prior Amount',
  ];
  const exceptionHeader = ['Severity', 'Type', 'Message', 'Pool ID', 'Run ID'];

  const lines = [
    ['Indirect Cost/Burden Rate Report'],
    ['Generated At', report.generatedAt],
    ['As Of Date', report.filters.asOfDate],
    ['Rate Type', report.filters.rateType],
    ['Applied Period', report.filters.year && report.filters.month ? `${report.filters.year}-${String(report.filters.month).padStart(2, '0')}` : 'Not selected'],
    [],
    ['Current Pools And Rates'],
    poolHeader,
    ...report.pools.map((row) => [
      row.poolCode,
      row.poolName,
      row.poolType,
      row.isActive ? 'Active' : 'Inactive',
      row.applyOrder,
      row.baseCode,
      row.resolverKind,
      row.accountMappingStatus,
      row.currentRateType,
      row.currentRate,
      row.currentEffectiveFrom,
      row.currentNotes,
    ]),
    [],
    ['Applied Burden By Pool'],
    summaryHeader,
    ...report.poolApplicationSummary.map((row) => [
      row.poolCode,
      row.poolName,
      row.rateType,
      row.rateUsed,
      row.rateEffectiveFrom,
      row.sourceRecordCount,
      row.totalBaseAmount,
      row.totalBurdenAmount,
      row.trueUpAmount,
    ]),
    [],
    ['Applied Calculations'],
    appliedHeader,
    ...report.appliedCalculations.map((row) => [
      row.appliedId,
      row.runId,
      row.sourceRecordId,
      row.employeeName,
      row.employeeCode,
      row.departmentCode,
      row.jobCode,
      row.costType,
      row.hoursWorked,
      row.dollarCost,
      row.poolCode,
      row.rateType,
      row.rateEffectiveFrom,
      row.baseAmount,
      row.rateUsed,
      row.burdenAmount,
      row.isTrueUp ? 'Yes' : 'No',
      row.priorAmount,
    ]),
    [],
    ['Exceptions'],
    exceptionHeader,
    ...report.exceptions.map((row) => [
      row.severity,
      row.exceptionType,
      row.message,
      row.poolId,
      row.runId,
    ]),
  ];

  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `indirect-cost-burden-rate-${report.filters.asOfDate}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function IndirectCostBurdenRateReport() {
  const now = new Date();
  const [asOfDate, setAsOfDate] = useState(now.toISOString().slice(0, 10));
  const [rateType, setRateType] = useState<RateType>('PROVISIONAL');
  const [year, setYear] = useState(String(now.getUTCFullYear()));
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1));

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('asOfDate', asOfDate);
    params.set('rateType', rateType);
    if (year && month) {
      params.set('year', year);
      params.set('month', month);
    }
    return `/api/edri/indirect-cost-burden-rates?${params.toString()}`;
  }, [asOfDate, rateType, year, month]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<IndirectCostBurdenRateReportData>({
    queryKey: ['indirect-cost-burden-rate-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  const criticalExceptions = data?.exceptions.filter((row) => row.severity === 'critical').length ?? 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Percent className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Indirect Cost/Burden Rate Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Current indirect pools, allocation bases, effective-dated rates, notes, and applied burden calculations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/burden-rates">
              <Calculator className="mr-2 h-4 w-4" />
              Manage Rates
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
          <Label htmlFor="as-of-date">As-of date</Label>
          <Input id="as-of-date" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Rate type</Label>
          <Select value={rateType} onValueChange={(value) => setRateType(value as RateType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PROVISIONAL">Provisional</SelectItem>
              <SelectItem value="BILLING">Billing</SelectItem>
              <SelectItem value="FINAL">Final</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="period-year">Applied year</Label>
          <Input id="period-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="period-month">Applied month</Label>
          <Input id="period-month" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} />
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
            <Card className={criticalExceptions > 0 ? 'border-destructive' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Rate Stack</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-2xl font-bold">
                  {criticalExceptions > 0 ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  {data.summary.poolsMissingCurrentRate}
                </div>
                <p className="text-xs text-muted-foreground">active pools missing {data.filters.rateType} rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pools</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.totalPools}</div>
                <p className="text-xs text-muted-foreground">{data.summary.activePools} active, {data.summary.inactivePools} inactive</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Applied Burden</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatMoney(data.summary.totalBurdenAmount)}</div>
                <p className="text-xs text-muted-foreground">run {data.summary.selectedRunId ?? 'not selected'}, {data.summary.appliedRecordCount} records</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Base Amount</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatMoney(data.summary.totalBaseAmount)}</div>
                <p className="text-xs text-muted-foreground">true-up {formatMoney(data.summary.trueUpAmount)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="text-center space-y-1">
                <div className="text-sm font-semibold tracking-wide">EPOCH</div>
                <CardTitle>Current Indirect Cost Pools And Rates</CardTitle>
                <div className="text-sm text-muted-foreground">
                  As of {data.filters.asOfDate} | {data.filters.rateType}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/80">
                      <TableHead>Order</TableHead>
                      <TableHead>Pool</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Current Rate</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Accounts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pools.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No indirect cost pools are configured.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.pools.map((pool) => (
                        <TableRow key={pool.poolId}>
                          <TableCell>{pool.applyOrder}</TableCell>
                          <TableCell>
                            <div className="font-mono font-medium">{pool.poolCode}</div>
                            <div className="text-xs text-muted-foreground max-w-[260px] truncate">{pool.poolName}</div>
                          </TableCell>
                          <TableCell>
                            <div><Badge variant={pool.isActive ? 'default' : 'secondary'}>{pool.isActive ? 'Active' : 'Inactive'}</Badge></div>
                            <div className="text-xs text-muted-foreground mt-1">{pool.poolType}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono">{pool.baseCode ?? '-'}</div>
                            <div className="text-xs text-muted-foreground">{pool.resolverKind ?? '-'}</div>
                          </TableCell>
                          <TableCell className="font-mono">{formatRate(pool.currentRate)}</TableCell>
                          <TableCell>{pool.currentEffectiveFrom ?? '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[320px] truncate">{pool.currentNotes ?? '-'}</TableCell>
                          <TableCell><Badge variant="outline">Pending</Badge></TableCell>
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
              <CardTitle>Applied Burden By Pool</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pool</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead className="text-right">Records</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Burden</TableHead>
                      <TableHead className="text-right">True-Up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.poolApplicationSummary.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No completed applied-burden run was found for the selected period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.poolApplicationSummary.map((row) => (
                        <TableRow key={`${row.poolId}-${row.rateType}-${row.rateUsed}`}>
                          <TableCell>
                            <div className="font-mono font-medium">{row.poolCode}</div>
                            <div className="text-xs text-muted-foreground">{row.poolName}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono">{formatRate(row.rateUsed)}</div>
                            <div className="text-xs text-muted-foreground">{row.rateType}</div>
                          </TableCell>
                          <TableCell>{row.rateEffectiveFrom}</TableCell>
                          <TableCell className="text-right">{row.sourceRecordCount}</TableCell>
                          <TableCell className="text-right">{formatMoney(row.totalBaseAmount)}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(row.totalBurdenAmount)}</TableCell>
                          <TableCell className="text-right">{formatMoney(row.trueUpAmount)}</TableCell>
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
              <CardTitle>Rate History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pool</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead>Effective From</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No indirect rates have been entered.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.rates.slice(0, 80).map((rate) => (
                        <TableRow key={rate.rateId}>
                          <TableCell>
                            <div className="font-mono">{rate.poolCode}</div>
                            <div className="text-xs text-muted-foreground">{rate.poolName}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={rate.isCurrentForSelectedType ? 'default' : 'outline'}>{rate.rateType}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatRate(rate.rate)}</TableCell>
                          <TableCell>{rate.effectiveFrom}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[320px] truncate">{rate.notes ?? '-'}</TableCell>
                          <TableCell>
                            <div>{rate.createdBy}</div>
                            <div className="text-xs text-muted-foreground">{formatDateTime(rate.createdAt)}</div>
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
              <CardTitle>Applied Calculation Detail</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Record</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Cost Type</TableHead>
                      <TableHead>Pool</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Burden</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.appliedCalculations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No applied calculation rows are available for the selected run.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.appliedCalculations.map((row) => (
                        <TableRow key={row.appliedId}>
                          <TableCell>
                            <div className="font-mono">#{row.sourceRecordId}</div>
                            <div className="text-xs text-muted-foreground">Applied {row.appliedId}</div>
                          </TableCell>
                          <TableCell>
                            <div>{row.employeeName ?? '-'}</div>
                            <div className="text-xs text-muted-foreground">{row.employeeCode ?? row.departmentCode ?? '-'}</div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{row.costType}</Badge></TableCell>
                          <TableCell>
                            <div className="font-mono">{row.poolCode}</div>
                            <div className="text-xs text-muted-foreground">{row.rateEffectiveFrom}</div>
                          </TableCell>
                          <TableCell className="text-right">{row.hoursWorked.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{formatMoney(row.dollarCost)}</TableCell>
                          <TableCell className="text-right">{formatMoney(row.baseAmount)}</TableCell>
                          <TableCell className="text-right font-mono">{formatRate(row.rateUsed)}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(row.burdenAmount)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {data.appliedCalculations.length >= 1000 ? (
                <div className="text-xs text-muted-foreground mt-2">Showing the first 1,000 applied calculation rows.</div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exceptions</CardTitle>
            </CardHeader>
            <CardContent>
              {data.exceptions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No burden-rate configuration exceptions were found.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Pool</TableHead>
                        <TableHead>Run</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.exceptions.map((exception, index) => (
                        <TableRow key={`${exception.exceptionType}-${index}`}>
                          <TableCell><SeverityBadge severity={exception.severity} /></TableCell>
                          <TableCell className="font-mono text-xs">{exception.exceptionType}</TableCell>
                          <TableCell>{exception.message}</TableCell>
                          <TableCell>{exception.poolId ?? '-'}</TableCell>
                          <TableCell>{exception.runId ?? '-'}</TableCell>
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
