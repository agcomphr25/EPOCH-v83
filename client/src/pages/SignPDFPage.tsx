import { useState } from 'react';
import { PDFSignatureCapture } from '@/components/PDFSignatureCapture';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ExternalLink, CheckCircle2 } from 'lucide-react';

interface SignedDocument {
  url: string;
  mediaId: number;
}

export default function SignPDFPage() {
  const [signedDocuments, setSignedDocuments] = useState<SignedDocument[]>([]);

  const handleSignComplete = (storagePath: string, mediaId: number) => {
    setSignedDocuments(prev => [...prev, { url: `/${storagePath}`, mediaId }]);
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          PDF Document Signing
        </h1>
        <p className="text-muted-foreground mt-2">
          Upload a PDF document, review it, and add your digital signature.
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
              <ul className="space-y-2">
                {signedDocuments.map((doc, index) => (
                  <li key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="font-medium">Signed Document #{doc.mediaId}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      asChild
                      data-testid={`button-view-signed-${doc.mediaId}`}
                    >
                      <a href={doc.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
