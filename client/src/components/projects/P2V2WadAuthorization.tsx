import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'wouter';

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

// Dynamic API rows mirror additive snapshot JSON without a generated schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const value = (row: Row | null | undefined, key: string) =>
  String(row?.[key] ?? '—');
const endpoint = (projectId: string) =>
  `/api/projects/${projectId}/workflow-v2/wad-authorization`;
async function request(url: string, init?: { method?: string; body?: string }) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message || body.error || 'WAD Authorization failed.');
  return body;
}

export default function P2V2WadAuthorization({
  projectId,
}: {
  projectId: string;
}) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('');
  const [hours, setHours] = useState('');
  const [chargeCodeId, setChargeCodeId] = useState('');
  const [materialBudget, setMaterialBudget] = useState('');
  const [outsideBudget, setOutsideBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [risk, setRisk] = useState('');
  const [riskOwner, setRiskOwner] = useState('');
  const [riskControl, setRiskControl] = useState('');
  const [financeRequired, setFinanceRequired] = useState(false);
  const [executiveRequired, setExecutiveRequired] = useState(false);
  const [existingWadId, setExistingWadId] = useState('');
  const { data, refetch, isLoading } = useQuery<Row>({
    queryKey: [endpoint(projectId)],
    queryFn: () => request(endpoint(projectId)),
    enabled: open,
  });
  const { data: permissions } = useQuery<Row>({
    queryKey: ['/api/permissions/me'],
    queryFn: () => request('/api/permissions/me'),
  });
  const allowed = new Set<string>(permissions?.permissions ?? []);
  const authorization = data?.authorization;
  const status = value(authorization, 'status');
  const canManage = allowed.has('projects.wad_authorization.manage');

  const draftPayload = {
    budget: {
      departments: [
        {
          department,
          hours: Number(hours),
          chargeCodeId: Number(chargeCodeId),
        },
      ],
      materialBudget: Number(materialBudget),
      outsideProcessingBudget: Number(outsideBudget),
      startDate,
      dueDate,
      risks: [{ description: risk, owner: riskOwner, control: riskControl }],
      responsibleOwners: [riskOwner],
    },
    financeRequired,
    executiveRequired,
  };
  async function act(suffix: string, body: Row = {}, method = 'POST') {
    try {
      setError('');
      await request(`${endpoint(projectId)}${suffix}`, {
        method,
        body: JSON.stringify(body),
      });
      await refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  const decisions = [
    ['PROJECT_MANAGEMENT', 'pm', 'projects.wad_authorization.pm_decide'],
    [
      'ENGINEERING',
      'engineering',
      'projects.wad_authorization.engineering_decide',
    ],
    ['QUALITY', 'quality', 'projects.wad_authorization.quality_decide'],
    [
      'OPERATIONS',
      'operations',
      'projects.wad_authorization.operations_decide',
    ],
    ['FINANCE', 'finance', 'projects.wad_authorization.finance_decide'],
    ['EXECUTIVE', 'executive', 'projects.wad_authorization.executive_decide'],
  ];
  const inherited =
    authorization?.inherited_requirements_snapshot?.manufacturedItems ?? [];
  const budget = authorization?.budget_snapshot ?? {};

  return (
    <>
      <Button
        data-testid="open-wad-authorization"
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
      >
        Open WAD Authorization
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[92vh] max-w-6xl overflow-y-auto"
          data-testid="wad-authorization-dialog"
        >
          <DialogHeader>
            <DialogTitle>Work Authorization Document (WAD)</DialogTitle>
            <DialogDescription>
              Authorizes the released P2 V2 Production Plan. This action does
              not launch production, generate travelers, or release queues.
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <p>Loading WAD authorization…</p>
          ) : (
            <div className="space-y-5">
              {authorization ? (
                <>
                  <section className="grid gap-3 rounded border p-4 md:grid-cols-5">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Status
                      </span>
                      <div>
                        <Badge>{status}</Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">WAD</span>
                      <p>
                        {value(authorization, 'wad_number')} Rev{' '}
                        {value(authorization, 'wad_revision')}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Production Plan
                      </span>
                      <p>
                        Rev {value(authorization, 'production_plan_revision')}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Configuration
                      </span>
                      <p>{value(authorization, 'configuration_revision')}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        Effectivity
                      </span>
                      <p>{value(authorization, 'effectivity_reference')}</p>
                    </div>
                  </section>
                  {data.readiness?.stale && (
                    <section
                      className="rounded border border-red-300 bg-red-50 p-3"
                      data-testid="wad-authorization-stale"
                    >
                      <h3 className="font-semibold">Source baseline changed</h3>
                      <ul className="list-disc pl-5 text-sm">
                        {data.readiness.differences.map((item: string) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {!!data.readiness?.blockers?.length && (
                    <section className="rounded border border-amber-300 bg-amber-50 p-3">
                      <h3 className="font-semibold">Readiness blockers</h3>
                      <ul className="list-disc pl-5 text-sm">
                        {data.readiness.blockers.map((item: string) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <section>
                    <h3 className="font-semibold">
                      Inherited scope and requirements
                    </h3>
                    <div className="mt-2 space-y-2">
                      {inherited.map((item: Row) => (
                        <div
                          className="rounded border p-3 text-sm"
                          key={item.id}
                        >
                          <strong>{item.part_number}</strong> · Qty{' '}
                          {item.extended_project_quantity} · Source: released
                          Production Plan Rev{' '}
                          {authorization.production_plan_revision}
                          <p>
                            Routing {item.routing_requirement}; Traveler{' '}
                            {item.traveler_requirement} {item.traveler_type}; WI{' '}
                            {item.work_instruction_requirement}; Inspection{' '}
                            {item.inspection_extent}; Sampling{' '}
                            {item.sampling_plan_id || 'N/A'}; FAI{' '}
                            {item.fai_requirement}; Traceability{' '}
                            {item.traceability_level}
                          </p>
                          <p>
                            Special process {item.special_process_source};
                            Certifications{' '}
                            {JSON.stringify(item.required_certifications ?? [])}
                            ; Tests{' '}
                            {JSON.stringify(item.required_test_records ?? [])};
                            Packaging {item.packaging_instruction_requirement}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h3 className="font-semibold">Budgets and charge codes</h3>
                    {(budget.departments ?? []).map((entry: Row) => (
                      <div className="text-sm" key={entry.department}>
                        {entry.department}: {entry.hours} hours · Charge code{' '}
                        {entry.chargeCodeId}
                      </div>
                    ))}
                    <p className="text-sm">
                      Material ${budget.materialBudget}; Outside processing $
                      {budget.outsideProcessingBudget}; Tooling/NRE $
                      {budget.toolingNreBudget ?? 0}
                    </p>
                  </section>
                  <section>
                    <h3 className="font-semibold">
                      Schedule and risk controls
                    </h3>
                    <p className="text-sm">
                      {budget.startDate} through {budget.dueDate}
                    </p>
                    {(budget.risks ?? []).map((item: Row, index: number) => (
                      <p
                        className="text-sm"
                        key={`${item.description}-${index}`}
                      >
                        {item.description} · Owner {item.owner} · Control{' '}
                        {item.control}
                      </p>
                    ))}
                  </section>
                  <section className="grid gap-3 md:grid-cols-3">
                    {decisions
                      .filter(([role]) =>
                        (data.requiredApprovals ?? []).includes(role)
                      )
                      .map(([role, path, capability]) => {
                        const approval = (data.approvals ?? []).find(
                          (item: Row) => item.approval_type === `WAD_${role}`
                        );
                        return (
                          <div className="rounded border p-3" key={role}>
                            <h3 className="font-semibold">{role} approval</h3>
                            {approval ? (
                              <p className="text-sm">
                                {approval.decision} by{' '}
                                {approval.actor_display_name}
                              </p>
                            ) : (
                              <p className="text-sm">Pending</p>
                            )}
                            {status === 'PENDING_APPROVAL' &&
                              allowed.has(capability) &&
                              !approval && (
                                <div className="mt-2 flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      act(
                                        `/${authorization.id}/${path}-decision`,
                                        {
                                          decision: 'APPROVED',
                                          signatureMeaning: `${role} WAD authorization approval`,
                                        }
                                      )
                                    }
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() =>
                                      act(
                                        `/${authorization.id}/${path}-decision`,
                                        {
                                          decision: 'REJECTED',
                                          signatureMeaning: `${role} WAD authorization rejection`,
                                          reason: 'Returned for correction',
                                        }
                                      )
                                    }
                                  >
                                    Reject
                                  </Button>
                                </div>
                              )}
                          </div>
                        );
                      })}
                  </section>
                  <section>
                    <h3 className="font-semibold">Revision history</h3>
                    {(data.history ?? []).map((entry: Row) => (
                      <p className="text-sm" key={entry.id}>
                        WAD Rev {entry.wad_revision} · {entry.status} ·
                        Production Plan Rev {entry.production_plan_revision}
                      </p>
                    ))}
                  </section>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        navigate(
                          `/work-orders/${authorization.wad_work_order_id}`
                        )
                      }
                    >
                      Open WAD
                    </Button>
                    {status === 'DRAFT' && canManage && (
                      <Button
                        onClick={() => act(`/${authorization.id}/submit`)}
                      >
                        Submit
                      </Button>
                    )}
                    {status === 'PENDING_APPROVAL' &&
                      allowed.has('projects.wad_authorization.release') && (
                        <Button
                          onClick={() =>
                            act(`/${authorization.id}/release`, {
                              signatureMeaning:
                                'Release the approved WAD authorization',
                            })
                          }
                        >
                          Release WAD
                        </Button>
                      )}
                    {['RELEASED', 'REJECTED', 'BLOCKED'].includes(status) &&
                      canManage && (
                        <Button
                          onClick={() =>
                            act(`/${authorization.id}/revise`, draftPayload)
                          }
                        >
                          Create Revision
                        </Button>
                      )}
                  </div>
                </>
              ) : (
                <section className="space-y-3 rounded border p-4">
                  <h3 className="font-semibold">Create WAD Draft</h3>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input
                      placeholder="Department"
                      value={department}
                      onChange={(event) => setDepartment(event.target.value)}
                    />
                    <Input
                      placeholder="Labor hours"
                      type="number"
                      value={hours}
                      onChange={(event) => setHours(event.target.value)}
                    />
                    <Input
                      placeholder="Active charge-code ID"
                      type="number"
                      value={chargeCodeId}
                      onChange={(event) => setChargeCodeId(event.target.value)}
                    />
                    <Input
                      placeholder="Material budget"
                      type="number"
                      value={materialBudget}
                      onChange={(event) =>
                        setMaterialBudget(event.target.value)
                      }
                    />
                    <Input
                      placeholder="Outside-processing budget"
                      type="number"
                      value={outsideBudget}
                      onChange={(event) => setOutsideBudget(event.target.value)}
                    />
                    <Input
                      aria-label="WAD start date"
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                    <Input
                      aria-label="WAD due date"
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                    <Input
                      placeholder="Risk"
                      value={risk}
                      onChange={(event) => setRisk(event.target.value)}
                    />
                    <Input
                      placeholder="Risk owner"
                      value={riskOwner}
                      onChange={(event) => setRiskOwner(event.target.value)}
                    />
                    <Input
                      placeholder="Risk control"
                      value={riskControl}
                      onChange={(event) => setRiskControl(event.target.value)}
                    />
                  </div>
                  <label className="mr-4 text-sm">
                    <input
                      checked={financeRequired}
                      onChange={(event) =>
                        setFinanceRequired(event.target.checked)
                      }
                      type="checkbox"
                    />{' '}
                    Finance approval required
                  </label>
                  <label className="text-sm">
                    <input
                      checked={executiveRequired}
                      onChange={(event) =>
                        setExecutiveRequired(event.target.checked)
                      }
                      type="checkbox"
                    />{' '}
                    Executive approval required
                  </label>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => act('/create-draft', draftPayload)}
                      >
                        Create WAD Draft
                      </Button>
                      <Input
                        className="max-w-sm"
                        placeholder="Existing WAD ID"
                        value={existingWadId}
                        onChange={(event) =>
                          setExistingWadId(event.target.value)
                        }
                      />
                      <Button
                        disabled={!existingWadId}
                        variant="outline"
                        onClick={() =>
                          act('/link-existing', {
                            ...draftPayload,
                            wadId: existingWadId,
                            confirmation: 'LINK_MATCHING_BASELINE',
                          })
                        }
                      >
                        Link Existing WAD
                      </Button>
                    </div>
                  )}
                </section>
              )}
              {error && <p className="text-sm text-red-700">{error}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
