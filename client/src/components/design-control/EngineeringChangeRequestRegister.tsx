import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Plus, RefreshCw } from 'lucide-react';

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

type Ecr = {
  id: string;
  ecr_number: string;
  rd_project_id: string;
  design_control_record_id: string;
  title: string;
  lifecycle_status: string;
  priority: string;
  change_classification: string;
  source_engineering_release_id: string | null;
  owner_username: string | null;
  affected_item_count: number;
  completed_reviews: number;
  template_revision_snapshot: string | null;
  submitted_at: string | null;
  decision_at: string | null;
  created_at: string;
};

export function EngineeringChangeRequestRegister({
  projectId,
  recordId,
  oversightMode = false,
}: {
  projectId: string | null | undefined;
  recordId?: string | null;
  oversightMode?: boolean;
}) {
  const { can } = usePermissions();
  const [rows, setRows] = useState<Ecr[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [classification, setClassification] = useState('DESIGN');
  const [problem, setProblem] = useState('');
  const [requestedChange, setRequestedChange] = useState('');
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('ALL');

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/design-projects/${encodeURIComponent(projectId)}/ecrs`,
        {
          credentials: 'include',
        }
      );
      const payload = await response.json().catch(() => []);
      if (!response.ok)
        throw new Error(
          payload.message || 'Unable to load Engineering Change Requests'
        );
      setRows(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load Engineering Change Requests'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  const visibleRows = useMemo(
    () =>
      rows.filter((row) => filter === 'ALL' || row.lifecycle_status === filter),
    [filter, rows]
  );

  const create = async () => {
    if (!projectId) return;
    setError(null);
    try {
      const response = await fetch(
        `/api/design-projects/${encodeURIComponent(projectId)}/ecrs`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            designControlRecordId: recordId,
            title,
            priority,
            changeClassification: classification,
            problemOpportunityStatement: problem,
            requestedChange,
            reasonBusinessJustification: reason,
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.message || 'Unable to create ECR');
      setCreateOpen(false);
      setTitle('');
      setProblem('');
      setRequestedChange('');
      setReason('');
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create ECR'
      );
    }
  };

  const act = async (ecr: Ecr, action: string) => {
    const actionReason = window.prompt(`Reason for ${action}`)?.trim();
    if (!actionReason) return;
    const response = await fetch(`/api/ecrs/${ecr.id}/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: actionReason }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.message || `Unable to ${action} ECR`);
    else await load();
  };

  const editDraft = async (ecr: Ecr) => {
    const nextTitle = window.prompt('ECR title', ecr.title)?.trim();
    if (!nextTitle) return;
    const editReason = window.prompt('Reason for material draft edit')?.trim();
    if (!editReason) return;
    const response = await fetch(`/api/ecrs/${ecr.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: nextTitle, reason: editReason }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.message || 'Unable to edit ECR');
    else await load();
  };

  const addAffected = async (ecr: Ecr) => {
    const sourceType = window
      .prompt(
        'Affected item type (for example DRAWING, BOM, REQUIREMENT)',
        'DRAWING'
      )
      ?.trim();
    const reference = window
      .prompt('Stable source ID or external reference')
      ?.trim();
    const description = window.prompt('Affected item description')?.trim();
    const proposedChange = window.prompt('Proposed change')?.trim();
    if (!sourceType || !reference || !description || !proposedChange) return;
    const response = await fetch(`/api/ecrs/${ecr.id}/affected-items`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceType,
        stableExternalReference: reference,
        description,
        proposedChange,
        impactCategory: 'DESIGN',
        reason: 'Affected item added from Design Project workspace',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      setError(payload.message || 'Unable to add affected item');
    else await load();
  };

  const review = async (ecr: Ecr) => {
    const reviewFunction = window
      .prompt('Review function', 'ENGINEERING')
      ?.trim();
    const decision = window
      .prompt('Decision (APPROVE, REJECT, CONDITIONS)', 'APPROVE')
      ?.trim();
    const impactAssessment = window.prompt('Impact assessment')?.trim();
    if (!reviewFunction || !decision || !impactAssessment) return;
    const response = await fetch(`/api/ecrs/${ecr.id}/reviews`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reviewFunction,
        decision,
        impactAssessment,
        reason: 'Authenticated impact-review decision',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      setError(payload.message || 'Unable to record impact review');
    else await load();
  };

  const uploadEvidence = async (
    ecr: Ecr,
    file: File,
    paperOriginal = false
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append(
      'kind',
      paperOriginal ? 'PAPER_ORIGINAL' : 'SUPPORTING_EVIDENCE'
    );
    form.append('paperOriginal', String(paperOriginal));
    const response = await fetch(`/api/ecrs/${ecr.id}/evidence`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      setError(payload.message || 'Unable to upload ECR evidence');
    else await load();
  };

  if (!projectId) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Engineering Change Requests
          </CardTitle>
          <CardDescription>
            Authoritative proposed-change evaluation. Approval does not
            implement the change or create an ECN.
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
          {!oversightMode && can('engineering.ecr.create') && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create ECR
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
                  'DRAFT',
                  'SUBMITTED',
                  'IMPACT_REVIEW',
                  'APPROVED',
                  'REJECTED',
                  'RETURNED_FOR_REVISION',
                  'CANCELLED',
                ].map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replaceAll('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline">
              High priority:{' '}
              {
                rows.filter(
                  (row) =>
                    row.priority === 'HIGH' || row.priority === 'CRITICAL'
                ).length
              }
            </Badge>
            <Badge variant="outline">
              Blocked/template missing:{' '}
              {
                rows.filter(
                  (row) =>
                    !row.template_revision_snapshot &&
                    row.lifecycle_status !== 'DRAFT'
                ).length
              }
            </Badge>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ECR</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority / class</TableHead>
                <TableHead>Source release</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Reviews</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Future ECN</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.ecr_number}
                  </TableCell>
                  <TableCell className="min-w-56">{row.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {row.lifecycle_status.replaceAll('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.priority} / {row.change_classification}
                  </TableCell>
                  <TableCell>
                    {row.source_engineering_release_id ||
                      'Pre-Rev A / optional'}
                  </TableCell>
                  <TableCell>{row.owner_username || 'Unassigned'}</TableCell>
                  <TableCell>{row.affected_item_count}</TableCell>
                  <TableCell>{row.completed_reviews} complete</TableCell>
                  <TableCell>
                    {row.template_revision_snapshot
                      ? `Rev ${row.template_revision_snapshot}`
                      : 'Not bound'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(row.created_at).toLocaleDateString()}
                    <br />
                    {row.decision_at
                      ? `Decision ${new Date(row.decision_at).toLocaleDateString()}`
                      : ''}
                  </TableCell>
                  <TableCell>
                    {row.lifecycle_status === 'APPROVED'
                      ? 'Expected; not created'
                      : 'Not authorized'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(`/api/ecrs/${row.id}/pdf`, '_blank')
                        }
                      >
                        PDF
                      </Button>
                      {!oversightMode &&
                        row.lifecycle_status === 'DRAFT' &&
                        can('engineering.ecr.edit') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void editDraft(row)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void addAffected(row)}
                            >
                              Affected item
                            </Button>
                            <label className="inline-flex cursor-pointer items-center rounded px-2 text-xs hover:bg-muted">
                              Evidence
                              <input
                                className="hidden"
                                type="file"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (file) void uploadEvidence(row, file);
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
                                  if (file)
                                    void uploadEvidence(row, file, true);
                                  event.currentTarget.value = '';
                                }}
                              />
                            </label>
                          </>
                        )}
                      {!oversightMode &&
                        row.lifecycle_status === 'DRAFT' &&
                        can('engineering.ecr.submit') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void act(row, 'submit')}
                          >
                            Submit
                          </Button>
                        )}
                      {!oversightMode &&
                        row.lifecycle_status === 'IMPACT_REVIEW' &&
                        can('engineering.ecr.review') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void review(row)}
                          >
                            Decision
                          </Button>
                        )}
                      {!oversightMode &&
                        row.lifecycle_status === 'IMPACT_REVIEW' &&
                        can('engineering.ecr.disposition') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void act(row, 'approve')}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void act(row, 'return')}
                            >
                              Return
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void act(row, 'reject')}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          window.open(`/api/ecrs/${row.id}/history`, '_blank')
                        }
                      >
                        History
                      </Button>
                      {!oversightMode &&
                        !['APPROVED', 'REJECTED', 'CANCELLED', 'VOID'].includes(
                          row.lifecycle_status
                        ) &&
                        can('engineering.ecr.admin') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void act(row, 'cancel')}
                          >
                            Cancel
                          </Button>
                        )}
                      {!oversightMode &&
                        row.lifecycle_status === 'SUBMITTED' &&
                        can('engineering.ecr.review') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void act(row, 'start-impact-review')}
                          >
                            Review
                          </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!visibleRows.length && (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="text-center text-muted-foreground"
                  >
                    {loading ? 'Loading…' : 'No Engineering Change Requests'}
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
            <DialogTitle>Create Engineering Change Request</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Classification</Label>
                <Select
                  value={classification}
                  onValueChange={setClassification}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['DESIGN', 'SAFETY', 'REGULATORY', 'COST', 'SUPPLIER'].map(
                      (value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Problem or opportunity</Label>
              <Textarea
                value={problem}
                onChange={(event) => setProblem(event.target.value)}
              />
            </div>
            <div>
              <Label>Requested change</Label>
              <Textarea
                value={requestedChange}
                onChange={(event) => setRequestedChange(event.target.value)}
              />
            </div>
            <div>
              <Label>Business justification</Label>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void create()} disabled={!title.trim()}>
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
