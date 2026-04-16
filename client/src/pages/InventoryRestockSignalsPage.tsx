import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  Package,
  Search,
  TrendingDown,
  ShoppingCart,
  ExternalLink,
} from 'lucide-react';

interface RestockSignalRow {
  agPartNumber: string;
  materialName: string;
  quantityOnHand: number;
  quantityAllocated: number;
  quantityAvailable: number;
  reorderPoint: number;
  restockGap: number;
  signalStatus: 'critical' | 'low' | 'healthy';
}

interface RestockSignalsResponse {
  rows: RestockSignalRow[];
}

function StatusBadge({ status }: { status: RestockSignalRow['signalStatus'] }) {
  if (status === 'critical') {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Critical
      </Badge>
    );
  }
  if (status === 'low') {
    return (
      <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
        <TrendingDown className="h-3 w-3" />
        Low Stock
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Package className="h-3 w-3" />
      Healthy
    </Badge>
  );
}

export default function InventoryRestockSignalsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'critical' | 'low'>('all');

  const { data, isLoading } = useQuery<RestockSignalsResponse>({
    queryKey: ['/api/inventory/restock-signals'],
  });

  const rows = data?.rows ?? [];

  const criticalCount = useMemo(() => rows.filter((r) => r.signalStatus === 'critical').length, [rows]);
  const lowCount = useMemo(() => rows.filter((r) => r.signalStatus === 'low' || r.signalStatus === 'critical').length, [rows]);
  const totalRestockGap = useMemo(() => rows.reduce((sum, r) => sum + r.restockGap, 0), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.agPartNumber.toLowerCase().includes(q) && !r.materialName.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter === 'critical' && r.signalStatus !== 'critical') return false;
      if (statusFilter === 'low' && r.signalStatus !== 'low' && r.signalStatus !== 'critical') return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Inventory Restock Signals</h1>
        <p className="text-muted-foreground mt-1">
          Materials approaching or below their reorder point — read-only purchasing view.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Critical</p>
              {isLoading ? (
                <Skeleton className="h-8 w-12 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-destructive">{criticalCount}</p>
              )}
            </div>
            <AlertTriangle className="h-8 w-8 text-destructive opacity-70" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Below Reorder</p>
              {isLoading ? (
                <Skeleton className="h-8 w-12 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-amber-600">{lowCount}</p>
              )}
            </div>
            <TrendingDown className="h-8 w-8 text-amber-500 opacity-70" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Restock Gap</p>
              {isLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{totalRestockGap.toLocaleString()}</p>
              )}
            </div>
            <ShoppingCart className="h-8 w-8 text-muted-foreground opacity-70" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Tracked</p>
              {isLoading ? (
                <Skeleton className="h-8 w-12 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{rows.length}</p>
              )}
            </div>
            <Package className="h-8 w-8 text-blue-500 opacity-70" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>Search by part number or material name, or filter by stock status.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search part number or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="low">Low Stock & Critical</SelectItem>
                <SelectItem value="critical">Critical Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Restock Signal List</CardTitle>
          <CardDescription>
            {filtered.length} material{filtered.length !== 1 ? 's' : ''} shown
            {rows.length !== filtered.length ? ` (${rows.length} total tracked)` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No materials match your filters</p>
              <p className="text-sm mt-1">
                {rows.length === 0
                  ? 'No materials have a reorder point configured yet.'
                  : 'Try adjusting your search or status filter.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Material Name</TableHead>
                  <TableHead className="text-right">On Hand</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Reorder Point</TableHead>
                  <TableHead className="text-right">Restock Gap</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.agPartNumber}
                    className={
                      row.signalStatus === 'critical'
                        ? 'bg-red-50 dark:bg-red-950/20'
                        : row.signalStatus === 'low'
                        ? 'bg-amber-50 dark:bg-amber-950/20'
                        : undefined
                    }
                  >
                    <TableCell className="font-mono font-medium">{row.agPartNumber}</TableCell>
                    <TableCell>{row.materialName}</TableCell>
                    <TableCell className="text-right font-mono">{row.quantityOnHand.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-orange-600">
                      {row.quantityAllocated.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-semibold ${
                        row.signalStatus === 'critical'
                          ? 'text-destructive'
                          : row.signalStatus === 'low'
                          ? 'text-amber-700'
                          : 'text-green-700'
                      }`}
                    >
                      {row.quantityAvailable.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">{row.reorderPoint.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {row.restockGap > 0 ? (
                        <span className={row.signalStatus === 'critical' ? 'text-destructive' : 'text-amber-700'}>
                          +{row.restockGap.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={row.signalStatus} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/material-inventory?partNumber=${encodeURIComponent(row.agPartNumber)}`}>
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View Inventory
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
