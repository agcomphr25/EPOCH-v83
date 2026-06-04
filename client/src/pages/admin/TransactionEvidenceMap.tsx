import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  FileText,
  GitFork,
  Landmark,
  ListTree,
  Loader2,
  Network,
  Package,
  PanelRightOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import EdriSubNav from '@/components/EdriSubNav';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type EvidenceNodeStatus = 'ok' | 'warning' | 'missing' | 'sensitive';
type MapViewMode = 'radial' | 'flow';
type EvidenceNodeType =
  | 'project'
  | 'period'
  | 'work_order'
  | 'employee'
  | 'labor_session'
  | 'labor_cost'
  | 'material_budget'
  | 'material_lot'
  | 'material_consumption'
  | 'material_receipt'
  | 'material_request'
  | 'inventory_ledger'
  | 'payroll'
  | 'billing'
  | 'journal'
  | 'audit'
  | 'document'
  | 'missing';

interface EvidenceNode {
  id: string;
  type: EvidenceNodeType;
  label: string;
  subtitle?: string | null;
  status: EvidenceNodeStatus;
  sensitivity?: 'employee_rate' | 'normal';
  metrics?: Record<string, string | number | null>;
  details?: Record<string, unknown>;
  links?: Array<{ label: string; href: string; kind: 'app' | 'api' }>;
  missingEvidence?: string[];
}

interface EvidenceEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  status: EvidenceNodeStatus;
}

interface EvidenceMapResponse {
  generatedAt: string;
  project: {
    id: string;
    project_code: string;
    project_name: string;
  };
  period: {
    year: number | null;
    month: number | null;
    label: string;
  };
  summary: {
    laborRecordCount: number;
    liveLaborSessionCount?: number;
    employeeCount: number;
    workOrderCount: number;
    materialEvidenceCount?: number;
    materialConsumptionCount?: number;
    materialConsumedCost?: number;
    materialCommittedCost?: number;
    materialReceivedCost?: number;
    journalEntryCount: number;
    customerInvoiceCount?: number;
    documentCount: number;
    auditEventCount: number;
    totalHours: number;
    liveLaborHours?: number;
    totalLaborDollars: number;
    missingEvidenceCount: number;
  };
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  missingEvidence: Array<{
    nodeId: string;
    nodeLabel: string;
    message: string;
  }>;
}

interface ProjectOption {
  id: string;
  projectCode?: string;
  project_code?: string;
  projectName?: string;
  project_name?: string;
  customerNameSnapshot?: string | null;
  customer_name_snapshot?: string | null;
  status?: string | null;
}

const branchDefs: Array<{
  key: string;
  label: string;
  subtitle: string;
  types: EvidenceNodeType[];
}> = [
  {
    key: 'work_order',
    label: 'What job was charged?',
    subtitle: 'Work orders and WAD links',
    types: ['work_order'],
  },
  {
    key: 'employee',
    label: 'Who worked?',
    subtitle: 'Employees and live punch sessions',
    types: ['employee', 'labor_session'],
  },
  {
    key: 'labor_cost',
    label: 'What did it cost?',
    subtitle: 'Hours, rate source, and dollars',
    types: ['labor_cost'],
  },
  {
    key: 'material',
    label: 'What material was used?',
    subtitle: 'Budgets, lots, ICNs, receipts, and consumed quantities',
    types: [
      'material_budget',
      'material_lot',
      'material_consumption',
      'material_receipt',
      'material_request',
      'inventory_ledger',
    ],
  },
  {
    key: 'payroll',
    label: 'Labor / Timekeeping Evidence',
    subtitle: 'Payroll export evidence when present',
    types: ['payroll'],
  },
  {
    key: 'billing',
    label: 'Customer billing',
    subtitle: 'Invoices created against this project',
    types: ['billing'],
  },
  {
    key: 'journal',
    label: 'Was it posted to the books?',
    subtitle: 'GL journal entry and debit/credit lines',
    types: ['journal'],
  },
  {
    key: 'audit',
    label: 'Who touched it?',
    subtitle: 'Audit trail and approvals',
    types: ['audit'],
  },
  {
    key: 'document',
    label: 'What proof is attached?',
    subtitle: 'Files, packets, and missing support',
    types: ['document', 'missing'],
  },
];

const branchLayout: Record<string, { x: number; y: number }> = {
  work_order: { x: 430, y: 250 },
  employee: { x: 360, y: 470 },
  labor_cost: { x: 430, y: 690 },
  material: { x: 720, y: 920 },
  payroll: { x: 1080, y: 920 },
  billing: { x: 1180, y: 250 },
  journal: { x: 1470, y: 470 },
  audit: { x: 1470, y: 690 },
  document: { x: 1450, y: 920 },
};

function money(value: number) {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
  });
}

function projectCode(project: ProjectOption) {
  return project.projectCode ?? project.project_code ?? project.id;
}

function projectName(project: ProjectOption) {
  return project.projectName ?? project.project_name ?? '';
}

function statusClass(status: EvidenceNodeStatus) {
  if (status === 'ok')
    return 'border-emerald-300 bg-emerald-50 text-emerald-950';
  if (status === 'sensitive') return 'border-blue-300 bg-blue-50 text-blue-950';
  if (status === 'missing') return 'border-red-300 bg-red-50 text-red-950';
  return 'border-amber-300 bg-amber-50 text-amber-950';
}

function typeLabel(type: EvidenceNodeType) {
  if (type === 'work_order') return 'Work orders';
  if (type === 'employee') return 'Employees';
  if (type === 'labor_session') return 'Punch sessions';
  if (type === 'labor_cost') return 'Labor costs';
  if (type === 'material_budget') return 'Material budgets';
  if (type === 'material_lot') return 'Material lots';
  if (type === 'material_consumption') return 'Material consumption';
  if (type === 'material_receipt') return 'Material receipts';
  if (type === 'material_request') return 'Material requests';
  if (type === 'inventory_ledger') return 'Inventory ledger';
  if (type === 'payroll') return 'Payroll exports';
  if (type === 'billing') return 'Customer invoices';
  if (type === 'journal') return 'Journal entries';
  if (type === 'audit') return 'Audit log records';
  if (type === 'document') return 'Documents';
  if (type === 'missing') return 'Missing evidence';
  if (type === 'period') return 'Periods';
  return 'Projects';
}

function branchCountLabel(count: number) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

function summarizeBranch(
  nodes: EvidenceNode[],
  branch: (typeof branchDefs)[number]
) {
  const status = nodes.length ? branchStatus(nodes) : 'missing';
  const missingCount = nodes.reduce(
    (sum, node) => sum + (node.missingEvidence?.length ?? 0),
    0
  );
  const sensitiveCount = nodes.filter(
    (node) => node.status === 'sensitive'
  ).length;
  const warningCount = nodes.filter((node) => node.status === 'warning').length;
  const subtitleParts = [
    branchCountLabel(nodes.length),
    missingCount ? `${missingCount} gap${missingCount === 1 ? '' : 's'}` : null,
    warningCount ? `${warningCount} review` : null,
    sensitiveCount ? `${sensitiveCount} sensitive` : null,
  ].filter(Boolean);

  return {
    id: `summary:${branch.key}`,
    type: branch.types[0],
    label: nodes.length ? typeLabel(branch.types[0]) : 'No records found',
    subtitle: subtitleParts.join(' | ') || branch.subtitle,
    status,
    missingEvidence: nodes.length
      ? []
      : [`No ${branch.label.toLowerCase()} evidence found.`],
  } satisfies EvidenceNode;
}

function typeIcon(type: EvidenceNodeType) {
  if (type === 'employee') return UserRound;
  if (
    type === 'material_budget' ||
    type === 'material_lot' ||
    type === 'material_consumption' ||
    type === 'material_receipt' ||
    type === 'material_request' ||
    type === 'inventory_ledger'
  )
    return Package;
  if (type === 'journal') return Landmark;
  if (type === 'billing') return FileText;
  if (type === 'audit') return ShieldCheck;
  if (type === 'document') return FileText;
  if (type === 'missing') return AlertTriangle;
  return Network;
}

function branchStatus(nodes: EvidenceNode[]): EvidenceNodeStatus {
  if (nodes.some((node) => node.status === 'missing')) return 'missing';
  if (nodes.some((node) => node.status === 'warning')) return 'warning';
  if (nodes.some((node) => node.status === 'sensitive')) return 'sensitive';
  return 'ok';
}

function StatusBadge({ status }: { status: EvidenceNodeStatus }) {
  if (status === 'ok') return <Badge className="bg-emerald-600">OK</Badge>;
  if (status === 'sensitive')
    return <Badge className="bg-blue-600">Sensitive</Badge>;
  if (status === 'missing') return <Badge variant="destructive">Missing</Badge>;
  return <Badge variant="secondary">Review</Badge>;
}

function MindMapNode({
  node,
  selected,
  x,
  y,
  width,
  onClick,
  branch,
}: {
  node: EvidenceNode;
  selected: boolean;
  x: number;
  y: number;
  width: number;
  onClick?: () => void;
  branch?: boolean;
}) {
  const Icon = typeIcon(node.type);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`absolute rounded-md border px-3 py-2 text-left shadow-sm transition ${
        onClick
          ? 'cursor-pointer hover:border-primary/60 hover:shadow-md'
          : 'cursor-default'
      } ${statusClass(node.status)} ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
      style={{
        left: x - width / 2,
        top: y - (branch ? 42 : 34),
        width,
      }}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={`${branch ? 'h-5 w-5' : 'h-4 w-4'} mt-0.5 flex-shrink-0`}
        />
        <div className="min-w-0">
          <div
            className={`${branch ? 'text-sm' : 'text-xs'} truncate font-semibold`}
          >
            {node.label}
          </div>
          {node.subtitle && (
            <div
              className={`${branch ? 'text-xs' : 'text-[11px]'} mt-0.5 line-clamp-2 opacity-75`}
            >
              {node.subtitle}
            </div>
          )}
        </div>
      </div>
      {node.missingEvidence?.length ? (
        <div className="mt-1 flex items-center gap-1 text-[11px] font-medium">
          <AlertTriangle className="h-3 w-3" />
          {node.missingEvidence.length} gap
          {node.missingEvidence.length === 1 ? '' : 's'}
        </div>
      ) : null}
    </button>
  );
}

function MindMapCanvas({
  data,
  selectedBranchKey,
  onSelectBranch,
}: {
  data: EvidenceMapResponse;
  selectedBranchKey: string | null;
  onSelectBranch: (key: string) => void;
}) {
  const canvas = { width: 1900, height: 1240 };
  const center = { x: 950, y: 620 };

  const centerNode: EvidenceNode = {
    id: `mind-center:${data.project.id}`,
    type: 'project',
    label: data.project.project_code,
    subtitle: `${data.project.project_name} | ${data.summary.liveLaborSessionCount ?? 0} sessions | ${data.summary.materialConsumptionCount ?? 0} material draws`,
    status: data.summary.missingEvidenceCount ? 'warning' : 'ok',
  };

  const branches = branchDefs.map((branch) => {
    const nodes = data.nodes.filter((node) => branch.types.includes(node.type));
    const point = branchLayout[branch.key];
    return {
      ...branch,
      point,
      status: nodes.length ? branchStatus(nodes) : 'missing',
      nodes,
      summary: summarizeBranch(nodes, branch),
    };
  });

  return (
    <div className="overflow-auto rounded-md border bg-[#f8fafc] p-3">
      <div
        className="relative"
        style={{ width: canvas.width, height: canvas.height }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${canvas.width} ${canvas.height}`}
          aria-hidden="true"
        >
          <defs>
            <filter
              id="softShadow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="1.5"
                stdDeviation="2"
                floodOpacity="0.16"
              />
            </filter>
          </defs>
          {branches.map((branch) => (
            <line
              key={`center-line-${branch.key}`}
              x1={center.x}
              y1={center.y}
              x2={branch.point.x}
              y2={branch.point.y}
              className={
                branch.status === 'missing'
                  ? 'stroke-red-300'
                  : branch.status === 'warning'
                    ? 'stroke-amber-300'
                    : 'stroke-slate-300'
              }
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
          <rect
            x={center.x - 245}
            y={center.y - 78}
            width={490}
            height={156}
            rx={22}
            fill="white"
            filter="url(#softShadow)"
          />
        </svg>

        <MindMapNode
          node={centerNode}
          selected={false}
          x={center.x}
          y={center.y}
          width={460}
          branch
        />

        {branches.map((branch) => (
          <MindMapNode
            key={branch.key}
            node={{
              id: `branch:${branch.key}`,
              type: branch.types[0],
              label: branch.label,
              subtitle: `${branch.nodes.length} item${branch.nodes.length === 1 ? '' : 's'} | ${branch.subtitle}`,
              status: branch.status,
            }}
            selected={selectedBranchKey === branch.key}
            x={branch.point.x}
            y={branch.point.y}
            width={250}
            branch
            onClick={() => onSelectBranch(branch.key)}
          />
        ))}
      </div>
    </div>
  );
}

function FlowMapCanvas({
  data,
  selectedBranchKey,
  onSelectBranch,
}: {
  data: EvidenceMapResponse;
  selectedBranchKey: string | null;
  onSelectBranch: (key: string) => void;
}) {
  const branches = branchDefs.map((branch) => {
    const nodes = data.nodes.filter((node) => branch.types.includes(node.type));
    return {
      ...branch,
      nodes,
      status: nodes.length ? branchStatus(nodes) : 'missing',
      summary: summarizeBranch(nodes, branch),
    };
  });

  return (
    <div className="overflow-auto rounded-md border bg-[#f8fafc] p-4">
      <div className="flex min-w-[1980px] items-stretch gap-4">
        <div className="w-72 flex-shrink-0 rounded-md border border-emerald-300 bg-white p-4 text-left shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
            <Network className="h-5 w-5" />
            {data.project.project_code}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {data.project.project_name}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border bg-muted/40 p-2">
              <div className="text-muted-foreground">Scope</div>
              <div className="font-semibold">All time</div>
            </div>
            <div className="rounded border bg-muted/40 p-2">
              <div className="text-muted-foreground">Labor</div>
              <div className="font-semibold">
                {money(data.summary.totalLaborDollars)}
              </div>
            </div>
            <div className="rounded border bg-muted/40 p-2">
              <div className="text-muted-foreground">Material</div>
              <div className="font-semibold">
                {money(data.summary.materialConsumedCost ?? 0)}
              </div>
            </div>
          </div>
        </div>

        {branches.map((branch) => (
          <div key={branch.key} className="flex items-center gap-4">
            <ArrowRight className="h-5 w-5 flex-shrink-0 text-slate-400" />
            <button
              type="button"
              onClick={() => onSelectBranch(branch.key)}
              className={`w-60 flex-shrink-0 rounded-md border p-3 text-left shadow-sm transition-colors hover:border-primary/60 hover:bg-white ${
                selectedBranchKey === branch.key
                  ? 'ring-2 ring-primary ring-offset-2'
                  : ''
              } ${statusClass(branch.status)}`}
            >
              <div className="flex items-start gap-2">
                {(() => {
                  const Icon = typeIcon(branch.types[0]);
                  return <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />;
                })()}
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{branch.label}</div>
                  <div className="mt-1 text-xs opacity-75">
                    {branch.summary.subtitle}
                  </div>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailValue({ value }: { value: unknown }) {
  if (value == null || value === '')
    return <span className="text-muted-foreground">-</span>;
  if (Array.isArray(value) || typeof value === 'object') {
    return (
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <span>{String(value)}</span>;
}

export default function TransactionEvidenceMap() {
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('radial');
  const [pathsOpen, setPathsOpen] = useState(false);
  const [selectedBranchKey, setSelectedBranchKey] = useState<string | null>(
    null
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<
    ProjectOption[]
  >({
    queryKey: ['/api/edri/transaction-evidence-map/projects'],
    queryFn: () => apiRequest('/api/edri/transaction-evidence-map/projects'),
  });

  const mapUrl = projectId
    ? `/api/edri/transaction-evidence-map?projectId=${encodeURIComponent(projectId)}`
    : '';

  const { data, isLoading, isFetching, error, refetch } =
    useQuery<EvidenceMapResponse>({
      queryKey: ['transaction-evidence-map', projectId],
      queryFn: () => apiRequest(mapUrl),
      enabled: !!projectId,
    });

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects.slice(0, 50);
    return projects
      .filter((project) =>
        `${projectCode(project)} ${projectName(project)}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 50);
  }, [projects, search]);

  const selectedNode =
    data?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedBranch = selectedBranchKey
    ? (branchDefs.find((branch) => branch.key === selectedBranchKey) ?? null)
    : null;
  const selectedBranchNodes =
    selectedBranch && data
      ? data.nodes.filter((node) => selectedBranch.types.includes(node.type))
      : [];
  const nodeById = useMemo(
    () => new Map((data?.nodes ?? []).map((node) => [node.id, node])),
    [data?.nodes]
  );

  return (
    <div className="space-y-5 p-6">
      <EdriSubNav />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Network className="h-6 w-6 text-primary" />
            Project Transaction Evidence Map
          </h1>
          <p className="text-sm text-muted-foreground">
            Follow one active project outward to the people, punches, materials,
            costs, books, audit trail, and proof behind it.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={!projectId || isFetching}
        >
          {isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="rounded-md border bg-background p-4">
        <div className="space-y-2">
          <Label htmlFor="projectSearch">Project</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="projectSearch"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search project code or name"
                className="pl-9"
              />
            </div>
            <Select
              value={projectId || undefined}
              onValueChange={(value) => {
                setProjectId(value);
                setSelectedNodeId(null);
                setSelectedBranchKey(null);
              }}
            >
              <SelectTrigger className="min-w-[280px]">
                <SelectValue
                  placeholder={
                    projectsLoading ? 'Loading projects...' : 'Select project'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {filteredProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {projectCode(project)} - {projectName(project)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {(error as Error).message}
        </div>
      )}

      {!projectId && (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          Select an active project to build its all-time transaction evidence map.
        </div>
      )}

      {isLoading && projectId && (
        <div className="flex items-center gap-2 rounded-md border p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building evidence map...
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Labor records</div>
              <div className="text-xl font-semibold">
                {data.summary.laborRecordCount}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Live sessions</div>
              <div className="text-xl font-semibold">
                {data.summary.liveLaborSessionCount ?? 0}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Employees</div>
              <div className="text-xl font-semibold">
                {data.summary.employeeCount}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Costed hours</div>
              <div className="text-xl font-semibold">
                {data.summary.totalHours.toFixed(2)}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Live hours</div>
              <div className="text-xl font-semibold">
                {(data.summary.liveLaborHours ?? 0).toFixed(2)}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Labor dollars</div>
              <div className="text-xl font-semibold">
                {money(data.summary.totalLaborDollars)}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">
                Material items
              </div>
              <div className="text-xl font-semibold">
                {data.summary.materialEvidenceCount ?? 0}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">
                Material draws
              </div>
              <div className="text-xl font-semibold">
                {data.summary.materialConsumptionCount ?? 0}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Material cost</div>
              <div className="text-xl font-semibold">
                {money(data.summary.materialConsumedCost ?? 0)}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">
                Journal entries
              </div>
              <div className="text-xl font-semibold">
                {data.summary.journalEntryCount}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">
                Customer invoices
              </div>
              <div className="text-xl font-semibold">
                {data.summary.customerInvoiceCount ?? 0}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Documents</div>
              <div className="text-xl font-semibold">
                {data.summary.documentCount}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Audit events</div>
              <div className="text-xl font-semibold">
                {data.summary.auditEventCount}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Missing</div>
              <div className="text-xl font-semibold">
                {data.summary.missingEvidenceCount}
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-background p-3">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold">Evidence Map</h2>
                <p className="text-xs text-muted-foreground">
                  Summary-first view. Click a branch to expand the underlying
                  records.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border bg-muted/40 p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={mapViewMode === 'radial' ? 'default' : 'ghost'}
                    className="h-8 gap-1"
                    onClick={() => setMapViewMode('radial')}
                  >
                    <GitFork className="h-4 w-4" />
                    Radial
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mapViewMode === 'flow' ? 'default' : 'ghost'}
                    className="h-8 gap-1"
                    onClick={() => setMapViewMode('flow')}
                  >
                    <ListTree className="h-4 w-4" />
                    Left to right
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setPathsOpen(true)}
                >
                  <PanelRightOpen className="h-4 w-4" />
                  Evidence Paths
                </Button>
              </div>
            </div>

            {mapViewMode === 'radial' ? (
              <MindMapCanvas
                data={data}
                selectedBranchKey={selectedBranchKey}
                onSelectBranch={setSelectedBranchKey}
              />
            ) : (
              <FlowMapCanvas
                data={data}
                selectedBranchKey={selectedBranchKey}
                onSelectBranch={setSelectedBranchKey}
              />
            )}
          </div>

          {data.missingEvidence.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <h2 className="mb-2 font-semibold">Missing or Weak Evidence</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {data.missingEvidence.map((item) => (
                  <button
                    key={`${item.nodeId}-${item.message}`}
                    type="button"
                    className="rounded-md border border-amber-200 bg-background/80 p-3 text-left text-sm"
                    onClick={() => setSelectedNodeId(item.nodeId)}
                  >
                    <div className="font-medium">{item.nodeLabel}</div>
                    <div className="text-xs">{item.message}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Sheet open={pathsOpen} onOpenChange={setPathsOpen}>
        <SheetContent className="w-full overflow-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              Evidence Paths
              <StatusBadge
                status={data?.summary.missingEvidenceCount ? 'warning' : 'ok'}
              />
            </SheetTitle>
            <SheetDescription>
              {data?.edges.length ?? 0} relationships in this map
            </SheetDescription>
          </SheetHeader>
          <div className="mt-5 space-y-2">
            {(data?.edges ?? []).map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              return (
                <button
                  key={edge.id}
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(edge.to);
                    setPathsOpen(false);
                  }}
                  className="w-full cursor-pointer rounded-md border p-3 text-left text-xs transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge status={edge.status} />
                    <span className="font-medium">{edge.label}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {from?.label ?? edge.from} -&gt; {to?.label ?? edge.to}
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!selectedBranch}
        onOpenChange={(open) => !open && setSelectedBranchKey(null)}
      >
        <SheetContent className="w-full overflow-auto sm:max-w-2xl">
          {selectedBranch && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedBranch.label}
                  <StatusBadge
                    status={
                      selectedBranchNodes.length
                        ? branchStatus(selectedBranchNodes)
                        : 'missing'
                    }
                  />
                </SheetTitle>
                <SheetDescription>
                  {selectedBranchNodes.length} record
                  {selectedBranchNodes.length === 1 ? '' : 's'} |{' '}
                  {selectedBranch.subtitle}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-3">
                {selectedBranch.key === 'audit' && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                    Audit log records are tucked here so the map stays readable.
                    Open a record for hash, actor, sequence, and linked ledger
                    details.
                  </div>
                )}

                {selectedBranchNodes.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                    No records found for this branch.
                  </div>
                ) : (
                  selectedBranchNodes.map((node) => {
                    const Icon = typeIcon(node.type);
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => {
                          setSelectedBranchKey(null);
                          setSelectedNodeId(node.id);
                        }}
                        className="w-full cursor-pointer rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2">
                            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">
                                {node.label}
                              </div>
                              {node.subtitle && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {node.subtitle}
                                </div>
                              )}
                            </div>
                          </div>
                          <StatusBadge status={node.status} />
                        </div>
                        {node.metrics && (
                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                            {Object.entries(node.metrics)
                              .slice(0, 3)
                              .map(([key, value]) => (
                                <div
                                  key={key}
                                  className="rounded border bg-muted/40 p-2"
                                >
                                  <div className="text-muted-foreground">
                                    {key}
                                  </div>
                                  <div className="truncate font-medium">
                                    {String(value ?? '-')}
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                        {node.missingEvidence?.length ? (
                          <div className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700">
                            <AlertTriangle className="h-3 w-3" />
                            {node.missingEvidence.length} gap
                            {node.missingEvidence.length === 1 ? '' : 's'}
                          </div>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!selectedNode}
        onOpenChange={(open) => !open && setSelectedNodeId(null)}
      >
        <SheetContent className="w-full overflow-auto sm:max-w-xl">
          {selectedNode && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedNode.label}
                  <StatusBadge status={selectedNode.status} />
                </SheetTitle>
                <SheetDescription>
                  {selectedNode.subtitle ||
                    selectedNode.type.replaceAll('_', ' ')}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-5">
                {selectedNode.links?.length ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Open Evidence</h3>
                    {selectedNode.links.map((link) => (
                      <a
                        key={`${link.href}-${link.label}`}
                        href={link.href}
                        target={link.kind === 'api' ? '_blank' : undefined}
                        rel={link.kind === 'api' ? 'noreferrer' : undefined}
                        className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
                      >
                        <span>{link.label}</span>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                ) : null}

                {selectedNode.missingEvidence?.length ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <h3 className="mb-2 font-semibold">
                      Missing or Weak Evidence
                    </h3>
                    <ul className="space-y-1">
                      {selectedNode.missingEvidence.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {selectedNode.metrics && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Metrics</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.entries(selectedNode.metrics).map(
                        ([key, value]) => (
                          <div key={key} className="rounded-md border p-2">
                            <div className="text-xs text-muted-foreground">
                              {key}
                            </div>
                            <div className="font-medium">
                              {String(value ?? '-')}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                {selectedNode.details && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      Source Record
                    </h3>
                    <div className="space-y-2 text-sm">
                      {Object.entries(selectedNode.details).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className="grid gap-1 rounded-md border p-2"
                          >
                            <div className="text-xs text-muted-foreground">
                              {key}
                            </div>
                            <DetailValue value={value} />
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
