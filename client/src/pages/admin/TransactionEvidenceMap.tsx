import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Landmark,
  Loader2,
  Network,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type EvidenceNodeStatus = 'ok' | 'warning' | 'missing' | 'sensitive';
type EvidenceNodeType =
  | 'project'
  | 'period'
  | 'work_order'
  | 'employee'
  | 'labor_cost'
  | 'payroll'
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
    year: number;
    month: number;
    label: string;
  };
  summary: {
    laborRecordCount: number;
    employeeCount: number;
    workOrderCount: number;
    journalEntryCount: number;
    documentCount: number;
    auditEventCount: number;
    totalHours: number;
    totalLaborDollars: number;
    missingEvidenceCount: number;
  };
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  missingEvidence: Array<{ nodeId: string; nodeLabel: string; message: string }>;
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

const columnDefs: Array<{ key: string; label: string; types: EvidenceNodeType[] }> = [
  { key: 'scope', label: 'Scope', types: ['project', 'period'] },
  { key: 'source', label: 'Source', types: ['work_order', 'employee'] },
  { key: 'cost', label: 'Labor Cost', types: ['labor_cost'] },
  { key: 'posting', label: 'Posting', types: ['payroll', 'journal'] },
  { key: 'evidence', label: 'Evidence', types: ['audit', 'document', 'missing'] },
];

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function projectCode(project: ProjectOption) {
  return project.projectCode ?? project.project_code ?? project.id;
}

function projectName(project: ProjectOption) {
  return project.projectName ?? project.project_name ?? '';
}

function statusClass(status: EvidenceNodeStatus) {
  if (status === 'ok') return 'border-emerald-300 bg-emerald-50 text-emerald-950';
  if (status === 'sensitive') return 'border-blue-300 bg-blue-50 text-blue-950';
  if (status === 'missing') return 'border-red-300 bg-red-50 text-red-950';
  return 'border-amber-300 bg-amber-50 text-amber-950';
}

function typeIcon(type: EvidenceNodeType) {
  if (type === 'employee') return UserRound;
  if (type === 'journal') return Landmark;
  if (type === 'audit') return ShieldCheck;
  if (type === 'document') return FileText;
  if (type === 'missing') return AlertTriangle;
  return Network;
}

function StatusBadge({ status }: { status: EvidenceNodeStatus }) {
  if (status === 'ok') return <Badge className="bg-emerald-600">OK</Badge>;
  if (status === 'sensitive') return <Badge className="bg-blue-600">Sensitive</Badge>;
  if (status === 'missing') return <Badge variant="destructive">Missing</Badge>;
  return <Badge variant="secondary">Review</Badge>;
}

function NodeButton({
  node,
  selected,
  onClick,
}: {
  node: EvidenceNode;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = typeIcon(node.type);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-md border p-3 shadow-sm transition hover:shadow-md ${statusClass(node.status)} ${
        selected ? 'ring-2 ring-primary ring-offset-2' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{node.label}</div>
            {node.subtitle && <div className="mt-0.5 line-clamp-2 text-xs opacity-75">{node.subtitle}</div>}
          </div>
        </div>
        {node.missingEvidence?.length ? <AlertTriangle className="h-4 w-4 flex-shrink-0" /> : <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
      </div>
      {node.metrics && (
        <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
          {Object.entries(node.metrics).slice(0, 4).map(([key, value]) => (
            <div key={key} className="min-w-0">
              <span className="opacity-65">{key}: </span>
              <span className="font-medium">{String(value ?? '-')}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function DetailValue({ value }: { value: unknown }) {
  if (value == null || value === '') return <span className="text-muted-foreground">-</span>;
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
  const [period, setPeriod] = useState(currentPeriod());
  const [search, setSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectOption[]>({
    queryKey: ['/api/projects'],
    queryFn: () => apiRequest('/api/projects'),
  });

  const mapUrl = projectId
    ? `/api/edri/transaction-evidence-map?projectId=${encodeURIComponent(projectId)}&period=${encodeURIComponent(period)}`
    : '';

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<EvidenceMapResponse>({
    queryKey: ['transaction-evidence-map', projectId, period],
    queryFn: () => apiRequest(mapUrl),
    enabled: !!projectId && !!period,
  });

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects.slice(0, 50);
    return projects
      .filter((project) => `${projectCode(project)} ${projectName(project)}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [projects, search]);

  const selectedNode = data?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const nodeById = useMemo(() => new Map((data?.nodes ?? []).map((node) => [node.id, node])), [data?.nodes]);

  const columns = useMemo(() => {
    return columnDefs.map((column) => ({
      ...column,
      nodes: (data?.nodes ?? []).filter((node) => column.types.includes(node.type)),
    }));
  }, [data?.nodes]);

  return (
    <div className="space-y-5 p-6">
      <EdriSubNav />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Network className="h-6 w-6 text-primary" />
            Transaction Evidence Map
          </h1>
          <p className="text-sm text-muted-foreground">
            Project and payroll-period trace from labor source through GL posting and supporting evidence.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={!projectId || isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 rounded-md border bg-background p-4 lg:grid-cols-[1fr_220px]">
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
            <Select value={projectId || undefined} onValueChange={(value) => {
              setProjectId(value);
              setSelectedNodeId(null);
            }}>
              <SelectTrigger className="min-w-[280px]">
                <SelectValue placeholder={projectsLoading ? 'Loading projects...' : 'Select project'} />
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
        <div className="space-y-2">
          <Label htmlFor="period">Payroll period</Label>
          <Input
            id="period"
            type="month"
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              setSelectedNodeId(null);
            }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {(error as Error).message}
        </div>
      )}

      {!projectId && (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          Select a project and payroll period to build the evidence map.
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
          <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-8">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Labor records</div>
              <div className="text-xl font-semibold">{data.summary.laborRecordCount}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Employees</div>
              <div className="text-xl font-semibold">{data.summary.employeeCount}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Hours</div>
              <div className="text-xl font-semibold">{data.summary.totalHours.toFixed(2)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Labor dollars</div>
              <div className="text-xl font-semibold">{money(data.summary.totalLaborDollars)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Journal entries</div>
              <div className="text-xl font-semibold">{data.summary.journalEntryCount}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Documents</div>
              <div className="text-xl font-semibold">{data.summary.documentCount}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Audit events</div>
              <div className="text-xl font-semibold">{data.summary.auditEventCount}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Missing</div>
              <div className="text-xl font-semibold">{data.summary.missingEvidenceCount}</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto rounded-md border bg-muted/30 p-4">
              <div className="grid min-w-[1100px] grid-cols-5 gap-4">
                {columns.map((column) => (
                  <section key={column.key} className="space-y-3">
                    <div className="sticky top-0 rounded-md bg-background px-3 py-2 text-sm font-semibold shadow-sm">
                      {column.label}
                    </div>
                    {column.nodes.length === 0 ? (
                      <div className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
                        No nodes
                      </div>
                    ) : (
                      column.nodes.map((node) => (
                        <NodeButton
                          key={node.id}
                          node={node}
                          selected={selectedNodeId === node.id}
                          onClick={() => setSelectedNodeId(node.id)}
                        />
                      ))
                    )}
                  </section>
                ))}
              </div>
            </div>

            <aside className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Evidence Paths</h2>
                  <p className="text-xs text-muted-foreground">{data.edges.length} relationships</p>
                </div>
                <StatusBadge status={data.summary.missingEvidenceCount ? 'warning' : 'ok'} />
              </div>
              <div className="max-h-[640px] space-y-2 overflow-auto pr-1">
                {data.edges.map((edge) => {
                  const from = nodeById.get(edge.from);
                  const to = nodeById.get(edge.to);
                  return (
                    <button
                      key={edge.id}
                      type="button"
                      onClick={() => setSelectedNodeId(edge.to)}
                      className="w-full rounded-md border p-2 text-left text-xs hover:bg-muted"
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
            </aside>
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

      <Sheet open={!!selectedNode} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
        <SheetContent className="w-full overflow-auto sm:max-w-xl">
          {selectedNode && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selectedNode.label}
                  <StatusBadge status={selectedNode.status} />
                </SheetTitle>
                <SheetDescription>{selectedNode.subtitle || selectedNode.type.replaceAll('_', ' ')}</SheetDescription>
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
                    <h3 className="mb-2 font-semibold">Missing or Weak Evidence</h3>
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
                      {Object.entries(selectedNode.metrics).map(([key, value]) => (
                        <div key={key} className="rounded-md border p-2">
                          <div className="text-xs text-muted-foreground">{key}</div>
                          <div className="font-medium">{String(value ?? '-')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedNode.details && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Source Record</h3>
                    <div className="space-y-2 text-sm">
                      {Object.entries(selectedNode.details).map(([key, value]) => (
                        <div key={key} className="grid gap-1 rounded-md border p-2">
                          <div className="text-xs text-muted-foreground">{key}</div>
                          <DetailValue value={value} />
                        </div>
                      ))}
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
