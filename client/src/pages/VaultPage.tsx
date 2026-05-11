import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  Lock,
  Shield,
  Eye,
  Download,
  Users,
  Trash2,
  FileText,
  AlertTriangle,
  Globe,
  Building2,
  History,
  CheckCircle,
  XCircle,
  ArrowUpFromLine,
  Settings2,
} from 'lucide-react';
import { format } from 'date-fns';

type Classification = 'public' | 'internal' | 'cui' | 'itar';
type ScopeType = 'global' | 'project' | 'department';
type DocumentCategory = 'cad' | 'drawing' | 'spec' | 'customer_file' | 'controlled_document' | 'policy';

interface VaultDoc {
  id: number;
  name: string;
  description: string | null;
  classification: Classification;
  cuiCategory: string | null;
  itarCategory: string | null;
  exportControlJurisdiction: string | null;
  documentCategory: DocumentCategory;
  customerId: string | null;
  customerName: string | null;
  contractArtifactType: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  scopeType: ScopeType;
  scopeValue: string | null;
  contentType: string;
  fileSizeBytes: number | null;
  encryptionAtRestPolicy: string;
  accessRule: string;
  mfaRequired: boolean;
  deviceTrackingRequired: boolean;
  downloadTrackingRequired: boolean;
  expiringLinksRequired: boolean;
  linkExpiresInSeconds: number;
  sessionTimeoutMinutes: number;
  uploaderUserId: number;
  uploaderDisplayName: string;
  createdAt: string;
  isControlled: boolean;
  canAccess: boolean;
}

interface AccessGrant {
  id: number;
  documentId: number;
  grantedToUserId: number;
  grantedToDisplayName: string;
  grantedByUserId: number;
  grantedByDisplayName: string;
  createdAt: string;
}

interface VaultUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

interface DocumentAuditEvent {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  meta: Record<string, any> | null;
  createdAt: string;
}

const CLASSIFICATION_CONFIG: Record<Classification, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  public: {
    label: 'Public',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    icon: <Globe className="h-3 w-3" />,
    description: 'Accessible to everyone',
  },
  internal: {
    label: 'Internal',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    icon: <Building2 className="h-3 w-3" />,
    description: 'Accessible to all authenticated users',
  },
  cui: {
    label: 'CUI',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    icon: <Shield className="h-3 w-3" />,
    description: 'Controlled Unclassified Information — restricted access',
  },
  itar: {
    label: 'ITAR',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    icon: <Lock className="h-3 w-3" />,
    description: 'Export Controlled — strictly restricted access',
  },
};

const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  cad: 'CAD',
  drawing: 'Drawing',
  spec: 'Specification',
  customer_file: 'Customer File',
  controlled_document: 'Controlled Document',
  policy: 'Policy',
};

function ClassificationBadge({ classification }: { classification: Classification }) {
  const config = CLASSIFICATION_CONFIG[classification] || CLASSIFICATION_CONFIG.internal;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ScopeLabel({ scopeType, scopeValue }: { scopeType: ScopeType; scopeValue: string | null }) {
  if (scopeType === 'global') return <span className="text-muted-foreground text-xs">Organization-wide</span>;
  if (scopeType === 'project') return <span className="text-xs text-blue-600 dark:text-blue-400">Project: {scopeValue}</span>;
  if (scopeType === 'department') return <span className="text-xs text-purple-600 dark:text-purple-400">Dept: {scopeValue}</span>;
  return null;
}

const AUDIT_ACTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  DOCUMENT_DOWNLOAD: {
    label: 'Downloaded',
    icon: <Download className="h-3.5 w-3.5" />,
    color: 'text-green-600 dark:text-green-400',
  },
  DOCUMENT_UPLOAD: {
    label: 'Uploaded',
    icon: <ArrowUpFromLine className="h-3.5 w-3.5" />,
    color: 'text-blue-600 dark:text-blue-400',
  },
  DOCUMENT_ACL_CHANGE: {
    label: 'Access Changed',
    icon: <Settings2 className="h-3.5 w-3.5" />,
    color: 'text-orange-600 dark:text-orange-400',
  },
  DOCUMENT_ACCESS_DENIED: {
    label: 'Access Denied',
    icon: <XCircle className="h-3.5 w-3.5" />,
    color: 'text-red-600 dark:text-red-400',
  },
  DOCUMENT_DELETE: {
    label: 'Deleted',
    icon: <Trash2 className="h-3.5 w-3.5" />,
    color: 'text-red-600 dark:text-red-400',
  },
};

function AuditActionLabel({ action }: { action: string }) {
  const cfg = AUDIT_ACTION_CONFIG[action];
  if (!cfg) {
    return <span className="text-xs text-muted-foreground">{action}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function AclChangeDetail({ meta }: { meta: Record<string, any> | null }) {
  if (!meta) return null;
  if (meta.changeType === 'grant') {
    return (
      <span className="text-xs text-muted-foreground">
        Granted to <span className="font-medium">{meta.grantedToDisplayName}</span>
      </span>
    );
  }
  if (meta.changeType === 'revoke') {
    return (
      <span className="text-xs text-muted-foreground">
        Revoked from <span className="font-medium">{meta.revokedFromDisplayName}</span>
      </span>
    );
  }
  return null;
}

export default function VaultPage() {
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string } | null>({
    queryKey: ['currentUser'],
  });
  const { toast } = useToast();
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'OWNER';

  const [uploadOpen, setUploadOpen] = useState(false);
  const [accessPanelDocId, setAccessPanelDocId] = useState<number | null>(null);
  const [auditPanelDocId, setAuditPanelDocId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    name: '',
    description: '',
    classification: 'internal' as Classification,
    cuiCategory: '',
    itarCategory: '',
    exportControlJurisdiction: '',
    documentCategory: 'controlled_document' as DocumentCategory,
    customerId: '',
    customerName: '',
    contractArtifactType: '',
    sourceEntityType: '',
    sourceEntityId: '',
    scopeType: 'global' as ScopeType,
    scopeValue: '',
    linkExpiresInSeconds: '900',
    sessionTimeoutMinutes: '30',
  });

  // Grant form
  const [grantUserId, setGrantUserId] = useState('');

  const { data: docs, isLoading: docsLoading } = useQuery<VaultDoc[]>({
    queryKey: ['/api/vault/documents'],
  });

  const { data: grants, isLoading: grantsLoading } = useQuery<AccessGrant[]>({
    queryKey: ['/api/vault/documents', accessPanelDocId, 'access'],
    enabled: !!accessPanelDocId && isAdmin,
  });

  const { data: vaultUsers } = useQuery<VaultUser[]>({
    queryKey: ['/api/vault/users'],
    enabled: isAdmin,
  });

  const { data: documentAuditEvents, isLoading: auditLoading } = useQuery<DocumentAuditEvent[]>({
    queryKey: ['/api/audit/events/vault_document', auditPanelDocId],
    enabled: !!auditPanelDocId && isAdmin,
  });

  const auditDoc = docs?.find(d => d.id === auditPanelDocId);

  const grantAccessMutation = useMutation({
    mutationFn: ({ docId, userId }: { docId: number; userId: string }) =>
      apiRequest(`/api/vault/documents/${docId}/access`, { method: 'POST', body: { grantedToUserId: parseInt(userId) } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vault/documents', accessPanelDocId, 'access'] });
      setGrantUserId('');
      toast({ title: 'Access granted' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to grant access', description: err?.message || 'Unknown error', variant: 'destructive' });
    },
  });

  const revokeAccessMutation = useMutation({
    mutationFn: (grantId: number) => apiRequest(`/api/vault/access/${grantId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vault/documents', accessPanelDocId, 'access'] });
      toast({ title: 'Access revoked' });
    },
    onError: () => {
      toast({ title: 'Failed to revoke access', variant: 'destructive' });
    },
  });

  const registerDocMutation = useMutation({
    mutationFn: (data: object) => apiRequest('/api/vault/documents', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vault/documents'] });
      setUploadOpen(false);
      setSelectedFile(null);
      setUploadForm({
        name: '',
        description: '',
        classification: 'internal',
        cuiCategory: '',
        itarCategory: '',
        exportControlJurisdiction: '',
        documentCategory: 'controlled_document',
        customerId: '',
        customerName: '',
        contractArtifactType: '',
        sourceEntityType: '',
        sourceEntityId: '',
        scopeType: 'global',
        scopeValue: '',
        linkExpiresInSeconds: '900',
        sessionTimeoutMinutes: '30',
      });
      toast({ title: 'Document uploaded successfully' });
    },
    onError: (err: any) => {
      toast({ title: 'Upload failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    },
  });

  async function handleUpload() {
    if (!selectedFile) {
      toast({ title: 'Please select a file', variant: 'destructive' });
      return;
    }
    if (!uploadForm.name.trim()) {
      toast({ title: 'Please enter a document name', variant: 'destructive' });
      return;
    }

    setUploadProgress(true);
    try {
      // Step 1: Get presigned URL
      const urlRes = await apiRequest('/api/vault/documents/request-upload', {
        method: 'POST',
        body: {
          name: selectedFile.name,
          contentType: selectedFile.type,
          fileSizeBytes: selectedFile.size,
        },
      }) as { uploadURL: string; objectPath: string };

      const { uploadURL, objectPath } = urlRes;

      // Step 2: Upload the file directly to presigned URL
      const putRes = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
        body: selectedFile,
      });

      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.statusText}`);

      // Step 3: Register the document
      await registerDocMutation.mutateAsync({
        name: uploadForm.name.trim(),
        description: uploadForm.description.trim() || undefined,
        objectPath,
        classification: uploadForm.classification,
        cuiCategory: uploadForm.cuiCategory.trim() || undefined,
        itarCategory: uploadForm.itarCategory.trim() || undefined,
        exportControlJurisdiction: uploadForm.exportControlJurisdiction.trim() || undefined,
        documentCategory: uploadForm.documentCategory,
        customerId: uploadForm.customerId.trim() || undefined,
        customerName: uploadForm.customerName.trim() || undefined,
        contractArtifactType: uploadForm.contractArtifactType.trim() || undefined,
        sourceEntityType: uploadForm.sourceEntityType.trim() || undefined,
        sourceEntityId: uploadForm.sourceEntityId.trim() || undefined,
        scopeType: uploadForm.scopeType,
        scopeValue: uploadForm.scopeType !== 'global' ? uploadForm.scopeValue.trim() : undefined,
        contentType: selectedFile.type || 'application/octet-stream',
        fileSizeBytes: selectedFile.size,
        linkExpiresInSeconds: uploadForm.linkExpiresInSeconds,
        sessionTimeoutMinutes: uploadForm.sessionTimeoutMinutes,
      });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setUploadProgress(false);
    }
  }

  async function handleDownload(doc: VaultDoc) {
    try {
      const result = await apiRequest(`/api/vault/documents/${doc.id}/download`, { method: 'GET' }) as {
        downloadUrl: string;
        expiresIn: number;
        filename: string;
        contentType: string;
      };
      window.open(result.downloadUrl, '_blank');
    } catch (err: any) {
      toast({
        title: 'Download failed',
        description: err?.message || 'You may not have access to this document.',
        variant: 'destructive',
      });
    }
  }

  const accessDoc2 = docs?.find(d => d.id === accessPanelDocId);

  return (
    <div className="container mx-auto py-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lock className="h-6 w-6 text-orange-600" />
            Document Vault
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Secure storage for controlled and classified documents (CUI / ITAR)
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Classification legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(Object.entries(CLASSIFICATION_CONFIG) as [Classification, typeof CLASSIFICATION_CONFIG[Classification]][]).map(([key, cfg]) => (
          <Card key={key} className="border">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ClassificationBadge classification={key} />
              </div>
              <p className="text-xs text-muted-foreground">{cfg.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Document list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents
            {docs && <span className="text-muted-foreground font-normal text-sm">({docs.length})</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {docsLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !docs || docs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No documents uploaded yet.</p>
              <p className="text-sm">Click "Upload Document" to add your first file.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Security</TableHead>
                  <TableHead>Uploader</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map(doc => (
                  <TableRow key={doc.id} className={!doc.canAccess ? 'opacity-60' : undefined}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {doc.canAccess ? (
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <Lock className="h-4 w-4 text-red-500 flex-shrink-0" />
                        )}
                        <div>
                          <div>{doc.name}</div>
                          {doc.description && doc.canAccess && (
                            <div className="text-xs text-muted-foreground">{doc.description}</div>
                          )}
                          {!doc.canAccess && (
                            <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                              <Shield className="h-3 w-3" />
                              Access restricted — contact an administrator
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{DOCUMENT_CATEGORY_LABELS[doc.documentCategory] ?? doc.documentCategory}</div>
                      {(doc.customerName || doc.customerId) && (
                        <div className="text-xs text-muted-foreground">
                          {doc.customerName || doc.customerId}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <ClassificationBadge classification={doc.classification} />
                      {(doc.cuiCategory || doc.itarCategory) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {doc.cuiCategory || doc.itarCategory}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <ScopeLabel scopeType={doc.scopeType} scopeValue={doc.scopeValue} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{doc.encryptionAtRestPolicy.replace(/_/g, ' ')}</div>
                      <div>{doc.mfaRequired ? 'MFA/step-up required' : 'Session auth'}</div>
                      <div>{doc.expiringLinksRequired ? `${doc.linkExpiresInSeconds}s link` : 'Standard link'}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.uploaderDisplayName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.canAccess ? formatBytes(doc.fileSizeBytes) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {doc.canAccess ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownload(doc)}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground px-2">
                            <Eye className="h-4 w-4 inline opacity-40" />
                          </span>
                        )}
                        {isAdmin && doc.isControlled && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAccessPanelDocId(doc.id)}
                            title="Manage access"
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAuditPanelDocId(doc.id)}
                            title="View access log"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Document
            </DialogTitle>
            <DialogDescription>
              Upload a document and assign a classification level and access scope.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* File selection */}
            <div>
              <Label htmlFor="vault-file">File</Label>
              <div
                className="mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="text-muted-foreground">({formatBytes(selectedFile.size)})</span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <Upload className="h-6 w-6 mx-auto mb-1 opacity-50" />
                    Click to select a file
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0] || null;
                  setSelectedFile(f);
                  if (f && !uploadForm.name) {
                    setUploadForm(prev => ({ ...prev, name: f.name.replace(/\.[^.]+$/, '') }));
                  }
                }}
              />
            </div>

            {/* Name */}
            <div>
              <Label htmlFor="vault-name">Document Name</Label>
              <Input
                id="vault-name"
                value={uploadForm.name}
                onChange={e => setUploadForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter document name"
                className="mt-1"
              />
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="vault-desc">Description (optional)</Label>
              <Textarea
                id="vault-desc"
                value={uploadForm.description}
                onChange={e => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this document"
                className="mt-1"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Document Category</Label>
                <Select
                  value={uploadForm.documentCategory}
                  onValueChange={v => setUploadForm(prev => ({ ...prev, documentCategory: v as DocumentCategory }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(DOCUMENT_CATEGORY_LABELS) as [DocumentCategory, string][]).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="vault-artifact-type">Artifact Type</Label>
                <Input
                  id="vault-artifact-type"
                  value={uploadForm.contractArtifactType}
                  onChange={e => setUploadForm(prev => ({ ...prev, contractArtifactType: e.target.value }))}
                  placeholder="e.g. customer spec"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vault-customer-id">Customer ID</Label>
                <Input
                  id="vault-customer-id"
                  value={uploadForm.customerId}
                  onChange={e => setUploadForm(prev => ({ ...prev, customerId: e.target.value }))}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="vault-customer-name">Customer Name</Label>
                <Input
                  id="vault-customer-name"
                  value={uploadForm.customerName}
                  onChange={e => setUploadForm(prev => ({ ...prev, customerName: e.target.value }))}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Classification */}
            <div>
              <Label>Classification</Label>
              <Select
                value={uploadForm.classification}
                onValueChange={v => setUploadForm(prev => ({ ...prev, classification: v as Classification }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(CLASSIFICATION_CONFIG) as [Classification, typeof CLASSIFICATION_CONFIG[Classification]][]).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <ClassificationBadge classification={key} />
                        <span className="text-xs text-muted-foreground">{cfg.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(uploadForm.classification === 'cui' || uploadForm.classification === 'itar') && (
              <div className="grid grid-cols-2 gap-3">
                {uploadForm.classification === 'cui' && (
                  <div>
                    <Label htmlFor="vault-cui-category">CUI Category</Label>
                    <Input
                      id="vault-cui-category"
                      value={uploadForm.cuiCategory}
                      onChange={e => setUploadForm(prev => ({ ...prev, cuiCategory: e.target.value }))}
                      placeholder="e.g. CUI//SP-CTI"
                      className="mt-1"
                    />
                  </div>
                )}
                {uploadForm.classification === 'itar' && (
                  <div>
                    <Label htmlFor="vault-itar-category">ITAR Category</Label>
                    <Input
                      id="vault-itar-category"
                      value={uploadForm.itarCategory}
                      onChange={e => setUploadForm(prev => ({ ...prev, itarCategory: e.target.value }))}
                      placeholder="e.g. Technical Data"
                      className="mt-1"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="vault-export-jurisdiction">Jurisdiction</Label>
                  <Input
                    id="vault-export-jurisdiction"
                    value={uploadForm.exportControlJurisdiction}
                    onChange={e => setUploadForm(prev => ({ ...prev, exportControlJurisdiction: e.target.value }))}
                    placeholder={uploadForm.classification === 'itar' ? 'ITAR' : 'Optional'}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* CUI/ITAR warning */}
            {(uploadForm.classification === 'cui' || uploadForm.classification === 'itar') && (
              <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800 dark:text-orange-200 text-xs">
                  {uploadForm.classification === 'itar'
                    ? 'ITAR documents are export-controlled. Ensure all recipients are authorized.'
                    : 'CUI documents require explicit access grants for non-admin users.'}
                </AlertDescription>
              </Alert>
            )}

            {/* Scope */}
            <div>
              <Label>Scope</Label>
              <Select
                value={uploadForm.scopeType}
                onValueChange={v => setUploadForm(prev => ({ ...prev, scopeType: v as ScopeType, scopeValue: '' }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Organization-wide</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {uploadForm.scopeType !== 'global' && (
              <div>
                <Label htmlFor="vault-scope-val">
                  {uploadForm.scopeType === 'project' ? 'Project ID' : 'Department Name'}
                </Label>
                <Input
                  id="vault-scope-val"
                  value={uploadForm.scopeValue}
                  onChange={e => setUploadForm(prev => ({ ...prev, scopeValue: e.target.value }))}
                  placeholder={uploadForm.scopeType === 'project' ? 'Enter project ID' : 'e.g. Engineering'}
                  className="mt-1"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vault-source-type">Source Type</Label>
                <Input
                  id="vault-source-type"
                  value={uploadForm.sourceEntityType}
                  onChange={e => setUploadForm(prev => ({ ...prev, sourceEntityType: e.target.value }))}
                  placeholder="quote, po, project"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="vault-source-id">Source ID</Label>
                <Input
                  id="vault-source-id"
                  value={uploadForm.sourceEntityId}
                  onChange={e => setUploadForm(prev => ({ ...prev, sourceEntityId: e.target.value }))}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vault-link-ttl">Link Expiration Seconds</Label>
                <Input
                  id="vault-link-ttl"
                  type="number"
                  min="60"
                  max="900"
                  value={uploadForm.linkExpiresInSeconds}
                  onChange={e => setUploadForm(prev => ({ ...prev, linkExpiresInSeconds: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="vault-session-timeout">Step-up Timeout Minutes</Label>
                <Input
                  id="vault-session-timeout"
                  type="number"
                  min="5"
                  max="60"
                  value={uploadForm.sessionTimeoutMinutes}
                  onChange={e => setUploadForm(prev => ({ ...prev, sessionTimeoutMinutes: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploadProgress || registerDocMutation.isPending} className="gap-2">
              {(uploadProgress || registerDocMutation.isPending) ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document access log panel */}
      <Sheet open={!!auditPanelDocId} onOpenChange={open => !open && setAuditPanelDocId(null)}>
        <SheetContent className="w-[460px] sm:w-[520px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Access Log
            </SheetTitle>
            {auditDoc && (
              <SheetDescription>
                <span className="font-medium">{auditDoc.name}</span>{' '}
                <ClassificationBadge classification={auditDoc.classification} />
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="mt-6">
            {auditLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : !documentAuditEvents || documentAuditEvents.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm border rounded-lg">
                <CheckCircle className="h-6 w-6 mx-auto mb-2 opacity-30" />
                No access events recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {documentAuditEvents.map(event => (
                  <div key={event.id} className="p-3 border rounded-lg text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <AuditActionLabel action={event.action} />
                        {event.action === 'DOCUMENT_ACL_CHANGE' && (
                          <div className="mt-0.5">
                            <AclChangeDetail meta={event.meta} />
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {event.actorName ? (
                            <span>
                              <span className="font-medium text-foreground">{event.actorName}</span>
                              {event.actorRole && <span className="ml-1 opacity-60">({event.actorRole})</span>}
                            </span>
                          ) : (
                            <span className="opacity-60">Unknown user</span>
                          )}
                        </div>
                        {event.ipAddress && (
                          <div className="text-xs text-muted-foreground opacity-70">
                            IP: {event.ipAddress}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Access management side panel */}
      <Sheet open={!!accessPanelDocId} onOpenChange={open => !open && setAccessPanelDocId(null)}>
        <SheetContent className="w-[420px] sm:w-[480px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Vault Access Management
            </SheetTitle>
            {accessDoc2 && (
              <SheetDescription>
                <span className="font-medium">{accessDoc2.name}</span>{' '}
                <ClassificationBadge classification={accessDoc2.classification} />
              </SheetDescription>
            )}
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Grant access form */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Grant Access</h3>
              <div className="flex gap-2">
                <Select value={grantUserId} onValueChange={setGrantUserId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vaultUsers?.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.displayName} ({u.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!grantUserId || grantAccessMutation.isPending}
                  onClick={() => {
                    if (accessPanelDocId && grantUserId) {
                      grantAccessMutation.mutate({ docId: accessPanelDocId, userId: grantUserId });
                    }
                  }}
                >
                  Grant
                </Button>
              </div>
            </div>

            {/* Current grants */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Current Access Grants</h3>
              {grantsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !grants || grants.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg">
                  <Eye className="h-6 w-6 mx-auto mb-1 opacity-30" />
                  No explicit grants yet.
                  <br />Only admins can access this document.
                </div>
              ) : (
                <div className="space-y-2">
                  {grants.map(grant => (
                    <div key={grant.id} className="flex items-center justify-between p-2 border rounded-lg text-sm">
                      <div>
                        <div className="font-medium">{grant.grantedToDisplayName}</div>
                        <div className="text-xs text-muted-foreground">
                          Granted by {grant.grantedByDisplayName} on {format(new Date(grant.createdAt), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => revokeAccessMutation.mutate(grant.id)}
                        disabled={revokeAccessMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
