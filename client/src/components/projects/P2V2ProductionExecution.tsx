import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Factory,
  ShieldAlert,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

type Row = Record<string, unknown>;
type Dashboard = {
  ctx: {
    project: {
      id: string;
      po_id: number;
      po_number?: string;
      customer_name?: string;
      current_stage: string;
    };
    launch: {
      production_plan_revision: number;
      wad_revision: number;
      configuration_baseline_id: string;
      effectivity_reference: string;
    };
  };
  productionOrders: Row[];
  serializedItems: Row[];
  travelers: Row[];
  traceability: Row[];
  ncrs: Row[];
  holds: Row[];
  labor: { actual_hours?: string | number; open_count?: number };
  evidence: {
    authorizedQuantity: number;
    completedQuantity: number;
    acceptedQuantity: number;
    rejectedQuantity: number;
    scrappedQuantity: number;
    productionOrdersRequired: number;
    productionOrdersComplete: number;
    incompleteTravelerSteps: number;
    missingMaterialGenealogy: number;
    activeHolds: number;
  };
  readiness: {
    state: string;
    blockers: string[];
    warnings: string[];
  };
  review?: {
    lock_version: number;
    status: string;
    revision_number: number;
  } | null;
  approvals: Array<{
    approval_type: string;
    decision: string;
    actor_display_name: string;
  }>;
  history: Row[];
};

const number = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) => String(value ?? '');

export default function P2V2ProductionExecution({
  projectId,
}: {
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const key = ['/api/projects', projectId, 'workflow-v2', 'production'];
  const { data, isLoading, error } = useQuery<Dashboard>({
    queryKey: key,
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/production`,
        { credentials: 'include' }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || 'Unable to load Production evidence');
      return body;
    },
  });
  const action = useMutation({
    mutationFn: async (path: string) => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/production/${path}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            path === 'completion-reviews'
              ? {}
              : { expectedLockVersion: data?.review?.lock_version }
          ),
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || 'Production-stage action failed');
      return body;
    },
    onSuccess: (body) => {
      queryClient.setQueryData(key, body);
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'workflow-v2'],
      });
    },
  });
  if (isLoading)
    return (
      <Card>
        <CardContent className="p-6">
          Loading authoritative Production evidence…
        </CardContent>
      </Card>
    );
  if (error || !data)
    return (
      <Alert variant="destructive" data-testid="p2-v2-production-error">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Production evidence unavailable</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Unable to load Stage 8.'}
        </AlertDescription>
      </Alert>
    );
  const progress = data.evidence.authorizedQuantity
    ? Math.min(
        100,
        Math.round(
          (data.evidence.completedQuantity / data.evidence.authorizedQuantity) *
            100
        )
      )
    : 0;
  return (
    <div className="space-y-4" data-testid="p2-v2-production-execution">
      <Alert>
        <Factory className="h-4 w-4" />
        <AlertTitle>Stage 8 — Production execution evidence</AlertTitle>
        <AlertDescription>
          Operational progress is calculated from authoritative work orders,
          travelers, material, labor, quality, and calibration records. Stage 8
          completion does not release product or authorize shipping.
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <CardTitle>Production dashboard</CardTitle>
              <CardDescription>
                {data.ctx.project.customer_name || 'Customer'} · PO{' '}
                {data.ctx.project.po_number || data.ctx.project.po_id} ·
                Configuration {data.ctx.launch.configuration_baseline_id} ·
                Effectivity {data.ctx.launch.effectivity_reference}
              </CardDescription>
            </div>
            <Badge>{data.review?.status || data.readiness.state}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Production Plan</p>
              <p className="font-medium">
                Revision {data.ctx.launch.production_plan_revision}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Released WAD</p>
              <p className="font-medium">
                Revision {data.ctx.launch.wad_revision}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Production orders</p>
              <p className="font-medium">
                {data.evidence.productionOrdersComplete}/
                {data.evidence.productionOrdersRequired} complete
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Labor actual</p>
              <p className="font-medium">
                {number(data.labor.actual_hours).toFixed(2)} hours
              </p>
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>Manufactured quantity progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Authorized', data.evidence.authorizedQuantity],
              ['Completed', data.evidence.completedQuantity],
              ['Accepted', data.evidence.acceptedQuantity],
              ['Rejected', data.evidence.rejectedQuantity],
              ['Scrapped', data.evidence.scrappedQuantity],
              ['Travelers', data.travelers.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {(data.readiness.blockers.length > 0 ||
        data.holds.some((hold) => text(hold.status) === 'ACTIVE')) && (
        <Alert
          variant="destructive"
          data-testid="production-completion-blockers"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Production completion blockers</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {data.readiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Authoritative evidence coverage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Production orders: {data.productionOrders.length}</p>
            <p>Serialized or batch records: {data.serializedItems.length}</p>
            <p>
              Traveler operations incomplete:{' '}
              {data.evidence.incompleteTravelerSteps}
            </p>
            <p>
              Material genealogy gaps: {data.evidence.missingMaterialGenealogy}
            </p>
            <p>Open NCRs: {data.ncrs.length}</p>
            <p>Open labor entries: {number(data.labor.open_count)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Holds, approvals, and history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium text-red-700">
              Active holds: {data.evidence.activeHolds}
            </p>
            {data.holds.map((hold) => (
              <div key={text(hold.id)} className="rounded border p-2">
                <Badge
                  variant={
                    text(hold.status) === 'ACTIVE' ? 'destructive' : 'outline'
                  }
                >
                  {text(hold.status)}
                </Badge>{' '}
                {text(hold.reason)} · {text(hold.scope_type)}
              </div>
            ))}
            <p>Functional approvals: {data.approvals.length}</p>
            <p>Immutable revisions: {data.history.length}</p>
          </CardContent>
        </Card>
      </div>
      {action.error && (
        <p className="text-sm text-red-700">{action.error.message}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!data.review && (
          <Button
            onClick={() => action.mutate('completion-reviews')}
            disabled={action.isPending}
          >
            Create completion review
          </Button>
        )}
        {data.review &&
          ['IN_PROGRESS', 'BLOCKED', 'READY_FOR_COMPLETION_REVIEW'].includes(
            data.review.status
          ) && (
            <Button
              variant="outline"
              onClick={() =>
                action.mutate('completion-reviews/current/recalculate')
              }
              disabled={action.isPending}
            >
              Recalculate readiness
            </Button>
          )}
        {data.review?.status === 'READY_FOR_COMPLETION_REVIEW' && (
          <Button
            onClick={() => action.mutate('completion-reviews/current/submit')}
            disabled={action.isPending}
          >
            Submit completion review
          </Button>
        )}
        {data.review?.status === 'COMPLETE' && (
          <span className="flex items-center gap-1 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Immutable Production evidence complete
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Final acceptance, AS9100 8.6 product release, Shipping, and Project
        Closing remain read-only and are deferred to later phases.
      </p>
    </div>
  );
}
