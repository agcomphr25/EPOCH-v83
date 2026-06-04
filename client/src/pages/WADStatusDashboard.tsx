import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  FileWarning,
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
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type WadStatusRow = {
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  customerName: string | null;
  currentStage: string;
  poNumber: string | null;
  pwoCount: number;
  wadStatus: 'NONE' | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED';
  gateSatisfied: boolean;
  p2HasProductionDemand: boolean;
  p2PoCount: number;
  p2PoNumbers: string | null;
  p2DemandQuantity: number;
  p2SerializedCount: number;
  p2ActiveUnits: number;
  p2ProductionOrderCount: number;
  p2WadConnectionStatus: 'P2_WAD_APPROVED' | 'P2_WAD_INCOMPLETE' | 'P2_WAD_MISSING' | 'NO_P2_DEMAND';
  latestPwoId: string | null;
  latestWorkOrderNumber: string | null;
  percentComplete: number;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  po_received: 'PO Received',
  p2_release: 'P2 Release',
  production: 'In Production',
};

const WAD_BADGE: Record<string, string> = {
  NONE: 'bg-red-100 text-red-800 border border-red-200',
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
};

const P2_WAD_BADGE: Record<string, string> = {
  P2_WAD_APPROVED: 'bg-green-100 text-green-800 border border-green-200',
  P2_WAD_INCOMPLETE: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  P2_WAD_MISSING: 'bg-red-100 text-red-800 border border-red-200',
  NO_P2_DEMAND: 'bg-gray-100 text-gray-700 border border-gray-200',
};

const P2_WAD_LABEL: Record<string, string> = {
  P2_WAD_APPROVED: 'P2 + WAD ready',
  P2_WAD_INCOMPLETE: 'P2 + WAD incomplete',
  P2_WAD_MISSING: 'P2 needs WAD',
  NO_P2_DEMAND: 'No P2 demand',
};

export default function WADStatusDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing' | 'in_production'>('all');

  const { data = [], isLoading, isError, error } = useQuery<WadStatusRow[]>({
    queryKey: ['/api/work-orders/production/wad-status'],
  });

  const ensureMutation = useMutation({
    mutationFn: async (projectId: string): Promise<{ workOrder: { id: string }; created: boolean }> => {
      // apiRequest already returns the parsed JSON body — calling .json() on it would throw.
      return apiRequest(`/api/work-orders/production/ensure-for-project/${projectId}`, {
        method: 'POST',
      });
    },
    onSuccess: (resp: { workOrder: { id: string }; created: boolean }) => {
      qc.invalidateQueries({ queryKey: ['/api/work-orders/production/wad-status'] });
      qc.invalidateQueries({ queryKey: ['/api/work-orders/production'] });
      toast({
        title: resp.created ? 'Production Work Order created' : 'Opening existing WAD',
        description: resp.created
          ? 'A WAD has been auto-created for this project. Walk through the wizard to author it.'
          : 'Resuming the latest in-progress WAD for this project.',
      });
      navigate(`/work-orders/${resp.workOrder.id}/wizard`);
    },
    onError: (e: Error) => {
      toast({ title: 'Could not open WAD', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((row) => {
      if (filter === 'missing' && row.gateSatisfied) return false;
      if (filter === 'in_production' && row.currentStage !== 'production') return false;
      if (!q) return true;
      return (
        row.projectCode?.toLowerCase().includes(q) ||
        row.projectName?.toLowerCase().includes(q) ||
        row.customerName?.toLowerCase().includes(q) ||
        row.poNumber?.toLowerCase().includes(q) ||
        row.latestWorkOrderNumber?.toLowerCase().includes(q)
      );
    });
  }, [data, search, filter]);

  const counts = useMemo(() => ({
    total: data.length,
    none: data.filter((r) => r.wadStatus === 'NONE').length,
    draft: data.filter((r) => r.wadStatus === 'DRAFT').length,
    pending: data.filter((r) => r.wadStatus === 'PENDING_APPROVAL').length,
    approved: data.filter((r) => r.wadStatus === 'APPROVED').length,
    backfillCandidates: data.filter((r) => r.currentStage === 'production' && !r.gateSatisfied).length,
    p2Demand: data.filter((r) => r.p2HasProductionDemand).length,
    p2WadGaps: data.filter((r) => r.p2HasProductionDemand && !r.gateSatisfied).length,
  }), [data]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-blue-600" />
            WAD Status Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every active PO-ready project with the current state of its Work Authorization Document.
            Backfill missing WADs without changing the project stage — full approvals are recorded as
            <strong> wad_backfill</strong> in the audit ledger.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/wad-wizard')} data-testid="button-open-wad-launcher">
          <Wand2 className="h-4 w-4 mr-2" />
          Launcher
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <SummaryCard label="Projects" value={counts.total} icon={<LayoutDashboard className="h-4 w-4" />} />
        <SummaryCard label="No WAD" value={counts.none} tone="red" icon={<FileWarning className="h-4 w-4" />} />
        <SummaryCard label="Draft" value={counts.draft} tone="gray" icon={<Clock className="h-4 w-4" />} />
        <SummaryCard label="Pending Approval" value={counts.pending} tone="amber" icon={<Clock className="h-4 w-4" />} />
        <SummaryCard label="Approved" value={counts.approved} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
        <SummaryCard label="P2 WAD Gaps" value={counts.p2WadGaps} tone="amber" icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      {counts.backfillCandidates > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>{counts.backfillCandidates}</strong> project{counts.backfillCandidates === 1 ? '' : 's'} already in
            production {counts.backfillCandidates === 1 ? 'is' : 'are'} missing an approved WAD. Approving here records
            a <code>wad_backfill</code> audit event and flips the WAD gate without regressing the stage.
            {counts.p2WadGaps > 0 && (
              <> P2-linked production demand is now shown on this dashboard so the gap is visible without changing production flow.</>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Project WAD Backlog</CardTitle>
          <CardDescription>One row per active project that has reached PO/WAD readiness.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="input-search-wad-status"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project, customer, PO, or WO #…"
                className="pl-9"
              />
            </div>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} testId="chip-filter-all">All</FilterChip>
            <FilterChip active={filter === 'missing'} onClick={() => setFilter('missing')} testId="chip-filter-missing">
              Missing WAD
            </FilterChip>
            <FilterChip active={filter === 'in_production'} onClick={() => setFilter('in_production')} testId="chip-filter-in-production">
              In Production
            </FilterChip>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading WAD status…
            </div>
          )}

          {isError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Failed to load: {(error as Error)?.message ?? 'Unknown error'}
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No projects match the current filters.
            </div>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Customer / PO</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>WAD Status</TableHead>
                    <TableHead>P2 Demand</TableHead>
                    <TableHead className="w-28 text-center">Progress</TableHead>
                    <TableHead>Latest WO</TableHead>
                    <TableHead className="hidden md:table-cell">Last Edited</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const isBackfill = row.currentStage === 'production' && row.wadStatus !== 'APPROVED';
                    const actionLabel = row.wadStatus === 'NONE'
                      ? 'Author WAD'
                      : row.wadStatus === 'APPROVED'
                        ? 'Review'
                        : 'Resume';
                    return (
                      <TableRow key={row.projectId} data-testid={`row-wad-status-${row.projectId}`}>
                        <TableCell className="font-medium text-sm">
                          <div className="flex flex-col">
                            <span>{row.projectCode ?? '—'}</span>
                            {row.projectName && (
                              <span className="text-xs text-muted-foreground">{row.projectName}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span>{row.customerName ?? <span className="text-muted-foreground">—</span>}</span>
                            {row.poNumber && <span className="text-xs text-muted-foreground">PO {row.poNumber}</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {STAGE_LABELS[row.currentStage] ?? row.currentStage}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={WAD_BADGE[row.wadStatus]} data-testid={`badge-wad-${row.projectId}`}>
                              {row.wadStatus.replace('_', ' ')}
                            </Badge>
                            {isBackfill && (
                              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">
                                BACKFILL
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex min-w-[170px] flex-col gap-1">
                            <Badge className={P2_WAD_BADGE[row.p2WadConnectionStatus] ?? P2_WAD_BADGE.NO_P2_DEMAND}>
                              {P2_WAD_LABEL[row.p2WadConnectionStatus] ?? P2_WAD_LABEL.NO_P2_DEMAND}
                            </Badge>
                            {row.p2HasProductionDemand ? (
                              <div className="text-muted-foreground">
                                {row.p2DemandQuantity} units
                                {row.p2ActiveUnits > 0 && <> · {row.p2ActiveUnits} active</>}
                                {row.p2PoNumbers && (
                                  <div className="truncate max-w-[190px]" title={row.p2PoNumbers}>
                                    PO {row.p2PoNumbers}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">No linked P2 PO demand</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="font-medium">{row.percentComplete}%</span>
                            <div className="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className={`h-full ${row.percentComplete === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                style={{ width: `${row.percentComplete}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.latestWorkOrderNumber ? (
                            <>
                              {row.latestWorkOrderNumber}
                              {row.pwoCount > 1 && <span className="ml-1">(+{row.pwoCount - 1})</span>}
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell" data-testid={`text-last-edited-${row.projectId}`}>
                          {row.lastEditedBy ? <div className="font-medium text-foreground">{row.lastEditedBy}</div> : null}
                          <div>
                            {row.lastEditedAt
                              ? new Date(row.lastEditedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                              : '—'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {row.latestPwoId && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/work-orders/${row.latestPwoId}/wad-summary`)}
                                data-testid={`button-wad-summary-${row.projectId}`}
                              >
                                <FileText className="h-3.5 w-3.5 mr-1" />
                                Summary
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={() => ensureMutation.mutate(row.projectId)}
                              disabled={ensureMutation.isPending}
                              data-testid={`button-author-wad-${row.projectId}`}
                            >
                              {ensureMutation.isPending && ensureMutation.variables === row.projectId ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <Wand2 className="h-3.5 w-3.5 mr-1" />
                              )}
                              {actionLabel}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, icon, tone }: {
  label: string; value: number; icon: React.ReactNode; tone?: 'red' | 'amber' | 'green' | 'gray';
}) {
  const toneClass = tone === 'red' ? 'text-red-700'
    : tone === 'amber' ? 'text-amber-700'
    : tone === 'green' ? 'text-green-700'
    : tone === 'gray' ? 'text-gray-700'
    : 'text-blue-700';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={toneClass}>{icon}</span>
        </div>
        <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterChip({ active, onClick, children, testId }: {
  active: boolean; onClick: () => void; children: React.ReactNode; testId: string;
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      data-testid={testId}
      className={active ? '' : ''}
    >
      {children}
    </Button>
  );
}
