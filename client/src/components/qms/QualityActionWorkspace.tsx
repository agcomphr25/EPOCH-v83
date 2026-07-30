/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Can = (capability: string) => boolean;

const ASSESSMENT_QUESTIONS = [
  ['ACTUAL_NONCONFORMANCE', 'Actual product nonconformance?'],
  ['PRODUCT_CONTAINED', 'Affected product contained and identified?'],
  [
    'OTHER_PRODUCT_AFFECTED',
    'Other WIP, inventory, lots, serials, or delivered product potentially affected?',
  ],
  [
    'SIGNIFICANT_SYSTEMIC_CUSTOMER',
    'Significant, recurring, systemic, audit-related, or customer-facing issue?',
  ],
  ['PRODUCTION_METHOD_CHANGE', 'Production method changing?'],
  [
    'DESIGN_PERFORMANCE_IMPACT',
    'Possible form, fit, function, safety, reliability, interchangeability, or performance impact?',
  ],
  [
    'DESIGN_OUTPUT_CHANGE',
    'Drawing, specification, BOM, material, tolerance, acceptance criteria, or design output changing?',
  ],
  [
    'TEMPORARY_OR_PERMANENT',
    'Temporary or permanent change classification established?',
  ],
  [
    'CUSTOMER_REGULATORY_APPROVAL',
    'Customer, regulatory, contract, or design-authority approval required?',
  ],
  ['CONTROLLED_DOCUMENTS_AFFECTED', 'Controlled documents affected?'],
  ['TRAINING_REQUIRED', 'Training required?'],
  [
    'VALIDATION_TESTING_FAI_REQUIRED',
    'Validation, testing, FAI, or partial FAI required?',
  ],
  [
    'WIP_INVENTORY_DISPOSITION',
    'Existing WIP or inventory disposition required?',
  ],
  ['EFFECTIVENESS_VERIFICATION', 'Effectiveness verification required?'],
] as const;

const LINK_TYPES = [
  'RELATED_CHANGE',
  'NCR',
  'CAR',
  'PCR',
  'ECR',
  'ECN_ECO',
  'CONTROLLED_DOCUMENT',
  'DOCUMENT_REVISION',
  'ROUTING',
  'TRAVELER',
  'WORK_INSTRUCTION',
  'INSPECTION_PLAN',
  'CNC_PROGRAM',
  'TRAINING',
  'WORK_ORDER',
  'INVENTORY_ITEM',
  'FAI',
  'PRODUCTION_HOLD',
];

const api = async (url: string, init?: Parameters<typeof fetch>[1]) => {
  const response = await fetch(url, {
    credentials: 'include',
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      payload.message || payload.error || 'Quality Action operation failed'
    );
  return payload;
};

export default function QualityActionWorkspace({
  details,
  can,
  onRefresh,
}: {
  details: any;
  can: Can;
  onRefresh: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<
    Record<string, { response: string; explanation: string }>
  >(
    Object.fromEntries(
      ASSESSMENT_QUESTIONS.map(([key]) => [
        key,
        { response: 'UNKNOWN', explanation: '' },
      ])
    )
  );
  const [overallExplanation, setOverallExplanation] = useState('');
  const [viewedAssessment, setViewedAssessment] = useState<any>(null);
  const [decisionReasons, setDecisionReasons] = useState<
    Record<string, string>
  >({});
  const [actionReason, setActionReason] = useState('');
  const [investigatorUserId, setInvestigatorUserId] = useState('');
  const [investigationDueDate, setInvestigationDueDate] = useState('');
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [impact, setImpact] = useState({
    designImpact: 'UNKNOWN',
    safetyRegulatoryImpact: 'NO',
    contractCustomerImpact: 'NO',
    technicalManufacturingImpact: 'NO',
    validationRequired: 'NO',
    financeApprovalRequired: 'NO',
    temporaryPermanent: '',
    affectedProduct: '',
    technicalJustification: '',
    recommendedDisposition: '',
  });
  const [linkSearch, setLinkSearch] = useState('');
  const [linkCandidates, setLinkCandidates] = useState<any[]>([]);
  const [selectedLink, setSelectedLink] = useState<any>(null);
  const [linkType, setLinkType] = useState('RELATED_CHANGE');
  const [relationshipRole, setRelationshipRole] = useState('AFFECTED');
  const [linkReason, setLinkReason] = useState('');
  const [manualLinkedId, setManualLinkedId] = useState('');
  const [manualLinkedNumber, setManualLinkedNumber] = useState('');
  const [replacementRevisionId, setReplacementRevisionId] = useState('');
  const [noRevisionJustification, setNoRevisionJustification] = useState('');
  const [approvalFunction, setApprovalFunction] = useState('QUALITY');
  const [approvalDecision, setApprovalDecision] = useState('APPROVED');
  const [approvalReason, setApprovalReason] = useState('');
  const [implementationReason, setImplementationReason] = useState('');
  const [controls, setControls] = useState({
    customerApprovalEvidenceId: '',
    effectivityEstablished: 'NO',
    wipInventoryDispositionComplete: 'NO',
    validationTestingComplete: 'NO',
    faiDetermination: 'NOT_REQUIRED',
    faiEvidenceReference: '',
    trainingRequired: 'NO',
    trainingAcknowledged: 'NO',
    reason: '',
  });
  const [implementationEvidence, setImplementationEvidence] = useState('');
  const [verificationResults, setVerificationResults] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [effectivenessOutcome, setEffectivenessOutcome] = useState('effective');
  const [effectivenessEvidence, setEffectivenessEvidence] = useState('');

  const pcr =
    details.authoritative?.kind === 'PCR' ? details.authoritative.record : null;
  const currentAssessment = details.latestAssessment;
  const gateBlockers = details.implementation_gate?.blockers ?? [];
  const approvalRows = useMemo(
    () => details.authoritative?.approvals ?? [],
    [details.authoritative?.approvals]
  );
  const requiredApprovals: string[] =
    details.authoritative?.requiredApprovals ?? [];
  const approvedFunctions = useMemo(
    () =>
      new Set(
        approvalRows
          .filter((row: any) => row.decision === 'APPROVED')
          .map((row: any) => row.approval_function)
      ),
    [approvalRows]
  );

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await onRefresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Quality Action operation failed'
      );
    } finally {
      setBusy(false);
    }
  };

  const submitAssessment = () =>
    run(() =>
      api(`/api/change-control/${details.id}/assessments`, {
        method: 'POST',
        body: JSON.stringify({
          overallExplanation,
          answers: ASSESSMENT_QUESTIONS.map(([questionKey]) => ({
            questionKey,
            ...answers[questionKey],
          })),
        }),
      })
    );

  const decideRecommendation = (recommendation: any, decision: string) =>
    run(() =>
      api(
        `/api/change-control/${details.id}/assessments/${currentAssessment.id}/recommendations/${recommendation.id}/decision`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            reason: decisionReasons[recommendation.id],
          }),
        }
      )
    );

  const recommendationHref = (code: string) => {
    if (code.includes('NCR')) return '/nonconformance';
    if (code.includes('CAR')) return '/qms/corrective-actions';
    if (code.includes('PCR')) return '/my-quality-actions';
    if (code.includes('ECR') || code.includes('ECN'))
      return '/qms/design-control';
    return null;
  };

  const pcrAction = (action: string, body: Record<string, unknown> = {}) =>
    run(() =>
      api(`/api/change-control/pcrs/${pcr.id}/actions/${action}`, {
        method: 'POST',
        body: JSON.stringify({ reason: actionReason, ...body }),
      })
    );

  const searchLinks = async () => {
    setError('');
    try {
      setLinkCandidates(
        await api(
          `/api/change-control/link-candidates?q=${encodeURIComponent(linkSearch)}&excludeId=${details.id}`
        )
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Link search failed');
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Next required action</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Badge
            variant={
              details.next_action?.classification === 'BLOCKING'
                ? 'destructive'
                : 'outline'
            }
          >
            {details.next_action?.classification}
          </Badge>
          <p className="font-medium">{details.next_action?.statement}</p>
          <p>
            Responsible: {details.next_action?.responsibleRole}
            {details.next_action?.responsibleUserId
              ? ` / user ${details.next_action.responsibleUserId}`
              : ''}
          </p>
          <p className="text-muted-foreground">
            Evidence:{' '}
            {(details.next_action?.evidence ?? []).join('; ') ||
              'None recorded'}
          </p>
          <p className="text-muted-foreground">
            Control: {details.next_action?.controlReference || 'Not configured'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AS9100 workflow assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {can('qms.quality_action.screen') && (
            <>
              <div className="rounded border p-3 text-sm">
                Every answer and explanation becomes an immutable new version.
                Recommendations require a separate Quality decision.
              </div>
              {ASSESSMENT_QUESTIONS.map(([key, label], index) => (
                <div
                  key={key}
                  className="grid gap-2 rounded border p-3 md:grid-cols-[2fr_1fr_3fr]"
                >
                  <Label>
                    {index + 1}. {label}
                  </Label>
                  <Select
                    value={answers[key].response}
                    onValueChange={(response) =>
                      setAnswers({
                        ...answers,
                        [key]: { ...answers[key], response },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['YES', 'NO', 'UNKNOWN', 'NOT_APPLICABLE'].map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            {value.replace('_', ' ')}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`${label} explanation`}
                    placeholder="Required explanation"
                    value={answers[key].explanation}
                    onChange={(event) =>
                      setAnswers({
                        ...answers,
                        [key]: {
                          ...answers[key],
                          explanation: event.target.value,
                        },
                      })
                    }
                  />
                </div>
              ))}
              <Textarea
                placeholder="Overall assessment context"
                value={overallExplanation}
                onChange={(event) => setOverallExplanation(event.target.value)}
              />
              <Button disabled={busy} onClick={() => void submitAssessment()}>
                Save immutable assessment version
              </Button>
            </>
          )}
          <div>
            <h4 className="font-semibold">Assessment history</h4>
            {(details.assessments ?? []).map((assessment: any) => (
              <button
                type="button"
                key={assessment.id}
                className="mt-2 block w-full rounded border p-2 text-left text-sm"
                onClick={() =>
                  void api(
                    `/api/change-control/${details.id}/assessments/${assessment.id}`
                  )
                    .then(setViewedAssessment)
                    .catch((caught) => setError(caught.message))
                }
              >
                Version {assessment.version} / {assessment.lifecycle_status} /{' '}
                {new Date(assessment.created_at).toLocaleString()}
                {assessment.assessor_snapshot?.displayName
                  ? ` / ${assessment.assessor_snapshot.displayName}`
                  : ''}
              </button>
            ))}
            {viewedAssessment && (
              <div className="mt-3 space-y-2 rounded border p-3 text-sm">
                <strong>Version {viewedAssessment.version} evidence</strong>
                {(viewedAssessment.answers ?? []).map((answer: any) => (
                  <div key={answer.id}>
                    <Badge variant="outline">{answer.response}</Badge>{' '}
                    {answer.question_key}: {answer.explanation}
                  </div>
                ))}
              </div>
            )}
          </div>
          {currentAssessment && (
            <div className="space-y-3">
              <h4 className="font-semibold">Current recommendations</h4>
              {(currentAssessment.recommendations ?? []).map(
                (recommendation: any) => (
                  <div
                    key={recommendation.id}
                    className="rounded border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          recommendation.quality_decision
                            ? 'outline'
                            : 'destructive'
                        }
                      >
                        {recommendation.quality_decision ||
                          'QUALITY DECISION REQUIRED'}
                      </Badge>
                      <strong>{recommendation.recommendation_code}</strong>
                    </div>
                    <p className="mt-2">{recommendation.recommendation}</p>
                    <p className="text-muted-foreground">
                      Generated by:{' '}
                      {(recommendation.supporting_question_keys ?? []).join(
                        ', '
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      Control:{' '}
                      {recommendation.control_reference || 'Not configured'}
                    </p>
                    {recommendationHref(recommendation.recommendation_code) && (
                      <a
                        className="mt-2 inline-block"
                        href={recommendationHref(
                          recommendation.recommendation_code
                        )!}
                      >
                        <Button size="sm" variant="outline">
                          Create or link in authoritative workflow
                        </Button>
                      </a>
                    )}
                    {!recommendation.quality_decision &&
                      can('qms.quality_action.screen') && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Input
                            className="min-w-72 flex-1"
                            placeholder="Override reason (mandatory for override)"
                            value={decisionReasons[recommendation.id] ?? ''}
                            onChange={(event) =>
                              setDecisionReasons({
                                ...decisionReasons,
                                [recommendation.id]: event.target.value,
                              })
                            }
                          />
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void decideRecommendation(
                                recommendation,
                                'CONFIRMED'
                              )
                            }
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="outline"
                            disabled={
                              busy ||
                              !decisionReasons[recommendation.id]?.trim()
                            }
                            onClick={() =>
                              void decideRecommendation(
                                recommendation,
                                'OVERRIDDEN'
                              )
                            }
                          >
                            Override with reason
                          </Button>
                        </div>
                      )}
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {pcr && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>QMS screening and investigation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge>{pcr.quality_action_status}</Badge>
                <span className="text-sm text-muted-foreground">
                  Requester:{' '}
                  {pcr.requester_snapshot?.displayName || pcr.submitted_by_name}
                </span>
              </div>
              <Textarea
                placeholder="Required reason for disposition, information request, redirect, cancellation, or reopening"
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
              />
              {can('qms.quality_action.screen') && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => void pcrAction('screen')}
                  >
                    Accept for investigation
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !actionReason.trim()}
                    onClick={() => void pcrAction('request_information')}
                  >
                    Request information
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !actionReason.trim()}
                    onClick={() => void pcrAction('deny')}
                  >
                    Deny
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !actionReason.trim()}
                    onClick={() => void pcrAction('duplicate')}
                  >
                    Mark duplicate
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !actionReason.trim()}
                    onClick={() => void pcrAction('redirect')}
                  >
                    Redirect
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !actionReason.trim()}
                    onClick={() => void pcrAction('cancel')}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {can('qms.change_control.reopen') &&
                ['CLOSED', 'DENIED', 'CANCELLED'].includes(
                  pcr.quality_action_status
                ) && (
                  <Button
                    variant="outline"
                    disabled={busy || !actionReason.trim()}
                    onClick={() => void pcrAction('reopen')}
                  >
                    Reopen with reason
                  </Button>
                )}
              {can('qms.quality_action.assign_investigation') && (
                <div className="grid gap-3 md:grid-cols-3">
                  <Input
                    placeholder="Investigator user ID"
                    value={investigatorUserId}
                    onChange={(event) =>
                      setInvestigatorUserId(event.target.value)
                    }
                  />
                  <Input
                    type="date"
                    value={investigationDueDate}
                    onChange={(event) =>
                      setInvestigationDueDate(event.target.value)
                    }
                  />
                  <Button
                    disabled={
                      busy || !investigatorUserId || !investigationDueDate
                    }
                    onClick={() =>
                      void run(() =>
                        api(`/api/change-control/pcrs/${pcr.id}/assign`, {
                          method: 'POST',
                          body: JSON.stringify({
                            investigatorUserId,
                            dueDate: investigationDueDate,
                            reason: actionReason,
                          }),
                        })
                      )
                    }
                  >
                    Assign investigator
                  </Button>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <Textarea
                  placeholder="Investigation notes, problem/proposal, containment, and root-cause findings"
                  value={investigationNotes}
                  onChange={(event) =>
                    setInvestigationNotes(event.target.value)
                  }
                />
                <div className="space-y-2">
                  <Input
                    placeholder="Technical justification"
                    value={impact.technicalJustification}
                    onChange={(event) =>
                      setImpact({
                        ...impact,
                        technicalJustification: event.target.value,
                      })
                    }
                  />
                  <Input
                    placeholder="Affected parts, lots, serials, WIP, inventory, delivered product"
                    value={impact.affectedProduct}
                    onChange={(event) =>
                      setImpact({
                        ...impact,
                        affectedProduct: event.target.value,
                      })
                    }
                  />
                  <Input
                    placeholder="Temporary / permanent classification"
                    value={impact.temporaryPermanent}
                    onChange={(event) =>
                      setImpact({
                        ...impact,
                        temporaryPermanent: event.target.value,
                      })
                    }
                  />
                  <Input
                    placeholder="Recommended disposition/action"
                    value={impact.recommendedDisposition}
                    onChange={(event) =>
                      setImpact({
                        ...impact,
                        recommendedDisposition: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ['designImpact', 'Design impact'],
                  ['safetyRegulatoryImpact', 'Safety/regulatory impact'],
                  ['contractCustomerImpact', 'Customer/contract impact'],
                  [
                    'technicalManufacturingImpact',
                    'Technical/manufacturing impact',
                  ],
                  ['validationRequired', 'Validation/testing required'],
                  ['financeApprovalRequired', 'Finance threshold applies'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Select
                      value={(impact as any)[key]}
                      onValueChange={(value) =>
                        setImpact({ ...impact, [key]: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['YES', 'NO', 'UNKNOWN'].map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {can('qms.quality_action.investigate') && (
                <Button
                  disabled={busy || !investigationNotes.trim()}
                  onClick={() =>
                    void pcrAction('investigate', { investigationNotes })
                  }
                >
                  Save investigation and begin work
                </Button>
              )}
              {can('qms.quality_action.assess_impact') && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void pcrAction('impact_review', {
                        impactAssessment: {
                          technicalManufacturingImpact:
                            impact.technicalManufacturingImpact === 'YES',
                          validationRequired:
                            impact.validationRequired === 'YES',
                          financeApprovalRequired:
                            impact.financeApprovalRequired === 'YES',
                          temporaryPermanent: impact.temporaryPermanent,
                          affectedProduct: impact.affectedProduct,
                          technicalJustification: impact.technicalJustification,
                          recommendedDisposition: impact.recommendedDisposition,
                        },
                        designImpact:
                          impact.designImpact === 'UNKNOWN'
                            ? null
                            : impact.designImpact === 'YES',
                        safetyRegulatoryImpact:
                          impact.safetyRegulatoryImpact === 'YES',
                        contractCustomerImpact:
                          impact.contractCustomerImpact === 'YES',
                      })
                    }
                  >
                    Submit impact review
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void pcrAction('submit_approval')}
                  >
                    Send for functional approvals
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Functional approvals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                {requiredApprovals.map((item) => (
                  <div key={item} className="rounded border p-3 text-sm">
                    <Badge
                      variant={
                        approvedFunctions.has(item) ? 'outline' : 'destructive'
                      }
                    >
                      {approvedFunctions.has(item) ? 'SATISFIED' : 'REQUIRED'}
                    </Badge>
                    <div className="mt-2 font-medium">{item}</div>
                  </div>
                ))}
              </div>
              {approvalRows.map((row: any) => (
                <div key={row.id} className="rounded border p-2 text-sm">
                  {row.approval_function}: {row.decision} /{' '}
                  {row.actor_snapshot?.displayName} /{' '}
                  {new Date(row.decided_at).toLocaleString()}
                  <div className="text-muted-foreground">
                    {row.signature_meaning} / checksum {row.record_checksum}
                  </div>
                </div>
              ))}
              <div className="grid gap-3 md:grid-cols-3">
                <Select
                  value={approvalFunction}
                  onValueChange={setApprovalFunction}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requiredApprovals.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={approvalDecision}
                  onValueChange={setApprovalDecision}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['APPROVED', 'REJECTED', 'RETURNED'].map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Decision reason"
                  value={approvalReason}
                  onChange={(event) => setApprovalReason(event.target.value)}
                />
              </div>
              <Button
                disabled={busy || !requiredApprovals.includes(approvalFunction)}
                onClick={() =>
                  void run(() =>
                    api(`/api/change-control/pcrs/${pcr.id}/decisions`, {
                      method: 'POST',
                      body: JSON.stringify({
                        approvalFunction,
                        decision: approvalDecision,
                        reason: approvalReason,
                        signatureMeaning: `I ${approvalDecision.toLowerCase()} this PCR for my functional authority`,
                      }),
                    })
                  )
                }
              >
                Record immutable functional decision
              </Button>
              <p className="text-sm text-muted-foreground">
                Request approval does not release implementation. Quality
                implementation authorization is separate below.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Implementation gates and authorization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gateBlockers.length ? (
                gateBlockers.map((blocker: any) => (
                  <div
                    key={blocker.code}
                    className="rounded border border-destructive/40 p-3 text-sm"
                  >
                    <Badge variant="destructive">MISSING</Badge>{' '}
                    <strong>{blocker.code}</strong>
                    <p>{blocker.statement}</p>
                    <p className="text-muted-foreground">
                      {(blocker.evidence ?? []).join('; ')}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded border p-3 text-sm">
                  <Badge variant="outline">SATISFIED</Badge> All evaluated
                  implementation prerequisites are complete.
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Gate evaluation includes customer/regulatory evidence, document
                release, effectivity, WIP/inventory disposition,
                validation/testing, FAI, training, functional approvals, and
                implementation authorization.
              </div>
              {can('qms.quality_action.assess_impact') && (
                <div className="space-y-3 rounded border p-3">
                  <h4 className="font-semibold">
                    Record controlled prerequisites
                  </h4>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      placeholder="Customer approval evidence UUID"
                      value={controls.customerApprovalEvidenceId}
                      onChange={(event) =>
                        setControls({
                          ...controls,
                          customerApprovalEvidenceId: event.target.value,
                        })
                      }
                    />
                    {[
                      ['effectivityEstablished', 'Effectivity established'],
                      [
                        'wipInventoryDispositionComplete',
                        'WIP/inventory disposition complete',
                      ],
                      [
                        'validationTestingComplete',
                        'Validation/testing complete',
                      ],
                      ['trainingRequired', 'Training required'],
                      ['trainingAcknowledged', 'Training acknowledged'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <Label>{label}</Label>
                        <Select
                          value={(controls as any)[key]}
                          onValueChange={(value) =>
                            setControls({ ...controls, [key]: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NO">No</SelectItem>
                            <SelectItem value="YES">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    <div>
                      <Label>FAI determination</Label>
                      <Select
                        value={controls.faiDetermination}
                        onValueChange={(value) =>
                          setControls({ ...controls, faiDetermination: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['REQUIRED', 'PARTIAL', 'NOT_REQUIRED'].map(
                            (item) => (
                              <SelectItem key={item} value={item}>
                                {item}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      placeholder="FAI / partial FAI evidence reference"
                      value={controls.faiEvidenceReference}
                      onChange={(event) =>
                        setControls({
                          ...controls,
                          faiEvidenceReference: event.target.value,
                        })
                      }
                    />
                    <Input
                      placeholder="Required audit reason"
                      value={controls.reason}
                      onChange={(event) =>
                        setControls({ ...controls, reason: event.target.value })
                      }
                    />
                  </div>
                  <Button
                    disabled={busy || !controls.reason.trim()}
                    onClick={() =>
                      void run(() =>
                        api(`/api/change-control/pcrs/${pcr.id}/controls`, {
                          method: 'PATCH',
                          body: JSON.stringify({
                            customerApprovalEvidenceId:
                              controls.customerApprovalEvidenceId || null,
                            effectivityEstablished:
                              controls.effectivityEstablished === 'YES',
                            wipInventoryDispositionComplete:
                              controls.wipInventoryDispositionComplete ===
                              'YES',
                            validationTestingComplete:
                              controls.validationTestingComplete === 'YES',
                            faiDetermination: controls.faiDetermination,
                            faiEvidenceReference:
                              controls.faiEvidenceReference || null,
                            trainingRequired:
                              controls.trainingRequired === 'YES',
                            trainingAcknowledged:
                              controls.trainingAcknowledged === 'YES',
                            reason: controls.reason,
                          }),
                        })
                      )
                    }
                  >
                    Save controlled prerequisites
                  </Button>
                </div>
              )}
              {can('qms.quality_action.authorize_implementation') && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Implementation authorization rationale"
                    value={implementationReason}
                    onChange={(event) =>
                      setImplementationReason(event.target.value)
                    }
                  />
                  <Button
                    disabled={busy || !implementationReason.trim()}
                    onClick={() =>
                      void run(() =>
                        api(
                          `/api/change-control/pcrs/${pcr.id}/authorize-implementation`,
                          {
                            method: 'POST',
                            body: JSON.stringify({
                              reason: implementationReason,
                            }),
                          }
                        )
                      )
                    }
                  >
                    Authorize implementation
                  </Button>
                </div>
              )}
              {can('qms.quality_action.authorize_implementation') &&
                pcr.quality_action_status === 'IMPLEMENTATION_PENDING' && (
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Immutable implementation evidence"
                      value={implementationEvidence}
                      onChange={(event) =>
                        setImplementationEvidence(event.target.value)
                      }
                    />
                    <Button
                      disabled={busy || !implementationEvidence.trim()}
                      onClick={() =>
                        void run(() =>
                          api(
                            `/api/change-control/pcrs/${pcr.id}/complete-implementation`,
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                evidence: implementationEvidence,
                              }),
                            }
                          )
                        )
                      }
                    >
                      Complete implementation
                    </Button>
                  </div>
                )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verification and closure</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Verification outcome and objective evidence"
                value={verificationResults}
                onChange={(event) => setVerificationResults(event.target.value)}
              />
              {can('qms.quality_action.verify_implementation') && (
                <Button
                  disabled={busy || !verificationResults.trim()}
                  onClick={() =>
                    void run(() =>
                      api(`/api/change-control/pcrs/${pcr.id}/verify`, {
                        method: 'POST',
                        body: JSON.stringify({ results: verificationResults }),
                      })
                    )
                  }
                >
                  Verify implementation
                </Button>
              )}
              <Input
                placeholder="Closure checklist rationale"
                value={closureReason}
                onChange={(event) => setClosureReason(event.target.value)}
              />
              {can('qms.quality_action.close') && (
                <Button
                  variant="outline"
                  disabled={busy || !closureReason.trim()}
                  onClick={() =>
                    void run(() =>
                      api(`/api/change-control/pcrs/${pcr.id}/close`, {
                        method: 'POST',
                        body: JSON.stringify({ reason: closureReason }),
                      })
                    )
                  }
                >
                  Close PCR
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Relationship management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Search Quality Action records, or enter an authoritative record ID
            and number for parts, orders, routings, BOMs, documents, suppliers,
            customers, equipment, or other supported records.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Search record number, title, part, order, or document"
              value={linkSearch}
              onChange={(event) => setLinkSearch(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={linkSearch.trim().length < 2}
              onClick={() => void searchLinks()}
            >
              Search
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {linkCandidates.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                className={`rounded border p-3 text-left text-sm ${selectedLink?.id === candidate.id ? 'border-primary' : ''}`}
                onClick={() => setSelectedLink(candidate)}
              >
                <strong>{candidate.change_number}</strong> /{' '}
                {candidate.record_type} / {candidate.title}
              </button>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              placeholder="Authoritative linked record UUID"
              value={manualLinkedId}
              onChange={(event) => setManualLinkedId(event.target.value)}
            />
            <Input
              placeholder="Linked record number or identifier"
              value={manualLinkedNumber}
              onChange={(event) => setManualLinkedNumber(event.target.value)}
            />
          </div>
          {(linkType === 'CONTROLLED_DOCUMENT' ||
            linkType === 'DOCUMENT_REVISION') && (
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                placeholder="Replacement released revision UUID (when applicable)"
                value={replacementRevisionId}
                onChange={(event) =>
                  setReplacementRevisionId(event.target.value)
                }
              />
              <Input
                placeholder="No-revision justification (when no replacement is needed)"
                value={noRevisionJustification}
                onChange={(event) =>
                  setNoRevisionJustification(event.target.value)
                }
              />
            </div>
          )}
          {(selectedLink || manualLinkedId.trim()) &&
            can('qms.change_control.create') && (
              <div className="grid gap-3 md:grid-cols-4">
                <Select value={linkType} onValueChange={setLinkType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LINK_TYPES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Relationship direction/purpose"
                  value={relationshipRole}
                  onChange={(event) => setRelationshipRole(event.target.value)}
                />
                <Input
                  placeholder="Audit reason"
                  value={linkReason}
                  onChange={(event) => setLinkReason(event.target.value)}
                />
                <Button
                  disabled={busy || !linkReason.trim()}
                  onClick={() =>
                    void run(() =>
                      api(`/api/change-control/${details.id}/links`, {
                        method: 'POST',
                        body: JSON.stringify({
                          linkType,
                          linkedRecordId:
                            selectedLink?.id || manualLinkedId.trim(),
                          linkedRecordNumber:
                            selectedLink?.change_number ||
                            manualLinkedNumber.trim() ||
                            null,
                          relationshipRole,
                          description: selectedLink?.title || null,
                          replacementRevisionId:
                            replacementRevisionId.trim() || null,
                          noRevisionJustification:
                            noRevisionJustification.trim() || null,
                          reason: linkReason,
                        }),
                      })
                    )
                  }
                >
                  Create validated link
                </Button>
              </div>
            )}
          {(details.links ?? []).map((link: any) => (
            <div key={link.id} className="rounded border p-2 text-sm">
              {link.relationship_role}: {link.link_type} /{' '}
              {link.linked_record_number || link.linked_record_id}
            </div>
          ))}
        </CardContent>
      </Card>

      {details.authoritative?.kind === 'CAR' &&
        can('qms.quality_action.verify_effectiveness') && (
          <Card>
            <CardHeader>
              <CardTitle>CAR effectiveness review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={effectivenessOutcome}
                onValueChange={setEffectivenessOutcome}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="effective">Effective</SelectItem>
                  <SelectItem value="ineffective">Ineffective</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Effectiveness evidence and recurrence review"
                value={effectivenessEvidence}
                onChange={(event) =>
                  setEffectivenessEvidence(event.target.value)
                }
              />
              <Button
                disabled={busy || !effectivenessEvidence.trim()}
                onClick={() =>
                  void run(() =>
                    api(`/api/change-control/${details.id}/car-effectiveness`, {
                      method: 'POST',
                      body: JSON.stringify({
                        outcome: effectivenessOutcome,
                        evidence: effectivenessEvidence,
                      }),
                    })
                  )
                }
              >
                Record CAR effectiveness
              </Button>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
