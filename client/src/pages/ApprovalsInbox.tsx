import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Clock, AlertTriangle, ShieldAlert, UserPlus } from 'lucide-react';

interface ApprovalRequest {
  id: string;
  requestType: string;
  requestPayload: any;
  subjectType: string | null;
  subjectId: string | null;
  requestedByDisplayName: string;
  requestedByUserId: number | null;
  status: string;
  currentApproverRole: string | null;
  currentApproverUserId: number | null;
  escalationLevel: number;
  currentLevelDeadline: string | null;
  createdAt: string;
}

interface EmployeeOption {
  id: number;
  name: string;
  employeeCode?: string | null;
  department?: string | null;
  userId?: number | null;
}

interface DecisionState {
  notes: string;
  reasonCode: string;
  signature: string;
}

const emptyDecision: DecisionState = { notes: '', reasonCode: '', signature: '' };

const INVENTORY_REQUEST_TYPES = new Set([
  'INV_MANUAL_ADJUSTMENT',
  'INV_NEGATIVE_INVENTORY',
  'INV_ALLOCATION_OVERRIDE',
  'INV_EXPIRED_USE',
  'INV_QUARANTINE_RELEASE',
]);

const INVENTORY_REQUEST_LABELS: Record<string, string> = {
  INV_MANUAL_ADJUSTMENT: 'Manual qty adjustment',
  INV_NEGATIVE_INVENTORY: 'Negative inventory override',
  INV_ALLOCATION_OVERRIDE: 'Allocation override',
  INV_EXPIRED_USE: 'Expired material use',
  INV_QUARANTINE_RELEASE: 'Quarantine release',
};

function InventoryApprovalSummary({
  requestType,
  payload,
}: {
  requestType: string;
  payload: Record<string, any>;
}) {
  const label = INVENTORY_REQUEST_LABELS[requestType] ?? requestType;
  const rows: Array<[string, React.ReactNode]> = [];
  if (payload.internalControlNumber) rows.push(['ICN', payload.internalControlNumber]);
  if (payload.partNumber) rows.push(['Part #', payload.partNumber]);
  if (payload.lotId) rows.push(['Lot ID', String(payload.lotId).slice(0, 8) + '…']);
  if (payload.delta != null)
    rows.push([
      'Delta',
      <span className={Number(payload.delta) < 0 ? 'text-red-600 font-semibold' : 'font-semibold'}>
        {payload.delta > 0 ? '+' : ''}{payload.delta} {payload.unitOfMeasure ?? ''}
      </span>,
    ]);
  if (payload.remainingBefore != null)
    rows.push(['Remaining before', `${payload.remainingBefore} ${payload.unitOfMeasure ?? ''}`]);
  if (payload.projectedAfter != null)
    rows.push([
      'Projected after',
      <span className={Number(payload.projectedAfter) < 0 ? 'text-red-600 font-semibold' : ''}>
        {payload.projectedAfter} {payload.unitOfMeasure ?? ''}
      </span>,
    ]);
  if (payload.qtyUsed != null) rows.push(['Qty to use', String(payload.qtyUsed)]);
  if (payload.availableQty != null) rows.push(['Available qty', String(payload.availableQty)]);
  if (payload.reservedQty != null) rows.push(['Reserved qty', String(payload.reservedQty)]);
  if (payload.expirationDate)
    rows.push(['Expired on', new Date(payload.expirationDate).toLocaleDateString()]);
  if (payload.newStatus) rows.push(['New status', <Badge variant="outline">{payload.newStatus}</Badge>]);
  if (payload.reasonCode) rows.push(['Reason code', payload.reasonCode]);
  if (payload.travelerId) rows.push(['Traveler', String(payload.travelerId).slice(0, 8) + '…']);
  if (payload.performedBy) rows.push(['Requested by', payload.performedBy]);
  if (payload.notes) rows.push(['Operator notes', payload.notes]);

  return (
    <div className="border rounded p-3 bg-muted/30 space-y-2" data-testid="inventory-approval-summary">
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="text-xs">HIGH-RISK INVENTORY</Badge>
        <span className="font-semibold text-sm">{label}</span>
      </div>
      <table className="text-xs w-full">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i} className="border-t border-muted-foreground/20">
              <td className="py-1 pr-3 text-muted-foreground font-medium">{k}</td>
              <td className="py-1" data-testid={`inv-field-${k.toLowerCase().replace(/\s+/g, '-')}`}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApprovalsInbox() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [decision, setDecision] = useState<DecisionState>(emptyDecision);

  const { data: rows = [], isLoading } = useQuery<ApprovalRequest[]>({
    queryKey: ['/api/approvals'],
    refetchInterval: 30000,
  });

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['/api/employees'],
  });

  const { data: detail } = useQuery<{
    request: ApprovalRequest;
    history: any[];
    policy: any;
  } | null>({
    queryKey: ['/api/approvals', selected?.id],
    enabled: !!selected?.id,
  });

  const decide = useMutation({
    mutationFn: async (vars: { id: string; action: 'approve' | 'reject'; body: DecisionState }) =>
      apiRequest(`/api/approvals/${vars.id}/${vars.action}`, {
        method: 'POST',
        body: {
          notes: vars.body.notes || null,
          reasonCode: vars.body.reasonCode || null,
          signature: vars.body.signature || null,
        },
      }),
    onSuccess: (_data, vars) => {
      toast({
        title: vars.action === 'approve' ? 'Approved' : 'Rejected',
        description: `Request ${vars.id.slice(0, 8)} updated.`,
      });
      setSelected(null);
      setDecision(emptyDecision);
      queryClient.invalidateQueries({ queryKey: ['/api/approvals'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Action failed',
        description: err?.message ?? 'Could not record decision',
        variant: 'destructive',
      });
    },
  });

  const assignApproval = useMutation({
    mutationFn: async (vars: { id: string; employeeId: number | null }) =>
      apiRequest(`/api/approvals/${vars.id}/assignment`, {
        method: 'PATCH',
        body: { employeeId: vars.employeeId },
      }),
    onSuccess: (updated: ApprovalRequest) => {
      const assignedEmployee = employees.find((emp) => emp.userId === updated.currentApproverUserId);
      setSelected(updated);
      toast({
        title: assignedEmployee ? 'Approval assigned' : 'Assignment cleared',
        description: assignedEmployee
          ? `${updated.requestType} now appears on ${assignedEmployee.name}'s dashboard.`
          : `${updated.requestType} is back in the role queue.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/approvals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/approvals', updated.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/approvals/my-tasks'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Assignment failed',
        description: err?.message ?? 'Could not assign this approval',
        variant: 'destructive',
      });
    },
  });

  const policy = detail?.policy;
  const requiresSignature = !!policy?.requiresSignature;
  const reasonCodes: string[] = Array.isArray(policy?.reasonCodes) ? policy.reasonCodes : [];
  const selectedRequest = detail?.request ?? selected;
  const assignableEmployees = employees.filter((emp) => emp.userId);
  const assignedEmployeeId =
    selectedRequest?.currentApproverUserId != null
      ? assignableEmployees.find((emp) => emp.userId === selectedRequest.currentApproverUserId)?.id
      : null;

  return (
    <div className="container mx-auto p-4 max-w-7xl" data-testid="page-approvals">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">My Approvals</h1>
        <Link href="/admin/escalation-policies">
          <Button variant="outline" size="sm" data-testid="link-policies">
            Manage policies
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Pending ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && rows.length === 0 && (
              <div className="text-sm text-muted-foreground">No pending approvals 🎉</div>
            )}
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelected(r);
                  setDecision(emptyDecision);
                }}
                className={`w-full text-left p-3 rounded border hover:bg-accent transition-colors ${
                  selected?.id === r.id ? 'bg-accent border-primary' : ''
                }`}
                data-testid={`button-request-${r.id}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="font-medium text-sm">{r.requestType}</div>
                  <DeadlineBadge deadline={r.currentLevelDeadline} level={r.escalationLevel} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {r.subjectType && r.subjectId
                    ? `${r.subjectType}#${r.subjectId}`
                    : 'no subject'}
                </div>
                <div className="text-xs text-muted-foreground">
                  by {r.requestedByDisplayName} · L{r.escalationLevel} ·{' '}
                  {r.currentApproverRole ?? '—'}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {selected ? `${selected.requestType} — ${selected.id.slice(0, 8)}` : 'Select a request'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && (
              <div className="text-sm text-muted-foreground">
                Choose a pending approval from the list to review and act on it.
              </div>
            )}
            {selectedRequest && (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <Badge variant="outline" data-testid="text-status">{selectedRequest.status}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Level:</span> {selectedRequest.escalationLevel}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Approver role:</span>{' '}
                    {selectedRequest.currentApproverRole ?? '—'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Requested by:</span>{' '}
                    {selectedRequest.requestedByDisplayName}
                  </div>
                </div>

                <div className="rounded border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <UserPlus className="h-4 w-4" />
                    Assign approval task
                  </div>
                  <Select
                    value={assignedEmployeeId ? String(assignedEmployeeId) : 'none'}
                    onValueChange={(value) =>
                      assignApproval.mutate({
                        id: selectedRequest.id,
                        employeeId: value === 'none' ? null : Number(value),
                      })
                    }
                    disabled={assignApproval.isPending}
                  >
                    <SelectTrigger data-testid="select-approval-assignee">
                      <SelectValue placeholder="Send to employee dashboard" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Role queue only</SelectItem>
                      {assignableEmployees.map((emp) => {
                        const isRequester = emp.userId === selectedRequest.requestedByUserId;
                        return (
                          <SelectItem
                            key={emp.id}
                            value={String(emp.id)}
                            disabled={isRequester}
                          >
                            {emp.name}
                            {emp.employeeCode ? ` (${emp.employeeCode})` : ''}
                            {isRequester ? ' - requester' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Assigned approvals appear as tasks on the linked employee dashboard.
                  </p>
                </div>

                {INVENTORY_REQUEST_TYPES.has(selectedRequest.requestType) ? (
                  <InventoryApprovalSummary
                    requestType={selectedRequest.requestType}
                    payload={selectedRequest.requestPayload ?? {}}
                  />
                ) : (
                  selectedRequest.requestPayload && Object.keys(selectedRequest.requestPayload).length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">Payload</div>
                      <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-48">
                        {JSON.stringify(selectedRequest.requestPayload, null, 2)}
                      </pre>
                    </div>
                  )
                )}

                {detail?.history && detail.history.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">History</div>
                    <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
                      {detail.history.map((h: any) => (
                        <li key={h.id} className="border-l-2 border-muted-foreground/30 pl-2">
                          <span className="font-medium">{h.event}</span>{' '}
                          <span className="text-muted-foreground">
                            L{h.fromLevel ?? '-'}→L{h.toLevel ?? '-'} ·{' '}
                            {new Date(h.occurredAt).toLocaleString()} ·{' '}
                            {h.actorDisplayName ?? 'system'}
                          </span>
                          {h.notes && <div className="ml-2 italic">{h.notes}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t">
                  {reasonCodes.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold">Reason code</label>
                      <Select
                        value={decision.reasonCode}
                        onValueChange={(v) => setDecision((d) => ({ ...d, reasonCode: v }))}
                      >
                        <SelectTrigger data-testid="select-reason-code">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {reasonCodes.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold">Notes</label>
                    <Textarea
                      value={decision.notes}
                      onChange={(e) => setDecision((d) => ({ ...d, notes: e.target.value }))}
                      placeholder="Required for rejection"
                      data-testid="input-notes"
                    />
                  </div>
                  {requiresSignature && (
                    <div>
                      <label className="text-xs font-semibold">Signature (type your name)</label>
                      <Input
                        value={decision.signature}
                        onChange={(e) => setDecision((d) => ({ ...d, signature: e.target.value }))}
                        placeholder="Required for approval"
                        data-testid="input-signature"
                      />
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() =>
                        decide.mutate({ id: selectedRequest.id, action: 'approve', body: decision })
                      }
                      disabled={
                        decide.isPending || (requiresSignature && !decision.signature)
                      }
                      data-testid="button-approve"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        decide.mutate({ id: selectedRequest.id, action: 'reject', body: decision })
                      }
                      disabled={
                        decide.isPending || (!decision.notes && !decision.reasonCode)
                      }
                      data-testid="button-reject"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DeadlineBadge({ deadline, level }: { deadline: string | null; level: number }) {
  if (!deadline) return <Badge variant="outline">L{level}</Badge>;
  const ms = new Date(deadline).getTime() - Date.now();
  const overdue = ms <= 0;
  const hrs = Math.abs(ms) / 3_600_000;
  if (overdue) {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <ShieldAlert className="h-3 w-3" /> overdue
      </Badge>
    );
  }
  if (hrs < 2) {
    return (
      <Badge variant="default" className="text-xs gap-1 bg-amber-500">
        <AlertTriangle className="h-3 w-3" />
        {hrs.toFixed(1)}h
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs gap-1">
      <Clock className="h-3 w-3" />
      {hrs.toFixed(1)}h
    </Badge>
  );
}
