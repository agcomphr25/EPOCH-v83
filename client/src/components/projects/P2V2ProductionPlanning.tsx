import { useMemo, useState, type ReactNode } from 'react';
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

type Row = Record<string, unknown>;
type Model = {
  plan: Row | null;
  items: Row[];
  history: Row[];
  approvalHistory: Row[];
  readiness: {
    ready: boolean;
    blockers: string[];
    stale: boolean;
    differences: string[];
  };
};
const endpoint = (projectId: string) =>
  `/api/projects/${projectId}/workflow-v2/production-planning`;
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
const value = (row: Row, key: string) => String(row[key] ?? '');
const listValue = (row: Row, key: string) =>
  Array.isArray(row[key]) ? (row[key] as unknown[]).join(', ') : '';
const selectOptions = (values: string[]) =>
  values.map((item) => (
    <SelectItem key={item} value={item}>
      {item.replaceAll('_', ' ')}
    </SelectItem>
  ));

const wizardPages = [
  'Confirm the Order',
  'Review Parts and Assemblies',
  'Review How Each Part Is Made',
  'Check Materials',
  'Check Tooling and Resources',
  'Check Quality Requirements',
  'Review Controlled Documents',
  'Check Schedule and Capacity',
  'Preview Production Demand',
  'Review and Approve',
] as const;

export default function P2V2ProductionPlanning({
  projectId,
}: {
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [header, setHeader] = useState({
    requirementSource: 'Customer PO and released engineering configuration',
    planningBasis:
      'Current PO revision, manufactured assembly tree, released BOMs and approved production controls',
    effectivityReference: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const client = useQueryClient();
  const key = [
    '/api/projects',
    projectId,
    'workflow-v2',
    'production-planning',
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
  const canManage = allowed.has('projects.production_planning.manage');
  const mutation = useMutation({
    mutationFn: ({
      url,
      method,
      body,
    }: {
      url: string;
      method?: string;
      body?: unknown;
    }) => request(url, method, body),
    onSuccess: async () => {
      setError('');
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'workflow-v2'],
      });
    },
    onError: (cause: Error) => setError(cause.message),
  });
  const planId = value(data?.plan ?? {}, 'id');
  const status = value(data?.plan ?? {}, 'status');
  const act = (suffix: string, method = 'POST', body?: unknown) =>
    mutation.mutate({
      url: `${endpoint(projectId)}/${planId}${suffix}`,
      method,
      body,
    });
  const decide = (capacity: string, decision: 'APPROVED' | 'REJECTED') => {
    const signatureMeaning = window.prompt(
      'Signature meaning (required):',
      `I ${decision === 'APPROVED' ? 'approve' : 'return'} this ${capacity} production-plan revision.`
    );
    if (!signatureMeaning) return;
    const reason =
      window.prompt(
        decision === 'APPROVED' ? 'Comments (optional):' : 'Reason (required):',
        ''
      ) ?? '';
    if (decision !== 'APPROVED' && !reason.trim()) return;
    act(`/${capacity}-decision`, 'POST', {
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
        data-testid="open-production-planning"
      >
        Open Production Planning
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[92vh] max-w-6xl overflow-y-auto"
          data-testid="production-planning-dialog"
        >
          <DialogHeader>
            <DialogTitle>Production Planning</DialogTitle>
            <DialogDescription>
              Revision-controlled manufacturing configuration baseline. This
              stage does not generate production orders, travelers, or WAD
              records.
            </DialogDescription>
          </DialogHeader>
          <section
            className="space-y-3 rounded border bg-muted/30 p-4"
            aria-label="Production Planning progress"
            data-testid="production-planning-progress"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  Page {currentPage + 1} of {wizardPages.length}
                </p>
                <h2 className="text-lg font-semibold">
                  {wizardPages[currentPage]}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">
                  {data?.plan ? 'Plan started' : 'Information Missing'}
                </Badge>
                <Badge variant="outline">
                  {data?.readiness.blockers.length ?? 0} blockers
                </Badge>
                {data?.readiness.stale && (
                  <Badge variant="destructive">Source Changed</Badge>
                )}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1 md:grid-cols-10">
              {wizardPages.map((page, index) => (
                <button
                  key={page}
                  type="button"
                  aria-label={`Page ${index + 1}: ${page}`}
                  aria-current={index === currentPage ? 'step' : undefined}
                  className={`h-2 rounded-full ${
                    index <= currentPage ? 'bg-primary' : 'bg-muted'
                  }`}
                  onClick={() => setCurrentPage(index)}
                />
              ))}
            </div>
          </section>
          {isLoading ? (
            <p>Loading production plan…</p>
          ) : (
            <div className="space-y-6">
              {data?.plan ? (
                <section className="grid gap-3 rounded border p-4 md:grid-cols-4">
                  <div>
                    <span className="text-xs text-muted-foreground">
                      Plan revision
                    </span>
                    <p>Rev {value(data.plan, 'revision_number')}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">
                      Status
                    </span>
                    <div className="mt-1">
                      <Badge>{status}</Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">
                      PO baseline
                    </span>
                    <p>
                      {value(data.plan, 'po_number')} Rev{' '}
                      {value(data.plan, 'po_revision_number')}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">
                      Effectivity
                    </span>
                    <p>{value(data.plan, 'effectivity_reference')}</p>
                  </div>
                </section>
              ) : (
                <section className="grid gap-3 rounded border p-4 md:grid-cols-2">
                  <div>
                    <Label>Requirement source</Label>
                    <Input
                      value={header.requirementSource}
                      onChange={(event) =>
                        setHeader({
                          ...header,
                          requirementSource: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Effectivity override</Label>
                    <Input
                      value={header.effectivityReference}
                      onChange={(event) =>
                        setHeader({
                          ...header,
                          effectivityReference: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Planning basis</Label>
                    <Textarea
                      value={header.planningBasis}
                      onChange={(event) =>
                        setHeader({
                          ...header,
                          planningBasis: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={header.notes}
                      onChange={(event) =>
                        setHeader({ ...header, notes: event.target.value })
                      }
                    />
                  </div>
                  {canManage && (
                    <Button
                      onClick={() =>
                        mutation.mutate({
                          url: endpoint(projectId),
                          method: 'POST',
                          body: header,
                        })
                      }
                    >
                      Build Draft From Current Configuration
                    </Button>
                  )}
                </section>
              )}
              {data?.readiness.stale && (
                <section
                  className="rounded border border-red-300 bg-red-50 p-3"
                  data-testid="production-plan-stale"
                >
                  <h3 className="font-semibold text-red-800">
                    Released baseline is stale
                  </h3>
                  <ul className="list-disc pl-5 text-sm text-red-700">
                    {data.readiness.differences.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
              {!!data?.readiness.blockers.length && (
                <section className="rounded border border-amber-300 bg-amber-50 p-3">
                  <h3 className="font-semibold">Readiness blockers</h3>
                  <ul className="max-h-52 list-disc overflow-y-auto pl-5 text-sm">
                    {data.readiness.blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
              {!!data?.items.length && (
                <>
                  <section>
                    <h3 className="font-semibold">Assembly tree</h3>
                    <div className="mt-2 space-y-1 rounded border p-3">
                      {data.items.map((item) => (
                        <div
                          key={value(item, 'id')}
                          style={{
                            paddingLeft: `${Math.max(0, value(item, 'assembly_path').split('/').length - 1) * 18}px`,
                          }}
                          className="text-sm"
                        >
                          <Badge
                            variant={
                              item.is_manufactured ? 'default' : 'outline'
                            }
                          >
                            {item.is_manufactured ? 'MAKE' : 'BUY'}
                          </Badge>{' '}
                          <strong>{value(item, 'part_number')}</strong>{' '}
                          {value(item, 'part_name')} · Qty{' '}
                          {value(item, 'extended_project_quantity')} · BOM{' '}
                          {value(item, 'bom_revision') || 'missing'} · Routing{' '}
                          {value(item, 'routing_revision') || 'missing'}
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="space-y-3">
                    <h3 className="font-semibold">
                      Manufactured-item planning
                    </h3>
                    {data.items
                      .filter((item) => item.is_manufactured)
                      .map((item) => (
                        <PlanningItem
                          key={value(item, 'id')}
                          item={item}
                          editable={status === 'DRAFT' && canManage}
                          saving={mutation.isPending}
                          onSave={(changes) =>
                            act(`/items/${value(item, 'id')}`, 'PATCH', changes)
                          }
                        />
                      ))}
                  </section>
                </>
              )}
              {data?.plan && (
                <div className="flex flex-wrap gap-2">
                  {status === 'DRAFT' && canManage && (
                    <>
                      <Button variant="outline" onClick={() => act('/refresh')}>
                        Refresh Draft Configuration
                      </Button>
                      <Button onClick={() => act('/submit')}>
                        Submit for Approval
                      </Button>
                    </>
                  )}
                  {['RELEASED', 'REJECTED'].includes(status) && canManage && (
                    <Button onClick={() => act('/revise', 'POST', header)}>
                      Create New Revision
                    </Button>
                  )}
                </div>
              )}
              {error && <p className="text-sm text-red-700">{error}</p>}
              {data?.plan && (
                <section className="grid gap-4 md:grid-cols-3">
                  {(['engineering', 'quality', 'operations'] as const).map(
                    (capacity) => (
                      <ApprovalPanel
                        key={capacity}
                        capacity={capacity}
                        history={data.approvalHistory}
                        canDecide={allowed.has(
                          `projects.production_planning.${capacity}_decide`
                        )}
                        pending={status === 'PENDING_APPROVAL'}
                        onDecision={(decision) => decide(capacity, decision)}
                      />
                    )
                  )}
                </section>
              )}
              {!!data?.history.length && (
                <section>
                  <h3 className="font-semibold">Revision history</h3>
                  {data.history.map((plan) => (
                    <div
                      className="mt-2 rounded border p-2 text-sm"
                      key={value(plan, 'id')}
                    >
                      Revision {value(plan, 'revision_number')} ·{' '}
                      {value(plan, 'status')} ·{' '}
                      {value(plan, 'configuration_revision')} ·{' '}
                      {value(plan, 'effectivity_reference')}
                    </div>
                  ))}
                </section>
              )}
              <nav
                className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
                aria-label="Production Planning pages"
              >
                <Button
                  variant="outline"
                  disabled={currentPage === 0}
                  onClick={() =>
                    setCurrentPage((page) => Math.max(0, page - 1))
                  }
                >
                  Back
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Save and Exit
                </Button>
                {currentPage < wizardPages.length - 1 && (
                  <Button
                    onClick={() =>
                      setCurrentPage((page) =>
                        Math.min(wizardPages.length - 1, page + 1)
                      )
                    }
                  >
                    Continue
                  </Button>
                )}
              </nav>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlanningItem({
  item,
  editable,
  saving,
  onSave,
}: {
  item: Row;
  editable: boolean;
  saving: boolean;
  onSave: (changes: Row) => void;
}) {
  const [form, setForm] = useState<Row>(() => ({ ...item }));
  const set = (key: string, next: unknown) => setForm({ ...form, [key]: next });
  const comma = (key: string) => listValue(form, key);
  const setComma = (key: string, next: string) =>
    set(
      key,
      next
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    );
  return (
    <details className="rounded border p-3" data-testid="production-plan-item">
      <summary className="cursor-pointer font-medium">
        {value(item, 'part_number')} — {value(item, 'part_name')}{' '}
        <Badge variant="outline">BOM {value(item, 'bom_release_status')}</Badge>{' '}
        <Badge variant="outline">
          Routing {value(item, 'routing_release_status')}
        </Badge>
      </summary>
      <fieldset
        disabled={!editable || saving}
        className="mt-4 grid gap-3 md:grid-cols-3"
      >
        <Field label="Drawing number">
          <Input
            value={value(form, 'drawing_number')}
            onChange={(e) => set('drawing_number', e.target.value)}
          />
        </Field>
        <Field label="Drawing revision">
          <Input
            value={value(form, 'drawing_revision')}
            onChange={(e) => set('drawing_revision', e.target.value)}
          />
        </Field>
        <Field label="Requirement source">
          <Input
            value={value(form, 'requirement_source')}
            onChange={(e) => set('requirement_source', e.target.value)}
          />
        </Field>
        <Choice
          label="Routing"
          value={value(form, 'routing_requirement')}
          options={['REQUIRED', 'NOT_REQUIRED_APPROVED']}
          onChange={(next) => set('routing_requirement', next)}
        />
        <Field label="Routing N/A reason">
          <Input
            value={value(form, 'routing_not_required_reason')}
            onChange={(e) => set('routing_not_required_reason', e.target.value)}
          />
        </Field>
        <Choice
          label="Traveler"
          value={value(form, 'traveler_requirement')}
          options={['REQUIRED', 'NOT_REQUIRED_APPROVED']}
          onChange={(next) => set('traveler_requirement', next)}
        />
        <Choice
          label="Traveler type (batch is valid for non-serialized work)"
          value={value(form, 'traveler_type')}
          options={['INDIVIDUAL', 'BATCH', 'LOT']}
          onChange={(next) => set('traveler_type', next)}
        />
        <Field label="Traveler N/A reason">
          <Input
            value={value(form, 'traveler_not_required_reason')}
            onChange={(e) =>
              set('traveler_not_required_reason', e.target.value)
            }
          />
        </Field>
        <Choice
          label="Work instruction"
          value={value(form, 'work_instruction_requirement')}
          options={[
            'REQUIRED',
            'DRAWING_SPEC_SUFFICIENT',
            'NOT_REQUIRED_APPROVED',
          ]}
          onChange={(next) => set('work_instruction_requirement', next)}
        />
        <Field label="WI basis / drawing sufficiency">
          <Input
            value={value(form, 'work_instruction_basis')}
            onChange={(e) => set('work_instruction_basis', e.target.value)}
          />
        </Field>
        <Field label="WI references">
          <Input
            value={comma('work_instruction_references')}
            onChange={(e) =>
              setComma('work_instruction_references', e.target.value)
            }
          />
        </Field>
        <Choice
          label="Inspection extent"
          value={value(form, 'inspection_extent')}
          options={[
            'ONE_HUNDRED_PERCENT',
            'APPROVED_SAMPLING',
            'FINAL_ONLY',
            'IN_PROCESS_AND_FINAL',
          ]}
          onChange={(next) => set('inspection_extent', next)}
        />
        <Field label="Sampling plan (required only for sampling)">
          <Input
            value={value(form, 'sampling_plan_id')}
            onChange={(e) => set('sampling_plan_id', e.target.value)}
          />
        </Field>
        <Choice
          label="Sampling status"
          value={value(form, 'sampling_plan_status')}
          options={['APPROVED', 'PENDING', 'REJECTED']}
          onChange={(next) => set('sampling_plan_status', next)}
        />
        <Choice
          label="FAI / AS9102"
          value={value(form, 'fai_requirement')}
          options={['FULL', 'PARTIAL', 'NOT_REQUIRED']}
          onChange={(next) => set('fai_requirement', next)}
        />
        <Field label="FAI reason">
          <Input
            value={value(form, 'fai_reason')}
            onChange={(e) => set('fai_reason', e.target.value)}
          />
        </Field>
        <Choice
          label="Traceability"
          value={value(form, 'traceability_level')}
          options={['SERIAL', 'LOT', 'BATCH', 'STANDARD']}
          onChange={(next) => set('traceability_level', next)}
        />
        <Choice
          label="Special process source"
          value={value(form, 'special_process_source')}
          options={['INTERNAL', 'EXTERNAL_APPROVED_SUPPLIER', 'NONE']}
          onChange={(next) => set('special_process_source', next)}
        />
        <Field label="Special processes">
          <Input
            value={comma('special_process_requirements')}
            onChange={(e) =>
              setComma('special_process_requirements', e.target.value)
            }
          />
        </Field>
        <Field label="Certifications">
          <Input
            value={comma('required_certifications')}
            onChange={(e) =>
              setComma('required_certifications', e.target.value)
            }
          />
        </Field>
        <Field label="Tests">
          <Input
            value={comma('required_test_records')}
            onChange={(e) => setComma('required_test_records', e.target.value)}
          />
        </Field>
        <Field label="Tooling">
          <Input
            value={comma('tooling_requirements')}
            onChange={(e) => setComma('tooling_requirements', e.target.value)}
          />
        </Field>
        <Field label="CNC programs">
          <Input
            value={comma('cnc_program_requirements')}
            onChange={(e) =>
              setComma('cnc_program_requirements', e.target.value)
            }
          />
        </Field>
        <Choice
          label="Packaging instruction"
          value={value(form, 'packaging_instruction_requirement')}
          options={['REQUIRED', 'NOT_REQUIRED_APPROVED']}
          onChange={(next) => set('packaging_instruction_requirement', next)}
        />
        <Field label="Packaging reference">
          <Input
            value={value(form, 'packaging_instruction_reference')}
            onChange={(e) =>
              set('packaging_instruction_reference', e.target.value)
            }
          />
        </Field>
        <Field label="Notes / N/A basis">
          <Textarea
            value={value(form, 'notes')}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
        {editable && (
          <Button type="button" onClick={() => onSave(form)}>
            Save Item Decisions
          </Button>
        )}
      </fieldset>
    </details>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Choice({
  label,
  value: current,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Select value={current || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Decision required" />
        </SelectTrigger>
        <SelectContent>{selectOptions(options)}</SelectContent>
      </Select>
    </Field>
  );
}
function ApprovalPanel({
  capacity,
  history,
  canDecide,
  pending,
  onDecision,
}: {
  capacity: string;
  history: Row[];
  canDecide: boolean;
  pending: boolean;
  onDecision: (decision: 'APPROVED' | 'REJECTED') => void;
}) {
  const items = history.filter(
    (item) =>
      value(item, 'approval_type') ===
      `PRODUCTION_PLANNING_${capacity.toUpperCase()}`
  );
  return (
    <div className="rounded border p-3">
      <h3 className="font-semibold capitalize">{capacity} approval</h3>
      {items.length ? (
        items.map((item) => (
          <div key={value(item, 'id')} className="mt-2 text-sm">
            <Badge variant="outline">{value(item, 'decision')}</Badge>
            <p>{value(item, 'signature_meaning')}</p>
            <p className="text-muted-foreground">
              {value(item, 'actor_display_name')} · {value(item, 'actor_role')}{' '}
              · {new Date(value(item, 'decided_at')).toLocaleString()}
            </p>
            {item.superseded_at && (
              <Badge variant="secondary">Superseded</Badge>
            )}
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No decision recorded.</p>
      )}
      {canDecide && pending && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => onDecision('APPROVED')}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onDecision('REJECTED')}
          >
            Reject / Return
          </Button>
        </div>
      )}
    </div>
  );
}
