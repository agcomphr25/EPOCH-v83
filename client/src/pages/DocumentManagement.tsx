import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { 
  Upload, 
  Search, 
  FileText, 
  Tag, 
  FolderOpen,
  Download,
  Edit3,
  Trash2,
  Plus,
  Filter,
  Grid,
  List,
  Eye,
  AlertCircle
} from 'lucide-react';

interface Document {
  id: number;
  title: string;
  description?: string;
  fileName: string;
  originalFileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  uploadDate: string;
  uploadedBy?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DocumentTag {
  id: number;
  name: string;
  category?: string;
  color: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

interface DocumentCollection {
  id: number;
  name: string;
  description?: string;
  collectionType: string;
  primaryIdentifier?: string;
  status: string;
  metadata?: any;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
}

const documentTypes = [
  'RFQ', 'QUOTE', 'PO', 'PACKING_SLIP', 'RISK_ASSESSMENT', 
  'FORM_SUBMISSION', 'SPECIFICATION', 'CONTRACT', 'INVOICE', 'OTHER'
];

const collectionTypes = [
  'purchase_order', 'customer_project', 'quote_process', 'form_workflow', 'general'
];

const tagCategories = [
  'project', 'customer', 'po_number', 'status', 'document_type', 'priority', 'department', 'other'
];

export default function DocumentManagement() {
  const [activeTab, setActiveTab] = useState('documents');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // API queries
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['/api/documents'],
    enabled: activeTab === 'documents'
  });

  const { data: tags = [], isLoading: tagsLoading } = useQuery({
    queryKey: ['/api/documents/tags'],
    enabled: activeTab === 'tags'
  });

  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ['/api/documents/collections'],
    enabled: activeTab === 'collections'
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      setIsUploadDialogOpen(false);
      toast({
        title: "Success",
        description: "Document uploaded successfully"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to upload document",
        variant: "destructive"
      });
    }
  });

  // Tag creation mutation
  const createTagMutation = useMutation({
    mutationFn: async (tagData: any) => {
      const response = await fetch('/api/documents/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tagData)
      });
      if (!response.ok) throw new Error('Failed to create tag');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents/tags'] });
      setIsTagDialogOpen(false);
      toast({
        title: "Success",
        description: "Tag created successfully"
      });
    }
  });

  // Collection creation mutation
  const createCollectionMutation = useMutation({
    mutationFn: async (collectionData: any) => {
      const response = await fetch('/api/documents/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectionData)
      });
      if (!response.ok) throw new Error('Failed to create collection');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents/collections'] });
      setIsCollectionDialogOpen(false);
      toast({
        title: "Success",
        description: "Collection created successfully"
      });
    }
  });

  const handleFileUpload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    if (!formData.get('file')) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive"
      });
      return;
    }

    uploadMutation.mutate(formData);
  };

  const handleCreateTag = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const tagData = {
      name: formData.get('name'),
      category: formData.get('category'),
      color: formData.get('color'),
      description: formData.get('description')
    };
    createTagMutation.mutate(tagData);
  };

  const handleCreateCollection = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const collectionData = {
      name: formData.get('name'),
      description: formData.get('description'),
      collectionType: formData.get('collectionType'),
      primaryIdentifier: formData.get('primaryIdentifier'),
      status: 'active'
    };
    createCollectionMutation.mutate(collectionData);
  };

  const handleDownload = async (document: Document) => {
    try {
      const response = await fetch(`/api/documents/${document.id}/download`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.originalFileName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download document",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getDocumentIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel')) return '📊';
    return '📎';
  };

  const filteredDocuments = documents.filter((doc: Document) => {
    const matchesSearch = searchQuery === '' || 
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = selectedDocumentType === '' || selectedDocumentType === 'all' || doc.documentType === selectedDocumentType;
    
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Document Management</h1>
          <p className="text-muted-foreground">
            Unified document repository with advanced tagging and organization
          </p>
        </div>
        
        <div className="flex gap-2">
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Upload New Document</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleFileUpload} className="space-y-4">
                <div>
                  <Label htmlFor="file">File</Label>
                  <Input
                    type="file"
                    name="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input name="title" placeholder="Document title" required />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea name="description" placeholder="Optional description" />
                </div>
                <div>
                  <Label htmlFor="documentType">Document Type</Label>
                  <Select name="documentType" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypes.map(type => (
                        <SelectItem key={type} value={type || 'OTHER'}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={uploadMutation.isPending} className="w-full">
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload Document'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="collections" className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Collections
          </TabsTrigger>
        </TabsList>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          {/* Search and Filters */}
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedDocumentType} onValueChange={setSelectedDocumentType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {documentTypes.map(type => (
                  <SelectItem key={type} value={type || 'OTHER'}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Documents Display */}
          {documentsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-2'}>
              {filteredDocuments.map((document: Document) => (
                <Card key={document.id} className={viewMode === 'list' ? 'p-4' : ''}>
                  <CardHeader className={viewMode === 'list' ? 'p-0 pb-2' : ''}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{getDocumentIcon(document.mimeType)}</span>
                        <div>
                          <CardTitle className="text-lg">{document.title}</CardTitle>
                          <p className="text-sm text-muted-foreground">{document.originalFileName}</p>
                        </div>
                      </div>
                      <Badge variant="secondary">{document.documentType}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className={viewMode === 'list' ? 'p-0 pt-2' : ''}>
                    {document.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {document.description}
                      </p>
                    )}
                    <div className="flex justify-between items-center text-xs text-muted-foreground mb-3">
                      <span>{formatFileSize(document.fileSize)}</span>
                      <span>{new Date(document.uploadDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(document)}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedDocument(document)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {filteredDocuments.length === 0 && !documentsLoading && (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No documents found</p>
              <p className="text-muted-foreground">Try adjusting your search or upload a new document</p>
            </div>
          )}
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Document Tags</h2>
            <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Tag
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Tag</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateTag} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Tag Name</Label>
                    <Input name="name" placeholder="Tag name" required />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select name="category">
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {tagCategories.map(category => (
                          <SelectItem key={category} value={category || 'other'}>{category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="color">Color</Label>
                    <Input name="color" type="color" defaultValue="#3B82F6" />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea name="description" placeholder="Optional description" />
                  </div>
                  <Button type="submit" disabled={createTagMutation.isPending} className="w-full">
                    {createTagMutation.isPending ? 'Creating...' : 'Create Tag'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {tagsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tags.map((tag: DocumentTag) => (
                <Card key={tag.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge style={{ backgroundColor: tag.color, color: 'white' }}>
                        {tag.name}
                      </Badge>
                      {tag.category && (
                        <span className="text-xs text-muted-foreground capitalize">
                          {tag.category.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    {tag.description && (
                      <p className="text-sm text-muted-foreground">{tag.description}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Collections Tab */}
        <TabsContent value="collections" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Document Collections</h2>
            <Dialog open={isCollectionDialogOpen} onOpenChange={setIsCollectionDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Collection
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New Collection</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateCollection} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Collection Name</Label>
                    <Input name="name" placeholder="Collection name" required />
                  </div>
                  <div>
                    <Label htmlFor="collectionType">Type</Label>
                    <Select name="collectionType" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {collectionTypes.map(type => (
                          <SelectItem key={type} value={type || 'general'}>
                            {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="primaryIdentifier">Primary Identifier</Label>
                    <Input name="primaryIdentifier" placeholder="PO number, project ID, etc." />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea name="description" placeholder="Optional description" />
                  </div>
                  <Button type="submit" disabled={createCollectionMutation.isPending} className="w-full">
                    {createCollectionMutation.isPending ? 'Creating...' : 'Create Collection'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {collectionsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map((collection: DocumentCollection) => (
                <Card key={collection.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{collection.name}</CardTitle>
                      <Badge variant={collection.status === 'active' ? 'default' : 'secondary'}>
                        {collection.status}
                      </Badge>
                    </div>
                    {collection.primaryIdentifier && (
                      <p className="text-sm text-muted-foreground">
                        ID: {collection.primaryIdentifier}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Type: {collection.collectionType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </p>
                    {collection.description && (
                      <p className="text-sm line-clamp-2 mb-3">{collection.description}</p>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Created: {new Date(collection.createdAt).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}