import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
} from 'lucide-react';

import { apiRequest, queryClient } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

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
};
type Blocker = {
  code: string;
  path: string;
  message: string;
  correctiveAction: string;
};

export default function P2FrozenProductionDemand({
  projectId,
}: {
  projectId?: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(new Set<string>());
  const reads =
    import.meta.env.VITE_P2_FROZEN_PRODUCTION_DEMAND_READS_ENABLED === 'true';
  const writes =
    import.meta.env.VITE_P2_FROZEN_PRODUCTION_DEMAND_WRITES_ENABLED === 'true';
  const releases =
    import.meta.env.VITE_P2_FROZEN_PRODUCTION_DEMAND_RELEASES_ENABLED ===
    'true';
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
            {nodes.map((n) => (
              <div
                key={n.id}
                className="rounded border p-2 text-sm"
                style={{ marginLeft: `${Math.min(n.depth, 8) * 16}px` }}
              >
                <button
                  className="flex w-full items-center gap-2 text-left"
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
