import { useState, useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Upload, FileText, Eraser, Check, X, FolderOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MediaItem {
  id: string;
  filename: string;
  storagePath: string;
  title: string;
  mimeType: string;
  fileSize: number;
  captureDate: string;
}

interface PDFSignatureCaptureProps {
  onSignComplete?: (result: SignedPDFResult) => void;
  category?: string;
  title?: string;
  notes?: string;
  orderId?: string;
  approvalType?: 'customer_approval' | 'production_approval' | 'quality_approval' | 'shipping_approval';
}

export interface SignedPDFResult {
  id: string;
  storagePath: string;
  filename: string;
  title: string;
  signedBy: string;
  signedAt: string;
}

export function PDFSignatureCapture({ 
  onSignComplete, 
  category = 'signed-documents',
  title: initialTitle,
  notes: initialNotes,
  orderId,
  approvalType = 'customer_approval'
}: PDFSignatureCaptureProps) {
  const { toast } = useToast();
  const signatureRef = useRef<SignatureCanvas>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMediaItem, setSelectedMediaItem] = useState<MediaItem | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [documentTitle, setDocumentTitle] = useState(initialTitle || '');
  const [documentNotes, setDocumentNotes] = useState(initialNotes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const { data: pdfDocuments, isLoading: isLoadingPdfs } = useQuery<MediaItem[]>({
    queryKey: ['/api/media'],
    select: (data) => data.filter(item => item.mimeType === 'application/pdf'),
  });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: 'Invalid File Type',
        description: 'Please select a PDF file.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
    setSelectedMediaItem(null);
    setPdfPreviewUrl(URL.createObjectURL(file));
    if (!documentTitle) {
      setDocumentTitle(file.name.replace('.pdf', ''));
    }
  }, [toast, documentTitle]);

  const handleSelectFromLibrary = (item: MediaItem) => {
    setSelectedMediaItem(item);
    setSelectedFile(null);
    setPdfPreviewUrl(`/${item.storagePath}`);
    if (!documentTitle) {
      setDocumentTitle(item.title || item.filename.replace('.pdf', ''));
    }
    setShowMediaPicker(false);
  };

  const handleClearSignature = () => {
    signatureRef.current?.clear();
    setSignatureEmpty(true);
  };

  const handleSignatureEnd = () => {
    setSignatureEmpty(signatureRef.current?.isEmpty() || false);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setSelectedMediaItem(null);
    if (pdfPreviewUrl && !selectedMediaItem) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile && !selectedMediaItem) {
      toast({
        title: 'No PDF Selected',
        description: 'Please upload or select a PDF document to sign.',
        variant: 'destructive',
      });
      return;
    }

    if (signatureEmpty || !signatureRef.current) {
      toast({
        title: 'Signature Required',
        description: 'Please provide your signature.',
        variant: 'destructive',
      });
      return;
    }

    if (!signerName.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter your name.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let tempId: string;

      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const uploadResponse = await fetch('/api/documents/upload-for-signing', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error || 'Failed to upload document');
        }

        const uploadResult = await uploadResponse.json();
        tempId = uploadResult.tempId;
      } else if (selectedMediaItem) {
        const response = await fetch(`/${selectedMediaItem.storagePath}`);
        const blob = await response.blob();
        const file = new File([blob], selectedMediaItem.filename, { type: 'application/pdf' });
        
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch('/api/documents/upload-for-signing', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(error.error || 'Failed to upload document');
        }

        const uploadResult = await uploadResponse.json();
        tempId = uploadResult.tempId;
      } else {
        throw new Error('No document selected');
      }

      const signatureData = signatureRef.current.toDataURL('image/png');

      const signResponse = await fetch('/api/documents/apply-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tempId,
          signatureData,
          signerName,
          title: documentTitle || (selectedFile?.name || selectedMediaItem?.filename || 'Document'),
          notes: documentNotes,
          category,
          orderId,
          approvalType,
        }),
      });

      if (!signResponse.ok) {
        const error = await signResponse.json();
        throw new Error(error.error || 'Failed to sign document');
      }

      const result: SignedPDFResult = await signResponse.json();

      toast({
        title: 'Document Signed Successfully',
        description: 'The signed document has been saved to the media library.',
      });

      handleClearSignature();
      handleClearFile();
      setSignerName('');
      setDocumentTitle('');
      setDocumentNotes('');

      if (onSignComplete) {
        onSignComplete(result);
      }
    } catch (error: any) {
      console.error('Error signing PDF:', error);
      toast({
        title: 'Signing Failed',
        description: error.message || 'An error occurred while signing the document.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasSelectedDocument = selectedFile || selectedMediaItem;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Sign PDF Document
        </CardTitle>
        <CardDescription>
          Upload a PDF or select from your library, add your signature, and save the signed document
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasSelectedDocument ? (
          <div className="space-y-4">
            <div 
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="pdf-upload-dropzone"
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Click to upload PDF</p>
              <p className="text-sm text-muted-foreground">or drag and drop</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-pdf-file"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Dialog open={showMediaPicker} onOpenChange={setShowMediaPicker}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full"
                  data-testid="button-select-from-library"
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Select from Media Library
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Select a PDF Document</DialogTitle>
                  <DialogDescription>
                    Choose a PDF from your media library to sign
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[400px] pr-4">
                  {isLoadingPdfs ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : pdfDocuments && pdfDocuments.length > 0 ? (
                    <div className="space-y-2">
                      {pdfDocuments.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                          onClick={() => handleSelectFromLibrary(item)}
                          data-testid={`pdf-item-${item.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-8 w-8 text-red-500" />
                            <div>
                              <p className="font-medium">{item.title || item.filename}</p>
                              <p className="text-sm text-muted-foreground">
                                {(item.fileSize / 1024).toFixed(1)} KB
                              </p>
                            </div>
                          </div>
                          <Button size="sm" variant="ghost">
                            Select
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No PDF documents in library</p>
                      <p className="text-sm">Upload a PDF to get started</p>
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium">
                  {selectedFile?.name || selectedMediaItem?.filename}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({((selectedFile?.size || selectedMediaItem?.fileSize || 0) / 1024).toFixed(1)} KB)
                </span>
                {selectedMediaItem && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    From Library
                  </span>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleClearFile}
                data-testid="button-clear-file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {pdfPreviewUrl && (
              <div className="border rounded-lg overflow-hidden">
                <iframe
                  src={pdfPreviewUrl}
                  className="w-full h-[400px]"
                  title="PDF Preview"
                />
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="signerName">Your Name *</Label>
            <Input
              id="signerName"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Enter your full name"
              data-testid="input-signer-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="documentTitle">Document Title</Label>
            <Input
              id="documentTitle"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              placeholder="Title for signed document"
              data-testid="input-document-title"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="documentNotes">Notes (optional)</Label>
          <Input
            id="documentNotes"
            value={documentNotes}
            onChange={(e) => setDocumentNotes(e.target.value)}
            placeholder="Any additional notes about this document"
            data-testid="input-document-notes"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Signature *</Label>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearSignature}
              data-testid="button-clear-signature"
            >
              <Eraser className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
          <div className="border-2 rounded-lg bg-white">
            <SignatureCanvas
              ref={signatureRef}
              penColor="black"
              clearOnResize={false}
              canvasProps={{
                className: 'w-full h-[150px]',
                style: { width: '100%', height: '150px', touchAction: 'none' }
              }}
              onEnd={handleSignatureEnd}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Sign in the box above using your mouse or touch screen
          </p>
        </div>

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={isSubmitting || !hasSelectedDocument || signatureEmpty || !signerName.trim()}
          data-testid="button-submit-signature"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Signing Document...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Sign & Save Document
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default PDFSignatureCapture;
