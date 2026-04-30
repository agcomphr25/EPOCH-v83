import { useState } from 'react';
import { Link } from 'wouter';
import { PDFSignatureCapture, SignedPDFResult } from '@/components/PDFSignatureCapture';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink, CheckCircle2, Download, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function SignPDFPage() {
  const [signedDocuments, setSignedDocuments] = useState<SignedPDFResult[]>([]);
  const [previewDocument, setPreviewDocument] = useState<SignedPDFResult | null>(null);

  const handleSignComplete = (result: SignedPDFResult) => {
    setSignedDocuments(prev => [result, ...prev]);
  };

  const handleDownload = async (doc: SignedPDFResult) => {
    try {
      const response = await fetch(`/${doc.storagePath}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          PDF Document Signing
        </h1>
        <p className="text-muted-foreground mt-2">
          Upload a PDF document or select from your library, review it, and add your digital signature.
          Signed documents are saved to the media library for future reference.
        </p>
      </div>

      <div className="grid gap-6">
        <PDFSignatureCapture 
          onSignComplete={handleSignComplete}
          category="signed-documents"
        />

        {signedDocuments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Recently Signed Documents
              </CardTitle>
              <CardDescription>
                These documents have been signed and saved to the media library
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {signedDocuments.map((doc) => (
                  <li 
                    key={doc.id} 
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted rounded-lg gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="h-8 w-8 text-red-500 shrink-0" />
                      <div>
                        <p className="font-medium">{doc.title || doc.filename}</p>
                        <p className="text-sm text-muted-foreground">
                          Signed by {doc.signedBy} on {doc.signedAt}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-11 sm:ml-0">
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
                        asChild
                        data-testid={`button-open-${doc.id}`}
                      >
                        <Link href={`/${doc.storagePath}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Open
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!previewDocument} onOpenChange={() => setPreviewDocument(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewDocument?.title || previewDocument?.filename}
            </DialogTitle>
            <DialogDescription>
              Signed by {previewDocument?.signedBy} on {previewDocument?.signedAt}
            </DialogDescription>
          </DialogHeader>
          {previewDocument && (
            <div className="flex-1 h-full">
              <iframe
                src={`/${previewDocument.storagePath}`}
                className="w-full h-[calc(80vh-100px)] border rounded"
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
                <Button 
                  variant="outline"
                  asChild
                >
                  <Link href={`/${previewDocument.storagePath}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in New Tab
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
