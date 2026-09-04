import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  ShieldAlert,
} from 'lucide-react';

import P2V2DesignApplicability from './P2V2DesignApplicability';
import P2V2ProductionPlanning from './P2V2ProductionPlanning';
import P2V2TechnicalConfigurationReview from './P2V2TechnicalConfigurationReview';
import P2V2WadAuthorization from './P2V2WadAuthorization';
import P2V2CommercialReview from './P2V2CommercialReview';
import P2V2PreproductionReadiness from './P2V2PreproductionReadiness';
import P2V2ProductionExecution from './P2V2ProductionExecution';
import P2V2QualityProductRelease from './P2V2QualityProductRelease';
import P2V2ShippingProjectCloseout from './P2V2ShippingProjectCloseout';
import P2V2PilotControlCenter from './P2V2PilotControlCenter';
import P2V2HandoffExecution from './P2V2HandoffExecution';
import P2V2ProjectClosingSummary from './P2V2ProjectClosingSummary';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

type EvidenceLink = {
  id: string;
  recordType: string;
  recordId: string;
  relationshipType: string;
  isAuthoritative: boolean;
  recordRevision?: string | null;
  effectivityReference?: string | null;
  linkedByDisplayName?: string | null;
  linkedAt?: string | null;
  supersededAt?: string | null;
  supersededReason?: string | null;
};
type Approval = {
  id: string;
  decision: string;
  approvalType: string;
  signatureMeaning: string;
  actorDisplayName: string;
  actorRole?: string | null;
  decidedAt?: string | null;
  reason?: string | null;
  superseded: boolean;
};
type StageWorkspaceKey =
  | 'commercial_review'
  | 'design_applicability'
  | 'technical_configuration_review'
  | 'production_planning'
  | 'wad_authorization'
  | 'preproduction_readiness'
  | 'p2_release_handoff'
  | 'p2_execution_summary'
  | 'production_execution'
  | 'quality_product_release'
  | 'shipping_project_closeout'
  | 'project_closing_summary';
type StagePrimaryAction = {
  label: string;
  surface: {
    kind: 'workspace';
    key: StageWorkspaceKey;
  };
};
type Stage = {
  id: string;
  stepType: string;
  stepOrder: number;
  label: string;
  description?: string | null;
  primaryAction: StagePrimaryAction | null;
  status: string;
  applicability: string;
  applicabilityReason?: string | null;
  applicabilitySource?: string | null;
  ownerEmployeeId?: number | null;
  ownerDisplayName?: string | null;
  ownerRole?: string | null;
  dueDate?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  completedByDisplayName?: string | null;
  blockedReason?: string | null;
  revisionReference?: string | null;
  effectivityReference?: string | null;
  notes?: string | null;
  activeLinks: EvidenceLink[];
  supersededLinks: EvidenceLink[];
  approvals: Approval[];
  evidenceCount: number;
  lastUpdated?: string | null;
};
type WorkflowResponse = {
  projectId: string;
  initialized: boolean;
  workflowStatus: string;
  definitionVersion?: number | null;
  initializedAt?: string | null;
  initializedBy?: string | null;
  integrityStatus: string;
  integrityErrors: { code?: string; message?: string }[];
  totalStages: number;
  completedStages: number;
  blockedStages: number;
  pendingApprovalStages: number;
  percentComplete?: number | null;
  message?: string;
  stages: Stage[];
};

const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not recorded';
const statusStyle: Record<string, string> = {
  COMPLETE: 'bg-green-100 text-green-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  BLOCKED: 'bg-red-100 text-red-800',
  NOT_STARTED: 'bg-gray-100 text-gray-700',
  NOT_APPLICABLE: 'bg-slate-100 text-slate-700',
  SUPERSEDED: 'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-red-50 text-red-700',
};
const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'COMPLETE')
    return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (status === 'BLOCKED')
    return <AlertCircle className="h-5 w-5 text-red-600" />;
  if (status === 'IN_PROGRESS' || status === 'PENDING_APPROVAL')
    return <Clock className="h-5 w-5 text-blue-600" />;
  if (status === 'CANCELLED') return <Ban className="h-5 w-5 text-red-500" />;
  return <Circle className="h-5 w-5 text-gray-500" />;
};

function LinkList({ title, links }: { title: string; links: EvidenceLink[] }) {
  return (
    <section className="space-y-2">
      <h4 className="font-medium">{title}</h4>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        links.map((link) => (
          <div
            key={link.id}
            className="rounded border p-3 text-sm"
            data-testid={
              link.supersededAt ? 'v2-superseded-link' : 'v2-active-link'
            }
          >
            <div className="flex flex-wrap gap-2">
              <span className="font-medium">
                {link.recordType}: {link.recordId}
              </span>
              <Badge variant="outline">{link.relationshipType}</Badge>
              {link.isAuthoritative && <Badge>Authoritative</Badge>}
            </div>
            <p className="mt-1 text-muted-foreground">
              Revision: {link.recordRevision || 'None'} · Effectivity:{' '}
              {link.effectivityReference || 'None'}
            </p>
            <p className="text-muted-foreground">
              Linked by {link.linkedByDisplayName || 'Unknown'} ·{' '}
              {dateLabel(link.linkedAt)}
            </p>
            {link.supersededAt && (
              <p className="mt-1 text-amber-700">
                Superseded {dateLabel(link.supersededAt)}
                {link.supersededReason ? ` — ${link.supersededReason}` : ''}
              </p>
            )}
          </div>
        ))
      )}
    </section>
  );
}

const commercialStageTypes = [
  'rfq_risk_assessment',
  'estimate_quote',
  'contract_review',
] as const;
type CommercialStageType = (typeof commercialStageTypes)[number];
const isCommercialStageType = (
  stepType: string
): stepType is CommercialStageType =>
  commercialStageTypes.includes(stepType as CommercialStageType);

function StageWorkspace({
  projectId,
  stage,
}: {
  projectId: string;
  stage: Stage;
}) {
  const workspaceKey = stage.primaryAction?.surface.key;
  switch (workspaceKey) {
    case 'commercial_review':
      return isCommercialStageType(stage.stepType) ? (
        <P2V2CommercialReview projectId={projectId} stage={stage.stepType} />
      ) : null;
    case 'design_applicability':
      return <P2V2DesignApplicability projectId={projectId} />;
    case 'technical_configuration_review':
      return <P2V2TechnicalConfigurationReview projectId={projectId} />;
    case 'production_planning':
      return <P2V2ProductionPlanning projectId={projectId} />;
    case 'wad_authorization':
      return <P2V2WadAuthorization projectId={projectId} />;
    case 'preproduction_readiness':
      return <P2V2PreproductionReadiness projectId={projectId} />;
    case 'p2_release_handoff':
      return <P2V2HandoffExecution projectId={projectId} mode="handoff" />;
    case 'p2_execution_summary':
      return (
        <P2V2HandoffExecution
          projectId={projectId}
          mode="execution"
          showNavigation={false}
        />
      );
    case 'production_execution':
      return <P2V2ProductionExecution projectId={projectId} />;
    case 'quality_product_release':
      return <P2V2QualityProductRelease projectId={projectId} />;
    case 'shipping_project_closeout':
      return <P2V2ShippingProjectCloseout projectId={projectId} />;
    case 'project_closing_summary':
      return <P2V2ProjectClosingSummary projectId={projectId} />;
    default:
      return (
        <p
          className="text-sm text-amber-700"
          data-testid={`v2-stage-workspace-unavailable-${stage.stepOrder}`}
        >
          No stage workspace is registered for this workflow definition.
        </p>
      );
  }
}

export default function P2V2ProjectWorkflow({
  projectId,
}: {
  projectId: string;
}) {
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const { data, isLoading, error } = useQuery<WorkflowResponse>({
    queryKey: ['/api/projects', projectId, 'workflow-v2'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/workflow-v2`, {
        credentials: 'include',
      });
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.message ||
            'Unable to load V2 workflow'
        );
      const payload = (await response.json()) as WorkflowResponse;
      return {
        ...payload,
        integrityErrors: Array.isArray(payload.integrityErrors)
          ? payload.integrityErrors
          : [],
        stages: Array.isArray(payload.stages)
          ? payload.stages.map((stage) => ({
              ...stage,
              activeLinks: Array.isArray(stage.activeLinks)
                ? stage.activeLinks
                : [],
              supersededLinks: Array.isArray(stage.supersededLinks)
                ? stage.supersededLinks
                : [],
              approvals: Array.isArray(stage.approvals) ? stage.approvals : [],
              evidenceCount:
                typeof stage.evidenceCount === 'number'
                  ? stage.evidenceCount
                  : 0,
            }))
          : [],
      };
    },
  });
  if (isLoading)
    return (
      <Card data-testid="v2-workflow-loading">
        <CardContent className="p-6">
          Loading P2 Project Workflow V2…
        </CardContent>
      </Card>
    );
  if (error || !data)
    return (
      <Card className="border-red-300" data-testid="v2-workflow-error">
        <CardContent className="p-6 text-red-700">
          {error instanceof Error
            ? error.message
            : 'Unable to load V2 workflow.'}
        </CardContent>
      </Card>
    );
  if (!data.initialized)
    return (
      <Card data-testid="v2-workflow-not-initialized">
        <CardHeader>
          <CardTitle>Workflow not initialized</CardTitle>
          <CardDescription>{data.message}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No V2 workflow instance exists. Initialization is unavailable from
          this read-only view.
        </CardContent>
      </Card>
    );
  return (
    <div className="space-y-4" data-testid="p2-v2-project-workflow">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>P2 Project Workflow V2</CardTitle>
              <CardDescription>
                Controlled stage workspaces with read-only audit evidence ·
                Definition v{data.definitionVersion}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge>{data.workflowStatus}</Badge>
              <Badge
                variant={
                  data.integrityStatus === 'VALID' ? 'outline' : 'destructive'
                }
              >
                {data.integrityStatus}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Initialized</p>
              <p className="text-sm font-medium">
                {dateLabel(data.initializedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Initialized by</p>
              <p className="text-sm font-medium">
                {data.initializedBy || 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-sm font-medium">
                {data.completedStages}/{data.totalStages}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Blocked / Pending approval
              </p>
              <p className="text-sm font-medium">
                {data.blockedStages} / {data.pendingApprovalStages}
              </p>
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>Overall progress</span>
              <span>{data.percentComplete}%</span>
            </div>
            <Progress value={data.percentComplete ?? 0} />
          </div>
        </CardContent>
      </Card>
      {data.definitionVersion !== 3 && (
        <P2V2PilotControlCenter projectId={projectId} />
      )}
      {data.integrityStatus !== 'VALID' && (
        <Card
          className="border-red-400 bg-red-50"
          data-testid="v2-integrity-warning"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <ShieldAlert className="h-5 w-5" />
              Workflow integrity warning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
              {data.integrityErrors.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  {issue.code ? `${issue.code}: ` : ''}
                  {issue.message || 'Unknown integrity problem'}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <div className="space-y-3" aria-label="P2 V2 workflow stages">
        {data.stages.map((stage) => (
          <div key={stage.id} className="space-y-3">
            {data.definitionVersion === 3 &&
              [1, 8, 10].includes(stage.stepOrder) && (
                <div
                  className="rounded border-l-4 border-blue-600 bg-blue-50 p-3"
                  data-testid={`v2-workflow-section-${stage.stepOrder}`}
                >
                  <h2 className="font-semibold text-blue-950">
                    {stage.stepOrder === 1
                      ? 'A. Planning and Authorization'
                      : stage.stepOrder === 8
                        ? 'B. P2 Handoff and Execution'
                        : 'C. Completion'}
                  </h2>
                  <p className="text-sm text-blue-900">
                    {stage.stepOrder === 1
                      ? 'Stages 1–7 prepare, review, and authorize the customer order.'
                      : stage.stepOrder === 8
                        ? 'Stage 8 authorizes the handoff; Stage 9 reports authoritative P2 Control Center execution.'
                        : 'Stage 10 is the separate controlled Project Closing workspace.'}
                  </p>
                </div>
              )}
            <Card
              key={stage.id}
              className={stage.status === 'BLOCKED' ? 'border-red-300' : ''}
              data-testid={`v2-stage-${stage.stepOrder}`}
            >
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <StatusIcon status={stage.status} />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Stage {stage.stepOrder}
                      </p>
                      <h3 className="font-semibold">{stage.label}</h3>
                      <p className="text-sm text-muted-foreground">
                        {stage.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusStyle[stage.status] || ''}>
                      {stage.status.replaceAll('_', ' ')}
                    </Badge>
                    <Badge variant="outline">
                      {stage.applicability.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                </div>
                {stage.blockedReason && (
                  <p
                    className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700"
                    data-testid="v2-blocked-reason"
                  >
                    Blocked: {stage.blockedReason}
                  </p>
                )}
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <span>
                    Owner:{' '}
                    {stage.ownerDisplayName || stage.ownerRole || 'Unassigned'}
                  </span>
                  <span>Due: {stage.dueDate || 'Not set'}</span>
                  <span>
                    Links / evidence / approvals: {stage.activeLinks.length} /{' '}
                    {stage.evidenceCount} / {stage.approvals.length}
                  </span>
                  <span>Updated: {dateLabel(stage.lastUpdated)}</span>
                  <span>Revision: {stage.revisionReference || 'None'}</span>
                  <span>
                    Effectivity: {stage.effectivityReference || 'None'}
                  </span>
                  <span>
                    Completion: {stage.completedByDisplayName || 'Not complete'}
                  </span>
                </div>
                <section
                  className="mt-4 rounded-md border bg-muted/20 p-3"
                  aria-label={
                    stage.primaryAction?.label || `${stage.label} workspace`
                  }
                  data-testid={`v2-stage-workspace-${stage.stepOrder}`}
                  data-workspace-key={stage.primaryAction?.surface.key}
                >
                  <div className="mb-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Primary stage workspace
                    </p>
                    <h4 className="text-sm font-semibold">
                      {stage.primaryAction?.label || `Open ${stage.label}`}
                    </h4>
                  </div>
                  <StageWorkspace projectId={projectId} stage={stage} />
                </section>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => setSelectedStage(stage)}
                  data-testid={`v2-stage-audit-evidence-${stage.stepOrder}`}
                >
                  <Eye className="mr-1 h-4 w-4" />
                  Audit evidence
                </Button>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
      <Dialog
        open={Boolean(selectedStage)}
        onOpenChange={(open) => !open && setSelectedStage(null)}
      >
        <DialogContent
          className="max-h-[85vh] max-w-3xl overflow-y-auto"
          data-testid="v2-stage-details-dialog"
        >
          <DialogHeader>
            <DialogTitle>{selectedStage?.label}</DialogTitle>
            <DialogDescription>
              Read-only workflow stage audit evidence
            </DialogDescription>
          </DialogHeader>
          {selectedStage && (
            <div className="space-y-5 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <strong>Status:</strong> {selectedStage.status}
                </p>
                <p>
                  <strong>Applicability:</strong> {selectedStage.applicability}
                </p>
                <p>
                  <strong>Owner:</strong>{' '}
                  {selectedStage.ownerDisplayName ||
                    selectedStage.ownerRole ||
                    'Unassigned'}
                </p>
                <p>
                  <strong>Due:</strong> {selectedStage.dueDate || 'Not set'}
                </p>
                <p>
                  <strong>Completed:</strong>{' '}
                  {selectedStage.completedByDisplayName || 'No'} ·{' '}
                  {dateLabel(selectedStage.completedAt)}
                </p>
                <p>
                  <strong>Revision/effectivity:</strong>{' '}
                  {selectedStage.revisionReference || 'None'} /{' '}
                  {selectedStage.effectivityReference || 'None'}
                </p>
              </div>
              <p>{selectedStage.description}</p>
              {selectedStage.applicabilityReason && (
                <p>
                  <strong>Applicability basis:</strong>{' '}
                  {selectedStage.applicabilityReason} (
                  {selectedStage.applicabilitySource || 'source unknown'})
                </p>
              )}
              {selectedStage.blockedReason && (
                <p className="text-red-700">
                  <strong>Blocked:</strong> {selectedStage.blockedReason}
                </p>
              )}
              {selectedStage.notes && (
                <p>
                  <strong>Notes:</strong> {selectedStage.notes}
                </p>
              )}
              <LinkList
                title="Active links"
                links={selectedStage.activeLinks}
              />
              <LinkList
                title="Superseded links"
                links={selectedStage.supersededLinks}
              />
              <section className="space-y-2">
                <h4 className="font-medium">Approval history</h4>
                {selectedStage.approvals.length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  selectedStage.approvals.map((approval) => (
                    <div
                      key={approval.id}
                      className="rounded border p-3"
                      data-testid="v2-approval"
                    >
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{approval.decision}</Badge>
                        <span className="font-medium">
                          {approval.approvalType}
                        </span>
                        {approval.superseded && (
                          <Badge variant="secondary">Superseded</Badge>
                        )}
                      </div>
                      <p>{approval.signatureMeaning}</p>
                      <p className="text-muted-foreground">
                        {approval.actorDisplayName}
                        {approval.actorRole
                          ? ` · ${approval.actorRole}`
                          : ''} · {dateLabel(approval.decidedAt)}
                      </p>
                      {approval.reason && <p>{approval.reason}</p>}
                    </div>
                  ))
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
