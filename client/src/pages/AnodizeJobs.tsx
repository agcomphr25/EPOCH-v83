import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Send, Package, CheckCircle, AlertTriangle, RotateCcw, Beaker, FileText, ClipboardCheck, Trash2, ShieldCheck, ShieldX } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnodizeJob {
  id: number;
  routingOperationId: number;
  travelerId: string | null;
  travelerStepId: string | null;
  partRoutingId: string | null;
  partNumber: string;
  partName: string;
  quantity: number;
  vendorId: number | null;
  vendorRef: string | null;
  anodizeType: string | null;
  finishSpec: string | null;
  color: string | null;
  status: 'PENDING' | 'READY_TO_SEND' | 'SENT' | 'RECEIVED' | 'VERIFIED' | 'HOLD' | 'CANCELLED';
  sentAt: string | null;
  sentBy: string | null;
  vendorPoNumber: string | null;
  expectedReturnDate: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  certReceived: boolean;
  inspectionPassed: boolean;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface AnodizeJobDocument {
  id: number;
  anodizeJobId: number;
  documentType: 'CERT' | 'COC' | 'PROCESS_CERT' | 'THICKNESS_REPORT' | 'PACKING_SLIP' | 'OTHER';
  fileName: string;
  fileUrl: string | null;
  uploadedAt: string | null;
  uploadedBy: string | null;
  notes: string | null;
  isRequired: boolean;
  isAccepted: boolean;
}

interface AnodizeJobReceivingInspection {
  id: number;
  anodizeJobId: number;
  inspectionStatus: 'PENDING' | 'PASS' | 'FAIL';
  inspectedAt: string | null;
  inspectedBy: string | null;
  notes: string | null;
  thicknessVerified: boolean;
  colorVerified: boolean;
  damageFree: boolean;
  quantityVerified: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

interface AnodizeJobCompletionResult {
  jobId: number;
  clear: boolean;
  status: string;
  reasons: string[];
  certRequired: boolean;
  certSatisfied: boolean;
  inspectionRequired: boolean;
  inspectionSatisfied: boolean;
  requiredDocsCount: number;
  acceptedRequiredDocsCount: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  READY_TO_SEND: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  SENT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  RECEIVED: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  VERIFIED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  HOLD: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

const INSPECTION_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  PASS: 'bg-green-100 text-green-700',
  FAIL: 'bg-red-100 text-red-700',
};

const ANODIZE_STATUSES = ['PENDING', 'READY_TO_SEND', 'SENT', 'RECEIVED', 'VERIFIED', 'HOLD', 'CANCELLED'];
const DOC_TYPES = ['CERT', 'COC', 'PROCESS_CERT', 'THICKNESS_REPORT', 'PACKING_SLIP', 'OTHER'];

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? ''}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function ClearBadge({ completion }: { completion: AnodizeJobCompletionResult | null | undefined }) {
  if (!completion) return null;
  if (completion.clear) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
        <ShieldCheck className="h-3 w-3" /> Ready to Clear
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
      <ShieldX className="h-3 w-3" /> Blocked
    </span>
  );
}

// ─── Job detail panel sub-components ─────────────────────────────────────────

function DocumentsPanel({ jobId }: { jobId: number }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ documentType: 'CERT', fileName: '', fileUrl: '', uploadedBy: '', notes: '', isRequired: false });

  const { data: docs = [], isLoading } = useQuery<AnodizeJobDocument[]>({
    queryKey: ['/api/anodize-jobs', jobId, 'documents'],
    queryFn: () => fetch(`/api/anodize-jobs/${jobId}/documents`).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (data: object) => apiRequest('POST', `/api/anodize-jobs/${jobId}/documents`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs', jobId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs', jobId, 'completion-status'] });
      setAddOpen(false);
      setForm({ documentType: 'CERT', fileName: '', fileUrl: '', uploadedBy: '', notes: '', isRequired: false });
      toast({ title: 'Document added' });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const acceptMutation = useMutation({
    mutationFn: ({ docId, isAccepted }: { docId: number; isAccepted: boolean }) =>
      apiRequest('PUT', `/api/anodize-jobs/documents/${docId}`, { isAccepted }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs', jobId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs', jobId, 'completion-status'] });
      toast({ title: 'Document updated' });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => apiRequest('DELETE', `/api/anodize-jobs/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs', jobId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs', jobId, 'completion-status'] });
      toast({ title: 'Document removed' });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-gray-500">{docs.length} document(s)</span>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setAddOpen(true)}>
          <Plus className="h-3 w-3" /> Add Document
        </Button>
      </div>

      {isLoading ? (
        <div className="text-xs text-gray-400 py-2">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="text-xs text-gray-400 py-3 text-center border-2 border-dashed rounded">No documents attached</div>
      ) : (
        <div className="space-y-1">
          {docs.map(doc => (
            <div key={doc.id} className="flex items-center gap-2 p-2 border rounded text-xs">
              <FileText className="h-3 w-3 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{doc.fileName}</span>
                  <span className="text-gray-400">{doc.documentType}</span>
                  {doc.isRequired && <span className="text-orange-500 text-[10px] font-medium">REQUIRED</span>}
                  {doc.isAccepted && <span className="text-green-600 text-[10px] font-medium">✓ ACCEPTED</span>}
                </div>
                {doc.uploadedBy && <div className="text-gray-400">by {doc.uploadedBy}</div>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => acceptMutation.mutate({ docId: doc.id, isAccepted: !doc.isAccepted })}
                  disabled={acceptMutation.isPending}
                >
                  {doc.isAccepted ? 'Unaccept' : 'Accept'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1 text-red-500 hover:text-red-700"
                  onClick={() => deleteMutation.mutate(doc.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Type</Label>
              <Select value={form.documentType} onValueChange={v => setForm(p => ({ ...p, documentType: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>File Name <span className="text-red-500">*</span></Label>
              <Input value={form.fileName} onChange={e => setForm(p => ({ ...p, fileName: e.target.value }))} placeholder="e.g. cert_of_conformance.pdf" />
            </div>
            <div>
              <Label>File URL / Path</Label>
              <Input value={form.fileUrl} onChange={e => setForm(p => ({ ...p, fileUrl: e.target.value }))} placeholder="Optional link" />
            </div>
            <div>
              <Label>Uploaded By</Label>
              <Input value={form.uploadedBy} onChange={e => setForm(p => ({ ...p, uploadedBy: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="isRequired" checked={form.isRequired} onCheckedChange={v => setForm(p => ({ ...p, isRequired: !!v }))} />
              <Label htmlFor="isRequired">Mark as required for job clearance</Label>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              disabled={addMutation.isPending || !form.fileName}
              onClick={() => addMutation.mutate({
                documentType: form.documentType,
                fileName: form.fileName,
                fileUrl: form.fileUrl || null,
                uploadedBy: form.uploadedBy || null,
                notes: form.notes || null,
                isRequired: form.isRequired,
              })}
            >
              {addMutation.isPending ? 'Adding…' : 'Add Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InspectionPanel({ jobId }: { jobId: number }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    inspectionStatus: 'PENDING' as 'PENDING' | 'PASS' | 'FAIL',
    inspectedBy: '',
    notes: '',
    thicknessVerified: false,
    colorVerified: false,
    damageFree: false,
    quantityVerified: false,
  });

  const { data: inspection, isLoading, refetch } = useQuery<AnodizeJobReceivingInspection | null>({
    queryKey: ['/api/anodize-jobs', jobId, 'receiving-inspection'],
    queryFn: () => fetch(`/api/anodize-jobs/${jobId}/receiving-inspection`).then(r => r.json()),
  });

  const upsertMutation = useMutation({
    mutationFn: (data: object) => apiRequest('PUT', `/api/anodize-jobs/${jobId}/receiving-inspection`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs', jobId, 'receiving-inspection'] });
      queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs', jobId, 'completion-status'] });
      setEditing(false);
      toast({ title: 'Inspection saved' });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const openEdit = () => {
    if (inspection) {
      setForm({
        inspectionStatus: inspection.inspectionStatus,
        inspectedBy: inspection.inspectedBy ?? '',
        notes: inspection.notes ?? '',
        thicknessVerified: inspection.thicknessVerified,
        colorVerified: inspection.colorVerified,
        damageFree: inspection.damageFree,
        quantityVerified: inspection.quantityVerified,
      });
    }
    setEditing(true);
  };

  if (isLoading) return <div className="text-xs text-gray-400 py-2">Loading…</div>;

  return (
    <div>
      {!inspection ? (
        <div className="text-center py-3 border-2 border-dashed rounded">
          <p className="text-xs text-gray-400 mb-2">No receiving inspection recorded</p>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={openEdit}>
            <ClipboardCheck className="h-3 w-3" /> Start Inspection
          </Button>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium ${INSPECTION_COLORS[inspection.inspectionStatus]}`}>
              {inspection.inspectionStatus}
            </span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={openEdit}>Edit</Button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {[
              { label: 'Thickness', val: inspection.thicknessVerified },
              { label: 'Color', val: inspection.colorVerified },
              { label: 'Damage Free', val: inspection.damageFree },
              { label: 'Qty Verified', val: inspection.quantityVerified },
            ].map(({ label, val }) => (
              <div key={label} className={`flex items-center gap-1 ${val ? 'text-green-600' : 'text-gray-400'}`}>
                {val ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {label}
              </div>
            ))}
          </div>
          {inspection.inspectedBy && <div className="text-gray-500">Inspected by {inspection.inspectedBy}</div>}
          {inspection.notes && <div className="text-gray-500 bg-gray-50 dark:bg-gray-800 rounded p-1">{inspection.notes}</div>}
        </div>
      )}

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receiving Inspection</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Result</Label>
              <Select value={form.inspectionStatus} onValueChange={v => setForm(p => ({ ...p, inspectionStatus: v as any }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">PENDING</SelectItem>
                  <SelectItem value="PASS">PASS</SelectItem>
                  <SelectItem value="FAIL">FAIL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Inspected By</Label>
              <Input value={form.inspectedBy} onChange={e => setForm(p => ({ ...p, inspectedBy: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'thicknessVerified', label: 'Thickness OK' },
                { key: 'colorVerified', label: 'Color OK' },
                { key: 'damageFree', label: 'Damage Free' },
                { key: 'quantityVerified', label: 'Qty Verified' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={key}
                    checked={(form as any)[key]}
                    onCheckedChange={v => setForm(p => ({ ...p, [key]: !!v }))}
                  />
                  <Label htmlFor={key}>{label}</Label>
                </div>
              ))}
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button
              disabled={upsertMutation.isPending}
              onClick={() => upsertMutation.mutate({
                inspectionStatus: form.inspectionStatus,
                inspectedBy: form.inspectedBy || null,
                inspectedAt: form.inspectionStatus !== 'PENDING' ? new Date().toISOString() : null,
                notes: form.notes || null,
                thicknessVerified: form.thicknessVerified,
                colorVerified: form.colorVerified,
                damageFree: form.damageFree,
                quantityVerified: form.quantityVerified,
              })}
            >
              {upsertMutation.isPending ? 'Saving…' : 'Save Inspection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompletionStatusBar({ jobId }: { jobId: number }) {
  const { data: completion } = useQuery<AnodizeJobCompletionResult>({
    queryKey: ['/api/anodize-jobs', jobId, 'completion-status'],
    queryFn: () => fetch(`/api/anodize-jobs/${jobId}/completion-status`).then(r => r.json()),
  });

  if (!completion) return null;

  return (
    <div className={`rounded p-2 text-xs border ${completion.clear ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'}`}>
      <div className="flex items-center gap-2 font-medium mb-1">
        {completion.clear
          ? <><ShieldCheck className="h-3.5 w-3.5 text-green-600" /><span className="text-green-700 dark:text-green-400">Ready to Clear</span></>
          : <><ShieldX className="h-3.5 w-3.5 text-amber-600" /><span className="text-amber-700 dark:text-amber-400">Blocking — requirements not met</span></>
        }
      </div>
      {!completion.clear && completion.reasons.length > 0 && (
        <ul className="space-y-0.5 text-amber-600 dark:text-amber-400">
          {completion.reasons.map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
      )}
      <div className="flex gap-3 mt-1.5 text-gray-500">
        {completion.certRequired && (
          <span>{completion.certSatisfied ? '✓' : '✗'} Cert required ({completion.acceptedRequiredDocsCount}/{completion.requiredDocsCount} accepted)</span>
        )}
        {completion.inspectionRequired && (
          <span>{completion.inspectionSatisfied ? '✓' : '✗'} Inspection required</span>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnodizeJobs() {
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPart, setFilterPart] = useState<string>('');
  const [selectedJob, setSelectedJob] = useState<AnodizeJob | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<{ type: 'send' | 'receive' | 'verify'; job: AnodizeJob } | null>(null);

  const [createForm, setCreateForm] = useState({
    routingOperationId: '', partNumber: '', partName: '', quantity: '1',
    vendorRef: '', anodizeType: '', finishSpec: '', color: '', notes: '', expectedReturnDate: '',
  });

  const [actionForm, setActionForm] = useState({
    sentBy: '', vendorPoNumber: '', receivedBy: '', certReceived: false, inspectionPassed: true, notes: '',
  });

  const buildQs = () => {
    const p = new URLSearchParams();
    if (filterStatus) p.set('status', filterStatus);
    if (filterPart) p.set('partNumber', filterPart);
    return p.toString();
  };

  const { data: jobs = [], isLoading } = useQuery<AnodizeJob[]>({
    queryKey: ['/api/anodize-jobs', filterStatus, filterPart],
    queryFn: () => fetch(`/api/anodize-jobs?${buildQs()}`).then(r => r.json()),
  });

  // Per-job completion status (for the table badges)
  const completionQueries = useQuery<Record<number, AnodizeJobCompletionResult>>({
    queryKey: ['/api/anodize-jobs/completion-batch', jobs.map(j => j.id).join(',')],
    queryFn: async () => {
      if (jobs.length === 0) return {};
      const results = await Promise.all(
        jobs.map(j => fetch(`/api/anodize-jobs/${j.id}/completion-status`).then(r => r.json()).catch(() => null))
      );
      return Object.fromEntries(jobs.map((j, i) => [j.id, results[i]]));
    },
    enabled: jobs.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => apiRequest('POST', '/api/anodize-jobs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs'] });
      setCreateOpen(false);
      setCreateForm({ routingOperationId: '', partNumber: '', partName: '', quantity: '1', vendorRef: '', anodizeType: '', finishSpec: '', color: '', notes: '', expectedReturnDate: '' });
      toast({ title: 'Anodize job created' });
    },
    onError: (e: any) => toast({ title: 'Failed to create job', description: e.message, variant: 'destructive' }),
  });

  const sendMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => apiRequest('POST', `/api/anodize-jobs/${id}/send`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs'] }); setActionDialog(null); toast({ title: 'Job marked as sent' }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const receiveMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => apiRequest('POST', `/api/anodize-jobs/${id}/receive`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs'] }); setActionDialog(null); toast({ title: 'Job marked as received' }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => apiRequest('POST', `/api/anodize-jobs/${id}/verify`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/anodize-jobs'] }); setActionDialog(null); toast({ title: 'Job verified' }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const handleAction = () => {
    if (!actionDialog) return;
    const { type, job } = actionDialog;
    if (type === 'send') sendMutation.mutate({ id: job.id, data: { sentBy: actionForm.sentBy, vendorPoNumber: actionForm.vendorPoNumber || undefined } });
    else if (type === 'receive') receiveMutation.mutate({ id: job.id, data: { receivedBy: actionForm.receivedBy, certReceived: actionForm.certReceived } });
    else verifyMutation.mutate({ id: job.id, data: { inspectionPassed: actionForm.inspectionPassed, notes: actionForm.notes || undefined } });
  };

  const canSend = (j: AnodizeJob) => ['PENDING', 'READY_TO_SEND'].includes(j.status);
  const canReceive = (j: AnodizeJob) => j.status === 'SENT';
  const canVerify = (j: AnodizeJob) => j.status === 'RECEIVED';

  const openAction = (type: 'send' | 'receive' | 'verify', job: AnodizeJob) => {
    setActionForm({ sentBy: '', vendorPoNumber: '', receivedBy: '', certReceived: false, inspectionPassed: true, notes: '' });
    setActionDialog({ type, job });
  };

  const openDetail = (job: AnodizeJob) => { setSelectedJob(job); setDetailOpen(true); };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Beaker className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Anodize Jobs</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Outside process tracking for anodizing operations</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Job
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Status</Label>
              <Select value={filterStatus || 'ALL'} onValueChange={v => setFilterStatus(v === 'ALL' ? '' : v)}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {ANODIZE_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Part Number</Label>
              <Input className="h-8 text-sm w-44" placeholder="Filter by part…" value={filterPart} onChange={e => setFilterPart(e.target.value)} />
            </div>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setFilterStatus(''); setFilterPart(''); }}>
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Pending / Ready', statuses: ['PENDING', 'READY_TO_SEND'], color: 'text-gray-600' },
          { label: 'Sent', statuses: ['SENT'], color: 'text-yellow-600' },
          { label: 'Received', statuses: ['RECEIVED'], color: 'text-purple-600' },
          { label: 'Verified', statuses: ['VERIFIED'], color: 'text-green-600' },
        ].map(({ label, statuses, color }) => (
          <Card key={label}>
            <CardContent className="p-3 text-center">
              <div className={`text-2xl font-bold ${color}`}>{jobs.filter(j => statuses.includes(j.status)).length}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Jobs table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-10 text-gray-400">Loading…</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Beaker className="h-10 w-10 mx-auto mb-2 opacity-30" />
              No anodize jobs found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Type / Finish</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Clearance</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map(job => {
                  const completion = completionQueries.data?.[job.id];
                  return (
                    <TableRow key={job.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => openDetail(job)}>
                      <TableCell className="font-mono text-xs text-gray-400">{job.id}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{job.partNumber}</div>
                        <div className="text-xs text-gray-500">{job.partName}</div>
                      </TableCell>
                      <TableCell className="text-sm">{job.quantity}</TableCell>
                      <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                        {job.vendorRef ?? (job.vendorId ? `#${job.vendorId}` : '—')}
                      </TableCell>
                      <TableCell className="text-sm">
                        {[job.anodizeType, job.finishSpec, job.color].filter(Boolean).join(' / ') || '—'}
                      </TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell><ClearBadge completion={completion} /></TableCell>
                      <TableCell className="text-sm text-gray-500">{job.expectedReturnDate ?? '—'}</TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {canSend(job) && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => openAction('send', job)}>
                              <Send className="h-3 w-3" /> Send
                            </Button>
                          )}
                          {canReceive(job) && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => openAction('receive', job)}>
                              <Package className="h-3 w-3" /> Receive
                            </Button>
                          )}
                          {canVerify(job) && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => openAction('verify', job)}>
                              <CheckCircle className="h-3 w-3" /> Verify
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Job detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Anodize Job #{selectedJob?.id} — {selectedJob?.partNumber}</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-3">
              {/* Completion status bar */}
              <CompletionStatusBar jobId={selectedJob.id} />

              {/* Basic info */}
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-gray-500">Status:</span> <StatusBadge status={selectedJob.status} /></div>
                <div><span className="text-gray-500">Qty:</span> {selectedJob.quantity}</div>
                <div><span className="text-gray-500">Vendor:</span> {selectedJob.vendorRef ?? (selectedJob.vendorId ? `#${selectedJob.vendorId}` : '—')}</div>
                <div><span className="text-gray-500">Type:</span> {selectedJob.anodizeType ?? '—'}</div>
                <div><span className="text-gray-500">Finish:</span> {selectedJob.finishSpec ?? '—'}</div>
                <div><span className="text-gray-500">Color:</span> {selectedJob.color ?? '—'}</div>
                <div><span className="text-gray-500">PO#:</span> {selectedJob.vendorPoNumber ?? '—'}</div>
                <div><span className="text-gray-500">Expected:</span> {selectedJob.expectedReturnDate ?? '—'}</div>
              </div>

              {/* Cert + inspection quick flags */}
              <div className="flex gap-3 text-xs border-t pt-2">
                <span className={`flex items-center gap-1 ${selectedJob.certReceived ? 'text-green-600' : 'text-gray-400'}`}>
                  <CheckCircle className="h-3 w-3" /> Cert received
                </span>
                <span className={`flex items-center gap-1 ${selectedJob.inspectionPassed ? 'text-green-600' : 'text-gray-400'}`}>
                  <CheckCircle className="h-3 w-3" /> Inspection passed
                </span>
                {selectedJob.sentBy && (
                  <span className="text-gray-500">Sent by {selectedJob.sentBy}</span>
                )}
                {selectedJob.receivedBy && (
                  <span className="text-gray-500">Received by {selectedJob.receivedBy}</span>
                )}
              </div>

              {/* Tabbed sub-panels */}
              <Tabs defaultValue="documents">
                <TabsList className="h-8">
                  <TabsTrigger value="documents" className="text-xs gap-1"><FileText className="h-3 w-3" /> Documents</TabsTrigger>
                  <TabsTrigger value="inspection" className="text-xs gap-1"><ClipboardCheck className="h-3 w-3" /> Receiving Inspection</TabsTrigger>
                </TabsList>
                <TabsContent value="documents" className="mt-3">
                  <DocumentsPanel jobId={selectedJob.id} />
                </TabsContent>
                <TabsContent value="inspection" className="mt-3">
                  <InspectionPanel jobId={selectedJob.id} />
                </TabsContent>
              </Tabs>

              {/* Lifecycle actions */}
              <div className="flex gap-2 pt-1 border-t">
                {canSend(selectedJob) && (
                  <Button size="sm" className="gap-1" onClick={() => { setDetailOpen(false); openAction('send', selectedJob); }}>
                    <Send className="h-3 w-3" /> Send to Vendor
                  </Button>
                )}
                {canReceive(selectedJob) && (
                  <Button size="sm" className="gap-1" onClick={() => { setDetailOpen(false); openAction('receive', selectedJob); }}>
                    <Package className="h-3 w-3" /> Mark Received
                  </Button>
                )}
                {canVerify(selectedJob) && (
                  <Button size="sm" className="gap-1" onClick={() => { setDetailOpen(false); openAction('verify', selectedJob); }}>
                    <CheckCircle className="h-3 w-3" /> Verify / Inspect
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Anodize Job</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Routing Operation ID <span className="text-red-500">*</span></Label>
              <Input placeholder="Integer ID" value={createForm.routingOperationId} onChange={e => setCreateForm(p => ({ ...p, routingOperationId: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Part Number <span className="text-red-500">*</span></Label>
                <Input value={createForm.partNumber} onChange={e => setCreateForm(p => ({ ...p, partNumber: e.target.value }))} />
              </div>
              <div>
                <Label>Part Name <span className="text-red-500">*</span></Label>
                <Input value={createForm.partName} onChange={e => setCreateForm(p => ({ ...p, partName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity</Label>
                <Input type="number" min="1" value={createForm.quantity} onChange={e => setCreateForm(p => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div>
                <Label>Vendor Ref</Label>
                <Input value={createForm.vendorRef} onChange={e => setCreateForm(p => ({ ...p, vendorRef: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Anodize Type</Label>
                <Input placeholder="Type II" value={createForm.anodizeType} onChange={e => setCreateForm(p => ({ ...p, anodizeType: e.target.value }))} />
              </div>
              <div>
                <Label>Finish Spec</Label>
                <Input placeholder="MIL-A-8625" value={createForm.finishSpec} onChange={e => setCreateForm(p => ({ ...p, finishSpec: e.target.value }))} />
              </div>
              <div>
                <Label>Color</Label>
                <Input value={createForm.color} onChange={e => setCreateForm(p => ({ ...p, color: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Expected Return Date</Label>
              <Input type="date" value={createForm.expectedReturnDate} onChange={e => setCreateForm(p => ({ ...p, expectedReturnDate: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={createForm.notes} onChange={e => setCreateForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={createMutation.isPending || !createForm.routingOperationId || !createForm.partNumber || !createForm.partName}
              onClick={() => createMutation.mutate({
                routingOperationId: Number(createForm.routingOperationId),
                partNumber: createForm.partNumber,
                partName: createForm.partName,
                quantity: Number(createForm.quantity) || 1,
                vendorRef: createForm.vendorRef || null,
                anodizeType: createForm.anodizeType || null,
                finishSpec: createForm.finishSpec || null,
                color: createForm.color || null,
                expectedReturnDate: createForm.expectedReturnDate || null,
                notes: createForm.notes || null,
              })}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action dialog */}
      <Dialog open={!!actionDialog} onOpenChange={open => { if (!open) setActionDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === 'send' && 'Send to Vendor'}
              {actionDialog?.type === 'receive' && 'Mark as Received'}
              {actionDialog?.type === 'verify' && 'Verify / Inspect'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="text-gray-500">Job #{actionDialog?.job.id} — {actionDialog?.job.partNumber} (qty {actionDialog?.job.quantity})</div>
            {actionDialog?.type === 'send' && (
              <>
                <div><Label>Sent By <span className="text-red-500">*</span></Label><Input value={actionForm.sentBy} onChange={e => setActionForm(p => ({ ...p, sentBy: e.target.value }))} placeholder="Your name" /></div>
                <div><Label>Vendor PO Number</Label><Input value={actionForm.vendorPoNumber} onChange={e => setActionForm(p => ({ ...p, vendorPoNumber: e.target.value }))} /></div>
              </>
            )}
            {actionDialog?.type === 'receive' && (
              <>
                <div><Label>Received By <span className="text-red-500">*</span></Label><Input value={actionForm.receivedBy} onChange={e => setActionForm(p => ({ ...p, receivedBy: e.target.value }))} /></div>
                <div className="flex items-center gap-2">
                  <Checkbox id="certRcv" checked={actionForm.certReceived} onCheckedChange={v => setActionForm(p => ({ ...p, certReceived: !!v }))} />
                  <Label htmlFor="certRcv">Certificate of conformance received with shipment</Label>
                </div>
              </>
            )}
            {actionDialog?.type === 'verify' && (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox id="inspPassed" checked={actionForm.inspectionPassed} onCheckedChange={v => setActionForm(p => ({ ...p, inspectionPassed: !!v }))} />
                  <Label htmlFor="inspPassed">Receiving inspection passed</Label>
                </div>
                <div><Label>Notes</Label><Textarea rows={2} value={actionForm.notes} onChange={e => setActionForm(p => ({ ...p, notes: e.target.value }))} /></div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              disabled={sendMutation.isPending || receiveMutation.isPending || verifyMutation.isPending ||
                (actionDialog?.type === 'send' && !actionForm.sentBy) ||
                (actionDialog?.type === 'receive' && !actionForm.receivedBy)}
              onClick={handleAction}
            >
              {(sendMutation.isPending || receiveMutation.isPending || verifyMutation.isPending) ? 'Saving…' :
                actionDialog?.type === 'send' ? 'Confirm Sent' :
                actionDialog?.type === 'receive' ? 'Confirm Received' : 'Submit Verification'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
