import { useState, useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, FileText, Eraser, Check, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface PDFSignatureCaptureProps {
  onSignComplete?: (signedPdfUrl: string, mediaId: number) => void;
  category?: string;
  title?: string;
  notes?: string;
}

export function PDFSignatureCapture({ 
  onSignComplete, 
  category = 'signed-documents',
  title: initialTitle,
  notes: initialNotes 
}: PDFSignatureCaptureProps) {
  const { toast } = useToast();
  const signatureRef = useRef<SignatureCanvas>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [documentTitle, setDocumentTitle] = useState(initialTitle || '');
  const [documentNotes, setDocumentNotes] = useState(initialNotes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setPdfPreviewUrl(URL.createObjectURL(file));
    if (!documentTitle) {
      setDocumentTitle(file.name.replace('.pdf', ''));
    }
  }, [toast, documentTitle]);

  const handleClearSignature = () => {
    signatureRef.current?.clear();
    setSignatureEmpty(true);
  };

  const handleSignatureEnd = () => {
    setSignatureEmpty(signatureRef.current?.isEmpty() || false);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: 'No PDF Selected',
        description: 'Please upload a PDF document to sign.',
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

      const { tempId } = await uploadResponse.json();

      const signatureData = signatureRef.current.toDataURL('image/png');

      const signResponse = await fetch('/api/documents/apply-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tempId,
          signatureData,
          signerName,
          title: documentTitle || selectedFile.name,
          notes: documentNotes,
          category,
        }),
      });

      if (!signResponse.ok) {
        const error = await signResponse.json();
        throw new Error(error.error || 'Failed to sign document');
      }

      const result = await signResponse.json();

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
        onSignComplete(result.storagePath, result.id);
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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Sign PDF Document
        </CardTitle>
        <CardDescription>
          Upload a PDF, add your signature, and save the signed document
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!selectedFile ? (
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
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-sm text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
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
              canvasProps={{
                className: 'w-full h-[150px]',
                style: { width: '100%', height: '150px' }
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
          disabled={isSubmitting || !selectedFile || signatureEmpty || !signerName.trim()}
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
