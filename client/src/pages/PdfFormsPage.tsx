import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { FileText, Plus, Edit, Trash2, Download, Loader2, Upload } from 'lucide-react';
import type { PdfFormTemplate } from '../../../server/schema';

export default function PdfFormsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: templates = [], isLoading } = useQuery<PdfFormTemplate[]>({
    queryKey: ['/api/pdf-forms'],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/pdf-forms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-forms'] });
      toast({ title: 'Template deleted' });
      setDeleteConfirmId(null);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Delete failed';
      toast({ title: 'Delete failed', description: msg, variant: 'destructive' });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file && !uploadName) {
      setUploadName(file.name.replace(/\.pdf$/i, ''));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadName.trim()) {
      toast({ title: 'Please select a file and enter a name', variant: 'destructive' });
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', uploadName.trim());

      const template = await apiRequest('/api/pdf-forms/upload', { method: 'POST', body: formData }) as PdfFormTemplate & { pdfUrl?: string };
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-forms'] });
      toast({ title: 'Template uploaded', description: `"${template.name}" is ready to edit` });
      setUploadDialogOpen(false);
      setUploadName('');
      setSelectedFile(null);
      setLocation(`/pdf-forms/editor/${template.id}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Upload failed';
      toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">PDF Forms</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Upload any PDF, add fillable fields, and let operators fill it out and download the completed form
          </p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-16 w-16 text-muted-foreground mb-4 opacity-30" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No templates yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Upload a PDF to get started. You can then draw labeled input fields anywhere on the pages.
          </p>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload your first PDF
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    <CardTitle className="text-base truncate">{template.name}</CardTitle>
                  </div>
                </div>
                <CardDescription className="text-xs mt-1">
                  {template.pageCount ?? 1} page{(template.pageCount ?? 1) !== 1 ? 's' : ''} &bull;{' '}
                  Created {new Date(template.createdAt!).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 mt-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setLocation(`/pdf-forms/editor/${template.id}`)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Fields
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setLocation(`/pdf-forms/fill/${template.id}`)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Fill &amp; Download
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmId(template.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload New PDF Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                placeholder="e.g. Work Order Form"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdf-file">PDF File</Label>
              <Input
                id="pdf-file"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
              />
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading || !selectedFile || !uploadName.trim()}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload &amp; Edit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Template?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the template and all its field definitions. This cannot be undone.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId !== null && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
