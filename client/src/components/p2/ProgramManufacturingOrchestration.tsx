import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Layers3,
  PackageCheck,
  Route,
  Truck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

type AssemblyStatus = 'PLANNED' | 'READY' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETE';

interface QueueLink {
  id: string;
  label: string;
  department: string | null;
  status: string | null;
  manufacturingQueueId: number | null;
  productionWorkOrderId: string | null;
  travelerId: string | null;
  p2WorkOrderAuthorityId?: string | null;
  departmentId?: number | null;
  projectId?: string | null;
}

export interface ProgramAssembly {
  id: string;
  assemblyCode: string;
  assemblyName: string;
  level: number;
  sequence: number;
  assemblyType: string;
  partNumber: string | null;
  status: string;
  computedStatus: AssemblyStatus;
  completionPercent: number;
  totalQueueItems: number;
  completedQueueItems: number;
  links: QueueLink[];
  blockedBy: {
    assemblyId: string;
    assemblyCode: string;
    assemblyName: string;
    dependencyType: string;
    notes: string | null;
  }[];
  children: ProgramAssembly[];
}

interface ProgramManufacturingStatus {
  ready: boolean;
  build: {
    id: string;
    projectId: string | null;
    projectCode: string | null;
    projectName: string | null;
    programCode: string;
    programName: string;
    buildName: string;
    buildType: string;
    status: string;
    targetShipDate: string | null;
    customerName: string | null;
    poNumber: string | null;
  } | null;
  summary: {
    totalAssemblies: number;
    completeAssemblies: number;
    blockedAssemblies: number;
    inProgressAssemblies: number;
    totalQueueItems: number;
    completedQueueItems: number;
    completionPercent: number;
    shipReady: boolean;
    criticalPath: ProgramAssembly[];
  };
  assemblies: ProgramAssembly[];
  flatAssemblies: ProgramAssembly[];
  blockers: ProgramAssembly[];
  swimlanes: {
    name: string;
    assemblies: ProgramAssembly[];
    completionPercent: number;
    blockedCount: number;
  }[];
}

interface ProgramManufacturingOrchestrationProps {
  mode: 'overview' | 'tree' | 'swimlane';
  projectId?: string;
  compact?: boolean;
}

function statusVariant(status: AssemblyStatus) {
  if (status === 'COMPLETE') return 'default';
  if (status === 'BLOCKED') return 'destructive';
  return 'secondary';
}

function statusLabel(status: AssemblyStatus) {
  return status.replace(/_/g, ' ');
}

function queueLinkHref(link: QueueLink) {
  if (link.p2WorkOrderAuthorityId && link.departmentId != null) {
    const projectQuery = link.projectId ? `?projectId=${encodeURIComponent(link.projectId)}` : '';
    return `/p2-work-orders/queues/${link.departmentId}${projectQuery}`;
  }
  if (link.travelerId) return `/travelers/${encodeURIComponent(link.travelerId)}`;
  if (link.manufacturingQueueId != null) return '/manufacturing-queue';
  return null;
}

function QueueLinkBadge({ link }: { link: QueueLink }) {
  const href = queueLinkHref(link);
  const badge = <Badge variant="outline" className={`text-[11px] ${href ? 'hover:bg-muted' : ''}`}>{link.label}{link.department ? ` - ${link.department}` : ''}</Badge>;
  return href ? <Link href={href} aria-label={`Open ${link.label}`}>{badge}</Link> : badge;
}

function buildStatusUrl(projectId?: string) {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  const qs = params.toString();
  return `/api/program-manufacturing/status${qs ? `?${qs}` : ''}`;
}

async function fetchProgramStatus(projectId?: string): Promise<ProgramManufacturingStatus> {
  const res = await fetch(buildStatusUrl(projectId));
  if (!res.ok) throw new Error('Failed to fetch program manufacturing status');
  return res.json();
}

function EmptyProgramState({ compact = false }: { compact?: boolean }) {
  return (
    <Card>
      <CardContent className={compact ? 'p-4' : 'p-8 text-center'}>
        <PackageCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">No program build is active</p>
        <p className="text-xs text-muted-foreground mt-1">
          Production Map appears once the project has released Frozen Production Demand.
        </p>
      </CardContent>
    </Card>
  );
}

function AssemblyRow({ assembly }: { assembly: ProgramAssembly }) {
  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{assembly.assemblyCode}</span>
            <span className="font-medium">{assembly.assemblyName}</span>
            {assembly.partNumber && <Badge variant="outline">{assembly.partNumber}</Badge>}
          </div>
          {assembly.blockedBy.length > 0 && (
            <p className="text-xs text-red-600 mt-1">
              Blocked by {assembly.blockedBy.map((b) => b.assemblyCode).join(', ')}
            </p>
          )}
        </div>
        <Badge variant={statusVariant(assembly.computedStatus)}>
          {statusLabel(assembly.computedStatus)}
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <Progress value={assembly.completionPercent} className="h-2" />
        <span className="text-xs text-muted-foreground w-10 text-right">{assembly.completionPercent}%</span>
      </div>
      {assembly.links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {assembly.links.map((link) => (
            <QueueLinkBadge key={link.id} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssemblyTreeNode({ assembly }: { assembly: ProgramAssembly }) {
  return (
    <div className="space-y-2">
      <AssemblyRow assembly={assembly} />
      {assembly.children.length > 0 && (
        <div className="ml-4 pl-4 border-l space-y-2">
          {assembly.children.map((child) => (
            <AssemblyTreeNode key={child.id} assembly={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function Overview({ data }: { data: ProgramManufacturingStatus }) {
  const build = data.build!;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Layers3 className="h-4 w-4" />
              Program Health
            </div>
            <div className="text-2xl font-bold mt-2">{data.summary.completionPercent}%</div>
            <Progress value={data.summary.completionPercent} className="h-2 mt-3" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Blocked
            </div>
            <div className="text-2xl font-bold mt-2">{data.summary.blockedAssemblies}</div>
            <p className="text-xs text-muted-foreground">{data.summary.inProgressAssemblies} in progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Assemblies
            </div>
            <div className="text-2xl font-bold mt-2">{data.summary.completeAssemblies}/{data.summary.totalAssemblies}</div>
            <p className="text-xs text-muted-foreground">complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Route className="h-4 w-4" />
              Queue Links
            </div>
            <div className="text-2xl font-bold mt-2">{data.summary.completedQueueItems}/{data.summary.totalQueueItems}</div>
            <p className="text-xs text-muted-foreground">complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Truck className="h-4 w-4" />
              Ship Ready
            </div>
            <div className="text-2xl font-bold mt-2">{data.summary.shipReady ? 'Yes' : 'No'}</div>
            <p className="text-xs text-muted-foreground">{build.targetShipDate ?? 'No target date'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>{build.buildName}</span>
            {build.projectId && (
              <Link href={`/pm-control-center?project=${build.projectId}`} className="text-sm font-normal text-blue-600 hover:underline">
                Open PM
              </Link>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Critical Path</p>
            <div className="space-y-2 mt-2">
              {data.summary.criticalPath.length > 0
                ? data.summary.criticalPath.map((assembly) => <AssemblyRow key={assembly.id} assembly={assembly} />)
                : <p className="text-sm text-muted-foreground">No open critical path items.</p>}
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Blocked Assemblies</p>
            <div className="space-y-2 mt-2">
              {data.blockers.length > 0
                ? data.blockers.map((assembly) => <AssemblyRow key={assembly.id} assembly={assembly} />)
                : <p className="text-sm text-muted-foreground">No assembly blockers.</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tree({ data }: { data: ProgramManufacturingStatus }) {
  return (
    <div className="space-y-3">
      {data.assemblies.map((assembly) => (
        <AssemblyTreeNode key={assembly.id} assembly={assembly} />
      ))}
    </div>
  );
}

function Swimlane({ data }: { data: ProgramManufacturingStatus }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {data.swimlanes.map((lane) => (
        <Card key={lane.name}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                {lane.name}
              </span>
              <Badge variant={lane.blockedCount > 0 ? 'destructive' : 'secondary'}>
                {lane.completionPercent}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lane.assemblies.map((assembly) => (
              <AssemblyRow key={assembly.id} assembly={assembly} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ProgramManufacturingOrchestration({
  mode,
  projectId,
  compact = false,
}: ProgramManufacturingOrchestrationProps) {
  const { data, isLoading, isError } = useQuery<ProgramManufacturingStatus>({
    queryKey: ['/api/program-manufacturing/status', projectId ?? 'all'],
    queryFn: () => fetchProgramStatus(projectId),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <Skeleton className={compact ? 'h-40 w-full' : 'h-72 w-full'} />;
  }

  if (isError || !data?.build) {
    return <EmptyProgramState compact={compact} />;
  }

  if (mode === 'tree') return <Tree data={data} />;
  if (mode === 'swimlane') return <Swimlane data={data} />;
  return <Overview data={data} />;
}
