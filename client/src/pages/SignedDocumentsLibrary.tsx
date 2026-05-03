import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileBadge, FileText, Search, Download, Eye, ExternalLink, Loader2, Edit, Trash2 } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

interface SignedDocument {
  id: string;
  orderId: string | null;
  approvalType: string | null;
  signedBy: string;
  signedAt: string;
  notes: string | null;
  createdByName: string | null;
  media: {
    id: string;
    filename: string;
    storagePath: string;
    title: string | null;
    fileSize: number;
  };
}

const approvalTypeLabels: Record<string, string> = {
  customer_approval: 'Customer Approval',
  production_approval: 'Production Approval',
  quality_approval: 'Quality Approval',
  shipping_approval: 'Shipping Approval',
};

export default function SignedDocumentsLibrary() {
  const [searchTerm, setSearchTerm] = useState('');
  const [approvalTypeFilter, setApprovalTypeFilter] = useState('all');
  const [previewDocument, setPreviewDocument] = useState<SignedDocument | null>(null);
  const [editDocument, setEditDocument] = useState<SignedDocument | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<SignedDocument | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editSignedBy, setEditSignedBy] = useState('');
  const [editApprovalType, setEditApprovalType] = useState('');
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: signedDocuments, isLoading } = useQuery<SignedDocument[]>({
    queryKey: ['/api/documents/all'],
  });
  
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/documents/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents/all'] });
      toast({ title: 'Success', description: 'Document deleted successfully' });
      setDeleteDocument(null);
      setPreviewDocument(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete document', variant: 'destructive' });
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; notes?: string; signedBy?: string; approvalType?: string }) => {
      return apiRequest(`/api/documents/${id}`, { method: 'PATCH', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents/all'] });
      toast({ title: 'Success', description: 'Document updated successfully' });
      setEditDocument(null);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update document', variant: 'destructive' });
    },
  });
  
  const handleEdit = (doc: SignedDocument) => {
    setEditNotes(doc.notes || '');
    setEditSignedBy(doc.signedBy || '');
    setEditApprovalType(doc.approvalType || '');
    setEditDocument(doc);
  };
  
  const handleSaveEdit = () => {
    if (!editDocument) return;
    updateMutation.mutate({
      id: editDocument.id,
      notes: editNotes,
      signedBy: editSignedBy,
      approvalType: editApprovalType,
    });
  };

  const filteredDocuments = signedDocuments?.filter(doc => {
    const matchesSearch = !searchTerm || 
      (doc.orderId && doc.orderId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      doc.signedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.media.title && doc.media.title.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesType = approvalTypeFilter === 'all' || doc.approvalType === approvalTypeFilter;
    
    return matchesSearch && matchesType;
  }) || [];

  const handleDownload = async (doc: SignedDocument) => {
    try {
      const response = await fetch(`/${doc.media.storagePath}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.media.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileBadge className="h-8 w-8" />
          Signed Documents Library
        </h1>
        <p className="text-muted-foreground mt-2">
          Browse all signed approval documents across all orders
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filter Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Order ID, signer name, or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-documents"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approvalType">Approval Type</Label>
              <Select value={approvalTypeFilter} onValueChange={setApprovalTypeFilter}>
                <SelectTrigger data-testid="select-approval-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="customer_approval">Customer Approval</SelectItem>
                  <SelectItem value="production_approval">Production Approval</SelectItem>
                  <SelectItem value="quality_approval">Quality Approval</SelectItem>
                  <SelectItem value="shipping_approval">Shipping Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Link href="/sign-pdf">
                <Button data-testid="button-new-signature">
                  <FileText className="h-4 w-4 mr-2" />
                  Sign New Document
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileBadge className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium">No signed documents found</p>
            <p className="text-sm text-muted-foreground">
              {searchTerm || approvalTypeFilter !== 'all' 
                ? 'Try adjusting your filters'
                : 'Sign a document to see it here'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <FileText className="h-8 w-8 text-red-600" />
                    </div>
                    <div>
                      <p className="font-medium text-lg">
                        {doc.media.title || doc.media.filename}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {doc.orderId && (
                          <Link href={`/orders/${doc.orderId}`}>
                            <span className="text-sm text-blue-600 hover:underline cursor-pointer">
                              Order: {doc.orderId}
                            </span>
                          </Link>
                        )}
                        {doc.approvalType && (
                          <span className="text-sm bg-gray-100 px-2 py-0.5 rounded">
                            {approvalTypeLabels[doc.approvalType] || doc.approvalType}
                          </span>
                        )}
                        {!doc.orderId && !doc.approvalType && (
                          <span className="text-sm text-muted-foreground">
                            Standalone document
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Signed by <span className="font-medium">{doc.signedBy}</span> on {formatDate(doc.signedAt)}
                      </p>
                      {doc.notes && (
                        <p className="text-sm text-muted-foreground mt-1 italic">
                          {doc.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-14 md:ml-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewDocument(doc)}
                      data-testid={`button-view-${doc.id}`}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                      data-testid={`button-download-${doc.id}`}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(doc)}
                      data-testid={`button-edit-${doc.id}`}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteDocument(doc)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid={`button-delete-${doc.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewDocument} onOpenChange={() => setPreviewDocument(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewDocument?.media.title || previewDocument?.media.filename}
            </DialogTitle>
            <DialogDescription>
              {previewDocument?.orderId && `Order: ${previewDocument.orderId} | `}
              Signed by {previewDocument?.signedBy}
            </DialogDescription>
          </DialogHeader>
          {previewDocument && (
            <div className="flex-1 h-full">
              <iframe
                src={`/${previewDocument.media.storagePath}`}
                className="w-full h-[calc(80vh-120px)] border rounded"
                title="PDF Preview"
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => handleDownload(previewDocument)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/${previewDocument.media.storagePath}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in New Tab
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => handleEdit(previewDocument)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setDeleteDocument(previewDocument)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editDocument} onOpenChange={() => setEditDocument(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Signed Document</DialogTitle>
            <DialogDescription>
              Update document details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-signed-by">Signed By</Label>
              <Input
                id="edit-signed-by"
                value={editSignedBy}
                onChange={(e) => setEditSignedBy(e.target.value)}
                data-testid="input-edit-signed-by"
              />
            </div>
            <div>
              <Label htmlFor="edit-approval-type">Approval Type</Label>
              <Select value={editApprovalType} onValueChange={setEditApprovalType}>
                <SelectTrigger data-testid="select-edit-approval-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_approval">Customer Approval</SelectItem>
                  <SelectItem value="production_approval">Production Approval</SelectItem>
                  <SelectItem value="quality_approval">Quality Approval</SelectItem>
                  <SelectItem value="shipping_approval">Shipping Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDocument(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDocument} onOpenChange={() => setDeleteDocument(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Signed Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteDocument?.media.title || deleteDocument?.media.filename}" 
              and its associated file. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDocument && deleteMutation.mutate(deleteDocument.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
