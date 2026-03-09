import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  CheckCircle2,
  Factory,
  ShoppingCart,
  TrendingDown,
  Gauge,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BuildCapacity {
  ordersQueued: number;
  ordersBuildable: number;
  limitingMaterial: string | null;
  limitingMaterialName: string | null;
}

interface BlockingMaterial {
  agPartNumber: string;
  name: string;
  required: number;
  onHand: number;
  allocated: number;
  available: number;
  shortage: number;
}

interface PurchasingRadarRow {
  agPartNumber: string;
  name: string;
  daysRemaining: number;
  averageDailyDemand: number;
  quantityAvailable: number;
  totalRequired: number;
  recommendedOrderQuantity: number;
}

interface InventoryPressureRow {
  agPartNumber: string;
  name: string;
  onHand: number;
  allocated: number;
  available: number;
  pressureLevel: 'green' | 'yellow' | 'red';
}

interface DashboardData {
  buildCapacity: BuildCapacity;
  blockingMaterials: BlockingMaterial[];
  purchasingRadar: PurchasingRadarRow[];
  inventoryPressure: InventoryPressureRow[];
  meta: {
    totalMaterials: number;
    blockingCount: number;
    generatedAt: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function PressureBadge({ level }: { level: 'green' | 'yellow' | 'red' }) {
  if (level === 'red')
    return (
      <Badge variant="destructive" className="text-xs">
        Shortage
      </Badge>
    );
  if (level === 'yellow')
    return (
      <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-700 dark:text-yellow-400">
        Low Stock
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs border-green-500 text-green-700 dark:text-green-400">
      OK
    </Badge>
  );
}

function SkeletonPanel() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MaterialIntelligenceDashboard() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery<DashboardData>({
    queryKey: ['/api/material-intelligence/dashboard'],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Material Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Read-only production readiness dashboard
            {lastUpdated && (
              <span className="ml-2 text-xs opacity-60">· updated {lastUpdated}</span>
            )}
          </p>
        </div>
        {data && (
          <div className="text-right text-xs text-muted-foreground">
            <div>{data.meta.totalMaterials} materials tracked</div>
            <div className={data.meta.blockingCount > 0 ? 'text-red-500 font-medium' : 'text-green-600'}>
              {data.meta.blockingCount === 0
                ? 'No blocking materials'
                : `${data.meta.blockingCount} blocking production`}
            </div>
          </div>
        )}
      </div>

      {isError && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex gap-2 items-center text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="text-sm">
              Failed to load dashboard:{' '}
              {error instanceof Error ? error.message : 'Unknown error'}
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── Section 1: Build Capacity ─────────────────────────────────────────── */}
      {isLoading ? (
        <SkeletonPanel />
      ) : data ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Factory className="h-4 w-4" />
              Build Capacity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold">
                  {fmt(data.buildCapacity.ordersQueued)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Orders in Queue</div>
              </div>
              <div className="text-center">
                <div
                  className={`text-3xl font-bold ${
                    data.buildCapacity.ordersBuildable < data.buildCapacity.ordersQueued
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {fmt(data.buildCapacity.ordersBuildable)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Buildable With Current Inventory
                </div>
              </div>
              <div className="text-center">
                {data.buildCapacity.limitingMaterial ? (
                  <>
                    <div className="text-sm font-semibold text-red-600 dark:text-red-400 truncate max-w-[16rem] mx-auto">
                      {data.buildCapacity.limitingMaterialName ??
                        data.buildCapacity.limitingMaterial}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {data.buildCapacity.limitingMaterial}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">Limiting Material</div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                    <div className="text-sm text-muted-foreground">No Limiting Material</div>
                  </div>
                )}
              </div>
            </div>

            {data.buildCapacity.ordersQueued > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Production readiness</span>
                  <span>
                    {Math.round(
                      (data.buildCapacity.ordersBuildable /
                        data.buildCapacity.ordersQueued) *
                        100
                    )}
                    %
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      data.buildCapacity.ordersBuildable ===
                      data.buildCapacity.ordersQueued
                        ? 'bg-green-500'
                        : data.buildCapacity.ordersBuildable /
                            data.buildCapacity.ordersQueued >
                          0.7
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{
                      width: `${Math.round(
                        (data.buildCapacity.ordersBuildable /
                          data.buildCapacity.ordersQueued) *
                          100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Section 2: Blocking Materials ──────────────────────────────────────── */}
      {isLoading ? (
        <SkeletonPanel />
      ) : data ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Blocking Materials
              {data.blockingMaterials.length > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {data.blockingMaterials.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.blockingMaterials.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 py-4">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">All materials are sufficiently stocked for current orders.</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Required</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Shortage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.blockingMaterials.map((m) => (
                    <TableRow
                      key={m.agPartNumber}
                      className="bg-red-50 dark:bg-red-950/20"
                    >
                      <TableCell>
                        <div className="font-medium text-sm">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.agPartNumber}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmt(m.required, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmt(m.onHand, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmt(m.allocated, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmt(m.available, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-red-600 dark:text-red-400">
                        {fmt(m.shortage, 2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Section 3: Purchasing Radar ───────────────────────────────────────── */}
      {isLoading ? (
        <SkeletonPanel />
      ) : data ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" />
              Purchasing Radar
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.purchasingRadar.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No active material demand found. Purchasing radar is empty.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Days Remaining</TableHead>
                    <TableHead className="text-right">Avg Demand / Order</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Total Required</TableHead>
                    <TableHead className="text-right">Recommended Order Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.purchasingRadar.map((r) => {
                    const urgent = r.daysRemaining < 5;
                    const warning = r.daysRemaining < 15 && !urgent;
                    return (
                      <TableRow
                        key={r.agPartNumber}
                        className={
                          urgent
                            ? 'bg-red-50 dark:bg-red-950/20'
                            : warning
                            ? 'bg-yellow-50 dark:bg-yellow-950/10'
                            : ''
                        }
                      >
                        <TableCell>
                          <div className="font-medium text-sm">{r.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.agPartNumber}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`font-mono text-sm font-semibold ${
                              urgent
                                ? 'text-red-600 dark:text-red-400'
                                : warning
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-green-600 dark:text-green-400'
                            }`}
                          >
                            {r.daysRemaining >= 9999 ? '∞' : fmt(r.daysRemaining, 1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(r.averageDailyDemand, 2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(r.quantityAvailable, 2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(r.totalRequired, 2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.recommendedOrderQuantity > 0 ? (
                            <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">
                              {fmt(r.recommendedOrderQuantity, 2)}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
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
      ) : null}

      {/* ── Section 4: Inventory Pressure ─────────────────────────────────────── */}
      {isLoading ? (
        <SkeletonPanel />
      ) : data ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4" />
              Inventory Pressure
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.inventoryPressure.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No inventory pressure data available.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.inventoryPressure.map((p) => (
                    <TableRow key={p.agPartNumber}>
                      <TableCell>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.agPartNumber}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmt(p.onHand, 2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmt(p.allocated, 2)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm font-semibold ${
                          p.pressureLevel === 'red'
                            ? 'text-red-600 dark:text-red-400'
                            : p.pressureLevel === 'yellow'
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {fmt(p.available, 2)}
                      </TableCell>
                      <TableCell>
                        <PressureBadge level={p.pressureLevel} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
