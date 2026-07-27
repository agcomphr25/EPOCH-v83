import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ShieldCheck, TriangleAlert } from 'lucide-react';

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

type Row = Record<string, unknown>;
type Dashboard = {
  ctx: {
    project: { po_number?: string; customer_name?: string };
    productionReview: { revision_number: number };
  };
  items: Row[];
  ncrs: Row[];
  releases: Row[];
  holds: Row[];
  documentManifest: Row[];
  readiness: { state: string; blockers: string[]; eligibleQuantity: number };
  review?: {
    status: string;
    revision_number: number;
    lock_version: number;
  } | null;
  approvals: Array<{
    approval_type: string;
    decision: string;
    actor_display_name: string;
  }>;
};

export default function P2V2QualityProductRelease({
  projectId,
}: {
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const key = ['/api/projects', projectId, 'workflow-v2', 'quality-release'];
  const { data, isLoading, error } = useQuery<Dashboard>({
    queryKey: key,
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/quality-release`,
        { credentials: 'include' }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          body?.message || 'Unable to load Quality release evidence'
        );
      return body;
    },
  });
  const createReview = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/quality-release/reviews`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || 'Unable to create Quality review');
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
          Loading authoritative Quality evidence…
        </CardContent>
      </Card>
    );
  if (error || !data)
    return (
      <Alert variant="destructive">
        <TriangleAlert className="h-4 w-4" />
        <AlertTitle>Quality evidence unavailable</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Unable to load Stage 9.'}
        </AlertDescription>
      </Alert>
    );
  const activeHolds = data.holds.filter(
    (hold) => hold.status === 'ACTIVE'
  ).length;
  return (
    <div className="space-y-4" data-testid="p2-v2-quality-product-release">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Stage 9 — Quality & Product Release</AlertTitle>
        <AlertDescription>
          Release is an explicit Quality-authorized, immutable action for exact
          quantities and identities. Product Release does not create a shipment.
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <CardTitle>Quality readiness</CardTitle>
              <CardDescription>
                {data.ctx.project.customer_name || 'Customer'} · PO{' '}
                {data.ctx.project.po_number || '—'} · Production completion
                revision {data.ctx.productionReview.revision_number}
              </CardDescription>
            </div>
            <Badge>{data.review?.status || data.readiness.state}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['Inspected units', data.items.length],
              ['Eligible', data.readiness.eligibleQuantity],
              ['Open NCRs', data.ncrs.length],
              ['Controlled documents', data.documentManifest.length],
              ['Active release holds', activeHolds],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{String(value)}</p>
              </div>
            ))}
          </div>
          {data.readiness.blockers.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Release blocked</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {data.readiness.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {!data.review && (
            <Button
              onClick={() => createReview.mutate()}
              disabled={createReview.isPending}
            >
              Create revision-controlled Quality review
            </Button>
          )}
          {data.review?.status === 'READY_FOR_RELEASE' && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Ready for controlled release</AlertTitle>
              <AlertDescription>
                Use Release Product after confirming PO line, part/revision,
                quantity, serials or batches, configuration/effectivity,
                document manifest, and Quality signature meaning.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Immutable Product Releases</CardTitle>
          <CardDescription>
            {data.releases.length} release record(s). Stage 10 may consume only
            unheld released quantities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No product has been released.
            </p>
          ) : (
            <div className="space-y-2">
              {data.releases.map((release) => (
                <div className="rounded border p-3" key={String(release.id)}>
                  <p className="font-medium">
                    {String(release.release_number)}
                  </p>
                  <p className="text-sm">
                    {String(release.part_number)} · Qty{' '}
                    {String(release.released_quantity)} ·{' '}
                    {String(release.release_decision)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
