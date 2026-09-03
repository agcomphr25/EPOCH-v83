import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Factory,
  Lock,
} from 'lucide-react';

import { apiRequest, queryClient } from '@/lib/queryClient';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

type Baseline = {
  id: string;
  revision_number: number;
  status: string;
  preview_checksum: string;
  baseline_checksum?: string;
  concurrency_version: number;
  supersession_reason?: string;
};
type Node = {
  id: string;
  parent_node_identity: string | null;
  node_identity: string;
  assembly_path_identity: string;
  depth: number;
  inventory_item_snapshot: { partNumber?: string; name?: string };
  item_classification: string;
  make_buy_disposition: string;
  required_gross_quantity: string;
  unit_of_measure: string;
  bom_snapshot: { revision?: string };
  routing_snapshot: {
    revision?: string;
    departmentSequence?: Array<
      | string
      | { departmentNameSnapshot?: string; departmentCode?: string }
      | null
    >;
  };
  traceability_snapshot: { type?: string };
  wad_decision_snapshot: {
    traveler_type?: string;
    traveler_requirement?: string;
  };
  materialized_authority_id?: string | null;
  production_work_order_id?: string | null;
  work_order_number?: string | null;
  work_order_status?: string | null;
};
type Blocker = {
  code: string;
  path: string;
  message: string;
  correctiveAction: string;
};
type CombinedProcessRecommendation = {
  processId: string;
  processCode: string;
  processName: string;
  revision: number;
  leadDepartmentName: string;
  recommendedRuns: number;
  estimatedMinutes: number;
  recommendationOnly: true;
  outputs: Array<{
    id: string;
    partNumber: string;
    partName: string;
    quantityPerRun: number | string;
    isPrimary: boolean;
    requiredQuantity: number;
    plannedQuantity: number;
    excessQuantity: number;
  }>;
};
type CombinedProcessSelection = {
  id: string;
  processId: string;
  processCode: string;
  processName: string;
  status: 'SELECTED' | 'WITHDRAWN';
  recommendedRuns: number;
  selectionReason: string;
  selectedByDisplayName: string;
  selectedAt: string;
};

export default function P2FrozenProductionDemand({
  projectId,
}: {
  projectId?: string;
}) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const [open, setOpen] = useState(new Set<string>());
  const [workOrderPriority, setWorkOrderPriority] = useState<
    'LOW' | 'URGENT' | 'CRITICAL'
  >('LOW');
  const [workOrderDueDate, setWorkOrderDueDate] = useState('');
  const reads =
    import.meta.env.VITE_P2_FROZEN_PRODUCTION_DEMAND_READS_ENABLED === 'true';
  const writes =
    import.meta.env.VITE_P2_FROZEN_PRODUCTION_DEMAND_WRITES_ENABLED === 'true';
  const releases =
    import.meta.env.VITE_P2_FROZEN_PRODUCTION_DEMAND_RELEASES_ENABLED ===
    'true';
  const workOrderMaterialization =
    import.meta.env.VITE_P2_MANUFACTURING_WORK_ORDER_MATERIALIZATION_ENABLED ===
    'true';
  const combinedProcessReads =
    import.meta.env.VITE_COMBINED_MANUFACTURING_PROCESS_READS_ENABLED ===
    'true';
  const combinedProcessPlanningWrites =
    import.meta.env
      .VITE_COMBINED_MANUFACTURING_PROCESS_PLANNING_WRITES_ENABLED === 'true';
  const combinedProcessMaterializationWrites =
    import.meta.env
      .VITE_COMBINED_MANUFACTURING_PROCESS_MATERIALIZATION_WRITES_ENABLED ===
    'true';
  const canViewCombinedProcesses = can('manufacturing.combined_processes.view');
  const canPlanCombinedProcesses = can('manufacturing.combined_processes.plan');
  const canMaterializeCombinedProcesses = can(
    'manufacturing.combined_processes.materialize'
  );
  const list = useQuery<{
    baselines: Baseline[];
    authority: { canManage: boolean; canRelease: boolean };
  }>({
    queryKey: [
      `/api/configuration-control/projects/${projectId}/frozen-production-demand`,
    ],
    enabled: reads && !!projectId,
  });
  const preview = useQuery<{
    nodes: Array<Record<string, unknown>>;
    blockers: Blocker[];
    checksum: string | null;
  }>({
    queryKey: [
      `/api/configuration-control/projects/${projectId}/frozen-production-demand/preview`,
    ],
    enabled: reads && !!projectId,
  });
  const current = list.data?.baselines?.[0];
  const combinedRecommendations = useQuery<{
    recommendations: CombinedProcessRecommendation[];
    materializesWorkOrders: false;
  }>({
    queryKey: [
      `/api/projects/${projectId}/frozen-production-demand/${current?.id}/combined-process-recommendations`,
    ],
    queryFn: () =>
      apiRequest(
        `/api/projects/${projectId}/frozen-production-demand/${current?.id}/combined-process-recommendations`
      ),
    enabled:
      reads &&
      combinedProcessReads &&
      canViewCombinedProcesses &&
      !!projectId &&
      current?.status === 'RELEASED',
  });
  const combinedSelections = useQuery<{
    selections: CombinedProcessSelection[];
  }>({
    queryKey: [
      `/api/projects/${projectId}/frozen-production-demand/${current?.id}/combined-process-selections`,
    ],
    enabled:
      reads &&
      combinedProcessReads &&
      canViewCombinedProcesses &&
      !!projectId &&
      current?.status === 'RELEASED',
  });
  const activeCombinedSelection = combinedSelections.data?.selections.find(
    (selection) => selection.status === 'SELECTED'
  );
  const selectCombinedProcess = useMutation({
    mutationFn: (recommendation: CombinedProcessRecommendation) => {
      const reason = window.prompt(
        'Explain why this combined process is the best scheduling plan.'
      );
      if (!reason?.trim()) throw new Error('A selection reason is required.');
      return apiRequest(
        `/api/projects/${projectId}/frozen-production-demand/${current?.id}/combined-process-selections`,
        {
          method: 'POST',
          body: {
            processId: recommendation.processId,
            expectedBaselineChecksum: current?.baseline_checksum,
            reason: reason.trim(),
          },
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/projects/${projectId}/frozen-production-demand/${current?.id}/combined-process-selections`,
        ],
      });
      toast({ title: 'Combined process selected for planning' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Combined process was not selected',
        description: error.message,
        variant: 'destructive',
      }),
  });
  const withdrawCombinedSelection = useMutation({
    mutationFn: (selectionId: string) => {
      const reason = window.prompt(
        'Explain why this planning selection is being withdrawn.'
      );
      if (!reason?.trim()) throw new Error('A withdrawal reason is required.');
      return apiRequest(
        `/api/projects/${projectId}/frozen-production-demand/${current?.id}/combined-process-selections/${selectionId}/withdraw`,
        { method: 'POST', body: { reason: reason.trim() } }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/projects/${projectId}/frozen-production-demand/${current?.id}/combined-process-selections`,
        ],
      });
      toast({ title: 'Combined process selection withdrawn' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Selection was not withdrawn',
        description: error.message,
        variant: 'destructive',
      }),
  });
  const materializeCombinedSelection = useMutation({
    mutationFn: (selectionId: string) =>
      apiRequest(
        `/api/projects/${projectId}/frozen-production-demand/${current?.id}/combined-process-selections/${selectionId}/materialize`,
        {
          method: 'POST',
          body: {
            expectedBaselineChecksum: current?.baseline_checksum,
            requestKey: crypto.randomUUID(),
          },
        }
      ),
    onSuccess: (result: { workOrderNumber?: string }) =>
      toast({
        title: 'Combined work order created',
        description: result.workOrderNumber,
      }),
    onError: (error: Error) =>
      toast({
        title: 'Combined work order was not created',
        description: error.message,
        variant: 'destructive',
      }),
  });
  const detail = useQuery<{
    baseline: Baseline;
    nodes: Node[];
    events: Array<{
      id: string;
      event_type: string;
      created_at: string;
      actor_display_name: string;
    }>;
  }>({
    queryKey: [
      `/api/configuration-control/projects/${projectId}/frozen-production-demand/${current?.id}`,
    ],
    enabled: reads && !!projectId && !!current,
  });
  const mutate = useMutation({
    mutationFn: ({
      path,
      body,
    }: {
      path: string;
      body: Record<string, unknown>;
    }) => apiRequest(path, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/configuration-control/projects/${projectId}/frozen-production-demand`,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: [
          `/api/configuration-control/projects/${projectId}/frozen-production-demand/preview`,
        ],
      });
      toast({ title: 'Frozen demand updated' });
    },
    onError: (e: Error) =>
      toast({
        title: 'Frozen demand was not changed',
        description: e.message,
        variant: 'destructive',
      }),
  });
  const materializeNode = useMutation({
    mutationFn: (node?: Node) => {
      if (!current?.id || !current.baseline_checksum)
        throw new Error('Release the frozen production-demand baseline first.');
      return apiRequest(
        `/api/projects/${projectId}/frozen-production-demand/${current.id}/materialize-work-orders`,
        {
          method: 'POST',
          body: {
            ...(node ? { frozenDemandNodeId: node.id } : {}),
            expectedBaselineChecksum: current.baseline_checksum,
            idempotencyKey: node
              ? `work-order:${current.id}:${node.id}`
              : `work-orders:${current.id}:${crypto.randomUUID()}`,
            signatureMeaning:
              'Create this manufactured work order from the released parent PO, WAD, BOM, routing, and frozen demand.',
            priority: workOrderPriority,
            ...(workOrderDueDate ? { dueDate: workOrderDueDate } : {}),
          },
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          `/api/configuration-control/projects/${projectId}/frozen-production-demand/${current?.id}`,
        ],
      });
      toast({ title: 'Manufacturing work order created' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Work order was not created',
        description: error.message,
        variant: 'destructive',
      }),
  });
  if (!reads)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2">
            <Lock className="h-5 w-5" />
            Frozen Production Demand
          </CardTitle>
          <CardDescription>
            Phase 5 is disabled. No production demand is compiled or released.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  if (!projectId)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Frozen Production Demand</CardTitle>
          <CardDescription>
            Select exactly one project or open this Control Center from its
            project workflow.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  const blockers = preview.data?.blockers ?? [];
  const nodes = detail.data?.nodes ?? [];
  return (
    <div className="space-y-4" data-testid="frozen-production-demand">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Frozen Production Demand</CardTitle>
              <CardDescription>
                Deterministic gross demand only. This does not net, reserve,
                schedule, provision work, or change inventory.
              </CardDescription>
            </div>
            {current && (
              <Badge>
                {current.status} · Rev {current.revision_number}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded border p-3 text-sm">
            <div className="font-medium">Preview checksum</div>
            <code className="break-all text-xs">
              {preview.data?.checksum ??
                'Blocked until all authority gaps are corrected'}
            </code>
          </div>
          {blockers.map((b) => (
            <div
              key={`${b.code}:${b.path}`}
              className="rounded border border-amber-300 bg-amber-50 p-3 text-sm"
            >
              <div className="flex gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                {b.path}: {b.message}
              </div>
              <div className="mt-1 text-muted-foreground">
                Corrective action: {b.correctiveAction}
              </div>
            </div>
          ))}
          {!blockers.length && preview.data && (
            <div className="flex gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Preview is ready for controlled draft creation.
            </div>
          )}
          {writes && list.data?.authority.canManage && !current && (
            <Button
              disabled={mutate.isPending || !!blockers.length}
              onClick={() =>
                mutate.mutate({
                  path: `/api/configuration-control/projects/${projectId}/frozen-production-demand`,
                  body: {},
                })
              }
            >
              Create Frozen Demand Draft
            </Button>
          )}
          {writes &&
            list.data?.authority.canManage &&
            current?.status === 'DRAFT' && (
              <Button
                disabled={mutate.isPending}
                onClick={() =>
                  mutate.mutate({
                    path: `/api/configuration-control/projects/${projectId}/frozen-production-demand/${current.id}/validate`,
                    body: {
                      expectedConcurrencyVersion: current.concurrency_version,
                    },
                  })
                }
              >
                Validate Draft
              </Button>
            )}
          {releases &&
            list.data?.authority.canRelease &&
            current?.status === 'VALIDATED' && (
              <Button
                disabled={mutate.isPending}
                onClick={() => {
                  const meaning = window.prompt(
                    'State the meaning of this independent release signature.'
                  );
                  if (meaning)
                    mutate.mutate({
                      path: `/api/configuration-control/projects/${projectId}/frozen-production-demand/${current.id}/release`,
                      body: {
                        expectedConcurrencyVersion: current.concurrency_version,
                        signatureMeaning: meaning,
                      },
                    });
                }}
              >
                Independently Release Baseline
              </Button>
            )}
        </CardContent>
      </Card>
      {nodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assembly demand tree</CardTitle>
            <CardDescription>
              Each line preserves its own controlled assembly-path identity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {current?.status === 'RELEASED' &&
              workOrderMaterialization &&
              can('p2.work_orders.materialize') && (
                <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border p-3">
                  <div className="space-y-1">
                    <Label>Priority for generated work orders</Label>
                    <Select
                      value={workOrderPriority}
                      onValueChange={(value) =>
                        setWorkOrderPriority(
                          value as 'LOW' | 'URGENT' | 'CRITICAL'
                        )
                      }
                    >
                      <SelectTrigger
                        className="w-[180px]"
                        data-testid="select-generated-work-order-priority"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="URGENT">Urgent</SelectItem>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="generated-work-order-due-date">
                      Due date
                    </Label>
                    <Input
                      id="generated-work-order-due-date"
                      type="date"
                      value={workOrderDueDate}
                      onChange={(event) =>
                        setWorkOrderDueDate(event.target.value)
                      }
                    />
                  </div>
                  <Button
                    disabled={
                      materializeNode.isPending ||
                      !nodes.some(
                        (node) =>
                          node.make_buy_disposition === 'MAKE' &&
                          node.depth > 0 &&
                          !node.materialized_authority_id
                      )
                    }
                    onClick={() => materializeNode.mutate(undefined)}
                  >
                    Create All Remaining Work Orders
                  </Button>
                </div>
              )}
            {nodes.map((n) => (
              <div
                key={n.id}
                className="rounded border p-2 text-sm"
                style={{ marginLeft: `${Math.min(n.depth, 8) * 16}px` }}
              >
                <div className="flex items-center gap-2">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() =>
                      setOpen((s) => {
                        const x = new Set(s);
                        x.has(n.id) ? x.delete(n.id) : x.add(n.id);
                        return x;
                      })
                    }
                  >
                    {open.has(n.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <strong>{n.inventory_item_snapshot.partNumber}</strong>
                    <span>
                      {n.required_gross_quantity} {n.unit_of_measure}
                    </span>
                    <Badge variant="outline">{n.make_buy_disposition}</Badge>
                    <span className="text-muted-foreground">
                      {n.assembly_path_identity}
                    </span>
                  </button>
                  {n.make_buy_disposition === 'MAKE' &&
                    n.depth > 0 &&
                    current?.status === 'RELEASED' &&
                    workOrderMaterialization &&
                    can('p2.work_orders.materialize') &&
                    (n.materialized_authority_id ? (
                      <Badge variant="secondary">
                        {n.work_order_number ?? 'Work order created'}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        disabled={materializeNode.isPending}
                        onClick={() => materializeNode.mutate(n)}
                      >
                        Create this work order
                      </Button>
                    ))}
                </div>
                {n.depth === 0 && n.make_buy_disposition === 'MAKE' && (
                  <p className="mt-1 pl-6 text-xs text-muted-foreground">
                    Parent PO item authority — child work orders inherit this
                    released baseline.
                  </p>
                )}
                {open.has(n.id) && (
                  <div className="mt-2 grid gap-1 pl-6 text-xs text-muted-foreground">
                    <span>
                      {n.inventory_item_snapshot.name} · {n.item_classification}
                    </span>
                    <span>
                      BOM {n.bom_snapshot.revision ?? 'N/A'} · Routing{' '}
                      {n.routing_snapshot.revision ?? 'N/A'}
                    </span>
                    <span>
                      Departments:{' '}
                      {(n.routing_snapshot.departmentSequence ?? [])
                        .map((entry) =>
                          typeof entry === 'string'
                            ? entry
                            : (entry?.departmentNameSnapshot ??
                              entry?.departmentCode ??
                              'Missing Department')
                        )
                        .join(' → ') || 'N/A'}
                    </span>
                    <span>
                      Traceability: {n.traceability_snapshot.type ?? 'missing'}{' '}
                      · WAD:{' '}
                      {n.wad_decision_snapshot.traveler_type ??
                        n.wad_decision_snapshot.traveler_requirement ??
                        'not required for BUY'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {combinedProcessReads &&
        canViewCombinedProcesses &&
        current?.status === 'RELEASED' && (
          <Card data-testid="combined-process-recommendations">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Factory className="h-5 w-5" />
                    Combined Process Recommendations
                  </CardTitle>
                  <CardDescription>
                    Compare approved multi-output processes with the released
                    BOM demand before creating the production schedule.
                  </CardDescription>
                </div>
                <Badge variant="outline">Recommendation only</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeCombinedSelection && (
                <div className="rounded border border-green-300 bg-green-50 p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-green-900">
                        Selected plan: {activeCombinedSelection.processCode} ·{' '}
                        {activeCombinedSelection.recommendedRuns} runs
                      </div>
                      <div className="mt-1 text-green-800">
                        {activeCombinedSelection.selectionReason}
                      </div>
                      <div className="mt-1 text-xs text-green-700">
                        Selected by{' '}
                        {activeCombinedSelection.selectedByDisplayName} on{' '}
                        {new Date(
                          activeCombinedSelection.selectedAt
                        ).toLocaleString()}
                      </div>
                    </div>
                    {combinedProcessPlanningWrites &&
                      canPlanCombinedProcesses && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={withdrawCombinedSelection.isPending}
                          onClick={() =>
                            withdrawCombinedSelection.mutate(
                              activeCombinedSelection.id
                            )
                          }
                        >
                          Withdraw selection
                        </Button>
                      )}
                    {combinedProcessMaterializationWrites &&
                      canMaterializeCombinedProcesses && (
                        <Button
                          size="sm"
                          disabled={materializeCombinedSelection.isPending}
                          onClick={() =>
                            materializeCombinedSelection.mutate(
                              activeCombinedSelection.id
                            )
                          }
                        >
                          Create combined work order
                        </Button>
                      )}
                  </div>
                </div>
              )}
              {combinedRecommendations.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Evaluating approved combined processes…
                </p>
              ) : (combinedRecommendations.data?.recommendations ?? [])
                  .length === 0 ? (
                <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                  No approved combined process matches two or more manufactured
                  parts in this released demand baseline. The default remains
                  one work order per manufactured part and assigned department.
                </div>
              ) : (
                combinedRecommendations.data?.recommendations.map(
                  (recommendation) => (
                    <div
                      key={recommendation.processId}
                      className="rounded border p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">
                            {recommendation.processCode} · Rev{' '}
                            {recommendation.revision}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {recommendation.processName} ·{' '}
                            {recommendation.leadDepartmentName}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-medium">
                            {recommendation.recommendedRuns} recommended runs
                          </div>
                          <div className="text-muted-foreground">
                            {recommendation.estimatedMinutes} estimated minutes
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {recommendation.outputs.map((output) => (
                          <div
                            key={output.id}
                            className="rounded bg-muted/50 p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-center gap-2 font-medium">
                              {output.partNumber}
                              {output.isPrimary && (
                                <Badge variant="secondary">Primary</Badge>
                              )}
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              Need {output.requiredQuantity}; plan{' '}
                              {output.plannedQuantity} ({output.quantityPerRun}{' '}
                              per run)
                            </div>
                            {output.excessQuantity > 0 && (
                              <div className="mt-1 text-amber-700">
                                Excess output: {output.excessQuantity}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        This recommendation does not create, combine, or replace
                        work orders. Production Planning retains the final
                        scheduling decision.
                      </div>
                      {combinedProcessPlanningWrites &&
                        canPlanCombinedProcesses &&
                        !activeCombinedSelection && (
                          <Button
                            className="mt-3"
                            size="sm"
                            disabled={selectCombinedProcess.isPending}
                            onClick={() =>
                              selectCombinedProcess.mutate(recommendation)
                            }
                          >
                            Select for planning
                          </Button>
                        )}
                    </div>
                  )
                )
              )}
            </CardContent>
          </Card>
        )}
      {(detail.data?.events?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Release and supersession history</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.data?.events.map((e) => (
              <div key={e.id} className="border-b py-2 text-sm">
                {e.event_type} · {e.actor_display_name} ·{' '}
                {new Date(e.created_at).toLocaleString()}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
