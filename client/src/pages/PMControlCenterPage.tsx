import { Fragment, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Switch,
} from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  CheckCircle, Clock, AlertCircle, Package, TrendingUp, Calendar,
  Briefcase, Users, ShieldCheck, ShieldAlert, ShieldOff, HelpCircle,
  ChevronUp, ChevronDown, ChevronRight, ArrowUpDown, LayoutDashboard, XCircle, Filter,
  Plus,
} from 'lucide-react';
import { format, differenceInBusinessDays, parseISO } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

async function safeFetch<T>(url: string): Promise<T> {
  return apiRequest(url) as Promise<T>;
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
  sourceType?: 'production_work_order' | 'p2_production_order';
  sourceLabel?: string;
  dashboardType?: string | null;
  queueType?: string | null;
  assignedDepartment?: string | null;
  assignedDashboardRoute?: string | null;
  dashboardLabel?: string | null;
  manufacturingQueueId?: number | null;
  wadStatus?: string | null;
  p2PoId?: number | null;
  p2PoNumber?: string | null;
  status: string;
  dueDate: string | null;
  currentDepartment: string | null;
  currentTravelerStep: string | null;
  activeTravelerId: string | null;
  activeTravelerNumber: string | null;
  ncrReplacementCount?: number;
  activeReplacementCount?: number;
  replacementSerialNumbers?: string | null;
  daysScheduleVariance: number | null;
  blockReason: string | null;
  linkedWadId?: string | null;
  linkedWadNumber?: string | null;
  linkedWadStatus?: string | null;
  linkedWadWorkOrderStatus?: string | null;
  productionConnectionStatus?: 'CONNECTED' | 'WAD_MISSING' | 'WAD_NOT_MATCHED' | 'WAD_INCOMPLETE' | 'TRAVELER_NOT_ACTIVE' | string | null;
  productionConnectionLabel?: string | null;
  productionConnectionDetail?: string | null;
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

interface P2PoStatusSummary {
  id: number;
  poNumber: string;
  customerName: string | null;
  dueDate: string | null;
  totalItems: number;
  completedItems: number;
  scheduledItems?: number;
  inProductionItems: number;
  scrappedItems?: number;
  pendingItems: number;
  rawStatus: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
}

interface P2NcrMetrics {
  totalSerializedItems: number;
  openNcrCount: number;
  finalScrapCount: number;
  finalScrapRatePercent: number;
}

interface ProductionResponse {
  rows: WorkOrderRow[];
  linkedP2Production?: WorkOrderRow[];
  linkedP2PoCount: number;
  linkedP2PoStatuses: P2PoStatusSummary[];
  p2NcrMetrics?: P2NcrMetrics;
}

interface P2SerializedBreakdownItem {
  id: string;
  poId: number;
  poNumber: string | null;
  poItemId: number | null;
  serialNumber: string | null;
  barcode: string | null;
  travelerBarcode: string | null;
  partNumber: string | null;
  partName: string | null;
  status: string;
  currentDepartment: string | null;
  currentStageIndex: number | null;
  activeTravelerId: string | null;
  activeTravelerNumber: string | null;
  activeTravelerStatus: string | null;
  activeTaskDepartment: string | null;
  activeTaskStatus: string | null;
  holdReason: string | null;
  scrapReason: string | null;
  completedAt: string | null;
  updatedAt: string | null;
}

type SerializedStatusGroup = 'complete' | 'scheduled' | 'in_progress' | 'scrapped' | 'other';

function serializedStatusGroup(item: P2SerializedBreakdownItem): SerializedStatusGroup {
  const rawStatus = String(item.status || '').trim().toUpperCase();
  const travelerStatus = String(item.activeTravelerStatus || '').trim().toUpperCase();
  const taskStatus = String(item.activeTaskStatus || '').trim().toUpperCase();
  const department = String(item.currentDepartment || item.activeTaskDepartment || '').trim();

  if (rawStatus === 'SCRAPPED' || rawStatus === 'SCRAP') {
    return 'scrapped';
  }

  if (
    item.completedAt ||
    rawStatus === 'COMPLETED' ||
    rawStatus === 'COMPLETE' ||
    rawStatus === 'FULFILLED' ||
    rawStatus === 'SHIPPED' ||
    travelerStatus === 'COMPLETED'
  ) {
    return 'complete';
  }

  if (rawStatus === 'ACTIVE' && department === 'Layup') {
    return 'scheduled';
  }

  if (
    rawStatus === 'IN_PROGRESS' ||
    rawStatus === 'IN PROGRESS' ||
    travelerStatus === 'IN_PROGRESS' ||
    taskStatus === 'IN_PROGRESS' ||
    (!!department && department !== 'Pending Layup' && department !== 'Layup')
  ) {
    return 'in_progress';
  }

  return 'other';
}

function serializedDepartment(item: P2SerializedBreakdownItem): string {
  return item.currentDepartment || item.activeTaskDepartment || 'Unassigned Department';
}

interface DailyThroughputBoardData {
  businessDate: string;
  date: string;
  isToday: boolean;
  targetSlots: number;
  summary: {
    target: number;
    started: number;
    green: number;
    inProcess: number;
    blocked: number;
    cancelled: number;
    notStarted: number;
    overflowCount: number;
  };
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

interface DailyLaborRow {
  workDate: string;
  employeeId: number;
  employeeName: string;
  department: string | null;
  chargeCode: string | null;
  workOrderNumber: string | null;
  travelerNumber: string | null;
  budgetedHours: number;
  actualHours: number;
  activeHours: number;
  usedHours: number;
  remainingHours: number;
  percentConsumed: number;
  openSessionCount: number;
}

interface LaborEntryTraceRow {
  sessionId: number;
  employeeId: number;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
  hours: number;
  source: string;
  laborClass: string | null;
  department: string | null;
  operation: string | null;
  chargeCode: string | null;
  workOrderNumber: string | null;
  travelerNumber: string | null;
  approvalStatus: string | null;
  isEdited: boolean;
  editNote: string | null;
  timesheetId: number | null;
  timesheetStatus: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  locked: boolean;
}

type LaborTraceTarget =
  | { type: 'chargeCode'; label: string; chargeCode: string }
  | { type: 'daily'; label: string; employeeId: number; workDate: string; chargeCode: string | null };

interface LaborData {
  summary: LaborSummary;
  chargeCodeRows: ChargeCodeRow[];
  liveFeed: LiveSession[];
  dailyLaborRows: DailyLaborRow[];
}

interface MaterialSummary {
  plannedCost: number;
  committedCost: number;
  consumedCost: number;
  remainingCost: number;
  pendingReceivedCost?: number;
  acceptedReceivedCost?: number;
}

interface MaterialRow {
  inventoryItemId: string;
  partsRequestId?: number;
  projectReceivedMaterialId?: number;
  itemCode: string;
  itemName: string;
  lotNumber: string | null;
  internalControlNumber: string | null;
  receiptNumber?: string | null;
  receivedUnitBarcode?: string | null;
  requestedBy?: string | null;
  requestDate?: string | null;
  expectedDelivery?: string | null;
  qtyRequired: number;
  qtyAllocated: number;
  qtyIssued: number;
  qtyOnHand: number;
  leadTimeDays: number | null;
  unitCost: number;
  committedCost: number;
  consumedCost: number;
  status: string;
}

interface MaterialData {
  summary: MaterialSummary;
  rows: MaterialRow[];
}

interface MaterialSessionUser {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  employeeName?: string | null;
}

interface ProgramAssemblyWidgetRow {
  id: string;
  assemblyCode: string;
  assemblyName: string;
  computedStatus: 'PLANNED' | 'READY' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETE';
  completionPercent: number;
  blockedBy: { assemblyCode: string; assemblyName: string }[];
}

interface ProgramHealthData {
  ready: boolean;
  build: {
    id: string;
    buildName: string;
    programName: string;
    programCode: string;
    targetShipDate: string | null;
  } | null;
  widgets: {
    programHealth: number;
    criticalPath: ProgramAssemblyWidgetRow[];
    blockedAssemblies: ProgramAssemblyWidgetRow[];
    shipReadiness: {
      ready: boolean;
      completeAssemblies: number;
      totalAssemblies: number;
    };
    laborMaterialImpact: {
      queueItems: number;
      completedQueueItems: number;
      blockedAssemblies: number;
    };
  } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
}

function fmtHours(h: number) {
  return h.toFixed(1) + ' hrs';
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);
}

function readProjectParam(params: URLSearchParams) {
  return params.get('project') ?? params.get('projectId') ?? '';
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

const P2_PO_STATUS_COLORS: Record<P2PoStatusSummary['status'], string> = {
  pending: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
};

function p2PoStatusLabel(status: P2PoStatusSummary['status']) {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'scheduled') return 'Scheduled';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const CONNECTION_STATUS_COLORS: Record<string, string> = {
  CONNECTED: 'bg-green-100 text-green-700 border-green-200',
  WAD_MISSING: 'bg-red-100 text-red-700 border-red-200',
  WAD_NOT_MATCHED: 'bg-orange-100 text-orange-700 border-orange-200',
  WAD_INCOMPLETE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  TRAVELER_NOT_ACTIVE: 'bg-blue-100 text-blue-700 border-blue-200',
};

function ProductionConnectionCell({ row, navTo }: { row: WorkOrderRow; navTo: (path: string) => void }) {
  if (row.sourceType !== 'p2_production_order') {
    return (
      <div className="text-xs text-muted-foreground">
        WAD source
      </div>
    );
  }

  const status = row.productionConnectionStatus ?? 'WAD_MISSING';
  const label = row.productionConnectionLabel ?? 'Connection check';
  const detail = row.productionConnectionDetail ?? 'P2 production is shown without changing production flow.';

  return (
    <div className="flex min-w-[190px] flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${CONNECTION_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
          {label}
        </Badge>
        {row.linkedWadNumber && (
          <button
            type="button"
            className="font-mono text-xs text-primary hover:underline"
            onClick={() => row.linkedWadId && navTo(`/production-work-orders/${row.linkedWadId}`)}
            title={row.linkedWadStatus || undefined}
          >
            {row.linkedWadNumber}
          </button>
        )}
      </div>
      <div className="text-xs text-muted-foreground line-clamp-2" title={detail}>
        {detail}
      </div>
    </div>
  );
}

const MATERIAL_STATUS_COLORS: Record<string, string> = {
  OVER_ISSUED: 'bg-red-100 text-red-700',
  SHORT: 'bg-red-100 text-red-700',
  ON_HOLD: 'bg-orange-100 text-orange-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700',
  ALLOCATED: 'bg-blue-100 text-blue-700',
  ON_HAND: 'bg-green-100 text-green-700',
  PENDING_PM_ACCEPTANCE: 'bg-blue-100 text-blue-700',
  FULLY_ALLOCATED: 'bg-green-100 text-green-700',
  FULLY_ISSUED: 'bg-green-100 text-green-700',
  RECEIVED_ACCEPTED: 'bg-green-100 text-green-700',
  RECEIVED_REJECTED: 'bg-gray-100 text-gray-600',
  PART_REQUEST_PENDING: 'bg-gray-100 text-gray-700',
  PART_REQUEST_PENDING_OWNER_APPROVAL: 'bg-orange-100 text-orange-700',
  PART_REQUEST_APPROVED: 'bg-blue-100 text-blue-700',
  PART_REQUEST_ORDERED: 'bg-indigo-100 text-indigo-700',
  PART_REQUEST_ORDERED_PARTIAL: 'bg-indigo-100 text-indigo-700',
  PART_REQUEST_RECEIVED: 'bg-green-100 text-green-700',
  PART_REQUEST_RECEIVED_PARTIAL: 'bg-green-100 text-green-700',
  PART_REQUEST_DELIVERED_TO_DEPT: 'bg-green-100 text-green-700',
  PART_REQUEST_REJECTED: 'bg-red-100 text-red-700',
  PART_REQUEST_CANCEL_REQUESTED: 'bg-orange-100 text-orange-700',
};

const MATERIAL_STATUS_ORDER: Record<string, number> = {
  OVER_ISSUED: 0,
  SHORT: 1,
  ON_HOLD: 2,
  PARTIAL: 3,
  PENDING_PM_ACCEPTANCE: 4,
  ALLOCATED: 4,
  ON_HAND: 5,
  FULLY_ALLOCATED: 5,
  FULLY_ISSUED: 6,
  RECEIVED_ACCEPTED: 7,
  RECEIVED_REJECTED: 8,
  PART_REQUEST_PENDING: 9,
  PART_REQUEST_PENDING_OWNER_APPROVAL: 10,
  PART_REQUEST_APPROVED: 11,
  PART_REQUEST_ORDERED: 12,
  PART_REQUEST_ORDERED_PARTIAL: 13,
  PART_REQUEST_RECEIVED: 14,
  PART_REQUEST_RECEIVED_PARTIAL: 15,
  PART_REQUEST_DELIVERED_TO_DEPT: 16,
  PART_REQUEST_REJECTED: 17,
  PART_REQUEST_CANCEL_REQUESTED: 18,
};

function materialStatusLabel(status: string) {
  return status.replace(/^PART_REQUEST_/, 'REQUEST ').replace(/_/g, ' ');
}

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

function dateInputValue(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function buildTimeClockPunchUrl(entry: LaborEntryTraceRow) {
  const date = dateInputValue(entry.clockIn);
  const params = new URLSearchParams({
    tab: 'punches',
    from: date,
    to: date,
    punchId: String(entry.sessionId),
    employeeId: String(entry.employeeId),
    showAll: '1',
    q: entry.chargeCode ?? '',
  });
  return `/time-clock-admin?${params.toString()}`;
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

function ProgramManufacturingWidgets({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<ProgramHealthData>({
    queryKey: ['/api/program-manufacturing/projects', projectId, 'health'],
    queryFn: () => safeFetch<ProgramHealthData>(`/api/program-manufacturing/projects/${projectId}/health`),
    enabled: !!projectId,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  if (!data?.build || !data.widgets) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">No program build linked</p>
            <p className="text-xs text-muted-foreground">
              PM production, labor, and material tabs still use the existing project queues.
            </p>
          </div>
          <Badge variant="outline">Program layer idle</Badge>
        </CardContent>
      </Card>
    );
  }

  const critical = data.widgets.criticalPath[0];
  const blocked = data.widgets.blockedAssemblies[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{data.build.buildName}</h2>
          <p className="text-sm text-muted-foreground">
            {data.build.programCode} - {data.build.programName}
          </p>
        </div>
        <Link href={`/p2-control-center?tab=program&projectId=${projectId}`}>
          <Button variant="outline" size="sm">
            <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
            Open Program
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Program Health"
          value={`${data.widgets.programHealth}%`}
          sub="assembly rollup"
          colorClass={data.widgets.programHealth >= 80 ? 'text-green-600' : 'text-blue-600'}
        />
        <KpiCard
          icon={<ArrowUpDown className="h-4 w-4" />}
          label="Critical Path"
          value={critical ? `${critical.completionPercent}%` : 'Clear'}
          sub={critical ? `${critical.assemblyCode} ${critical.assemblyName}` : 'no open path'}
          colorClass="text-amber-600"
        />
        <KpiCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Blocked Assemblies"
          value={data.widgets.blockedAssemblies.length}
          sub={blocked ? `First: ${blocked.assemblyCode}` : 'none blocked'}
          colorClass={data.widgets.blockedAssemblies.length > 0 ? 'text-red-600' : 'text-green-600'}
        />
        <KpiCard
          icon={<Calendar className="h-4 w-4" />}
          label="Ship Readiness"
          value={data.widgets.shipReadiness.ready ? 'Ready' : 'Not Ready'}
          sub={`${data.widgets.shipReadiness.completeAssemblies}/${data.widgets.shipReadiness.totalAssemblies} assemblies`}
          colorClass={data.widgets.shipReadiness.ready ? 'text-green-600' : 'text-orange-600'}
        />
        <KpiCard
          icon={<Package className="h-4 w-4" />}
          label="Labor/Material Impact"
          value={`${data.widgets.laborMaterialImpact.completedQueueItems}/${data.widgets.laborMaterialImpact.queueItems}`}
          sub={`${data.widgets.laborMaterialImpact.blockedAssemblies} blocked assemblies`}
          colorClass="text-indigo-600"
        />
      </div>
    </div>
  );
}

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
  const [selectedP2Po, setSelectedP2Po] = useState<P2PoStatusSummary | null>(null);
  const [showBlockersOnly, setShowBlockersOnly] = useState(false);
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>('all');
  const [qtySort, setQtySort] = useState<QtySort>(null);

  const { data: productionResponse, isLoading, isError } = useQuery<ProductionResponse>({
    queryKey: ['/api/pm-dashboard', projectId, 'production'],
    queryFn: () => safeFetch<ProductionResponse>(`/api/pm-dashboard/${projectId}/production`),
    enabled: !!projectId,
  });
  const rows = productionResponse?.rows ?? [];
  const linkedP2PoCount = productionResponse?.linkedP2PoCount ?? 0;
  const linkedP2PoStatuses = productionResponse?.linkedP2PoStatuses ?? [];
  const p2NcrMetrics = productionResponse?.p2NcrMetrics;

  const { data: detail, isLoading: detailLoading } = useQuery<WorkOrderDetail>({
    queryKey: ['/api/pm-dashboard', projectId, 'production', selectedWO?.productionWorkOrderId],
    queryFn: () => safeFetch<WorkOrderDetail>(`/api/pm-dashboard/${projectId}/production/${selectedWO!.productionWorkOrderId}`),
    enabled: !!selectedWO && selectedWO.sourceType !== 'p2_production_order',
  });

  const {
    data: serializedBreakdown,
    isLoading: serializedBreakdownLoading,
    isError: serializedBreakdownError,
  } = useQuery<{ items: P2SerializedBreakdownItem[] }>({
    queryKey: ['/api/pm-dashboard', projectId, 'production', 'p2-serialized'],
    queryFn: () => safeFetch<{ items: P2SerializedBreakdownItem[] }>(`/api/pm-dashboard/${projectId}/production/p2-serialized`),
    enabled: !!projectId && !!selectedP2Po,
  });

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  if (isError) {
    return <QueryErrorBanner message="Failed to load production data." />;
  }

  if (!rows.length && linkedP2PoStatuses.length === 0) {
    if (linkedP2PoCount === 0) {
      return (
        <Card className="p-10 text-center" data-testid="empty-no-p2-link">
          <Briefcase className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            No P2 PO is linked to this project — link one from the P2 Order step to see production here.
          </p>
        </Card>
      );
    }
    return (
      <Card className="p-10 text-center" data-testid="empty-no-work-orders">
        <Briefcase className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No work orders found for this project yet.</p>
      </Card>
    );
  }

  const onlyCuttingTable = rows.length > 0 && rows.every(r => {
    const dept = (r.currentDepartment ?? '').toLowerCase().replace(/[\s_-]/g, '');
    return dept === 'cuttingtable' || dept === 'cutting';
  });
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
  const selectedSerializedItems = (serializedBreakdown?.items ?? [])
    .filter(item => !selectedP2Po || item.poId === selectedP2Po.id);
  const serializedCompleteItems = selectedSerializedItems
    .filter(item => serializedStatusGroup(item) === 'complete')
    .sort((a, b) => (a.completedAt || a.updatedAt || '').localeCompare(b.completedAt || b.updatedAt || ''));
  const serializedScheduledItems = selectedSerializedItems
    .filter(item => serializedStatusGroup(item) === 'scheduled')
    .sort((a, b) => (a.serialNumber || a.barcode || a.id).localeCompare(b.serialNumber || b.barcode || b.id));
  const serializedInProgressByDepartment = selectedSerializedItems
    .filter(item => serializedStatusGroup(item) === 'in_progress')
    .reduce<Record<string, P2SerializedBreakdownItem[]>>((acc, item) => {
      const dept = serializedDepartment(item);
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(item);
      return acc;
    }, {});
  const serializedInProgressDepartments = Object.entries(serializedInProgressByDepartment)
    .map(([department, items]) => [
      department,
      [...items].sort((a, b) => serializedDepartment(a).localeCompare(serializedDepartment(b)) || (a.serialNumber || a.barcode || a.id).localeCompare(b.serialNumber || b.barcode || b.id)),
    ] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  const serializedScrappedItems = selectedSerializedItems
    .filter(item => serializedStatusGroup(item) === 'scrapped')
    .sort((a, b) => (a.serialNumber || a.barcode || a.id).localeCompare(b.serialNumber || b.barcode || b.id));
  const serializedOtherItems = selectedSerializedItems
    .filter(item => serializedStatusGroup(item) === 'other')
    .sort((a, b) => (a.serialNumber || a.barcode || a.id).localeCompare(b.serialNumber || b.barcode || b.id));
  function renderSerializedItem(item: P2SerializedBreakdownItem) {
    return (
      <div key={item.id} className="grid gap-2 p-3 text-sm sm:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <div className="font-mono font-semibold">
            {item.serialNumber || item.barcode || item.id}
          </div>
          <div className="text-xs text-muted-foreground">
            {item.partNumber || 'No part'} {item.partName ? `- ${item.partName}` : ''}
          </div>
        </div>
        <div>
          <Badge className={WO_STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-700'}>
            {item.status.replace('_', ' ')}
          </Badge>
          {(item.holdReason || item.scrapReason) && (
            <div className="mt-1 text-xs text-red-700">
              {item.holdReason || item.scrapReason}
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {item.activeTravelerNumber && item.activeTravelerId ? (
            <Link
              to={`/travelers/${item.activeTravelerId}`}
              className="font-mono text-blue-600 hover:underline"
            >
              {item.activeTravelerNumber}
            </Link>
          ) : (
            <span>No active traveler</span>
          )}
          <div>{item.activeTaskStatus || item.activeTravelerStatus || 'No active task'}</div>
          <div>Updated {fmtTime(item.updatedAt)}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {p2NcrMetrics && p2NcrMetrics.totalSerializedItems > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Open NCR</p>
                  <p className="text-2xl font-semibold">{p2NcrMetrics.openNcrCount}</p>
                </div>
                <ShieldAlert className="h-5 w-5 text-orange-500" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Items awaiting disposition</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Final Scrap</p>
                  <p className="text-2xl font-semibold">{p2NcrMetrics.finalScrapCount}</p>
                </div>
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Dispositioned as scrap/trash</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Scrap Rate</p>
                  <p className="text-2xl font-semibold">{p2NcrMetrics.finalScrapRatePercent.toFixed(2)}%</p>
                </div>
                <TrendingUp className="h-5 w-5 text-red-500" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {p2NcrMetrics.finalScrapCount} of {p2NcrMetrics.totalSerializedItems} serialized items
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {linkedP2PoStatuses.length > 0 && (
        <div className="grid gap-3 mb-4">
          {linkedP2PoStatuses.map((po) => {
            const pct = po.totalItems > 0 ? Math.round((po.completedItems / po.totalItems) * 100) : 0;
            return (
              <Card
                key={po.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedP2Po(po)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedP2Po(po);
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-lg font-semibold">{po.poNumber}</span>
                        <Badge className={P2_PO_STATUS_COLORS[po.status]}>
                          {p2PoStatusLabel(po.status)}
                        </Badge>
                        <Badge variant="outline">P2 PO Status</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {po.customerName || 'Unknown customer'} · Due {fmtDate(po.dueDate)}
                      </div>
                    </div>
                    <div className="min-w-[260px] space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{po.completedItems} / {po.totalItems} completed</span>
                        <span className="font-semibold">{pct}%</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <div className="grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground sm:grid-cols-5">
                        <div><span className="block font-semibold text-foreground">{po.inProductionItems}</span>In production</div>
                        <div><span className="block font-semibold text-foreground">{po.scheduledItems ?? 0}</span>Scheduled</div>
                        <div><span className="block font-semibold text-foreground">{po.scrappedItems ?? 0}</span>Scrapped</div>
                        <div><span className="block font-semibold text-foreground">{po.pendingItems}</span>Pending</div>
                        <div><span className="block font-semibold text-foreground">{po.rawStatus}</span>Raw status</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
          <p className="text-muted-foreground">
            {rows.length === 0
              ? 'No WAD/project work orders found; use the linked P2 PO status above for serialized production.'
              : 'No work orders match the selected filters.'}
          </p>
        </Card>
      )}

      {onlyCuttingTable && (
        <div
          className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
          data-testid="text-cutting-only-note"
        >
          Only cutting-table work orders exist for this project — downstream work orders will appear once cutting is released.
        </div>
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
              <TableHead>Dashboard / Queue</TableHead>
              <TableHead>Connection</TableHead>
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
                onClick={() => {
                  if (row.sourceType === 'p2_production_order') {
                    const params = new URLSearchParams({ tab: 'production' });
                    if (row.p2PoId) params.set('poId', String(row.p2PoId));
                    if (row.p2PoNumber) params.set('po', row.p2PoNumber);
                    navTo(`/p2-control-center?${params.toString()}`);
                    return;
                  }
                  navTo(`/production-work-orders/${row.productionWorkOrderId}`);
                }}
              >
                <TableCell className="font-mono text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <span>{row.workOrderNumber}</span>
                    {row.sourceLabel === 'P2' && (
                      <Badge variant="outline" className="font-sans text-[10px] px-1.5 py-0">
                        P2
                      </Badge>
                    )}
                    {(row.ncrReplacementCount ?? 0) > 0 && (
                      <Badge
                        variant="outline"
                        className="font-sans text-[10px] px-1.5 py-0 border-blue-300 bg-blue-50 text-blue-700"
                        title={row.replacementSerialNumbers || undefined}
                      >
                        NCR replacement
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  <div>{row.partNumber}</div>
                  {(row.ncrReplacementCount ?? 0) > 0 && (
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      {row.activeReplacementCount || 0} active replacement{(row.activeReplacementCount || 0) === 1 ? '' : 's'}
                    </div>
                  )}
                </TableCell>
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
                <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                  <div className="flex min-w-[160px] flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {row.dashboardLabel ?? row.assignedDepartment ?? 'Manufacturing Queue'}
                      </Badge>
                      {row.queueType && (
                        <span className="text-xs text-muted-foreground">{row.queueType.replace('_', ' ')}</span>
                      )}
                    </div>
                    {row.assignedDashboardRoute ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 w-fit gap-1.5 px-2 text-xs"
                        onClick={() => navTo(row.assignedDashboardRoute!)}
                      >
                        <LayoutDashboard className="h-3.5 w-3.5" />
                        Open Dashboard
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                  <ProductionConnectionCell row={row} navTo={navTo} />
                </TableCell>
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

      <Sheet open={!!selectedP2Po} onOpenChange={(open) => !open && setSelectedP2Po(null)}>
        <SheetContent className="w-[520px] sm:w-[720px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {selectedP2Po?.poNumber} serialized production
              {selectedP2Po && (
                <Badge className={P2_PO_STATUS_COLORS[selectedP2Po.status]}>
                  {p2PoStatusLabel(selectedP2Po.status)}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          {serializedBreakdownLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          )}

          {serializedBreakdownError && (
            <QueryErrorBanner message="Failed to load serialized item breakdown." />
          )}

          {!serializedBreakdownLoading && !serializedBreakdownError && selectedSerializedItems.length === 0 && (
            <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
              No serialized items are currently tied to this PO.
            </div>
          )}

          {!serializedBreakdownLoading && !serializedBreakdownError && selectedSerializedItems.length > 0 && (
            <Accordion type="multiple" className="space-y-3">
              {serializedCompleteItems.length > 0 && (
                <AccordionItem value="complete" className="rounded-md border px-3">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Complete
                      <Badge variant="outline">{serializedCompleteItems.length} order{serializedCompleteItems.length === 1 ? '' : 's'}</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="divide-y rounded-md border">
                      {serializedCompleteItems.map(renderSerializedItem)}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {serializedScheduledItems.length > 0 && (
                <AccordionItem value="scheduled" className="rounded-md border px-3">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Calendar className="h-4 w-4 text-emerald-600" />
                      Scheduled
                      <Badge variant="outline">{serializedScheduledItems.length} order{serializedScheduledItems.length === 1 ? '' : 's'}</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="divide-y rounded-md border">
                      {serializedScheduledItems.map(renderSerializedItem)}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {serializedInProgressDepartments.length > 0 && (
                <AccordionItem value="in-progress" className="rounded-md border px-3">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      In Progress
                      <Badge variant="outline">
                        {serializedInProgressDepartments.reduce((sum, [, items]) => sum + items.length, 0)} order{serializedInProgressDepartments.reduce((sum, [, items]) => sum + items.length, 0) === 1 ? '' : 's'}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <Accordion
                      type="multiple"
                      className="space-y-2"
                    >
                      {serializedInProgressDepartments.map(([department, items]) => (
                        <AccordionItem key={department} value={`dept-${department}`} className="rounded-md border px-3">
                          <AccordionTrigger className="py-2 hover:no-underline">
                            <span className="flex items-center gap-2 text-sm font-semibold">
                              {department}
                              <Badge variant="outline">{items.length} order{items.length === 1 ? '' : 's'}</Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="pb-3">
                            <div className="divide-y rounded-md border">
                              {items.map(renderSerializedItem)}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              )}

              {serializedScrappedItems.length > 0 && (
                <AccordionItem value="scrapped" className="rounded-md border px-3">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <XCircle className="h-4 w-4 text-red-600" />
                      Scrapped
                      <Badge variant="outline">{serializedScrappedItems.length} order{serializedScrappedItems.length === 1 ? '' : 's'}</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="divide-y rounded-md border">
                      {serializedScrappedItems.map(renderSerializedItem)}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {serializedOtherItems.length > 0 && (
                <AccordionItem value="other" className="rounded-md border px-3">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      Other Status
                      <Badge variant="outline">{serializedOtherItems.length} order{serializedOtherItems.length === 1 ? '' : 's'}</Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="divide-y rounded-md border">
                      {serializedOtherItems.map(renderSerializedItem)}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          )}
        </SheetContent>
      </Sheet>

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
  const [, navTo] = useLocation();
  const [traceTarget, setTraceTarget] = useState<LaborTraceTarget | null>(null);

  const { data, isLoading, isError } = useQuery<LaborData>({
    queryKey: ['/api/pm-dashboard', projectId, 'labor'],
    queryFn: () => safeFetch<LaborData>(`/api/pm-dashboard/${projectId}/labor`),
    enabled: !!projectId,
    refetchInterval: 30000,
  });

  const { data: currentUser } = useQuery<{ id: number; username: string; role: string } | null>({
    queryKey: ['/api/auth/me'],
    queryFn: () => safeFetch<{ id: number; username: string; role: string } | null>('/api/auth/me'),
  });

  const canTraceLabor = currentUser?.username?.toLowerCase() === 'glennj'
    && currentUser?.role?.toUpperCase() === 'ADMIN';

  const traceParams = new URLSearchParams();
  if (traceTarget?.type === 'chargeCode') {
    traceParams.set('chargeCode', traceTarget.chargeCode);
  } else if (traceTarget?.type === 'daily') {
    traceParams.set('employeeId', String(traceTarget.employeeId));
    traceParams.set('workDate', traceTarget.workDate);
    if (traceTarget.chargeCode) traceParams.set('chargeCode', traceTarget.chargeCode);
  }

  const {
    data: traceEntries = [],
    isLoading: traceLoading,
    isError: traceError,
  } = useQuery<LaborEntryTraceRow[]>({
    queryKey: ['/api/pm-dashboard', projectId, 'labor', 'entries', traceTarget],
    queryFn: () => safeFetch<LaborEntryTraceRow[]>(
      `/api/pm-dashboard/${projectId}/labor/entries?${traceParams.toString()}`
    ),
    enabled: !!projectId && !!traceTarget && canTraceLabor,
  });

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  if (isError) {
    return <QueryErrorBanner message="Failed to load labor data." />;
  }

  if (!data) return null;

  const { summary, chargeCodeRows, liveFeed, dailyLaborRows = [] } = data;

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
                  {canTraceLabor && <TableHead className="text-right">Trace</TableHead>}
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
                    {canTraceLabor && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTraceTarget({
                            type: 'chargeCode',
                            label: row.chargeCode,
                            chargeCode: row.chargeCode,
                          })}
                        >
                          Entries
                        </Button>
                      </TableCell>
                    )}
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

      {dailyLaborRows.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Daily WAD Time Bank Usage</h3>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>WAD / Traveler</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Used Today</TableHead>
                  <TableHead className="text-right">WAD Bank</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  {canTraceLabor && <TableHead className="text-right">Trace</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyLaborRows.map((row) => (
                  <TableRow key={`${row.workDate}-${row.employeeId}-${row.chargeCode ?? row.department ?? 'labor'}`}>
                    <TableCell className="text-sm">{fmtDate(row.workDate)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{row.employeeName}</div>
                      {row.openSessionCount > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 mt-1">Clocked in</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-mono">{row.workOrderNumber ?? 'WAD'}</div>
                      <div className="text-xs text-muted-foreground">{row.travelerNumber ?? row.chargeCode ?? 'Direct labor'}</div>
                    </TableCell>
                    <TableCell className="text-sm">{row.department ?? '—'}</TableCell>
                    <TableCell className="text-right text-sm">{fmtHours(row.usedHours)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtHours(row.budgetedHours)}</TableCell>
                    <TableCell className={`text-right text-sm ${row.remainingHours < 0 ? 'text-red-600 font-medium' : ''}`}>
                      {fmtHours(row.remainingHours)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={
                        row.percentConsumed > 100
                          ? 'bg-red-100 text-red-700'
                          : row.percentConsumed >= 80
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                      }>
                        {row.percentConsumed}%
                      </Badge>
                    </TableCell>
                    {canTraceLabor && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTraceTarget({
                            type: 'daily',
                            label: `${row.employeeName} - ${fmtDate(row.workDate)}`,
                            employeeId: row.employeeId,
                            workDate: row.workDate,
                            chargeCode: row.chargeCode,
                          })}
                        >
                          Entries
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
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

      <Sheet open={!!traceTarget} onOpenChange={(open) => !open && setTraceTarget(null)}>
        <SheetContent className="w-[520px] sm:w-[760px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Labor Entries
              {traceTarget && <Badge variant="outline">{traceTarget.label}</Badge>}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              These rows are read-only here. Use Timekeeper to make corrections so locked timesheets keep the existing audit and correction workflow.
            </div>

            {traceLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : traceError ? (
              <QueryErrorBanner message="Failed to load labor entry trace." />
            ) : traceEntries.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No time entries matched this labor line.</p>
              </Card>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>WAD / Traveler</TableHead>
                      <TableHead>Timesheet</TableHead>
                      <TableHead className="text-right">Timekeeper</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {traceEntries.map(entry => (
                      <TableRow key={entry.sessionId}>
                        <TableCell>
                          <div className="font-medium text-sm">{entry.employeeName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{entry.chargeCode ?? 'No charge code'}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{fmtTime(entry.clockIn)}</div>
                          <div className="text-xs text-muted-foreground">
                            {entry.clockOut ? fmtTime(entry.clockOut) : 'Open session'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmtHours(entry.hours)}</TableCell>
                        <TableCell className="text-sm">
                          <div className="font-mono">{entry.workOrderNumber ?? 'WAD'}</div>
                          <div className="text-xs text-muted-foreground">{entry.travelerNumber ?? entry.department ?? 'Direct labor'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {entry.timesheetId ? (
                              <Badge className={entry.locked ? 'bg-slate-200 text-slate-800' : 'bg-blue-100 text-blue-800'}>
                                TS #{entry.timesheetId} {entry.timesheetStatus ?? ''}
                              </Badge>
                            ) : (
                              <Badge variant="outline">No timesheet</Badge>
                            )}
                            {entry.isEdited && <Badge className="bg-yellow-100 text-yellow-800">Edited</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => navTo(buildTimeClockPunchUrl(entry))}
                          >
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Material Budget Tab ───────────────────────────────────────────────────────

type SortField = 'status' | 'itemCode' | 'qtyRequired' | 'qtyOnHand' | 'qtyAllocated' | 'qtyIssued' | 'committedCost' | 'consumedCost';
type SortDir = 'asc' | 'desc';

function getOpenPartsRequestQuantity(rows: MaterialRow[], itemCode: string) {
  return rows
    .filter((row) => row.partsRequestId && row.itemCode === itemCode)
    .reduce((total, row) => total + row.qtyRequired, 0);
}

function MaterialBudgetTab({ projectId }: { projectId: string }) {
  const [, navTo] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());

  const { data: sessionUser } = useQuery<MaterialSessionUser | null>({
    queryKey: ['/api/auth/session'],
    queryFn: () => safeFetch<MaterialSessionUser | null>('/api/auth/session'),
  });

  const { data, isLoading, isError } = useQuery<MaterialData>({
    queryKey: ['/api/pm-dashboard', projectId, 'materials'],
    queryFn: () => safeFetch<MaterialData>(`/api/pm-dashboard/${projectId}/materials`),
    enabled: !!projectId,
  });

  const receivedMaterialMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'accept' | 'reject' }) => {
      const res = await fetch(`/api/pm-dashboard/${projectId}/materials/received/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || 'Failed to update received material');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pm-dashboard', projectId, 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pm-dashboard', projectId, 'summary'] });
    },
  });

  const createPartsRequestsMutation = useMutation({
    mutationFn: async () => {
      const selectedRows = (data?.rows ?? []).filter((row) => selectedRequestIds.has(row.inventoryItemId));
      const requestedBy = sessionUser?.employeeName?.trim()
        || sessionUser?.username?.trim()
        || [sessionUser?.firstName, sessionUser?.lastName].filter(Boolean).join(' ').trim();

      if (!requestedBy) throw new Error('Unable to identify the current user.');
      if (selectedRows.length === 0) throw new Error('Select at least one material item.');

      return Promise.all(selectedRows.map((row) => {
        const openRequestQuantity = getOpenPartsRequestQuantity(data?.rows ?? [], row.itemCode);
        const shortage = Math.max(row.qtyRequired - row.qtyOnHand - openRequestQuantity, 0);
        if (shortage <= 0) throw new Error(`${row.itemCode} has no uncovered demand.`);
        return apiRequest('/api/inventory/parts-requests', {
          method: 'POST',
          body: {
            agPartNumber: row.itemCode,
            partNumber: row.itemCode,
            partName: row.itemName,
            requestedBy,
            productionLine: 'P2',
            projectId,
            quantity: shortage,
            urgency: 'MEDIUM',
            estimatedCost: row.unitCost > 0 ? row.unitCost : null,
            reason: `Uncovered P2 project demand: ${row.qtyRequired} required, ${row.qtyOnHand} on hand, ${openRequestQuantity} already requested.`,
          },
        });
      }));
    },
    onSuccess: (created) => {
      setSelectedRequestIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['/api/pm-dashboard', projectId, 'materials'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
      toast({
        title: 'Parts requests created',
        description: `${created.length} project material request${created.length === 1 ? '' : 's'} submitted.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Parts requests were not created',
        description: error instanceof Error ? error.message : 'The request failed.',
        variant: 'destructive',
      });
    },
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

  const setRequestSelected = (rowId: string, checked: boolean) => {
    setSelectedRequestIds((current) => {
      const next = new Set(current);
      if (checked) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          size="sm"
          className="mr-2"
          disabled={selectedRequestIds.size === 0 || createPartsRequestsMutation.isPending}
          onClick={() => createPartsRequestsMutation.mutate()}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Parts Request{selectedRequestIds.size === 1 ? '' : 's'}
          {selectedRequestIds.size > 0 ? ` (${selectedRequestIds.size})` : ''}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navTo(`/inventory/parts-request?projectId=${encodeURIComponent(projectId)}&create=1`)}
        >
          Manual Request
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<Package className="h-4 w-4" />}
          label="Planned"
          value={summary.plannedCost > 0 ? fmtCurrency(summary.plannedCost) : '—'}
          colorClass="text-blue-600"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Approved Received"
          value={fmtCurrency(summary.committedCost)}
          sub={summary.pendingReceivedCost ? `${fmtCurrency(summary.pendingReceivedCost)} pending receipt` : undefined}
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
                  <TableHead className="w-10"><span className="sr-only">Details</span></TableHead>
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
                    <button className="flex items-center ml-auto hover:text-foreground" onClick={() => handleSort('qtyOnHand')}>
                      On Hand <SortIcon field="qtyOnHand" />
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
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row, idx) => {
                  const rowKey = `${row.inventoryItemId}-${idx}`;
                  const isExpanded = expandedRowId === rowKey;
                  const isRequirement = !row.partsRequestId && !row.projectReceivedMaterialId;
                  const openRequestQuantity = isRequirement
                    ? getOpenPartsRequestQuantity(rows, row.itemCode)
                    : 0;
                  const shortage = Math.max(row.qtyRequired - row.qtyOnHand - openRequestQuantity, 0);
                  return (
                  <Fragment key={rowKey}>
                  <TableRow>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label={`${isExpanded ? 'Hide' : 'Show'} material details for ${row.itemCode}`}
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedRowId(isExpanded ? null : rowKey)}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge className={MATERIAL_STATUS_COLORS[row.status] ?? 'bg-gray-100 text-gray-600'}>
                        {materialStatusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">{row.itemCode || '—'}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{row.itemName || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lotNumber && <div className="font-mono">{row.lotNumber}</div>}
                      {row.internalControlNumber && <div className="text-xs opacity-70">{row.internalControlNumber}</div>}
                      {row.receiptNumber && <div className="text-xs opacity-70">Receipt {row.receiptNumber}</div>}
                      {row.receivedUnitBarcode && <div className="text-xs opacity-70">{row.receivedUnitBarcode}</div>}
                      {row.partsRequestId && <div className="font-mono">Request #{row.partsRequestId}</div>}
                      {row.requestedBy && <div className="text-xs opacity-70">By {row.requestedBy}</div>}
                      {row.requestDate && <div className="text-xs opacity-70">Requested {fmtDate(row.requestDate)}</div>}
                      {row.expectedDelivery && <div className="text-xs opacity-70">Need by {fmtDate(row.expectedDelivery)}</div>}
                      {!row.lotNumber && !row.internalControlNumber && !row.receiptNumber && !row.receivedUnitBarcode && !row.partsRequestId && '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">{row.qtyRequired > 0 ? row.qtyRequired : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.qtyOnHand > 0 ? row.qtyOnHand : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.qtyAllocated > 0 ? row.qtyAllocated : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.qtyIssued > 0 ? row.qtyIssued : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.unitCost > 0 ? fmtCurrency(row.unitCost) : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.committedCost > 0 ? fmtCurrency(row.committedCost) : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{row.consumedCost > 0 ? fmtCurrency(row.consumedCost) : '—'}</TableCell>
                    <TableCell className="text-right">
                      {row.status === 'PENDING_PM_ACCEPTANCE' && row.projectReceivedMaterialId ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={receivedMaterialMutation.isPending}
                            onClick={() => receivedMaterialMutation.mutate({ id: row.projectReceivedMaterialId!, action: 'accept' })}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={receivedMaterialMutation.isPending}
                            onClick={() => receivedMaterialMutation.mutate({ id: row.projectReceivedMaterialId!, action: 'reject' })}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={13} className="p-4">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                          <div className="rounded-md border bg-background p-3">
                            <div className="text-xs text-muted-foreground">Demand</div>
                            <div className="text-lg font-semibold">{row.qtyRequired}</div>
                          </div>
                          <div className="rounded-md border bg-background p-3">
                            <div className="text-xs text-muted-foreground">On hand</div>
                            <div className="text-lg font-semibold">{row.qtyOnHand}</div>
                          </div>
                          <div className="rounded-md border bg-background p-3">
                            <div className="text-xs text-muted-foreground">Open parts requests</div>
                            <div className="text-lg font-semibold">{openRequestQuantity}</div>
                          </div>
                          <div className="rounded-md border bg-background p-3">
                            <div className="text-xs text-muted-foreground">Uncovered demand</div>
                            <div className="text-lg font-semibold">{shortage}</div>
                          </div>
                          <div className="rounded-md border bg-background p-3">
                            <div className="text-xs text-muted-foreground">Lead time</div>
                            <div className="text-lg font-semibold">
                              {row.leadTimeDays == null ? 'Not set' : `${row.leadTimeDays} day${row.leadTimeDays === 1 ? '' : 's'}`}
                            </div>
                          </div>
                          <div className="flex items-center rounded-md border bg-background p-3">
                            {isRequirement ? (
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  id={`request-${rowKey}`}
                                  checked={selectedRequestIds.has(row.inventoryItemId)}
                                  disabled={shortage <= 0 || createPartsRequestsMutation.isPending}
                                  onCheckedChange={(checked) => setRequestSelected(row.inventoryItemId, checked === true)}
                                />
                                <Label htmlFor={`request-${rowKey}`} className="leading-tight">
                                  {shortage > 0 ? `Create parts request for ${shortage}` : 'Demand covered by on-hand inventory or open requests'}
                                </Label>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">This row records an existing request or receipt.</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                  );
                })}
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
  const [location, navigate] = useLocation();
  // Read URL params immediately as initial state so they are authoritative on first render
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return readProjectParam(params);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectFromUrl = readProjectParam(params);
    if (projectFromUrl && projectFromUrl !== selectedProjectId) {
      setSelectedProjectId(projectFromUrl);
      window.history.replaceState(null, '', `/pm-control-center${buildSearch(projectFromUrl, pmFilter)}`);
    }
  }, [location, selectedProjectId, pmFilter]);

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
  const { data: productionData, isError: productionError } = useQuery<ProductionResponse>({
    queryKey: ['/api/pm-dashboard', selectedProjectId, 'production'],
    queryFn: () => safeFetch<ProductionResponse>(`/api/pm-dashboard/${selectedProjectId}/production`),
    enabled: !!selectedProjectId,
  });
  const productionRows = productionData?.rows ?? [];

  // Project detail query — used for lifecycle stage derivation
  const { data: projectDetail } = useQuery<{ currentStage: string | null; status: string; poId: number | null; steps: { stepType: string; status: string }[] }>({
    queryKey: ['/api/projects', selectedProjectId],
    queryFn: () => safeFetch<{ currentStage: string | null; status: string; poId: number | null; steps: { stepType: string; status: string }[] }>(`/api/projects/${selectedProjectId}`),
    enabled: !!selectedProjectId,
  });

  const blockedWorkOrders = productionRows.filter(r => r.status === 'BLOCKED');

  const selectedProject = projects.find(p => String(p.id) === selectedProjectId);
  const linkedP2PoStatus = productionData?.linkedP2PoStatuses?.[0] ?? null;

  const throughputParams = new URLSearchParams();
  if (selectedProjectId) throughputParams.set('projectId', selectedProjectId);
  if (linkedP2PoStatus?.id) throughputParams.set('poId', String(linkedP2PoStatus.id));
  else if (selectedProject?.poId) throughputParams.set('poId', String(selectedProject.poId));

  const {
    data: liveThroughput,
    isLoading: liveThroughputLoading,
    isError: liveThroughputError,
  } = useQuery<DailyThroughputBoardData>({
    queryKey: ['/api/p2/daily-throughput-board', selectedProjectId, linkedP2PoStatus?.id ?? selectedProject?.poId ?? null],
    queryFn: () => safeFetch<DailyThroughputBoardData>(
      `/api/p2/daily-throughput-board${throughputParams.toString() ? `?${throughputParams.toString()}` : ''}`
    ),
    enabled: !!selectedProjectId,
    refetchInterval: 45000,
    staleTime: 30000,
  });

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

  const liveThroughputPace = liveThroughput
    ? Math.round((liveThroughput.summary.green / Math.max(1, liveThroughput.summary.target)) * 100)
    : 0;

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
            title="WAD authoring & backfill backlog across active PO-ready projects"
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
                    const params = new URLSearchParams({ tab: 'status' });
                    params.set('projectId', selectedProjectId);
                    if (selectedProject.projectName) params.set('projectName', selectedProject.projectName);
                    if (selectedProject.poId) params.set('poId', String(selectedProject.poId));
                    if (selectedProject.poNumber) params.set('po', selectedProject.poNumber);
                    navigate(`/p2-control-center${params.toString() ? `?${params.toString()}` : ''}`);
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

      {selectedProjectId && (
        <ProgramManufacturingWidgets projectId={selectedProjectId} />
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
                sub={`${fmtCurrency(summary.committedMaterialCost)} approved received`}
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
          {summary && !productionError && (lifecycleStageLabel || liveThroughput || liveThroughputLoading || liveThroughputError) && (
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
              {(liveThroughput || liveThroughputLoading || liveThroughputError) && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Live Daily Throughput</span>
                    </div>
                    {liveThroughputLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-6 w-40" />
                        <Skeleton className="h-2 w-full" />
                      </div>
                    ) : liveThroughputError || !liveThroughput ? (
                      <p className="text-sm text-red-600">Live throughput data is unavailable.</p>
                    ) : (
                      <>
                        <div className="flex items-end justify-between mb-2">
                          <div>
                            <p className="text-lg font-bold">
                              {liveThroughput.summary.green}
                              <span className="text-sm text-muted-foreground"> / {liveThroughput.summary.target} green target</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {liveThroughput.summary.started} started · {liveThroughput.summary.inProcess} in process · {liveThroughput.summary.blocked} blocked · {liveThroughput.date}
                            </p>
                          </div>
                          <span className={`text-sm font-semibold ${liveThroughputPace >= 100 ? 'text-green-600' : liveThroughputPace >= 75 ? 'text-blue-600' : 'text-orange-600'}`}>
                            {liveThroughputPace}% live pace
                          </span>
                        </div>
                        <Progress
                          value={Math.min(100, liveThroughputPace)}
                          className={`h-2 ${liveThroughputPace >= 100 ? '[&>div]:bg-green-500' : liveThroughputPace >= 75 ? '[&>div]:bg-blue-500' : '[&>div]:bg-orange-500'}`}
                        />
                      </>
                    )}
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
