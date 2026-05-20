import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Shield, Database, Server, Key, BookOpen, Users, AlertTriangle,
  FileText, Bot, CheckCircle2, Clock, XCircle, ChevronRight,
  Building2, Globe, CreditCard, Wallet, GitBranch, Package,
  Loader2, RefreshCw, Pencil, Check, X
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface ContinuitySection {
  id: number;
  sectionKey: string;
  title: string;
  content: Record<string, unknown>;
  updatedAt: string;
  updatedByDisplayName?: string;
}

interface DocItem {
  id: number;
  title: string;
  status: string;
  notes?: string;
  sortOrder: number;
  updatedAt: string;
  updatedByDisplayName?: string;
}

interface ContinuityRole {
  id: number;
  roleName: string;
  responsibility: string;
  whenNeeded: string;
  skillsRequired: string;
  costRange: string;
  emergencyPriority: string;
  engagementType: string;
}

interface ContinuityDependency {
  id: number;
  category: string;
  name: string;
  currentState?: string;
  continuityOption?: string;
  owner?: string;
  notes?: string;
  sortOrder: number;
}

interface AiUpdate {
  id: number;
  sectionKey: string;
  prompt: string;
  priorVersion: Record<string, unknown>;
  newVersion: Record<string, unknown>;
  status: string;
  createdByDisplayName?: string;
  createdAt: string;
  reviewedByDisplayName?: string;
  reviewedAt?: string;
}

// ── Status helpers ─────────────────────────────────────────────────────────

const DOC_STATUSES = ['not_started', 'drafted', 'needs_review', 'approved', 'archived'] as const;
type DocStatus = typeof DOC_STATUSES[number];

const statusLabel: Record<DocStatus, string> = {
  not_started: 'Not Started',
  drafted: 'Drafted',
  needs_review: 'Needs Review',
  approved: 'Approved',
  archived: 'Archived',
};

const statusVariant: Record<DocStatus, 'secondary' | 'default' | 'destructive' | 'outline'> = {
  not_started: 'secondary',
  drafted: 'outline',
  needs_review: 'outline',
  approved: 'default',
  archived: 'secondary',
};

const priorityColor: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-green-600 dark:text-green-400',
};

// ── AI Update Status Badge ─────────────────────────────────────────────────

function AiStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode; class: string }> = {
    draft_generated: { label: 'Draft Generated', icon: <Bot className="h-3 w-3" />, class: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    under_review: { label: 'Under Review', icon: <Clock className="h-3 w-3" />, class: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
    approved: { label: 'Approved', icon: <CheckCircle2 className="h-3 w-3" />, class: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    rejected: { label: 'Rejected', icon: <XCircle className="h-3 w-3" />, class: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  };
  const s = map[status] || map.under_review;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.class}`}>
      {s.icon}{s.label}
    </span>
  );
}

// ── Dependency Card ────────────────────────────────────────────────────────

function DependencyCard({ dep }: { dep: ContinuityDependency }) {
  return (
    <Card className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-900 dark:text-gray-100">{dep.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {dep.currentState && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current State</p>
            <p className="text-gray-700 dark:text-gray-300 mt-0.5">{dep.currentState}</p>
          </div>
        )}
        {dep.continuityOption && (
          <div>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Continuity Option</p>
            <p className="text-gray-700 dark:text-gray-300 mt-0.5">{dep.continuityOption}</p>
          </div>
        )}
        {dep.owner && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">Owner:</span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{dep.owner}</span>
          </div>
        )}
        {dep.notes && (
          <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-amber-700 dark:text-amber-400 italic">{dep.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Deployment Flow Diagram ────────────────────────────────────────────────

function DeploymentFlowDiagram() {
  const steps = [
    { icon: <GitBranch className="h-4 w-4" />, label: 'GitHub Repo' },
    { icon: <Package className="h-4 w-4" />, label: 'Build Process' },
    { icon: <Key className="h-4 w-4" />, label: 'Env Variables' },
    { icon: <Server className="h-4 w-4" />, label: 'Hosting Provider' },
    { icon: <Globe className="h-4 w-4" />, label: 'Domain / DNS' },
    { icon: <Database className="h-4 w-4" />, label: 'PostgreSQL DB' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 mt-3">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            {s.icon}<span className="text-xs font-medium">{s.label}</span>
          </div>
          {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}

// ── AI Update Modal ────────────────────────────────────────────────────────

function AiUpdateModal({
  open,
  onClose,
  sectionKey,
  sectionTitle,
  currentContent,
  onApproved,
}: {
  open: boolean;
  onClose: () => void;
  sectionKey: string;
  sectionTitle: string;
  currentContent: Record<string, unknown>;
  onApproved: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<AiUpdate | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/continuity/ai-updates/generate', {
      sectionKey, sectionTitle, currentContent, prompt,
    }),
    onSuccess: async (res) => {
      const data = await res.json();
      setDraft(data);
    },
    onError: () => toast({ title: 'Generation failed', description: 'Could not generate draft. Please try again.', variant: 'destructive' }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/continuity/ai-updates/${id}/approve`, {}),
    onSuccess: () => {
      toast({ title: 'Draft approved', description: 'Section content has been updated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/continuity/ai-updates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/continuity/sections'] });
      onApproved();
      handleClose();
    },
    onError: () => toast({ title: 'Approval failed', variant: 'destructive' }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/continuity/ai-updates/${id}/reject`, {}),
    onSuccess: () => {
      toast({ title: 'Draft rejected' });
      queryClient.invalidateQueries({ queryKey: ['/api/continuity/ai-updates'] });
      handleClose();
    },
    onError: () => toast({ title: 'Rejection failed', variant: 'destructive' }),
  });

  function handleClose() {
    setPrompt('');
    setDraft(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-600" />
            AI-Assisted Update — {sectionTitle}
          </DialogTitle>
          <DialogDescription>
            Describe the change you want to make. A draft will be generated for your review before anything is saved.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-4 py-2">
            <Textarea
              placeholder={`Example: "Update the hosting continuity section to reflect that EPOCH is now connected to GitHub and can be redeployed through Replit or another GitHub-connected provider."`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The AI will update only the text fields in this section. You will review and approve or reject the result before it takes effect.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <AiStatusBadge status={draft.status} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Current Version</p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                  {JSON.stringify(draft.priorVersion, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Proposed Version</p>
                <pre className="text-xs bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                  {JSON.stringify(draft.newVersion, null, 2)}
                </pre>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
              Review the proposed changes carefully. Approving will update this section's content immediately.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          {!draft ? (
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={prompt.trim().length < 10 || generateMutation.isPending}
            >
              {generateMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</> : <><Bot className="h-4 w-4 mr-2" />Generate Draft</>}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => rejectMutation.mutate(draft.id)}
                disabled={rejectMutation.isPending}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                <X className="h-4 w-4 mr-1" />Reject
              </Button>
              <Button
                onClick={() => approveMutation.mutate(draft.id)}
                disabled={approveMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="h-4 w-4 mr-1" />Approve & Apply
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function BusinessContinuityDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [aiModal, setAiModal] = useState<{ open: boolean; sectionKey: string; sectionTitle: string; content: Record<string, unknown> }>({
    open: false, sectionKey: '', sectionTitle: '', content: {},
  });

  // ── Queries ──
  const { data: sections = [], isLoading: sectionsLoading } = useQuery<ContinuitySection[]>({
    queryKey: ['/api/continuity/sections'],
  });

  const { data: docItems = [], isLoading: docsLoading } = useQuery<DocItem[]>({
    queryKey: ['/api/continuity/doc-items'],
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery<ContinuityRole[]>({
    queryKey: ['/api/continuity/roles'],
  });

  const { data: dependencies = [], isLoading: depsLoading } = useQuery<ContinuityDependency[]>({
    queryKey: ['/api/continuity/dependencies'],
  });

  const { data: aiUpdates = [] } = useQuery<AiUpdate[]>({
    queryKey: ['/api/continuity/ai-updates'],
  });

  // ── Doc item status mutation ──
  const updateDocStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest('PATCH', `/api/continuity/doc-items/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/continuity/doc-items'] });
      toast({ title: 'Status updated' });
    },
    onError: () => toast({ title: 'Failed to update status', variant: 'destructive' }),
  });

  // ── Helper: get section by key ──
  function getSection(key: string): ContinuitySection | undefined {
    return sections.find((s) => s.sectionKey === key);
  }

  function openAiModal(sectionKey: string, sectionTitle: string, content: Record<string, unknown>) {
    setAiModal({ open: true, sectionKey, sectionTitle, content });
  }

  // ── Derived data ──
  const sysDeps = dependencies.filter((d) => d.category === 'system');
  const accountingDeps = dependencies.filter((d) => d.category === 'accounting');
  const payrollDeps = dependencies.filter((d) => d.category === 'payroll');
  const credentialDeps = dependencies.filter((d) => d.category === 'credential');

  const docStatusCounts = DOC_STATUSES.reduce((acc, s) => {
    acc[s] = docItems.filter((d) => d.status === s).length;
    return acc;
  }, {} as Record<DocStatus, number>);

  const execSection = getSection('executive_summary');
  const triageSection = getSection('triage_decision_map');

  const pendingAiUpdates = aiUpdates.filter((u) => u.status === 'draft_generated' || u.status === 'under_review');

  if (sectionsLoading || depsLoading || rolesLoading || docsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                <Shield className="h-4 w-4" />
                <span>Governance</span>
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium text-red-600 dark:text-red-400">Business Continuity</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Business Continuity Dashboard</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                EPOCH system ownership, access governance, and operational continuity mapping — for company owners and senior leadership.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {pendingAiUpdates.length > 0 && (
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
                  <Clock className="h-3 w-3 mr-1" />{pendingAiUpdates.length} pending review
                </Badge>
              )}
              <Badge variant="outline" className="border-gray-300">
                <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                {docStatusCounts.approved} of {docItems.length} docs approved
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Tabs defaultValue="executive">
          <TabsList className="flex flex-wrap gap-1 h-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1 mb-6">
            <TabsTrigger value="executive" className="text-xs">Executive Summary</TabsTrigger>
            <TabsTrigger value="ownership" className="text-xs">System Ownership</TabsTrigger>
            <TabsTrigger value="credentials" className="text-xs">Credentials</TabsTrigger>
            <TabsTrigger value="database" className="text-xs">Database</TabsTrigger>
            <TabsTrigger value="hosting" className="text-xs">Hosting & Deployment</TabsTrigger>
            <TabsTrigger value="accounting" className="text-xs">Accounting</TabsTrigger>
            <TabsTrigger value="payroll" className="text-xs">Payroll & Payments</TabsTrigger>
            <TabsTrigger value="roles" className="text-xs">Support Roles</TabsTrigger>
            <TabsTrigger value="triage" className="text-xs">Triage Map</TabsTrigger>
            <TabsTrigger value="docs" className="text-xs">
              Documentation
              {docStatusCounts.not_started > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                  {docStatusCounts.not_started}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs">
              AI Updates
              {pendingAiUpdates.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {pendingAiUpdates.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── 1. Executive Summary ───────────────────────────────────────── */}
          <TabsContent value="executive" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Executive Summary</h2>
              {execSection && (
                <Button variant="outline" size="sm" onClick={() => openAiModal('executive_summary', 'Executive Summary', execSection.content)}>
                  <Bot className="h-4 w-4 mr-1.5" />AI Update
                </Button>
              )}
            </div>
            {execSection ? (
              <div className="space-y-4">
                <Card className="border-l-4 border-l-blue-600 bg-white dark:bg-gray-900">
                  <CardContent className="pt-5">
                    <p className="text-base leading-relaxed text-gray-800 dark:text-gray-200 font-medium italic">
                      "{String(execSection.content.headline || '')}"
                    </p>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Purpose', key: 'purpose', icon: <BookOpen className="h-4 w-4 text-blue-600" /> },
                    { label: 'System Readiness', key: 'readinessStatement', icon: <CheckCircle2 className="h-4 w-4 text-green-600" /> },
                    { label: 'Message to Owners', key: 'ownerMessage', icon: <Building2 className="h-4 w-4 text-amber-600" /> },
                  ].map(({ label, key, icon }) => (
                    <Card key={key} className="bg-white dark:bg-gray-900">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">{icon}{label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                          {String(execSection.content[key] || '')}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                  <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-blue-800 dark:text-blue-200">Key Continuity Areas</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        {['Source code & repository', 'Database & backups', 'Hosting & deployment', 'Credentials & access', 'Accounting dependencies', 'Qualified support roles'].map((item) => (
                          <li key={item} className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />{item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
                {execSection.updatedByDisplayName && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Last updated by {execSection.updatedByDisplayName} · {new Date(execSection.updatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ) : (
              <Card className="bg-white dark:bg-gray-900">
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Section content not found. Database may need re-seeding.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── 2. System Ownership Map ────────────────────────────────────── */}
          <TabsContent value="ownership" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">System Ownership Map</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Maps each major system component with its current state and the continuity path available if the primary provider or access method changes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sysDeps.map((dep) => <DependencyCard key={dep.id} dep={dep} />)}
            </div>
          </TabsContent>

          {/* ── 3. Credential & Access Governance ─────────────────────────── */}
          <TabsContent value="credentials" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Credential & Access Governance</h2>
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
              <CardContent className="pt-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Owner guidance:</strong> Real credentials should never be stored in this dashboard. All access credentials should be stored in a password vault (1Password, Bitwarden, Keeper, or Google Workspace) with controlled access. Use this section to map categories, assign ownership, and document decision needs.
                </p>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {credentialDeps.map((dep) => <DependencyCard key={dep.id} dep={dep} />)}
            </div>
          </TabsContent>

          {/* ── 4. Database Continuity ─────────────────────────────────────── */}
          <TabsContent value="database" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Database Continuity Map</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-white dark:bg-gray-900">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4 text-blue-600" />Database Engine</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-gray-700 dark:text-gray-300">PostgreSQL — an open-source, enterprise-grade relational database. Supported by thousands of managed hosting providers worldwide.</p></CardContent>
              </Card>
              <Card className="bg-white dark:bg-gray-900">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4 text-green-600" />Current Provider</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-gray-700 dark:text-gray-300">Managed PostgreSQL — current provider TBD. The application code and data are separate assets; migrating the host does not automatically migrate the database.</p></CardContent>
              </Card>
              <Card className="bg-white dark:bg-gray-900">
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><RefreshCw className="h-4 w-4 text-purple-600" />Backup Status</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-amber-700 dark:text-amber-400">Backup status and restore testing procedures are not yet formally documented. See Documentation Roadmap.</p></CardContent>
              </Card>
            </div>
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-sm">Key Continuity Principles</CardTitle>
                <CardDescription>What a qualified technician or DBA would need to know</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {[
                    'EPOCH application code and EPOCH data are separate — you can move the application hosting without moving the database, and vice versa.',
                    'A PostgreSQL DBA can perform backup/restore, migrate to a new provider, and verify data integrity without understanding the application code.',
                    'Database access requires the DATABASE_URL environment variable, which contains the connection string. This must be stored securely in the password vault.',
                    'The Drizzle ORM schema file (server/schema.ts) documents the full database structure and can be used by a DBA to understand table relationships.',
                    'Restore testing should be performed regularly on a non-production environment to confirm backup integrity.',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />{item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 5. Hosting & Deployment ───────────────────────────────────── */}
          <TabsContent value="hosting" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Hosting & Deployment Continuity Map</h2>
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-sm">Deployment Flow</CardTitle>
                <CardDescription>How EPOCH goes from source code to a live application</CardDescription>
              </CardHeader>
              <CardContent>
                <DeploymentFlowDiagram />
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Host</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">Replit</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Deploy action: Republish</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Code Location</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">GitHub</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">agcomphr25/EPOCH-v83</p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Continuity Path</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">Any Node.js + PG Host</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Railway, Render, AWS, Azure, DigitalOcean</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-sm">What a Deployment Engineer Would Need</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {[
                    'GitHub repository access (read access minimum; write access for code changes)',
                    'Full list of required environment variables with their expected format (not the values — retrieve from vault)',
                    'Build command: npm run build',
                    'Start command: npm run start (or equivalent production start)',
                    'Node.js version: as specified in package.json engines field',
                    'Database connection string (DATABASE_URL) from password vault',
                    'Domain/DNS access to point the domain to the new host after migration',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />{item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            {sysDeps.filter(d => d.name === 'Application Hosting / Deployment').map((dep) => (
              <DependencyCard key={dep.id} dep={dep} />
            ))}
          </TabsContent>

          {/* ── 6. Accounting ─────────────────────────────────────────────── */}
          <TabsContent value="accounting" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Accounting & Reporting Dependency Map</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This section maps the dependency relationship between EPOCH and external accounting systems. It does not describe how to perform accounting tasks.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accountingDeps.map((dep) => <DependencyCard key={dep.id} dep={dep} />)}
            </div>
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-800 dark:text-blue-200">Continuity Principle</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  EPOCH and QuickBooks continuity are independent. A qualified accounting systems consultant can maintain QuickBooks operations without EPOCH access, and vice versa. The dependency is in the data flow between them — which should be documented in the Documentation Roadmap.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 7. Payroll & Payments ─────────────────────────────────────── */}
          <TabsContent value="payroll" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Payroll & Payment Dependency Map</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Maps the access and knowledge required to continue payroll and payment operations if primary personnel are unavailable.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {payrollDeps.map((dep) => <DependencyCard key={dep.id} dep={dep} />)}
            </div>
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4 text-purple-600" />What a Payroll Consultant Would Need</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {[
                    'Access to the payroll provider portal (credentials from password vault)',
                    'Timekeeping data from EPOCH — exportable from the database or admin interface',
                    'Pay period schedule and approval authority confirmation',
                    'Banking/payment processor access if applicable',
                    'Contact for payroll tax filings and compliance obligations',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" />{item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 8. Support Roles ──────────────────────────────────────────── */}
          <TabsContent value="roles" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Support Roles & Replacement Skills</h2>
            <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Planning estimates only.</strong> Cost ranges below are broad market benchmarks, clearly labeled as placeholders. They are not quotes. Actual costs depend on engagement structure, geography, and consultant availability.
                </p>
              </CardContent>
            </Card>
            {rolesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading roles…</div>
            ) : (
              <div className="space-y-3">
                {roles.map((role) => (
                  <Card key={role.id} className="bg-white dark:bg-gray-900">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{role.roleName}</h3>
                            <Badge variant="outline" className="text-xs capitalize">{role.engagementType.replace('-', ' ')}</Badge>
                            <span className={`text-xs font-medium capitalize ${priorityColor[role.emergencyPriority] || ''}`}>
                              {role.emergencyPriority} priority
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5">{role.responsibility}</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                            <div>
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">When Needed</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">{role.whenNeeded}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Skills Required</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">{role.skillsRequired}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Est. Cost Range</p>
                              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{role.costRange}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── 9. Triage Decision Map ─────────────────────────────────────── */}
          <TabsContent value="triage" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Triage Decision Map</h2>
              {triageSection && (
                <Button variant="outline" size="sm" onClick={() => openAiModal('triage_decision_map', 'Triage Decision Map', triageSection.content)}>
                  <Bot className="h-4 w-4 mr-1.5" />AI Update
                </Button>
              )}
            </div>
            {triageSection ? (
              <div className="space-y-4">
                <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                  <CardContent className="pt-4">
                    <p className="text-sm text-blue-800 dark:text-blue-200">{String(triageSection.content.intro || '')}</p>
                  </CardContent>
                </Card>
                <div className="space-y-3">
                  {(['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const).map((stepKey, i) => {
                    const step = triageSection.content[stepKey] as { label: string; description: string } | undefined;
                    if (!step) return null;
                    return (
                      <Card key={stepKey} className="bg-white dark:bg-gray-900">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">{i + 1}</div>
                            <div>
                              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{step.label}</h3>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{step.description}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Card className="bg-white dark:bg-gray-900">
                <CardContent className="pt-6"><p className="text-sm text-gray-500">Section content not found.</p></CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── 10. Documentation Roadmap ──────────────────────────────────── */}
          <TabsContent value="docs" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Documentation Roadmap</h2>
            <div className="flex gap-3 flex-wrap">
              {DOC_STATUSES.map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <Badge variant={statusVariant[s]}>{statusLabel[s]}</Badge>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{docStatusCounts[s]}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {docItems.map((item) => (
                <Card key={item.id} className="bg-white dark:bg-gray-900">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.updatedByDisplayName && (
                          <span className="text-xs text-gray-400 hidden md:block">
                            {item.updatedByDisplayName} · {new Date(item.updatedAt).toLocaleDateString()}
                          </span>
                        )}
                        <Select
                          value={item.status}
                          onValueChange={(value) => updateDocStatus.mutate({ id: item.id, status: value })}
                        >
                          <SelectTrigger className="w-36 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DOC_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── 11. AI Update Workflow ─────────────────────────────────────── */}
          <TabsContent value="ai" className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI-Assisted Update Workflow</h2>
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4 space-y-2">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">How this works</p>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 flex-shrink-0 mt-0.5" />An authorized admin selects a section and enters an update prompt describing the desired change.</li>
                  <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 flex-shrink-0 mt-0.5" />The AI generates a draft revision. Nothing is saved until the admin reviews and explicitly approves it.</li>
                  <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 flex-shrink-0 mt-0.5" />Approved changes update the section content and are logged here with who approved them and when.</li>
                  <li className="flex items-start gap-2"><ChevronRight className="h-4 w-4 flex-shrink-0 mt-0.5" />Rejected drafts are preserved in this log for reference but never applied.</li>
                </ul>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 italic">
                  To initiate an update, navigate to the Executive Summary or Triage Decision Map tab and click "AI Update".
                </p>
              </CardContent>
            </Card>

            {aiUpdates.length === 0 ? (
              <Card className="bg-white dark:bg-gray-900">
                <CardContent className="pt-6 text-center">
                  <Bot className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No AI updates have been generated yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {[...aiUpdates].reverse().map((update) => (
                  <Card key={update.id} className="bg-white dark:bg-gray-900">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <AiStatusBadge status={update.status} />
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{update.sectionKey}</span>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 italic">"{update.prompt}"</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                            <span>Generated by {update.createdByDisplayName || 'Unknown'} · {new Date(update.createdAt).toLocaleString()}</span>
                            {update.reviewedByDisplayName && update.reviewedAt && (
                              <span>Reviewed by {update.reviewedByDisplayName} · {new Date(update.reviewedAt).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        {(update.status === 'draft_generated' || update.status === 'under_review') && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50 h-7 text-xs"
                              onClick={() => apiRequest('POST', `/api/continuity/ai-updates/${update.id}/reject`, {}).then(() => queryClient.invalidateQueries({ queryKey: ['/api/continuity/ai-updates'] }))}
                            >
                              <X className="h-3 w-3 mr-1" />Reject
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                              onClick={() => apiRequest('POST', `/api/continuity/ai-updates/${update.id}/approve`, {}).then(() => { queryClient.invalidateQueries({ queryKey: ['/api/continuity/ai-updates'] }); queryClient.invalidateQueries({ queryKey: ['/api/continuity/sections'] }); toast({ title: 'Draft approved' }); })}
                            >
                              <Check className="h-3 w-3 mr-1" />Approve
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* AI Update Modal */}
      <AiUpdateModal
        open={aiModal.open}
        onClose={() => setAiModal((prev) => ({ ...prev, open: false }))}
        sectionKey={aiModal.sectionKey}
        sectionTitle={aiModal.sectionTitle}
        currentContent={aiModal.content}
        onApproved={() => queryClient.invalidateQueries({ queryKey: ['/api/continuity/sections'] })}
      />
    </div>
  );
}
