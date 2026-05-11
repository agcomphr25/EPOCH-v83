import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Switch,
} from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  CheckCircle, Clock, AlertCircle, Package, TrendingUp, Calendar,
  Briefcase, Users, ShieldCheck, ShieldAlert, ShieldOff, HelpCircle,
  ChevronUp, ChevronDown, ArrowUpDown, LayoutDashboard, XCircle, Filter,
} from 'lucide-react';
import { format, differenceInDays, differenceInBusinessDays, parseISO } from 'date-fns';

async function safeFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
      else if (body.message) message = body.message;
    } catch {}
    throw new Error(`${res.status}: ${message}`);
  }
  return res.json();
}

function QueryErrorBanner({ message }: { message?: string }) {
  return (
    <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
      <CardContent className="p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-500 mb-2" />
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          {message ?? 'Failed to load data. Please try again later.'}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
  status: string;
  targetShipDate: string | null;
  projectManagerId: number | null;
  projectManagerName: string | null;
  poId: number | null;
  poNumber: string | null;
  p2StepStatus?: string;
  preprodStepStatus?: string;
  purchaseStepStatus?: string;
  quoteStepStatus?: string;
  rfqStepStatus?: string;
}

function deriveStageLabel(p: ProjectOption): string {
  if (p.status === 'completed') return 'Closed';
  if (p.preprodStepStatus === 'completed') return 'Production';
  if (p.p2StepStatus === 'completed') return 'Pre-Production';
  if (p.p2StepStatus === 'in_progress') return 'WAD';
  if (p.poId || p.purchaseStepStatus === 'completed') return 'PO Received';
  if (p.quoteStepStatus === 'completed') return 'Project Start';
  if (p.rfqStepStatus === 'completed') return 'Quote';
  return 'RFQ';
}

interface Summary {
  projectId: string;
  projectName: string;
  assignedPm: string | null;
  targetShipDate: string | null;
  totalWorkOrders: number;
  completedWorkOrders: number;
  productionPercent: number;
  openTravelerCount: number;
  blockedCount: number;
  budgetedLaborHours: number;
  actualLaborHours: number;
  laborRemainingHours: number;
  plannedMaterialCost: number;
  committedMaterialCost: number;
  consumedMaterialCost: number;
  remainingMaterialBudget: number;
}

interface WorkOrderRow {
  productionWorkOrderId: string;
  workOrderNumber: string;
  partNumber: string;
  quantityRequired: number;
  quantityCompleted: number;
  quantityCompletedToday: number;
  status: string;
  dueDate: string | null;
  currentDepartment: string | null;
  currentTravelerStep: string | null;
  activeTravelerId: string | null;
  activeTravelerNumber: string | null;
  daysScheduleVariance: number | null;
  blockReason: string | null;
}

interface WorkOrderDetail {
  workOrder: {
    productionWorkOrderId: string;
    workOrderNumber: string;
    partNumber: string;
    description: string | null;
    quantityRequired: number;
    status: string;
    dueDate: string | null;
    startDate: string | null;
    totalBudgetHours: string | null;
    departmentBudgets: Record<string, number> | null;
  };
  travelers: {
    id: string;
    travelerNumber: string;
    status: string;
    partNumber: string;
    quantity: number;
    createdAt: string;
  }[];
  openSessions: {
    sessionId: number;
    operatorName: string;
    chargeCode: string | null;
    startedAt: string;
    elapsedMinutes: number;
  }[];
}

interface LaborSummary {
  budgetedHours: number;
  actualHours: number;
  remainingHours: number;
  percentConsumed: number;
  openSessionCount: number;
}

interface ChargeCodeRow {
  chargeCodeId: number;
  chargeCode: string;
  department: string | null;
  taskName: string | null;
  budgetedHours: number;
  actualHours: number;
  remainingHours: number;
  percentConsumed: number;
  isOverrun: boolean;
  isNearLimit: boolean;
}

interface LiveSession {
  sessionId: number;
  employeeId: number;
  employeeName: string;
  travelerId: string | null;
  travelerNumber: string | null;
  department: string | null;
  chargeCode: string | null;
  startedAt: string;
  elapsedMinutes: number;
  certificationStatus: 'Valid' | 'Missing' | 'Expired' | 'Unknown';
}

interface LaborData {
  summary: LaborSummary;
  chargeCodeRows: ChargeCodeRow[];
  liveFeed: LiveSession[];
}

interface MaterialSummary {
  plannedCost: number;
  committedCost: number;
  consumedCost: number;
  remainingCost: number;
}

interface MaterialRow {
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  lotNumber: string | null;
  internalControlNumber: string | null;
  qtyRequired: number;
  qtyAllocated: number;
  qtyIssued: number;
  unitCost: number;
  committedCost: number;
  consumedCost: number;
  status: string;
}

interface MaterialData {
  summary: MaterialSummary;
  rows: MaterialRow[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
}

function fmtHours(h: number) {
  return h.toFixed(1) + ' hrs';
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

function daysVarianceBadge(variance: number | null) {
  if (variance === null) return <span className="text-muted-foreground">—</span>;
  if (variance === 0) return <Badge className="bg-blue-100 text-blue-800">Due Today</Badge>;
  if (variance > 0) return <Badge className="bg-red-100 text-red-800">{variance}d Behind</Badge>;
  return <Badge className="bg-green-100 text-green-800">{Math.abs(variance)}d Ahead</Badge>;
}

const WO_STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-700',
  READY: 'bg-blue-100 text-blue-700',
  RELEASED: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETE: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-200 text-gray-500',
  BLOCKED: 'bg-red-100 text-red-700',
};

const MATERIAL_STATUS_COLORS: Record<string, string> = {
  OVER_ISSUED: 'bg-red-100 text-red-700',
  SHORT: 'bg-red-100 text-red-700',
  ON_HOLD: 'bg-orange-100 text-orange-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700',
  ALLOCATED: 'bg-blue-100 text-blue-700',
  FULLY_ALLOCATED: 'bg-green-100 text-green-700',
  FULLY_ISSUED: 'bg-green-100 text-green-700',
};

const MATERIAL_STATUS_ORDER: Record<string, number> = {
  OVER_ISSUED: 0,
  SHORT: 1,
  ON_HOLD: 2,
  PARTIAL: 3,
  ALLOCATED: 4,
  FULLY_ALLOCATED: 5,
  FULLY_ISSUED: 6,
};

function CertBadge({ status }: { status: string }) {
  if (status === 'Valid') return (
    <Badge className="bg-green-100 text-green-700 flex items-center gap-1 w-fit">
      <ShieldCheck className="h-3 w-3" /> Valid
    </Badge>
  );
  if (status === 'Expired') return (
    <Badge className="bg-red-100 text-red-700 flex items-center gap-1 w-fit">
      <ShieldAlert className="h-3 w-3" /> Expired
    </Badge>
  );
  if (status === 'Missing') return (
    <Badge className="bg-orange-100 text-orange-700 flex items-center gap-1 w-fit">
      <ShieldOff className="h-3 w-3" /> Missing
    </Badge>
  );
  return (
    <Badge className="bg-gray-100 text-gray-600 flex items-center gap-1 w-fit">
      <HelpCircle className="h-3 w-3" /> Unknown
    </Badge>
  );
}

function KpiCard({
  icon, label, value, sub, colorClass, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  colorClass?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={onClick ? 'cursor-pointer hover:shadow-md transition-shadow focus-visible:ring-2 focus-visible:ring-ring outline-none' : ''}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={colorClass}>{icon}</span>
          <span className="text-sm text-muted-foreground">{label}</span>
          {onClick && <span className="ml-auto text-xs text-muted-foreground opacity-60">click to drill in</span>}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ── Production Tab ────────────────────────────────────────────────────────────

type CompletionFilter = 'all' | 'not_started' | 'in_progress' | 'complete';
type QtySort = null | 'asc' | 'desc';

function completionPct(row: WorkOrderRow): number {
  if (!row.quantityRequired || row.quantityRequired === 0) return 0;
  return row.quantityCompleted / row.quantityRequired;
}

function completionState(row: WorkOrderRow): CompletionFilter {
  const pct = completionPct(row);
  if (pct <= 0) return 'not_started';
  if (pct >= 1) return 'complete';
  return 'in_progress';
}

function ProductionTab({ projectId }: { projectId: string }) {
  const [, navTo] = useLocation();
  const [selectedWO, setSelectedWO] = useState<WorkOrderRow | null>(null);
  const [showBlockersOnly, setShowBlockersOnly] = useState(false);
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('all');
  const [qtySort, setQtySort] = useState<QtySort>(null);

  const { data: rows = [], isLoading, isError } = useQuery<WorkOrderRow[]>({
    queryKey: ['/api/pm-dashboard', projectId, 'production'],
    queryFn: () => safeFetch<WorkOrderRow[]>(`/api/pm-dashboard/${projectId}/production`),
    enabled: !!projectId,
  });

  const { data: detail, isLoading: detailLoading } = useQuery<WorkOrderDetail>({
    queryKey: ['/api/pm-dashboard', projectId, 'production', selectedWO?.productionWorkOrderId],
    queryFn: () => safeFetch<WorkOrderDetail>(`/api/pm-dashboard/${projectId}/production/${selectedWO!.productionWorkOrderId}`),
    enabled: !!selectedWO,
  });

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  if (isError) {
    return <QueryErrorBanner message="Failed to load production data." />;
  }

  if (!rows.length) {
    return (
      <Card className="p-10 text-center">
        <Briefcase className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No work orders found for this project.</p>
      </Card>
    );
  }

  const blockedCount = rows.filter(r => r.status === 'BLOCKED').length;
  const notStartedCount = rows.filter(r => completionState(r) === 'not_started').length;
  const inProgressCount = rows.filter(r => completionState(r) === 'in_progress').length;
  const completeCount = rows.filter(r => completionState(r) === 'complete').length;

  let displayRows = showBlockersOnly ? rows.filter(r => r.status === 'BLOCKED') : rows;
  if (completionFilter !== 'all') {
    displayRows = displayRows.filter(r => completionState(r) === completionFilter);
  }
  if (qtySort !== null) {
    displayRows = [...displayRows].sort((a, b) => {
      const diff = completionPct(a) - completionPct(b);
      return qtySort === 'asc' ? diff : -diff;
    });
  }

  function toggleQtySort() {
    setQtySort(prev => prev === null ? 'asc' : prev === 'asc' ? 'desc' : null);
  }

  function toggleCompletionFilter(f: CompletionFilter) {
    setCompletionFilter(prev => prev === f ? 'all' : f);
  }

  const chipBase = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors';
  const chipOff = 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent';

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => setShowBlockersOnly(v => !v)}
          className={`${chipBase} ${
            showBlockersOnly
              ? 'bg-red-100 border-red-300 text-red-800 dark:bg-red-950/40 dark:border-red-700 dark:text-red-300'
              : chipOff
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Blockers
          {blockedCount > 0 && (
            <Badge className={showBlockersOnly ? 'bg-red-200 text-red-800 ml-1' : 'bg-red-100 text-red-700 ml-1'}>
              {blockedCount}
            </Badge>
          )}
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={() => toggleCompletionFilter('not_started')}
          className={`${chipBase} ${
            completionFilter === 'not_started'
              ? 'bg-gray-200 border-gray-400 text-gray-800 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-100'
              : chipOff
          }`}
        >
          Not Started
          <Badge className="ml-1 bg-gray-100 text-gray-600">{notStartedCount}</Badge>
        </button>

        <button
          onClick={() => toggleCompletionFilter('in_progress')}
          className={`${chipBase} ${
            completionFilter === 'in_progress'
              ? 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/40 dark:border-yellow-600 dark:text-yellow-200'
              : chipOff
          }`}
        >
          In Progress
          <Badge className="ml-1 bg-yellow-100 text-yellow-700">{inProgressCount}</Badge>
        </button>

        <button
          onClick={() => toggleCompletionFilter('complete')}
          className={`${chipBase} ${
            completionFilter === 'complete'
              ? 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/40 dark:border-green-600 dark:text-green-200'
              : chipOff
          }`}
        >
          Complete
          <Badge className="ml-1 bg-green-100 text-green-700">{completeCount}</Badge>
        </button>

        {(showBlockersOnly || completionFilter !== 'all') && (
          <span className="text-xs text-muted-foreground ml-2">
            Showing {displayRows.length} of {rows.length} work orders
          </span>
        )}
      </div>

      {displayRows.length === 0 && (
        <Card className="p-10 text-center">
          <CheckCircle className="mx-auto h-10 w-10 text-green-500 mb-3" />
          <p className="text-muted-foreground">No work orders match the selected filters.</p>
        </Card>
      )}

      {displayRows.length > 0 && (
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>WO #</TableHead>
              <TableHead>Part</TableHead>
              <TableHead
                className="text-right cursor-pointer select-none hover:text-foreground"
                onClick={toggleQtySort}
              >
                <span className="inline-flex items-center gap-1 justify-end">
                  Qty (Progress)
                  {qtySort === null && <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                  {qtySort === 'asc' && <ChevronUp className="h-3.5 w-3.5" />}
                  {qtySort === 'desc' && <ChevronDown className="h-3.5 w-3.5" />}
                </span>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Current Step</TableHead>
              <TableHead>Active Traveler</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Block Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.map((row) => {
              const pct = completionPct(row);
              const pctDisplay = row.quantityRequired > 0 ? Math.round(pct * 100) : null;
              return (
              <TableRow
                key={row.productionWorkOrderId}
                className={`cursor-pointer hover:bg-accent/50 ${row.status === 'BLOCKED' ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
                onClick={() => navTo(`/production-work-orders/${row.productionWorkOrderId}`)}
              >
                <TableCell className="font-mono text-sm font-medium">{row.workOrderNumber}</TableCell>
                <TableCell className="text-sm">{row.partNumber}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  <div className="flex flex-col items-end gap-1">
                    <span>
                      <span className={pct >= 1 && row.quantityRequired > 0 ? 'text-green-600 font-medium' : ''}>
                        {row.quantityCompleted}
                      </span>
                      {' / '}
                      {row.quantityRequired} units
                    </span>
                    {pctDisplay !== null && (
                      <div className="w-24 flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 1 ? 'bg-green-500' : pct > 0 ? 'bg-yellow-400' : 'bg-gray-300'}`}
                            style={{ width: `${Math.min(100, pctDisplay)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{pctDisplay}%</span>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={WO_STATUS_COLORS[row.status] ?? 'bg-gray-100 text-gray-700'}>
                    {row.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{row.currentDepartment ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm">{row.currentTravelerStep ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                  {row.activeTravelerNumber && row.activeTravelerId ? (
                    <Link
                      to={`/travelers/${row.activeTravelerId}`}
                      className="font-mono text-blue-600 hover:underline"
                    >
                      {row.activeTravelerNumber}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{fmtDate(row.dueDate)}</TableCell>
                <TableCell>{daysVarianceBadge(row.daysScheduleVariance)}</TableCell>
                <TableCell className="text-sm max-w-[180px]">
                  {row.status === 'BLOCKED' ? (
                    row.blockReason ? (
                      <span className="text-red-700 dark:text-red-400 text-xs line-clamp-2" title={row.blockReason}>
                        {row.blockReason}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">No reason recorded</span>
                    )
                  ) : null}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      )}

      <Sheet open={!!selectedWO} onOpenChange={(open) => !open && setSelectedWO(null)}>
        <SheetContent className="w-[420px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              {selectedWO?.workOrderNumber}
              <Badge className={WO_STATUS_COLORS[selectedWO?.status ?? ''] ?? 'bg-gray-100 text-gray-700'}>
                {selectedWO?.status?.replace('_', ' ')}
              </Badge>
            </SheetTitle>
          </SheetHeader>

          {detailLoading && <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}

          {detail && !detailLoading && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Part Number</span>
                <span className="font-medium">{detail.workOrder.partNumber}</span>
                <span className="text-muted-foreground">Quantity</span>
                <span>{detail.workOrder.quantityRequired}</span>
                <span className="text-muted-foreground">Start Date</span>
                <span>{fmtDate(detail.workOrder.startDate)}</span>
                <span className="text-muted-foreground">Due Date</span>
                <span>{fmtDate(detail.workOrder.dueDate)}</span>
                <span className="text-muted-foreground">Budget Hours</span>
                <span>{detail.workOrder.totalBudgetHours ? fmtHours(parseFloat(detail.workOrder.totalBudgetHours)) : '—'}</span>
              </div>

              {detail.workOrder.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm bg-muted rounded p-2">{detail.workOrder.description}</p>
                </div>
              )}

              {detail.travelers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active Travelers</p>
                  <div className="space-y-2">
                    {detail.travelers.map(t => (
                      <div key={t.id} className="flex items-center justify-between text-sm bg-muted rounded p-2">
                        <span className="font-mono font-medium">{t.travelerNumber}</span>
                        <Badge className={WO_STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}>
                          {t.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.openSessions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Live Sessions ({detail.openSessions.length})
                  </p>
                  <div className="space-y-2">
                    {detail.openSessions.map(s => (
                      <div key={s.sessionId} className="text-sm border rounded p-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{s.operatorName}</span>
                          <span className="text-muted-foreground text-xs flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.floor(s.elapsedMinutes / 60)}h {s.elapsedMinutes % 60}m
                          </span>
                        </div>
                        {s.chargeCode && <span className="text-xs text-muted-foreground">{s.chargeCode}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.workOrder.departmentBudgets && Object.keys(detail.workOrder.departmentBudgets).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Department Budgets</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(detail.workOrder.departmentBudgets).map(([dept, hours]) => (
                      <div key={dept} className="text-sm bg-muted rounded p-2">
                        <div className="text-xs text-muted-foreground uppercase">{dept}</div>
                        <div className="font-semibold">{Number(hours).toFixed(1)} hrs</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Direct Labor Tab ──────────────────────────────────────────────────────────

function DirectLaborTab({ projectId }: { projectId: string }) {
  const { data, isLoading, isError } = useQuery<LaborData>({
    queryKey: ['/api/pm-dashboard', projectId, 'labor'],
    queryFn: () => safeFetch<LaborData>(`/api/pm-dashboard/${projectId}/labor`),
    enabled: !!projectId,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  if (isError) {
    return <QueryErrorBanner message="Failed to load labor data." />;
  }

  if (!data) return null;

  const { summary, chargeCodeRows, liveFeed } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Budgeted Hours"
          value={fmtHours(summary.budgetedHours)}
          colorClass="text-blue-600"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Actual Hours"
          value={fmtHours(summary.actualHours)}
          colorClass="text-purple-600"
        />
        <KpiCard
          icon={<CheckCircle className="h-4 w-4" />}
          label="Remaining"
          value={fmtHours(Math.max(0, summary.remainingHours))}
          colorClass={summary.remainingHours < 0 ? 'text-red-600' : 'text-green-600'}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="% Consumed"
          value={`${summary.percentConsumed}%`}
          sub={`${summary.openSessionCount} open session${summary.openSessionCount !== 1 ? 's' : ''}`}
          colorClass={summary.percentConsumed >= 100 ? 'text-red-600' : summary.percentConsumed >= 80 ? 'text-yellow-600' : 'text-blue-600'}
        />
      </div>

      {chargeCodeRows.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Charge Code Budget vs. Actual</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Charge Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead className="text-right">Budgeted</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="min-w-[100px]">Labor Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chargeCodeRows.map((row) => (
                  <TableRow
                    key={row.chargeCodeId}
                    className={
                      row.isOverrun
                        ? 'bg-red-50 dark:bg-red-950/20'
                        : row.isNearLimit
                          ? 'bg-yellow-50 dark:bg-yellow-950/20'
                          : ''
                    }
                  >
                    <TableCell className="font-mono text-sm font-medium">{row.chargeCode}</TableCell>
                    <TableCell className="text-sm">{row.department ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{row.taskName ?? '—'}</TableCell>
                    <TableCell className="text-right text-sm">{fmtHours(row.budgetedHours)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtHours(row.actualHours)}</TableCell>
                    <TableCell className={`text-right text-sm ${row.isOverrun ? 'text-red-600 font-medium' : ''}`}>
                      {fmtHours(row.remainingHours)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={
                        row.isOverrun
                          ? 'bg-red-100 text-red-700'
                          : row.isNearLimit
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                      }>
                        {row.percentConsumed}%
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-[100px]">
                      <div className="space-y-1">
                        <Progress
                          value={Math.min(row.percentConsumed, 100)}
                          className={`h-2 ${row.isOverrun ? '[&>div]:bg-red-500' : row.isNearLimit ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'}`}
                        />
                        {row.isOverrun && (
                          <p className="text-xs text-red-600 font-medium">+{(row.percentConsumed - 100).toFixed(0)}% over</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {chargeCodeRows.length === 0 && (
        <Card className="p-8 text-center">
          <Clock className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">No charge code authorizations found for this project.</p>
        </Card>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold">Live Labor Feed</h3>
          <Badge variant="outline" className="text-xs">Auto-refreshes every 30s</Badge>
          {liveFeed.length > 0 && (
            <Badge className="bg-blue-100 text-blue-700 text-xs">{liveFeed.length} active</Badge>
          )}
        </div>

        {liveFeed.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No open labor sessions for this project.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {liveFeed.map((session) => {
              const hours = Math.floor(session.elapsedMinutes / 60);
              const mins = session.elapsedMinutes % 60;
              return (
                <Card key={session.sessionId} className="border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{session.employeeName}</p>
                        {session.travelerNumber && (
                          <p className="text-xs text-muted-foreground font-mono">{session.travelerNumber}</p>
                        )}
                      </div>
                      <CertBadge status={session.certificationStatus} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {session.department && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" /> {session.department}
                        </span>
                      )}
                      {session.chargeCode && (
                        <span className="font-mono">{session.chargeCode}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <Clock className="h-3.5 w-3.5 text-blue-600" />
                      <span>{hours}h {mins}m elapsed</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Material Budget Tab ───────────────────────────────────────────────────────

type SortField = 'status' | 'itemCode' | 'qtyRequired' | 'qtyAllocated' | 'qtyIssued' | 'committedCost' | 'consumedCost';
type SortDir = 'asc' | 'desc';

function MaterialBudgetTab({ projectId }: { projectId: string }) {
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data, isLoading, isError } = useQuery<MaterialData>({
    queryKey: ['/api/pm-dashboard', projectId, 'materials'],
    queryFn: () => safeFetch<MaterialData>(`/api/pm-dashboard/${projectId}/materials`),
    enabled: !!projectId,
  });

  if (isLoading) {
    return <div className="space-y-4">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  if (isError) {
    return <QueryErrorBanner message="Failed to load material budget data." />;
  }

  if (!data) return null;

  const { summary, rows } = data;

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'status') {
      cmp = (MATERIAL_STATUS_ORDER[a.status] ?? 99) - (MATERIAL_STATUS_ORDER[b.status] ?? 99);
    } else if (sortField === 'itemCode') {
      cmp = a.itemCode.localeCompare(b.itemCode);
    } else {
      cmp = (a[sortField] as number) - (b[sortField] as number);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<Package className="h-4 w-4" />}
          label="Planned"
          value={summary.plannedCost > 0 ? fmtCurrency(summary.plannedCost) : '—'}
          colorClass="text-blue-600"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Committed"
          value={fmtCurrency(summary.committedCost)}
          colorClass="text-purple-600"
        />
        <KpiCard
          icon={<CheckCircle className="h-4 w-4" />}
          label="Consumed"
          value={fmtCurrency(summary.consumedCost)}
          colorClass="text-green-600"
        />
        <KpiCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Remaining"
          value={fmtCurrency(summary.remainingCost)}
          colorClass={summary.remainingCost < 0 ? 'text-red-600' : 'text-green-600'}
        />
      </div>

      {rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No material allocations or consumption recorded for this project.</p>
        </Card>
      ) : (
        <div>
          <div className="text-xs text-muted-foreground mb-2">
            Table sorted by risk level by default — SHORT items appear first. Click column headers to sort.
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button className="flex items-center hover:text-foreground" onClick={() => handleSort('status')}>
                      Status <SortIcon field="status" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center hover:text-foreground" onClick={() => handleSort('itemCode')}>
                      Item Code <SortIcon field="itemCode" />
                    </button>
                  </TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Lot / ICN</TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort('qtyRequired')}>
                      Required <SortIcon field="qtyRequired" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort('qtyAllocated')}>
                      Allocated <SortIcon field="qtyAllocated" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort('qtyIssued')}>
                      Issued <SortIcon field="qtyIssued" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort('committedCost')}>
                      Committed <SortIcon field="committedCost" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort('consumedCost')}>
                      Consumed <SortIcon field="consumedCost" />
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row, idx) => (
                  <TableRow key={`${row.inventoryItemId}-${idx}`}>
                    <TableCell>
                      <Badge className={MATERIAL_STATUS_COLORS[row.status] ?? 'bg-gray-100 text-gray-600'}>
                        {row.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">{row.itemCode || '—'}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{row.itemName || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lotNumber && <div className="font-mono">{row.lotNumber}</div>}
                      {row.internalControlNumber && <div className="text-xs opacity-70">{row.internalControlNumber}</div>}
                      {!row.lotNumber && !row.internalControlNumber && '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">{row.qtyRequired > 0 ? row.qtyRequired : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.qtyAllocated > 0 ? row.qtyAllocated : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.qtyIssued > 0 ? row.qtyIssued : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.unitCost > 0 ? fmtCurrency(row.unitCost) : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.committedCost > 0 ? fmtCurrency(row.committedCost) : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.consumedCost > 0 ? fmtCurrency(row.consumedCost) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface PmOption {
  id: number;
  name: string;
}

export default function PMControlCenterPage() {
  const [, navigate] = useLocation();
  // Read URL params immediately as initial state so they are authoritative on first render
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('project') ?? '';
  });
  const [pmFilter, setPmFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('pm') ?? '';
  });
  const [onlyMyProjects, setOnlyMyProjects] = useState(false);
  const [activeTab, setActiveTab] = useState('production');
  const [blockersSheetOpen, setBlockersSheetOpen] = useState(false);

  const {
    data: projects = [],
    isLoading: projectsLoading,
    isError: projectsError,
    isSuccess: projectsSuccess,
    error: projectsErrorObj,
  } = useQuery<ProjectOption[]>({
    queryKey: ['/api/pm-dashboard/projects'],
    queryFn: () => safeFetch<ProjectOption[]>('/api/pm-dashboard/projects'),
  });

  const { data: managers = [] } = useQuery<PmOption[]>({
    queryKey: ['/api/pm-dashboard/managers'],
    queryFn: () => safeFetch<PmOption[]>('/api/pm-dashboard/managers'),
  });

  function buildSearch(projectId: string, pm: string) {
    const params = new URLSearchParams();
    if (projectId) params.set('project', projectId);
    if (pm) params.set('pm', pm);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id);
    window.history.replaceState(null, '', `/pm-control-center${buildSearch(id, pmFilter)}`);
  };

  const handlePmFilterChange = (value: string) => {
    const newPm = value === '__all__' ? '' : value;
    setPmFilter(newPm);
    if (onlyMyProjects && newPm !== String(currentUser?.id ?? '')) {
      setOnlyMyProjects(false);
    }
    window.history.replaceState(null, '', `/pm-control-center${buildSearch(selectedProjectId, newPm)}`);
  };

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useQuery<Summary>({
    queryKey: ['/api/pm-dashboard', selectedProjectId, 'summary'],
    queryFn: () => safeFetch<Summary>(`/api/pm-dashboard/${selectedProjectId}/summary`),
    enabled: !!selectedProjectId,
    refetchInterval: 60000,
  });

  // Page-level production query — shares cache with ProductionTab, only used for blockers sheet + throughput
  const { data: productionRows = [], isError: productionError } = useQuery<WorkOrderRow[]>({
    queryKey: ['/api/pm-dashboard', selectedProjectId, 'production'],
    queryFn: () => safeFetch<WorkOrderRow[]>(`/api/pm-dashboard/${selectedProjectId}/production`),
    enabled: !!selectedProjectId,
  });

  // Project detail query — used for lifecycle stage derivation
  const { data: projectDetail } = useQuery<{ currentStage: string | null; status: string; poId: number | null; steps: { stepType: string; status: string }[] }>({
    queryKey: ['/api/projects', selectedProjectId],
    queryFn: () => safeFetch<{ currentStage: string | null; status: string; poId: number | null; steps: { stepType: string; status: string }[] }>(`/api/projects/${selectedProjectId}`),
    enabled: !!selectedProjectId,
  });

  const blockedWorkOrders = productionRows.filter(r => r.status === 'BLOCKED');

  const selectedProject = projects.find(p => String(p.id) === selectedProjectId);

  // Derive lifecycle stage label from project steps
  const lifecycleStageLabel = (() => {
    if (!selectedProject) return null;
    // Use the detailed step statuses from projectDetail if available, fall back to ProjectOption fields
    if (projectDetail) {
      const steps = projectDetail.steps || [];
      const p2Step = steps.find(s => s.stepType === 'p2_order');
      const preprodStep = steps.find(s => s.stepType === 'preproduction_checklist');
      const purchaseStep = steps.find(s => s.stepType === 'purchase_review_checklist');
      const quoteStep = steps.find(s => s.stepType === 'quote');
      const rfqStep = steps.find(s => s.stepType === 'rfq_risk_assessment');
      return deriveStageLabel({
        ...selectedProject,
        p2StepStatus: p2Step?.status,
        preprodStepStatus: preprodStep?.status,
        purchaseStepStatus: purchaseStep?.status,
        quoteStepStatus: quoteStep?.status,
        rfqStepStatus: rfqStep?.status,
      });
    }
    return deriveStageLabel(selectedProject);
  })();

  // Daily throughput calculation
  const dailyThroughput = (() => {
    if (!productionRows.length || !selectedProject?.targetShipDate) return null;
    const totalRequired = productionRows.reduce((sum, r) => sum + (r.quantityRequired || 0), 0);
    const totalCompleted = productionRows.reduce((sum, r) => sum + (r.quantityCompleted || 0), 0);
    const completedToday = productionRows.reduce((sum, r) => sum + (r.quantityCompletedToday || 0), 0);
    const totalRemaining = Math.max(0, totalRequired - totalCompleted);
    const daysRemaining = Math.max(1, differenceInBusinessDays(parseISO(selectedProject.targetShipDate), new Date()));
    // Daily target = total units still needed / business days remaining (Mon-Fri, excl. weekends)
    const neededPerDay = Math.ceil(totalRemaining / daysRemaining);
    // Pace: today's actual completions vs. daily target
    const pacePercent = neededPerDay > 0 ? Math.round((completedToday / neededPerDay) * 100) : 100;
    return { totalRequired, totalCompleted, completedToday, totalRemaining, daysRemaining, neededPerDay, pacePercent, percentComplete: totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0 };
  })();

  // Detect current user for "Only My Projects" toggle
  const { data: currentUser } = useQuery<{ id: number; name: string; username: string }>({
    queryKey: ['/api/auth/me'],
    queryFn: () => safeFetch<{ id: number; name: string; username: string }>('/api/auth/me'),
    retry: false,
  });

  // My projects — computed independently so auto-select doesn't depend on toggle
  const myProjects = currentUser
    ? projects.filter(p => p.projectManagerId === currentUser.id || p.projectManagerName?.toLowerCase() === currentUser.name?.toLowerCase())
    : [];

  let filteredProjects = projects;
  if (onlyMyProjects && currentUser) {
    filteredProjects = myProjects;
  } else if (pmFilter) {
    filteredProjects = projects.filter(p => String(p.projectManagerId) === pmFilter);
  }

  // Auto-select if current user is PM on exactly one project (regardless of toggle)
  useEffect(() => {
    if (myProjects.length === 1 && !selectedProjectId) {
      handleProjectChange(myProjects[0].id);
    }
  }, [myProjects.length, selectedProjectId]);

  // Clear selection if the selected project is no longer visible in the filtered list
  useEffect(() => {
    if (selectedProjectId && filteredProjects.length > 0 && !filteredProjects.find(p => String(p.id) === selectedProjectId)) {
      handleProjectChange('');
    }
  }, [filteredProjects, selectedProjectId]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-7 w-7 text-blue-600" />
            PM Control Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time project health across production, labor, and materials
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/wad-status')}
            data-testid="button-wad-status-from-pmcc"
            title="WAD authoring & backfill backlog across all P2 Release / Production projects"
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            WAD Status
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/wad-wizard')}
            data-testid="button-wad-wizard-from-pmcc"
          >
            <LayoutDashboard className="h-4 w-4 mr-1.5" />
            WAD Wizard
          </Button>
        </div>
      </div>

      {/* Project Selector Row */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[280px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Project</Label>
              <Select value={selectedProjectId} onValueChange={handleProjectChange}>
                <SelectTrigger>
                  <SelectValue placeholder={projectsLoading ? 'Loading projects…' : 'Select a project…'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="font-mono font-medium">{p.projectCode}</span>
                      <span className="text-muted-foreground ml-2">{p.projectName}</span>
                    </SelectItem>
                  ))}
                  {filteredProjects.length === 0 && (
                    <SelectItem value="__empty__" disabled>
                      {onlyMyProjects
                        ? 'No projects assigned to you'
                        : pmFilter
                          ? 'No projects for this PM'
                          : 'No active projects'}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {managers.length > 0 && (
              <div className="min-w-[200px]">
                <Label className="text-xs text-muted-foreground mb-1 block">Filter by PM</Label>
                <Select value={pmFilter || '__all__'} onValueChange={handlePmFilterChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="All PMs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All PMs</SelectItem>
                    {managers.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                id="only-my-projects"
                checked={onlyMyProjects}
                onCheckedChange={(checked) => {
                  setOnlyMyProjects(checked);
                  const newPm = checked && currentUser ? String(currentUser.id) : '';
                  setPmFilter(newPm);
                  window.history.replaceState(null, '', `/pm-control-center${buildSearch(selectedProjectId, newPm)}`);
                }}
              />
              <Label htmlFor="only-my-projects" className="text-sm cursor-pointer">
                Only My Projects
              </Label>
            </div>

            {selectedProject && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {selectedProject.projectManagerName && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    PM: {selectedProject.projectManagerName}
                  </span>
                )}
                {selectedProject.targetShipDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Ship: {fmtDate(selectedProject.targetShipDate)}
                  </span>
                )}
              </div>
            )}

            {selectedProject && (
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/projects/${selectedProjectId}`)}
                >
                  <Briefcase className="h-3.5 w-3.5 mr-1.5" />
                  Project Detail
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const poParam = selectedProject.poNumber ? `?po=${encodeURIComponent(selectedProject.poNumber)}` : '';
                    navigate(`/p2-control-center${poParam}`);
                  }}
                >
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                  P2 Control Center
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error state — projects query failed */}
      {projectsError && (
        <QueryErrorBanner
          message={
            projectsErrorObj instanceof Error
              ? `Failed to load projects: ${projectsErrorObj.message}`
              : 'Failed to load projects.'
          }
        />
      )}

      {/* Empty state — no projects exist at all (only on a successful empty response) */}
      {projectsSuccess && projects.length === 0 && (
        <Card data-testid="empty-state-no-projects">
          <CardContent className="p-10 text-center">
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No active projects yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
              Projects appear here once a quote is accepted and promoted into a
              project. Create or accept a quote to get started.
            </p>
            <Link href="/p2-quotes-list">
              <Button data-testid="button-go-to-quotes">
                Go to Quotes
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Empty state — projects exist but filters hide them all */}
      {projectsSuccess && projects.length > 0 && filteredProjects.length === 0 && (
        <Card data-testid="empty-state-filtered-out">
          <CardContent className="p-8 text-center">
            <Filter className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {onlyMyProjects
                ? 'No projects are currently assigned to you.'
                : pmFilter
                  ? 'No active projects for the selected PM.'
                  : 'No active projects match the current filters.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* KPI Summary Cards */}
      {selectedProjectId && (
        <>
          {summaryLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : summaryError ? (
            <QueryErrorBanner message="Failed to load project summary. The tabs below may still work." />
          ) : summary ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <KpiCard
                icon={<CheckCircle className="h-4 w-4" />}
                label="Production"
                value={`${summary.productionPercent}%`}
                sub={`${summary.completedWorkOrders} / ${summary.totalWorkOrders} WOs`}
                colorClass={summary.productionPercent === 100 ? 'text-green-600' : 'text-blue-600'}
              />
              <KpiCard
                icon={<Clock className="h-4 w-4" />}
                label="Labor Hours"
                value={fmtHours(summary.actualLaborHours)}
                sub={`of ${fmtHours(summary.budgetedLaborHours)} budgeted`}
                colorClass={summary.laborRemainingHours < 0 ? 'text-red-600' : 'text-purple-600'}
              />
              <KpiCard
                icon={<Package className="h-4 w-4" />}
                label="Material Cost"
                value={fmtCurrency(summary.consumedMaterialCost)}
                sub={`${fmtCurrency(summary.committedMaterialCost)} committed`}
                colorClass="text-indigo-600"
              />
              <KpiCard
                icon={<AlertCircle className="h-4 w-4" />}
                label="Open Blockers"
                value={summary.blockedCount}
                sub={`${summary.openTravelerCount} open travelers`}
                colorClass={summary.blockedCount > 0 ? 'text-red-600' : 'text-green-600'}
                onClick={summary.blockedCount > 0 ? () => setBlockersSheetOpen(true) : undefined}
              />
              <KpiCard
                icon={<Calendar className="h-4 w-4" />}
                label="Target Ship"
                value={fmtDate(summary.targetShipDate)}
                sub={summary.targetShipDate
                  ? (() => {
                      const diff = differenceInBusinessDays(parseISO(summary.targetShipDate), new Date());
                      if (diff < 0) return `${Math.abs(diff)} biz days overdue`;
                      if (diff === 0) return 'Due today';
                      return `${diff} biz days remaining`;
                    })()
                  : undefined}
                colorClass="text-orange-600"
              />
            </div>
          ) : null}

          {productionError && !summaryError && (
            <QueryErrorBanner message="Failed to load production data. Blocker count and throughput may be unavailable." />
          )}

          {/* Stage + Throughput Row */}
          {summary && !productionError && (lifecycleStageLabel || dailyThroughput) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lifecycleStageLabel && (
                <KpiCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="Lifecycle Stage"
                  value={lifecycleStageLabel}
                  colorClass={
                    lifecycleStageLabel === 'Closed' ? 'text-green-600' :
                    lifecycleStageLabel === 'Production' ? 'text-blue-600' :
                    lifecycleStageLabel === 'Pre-Production' ? 'text-purple-600' :
                    'text-orange-600'
                  }
                />
              )}
              {dailyThroughput && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Daily Throughput</span>
                    </div>
                    <div className="flex items-end justify-between mb-2">
                      <div>
                        <p className="text-lg font-bold">{dailyThroughput.completedToday}<span className="text-sm text-muted-foreground"> / {dailyThroughput.neededPerDay} today's target</span></p>
                        <p className="text-xs text-muted-foreground">{dailyThroughput.totalCompleted}/{dailyThroughput.totalRequired} total · {dailyThroughput.daysRemaining}d left</p>
                      </div>
                      <span className={`text-sm font-semibold ${dailyThroughput.pacePercent >= 100 ? 'text-green-600' : dailyThroughput.pacePercent >= 75 ? 'text-blue-600' : 'text-orange-600'}`}>
                        {dailyThroughput.pacePercent}% pace
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, dailyThroughput.pacePercent)}
                      className={`h-2 ${dailyThroughput.pacePercent >= 100 ? '[&>div]:bg-green-500' : dailyThroughput.pacePercent >= 75 ? '[&>div]:bg-blue-500' : '[&>div]:bg-orange-500'}`}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Blockers Detail Sheet */}
          <Sheet open={blockersSheetOpen} onOpenChange={setBlockersSheetOpen}>
            <SheetContent className="w-[480px] sm:w-[560px] overflow-y-auto">
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <XCircle className="h-5 w-5" />
                  Open Blockers
                  <Badge className="bg-red-100 text-red-700 ml-1">{blockedWorkOrders.length}</Badge>
                </SheetTitle>
              </SheetHeader>

              {blockedWorkOrders.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle className="mx-auto h-10 w-10 text-green-500 mb-3" />
                  <p className="text-muted-foreground">No blocked work orders.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {blockedWorkOrders.map((wo) => (
                    <div
                      key={wo.productionWorkOrderId}
                      className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-950/20 space-y-2 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
                      onClick={() => {
                        setBlockersSheetOpen(false);
                        navigate(`/production-work-orders/${wo.productionWorkOrderId}`);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-sm">{wo.workOrderNumber}</span>
                        <Badge className="bg-red-100 text-red-700">BLOCKED</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Part:</span> {wo.partNumber}
                      </div>
                      {wo.dueDate && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Due:</span> {fmtDate(wo.dueDate)}
                        </div>
                      )}
                      <div className="pt-1 border-t border-red-200 dark:border-red-800">
                        {wo.blockReason ? (
                          <div>
                            <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-1">Block Reason</p>
                            <p className="text-sm text-red-800 dark:text-red-300">{wo.blockReason}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">No block reason recorded</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SheetContent>
          </Sheet>

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="production">
                <Briefcase className="h-4 w-4 mr-2" />
                Production
              </TabsTrigger>
              <TabsTrigger value="labor">
                <Clock className="h-4 w-4 mr-2" />
                Direct Labor
              </TabsTrigger>
              <TabsTrigger value="materials">
                <Package className="h-4 w-4 mr-2" />
                Material Budget
              </TabsTrigger>
            </TabsList>

            <TabsContent value="production" className="mt-4">
              <ProductionTab projectId={selectedProjectId} />
            </TabsContent>

            <TabsContent value="labor" className="mt-4">
              <DirectLaborTab projectId={selectedProjectId} />
            </TabsContent>

            <TabsContent value="materials" className="mt-4">
              <MaterialBudgetTab projectId={selectedProjectId} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {!selectedProjectId && !projectsLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutDashboard className="h-5 w-5 text-blue-600" />
              All Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filteredProjects.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No active projects found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Project Name</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>PO Number</TableHead>
                    <TableHead>PM</TableHead>
                    <TableHead>Ship Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.map(p => {
                    const stage = deriveStageLabel(p);
                    const stageBadgeClass =
                      stage === 'Production' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      stage === 'Pre-Production' ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' :
                      stage === 'WAD' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                      stage === 'PO Received' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                      stage === 'Project Start' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' :
                      stage === 'Quote' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      'bg-muted text-muted-foreground';
                    return (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleProjectChange(p.id)}
                      >
                        <TableCell className="font-mono text-sm">{p.projectCode}</TableCell>
                        <TableCell className="font-medium">{p.projectName}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${stageBadgeClass}`}>
                            {stage}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.poNumber ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{p.projectManagerName ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.targetShipDate ? format(parseISO(p.targetShipDate), 'MMM d, yyyy') : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
