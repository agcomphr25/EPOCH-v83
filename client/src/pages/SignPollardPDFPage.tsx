import { useState, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Eraser, Check, PenTool, Type } from 'lucide-react';

const RECIPIENT_EMAIL = 'glenn@agcomposites.com';
const PDF_PATH = '/attached_assets/pollard0186_1767627130359.pdf';

export default function SignPollardPDFPage() {
  const { toast } = useToast();
  const signatureRef = useRef<SignatureCanvas>(null);
  
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [signerName, setSignerName] = useState('');
  const [typedSignature, setTypedSignature] = useState('');
  const [signatureType, setSignatureType] = useState<'draw' | 'type'>('draw');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempId, setTempId] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    const uploadPdf = async () => {
      try {
        setIsLoadingPdf(true);
        const response = await fetch(PDF_PATH);
        if (!response.ok) {
          throw new Error('Failed to load PDF');
        }
        const blob = await response.blob();
        const file = new File([blob], 'pollard0186.pdf', { type: 'application/pdf' });
        
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
        setTempId(uploadResult.tempId);
      } catch (error: any) {
        console.error('Error loading PDF:', error);
        toast({
          title: 'Error Loading Document',
          description: 'Failed to load the PDF document. Please refresh the page.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingPdf(false);
      }
    };

    uploadPdf();
  }, [toast]);

  const handleClearSignature = () => {
    signatureRef.current?.clear();
    setSignatureEmpty(true);
  };

  const handleSignatureEnd = () => {
    setSignatureEmpty(signatureRef.current?.isEmpty() || false);
  };

  const hasValidSignature = () => {
    if (signatureType === 'draw') {
      return !signatureEmpty;
    }
    return typedSignature.trim().length > 0;
  };

  const handleSubmit = async () => {
    if (!tempId) {
      toast({
        title: 'Document Not Ready',
        description: 'Please wait for the document to load.',
        variant: 'destructive',
      });
      return;
    }

    if (!hasValidSignature()) {
      toast({
        title: 'Signature Required',
        description: signatureType === 'draw' 
          ? 'Please draw your signature.' 
          : 'Please type your signature.',
        variant: 'destructive',
      });
      return;
    }

    if (!signerName.trim()) {
      toast({
        title: 'Printed Name Required',
        description: 'Please enter your printed name.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: any = {
        tempId,
        signerName: signerName.trim(),
        recipientEmail: RECIPIENT_EMAIL,
      };

      if (signatureType === 'draw' && signatureRef.current) {
        payload.signatureData = signatureRef.current.toDataURL('image/png');
      } else if (signatureType === 'type') {
        payload.typedSignature = typedSignature.trim();
      }

      const response = await fetch('/api/documents/sign-and-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sign and submit document');
      }

      toast({
        title: 'Document Submitted Successfully',
        description: 'The signed document has been sent.',
      });

      handleClearSignature();
      setSignerName('');
      setTypedSignature('');
      
      const uploadPdf = async () => {
        const pdfResponse = await fetch(PDF_PATH);
        const blob = await pdfResponse.blob();
        const file = new File([blob], 'pollard0186.pdf', { type: 'application/pdf' });
        
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch('/api/documents/upload-for-signing', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          setTempId(uploadResult.tempId);
        }
      };
      uploadPdf();

    } catch (error: any) {
      console.error('Error submitting document:', error);
      toast({
        title: 'Submission Failed',
        description: error.message || 'An error occurred while submitting the document.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-8 w-8" />
          Sign Document
        </h1>
        <p className="text-muted-foreground mt-2">
          Review the document below, add your signature, and submit.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Document Preview</CardTitle>
          <CardDescription>Review the document before signing</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPdf ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <iframe
              src={PDF_PATH}
              className="w-full h-[500px] border rounded-lg"
              title="PDF Document"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Digital Signature</CardTitle>
          <CardDescription>
            Choose to draw or type your signature, then enter your printed name
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs value={signatureType} onValueChange={(v) => setSignatureType(v as 'draw' | 'type')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="draw" className="flex items-center gap-2" data-testid="tab-draw-signature">
                <PenTool className="h-4 w-4" />
                Draw Signature
              </TabsTrigger>
              <TabsTrigger value="type" className="flex items-center gap-2" data-testid="tab-type-signature">
                <Type className="h-4 w-4" />
                Type Signature
              </TabsTrigger>
            </TabsList>

            <TabsContent value="draw" className="space-y-4 mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Draw Your Signature</Label>
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
            </TabsContent>

            <TabsContent value="type" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="typedSignature">Type Your Signature</Label>
                <Input
                  id="typedSignature"
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="Type your full name as signature"
                  className="text-xl font-['Brush_Script_MT',_cursive] italic"
                  style={{ fontFamily: "'Brush Script MT', cursive" }}
                  data-testid="input-typed-signature"
                />
                {typedSignature && (
                  <div className="p-4 border rounded-lg bg-gray-50">
                    <p className="text-xs text-muted-foreground mb-2">Signature Preview:</p>
                    <p 
                      className="text-2xl text-blue-800"
                      style={{ fontFamily: "'Brush Script MT', cursive" }}
                    >
                      {typedSignature}
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="signerName">Printed Name *</Label>
              <Input
                id="signerName"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your full name"
                data-testid="input-signer-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                value={currentDate}
                disabled
                className="bg-muted"
                data-testid="input-date"
              />
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={isSubmitting || !tempId || !hasValidSignature() || !signerName.trim()}
            data-testid="button-submit"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Submit Signed Document
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
