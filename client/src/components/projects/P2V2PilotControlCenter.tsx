import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, LockKeyhole, Shield } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePermissions } from '@/hooks/usePermissions';

type PilotRow = {
  authorization_number: string;
  environment: string;
  customer_po_number: string;
  approved_po_lines: Array<{
    poLineId: number;
    partNumber: string;
    maximumQuantity: number;
  }>;
  authorized_participants: Array<{ userId: number; functionalRole: string }>;
  status: string;
  revision_number: number;
  configuration_baseline_revision: string;
  production_plan_revision: number;
  wad_revision: number;
  review_expires_at: string;
  rollback_owner_user_id: number;
  rollback_plan_reference: string;
};

type PilotDashboard = {
  environment: string;
  pilot: PilotRow | null;
  readiness: {
    ready: boolean;
    blockers: Array<{
      key: string;
      reason: string;
      responsibleFunction?: string;
      correctionLocation?: string;
      status?: string;
    }>;
  };
  approvals: Array<{
    approval_type: string;
    decision: string;
    decided_at: string;
  }>;
  training: Array<{
    user_id: number;
    functional_role: string;
    training_version: string;
    expires_at?: string;
  }>;
  issues: Array<{
    issue_number: string;
    severity: string;
    category: string;
    status: string;
    description: string;
  }>;
  evidenceManifest: Array<{ category: string }>;
  events: Array<{ event_type: string; meaning: string; occurred_at: string }>;
  nextAuthorizedAction: string;
};

export default function P2V2PilotControlCenter({
  projectId,
}: {
  projectId: string;
}) {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const allowed = can('projects.pilot_v2.view');
  const { data, isLoading, error } = useQuery<PilotDashboard>({
    queryKey: ['/api/projects', projectId, 'workflow-v2', 'pilot-control'],
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/pilot-control`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.message ||
            'Unable to load controlled pilot readiness.'
        );
      return response.json();
    },
    enabled: allowed,
  });

  if (permissionsLoading || !allowed) return null;
  if (isLoading)
    return (
      <Card data-testid="pilot-control-loading">
        <CardContent className="p-6">
          Loading restricted pilot controls…
        </CardContent>
      </Card>
    );
  if (error || !data)
    return (
      <Card className="border-red-300" data-testid="pilot-control-error">
        <CardContent className="p-6 text-red-700">
          {error instanceof Error
            ? error.message
            : 'Pilot controls are unavailable.'}
        </CardContent>
      </Card>
    );

  return (
    <Card className="border-blue-300" data-testid="p2-v2-pilot-control-center">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Restricted Pilot Control Center
            </CardTitle>
            <CardDescription>
              Quality and rollout-administrator view. Ordinary project users
              cannot access pilot controls.
            </CardDescription>
          </div>
          <Badge
            variant={data.pilot?.status === 'ACTIVE' ? 'default' : 'outline'}
          >
            {data.pilot?.status || 'NO PILOT SELECTED'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!data.pilot ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
            <p className="font-medium">
              Pilot activation awaiting authorization
            </p>
            <p>No customer PO or real pilot project has been selected.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Environment</span>
                <p className="font-medium">{data.pilot.environment}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Authorization</span>
                <p className="font-medium">
                  {data.pilot.authorization_number} · R
                  {data.pilot.revision_number}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Customer PO</span>
                <p className="font-medium">{data.pilot.customer_po_number}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Review expiration</span>
                <p className="font-medium">
                  {new Date(data.pilot.review_expires_at).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Configuration baseline
                </span>
                <p className="font-medium">
                  {data.pilot.configuration_baseline_revision}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  Production plan / WAD
                </span>
                <p className="font-medium">
                  R{data.pilot.production_plan_revision} / R
                  {data.pilot.wad_revision}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Rollback owner</span>
                <p className="font-medium">
                  User {data.pilot.rollback_owner_user_id}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Recovery plan</span>
                <p className="font-medium">
                  {data.pilot.rollback_plan_reference}
                </p>
              </div>
            </div>

            <section>
              <h4 className="font-medium">
                Approved PO lines, parts, and quantities
              </h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {data.pilot.approved_po_lines.map((line) => (
                  <div
                    key={line.poLineId}
                    className="rounded border p-3 text-sm"
                  >
                    Line {line.poLineId} · {line.partNumber} · maximum{' '}
                    {line.maximumQuantity}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="font-medium">
                Assigned users, roles, and training
              </h4>
              <div className="mt-2 space-y-2">
                {data.pilot.authorized_participants.map((participant) => {
                  const training = data.training.find(
                    (entry) =>
                      Number(entry.user_id) === participant.userId &&
                      entry.functional_role === participant.functionalRole
                  );
                  return (
                    <div
                      key={`${participant.userId}-${participant.functionalRole}`}
                      className="flex justify-between rounded border p-3 text-sm"
                    >
                      <span>
                        User {participant.userId} · {participant.functionalRole}
                      </span>
                      <Badge variant={training ? 'outline' : 'destructive'}>
                        {training
                          ? `Training ${training.training_version}`
                          : 'Training missing'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <section>
          <h4 className="flex items-center gap-2 font-medium">
            {data.readiness.ready ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            )}
            Readiness {data.readiness.ready ? 'ready' : 'blocked'}
          </h4>
          {data.readiness.blockers.length ? (
            <div className="mt-2 space-y-2">
              {data.readiness.blockers.map((blocker, index) => (
                <div
                  key={`${blocker.key}-${index}`}
                  className="rounded border border-red-200 bg-red-50 p-3 text-sm"
                >
                  <p className="font-medium">
                    What: {blocker.key.replaceAll('_', ' ')}
                  </p>
                  <p>Why: {blocker.reason}</p>
                  <p>
                    Who: {blocker.responsibleFunction || 'Pilot administrator'}
                  </p>
                  <p>
                    Where:{' '}
                    {blocker.correctionLocation || 'Pilot control center'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-green-700">
              All server-evaluated readiness evidence is current.
            </p>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded border p-3 text-sm">
            <strong>Approvals:</strong>{' '}
            {
              data.approvals.filter(
                (approval) => approval.decision === 'APPROVED'
              ).length
            }
            /4
          </div>
          <div className="rounded border p-3 text-sm">
            <strong>Open issues:</strong>{' '}
            {data.issues.filter((issue) => issue.status !== 'CLOSED').length}
          </div>
          <div className="rounded border p-3 text-sm">
            <strong>Evidence links:</strong> {data.evidenceManifest.length}
          </div>
        </div>

        <div className="rounded border bg-muted/30 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <LockKeyhole className="h-4 w-4" />
            Next authorized action
          </p>
          <p>{data.nextAuthorizedAction}</p>
        </div>
      </CardContent>
    </Card>
  );
}
