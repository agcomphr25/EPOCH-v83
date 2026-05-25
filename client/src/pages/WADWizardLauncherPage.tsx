import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';
import {
  AlertTriangle,
  ClipboardList,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Loader2,
  Search,
  Wand2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type WizardStepData = Record<string, unknown>;
type WizardApprovalRecord = { role: string; decision: string };
type WizardDataShape = {
  [key: `step${number}`]: WizardStepData | undefined;
  approvals?: WizardApprovalRecord[];
  __meta?: { lastEditedBy?: string; lastEditedAt?: string };
};

type ProductionWorkOrderRow = {
  id: string;
  workOrderNumber: string;
  projectId: string | null;
  projectName: string | null;
  projectCode: string | null;
  projectStage: string | null;
  customerName: string | null;
  poNumber: string | null;
  partNumber: string | null;
  description: string | null;
  status: string;
  wadStatus: string | null;
  wizardData: WizardDataShape | null;
  dueDate: string | null;
  updatedAt: string | null;
};

// Server payload for GET /production/wad-status — used when the user toggles the
// "Missing WAD" filter so projects with NO Production Work Order at all (which the
// PWO-anchored /production endpoint cannot return) still appear in the same backlog.
type WadStatusRow = {
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  customerName: string | null;
  currentStage: string | null;
  poNumber: string | null;
  pwoCount: number;
  wadStatus: 'NONE' | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED';
  gateSatisfied: boolean;
  latestPwoId: string | null;
  latestWorkOrderNumber: string | null;
  percentComplete: number;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
};

const wadStatusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
};

const statusColors: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-800',
  READY: 'bg-blue-100 text-blue-800',
  RELEASED: 'bg-indigo-100 text-indigo-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETE: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-200 text-gray-600',
};

const STEP_KEYS = ['step1','step2','step3','step4','step5','step6','step7','step8','step9','step10'] as const;

function calcPercent(wd: WizardDataShape | null | undefined): number {
  if (!wd || typeof wd !== 'object') return 0;
  const filled = STEP_KEYS.filter((k) => {
    const step = wd[k];
    return step != null && Object.keys(step).length > 0;
  }).length;
  const approvalsCount = Array.isArray(wd.approvals) ? wd.approvals.length : 0;
  const approvalsCard = approvalsCount > 0 ? 1 : 0;
  const finalCard = approvalsCount >= 4 ? 1 : 0;
  return Math.round(((filled + approvalsCard + finalCard) / 12) * 100);
}

function fmtEditedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return '—'; }
}

export default function WADWizardLauncherPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const initialSearch = new URLSearchParams(window.location.search).get('search') ?? '';
  const initialMissing = new URLSearchParams(window.location.search).get('missingWad') === '1';
  const [search, setSearch] = useState(initialSearch);
  const [missingOnly, setMissingOnly] = useState(initialMissing);

  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (missingOnly) params.set('missingWad', '1');
  const qs = params.toString();

  // Use the default query fn (auth headers + 401/403 recovery in queryClient.ts)
  // by encoding query string into the URL portion of the queryKey.
  const productionUrl = `/api/work-orders/production${qs ? `?${qs}` : ''}`;
  const { data: workOrders = [], isLoading, isError, error } = useQuery<ProductionWorkOrderRow[]>({
    queryKey: [productionUrl],
  });

  const searchTerm = search.trim();

  // Also pull the WAD Status list when users search. The production-WO endpoint
  // cannot return a project that has no PWO yet, so project-code searches like
  // "PRJ-002" need the project-level backlog as a fallback.
  const { data: allWadStatus = [], isLoading: isWadStatusLoading } = useQuery<WadStatusRow[]>({
    queryKey: ['/api/work-orders/production/wad-status'],
    enabled: missingOnly || searchTerm.length > 0,
  });
  // "Zero-PWO" backlog: active PO-ready projects whose WAD gate is not
  // satisfied and that have no Production Work Order yet. These projects cannot
  // be returned by the PWO-anchored /production endpoint.
  const zeroPwoProjects = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return allWadStatus.filter((r) => {
      if (r.gateSatisfied || r.pwoCount !== 0) return false;
      if (missingOnly && !q) return true;
      if (!q) return false;
      return Boolean(
        r.projectCode?.toLowerCase().includes(q) ||
        r.projectName?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        r.poNumber?.toLowerCase().includes(q) ||
        r.latestWorkOrderNumber?.toLowerCase().includes(q) ||
        r.wadStatus.toLowerCase().includes(q) ||
        r.currentStage?.toLowerCase().includes(q)
      );
    });
  }, [allWadStatus, missingOnly, searchTerm]);

  const ensurePwoMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest(`/api/work-orders/production/ensure-for-project/${projectId}`, { method: 'POST' });
    },
    onSuccess: (result: { workOrder: { id: string }; created: boolean }) => {
      toast({
        title: result.created ? 'Production Work Order created' : 'Existing PWO found',
        description: 'Opening the WAD Wizard…',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production'] });
      navigate(`/work-orders/${result.workOrder.id}/wizard`);
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create PWO', description: err.message, variant: 'destructive' });
    },
  });

  // Local fallback filter so users can still narrow client-side without a round trip.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workOrders;
    return workOrders.filter((wo) => {
      return (
        wo.workOrderNumber?.toLowerCase().includes(q) ||
        wo.projectName?.toLowerCase().includes(q) ||
        wo.projectCode?.toLowerCase().includes(q) ||
        wo.customerName?.toLowerCase().includes(q) ||
        wo.poNumber?.toLowerCase().includes(q) ||
        wo.partNumber?.toLowerCase().includes(q) ||
        wo.description?.toLowerCase().includes(q) ||
        wo.wadStatus?.toLowerCase().includes(q) ||
        wo.status?.toLowerCase().includes(q)
      );
    });
  }, [workOrders, search]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-blue-600" />
            WAD Wizard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a Production Work Order to author, edit, or review its Work Authorization Document.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate('/wad-status')}
          data-testid="button-open-wad-status"
        >
          <LayoutDashboard className="h-4 w-4 mr-2" />
          WAD Status Dashboard
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Production Work Orders
          </CardTitle>
          <CardDescription>
            Each WAD is anchored to a Production Work Order. Open the wizard to walk through the 12-step authorization,
            or jump to the work order detail page for full context.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="input-search-work-orders"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by WO #, project code/name, PO #, customer, or part…"
                className="pl-9"
              />
            </div>
            <Button
              variant={missingOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMissingOnly((v) => !v)}
              data-testid="button-filter-missing-wad"
              className={missingOnly ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              {missingOnly ? 'Showing: Missing WAD projects' : 'Include Missing WAD projects'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/wad-status')}
              data-testid="button-jump-wad-status"
              title="Includes active PO-ready projects with no PWO yet"
            >
              <LayoutDashboard className="h-3.5 w-3.5 mr-1" />
              Backlog incl. projects without PWOs →
            </Button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading production work orders...
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && isWadStatusLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Checking project WAD backlog...
            </div>
          )}

          {isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Failed to load production work orders: {(error as Error)?.message ?? 'Unknown error'}
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && !isWadStatusLoading && zeroPwoProjects.length === 0 && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">No production work orders match your filters</p>
              <p>
                {missingOnly
                  ? 'No active PO-ready projects are missing a WAD.'
                  : searchTerm
                    ? 'No matching Production Work Orders or project-level WAD backlog entries were found.'
                    : 'Search for a project or include missing WAD projects to author a WAD before a Production Work Order exists.'}
              </p>
            </div>
          )}

          {!isLoading && !isError && (filtered.length > 0 || zeroPwoProjects.length > 0) && (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Project / Customer</TableHead>
                    <TableHead>Part</TableHead>
                    <TableHead>WO Status</TableHead>
                    <TableHead>WAD Status</TableHead>
                    <TableHead className="w-24 text-center">Progress</TableHead>
                    <TableHead className="hidden md:table-cell">Last Edited</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((wo) => {
                    const wadStatus = wo.wadStatus ?? 'DRAFT';
                    const pct = wadStatus === 'APPROVED' ? 100 : calcPercent(wo.wizardData);
                    const meta = wo.wizardData?.__meta;
                    const lastEditedAt = meta?.lastEditedAt ?? wo.updatedAt;
                    const lastEditedBy = meta?.lastEditedBy ?? null;
                    return (
                      <TableRow key={wo.id} data-testid={`row-work-order-${wo.id}`}>
                        <TableCell className="font-medium" data-testid={`text-work-order-number-${wo.id}`}>
                          {wo.workOrderNumber}
                        </TableCell>
                        <TableCell className="text-sm">
                          {wo.projectName || wo.projectCode ? (
                            <div className="flex flex-col">
                              <span>{wo.projectCode ? `${wo.projectCode} — ` : ''}{wo.projectName ?? ''}</span>
                              <span className="text-xs text-muted-foreground">
                                {wo.customerName && <>{wo.customerName}{wo.poNumber ? ' · ' : ''}</>}
                                {wo.poNumber && <>PO {wo.poNumber}</>}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {wo.partNumber ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[wo.status] ?? 'bg-gray-100 text-gray-800'}>
                            {wo.status?.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={wadStatusColors[wadStatus] ?? 'bg-gray-100 text-gray-700'}
                            data-testid={`badge-wad-status-${wo.id}`}
                          >
                            {wadStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs" data-testid={`text-wad-progress-${wo.id}`}>
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="font-medium">{pct}%</span>
                            <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className={`h-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell" data-testid={`text-last-edited-${wo.id}`}>
                          {lastEditedBy ? <div className="font-medium text-foreground">{lastEditedBy}</div> : null}
                          <div>{fmtEditedAt(lastEditedAt)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/work-orders/${wo.id}`)}
                              data-testid={`button-view-work-order-${wo.id}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/work-orders/${wo.id}/wad-summary`)}
                              data-testid={`button-view-wad-summary-${wo.id}`}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              Summary
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => navigate(`/work-orders/${wo.id}/wizard`)}
                              data-testid={`button-open-wizard-${wo.id}`}
                            >
                              <Wand2 className="h-3.5 w-3.5 mr-1" />
                              {wadStatus === 'APPROVED' ? 'Review' : 'Open Wizard'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Zero-PWO projects (only when "Missing WAD" filter is active). These
                      projects are in P2 Release / Production but have no Production Work
                      Order yet, so they cannot appear in the PWO-anchored list above.
                      The "Author WAD" action calls ensure-for-project to create the PWO
                      and jumps the user straight into the wizard. */}
                  {zeroPwoProjects.map((p) => (
                    <TableRow key={`zero-pwo-${p.projectId}`} data-testid={`row-zero-pwo-${p.projectId}`} className="bg-amber-50/40">
                      <TableCell className="font-medium text-amber-900 italic">No PWO yet</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span>{p.projectCode ? `${p.projectCode} — ` : ''}{p.projectName ?? ''}</span>
                          <span className="text-xs text-muted-foreground">
                            {p.customerName && <>{p.customerName}{p.poNumber ? ' · ' : ''}</>}
                            {p.poNumber && <>PO {p.poNumber}</>}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">—</TableCell>
                      <TableCell><Badge className="bg-amber-100 text-amber-800">{p.currentStage}</Badge></TableCell>
                      <TableCell><Badge className="bg-red-100 text-red-700">NONE</Badge></TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">0%</TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">—</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => ensurePwoMutation.mutate(p.projectId)}
                          disabled={ensurePwoMutation.isPending}
                          data-testid={`button-author-wad-zero-pwo-${p.projectId}`}
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Author WAD
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
