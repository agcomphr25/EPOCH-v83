import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, AlertCircle, Clock,
  Search, Download, ChevronRight, FileText, BookOpen, Link2, Info, Pencil,
  CheckSquare, AlertTriangle, BarChart3, X, ExternalLink, FolderOpen, Upload, Loader2
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvidenceLink {
  evidenceType: 'audit_log' | 'forensic_rule' | 'permission' | 'schema_table' | 'vault' | 'policy_only';
  evidenceRef: string;
  evidenceDescription: string;
}

interface CmmcControl {
  practiceId: string;
  family: string;
  familyLabel: string;
  title: string;
  description: string;
  status: 'implemented' | 'partial' | 'planned' | 'not_applicable';
  notes: string | null;
  evidenceLinks: EvidenceLink[];
  gapNote: string | null;
  requiresPolicyDoc: boolean;
  policyDocumentId: number | null;
  policyDocumentName: string | null;
  attestedAt: string | null;
  attestedByDisplayName: string | null;
  updatedAt: string | null;
  dbId: number | null;
}

interface FamilySummary {
  family: string;
  label: string;
  total: number;
  applicable: number;
  implemented: number;
  partial: number;
  planned: number;
  not_applicable: number;
  coveragePct: number;
  implementedPct: number;
  coveredCount: number;
}

interface SummaryResponse {
  families: FamilySummary[];
  totals: {
    total: number;
    applicable: number;
    implemented: number;
    partial: number;
    planned: number;
    not_applicable: number;
    overallPct: number;
    implementedOnlyPct: number;
  };
  generatedAt: string;
}

interface VaultDoc {
  id: number;
  name: string;
  classification: string;
  createdAt: string;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  implemented: {
    label: 'Implemented',
    color: 'text-green-700 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-950',
    border: 'border-green-200 dark:border-green-800',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    icon: CheckCircle2,
  },
  partial: {
    label: 'Partially Implemented',
    color: 'text-yellow-700 dark:text-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-950',
    border: 'border-yellow-200 dark:border-yellow-800',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    icon: AlertCircle,
  },
  planned: {
    label: 'Planned',
    color: 'text-blue-700 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    icon: Clock,
  },
  not_applicable: {
    label: 'Not Applicable',
    color: 'text-gray-500 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-900',
    border: 'border-gray-200 dark:border-gray-700',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: ShieldX,
  },
};

const EVIDENCE_TYPE_LABELS: Record<EvidenceLink['evidenceType'], string> = {
  audit_log: 'Audit Log',
  forensic_rule: 'Forensic Rule',
  permission: 'RBAC / Permission',
  schema_table: 'Database Table',
  vault: 'Document Vault',
  policy_only: 'Policy / Procedure',
};

const EVIDENCE_TYPE_COLORS: Record<EvidenceLink['evidenceType'], string> = {
  audit_log: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  forensic_rule: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  permission: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  schema_table: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300',
  vault: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
  policy_only: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
};

// ─── Helper Components ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CmmcControl['status'] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function CoverageBar({ pct, implemented, partial, planned, na }: { pct: number; implemented: number; partial: number; planned: number; na: number }) {
  const total = implemented + partial + planned + na;
  const impPct = total > 0 ? (implemented / total) * 100 : 0;
  const partPct = total > 0 ? (partial / total) * 100 : 0;
  const planPct = total > 0 ? (planned / total) * 100 : 0;
  const naPct = total > 0 ? (na / total) * 100 : 0;
  return (
    <div className="w-full h-2 rounded-full overflow-hidden flex gap-0.5" title={`${implemented} implemented / ${partial} partial / ${planned} planned / ${na} N/A`}>
      <div className="bg-green-500 h-full transition-all" style={{ width: `${impPct}%` }} />
      <div className="bg-yellow-400 h-full transition-all" style={{ width: `${partPct}%` }} />
      <div className="bg-blue-400 h-full transition-all" style={{ width: `${planPct}%` }} />
      <div className="bg-gray-300 dark:bg-gray-600 h-full transition-all" style={{ width: `${naPct}%` }} />
    </div>
  );
}

// ─── Edit Dialog ─────────────────────────────────────────────────────────────

function EditControlDialog({
  control,
  open,
  onClose,
}: {
  control: CmmcControl;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<CmmcControl['status']>(control.status);
  const [notes, setNotes] = useState(control.notes ?? '');
  const [policyDocumentId, setPolicyDocumentId] = useState<number | null>(control.policyDocumentId);
  const [policyDocumentName, setPolicyDocumentName] = useState<string | null>(control.policyDocumentName);
  const [uploading, setUploading] = useState(false);

  const { data: vaultDocs = [], isLoading: vaultLoading, refetch: refetchVaultDocs } = useQuery<VaultDoc[]>({
    queryKey: ['/api/cmmc/vault-docs'],
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (payload: {
      status: string;
      notes: string;
      policyDocumentId: number | null;
    }) => apiRequest(`/api/cmmc/controls/${control.practiceId}`, { method: 'PATCH', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cmmc/controls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cmmc/summary'] });
      toast({ title: 'Control updated', description: `${control.practiceId} status saved.` });
      onClose();
    },
    onError: () => {
      toast({ title: 'Update failed', description: 'Could not save changes.', variant: 'destructive' });
    },
  });

  const attestMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/cmmc/controls/${control.practiceId}`, { method: 'PATCH', body: { attest: true } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cmmc/controls'] });
      toast({ title: 'Control attested', description: `${control.practiceId} marked as attested.` });
      onClose();
    },
    onError: () => {
      toast({ title: 'Attestation failed', variant: 'destructive' });
    },
  });

  function handleVaultDocChange(val: string) {
    if (val === '__none__') {
      setPolicyDocumentId(null);
      setPolicyDocumentName(null);
    } else {
      const docId = parseInt(val, 10);
      const doc = vaultDocs.find(d => d.id === docId) ?? null;
      setPolicyDocumentId(docId);
      setPolicyDocumentName(doc?.name ?? null);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Step 1: Get presigned upload URL
      const urlRes = await apiRequest('/api/vault/documents/request-upload', {
        method: 'POST',
        body: {
          name: file.name,
          contentType: file.type,
          fileSizeBytes: file.size,
        },
      }) as { uploadURL: string; objectPath: string };

      // Step 2: Upload file directly to presigned URL
      const putRes = await fetch(urlRes.uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.statusText}`);

      // Step 3: Register document in vault
      const docName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      const registered = await apiRequest('/api/vault/documents', {
        method: 'POST',
        body: {
          name: `CMMC Policy — ${docName}`,
          objectPath: urlRes.objectPath,
          classification: 'internal',
          scopeType: 'global',
          contentType: file.type || 'application/octet-stream',
          fileSizeBytes: file.size,
        },
      }) as { id: number; name: string };

      // Auto-select the newly uploaded document for this control
      setPolicyDocumentId(registered.id);
      setPolicyDocumentName(registered.name);
      await refetchVaultDocs();
      toast({ title: 'Document uploaded', description: `"${registered.name}" added to vault and attached.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const selectedVaultVal = policyDocumentId != null ? String(policyDocumentId) : '__none__';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            Edit Control {control.practiceId}
          </DialogTitle>
          <DialogDescription>{control.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Implementation Status</label>
            <Select value={status} onValueChange={v => setStatus(v as CmmcControl['status'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="implemented">Implemented</SelectItem>
                <SelectItem value="partial">Partially Implemented</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="not_applicable">Not Applicable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Notes / Gap Description</label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Describe implementation status, evidence, or remediation plan..."
              rows={3}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 flex items-center gap-1.5 block">
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
              Policy Document Evidence
            </label>
            <div className="flex gap-2 items-start">
              <Select
                value={selectedVaultVal}
                onValueChange={handleVaultDocChange}
                disabled={vaultLoading || uploading}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={vaultLoading ? 'Loading vault…' : 'Select an existing vault document…'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {vaultDocs.map(doc => (
                    <SelectItem key={doc.id} value={String(doc.id)}>
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="uppercase text-xs font-mono text-muted-foreground w-10 shrink-0">
                          {doc.classification}
                        </span>
                        {doc.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="shrink-0">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.xls"
                  disabled={uploading}
                  onChange={handleFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  className="gap-1 h-10 cursor-pointer"
                  asChild
                >
                  <span>
                    {uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {uploading ? 'Uploading…' : 'Upload New'}
                  </span>
                </Button>
              </label>
            </div>
            {policyDocumentName && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <FileText className="w-3 h-3 text-green-600" />
                Attached: <strong>{policyDocumentName}</strong>
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Upload a new policy document directly to the vault, or select an existing one to link as evidence for this control.
            </p>
          </div>

          {control.attestedAt && (
            <div className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1">
              <CheckSquare className="w-4 h-4" />
              Attested by {control.attestedByDisplayName} on {new Date(control.attestedAt).toLocaleDateString()}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => attestMutation.mutate()}
            disabled={attestMutation.isPending}
            className="sm:mr-auto"
          >
            <CheckSquare className="w-4 h-4 mr-1" />
            Mark Attested
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate({ status, notes, policyDocumentId })}
            disabled={mutation.isPending}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Control Detail Panel ─────────────────────────────────────────────────────

function ControlDetailPanel({
  control,
  onEdit,
  onClose,
}: {
  control: CmmcControl;
  onEdit: () => void;
  onClose: () => void;
}) {
  const cfg = STATUS_CONFIG[control.status];
  const Icon = cfg.icon;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold text-muted-foreground">{control.practiceId}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{control.familyLabel}</span>
          </div>
          <h3 className="font-semibold text-base leading-tight">{control.title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 -mx-1 px-1">
        <div className="space-y-4">
          {/* Status */}
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${cfg.bg} ${cfg.border}`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
            <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
            {control.requiresPolicyDoc && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded font-medium ${control.policyDocumentId ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'}`}>
                {control.policyDocumentId ? 'Policy Attached' : 'Policy Required'}
              </span>
            )}
            {control.attestedAt && (
              <span className="ml-auto text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                Attested
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <p className="text-sm text-muted-foreground leading-relaxed">{control.description}</p>
          </div>

          {/* Evidence Links */}
          {control.evidenceLinks.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                In-System Evidence
              </h4>
              <div className="space-y-2">
                {control.evidenceLinks.map((ev, i) => (
                  <div key={i} className="rounded border bg-muted/30 p-2.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${EVIDENCE_TYPE_COLORS[ev.evidenceType]}`}>
                        {EVIDENCE_TYPE_LABELS[ev.evidenceType]}
                      </span>
                      <code className="text-xs text-muted-foreground truncate">{ev.evidenceRef}</code>
                    </div>
                    <p className="text-xs text-muted-foreground">{ev.evidenceDescription}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gap / Notes */}
          {(control.notes || control.gapNote) && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {control.notes ? 'Notes' : 'Gap / Remediation Required'}
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 rounded p-2.5 border">
                {control.notes || control.gapNote}
              </p>
            </div>
          )}

          {/* Policy Document */}
          {control.policyDocumentName && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Attached Policy Document
              </h4>
              <div className="flex items-center gap-2 rounded border bg-muted/30 p-2.5">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{control.policyDocumentName}</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
              </div>
            </div>
          )}

          {/* Attestation */}
          {control.attestedAt && (
            <div className="text-xs text-muted-foreground">
              Attested by <strong>{control.attestedByDisplayName}</strong> on {new Date(control.attestedAt).toLocaleDateString()}
            </div>
          )}

          {control.updatedAt && (
            <div className="text-xs text-muted-foreground">
              Last updated {new Date(control.updatedAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CmmcDashboard() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedControl, setSelectedControl] = useState<CmmcControl | null>(null);
  const [editingControl, setEditingControl] = useState<CmmcControl | null>(null);
  const [activeTab, setActiveTab] = useState<'families' | 'controls'>('families');

  // ── Data Queries ───────────────────────────────────────────────────────────
  const summaryQuery = useQuery<SummaryResponse>({
    queryKey: ['/api/cmmc/summary'],
  });

  const controlsQuery = useQuery<CmmcControl[]>({
    queryKey: ['/api/cmmc/controls'],
  });

  // ── Derived State ──────────────────────────────────────────────────────────
  const filteredControls = (controlsQuery.data ?? []).filter(c => {
    if (familyFilter !== 'all' && c.family !== familyFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.practiceId.includes(q) && !c.title.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Export ─────────────────────────────────────────────────────────────────
  function handleExport() {
    window.open('/api/cmmc/export/json', '_blank');
    toast({ title: 'SSP Export started', description: 'Your SSP JSON file will download shortly.' });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const summary = summaryQuery.data;
  const totals = summary?.totals;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950">
                <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold">CMMC 2.0 Level 2 Readiness</h1>
                <p className="text-sm text-muted-foreground">NIST SP 800-171 Rev 2 — 110 Practices</p>
              </div>
            </div>
            <div className="sm:ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="w-4 h-4 mr-1" />
                Export SSP (JSON)
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Overall Score Cards */}
        {summaryQuery.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : totals ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            <Card className="lg:col-span-1">
              <CardContent className="pt-4 pb-3">
                <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{totals.overallPct}%</div>
                <div className="text-xs text-muted-foreground mt-0.5">Covered (Impl. + Partial)</div>
                <Progress value={totals.overallPct} className="mt-2 h-1.5" />
                <div className="text-xs text-muted-foreground mt-1 opacity-70">{totals.implementedOnlyPct}% fully implemented</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{totals.implemented}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Implemented
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{totals.partial}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Partial
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totals.planned}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Planned / Gap
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">{totals.not_applicable}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <ShieldX className="w-3 h-3" /> Not Applicable
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="families" className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              By Family
            </TabsTrigger>
            <TabsTrigger value="controls" className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              All Controls
            </TabsTrigger>
          </TabsList>

          {/* ── Family Summary Tab ─────────────────────────────────────────── */}
          <TabsContent value="families" className="mt-4">
            {summaryQuery.isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {(summary?.families ?? []).map(f => (
                  <Card
                    key={f.family}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      setFamilyFilter(f.family);
                      setActiveTab('controls');
                    }}
                  >
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-muted-foreground">{f.family}</span>
                          <div className="font-semibold text-sm leading-tight mt-0.5">{f.label}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{f.coveragePct}%</div>
                          <div className="text-xs text-muted-foreground">{f.implemented}/{f.applicable}</div>
                        </div>
                      </div>
                      <CoverageBar
                        pct={f.coveragePct}
                        implemented={f.implemented}
                        partial={f.partial}
                        planned={f.planned}
                        na={f.not_applicable}
                      />
                      <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="text-green-600 dark:text-green-400">{f.implemented}✓</span>
                        <span className="text-yellow-600 dark:text-yellow-400">{f.partial}~</span>
                        <span className="text-blue-500 dark:text-blue-400">{f.planned}◌</span>
                        {f.not_applicable > 0 && <span>{f.not_applicable} N/A</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Controls List Tab ──────────────────────────────────────────── */}
          <TabsContent value="controls" className="mt-4">
            <div className={`flex gap-4 ${selectedControl ? 'xl:flex-row' : ''}`}>
              {/* Controls List */}
              <div className={`flex-1 min-w-0 space-y-3 ${selectedControl ? 'xl:max-w-[60%]' : ''}`}>
                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-48 max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search practices..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  <Select value={familyFilter} onValueChange={setFamilyFilter}>
                    <SelectTrigger className="w-44 h-9 text-sm">
                      <SelectValue placeholder="All families" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Families</SelectItem>
                      {['AC','AT','AU','CM','IA','IR','MA','MP','PE','PS','RA','SA','SC','SI'].map(f => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-48 h-9 text-sm">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="implemented">Implemented</SelectItem>
                      <SelectItem value="partial">Partially Implemented</SelectItem>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="not_applicable">Not Applicable</SelectItem>
                    </SelectContent>
                  </Select>
                  {(familyFilter !== 'all' || statusFilter !== 'all' || search) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSearch(''); setFamilyFilter('all'); setStatusFilter('all'); }}
                      className="h-9 text-sm"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Clear
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground self-center ml-auto">
                    {filteredControls.length} of 110
                  </span>
                </div>

                {/* Controls Table */}
                {controlsQuery.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredControls.map(control => {
                      const cfg = STATUS_CONFIG[control.status];
                      const Icon = cfg.icon;
                      const isSelected = selectedControl?.practiceId === control.practiceId;
                      return (
                        <div
                          key={control.practiceId}
                          onClick={() => setSelectedControl(isSelected ? null : control)}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-all hover:shadow-sm
                            ${isSelected
                              ? `${cfg.bg} ${cfg.border}`
                              : 'bg-card hover:bg-muted/40 border-border'
                            }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-muted-foreground">{control.practiceId}</span>
                              <span className="text-sm font-medium truncate">{control.title}</span>
                            </div>
                            {control.evidenceLinks.length > 0 && (
                              <div className="flex gap-1 mt-0.5">
                                {control.evidenceLinks.slice(0, 3).map((ev, i) => (
                                  <span key={i} className={`text-xs px-1 rounded ${EVIDENCE_TYPE_COLORS[ev.evidenceType]}`}>
                                    {EVIDENCE_TYPE_LABELS[ev.evidenceType]}
                                  </span>
                                ))}
                                {control.evidenceLinks.length > 3 && (
                                  <span className="text-xs text-muted-foreground">+{control.evidenceLinks.length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            {control.requiresPolicyDoc && !control.policyDocumentId && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 font-medium" title="Requires policy document">
                                Policy Req.
                              </span>
                            )}
                            {control.attestedAt && (
                              <CheckSquare className="w-3.5 h-3.5 text-green-600 dark:text-green-400" title="Attested" />
                            )}
                            <StatusBadge status={control.status} />
                            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                          </div>
                        </div>
                      );
                    })}
                    {filteredControls.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        No controls match your filters
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Detail Panel */}
              {selectedControl && (
                <div className="hidden xl:flex xl:w-[38%] shrink-0">
                  <Card className="w-full sticky top-4 self-start max-h-[calc(100vh-10rem)] flex flex-col">
                    <CardContent className="p-4 flex flex-col flex-1 overflow-hidden">
                      <ControlDetailPanel
                        control={selectedControl}
                        onEdit={() => setEditingControl(selectedControl)}
                        onClose={() => setSelectedControl(null)}
                      />
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* Mobile/Tablet Detail Dialog */}
            {selectedControl && (
              <Dialog
                open={!!selectedControl}
                onOpenChange={v => !v && setSelectedControl(null)}
              >
                <DialogContent className="xl:hidden max-w-lg max-h-[85vh] flex flex-col p-0">
                  <div className="p-4 flex-1 overflow-hidden flex flex-col">
                    <ControlDetailPanel
                      control={selectedControl}
                      onEdit={() => { setEditingControl(selectedControl); }}
                      onClose={() => setSelectedControl(null)}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </TabsContent>
        </Tabs>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span className="font-medium">Status key:</span>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => {
            const Icon = v.icon;
            return (
              <span key={k} className={`flex items-center gap-1 ${v.color}`}>
                <Icon className="w-3 h-3" />{v.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Edit Dialog */}
      {editingControl && (
        <EditControlDialog
          control={editingControl}
          open={!!editingControl}
          onClose={() => setEditingControl(null)}
        />
      )}
    </div>
  );
}
