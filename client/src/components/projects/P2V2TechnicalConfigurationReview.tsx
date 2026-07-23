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

// The additive API deliberately carries revision snapshots as JSON.
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
const endpoint = (projectId: string) =>
  `/api/projects/${projectId}/workflow-v2/technical-configuration-review`;
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
const pretty = (value: unknown) => JSON.stringify(value ?? [], null, 2);
const parseArray = (value: string, label: string) => {
  const parsed = JSON.parse(value || '[]');
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  return parsed;
};

const baselineFields = [
  [
    'partRequirements',
    'Part, quantity, drawing and specification requirements',
  ],
  ['configurationReferences', 'Configuration and BOM references'],
  ['qualityClauses', 'Customer-specific quality clauses'],
  ['specialRequirements', 'Special requirements'],
  ['keyCharacteristics', 'Key characteristics'],
  ['criticalItems', 'Critical items and product-safety controls'],
  ['materialRequirements', 'Material requirements'],
  ['certificationRequirements', 'Certification requirements'],
  ['testReportRequirements', 'Test-report requirements'],
  ['faiRequirements', 'FAI requirements'],
  ['sourceInspectionRequirements', 'Source-inspection requirements'],
  ['specialProcesses', 'Special processes and approved sources'],
  ['traceabilityRequirements', 'Traceability requirements'],
  ['preservationPackagingRequirements', 'Preservation and packaging'],
  ['acceptanceCriteria', 'Acceptance criteria'],
  ['counterfeitPreventionRequirements', 'Counterfeit-part prevention'],
  ['customerProperty', 'Customer-furnished property'],
  ['regulatoryRequirements', 'Regulatory and statutory requirements'],
  ['deviationsWaivers', 'Approved deviations, waivers and concessions'],
] as const;

export default function P2V2TechnicalConfigurationReview({
  projectId,
}: {
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [effectivityReference, setEffectivityReference] = useState('');
  const [sufficientlyDefined, setSufficientlyDefined] = useState(false);
  const [supplyChainRequired, setSupplyChainRequired] = useState(false);
  const [baseline, setBaseline] = useState<Record<string, string>>(
    Object.fromEntries(baselineFields.map(([key]) => [key, '[]']))
  );
  const [releasedEvidence, setReleasedEvidence] = useState('[]');
  const [conflicts, setConflicts] = useState('[]');
  const [missingInformation, setMissingInformation] = useState('[]');
  const [risks, setRisks] = useState('[]');
  const [error, setError] = useState('');
  const client = useQueryClient();
  const key = [
    '/api/projects',
    projectId,
    'workflow-v2',
    'technical-configuration-review',
  ];
  const { data, isLoading } = useQuery<Model>({
    queryKey: key,
    queryFn: () => request(endpoint(projectId)),
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
  const token = Number(review?.lock_version ?? revision);
  const status = String(review?.status ?? '');

  useEffect(() => {
    if (!review) return;
    setEffectivityReference(String(review.effectivity_reference ?? ''));
    setSufficientlyDefined(Boolean(review.sufficiently_defined));
    setSupplyChainRequired(Boolean(review.supply_chain_required));
    setBaseline(
      Object.fromEntries(
        baselineFields.map(([field]) => [
          field,
          pretty(review.technical_baseline?.[field]),
        ])
      )
    );
    setReleasedEvidence(pretty(review.released_evidence));
    setConflicts(pretty(review.conflicts));
    setMissingInformation(pretty(review.missing_information));
    setRisks(pretty(review.risks));
  }, [review]);

  const body = () => ({
    technicalBaseline: Object.fromEntries(
      baselineFields.map(([field, label]) => [
        field,
        parseArray(baseline[field], label),
      ])
    ),
    releasedEvidence: parseArray(releasedEvidence, 'Released evidence'),
    conflicts: parseArray(conflicts, 'Conflicts'),
    missingInformation: parseArray(missingInformation, 'Missing information'),
    risks: parseArray(risks, 'Risks'),
    sufficientlyDefined,
    supplyChainRequired,
    effectivityReference,
  });
  const run = (suffix: string, payload: unknown, method = 'POST') =>
    mutation.mutate({
      url: `${endpoint(projectId)}${suffix}`,
      method,
      body: payload,
    });
  const save = () => {
    try {
      const payload = body();
      if (reviewId)
        run(`/${reviewId}`, { ...payload, expectedRevision: token }, 'PATCH');
      else run('', payload);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Invalid review input.'
      );
    }
  };
  const decide = (capacity: string, decision: 'APPROVED' | 'REJECTED') => {
    const signatureMeaning = window.prompt(
      'Signature meaning (required):',
      `I ${decision === 'APPROVED' ? 'confirm' : 'reject'} this manufacturing technical/configuration review revision.`
    );
    if (!signatureMeaning) return;
    const reason =
      window.prompt(
        decision === 'REJECTED' ? 'Reason (required):' : 'Comment:',
        ''
      ) ?? '';
    if (decision === 'REJECTED' && !reason.trim()) return;
    run(`/${reviewId}/${capacity}-decision`, {
      expectedRevision: token,
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
        data-testid="open-technical-configuration-review"
      >
        Open Technical &amp; Configuration Review
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Technical &amp; Configuration Review</DialogTitle>
            <DialogDescription>
              Confirm that the customer PO has a complete, current, approved and
              unambiguous manufacturing and inspection baseline. Referenced
              released engineering evidence is read-only.
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <p>Loading Technical &amp; Configuration Review…</p>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>{status || 'NOT STARTED'}</Badge>
                {review && (
                  <Badge variant="outline">Review revision {revision}</Badge>
                )}
                {data?.readiness.stale && (
                  <Badge variant="destructive">TECHNICAL SOURCE CHANGED</Badge>
                )}
              </div>
              {error && (
                <p className="rounded bg-red-50 p-2 text-red-700">{error}</p>
              )}
              {review && (
                <section className="grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Customer PO</p>
                    <p className="font-medium">
                      {review.source_snapshot?.po?.po_number ?? review.po_id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">PO revision</p>
                    <p className="font-medium">{review.po_revision_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Source revision
                    </p>
                    <p className="break-all font-mono text-xs">
                      {review.source_revision}
                    </p>
                  </div>
                </section>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <Label>Delivery and configuration effectivity</Label>
                  <Input
                    value={effectivityReference}
                    onChange={(event) =>
                      setEffectivityReference(event.target.value)
                    }
                  />
                </div>
                <label className="self-end">
                  <input
                    type="checkbox"
                    checked={sufficientlyDefined}
                    onChange={(event) =>
                      setSufficientlyDefined(event.target.checked)
                    }
                  />{' '}
                  Baseline is complete, approved and unambiguous
                </label>
                <label className="self-end">
                  <input
                    type="checkbox"
                    checked={supplyChainRequired}
                    onChange={(event) =>
                      setSupplyChainRequired(event.target.checked)
                    }
                  />{' '}
                  Supply Chain confirmation required
                </label>
              </div>
              <section className="grid gap-3 md:grid-cols-2">
                {baselineFields.map(([field, label]) => (
                  <div key={field}>
                    <Label>{label} (JSON)</Label>
                    <Textarea
                      rows={field === 'partRequirements' ? 8 : 4}
                      value={baseline[field]}
                      onChange={(event) =>
                        setBaseline((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </section>
              <section className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Released technical evidence (JSON)</Label>
                  <Textarea
                    rows={7}
                    value={releasedEvidence}
                    onChange={(event) =>
                      setReleasedEvidence(event.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Controlled documents, released BOM revisions, and released
                    engineering outputs may be referenced read-only.
                  </p>
                </div>
                <div>
                  <Label>
                    Technical/configuration conflicts and resolutions
                  </Label>
                  <Textarea
                    rows={7}
                    value={conflicts}
                    onChange={(event) => setConflicts(event.target.value)}
                  />
                </div>
                <div>
                  <Label>Missing or obsolete technical information</Label>
                  <Textarea
                    rows={6}
                    value={missingInformation}
                    onChange={(event) =>
                      setMissingInformation(event.target.value)
                    }
                  />
                </div>
                <div>
                  <Label>Manufacturing risks, owners and controls</Label>
                  <Textarea
                    rows={6}
                    value={risks}
                    onChange={(event) => setRisks(event.target.value)}
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
                    The technical/configuration baseline is current and ready.
                  </p>
                )}
                <p className="text-muted-foreground">
                  A stale baseline blocks Production Planning and WAD
                  Authorization. Existing released plans and authorizations are
                  preserved and must be revised through their controlled
                  workflows.
                </p>
              </section>
              <section>
                <h4 className="font-medium">
                  Required functional confirmations
                </h4>
                <p>{data?.requiredApprovals.join(', ')}</p>
                <ul>
                  {data?.approvals.map((approval) => (
                    <li key={approval.id}>
                      {approval.approval_type}: {approval.decision} —{' '}
                      {approval.actor_display_name}
                      {approval.invalidated ? ' (invalidated)' : ''}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h4 className="font-medium">Immutable revision history</h4>
                <ul>
                  {data?.history.map((item) => (
                    <li key={item.id}>
                      Revision {item.revision_number}: {item.status} — PO
                      revision {item.po_revision_number}
                    </li>
                  ))}
                </ul>
              </section>
              <div className="flex flex-wrap gap-2">
                {allowed.has('projects.technical_configuration.manage') &&
                  (!status || status === 'DRAFT') && (
                    <Button onClick={save} disabled={mutation.isPending}>
                      {review ? 'Save Draft' : 'Create Draft'}
                    </Button>
                  )}
                {status === 'DRAFT' && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      run(`/${reviewId}/submit`, { expectedRevision: token })
                    }
                  >
                    Submit for Functional Review
                  </Button>
                )}
                {status === 'PENDING_APPROVAL' &&
                  data?.requiredApprovals.map((role) => {
                    const capacity =
                      role === 'PROJECT_MANAGEMENT'
                        ? 'pm'
                        : role === 'SUPPLY_CHAIN'
                          ? 'supply-chain'
                          : role.toLowerCase();
                    const capability = `projects.technical_configuration.${role === 'PROJECT_MANAGEMENT' ? 'pm' : role.toLowerCase()}_decide`;
                    return allowed.has(capability) ? (
                      <span key={role} className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => decide(capacity, 'APPROVED')}
                        >
                          Confirm {role}
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
                  allowed.has('projects.technical_configuration.manage') && (
                    <Button
                      onClick={() =>
                        run(`/${reviewId}/complete`, {
                          expectedRevision: token,
                        })
                      }
                    >
                      Complete Stage
                    </Button>
                  )}
                {reviewId &&
                  status !== 'DRAFT' &&
                  allowed.has('projects.technical_configuration.manage') && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        try {
                          run(`/${reviewId}/revise`, {
                            ...body(),
                            expectedRevision: token,
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
              <p className="rounded bg-slate-50 p-3 text-xs text-muted-foreground">
                Operational scope: AS9100 8.1, 8.1.2, applicable 8.1.3 and
                8.1.4, 8.2, applicable 8.4, 8.5, and 8.6. Product design and
                development remain exclusively in the separate Design Control
                module.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
