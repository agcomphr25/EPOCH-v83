import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, X, File, Image, FileText, Download, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface OrderAttachment {
  id: number;
  orderId: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  uploadedBy?: string;
  notes?: string;
  createdAt: string;
}

interface OrderAttachmentsProps {
  orderId: string;
  readonly?: boolean;
}

export function OrderAttachments({ orderId, readonly = false }: OrderAttachmentsProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadNotes, setUploadNotes] = useState('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch attachments
  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ['order-attachments', orderId],
    queryFn: () => apiRequest(`/api/order-attachments/${orderId}`),
    enabled: !!orderId,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ files, notes }: { files: File[]; notes: string }) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      if (notes) formData.append('notes', notes);

      return fetch(`/api/order-attachments/${orderId}`, {
        method: 'POST',
        body: formData,
      }).then(res => {
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-attachments', orderId] });
      toast({ title: 'Files uploaded successfully' });
      setShowUploadDialog(false);
      setPendingFiles([]);
      setUploadNotes('');
    },
    onError: (error) => {
      toast({ 
        title: 'Upload failed', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (attachmentId: number) => 
      apiRequest(`/api/order-attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-attachments', orderId] });
      toast({ title: 'Attachment deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete attachment', variant: 'destructive' });
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!readonly) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!readonly) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (readonly) return;
    
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFileSelection(files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readonly) return;
    
    const files = Array.from(e.target.files || []);
    handleFileSelection(files);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelection = (files: File[]) => {
    // Filter allowed file types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'text/plain'
    ];

    const validFiles = files.filter(file => {
      if (!allowedTypes.includes(file.type)) {
        toast({ 
          title: `File type not allowed: ${file.name}`, 
          description: 'Please upload PDF, Word, Excel, image, or text files only.',
          variant: 'destructive' 
        });
        return false;
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({ 
          title: `File too large: ${file.name}`, 
          description: 'Please keep files under 10MB.',
          variant: 'destructive' 
        });
        return false;
      }
      
      return true;
    });

    if (validFiles.length > 0) {
      setPendingFiles(validFiles);
      setShowUploadDialog(true);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (mimeType === 'application/pdf') return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleDownload = (attachment: OrderAttachment) => {
    window.open(`/api/order-attachments/download/${attachment.id}`, '_blank');
  };

  const handleDelete = (attachmentId: number) => {
    if (confirm('Are you sure you want to delete this attachment?')) {
      deleteMutation.mutate(attachmentId);
    }
  };

  const handleUpload = () => {
    if (pendingFiles.length > 0) {
      uploadMutation.mutate({ files: pendingFiles, notes: uploadNotes });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order Attachments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            Loading attachments...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Order Attachments
            {!readonly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Files
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!readonly && (
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragOver 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drag and drop files here, or{' '}
                <button
                  type="button"
                  className="text-blue-500 hover:text-blue-600 underline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse to upload
                </button>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Supports PDF, Word, Excel, images, and text files (max 10MB each)
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt"
          />

          {attachments.length > 0 ? (
            <div className="mt-4 space-y-2">
              {attachments.map((attachment: OrderAttachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    {getFileIcon(attachment.mimeType)}
                    <div>
                      <p className="font-medium text-sm">{attachment.originalFileName}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(attachment.fileSize)} • {new Date(attachment.createdAt).toLocaleDateString()}
                        {attachment.notes && ` • ${attachment.notes}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(attachment)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {!readonly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(attachment.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-center text-gray-500 py-8">
              No attachments yet
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Files to upload:</Label>
              <div className="mt-2 space-y-2">
                {pendingFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center space-x-2">
                      {getFileIcon(file.type)}
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingFiles(files => files.filter((_, i) => i !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="upload-notes">Notes (optional)</Label>
              <Textarea
                id="upload-notes"
                placeholder="Add any notes about these files..."
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={uploadMutation.isPending || pendingFiles.length === 0}
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Upload Files'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}