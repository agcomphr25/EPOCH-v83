import { useEffect, useMemo, useState } from 'react';
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
import { Label } from '@/components/ui/label';

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
type TemplateSummary = {
  id: string;
  name: string;
  isActive?: boolean;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};
type TemplateDetail = TemplateSummary & {
  sections: Array<{
    id: string;
    name: string;
    tasks: Array<{ id: string; description: string }>;
  }>;
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
  productionLaunchEnabled: boolean;
  recommendedChecklist: ChecklistItem[];
};

const endpoint = (projectId: string) =>
  `/api/projects/${projectId}/workflow-v2/preproduction-readiness`;

const copyChecklist = (items: ChecklistItem[]) =>
  items.map((item) => ({
    ...item,
    evidence: (item.evidence ?? []).map((evidence) => ({ ...evidence })),
  }));

const templateChecklist = (template: TemplateDetail): ChecklistItem[] => {
  const revision = template.updatedAt || template.createdAt || undefined;
  return template.sections.flatMap((section) =>
    section.tasks.map((task) => ({
      key: `template:${template.id}:${task.id}`,
      category: section.name,
      label: task.description,
      applicability: 'REQUIRED' as const,
      satisfied: false,
      evidence: [
        {
          recordType: 'PREPRODUCTION_TEMPLATE',
          recordId: template.id,
          ...(revision ? { revision } : {}),
        },
      ],
    }))
  );
};

export default function P2V2PreproductionReadiness({
  projectId,
}: {
  projectId: string;
}) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [effectivity, setEffectivity] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
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
      return {
        ...body,
        history: Array.isArray(body?.history) ? body.history : [],
        approvals: Array.isArray(body?.approvals) ? body.approvals : [],
        requiredApprovals: Array.isArray(body?.requiredApprovals)
          ? body.requiredApprovals
          : [],
        recommendedChecklist: Array.isArray(body?.recommendedChecklist)
          ? body.recommendedChecklist
          : [],
        readiness: {
          ...(body?.readiness ?? {}),
          blockers: Array.isArray(body?.readiness?.blockers)
            ? body.readiness.blockers
            : [],
        },
        review: body?.review
          ? {
              ...body.review,
              checklist_snapshot: Array.isArray(body.review.checklist_snapshot)
                ? body.review.checklist_snapshot
                : [],
              exceptions: Array.isArray(body.review.exceptions)
                ? body.review.exceptions
                : [],
              risks_and_controls: Array.isArray(body.review.risks_and_controls)
                ? body.review.risks_and_controls
                : [],
            }
          : null,
      };
    },
  });
  const { data: templates = [], error: templatesError } = useQuery<
    TemplateSummary[]
  >({
    queryKey: ['/api/preproduction-checklists/templates'],
    queryFn: async () => {
      const response = await fetch('/api/preproduction-checklists/templates', {
        credentials: 'include',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.error || 'Unable to load templates');
      return Array.isArray(body) ? body : [];
    },
    enabled: workspaceOpen,
  });
  const {
    data: selectedTemplate,
    isFetching: templateLoading,
    error: templateError,
  } = useQuery<TemplateDetail>({
    queryKey: ['/api/preproduction-checklists/templates', selectedTemplateId],
    queryFn: async () => {
      const response = await fetch(
        `/api/preproduction-checklists/templates/${selectedTemplateId}`,
        { credentials: 'include' }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.error || 'Unable to load template');
      if (body?.isActive === false)
        throw new Error(
          'This pre-production template is no longer active. Select a current template.'
        );
      return {
        ...body,
        sections: Array.isArray(body?.sections)
          ? body.sections.map((section: Record<string, unknown>) => ({
              ...section,
              tasks: Array.isArray(section.tasks) ? section.tasks : [],
            }))
          : [],
      } as TemplateDetail;
    },
    enabled: workspaceOpen && Boolean(selectedTemplateId),
  });
  useEffect(() => {
    if (!data) return;
    setEffectivity(data.review?.effectivity_reference ?? '');
    setChecklist(
      copyChecklist(
        data.review?.checklist_snapshot ?? data.recommendedChecklist ?? []
      )
    );
  }, [data]);
  const refresh = () =>
    client.invalidateQueries({
      queryKey: ['/api/projects', projectId],
    });
  const action = useMutation({
    mutationFn: async ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body?: Record<string, unknown>;
      method?: 'POST' | 'PATCH';
    }) => {
      const response = await fetch(`${endpoint(projectId)}${path}`, {
        method,
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
  const applySelectedTemplate = () => {
    if (!selectedTemplate) return;
    setChecklist((current) => [
      ...current.filter((item) => !item.key.startsWith('template:')),
      ...templateChecklist(selectedTemplate),
    ]);
  };
  const updateChecklistItem = (index: number, update: Partial<ChecklistItem>) =>
    setChecklist((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...update } : item
      )
    );
  const saveDraft = () => {
    if (!data) return;
    const body = {
      checklist: checklist.map((item) => ({
        ...item,
        evidence: (item.evidence ?? [])
          .map((evidence) => ({
            recordType: String(evidence.recordType ?? '').trim(),
            recordId: String(evidence.recordId ?? '').trim(),
            ...(evidence.revision?.trim()
              ? { revision: evidence.revision.trim() }
              : {}),
          }))
          .filter(
            (evidence) => evidence.recordType.length && evidence.recordId.length
          ),
      })),
      exceptions: data.review?.exceptions ?? [],
      risksAndControls: data.review?.risks_and_controls ?? [],
      effectivityReference: effectivity.trim(),
    };
    action.mutate(
      data.review
        ? {
            path: `/${data.review.id}`,
            method: 'PATCH',
            body: {
              ...body,
              expectedLockVersion: data.review.lock_version,
            },
          }
        : { path: '', body }
    );
  };
  if (isLoading)
    return (
      <Button variant="outline" size="sm" disabled>
        Loading Preproduction Readiness…
      </Button>
    );
  if (error || !data)
    return (
      <Alert variant="destructive">
        <AlertTitle>Preproduction unavailable</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Unable to load readiness.'}
        </AlertDescription>
      </Alert>
    );

  const editable = !data.review || data.review.status === 'DRAFT';

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setWorkspaceOpen(true)}
        data-testid="open-preproduction-readiness"
      >
        Open Preproduction Readiness Form
      </Button>
      <Dialog open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
        <DialogContent
          className="max-h-[92vh] max-w-6xl overflow-y-auto"
          data-testid="p2-v2-preproduction-readiness"
        >
          <DialogHeader>
            <DialogTitle>Preproduction Readiness Form</DialogTitle>
            <DialogDescription>
              Complete the project-specific readiness checklist, attach exact
              evidence, and route the controlled revision for approval. A
              reusable template seeds tasks only; it never completes or approves
              this V2 stage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{data.readiness.state.replaceAll('_', ' ')}</Badge>
              {data.review && (
                <>
                  <Badge variant="outline">
                    Revision {data.review.revision_number}
                  </Badge>
                  <Badge variant="outline">
                    {data.review.status.replaceAll('_', ' ')}
                  </Badge>
                </>
              )}
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
            <Card data-testid={!data.review ? 'preproduction-no-revision' : ''}>
              <CardHeader>
                <CardTitle className="text-base">
                  Form source and effectivity
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="preproduction-template">
                    Pre-production review template
                  </Label>
                  <select
                    id="preproduction-template"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedTemplateId}
                    onChange={(event) =>
                      setSelectedTemplateId(event.target.value)
                    }
                    disabled={!editable}
                  >
                    <option value="">System readiness items only</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Applying a template replaces only previously imported
                    template tasks and preserves the V2 system checks.
                  </p>
                  {(templatesError || templateError) && (
                    <p className="text-xs text-red-700" role="alert">
                      {templatesError instanceof Error
                        ? templatesError.message
                        : templateError instanceof Error
                          ? templateError.message
                          : 'Unable to load the selected template.'}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applySelectedTemplate}
                    disabled={!editable || !selectedTemplate || templateLoading}
                    data-testid="apply-preproduction-template"
                  >
                    {templateLoading ? 'Loading template…' : 'Apply template'}
                  </Button>
                  <Button variant="outline" asChild>
                    <a
                      href={`/preproduction-checklists?projectId=${encodeURIComponent(projectId)}`}
                    >
                      Manage template library
                    </a>
                  </Button>
                </div>
                <div className="space-y-2 lg:col-span-2">
                  <Label htmlFor="preproduction-effectivity">
                    Configuration / PO-line effectivity
                  </Label>
                  <Input
                    id="preproduction-effectivity"
                    value={effectivity}
                    onChange={(event) => setEffectivity(event.target.value)}
                    placeholder="For example: PO 12345, line 10, Rev C"
                    aria-label="Readiness effectivity"
                    disabled={!editable}
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Checklist and evidence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {checklist.length === 0 ? (
                  <p className="text-muted-foreground">
                    No readiness items are available. Recalculate the source
                    baseline or select a template before saving.
                  </p>
                ) : (
                  checklist.map((item, index) => (
                    <div
                      key={item.key}
                      className="space-y-3 rounded border p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{item.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.category}
                          </p>
                        </div>
                        {item.key.startsWith('template:') && (
                          <Badge variant="outline">Template task</Badge>
                        )}
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label htmlFor={`applicability-${index}`}>
                            Applicability
                          </Label>
                          <select
                            id={`applicability-${index}`}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={item.applicability}
                            disabled={!editable}
                            onChange={(event) =>
                              updateChecklistItem(index, {
                                applicability: event.target
                                  .value as ChecklistItem['applicability'],
                              })
                            }
                          >
                            <option value="REQUIRED">Required</option>
                            <option value="NOT_REQUIRED">Not required</option>
                            <option value="NOT_APPLICABLE">
                              Not applicable
                            </option>
                          </select>
                        </div>
                        <label className="flex items-end gap-2 pb-2">
                          <input
                            type="checkbox"
                            checked={item.satisfied}
                            disabled={!editable}
                            onChange={(event) =>
                              updateChecklistItem(index, {
                                satisfied: event.target.checked,
                              })
                            }
                          />
                          Requirement satisfied
                        </label>
                        {item.applicability === 'NOT_APPLICABLE' && (
                          <label className="flex items-end gap-2 pb-2">
                            <input
                              type="checkbox"
                              checked={Boolean(item.approvedJustification)}
                              disabled={!editable}
                              onChange={(event) =>
                                updateChecklistItem(index, {
                                  approvedJustification: event.target.checked,
                                })
                              }
                            />
                            Justification approved
                          </label>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`justification-${index}`}>
                          Justification / completion note
                        </Label>
                        <Input
                          id={`justification-${index}`}
                          value={item.justification ?? ''}
                          disabled={!editable}
                          onChange={(event) =>
                            updateChecklistItem(index, {
                              justification: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Linked evidence</Label>
                          {editable && !item.key.startsWith('template:') && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateChecklistItem(index, {
                                  evidence: [
                                    ...(item.evidence ?? []),
                                    { recordType: '', recordId: '' },
                                  ],
                                })
                              }
                            >
                              Add evidence
                            </Button>
                          )}
                        </div>
                        {(item.evidence ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No evidence linked.
                          </p>
                        ) : (
                          (item.evidence ?? []).map(
                            (evidence, evidenceIndex) => (
                              <div
                                key={`${item.key}-evidence-${evidenceIndex}`}
                                className="grid gap-2 md:grid-cols-[1fr_2fr_1fr_auto]"
                              >
                                <Input
                                  aria-label={`${item.label} evidence type`}
                                  placeholder="Record type"
                                  value={evidence.recordType}
                                  disabled={
                                    !editable ||
                                    item.key.startsWith('template:')
                                  }
                                  onChange={(event) => {
                                    const next = [...(item.evidence ?? [])];
                                    next[evidenceIndex] = {
                                      ...evidence,
                                      recordType: event.target.value,
                                    };
                                    updateChecklistItem(index, {
                                      evidence: next,
                                    });
                                  }}
                                />
                                <Input
                                  aria-label={`${item.label} evidence record`}
                                  placeholder="Record ID or controlled reference"
                                  value={evidence.recordId}
                                  disabled={
                                    !editable ||
                                    item.key.startsWith('template:')
                                  }
                                  onChange={(event) => {
                                    const next = [...(item.evidence ?? [])];
                                    next[evidenceIndex] = {
                                      ...evidence,
                                      recordId: event.target.value,
                                    };
                                    updateChecklistItem(index, {
                                      evidence: next,
                                    });
                                  }}
                                />
                                <Input
                                  aria-label={`${item.label} evidence revision`}
                                  placeholder="Revision"
                                  value={evidence.revision ?? ''}
                                  disabled={
                                    !editable ||
                                    item.key.startsWith('template:')
                                  }
                                  onChange={(event) => {
                                    const next = [...(item.evidence ?? [])];
                                    next[evidenceIndex] = {
                                      ...evidence,
                                      revision: event.target.value,
                                    };
                                    updateChecklistItem(index, {
                                      evidence: next,
                                    });
                                  }}
                                />
                                {editable &&
                                  !item.key.startsWith('template:') && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        updateChecklistItem(index, {
                                          evidence: (
                                            item.evidence ?? []
                                          ).filter(
                                            (_, currentIndex) =>
                                              currentIndex !== evidenceIndex
                                          ),
                                        })
                                      }
                                    >
                                      Remove
                                    </Button>
                                  )}
                              </div>
                            )
                          )
                        )}
                      </div>
                    </div>
                  ))
                )}
                {editable && (
                  <Button
                    onClick={saveDraft}
                    disabled={
                      !effectivity.trim() ||
                      checklist.length === 0 ||
                      action.isPending
                    }
                  >
                    {data.review
                      ? 'Save Readiness Draft'
                      : 'Create Readiness Draft'}
                  </Button>
                )}
              </CardContent>
            </Card>
            {data.review && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Approvals and baseline
                    </CardTitle>
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
                            {data.review!.status === 'PENDING_APPROVAL' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={action.isPending}
                                onClick={() =>
                                  action.mutate({
                                    path: `/${data.review!.id}/${
                                      role === 'PROJECT_MANAGEMENT'
                                        ? 'pm'
                                        : role
                                            .toLowerCase()
                                            .replaceAll('_', '-')
                                    }-decision`,
                                    body: {
                                      expectedLockVersion:
                                        data.review!.lock_version,
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
                      <strong>Exceptions:</strong>{' '}
                      {data.review.exceptions.length}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-blue-200">
                  <CardContent className="space-y-3 p-4">
                    <div>
                      <h4 className="font-semibold">
                        Controlled production transition
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Approving Production Release records authorization and
                        changes the project to READY_FOR_P2_RELEASE. It does not
                        create production records or launch work.
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
                                  expectedLockVersion:
                                    data.review!.lock_version,
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
                                  expectedLockVersion:
                                    data.review!.lock_version,
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
                              body: {
                                expectedLockVersion: data.review!.lock_version,
                              },
                            })
                          }
                        >
                          Complete Readiness
                        </Button>
                      )}
                      <Button
                        onClick={() =>
                          action.mutate({ path: '/release/approve' })
                        }
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
                          !data.productionLaunchEnabled ||
                          data.projectStatus !== 'READY_FOR_P2_RELEASE' ||
                          data.readiness.state !== 'READY' ||
                          Boolean(data.launch?.status === 'COMPLETE')
                        }
                        data-testid="launch-production"
                      >
                        <Rocket className="mr-2 h-4 w-4" />
                        Launch Production
                      </Button>
                    </div>
                    {!data.productionLaunchEnabled && (
                      <Alert data-testid="production-launch-disabled">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>
                          Production Launch awaiting deployment validation
                        </AlertTitle>
                        <AlertDescription>
                          Production Release remains available, but V2
                          production records cannot be generated until
                          deployment validation is complete.
                        </AlertDescription>
                      </Alert>
                    )}
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
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent data-testid="launch-production-confirmation">
          <DialogHeader>
            <DialogTitle>Launch production?</DialogTitle>
            <DialogDescription>
              This revalidates the approved release, creates the serialized
              units required by the released plan and its exact manufactured
              production orders through the existing P2 services, routes each
              item to its released first department, activates Stage 8, and
              changes the project to IN_PRODUCTION. Travelers, inventory
              demands, reservations, shipping, and closing records are not
              created by this action. The operation is atomic and protected
              against duplicate retries.
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
    </>
  );
}
