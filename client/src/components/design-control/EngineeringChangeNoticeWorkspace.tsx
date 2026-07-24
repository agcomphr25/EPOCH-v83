import { useEffect, useMemo, useState } from 'react';
import { Cog, Plus, RefreshCw, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';

type Ecn = {
  id: string;
  ecn_number: string;
  source_ecr_id: string;
  status: string;
  title: string;
  implementation_scope: string;
  source_engineering_release_id: string | null;
  priority: string | null;
  affected_item_count: number;
  step_impact_count: number;
  action_count: number;
  accepted_action_count: number;
  passed_vv_count: number;
  approval_count: number;
  effectivity_method: string | null;
  inventory_wip_disposition: Record<string, unknown>;
  template_revision_snapshot: string | null;
  resulting_engineering_release_id: string | null;
  created_at: string;
};

export function EngineeringChangeNoticeWorkspace({
  projectId,
  oversightMode = false,
}: {
  projectId: string | null | undefined;
  oversightMode?: boolean;
}) {
  const { can } = usePermissions();
  const [rows, setRows] = useState<Ecn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [ecrId, setEcrId] = useState('');
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('');
  const [technicalDescription, setTechnicalDescription] = useState('');
  const [effectivityMethod, setEffectivityMethod] = useState('immediate');

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/design-projects/${encodeURIComponent(projectId)}/ecns`,
        {
          credentials: 'include',
        }
      );
      const payload = await response.json().catch(() => []);
      if (!response.ok)
        throw new Error(payload.message || 'Unable to load ECNs');
      setRows(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Unable to load ECNs'
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [projectId]);

  const visible = useMemo(
    () => rows.filter((row) => filter === 'ALL' || row.status === filter),
    [filter, rows]
  );
  const request = async (path: string, method: string, body?: unknown) => {
    const response = await fetch(path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(payload.message || 'ECN operation failed');
    return payload;
  };
  const create = async () => {
    try {
      await request(`/api/ecrs/${ecrId}/ecns`, 'POST', {
        title,
        implementationScope: scope,
        technicalDescription,
        effectivityMethod,
        effectivity:
          effectivityMethod === 'immediate'
            ? {}
            : { rule: 'Complete in ECN plan' },
        reason: 'Create controlled implementation plan from approved ECR',
      });
      setCreateOpen(false);
      setEcrId('');
      setTitle('');
      setScope('');
      setTechnicalDescription('');
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create ECN'
      );
    }
  };
  const transition = async (row: Ecn, action: string) => {
    const actionReason = window.prompt(`Reason for ${action}`)?.trim();
    if (!actionReason) return;
    try {
      await request(`/api/ecns/${row.id}/${action}`, 'POST', {
        reason: actionReason,
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'ECN transition failed'
      );
    }
  };
  const addStep = async (row: Ecn) => {
    const stepKey = window
      .prompt('Affected Design Control step (1-12)')
      ?.trim();
    const impactReason = window.prompt('Impact reason')?.trim();
    if (!stepKey || !impactReason) return;
    try {
      await request(`/api/ecns/${row.id}/step-impacts`, 'POST', {
        stepKey,
        impactReason,
        reopenRequired: window.confirm(
          'Does this exact step require a new generation?'
        ),
        requiredNewFormRevision: window.confirm(
          'Is a new controlled step-form revision required?'
        ),
        verificationRequired: window.confirm('Is verification required?'),
        validationRequired: window.confirm('Is validation required?'),
        reason: 'Targeted Design Control step-impact plan',
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Unable to add step impact'
      );
    }
  };
  const addAction = async (row: Ecn) => {
    const description = window.prompt('Implementation action')?.trim();
    const responsibleRole = window.prompt('Responsible role')?.trim();
    if (!description || !responsibleRole) return;
    try {
      await request(`/api/ecns/${row.id}/actions`, 'POST', {
        description,
        responsibleRole,
        reason: 'Assign ECN implementation action',
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Unable to add action'
      );
    }
  };
  const decide = async (row: Ecn) => {
    const approvalFunction = window
      .prompt('Approval function', 'ENGINEERING')
      ?.trim();
    const decision = window
      .prompt('Decision (APPROVED or REJECT)', 'APPROVED')
      ?.trim();
    const comment = window.prompt('Signature comment or conditions')?.trim();
    if (!approvalFunction || !decision) return;
    try {
      await request(`/api/ecns/${row.id}/decisions`, 'POST', {
        approvalFunction,
        decision,
        signatureMeaning: 'Approve controlled ECN implementation plan',
        comment,
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Unable to decide ECN'
      );
    }
  };
  const recordVv = async (row: Ecn, type: 'verification' | 'validation') => {
    const actualResult = window.prompt(`${type} actual result`)?.trim();
    const evidenceReference = window
      .prompt('Immutable evidence reference')
      ?.trim();
    if (!actualResult || !evidenceReference) return;
    try {
      await request(`/api/ecns/${row.id}/${type}`, 'POST', {
        planProtocol: `${type} protocol`,
        acceptanceCriteria: 'Documented acceptance criteria met',
        actualResult,
        resultStatus: window.confirm('Did the evidence pass?')
          ? 'PASS'
          : 'FAIL',
        evidenceReference,
        reason: `Authenticated ${type} evidence`,
      });
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : `Unable to record ${type}`
      );
    }
  };
  const upload = async (row: Ecn, file: File, paperOriginal = false) => {
    const form = new FormData();
    form.append('file', file);
    form.append(
      'kind',
      paperOriginal ? 'PAPER_ORIGINAL' : 'IMPLEMENTATION_EVIDENCE'
    );
    form.append('paperOriginal', String(paperOriginal));
    const response = await fetch(`/api/ecns/${row.id}/evidence`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      setError(payload.message || 'Unable to upload ECN evidence');
    else await load();
  };

  if (!projectId) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Cog className="h-5 w-5" /> Engineering Change Notices
          </CardTitle>
          <CardDescription>
            Controlled implementation plans from approved ECRs. RELEASE READY
            does not create a Revision B+ Engineering Release.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          {!oversightMode && can('engineering.ecn.create') && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create from approved ECR
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {oversightMode && (
          <div className="flex flex-wrap gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  'ALL',
                  'draft',
                  'implementation_planned',
                  'submitted',
                  'approved',
                  'in_implementation',
                  'verification_validation',
                  'release_ready',
                  'implemented',
                  'closed',
                  'rejected',
                  'cancelled',
                ].map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replaceAll('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline">
              Overdue/incomplete actions:{' '}
              {
                rows.filter(
                  (row) => row.accepted_action_count < row.action_count
                ).length
              }
            </Badge>
            <Badge variant="outline">
              Incomplete V&amp;V:{' '}
              {
                rows.filter(
                  (row) =>
                    ['verification_validation', 'release_ready'].includes(
                      row.status
                    ) && row.passed_vv_count === 0
                ).length
              }
            </Badge>
            <Badge variant="outline">
              Missing template:{' '}
              {
                rows.filter(
                  (row) =>
                    !row.template_revision_snapshot && row.status !== 'draft'
                ).length
              }
            </Badge>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <ShieldAlert className="h-4 w-4" /> {error}
          </div>
        )}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ECN</TableHead>
                <TableHead>Source ECR</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Source release</TableHead>
                <TableHead>Items / steps</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>V&amp;V</TableHead>
                <TableHead>Effectivity / WIP</TableHead>
                <TableHead>Approvals / form</TableHead>
                <TableHead>Resulting release</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.ecn_number}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.source_ecr_id}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {row.status.replaceAll('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-56">
                    {row.implementation_scope}
                  </TableCell>
                  <TableCell>
                    {row.source_engineering_release_id || 'Initial design'}
                  </TableCell>
                  <TableCell>
                    {row.affected_item_count} / {row.step_impact_count}
                  </TableCell>
                  <TableCell>
                    {row.accepted_action_count}/{row.action_count} accepted
                  </TableCell>
                  <TableCell>{row.passed_vv_count} passing</TableCell>
                  <TableCell>
                    {row.effectivity_method || 'Not set'} /{' '}
                    {String(
                      row.inventory_wip_disposition?.disposition ?? 'none'
                    )}
                  </TableCell>
                  <TableCell>
                    {row.approval_count} /{' '}
                    {row.template_revision_snapshot
                      ? `Rev ${row.template_revision_snapshot}`
                      : 'template unbound'}
                  </TableCell>
                  <TableCell>
                    {row.resulting_engineering_release_id || 'Phase 8 pending'}
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-max flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(`/api/ecns/${row.id}/pdf`, '_blank')
                        }
                      >
                        PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(`/api/ecns/${row.id}/history`, '_blank')
                        }
                      >
                        History
                      </Button>
                      {!oversightMode &&
                        [
                          'draft',
                          'implementation_planned',
                          'returned_for_revision',
                        ].includes(row.status) &&
                        can('engineering.ecn.edit') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void addStep(row)}
                            >
                              Step
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void addAction(row)}
                            >
                              Action
                            </Button>
                            <label className="inline-flex cursor-pointer items-center rounded px-2 text-xs hover:bg-muted">
                              Evidence
                              <input
                                className="hidden"
                                type="file"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) void upload(row, file);
                                  event.currentTarget.value = '';
                                }}
                              />
                            </label>
                            <label className="inline-flex cursor-pointer items-center rounded px-2 text-xs hover:bg-muted">
                              Paper scan
                              <input
                                className="hidden"
                                type="file"
                                accept="application/pdf,image/*"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) void upload(row, file, true);
                                  event.currentTarget.value = '';
                                }}
                              />
                            </label>
                          </>
                        )}
                      {!oversightMode &&
                        row.status === 'draft' &&
                        can('engineering.ecn.edit') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void transition(row, 'plan')}
                          >
                            Plan
                          </Button>
                        )}
                      {!oversightMode &&
                        [
                          'implementation_planned',
                          'returned_for_revision',
                        ].includes(row.status) &&
                        can('engineering.ecn.submit') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void transition(row, 'submit')}
                          >
                            Submit
                          </Button>
                        )}
                      {!oversightMode &&
                        row.status === 'submitted' &&
                        can('engineering.ecn.approve') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void decide(row)}
                          >
                            Decision
                          </Button>
                        )}
                      {!oversightMode &&
                        row.status === 'approved' &&
                        can('engineering.ecn.implement') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void transition(row, 'start-implementation')
                            }
                          >
                            Implement
                          </Button>
                        )}
                      {!oversightMode &&
                        row.status === 'in_implementation' &&
                        can('engineering.ecn.implement') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void transition(
                                row,
                                'start-verification-validation'
                              )
                            }
                          >
                            V&amp;V
                          </Button>
                        )}
                      {!oversightMode &&
                        row.status === 'verification_validation' &&
                        can('engineering.ecn.verify') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void recordVv(row, 'verification')}
                          >
                            Verify
                          </Button>
                        )}
                      {!oversightMode &&
                        row.status === 'verification_validation' &&
                        can('engineering.ecn.validate') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void recordVv(row, 'validation')}
                          >
                            Validate
                          </Button>
                        )}
                      {!oversightMode &&
                        row.status === 'verification_validation' &&
                        can('engineering.ecn.implement') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void transition(row, 'mark-release-ready')
                            }
                          >
                            Release ready
                          </Button>
                        )}
                      {!oversightMode &&
                        !['closed', 'rejected', 'cancelled', 'void'].includes(
                          row.status
                        ) &&
                        can('engineering.ecn.admin') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void transition(row, 'cancel')}
                          >
                            Cancel
                          </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!visible.length && (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="text-center text-muted-foreground"
                  >
                    {loading ? 'Loading…' : 'No authoritative ECNs'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create ECN from approved ECR</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Approved ECR ID</Label>
              <Input
                value={ecrId}
                onChange={(event) => setEcrId(event.target.value)}
              />
            </div>
            <div>
              <Label>ECN title</Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Label>Intentional implementation scope</Label>
              <Textarea
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              />
            </div>
            <div>
              <Label>Technical implementation description</Label>
              <Textarea
                value={technicalDescription}
                onChange={(event) =>
                  setTechnicalDescription(event.target.value)
                }
              />
            </div>
            <div>
              <Label>Effectivity method</Label>
              <Select
                value={effectivityMethod}
                onValueChange={setEffectivityMethod}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    'immediate',
                    'effective_date',
                    'first_serial_number',
                    'lot_batch',
                    'unit_range',
                    'next_production_order',
                    'after_existing_inventory_depletion',
                    'retrofit_population',
                    'other',
                  ].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void create()}
              disabled={!ecrId.trim() || !title.trim() || !scope.trim()}
            >
              Create draft ECN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
