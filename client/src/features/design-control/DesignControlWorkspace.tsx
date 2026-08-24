import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { DESIGN_CONTROL_WORKFLOW } from '@shared/designControlWorkflow';
import {
  DESIGN_CONTROL_PHASES,
  designControlPhaseForStep,
} from '@shared/designControlPhases';
import { expandDesignControlTerm } from '@shared/designControlTerminology';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  LockKeyhole,
} from 'lucide-react';

import { DesignControlStepEditor } from './DesignControlStepEditor';
import { EngineeringReleaseGatePanel } from './EngineeringReleaseGatePanel';
import { DesignProjectConfigurationWorkspace } from './DesignProjectConfigurationWorkspace';
import { FinalDesignReviewPanel } from './FinalDesignReviewPanel';
import { ProjectTeamPanel } from './ProjectTeamPanel';
import { StructuredRecordsWorkspace } from './StructuredRecordsWorkspace';
import { TraceabilityMatrix } from './TraceabilityMatrix';
import { STRUCTURED_RECORD_TYPE_BY_STEP } from './designControlFieldPresentation';

import { ControlledCopyPanel } from '@/components/design-control/ControlledCopyPanel';
import { DesignHistoryFilePanel } from '@/components/design-control/DesignHistoryFilePanel';
import { EngineeringChangeNoticeWorkspace } from '@/components/design-control/EngineeringChangeNoticeWorkspace';
import { EngineeringChangeRequestRegister } from '@/components/design-control/EngineeringChangeRequestRegister';
import { PostReleaseChangePanel } from '@/components/design-control/PostReleaseChangePanel';
import { ProjectFormInstancesPanel } from '@/components/design-control/ProjectFormInstancesPanel';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type WorkspaceMode = 'project' | 'oversight' | 'auditor';

type LiveRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  formData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type StepRow = LiveRow & {
  stepKey: string;
  currentContentVersionId?: string | null;
  checklist?: Record<string, unknown>;
  approvedAt?: string | null;
  updatedAt?: string | null;
  contentVersion?: number;
  attachments?: unknown[];
};

type Detail = {
  record: {
    id: string;
    recordNumber?: string | null;
    title: string;
    status: string;
    recordVersion?: number;
    authorityStatus?: string;
    releasedAt?: string | null;
  };
  steps: StepRow[];
  requirements: LiveRow[];
  risks: LiveRow[];
  reviews: LiveRow[];
  verification: LiveRow[];
  validation: LiveRow[];
  changes: LiveRow[];
  releaseGate?: { status?: string; blockers?: unknown[] } | null;
  linkedProject?: { id: string; projectName: string } | null;
};

function displayStatus(value?: string | null) {
  const normalized = (value || 'not_started').toLowerCase();
  const labels: Record<string, string> = {
    not_started: 'Not started',
    draft: 'Draft',
    needs_approval: 'Draft',
    submitted: 'Submitted',
    submitted_for_approval: 'Submitted',
    approved: 'Approved',
    returned: 'Returned',
    returned_for_revision: 'Returned',
    rejected: 'Rejected',
  };
  return (
    labels[normalized] ??
    normalized
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

function LiveRegister({ title, rows }: { title: string; rows: LiveRow[] }) {
  const [search, setSearch] = useState('');
  const visible = rows.filter((row) =>
    `${row.title ?? ''} ${row.status ?? ''} ${JSON.stringify(row.formData ?? {})}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          Live authoritative records. Editing remains in its existing controlled
          workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm font-medium">
          Search {title.toLowerCase()}
          <Input
            className="mt-1"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {visible.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">
            No matching live records.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {visible.map((row) => (
              <div
                className="flex items-center justify-between gap-3 p-3"
                key={row.id}
              >
                <span className="text-sm font-medium">
                  {row.title || row.id}
                </span>
                <Badge variant="outline">{displayStatus(row.status)}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DesignControlWorkspace({
  projectId,
  recordId,
  releaseId,
  mode = 'project',
}: {
  projectId: string;
  recordId: string;
  releaseId?: string | null;
  mode?: WorkspaceMode;
}) {
  const queryClient = useQueryClient();
  const readOnly = mode === 'auditor';
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialStep =
    params.get('step') || DESIGN_CONTROL_WORKFLOW[0]?.key || '';
  const [activeStep, setActiveStep] = useState(initialStep);
  const [activeTab, setActiveTab] = useState(
    params.get('workspaceTab') || 'lifecycle'
  );

  const detailQuery = useQuery<Detail>({
    queryKey: ['/api/qms/design-control', recordId],
    queryFn: async () => {
      const response = await fetch(`/api/qms/design-control/${recordId}`, {
        credentials: 'include',
      });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? 'Permission denied.'
            : 'Unable to load Design Control workspace.'
        );
      return response.json();
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('project', projectId);
    url.searchParams.set('record', recordId);
    url.searchParams.set('step', activeStep);
    url.searchParams.set('workspaceTab', activeTab);
    if (readOnly) url.searchParams.set('mode', 'auditor');
    window.history.replaceState({}, '', url);
  }, [activeStep, activeTab, projectId, readOnly, recordId]);

  if (detailQuery.isLoading) {
    return (
      <div className="rounded-md border p-6 text-sm" role="status">
        Loading the Design Control workspace…
      </div>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="rounded-md border border-destructive/40 p-6" role="alert">
        <p className="font-medium">
          The Design Control workspace could not be loaded.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {(detailQuery.error as Error)?.message}
        </p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => detailQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const detail = detailQuery.data;
  const linkedProjectName = detail.linkedProject?.projectName || 'R&D project';
  const stepByKey = new Map(detail.steps.map((step) => [step.stepKey, step]));
  const selectedDefinition =
    DESIGN_CONTROL_WORKFLOW.find((step) => step.key === activeStep) ??
    DESIGN_CONTROL_WORKFLOW[0];
  const selectedStep = stepByKey.get(selectedDefinition.key);
  const selectedIndex = DESIGN_CONTROL_WORKFLOW.findIndex(
    (step) => step.key === selectedDefinition.key
  );
  const structuredRecordType =
    STRUCTURED_RECORD_TYPE_BY_STEP[selectedDefinition.key];
  const selectedPhase = designControlPhaseForStep(selectedDefinition.key)!;
  const released = Boolean(detail.record.releasedAt);
  const phaseStatus = (stepKeys: readonly string[]) => {
    const statuses = stepKeys.map(
      (key) => stepByKey.get(key)?.status?.toLowerCase() || 'not_started'
    );
    if (statuses.some((status) => ['rejected', 'blocked'].includes(status)))
      return 'Blocked';
    if (
      statuses.some((status) =>
        ['returned', 'returned_for_revision'].includes(status)
      )
    )
      return 'Returned';
    if (statuses.every((status) => ['approved', 'complete'].includes(status)))
      return 'Approved';
    if (
      statuses.some((status) =>
        ['submitted', 'submitted_for_approval'].includes(status)
      )
    )
      return 'Ready for review';
    if (statuses.every((status) => status === 'not_started'))
      return 'Not started';
    return 'In progress';
  };
  const phaseEntryStep = (stepKeys: readonly string[]) =>
    stepKeys.find((key) => {
      const status = stepByKey.get(key)?.status?.toLowerCase();
      return !['approved', 'complete', 'completed'].includes(status || '');
    }) ??
    stepKeys[stepKeys.length - 1] ??
    '12';
  const correctionDefinition = DESIGN_CONTROL_WORKFLOW.find((definition) => {
    const status = stepByKey.get(definition.key)?.status?.toLowerCase();
    return [
      'returned',
      'returned_for_revision',
      'rejected',
      'blocked',
    ].includes(status || '');
  });
  const firstIncompleteDefinition =
    correctionDefinition ??
    DESIGN_CONTROL_WORKFLOW.find((definition) => {
      const status = stepByKey.get(definition.key)?.status?.toLowerCase();
      return !['approved', 'complete', 'completed'].includes(status || '');
    }) ??
    DESIGN_CONTROL_WORKFLOW[DESIGN_CONTROL_WORKFLOW.length - 1];
  const currentPhase = released
    ? DESIGN_CONTROL_PHASES[5]
    : (designControlPhaseForStep(firstIncompleteDefinition.key) ??
      DESIGN_CONTROL_PHASES[0]);
  const currentStep = stepByKey.get(firstIncompleteDefinition.key);
  const waitingForApproval = ['submitted', 'submitted_for_approval'].includes(
    currentStep?.status?.toLowerCase() || ''
  );
  const nextActionLabel = readOnly
    ? 'View Current Design Phase'
    : released
      ? 'Start Design Change'
      : waitingForApproval
        ? 'Awaiting Approval'
        : correctionDefinition
          ? 'Resolve Returned Work'
          : firstIncompleteDefinition.key === '12'
            ? 'Resolve Release Blockers'
            : 'Continue Design';
  const selectedFormData = selectedStep?.formData ?? {};
  const selectedExample =
    'examples' in selectedDefinition
      ? selectedDefinition.examples?.[0]
      : undefined;
  const missingFields = selectedDefinition.fields.filter((field) => {
    const value = selectedFormData[field.key];
    return value === undefined || value === null || value === '';
  });
  const openRiskCount = detail.risks.filter(
    (risk) =>
      !['approved', 'accepted', 'closed'].includes(
        (risk.status || '').toLowerCase()
      )
  ).length;
  const openActionCount = detail.reviews.reduce((total, review) => {
    const actions = Array.isArray(review.metadata?.reviewActions)
      ? review.metadata.reviewActions
      : [];
    return total + actions.length;
  }, 0);
  const responsibleField = firstIncompleteDefinition.fields.find((field) =>
    /responsible|owner|manager|representative|engineer/i.test(field.label)
  );
  const responsiblePerson = responsibleField
    ? String(currentStep?.formData?.[responsibleField.key] || '')
    : '';

  return (
    <section className="space-y-4" aria-label="Design Control workspace">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{detail.record.title}</CardTitle>
              <CardDescription>
                Follow the current phase and complete the one action shown
                below.
              </CardDescription>
              <p className="mt-1 text-sm">
                R&amp;D project:{' '}
                <Link
                  href={`/design/rd-projects?projectId=${encodeURIComponent(projectId)}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {linkedProjectName}
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {currentPhase.title} ·{' '}
                {released ? 'Released' : phaseStatus(currentPhase.stepKeys)}
              </Badge>
              {readOnly && (
                <Badge variant="secondary">
                  <LockKeyhole className="mr-1 h-3 w-3" />
                  Auditor read-only
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="grid gap-3 sm:grid-cols-3"
            aria-label="Project guidance summary"
          >
            <div className="rounded-md border p-3">
              <span className="text-xs text-muted-foreground">
                Current phase
              </span>
              <p className="font-medium">{currentPhase.title}</p>
            </div>
            <div className="rounded-md border p-3">
              <span className="text-xs text-muted-foreground">
                Overall progress
              </span>
              <p className="font-medium">
                {
                  DESIGN_CONTROL_PHASES.filter(
                    (phase) =>
                      phase.stepKeys.length > 0 &&
                      phaseStatus(phase.stepKeys) === 'Approved'
                  ).length
                }{' '}
                of 6 phases complete
              </p>
            </div>
            <div className="rounded-md border p-3">
              <span className="text-xs text-muted-foreground">
                Responsible for the next action
              </span>
              <p className="font-medium">
                {responsiblePerson ||
                  (waitingForApproval ? 'Assigned approver' : 'Project team')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-primary/40 bg-primary/5 p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Do This Next
              </p>
              <p className="font-semibold">{firstIncompleteDefinition.title}</p>
              <p className="text-sm text-muted-foreground">
                {waitingForApproval
                  ? 'This exact saved version is waiting for the assigned approver. You may continue after it is approved or returned.'
                  : firstIncompleteDefinition.purpose}
              </p>
            </div>
            <Button
              disabled={!readOnly && waitingForApproval}
              onClick={() => {
                if (released) setActiveTab('changes');
                else {
                  setActiveTab('lifecycle');
                  setActiveStep(firstIncompleteDefinition.key);
                }
              }}
              size="lg"
            >
              {nextActionLabel}
            </Button>
          </div>
          <ol
            className="grid gap-2 md:grid-cols-2 xl:grid-cols-3"
            aria-label="Six Design Control phases"
          >
            {DESIGN_CONTROL_PHASES.map((phase) => (
              <li
                className={`rounded-md border p-3 text-sm ${phase.key === currentPhase.key ? 'border-primary bg-primary/5' : ''}`}
                key={phase.key}
              >
                <button
                  className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    if (phase.key === 'control-changes') {
                      if (released) setActiveTab('changes');
                      return;
                    }
                    setActiveTab('lifecycle');
                    setActiveStep(phaseEntryStep(phase.stepKeys));
                  }}
                  disabled={phase.key === 'control-changes' && !released}
                  type="button"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold">
                      {phase.order}. {phase.title}
                    </span>
                    <Badge variant="outline">
                      {phase.key === 'control-changes'
                        ? released
                          ? 'Available'
                          : 'After release'
                        : phaseStatus(phase.stepKeys)}
                    </Badge>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {phase.explanation}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm">
            Follow the six phases in order. Controlled approvals, versions, and
            audit history are preserved automatically.
          </p>
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Record Details
            </summary>
            <div className="mt-3 flex flex-wrap gap-2 text-muted-foreground">
              <Badge variant="outline">
                Record {detail.record.recordNumber || detail.record.id}
              </Badge>
              <Badge variant="outline">
                Version {detail.record.recordVersion || 1}
              </Badge>
              <Badge variant="outline">
                Authority {displayStatus(detail.record.authorityStatus)}
              </Badge>
              <Badge variant="outline">
                Status {displayStatus(detail.record.status)}
              </Badge>
              <Badge variant="outline">Open risks {openRiskCount}</Badge>
              <Badge variant="outline">
                Open review actions {openActionCount}
              </Badge>
            </div>
            <p className="mt-3 text-muted-foreground">
              Revision A establishes the initial baseline. Released designs use
              {expandDesignControlTerm('ECR')} approval and{' '}
              {expandDesignControlTerm('ECN')} implementation before a Revision
              B+ baseline is released.
            </p>
          </details>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="lifecycle">Current work</TabsTrigger>
        </TabsList>

        <details className="mt-3 rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Evidence, team, changes &amp; history
          </summary>
          <TabsList className="mt-3 h-auto flex-wrap justify-start">
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="traceability">Traceability</TabsTrigger>
            <TabsTrigger value="final-review">Approval readiness</TabsTrigger>
            <TabsTrigger value="team">Project team</TabsTrigger>
            <TabsTrigger value="configuration">Project setup</TabsTrigger>
            <TabsTrigger value="changes">Design changes</TabsTrigger>
            <TabsTrigger value="documents">Forms &amp; copies</TabsTrigger>
            <TabsTrigger value="dhf">History &amp; package</TabsTrigger>
          </TabsList>
        </details>

        <TabsContent value="lifecycle" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-primary">
                    Phase {selectedPhase.order}: {selectedPhase.title}
                  </p>
                  <CardTitle>{selectedDefinition.title}</CardTitle>
                </div>
                <Badge variant="outline">
                  Controlled checkpoint {selectedDefinition.order} of 12
                </Badge>
              </div>
              <CardDescription>{selectedDefinition.purpose}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <section
                aria-labelledby="phase-guidance-heading"
                className="rounded-md border bg-muted/20 p-4"
              >
                <h3 id="phase-guidance-heading" className="font-semibold">
                  What you need to do
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedDefinition.purpose}
                </p>
                {selectedExample && (
                  <p className="mt-2 text-sm">
                    <span className="font-medium">Example:</span>{' '}
                    {selectedExample}
                  </p>
                )}
              </section>
              <section aria-labelledby="required-information-heading">
                <h3 id="required-information-heading" className="font-semibold">
                  Required information
                </h3>
                <p className="text-sm text-muted-foreground">
                  Complete the focused fields and linked authoritative records
                  below. You can save an incomplete draft.
                </p>
              </section>
              <section
                aria-labelledby="missing-information-heading"
                className="rounded-md border p-4"
              >
                <h3 id="missing-information-heading" className="font-semibold">
                  What is missing
                </h3>
                {missingFields.length === 0 ? (
                  <p className="mt-2 flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4" /> No empty required
                    fields were found in this draft.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {missingFields.slice(0, 6).map((field) => (
                      <li key={field.key}>
                        <button
                          className="text-left text-primary underline-offset-4 hover:underline"
                          onClick={() =>
                            document
                              .getElementById(
                                `design-control-${selectedDefinition.key}-${field.key}`
                              )
                              ?.focus()
                          }
                          type="button"
                        >
                          Complete {field.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <p className="font-medium">
                    {displayStatus(selectedStep?.status)}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <span className="text-xs text-muted-foreground">
                    Evidence
                  </span>
                  <p className="font-medium">
                    {selectedStep?.attachments?.length || 0} attachment(s)
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <span className="text-xs text-muted-foreground">
                    Approval
                  </span>
                  <p className="font-medium">
                    {selectedStep?.approvedAt
                      ? 'Authenticated approval recorded'
                      : 'Pending or not required'}
                  </p>
                </div>
              </div>
              <DesignControlStepEditor
                definition={selectedDefinition}
                hasNext={selectedIndex < DESIGN_CONTROL_WORKFLOW.length - 1}
                hasPrevious={selectedIndex > 0}
                onChanged={async (savedStep) => {
                  if (!savedStep) {
                    await detailQuery.refetch();
                    return;
                  }
                  // The PATCH response is the authoritative committed row. Use
                  // it directly so a lagging read cannot restore the user's
                  // pre-save values in the editor.
                  queryClient.setQueryData<Detail>(
                    ['/api/qms/design-control', recordId],
                    (current) =>
                      current
                        ? {
                            ...current,
                            steps: current.steps.map((candidate) =>
                              candidate.stepKey === savedStep.stepKey
                                ? { ...candidate, ...savedStep }
                                : candidate
                            ),
                          }
                        : current
                  );
                }}
                onNext={() =>
                  setActiveStep(DESIGN_CONTROL_WORKFLOW[selectedIndex + 1].key)
                }
                onPrevious={() =>
                  setActiveStep(DESIGN_CONTROL_WORKFLOW[selectedIndex - 1].key)
                }
                readOnly={readOnly}
                recordId={recordId}
                projectId={projectId}
                step={selectedStep}
              />
              {structuredRecordType && (
                <section
                  className="space-y-3 border-t pt-5"
                  aria-label={`${selectedDefinition.title} authoritative register`}
                >
                  <div>
                    <h3 className="font-semibold">
                      Authoritative structured records
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Add and revise individual records here. These normalized,
                      versioned records remain the source for traceability and
                      readiness; the stage summary does not replace them.
                    </p>
                  </div>
                  <StructuredRecordsWorkspace
                    key={`${selectedDefinition.key}-${structuredRecordType}`}
                    allowedTypes={[structuredRecordType]}
                    compact
                    initialType={structuredRecordType}
                    readOnly={readOnly}
                    recordId={recordId}
                  />
                </section>
              )}
              {selectedDefinition.key === '11' && (
                <FinalDesignReviewPanel
                  readOnly={readOnly}
                  recordId={recordId}
                />
              )}
              {selectedDefinition.key === '12' && (
                <EngineeringReleaseGatePanel
                  readOnly={readOnly}
                  recordId={recordId}
                />
              )}
              <ProjectFormInstancesPanel
                recordId={recordId}
                oversightMode={readOnly}
                stepKey={selectedDefinition.key}
              />
              <section
                aria-labelledby="review-approval-heading"
                className="border-t pt-4"
              >
                <h3 id="review-approval-heading" className="font-semibold">
                  Review and approval
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedStep?.approvedAt
                    ? 'Authenticated approval is recorded for this exact version.'
                    : 'Review assignments, decisions, comments, and authenticated approval remain pending or are not yet required.'}
                </p>
              </section>
              <section
                aria-labelledby="history-heading"
                className="border-t pt-4"
              >
                <h3 id="history-heading" className="font-semibold">
                  History
                </h3>
                <p className="text-sm text-muted-foreground">
                  Generation {selectedStep?.contentVersion || 0}
                  {selectedStep?.updatedAt
                    ? ` · last changed ${new Date(selectedStep.updatedAt).toLocaleString()}`
                    : ' · no saved revision yet'}
                  . Previous versions and decisions remain in the controlled
                  record.
                </p>
              </section>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="space-y-4">
          <StructuredRecordsWorkspace recordId={recordId} readOnly={readOnly} />
          <LiveRegister title="Design changes" rows={detail.changes} />
        </TabsContent>

        <TabsContent value="traceability">
          <TraceabilityMatrix recordId={recordId} />
        </TabsContent>

        <TabsContent value="final-review">
          <FinalDesignReviewPanel recordId={recordId} readOnly={readOnly} />
        </TabsContent>

        <TabsContent value="team">
          <ProjectTeamPanel recordId={recordId} readOnly={readOnly} />
        </TabsContent>

        <TabsContent value="configuration">
          <DesignProjectConfigurationWorkspace
            designControlReadiness={detail.record.status}
            projectId={projectId}
            projectName={detail.record.title}
          />
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          <Card>
            <CardContent className="pt-6 text-sm">
              <strong>{expandDesignControlTerm('ECR')}</strong> asks whether a
              change should be made.{' '}
              <strong>{expandDesignControlTerm('ECN')}</strong> controls
              implementation. Engineering Release establishes the resulting
              controlled baseline.
            </CardContent>
          </Card>
          <EngineeringChangeRequestRegister
            projectId={projectId}
            recordId={recordId}
            oversightMode={readOnly}
          />
          <EngineeringChangeNoticeWorkspace
            projectId={projectId}
            oversightMode={readOnly}
          />
          <PostReleaseChangePanel
            projectId={projectId}
            recordId={recordId}
            oversightMode={readOnly}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <ProjectFormInstancesPanel
            recordId={recordId}
            oversightMode={readOnly}
          />
          <ControlledCopyPanel
            projectId={projectId}
            recordId={recordId}
            oversightMode={readOnly}
          />
        </TabsContent>

        <TabsContent value="dhf" className="space-y-4">
          {releaseId ? (
            <DesignHistoryFilePanel
              projectId={projectId}
              releaseId={releaseId}
              oversightMode={readOnly}
            />
          ) : (
            <div className="rounded-md border p-6 text-sm text-muted-foreground">
              <FileSearch className="mb-2 h-5 w-5" />A released Engineering
              baseline is required before a {expandDesignControlTerm('DHF')} can
              be generated.
            </div>
          )}
          {!releaseId && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Engineering Package state is available after release.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
