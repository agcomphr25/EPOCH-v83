import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Wrench } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface StatusSummaryRow {
  current_status: string;
  current_department: string;
  is_fulfilled: boolean;
  expected_status: string;
  count: number;
}

interface StatusSampleRow {
  id: number;
  order_id: string;
  po_id: number;
  po_item_id: number | null;
  po_number: string | null;
  customer_name: string | null;
  current_status: string | null;
  expected_status: string;
  current_department: string | null;
  is_fulfilled: boolean;
  updated_at: string | null;
}

interface PoReopenSummaryRow {
  current_po_status: string;
  po_count: number;
  active_production_order_count: number;
}

interface FulfilledDepartmentSummaryRow {
  current_department: string;
  production_status: string;
  expected_department: string;
  count: number;
}

interface FulfilledDepartmentSampleRow {
  id: number;
  order_id: string;
  po_id: number;
  po_item_id: number | null;
  po_number: string | null;
  customer_name: string | null;
  current_department: string | null;
  production_status: string | null;
  expected_department: string;
  shipped_at: string | null;
  fulfilled_date: string | null;
  updated_at: string | null;
}

interface PoReopenSampleRow {
  po_id: number;
  po_number: string;
  customer_name: string | null;
  current_po_status: string;
  active_production_order_count: number;
  last_active_order_updated_at: string | null;
}

interface AppliedStatusRow {
  id: number;
  order_id: string;
  po_id: number;
  previous_status: string | null;
  new_status: string;
  current_department: string | null;
  is_fulfilled: boolean;
}

interface AppliedPoRow {
  po_id: number;
  po_number: string;
  customer_name: string | null;
  previous_status: string;
  new_status: string;
  active_production_order_count: number;
}

interface AppliedFulfilledDepartmentRow {
  id: number;
  order_id: string;
  po_id: number;
  po_item_id: number | null;
  previous_department: string | null;
  new_department: string;
  new_status: string;
  is_fulfilled: boolean;
}

interface RepairResponse {
  success: boolean;
  mode: 'dry_run' | 'applied';
  generatedAt: string;
  sampleLimit: number;
  maxApply: number;
  productionStatusRepairs: {
    summary: StatusSummaryRow[];
    samples: StatusSampleRow[];
    appliedCount: number;
    appliedRows: AppliedStatusRow[];
  };
  fulfilledDepartmentRepairs?: {
    summary: FulfilledDepartmentSummaryRow[];
    samples: FulfilledDepartmentSampleRow[];
    appliedCount: number;
    appliedRows: AppliedFulfilledDepartmentRow[];
  };
  purchaseOrderReopens: {
    summary: PoReopenSummaryRow[];
    samples: PoReopenSampleRow[];
    appliedCount: number;
    appliedRows: AppliedPoRow[];
  };
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const label = value || '(blank)';
  const upper = label.toUpperCase();
  const className =
    upper === 'SHIPPED'
      ? 'bg-green-100 text-green-800'
      : upper === 'CANCELLED'
        ? 'bg-red-100 text-red-800'
        : upper === 'PENDING'
          ? 'bg-blue-100 text-blue-800'
          : upper === 'IN_PROGRESS' || upper === 'LAID_UP'
            ? 'bg-yellow-100 text-yellow-800'
            : '';

  return <Badge variant={className ? 'secondary' : 'outline'} className={className}>{label}</Badge>;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function countRows(rows: Array<{ count?: number; po_count?: number }>) {
  return rows.reduce((sum, row) => sum + Number(row.count ?? row.po_count ?? 0), 0);
}

export default function P1POStatusRepairPage() {
  const { toast } = useToast();
  const [sampleLimit, setSampleLimit] = useState(25);
  const [maxApply, setMaxApply] = useState(500);
  const [lastApplied, setLastApplied] = useState<RepairResponse | null>(null);

  const query = useQuery<RepairResponse>({
    queryKey: ['/api/admin/p1-po-status-repair', sampleLimit, maxApply],
    queryFn: () =>
      apiRequest('/api/admin/p1-po-status-repair', {
        method: 'POST',
        body: { sampleLimit, maxApply },
      }),
    staleTime: 0,
    retry: false,
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/admin/p1-po-status-repair', {
        method: 'POST',
        body: { apply: true, sampleLimit, maxApply },
      }) as Promise<RepairResponse>,
    onSuccess: (data) => {
      setLastApplied(data);
      toast({
        title: 'P1 PO repair applied',
        description: `${data.productionStatusRepairs.appliedCount} production statuses updated, ${data.fulfilledDepartmentRepairs?.appliedCount ?? 0} shipped rows marked fulfilled, ${data.purchaseOrderReopens.appliedCount} POs reopened.`,
      });
      query.refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Repair failed',
        description: error?.message || 'The repair request did not complete.',
        variant: 'destructive',
      });
    },
  });

  const data = query.data;
  const statusRepairCount = useMemo(
    () => countRows(data?.productionStatusRepairs.summary ?? []),
    [data?.productionStatusRepairs.summary],
  );
  const poReopenCount = useMemo(
    () => countRows(data?.purchaseOrderReopens.summary ?? []),
    [data?.purchaseOrderReopens.summary],
  );
  const fulfilledDepartmentRepairCount = useMemo(
    () => countRows(data?.fulfilledDepartmentRepairs?.summary ?? []),
    [data?.fulfilledDepartmentRepairs?.summary],
  );
  const totalRepairCount = statusRepairCount + fulfilledDepartmentRepairCount + poReopenCount;
  const isBusy = query.isFetching || applyMutation.isPending;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Wrench className="h-6 w-6" />
            P1 PO Status Repair
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Review and repair existing P1 purchase order status drift using the current production department rules.
          </p>
        </div>
        <Button variant="outline" onClick={() => query.refetch()} disabled={isBusy}>
          {query.isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Repair Controls</CardTitle>
          <CardDescription>Dry-run runs automatically. Applying changes requires confirmation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="sample-limit">Sample rows</Label>
              <Input
                id="sample-limit"
                type="number"
                min={1}
                max={100}
                value={sampleLimit}
                onChange={(event) => setSampleLimit(Number(event.target.value) || 25)}
                className="w-28"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="max-apply">Max apply</Label>
              <Input
                id="max-apply"
                type="number"
                min={1}
                max={5000}
                value={maxApply}
                onChange={(event) => setMaxApply(Number(event.target.value) || 500)}
                className="w-28"
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={isBusy || totalRepairCount === 0}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="button-apply-p1-po-status-repair"
                >
                  {applyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
                  Apply Repair
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apply P1 PO Status Repair</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will update up to {maxApply} drifted production statuses, mark shipped P1 rows as fulfilled and move them to Shipped, and reopen up to {maxApply} closed or complete POs with active production items.
                    Item descriptions, item stock fields, and shipment records will not be changed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => applyMutation.mutate()}
                    className="bg-red-600 hover:bg-red-700"
                    data-testid="button-confirm-p1-po-status-repair"
                  >
                    Apply repair
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {query.isError && (
        <Card className="border-red-200">
          <CardContent className="py-4 text-sm text-red-700">
            Could not load P1 PO repair data.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Production Status Repairs</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{statusRepairCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Shipped Rows In QC</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{fulfilledDepartmentRepairCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">POs To Reopen</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{poReopenCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Last Applied</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {lastApplied ? (
              <div className="space-y-1">
                <div>{lastApplied.productionStatusRepairs.appliedCount} statuses</div>
                <div>{lastApplied.fulfilledDepartmentRepairs?.appliedCount ?? 0} shipped rows fulfilled</div>
                <div>{lastApplied.purchaseOrderReopens.appliedCount} POs reopened</div>
              </div>
            ) : (
              <span className="text-muted-foreground">No repair applied this session</span>
            )}
          </CardContent>
        </Card>
      </div>

      {totalRepairCount === 0 && data && (
        <Card className="border-green-200">
          <CardContent className="py-4 flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            No P1 PO status repairs are currently needed.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Production Status Drift
          </CardTitle>
          <CardDescription>Rows whose stored production status differs from their current department and fulfilled state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Current Status</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Fulfilled</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.productionStatusRepairs.summary ?? []).map((row) => (
                <TableRow key={`${row.current_status}-${row.current_department}-${row.expected_status}-${row.is_fulfilled}`}>
                  <TableCell><StatusBadge value={row.current_status} /></TableCell>
                  <TableCell>{row.current_department}</TableCell>
                  <TableCell>{row.is_fulfilled ? 'Yes' : 'No'}</TableCell>
                  <TableCell><StatusBadge value={row.expected_status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                </TableRow>
              ))}
              {!query.isFetching && (data?.productionStatusRepairs.summary ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">No production status drift found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>PO</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.productionStatusRepairs.samples ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.order_id}</TableCell>
                  <TableCell>{row.po_number || row.po_id}</TableCell>
                  <TableCell>{row.customer_name || '-'}</TableCell>
                  <TableCell><StatusBadge value={row.current_status} /></TableCell>
                  <TableCell><StatusBadge value={row.expected_status} /></TableCell>
                  <TableCell>{row.current_department || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.updated_at)}</TableCell>
                </TableRow>
              ))}
              {!query.isFetching && (data?.productionStatusRepairs.samples ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">No sample rows.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipped Rows Still In Shipping QC</CardTitle>
          <CardDescription>SHIPPED P1 production rows in Shipping QC should be marked fulfilled, moved to Shipped, and display as SHIPPED in P1 PO Manage Items.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Current Department</TableHead>
                <TableHead>Production Status</TableHead>
                <TableHead>Repair Department</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.fulfilledDepartmentRepairs?.summary ?? []).map((row) => (
                <TableRow key={`${row.current_department}-${row.production_status}-${row.expected_department}`}>
                  <TableCell>{row.current_department}</TableCell>
                  <TableCell><StatusBadge value={row.production_status} /></TableCell>
                  <TableCell>{row.expected_department}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                </TableRow>
              ))}
              {!query.isFetching && (data?.fulfilledDepartmentRepairs?.summary ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">No shipped rows are still in Shipping QC.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>PO</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Current Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fulfilled</TableHead>
                <TableHead>Shipped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.fulfilledDepartmentRepairs?.samples ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.order_id}</TableCell>
                  <TableCell>{row.po_number || row.po_id}</TableCell>
                  <TableCell>{row.customer_name || '-'}</TableCell>
                  <TableCell>{row.current_department || '-'}</TableCell>
                  <TableCell><StatusBadge value={row.production_status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.fulfilled_date)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.shipped_at)}</TableCell>
                </TableRow>
              ))}
              {!query.isFetching && (data?.fulfilledDepartmentRepairs?.samples ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">No sample rows.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Closed POs With Active Items</CardTitle>
          <CardDescription>Closed or complete POs that still have production rows whose expected status is active.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Status</TableHead>
                <TableHead className="text-right">PO Count</TableHead>
                <TableHead className="text-right">Active Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.purchaseOrderReopens.summary ?? []).map((row) => (
                <TableRow key={row.current_po_status}>
                  <TableCell><StatusBadge value={row.current_po_status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{row.po_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.active_production_order_count}</TableCell>
                </TableRow>
              ))}
              {!query.isFetching && (data?.purchaseOrderReopens.summary ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">No closed active POs found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Active Items</TableHead>
                <TableHead>Last Active Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.purchaseOrderReopens.samples ?? []).map((row) => (
                <TableRow key={row.po_id}>
                  <TableCell>{row.po_number}</TableCell>
                  <TableCell>{row.customer_name || '-'}</TableCell>
                  <TableCell><StatusBadge value={row.current_po_status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{row.active_production_order_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(row.last_active_order_updated_at)}</TableCell>
                </TableRow>
              ))}
              {!query.isFetching && (data?.purchaseOrderReopens.samples ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">No sample rows.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
