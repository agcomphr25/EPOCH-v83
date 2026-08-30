import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AlertTriangle, Boxes, CheckCircle2, ChevronRight, Clock3, Factory, Layers3, RefreshCw, Search, ShoppingCart } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDailyTagUpDate, formatDailyTagUpUpdatedAt } from '@/lib/dailyTagUpDates';
import { apiRequest } from '@/lib/queryClient';

type WorkOrder = {
  authorityId: string; workOrderId: string; workOrderNumber: string; inventoryItemId: number;
  partNumber: string; partName: string; required: number; complete: number; inProgress: number;
  needed: number; status: string; departmentId: number; department: string; readiness: { state: string; reason: string | null };
  dueDate: string | null; travelerId: string | null; travelerNumber: string | null;
};
type Node = {
  id: string; partNumber: string; partName: string; classification: string; source: string;
  required: number; onHand: number; allocated: number; available: number; short: number;
  leadTimeDays: number | null; supplyStatus: string; risk: string | null; children: Node[];
};
type Department = { label: string; required: number; complete: number; inProgress: number; needed: number; blocked: number; nextDue: string | null; workOrders: WorkOrder[] };
type Project = Department & {
  id: string; projectCode: string; projectName: string; customer: string; customerPoId: number | null;
  customerPo: string; dueDate: string | null; percentComplete: number | null; configurationStatus: string;
  purchasingShortages: number; departments: Department[]; assemblyTree: Node[]; materials: Node[];
  issues: { type: string; message: string; href: string; record: string }[];
};
type Model = {
  generatedAt: string;
  summary: { activeProjects: number; required: number; complete: number; inProgress: number; needed: number; blocked: number; dueWithinWindow: number; purchasingShortages: number };
  filters: { projects: { id: string; label: string }[]; customers: string[]; customerPos: string[]; departments: string[] };
  projects: Project[];
};

const fmt = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
const tone = (state: string) => state.includes('BLOCKED') || state.includes('NOT READY') ? 'destructive' : state === 'READY' || state === 'COMPLETE' ? 'default' : 'secondary';

export default function DailyTagUpPage() {
  const [filters, setFilters] = useState({ projectId: 'all', customer: 'all', customerPo: 'all', department: 'all', source: 'both', attentionDays: '14', status: 'all', search: '', problemsOnly: false });
  const [searchDraft, setSearchDraft] = useState('');
  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== 'all' && value !== '' && value !== false) params.set(key, String(value));
    });
    return params.toString();
  }, [filters]);
  const { data, isLoading, isError, refetch, isFetching } = useQuery<Model>({
    queryKey: ['/api/daily-tag-up', query],
    queryFn: () => apiRequest(`/api/daily-tag-up?${query}`),
    refetchInterval: 60_000,
  });
  const update = (key: string, value: string | boolean) => setFilters((current) => ({ ...current, [key]: value }));

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading current production authority…</div>;
  if (isError || !data) return <div className="p-8"><Card><CardContent className="p-6 text-destructive">Daily Tag Up could not load. Your access or the current production schema may need attention.</CardContent></Card></div>;

  const cards = [
    ['Active Projects', data.summary.activeProjects, Layers3], ['Total Demand', data.summary.required, Boxes],
    ['Complete', data.summary.complete, CheckCircle2], ['In Progress', data.summary.inProgress, Factory],
    ['Remaining / Needed', data.summary.needed, Clock3], ['Blocked', data.summary.blocked, AlertTriangle],
    ['Due in Window', data.summary.dueWithinWindow, Clock3], ['Purchasing Shortages', data.summary.purchasingShortages, ShoppingCart],
  ] as const;

  return <div className="min-h-screen bg-muted/20 p-4 lg:p-6" data-testid="daily-tag-up-page">
    <div className="mx-auto max-w-[1800px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-bold tracking-tight">Daily Tag Up</h1><p className="text-muted-foreground">Live management visibility over released P2 demand and actual work orders</p></div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} data-testid="daily-tag-up-refresh"><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />Refresh</Button>
      </div>

      <Card className="sticky top-0 z-20 shadow-sm"><CardContent className="p-4">
        <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Filter label="Project" value={filters.projectId} onChange={(v) => update('projectId', v)} values={data.filters.projects.map((x) => [x.id, x.label])} />
          <Filter label="Customer" value={filters.customer} onChange={(v) => update('customer', v)} values={data.filters.customers.map((x) => [x, x])} />
          <Filter label="Customer PO" value={filters.customerPo} onChange={(v) => update('customerPo', v)} values={data.filters.customerPos.map((x) => [x, x])} />
          <Filter label="Department" value={filters.department} onChange={(v) => update('department', v)} values={data.filters.departments.map((x) => [x, x])} />
          <Filter label="Source" value={filters.source} onChange={(v) => update('source', v)} includeAll={false} values={[["manufacturing","Manufacturing"],["purchasing","Purchasing"],["both","Both"]]} />
          <Filter label="Needs attention" value={filters.attentionDays} onChange={(v) => update('attentionDays', v)} includeAll={false} values={[["0","Today"],["3","3 Days"],["7","7 Days"],["14","14 Days"],["30","30 Days"],["all","All"]]} />
          <Filter label="Status" value={filters.status} onChange={(v) => update('status', v)} values={[["needed","Needed"],["ready","Ready"],["in_progress","In Progress"],["blocked","Blocked"],["complete","Complete"]]} />
          <div className="space-y-1"><span className="text-xs font-medium">Search</span><div className="flex"><Input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && update('search', searchDraft)} placeholder="Project, PO, WO, part…" className="rounded-r-none" /><Button size="icon" className="rounded-l-none" onClick={() => update('search', searchDraft)}><Search className="h-4 w-4" /></Button></div></div>
        </div>
        <div className="mt-3 flex items-center gap-3"><Button variant={filters.problemsOnly ? 'default' : 'outline'} size="sm" onClick={() => update('problemsOnly', !filters.problemsOnly)}>Show Only Problems</Button><span className="text-xs text-muted-foreground">Updated {formatDailyTagUpUpdatedAt(data.generatedAt)}</span></div>
      </CardContent></Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">{cards.map(([label, value, Icon]) => <Card key={label}><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-muted-foreground" /></div><div className="mt-2 text-2xl font-bold">{fmt(value)}</div></CardContent></Card>)}</div>

      {data.projects.length === 0 ? <Card><CardContent className="p-10 text-center text-muted-foreground">No authoritative project demand matches these filters.</CardContent></Card> : data.projects.map((project) => <ProjectCard key={project.id} project={project} />)}
    </div>
  </div>;
}

function Filter({ label, value, onChange, values, includeAll = true }: { label: string; value: string; onChange: (value: string) => void; values: string[][]; includeAll?: boolean }) {
  return <div className="space-y-1"><span className="text-xs font-medium">{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{includeAll && <SelectItem value="all">All</SelectItem>}{values.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></div>;
}

function ProjectCard({ project }: { project: Project }) {
  return <details className="group rounded-lg border bg-card" open data-testid={`project-${project.id}`}>
    <summary className="cursor-pointer list-none p-4"><div className="flex flex-wrap items-center gap-4"><ChevronRight className="h-5 w-5 transition-transform group-open:rotate-90" /><div className="min-w-[240px] flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-lg font-semibold">{project.projectCode} — {project.projectName}</span><Badge variant={project.configurationStatus.startsWith('RELEASED') ? 'default' : 'destructive'}>{project.configurationStatus}</Badge></div><div className="text-sm text-muted-foreground">{project.customer} · PO {project.customerPo} · Due {formatDailyTagUpDate(project.dueDate)}</div></div><Metric label="Required" value={project.required} /><Metric label="Complete" value={project.complete} /><Metric label="In Progress" value={project.inProgress} /><Metric label="Needed" value={project.needed} /><Metric label="Blocked" value={project.blocked} /><Metric label="Complete" value={project.percentComplete == null ? 'Unavailable' : `${project.percentComplete}%`} /></div></summary>
    <div className="border-t p-4"><Tabs defaultValue="department"><TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="department">Department Demand</TabsTrigger><TabsTrigger value="assembly">Assembly Tree</TabsTrigger><TabsTrigger value="materials">BOM / Materials</TabsTrigger><TabsTrigger value="purchasing">Purchasing</TabsTrigger><TabsTrigger value="issues">Issues ({project.issues.length})</TabsTrigger></TabsList>
      <TabsContent value="overview"><div className="grid gap-3 md:grid-cols-4"><MetricCard label="Customer / PO" value={`${project.customer} / ${project.customerPo}`} /><MetricCard label="Project due" value={formatDailyTagUpDate(project.dueDate)} /><MetricCard label="Released demand" value={fmt(project.required)} /><MetricCard label="Purchasing shortages" value={project.purchasingShortages} /></div></TabsContent>
      <TabsContent value="department"><DepartmentTable departments={project.departments} project={project} /></TabsContent>
      <TabsContent value="assembly"><Card><CardContent className="p-4">{project.assemblyTree.length ? project.assemblyTree.map((node) => <TreeNode key={node.id} node={node} />) : <Empty text="No released Frozen Production Demand hierarchy is available." />}</CardContent></Card></TabsContent>
      <TabsContent value="materials"><Materials nodes={project.materials} /></TabsContent>
      <TabsContent value="purchasing"><Materials nodes={project.materials} purchasing /></TabsContent>
      <TabsContent value="issues"><Card><CardContent className="divide-y p-0">{project.issues.length ? project.issues.map((issue, index) => <div key={`${issue.record}-${index}`} className="flex items-start gap-3 p-4"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" /><div className="flex-1"><Badge variant="outline">{issue.type}</Badge><div className="mt-1 text-sm">{issue.message}</div></div><Link href={issue.href} className="text-sm text-primary hover:underline">{issue.record}</Link></div>) : <Empty text="No current authoritative exceptions." />}</CardContent></Card></TabsContent>
    </Tabs></div>
  </details>;
}

function DepartmentTable({ departments, project }: { departments: Department[]; project: Project }) {
  if (!departments.length) return <Empty text="No actual work orders match this view." />;
  return <div className="space-y-2">{departments.map((department) => <details key={department.label} className="group rounded-md border" data-testid={`department-${department.label}`}><summary className="cursor-pointer list-none p-3"><div className="grid items-center gap-2 md:grid-cols-[2fr_repeat(6,1fr)]"><span className="font-semibold"><ChevronRight className="mr-2 inline h-4 w-4 transition-transform group-open:rotate-90" />{department.label}</span><Metric label="Required" value={department.required} /><Metric label="Complete" value={department.complete} /><Metric label="In Progress" value={department.inProgress} /><Metric label="Needed" value={department.needed} /><Metric label="Blocked" value={department.blocked} /><Metric label="Next Due" value={formatDailyTagUpDate(department.nextDue)} /></div></summary><div className="overflow-x-auto border-t"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted/50 text-left"><tr>{['Work Order','Part','Project / PO','Required','Complete','In Progress','Needed','Readiness','Due','Traveler'].map((x) => <th key={x} className="p-2 font-medium">{x}</th>)}</tr></thead><tbody>{department.workOrders.map((wo) => <tr key={wo.authorityId} className="border-t"><td className="p-2"><Link href={`/p2-work-orders/queues/${wo.departmentId}`} className="font-medium text-primary hover:underline">{wo.workOrderNumber}</Link></td><td className="p-2"><Link href={`/inventory/enhanced-mrp?search=${encodeURIComponent(wo.partNumber)}`} className="text-primary hover:underline">{wo.partNumber}</Link><div className="text-xs text-muted-foreground">{wo.partName}</div></td><td className="p-2"><Link href={`/projects/${project.id}`} className="text-primary hover:underline">{project.projectCode} / {project.customerPo}</Link></td><td className="p-2">{fmt(wo.required)}</td><td className="p-2">{fmt(wo.complete)}</td><td className="p-2">{fmt(wo.inProgress)}</td><td className="p-2">{fmt(wo.needed)}</td><td className="p-2"><Badge variant={tone(wo.readiness.state) as any}>{wo.readiness.state}</Badge>{wo.readiness.reason && <div className="mt-1 max-w-[260px] text-xs text-muted-foreground">{wo.readiness.reason}</div>}</td><td className="p-2">{formatDailyTagUpDate(wo.dueDate)}</td><td className="p-2">{wo.travelerId ? <Link href={`/travelers/${wo.travelerId}`} className="text-primary hover:underline">{wo.travelerNumber || 'Traveler'}</Link> : wo.travelerNumber || 'None'}</td></tr>)}</tbody></table></div></details>)}</div>;
}

function TreeNode({ node }: { node: Node }) { return <details className="ml-3 border-l pl-3" open={node.children.length < 4}><summary className="cursor-pointer py-2"><span className="font-medium">{node.partNumber} — {node.partName}</span> <Badge variant="outline" className="ml-2">{node.classification}</Badge> <Badge variant="secondary" className="ml-1">{node.source === 'manufacturing' ? 'MAKE' : 'BUY'}</Badge><span className="ml-3 text-sm text-muted-foreground">Required {fmt(node.required)} · Available {fmt(node.available)}{node.short > 0 ? ` · Short ${fmt(node.short)}` : ''}</span></summary>{node.children.map((child) => <TreeNode key={child.id} node={child} />)}</details>; }
function Materials({ nodes, purchasing = false }: { nodes: Node[]; purchasing?: boolean }) { return <Card><CardContent className="overflow-x-auto p-0">{nodes.length ? <table className="w-full min-w-[1000px] text-sm"><thead className="bg-muted/50 text-left"><tr>{['Part','Classification','Required','On Hand','Allocated','Available','Open Supply','Short','Lead Time','Risk'].map((x) => <th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{nodes.map((node) => <tr key={node.id} className="border-t"><td className="p-3 font-medium">{node.partNumber}<div className="text-xs font-normal text-muted-foreground">{node.partName}</div></td><td className="p-3">{node.classification}</td><td className="p-3">{fmt(node.required)}</td><td className="p-3">{fmt(node.onHand)}</td><td className="p-3">{fmt(node.allocated)}</td><td className="p-3">{fmt(node.available)}</td><td className="p-3"><Badge variant={node.supplyStatus === 'NO OPEN SUPPLY' ? 'outline' : 'secondary'}>{node.supplyStatus}</Badge></td><td className="p-3 font-medium text-destructive">{node.short > 0 ? fmt(node.short) : '—'}</td><td className="p-3">{node.leadTimeDays == null ? 'Lead time not set' : `${node.leadTimeDays} days`}</td><td className="p-3"><Badge variant={node.risk === 'LATE' || node.risk === 'BUY NOW' ? 'destructive' : 'outline'}>{node.risk || '—'}</Badge></td></tr>)}</tbody></table> : <Empty text={purchasing ? 'No purchasing demand in the released configuration.' : 'No released material demand.'} />}</CardContent></Card>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="text-right"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="font-semibold">{typeof value === 'number' ? fmt(value) : value}</div></div>; }
function MetricCard({ label, value }: { label: string; value: string | number }) { return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{typeof value === 'number' ? fmt(value) : value}</div></CardContent></Card>; }
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-muted-foreground">{text}</div>; }
