import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  CheckCircle,
  AlertCircle,
  Clock,
  History,
  Upload,
  Printer,
  RefreshCw,
} from 'lucide-react';
import type { ControlledDocument, DocumentVersionHistory } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'POSTER', label: 'Poster', codeToken: 'Poster' },
  { value: 'PROCEDURE', label: 'Procedure / DOC', codeToken: 'DOC' },
  { value: 'FORM', label: 'Form', codeToken: 'Form' },
  { value: 'TABLE', label: 'Table', codeToken: 'Table' },
  { value: 'SOP', label: 'SOP', codeToken: 'DOC' },
  { value: 'WI', label: 'Work Instruction', codeToken: 'DOC' },
  { value: 'POLICY', label: 'Policy', codeToken: 'DOC' },
  { value: 'PLAN', label: 'Plan', codeToken: 'DOC' },
];

const DOCUMENT_DEPARTMENT_OPTIONS = [
  'General Use',
  'Front Office',
  'HR',
  'Quality',
  'Quality Control',
  'P1 Operations',
  'P2 Operations',
  'PL1',
  'PL2',
  'PL3',
  'CNC',
  'Cutting Table',
  'Gunsmith',
  'Inventory',
  'Paint',
  'Plugging',
  'Production',
  'Shipping - PL1',
  'Finish - PL1',
  'Mold Maintenance',
  'Purchasing',
];

const DEPARTMENT_CODE_PREFIXES: Record<string, string> = {
  'General Use': 'AG',
  'Front Office': 'FO',
  HR: 'HR',
  Quality: 'QC',
  'Quality Control': 'QC',
  'P1 Operations': 'PL1',
  'P2 Operations': 'PL2',
  PL1: 'PL1',
  PL2: 'PL2',
  PL3: 'PL3',
  CNC: 'CNC',
  'Cutting Table': 'CT',
  Gunsmith: 'GU',
  Inventory: 'IN',
  Paint: 'PT',
  Plugging: 'PG',
  Production: 'PR',
  'Shipping - PL1': 'SH',
  'Finish - PL1': 'FN',
  'Mold Maintenance': 'MM',
  Purchasing: 'PO',
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const codePrefixForDepartment = (department: string) => {
  const mapped = DEPARTMENT_CODE_PREFIXES[department];
  if (mapped) return mapped;
  return department
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
};

const codeTokenForDocumentType = (documentType: string) =>
  DOCUMENT_TYPE_OPTIONS.find((option) => option.value === documentType)?.codeToken || documentType;

const generateDocumentNumber = (
  documents: ControlledDocument[],
  department: string,
  documentType: string
) => {
  if (!department || !documentType) return '';

  const prefix = codePrefixForDepartment(department);
  const codeToken = codeTokenForDocumentType(documentType);
  const matcher = new RegExp(
    `^${escapeRegExp(prefix)}\\s+${escapeRegExp(codeToken)}\\s*(\\d+(?:\\.\\d+)?)$`,
    'i'
  );

  const highestWholeNumber = documents.reduce((highest, doc) => {
    const match = doc.documentNumber?.trim().match(matcher);
    if (!match) return highest;
    const number = Number(match[1]);
    if (!Number.isFinite(number)) return highest;
    return Math.max(highest, Math.floor(number));
  }, 0);

  return `${prefix} ${codeToken} ${highestWholeNumber + 1}`;
};

const nextRevisionVersion = (version: string | null | undefined) => {
  const match = String(version || '1.0').match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return '1.1';

  const major = Number(match[1]);
  const minor = Number(match[2] || '0');
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return '1.1';

  if (minor >= 9) {
    return `${major + 1}.0`;
  }

  return `${major}.${minor + 1}`;
};

type DesignControlTemplateRevisionView = {
  id: string;
  documentVersionHistoryId: string;
  documentRevisionSnapshot: string;
  lifecycleStatus: string;
  definitionChecksum: string;
  blankPdfChecksum: string | null;
  canonicalDefinition: Record<string, unknown>;
};

type DesignControlTemplateView = {
  id: string;
  templateKey: string;
  formCategory: string;
  workflowStepKey: string | null;
  changeRecordType: string | null;
  reconciliationStatus: string;
  activeTemplateRevisionId: string | null;
  document: ControlledDocument | null;
  revisions: DesignControlTemplateRevisionView[];
};

type DesignControlTemplateReconciliationView = {
  conflicts: Array<{ id: string; templateKey: string; conflictType: string; details: Record<string, unknown> }>;
  legacyTemplates: Array<{ id: string; templateName: string; templateType: string; reason: string }>;
};

export default function MasterDocumentRegister() {
  const { can } = usePermissions();
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<ControlledDocument | null>(null);
  const [createNewVersion, setCreateNewVersion] = useState(false);
  const [newDocumentDepartment, setNewDocumentDepartment] = useState('');
  const [newDocumentType, setNewDocumentType] = useState('');
  const [pendingDocumentAccess, setPendingDocumentAccess] = useState<{
    doc: ControlledDocument;
    mode: 'view' | 'download';
  } | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  const [isStepUpSubmitting, setIsStepUpSubmitting] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch controlled documents
  const { data: documents = [], isLoading } = useQuery<ControlledDocument[]>({
    queryKey: ['/api/controlled-documents'],
  });

  const { data: designControlTemplates = [], isLoading: areDesignTemplatesLoading } = useQuery<DesignControlTemplateView[]>({
    queryKey: ['/api/design-control-form-templates'],
  });
  const { data: designTemplateReconciliation } = useQuery<DesignControlTemplateReconciliationView>({
    queryKey: ['/api/design-control-form-templates/reconciliation'],
  });

  // Fetch current user session for role-based access
  const { data: session } = useQuery<{ username: string; role: string }>({
    queryKey: ['/api/auth/session'],
  });

  const { data: versionHistory = [], isLoading: isHistoryLoading } = useQuery<DocumentVersionHistory[]>({
    queryKey: ['/api/controlled-documents', selectedDocument?.id, 'versions'],
    enabled: isHistoryDialogOpen && Boolean(selectedDocument?.id),
    queryFn: async () => {
      const response = await fetch(`/api/controlled-documents/${selectedDocument?.id}/versions`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch version history');
      return response.json();
    },
  });

  const canCreateEdit = can('documents.create') || can('documents.edit_draft');
  const canApprove = can('documents.approve');
  const isDesignControlTemplate = (doc: ControlledDocument) =>
    Boolean((doc as any).templateKey?.startsWith('design-control-'));

  const designTemplateMutation = useMutation({
    mutationFn: async (input: {
      path: string;
      body?: Record<string, unknown>;
      method?: 'POST';
    }) => {
      const response = await fetch(`/api/design-control-form-templates${input.path}`, {
        method: input.method ?? 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.body ?? {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'Template operation failed');
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design-control-form-templates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/design-control-form-templates/reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['/api/controlled-documents'] });
      toast({ title: 'Design Control template updated' });
    },
    onError: (error: Error) => toast({
      title: 'Design Control template action failed',
      description: error.message,
      variant: 'destructive',
    }),
  });

  const runDesignTemplateAction = (
    template: DesignControlTemplateView,
    revision: DesignControlTemplateRevisionView,
    action: 'submit' | 'decision' | 'release' | 'obsolete',
  ) => {
    const reason = window.prompt(`Reason for ${action}:`);
    if (!reason?.trim()) return;
    designTemplateMutation.mutate({
      path: `/${template.templateKey}/revisions/${revision.id}/${action}`,
      body: action === 'decision' ? { reason, decision: 'APPROVED' } : { reason },
    });
  };

  const createDesignTemplateRevision = (
    template: DesignControlTemplateView,
    revision: DesignControlTemplateRevisionView,
  ) => {
    const documentRevision = window.prompt(
      'New controlled document revision:',
      nextRevisionVersion(revision.documentRevisionSnapshot),
    );
    if (!documentRevision?.trim()) return;
    const reason = window.prompt('Material-change reason:');
    if (!reason?.trim()) return;
    designTemplateMutation.mutate({
      path: `/${template.templateKey}/revisions`,
      body: {
        expectedDocumentRevisionId: revision.documentVersionHistoryId,
        documentRevision,
        reason,
        definition: revision.canonicalDefinition,
      },
    });
  };

  // Get unique departments and types for filters
  const departments = ['all', ...Array.from(new Set(documents.map((d) => d.department)))];
  const documentTypes = ['all', ...Array.from(new Set(documents.map((d) => d.documentType)))];
  const createDepartmentOptions = useMemo(
    () => Array.from(new Set([...DOCUMENT_DEPARTMENT_OPTIONS, ...documents.map((d) => d.department).filter(Boolean)])),
    [documents]
  );
  const generatedDocumentNumber = useMemo(
    () => generateDocumentNumber(documents, newDocumentDepartment, newDocumentType),
    [documents, newDocumentDepartment, newDocumentType]
  );

  // Check if document is expired
  const isExpired = (doc: ControlledDocument) => {
    if (!doc.expirationDate || doc.status !== 'approved') return false;
    return new Date(doc.expirationDate) < new Date();
  };

  // Check if document is expiring soon (within 30 days)
  const isExpiringSoon = (doc: ControlledDocument) => {
    if (!doc.expirationDate || doc.status !== 'approved') return false;
    const today = new Date();
    const expDate = new Date(doc.expirationDate);
    const daysUntilExpiration = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiration > 0 && daysUntilExpiration <= 30;
  };

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      searchQuery === '' ||
      doc.documentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.documentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDepartment = departmentFilter === 'all' || doc.department === departmentFilter;
    const matchesType = typeFilter === 'all' || doc.documentType === typeFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'expired'
        ? isExpired(doc)
        : ((doc as any).lifecycleStatus || doc.status).toLowerCase() === statusFilter.toLowerCase());

    return matchesSearch && matchesDepartment && matchesType && matchesStatus;
  });

  const getStatusBadge = (doc: ControlledDocument) => {
    if (isExpired(doc)) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Expired
        </Badge>
      );
    }

    if (isExpiringSoon(doc)) {
      return (
        <Badge variant="outline" className="flex items-center gap-1 border-yellow-500 text-yellow-700">
          <Clock className="h-3 w-3" />
          Expiring Soon
        </Badge>
      );
    }

    switch ((doc as any).lifecycleStatus || doc.status?.toUpperCase()) {
      case 'RELEASED':
        return <Badge className="bg-emerald-700">Released</Badge>;
      case 'SUPERSEDED':
        return <Badge variant="outline">Superseded</Badge>;
      case 'OBSOLETE':
        return <Badge variant="destructive">Obsolete</Badge>;
      case 'VOID':
        return <Badge variant="secondary">Void</Badge>;
      case 'IN_REVIEW':
        return <Badge variant="outline" className="border-blue-500 text-blue-700">In Review</Badge>;
      case 'APPROVED':
      case 'approved':
      case 'approved':
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-green-600">
            <CheckCircle className="h-3 w-3" />
            Approved
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="flex items-center gap-1 border-blue-500 text-blue-700">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case 'DRAFT':
      case 'draft':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Edit className="h-3 w-3" />
            Draft
          </Badge>
        );
      default:
        return <Badge variant="outline">{doc.status}</Badge>;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const formatVersionDisplay = (doc: ControlledDocument) => {
    const versionDate = (doc as any).versionDate;
    if (!versionDate) return `Version ${doc.currentVersion}`;
    const date = String(versionDate).includes('T') ? new Date(versionDate) : new Date(`${versionDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return `Version ${doc.currentVersion}`;
    return `Version ${doc.currentVersion} ${date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    })}`;
  };

  const isPdfDocument = (doc: ControlledDocument) =>
    Boolean(doc.filePath?.toLowerCase().endsWith('.pdf'));

  const isExternalDocument = (doc: ControlledDocument) =>
    Boolean(doc.filePath && /^https?:\/\//i.test(doc.filePath));

  const getAuthHeaders = (): Record<string, string> => {
    const storedToken = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
    return storedToken ? { Authorization: `Bearer ${storedToken}` } : {};
  };

  const getFilenameFromDisposition = (disposition: string | null, fallback: string) => {
    if (!disposition) return fallback;
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/"/g, ''));
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
    return filenameMatch?.[1] || fallback;
  };

  const openDocumentBlob = (blob: Blob, filename: string, mode: 'view' | 'download', targetWindow?: Window | null) => {
    const blobUrl = URL.createObjectURL(blob);
    if (mode === 'view') {
      if (targetWindow) {
        targetWindow.location.href = blobUrl;
      } else {
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      return;
    }

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  const openDocumentFile = async (doc: ControlledDocument, mode: 'view' | 'download', targetWindowOverride?: Window | null) => {
    if (isExternalDocument(doc)) {
      window.open(doc.filePath!, '_blank', 'noopener,noreferrer');
      return;
    }

    const path = `/api/controlled-documents/${doc.id}/${mode}`;
    const targetWindow =
      targetWindowOverride ?? (mode === 'view'
        ? window.open('', '_blank')
        : null);

    if (targetWindow) {
      targetWindow.opener = null;
      targetWindow.document.write('<p style="font-family: sans-serif; padding: 1rem;">Loading document...</p>');
    }

    try {
      setOpeningDocumentId(doc.id);
      const response = await fetch(path, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        let errorData: any = null;
        try {
          errorData = await response.json();
        } catch {
          // Keep default message below.
        }

        if (response.status === 401 && errorData?.requireStepUp) {
          targetWindow?.close();
          setPendingDocumentAccess({ doc, mode });
          setStepUpPassword('');
          setStepUpError(null);
          setIsStepUpOpen(true);
          return;
        }

        targetWindow?.close();
        throw new Error(errorData?.error || `Failed to ${mode} document`);
      }

      const blob = await response.blob();
      const filename = getFilenameFromDisposition(
        response.headers.get('content-disposition'),
        `${doc.documentNumber || 'document'}.pdf`
      );
      openDocumentBlob(blob, filename, mode, targetWindow);
    } catch (error: any) {
      targetWindow?.close();
      toast({
        title: 'Unable to open document',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setOpeningDocumentId(null);
    }
  };

  const handleStepUpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingDocumentAccess) return;
    if (!stepUpPassword.trim()) {
      setStepUpError('Enter your password to verify your credentials.');
      return;
    }

    try {
      setIsStepUpSubmitting(true);
      setStepUpError(null);
      const targetWindow =
        pendingDocumentAccess.mode === 'view'
          ? window.open('', '_blank')
          : null;
      if (targetWindow) {
        targetWindow.opener = null;
        targetWindow.document.write('<p style="font-family: sans-serif; padding: 1rem;">Verifying credentials...</p>');
      }

      const response = await fetch('/api/auth/step-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ password: stepUpPassword }),
      });

      if (!response.ok) {
        targetWindow?.close();
        let errorData: any = null;
        try {
          errorData = await response.json();
        } catch {
          // Keep default message below.
        }
        throw new Error(errorData?.error || 'Credential verification failed');
      }

      const access = pendingDocumentAccess;
      setIsStepUpOpen(false);
      setPendingDocumentAccess(null);
      setStepUpPassword('');
      await openDocumentFile(access.doc, access.mode, targetWindow);
    } catch (error: any) {
      setStepUpError(error.message || 'Credential verification failed');
    } finally {
      setIsStepUpSubmitting(false);
    }
  };

  // Create document mutation
  const createDocumentMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return await apiRequest('/api/controlled-documents', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/controlled-documents'] });
      setIsCreateDialogOpen(false);
      setSelectedFile(null);
      setNewDocumentDepartment('');
      setNewDocumentType('');
      toast({
        title: 'Success',
        description: 'Document created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create document',
        variant: 'destructive',
      });
    },
  });

  const handleCreateDocument = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const formData = new FormData(formElement);

    if (selectedFile) {
      formData.append('file', selectedFile);
    }

    createDocumentMutation.mutate(formData);
  };

  // Update document mutation
  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, formData, revise }: { id: string; formData: FormData; revise: boolean }) => {
      return await apiRequest(`/api/controlled-documents/${id}${revise ? '/revise' : ''}`, {
        method: revise ? 'POST' : 'PUT',
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/controlled-documents'] });
      setIsEditDialogOpen(false);
      setSelectedDocument(null);
      setSelectedFile(null);
      setCreateNewVersion(false);
      toast({
        title: 'Success',
        description: 'Document updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update document',
        variant: 'destructive',
      });
    },
  });

  const handleEditDocument = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedDocument) return;

    // Validate file is provided when creating new version
    if (createNewVersion && !selectedFile) {
      toast({
        title: 'File Required',
        description: 'Please upload a file when creating a new version',
        variant: 'destructive',
      });
      return;
    }

    const formElement = e.currentTarget;
    const formData = new FormData(formElement);

    if (createNewVersion) {
      formData.append('revisionValue', nextRevisionVersion(selectedDocument.currentVersion));
      formData.append('reason', String(formData.get('changeDescription') || ''));
      if ((selectedDocument as any).currentRevisionId) {
        formData.append('currentRevisionId', (selectedDocument as any).currentRevisionId);
      }
    }

    if (selectedFile) {
      formData.append('file', selectedFile);
    }

    updateDocumentMutation.mutate({ id: selectedDocument.id, formData, revise: createNewVersion });
  };

  // Approve document mutation
  const approveDocumentMutation = useMutation({
    mutationFn: async ({ id, effectiveDate }: { id: string; effectiveDate: string }) => {
      return await apiRequest(`/api/controlled-documents/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revisionId: (selectedDocument as any)?.currentRevisionId,
          decision: 'APPROVED',
          comment: `Approved with effective date ${effectiveDate}`,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/controlled-documents'] });
      setIsApproveDialogOpen(false);
      setSelectedDocument(null);
      toast({
        title: 'Success',
        description: 'Document approved successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve document',
        variant: 'destructive',
      });
    },
  });

  const handleApproveDocument = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedDocument) return;

    const formElement = e.currentTarget;
    const formData = new FormData(formElement);
    const effectiveDate = formData.get('effectiveDate') as string;

    approveDocumentMutation.mutate({ id: selectedDocument.id, effectiveDate });
  };

  const lifecycleMutation = useMutation({
    mutationFn: async ({ doc, action }: { doc: ControlledDocument; action: 'submit' | 'release' | 'obsolete' | 'void' }) => {
      const reason = window.prompt(`Reason for ${action}`);
      if (!reason?.trim()) throw new Error('A transition reason is required');
      return apiRequest(`/api/controlled-documents/${doc.id}/${action}`, {
        method: 'POST',
        body: {
          revisionId: (doc as any).currentRevisionId,
          reason: reason.trim(),
        },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/controlled-documents'] }),
    onError: (error: any) => toast({
      title: 'Document lifecycle action failed',
      description: error.message,
      variant: 'destructive',
    }),
  });

  // CSV Import mutation
  const importCsvMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return await apiRequest('/api/controlled-documents/import/csv', {
        method: 'POST',
        body: formData,
        timeout: 120000,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/controlled-documents'] });
      setIsImportDialogOpen(false);
      setCsvFile(null);
      const results = data.results;
      toast({
        title: 'CSV Import Complete',
        description: `Successfully imported ${results.success} documents. Skipped: ${results.skipped}. ${results.errors.length > 0 ? `Errors: ${results.errors.length}` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to import CSV',
        variant: 'destructive',
      });
    },
  });

  const handleCsvImport = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!csvFile) {
      toast({
        title: 'No file selected',
        description: 'Please select a CSV file to import',
        variant: 'destructive',
      });
      return;
    }
    importCsvMutation.mutate(csvFile);
  };

  const openEditDialog = (doc: ControlledDocument) => {
    setSelectedDocument(doc);
    setIsEditDialogOpen(true);
    setCreateNewVersion(false);
    setSelectedFile(null);
  };

  const openApproveDialog = (doc: ControlledDocument) => {
    setSelectedDocument(doc);
    setIsApproveDialogOpen(true);
  };

  const openHistoryDialog = (doc: ControlledDocument) => {
    setSelectedDocument(doc);
    setIsHistoryDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto ml-16">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="h-8 w-8 text-blue-600" />
                Master Document Register
              </h1>
              <p className="text-gray-600 mt-1">
                Controlled documents for P1 and P2 operations
              </p>
            </div>
            {canCreateEdit && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  data-testid="button-import-csv"
                  onClick={() => setIsImportDialogOpen(true)}
                >
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
                <Button
                  className="flex items-center gap-2"
                  data-testid="button-create-document"
                  onClick={() => {
                    setNewDocumentDepartment('');
                    setNewDocumentType('');
                    setIsCreateDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  New Document
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-5 w-5" />
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-documents"
                />
              </div>

              {/* Department Filter */}
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger data-testid="select-department-filter">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept === 'all' ? 'All Departments' : dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === 'all' ? 'All Types' : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="released">Released</SelectItem>
                  <SelectItem value="superseded">Superseded</SelectItem>
                  <SelectItem value="obsolete">Obsolete</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Design Control Form Templates</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Exact template-definition revisions linked to independently controlled MDR documents.
                Project form entry begins in Phase 5 and is not available here.
              </p>
            </div>
            {can('documents.template.create') && (
              <Button
                variant="outline"
                disabled={designTemplateMutation.isPending}
                onClick={() => designTemplateMutation.mutate({ path: '/seed' })}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Ensure canonical 14
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {Boolean(designTemplateReconciliation?.conflicts.length || designTemplateReconciliation?.legacyTemplates.length) && (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-medium">Template reconciliation required</div>
                <div>
                  {designTemplateReconciliation?.conflicts.length ?? 0} canonical mapping conflict(s) and{' '}
                  {designTemplateReconciliation?.legacyTemplates.length ?? 0} legacy configurable template(s) were left intact.
                  No record was automatically overwritten or relinked.
                </div>
              </div>
            )}
            {areDesignTemplatesLoading ? (
              <div className="py-6 text-center text-muted-foreground">Loading Design Control templates…</div>
            ) : designControlTemplates.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                No canonical Design Control templates are registered. An authorized document controller can run the idempotent seed operation.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template / Mapping</TableHead>
                      <TableHead>MDR Document</TableHead>
                      <TableHead>Exact Revision</TableHead>
                      <TableHead>Definition / PDF</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {designControlTemplates.map((template) => {
                      const revision = template.revisions[template.revisions.length - 1];
                      const mapping = template.workflowStepKey
                        ? `Design Control step ${template.workflowStepKey}`
                        : template.changeRecordType;
                      return (
                        <TableRow key={template.id}>
                          <TableCell>
                            <div className="font-medium">{template.document?.documentName ?? template.templateKey}</div>
                            <div className="font-mono text-xs text-muted-foreground">{template.templateKey}</div>
                            <Badge variant="outline" className="mt-1">{mapping}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{template.document?.documentNumber ?? 'Missing mapping'}</div>
                            <div className="text-xs text-muted-foreground">{template.document?.id}</div>
                            {template.reconciliationStatus !== 'READY' && (
                              <Badge variant="destructive">Reconciliation required</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {revision ? (
                              <>
                                <div>Document revision {revision.documentRevisionSnapshot}</div>
                                <div className="font-mono text-xs text-muted-foreground">{revision.id}</div>
                              </>
                            ) : <Badge variant="destructive">Missing revision mapping</Badge>}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="font-mono">Definition: {revision?.definitionChecksum.slice(0, 12) ?? '—'}…</div>
                            <div className="font-mono">Blank PDF: {revision?.blankPdfChecksum?.slice(0, 12) ?? 'not retained'}{revision?.blankPdfChecksum ? '…' : ''}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={revision?.lifecycleStatus === 'RELEASED' ? 'default' : 'outline'}>
                              {revision?.lifecycleStatus ?? 'UNMAPPED'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {revision && (
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => window.open(`/api/design-control-form-templates/${template.templateKey}/revisions/${revision.id}/preview`, '_blank')}>
                                  <Eye className="h-4 w-4 mr-1" /> Preview
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => window.open(`/api/design-control-form-templates/${template.templateKey}/revisions/${revision.id}/download`, '_blank')}>
                                  <Printer className="h-4 w-4 mr-1" /> Download / Print
                                </Button>
                                {can('documents.template.revise') && !['OBSOLETE'].includes(revision.lifecycleStatus) && (
                                  <Button size="sm" variant="outline" onClick={() => createDesignTemplateRevision(template, revision)}>Create Revision</Button>
                                )}
                                {can('documents.submit') && revision.lifecycleStatus === 'DRAFT' && (
                                  <Button size="sm" onClick={() => runDesignTemplateAction(template, revision, 'submit')}>Submit</Button>
                                )}
                                {can('documents.template.release') && revision.lifecycleStatus === 'IN_REVIEW' && (
                                  <Button size="sm" onClick={() => runDesignTemplateAction(template, revision, 'decision')}>Approve</Button>
                                )}
                                {can('documents.template.release') && revision.lifecycleStatus === 'APPROVED' && (
                                  <Button size="sm" onClick={() => runDesignTemplateAction(template, revision, 'release')}>Release</Button>
                                )}
                                {can('documents.template.obsolete') && ['RELEASED', 'SUPERSEDED'].includes(revision.lifecycleStatus) && (
                                  <Button size="sm" variant="destructive" onClick={() => runDesignTemplateAction(template, revision, 'obsolete')}>Obsolete</Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Controlled Documents ({filteredDocuments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading documents...</div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No documents found matching your criteria
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Doc #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Released / Draft</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective Date</TableHead>
                      <TableHead>Expiration Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((doc) => (
                      <TableRow
                        key={doc.id}
                        className={isExpired(doc) ? 'bg-red-50' : ''}
                        data-testid={`row-document-${doc.id}`}
                      >
                        <TableCell className="font-medium">{doc.documentNumber}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{doc.documentName}</div>
                            {doc.description && (
                              <div className="text-xs text-gray-500 truncate max-w-xs">
                                {doc.description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{doc.documentType}</TableCell>
                        <TableCell>{doc.department}</TableCell>
                        <TableCell className="font-mono text-sm">{formatVersionDisplay(doc)}</TableCell>
                        <TableCell className="text-xs">
                          <div>Released: {(doc as any).currentReleasedRevisionId ? doc.currentVersion : 'None'}</div>
                          <div>Working draft: {(doc as any).workingDraftRevisionId ? doc.currentVersion : 'None'}</div>
                          {(doc as any).numberControlStatus === 'NUMBER_RECONCILIATION_REQUIRED' && (
                            <Badge variant="destructive" className="mt-1">Number conflict</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(doc)}
                          {(doc as any).lifecycleStatus &&
                            String((doc as any).lifecycleStatus).toLowerCase() !== doc.status?.toLowerCase() && (
                              <div className="mt-1 text-xs text-muted-foreground">Legacy: {doc.status}</div>
                            )}
                        </TableCell>
                        <TableCell>{formatDate(doc.effectiveDate)}</TableCell>
                        <TableCell>
                          <div>
                            {formatDate(doc.expirationDate)}
                            {doc.retentionLength && (
                              <div className="text-xs text-gray-500">
                                Retention: {doc.retentionLength}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {doc.filePath && (
                              <>
                                {(isPdfDocument(doc) || isExternalDocument(doc)) && (
                                  <Badge
                                    variant="outline"
                                    role="button"
                                    tabIndex={0}
                                    className="h-8 cursor-pointer gap-1 border-blue-300 px-2 text-blue-700 hover:bg-blue-50"
                                    title={isExternalDocument(doc) ? 'Open linked document' : 'View PDF'}
                                    data-testid={`badge-view-pdf-${doc.id}`}
                                    onClick={() => openDocumentFile(doc, 'view')}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        openDocumentFile(doc, 'view');
                                      }
                                    }}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    {openingDocumentId === doc.id ? 'Opening' : isExternalDocument(doc) ? 'Open' : 'View'}
                                  </Badge>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title={isExternalDocument(doc) ? 'Open linked document' : 'Download'}
                                  disabled={openingDocumentId === doc.id}
                                  onClick={() => openDocumentFile(doc, 'download')}
                                  data-testid={`button-download-${doc.id}`}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              title="Version History"
                              onClick={() => openHistoryDialog(doc)}
                              data-testid={`button-history-${doc.id}`}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            {!isDesignControlTemplate(doc) && can('documents.edit_draft') && (doc as any).lifecycleStatus === 'DRAFT' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                title="Edit"
                                onClick={() => openEditDialog(doc)}
                                data-testid={`button-edit-${doc.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {!isDesignControlTemplate(doc) && can('documents.revise') && !['OBSOLETE', 'VOID'].includes((doc as any).lifecycleStatus) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedDocument(doc);
                                  setCreateNewVersion(true);
                                  setSelectedFile(null);
                                  setIsEditDialogOpen(true);
                                }}
                              >
                                Create Revision
                              </Button>
                            )}
                            {!isDesignControlTemplate(doc) && can('documents.submit') && (doc as any).lifecycleStatus === 'DRAFT' && (
                              <Button size="sm" variant="outline" onClick={() => lifecycleMutation.mutate({ doc, action: 'submit' })}>
                                Submit
                              </Button>
                            )}
                            {!isDesignControlTemplate(doc) && canApprove && (doc as any).lifecycleStatus === 'IN_REVIEW' && (
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-green-600 hover:bg-green-700"
                                title="Approve"
                                onClick={() => openApproveDialog(doc)}
                                data-testid={`button-approve-${doc.id}`}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                            )}
                            {!isDesignControlTemplate(doc) && can('documents.release') && (doc as any).lifecycleStatus === 'APPROVED' && (
                              <Button size="sm" onClick={() => lifecycleMutation.mutate({ doc, action: 'release' })}>Release</Button>
                            )}
                            {!isDesignControlTemplate(doc) && can('documents.obsolete') && ((doc as any).lifecycleStatus === 'RELEASED' || (doc as any).lifecycleStatus === 'SUPERSEDED') && (
                              <Button size="sm" variant="destructive" onClick={() => lifecycleMutation.mutate({ doc, action: 'obsolete' })}>Obsolete</Button>
                            )}
                            {!isDesignControlTemplate(doc) && can('documents.void') && ['DRAFT', 'IN_REVIEW'].includes((doc as any).lifecycleStatus) && (
                              <Button size="sm" variant="ghost" onClick={() => lifecycleMutation.mutate({ doc, action: 'void' })}>Void</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Document Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Controlled Document</DialogTitle>
            <DialogDescription>
              Upload a new controlled document for P1 or P2 operations
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateDocument} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="documentNumber">Document Number *</Label>
                <Input
                  id="documentNumber"
                  name="documentNumber"
                  required
                  value={generatedDocumentNumber}
                  readOnly
                  placeholder="Select department and type"
                  className="bg-gray-100 font-mono"
                  data-testid="input-document-number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="documentName">Document Name *</Label>
                <Input
                  id="documentName"
                  name="documentName"
                  required
                  placeholder="e.g., Safety Procedure"
                  data-testid="input-document-name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="documentType">Document Type *</Label>
                <Select name="documentType" value={newDocumentType} onValueChange={setNewDocumentType} required>
                  <SelectTrigger data-testid="select-document-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Select name="department" value={newDocumentDepartment} onValueChange={setNewDocumentDepartment} required>
                  <SelectTrigger data-testid="select-department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {createDepartmentOptions.map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                name="category"
                placeholder="e.g., Safety, Quality, Production"
                data-testid="input-category"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="versionDate">Version Date</Label>
                <Input
                  id="versionDate"
                  name="versionDate"
                  type="date"
                  data-testid="input-version-date"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="originationDate">Origination Date</Label>
                <Input
                  id="originationDate"
                  name="originationDate"
                  type="date"
                  data-testid="input-origination-date"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currentVersion">Starting Version</Label>
              <Input
                id="currentVersion"
                name="currentVersion"
                defaultValue="1.0"
                readOnly
                className="bg-gray-100"
                placeholder="e.g., 2.3"
                data-testid="input-current-version"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Brief description of the document"
                rows={3}
                data-testid="textarea-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="retentionLength">Retention Period</Label>
                <Input
                  id="retentionLength"
                  name="retentionLength"
                  placeholder="e.g., 1 year, 5 years, Permanent"
                  defaultValue="10 years"
                  data-testid="input-retention-length"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="documentOwner">Document Owner</Label>
                <Input
                  id="documentOwner"
                  name="documentOwner"
                  placeholder="e.g., Quality Manager"
                  data-testid="input-document-owner"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Upload File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  data-testid="input-file-upload"
                />
                {selectedFile && (
                  <div className="text-sm text-green-600 flex items-center gap-1">
                    <Upload className="h-4 w-4" />
                    {selectedFile.name}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Accepted formats: PDF, Word, Excel (max 50MB)
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setSelectedFile(null);
                  setNewDocumentDepartment('');
                  setNewDocumentType('');
                }}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createDocumentMutation.isPending}
                data-testid="button-submit-create"
              >
                {createDocumentMutation.isPending ? 'Creating...' : 'Create Document'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Controlled Document</DialogTitle>
            <DialogDescription>
              {createNewVersion
                ? 'Create a traceable draft revision with new file content'
                : 'Update draft metadata. File content cannot be replaced here.'}
            </DialogDescription>
          </DialogHeader>

          {selectedDocument && (
            <form onSubmit={handleEditDocument} className="space-y-4">
              {/* Version Control Section */}
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Version Control
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Current Version: {selectedDocument.currentVersion}</p>
                      <p className="text-xs text-gray-600">
                        {createNewVersion
                          ? `Next revision: ${nextRevisionVersion(selectedDocument.currentVersion)}`
                          : 'Updating current version'}
                      </p>
                    </div>
                    <Badge variant="outline">{createNewVersion ? 'Create Revision' : 'Metadata Only'}</Badge>
                  </div>

                  {createNewVersion && (
                    <div className="space-y-3 border-t pt-3">
                      <div className="rounded-md border border-blue-200 bg-white p-3">
                        <div className="text-xs font-medium uppercase text-gray-500">Next Version</div>
                        <div className="font-mono text-lg">
                          {nextRevisionVersion(selectedDocument.currentVersion)}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="changeDescription">Change Description *</Label>
                        <Textarea
                          id="changeDescription"
                          name="changeDescription"
                          placeholder="Describe what changed in this version..."
                          rows={3}
                          required={createNewVersion}
                          data-testid="textarea-change-description"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Document Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-documentNumber">Document Number</Label>
                  <Input
                    id="edit-documentNumber"
                    name="documentNumber"
                    defaultValue={selectedDocument.documentNumber}
                    readOnly
                    className="bg-gray-100"
                    data-testid="input-edit-document-number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-documentName">Document Name *</Label>
                  <Input
                    id="edit-documentName"
                    name="documentName"
                    defaultValue={selectedDocument.documentName}
                    required
                    data-testid="input-edit-document-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-documentType">Document Type *</Label>
                  <Select name="documentType" defaultValue={selectedDocument.documentType} required>
                    <SelectTrigger data-testid="select-edit-document-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-department">Department *</Label>
                  <Select name="department" defaultValue={selectedDocument.department} required>
                    <SelectTrigger data-testid="select-edit-department">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {createDepartmentOptions.map((department) => (
                        <SelectItem key={department} value={department}>
                          {department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Input
                  id="edit-category"
                  name="category"
                  defaultValue={selectedDocument.category || ''}
                  data-testid="input-edit-category"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-versionDate">Version Date</Label>
                  <Input
                    id="edit-versionDate"
                    name="versionDate"
                    type="date"
                    defaultValue={(selectedDocument as any).versionDate || ''}
                    data-testid="input-edit-version-date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-originationDate">Origination Date</Label>
                  <Input
                    id="edit-originationDate"
                    name="originationDate"
                    type="date"
                    defaultValue={(selectedDocument as any).originationDate || ''}
                    data-testid="input-edit-origination-date"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  name="description"
                  defaultValue={selectedDocument.description || ''}
                  rows={3}
                  data-testid="textarea-edit-description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-retentionLength">Retention Period</Label>
                  <Input
                    id="edit-retentionLength"
                    name="retentionLength"
                    defaultValue={selectedDocument.retentionLength || '10 years'}
                    data-testid="input-edit-retention-length"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-documentOwner">Document Owner</Label>
                  <Input
                    id="edit-documentOwner"
                    name="documentOwner"
                    defaultValue={selectedDocument.documentOwner || ''}
                    data-testid="input-edit-document-owner"
                  />
                </div>
              </div>

              {createNewVersion && <div className="space-y-2">
                <Label htmlFor="edit-file">
                  New revision file *
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-file"
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    data-testid="input-edit-file-upload"
                  />
                  {selectedFile && (
                    <div className="text-sm text-green-600 flex items-center gap-1">
                      <Upload className="h-4 w-4" />
                      {selectedFile.name}
                    </div>
                  )}
                </div>
                {selectedDocument.filePath && (
                  <p className="text-xs text-gray-500">
                    Current file: {selectedDocument.filePath.split('/').pop()}
                  </p>
                )}
              </div>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setSelectedDocument(null);
                    setSelectedFile(null);
                    setCreateNewVersion(false);
                  }}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateDocumentMutation.isPending}
                  data-testid="button-submit-edit"
                >
                  {updateDocumentMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Document Dialog */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve Controlled Document</DialogTitle>
            <DialogDescription>
              Record an authenticated approval for the exact current revision and checksum. Release is a separate action.
            </DialogDescription>
          </DialogHeader>

          {selectedDocument && (
            <form onSubmit={handleApproveDocument} className="space-y-4">
              {/* Document Summary */}
              <Card className="bg-green-50 border-green-200">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium">Document Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="font-medium">Document Number:</div>
                    <div>{selectedDocument.documentNumber}</div>
                    <div className="font-medium">Document Name:</div>
                    <div>{selectedDocument.documentName}</div>
                    <div className="font-medium">Version:</div>
                    <div className="font-mono">{selectedDocument.currentVersion}</div>
                    <div className="font-medium">Type:</div>
                    <div>{selectedDocument.documentType}</div>
                    <div className="font-medium">Department:</div>
                    <div>{selectedDocument.department}</div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label htmlFor="effectiveDate">Effective Date *</Label>
                <Input
                  id="effectiveDate"
                  name="effectiveDate"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().split('T')[0]}
                  data-testid="input-effective-date"
                />
                <p className="text-xs text-gray-500">
                  This date is included in the approval comment only. The release action controls the effective revision.
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsApproveDialogOpen(false);
                    setSelectedDocument(null);
                  }}
                  data-testid="button-cancel-approve"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={approveDocumentMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-submit-approve"
                >
                  {approveDocumentMutation.isPending ? 'Approving...' : 'Approve Document'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              {selectedDocument
                ? `${selectedDocument.documentNumber} - ${selectedDocument.documentName}`
                : 'Controlled document revision history'}
            </DialogDescription>
          </DialogHeader>

          {isHistoryLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading version history...</div>
          ) : versionHistory.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No revision history has been recorded.</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Checksum</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead>File</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versionHistory.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell className="font-mono">{version.versionNumber}</TableCell>
                      <TableCell className="max-w-sm whitespace-pre-wrap text-sm">
                        {version.changeDescription || 'No change note recorded'}
                      </TableCell>
                      <TableCell>{(version as any).lifecycleStatus || version.status}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {(version as any).fileChecksum
                          ? String((version as any).fileChecksum).slice(0, 12)
                          : (version as any).checksumStatus || 'Legacy unknown'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(version.createdAt as any)}</div>
                        <div className="text-xs text-gray-500">{version.createdBy}</div>
                      </TableCell>
                      <TableCell>
                        {(version as any).filePath && selectedDocument && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(
                              `/api/controlled-documents/${selectedDocument.id}/revisions/${version.id}/download`,
                              '_blank',
                              'noopener,noreferrer'
                            )}
                          >
                            Exact Revision
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {version.approvedAt ? (
                          <>
                            <div className="text-sm">{formatDate(version.approvedAt as any)}</div>
                            <div className="text-xs text-gray-500">{version.approvedBy}</div>
                          </>
                        ) : (
                          <span className="text-sm text-gray-500">Not approved</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Credential Verification Dialog */}
      <Dialog open={isStepUpOpen} onOpenChange={(open) => {
        setIsStepUpOpen(open);
        if (!open) {
          setPendingDocumentAccess(null);
          setStepUpPassword('');
          setStepUpError(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Credentials</DialogTitle>
            <DialogDescription>
              Controlled document access requires recent credential verification.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleStepUpSubmit} className="space-y-4">
            {pendingDocumentAccess && (
              <div className="rounded-md border bg-gray-50 p-3 text-sm">
                <div className="font-medium">{pendingDocumentAccess.doc.documentName}</div>
                <div className="text-xs text-gray-500">
                  {pendingDocumentAccess.mode === 'view' ? 'View PDF' : 'Download file'}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="stepUpPassword">Password</Label>
              <Input
                id="stepUpPassword"
                type="password"
                value={stepUpPassword}
                onChange={(event) => setStepUpPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                disabled={isStepUpSubmitting}
                data-testid="input-step-up-password"
              />
              {stepUpError && (
                <p className="text-sm text-red-600" data-testid="text-step-up-error">
                  {stepUpError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isStepUpSubmitting}
                onClick={() => {
                  setIsStepUpOpen(false);
                  setPendingDocumentAccess(null);
                  setStepUpPassword('');
                  setStepUpError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isStepUpSubmitting}>
                {isStepUpSubmitting ? 'Verifying...' : 'Verify and Continue'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Documents from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV file to import or update multiple documents at once
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCsvImport} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csvFile">CSV File *</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                data-testid="input-csv-file"
                required
              />
              <p className="text-xs text-gray-500">
                CSV should have columns: TITLE, CODE, Department, Version, Date, Record Retention Length, Summary of Changes.
                Include Document Link, File URL, URL, Link, or File Path to attach document links.
              </p>
            </div>

            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">Import Behavior</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700 space-y-1">
                <p>• Documents with matching CODE will be updated</p>
                <p>• New documents will be created</p>
                <p>• Document type is auto-detected from CODE</p>
                <p>• Effective dates will be parsed from the Date column</p>
              </CardContent>
            </Card>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsImportDialogOpen(false);
                  setCsvFile(null);
                }}
                data-testid="button-cancel-import"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={importCsvMutation.isPending || !csvFile}
                data-testid="button-submit-import"
              >
                {importCsvMutation.isPending ? 'Importing...' : 'Import CSV'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
