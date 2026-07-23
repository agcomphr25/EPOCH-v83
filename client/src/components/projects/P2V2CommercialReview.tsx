import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Stage = 'rfq_risk_assessment' | 'estimate_quote' | 'contract_review';
// The raw additive API mirrors JSONB and SQL aliases without expanding shared schema types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Model = {
  review: Row | null;
  history: Row[];
  approvals: Row[];
  requiredApprovals: string[];
  readiness: {
    ready: boolean;
    stale: boolean;
    blockers: string[];
    differences: string[];
  };
};
const labels: Record<Stage, string> = {
  rfq_risk_assessment: 'RFQ Review',
  estimate_quote: 'Estimate & Quote Review',
  contract_review: 'Contract Review',
};
const sourceDefaults: Record<Stage, string> = {
  rfq_risk_assessment: 'estimating_rfq',
  estimate_quote: 'quote',
  contract_review: 'contract_review_instance',
};
const endpoint = (projectId: string, stage: Stage) =>
  `/api/projects/${projectId}/workflow-v2/commercial-reviews/${stage}`;
async function request(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.message || data.error || 'Request failed');
  return data;
}
const json = (value: unknown) => JSON.stringify(value ?? [], null, 2);
const parseArray = (value: string) => {
  const parsed = JSON.parse(value || '[]');
  if (!Array.isArray(parsed))
    throw new Error('This field must be a JSON array.');
  return parsed;
};

export default function P2V2CommercialReview({
  projectId,
  stage,
}: {
  projectId: string;
  stage: Stage;
}) {
  const [open, setOpen] = useState(false);
  const [sourceRecordType, setSourceRecordType] = useState(
    sourceDefaults[stage]
  );
  const [sourceRecordId, setSourceRecordId] = useState('');
  const [secondarySourceId, setSecondarySourceId] = useState('');
  const [effectivityReference, setEffectivityReference] = useState('');
  const [sufficientlyDefined, setSufficientlyDefined] = useState(false);
  const [differencesResolved, setDifferencesResolved] = useState(false);
  const [financeRequired, setFinanceRequired] = useState(false);
  const [differences, setDifferences] = useState('[]');
  const [risks, setRisks] = useState('[]');
  const [informationRequests, setInformationRequests] = useState('[]');
  const [error, setError] = useState('');
  const client = useQueryClient();
  const key = [
    '/api/projects',
    projectId,
    'workflow-v2',
    'commercial-reviews',
    stage,
  ];
  const { data, isLoading } = useQuery<Model>({
    queryKey: key,
    queryFn: () => request(endpoint(projectId, stage)),
    enabled: open,
  });
  const { data: permissions } = useQuery<{ permissions: string[] }>({
    queryKey: ['/api/permissions/me'],
    queryFn: () => request('/api/permissions/me'),
  });
  const allowed = useMemo(
    () => new Set(permissions?.permissions ?? []),
    [permissions]
  );
  const mutation = useMutation({
    mutationFn: (input: { url: string; method?: string; body?: unknown }) =>
      request(input.url, input.method, input.body),
    onSuccess: async () => {
      setError('');
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'workflow-v2'],
      });
    },
    onError: (cause: Error) => setError(cause.message),
  });
  const review = data?.review;
  const reviewId = String(review?.id ?? '');
  const revision = Number(review?.revision_number ?? 0);
  const concurrencyToken = Number(review?.lock_version ?? revision);
  const status = String(review?.status ?? '');
  useEffect(() => {
    if (!review) return;
    setSourceRecordType(
      String(review.source_record_type ?? sourceDefaults[stage])
    );
    setSourceRecordId(String(review.source_record_id ?? ''));
    setSecondarySourceId(
      String(review.source_snapshot?.secondarySourceId ?? '')
    );
    setEffectivityReference(String(review.effectivity_reference ?? ''));
    setSufficientlyDefined(Boolean(review.sufficiently_defined));
    setDifferencesResolved(Boolean(review.differences_resolved));
    setFinanceRequired(Boolean(review.requirements_snapshot?.financeRequired));
    setDifferences(json(review.differences));
    setRisks(json(review.risks));
    setInformationRequests(json(review.unresolved_information_requests));
  }, [review, stage]);
  const draftBody = () => ({
    sourceRecordType,
    sourceRecordId: sourceRecordId || String(review?.source_record_id ?? ''),
    secondarySourceId: secondarySourceId || null,
    sufficientlyDefined,
    differencesResolved,
    financeRequired,
    effectivityReference: effectivityReference || null,
    differences: parseArray(differences),
    risks: parseArray(risks),
    unresolvedInformationRequests: parseArray(informationRequests),
  });
  const run = (suffix: string, body: unknown, method = 'POST') =>
    mutation.mutate({
      url: `${endpoint(projectId, stage)}${suffix}`,
      method,
      body,
    });
  const save = () => {
    try {
      const body = draftBody();
      if (reviewId)
        run(
          `/${reviewId}`,
          { ...body, expectedRevision: concurrencyToken },
          'PATCH'
        );
      else run('', body);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Invalid review input.'
      );
    }
  };
  const decide = (capacity: string, decision: 'APPROVED' | 'REJECTED') => {
    const signatureMeaning = window.prompt(
      'Signature meaning (required):',
      `I ${decision === 'APPROVED' ? 'approve' : 'reject'} this commercial-review revision.`
    );
    if (!signatureMeaning) return;
    const reason =
      window.prompt(
        decision === 'REJECTED' ? 'Reason (required):' : 'Comment:',
        ''
      ) ?? '';
    if (decision === 'REJECTED' && !reason.trim()) return;
    run(`/${reviewId}/${capacity}-decision`, {
      expectedRevision: concurrencyToken,
      decision,
      signatureMeaning,
      reason,
    });
  };
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid={`open-commercial-review-${stage}`}
      >
        Open {labels[stage]}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{labels[stage]}</DialogTitle>
            <DialogDescription>
              Revision-controlled review of authoritative commercial records.
              This action does not alter the source record.
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <p>Loading review…</p>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>{status || 'NOT STARTED'}</Badge>
                {review && (
                  <Badge variant="outline">Review revision {revision}</Badge>
                )}
                {data?.readiness.stale && (
                  <Badge variant="destructive">SOURCE CHANGED</Badge>
                )}
              </div>
              {error && (
                <p className="rounded bg-red-50 p-2 text-red-700">{error}</p>
              )}
              <section className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Authoritative record type</Label>
                  <Input
                    value={sourceRecordType}
                    onChange={(e) => setSourceRecordType(e.target.value)}
                    disabled={status !== '' && status !== 'DRAFT'}
                  />
                </div>
                <div>
                  <Label>Authoritative record identifier</Label>
                  <Input
                    value={
                      sourceRecordId || String(review?.source_record_id ?? '')
                    }
                    onChange={(e) => setSourceRecordId(e.target.value)}
                    disabled={status !== '' && status !== 'DRAFT'}
                  />
                </div>
                {stage === 'estimate_quote' && (
                  <div>
                    <Label>Estimate/version identifier</Label>
                    <Input
                      value={secondarySourceId}
                      onChange={(e) => setSecondarySourceId(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <Label>Effectivity / contract basis</Label>
                  <Input
                    value={effectivityReference}
                    onChange={(e) => setEffectivityReference(e.target.value)}
                  />
                </div>
              </section>
              <section className="grid gap-3 md:grid-cols-3">
                <label>
                  <input
                    type="checkbox"
                    checked={sufficientlyDefined}
                    onChange={(e) => setSufficientlyDefined(e.target.checked)}
                  />{' '}
                  Requirements sufficiently defined
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={differencesResolved}
                    onChange={(e) => setDifferencesResolved(e.target.checked)}
                  />{' '}
                  Differences resolved
                </label>
                {stage === 'contract_review' && (
                  <label>
                    <input
                      type="checkbox"
                      checked={financeRequired}
                      onChange={(e) => setFinanceRequired(e.target.checked)}
                    />{' '}
                    Finance approval required
                  </label>
                )}
              </section>
              <section className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Differences and resolutions (JSON)</Label>
                  <Textarea
                    rows={7}
                    value={differences}
                    onChange={(e) => setDifferences(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Risks, owners and controls (JSON)</Label>
                  <Textarea
                    rows={7}
                    value={risks}
                    onChange={(e) => setRisks(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Open information requests (JSON)</Label>
                  <Textarea
                    rows={7}
                    value={informationRequests}
                    onChange={(e) => setInformationRequests(e.target.value)}
                  />
                </div>
              </section>
              <section>
                <h4 className="font-medium">Readiness and downstream impact</h4>
                {data?.readiness.blockers.length ? (
                  <ul className="list-disc pl-5 text-red-700">
                    {data.readiness.blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-green-700">
                    Current review basis is ready.
                  </p>
                )}
                <p className="text-muted-foreground">
                  An invalid or stale approved commercial basis blocks Design
                  Applicability, Production Planning and WAD Authorization
                  without rewriting released history.
                </p>
              </section>
              {review && (
                <section className="grid gap-3 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium">Requirements baseline</h4>
                    <pre className="max-h-52 overflow-auto rounded bg-muted p-2 text-xs">
                      {json(review.requirements_snapshot)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-medium">
                      Authoritative source snapshot
                    </h4>
                    <pre className="max-h-52 overflow-auto rounded bg-muted p-2 text-xs">
                      {json(review.source_snapshot)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-medium">Assumptions</h4>
                    <pre className="rounded bg-muted p-2 text-xs">
                      {json(review.assumptions)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-medium">Exclusions</h4>
                    <pre className="rounded bg-muted p-2 text-xs">
                      {json(review.exclusions)}
                    </pre>
                  </div>
                </section>
              )}
              <section>
                <h4 className="font-medium">Required functional approvals</h4>
                <p>
                  {data?.requiredApprovals.join(', ') ||
                    'Determined when the draft is created.'}
                </p>
                <ul>
                  {data?.approvals.map((approval) => (
                    <li key={approval.id}>
                      {approval.approval_type}: {approval.decision} —{' '}
                      {approval.actor_display_name}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h4 className="font-medium">Immutable revision history</h4>
                <ul>
                  {data?.history.map((item) => (
                    <li key={item.id}>
                      Revision {item.revision_number}: {item.status} —{' '}
                      {item.source_record_type} {item.source_record_id}
                    </li>
                  ))}
                </ul>
              </section>
              <div className="flex flex-wrap gap-2">
                {allowed.has('projects.commercial_review.manage') &&
                  (!status || status === 'DRAFT') && (
                    <Button onClick={save} disabled={mutation.isPending}>
                      {review ? 'Save Draft' : 'Create Draft'}
                    </Button>
                  )}
                {status === 'DRAFT' && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      run(`/${reviewId}/submit`, {
                        expectedRevision: concurrencyToken,
                      })
                    }
                  >
                    Submit
                  </Button>
                )}
                {status === 'PENDING_APPROVAL' &&
                  data?.requiredApprovals.map((role) => {
                    const capacity =
                      role === 'PROJECT_MANAGEMENT' ? 'pm' : role.toLowerCase();
                    const capability = `projects.commercial_review.${capacity}_decide`;
                    return allowed.has(capability) ? (
                      <span key={role} className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => decide(capacity, 'APPROVED')}
                        >
                          Approve {role}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => decide(capacity, 'REJECTED')}
                        >
                          Reject
                        </Button>
                      </span>
                    ) : null;
                  })}
                {status === 'PENDING_APPROVAL' &&
                  allowed.has('projects.commercial_review.manage') && (
                    <Button
                      onClick={() =>
                        run(`/${reviewId}/complete`, {
                          expectedRevision: concurrencyToken,
                        })
                      }
                    >
                      Complete Stage
                    </Button>
                  )}
                {reviewId &&
                  status !== 'DRAFT' &&
                  allowed.has('projects.commercial_review.manage') && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        try {
                          run(`/${reviewId}/revise`, {
                            ...draftBody(),
                            expectedRevision: concurrencyToken,
                          });
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : 'Invalid review input.'
                          );
                        }
                      }}
                    >
                      Create New Revision
                    </Button>
                  )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
