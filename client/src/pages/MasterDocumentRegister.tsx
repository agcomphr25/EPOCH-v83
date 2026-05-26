import { useState } from 'react';
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
} from 'lucide-react';
import type { ControlledDocument, DocumentVersionHistory } from '@shared/schema';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export default function MasterDocumentRegister() {
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
  const [versionType, setVersionType] = useState<'major' | 'minor'>('minor');
  const { toast } = useToast();

  // Fetch controlled documents
  const { data: documents = [], isLoading } = useQuery<ControlledDocument[]>({
    queryKey: ['/api/controlled-documents'],
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

  const canCreateEdit = session?.role === 'ADMIN' || session?.role === 'OWNER' || session?.username === 'lauriet';
  const canApprove = session?.username === 'lauriet';

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      searchQuery === '' ||
      doc.documentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.documentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDepartment = departmentFilter === 'all' || doc.department === departmentFilter;
    const matchesType = typeFilter === 'all' || doc.documentType === typeFilter;
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;

    return matchesSearch && matchesDepartment && matchesType && matchesStatus;
  });

  // Get unique departments and types for filters
  const departments = ['all', ...Array.from(new Set(documents.map((d) => d.department)))];
  const documentTypes = ['all', ...Array.from(new Set(documents.map((d) => d.documentType)))];

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

    switch (doc.status) {
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

  const openDocumentFile = (doc: ControlledDocument, mode: 'view' | 'download') => {
    const path = `/api/controlled-documents/${doc.id}/${mode}`;
    window.open(path, '_blank', 'noopener,noreferrer');
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
    mutationFn: async ({ id, formData }: { id: string; formData: FormData }) => {
      return await apiRequest(`/api/controlled-documents/${id}`, {
        method: 'PUT',
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
      formData.append('createNewVersion', 'true');
      formData.append('versionType', versionType);
    }

    if (selectedFile) {
      formData.append('file', selectedFile);
    }

    updateDocumentMutation.mutate({ id: selectedDocument.id, formData });
  };

  // Approve document mutation
  const approveDocumentMutation = useMutation({
    mutationFn: async ({ id, effectiveDate }: { id: string; effectiveDate: string }) => {
      return await apiRequest(`/api/controlled-documents/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ effectiveDate }),
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

  // CSV Import mutation
  const importCsvMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return await apiRequest('/api/controlled-documents/import/csv', {
        method: 'POST',
        body: formData,
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
                  onClick={() => setIsCreateDialogOpen(true)}
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
                </SelectContent>
              </Select>
            </div>
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
                        <TableCell>{getStatusBadge(doc)}</TableCell>
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
                                {isPdfDocument(doc) && (
                                  <Badge
                                    variant="outline"
                                    role="button"
                                    tabIndex={0}
                                    className="h-8 cursor-pointer gap-1 border-blue-300 px-2 text-blue-700 hover:bg-blue-50"
                                    title="View PDF"
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
                                    View
                                  </Badge>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title="Download"
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
                            {canCreateEdit && (
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
                            {canApprove && doc.status === 'pending' && (
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
                  placeholder="e.g., P1-001"
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
                <Select name="documentType" required>
                  <SelectTrigger data-testid="select-document-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOP">SOP - Standard Operating Procedure</SelectItem>
                    <SelectItem value="WI">WI - Work Instruction</SelectItem>
                    <SelectItem value="FORM">Form</SelectItem>
                    <SelectItem value="POLICY">Policy</SelectItem>
                    <SelectItem value="PROCEDURE">Procedure</SelectItem>
                    <SelectItem value="PLAN">Plan</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Select name="department" required>
                  <SelectTrigger data-testid="select-department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P1 Operations">P1 Operations</SelectItem>
                    <SelectItem value="P2 Operations">P2 Operations</SelectItem>
                    <SelectItem value="Quality Control">Quality Control</SelectItem>
                    <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                    <SelectItem value="Engineering">Engineering</SelectItem>
                    <SelectItem value="Safety">Safety</SelectItem>
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
                  defaultValue="1 year"
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
              Update document information or create a new version
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
                        {createNewVersion ? 'Creating new version' : 'Updating current version'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="createNewVersion"
                        checked={createNewVersion}
                        onChange={(e) => setCreateNewVersion(e.target.checked)}
                        className="rounded"
                        data-testid="checkbox-create-version"
                      />
                      <Label htmlFor="createNewVersion" className="cursor-pointer">
                        Create New Version
                      </Label>
                    </div>
                  </div>

                  {createNewVersion && (
                    <div className="space-y-3 border-t pt-3">
                      <div className="space-y-2">
                        <Label>Version Type</Label>
                        <Select value={versionType} onValueChange={(v) => setVersionType(v as 'major' | 'minor')}>
                          <SelectTrigger data-testid="select-version-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minor">Minor Version (e.g., 1.0 → 1.1)</SelectItem>
                            <SelectItem value="major">Major Version (e.g., 1.0 → 2.0)</SelectItem>
                          </SelectContent>
                        </Select>
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
                      <SelectItem value="SOP">SOP - Standard Operating Procedure</SelectItem>
                      <SelectItem value="WI">WI - Work Instruction</SelectItem>
                      <SelectItem value="FORM">Form</SelectItem>
                      <SelectItem value="POLICY">Policy</SelectItem>
                      <SelectItem value="PROCEDURE">Procedure</SelectItem>
                      <SelectItem value="PLAN">Plan</SelectItem>
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
                      <SelectItem value="P1 Operations">P1 Operations</SelectItem>
                      <SelectItem value="P2 Operations">P2 Operations</SelectItem>
                      <SelectItem value="Quality Control">Quality Control</SelectItem>
                      <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Safety">Safety</SelectItem>
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
                    defaultValue={selectedDocument.retentionLength || ''}
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

              <div className="space-y-2">
                <Label htmlFor="edit-file">
                  {createNewVersion ? 'Upload New File (Required for new version)' : 'Upload New File (Optional)'}
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
              </div>

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
              Set the effective date for this approved document
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
                  This date marks when the document becomes active. Expiration will be set to 1 year from this date.
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
                    <TableHead>Created</TableHead>
                    <TableHead>Approved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versionHistory.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell className="font-mono">{version.versionNumber}</TableCell>
                      <TableCell className="max-w-sm whitespace-pre-wrap text-sm">
                        {version.changeDescription || 'No change note recorded'}
                      </TableCell>
                      <TableCell>{version.status}</TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(version.createdAt as any)}</div>
                        <div className="text-xs text-gray-500">{version.createdBy}</div>
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
                CSV should have columns: TITLE, CODE, Department, Version, Date, Record Retention Length, Summary of Changes
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
