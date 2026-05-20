import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Landmark,
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

interface UnallowableCostReviewReportData {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    dcaaStatus: string | null;
    allowabilityStatus: string | null;
  };
  summary: {
    totalTransactions: number;
    needsReview: number;
    complete: number;
    exceptions: number;
    pendingReview: number;
    allowable: number;
    unallowable: number;
    allowabilityNeedsReview: number;
    missingGlAccount: number;
    missingReason: number;
    totalAmount: number;
    unallowableAmount: number;
    exceptionAmount: number;
  };
  transactions: Array<{
    id: string;
    transactionNumber: string;
    transactionType: string;
    transactionDate: string;
    status: string;
    paidByName: string;
    vendorName: string;
    amount: number;
    businessPurpose: string;
    projectId: string | null;
    contractNumber: string | null;
    directIndirect: string;
    costCategory: string;
    receiptStatus: string;
    attachmentCount: number;
    glAccountId: number | null;
    glAccountName: string | null;
    glAccountType: string | null;
    glPostingStatus: string;
    allowabilityStatus: string;
    dcaaReviewStatus: string;
    reviewer: string | null;
    reviewedAt: string | null;
    reason: string | null;
    submittedBy: string;
    submittedAt: string | null;
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    transactionId: string | null;
    transactionNumber: string | null;
  }>;
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
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
  const destructive = ['EXCEPTION', 'UNALLOWABLE', 'NEEDS_REVIEW', 'PENDING_REVIEW', 'MISSING', 'PENDING_COA', 'HELD'].includes(value);
  const complete = ['COMPLETE', 'ALLOWABLE', 'POSTED', 'READY', 'ATTACHED'].includes(value);
  return <Badge variant={destructive ? 'destructive' : complete ? 'default' : 'secondary'}>{value.replaceAll('_', ' ')}</Badge>;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'warning') return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

function downloadCsv(report: UnallowableCostReviewReportData) {
  const header = [
    'Transaction Number',
    'Date',
    'Type',
    'Paid By',
    'Vendor',
    'Amount',
    'Business Purpose',
    'Direct/Indirect',
    'Cost Category',
    'DCAA Review Status',
    'Allowability Status',
    'Reviewer',
    'Reviewed At',
    'Reason',
    'GL Account',
    'GL Account Type',
    'GL Posting Status',
    'Receipt Status',
    'Attachment Count',
  ];
  const exceptionHeader = ['Severity', 'Type', 'Message', 'Transaction'];
  const lines = [
    ['Unallowable Cost Review Report'],
    ['Generated At', report.generatedAt],
    ['Date Range', `${report.filters.startDate ?? 'All'} through ${report.filters.endDate ?? 'All'}`],
    [],
    header,
    ...report.transactions.map((row) => [
      row.transactionNumber,
      row.transactionDate,
      row.transactionType,
      row.paidByName,
      row.vendorName,
      row.amount,
      row.businessPurpose,
      row.directIndirect,
      row.costCategory,
      row.dcaaReviewStatus,
      row.allowabilityStatus,
      row.reviewer,
      row.reviewedAt,
      row.reason,
      row.glAccountName,
      row.glAccountType,
      row.glPostingStatus,
      row.receiptStatus,
      row.attachmentCount,
    ]),
    [],
    ['Exceptions'],
    exceptionHeader,
    ...report.exceptions.map((row) => [
      row.severity,
      row.exceptionType,
      row.message,
      row.transactionNumber,
    ]),
  ];
  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `unallowable-cost-review-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function UnallowableCostReviewReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dcaaStatus, setDcaaStatus] = useState('all');
  const [allowabilityStatus, setAllowabilityStatus] = useState('all');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (dcaaStatus !== 'all') params.set('dcaaStatus', dcaaStatus);
    if (allowabilityStatus !== 'all') params.set('allowabilityStatus', allowabilityStatus);
    return `/api/edri/unallowable-cost-review${params.toString() ? `?${params.toString()}` : ''}`;
  }, [startDate, endDate, dcaaStatus, allowabilityStatus]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<UnallowableCostReviewReportData>({
    queryKey: ['unallowable-cost-review-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  const criticalExceptions = data?.exceptions.filter((row) => row.severity === 'critical').length ?? 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Unallowable Cost Review Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            FAR allowability workflow status, reviewer evidence, rationale, documentation, and GL segregation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/finance/accounting-control">
              <Landmark className="mr-2 h-4 w-4" />
              Control Center
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
          <Label>DCAA status</Label>
          <Select value={dcaaStatus} onValueChange={setDcaaStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
              <SelectItem value="COMPLETE">Complete</SelectItem>
              <SelectItem value="EXCEPTION">Exception</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Allowability</Label>
          <Select value={allowabilityStatus} onValueChange={setAllowabilityStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
              <SelectItem value="ALLOWABLE">Allowable</SelectItem>
              <SelectItem value="UNALLOWABLE">Unallowable</SelectItem>
              <SelectItem value="NEEDS_REVIEW">Needs Review</SelectItem>
            </SelectContent>
          </Select>
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
                <CardTitle className="text-sm font-medium">Review Exceptions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-2xl font-bold">
                  {criticalExceptions > 0 ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  {data.summary.exceptions}
                </div>
                <p className="text-xs text-muted-foreground">{data.summary.needsReview} still need review</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Allowability</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.unallowable}</div>
                <p className="text-xs text-muted-foreground">{data.summary.allowable} allowable, {data.summary.pendingReview} pending</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Unallowable Dollars</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{money(data.summary.unallowableAmount)}</div>
                <p className="text-xs text-muted-foreground">{money(data.summary.exceptionAmount)} exception amount</p>
              </CardContent>
            </Card>
            <Card className={data.summary.missingGlAccount > 0 || data.summary.missingReason > 0 ? 'border-amber-500' : ''}>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Support Gaps</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.missingGlAccount + data.summary.missingReason}</div>
                <p className="text-xs text-muted-foreground">{data.summary.missingGlAccount} GL, {data.summary.missingReason} rationale</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="text-center space-y-1">
                <div className="text-sm font-semibold tracking-wide">EPOCH</div>
                <CardTitle>Unallowable Cost Review Register</CardTitle>
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
                      <TableHead>Transaction</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor / Paid By</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Review</TableHead>
                      <TableHead>Allowability</TableHead>
                      <TableHead>Reviewer / Reason</TableHead>
                      <TableHead>GL Account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          No accounting control transactions match the selected filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.transactions.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="font-mono text-xs">{row.transactionNumber}</div>
                            <div className="text-xs text-muted-foreground">{row.transactionType.replaceAll('_', ' ')}</div>
                          </TableCell>
                          <TableCell>{row.transactionDate}</TableCell>
                          <TableCell>
                            <div className="font-medium">{row.vendorName}</div>
                            <div className="text-xs text-muted-foreground">{row.paidByName}</div>
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            <div className="truncate">{row.businessPurpose}</div>
                            <div className="text-xs text-muted-foreground">{row.directIndirect} / {row.costCategory} / docs {row.attachmentCount}</div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{money(row.amount)}</TableCell>
                          <TableCell><StatusBadge value={row.dcaaReviewStatus} /></TableCell>
                          <TableCell><StatusBadge value={row.allowabilityStatus} /></TableCell>
                          <TableCell className="max-w-[320px]">
                            <div>{row.reviewer ?? '-'}</div>
                            <div className="text-xs text-muted-foreground">{formatDateTime(row.reviewedAt)}</div>
                            <div className="text-xs truncate">{row.reason ?? '-'}</div>
                          </TableCell>
                          <TableCell>
                            <div>{row.glAccountName ?? '-'}</div>
                            <div className="text-xs text-muted-foreground">{row.glPostingStatus}</div>
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
            <CardHeader><CardTitle>Exceptions</CardTitle></CardHeader>
            <CardContent>
              {data.exceptions.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No allowability review exceptions were found.
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Transaction</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.exceptions.map((exception, index) => (
                        <TableRow key={`${exception.exceptionType}-${index}`}>
                          <TableCell><SeverityBadge severity={exception.severity} /></TableCell>
                          <TableCell className="font-mono text-xs">{exception.exceptionType}</TableCell>
                          <TableCell>{exception.message}</TableCell>
                          <TableCell>{exception.transactionNumber ?? '-'}</TableCell>
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
