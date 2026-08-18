import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DesignControlWorkflowStep } from '@shared/designControlWorkflow';

import {
  getDesignControlFieldPresentation,
  nextActionForStep,
} from './designControlFieldPresentation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';

type StepRow = {
  stepKey: string;
  status?: string | null;
  currentContentVersionId?: string | null;
  formData?: Record<string, unknown>;
  checklist?: Record<string, unknown>;
  attachments?: unknown[];
  updatedAt?: string | null;
};

type ProjectTeam = {
  assignments: Array<{
    userId: number;
    username: string;
    firstName?: string | null;
    lastName?: string | null;
    projectRole: string;
    status: string;
  }>;
};

type ApprovalSlot = {
  key: string;
  label: string;
  signatureMeaning?: string;
  requiresIndependentReviewer?: boolean;
  status: 'APPROVED' | 'PENDING';
  decision?: {
    decision?: string;
    decidedBySnapshot?: { username?: string; role?: string } | null;
    decidedAt?: string | null;
  } | null;
  assignment?: {
    employeeId: number;
    userId: number;
    employeeCodeSnapshot?: string | null;
    approverNameSnapshot: string;
    jobTitleSnapshot?: string | null;
    departmentSnapshot?: string | null;
    accountStatusSnapshot: string;
    status: string;
  } | null;
};

type ApprovalState = {
  currentUserId?: number | null;
  currentContentVersion?: { id: string; contentVersion: number } | null;
  versions: Array<{
    id: string;
    contentVersion: number;
    status: string;
    contentChecksum: string;
    changeReason: string;
    createdAt?: string | null;
    createdBySnapshot?: { displayName?: string; username?: string } | null;
  }>;
  approvals: Array<{
    id: string;
    approvalLabelSnapshot: string;
    decision: string;
    decisionComment?: string | null;
    actorDisplayNameSnapshot?: string | null;
    actorUsernameSnapshot?: string | null;
    createdAt?: string | null;
    status: string;
  }>;
  approvalSlots: ApprovalSlot[];
};

type EligibleApprovers = {
  employees: Array<{
    employeeId: number;
    employeeCode?: string | null;
    displayName: string;
    jobTitle?: string | null;
    department?: string | null;
    userId: number;
    accountRole: string;
    accountStatus: string;
    eligibleApprovalKeys: string[];
    eligibleApprovalRoles: string[];
  }>;
};

type Props = {
  recordId: string;
  projectId?: string;
  definition: DesignControlWorkflowStep;
  step?: StepRow;
  readOnly: boolean;
  onChanged: (savedStep?: StepRow) => Promise<unknown>;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
};

async function responsePayload(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const missing = Array.isArray(payload.missingItems)
      ? ` ${payload.missingItems.join('; ')}`
      : '';
    throw new Error(
      `${payload.message || payload.error || 'The controlled action failed.'}${missing}`
    );
  }
  return payload;
}

export function DesignControlStepEditor({
  recordId,
  projectId,
  definition,
  step,
  readOnly,
  onChanged,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: Props) {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [checklist, setChecklist] = useState<Record<string, unknown>>({});
  const [changeReason, setChangeReason] = useState('');
  const [decisionComment, setDecisionComment] = useState('');
  const [approvalAssignments, setApprovalAssignments] = useState<
    Record<string, string>
  >({});
  const [reassignmentRole, setReassignmentRole] = useState<string | null>(null);
  const [reassignmentSelection, setReassignmentSelection] = useState('');
  const [reassignmentReason, setReassignmentReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [manualPersonFields, setManualPersonFields] = useState<Set<string>>(
    new Set()
  );
  const [manualProjectFields, setManualProjectFields] = useState<Set<string>>(
    new Set()
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    step?.updatedAt ?? null
  );
  // Track dirty state in a ref so the sync effect can read it without adding
  // dirty to its dep array (which would cause a setDirty(false) → re-run loop).
  const approvalQueryKey = [
    '/api/qms/design-control',
    recordId,
    'steps',
    definition.key,
    'approvals',
  ] as const;

  // Track dirty state in a ref so the sync effect can read it without adding
  // dirty to its dep array (which would cause a setDirty(false) → re-run loop).
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  // Track the last key we fully initialized for, to detect step navigation.
  const lastInitializedKey = useRef(definition.key);

  useEffect(() => {
    const navigatedToAnotherStep =
      lastInitializedKey.current !== definition.key;
    if (!navigatedToAnotherStep && dirtyRef.current) return;

    setFormData(step?.formData ?? {});
    setChecklist(step?.checklist ?? {});
    setChangeReason('');
    setManualPersonFields(new Set());
    setManualProjectFields(new Set());
    setLastSavedAt(step?.updatedAt ?? null);
    setDirty(false);
    lastInitializedKey.current = definition.key;
  }, [
    definition.key,
    step?.currentContentVersionId,
    step?.formData,
    step?.checklist,
    step?.updatedAt,
  ]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  const teamQuery = useQuery<ProjectTeam>({
    queryKey: ['/api/qms/design-control', recordId, 'project-team'],
    queryFn: async () =>
      responsePayload(
        await fetch(`/api/qms/design-control/${recordId}/project-team`, {
          credentials: 'include',
        })
      ),
    retry: false,
  });

  const people = useMemo(
    () =>
      (teamQuery.data?.assignments ?? [])
        .filter((assignment) => assignment.status === 'ACTIVE')
        .map((assignment) => ({
          value:
            [assignment.firstName, assignment.lastName]
              .filter(Boolean)
              .join(' ') || assignment.username,
          label: `${
            [assignment.firstName, assignment.lastName]
              .filter(Boolean)
              .join(' ') || assignment.username
          } (${assignment.projectRole.replaceAll('_', ' ')})`,
        })),
    [teamQuery.data?.assignments]
  );

  useEffect(() => {
    if (dirtyRef.current) return;
    const suggestions: Record<string, string> = {};
    for (const field of definition.fields) {
      if (String(step?.formData?.[field.key] ?? '').trim()) continue;
      const presentation = getDesignControlFieldPresentation(
        definition.key,
        field
      );
      if (presentation.kind === 'project' && projectId) {
        suggestions[field.key] = projectId;
        continue;
      }
      if (presentation.kind !== 'person') continue;
      const wantedRole = field.label.toLowerCase();
      const assignment = (teamQuery.data?.assignments ?? []).find(
        (candidate) => {
          if (candidate.status !== 'ACTIVE') return false;
          const role = candidate.projectRole.replaceAll('_', ' ').toLowerCase();
          return (
            wantedRole.includes(role) ||
            (wantedRole.includes('engineer') && role.includes('engineer')) ||
            (wantedRole.includes('quality') && role.includes('quality')) ||
            (wantedRole.includes('manufacturing') &&
              role.includes('manufacturing')) ||
            (wantedRole.includes('manager') && role.includes('manager'))
          );
        }
      );
      if (assignment) {
        suggestions[field.key] =
          [assignment.firstName, assignment.lastName]
            .filter(Boolean)
            .join(' ') || assignment.username;
      }
    }
    if (Object.keys(suggestions).length === 0) return;
    setFormData((current) => ({ ...suggestions, ...current }));
    setDirty(true);
  }, [definition, projectId, step?.formData, teamQuery.data?.assignments]);

  const approvalQuery = useQuery<ApprovalState>({
    queryKey: approvalQueryKey,
    queryFn: async () =>
      responsePayload(
        await fetch(
          `/api/qms/design-control/${encodeURIComponent(recordId)}/steps/${encodeURIComponent(definition.key)}/approvals`,
          { credentials: 'include' }
        )
      ),
  });
  const eligibleApproversQuery = useQuery<EligibleApprovers>({
    queryKey: [
      '/api/qms/design-control',
      recordId,
      'steps',
      definition.key,
      'eligible-approvers',
    ],
    queryFn: async () =>
      responsePayload(
        await fetch(
          `/api/qms/design-control/${encodeURIComponent(recordId)}/steps/${encodeURIComponent(definition.key)}/eligible-approvers`,
          { credentials: 'include' }
        )
      ),
    enabled: true,
  });

  const refresh = async (savedStep?: StepRow) => {
    await Promise.all([
      onChanged(savedStep),
      queryClient.invalidateQueries({ queryKey: approvalQueryKey }),
    ]);
  };

  const run = async <T,>(
    action: () => Promise<T>,
    success: string,
    savedStepFromResult?: (result: T) => StepRow | undefined
  ) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      setMessage(success);
      setDirty(false);
      await refresh(savedStepFromResult?.(result));
      return result;
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'The controlled action failed.'
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (continueAfterSave = false) => {
    const saved = await run(
      async () => {
        const response = await fetch(
          `/api/qms/design-control/${encodeURIComponent(recordId)}/steps/${encodeURIComponent(definition.key)}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              formData,
              checklist,
              attachments: step?.attachments ?? [],
              contentVersionId: step?.currentContentVersionId ?? null,
              changeReason:
                changeReason.trim() || 'Design Control step draft saved',
            }),
          }
        );
        return responsePayload(response);
      },
      'Draft saved as a controlled content version.',
      (result) =>
        result && typeof result === 'object' && 'step' in result
          ? (result.step as StepRow)
          : undefined
    );
    if (saved) setLastSavedAt(new Date().toISOString());
    if (saved && continueAfterSave && hasNext) onNext();
  };

  const submit = () =>
    run(async () => {
      const response = await fetch(
        `/api/qms/design-control/${encodeURIComponent(recordId)}/steps/${encodeURIComponent(definition.key)}/submit`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentVersionId: step?.currentContentVersionId ?? null,
            assignments: definition.approvals.map((slot) => {
              const selected = (
                eligibleApproversQuery.data?.employees ?? []
              ).find(
                (employee) =>
                  `${employee.employeeId}:${employee.userId}` ===
                  approvalAssignments[slot.key]
              );
              return {
                approvalKey: slot.key,
                employeeId: selected?.employeeId,
                userId: selected?.userId,
              };
            }),
          }),
        }
      );
      return responsePayload(response);
    }, 'Exact content version submitted for authenticated approval.');

  const decide = (slot: ApprovalSlot, decision: string) =>
    run(
      async () => {
        const contentVersionId = approvalQuery.data?.currentContentVersion?.id;
        if (!contentVersionId)
          throw new Error('Save this step before recording a decision.');
        const response = await fetch(
          `/api/qms/design-control/${encodeURIComponent(recordId)}/steps/${encodeURIComponent(definition.key)}/decision`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contentVersionId,
              approvalKey: slot.key,
              decision,
              comment: decisionComment.trim() || undefined,
            }),
          }
        );
        return responsePayload(response);
      },
      decision === 'APPROVED'
        ? `${slot.label} recorded for the current version.`
        : 'Current version returned for revision.'
    );

  const underReview = step?.status === 'submitted_for_approval';
  const editable = !readOnly && can('design.control.edit') && !underReview;
  const canSubmit = !readOnly && can('design.control.submit') && !underReview;
  const canApprove = !readOnly && can('design.control.approve') && underReview;
  const canRouteApprovers =
    !readOnly &&
    !underReview &&
    (can('design.control.edit') || can('design.control.submit'));
  const canReassignApprovers =
    !readOnly && underReview && can('design.control.admin');
  const missingFields = definition.fields.filter(
    (field) => !String(formData[field.key] ?? '').trim()
  );
  const missingChecklist = definition.checklist.filter(
    (item) => checklist[item.key] !== true
  );
  const missingCount = missingFields.length + missingChecklist.length;
  const confirmNavigation = (navigate: () => void) => {
    if (
      dirty &&
      !window.confirm(
        'You have unsaved changes. Leave this step without saving?'
      )
    )
      return;
    navigate();
  };

  const reassignApprover = (slot: ApprovalSlot) =>
    run(async () => {
      const selected = (eligibleApproversQuery.data?.employees ?? []).find(
        (employee) =>
          `${employee.employeeId}:${employee.userId}` === reassignmentSelection
      );
      const contentVersionId = approvalQuery.data?.currentContentVersion?.id;
      if (!selected || !contentVersionId || !reassignmentReason.trim())
        throw new Error(
          'Select an active employee and enter a reassignment reason.'
        );
      return responsePayload(
        await fetch(
          `/api/qms/design-control/${encodeURIComponent(recordId)}/steps/${encodeURIComponent(definition.key)}/assignments/${encodeURIComponent(slot.key)}/reassign`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contentVersionId,
              employeeId: selected.employeeId,
              userId: selected.userId,
              reason: reassignmentReason.trim(),
            }),
          }
        )
      );
    }, `${slot.label} reassigned with an audit record.`).then((saved) => {
      if (saved) {
        setReassignmentRole(null);
        setReassignmentSelection('');
        setReassignmentReason('');
      }
    });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3 text-sm">
          <span className="text-xs text-muted-foreground">Draft state</span>
          <p className="font-medium">
            {dirty ? 'Unsaved changes' : 'Saved to the server'}
          </p>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <span className="text-xs text-muted-foreground">Last saved</span>
          <p className="font-medium">
            {lastSavedAt
              ? new Date(lastSavedAt).toLocaleString()
              : 'No saved draft yet'}
          </p>
        </div>
        <div className="rounded-md border p-3 text-sm">
          <span className="text-xs text-muted-foreground">Next action</span>
          <p className="font-medium">
            {nextActionForStep(step?.status, missingCount)}
          </p>
        </div>
      </div>
      <fieldset className="space-y-4" disabled={!editable || busy}>
        <legend className="font-semibold">Required information</legend>
        <p className="text-sm text-muted-foreground">
          Every field is required before this stage can be submitted. Save
          creates an immutable, checksummed content version; later edits
          invalidate prior approvals.
        </p>
        <div
          className="rounded-md border p-3 text-sm"
          aria-live="polite"
          data-testid="design-control-missing-summary"
        >
          {missingCount === 0 ? (
            <span>Required stage information is complete.</span>
          ) : (
            <>
              <p className="font-medium">
                {missingCount} required item{missingCount === 1 ? '' : 's'}{' '}
                incomplete
              </p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {missingFields.map((field) => (
                  <li key={`field-${field.key}`}>{field.label}</li>
                ))}
                {missingChecklist.map((item) => (
                  <li key={`checklist-${item.key}`}>{item.label}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {definition.fields.map((field) => {
            const presentation = getDesignControlFieldPresentation(
              definition.key,
              field
            );
            const fieldId = `design-control-${definition.key}-${field.key}`;
            const value = String(formData[field.key] ?? '');
            const missing = !value.trim();
            const update = (nextValue: string) => {
              setFormData((current) => ({
                ...current,
                [field.key]: nextValue,
              }));
              setDirty(true);
            };
            return (
              <div
                className={`space-y-1.5 ${
                  ['textarea', 'attachment'].includes(presentation.kind)
                    ? 'md:col-span-2'
                    : ''
                }`}
                key={field.key}
              >
                <Label htmlFor={fieldId}>
                  {field.label}{' '}
                  <span className="text-destructive" aria-label="required">
                    *
                  </span>
                </Label>
                {presentation.kind === 'attachment' ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <Input
                      aria-describedby={`${fieldId}-help`}
                      aria-invalid={missing}
                      id={fieldId}
                      placeholder={presentation.placeholder}
                      value={value}
                      onChange={(event) => update(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        document
                          .getElementById(
                            `design-control-evidence-step-${definition.key}`
                          )
                          ?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          })
                      }
                    >
                      Open evidence upload
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Create or open the controlled step form below, then select
                      Attach evidence. The file is retained with that form; this
                      field records its controlled reference.
                    </p>
                  </div>
                ) : presentation.kind === 'textarea' ? (
                  <Textarea
                    aria-describedby={`${fieldId}-help`}
                    aria-invalid={missing}
                    id={fieldId}
                    placeholder={presentation.placeholder}
                    rows={3}
                    value={value}
                    onChange={(event) => update(event.target.value)}
                  />
                ) : presentation.kind === 'person' && people.length > 0 ? (
                  <select
                    aria-describedby={`${fieldId}-help`}
                    aria-invalid={missing}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    id={fieldId}
                    value={value}
                    onChange={(event) => update(event.target.value)}
                  >
                    <option value="">Select a person...</option>
                    {value &&
                      !people.some((person) => person.value === value) && (
                        <option value={value}>Existing person: {value}</option>
                      )}
                    {people.map((person) => (
                      <option key={person.label} value={person.value}>
                        {person.label}
                      </option>
                    ))}
                  </select>
                ) : presentation.kind === 'select' ||
                  presentation.kind === 'role' ? (
                  <select
                    aria-describedby={`${fieldId}-help`}
                    aria-invalid={missing}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    id={fieldId}
                    value={value}
                    onChange={(event) => update(event.target.value)}
                  >
                    <option value="">Select…</option>
                    {value && !(presentation.options ?? []).includes(value) && (
                      <option value={value}>Existing value: {value}</option>
                    )}
                    {(presentation.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                ) : presentation.kind === 'project' ? (
                  <>
                    {projectId ? (
                      // When a project is linked, show the dropdown so the user
                      // can choose between the linked project and free-text entry.
                      <select
                        aria-describedby={`${fieldId}-help`}
                        aria-invalid={missing}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        id={fieldId}
                        value={
                          manualProjectFields.has(field.key)
                            ? '__MANUAL__'
                            : value
                        }
                        onChange={(event) => {
                          if (event.target.value === '__MANUAL__') {
                            setManualProjectFields((current) =>
                              new Set(current).add(field.key)
                            );
                            update('');
                            return;
                          }
                          setManualProjectFields((current) => {
                            const next = new Set(current);
                            next.delete(field.key);
                            return next;
                          });
                          update(event.target.value);
                        }}
                      >
                        <option value="">Select the controlled link…</option>
                        {value && value !== projectId && (
                          <option value={value}>Existing value: {value}</option>
                        )}
                        <option value={projectId}>
                          Linked project: {projectId}
                        </option>
                        <option value="__MANUAL__">
                          Enter another customer or order link…
                        </option>
                      </select>
                    ) : (
                      // No linked project — skip the dropdown and go straight to
                      // the text input so the field is directly editable.
                      <Input
                        aria-describedby={`${fieldId}-help`}
                        aria-invalid={missing}
                        id={fieldId}
                        placeholder="Enter the controlled customer or order reference"
                        value={value}
                        onChange={(event) => update(event.target.value)}
                      />
                    )}
                    {projectId && manualProjectFields.has(field.key) && (
                      <Input
                        aria-label={`${field.label} manual entry`}
                        placeholder="Enter the controlled customer or order reference"
                        value={value}
                        onChange={(event) => update(event.target.value)}
                      />
                    )}
                  </>
                ) : presentation.kind === 'person' ? (
                  <>
                    <select
                      aria-describedby={`${fieldId}-help`}
                      aria-invalid={missing}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      id={fieldId}
                      value={
                        manualPersonFields.has(field.key) ? '__MANUAL__' : value
                      }
                      onChange={(event) => {
                        if (event.target.value === '__MANUAL__') {
                          setManualPersonFields((current) =>
                            new Set(current).add(field.key)
                          );
                          update('');
                          return;
                        }
                        setManualPersonFields((current) => {
                          const next = new Set(current);
                          next.delete(field.key);
                          return next;
                        });
                        update(event.target.value);
                      }}
                    >
                      <option value="">
                        Select an active project assignment…
                      </option>
                      {value &&
                        !people.some((person) => person.value === value) && (
                          <option value={value}>Existing value: {value}</option>
                        )}
                      {people.map((person) => (
                        <option
                          key={`${person.value}-${person.label}`}
                          value={person.value}
                        >
                          {person.label}
                        </option>
                      ))}
                      <option value="__MANUAL__">
                        Enter another accountable person…
                      </option>
                    </select>
                    {manualPersonFields.has(field.key) && (
                      <Input
                        aria-label={`${field.label} manual entry`}
                        placeholder="Enter the accountable person's full name"
                        value={value}
                        onChange={(event) => update(event.target.value)}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Input
                      aria-describedby={`${fieldId}-help`}
                      aria-invalid={missing}
                      id={fieldId}
                      placeholder={presentation.placeholder}
                      type={
                        presentation.kind === 'date' &&
                        (!value || /^\d{4}-\d{2}-\d{2}$/.test(value))
                          ? 'date'
                          : 'text'
                      }
                      value={value}
                      onChange={(event) => update(event.target.value)}
                    />
                  </>
                )}
                <p
                  className={`text-xs ${
                    missing ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                  id={`${fieldId}-help`}
                >
                  {missing ? 'Required. ' : ''}
                  {presentation.help}
                </p>
              </div>
            );
          })}
        </div>

        {definition.examples && definition.examples.length > 0 && (
          <details className="rounded-md border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Examples for this step
            </summary>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">
              {definition.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </details>
        )}

        {definition.checklist.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold">Required checklist evidence</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {definition.checklist.map((item) => (
                <Label
                  className="flex items-start gap-2 rounded-md border p-3 font-normal"
                  key={item.key}
                >
                  <Checkbox
                    checked={checklist[item.key] === true}
                    onCheckedChange={(checked) => {
                      setChecklist((current) => ({
                        ...current,
                        [item.key]: checked === true,
                      }));
                      setDirty(true);
                    }}
                  />
                  <span>{item.label}</span>
                </Label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`design-control-${definition.key}-reason`}>
            Change reason
          </Label>
          <Input
            id={`design-control-${definition.key}-reason`}
            placeholder="Why this controlled version is being saved"
            value={changeReason}
            onChange={(event) => setChangeReason(event.target.value)}
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        {editable && (
          <>
            <Button
              disabled={busy || !dirty}
              onClick={() => saveDraft()}
              type="button"
              variant="outline"
            >
              Save Draft
            </Button>
            <Button
              disabled={busy || !dirty}
              onClick={() => saveDraft(true)}
              type="button"
              variant={
                definition.approvals.length > 0 ? 'secondary' : 'default'
              }
            >
              Save and Continue
            </Button>
          </>
        )}
        {canRouteApprovers && (
          <div className="w-full space-y-3 rounded-md border p-3">
            <h3 className="font-semibold">Assign verified approvers</h3>
            <p className="text-sm text-muted-foreground">
              Only active employees with active, authorized EPOCH accounts are
              available. Assignments are locked to the submitted version.
            </p>
            {definition.approvals.map((slot) => {
              const candidates = (
                eligibleApproversQuery.data?.employees ?? []
              ).filter((employee) =>
                employee.eligibleApprovalKeys.includes(slot.key)
              );
              return (
                <div className="space-y-1" key={slot.key}>
                  <Label htmlFor={`approval-assignee-${slot.key}`}>
                    {slot.label}
                  </Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    id={`approval-assignee-${slot.key}`}
                    value={approvalAssignments[slot.key] ?? ''}
                    onChange={(event) =>
                      setApprovalAssignments((current) => ({
                        ...current,
                        [slot.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select a person...</option>
                    {candidates.map((employee) => (
                      <option
                        key={`${employee.employeeId}:${employee.userId}`}
                        value={`${employee.employeeId}:${employee.userId}`}
                      >
                        {employee.displayName} |{' '}
                        {employee.employeeCode ||
                          `Employee ${employee.employeeId}`}{' '}
                        |{' '}
                        {employee.jobTitle ||
                          employee.department ||
                          'Role not recorded'}{' '}
                        | Account {employee.accountStatus} |{' '}
                        {employee.eligibleApprovalRoles.join(', ')}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
        {canSubmit && (
          <Button
            disabled={
              busy ||
              dirty ||
              !approvalQuery.data?.currentContentVersion?.id ||
              definition.approvals.some(
                (slot) => !approvalAssignments[slot.key]
              )
            }
            onClick={submit}
            type="button"
            variant="default"
          >
            Submit for Approval
          </Button>
        )}
        {canSubmit && dirty && (
          <p className="self-center text-xs text-muted-foreground">
            Save the draft before submission.
          </p>
        )}
        {!readOnly && !editable && underReview && (
          <Badge variant="secondary">Read-only while under review</Badge>
        )}
      </div>

      {definition.approvals.length > 0 && (
        <section className="space-y-3" aria-label="Authenticated approvals">
          <div>
            <h3 className="font-semibold">Authenticated approval routing</h3>
            <p className="text-sm text-muted-foreground">
              Decisions apply only to the displayed content version. Role and
              reviewer-independence rules are enforced by the server.
            </p>
          </div>
          {canApprove && (
            <div className="space-y-1.5">
              <Label
                htmlFor={`design-control-${definition.key}-decision-comment`}
              >
                Decision comment
              </Label>
              <Textarea
                id={`design-control-${definition.key}-decision-comment`}
                value={decisionComment}
                onChange={(event) => setDecisionComment(event.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            {(approvalQuery.data?.approvalSlots ?? []).map((slot) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                key={slot.key}
              >
                <div>
                  <p className="text-sm font-medium">{slot.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {slot.requiresIndependentReviewer
                      ? 'Independent reviewer required'
                      : 'Authenticated reviewer required'}
                  </p>
                  {canReassignApprovers &&
                    (!slot.assignment ||
                      slot.assignment.status === 'PENDING') && (
                      <Button
                        className="mt-2"
                        onClick={() => {
                          setReassignmentRole(slot.key);
                          setReassignmentSelection('');
                          setReassignmentReason('');
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {slot.assignment
                          ? 'Change approver'
                          : 'Assign verified approver'}
                      </Button>
                    )}
                  {reassignmentRole === slot.key && (
                    <div className="mt-3 space-y-2 rounded-md border p-3">
                      <Label htmlFor={`reassign-${slot.key}`}>
                        New verified employee
                      </Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        id={`reassign-${slot.key}`}
                        value={reassignmentSelection}
                        onChange={(event) =>
                          setReassignmentSelection(event.target.value)
                        }
                      >
                        <option value="">Select an active employee...</option>
                        {(eligibleApproversQuery.data?.employees ?? [])
                          .filter((employee) =>
                            employee.eligibleApprovalKeys.includes(slot.key)
                          )
                          .map((employee) => (
                            <option
                              key={`${employee.employeeId}:${employee.userId}`}
                              value={`${employee.employeeId}:${employee.userId}`}
                            >
                              {employee.displayName} |{' '}
                              {employee.employeeCode ||
                                `Employee ${employee.employeeId}`}{' '}
                              |{' '}
                              {employee.jobTitle ||
                                employee.department ||
                                'Role not recorded'}
                            </option>
                          ))}
                      </select>
                      <Input
                        aria-label="Reassignment reason"
                        placeholder={
                          slot.assignment
                            ? 'Reason for changing this submitted-version assignment'
                            : 'Reason for assigning this migrated submitted version'
                        }
                        value={reassignmentReason}
                        onChange={(event) =>
                          setReassignmentReason(event.target.value)
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          disabled={
                            busy ||
                            !reassignmentSelection ||
                            !reassignmentReason.trim()
                          }
                          onClick={() => reassignApprover(slot)}
                          size="sm"
                          type="button"
                        >
                          {slot.assignment
                            ? 'Save reassignment'
                            : 'Save verified assignment'}
                        </Button>
                        <Button
                          onClick={() => setReassignmentRole(null)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {slot.assignment
                      ? `${slot.assignment.approverNameSnapshot} (${slot.assignment.employeeCodeSnapshot || `Employee ${slot.assignment.employeeId}`}) · ${slot.assignment.jobTitleSnapshot || slot.assignment.departmentSnapshot || 'Role not recorded'} · Account ${slot.assignment.accountStatusSnapshot}`
                      : 'Unverified legacy assignment or no verified assignee'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={slot.status === 'APPROVED' ? 'default' : 'outline'}
                  >
                    {slot.status.toLowerCase()}
                  </Badge>
                  {canApprove &&
                    slot.status !== 'APPROVED' &&
                    slot.assignment?.userId ===
                      approvalQuery.data?.currentUserId && (
                      <>
                        <Button
                          disabled={busy || !decisionComment.trim()}
                          onClick={() => decide(slot, 'APPROVED')}
                          size="sm"
                          type="button"
                        >
                          Approve
                        </Button>
                        <Button
                          disabled={busy || !decisionComment.trim()}
                          onClick={() => decide(slot, 'RETURNED_FOR_REVISION')}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Return
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => decide(slot, 'REJECTED')}
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Reject
                        </Button>
                      </>
                    )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3" aria-label="Stage activity history">
        <div>
          <h3 className="font-semibold">Version and decision history</h3>
          <p className="text-sm text-muted-foreground">
            Immutable content versions and attributable decisions retained by
            the server for this stage.
          </p>
        </div>
        {(approvalQuery.data?.versions ?? []).length === 0 ? (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">
            No controlled version has been saved yet.
          </p>
        ) : (
          <div className="space-y-2">
            {[...(approvalQuery.data?.versions ?? [])]
              .sort((left, right) => right.contentVersion - left.contentVersion)
              .map((version) => (
                <div className="rounded-md border p-3 text-sm" key={version.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      Version {version.contentVersion}
                    </span>
                    <Badge variant="outline">
                      {version.status.toLowerCase().replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {version.changeReason} ·{' '}
                    {version.createdBySnapshot?.displayName ||
                      version.createdBySnapshot?.username ||
                      'Authenticated user'}
                    {version.createdAt
                      ? ` · ${new Date(version.createdAt).toLocaleString()}`
                      : ''}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Evidence hash {version.contentChecksum.slice(0, 12)}…
                  </p>
                </div>
              ))}
          </div>
        )}
        {(approvalQuery.data?.approvals ?? []).length > 0 && (
          <div className="space-y-2">
            {(approvalQuery.data?.approvals ?? []).map((approval) => (
              <div className="rounded-md border p-3 text-sm" key={approval.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {approval.approvalLabelSnapshot}
                  </span>
                  <Badge variant="outline">
                    {approval.decision.toLowerCase().replaceAll('_', ' ')}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {approval.actorDisplayNameSnapshot ||
                    approval.actorUsernameSnapshot ||
                    'Authenticated user'}
                  {approval.createdAt
                    ? ` · ${new Date(approval.createdAt).toLocaleString()}`
                    : ''}
                  {approval.status !== 'VALID'
                    ? ` · ${approval.status.toLowerCase()}`
                    : ''}
                </p>
                {approval.decisionComment && (
                  <p className="mt-1">{approval.decisionComment}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <p
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md border p-3 text-sm" role="status">
          {message}
        </p>
      )}

      <div className="flex justify-between border-t pt-4">
        <Button
          disabled={!hasPrevious}
          onClick={() => confirmNavigation(onPrevious)}
          type="button"
          variant="outline"
        >
          Previous stage
        </Button>
        <Button
          disabled={!hasNext}
          onClick={() => confirmNavigation(onNext)}
          type="button"
          variant="outline"
        >
          Next stage
        </Button>
      </div>
    </div>
  );
}
