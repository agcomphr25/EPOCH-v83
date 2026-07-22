import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';

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

type Responsibility =
  | 'CUSTOMER_BUILD_TO_PRINT'
  | 'AG_DESIGN_RESPONSIBLE'
  | 'SHARED_DESIGN_RESPONSIBILITY';
type Decision = {
  id: string;
  revision_number: number;
  status: string;
  responsibility_type: Responsibility;
  ag_design_scope?: string | null;
  customer_design_scope?: string | null;
  responsibility_boundary?: string | null;
  requirement_source?: string | null;
  customer_drawing_number?: string | null;
  customer_drawing_revision?: string | null;
  customer_specifications?: unknown;
  linked_design_project_id?: string | null;
  justification?: string | null;
  created_at: string;
};
type ApprovalEvidence = {
  id: string;
  approval_type: string;
  decision: string;
  signature_meaning: string;
  actor_display_name: string;
  actor_role?: string | null;
  decided_at: string;
  superseded_at?: string | null;
  reason?: string | null;
};
type ReleaseState = {
  designProject?: { project_name?: string | null } | null;
  release?: {
    release_status: string;
    release_revision: string;
    effective_date?: string | null;
    release_number: string;
  } | null;
};
type Model = {
  decision: Decision | null;
  history: Decision[];
  approvals: ApprovalEvidence[];
  approvalHistory: ApprovalEvidence[];
  release: ReleaseState;
  readiness: { ready: boolean; blockers: string[] };
};
type DesignProject = {
  id: string;
  name?: string;
  projectName?: string;
  engineeringStatus?: string;
  status?: string;
};
const emptyForm = {
  responsibilityType: 'CUSTOMER_BUILD_TO_PRINT' as Responsibility,
  agDesignScope: '',
  customerDesignScope: '',
  responsibilityBoundary: '',
  requirementSource: '',
  customerDrawingNumber: '',
  customerDrawingRevision: '',
  customerSpecifications: '',
  linkedDesignProjectId: '',
  justification: '',
};

async function jsonRequest(url: string, method = 'GET', body?: unknown) {
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

export default function P2V2DesignApplicability({
  projectId,
}: {
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [actionError, setActionError] = useState('');
  const queryClient = useQueryClient();
  const key = [
    '/api/projects',
    projectId,
    'workflow-v2',
    'design-applicability',
  ];
  const { data, isLoading } = useQuery<Model>({
    queryKey: key,
    queryFn: () =>
      jsonRequest(
        `/api/projects/${projectId}/workflow-v2/design-applicability`
      ),
    enabled: open,
  });
  const { data: permissions } = useQuery<{ permissions: string[] }>({
    queryKey: ['/api/permissions/me'],
    queryFn: () => jsonRequest('/api/permissions/me'),
  });
  const { data: designProjects = [] } = useQuery<DesignProject[]>({
    queryKey: ['/api/rd-projects'],
    queryFn: () => jsonRequest('/api/rd-projects'),
    enabled: open,
  });
  const permissionSet = useMemo(
    () => new Set(permissions?.permissions ?? []),
    [permissions]
  );
  const canManage = permissionSet.has('projects.design_applicability.manage');
  const canEngineering = permissionSet.has(
    'projects.design_applicability.engineering_decide'
  );
  const canQuality = permissionSet.has(
    'projects.design_applicability.quality_decide'
  );
  useEffect(() => {
    if (!data?.decision) return;
    const d = data.decision;
    setForm({
      responsibilityType: d.responsibility_type,
      agDesignScope: d.ag_design_scope ?? '',
      customerDesignScope: d.customer_design_scope ?? '',
      responsibilityBoundary: d.responsibility_boundary ?? '',
      requirementSource: d.requirement_source ?? '',
      customerDrawingNumber: d.customer_drawing_number ?? '',
      customerDrawingRevision: d.customer_drawing_revision ?? '',
      customerSpecifications: Array.isArray(d.customer_specifications)
        ? d.customer_specifications.join(', ')
        : '',
      linkedDesignProjectId: d.linked_design_project_id ?? '',
      justification: d.justification ?? '',
    });
  }, [data?.decision]);
  const payload = () => ({
    ...form,
    customerSpecifications: form.customerSpecifications
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    linkedDesignProjectId: form.linkedDesignProjectId || null,
  });
  const mutation = useMutation({
    mutationFn: ({
      url,
      method,
      body,
    }: {
      url: string;
      method?: string;
      body?: unknown;
    }) => jsonRequest(url, method, body),
    onSuccess: async () => {
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'workflow-v2'],
      });
    },
    onError: (error: Error) => setActionError(error.message),
  });
  const save = () =>
    mutation.mutate({
      url: data?.decision
        ? `/api/projects/${projectId}/workflow-v2/design-applicability/${data.decision.id}`
        : `/api/projects/${projectId}/workflow-v2/design-applicability`,
      method: data?.decision ? 'PATCH' : 'POST',
      body: payload(),
    });
  const approve = (
    capacity: 'engineering' | 'quality',
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    if (!data?.decision) return;
    const signatureMeaning = window.prompt(
      'Signature meaning (required):',
      decision === 'APPROVED'
        ? `I approve the ${capacity} Design Applicability determination.`
        : `I return the ${capacity} Design Applicability determination for revision.`
    );
    if (!signatureMeaning) return;
    const reason =
      window.prompt(
        decision === 'APPROVED' ? 'Comments (optional):' : 'Reason (required):',
        ''
      ) ?? '';
    if (decision !== 'APPROVED' && !reason.trim()) return;
    mutation.mutate({
      url: `/api/projects/${projectId}/workflow-v2/design-applicability/${data.decision.id}/${capacity}-decision`,
      method: 'POST',
      body: { decision, signatureMeaning, reason },
    });
  };
  const responsibility = form.responsibilityType;
  const editable = !data?.decision || data.decision.status === 'DRAFT';
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="open-design-applicability"
      >
        Open Design Applicability
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[90vh] max-w-5xl overflow-y-auto"
          data-testid="design-applicability-dialog"
        >
          <DialogHeader>
            <DialogTitle>Design Applicability</DialogTitle>
            <DialogDescription>
              Controlled determination of customer and AG design responsibility.
              All other V2 stages remain read-only.
            </DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <p>Loading Design Applicability…</p>
          ) : (
            <div className="space-y-6">
              {data?.decision && (
                <div className="flex flex-wrap gap-2">
                  <Badge>Revision {data.decision.revision_number}</Badge>
                  <Badge variant="outline">{data.decision.status}</Badge>
                  <Badge variant="outline">
                    {data.decision.responsibility_type.replaceAll('_', ' ')}
                  </Badge>
                </div>
              )}
              {data?.readiness.blockers.length ? (
                <div className="rounded border border-amber-300 bg-amber-50 p-3">
                  <p className="font-medium">Readiness blockers</p>
                  <ul className="list-disc pl-5 text-sm">
                    {data.readiness.blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded border border-green-300 bg-green-50 p-3">
                  Design Applicability readiness requirements are satisfied.
                </div>
              )}
              <fieldset
                disabled={!editable || !canManage || mutation.isPending}
                className="grid gap-4 md:grid-cols-2"
              >
                <div className="space-y-2">
                  <Label>Design responsibility</Label>
                  <Select
                    value={responsibility}
                    onValueChange={(value: Responsibility) =>
                      setForm({ ...form, responsibilityType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CUSTOMER_BUILD_TO_PRINT">
                        Customer build-to-print
                      </SelectItem>
                      <SelectItem value="AG_DESIGN_RESPONSIBLE">
                        AG design responsible
                      </SelectItem>
                      <SelectItem value="SHARED_DESIGN_RESPONSIBILITY">
                        Shared design responsibility
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Requirement source</Label>
                  <Input
                    value={form.requirementSource}
                    onChange={(e) =>
                      setForm({ ...form, requirementSource: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>
                    AG design scope{' '}
                    {responsibility === 'CUSTOMER_BUILD_TO_PRINT' &&
                      '(state none or limited)'}
                  </Label>
                  <Textarea
                    value={form.agDesignScope}
                    onChange={(e) =>
                      setForm({ ...form, agDesignScope: e.target.value })
                    }
                  />
                </div>
                {responsibility === 'SHARED_DESIGN_RESPONSIBILITY' && (
                  <>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Customer design scope</Label>
                      <Textarea
                        value={form.customerDesignScope}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            customerDesignScope: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Responsibility boundary</Label>
                      <Textarea
                        value={form.responsibilityBoundary}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            responsibilityBoundary: e.target.value,
                          })
                        }
                      />
                    </div>
                  </>
                )}
                {(responsibility !== 'AG_DESIGN_RESPONSIBLE' ||
                  form.customerDrawingNumber) && (
                  <>
                    <div className="space-y-2">
                      <Label>Customer drawing/specification number</Label>
                      <Input
                        value={form.customerDrawingNumber}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            customerDrawingNumber: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Customer revision</Label>
                      <Input
                        value={form.customerDrawingRevision}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            customerDrawingRevision: e.target.value,
                          })
                        }
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2 md:col-span-2">
                  <Label>Specifications (comma separated)</Label>
                  <Input
                    value={form.customerSpecifications}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        customerSpecifications: e.target.value,
                      })
                    }
                  />
                </div>
                {responsibility !== 'CUSTOMER_BUILD_TO_PRINT' && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Linked Design Project</Label>
                    <Select
                      value={form.linkedDesignProjectId}
                      onValueChange={(value) =>
                        setForm({ ...form, linkedDesignProjectId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select the Design Control project" />
                      </SelectTrigger>
                      <SelectContent>
                        {designProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.projectName || project.name || project.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2 md:col-span-2">
                  <Label>Justification</Label>
                  <Textarea
                    value={form.justification}
                    onChange={(e) =>
                      setForm({ ...form, justification: e.target.value })
                    }
                  />
                </div>
              </fieldset>
              {actionError && (
                <p className="text-sm text-red-700">{actionError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {editable && canManage && (
                  <Button onClick={save} disabled={mutation.isPending}>
                    {data?.decision ? 'Save Draft' : 'Create Draft'}
                  </Button>
                )}
                {data?.decision?.status === 'DRAFT' && canManage && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      mutation.mutate({
                        url: `/api/projects/${projectId}/workflow-v2/design-applicability/${data.decision.id}/submit`,
                        method: 'POST',
                      })
                    }
                  >
                    Submit for Approval
                  </Button>
                )}
                {['APPROVED', 'REJECTED'].includes(data?.decision?.status) &&
                  canManage && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        mutation.mutate({
                          url: `/api/projects/${projectId}/workflow-v2/design-applicability/${data!.decision!.id}/revise`,
                          method: 'POST',
                          body: payload(),
                        })
                      }
                    >
                      Create New Revision
                    </Button>
                  )}
                {form.linkedDesignProjectId && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.location.assign(
                        `/design/rd-projects?projectId=${encodeURIComponent(form.linkedDesignProjectId)}&tab=engineering-release`
                      )
                    }
                  >
                    <ExternalLink className="mr-1 h-4 w-4" />
                    Open Design Project
                  </Button>
                )}
              </div>
              <section className="space-y-2">
                <h3 className="font-semibold">Engineering approval</h3>
                {data?.approvalHistory
                  .filter(
                    (a) =>
                      a.approval_type === 'DESIGN_APPLICABILITY_ENGINEERING'
                  )
                  .map((a) => (
                    <Approval key={a.id} item={a} />
                  ))}
                {data?.decision?.status === 'PENDING_APPROVAL' &&
                  canEngineering && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => approve('engineering', 'APPROVED')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => approve('engineering', 'REJECTED')}
                      >
                        Reject / Return
                      </Button>
                    </div>
                  )}
              </section>
              <section className="space-y-2">
                <h3 className="font-semibold">Quality approval</h3>
                {data?.approvalHistory
                  .filter(
                    (a) => a.approval_type === 'DESIGN_APPLICABILITY_QUALITY'
                  )
                  .map((a) => (
                    <Approval key={a.id} item={a} />
                  ))}
                {data?.decision?.status === 'PENDING_APPROVAL' &&
                  canQuality && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => approve('quality', 'APPROVED')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => approve('quality', 'REJECTED')}
                      >
                        Reject / Return
                      </Button>
                    </div>
                  )}
              </section>
              {data?.release.designProject && (
                <section className="rounded border p-3">
                  <h3 className="font-semibold">Design Control release</h3>
                  <p>
                    {data.release.designProject.project_name} ·{' '}
                    {data.release.release?.release_status || 'Not released'}
                  </p>
                  {data.release.release && (
                    <p className="text-sm">
                      Revision {data.release.release.release_revision} ·
                      Effectivity{' '}
                      {data.release.release.effective_date ||
                        data.release.release.release_number}
                    </p>
                  )}
                </section>
              )}
              <section>
                <h3 className="font-semibold">Revision history</h3>
                <div className="space-y-2">
                  {data?.history.map((item) => (
                    <div key={item.id} className="rounded border p-2 text-sm">
                      Revision {item.revision_number} · {item.status} ·{' '}
                      {item.responsibility_type.replaceAll('_', ' ')} · created{' '}
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Approval({ item }: { item: ApprovalEvidence }) {
  return (
    <div className="rounded border p-2 text-sm">
      <div className="flex gap-2">
        <Badge variant="outline">{item.decision}</Badge>
        {item.superseded_at && <Badge variant="secondary">Superseded</Badge>}
      </div>
      <p>{item.signature_meaning}</p>
      <p className="text-muted-foreground">
        {item.actor_display_name} · {item.actor_role || 'Role not recorded'} ·{' '}
        {new Date(item.decided_at).toLocaleString()}
      </p>
      {item.reason && <p>{item.reason}</p>}
    </div>
  );
}
