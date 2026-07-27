import { useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, TriangleAlert } from 'lucide-react';

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
import { Input } from '@/components/ui/input';

type Row = Record<string, unknown>;
type Dashboard = {
  ctx: {
    project: { po_number?: string; customer_name?: string };
    productionReview: {
      revision_number: number;
      configuration_baseline_id?: string;
      effectivity_reference?: string;
    };
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
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [signatureMeaning, setSignatureMeaning] = useState(
    'Quality authorizes the identified conforming product for customer release'
  );
  const [actionError, setActionError] = useState('');
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
  const action = useMutation({
    mutationFn: async ({
      path,
      body = {},
    }: {
      path: string;
      body?: Record<string, unknown>;
    }) => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/quality-release/${path}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const responseBody = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          responseBody?.message || 'Quality release action failed'
        );
      return responseBody;
    },
    onSuccess: (body) => {
      setActionError('');
      queryClient.setQueryData(key, body.dashboard ?? body);
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'workflow-v2'],
      });
    },
    onError: (mutationError) =>
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Quality release action failed'
      ),
  });
  const eligibleItems = useMemo(
    () =>
      (data?.items ?? []).filter(
        (item) =>
          item.overall_result === 'PASS' &&
          item.status !== 'SCRAPPED' &&
          item.release_serial
      ),
    [data?.items]
  );
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
  const expectedLockVersion = data.review?.lock_version;
  const post = (path: string, body: Record<string, unknown> = {}) =>
    action.mutate({ path, body });
  const decide = (path: string, decision: 'APPROVED' | 'REJECTED') =>
    post(`reviews/current/decisions/${path}`, {
      expectedLockVersion,
      decision,
      signatureMeaning: `${path} decision for Quality review revision ${data.review?.revision_number}`,
      reason: '',
    });
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
              <CardTitle>Quality readiness and lifecycle</CardTitle>
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
              [
                'Active release holds',
                data.holds.filter((hold) => hold.status === 'ACTIVE').length,
              ],
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
          {actionError && (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Action not completed</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          {!data.review && (
            <Button onClick={() => post('reviews')} disabled={action.isPending}>
              Create Quality review
            </Button>
          )}
          {data.review &&
            ['IN_PROGRESS', 'BLOCKED'].includes(data.review.status) && (
              <Button
                onClick={() =>
                  post('reviews/current/submit', { expectedLockVersion })
                }
                disabled={
                  action.isPending || data.readiness.blockers.length > 0
                }
              >
                Submit Quality review
              </Button>
            )}
          {data.review?.status === 'READY_FOR_REVIEW' && (
            <div className="space-y-3 rounded border p-3">
              <p className="font-medium">Functional approvals</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ['operations', 'Operations'],
                  ['project-management', 'Project Management'],
                  ['quality', 'Quality'],
                ].map(([path, label]) => (
                  <div className="flex gap-1" key={path}>
                    <Button
                      size="sm"
                      onClick={() => decide(path, 'APPROVED')}
                      disabled={action.isPending}
                    >
                      Approve — {label}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide(path, 'REJECTED')}
                      disabled={action.isPending}
                    >
                      Reject — {label}
                    </Button>
                  </div>
                ))}
              </div>
              <ul className="text-sm">
                {data.approvals.map((approval) => (
                  <li key={approval.approval_type}>
                    {approval.approval_type}: {approval.decision} by{' '}
                    {approval.actor_display_name}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() =>
                  post('reviews/current/complete', { expectedLockVersion })
                }
                disabled={action.isPending}
              >
                Complete Quality review
              </Button>
            </div>
          )}
          {data.review &&
            ['READY_FOR_RELEASE', 'PARTIALLY_RELEASED'].includes(
              data.review.status
            ) && (
              <div className="space-y-3 rounded border p-4">
                <h4 className="font-semibold">Release Product</h4>
                <p className="text-sm">
                  Customer PO {data.ctx.project.po_number || '—'} ·
                  Configuration{' '}
                  {data.ctx.productionReview.configuration_baseline_id || '—'} ·
                  Effectivity{' '}
                  {data.ctx.productionReview.effectivity_reference || '—'}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {eligibleItems.map((item) => {
                    const serial = String(item.release_serial);
                    return (
                      <label
                        className="flex items-center gap-2 rounded border p-2"
                        key={serial}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSerials.includes(serial)}
                          onChange={(event) =>
                            setSelectedSerials((current) =>
                              event.target.checked
                                ? [...current, serial]
                                : current.filter((value) => value !== serial)
                            )
                          }
                        />
                        {serial} · {String(item.part_number)}
                      </label>
                    );
                  })}
                </div>
                <Input
                  aria-label="Release quantity"
                  type="number"
                  min={1}
                  max={data.readiness.eligibleQuantity}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
                <Input
                  aria-label="Quality signature meaning"
                  value={signatureMeaning}
                  onChange={(event) => setSignatureMeaning(event.target.value)}
                />
                <div className="rounded bg-muted p-3 text-sm">
                  <p>
                    Part/revision:{' '}
                    {String(eligibleItems[0]?.part_number || '—')} /{' '}
                    {String(eligibleItems[0]?.part_revision || '—')}
                  </p>
                  <p>Quantity: {quantity}</p>
                  <p>Serials/batches: {selectedSerials.join(', ') || 'None'}</p>
                  <p>Controlled documents: {data.documentManifest.length}</p>
                  <p>Signature meaning: {signatureMeaning}</p>
                  <strong>Product Release does not create a shipment.</strong>
                </div>
                <Button
                  onClick={() =>
                    post('releases', {
                      expectedLockVersion,
                      idempotencyKey: crypto.randomUUID(),
                      poLineId:
                        Number(eligibleItems[0]?.po_item_id) || undefined,
                      partNumber: String(eligibleItems[0]?.part_number || ''),
                      partRevision: String(
                        eligibleItems[0]?.part_revision || ''
                      ),
                      quantity,
                      serialNumbers: selectedSerials,
                      batchLots: [],
                      signatureMeaning,
                    })
                  }
                  disabled={
                    action.isPending ||
                    selectedSerials.length !== quantity ||
                    !signatureMeaning
                  }
                >
                  Confirm and Release Product
                </Button>
              </div>
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
                  <div className="mt-2 flex flex-wrap gap-2">
                    {release.release_decision !== 'HELD' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          post(`releases/${String(release.id)}/holds`, {
                            reason: 'Quality hold placed from Stage 9',
                            quantity: Number(release.released_quantity),
                            serialNumbers: release.serial_numbers || [],
                            batchLots: release.batch_lots || [],
                          })
                        }
                      >
                        Place release hold
                      </Button>
                    )}
                    {data.holds
                      .filter(
                        (hold) =>
                          hold.product_release_id === release.id &&
                          hold.status === 'ACTIVE'
                      )
                      .map((hold) => (
                        <Button
                          size="sm"
                          key={String(hold.id)}
                          onClick={() =>
                            post(
                              `releases/${String(release.id)}/holds/${String(hold.id)}/release`,
                              { releaseReason: 'Quality disposition complete' }
                            )
                          }
                        >
                          Release hold
                        </Button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
