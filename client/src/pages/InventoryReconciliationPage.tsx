import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Search,
  AlertTriangle,
  CheckCircle,
  Loader2,
  PackageSearch,
  RefreshCw,
} from 'lucide-react';

interface ReconciliationRow {
  agPartNumber: string;
  materialName: string | null;
  lotQtyTotal: number;
  quantityOnHand: number;
  quantityAllocated: number;
  quantityAvailable: number;
  variance: number;
  lotCount: number;
  orphanedBalance: boolean;
  missingBalance: boolean;
  isMismatch: boolean;
}

function VarianceBadge({ row }: { row: ReconciliationRow }) {
  if (row.orphanedBalance) {
    return (
      <Badge variant="destructive" className="text-xs">
        Orphaned Balance
      </Badge>
    );
  }
  if (row.missingBalance) {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700 text-xs">
        No Balance Record
      </Badge>
    );
  }
  if (row.variance === 0) {
    return (
      <Badge variant="outline" className="border-green-500 text-green-700 text-xs">
        <CheckCircle className="h-3 w-3 mr-1" />
        Matched
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-xs">
      <AlertTriangle className="h-3 w-3 mr-1" />
      Mismatch
    </Badge>
  );
}

function formatQty(n: number) {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function InventoryReconciliationPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const { data = [], isLoading, isError, refetch, isFetching } = useQuery<ReconciliationRow[]>({
    queryKey: ['/api/inventory/reconciliation'],
    staleTime: 60 * 1000,
  });

  const filtered = data.filter((row) => {
    const matchesSearch =
      search === '' ||
      row.agPartNumber.toLowerCase().includes(search.toLowerCase()) ||
      (row.materialName ?? '').toLowerCase().includes(search.toLowerCase());

    const matchesMismatch = !mismatchOnly || row.isMismatch;

    return matchesSearch && matchesMismatch;
  });

  const mismatchCount = data.filter((r) => r.isMismatch).length;

  const handleRowClick = (row: ReconciliationRow) => {
    setLocation(`/material-inventory?partNumber=${encodeURIComponent(row.agPartNumber)}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Reconciliation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Compare summed lot quantities against inventory balance records to identify discrepancies.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Part Numbers</CardDescription>
            <CardTitle className="text-2xl">{isLoading ? '—' : data.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={mismatchCount > 0 ? 'border-red-300 bg-red-50' : ''}>
          <CardHeader className="pb-2">
            <CardDescription>Mismatches</CardDescription>
            <CardTitle className={`text-2xl ${mismatchCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {isLoading ? '—' : mismatchCount}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Matched</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {isLoading ? '—' : data.length - mismatchCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by part number or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="mismatch-only"
            checked={mismatchOnly}
            onCheckedChange={setMismatchOnly}
          />
          <Label htmlFor="mismatch-only" className="cursor-pointer select-none">
            Mismatches only
          </Label>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading reconciliation data…</span>
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center py-20 gap-3 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>Failed to load reconciliation data. Please try refreshing.</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <PackageSearch className="h-10 w-10 opacity-40" />
              <p className="text-sm">
                {data.length === 0
                  ? 'No material lots or inventory balance records found.'
                  : 'No results match your current filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Material Name</TableHead>
                    <TableHead className="text-right">Lot Qty Total</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Lots</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.agPartNumber}
                      className={`cursor-pointer transition-colors ${
                        row.isMismatch
                          ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/30'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleRowClick(row)}
                    >
                      <TableCell className="font-mono font-medium text-sm">
                        {row.agPartNumber}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {row.materialName ?? (
                          <span className="italic text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatQty(row.lotQtyTotal)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatQty(row.quantityOnHand)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatQty(row.quantityAllocated)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatQty(row.quantityAvailable)}
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm tabular-nums font-semibold ${
                          row.variance !== 0 ? 'text-red-600' : 'text-green-700'
                        }`}
                      >
                        {row.variance > 0 ? '+' : ''}
                        {formatQty(row.variance)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.lotCount}
                      </TableCell>
                      <TableCell>
                        <VarianceBadge row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Active lot statuses included: RECEIVED, ACCEPTED, ISSUED, QUARANTINE. Click any row to drill into
        lots for that part number. This view is read-only — no quantities are changed here.
      </p>
    </div>
  );
}
