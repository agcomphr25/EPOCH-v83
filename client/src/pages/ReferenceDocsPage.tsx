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
  FolderOpen
} from 'lucide-react';

interface MediaItem {
  id: string;
  filename: string;
  title: string | null;
  category: string;
  mimeType: string;
  storagePath: string;
  captureDate: string;
}

export default function ReferenceDocsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');

  const { data: documents = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ['/api/media', { category: 'document' }],
    queryFn: () => fetch('/api/media?category=document', { credentials: 'include' }).then(r => r.json()),
  });

  const filteredDocs = documents.filter(doc => 
    doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.title && doc.title.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleUpload = async () => {
    if (!uploadFile) {
      toast({ title: 'Please select a file', variant: 'destructive' });
      return;
    }

    console.log('[UPLOAD DEBUG] Starting upload:', {
      fileName: uploadFile.name,
      fileSize: uploadFile.size,
      fileType: uploadFile.type
    });

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('category', 'document');
      if (uploadTitle) {
        formData.append('title', uploadTitle);
      }

      console.log('[UPLOAD DEBUG] Sending FormData with category: document');

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();
      console.log('[UPLOAD DEBUG] Server response:', data);

      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Upload failed');
      }

      if (!data.documentId) {
        throw new Error('Upload succeeded but no document ID returned');
      }

      toast({ title: 'Document uploaded successfully' });
      await queryClient.invalidateQueries({ queryKey: ['/api/media'] });
      await queryClient.refetchQueries({ queryKey: ['/api/media', { category: 'document' }] });
      setShowUploadDialog(false);
      setUploadFile(null);
      setUploadTitle('');
    } catch (error: any) {
      console.error('[UPLOAD DEBUG] Upload error:', error);
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
      await queryClient.refetchQueries({ queryKey: ['/api/media', { category: 'document' }] });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    }
  };

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
        <Button onClick={() => setShowUploadDialog(true)} data-testid="upload-document-btn">
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      <Card>
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
                {searchTerm ? 'Try a different search term' : 'Upload your first reference document to get started'}
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
                          onClick={() => window.open(`/${doc.storagePath}`, '_blank')}
                          data-testid={`view-doc-${doc.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/${doc.storagePath}`, '_blank')}
                          data-testid={`download-doc-${doc.id}`}
                        >
                          <Download className="h-4 w-4" />
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
    </div>
  );
}
