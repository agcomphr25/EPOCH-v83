import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, CheckCircle2, XCircle, ShieldAlert, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Status = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED_TO_PO' | 'CANCELLED';

interface Requisition {
  id: number;
  reqNumber: string;
  status: Status;
  category: string;
  vendorId: number | null;
  estimatedTotal: string;
  needByDate: string | null;
  justification: string;
  competitionMethod: string;
  soleSourceJustification: string | null;
  requestedByDisplayName: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface Line {
  description: string;
  partNumber?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  notes?: string;
}

const statusBadge = (s: Status) => {
  const map: Record<Status, string> = {
    DRAFT: 'bg-gray-200 text-gray-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
    CONVERTED_TO_PO: 'bg-purple-100 text-purple-800',
    CANCELLED: 'bg-yellow-100 text-yellow-800',
  };
  return <Badge className={map[s] ?? ''}>{s}</Badge>;
};

function CreateRequisitionDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: 'default',
    vendorId: '',
    projectId: '',
    chargeCodeId: '',
    needByDate: '',
    justification: '',
    competitionMethod: 'competed' as 'competed' | 'sole-source' | 'small-purchase' | 'exception',
    soleSourceJustification: '',
    estimatedTotal: 0,
  });
  const [lines, setLines] = useState<Line[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ]);

  const create = useMutation({
    mutationFn: async () => {
      const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
      return apiRequest('/api/purchase-requisitions', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          vendorId: form.vendorId ? Number(form.vendorId) : null,
          projectId: form.projectId || null,
          chargeCodeId: form.chargeCodeId ? Number(form.chargeCodeId) : null,
          needByDate: form.needByDate || null,
          estimatedTotal: total,
          lines: lines.map((l) => ({
            description: l.description,
            partNumber: l.partNumber || null,
            quantity: Number(l.quantity),
            unit: l.unit || null,
            unitPrice: Number(l.unitPrice),
            notes: l.notes || null,
          })),
        }),
      });
    },
    onSuccess: () => {
      toast.success('Requisition created (DRAFT). Submit it for approval when ready.');
      setOpen(false);
      onCreated();
      setLines([{ description: '', quantity: 1, unitPrice: 0 }]);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Create failed'),
  });

  const updateLine = (i: number, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-requisition"><Plus className="w-4 h-4 mr-1" />New Requisition</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Purchase Requisition</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="input-req-category" />
            </div>
            <div>
              <Label>Vendor ID (optional)</Label>
              <Input type="number" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} data-testid="input-req-vendor" />
            </div>
            <div>
              <Label>Project ID <span className="text-red-500">*</span></Label>
              <Input value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} placeholder="UUID of the cost-bearing project" data-testid="input-req-project" />
            </div>
            <div>
              <Label>Charge Code ID <span className="text-red-500">*</span></Label>
              <Input type="number" value={form.chargeCodeId} onChange={(e) => setForm({ ...form, chargeCodeId: e.target.value })} placeholder="Numeric charge code id" data-testid="input-req-charge-code" />
            </div>
            <div>
              <Label>Need-By Date</Label>
              <Input type="date" value={form.needByDate} onChange={(e) => setForm({ ...form, needByDate: e.target.value })} data-testid="input-req-need-by" />
            </div>
            <div>
              <Label>Competition Method</Label>
              <Select value={form.competitionMethod} onValueChange={(v: any) => setForm({ ...form, competitionMethod: v })}>
                <SelectTrigger data-testid="select-competition-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="competed">Competed</SelectItem>
                  <SelectItem value="sole-source">Sole-Source</SelectItem>
                  <SelectItem value="small-purchase">Small Purchase</SelectItem>
                  <SelectItem value="exception">Exception</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Justification</Label>
            <Textarea
              value={form.justification}
              onChange={(e) => setForm({ ...form, justification: e.target.value })}
              placeholder="Why is this purchase needed? (≥10 chars)"
              rows={3}
              data-testid="input-req-justification"
            />
          </div>
          {form.competitionMethod === 'sole-source' && (
            <div>
              <Label>Sole-Source Justification</Label>
              <Textarea
                value={form.soleSourceJustification}
                onChange={(e) => setForm({ ...form, soleSourceJustification: e.target.value })}
                placeholder="Why is competition not feasible?"
                rows={3}
                data-testid="input-req-sole-source"
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line Items</Label>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setLines([...lines, { description: '', quantity: 1, unitPrice: 0 }])}
                data-testid="button-add-line">
                <Plus className="w-3 h-3 mr-1" />Add Line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end" data-testid={`row-line-${i}`}>
                  <div className="col-span-5">
                    <Label className="text-xs">Description</Label>
                    <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Unit Price</Label>
                    <Input type="number" step="0.01" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Part #</Label>
                    <Input value={l.partNumber ?? ''} onChange={(e) => updateLine(i, { partNumber: e.target.value })} />
                  </div>
                  <div className="col-span-1">
                    <Button type="button" size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} data-testid={`button-remove-line-${i}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right text-sm text-muted-foreground mt-2" data-testid="text-estimated-total">
              Estimated Total: ${lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0).toFixed(2)}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending} data-testid="button-create-requisition">
            {create.isPending ? 'Creating...' : 'Create Requisition'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequisitionRow({ r, onChange }: { r: Requisition; onChange: () => void }) {
  const [showApprove, setShowApprove] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [notes, setNotes] = useState('');
  const [debarmentResult, setDebarmentResult] = useState<'pass' | 'fail' | 'inconclusive'>('pass');
  const [debarmentSource, setDebarmentSource] = useState<'sam.gov' | 'manual_attestation' | 'document_upload'>('manual_attestation');
  const [debarmentAttestation, setDebarmentAttestation] = useState('');

  const submit = useMutation({
    mutationFn: () => apiRequest(`/api/purchase-requisitions/${r.id}/submit`, { method: 'POST' }),
    onSuccess: () => { toast.success(`${r.reqNumber} submitted for approval`); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? 'Submit failed'),
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => apiRequest(`/api/purchase-requisitions/${r.id}/cancel`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
    onSuccess: () => { toast.success(`${r.reqNumber} cancelled`); onChange(); },
  });

  const decide = useMutation({
    mutationFn: () => apiRequest(`/api/purchase-requisitions/${r.id}/decide`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        notes,
        debarmentCheck: r.vendorId && decision === 'approved' ? {
          source: debarmentSource,
          result: debarmentResult,
          attestationText: debarmentAttestation || null,
        } : undefined,
      }),
    }),
    onSuccess: () => { toast.success(`Decision recorded: ${decision}`); setShowApprove(false); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? 'Decision failed'),
  });

  return (
    <tr className="border-b hover:bg-muted/50" data-testid={`row-req-${r.id}`}>
      <td className="p-2 font-mono text-sm">{r.reqNumber}</td>
      <td className="p-2">{statusBadge(r.status)}</td>
      <td className="p-2">{r.category}</td>
      <td className="p-2 text-right">${Number(r.estimatedTotal).toFixed(2)}</td>
      <td className="p-2">{r.competitionMethod}</td>
      <td className="p-2 text-xs text-muted-foreground">{r.requestedByDisplayName ?? '—'}</td>
      <td className="p-2 text-xs">{r.needByDate ?? '—'}</td>
      <td className="p-2 text-right space-x-1">
        {r.status === 'DRAFT' && (
          <>
            <Button size="sm" variant="outline" onClick={() => submit.mutate()} disabled={submit.isPending} data-testid={`button-submit-${r.id}`}>
              <Send className="w-3 h-3 mr-1" />Submit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate('User cancelled draft')}>Cancel</Button>
          </>
        )}
        {r.status === 'SUBMITTED' && (
          <Dialog open={showApprove} onOpenChange={setShowApprove}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid={`button-decide-${r.id}`}>Review</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Review {r.reqNumber}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><strong>Justification:</strong> <span className="text-sm">{r.justification}</span></div>
                {r.soleSourceJustification && <div><strong>Sole-Source:</strong> <span className="text-sm">{r.soleSourceJustification}</span></div>}
                <div>
                  <Label>Decision</Label>
                  <Select value={decision} onValueChange={(v: any) => setDecision(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approve</SelectItem>
                      <SelectItem value="rejected">Reject</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes / Reason</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
                {r.vendorId && decision === 'approved' && (
                  <Card className="border-amber-300 bg-amber-50">
                    <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4" />Debarment Check Evidence (final-stage only)</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Source</Label>
                          <Select value={debarmentSource} onValueChange={(v: any) => setDebarmentSource(v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manual_attestation">Manual Attestation</SelectItem>
                              <SelectItem value="document_upload">Document Upload</SelectItem>
                              <SelectItem value="sam.gov">SAM.gov</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Result</Label>
                          <Select value={debarmentResult} onValueChange={(v: any) => setDebarmentResult(v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pass">Pass — vendor not debarred</SelectItem>
                              <SelectItem value="fail">Fail — vendor debarred</SelectItem>
                              <SelectItem value="inconclusive">Inconclusive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Attestation / Notes</Label>
                        <Textarea value={debarmentAttestation} onChange={(e) => setDebarmentAttestation(e.target.value)} rows={2} placeholder="I attest the SAM.gov check on (date) returned no exclusion..." />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowApprove(false)}>Cancel</Button>
                <Button onClick={() => decide.mutate()} disabled={decide.isPending} data-testid={`button-confirm-decision-${r.id}`}>
                  {decision === 'approved' ? <><CheckCircle2 className="w-4 h-4 mr-1" />Approve</> : <><XCircle className="w-4 h-4 mr-1" />Reject</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </td>
    </tr>
  );
}

export default function PurchaseRequisitionsPage() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['/api/purchase-requisitions'] });
    qc.invalidateQueries({ queryKey: ['/api/purchase-requisitions/pending-approval'] });
  };

  const all = useQuery<Requisition[]>({ queryKey: ['/api/purchase-requisitions'] });
  const pending = useQuery<any[]>({ queryKey: ['/api/purchase-requisitions/pending-approval'] });

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchase Requisitions</h1>
          <p className="text-sm text-muted-foreground">Requisition → approval → PO chain with FAR flowdowns and debarment evidence.</p>
        </div>
        <CreateRequisitionDialog onCreated={refresh} />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">My Pending Approvals ({pending.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All Requisitions</TabsTrigger>
          <TabsTrigger value="by-stage" data-testid="tab-by-stage">Admin: By Stage</TabsTrigger>
        </TabsList>
        <TabsContent value="by-stage">
          <AdminByStagePanel />
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardContent className="p-0">
              {pending.isLoading ? (
                <div className="p-6 text-center text-muted-foreground">Loading...</div>
              ) : (pending.data?.length ?? 0) === 0 ? (
                <div className="p-6 text-center text-muted-foreground">No requisitions awaiting your approval.</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs">
                      <th className="p-2">Req #</th><th className="p-2">Status</th><th className="p-2">Category</th>
                      <th className="p-2 text-right">Total</th><th className="p-2">Method</th>
                      <th className="p-2">Requester</th><th className="p-2">Need-By</th><th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.data!.map((r: any) => <RequisitionRow key={r.id} r={r} onChange={refresh} />)}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all">
          <Card>
            <CardContent className="p-0">
              {all.isLoading ? (
                <div className="p-6 text-center text-muted-foreground">Loading...</div>
              ) : (all.data?.length ?? 0) === 0 ? (
                <div className="p-6 text-center text-muted-foreground">No requisitions yet.</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs">
                      <th className="p-2">Req #</th><th className="p-2">Status</th><th className="p-2">Category</th>
                      <th className="p-2 text-right">Total</th><th className="p-2">Method</th>
                      <th className="p-2">Requester</th><th className="p-2">Need-By</th><th className="p-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.data!.map((r) => <RequisitionRow key={r.id} r={r} onChange={refresh} />)}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Task #83: Admin pending-by-stage queue with aging/escalation indicators.
function AdminByStagePanel() {
  const [agingDays, setAgingDays] = useState(5);
  const q = useQuery<{ agingThresholdDays: number; stages: Record<string, any[]>; totals: Record<string, any> }>({
    queryKey: ['/api/purchase-requisitions/admin/pending-by-stage', agingDays],
    queryFn: () => apiRequest(`/api/purchase-requisitions/admin/pending-by-stage?agingDays=${agingDays}`),
  });
  if (q.isLoading) return <div className="p-6">Loading…</div>;
  if (q.isError) return <div className="p-6 text-red-600">{(q.error as any)?.message ?? 'Load failed'}</div>;
  const data = q.data!;
  const keys = Object.keys(data.stages);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Label htmlFor="aging-days">Aging threshold (days)</Label>
        <Input id="aging-days" type="number" className="w-24" value={agingDays}
          onChange={(e) => setAgingDays(Math.max(1, parseInt(e.target.value) || 5))}
          data-testid="input-aging-days" />
      </div>
      {keys.length === 0 && <div className="text-sm text-muted-foreground p-4">No pending requisitions.</div>}
      {keys.map((k) => {
        const t = data.totals[k];
        const rows = data.stages[k];
        return (
          <Card key={k} data-testid={`card-stage-${k}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{k}</div>
                <div className="text-xs text-muted-foreground">
                  {t.count} pending • {t.escalatedCount} escalated • max age {t.maxAgeDays}d
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr className="text-left">
                    <th className="p-1">Req #</th><th className="p-1">Requester</th>
                    <th className="p-1 text-right">Total</th><th className="p-1">Age</th><th className="p-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id} className={r.escalated ? 'bg-red-50' : ''} data-testid={`row-stage-req-${r.id}`}>
                      <td className="p-1 font-mono">{r.reqNumber}</td>
                      <td className="p-1">{r.requestedByDisplayName ?? '—'}</td>
                      <td className="p-1 text-right">${Number(r.estimatedTotal).toFixed(2)}</td>
                      <td className="p-1">{r.ageDays}d</td>
                      <td className="p-1">{r.escalated ? <Badge className="bg-red-100 text-red-800">ESCALATED</Badge> : <Badge className="bg-blue-100 text-blue-800">pending</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
