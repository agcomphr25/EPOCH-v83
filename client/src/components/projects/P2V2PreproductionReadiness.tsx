import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Rocket, ShieldCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

type ChecklistItem = {
  key: string;
  category: string;
  label: string;
  applicability: 'REQUIRED' | 'NOT_REQUIRED' | 'NOT_APPLICABLE';
  satisfied: boolean;
  justification?: string;
  approvedJustification?: boolean;
  evidence?: Array<{ recordType: string; recordId: string; revision?: string }>;
};
type Model = {
  review: {
    id: string;
    revision_number: number;
    lock_version: number;
    status: string;
    checklist_snapshot: ChecklistItem[];
    source_stage_revisions: Record<string, string | number | null>;
    exceptions: unknown[];
    risks_and_controls: unknown[];
    effectivity_reference: string;
  } | null;
  history: Array<{ id: string; revision_number: number; status: string }>;
  approvals: Array<{
    id: string;
    approval_type: string;
    decision: string;
    actor_display_name: string;
    decided_at: string;
  }>;
  requiredApprovals: string[];
  readiness: {
    state: 'READY' | 'NOT_READY' | 'BLOCKED' | 'STALE';
    blockers: string[];
    stale: boolean;
  };
  release: { id: string; status: string; approved_at: string } | null;
  launch: { id: string; status: string; launched_at: string } | null;
  projectStatus: string;
  recommendedChecklist: ChecklistItem[];
};

const endpoint = (projectId: string) =>
  `/api/projects/${projectId}/workflow-v2/preproduction-readiness`;

export default function P2V2PreproductionReadiness({
  projectId,
}: {
  projectId: string;
}) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [launchOpen, setLaunchOpen] = useState(false);
  const [effectivity, setEffectivity] = useState('');
  const { data, isLoading, error } = useQuery<Model>({
    queryKey: [
      '/api/projects',
      projectId,
      'workflow-v2',
      'preproduction-readiness',
    ],
    queryFn: async () => {
      const response = await fetch(endpoint(projectId), {
        credentials: 'include',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || 'Unable to load readiness');
      return body;
    },
  });
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ['/api/projects', projectId],
    });
  const action = useMutation({
    mutationFn: async ({
      path,
      body,
    }: {
      path: string;
      body?: Record<string, unknown>;
    }) => {
      const response = await fetch(`${endpoint(projectId)}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          result?.message ||
            (Array.isArray(result?.blockers)
              ? result.blockers.join('; ')
              : 'Action failed')
        );
      return result;
    },
    onSuccess: () => {
      setLaunchOpen(false);
      refresh();
      toast({ title: 'Preproduction workflow updated' });
    },
    onError: (value) =>
      toast({
        title: 'Action blocked',
        description: value instanceof Error ? value.message : 'Action failed',
        variant: 'destructive',
      }),
  });
  const approvalSummary = useMemo(
    () =>
      data?.requiredApprovals.map((role) => ({
        role,
        approval: data.approvals.find(
          (item) =>
            item.approval_type === `PREPRODUCTION_${role}` &&
            item.decision === 'APPROVED'
        ),
      })) ?? [],
    [data]
  );
  if (isLoading)
    return <p className="text-sm">Loading Preproduction Readiness…</p>;
  if (error || !data)
    return (
      <Alert variant="destructive">
        <AlertTitle>Preproduction unavailable</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Unable to load readiness.'}
        </AlertDescription>
      </Alert>
    );
  if (!data.review)
    return (
      <Card data-testid="preproduction-no-revision">
        <CardHeader>
          <CardTitle>Start Preproduction Readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The draft is built dynamically from the current customer-order,
            technical, Production Plan, and WAD baselines.
          </p>
          <Input
            value={effectivity}
            onChange={(event) => setEffectivity(event.target.value)}
            placeholder="Configuration / PO-line effectivity"
            aria-label="Readiness effectivity"
          />
          <Button
            disabled={!effectivity.trim() || action.isPending}
            onClick={() =>
              action.mutate({
                path: '',
                body: {
                  checklist: data.recommendedChecklist,
                  effectivityReference: effectivity.trim(),
                },
              })
            }
          >
            Create Readiness Draft
          </Button>
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-3" data-testid="p2-v2-preproduction-readiness">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{data.readiness.state.replaceAll('_', ' ')}</Badge>
        <Badge variant="outline">Revision {data.review.revision_number}</Badge>
        <Badge variant="outline">
          {data.review.status.replaceAll('_', ' ')}
        </Badge>
        <Badge variant="outline">Project: {data.projectStatus}</Badge>
      </div>
      {data.readiness.blockers.length > 0 && (
        <Alert variant="destructive" data-testid="preproduction-blockers">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Release blockers</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {data.readiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checklist and evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.review.checklist_snapshot.map((item) => (
              <div key={item.key} className="rounded border p-2">
                <div className="flex justify-between gap-2">
                  <span>
                    <strong>{item.category}</strong> · {item.label}
                  </span>
                  <Badge variant="outline">
                    {item.applicability.replaceAll('_', ' ')}
                  </Badge>
                </div>
                <p
                  className={
                    item.satisfied ? 'text-green-700' : 'text-amber-700'
                  }
                >
                  {item.satisfied ? 'Satisfied' : 'Open'}
                </p>
                {item.justification && (
                  <p>Justification: {item.justification}</p>
                )}
                <p className="text-muted-foreground">
                  Evidence: {item.evidence?.length ?? 0}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approvals and baseline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {approvalSummary.map(({ role, approval }) => (
              <div
                key={role}
                className="flex items-center justify-between rounded border p-2"
              >
                <span>{role.replaceAll('_', ' ')}</span>
                {approval ? (
                  <span className="text-green-700">
                    <CheckCircle2 className="mr-1 inline h-4 w-4" />
                    {approval.actor_display_name}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Required</Badge>
                    {data.review?.status === 'PENDING_APPROVAL' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate({
                            path: `/${data.review!.id}/${
                              role === 'PROJECT_MANAGEMENT'
                                ? 'pm'
                                : role.toLowerCase().replaceAll('_', '-')
                            }-decision`,
                            body: {
                              expectedLockVersion: data.review!.lock_version,
                              decision: 'APPROVED',
                              signatureMeaning: `Approved as ${role.replaceAll('_', ' ')}`,
                              reason: '',
                            },
                          })
                        }
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <p>
              <strong>Effectivity:</strong> {data.review.effectivity_reference}
            </p>
            <p>
              <strong>Source revisions:</strong>{' '}
              {Object.entries(data.review.source_stage_revisions)
                .map(([key, value]) => `${key}: ${value ?? 'none'}`)
                .join(' · ')}
            </p>
            <p>
              <strong>Risks / controls:</strong>{' '}
              {data.review.risks_and_controls.length}
            </p>
            <p>
              <strong>Exceptions:</strong> {data.review.exceptions.length}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-blue-200">
        <CardContent className="space-y-3 p-4">
          <div>
            <h4 className="font-semibold">Controlled production transition</h4>
            <p className="text-sm text-muted-foreground">
              Approving Production Release records authorization and changes the
              project to READY_FOR_P2_RELEASE. It does not create production
              records or launch work.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.review.status === 'DRAFT' && (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    action.mutate({
                      path: `/${data.review!.id}/recalculate`,
                      body: {
                        expectedLockVersion: data.review!.lock_version,
                      },
                    })
                  }
                >
                  Recalculate Evidence
                </Button>
                <Button
                  variant="outline"
                  disabled={data.readiness.state !== 'READY'}
                  onClick={() =>
                    action.mutate({
                      path: `/${data.review!.id}/submit`,
                      body: {
                        expectedLockVersion: data.review!.lock_version,
                      },
                    })
                  }
                >
                  Submit for Approval
                </Button>
              </>
            )}
            {data.review.status === 'PENDING_APPROVAL' && (
              <Button
                variant="outline"
                onClick={() =>
                  action.mutate({
                    path: `/${data.review!.id}/complete`,
                    body: { expectedLockVersion: data.review!.lock_version },
                  })
                }
              >
                Complete Readiness
              </Button>
            )}
            <Button
              onClick={() => action.mutate({ path: '/release/approve' })}
              disabled={
                action.isPending ||
                data.review.status !== 'COMPLETE' ||
                data.readiness.state !== 'READY' ||
                Boolean(data.release)
              }
              data-testid="approve-production-release"
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Approve Production Release
            </Button>
            <Button
              variant="destructive"
              onClick={() => setLaunchOpen(true)}
              disabled={
                action.isPending ||
                data.projectStatus !== 'READY_FOR_P2_RELEASE' ||
                Boolean(data.launch?.status === 'COMPLETE')
              }
              data-testid="launch-production"
            >
              <Rocket className="mr-2 h-4 w-4" />
              Launch Production
            </Button>
          </div>
          {data.release && (
            <p className="text-sm">
              Release {data.release.status} ·{' '}
              {new Date(data.release.approved_at).toLocaleString()}
            </p>
          )}
          {data.launch && (
            <p className="text-sm">
              Launch {data.launch.status} ·{' '}
              {new Date(data.launch.launched_at).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent data-testid="launch-production-confirmation">
          <DialogHeader>
            <DialogTitle>Launch production?</DialogTitle>
            <DialogDescription>
              This revalidates the approved release, creates only missing
              serialized units and production orders through the existing P2
              services, routes items to their first valid department, activates
              Stage 8, and changes the project to IN_PRODUCTION. The operation
              is atomic and protected against duplicate retries.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLaunchOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={action.isPending}
              onClick={() =>
                action.mutate({
                  path: '/launch',
                  body: {
                    idempotencyKey:
                      globalThis.crypto?.randomUUID?.() ??
                      `${projectId}-${Date.now()}`,
                  },
                })
              }
            >
              Confirm Launch Production
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
