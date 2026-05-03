import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Lock, Eye, Download, XCircle, Plus, Trash2, RefreshCw, FileText, Users, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

type Classification = 'public' | 'internal' | 'restricted' | 'classified';

interface VaultDocument {
  id: string;
  document_number: string;
  document_name: string;
  document_type: string;
  department: string;
  status: string;
  classification: Classification;
  file_path: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_accessed: string | null;
  access_count: string;
}

interface VaultDocumentDetail extends VaultDocument {
  grants: VaultGrant[];
}

interface VaultGrant {
  id: number;
  grantee_type: 'user' | 'role';
  grantee_name: string;
  granted_by: string;
  granted_at: string;
}

interface AccessLogEntry {
  id: number;
  document_id: string;
  user_id: string;
  action: 'view' | 'download' | 'denied';
  ip_address: string | null;
  accessed_at: string;
  document_name: string | null;
  document_number: string | null;
  classification: string | null;
}

interface AccessLogResult {
  entries: AccessLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Classification helpers ───────────────────────────────────────────────────

const CLASSIFICATION_CONFIG: Record<Classification, { label: string; color: string; icon: React.ReactNode }> = {
  public: {
    label: 'Public',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    icon: <Eye className="w-3 h-3" />,
  },
  internal: {
    label: 'Internal',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    icon: <Shield className="w-3 h-3" />,
  },
  restricted: {
    label: 'Restricted',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    icon: <Lock className="w-3 h-3" />,
  },
  classified: {
    label: 'Classified',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    icon: <Lock className="w-3 h-3" />,
  },
};

function ClassificationBadge({ classification }: { classification: string }) {
  const cfg = CLASSIFICATION_CONFIG[classification as Classification] ?? {
    label: classification,
    color: 'bg-gray-100 text-gray-800',
    icon: null,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  if (action === 'download') return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><Download className="w-3 h-3 mr-1" />Download</Badge>;
  if (action === 'denied') return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><XCircle className="w-3 h-3 mr-1" />Denied</Badge>;
  return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"><Eye className="w-3 h-3 mr-1" />View</Badge>;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  try { return format(parseISO(d), 'MMM d, yyyy HH:mm'); } catch { return d; }
}

// ─── Document Detail Drawer ───────────────────────────────────────────────────

function DocumentDetailDrawer({ docId, onClose }: { docId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [newGranteeType, setNewGranteeType] = useState<'user' | 'role'>('user');
  const [newGranteeName, setNewGranteeName] = useState('');
  const [selectedClassification, setSelectedClassification] = useState<Classification | null>(null);

  const { data: doc, isLoading } = useQuery<VaultDocumentDetail>({
    queryKey: ['/api/vault/controlled', docId],
  });

  const updateClassification = useMutation({
    mutationFn: (classification: Classification) =>
      apiRequest(`/api/vault/controlled/${docId}/classification`, { method: 'PUT', body: { classification } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vault/controlled'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vault/controlled', docId] });
      toast({ title: 'Classification updated' });
      setSelectedClassification(null);
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const addGrant = useMutation({
    mutationFn: () =>
      apiRequest(`/api/vault/controlled/${docId}/grants`, {
        method: 'POST',
        body: { granteeType: newGranteeType, granteeName: newGranteeName.trim() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vault/controlled', docId] });
      toast({ title: 'Access grant added' });
      setNewGranteeName('');
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const removeGrant = useMutation({
    mutationFn: (grantId: number) =>
      apiRequest(`/api/vault/controlled/${docId}/grants/${grantId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vault/controlled', docId] });
      toast({ title: 'Access grant removed' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const pendingClassification = selectedClassification ?? (doc?.classification as Classification | undefined);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-[480px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Document Details
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-3 mt-4">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : !doc ? (
          <p className="text-sm text-red-500 mt-4">Failed to load document.</p>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Document info */}
            <div className="space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Document Number</p>
              <p className="font-medium">{doc.document_number}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Name</p>
              <p className="font-medium">{doc.document_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">Type</p>
                <p className="text-sm">{doc.document_type}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">Department</p>
                <p className="text-sm">{doc.department}</p>
              </div>
            </div>

            {/* Classification control */}
            <div className="border-t pt-4 dark:border-gray-700">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Visibility Classification
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {(['public', 'internal', 'restricted', 'classified'] as Classification[]).map(c => (
                  <button
                    key={c}
                    onClick={() => setSelectedClassification(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border-2 transition-all ${
                      (pendingClassification === c)
                        ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                        : 'border-transparent'
                    }`}
                  >
                    <ClassificationBadge classification={c} />
                  </button>
                ))}
              </div>
              {selectedClassification && selectedClassification !== doc.classification && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => updateClassification.mutate(selectedClassification)}
                    disabled={updateClassification.isPending}
                  >
                    {updateClassification.isPending ? 'Saving…' : 'Save Classification'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedClassification(null)}>
                    Cancel
                  </Button>
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Restricted and Classified documents enforce ACL grants for non-admin users.
              </p>
            </div>

            {/* Access Grants */}
            <div className="border-t pt-4 dark:border-gray-700">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Access Grants
                <span className="text-xs text-gray-400 font-normal">(for restricted/classified)</span>
              </p>
              <div className="space-y-2 mb-4">
                {doc.grants.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No explicit grants. Admins and Owners always have access.</p>
                ) : (
                  doc.grants.map(grant => (
                    <div key={grant.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-xs font-medium">{grant.grantee_name}</span>
                        <span className="ml-2 text-xs text-gray-500">({grant.grantee_type})</span>
                        <p className="text-xs text-gray-400">Granted by {grant.granted_by} · {fmtDate(grant.granted_at)}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-700"
                        onClick={() => removeGrant.mutate(grant.id)}
                        disabled={removeGrant.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {/* Add grant form */}
              <div className="flex items-center gap-2">
                <Select value={newGranteeType} onValueChange={v => setNewGranteeType(v as 'user' | 'role')}>
                  <SelectTrigger className="w-24 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="role">Role</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 text-xs flex-1"
                  placeholder={newGranteeType === 'user' ? 'username' : 'ADMIN / EMPLOYEE'}
                  value={newGranteeName}
                  onChange={e => setNewGranteeName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newGranteeName.trim()) addGrant.mutate(); }}
                />
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => addGrant.mutate()}
                  disabled={!newGranteeName.trim() || addGrant.isPending}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            {/* Metadata */}
            <div className="border-t pt-4 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>Created by {doc.created_by} · {fmtDate(doc.created_at)}</p>
              <p>Last modified: {fmtDate(doc.updated_at)}</p>
              <p>Last accessed: {fmtDate(doc.last_accessed)}</p>
              <p>Total access events: {doc.access_count}</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Access Log Panel ─────────────────────────────────────────────────────────

function AccessLogPanel() {
  const [filterDocumentId, setFilterDocumentId] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: docList } = useQuery<VaultDocument[]>({
    queryKey: ['/api/vault/documents'],
  });

  const params = new URLSearchParams();
  if (filterDocumentId) params.set('documentId', filterDocumentId);
  if (filterUserId) params.set('userId', filterUserId);
  if (filterAction) params.set('action', filterAction);
  if (filterDateFrom) params.set('dateFrom', filterDateFrom);
  if (filterDateTo) params.set('dateTo', filterDateTo);
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  const { data, isLoading, refetch } = useQuery<AccessLogResult>({
    queryKey: ['/api/vault/access-log', filterDocumentId, filterUserId, filterAction, filterDateFrom, filterDateTo, offset],
    queryFn: () => fetch(`/api/vault/access-log?${params.toString()}`, { credentials: 'include' }).then(r => r.json()),
  });

  const resetFilters = () => {
    setFilterDocumentId('');
    setFilterUserId('');
    setFilterAction('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setOffset(0);
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-end bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
        <div className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-xs text-gray-500">Document</label>
          <Select
            value={filterDocumentId}
            onValueChange={v => { setFilterDocumentId(v === 'all' ? '' : v); setOffset(0); }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All documents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All documents</SelectItem>
              {(docList ?? []).map(d => (
                <SelectItem key={d.id} value={d.id}>
                  {d.document_number} — {d.document_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs text-gray-500">User</label>
          <Input
            className="h-8 text-xs"
            placeholder="username..."
            value={filterUserId}
            onChange={e => { setFilterUserId(e.target.value); setOffset(0); }}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[120px]">
          <label className="text-xs text-gray-500">Action</label>
          <Select value={filterAction} onValueChange={v => { setFilterAction(v === 'all' ? '' : v); setOffset(0); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="view">View</SelectItem>
              <SelectItem value="download">Download</SelectItem>
              <SelectItem value="denied">Denied</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs text-gray-500">From date</label>
          <Input
            className="h-8 text-xs"
            type="date"
            value={filterDateFrom}
            onChange={e => { setFilterDateFrom(e.target.value); setOffset(0); }}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs text-gray-500">To date</label>
          <Input
            className="h-8 text-xs"
            type="date"
            value={filterDateTo}
            onChange={e => { setFilterDateTo(e.target.value); setOffset(0); }}
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={resetFilters}>Clear</Button>
          <Button size="sm" variant="outline" className="h-8" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Log table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !data?.entries?.length ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No access log entries found.</p>
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Showing {data.entries.length} of {data.total} entries
          </div>
          <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">Timestamp</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">User</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">Action</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">Document</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">Classification</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map(entry => (
                  <tr key={entry.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {fmtDate(entry.accessed_at)}
                    </td>
                    <td className="px-3 py-2 text-xs font-medium">{entry.user_id}</td>
                    <td className="px-3 py-2"><ActionBadge action={entry.action} /></td>
                    <td className="px-3 py-2 text-xs">
                      {entry.document_number && <span className="text-gray-400 mr-1">{entry.document_number}</span>}
                      {entry.document_name ?? <span className="text-gray-400 italic">Unknown</span>}
                    </td>
                    <td className="px-3 py-2">
                      {entry.classification
                        ? <ClassificationBadge classification={entry.classification} />
                        : <span className="text-gray-400 text-xs">—</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{entry.ip_address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.total > limit && (
            <div className="flex items-center gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Previous
              </Button>
              <span className="text-xs text-gray-500">
                Page {Math.floor(offset / limit) + 1} of {Math.ceil(data.total / limit)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + limit >= data.total}
                onClick={() => setOffset(offset + limit)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Document List ────────────────────────────────────────────────────────────

function DocumentList({ onSelectDoc }: { onSelectDoc: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');

  const { data: docs, isLoading, refetch } = useQuery<VaultDocument[]>({
    queryKey: ['/api/vault/controlled'],
  });

  const filtered = useMemo(() => {
    if (!docs) return [];
    return docs.filter(d => {
      const matchSearch = !search ||
        d.document_name.toLowerCase().includes(search.toLowerCase()) ||
        d.document_number.toLowerCase().includes(search.toLowerCase()) ||
        d.department.toLowerCase().includes(search.toLowerCase());
      const matchClass = !classFilter || d.classification === classFilter;
      return matchSearch && matchClass;
    });
  }, [docs, search, classFilter]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Input
          className="h-8 text-sm flex-1 min-w-[200px]"
          placeholder="Search by name, number, department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Select value={classFilter} onValueChange={v => setClassFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="All classifications" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classifications</SelectItem>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
            <SelectItem value="classified">Classified</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        {filtered.length} of {docs?.length ?? 0} documents
      </div>

      <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">Document</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">Type / Dept</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">Classification</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">Last Accessed</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300">Events</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400 dark:text-gray-500 text-xs">
                  No documents match your filters.
                </td>
              </tr>
            ) : filtered.map(doc => (
              <tr
                key={doc.id}
                className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                onClick={() => onSelectDoc(doc.id)}
              >
                <td className="px-3 py-2">
                  <p className="font-medium text-sm">{doc.document_name}</p>
                  <p className="text-xs text-gray-400">{doc.document_number}</p>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                  <p>{doc.document_type}</p>
                  <p className="text-gray-400">{doc.department}</p>
                </td>
                <td className="px-3 py-2">
                  <ClassificationBadge classification={doc.classification} />
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {fmtDate(doc.last_accessed)}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                  {doc.access_count}
                </td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={e => { e.stopPropagation(); onSelectDoc(doc.id); }}
                  >
                    Manage
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SecureVaultPage() {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <Shield className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Secure Vault</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">CMMC document classification and access audit log</p>
          </div>
        </div>
        <div className="flex gap-3 mt-3">
          {(['public', 'internal', 'restricted', 'classified'] as Classification[]).map(c => (
            <div key={c} className="flex items-center gap-1.5">
              <ClassificationBadge classification={c} />
            </div>
          ))}
          <span className="text-xs text-gray-400 dark:text-gray-500 self-center ml-1">— sensitivity levels enforced on download</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="documents">
        <TabsList className="mb-4">
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="w-4 h-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="access-log" className="gap-2">
            <Clock className="w-4 h-4" />
            Access Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Controlled Document Registry
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentList onSelectDoc={setSelectedDocId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access-log">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Immutable Access Audit Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AccessLogPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail drawer */}
      {selectedDocId && (
        <DocumentDetailDrawer docId={selectedDocId} onClose={() => setSelectedDocId(null)} />
      )}
    </div>
  );
}
