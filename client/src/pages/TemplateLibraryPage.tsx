import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BookOpen,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Route,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';

type TemplateType = 'ROUTING' | 'TRAVELER' | 'QC' | 'WORK_INSTRUCTION' | 'SPEC_SHEET';
type TabKey = 'ROUTING' | 'TRAVELER' | 'QC' | 'DOCUMENTS';
type ApprovalStatus = 'DRAFT' | 'APPROVED' | 'OBSOLETE';

interface ProductionControlTemplate {
  id: string;
  name: string;
  templateType: TemplateType;
  routingType: string | null;
  version: number;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  data: unknown;
  fileUrl: string | null;
  createdBy: string;
  createdAt: string;
}

const TABS: { value: TabKey; label: string; icon: typeof Route; types: TemplateType[]; description: string }[] = [
  { value: 'ROUTING', label: 'Routing Templates', icon: Route, types: ['ROUTING'], description: 'Define department sequences, traceability config, and process settings' },
  { value: 'TRAVELER', label: 'Traveler Templates', icon: FileText, types: ['TRAVELER'], description: 'Define department steps, phases, and required tasks per department' },
  { value: 'QC', label: 'QC Templates', icon: ShieldCheck, types: ['QC'], description: 'Define checkpoint types and structured checklist items' },
  { value: 'DOCUMENTS', label: 'Work Instructions / Spec Sheets', icon: BookOpen, types: ['WORK_INSTRUCTION', 'SPEC_SHEET'], description: 'Store document references linked to parts or process types' },
];

const ROUTING_TYPES = ['CNC', 'COMPOSITE', 'ASSEMBLY', 'PAINT_FINISH', 'SPECIAL_PROCESS'];
const ALL_TEMPLATE_TYPES: TemplateType[] = ['ROUTING', 'TRAVELER', 'QC', 'WORK_INSTRUCTION', 'SPEC_SHEET'];

const statusBadge: Record<ApprovalStatus, { label: string; className: string; icon: typeof CheckCircle }> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700', icon: Clock },
  APPROVED: { label: 'Approved', className: 'bg-green-100 text-green-800', icon: CheckCircle },
  OBSOLETE: { label: 'Obsolete', className: 'bg-red-100 text-red-700', icon: XCircle },
};

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const cfg = statusBadge[status];
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.className} flex items-center gap-1 w-fit`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return d; }
}

const DEFAULT_DATA: Record<TemplateType, string> = {
  ROUTING: JSON.stringify({
    routingType: 'COMPOSITE',
    departmentSequence: ['Layup', 'CNC', 'Finish', 'QC'],
    traceabilityConfig: { Layup: ['lot_number', 'batch_number', 'expiration'], CNC: [], Finish: [], QC: [] },
    departmentConfig: { Layup: { requiresMaterialTraceability: true, requiresSignoff: true, requiresOvenLog: false } },
  }, null, 2),
  TRAVELER: JSON.stringify({
    steps: [{ departmentName: 'Layup', tasks: [
      { phase: 'START', title: 'Badge Scan', taskType: 'BADGE_SCAN' },
      { phase: 'WORK', title: 'Material Trace', taskType: 'MATERIAL_TRACE' },
      { phase: 'FINISH', title: 'Supervisor Signoff', taskType: 'SIGNOFF' },
    ]}],
  }, null, 2),
  QC: JSON.stringify({
    checkpoints: [
      { title: 'First Article Inspection', type: 'FIRST_ARTICLE', instructions: 'Verify all dimensions per drawing' },
      { title: 'In-Process Check', type: 'IN_PROCESS', instructions: 'Check material traceability' },
      { title: 'Final Inspection', type: 'FINAL', instructions: 'Verify all requirements met' },
    ],
  }, null, 2),
  WORK_INSTRUCTION: JSON.stringify({ documentName: '', linkedProcess: '', revision: '1' }, null, 2),
  SPEC_SHEET: JSON.stringify({ documentName: '', linkedProcess: '', revision: '1' }, null, 2),
};

const EMPTY_FORM = {
  name: '',
  templateType: 'ROUTING' as TemplateType,
  routingType: '',
  data: DEFAULT_DATA.ROUTING,
  fileUrl: '',
};

export default function TemplateLibraryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('ROUTING');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductionControlTemplate | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState<ProductionControlTemplate | null>(null);
  const [approverName, setApproverName] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [fileUploading, setFileUploading] = useState(false);

  const { data: templates = [], isLoading } = useQuery<ProductionControlTemplate[]>({
    queryKey: ['/api/production-control-templates'],
  });

  const currentTab = TABS.find((t) => t.value === activeTab)!;
  const filteredTemplates = templates.filter((t) => currentTab.types.includes(t.templateType));

  const openCreate = (defaultType?: TemplateType) => {
    const type = defaultType ?? (activeTab === 'DOCUMENTS' ? 'WORK_INSTRUCTION' : (activeTab as TemplateType));
    setForm({ ...EMPTY_FORM, templateType: type, data: DEFAULT_DATA[type] });
    setJsonError(null);
    setShowCreate(true);
    setEditTarget(null);
  };

  const openEdit = (tmpl: ProductionControlTemplate) => {
    setForm({
      name: tmpl.name,
      templateType: tmpl.templateType,
      routingType: tmpl.routingType ?? '',
      data: tmpl.data ? JSON.stringify(tmpl.data, null, 2) : '{}',
      fileUrl: tmpl.fileUrl ?? '',
    });
    setJsonError(null);
    setEditTarget(tmpl);
    setShowCreate(true);
  };

  const handleFormChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'templateType') updated.data = DEFAULT_DATA[value as TemplateType];
      return updated;
    });
  };

  const handleJsonChange = (value: string) => {
    setForm((prev) => ({ ...prev, data: value }));
    try { JSON.parse(value); setJsonError(null); } catch { setJsonError('Invalid JSON'); }
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/production-control-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          templateType: form.templateType,
          routingType: form.routingType || null,
          data: (() => { try { return JSON.parse(form.data); } catch { return null; } })(),
          fileUrl: form.fileUrl || null,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Template created' });
      queryClient.invalidateQueries({ queryKey: ['/api/production-control-templates'] });
      setShowCreate(false);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const editMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/production-control-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          routingType: form.routingType || null,
          data: (() => { try { return JSON.parse(form.data); } catch { return null; } })(),
          fileUrl: form.fileUrl || null,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Template updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/production-control-templates'] });
      setShowCreate(false);
      setEditTarget(null);
    },
    onError: (e: Error) => toast({ title: 'Error updating template', description: e.message, variant: 'destructive' }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, approvedBy }: { id: string; approvedBy: string }) =>
      apiRequest(`/api/production-control-templates/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approvedBy }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Template approved' });
      queryClient.invalidateQueries({ queryKey: ['/api/production-control-templates'] });
      setShowApproveDialog(null);
      setApproverName('');
    },
    onError: (e: Error) => toast({ title: 'Approval failed', description: e.message, variant: 'destructive' }),
  });

  const obsoleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/production-control-templates/${id}/obsolete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Template marked obsolete' });
      queryClient.invalidateQueries({ queryKey: ['/api/production-control-templates'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileUploading(true);
    try {
      const urlRes = await fetch('/api/production-control-templates/request-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: file.name }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadURL, objectPath } = await urlRes.json();

      const putRes = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!putRes.ok) throw new Error('Failed to upload file to storage');

      setForm((prev) => ({ ...prev, fileUrl: objectPath }));
      toast({ title: 'File uploaded', description: file.name });
    } catch (err: unknown) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setFileUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    if (jsonError) { toast({ title: 'Fix JSON errors first', variant: 'destructive' }); return; }
    if (editTarget) { editMutation.mutate(editTarget.id); } else { createMutation.mutate(); }
  };

  const isDocumentsTab = activeTab === 'DOCUMENTS';
  const isDocumentType = form.templateType === 'WORK_INSTRUCTION' || form.templateType === 'SPEC_SHEET';
  const isSaving = createMutation.isPending || editMutation.isPending || fileUploading;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-8 w-8" />
            Template Library
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage approved production control templates for routing, traveler, QC, and work instructions
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="grid grid-cols-4 w-full">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count = templates.filter((t) => tab.types.includes(t.templateType)).length;
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                {count > 0 && (
                  <Badge className="bg-gray-200 text-gray-700 text-xs px-1.5 py-0">{count}</Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tab.label}</CardTitle>
                <CardDescription>{tab.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>No {tab.label.toLowerCase()} yet.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => openCreate(tab.types[0])}>
                      <Plus className="h-3 w-3 mr-1" /> Create first template
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        {tab.value === 'DOCUMENTS' && <TableHead>Type</TableHead>}
                        <TableHead>Version</TableHead>
                        {tab.value === 'ROUTING' && <TableHead>Routing Type</TableHead>}
                        <TableHead>Status</TableHead>
                        <TableHead>Approved By</TableHead>
                        <TableHead>Approved At</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTemplates.map((tmpl) => (
                        <TableRow key={tmpl.id}>
                          <TableCell className="font-medium">{tmpl.name}</TableCell>
                          {tab.value === 'DOCUMENTS' && (
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {tmpl.templateType === 'WORK_INSTRUCTION' ? 'Work Instruction' : 'Spec Sheet'}
                              </Badge>
                            </TableCell>
                          )}
                          <TableCell>v{tmpl.version}</TableCell>
                          {tab.value === 'ROUTING' && <TableCell>{tmpl.routingType ?? '—'}</TableCell>}
                          <TableCell><StatusBadge status={tmpl.approvalStatus} /></TableCell>
                          <TableCell>{tmpl.approvedBy ?? '—'}</TableCell>
                          <TableCell>{formatDate(tmpl.approvedAt)}</TableCell>
                          <TableCell>{tmpl.createdBy}</TableCell>
                          <TableCell className="text-right space-x-1">
                            {tmpl.approvalStatus === 'DRAFT' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => openEdit(tmpl)}
                                  title="Edit this draft template"
                                >
                                  <Pencil className="h-3 w-3 mr-1" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                                  onClick={() => setShowApproveDialog(tmpl)}
                                >
                                  <ShieldCheck className="h-3 w-3 mr-1" /> Approve
                                </Button>
                              </>
                            )}
                            {tmpl.approvalStatus !== 'OBSOLETE' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-red-600 hover:text-red-700"
                                onClick={() => {
                                  if (confirm(`Mark "${tmpl.name}" as obsolete?`)) {
                                    obsoleteMutation.mutate(tmpl.id);
                                  }
                                }}
                                disabled={obsoleteMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> Obsolete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Create / Edit Template Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditTarget(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit "${editTarget.name}"` : 'New Template'}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? 'Update this DRAFT template. Re-approval will be required after changes.'
                : 'Create a new production control template (starts as DRAFT)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="e.g. Standard Composite Routing v1"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Template Type</Label>
                <Select
                  value={form.templateType}
                  onValueChange={(v) => handleFormChange('templateType', v)}
                  disabled={!!editTarget}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_TEMPLATE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.templateType === 'ROUTING' && (
              <div>
                <Label>Routing Type</Label>
                <Select
                  value={form.routingType}
                  onValueChange={(v) => handleFormChange('routingType', v)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select routing type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTING_TYPES.map((rt) => (
                      <SelectItem key={rt} value={rt}>{rt.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isDocumentType ? (
              <div className="space-y-3">
                <div>
                  <Label>Document File</Label>
                  <div className="mt-1 space-y-2">
                    <label
                      className={`flex items-center gap-2 border-2 border-dashed rounded-md px-4 py-3 cursor-pointer transition-colors
                        ${fileUploading ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50/50'}`}
                    >
                      {fileUploading
                        ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        : <Upload className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-sm text-muted-foreground">
                        {fileUploading ? 'Uploading…' : 'Click to upload PDF, Word, or other document'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                        className="hidden"
                        disabled={fileUploading}
                        onChange={handleFileSelect}
                      />
                    </label>
                    {form.fileUrl && (
                      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                        <Paperclip className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{form.fileUrl.split('/').pop() ?? form.fileUrl}</span>
                        <button
                          type="button"
                          className="ml-auto shrink-0 text-gray-400 hover:text-red-500"
                          onClick={() => setForm((prev) => ({ ...prev, fileUrl: '' }))}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Metadata (JSON)</Label>
                  <Textarea
                    value={form.data}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    rows={6}
                    className={`mt-1 font-mono text-xs ${jsonError ? 'border-red-400' : ''}`}
                  />
                  {jsonError && <p className="text-xs text-red-500 mt-1">{jsonError}</p>}
                </div>
              </div>
            ) : (
              <div>
                <Label>Template Data (JSON) *</Label>
                <Textarea
                  value={form.data}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  rows={12}
                  className={`mt-1 font-mono text-xs ${jsonError ? 'border-red-400' : ''}`}
                />
                {jsonError && <p className="text-xs text-red-500 mt-1">{jsonError}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  Edit the JSON structure to define the template content.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditTarget(null); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving || !!jsonError}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : (editTarget ? <Pencil className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />)}
                {editTarget ? 'Save Changes' : 'Create Template'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve Template Dialog */}
      <Dialog open={!!showApproveDialog} onOpenChange={(open) => { if (!open) setShowApproveDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Template</DialogTitle>
            <DialogDescription>
              Enter your name to approve &quot;{showApproveDialog?.name}&quot;. The approver must be different from the creator ({showApproveDialog?.createdBy}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Your Name (approver) *</Label>
              <Input
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                placeholder="First Last or username"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowApproveDialog(null); setApproverName(''); }}>
                Cancel
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={!approverName.trim() || approveMutation.isPending}
                onClick={() => {
                  if (showApproveDialog) {
                    approveMutation.mutate({ id: showApproveDialog.id, approvedBy: approverName.trim() });
                  }
                }}
              >
                {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                Approve Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
