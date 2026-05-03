import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { 
  BookOpen, 
  Upload, 
  FileText, 
  Download, 
  Eye, 
  Trash2, 
  Search,
  RefreshCw,
  Plus,
  FolderOpen,
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Move,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MediaItem {
  id: string;
  filename: string;
  title: string | null;
  category: string;
  mimeType: string;
  storagePath: string;
  captureDate: string;
  folderId: string | null;
}

interface MediaFolder {
  id: string;
  name: string;
  parentId: string | null;
  visibleToRoles: string[] | null;
  createdByName: string;
  createdAt: string;
}

export default function ReferenceDocsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFolderId, setUploadFolderId] = useState<string>('root');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string>('root');

  const { data: documents = [], isLoading: docsLoading } = useQuery<MediaItem[]>({
    queryKey: ['/api/media', { category: 'document' }],
    queryFn: async () => {
      const data = await fetch('/api/media?category=document', { credentials: 'include' }).then(r => r.json());
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: folders = [], isLoading: foldersLoading } = useQuery<MediaFolder[]>({
    queryKey: ['/api/media/folders'],
    queryFn: async () => {
      const data = await fetch('/api/media/folders', { credentials: 'include' }).then(r => r.json());
      return Array.isArray(data) ? data : [];
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (data: { name: string; parentId: string | null }) => {
      const res = await fetch('/api/media/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create folder');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media/folders'] });
      toast({ title: 'Folder created successfully' });
      setShowCreateFolderDialog(false);
      setNewFolderName('');
      setNewFolderParentId('root');
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create folder', description: error.message, variant: 'destructive' });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: string) => {
      const res = await fetch(`/api/media/folders/${folderId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete folder');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media/folders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/media'] });
      toast({ title: 'Folder deleted' });
      if (selectedFolderId) setSelectedFolderId(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to delete folder', description: error.message, variant: 'destructive' });
    },
  });

  const moveDocumentMutation = useMutation({
    mutationFn: async ({ docId, folderId }: { docId: string; folderId: string | null }) => {
      const res = await fetch(`/api/media/${docId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to move document');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media'] });
      toast({ title: 'Document moved successfully' });
      setShowMoveDialog(false);
      setMovingDocId(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to move document', description: error.message, variant: 'destructive' });
    },
  });

  const buildFolderTree = (parentId: string | null = null): MediaFolder[] => {
    return folders.filter(f => f.parentId === parentId);
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.title && doc.title.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFolder = selectedFolderId === null 
      ? doc.folderId === null 
      : doc.folderId === selectedFolderId;
    return matchesSearch && matchesFolder;
  });

  const allDocsMatchingSearch = documents.filter(doc =>
    doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.title && doc.title.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast({ title: 'Please select a file', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Step 1: Get pre-signed upload URL from cloud storage
      const urlResponse = await fetch('/api/media/request-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: uploadFile.name,
          size: uploadFile.size,
          contentType: uploadFile.type,
        }),
      });
      
      if (!urlResponse.ok) {
        const errorData = await urlResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get upload URL');
      }
      
      const { uploadURL, objectPath } = await urlResponse.json();
      
      // Step 2: Upload file directly to cloud storage
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: uploadFile,
        headers: { 'Content-Type': uploadFile.type },
      });
      
      if (!uploadResponse.ok) throw new Error('Failed to upload to cloud storage');
      
      // Step 3: Complete upload - save metadata to database
      const completeResponse = await fetch('/api/media/complete-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          objectPath,
          filename: uploadFile.name,
          mimeType: uploadFile.type,
          fileSize: uploadFile.size,
          title: uploadTitle || uploadFile.name,
          category: 'document',
          folderId: uploadFolderId !== 'root' ? uploadFolderId : null,
        }),
      });

      if (!completeResponse.ok) {
        const data = await completeResponse.json();
        throw new Error(data.error || 'Upload failed');
      }

      toast({ title: 'Document uploaded successfully' });
      await queryClient.invalidateQueries({ queryKey: ['/api/media'] });
      setShowUploadDialog(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadFolderId('root');
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
      await apiRequest(`/api/media/${id}`, { method: 'DELETE' });
      toast({ title: 'Document deleted' });
      await queryClient.invalidateQueries({ queryKey: ['/api/media'] });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast({ title: 'Please enter a folder name', variant: 'destructive' });
      return;
    }
    createFolderMutation.mutate({
      name: newFolderName.trim(),
      parentId: newFolderParentId === 'root' ? null : newFolderParentId,
    });
  };

  const handleDeleteFolder = (folderId: string) => {
    if (!confirm('Delete this folder? Contents will be moved to root level.')) return;
    deleteFolderMutation.mutate(folderId);
  };

  const handleMoveDocument = (folderId: string) => {
    if (!movingDocId) return;
    moveDocumentMutation.mutate({
      docId: movingDocId,
      folderId: folderId === 'root' ? null : folderId,
    });
  };

  const FolderItem = ({ folder, level = 0 }: { folder: MediaFolder; level?: number }) => {
    const children = buildFolderTree(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const docCount = documents.filter(d => d.folderId === folder.id).length;

    return (
      <div>
        <div
          className={`flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer hover:bg-muted/50 ${
            isSelected ? 'bg-muted' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => setSelectedFolderId(folder.id)}
        >
          {hasChildren ? (
            <button
              className="p-0.5 hover:bg-muted rounded"
              onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id); }}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <Folder className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-amber-500'}`} />
          <span className="flex-1 text-sm truncate">{folder.name}</span>
          {docCount > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{docCount}</Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDeleteFolder(folder.id)}>
                <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                Delete Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {children.map(child => (
              <FolderItem key={child.id} folder={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const rootDocCount = documents.filter(d => d.folderId === null).length;
  const isLoading = docsLoading || foldersLoading;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Reference Documents</h1>
            <p className="text-muted-foreground">Store and access important reference materials</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreateFolderDialog(true)}>
            <FolderPlus className="h-4 w-4 mr-2" />
            New Folder
          </Button>
          <Button onClick={() => setShowUploadDialog(true)} data-testid="upload-document-btn">
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>
      </div>

      <div className="flex gap-6">
        <Card className="w-64 shrink-0">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Folders</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ScrollArea className="h-[400px]">
              <div
                className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-muted/50 ${
                  selectedFolderId === null ? 'bg-muted' : ''
                }`}
                onClick={() => setSelectedFolderId(null)}
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-sm">All Documents (Root)</span>
                {rootDocCount > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">{rootDocCount}</Badge>
                )}
              </div>
              {buildFolderTree(null).map(folder => (
                <FolderItem key={folder.id} folder={folder} />
              ))}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="search-documents"
                />
              </div>
              <Badge variant="outline" className="text-sm">
                {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-12">
                <FolderOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">No documents found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm ? 'Try a different search term' : 'Upload your first document to this folder'}
                </p>
                {!searchTerm && (
                  <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocs.map((doc) => (
                    <TableRow key={doc.id} data-testid={`doc-row-${doc.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-blue-600" />
                          <div>
                            <p className="font-medium">{doc.title || doc.filename}</p>
                            {doc.title && (
                              <p className="text-xs text-muted-foreground">{doc.filename}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {doc.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(doc.captureDate), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/api/media/${doc.id}/download`, '_blank')}
                            data-testid={`view-doc-${doc.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const a = document.createElement('a');
                              a.href = `/api/media/${doc.id}/download`;
                              a.download = doc.filename || 'document.pdf';
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                            }}
                            data-testid={`download-doc-${doc.id}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setMovingDocId(doc.id); setShowMoveDialog(true); }}
                            title="Move to folder"
                          >
                            <Move className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(doc.id)}
                            data-testid={`delete-doc-${doc.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Reference Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="file">Select File</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                data-testid="file-input"
              />
            </div>
            <div>
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                placeholder="Enter a descriptive title..."
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                data-testid="title-input"
              />
            </div>
            <div>
              <Label htmlFor="folder">Upload to Folder</Label>
              <Select value={uploadFolderId} onValueChange={setUploadFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">Root (No folder)</SelectItem>
                  {folders.map(folder => (
                    <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadFile} data-testid="confirm-upload">
              {uploading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="folderName">Folder Name</Label>
              <Input
                id="folderName"
                placeholder="Enter folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="parentFolder">Parent Folder (optional)</Label>
              <Select value={newFolderParentId} onValueChange={setNewFolderParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select parent folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">Root (No parent)</SelectItem>
                  {folders.map(folder => (
                    <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateFolderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={createFolderMutation.isPending || !newFolderName.trim()}>
              {createFolderMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Create Folder
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Document to Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Destination Folder</Label>
              <div className="mt-2 border rounded-md p-2 max-h-[300px] overflow-y-auto">
                <div
                  className="flex items-center gap-2 py-2 px-2 rounded cursor-pointer hover:bg-muted"
                  onClick={() => handleMoveDocument('root')}
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Root (No folder)</span>
                </div>
                {folders.map(folder => (
                  <div
                    key={folder.id}
                    className="flex items-center gap-2 py-2 px-2 rounded cursor-pointer hover:bg-muted"
                    onClick={() => handleMoveDocument(folder.id)}
                  >
                    <Folder className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">{folder.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowMoveDialog(false); setMovingDocId(null); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
