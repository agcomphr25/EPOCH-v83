import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download,
  Filter,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Scissors,
} from 'lucide-react';

const TRANSACTION_TYPES = [
  { value: 'receipt', label: 'Receipt', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' },
  { value: 'putaway', label: 'Putaway', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200' },
  { value: 'issue', label: 'Issue', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' },
  { value: 'consumption', label: 'Consumption', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' },
  { value: 'transfer', label: 'Transfer', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' },
  { value: 'adjustment', label: 'Adjustment', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' },
  { value: 'return', label: 'Return', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' },
  { value: 'allocation', label: 'Allocation', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200' },
  { value: 'receipt_pending', label: 'Receipt (Pending)', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200' },
];

interface LedgerRow {
  id: number;
  transactionDate: string;
  agPartNumber: string;
  partName: string | null;
  transactionType: string;
  quantity: number;
  unitOfMeasure: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  location: string;
  costPerUnit: string | null;
  totalCost: string | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  performedBy: string;
  departmentId?: number;
  departmentName?: string;
  delta: number;
  runningBalance?: number;
}

interface LedgerResponse {
  data: LedgerRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasRunningBalance: boolean;
}

interface LocationsResponse {
  locations: string[];
  departments: Record<string, { departmentId: number; departmentName: string }>;
}

const LIMIT = 100;

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || v === 'all') continue;
    sp.append(k, String(v));
  }
  return sp.toString();
}

function formatDateTime(d: string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(n: number | null | undefined, digits = 2): string {
  if (n == null || isNaN(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function typeBadge(type: string) {
  const t = (type || '').toLowerCase();
  const found = TRANSACTION_TYPES.find((x) => x.value === t);
  return (
    <Badge variant="outline" className={found?.color ?? 'bg-gray-100 text-gray-800'}>
      {found?.label ?? type}
    </Badge>
  );
}

function referenceLink(row: LedgerRow): JSX.Element | null {
  if (!row.referenceId) return null;
  const refType = (row.referenceType || '').toLowerCase();
  const ref = encodeURIComponent(row.referenceId);
  let href: string | null = null;
  if (refType === 'vendor_po' || refType === 'purchaseorder' || refType.includes('po')) {
    href = `/vendor-pos?search=${ref}`;
  } else if (refType === 'workorder' || refType === 'work_order' || refType.includes('wo')) {
    href = `/manufacturing-queue?search=${ref}`;
  } else if (refType === 'order' || refType === 'sales_order') {
    href = `/orders-list?search=${ref}`;
  } else if (refType === 'receipt') {
    href = `/inventory/receiving?search=${ref}`;
  } else if (refType === 'requisition') {
    href = `/purchasing-requisitions?search=${ref}`;
  } else if (refType === 'cycle_count') {
    href = `/inventory/enhanced-mrp?cycleCount=${ref}`;
  }
  const label = `${row.referenceType ?? 'Ref'}: ${row.referenceId}`;
  if (!href) return <span className="text-xs text-muted-foreground">{label}</span>;
  return (
    <Link href={href}>
      <a className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1" data-testid={`link-reference-${row.id}`}>
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
    </Link>
  );
}

function locationLink(location: string | null | undefined): JSX.Element {
  if (!location) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Link href={`/inventory/enhanced-mrp?location=${encodeURIComponent(location)}`}>
      <a className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
        {location}
      </a>
    </Link>
  );
}

function partLink(agPartNumber: string, name?: string | null): JSX.Element {
  return (
    <Link href={`/inventory/enhanced-mrp?part=${encodeURIComponent(agPartNumber)}`}>
      <a className="block hover:underline">
        <div className="font-mono text-xs text-blue-600 dark:text-blue-400">{agPartNumber}</div>
        {name && <div className="text-xs text-muted-foreground">{name}</div>}
      </a>
    </Link>
  );
}

export default function InventoryLedgerPage() {
  const [partSearch, setPartSearch] = useState('');
  const [agPartNumber, setAgPartNumber] = useState('');
  const [location, setLocation] = useState<string>('all');
  const [departmentId, setDepartmentId] = useState<string>('all');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<LedgerRow | null>(null);

  const { data: locationsData } = useQuery<LocationsResponse>({
    queryKey: ['/api/inventory/ledger/locations'],
  });

  const queryString = useMemo(
    () =>
      buildQuery({
        partSearch,
        agPartNumber,
        location,
        departmentId,
        transactionType: selectedTypes.join(','),
        referenceNumber,
        createdBy,
        dateFrom,
        dateTo,
        page,
        limit: LIMIT,
      }),
    [
      partSearch,
      agPartNumber,
      location,
      departmentId,
      selectedTypes,
      referenceNumber,
      createdBy,
      dateFrom,
      dateTo,
      page,
    ],
  );

  const {
    data: ledger,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<LedgerResponse>({
    queryKey: ['/api/inventory/ledger', queryString],
    queryFn: () => apiRequest(`/api/inventory/ledger?${queryString}`),
  });

  const departments = useMemo(() => {
    const map = locationsData?.departments ?? {};
    const seen = new Map<number, string>();
    for (const meta of Object.values(map)) {
      if (!seen.has(meta.departmentId)) seen.set(meta.departmentId, meta.departmentName);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [locationsData]);

  const toggleType = (value: string) => {
    setPage(1);
    setSelectedTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );
  };

  const clearFilters = () => {
    setPartSearch('');
    setAgPartNumber('');
    setLocation('all');
    setDepartmentId('all');
    setSelectedTypes([]);
    setReferenceNumber('');
    setCreatedBy('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleExport = () => {
    const exportQuery = buildQuery({
      partSearch,
      agPartNumber,
      location,
      departmentId,
      transactionType: selectedTypes.join(','),
      referenceNumber,
      createdBy,
      dateFrom,
      dateTo,
    });
    window.location.href = `/api/inventory/ledger/export.csv?${exportQuery}`;
  };

  const total = ledger?.total ?? 0;
  const totalPages = ledger?.totalPages ?? 1;
  const rows = ledger?.data ?? [];
  const hasRunningBalance = ledger?.hasRunningBalance ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Unified, filterable view of every inventory movement across all parts and locations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/cutting-control-center">
            <Button variant="outline" size="sm" data-testid="link-cutting-audit">
              <Scissors className="h-4 w-4 mr-1" />
              Cutting Inventory Audit
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-ledger"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={total === 0}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="partSearch">Part (AG # or name)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="partSearch"
                  placeholder="Search parts..."
                  value={partSearch}
                  onChange={(e) => {
                    setPartSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                  data-testid="input-part-search"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="agPartNumber">Exact AG Part #</Label>
              <Input
                id="agPartNumber"
                placeholder="e.g. AG-123"
                value={agPartNumber}
                onChange={(e) => {
                  setAgPartNumber(e.target.value);
                  setPage(1);
                }}
                data-testid="input-ag-part-number"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Required to enable running balance
              </p>
            </div>
            <div>
              <Label>Location</Label>
              <Select
                value={location}
                onValueChange={(v) => {
                  setLocation(v);
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="select-location">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {(locationsData?.locations ?? []).map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Select
                value={departmentId}
                onValueChange={(v) => {
                  setDepartmentId(v);
                  setPage(1);
                }}
              >
                <SelectTrigger data-testid="select-department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="referenceNumber">Reference #</Label>
              <Input
                id="referenceNumber"
                placeholder="PO / WO / Order"
                value={referenceNumber}
                onChange={(e) => {
                  setReferenceNumber(e.target.value);
                  setPage(1);
                }}
                data-testid="input-reference"
              />
            </div>
            <div>
              <Label htmlFor="createdBy">Created By</Label>
              <Input
                id="createdBy"
                placeholder="Username"
                value={createdBy}
                onChange={(e) => {
                  setCreatedBy(e.target.value);
                  setPage(1);
                }}
                data-testid="input-created-by"
              />
            </div>
            <div>
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                data-testid="input-date-from"
              />
            </div>
            <div>
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                data-testid="input-date-to"
              />
            </div>
          </div>
          <div>
            <Label className="block mb-2">Transaction Types</Label>
            <div className="flex flex-wrap gap-2">
              {TRANSACTION_TYPES.map((t) => {
                const active = selectedTypes.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleType(t.value)}
                    className={`text-xs rounded-full border px-3 py-1 transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent'
                    }`}
                    data-testid={`toggle-type-${t.value}`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">
              Transactions
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({total.toLocaleString()} total)
              </span>
            </CardTitle>
            {hasRunningBalance && (
              <Badge variant="secondary" data-testid="badge-running-balance">
                Running balance enabled for {agPartNumber}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-destructive text-sm" data-testid="text-error-state">
              Failed to load inventory ledger. Please try again.
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm" data-testid="text-empty-state">
              No inventory transactions match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date / Time</TableHead>
                    <TableHead>Part</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    {hasRunningBalance && (
                      <TableHead className="text-right">Balance</TableHead>
                    )}
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => setSelectedRow(row)}
                      data-testid={`row-ledger-${row.id}`}
                    >
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDateTime(row.transactionDate)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {partLink(row.agPartNumber, row.partName)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {locationLink(row.location)}
                      </TableCell>
                      <TableCell>{typeBadge(row.transactionType)}</TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm ${
                          row.delta < 0 ? 'text-red-600' : row.delta > 0 ? 'text-green-700' : ''
                        }`}
                      >
                        {formatNumber(row.delta, 2)}
                      </TableCell>
                      {hasRunningBalance && (
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(row.runningBalance, 2)}
                        </TableCell>
                      )}
                      <TableCell className="text-right text-xs">
                        {row.costPerUnit ? `$${formatNumber(Number(row.costPerUnit), 2)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {row.totalCost ? `$${formatNumber(Number(row.totalCost), 2)}` : '—'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {referenceLink(row) ?? <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">{row.departmentName ?? '—'}</TableCell>
                      <TableCell className="text-xs">{row.performedBy}</TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate" title={row.notes ?? ''} data-testid={`text-notes-${row.id}`}>
                        {row.notes ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground" data-testid="text-pagination-info">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Sheet open={!!selectedRow} onOpenChange={(o) => !o && setSelectedRow(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Transaction Detail</SheetTitle>
            <SheetDescription>
              {selectedRow ? `Transaction #${selectedRow.id}` : ''}
            </SheetDescription>
          </SheetHeader>
          {selectedRow && (
            <div className="mt-6 space-y-4 text-sm" data-testid="drawer-transaction-detail">
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Date / Time" value={formatDateTime(selectedRow.transactionDate)} />
                <DetailField label="Type" value={
                  <span>{typeBadge(selectedRow.transactionType)}</span>
                } />
                <DetailField label="AG Part #" value={
                  <Link href={`/inventory/enhanced-mrp?part=${encodeURIComponent(selectedRow.agPartNumber)}`}>
                    <a className="text-blue-600 hover:underline font-mono" data-testid="link-detail-part">{selectedRow.agPartNumber}</a>
                  </Link>
                } />
                <DetailField label="Part Name" value={selectedRow.partName ?? '—'} />
                <DetailField label="Quantity (raw)" value={formatNumber(selectedRow.quantity, 2)} />
                <DetailField label="Signed Delta" value={formatNumber(selectedRow.delta, 2)} />
                <DetailField label="UOM" value={selectedRow.unitOfMeasure ?? '—'} />
                <DetailField label="Location" value={locationLink(selectedRow.location)} />
                <DetailField label="From Location" value={selectedRow.fromLocation ? locationLink(selectedRow.fromLocation) : '—'} />
                <DetailField label="To Location" value={selectedRow.toLocation ? locationLink(selectedRow.toLocation) : '—'} />
                <DetailField label="Department" value={selectedRow.departmentName ?? '—'} />
                <DetailField label="Created By" value={selectedRow.performedBy} />
                <DetailField label="Unit Cost" value={selectedRow.costPerUnit ? `$${formatNumber(Number(selectedRow.costPerUnit), 2)}` : '—'} />
                <DetailField label="Total Cost" value={selectedRow.totalCost ? `$${formatNumber(Number(selectedRow.totalCost), 2)}` : '—'} />
                <DetailField label="Ref Type" value={selectedRow.referenceType ?? '—'} />
                <DetailField label="Reference" value={referenceLink(selectedRow) ?? '—'} />
                {hasRunningBalance && (
                  <DetailField
                    label="Running Balance"
                    value={formatNumber(selectedRow.runningBalance, 2)}
                  />
                )}
              </div>
              {selectedRow.notes && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Notes
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap text-sm">
                    {selectedRow.notes}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 break-words">{value}</div>
    </div>
  );
}
