import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Hammer,
  ShoppingCart,
  RefreshCw,
  Search,
  Flame,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface MaterialRow {
  ag_part_number: string;
  name: string;
  on_hand: number;
  allocated: number;
  available: number;
  required: number;
  shortage: number;
}

interface ReadinessData {
  max_buildable_units: number;
  materials: MaterialRow[];
  blocking_materials: MaterialRow[];
  meta: {
    sku: string | null;
    totalMaterials: number;
    blockingCount: number;
    generatedAt: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildUrl(sku: string) {
  const params = new URLSearchParams();
  if (sku.trim()) {
    params.set('sku', sku.trim());
    params.set('capacitySku', sku.trim());
  }
  return `/api/mrp/material-readiness${sku.trim() ? `?${params}` : ''}`;
}

/** The "limiting material" is the tracked material where available/required is lowest. */
function findLimitingPartNumber(materials: MaterialRow[]): string | null {
  const tracked = materials.filter((m) => m.required > 0);
  if (tracked.length === 0) return null;
  const limiting = tracked.reduce((min, m) => {
    const ratio = m.available / m.required;
    const minRatio = min.available / min.required;
    return ratio < minRatio ? m : min;
  });
  return limiting.ag_part_number;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MaterialReadinessDashboard() {
  const [, navigate] = useLocation();
  const [skuInput, setSkuInput] = useState('');
  const [activeSku, setActiveSku] = useState('');

  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<ReadinessData>({
      queryKey: ['/api/mrp/material-readiness', activeSku],
      queryFn: async () => {
        const res = await fetch(buildUrl(activeSku));
        if (!res.ok) throw new Error('Failed to fetch material readiness');
        return res.json();
      },
      staleTime: 60_000,
    });

  const limitingPart = data ? findLimitingPartNumber(data.materials) : null;

  const totalOk = data
    ? data.materials.filter((m) => m.shortage === 0).length
    : 0;
  const totalShort = data?.meta.blockingCount ?? 0;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setActiveSku(skuInput);
  }

  function handleClearSku() {
    setSkuInput('');
    setActiveSku('');
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b bg-card px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Material Readiness
              </h1>
              <p className="text-sm text-muted-foreground">
                Live material demand, inventory coverage, and build capacity
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => navigate('/p1-purchase-orders')}
              >
                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                Create PO
              </Button>
            </div>
          </div>

          {/* ── SKU filter ──────────────────────────────────────────────── */}
          <form
            onSubmit={handleSearch}
            className="mt-3 flex max-w-sm items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter by model SKU (e.g. 711)"
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Apply
            </Button>
            {activeSku && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleClearSku}
              >
                Clear
              </Button>
            )}
          </form>

          {activeSku && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Showing demand for SKU{' '}
              <span className="font-medium text-foreground">{activeSku}</span>
            </p>
          )}

          {data && (
            <p className="mt-1 text-xs text-muted-foreground">
              Generated {new Date(data.meta.generatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* ── Top Metrics ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Max Buildable Units */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Hammer className="h-4 w-4" />
                  Max Buildable Units
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                ) : (
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold">
                      {data?.max_buildable_units ?? 0}
                    </span>
                    {!activeSku && (
                      <span className="mb-1 text-xs text-muted-foreground">
                        (set SKU filter for per-model capacity)
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Materials OK */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Materials OK
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-8 w-12 animate-pulse rounded bg-muted" />
                ) : (
                  <span className="text-3xl font-bold text-green-600">
                    {totalOk}
                  </span>
                )}
              </CardContent>
            </Card>

            {/* Shortages */}
            <Card
              className={
                totalShort > 0 ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : ''
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle
                    className={`h-4 w-4 ${totalShort > 0 ? 'text-red-500' : ''}`}
                  />
                  Total Shortages
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-8 w-12 animate-pulse rounded bg-muted" />
                ) : (
                  <span
                    className={`text-3xl font-bold ${
                      totalShort > 0 ? 'text-red-600' : 'text-foreground'
                    }`}
                  >
                    {totalShort}
                  </span>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Material Table ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4" />
                  Material Coverage
                  {data && (
                    <Badge variant="outline" className="ml-1 text-xs">
                      {data.meta.totalMaterials} materials
                    </Badge>
                  )}
                </CardTitle>

                {totalShort > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {totalShort} shortage{totalShort !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading && (
                <div className="flex flex-col gap-2 p-6">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="h-10 animate-pulse rounded bg-muted"
                    />
                  ))}
                </div>
              )}

              {isError && (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 text-red-400" />
                  <p className="font-medium">Failed to load material data</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                  >
                    Try again
                  </Button>
                </div>
              )}

              {!isLoading && !isError && data?.materials.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                  <Package className="h-8 w-8 opacity-40" />
                  <p className="font-medium">No material demand found</p>
                  <p className="text-sm">
                    {activeSku
                      ? `No open orders with a BOM linked to SKU "${activeSku}".`
                      : 'No open orders have a matching BOM definition.'}
                  </p>
                  <p className="text-xs max-w-xs">
                    Material data populates once{' '}
                    <code className="rounded bg-muted px-1 py-0.5">
                      bom_definitions.sku
                    </code>{' '}
                    values are aligned with order model IDs.
                  </p>
                </div>
              )}

              {!isLoading && !isError && data && data.materials.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[260px]">Material</TableHead>
                      <TableHead className="text-right">On Hand</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Required</TableHead>
                      <TableHead className="text-right">Shortage</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.materials.map((mat) => {
                      const isShort = mat.shortage > 0;
                      const isLimiting = mat.ag_part_number === limitingPart;

                      return (
                        <TableRow
                          key={mat.ag_part_number}
                          className={
                            isShort
                              ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/30'
                              : ''
                          }
                        >
                          {/* Material name + part number */}
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {isLimiting && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Flame className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Limiting material — lowest build capacity
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <div>
                                <p className="font-medium leading-none">
                                  {mat.name !== mat.ag_part_number
                                    ? mat.name
                                    : mat.ag_part_number}
                                </p>
                                {mat.name !== mat.ag_part_number && (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {mat.ag_part_number}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* On Hand */}
                          <TableCell className="text-right tabular-nums">
                            {mat.on_hand}
                          </TableCell>

                          {/* Allocated */}
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {mat.allocated > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {mat.allocated}
                              </span>
                            ) : (
                              mat.allocated
                            )}
                          </TableCell>

                          {/* Available */}
                          <TableCell className="text-right tabular-nums">
                            <span
                              className={
                                mat.available < mat.required
                                  ? 'font-semibold text-red-600 dark:text-red-400'
                                  : 'text-green-700 dark:text-green-400'
                              }
                            >
                              {mat.available}
                            </span>
                          </TableCell>

                          {/* Required */}
                          <TableCell className="text-right tabular-nums font-medium">
                            {mat.required}
                          </TableCell>

                          {/* Shortage */}
                          <TableCell className="text-right tabular-nums">
                            {isShort ? (
                              <span className="font-bold text-red-600 dark:text-red-400">
                                −{mat.shortage}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Action */}
                          <TableCell>
                            {isShort && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() =>
                                      navigate('/p1-purchase-orders')
                                    }
                                  >
                                    <ShoppingCart className="h-3 w-3 mr-1" />
                                    PO
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Create purchase order for {mat.ag_part_number}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* ── Blocking Materials Summary ──────────────────────────────────── */}
          {data && data.blocking_materials.length > 0 && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Blocking Materials ({data.blocking_materials.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.blocking_materials.map((mat) => (
                    <Badge
                      key={mat.ag_part_number}
                      variant="destructive"
                      className="gap-1 py-1"
                    >
                      <span className="font-normal">
                        {mat.name !== mat.ag_part_number
                          ? mat.name
                          : mat.ag_part_number}
                      </span>
                      <span className="opacity-80">
                        short {mat.shortage}
                      </span>
                    </Badge>
                  ))}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  These materials are preventing production from proceeding.{' '}
                  <button
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => navigate('/p1-purchase-orders')}
                  >
                    Create a purchase order
                  </button>{' '}
                  to resolve shortages.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
