import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
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

interface ProcurementComplianceReportData {
  generatedAt: string;
  effectiveDate: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    reviewStatus: string | null;
    issueStatus: string | null;
    population: string;
  };
  summary: {
    totalPurchaseOrders: number;
    totalPoValue: number;
    reviewed: number;
    pendingReview: number;
    blocked: number;
    requiresAttention: number;
    farRequired: number;
    farNotRequired: number;
    missingFarFlowdown: number;
    missingJustificationNotes: number;
    missingSecondPartyApproval: number;
    missingVendorApproval: number;
    vendorApprovalExpired: number;
    staleReviews: number;
    issuedBeforeReview: number;
    legacyPurchaseOrders: number;
  };
  purchaseOrders: Array<{
    id: number;
    poNumber: string;
    externalPoNumber: string | null;
    vendorId: number;
    vendorName: string;
    vendorApproved: boolean;
    vendorApprovalLevel: string | null;
    vendorApprovalExpiration: string | null;
    vendorApprovalExpired: boolean;
    productionLine: string | null;
    status: string;
    issueDate: string | null;
    expectedDeliveryDate: string | null;
    totalCost: number;
    complianceStatus: string;
    reviewStatus: string | null;
    governmentContract: boolean;
    farRequired: boolean;
    dpasRequired: boolean;
    cocRequired: boolean;
    mtrRequired: boolean;
    sourceInspectionRequired: boolean;
    secondPartyComplete: boolean;
    reviewVendorApproved: boolean;
    reviewNotes: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    historicalBackfill: boolean;
    legacyExceptionFlagged: boolean;
    legacyExceptionReason: string | null;
    isLegacy: boolean;
    isStale: boolean;
    applicableFlowdownCount: number;
    notApplicableFlowdownCount: number;
    flowdownClauseNumbers: string;
    requisitionNumber: string | null;
    requisitionStatus: string | null;
    requisitionJustification: string | null;
    competitionMethod: string | null;
    soleSourceJustification: string | null;
    approvalCount: number;
    approvedApprovalCount: number;
    lastApprovalBy: string | null;
    lastApprovalAt: string | null;
    directPoExceptionApprovedBy: string | null;
    directPoExceptionApprovedAt: string | null;
    directPoExceptionReason: string | null;
    vendorConfirmedAction: string | null;
    vendorConfirmedAt: string | null;
    debarmentResult: string | null;
    debarmentCheckedAt: string | null;
    flags: string[];
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    poId: number | null;
    poNumber: string | null;
  }>;
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function boolText(value: boolean) {
  return value ? 'Yes' : 'No';
}

function StatusBadge({ value }: { value: string }) {
  const bad = ['Blocked', 'Requires Attention', 'Pending Review', 'Cancelled', 'Expired'].includes(value);
  const good = ['Reviewed', 'Sent', 'Partially Received', 'Fully Received'].includes(value);
  return <Badge variant={bad ? 'destructive' : good ? 'default' : 'secondary'}>{value}</Badge>;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'warning') return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

function downloadCsv(report: ProcurementComplianceReportData) {
  const header = [
    'PO Number',
    'External PO',
    'Vendor',
    'Issue Status',
    'Issue Date',
    'Total Cost',
    'Compliance Status',
    'Review Status',
    'Government Contract',
    'FAR/DFARS Required',
    'Applicable Flowdowns',
    'Flowdown Clauses',
    'Second-Party Approval',
    'Vendor Approval',
    'Vendor Approval Expiration',
    'Reviewer',
    'Reviewed At',
    'Justification Notes',
    'Requisition',
    'Competition Method',
    'Sole Source Justification',
    'Approval Count',
    'Last Approval By',
    'Vendor Confirmation',
    'Flags',
  ];
  const exceptionHeader = ['Severity', 'Type', 'Message', 'PO'];
  const lines = [
    ['Procurement Compliance Report'],
    ['Generated At', report.generatedAt],
    ['Compliance Effective Date', report.effectiveDate],
    ['Date Range', `${report.filters.startDate ?? 'All'} through ${report.filters.endDate ?? 'All'}`],
    [],
    header,
    ...report.purchaseOrders.map((row) => [
      row.poNumber,
      row.externalPoNumber,
      row.vendorName,
      row.status,
      row.issueDate,
      row.totalCost,
      row.complianceStatus,
      row.reviewStatus,
      boolText(row.governmentContract),
      boolText(row.farRequired),
      row.applicableFlowdownCount,
      row.flowdownClauseNumbers,
      boolText(row.secondPartyComplete),
      boolText(row.reviewVendorApproved && row.vendorApproved),
      row.vendorApprovalExpiration,
      row.reviewedBy,
      row.reviewedAt,
      row.reviewNotes,
      row.requisitionNumber,
      row.competitionMethod,
      row.soleSourceJustification,
      `${row.approvedApprovalCount}/${row.approvalCount}`,
      row.lastApprovalBy,
      row.vendorConfirmedAction,
      row.flags.join('; '),
    ]),
    [],
    ['Exceptions'],
    exceptionHeader,
    ...report.exceptions.map((row) => [
      row.severity,
      row.exceptionType,
      row.message,
      row.poNumber,
    ]),
  ];
  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `procurement-compliance-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ProcurementComplianceReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reviewStatus, setReviewStatus] = useState('all');
  const [issueStatus, setIssueStatus] = useState('all');
  const [population, setPopulation] = useState('all');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (reviewStatus !== 'all') params.set('reviewStatus', reviewStatus);
    if (issueStatus !== 'all') params.set('issueStatus', issueStatus);
    if (population !== 'all') params.set('population', population);
    return `/api/edri/procurement-compliance${params.toString() ? `?${params.toString()}` : ''}`;
  }, [startDate, endDate, reviewStatus, issueStatus, population]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<ProcurementComplianceReportData>({
    queryKey: ['procurement-compliance-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  const criticalExceptions = data?.exceptions.filter((row) => row.severity === 'critical').length ?? 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Procurement Compliance Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Vendor PO compliance reviews, FAR/DFARS flowdown disposition, justification notes, approvals, vendor status, and stale or attention-required procurement flags.
          </p>
          {data && (
            <p className="text-xs text-muted-foreground">
              Generated {formatDateTime(data.generatedAt)}. Compliance effective date: {formatDate(data.effectiveDate)}.
            </p>
          )}
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
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="start-date">Start date</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">End date</Label>
            <Input id="end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Review status</Label>
            <Select value={reviewStatus} onValueChange={setReviewStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reviews</SelectItem>
                <SelectItem value="missing">Missing review</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="requires_attention">Requires attention</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>PO status</Label>
            <Select value={issueStatus} onValueChange={setIssueStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="RFQ Sent">RFQ sent</SelectItem>
                <SelectItem value="Quote Received">Quote received</SelectItem>
                <SelectItem value="Sent">Sent</SelectItem>
                <SelectItem value="Partially Received">Partially received</SelectItem>
                <SelectItem value="Fully Received">Fully received</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Population</Label>
            <Select value={population} onValueChange={setPopulation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All POs</SelectItem>
                <SelectItem value="enforced">Enforced</SelectItem>
                <SelectItem value="legacy">Legacy</SelectItem>
                <SelectItem value="requires-attention">Requires attention</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Unable to load procurement compliance report.'}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Purchase Orders</p>
                <p className="text-2xl font-bold">{data?.summary.totalPurchaseOrders ?? 0}</p>
              </div>
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{money(data?.summary.totalPoValue ?? 0)} total value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Reviewed</p>
                <p className="text-2xl font-bold">{data?.summary.reviewed ?? 0}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.pendingReview ?? 0} pending review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">FAR/DFARS Required</p>
                <p className="text-2xl font-bold">{data?.summary.farRequired ?? 0}</p>
              </div>
              <FileCheck2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.missingFarFlowdown ?? 0} missing flowdown evidence</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Attention Flags</p>
                <p className="text-2xl font-bold">{criticalExceptions}</p>
              </div>
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.staleReviews ?? 0} stale reviews</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="text-base">Purchase Order Compliance Detail</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/vendor-pos/compliance-backfill">Open Compliance Queue</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compliance</TableHead>
                  <TableHead>FAR/DFARS</TableHead>
                  <TableHead>Approvals</TableHead>
                  <TableHead>Justification</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      Loading procurement compliance report...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && data?.purchaseOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No purchase orders matched the selected filters.
                    </TableCell>
                  </TableRow>
                )}
                {data?.purchaseOrders.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-[180px] align-top">
                      <div className="font-medium">{row.poNumber}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(row.issueDate)} · {row.productionLine ?? 'No line'}</div>
                      {row.externalPoNumber && <div className="text-xs text-muted-foreground">External: {row.externalPoNumber}</div>}
                    </TableCell>
                    <TableCell className="min-w-[220px] align-top">
                      <div className="font-medium">{row.vendorName}</div>
                      <div className="text-xs text-muted-foreground">
                        Vendor approval: {row.vendorApproved ? 'Approved' : 'Not approved'}
                        {row.vendorApprovalLevel ? ` · Level ${row.vendorApprovalLevel}` : ''}
                      </div>
                      {row.vendorApprovalExpiration && (
                        <div className={row.vendorApprovalExpired ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                          Expires {formatDate(row.vendorApprovalExpiration)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <StatusBadge value={row.status} />
                      {row.vendorConfirmedAction && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Vendor {row.vendorConfirmedAction} {formatDateTime(row.vendorConfirmedAt)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[190px] align-top">
                      <StatusBadge value={row.complianceStatus} />
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.reviewedBy ?? 'No reviewer'} · {formatDateTime(row.reviewedAt)}
                      </div>
                      {row.isLegacy && <Badge className="mt-2" variant="outline">Legacy</Badge>}
                    </TableCell>
                    <TableCell className="min-w-[180px] align-top">
                      <div className="text-sm">{row.farRequired ? 'Required' : 'Not required'}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.applicableFlowdownCount} applicable · {row.notApplicableFlowdownCount} not applicable
                      </div>
                      {row.flowdownClauseNumbers && <div className="text-xs text-muted-foreground">{row.flowdownClauseNumbers}</div>}
                    </TableCell>
                    <TableCell className="min-w-[190px] align-top">
                      <div className="text-sm">Second-party: {boolText(row.secondPartyComplete)}</div>
                      <div className="text-xs text-muted-foreground">
                        Req approvals: {row.approvedApprovalCount}/{row.approvalCount}
                      </div>
                      <div className="text-xs text-muted-foreground">{row.lastApprovalBy ?? 'No approval actor'}</div>
                    </TableCell>
                    <TableCell className="min-w-[260px] align-top">
                      <div className="line-clamp-3 text-sm">{row.reviewNotes || row.requisitionJustification || '-'}</div>
                      {row.flags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.flags.slice(0, 3).map((flag) => (
                            <Badge key={flag} variant="outline">{flag}</Badge>
                          ))}
                          {row.flags.length > 3 && <Badge variant="outline">+{row.flags.length - 3}</Badge>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right align-top font-medium">{money(row.totalCost)}</TableCell>
                  </TableRow>
                ))}
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
            {(data?.exceptions ?? []).slice(0, 12).map((row, index) => (
              <div key={`${row.poId}-${row.exceptionType}-${index}`} className="flex flex-col gap-2 rounded-md border p-3 text-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={row.severity} />
                    <span className="font-medium">{row.exceptionType.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="text-muted-foreground">{row.message}</p>
                </div>
                <span className="text-xs text-muted-foreground">{row.poNumber ?? 'No PO'}</span>
              </div>
            ))}
            {!isLoading && (data?.exceptions.length ?? 0) === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No procurement compliance exceptions were found for the selected filters.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
