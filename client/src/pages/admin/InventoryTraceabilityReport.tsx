import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Download,
  GitBranch,
  Loader2,
  RefreshCw,
  Route,
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

interface InventoryTraceabilityReportData {
  generatedAt: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    status: string | null;
    exceptionOnly: boolean;
  };
  summary: {
    totalLots: number;
    icnCoveredLots: number;
    icnCoveragePercent: number;
    receiptEvents: number;
    issueEvents: number;
    moveEvents: number;
    splitEvents: number;
    linkedWorkOrders: number;
    zeroQuantityExceptions: number;
    negativeQuantityExceptions: number;
    fifoExceptions: number;
    fefoExceptions: number;
    splitLineageExceptions: number;
  };
  lots: Array<{
    id: string;
    internalControlNumber: string | null;
    materialPartNumber: string;
    materialName: string;
    supplier: string;
    supplierLotNumber: string | null;
    purchaseOrderNumber: string | null;
    receivingRecordNumber: string | null;
    receivedQty: number;
    remainingQty: number;
    unitOfMeasure: string;
    status: string;
    storageLocation: string | null;
    receivedAt: string | null;
    expirationDate: string | null;
    parentLotId: string | null;
    parentIcn: string | null;
    childLotCount: number;
    receiptCount: number;
    issueCount: number;
    moveCount: number;
    splitCount: number;
    adjustmentCount: number;
    consumptionCount: number;
    linkedTravelerCount: number;
    linkedWorkOrderCount: number;
    workOrderNumbers: string;
    latestTransactionAt: string | null;
    latestTransactionType: string | null;
    fifoException: boolean;
    fefoException: boolean;
    zeroQuantityException: boolean;
    negativeQuantityException: boolean;
    splitLineageException: boolean;
    flags: string[];
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    lotId: string | null;
    internalControlNumber: string | null;
  }>;
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

function StatusBadge({ value }: { value: string }) {
  const bad = ['REJECTED', 'EXPIRED', 'SCRAPPED', 'HOLD', 'LOCKED'].includes(value);
  const good = ['ACCEPTED', 'RECEIVED'].includes(value);
  return <Badge variant={bad ? 'destructive' : good ? 'default' : 'secondary'}>{value}</Badge>;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'warning') return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

function qty(value: number, uom: string) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${uom}`;
}

function downloadCsv(report: InventoryTraceabilityReportData) {
  const header = [
    'ICN',
    'Material Part Number',
    'Material Name',
    'Supplier',
    'Supplier Lot',
    'PO Number',
    'Receiving Record',
    'Received Qty',
    'Remaining Qty',
    'UOM',
    'Status',
    'Location',
    'Received At',
    'Expiration Date',
    'Parent ICN',
    'Child Lot Count',
    'Receipts',
    'Issues',
    'Moves',
    'Splits',
    'Consumption',
    'Work Orders',
    'Latest Transaction',
    'FIFO Exception',
    'FEFO Exception',
    'Flags',
  ];
  const exceptionHeader = ['Severity', 'Type', 'Message', 'ICN'];
  const lines = [
    ['Inventory Traceability Report'],
    ['Generated At', report.generatedAt],
    ['Date Range', `${report.filters.startDate ?? 'All'} through ${report.filters.endDate ?? 'All'}`],
    [],
    header,
    ...report.lots.map((row) => [
      row.internalControlNumber,
      row.materialPartNumber,
      row.materialName,
      row.supplier,
      row.supplierLotNumber,
      row.purchaseOrderNumber,
      row.receivingRecordNumber,
      row.receivedQty,
      row.remainingQty,
      row.unitOfMeasure,
      row.status,
      row.storageLocation,
      row.receivedAt,
      row.expirationDate,
      row.parentIcn,
      row.childLotCount,
      row.receiptCount,
      row.issueCount,
      row.moveCount,
      row.splitCount,
      row.consumptionCount,
      row.workOrderNumbers,
      row.latestTransactionType,
      row.fifoException ? 'Yes' : 'No',
      row.fefoException ? 'Yes' : 'No',
      row.flags.join('; '),
    ]),
    [],
    ['Exceptions'],
    exceptionHeader,
    ...report.exceptions.map((row) => [
      row.severity,
      row.exceptionType,
      row.message,
      row.internalControlNumber,
    ]),
  ];
  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `inventory-traceability-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function InventoryTraceabilityReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('all');
  const [exceptionOnly, setExceptionOnly] = useState('false');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (status !== 'all') params.set('status', status);
    if (exceptionOnly === 'true') params.set('exceptionOnly', 'true');
    return `/api/edri/inventory-traceability${params.toString() ? `?${params.toString()}` : ''}`;
  }, [startDate, endDate, status, exceptionOnly]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<InventoryTraceabilityReportData>({
    queryKey: ['inventory-traceability-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  const criticalExceptions = data?.exceptions.filter((row) => row.severity === 'critical').length ?? 0;
  const totalFlowEvents = (data?.summary.receiptEvents ?? 0)
    + (data?.summary.issueEvents ?? 0)
    + (data?.summary.moveEvents ?? 0)
    + (data?.summary.splitEvents ?? 0);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Boxes className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Inventory Traceability Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Material lot lineage, ICN coverage, receipts, issues, moves, splits, zero-quantity exceptions, FIFO/FEFO risk, and work-order linkage.
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
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="start-date">Start date</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">End date</Label>
            <Input id="end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="RECEIVED">Received</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="QUARANTINE">Quarantine</SelectItem>
                <SelectItem value="HOLD">Hold</SelectItem>
                <SelectItem value="LOCKED">Locked</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="CONSUMED">Consumed</SelectItem>
                <SelectItem value="SCRAPPED">Scrapped</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Population</Label>
            <Select value={exceptionOnly} onValueChange={setExceptionOnly}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">All lots</SelectItem>
                <SelectItem value="true">Exceptions only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Unable to load inventory traceability report.'}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Material Lots</p>
                <p className="text-2xl font-bold">{data?.summary.totalLots ?? 0}</p>
              </div>
              <Boxes className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.icnCoveragePercent ?? 0}% ICN coverage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Trace Events</p>
                <p className="text-2xl font-bold">{totalFlowEvents}</p>
              </div>
              <Route className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {data?.summary.receiptEvents ?? 0} receipts · {data?.summary.issueEvents ?? 0} issues
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Work-Order Links</p>
                <p className="text-2xl font-bold">{data?.summary.linkedWorkOrders ?? 0}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Lots tied to travelers or WOs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical Exceptions</p>
                <p className="text-2xl font-bold">{criticalExceptions}</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {(data?.summary.fifoExceptions ?? 0) + (data?.summary.fefoExceptions ?? 0)} FIFO/FEFO flags
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lot Traceability Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ICN / Lot</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Flow</TableHead>
                  <TableHead>Lineage</TableHead>
                  <TableHead>Work Orders</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      Loading inventory traceability report...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && data?.lots.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No material lots matched the selected filters.
                    </TableCell>
                  </TableRow>
                )}
                {data?.lots.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="min-w-[210px] align-top">
                      <div className="font-medium">{row.internalControlNumber ?? 'No ICN'}</div>
                      <div className="text-xs text-muted-foreground">
                        Supplier lot: {row.supplierLotNumber ?? '-'}
                      </div>
                      <div className="text-xs text-muted-foreground">Received {formatDate(row.receivedAt)}</div>
                    </TableCell>
                    <TableCell className="min-w-[240px] align-top">
                      <div className="font-medium">{row.materialPartNumber}</div>
                      <div className="text-xs text-muted-foreground">{row.materialName}</div>
                      <div className="text-xs text-muted-foreground">{row.supplier}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <StatusBadge value={row.status} />
                      <div className="mt-1 text-xs text-muted-foreground">{row.storageLocation ?? 'No location'}</div>
                      {row.expirationDate && <div className="text-xs text-muted-foreground">Exp {formatDate(row.expirationDate)}</div>}
                    </TableCell>
                    <TableCell className="min-w-[150px] align-top">
                      <div className="text-sm">Received: {qty(row.receivedQty, row.unitOfMeasure)}</div>
                      <div className={row.negativeQuantityException || row.zeroQuantityException ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
                        Remaining: {qty(row.remainingQty, row.unitOfMeasure)}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[160px] align-top text-sm">
                      <div>{row.receiptCount} receipts · {row.issueCount + row.consumptionCount} issues</div>
                      <div className="text-muted-foreground">{row.moveCount} moves · {row.splitCount} splits</div>
                      <div className="text-xs text-muted-foreground">{row.latestTransactionType ?? 'No transaction'} {formatDateTime(row.latestTransactionAt)}</div>
                    </TableCell>
                    <TableCell className="min-w-[170px] align-top">
                      <div className="flex items-center gap-1 text-sm">
                        <GitBranch className="h-3.5 w-3.5" />
                        {row.parentIcn ? `Parent ${row.parentIcn}` : 'Root lot'}
                      </div>
                      <div className="text-xs text-muted-foreground">{row.childLotCount} child lots</div>
                    </TableCell>
                    <TableCell className="min-w-[190px] align-top">
                      <div className="text-sm">{row.linkedWorkOrderCount} work orders</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">{row.workOrderNumbers || `${row.linkedTravelerCount} travelers`}</div>
                    </TableCell>
                    <TableCell className="min-w-[250px] align-top">
                      {row.flags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.flags.slice(0, 4).map((flag) => (
                            <Badge key={flag} variant="outline">{flag}</Badge>
                          ))}
                          {row.flags.length > 4 && <Badge variant="outline">+{row.flags.length - 4}</Badge>}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No exceptions</span>
                      )}
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
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Exceptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(data?.exceptions ?? []).slice(0, 12).map((row, index) => (
              <div key={`${row.lotId}-${row.exceptionType}-${index}`} className="flex flex-col gap-2 rounded-md border p-3 text-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={row.severity} />
                    <span className="font-medium">{row.exceptionType.replaceAll('_', ' ')}</span>
                  </div>
                  <p className="text-muted-foreground">{row.message}</p>
                </div>
                <span className="text-xs text-muted-foreground">{row.internalControlNumber ?? 'No ICN'}</span>
              </div>
            ))}
            {!isLoading && (data?.exceptions.length ?? 0) === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No inventory traceability exceptions were found for the selected filters.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
