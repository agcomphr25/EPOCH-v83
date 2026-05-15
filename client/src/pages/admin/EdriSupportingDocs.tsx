import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Download,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import EdriSubNav from '@/components/EdriSubNav';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SupportingDocument {
  id: number;
  folderLabel: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  notes: string | null;
  uploadedByUserId: number | null;
  uploadedByDisplayName: string | null;
  uploadedAt: string;
}

interface SupportingDocsResponse {
  folderLabel: string;
  documents: SupportingDocument[];
}

function fileSizeLabel(bytes: number) {
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(doc: SupportingDocument) {
  const name = doc.originalFileName.toLowerCase();
  if (doc.mimeType.includes('powerpoint') || name.endsWith('.ppt') || name.endsWith('.pptx')) return 'PowerPoint';
  if (doc.mimeType.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (doc.mimeType.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return 'Word';
  if (doc.mimeType.includes('excel') || name.endsWith('.xls') || name.endsWith('.xlsx')) return 'Excel';
  if (doc.mimeType.startsWith('image/')) return 'Image';
  if (doc.mimeType.includes('csv') || name.endsWith('.csv')) return 'CSV';
  return 'Document';
}

function DocumentIcon({ doc }: { doc: SupportingDocument }) {
  const kind = fileKind(doc);
  if (kind === 'PowerPoint') return <FileArchive className="h-4 w-4 text-orange-600" />;
  if (kind === 'Image') return <FileImage className="h-4 w-4 text-blue-600" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

export default function EdriSupportingDocs() {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState('');

  const { data, isLoading, isFetching, error, refetch } = useQuery<SupportingDocsResponse>({
    queryKey: ['/api/edri/supporting-documents'],
    queryFn: () => apiRequest('/api/edri/supporting-documents'),
  });

  const totalBytes = useMemo(
    () => (data?.documents ?? []).reduce((sum, doc) => sum + doc.fileSizeBytes, 0),
    [data?.documents],
  );

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('folderLabel', 'Supporting Docs');
      if (notes.trim()) formData.append('notes', notes.trim());
      files.forEach(file => formData.append('files', file));
      return apiRequest('/api/edri/supporting-documents', {
        method: 'POST',
        body: formData,
        timeout: 120000,
      });
    },
    onSuccess: () => {
      toast({ title: 'Supporting documents uploaded' });
      setFiles([]);
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/edri/supporting-documents'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Upload failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/edri/supporting-documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Supporting document removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/edri/supporting-documents'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Delete failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  function handleDelete(doc: SupportingDocument) {
    if (window.confirm(`Remove ${doc.originalFileName} from Supporting Docs?`)) {
      deleteMutation.mutate(doc.id);
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Supporting Docs</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Store audit support files for the EDRI dashboard, including slide decks, PDFs, spreadsheets, images, and notes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4" />
              Supporting Docs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="rounded-md border border-destructive p-4 text-sm text-destructive">
                {error instanceof Error ? error.message : 'Unable to load supporting documents.'}
              </div>
            ) : isLoading ? (
              <div className="py-10 flex items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading documents
              </div>
            ) : (data?.documents?.length ?? 0) === 0 ? (
              <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                No supporting documents uploaded yet.
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[220px]">
                            <DocumentIcon doc={doc} />
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[360px]">{doc.originalFileName}</div>
                              <div className="text-xs text-muted-foreground">{doc.folderLabel}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{fileKind(doc)}</Badge></TableCell>
                        <TableCell>{fileSizeLabel(doc.fileSizeBytes)}</TableCell>
                        <TableCell>
                          <div className="whitespace-nowrap">{new Date(doc.uploadedAt).toLocaleString()}</div>
                          {doc.uploadedByDisplayName ? (
                            <div className="text-xs text-muted-foreground">by {doc.uploadedByDisplayName}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate">{doc.notes ?? '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <a href={`/api/edri/supporting-documents/${doc.id}/download?download=true`}>
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(doc)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" />
              Upload
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supporting-docs">Files</Label>
              <Input
                id="supporting-docs"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.jpg,.jpeg,.png,.gif,.webp"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
              <p className="text-xs text-muted-foreground">
                Up to 20 files per upload, 50 MB each.
              </p>
            </div>

            {files.length > 0 ? (
              <div className="space-y-2 rounded-md border p-3">
                {files.map((file) => (
                  <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{fileSizeLabel(file.size)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="supporting-doc-notes">Notes</Label>
              <Textarea
                id="supporting-doc-notes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional context for this upload"
              />
            </div>

            <Button
              className="w-full"
              onClick={() => uploadMutation.mutate()}
              disabled={!files.length || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload to Supporting Docs
            </Button>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-muted p-3">
                <div className="text-xs text-muted-foreground">Documents</div>
                <div className="text-lg font-semibold">{data?.documents.length ?? 0}</div>
              </div>
              <div className="rounded-md bg-muted p-3">
                <div className="text-xs text-muted-foreground">Stored</div>
                <div className="text-lg font-semibold">{fileSizeLabel(totalBytes)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
