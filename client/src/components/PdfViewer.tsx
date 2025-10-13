import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileText, AlertCircle } from 'lucide-react';
import { fetchPdf, downloadPdf } from '@/utils/pdfUtils';
import { useToast } from '@/hooks/use-toast';

interface PdfViewerProps {
  endpoint: string;
  orderId: string;
  filename: string;
  title?: string;
  description?: string;
}

export default function PdfViewer({ 
  endpoint, 
  orderId, 
  filename, 
  title = "PDF Document", 
  description = "Preview and download PDF document" 
}: PdfViewerProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    const loadPdf = async () => {
      try {
        setIsLoading(true);
        setError('');
        const blob = await fetchPdf(endpoint, orderId);
        setPdfBlob(blob);
        setObjectUrl(URL.createObjectURL(blob));
      } catch (error) {
        console.error(error);
        setError((error as Error).message);
        toast({
          title: 'PDF loading failed',
          description: 'Failed to load PDF document',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();

    // Cleanup function
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [endpoint, orderId]);

  const handleDownload = () => {
    if (pdfBlob) {
      downloadPdf(pdfBlob, filename);
      toast({
        title: 'Download started',
        description: `${filename} is being downloaded`,
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2 text-muted-foreground">Loading PDF...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            PDF Loading Error
          </CardTitle>
          <CardDescription>Failed to load PDF document</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-destructive mb-4">{error}</p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-end">
          <Button
            onClick={handleDownload}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
        
        {objectUrl && (
          <div className="border rounded-lg overflow-hidden">
            <iframe
              src={objectUrl}
              title="PDF Preview"
              className="w-full h-[600px]"
              frameBorder="0"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}