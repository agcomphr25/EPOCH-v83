import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// API rows contain immutable JSON snapshots whose concrete columns vary by record type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type PartRequirement = {
  partNumber: string;
  quantity: number;
  drawingNumber: string;
  drawingRevision: string;
  specifications: unknown[];
  technicalDataException: string;
};
type TechnicalEvidence = {
  recordType: 'CONTROLLED_DOCUMENT' | 'BOM_REVISION' | 'ENGINEERING_RELEASE';
  recordId: string;
  revision: string;
  effectivity: string;
};
type Conflict = { description: string; resolution: string; resolved: boolean };
type TechnicalRisk = { description: string; owner: string; control: string };
type Model = {
  currentSource: {
    po: Row;
    items: Row[];
    configurations: Row[];
    revision: string;
  };
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

const baselineListFields = [
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
type BaselineField = (typeof baselineListFields)[number][0];
type BaselineLists = Record<BaselineField, unknown[]>;

const emptyLists = () =>
  Object.fromEntries(
    baselineListFields.map(([field]) => [field, []])
  ) as unknown as BaselineLists;
const emptyPart = (): PartRequirement => ({
  partNumber: '',
  quantity: 1,
  drawingNumber: '',
  drawingRevision: '',
  specifications: [],
  technicalDataException: '',
});
const listValues = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const displayValue = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value ?? '');
const meaningfulValue = (value: unknown) =>
  typeof value !== 'string' || value.trim().length > 0;
const released = (value: unknown) =>
  value === true || String(value).toLowerCase() === 'true';

function LineListEditor({
  label,
  values,
  onChange,
  testId,
}: {
  label: string;
  values: unknown[];
  onChange: (values: unknown[]) => void;
  testId: string;
}) {
  return (
    <div className="space-y-2 rounded border p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...values, ''])}
        >
          Add item
        </Button>
      </div>
      {values.length === 0 && (
        <p className="text-xs text-muted-foreground">No entries recorded.</p>
      )}
      {values.map((value, index) => (
        <div key={index} className="flex gap-2">
          <Input
            value={displayValue(value)}
            aria-label={`${label} item ${index + 1}`}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Remove ${label} item ${index + 1}`}
            onClick={() =>
              onChange(values.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function P2V2TechnicalConfigurationReview({
  projectId,
}: {
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
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
              Complete the current manufacturing and inspection baseline.
            </DialogDescription>
          </DialogHeader>
          <TechnicalReviewWorkspace projectId={projectId} open={open} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function TechnicalReviewWorkspace({
  projectId,
  open,
}: {
  projectId: string;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = [
    '/api/projects',
    projectId,
    'workflow-v2',
    'technical-configuration-review',
  ];
  const [effectivityReference, setEffectivityReference] = useState('');
  const [sufficientlyDefined, setSufficientlyDefined] = useState(false);
  const [supplyChainRequired, setSupplyChainRequired] = useState(false);
  const [parts, setParts] = useState<PartRequirement[]>([]);
  const [lists, setLists] = useState<BaselineLists>(emptyLists);
  const [evidence, setEvidence] = useState<TechnicalEvidence[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [missingInformation, setMissingInformation] = useState<unknown[]>([]);
  const [risks, setRisks] = useState<TechnicalRisk[]>([]);
  const [internalParts, setInternalParts] = useState<Record<string, string>>(
    {}
  );
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<Model>({
    queryKey,
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
  const review = data?.review;
  const reviewId = String(review?.id ?? '');
  const revision = Number(review?.revision_number ?? 0);
  const token = Number(review?.lock_version ?? revision);
  const status = String(review?.status ?? '');

  const mutation = useMutation({
    mutationFn: (input: { url: string; method?: string; body?: unknown }) =>
      request(input.url, input.method, input.body),
    onSuccess: async () => {
      setError('');
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'workflow-v2'],
      });
    },
    onError: (cause: Error) => setError(cause.message),
  });
  const linkMutation = useMutation({
    mutationFn: ({
      item,
      internalPartNumber,
    }: {
      item: Row;
      internalPartNumber: string;
    }) =>
      request(
        `/api/projects/${projectId}/p2-hub/source-parts/inventory-item`,
        'POST',
        {
          poItemId: Number(item.id),
          partNumber: String(item.part_number),
          partName: String(item.part_name ?? item.part_number),
          internalPartNumber: internalPartNumber.trim(),
          manufacturedCategory: item.manufactured_category || 'COMPONENT',
        }
      ),
    onSuccess: async (_result, input) => {
      setError('');
      setNotice(
        `${input.item.part_number} is linked to internal AG part ${input.internalPartNumber.trim()}. Use Load current PO / internal parts to refresh the editable rows.`
      );
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'p2-hub'],
      });
    },
    onError: (cause: Error) => setError(cause.message),
  });

  useEffect(() => {
    if (!review) return;
    setEffectivityReference(String(review.effectivity_reference ?? ''));
    setSufficientlyDefined(Boolean(review.sufficiently_defined));
    setSupplyChainRequired(Boolean(review.supply_chain_required));
    setParts(
      (Array.isArray(review.technical_baseline?.partRequirements)
        ? review.technical_baseline.partRequirements
        : []
      ).map((item: Row) => ({
        partNumber: String(item.partNumber ?? ''),
        quantity: Number(item.quantity ?? 1),
        drawingNumber: String(item.drawingNumber ?? ''),
        drawingRevision: String(item.drawingRevision ?? ''),
        specifications: listValues(item.specifications),
        technicalDataException: String(item.technicalDataException ?? ''),
      }))
    );
    setLists(
      Object.fromEntries(
        baselineListFields.map(([field]) => [
          field,
          listValues(review.technical_baseline?.[field]),
        ])
      ) as BaselineLists
    );
    setEvidence(
      (Array.isArray(review.released_evidence)
        ? review.released_evidence
        : []
      ).map((item: Row) => ({
        recordType: item.recordType ?? 'CONTROLLED_DOCUMENT',
        recordId: String(item.recordId ?? ''),
        revision: String(item.revision ?? item.authoritativeRevision ?? ''),
        effectivity: String(item.effectivity ?? ''),
      }))
    );
    setConflicts(
      (Array.isArray(review.conflicts) ? review.conflicts : []).map(
        (item: Row) => ({
          description: String(item.description ?? ''),
          resolution: String(item.resolution ?? ''),
          resolved: Boolean(item.resolved),
        })
      )
    );
    setMissingInformation(listValues(review.missing_information));
    setRisks(
      (Array.isArray(review.risks) ? review.risks : []).map((item: Row) => ({
        description: String(item.description ?? ''),
        owner: String(item.owner ?? ''),
        control: String(item.control ?? ''),
      }))
    );
  }, [review]);

  useEffect(() => {
    if (!data?.currentSource) return;
    setInternalParts((current) => {
      const next = { ...current };
      for (const item of data.currentSource.items) {
        if (!(String(item.id) in next))
          next[String(item.id)] = String(item.ag_part_number ?? '');
      }
      return next;
    });
  }, [data?.currentSource]);

  const updatePart = (index: number, patch: Partial<PartRequirement>) =>
    setParts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );

  const loadCurrentSource = () => {
    const source = data?.currentSource;
    if (!source) return;
    const prior = new Map(parts.map((part) => [part.partNumber.trim(), part]));
    const loaded = new Map<string, PartRequirement>();
    for (const item of source.items) {
      const partNumber = String(
        item.ag_part_number ?? item.part_number ?? ''
      ).trim();
      if (!partNumber) continue;
      const previous = prior.get(partNumber);
      const next = loaded.get(partNumber) ?? {
        ...(previous ?? emptyPart()),
        partNumber,
        quantity: 0,
        specifications: [...(previous?.specifications ?? [])],
      };
      next.quantity += Number(item.quantity ?? 0);
      const specification = String(item.specifications ?? '').trim();
      if (specification && !next.specifications.includes(specification))
        next.specifications.push(specification);
      loaded.set(partNumber, next);
    }
    setParts(Array.from(loaded.values()));
    setLists((current) => ({
      ...current,
      configurationReferences: source.configurations.map((configuration) =>
        configuration.bom_id
          ? `${configuration.part_number}: Robust BOM ${configuration.bom_id}, revision ${configuration.bom_revision ?? 'not assigned'} (${released(configuration.bom_is_released) ? 'released' : 'not released'})`
          : `${configuration.part_number}: no active Robust BOM linked`
      ),
    }));
    const bomEvidence = source.configurations
      .filter(
        (configuration) =>
          configuration.bom_revision_id &&
          released(configuration.bom_is_released)
      )
      .map((configuration): TechnicalEvidence => ({
        recordType: 'BOM_REVISION',
        recordId: String(configuration.bom_revision_id),
        revision: String(configuration.bom_revision ?? ''),
        effectivity: effectivityReference,
      }));
    setEvidence((current) => {
      const combined = new Map(
        [...current, ...bomEvidence].map((item) => [
          `${item.recordType}:${item.recordId}`,
          item,
        ])
      );
      return Array.from(combined.values());
    });
    if (!effectivityReference.trim()) {
      const po = source.po.po_number ?? source.po.id;
      const poRevision = source.po.revision_number;
      setEffectivityReference(
        `Customer PO ${po}${poRevision ? ` revision ${poRevision}` : ''}`
      );
    }
    setNotice(
      `Loaded ${loaded.size} current part row${loaded.size === 1 ? '' : 's'}. Review status and approvals were not copied or changed.`
    );
  };

  const payload = () => {
    if (!effectivityReference.trim())
      throw new Error('Delivery and configuration effectivity is required.');
    const partRequirements = parts.map((part, index) => {
      if (!part.partNumber.trim())
        throw new Error(`Part row ${index + 1} needs a part number.`);
      if (!Number.isFinite(part.quantity) || part.quantity <= 0)
        throw new Error(`${part.partNumber} needs a positive quantity.`);
      return {
        ...part,
        partNumber: part.partNumber.trim(),
        specifications: part.specifications.filter(meaningfulValue),
      };
    });
    for (const [index, item] of evidence.entries())
      if (!item.recordId.trim())
        throw new Error(`Evidence row ${index + 1} needs a record ID.`);
    for (const [index, item] of conflicts.entries())
      if (!item.description.trim())
        throw new Error(`Conflict row ${index + 1} needs a description.`);
    for (const [index, item] of risks.entries()) {
      if (
        !item.description.trim() ||
        !item.owner.trim() ||
        !item.control.trim()
      )
        throw new Error(
          `Risk row ${index + 1} needs a risk, owner, and control.`
        );
    }
    return {
      technicalBaseline: {
        partRequirements,
        ...Object.fromEntries(
          baselineListFields.map(([field]) => [
            field,
            lists[field].filter(meaningfulValue),
          ])
        ),
      },
      releasedEvidence: evidence.map((item) => ({
        ...item,
        revision: item.revision || undefined,
        effectivity: item.effectivity || undefined,
      })),
      conflicts,
      missingInformation: missingInformation.filter(meaningfulValue),
      risks,
      sufficientlyDefined,
      supplyChainRequired,
      effectivityReference: effectivityReference.trim(),
    };
  };

  const run = (suffix: string, body: unknown, method = 'POST') =>
    mutation.mutate({ url: `${endpoint(projectId)}${suffix}`, method, body });
  const save = () => {
    try {
      const body = payload();
      if (reviewId)
        run(`/${reviewId}`, { ...body, expectedRevision: token }, 'PATCH');
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
      `I ${decision === 'APPROVED' ? 'confirm' : 'reject'} this review revision.`
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

  if (isLoading)
    return (
      <p data-testid="technical-review-workspace">
        Loading Technical &amp; Configuration Review…
      </p>
    );
  if (queryError)
    return (
      <p className="rounded bg-red-50 p-3 text-red-700" role="alert">
        {queryError instanceof Error
          ? queryError.message
          : 'Unable to load the technical/configuration review.'}
      </p>
    );
  return (
    <div className="space-y-5 text-sm" data-testid="technical-review-workspace">
      <div className="flex flex-wrap gap-2">
        <Badge>{status || 'NOT STARTED'}</Badge>
        {review && <Badge variant="outline">Review revision {revision}</Badge>}
        {data?.readiness.stale && (
          <Badge variant="destructive">TECHNICAL SOURCE CHANGED</Badge>
        )}
      </div>
      {error && <p className="rounded bg-red-50 p-2 text-red-700">{error}</p>}
      {notice && (
        <p
          className="rounded bg-blue-50 p-2 text-blue-800"
          data-testid="technical-source-notice"
        >
          {notice}
        </p>
      )}

      <section
        className="space-y-3 rounded border p-4"
        data-testid="technical-current-source"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-medium">Current PO and internal parts</h4>
            <p className="text-xs text-muted-foreground">
              Load copies current source facts into the draft. It never copies
              review status or approvals.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={loadCurrentSource}
            disabled={!data?.currentSource}
            data-testid="load-current-technical-source"
          >
            Load current PO / internal parts
          </Button>
        </div>
        {data?.currentSource ? (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <p>
                <span className="text-xs text-muted-foreground">
                  Customer PO
                </span>
                <br />
                <strong>
                  {data.currentSource.po.po_number ?? data.currentSource.po.id}
                </strong>
              </p>
              <p>
                <span className="text-xs text-muted-foreground">
                  PO revision
                </span>
                <br />
                <strong>
                  {data.currentSource.po.revision_number ?? 'Not recorded'}
                </strong>
              </p>
              <p className="break-all font-mono text-xs">
                <span className="font-sans text-muted-foreground">
                  Current source revision
                </span>
                <br />
                {data.currentSource.revision}
              </p>
            </div>
            <div className="space-y-2">
              {data.currentSource.items.map((item) => {
                const itemId = String(item.id);
                const configuration = data.currentSource.configurations.find(
                  (entry) => Number(entry.po_item_id) === Number(item.id)
                );
                return (
                  <div
                    key={itemId}
                    className="grid gap-2 rounded bg-slate-50 p-3 lg:grid-cols-[1.2fr_.4fr_.8fr_1.2fr_auto] lg:items-end"
                    data-testid={`technical-source-part-${itemId}`}
                  >
                    <p>
                      <span className="text-xs text-muted-foreground">
                        PO source part
                      </span>
                      <br />
                      <strong>{item.part_number}</strong>
                      <br />
                      {item.part_name}
                    </p>
                    <p>
                      <span className="text-xs text-muted-foreground">Qty</span>
                      <br />
                      {item.quantity}
                    </p>
                    <p>
                      <span className="text-xs text-muted-foreground">
                        Linked AG part
                      </span>
                      <br />
                      <strong>{item.ag_part_number ?? 'Not linked'}</strong>
                    </p>
                    <div>
                      <Label htmlFor={`technical-internal-part-${itemId}`}>
                        Exact internal AG part #
                      </Label>
                      <Input
                        id={`technical-internal-part-${itemId}`}
                        value={internalParts[itemId] ?? ''}
                        onChange={(event) =>
                          setInternalParts((current) => ({
                            ...current,
                            [itemId]: event.target.value,
                          }))
                        }
                        placeholder="Enter exact AG part #"
                        className="font-mono"
                        data-testid={`technical-internal-part-${itemId}`}
                      />
                      <p className="text-xs text-muted-foreground">
                        {configuration?.bom_revision_id
                          ? `BOM Rev ${configuration.bom_revision ?? 'unknown'} · ${released(configuration.bom_is_released) ? 'released' : 'not released'}`
                          : 'No Robust BOM revision linked'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        !allowed.has(
                          'projects.technical_configuration.manage'
                        ) ||
                        !internalParts[itemId]?.trim() ||
                        linkMutation.isPending
                      }
                      onClick={() =>
                        linkMutation.mutate({
                          item,
                          internalPartNumber: internalParts[itemId],
                        })
                      }
                      data-testid={`link-technical-internal-part-${itemId}`}
                    >
                      Link AG part
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">
            Current PO source data is unavailable.
          </p>
        )}
      </section>

      {review && (
        <section className="grid gap-3 md:grid-cols-3">
          <p>
            <span className="text-xs text-muted-foreground">
              Captured customer PO
            </span>
            <br />
            <strong>
              {review.source_snapshot?.po?.po_number ?? review.po_id}
            </strong>
          </p>
          <p>
            <span className="text-xs text-muted-foreground">
              Captured PO revision
            </span>
            <br />
            <strong>{review.po_revision_number}</strong>
          </p>
          <p className="break-all font-mono text-xs">
            <span className="font-sans text-muted-foreground">
              Captured source revision
            </span>
            <br />
            {review.source_revision}
          </p>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Delivery and configuration effectivity</Label>
          <Input
            value={effectivityReference}
            onChange={(event) => setEffectivityReference(event.target.value)}
          />
        </div>
        <label className="self-end">
          <input
            type="checkbox"
            checked={sufficientlyDefined}
            onChange={(event) => setSufficientlyDefined(event.target.checked)}
          />{' '}
          Baseline is complete, approved and unambiguous
        </label>
        <label className="self-end">
          <input
            type="checkbox"
            checked={supplyChainRequired}
            onChange={(event) => setSupplyChainRequired(event.target.checked)}
          />{' '}
          Supply Chain confirmation required
        </label>
      </div>

      <section className="space-y-3" data-testid="part-requirements-editor">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="font-medium">
              Part, drawing and specification requirements
            </h4>
            <p className="text-xs text-muted-foreground">
              Use one row per internal/source part.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setParts((current) => [...current, emptyPart()])}
            data-testid="add-technical-part-requirement"
          >
            Add part
          </Button>
        </div>
        {parts.length === 0 && (
          <p className="rounded border border-dashed p-3 text-muted-foreground">
            No parts loaded. Load the current PO or add a row.
          </p>
        )}
        {parts.map((part, index) => (
          <div key={index} className="space-y-3 rounded border p-3">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <Label>Part number</Label>
                <Input
                  value={part.partNumber}
                  onChange={(event) =>
                    updatePart(index, { partNumber: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0.000001"
                  step="any"
                  value={part.quantity}
                  onChange={(event) =>
                    updatePart(index, { quantity: Number(event.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Drawing number</Label>
                <Input
                  value={part.drawingNumber}
                  onChange={(event) =>
                    updatePart(index, { drawingNumber: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Drawing revision</Label>
                <Input
                  value={part.drawingRevision}
                  onChange={(event) =>
                    updatePart(index, { drawingRevision: event.target.value })
                  }
                />
              </div>
            </div>
            <LineListEditor
              label="Specifications"
              values={part.specifications}
              onChange={(values) =>
                updatePart(index, { specifications: values })
              }
              testId={`part-${index}-specifications`}
            />
            <div>
              <Label>Approved technical-data exception</Label>
              <Textarea
                rows={2}
                value={part.technicalDataException}
                onChange={(event) =>
                  updatePart(index, {
                    technicalDataException: event.target.value,
                  })
                }
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setParts((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index)
                )
              }
            >
              Remove part
            </Button>
          </div>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {baselineListFields.map(([field, label]) => (
          <LineListEditor
            key={field}
            label={label}
            values={lists[field]}
            onChange={(values) =>
              setLists((current) => ({ ...current, [field]: values }))
            }
            testId={`technical-${field}`}
          />
        ))}
      </section>

      <TechnicalReviewRemainingFields
        evidence={evidence}
        setEvidence={setEvidence}
        conflicts={conflicts}
        setConflicts={setConflicts}
        missingInformation={missingInformation}
        setMissingInformation={setMissingInformation}
        risks={risks}
        setRisks={setRisks}
      />

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
      </section>
      <section>
        <h4 className="font-medium">Required functional confirmations</h4>
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
              Revision {item.revision_number}: {item.status} — PO revision{' '}
              {item.po_revision_number}
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
                <Button size="sm" onClick={() => decide(capacity, 'APPROVED')}>
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
                run(`/${reviewId}/complete`, { expectedRevision: token })
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
                    ...payload(),
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
    </div>
  );
}

function TechnicalReviewRemainingFields({
  evidence,
  setEvidence,
  conflicts,
  setConflicts,
  missingInformation,
  setMissingInformation,
  risks,
  setRisks,
}: {
  evidence: TechnicalEvidence[];
  setEvidence: Dispatch<SetStateAction<TechnicalEvidence[]>>;
  conflicts: Conflict[];
  setConflicts: Dispatch<SetStateAction<Conflict[]>>;
  missingInformation: unknown[];
  setMissingInformation: Dispatch<SetStateAction<unknown[]>>;
  risks: TechnicalRisk[];
  setRisks: Dispatch<SetStateAction<TechnicalRisk[]>>;
}) {
  return (
    <>
      <section
        className="space-y-3 rounded border p-3"
        data-testid="technical-evidence-editor"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <Label>Released technical evidence</Label>
            <p className="text-xs text-muted-foreground">
              Evidence is revalidated and snapshotted by the server when the
              draft is saved.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setEvidence((current) => [
                ...current,
                {
                  recordType: 'CONTROLLED_DOCUMENT',
                  recordId: '',
                  revision: '',
                  effectivity: '',
                },
              ])
            }
          >
            Add evidence
          </Button>
        </div>
        {evidence.map((item, index) => (
          <div
            key={index}
            className="grid gap-2 rounded bg-slate-50 p-3 md:grid-cols-4"
          >
            <div>
              <Label>Record type</Label>
              <Select
                value={item.recordType}
                onValueChange={(recordType: TechnicalEvidence['recordType']) =>
                  setEvidence((current) =>
                    current.map((entry, itemIndex) =>
                      itemIndex === index ? { ...entry, recordType } : entry
                    )
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONTROLLED_DOCUMENT">
                    Controlled document
                  </SelectItem>
                  <SelectItem value="BOM_REVISION">BOM revision</SelectItem>
                  <SelectItem value="ENGINEERING_RELEASE">
                    Engineering release
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(['recordId', 'revision', 'effectivity'] as const).map((field) => (
              <div key={field}>
                <Label>
                  {field === 'recordId'
                    ? 'Record ID / document number'
                    : field === 'revision'
                      ? 'Revision'
                      : 'Effectivity'}
                </Label>
                <Input
                  value={item[field]}
                  onChange={(event) =>
                    setEvidence((current) =>
                      current.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, [field]: event.target.value }
                          : entry
                      )
                    )
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="md:col-span-4 md:justify-self-start"
              onClick={() =>
                setEvidence((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index)
                )
              }
            >
              Remove evidence
            </Button>
          </div>
        ))}
      </section>

      <section
        className="space-y-3 rounded border p-3"
        data-testid="technical-conflicts-editor"
      >
        <div className="flex items-center justify-between gap-2">
          <Label>Technical/configuration conflicts and resolutions</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setConflicts((current) => [
                ...current,
                { description: '', resolution: '', resolved: false },
              ])
            }
          >
            Add conflict
          </Button>
        </div>
        {conflicts.map((item, index) => (
          <div
            key={index}
            className="grid gap-2 rounded bg-slate-50 p-3 md:grid-cols-2"
          >
            <div>
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={item.description}
                onChange={(event) =>
                  setConflicts((current) =>
                    current.map((entry, itemIndex) =>
                      itemIndex === index
                        ? { ...entry, description: event.target.value }
                        : entry
                    )
                  )
                }
              />
            </div>
            <div>
              <Label>Resolution</Label>
              <Textarea
                rows={2}
                value={item.resolution}
                onChange={(event) =>
                  setConflicts((current) =>
                    current.map((entry, itemIndex) =>
                      itemIndex === index
                        ? { ...entry, resolution: event.target.value }
                        : entry
                    )
                  )
                }
              />
            </div>
            <label>
              <input
                type="checkbox"
                checked={item.resolved}
                onChange={(event) =>
                  setConflicts((current) =>
                    current.map((entry, itemIndex) =>
                      itemIndex === index
                        ? { ...entry, resolved: event.target.checked }
                        : entry
                    )
                  )
                }
              />{' '}
              Resolution verified
            </label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="justify-self-start"
              onClick={() =>
                setConflicts((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index)
                )
              }
            >
              Remove conflict
            </Button>
          </div>
        ))}
      </section>

      <LineListEditor
        label="Missing or obsolete technical information"
        values={missingInformation}
        onChange={setMissingInformation}
        testId="technical-missing-information"
      />

      <section
        className="space-y-3 rounded border p-3"
        data-testid="technical-risks-editor"
      >
        <div className="flex items-center justify-between gap-2">
          <Label>Manufacturing risks, owners and controls</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setRisks((current) => [
                ...current,
                { description: '', owner: '', control: '' },
              ])
            }
          >
            Add risk
          </Button>
        </div>
        {risks.map((item, index) => (
          <div
            key={index}
            className="grid gap-2 rounded bg-slate-50 p-3 md:grid-cols-3"
          >
            {(['description', 'owner', 'control'] as const).map((field) => (
              <div key={field}>
                <Label>
                  {field === 'description'
                    ? 'Risk'
                    : field === 'owner'
                      ? 'Owner'
                      : 'Control'}
                </Label>
                <Input
                  value={item[field]}
                  onChange={(event) =>
                    setRisks((current) =>
                      current.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, [field]: event.target.value }
                          : entry
                      )
                    )
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="md:col-span-3 md:justify-self-start"
              onClick={() =>
                setRisks((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index)
                )
              }
            >
              Remove risk
            </Button>
          </div>
        ))}
      </section>
    </>
  );
}
