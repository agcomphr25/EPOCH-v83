import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FilePenLine,
  FileUp,
  Plus,
  Printer,
  RefreshCw,
} from 'lucide-react';
import type {
  DesignControlFormDefinition,
  DesignControlFormField,
} from '@shared/designControlFormCatalog';
import type { ProjectFormContent } from '@shared/projectFormValidation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';
import { getDesignControlFieldPresentation } from '@/features/design-control/designControlFieldPresentation';

type ProjectFormInstance = {
  id: string;
  instanceNumber: string;
  stepKey: string;
  completionMethod: 'ELECTRONIC' | 'PAPER_UPLOAD';
  lifecycleStatus: string;
  templateRevisionSnapshot: string;
  templateDefinitionRevisionId: string;
  currentContentRevisionId: string | null;
  retainedPdfChecksum: string | null;
  draftContent: ProjectFormContent;
  updatedAt?: string | null;
};

type Props = {
  recordId: string;
  oversightMode?: boolean;
  stepKey?: string;
};

type TemplateReadiness = {
  stepKey: string;
  ready: boolean;
  reason: string | null;
  errorCode?: string;
  templateKey: string | null;
  templateRevisionId: string | null;
  documentRevisionId: string | null;
};

const emptyContent = (): ProjectFormContent => ({
  fields: {},
  sections: {},
  repeatingRows: {},
  requirementReferences: [],
  evidenceReferences: [],
  comments: '',
});

const fieldControl = (
  field: DesignControlFormField,
  value: unknown,
  onChange: (value: unknown) => void
) => {
  const presentation = getDesignControlFieldPresentation('', field);
  const stringValue = String(value ?? '');
  const selectOptions = field.options ?? presentation.options ?? [];
  return field.type === 'checkbox' || field.type === 'yes_no' ? (
    <Checkbox
      checked={value === true}
      onCheckedChange={(checked) => onChange(checked === true)}
    />
  ) : field.options?.length ||
    presentation.kind === 'select' ||
    presentation.kind === 'role' ? (
    <select
      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      value={stringValue}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select…</option>
      {stringValue && !selectOptions.includes(stringValue) && (
        <option value={stringValue}>Existing value: {stringValue}</option>
      )}
      {selectOptions.map((option) => (
        <option key={option} value={option}>
          {option.replaceAll('_', ' ')}
        </option>
      ))}
    </select>
  ) : field.type === 'textarea' && presentation.kind === 'textarea' ? (
    <Textarea
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  ) : (
    <Input
      type={
        (field.type === 'date' || presentation.kind === 'date') &&
        (!stringValue || /^\d{4}-\d{2}-\d{2}$/.test(stringValue))
          ? 'date'
          : field.type === 'number'
            ? 'number'
            : 'text'
      }
      value={stringValue}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};

export function ProjectFormInstancesPanel({
  recordId,
  oversightMode = false,
  stepKey,
}: Props) {
  const { can } = usePermissions();
  const [catalog, setCatalog] = useState<DesignControlFormDefinition[]>([]);
  const [forms, setForms] = useState<ProjectFormInstance[]>([]);
  const [templateReadiness, setTemplateReadiness] = useState<
    Map<string, TemplateReadiness>
  >(new Map());
  const [editing, setEditing] = useState<ProjectFormInstance | null>(null);
  const [content, setContent] = useState<ProjectFormContent>(emptyContent);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const paperInput = useRef<HTMLInputElement>(null);
  const [paperTarget, setPaperTarget] = useState<ProjectFormInstance | null>(
    null
  );
  const evidenceInput = useRef<HTMLInputElement>(null);
  const [evidenceTarget, setEvidenceTarget] =
    useState<ProjectFormInstance | null>(null);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!formDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [formDirty]);

  const load = useCallback(async () => {
    const [catalogResponse, formsResponse, readinessResponse] =
      await Promise.all([
        fetch('/api/design-control-form-templates/catalog', {
          credentials: 'include',
        }),
        fetch(`/api/design-control/${recordId}/forms`, {
          credentials: 'include',
        }),
        fetch(`/api/design-control/${recordId}/forms/template-readiness`, {
          credentials: 'include',
        }),
      ]);
    if (!catalogResponse.ok || !formsResponse.ok || !readinessResponse.ok) {
      throw new Error('Unable to load controlled Project Form Instances');
    }
    const definitions =
      (await catalogResponse.json()) as DesignControlFormDefinition[];
    setCatalog(
      definitions.filter((item) => item.formCategory === 'DESIGN_CONTROL_STEP')
    );
    setForms(await formsResponse.json());
    const readiness = (await readinessResponse.json()) as {
      steps: TemplateReadiness[];
    };
    setTemplateReadiness(
      new Map(readiness.steps.map((item) => [item.stepKey, item]))
    );
  }, [recordId]);

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, [load]);

  const formsByStep = useMemo(
    () =>
      new Map(
        forms
          .filter(
            (item) => !['SUPERSEDED', 'VOID'].includes(item.lifecycleStatus)
          )
          .map((item) => [item.stepKey, item])
      ),
    [forms]
  );
  const visibleCatalog = useMemo(
    () =>
      stepKey
        ? catalog.filter((definition) => definition.workflowStepKey === stepKey)
        : catalog,
    [catalog, stepKey]
  );

  const mutate = async (
    url: string,
    options: globalThis.RequestInit,
    successMessage: string
  ) => {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers:
          options.body instanceof FormData
            ? options.headers
            : { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || 'Action failed');
      }
      setMessage(successMessage);
      await load();
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const create = (
    definition: DesignControlFormDefinition,
    completionMethod: 'ELECTRONIC' | 'PAPER_UPLOAD'
  ) =>
    mutate(
      `/api/design-control/${recordId}/steps/${definition.workflowStepKey}/forms`,
      { method: 'POST', body: JSON.stringify({ completionMethod }) },
      `${definition.title} instance created`
    );

  const edit = (form: ProjectFormInstance) => {
    setEditing(form);
    setContent(form.draftContent ?? emptyContent());
    setFormDirty(false);
  };

  const updateField = (
    sectionKey: string,
    field: DesignControlFormField,
    value: unknown
  ) => {
    setFormDirty(true);
    setContent((current) => ({
      ...current,
      sections: {
        ...(current.sections ?? {}),
        [sectionKey]: {
          ...(((current.sections ?? {})[sectionKey] as Record<
            string,
            unknown
          >) ?? {}),
          [field.key]: value,
        },
      },
    }));
  };

  const updateRepeatingField = (
    sectionKey: string,
    rowIndex: number,
    field: DesignControlFormField,
    value: unknown
  ) => {
    setFormDirty(true);
    setContent((current) => {
      const rows = [...((current.repeatingRows ?? {})[sectionKey] ?? [])];
      rows[rowIndex] = { ...(rows[rowIndex] ?? {}), [field.key]: value };
      return {
        ...current,
        repeatingRows: {
          ...(current.repeatingRows ?? {}),
          [sectionKey]: rows,
        },
      };
    });
  };

  const saveDraft = async () => {
    if (!editing) return;
    const result = await mutate(
      `/api/project-forms/${editing.id}/draft`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          content,
          changeReason: 'Electronic form draft update',
        }),
      },
      'Draft saved with audit evidence'
    );
    if (result) {
      setFormDirty(false);
      setEditing(null);
    }
  };

  const uploadEvidence = async (file: File) => {
    if (!evidenceTarget) return;
    const body = new FormData();
    body.append('file', file);
    body.append(
      'indexingMetadata',
      JSON.stringify({ workflowStepKey: evidenceTarget.stepKey })
    );
    const result = await mutate(
      `/api/project-forms/${evidenceTarget.id}/attachments`,
      { method: 'POST', body },
      'Objective evidence attached to the controlled form'
    );
    if (result) setEvidenceTarget(null);
  };

  const uploadPaper = async (file: File) => {
    if (!paperTarget) return;
    const body = new FormData();
    body.append('file', file);
    body.append(
      'indexingMetadata',
      JSON.stringify({
        transcription: content,
        originalRemainsAuthoritative: true,
      })
    );
    const result = await mutate(
      `/api/project-forms/${paperTarget.id}/upload-paper`,
      { method: 'POST', body },
      'Immutable original paper scan uploaded'
    );
    if (result) setPaperTarget(null);
  };

  return (
    <Card
      id={stepKey ? `design-control-evidence-step-${stepKey}` : undefined}
      className="scroll-mt-4"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Controlled Form Instances</CardTitle>
          <CardDescription>
            {oversightMode
              ? 'Oversight view of the shared Design Project form workflow.'
              : stepKey
                ? `Complete the controlled form and attach objective evidence for step ${stepKey}.`
                : 'Complete the 12 Design Control step forms electronically or retain an original paper scan.'}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load().catch((error) => setMessage(error.message))}
          disabled={busy}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {message && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {message}
          </div>
        )}
        {visibleCatalog.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No controlled step-form template is available for this checkpoint,
            so evidence upload cannot start. Contact Document Control to release
            the required template.
          </div>
        )}
        {visibleCatalog.map((definition) => {
          const form = formsByStep.get(definition.workflowStepKey ?? '');
          const readiness = templateReadiness.get(
            definition.workflowStepKey ?? ''
          );
          return (
            <div
              key={definition.templateKey}
              className="flex flex-col gap-3 rounded-md border p-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <div className="font-medium">
                  Step {definition.workflowStepKey}: {definition.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {form
                    ? `${form.instanceNumber} · ${form.completionMethod} · template Rev ${form.templateRevisionSnapshot}`
                    : readiness?.ready
                      ? `${definition.documentNumber} · released template ready`
                      : `${definition.documentNumber} · ${readiness?.reason ?? 'released template readiness unavailable'}`}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    form?.lifecycleStatus === 'APPROVED' ? 'default' : 'outline'
                  }
                >
                  {form?.lifecycleStatus ?? 'NOT STARTED'}
                </Badge>
                {!form && can('design.forms.create') && readiness?.ready && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => create(definition, 'ELECTRONIC')}
                      disabled={busy}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Electronic
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => create(definition, 'PAPER_UPLOAD')}
                      disabled={busy}
                    >
                      Paper
                    </Button>
                  </>
                )}
                {!form && can('design.forms.create') && !readiness?.ready && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    title={
                      readiness?.reason ??
                      'A released template revision is required'
                    }
                  >
                    Template not released
                  </Button>
                )}
                {form &&
                  form.completionMethod === 'ELECTRONIC' &&
                  ['DRAFT', 'IN_PROGRESS', 'RETURNED_FOR_REVISION'].includes(
                    form.lifecycleStatus
                  ) &&
                  can('design.forms.edit') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => edit(form)}
                    >
                      <FilePenLine className="mr-1 h-4 w-4" />
                      Edit
                    </Button>
                  )}
                {form &&
                  ['DRAFT', 'IN_PROGRESS', 'RETURNED_FOR_REVISION'].includes(
                    form.lifecycleStatus
                  ) &&
                  can('design.forms.edit') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEvidenceTarget(form);
                        evidenceInput.current?.click();
                      }}
                    >
                      <FileUp className="mr-1 h-4 w-4" />
                      Attach evidence
                    </Button>
                  )}
                {form &&
                  form.completionMethod === 'PAPER_UPLOAD' &&
                  can('design.forms.upload_paper') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setPaperTarget(form);
                        paperInput.current?.click();
                      }}
                    >
                      <FileUp className="mr-1 h-4 w-4" />
                      Upload scan
                    </Button>
                  )}
                {form &&
                  ['IN_PROGRESS', 'RETURNED_FOR_REVISION'].includes(
                    form.lifecycleStatus
                  ) &&
                  can('design.forms.submit') && (
                    <Button
                      size="sm"
                      onClick={() =>
                        mutate(
                          `/api/project-forms/${form.id}/submit`,
                          {
                            method: 'POST',
                            body: JSON.stringify({
                              changeReason: 'Submit controlled form content',
                            }),
                          },
                          'Immutable content revision submitted'
                        )
                      }
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Submit
                    </Button>
                  )}
                {form?.completionMethod === 'PAPER_UPLOAD' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      window.open(
                        `/api/design-control-form-templates/${definition.templateKey}/revisions/${form.templateDefinitionRevisionId}/download`,
                        '_blank'
                      )
                    }
                  >
                    Blank form
                  </Button>
                )}
                {form?.lifecycleStatus === 'SUBMITTED' &&
                  can('design.forms.approve') && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          const approvalRole =
                            window.prompt(
                              'Approval role',
                              definition.approvalRoles[0] ?? ''
                            ) ?? '';
                          if (!approvalRole) return;
                          mutate(
                            `/api/project-forms/${form.id}/decisions`,
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                decision: 'APPROVED',
                                approvalRole,
                                comment: 'Authenticated approval',
                              }),
                            },
                            'Authenticated approval recorded'
                          );
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const approvalRole =
                            window.prompt(
                              'Review role',
                              definition.approvalRoles[0] ?? ''
                            ) ?? '';
                          const comment = window.prompt('Return reason') ?? '';
                          if (!approvalRole || !comment) return;
                          mutate(
                            `/api/project-forms/${form.id}/decisions`,
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                decision: 'RETURNED_FOR_REVISION',
                                approvalRole,
                                comment,
                              }),
                            },
                            'Form returned with immutable decision evidence'
                          );
                        }}
                      >
                        Return
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          const approvalRole =
                            window.prompt(
                              'Review role',
                              definition.approvalRoles[0] ?? ''
                            ) ?? '';
                          const comment =
                            window.prompt('Rejection reason') ?? '';
                          if (!approvalRole || !comment) return;
                          mutate(
                            `/api/project-forms/${form.id}/decisions`,
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                decision: 'REJECTED',
                                approvalRole,
                                comment,
                              }),
                            },
                            'Rejection recorded; form returned for correction'
                          );
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                {form?.currentContentRevisionId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      window.open(`/api/project-forms/${form.id}/pdf`, '_blank')
                    }
                  >
                    <Printer className="mr-1 h-4 w-4" />
                    Preview / Print
                  </Button>
                )}
                {form &&
                  !['SUPERSEDED', 'VOID'].includes(form.lifecycleStatus) &&
                  can('design.forms.supersede') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const reason =
                          window.prompt('Supersession/correction reason') ?? '';
                        if (!reason) return;
                        mutate(
                          `/api/project-forms/${form.id}/supersede`,
                          {
                            method: 'POST',
                            body: JSON.stringify({ reason }),
                          },
                          'Historical instance preserved as superseded'
                        );
                      }}
                    >
                      Supersede
                    </Button>
                  )}
              </div>
            </div>
          );
        })}
        <input
          ref={paperInput}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadPaper(file);
            event.target.value = '';
          }}
        />
        <input
          ref={evidenceInput}
          type="file"
          accept="application/pdf,image/png,image/jpeg,text/plain,.csv,.xlsx,.doc,.docx"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) uploadEvidence(file);
            event.target.value = '';
          }}
        />
      </CardContent>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (open) return;
          if (
            formDirty &&
            !window.confirm(
              'You have unsaved controlled-form changes. Close without saving?'
            )
          )
            return;
          setFormDirty(false);
          setEditing(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.instanceNumber} electronic completion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {editing &&
              catalog
                .find((item) => item.workflowStepKey === editing.stepKey)
                ?.sections.filter((section) => section.key !== 'approvals')
                .map((section) => (
                  <div
                    key={section.key}
                    className="space-y-3 rounded-md border p-3"
                  >
                    <div className="font-medium">{section.title}</div>
                    {section.repeating ? (
                      <>
                        {((content.repeatingRows ?? {})[section.key] ?? []).map(
                          (row, rowIndex) => (
                            <div
                              key={rowIndex}
                              className="space-y-3 rounded border bg-muted/20 p-3"
                            >
                              <div className="text-xs font-medium">
                                Row {rowIndex + 1}
                              </div>
                              {section.fields.map((field) => (
                                <div key={field.key} className="grid gap-2">
                                  <Label>
                                    {field.label}
                                    {field.required ? ' *' : ''}
                                  </Label>
                                  {fieldControl(
                                    field,
                                    row[field.key],
                                    (value) =>
                                      updateRepeatingField(
                                        section.key,
                                        rowIndex,
                                        field,
                                        value
                                      )
                                  )}
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setFormDirty(true);
                                  setContent((current) => ({
                                    ...current,
                                    repeatingRows: {
                                      ...(current.repeatingRows ?? {}),
                                      [section.key]: (
                                        (current.repeatingRows ?? {})[
                                          section.key
                                        ] ?? []
                                      ).filter(
                                        (_item, itemIndex) =>
                                          itemIndex !== rowIndex
                                      ),
                                    },
                                  }));
                                }}
                              >
                                Remove row
                              </Button>
                            </div>
                          )
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFormDirty(true);
                            setContent((current) => ({
                              ...current,
                              repeatingRows: {
                                ...(current.repeatingRows ?? {}),
                                [section.key]: [
                                  ...((current.repeatingRows ?? {})[
                                    section.key
                                  ] ?? []),
                                  {},
                                ],
                              },
                            }));
                          }}
                        >
                          Add row
                        </Button>
                      </>
                    ) : (
                      section.fields.map((field) => {
                        const sectionValues =
                          ((content.sections ?? {})[section.key] as Record<
                            string,
                            unknown
                          >) ?? {};
                        return (
                          <div key={field.key} className="grid gap-2">
                            <Label>
                              {field.label}
                              {field.required ? ' *' : ''}
                            </Label>
                            {fieldControl(
                              field,
                              sectionValues[field.key],
                              (value) => updateField(section.key, field, value)
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (
                  formDirty &&
                  !window.confirm(
                    'You have unsaved controlled-form changes. Close without saving?'
                  )
                )
                  return;
                setFormDirty(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveDraft} disabled={busy}>
              Save audited draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
