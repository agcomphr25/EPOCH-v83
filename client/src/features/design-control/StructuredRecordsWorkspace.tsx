import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { expandDesignControlTerm } from '@shared/designControlTerminology';

import type { StructuredDesignControlRecordType } from './designControlFieldPresentation';

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
import { Textarea } from '@/components/ui/textarea';

type RecordType = StructuredDesignControlRecordType;
type Field = {
  key: string;
  label: string;
  kind?: 'boolean' | 'list' | 'attendees';
  options?: string[];
  guidance: string;
  required?: boolean;
};
type Definition = {
  type: RecordType;
  title: string;
  singular: string;
  fields: Field[];
};

const reviewTypes = [
  'General Design Review',
  expandDesignControlTerm('PDR'),
  expandDesignControlTerm('CDR'),
  'Combined PDR/CDR (Combined Preliminary Design Review and Critical Design Review)',
  expandDesignControlTerm('TRR'),
  expandDesignControlTerm('PRR'),
  'Final Design Review',
  'Other controlled review type',
];

const verificationMethods = [
  'Inspection',
  'Analysis',
  'Demonstration',
  'Test',
  'Similarity',
  'Alternative calculation',
];
const definitions: Definition[] = [
  {
    type: 'REQUIREMENT',
    title: 'Design inputs and requirements',
    singular: 'requirement',
    fields: [
      {
        key: 'requirementNumber',
        label: 'Requirement number',
        guidance: 'Use the controlled project requirement identifier.',
      },
      {
        key: 'category',
        label: 'Category',
        guidance: 'For example: functional, regulatory, interface, or safety.',
      },
      {
        key: 'source',
        label: 'Source',
        guidance:
          'Identify the customer, standard, regulation, or internal source.',
      },
      {
        key: 'sourceReference',
        label: 'Source reference',
        guidance: 'Enter the exact clause, document, or decision reference.',
      },
      {
        key: 'requirementStatement',
        label: 'Requirement statement',
        guidance: 'State one clear, testable requirement.',
      },
      {
        key: 'revision',
        label: 'Requirement revision',
        guidance: 'Identify the retained requirement revision.',
      },
      {
        key: 'acceptanceCriterion',
        label: 'Acceptance criterion',
        guidance: 'Define the objective pass condition.',
      },
      {
        key: 'verificationMethod',
        label: 'Verification method',
        options: verificationMethods,
        guidance: 'Choose the planned verification method.',
      },
      {
        key: 'validationRequired',
        label: 'Validation required',
        kind: 'boolean',
        guidance: 'Choose whether intended-use validation is required.',
      },
      {
        key: 'criticality',
        label: 'Safety / critical designation',
        options: ['NON_CRITICAL', 'CRITICAL', 'SAFETY_CRITICAL'],
        guidance: 'Classify design criticality.',
      },
      {
        key: 'owner',
        label: 'Owner',
        guidance: 'Name the accountable project role or assigned user.',
      },
      {
        key: 'recordStatus',
        label: 'Requirement status',
        options: ['DRAFT', 'ACTIVE', 'SUPERSEDED', 'CLOSED'],
        guidance: 'Select the lifecycle status of this requirement.',
      },
      {
        key: 'clarification',
        label: 'Clarification',
        guidance: 'Record any open clarification, or leave blank.',
      },
      {
        key: 'resolution',
        label: 'Resolution',
        guidance: 'Resolve any clarification before Final Design Review.',
      },
    ],
  },
  {
    type: 'RISK',
    title: 'Design risks',
    singular: 'risk',
    fields: [
      {
        key: 'riskNumber',
        label: 'Risk number',
        guidance: 'Use the controlled project risk identifier.',
      },
      {
        key: 'hazardFailureMode',
        label: 'Hazard / failure mode',
        guidance: 'Describe the hazard or failure mode.',
      },
      {
        key: 'cause',
        label: 'Cause',
        guidance: 'Describe the credible cause.',
      },
      { key: 'effect', label: 'Effect', guidance: 'Describe the consequence.' },
      {
        key: 'severity',
        label: 'Severity',
        guidance: 'Record the approved severity scale value.',
      },
      {
        key: 'likelihood',
        label: 'Likelihood',
        guidance: 'Record the approved likelihood scale value.',
      },
      {
        key: 'detectability',
        label: 'Detectability (if used)',
        guidance: 'Record detectability when the project method uses it.',
      },
      {
        key: 'initialRating',
        label: 'Initial rating',
        guidance: 'Record the pre-mitigation rating.',
      },
      {
        key: 'mitigation',
        label: 'Mitigation',
        guidance: 'Describe the controlled risk reduction.',
      },
      { key: 'owner', label: 'Owner', guidance: 'Name the mitigation owner.' },
      { key: 'dueDate', label: 'Due date', guidance: 'Use YYYY-MM-DD.' },
      {
        key: 'residualRating',
        label: 'Residual rating',
        guidance: 'Record the post-mitigation rating.',
      },
      {
        key: 'verificationEvidence',
        label: 'Mitigation verification evidence',
        guidance: 'Reference objective verification evidence.',
      },
      {
        key: 'acceptanceAuthority',
        label: 'Risk acceptance authority',
        guidance: 'Identify the assigned authorized approver.',
      },
    ],
  },
  {
    type: 'REVIEW',
    title: 'Design reviews and actions',
    singular: 'review',
    fields: [
      {
        key: 'reviewNumber',
        label: 'Review number',
        guidance: 'Use the controlled project review identifier.',
      },
      {
        key: 'reviewType',
        label: 'Review type',
        options: reviewTypes,
        guidance:
          'Confirm the classification and purpose. EPOCH may recommend a type, but never assigns one silently.',
      },
      {
        key: 'reviewPurpose',
        label: 'Purpose and objectives',
        guidance: 'Explain what the review team is deciding and why.',
      },
      { key: 'reviewDate', label: 'Review date', guidance: 'Use YYYY-MM-DD.' },
      {
        key: 'attendees',
        label: 'Attendees and roles',
        kind: 'attendees',
        guidance: 'One attendee per line as Name | Role.',
      },
      {
        key: 'productDescription',
        label: 'Design description',
        guidance: 'Describe the product, system, and maturity being reviewed.',
      },
      {
        key: 'reviewedConfiguration',
        label: 'System configuration and revision reviewed',
        guidance: 'Identify the exact reviewed baseline.',
      },
      {
        key: 'decision',
        label: 'Review decision',
        options: [
          'APPROVED',
          'APPROVED_WITH_ACTION_ITEMS',
          'CONDITIONAL_APPROVAL',
          'NOT_APPROVED',
        ],
        guidance:
          'This Design Review decision records design maturity only. It never releases manufacturing.',
      },
      {
        key: 'conditions',
        label: 'Conditions',
        guidance: 'Record conditions or state none.',
      },
      {
        key: 'minutesEvidence',
        label: 'Review minutes and evidence',
        guidance: 'Reference retained minutes and objective evidence.',
      },
      {
        key: 'requirementsAssessment',
        label: 'Design requirements and performance assessment',
        guidance:
          'Link authoritative requirements and record Complete, Partial, Open, or N/A (Not Applicable).',
      },
      {
        key: 'manufacturingAssessment',
        label: 'Manufacturing-readiness assessment',
        guidance:
          'Assess tooling, first articles, instructions, inspection, materials, and processes without releasing them.',
      },
      {
        key: 'preliminaryAnalysis',
        label: 'Preliminary analysis and design outputs reviewed',
        guidance:
          'Identify controlled analyses, drawings, models, and calculations.',
      },
      {
        key: 'risksAndOpenIssues',
        label: 'Linked risks and open issues',
        guidance:
          'Link the authoritative Design Risk Register; do not copy risks here.',
      },
      {
        key: 'readinessCriteria',
        label: 'Readiness and exit criteria',
        guidance:
          'Record each criterion as Complete, Partial, Open, or N/A (Not Applicable).',
      },
      {
        key: 'notApplicableJustification',
        label: 'N/A (Not Applicable) justification',
        guidance:
          'Required whenever any assessment is marked N/A (Not Applicable).',
      },
      {
        key: 'controlledDocumentReference',
        label: `${expandDesignControlTerm('MDR')} controlled document reference`,
        guidance:
          'Link the existing Design Review report and exact revision. Do not replace or overwrite the original.',
      },
      {
        key: 'sourceMappingStatus',
        label: 'Source-document mapping status',
        options: ['PENDING_AUTHORIZED_CONFIRMATION', 'CONFIRMED'],
        guidance:
          'Mapped Word-form values remain non-authoritative until an authorized user confirms them.',
      },
      {
        key: 'requiredApprovals',
        label: 'Required approval roles',
        kind: 'list',
        guidance: 'One required role per line.',
      },
    ],
  },
  {
    type: 'VERIFICATION',
    title: 'Verification',
    singular: 'verification record',
    fields: [
      {
        key: 'verificationNumber',
        label: 'Verification number',
        guidance: 'Use the controlled verification identifier.',
      },
      {
        key: 'requirementId',
        label: 'Requirement record ID',
        guidance: 'Select or paste the linked requirement UUID.',
      },
      {
        key: 'method',
        label: 'Method',
        options: verificationMethods,
        guidance: 'Choose the executed verification method.',
      },
      {
        key: 'procedureEvidence',
        label: 'Procedure / evidence',
        guidance: 'Reference the controlled procedure and retained result.',
      },
      {
        key: 'acceptanceCriterion',
        label: 'Acceptance criterion',
        guidance: 'State the criterion used for this result.',
      },
      {
        key: 'plannedPerformer',
        label: 'Planned performer',
        guidance: 'Identify the planned responsible person or role.',
      },
      {
        key: 'actualPerformer',
        label: 'Actual performer',
        guidance: 'Identify who executed the work.',
      },
      { key: 'performedDate', label: 'Date', guidance: 'Use YYYY-MM-DD.' },
      {
        key: 'result',
        label: 'Result',
        guidance: 'Record objective result data.',
      },
      {
        key: 'passFail',
        label: 'Pass / fail',
        options: ['PASS', 'FAIL'],
        guidance: 'Failed results remain visible and require disposition.',
      },
      {
        key: 'exceptionDisposition',
        label: 'Exception / disposition',
        guidance: `Required for a failed result; reference an action, risk, ${expandDesignControlTerm('NCR')}, ${expandDesignControlTerm('ECR')}, or ${expandDesignControlTerm('ECN')}.`,
      },
      {
        key: 'reviewer',
        label: 'Reviewer',
        guidance: 'Identify the assigned independent reviewer.',
      },
    ],
  },
  {
    type: 'VALIDATION',
    title: 'Validation',
    singular: 'validation record',
    fields: [
      {
        key: 'validationNumber',
        label: 'Validation number',
        guidance: 'Use the controlled validation identifier.',
      },
      {
        key: 'intendedUseRequirementId',
        label: 'Intended-use requirement ID',
        guidance: 'Select or paste the linked requirement UUID.',
      },
      {
        key: 'objective',
        label: 'Validation objective',
        guidance: 'State the intended-use objective.',
      },
      {
        key: 'method',
        label: 'Method',
        guidance: 'Describe the validation method.',
      },
      {
        key: 'environment',
        label: 'Environment',
        guidance: 'Describe representative conditions.',
      },
      {
        key: 'testedConfiguration',
        label: 'Tested configuration',
        guidance: 'Identify the exact configuration baseline.',
      },
      {
        key: 'partSoftwareRevisions',
        label: 'Part / software revisions',
        kind: 'list',
        guidance: 'One controlled revision per line.',
      },
      {
        key: 'customerUserRepresentative',
        label: 'Customer / user representative',
        guidance: 'Identify the representative or approved proxy.',
      },
      {
        key: 'acceptanceCriterion',
        label: 'Acceptance criterion',
        guidance: 'State the intended-use acceptance condition.',
      },
      {
        key: 'result',
        label: 'Result',
        guidance: 'Record objective validation results.',
      },
      {
        key: 'deviation',
        label: 'Deviation',
        guidance: 'Record deviations or leave blank.',
      },
      {
        key: 'correctiveAction',
        label: 'Corrective action',
        guidance: 'Reference corrective action for any deviation.',
      },
      {
        key: 'customerAcceptanceRequired',
        label: 'Customer acceptance required',
        kind: 'boolean',
        guidance:
          'Choose whether customer acceptance is contractually required.',
      },
      {
        key: 'customerAcceptance',
        label: 'Customer acceptance evidence',
        guidance: 'Reference acceptance when required.',
        required: false,
      },
      {
        key: 'disposition',
        label: 'Validation disposition',
        options: ['ACCEPTED', 'CORRECTION_REQUIRED', 'REJECTED'],
        guidance:
          'Record the controlled disposition; approval remains a separate authenticated server decision.',
      },
    ],
  },
];

type Version = {
  id: string;
  version: number;
  lifecycleStatus: string;
  contentSnapshot: Record<string, unknown>;
};
type ReviewAction = {
  id: string;
  actionNumber: string;
  description: string;
  ownerDisplayName: string;
  dueDate: string;
  status: string;
  mandatory: boolean;
  rowVersion: number;
};
type Row = {
  id: string;
  title?: string;
  status: string;
  currentVersion: Version | null;
  reviewActions?: ReviewAction[];
};

async function request(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.message || payload.error || 'The request failed.');
  return payload;
}

function toEditorValue(field: Field, value: unknown) {
  if (field.kind === 'list')
    return Array.isArray(value) ? value.join('\n') : '';
  if (field.kind === 'attendees')
    return Array.isArray(value)
      ? value
          .map((item) => {
            const attendee = item as { name?: string; role?: string };
            return `${attendee.name ?? ''} | ${attendee.role ?? ''}`;
          })
          .join('\n')
      : '';
  return value === undefined || value === null ? '' : String(value);
}

function fromEditorValue(field: Field, value: string) {
  if (field.kind === 'boolean') return value === 'true';
  if (field.kind === 'list')
    return value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  if (field.kind === 'attendees')
    return value
      .split('\n')
      .map((line) => {
        const [name, role] = line.split('|').map((item) => item.trim());
        return { name, role };
      })
      .filter((item) => item.name && item.role);
  return value;
}

export function StructuredRecordsWorkspace({
  recordId,
  readOnly,
  initialType = 'REQUIREMENT',
  allowedTypes,
  compact = false,
}: {
  recordId: string;
  readOnly: boolean;
  initialType?: RecordType;
  allowedTypes?: readonly RecordType[];
  compact?: boolean;
}) {
  const availableDefinitions = allowedTypes
    ? definitions.filter((definition) => allowedTypes.includes(definition.type))
    : definitions;
  const [type, setType] = useState<RecordType>(initialType);
  const definition = definitions.find((item) => item.type === type)!;
  const query = useQuery<{ records: Row[] }>({
    queryKey: ['/api/qms/design-control', recordId, 'structured', type],
    queryFn: () =>
      request(`/api/qms/design-control/${recordId}/structured/${type}`),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    setType(initialType);
    setSelectedId(null);
  }, [initialType]);
  const selected =
    query.data?.records.find((item) => item.id === selectedId) ?? null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [changeReason, setChangeReason] = useState('Draft updated');
  const [decisionReason, setDecisionReason] = useState('');
  const [link, setLink] = useState({
    targetType: 'CONFIGURATION_ITEM',
    targetId: '',
    relationType: 'TRACES_TO',
    targetRevision: '',
  });
  const [reviewAction, setReviewAction] = useState({
    actionNumber: '',
    description: '',
    ownerDisplayName: '',
    dueDate: '',
    mandatory: true,
  });

  const activeDraftReview =
    type === 'REVIEW'
      ? query.data?.records.find((row) =>
          ['DRAFT', 'RETURNED', 'REJECTED'].includes(
            row.currentVersion?.lifecycleStatus || ''
          )
        )
      : undefined;

  useEffect(() => {
    const content = selected?.currentVersion?.contentSnapshot ?? {};
    setValues(
      Object.fromEntries(
        definition.fields.map((field) => [
          field.key,
          toEditorValue(field, content[field.key]),
        ])
      )
    );
    setMessage('');
  }, [definition, selected]);

  const missing = useMemo(
    () =>
      definition.fields.filter((field) => {
        if (field.key === 'notApplicableJustification')
          return (
            Object.values(values).some((value) =>
              /(^|\W)N\/?A(\W|$)/i.test(value)
            ) &&
            (values[field.key] === undefined || values[field.key].trim() === '')
          );
        if (field.required === false) return false;
        if (
          [
            'clarification',
            'resolution',
            'detectability',
            'conditions',
            'exceptionDisposition',
            'deviation',
            'correctiveAction',
            'customerAcceptance',
          ].includes(field.key)
        )
          return false;
        return (
          values[field.key] === undefined || values[field.key].trim() === ''
        );
      }),
    [definition, values]
  );

  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
      await query.refetch();
      setMessage('Saved. The authoritative history has been updated.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const content = Object.fromEntries(
    definition.fields.map((field) => [
      field.key,
      fromEditorValue(field, values[field.key] ?? ''),
    ])
  );

  return (
    <div className="space-y-4">
      {availableDefinitions.length > 1 && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Structured Design Control registers"
        >
          {availableDefinitions.map((item) => (
            <Button
              key={item.type}
              size="sm"
              variant={type === item.type ? 'default' : 'outline'}
              onClick={() => {
                setType(item.type);
                setSelectedId(null);
              }}
            >
              {item.title}
            </Button>
          ))}
        </div>
      )}
      {type === 'REVIEW' && activeDraftReview && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-500/40 bg-blue-50 p-4 text-sm">
          <div>
            <strong>Existing Design Review draft found.</strong> Continue the
            same controlled record; no duplicate will be created.
          </div>
          <Button
            onClick={() => setSelectedId(activeDraftReview.id)}
            type="button"
          >
            Continue Design Review
          </Button>
        </div>
      )}
      <div
        className={`grid gap-4 ${compact ? 'xl:grid-cols-[18rem_1fr]' : 'lg:grid-cols-[20rem_1fr]'}`}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{definition.title}</CardTitle>
            <CardDescription>
              Persisted, versioned project records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!readOnly && (
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  setSelectedId(null);
                  setValues({});
                  setMessage(
                    'Enter the draft evidence, then choose Create draft.'
                  );
                }}
              >
                Add {definition.singular}
              </Button>
            )}
            {query.isLoading && <p className="text-sm">Loading records…</p>}
            {query.data?.records.length === 0 && (
              <p className="rounded-md border p-4 text-sm text-muted-foreground">
                No {definition.title.toLowerCase()} yet. Use Add{' '}
                {definition.singular} to begin a controlled draft.
              </p>
            )}
            {query.data?.records.map((row) => (
              <button
                className="flex w-full items-start justify-between gap-2 rounded-md border p-3 text-left"
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                type="button"
              >
                <span className="text-sm font-medium">
                  {row.title || row.id}
                </span>
                <Badge variant="outline">
                  {row.currentVersion?.lifecycleStatus || row.status}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selected
                ? `Edit ${definition.singular}`
                : `New ${definition.singular}`}
            </CardTitle>
            <CardDescription>
              {selected?.currentVersion
                ? `Version ${selected.currentVersion.version} · ${selected.currentVersion.lifecycleStatus}`
                : 'Create a draft now and complete required evidence before submission.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {definition.fields.map((field) => (
                <label className="text-sm font-medium" key={field.key}>
                  {field.label}
                  {field.options || field.kind === 'boolean' ? (
                    <select
                      className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                      disabled={readOnly}
                      value={values[field.key] ?? ''}
                      onChange={(event) =>
                        setValues((prior) => ({
                          ...prior,
                          [field.key]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select…</option>
                      {(field.kind === 'boolean'
                        ? ['true', 'false']
                        : field.options!
                      ).map((option) => (
                        <option key={option} value={option}>
                          {option.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  ) : field.kind === 'list' ||
                    field.kind === 'attendees' ||
                    [
                      'requirementStatement',
                      'acceptanceCriterion',
                      'mitigation',
                      'procedureEvidence',
                      'result',
                      'minutesEvidence',
                    ].includes(field.key) ? (
                    <Textarea
                      className="mt-1"
                      disabled={readOnly}
                      value={values[field.key] ?? ''}
                      onChange={(event) =>
                        setValues((prior) => ({
                          ...prior,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <Input
                      type={
                        field.key === 'dueDate' ||
                        field.key === 'reviewDate' ||
                        field.key === 'performedDate'
                          ? 'date'
                          : 'text'
                      }
                      className="mt-1"
                      disabled={readOnly}
                      value={values[field.key] ?? ''}
                      onChange={(event) =>
                        setValues((prior) => ({
                          ...prior,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  )}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {field.guidance}
                  </span>
                </label>
              ))}
            </div>
            {missing.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm">
                <strong>Before submission:</strong> complete{' '}
                {missing.map((field) => field.label).join(', ')}.
              </div>
            )}
            {type === 'REVIEW' && (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                <strong className="text-foreground">Controlled handoff:</strong>{' '}
                approval of this {expandDesignControlTerm('DR')} is
                design-maturity evidence only. A separate item-level or
                complete-product Engineering Release, with Engineering and
                Quality approval, is always required before manufacturing
                receives an approved baseline.
              </div>
            )}
            {!readOnly && (
              <>
                <label className="block text-sm font-medium">
                  Change reason
                  <Input
                    className="mt-1"
                    value={changeReason}
                    onChange={(event) => setChangeReason(event.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {!selected && (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        mutate(async () => {
                          const result = await request(
                            `/api/qms/design-control/${recordId}/structured/${type}`,
                            'POST',
                            { content, changeReason }
                          );
                          setSelectedId(result.record.id);
                        })
                      }
                    >
                      Create draft
                    </Button>
                  )}
                  {selected &&
                    ['DRAFT', 'RETURNED', 'REJECTED'].includes(
                      selected.currentVersion?.lifecycleStatus || ''
                    ) && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          mutate(() =>
                            request(
                              `/api/qms/design-control/${recordId}/structured/${type}/${selected.id}`,
                              'PATCH',
                              {
                                content,
                                changeReason,
                                expectedVersion:
                                  selected.currentVersion!.version,
                              }
                            )
                          )
                        }
                      >
                        Save new version
                      </Button>
                    )}
                  {selected?.currentVersion?.lifecycleStatus === 'DRAFT' && (
                    <Button
                      disabled={busy || missing.length > 0}
                      onClick={() =>
                        mutate(() =>
                          request(
                            `/api/qms/design-control/${recordId}/structured/${type}/${selected.id}/submit`,
                            'POST',
                            {
                              expectedVersion: selected.currentVersion!.version,
                            }
                          )
                        )
                      }
                    >
                      Submit for review
                    </Button>
                  )}
                  {selected?.currentVersion?.lifecycleStatus === 'APPROVED' && (
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() =>
                        mutate(() =>
                          request(
                            `/api/qms/design-control/${recordId}/structured/${type}/${selected.id}/revise`,
                            'POST',
                            {
                              expectedVersion: selected.currentVersion!.version,
                              changeReason,
                            }
                          )
                        )
                      }
                    >
                      Start controlled revision
                    </Button>
                  )}
                </div>
                {selected?.currentVersion?.lifecycleStatus === 'SUBMITTED' && (
                  <div className="space-y-2 rounded-md border p-3">
                    <label className="block text-sm font-medium">
                      Decision reason (required for reject or return)
                      <Textarea
                        className="mt-1"
                        value={decisionReason}
                        onChange={(event) =>
                          setDecisionReason(event.target.value)
                        }
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(['APPROVED', 'REJECTED', 'RETURNED'] as const).map(
                        (decision) => (
                          <Button
                            disabled={
                              busy ||
                              (decision !== 'APPROVED' &&
                                !decisionReason.trim())
                            }
                            key={decision}
                            variant={
                              decision === 'APPROVED' ? 'default' : 'outline'
                            }
                            onClick={() =>
                              mutate(() =>
                                request(
                                  `/api/qms/design-control/${recordId}/structured/${type}/${selected.id}/decision`,
                                  'POST',
                                  {
                                    versionId: selected.currentVersion!.id,
                                    decision,
                                    comment: decisionReason,
                                  }
                                )
                              )
                            }
                          >
                            {decision.replaceAll('_', ' ')}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                )}
                {selected && (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">
                      Add authoritative relationship
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      <select
                        className="h-10 rounded-md border bg-background px-3"
                        value={link.targetType}
                        onChange={(event) =>
                          setLink((prior) => ({
                            ...prior,
                            targetType: event.target.value,
                          }))
                        }
                      >
                        {[
                          'REQUIREMENT',
                          'RISK',
                          'REVIEW',
                          'DESIGN_OUTPUT',
                          'CONFIGURATION_ITEM',
                          'PART_REVISION',
                          'VERIFICATION',
                          'VALIDATION',
                          'NCR',
                          'ECR',
                          'ECN',
                          'ENGINEERING_RELEASE',
                        ].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                      <Input
                        placeholder="Target record ID"
                        value={link.targetId}
                        onChange={(event) =>
                          setLink((prior) => ({
                            ...prior,
                            targetId: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Relationship (for example VERIFIES)"
                        value={link.relationType}
                        onChange={(event) =>
                          setLink((prior) => ({
                            ...prior,
                            relationType: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Target revision (optional)"
                        value={link.targetRevision}
                        onChange={(event) =>
                          setLink((prior) => ({
                            ...prior,
                            targetRevision: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      disabled={busy || !link.targetId.trim()}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        mutate(() =>
                          request(
                            `/api/qms/design-control/${recordId}/structured/${type}/${selected.id}/links`,
                            'POST',
                            link
                          )
                        )
                      }
                    >
                      Link persisted record
                    </Button>
                  </div>
                )}
                {type === 'REVIEW' && selected && (
                  <div className="space-y-3 rounded-md border p-3">
                    <p className="text-sm font-medium">Review actions</p>
                    {selected.reviewActions?.length ? (
                      <div className="divide-y rounded-md border">
                        {selected.reviewActions.map((action) => (
                          <div
                            className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm"
                            key={action.id}
                          >
                            <div>
                              <strong>{action.actionNumber}</strong> ·{' '}
                              {action.description}
                              <p className="text-xs text-muted-foreground">
                                Owner {action.ownerDisplayName} · due{' '}
                                {action.dueDate} ·{' '}
                                {action.mandatory ? 'mandatory' : 'advisory'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{action.status}</Badge>
                              {!['CLOSED', 'EXCEPTED'].includes(
                                action.status
                              ) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const evidence = window.prompt(
                                      'Closure evidence reference'
                                    );
                                    if (evidence?.trim())
                                      mutate(() =>
                                        request(
                                          `/api/qms/design-control/${recordId}/review-actions/${action.id}/close`,
                                          'POST',
                                          {
                                            expectedVersion: action.rowVersion,
                                            closureEvidence: {
                                              reference: evidence,
                                            },
                                            excepted: false,
                                          }
                                        )
                                      );
                                  }}
                                >
                                  Close with approval
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No review actions. Mandatory actions must close or
                        receive an authorized exception before review closure.
                      </p>
                    )}
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input
                        placeholder="Action number"
                        value={reviewAction.actionNumber}
                        onChange={(event) =>
                          setReviewAction((prior) => ({
                            ...prior,
                            actionNumber: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Owner"
                        value={reviewAction.ownerDisplayName}
                        onChange={(event) =>
                          setReviewAction((prior) => ({
                            ...prior,
                            ownerDisplayName: event.target.value,
                          }))
                        }
                      />
                      <Textarea
                        placeholder="Description"
                        value={reviewAction.description}
                        onChange={(event) =>
                          setReviewAction((prior) => ({
                            ...prior,
                            description: event.target.value,
                          }))
                        }
                      />
                      <Input
                        type="date"
                        value={reviewAction.dueDate}
                        onChange={(event) =>
                          setReviewAction((prior) => ({
                            ...prior,
                            dueDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        checked={reviewAction.mandatory}
                        onChange={(event) =>
                          setReviewAction((prior) => ({
                            ...prior,
                            mandatory: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      Mandatory action
                    </label>
                    <Button
                      disabled={
                        !reviewAction.actionNumber ||
                        !reviewAction.description ||
                        !reviewAction.ownerDisplayName ||
                        !reviewAction.dueDate
                      }
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        mutate(() =>
                          request(
                            `/api/qms/design-control/${recordId}/reviews/${selected.id}/actions`,
                            'POST',
                            reviewAction
                          )
                        )
                      }
                    >
                      Add review action
                    </Button>
                  </div>
                )}
              </>
            )}
            {message && (
              <p className="rounded-md border p-3 text-sm" role="status">
                {message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
