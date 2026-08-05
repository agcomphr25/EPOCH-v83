import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DESIGN_CONTROL_WORKFLOW } from '@shared/designControlWorkflow';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileSearch,
  LockKeyhole,
} from 'lucide-react';

import { DesignControlStepEditor } from './DesignControlStepEditor';

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
};

const lifecycleLabels = [
  'Project Intake',
  'Planning',
  'Inputs',
  'Reviews and Risk',
  'Outputs',
  'Prototype',
  'Verification',
  'Validation',
  'Final Review',
  'Engineering Release',
  'Post-release Change Control',
  'DHF',
] as const;

function displayStatus(value?: string | null) {
  return (value || 'not started').replaceAll('_', ' ');
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
  const stepByKey = new Map(detail.steps.map((step) => [step.stepKey, step]));
  const selectedDefinition =
    DESIGN_CONTROL_WORKFLOW.find((step) => step.key === activeStep) ??
    DESIGN_CONTROL_WORKFLOW[0];
  const selectedStep = stepByKey.get(selectedDefinition.key);
  const completed = detail.steps.filter((step) =>
    ['approved', 'complete', 'completed'].includes(step.status || '')
  ).length;
  const selectedIndex = DESIGN_CONTROL_WORKFLOW.findIndex(
    (step) => step.key === selectedDefinition.key
  );

  return (
    <section className="space-y-4" aria-label="Design Control workspace">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{detail.record.title}</CardTitle>
              <CardDescription>
                Record {detail.record.recordNumber || detail.record.id} ·
                generation {detail.record.recordVersion || 1}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                Authority: {displayStatus(detail.record.authorityStatus)}
              </Badge>
              <Badge variant="outline">
                Status: {displayStatus(detail.record.status)}
              </Badge>
              <Badge variant="outline">Progress: {completed}/12</Badge>
              {readOnly && (
                <Badge variant="secondary">
                  <LockKeyhole className="mr-1 h-3 w-3" />
                  Auditor read-only
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ol
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
            aria-label="Design lifecycle"
          >
            {lifecycleLabels.map((label, index) => (
              <li className="rounded-md border p-2 text-xs" key={label}>
                <span className="font-semibold">{index + 1}.</span> {label}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            Revision A establishes the initial baseline. Released designs use
            ECR approval and ECN implementation before a Revision B+ baseline is
            released.
          </p>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="lifecycle">12 steps</TabsTrigger>
          <TabsTrigger value="evidence">Evidence registers</TabsTrigger>
          <TabsTrigger value="changes">Engineering changes</TabsTrigger>
          <TabsTrigger value="documents">Forms &amp; copies</TabsTrigger>
          <TabsTrigger value="dhf">DHF &amp; package</TabsTrigger>
        </TabsList>

        <TabsContent
          value="lifecycle"
          className="grid gap-4 lg:grid-cols-[19rem_1fr]"
        >
          <nav className="space-y-2" aria-label="Design Control steps">
            {DESIGN_CONTROL_WORKFLOW.map((definition) => {
              const step = stepByKey.get(definition.key);
              const selected = definition.key === activeStep;
              return (
                <button
                  aria-current={selected ? 'step' : undefined}
                  className="flex w-full items-start gap-2 rounded-md border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  key={definition.key}
                  onClick={() => setActiveStep(definition.key)}
                  type="button"
                >
                  {step?.status === 'approved' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {definition.order}. {definition.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {displayStatus(step?.status)} · generation{' '}
                      {step?.contentVersion || 0}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedDefinition.order}. {selectedDefinition.title}
              </CardTitle>
              <CardDescription>{selectedDefinition.purpose}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                onChanged={() => detailQuery.refetch()}
                onNext={() =>
                  setActiveStep(DESIGN_CONTROL_WORKFLOW[selectedIndex + 1].key)
                }
                onPrevious={() =>
                  setActiveStep(DESIGN_CONTROL_WORKFLOW[selectedIndex - 1].key)
                }
                readOnly={readOnly}
                recordId={recordId}
                step={selectedStep}
              />
              <ProjectFormInstancesPanel
                recordId={recordId}
                oversightMode={readOnly}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="grid gap-4 md:grid-cols-2">
          <LiveRegister
            title="Requirements and traceability"
            rows={detail.requirements}
          />
          <LiveRegister title="Design risks" rows={detail.risks} />
          <LiveRegister title="Design reviews" rows={detail.reviews} />
          <LiveRegister title="Verification" rows={detail.verification} />
          <LiveRegister title="Validation" rows={detail.validation} />
          <LiveRegister title="Design changes" rows={detail.changes} />
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          <Card>
            <CardContent className="pt-6 text-sm">
              <strong>ECR</strong> asks whether a change should be made.{' '}
              <strong>ECN</strong> controls implementation. Engineering Release
              establishes the resulting controlled baseline.
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
              baseline is required before a DHF can be generated.
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
