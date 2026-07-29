import { useEffect, useMemo, useState } from 'react';
import { Download, FileClock, Plus, RefreshCw, Upload } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type ChangeRow = {
  id: string;
  change_number: string;
  change_type: string;
  title: string;
  source: 'IMPORTED_HISTORICAL' | 'EPOCH_NATIVE';
  status: string;
  owner_username: string | null;
  department: string | null;
  affected_items_count: number;
  actual_effective_date: string | null;
  proposed_effective_date: string | null;
  updated_at: string;
};

type PreviewRow = {
  rowNumber: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: Record<string, unknown>;
};

const TYPES = [
  'ECR',
  'ECN_ECO',
  'DOCUMENT_CHANGE',
  'PRODUCTION_PROCESS_CHANGE',
  'TEMPORARY_DEVIATION',
  'PERMANENT_DEVIATION_WAIVER',
  'SUPPLIER_CHANGE',
  'OTHER',
];

const initialHistorical = {
  originalRecordNumber: '',
  changeType: 'ECR',
  title: '',
  description: '',
  reasonForChange: '',
  originalRecordDate: '',
  originalSystemOrSource: '',
  originalStatus: '',
  requestedBy: '',
  department: '',
  evidenceUnavailableReason: '',
};

export default function QMSChangeControlPage() {
  const { can } = usePermissions();
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [department, setDepartment] = useState('');
  const [affected, setAffected] = useState('');
  const [details, setDetails] = useState<any>(null);
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [nativeOpen, setNativeOpen] = useState(false);
  const [historical, setHistorical] = useState(initialHistorical);
  const [historicalFile, setHistoricalFile] = useState<File | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [native, setNative] = useState({
    designControlProjectId: '',
    designControlRecordId: '',
    changeType: 'ECR',
    title: '',
    description: '',
    reasonForChange: '',
    implementationPlan: '',
    priority: 'NORMAL',
    department: '',
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (source !== 'ALL') params.set('source', source);
    if (type !== 'ALL') params.set('changeType', type);
    if (status !== 'ALL') params.set('status', status);
    if (department.trim()) params.set('department', department.trim());
    if (affected.trim()) params.set('affected', affected.trim());
    return params.toString();
  }, [affected, department, source, status, type]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/change-control${query ? `?${query}` : ''}`, {
        credentials: 'include',
      });
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to load Change Control');
      setRows(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Change Control');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [query]);

  const openDetails = async (id: string) => {
    const response = await fetch(`/api/change-control/${id}`, { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.message || 'Unable to load change details');
    setDetails(payload);
  };

  const importIndividual = async () => {
    const form = new FormData();
    form.append('metadata', JSON.stringify(historical));
    if (historicalFile) form.append('file', historicalFile);
    const response = await fetch('/api/change-control/import/individual', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.message || 'Historical import failed');
    setHistoricalOpen(false);
    setHistorical(initialHistorical);
    setHistoricalFile(null);
    await load();
  };

  const previewBulk = async () => {
    if (!bulkFile) return;
    const form = new FormData();
    form.append('file', bulkFile);
    const response = await fetch('/api/change-control/import/preview', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const payload = await response.json().catch(() => []);
    if (!response.ok) return setError(payload.message || 'Import preview failed');
    setPreview(Array.isArray(payload) ? payload : []);
  };

  const commitBulk = async () => {
    if (!bulkFile || preview.some((row) => !row.valid)) return;
    const form = new FormData();
    form.append('file', bulkFile);
    const response = await fetch('/api/change-control/import/commit', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.message || 'Bulk import failed');
    setBulkOpen(false);
    setBulkFile(null);
    setPreview([]);
    await load();
  };

  const createNative = async () => {
    const response = await fetch('/api/change-control/native', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(native),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setError(payload.message || 'Unable to create native change');
    setNativeOpen(false);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-normal">Change Control</h1>
          <p className="text-muted-foreground">
            Authoritative register for historical records and EPOCH-controlled ECR/ECN workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('qms.change_control.import') && (
            <>
              <Button variant="outline" onClick={() => setHistoricalOpen(true)}>
                <FileClock className="mr-2 h-4 w-4" /> Import Existing Record
              </Button>
              <Button variant="outline" onClick={() => setBulkOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Bulk Register Import
              </Button>
            </>
          )}
          {can('qms.change_control.create') && (
            <Button onClick={() => setNativeOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create New Change
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">Register Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <FilterSelect value={source} setValue={setSource} values={['IMPORTED_HISTORICAL', 'EPOCH_NATIVE']} placeholder="All sources" />
          <FilterSelect value={type} setValue={setType} values={TYPES} placeholder="All types" />
          <FilterSelect value={status} setValue={setStatus} values={['DRAFT','SUBMITTED','IMPACT_REVIEW','PENDING_APPROVAL','APPROVED','IMPLEMENTATION_IN_PROGRESS','PENDING_VERIFICATION','VERIFIED','CLOSED','REJECTED','CANCELLED','ON_HOLD','HISTORICAL']} placeholder="All statuses" />
          <Input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Department" />
          <Input value={affected} onChange={(event) => setAffected(event.target.value)} placeholder="Affected part/document" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow>
              {['Change number','Type','Title','Source','Status','Owner','Department','Affected','Effective date','Last updated','Actions'].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.change_number}</TableCell>
                  <TableCell>{row.change_type}</TableCell>
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.source === 'IMPORTED_HISTORICAL' ? <Badge variant="secondary">Historical / Imported</Badge> : <Badge>Epoch Native</Badge>}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.owner_username || '—'}</TableCell>
                  <TableCell>{row.department || '—'}</TableCell>
                  <TableCell>{row.affected_items_count}</TableCell>
                  <TableCell>{row.actual_effective_date || row.proposed_effective_date || '—'}</TableCell>
                  <TableCell>{new Date(row.updated_at).toLocaleDateString()}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => void openDetails(row.id)}>View</Button></TableCell>
                </TableRow>
              ))}
              {!rows.length && <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">{loading ? 'Loading…' : 'No matching change records'}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <Button className="mt-4" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </CardContent>
      </Card>

      <Dialog open={historicalOpen} onOpenChange={setHistoricalOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Import Existing Historical Record</DialogTitle></DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            Transcribed names and dates are labeled historical approval evidence and never become EPOCH electronic signatures.
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Original change number" value={historical.originalRecordNumber} onChange={(value) => setHistorical({ ...historical, originalRecordNumber: value })} />
            <TypeSelect value={historical.changeType} onChange={(value) => setHistorical({ ...historical, changeType: value })} />
            <Field label="Title" value={historical.title} onChange={(value) => setHistorical({ ...historical, title: value })} />
            <Field label="Original source/system" value={historical.originalSystemOrSource} onChange={(value) => setHistorical({ ...historical, originalSystemOrSource: value })} />
            <Field label="Original record date" type="date" value={historical.originalRecordDate} onChange={(value) => setHistorical({ ...historical, originalRecordDate: value })} />
            <Field label="Original status" value={historical.originalStatus} onChange={(value) => setHistorical({ ...historical, originalStatus: value })} />
            <Field label="Requested by" value={historical.requestedBy} onChange={(value) => setHistorical({ ...historical, requestedBy: value })} />
            <Field label="Department" value={historical.department} onChange={(value) => setHistorical({ ...historical, department: value })} />
          </div>
          <Label>Description</Label><Textarea value={historical.description} onChange={(event) => setHistorical({ ...historical, description: event.target.value })} />
          <Label>Original evidence</Label><Input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*" onChange={(event) => setHistoricalFile(event.target.files?.[0] ?? null)} />
          <Label>Reason evidence is unavailable (required only when no file is attached)</Label>
          <Textarea value={historical.evidenceUnavailableReason} onChange={(event) => setHistorical({ ...historical, evidenceUnavailableReason: event.target.value })} />
          <DialogFooter><Button onClick={() => void importIndividual()}>Import Historical Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Bulk Register Import</DialogTitle></DialogHeader>
          <a href="/api/change-control/import/template.csv"><Button variant="outline"><Download className="mr-2 h-4 w-4" /> Download template</Button></a>
          <Input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => { setBulkFile(event.target.files?.[0] ?? null); setPreview([]); }} />
          <Button variant="outline" onClick={() => void previewBulk()} disabled={!bulkFile}>Preview and validate</Button>
          {!!preview.length && <div className="space-y-2">
            <div className="text-sm">{preview.filter((row) => row.valid).length} valid · {preview.filter((row) => !row.valid).length} rejected · {preview.reduce((sum, row) => sum + row.warnings.length, 0)} warnings</div>
            {preview.map((row) => <div key={row.rowNumber} className={`rounded border p-2 text-sm ${row.valid ? '' : 'border-destructive'}`}>Row {row.rowNumber}: {row.valid ? 'Valid' : row.errors.join('; ')}{row.warnings.length ? ` — ${row.warnings.join('; ')}` : ''}</div>)}
          </div>}
          <DialogFooter><Button onClick={() => void commitBulk()} disabled={!preview.length || preview.some((row) => !row.valid)}>Commit valid register transactionally</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={nativeOpen} onOpenChange={setNativeOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Create New EPOCH Change</DialogTitle></DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">Creates an automatically numbered draft in the existing ECR workflow. Submission and approval use immutable revisions and authenticated signatures.</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Design Control project ID" value={native.designControlProjectId} onChange={(value) => setNative({ ...native, designControlProjectId: value })} />
            <Field label="Design Control record ID" value={native.designControlRecordId} onChange={(value) => setNative({ ...native, designControlRecordId: value })} />
            <TypeSelect value={native.changeType} onChange={(value) => setNative({ ...native, changeType: value })} />
            <Field label="Priority" value={native.priority} onChange={(value) => setNative({ ...native, priority: value })} />
            <Field label="Title" value={native.title} onChange={(value) => setNative({ ...native, title: value })} />
            <Field label="Department" value={native.department} onChange={(value) => setNative({ ...native, department: value })} />
          </div>
          <Label>Description</Label><Textarea value={native.description} onChange={(event) => setNative({ ...native, description: event.target.value })} />
          <Label>Reason and business justification</Label><Textarea value={native.reasonForChange} onChange={(event) => setNative({ ...native, reasonForChange: event.target.value })} />
          <Label>Implementation plan</Label><Textarea value={native.implementationPlan} onChange={(event) => setNative({ ...native, implementationPlan: event.target.value })} />
          <DialogFooter><Button onClick={() => void createNative()}>Create Controlled Draft</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(details)} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          {details && <>
            <DialogHeader><DialogTitle>{details.change_number} — {details.title}</DialogTitle></DialogHeader>
            {details.source === 'IMPORTED_HISTORICAL' && <Badge variant="secondary" className="w-fit">Historical / Imported — not originally controlled by EPOCH</Badge>}
            {details.source === 'EPOCH_NATIVE' && (
              <a href="/qms/design-control" className="w-fit">
                <Button variant="outline">Open controlled ECR / ECN workflow</Button>
              </a>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <DetailSection title="Summary" value={`${details.change_type} · ${details.status}\n${details.description || ''}`} />
              <DetailSection title="Impact / Risk" value={[details.risk_assessment, details.product_safety_impact, details.regulatory_impact, details.configuration_impact].filter(Boolean).join('\n') || 'No transcribed impact details'} />
              <DetailSection title="Affected Records" value={(details.links || []).map((link: any) => `${link.link_type}: ${link.linked_record_number || link.linked_record_id}`).join('\n') || 'None linked'} />
              <DetailSection title="Approvals" value={details.source === 'IMPORTED_HISTORICAL' ? `${(details.historicalApprovals || []).length} historical approval evidence entries. These are not EPOCH electronic approvals.` : 'Native approvals remain bound to the ECR/ECN revision and checksum.'} />
              <DetailSection title="Implementation" value={details.implementation_plan || details.implementation_notes || 'Not recorded'} />
              <DetailSection title="Verification" value={details.verification_results || details.verification_method || 'Not recorded'} />
              <DetailSection title="Attachments" value={(details.evidence || []).map((item: any) => `${item.original_filename} · SHA-256 ${item.sha256_checksum}`).join('\n') || 'No evidence attached'} />
              <DetailSection title="Related Changes" value={(details.links || []).filter((link: any) => link.link_type === 'RELATED_CHANGE').map((link: any) => link.linked_record_number || link.linked_record_id).join('\n') || 'None'} />
              <DetailSection title="Audit History" value={(details.audit || []).map((event: any) => `${new Date(event.occurred_at).toLocaleString()} · ${event.event_type}`).join('\n') || 'No register events'} />
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({ value, setValue, values, placeholder }: { value: string; setValue: (value: string) => void; values: string[]; placeholder: string }) {
  return <Select value={value} onValueChange={setValue}><SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent><SelectItem value="ALL">{placeholder}</SelectItem>{values.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>;
}
function TypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>Change type</Label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>;
}
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
function DetailSection({ title, value }: { title: string; value: string }) {
  return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{value}</CardContent></Card>;
}
