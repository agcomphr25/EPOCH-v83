import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle, Signature } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SignatureCanvas from 'react-signature-canvas';
import type { OnboardingDoc } from '@shared/schema';

interface OnboardingDocsProps {
  employeeId: string;
}

export default function OnboardingDocs({ employeeId }: OnboardingDocsProps) {
  const [signingDoc, setSigningDoc] = useState<OnboardingDoc | null>(null);
  const sigPadRef = useRef<SignatureCanvas | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch onboarding documents
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['/api/onboarding-docs', employeeId],
    queryFn: async () => {
      const response = await fetch(`/api/onboarding-docs?employeeId=${employeeId}`);
      if (!response.ok) throw new Error('Failed to fetch onboarding documents');
      return response.json() as Promise<OnboardingDoc[]>;
    }
  });

  const openSignModal = (doc: OnboardingDoc) => {
    setSigningDoc(doc);
  };

  const saveSignature = async () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      toast({ title: 'Please provide a signature', variant: 'destructive' });
      return;
    }
    
    if (!signingDoc) return;

    const dataURL = sigPadRef.current.getTrimmedCanvas().toDataURL('image/png');
    
    try {
      const response = await fetch(`/api/onboarding-docs/${signingDoc.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureDataURL: dataURL,
        }),
      });

      if (!response.ok) throw new Error('Failed to save signature');

      // Invalidate and refetch the docs
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding-docs', employeeId] });
      
      toast({ title: 'Document signed successfully!' });
      setSigningDoc(null);
      if (sigPadRef.current) sigPadRef.current.clear();
    } catch (error) {
      toast({ title: 'Failed to save signature', variant: 'destructive' });
    }
  };

  const closeModal = () => {
    setSigningDoc(null);
    if (sigPadRef.current) sigPadRef.current.clear();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Onboarding Documents
        </CardTitle>
        <CardDescription>
          Review and sign required onboarding documents
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No onboarding documents found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-500" />
                  <div>
                    <h3 className="font-medium">{doc.title}</h3>
                    {doc.signed && doc.signedAt && (
                      <p className="text-sm text-gray-500">
                        Signed on {new Date(doc.signedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {doc.signed ? (
                    <>
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Signed
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(doc.url, '_blank')}
                      >
                        View PDF
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => openSignModal(doc)}
                      className="bg-blue-500 hover:bg-blue-600"
                    >
                      <Signature className="h-4 w-4 mr-2" />
                      Sign
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Signature Modal */}
        <Dialog open={!!signingDoc} onOpenChange={closeModal}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Sign Document: {signingDoc?.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Please sign in the canvas below to acknowledge that you have read and understood this document.
              </p>
              
              <div className="border rounded-lg p-4 bg-gray-50">
                <SignatureCanvas
                  penColor="black"
                  canvasProps={{
                    className: 'w-full h-48 bg-white border rounded',
                  }}
                  ref={sigPadRef}
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => sigPadRef.current?.clear()}
                  variant="outline"
                >
                  Clear
                </Button>
                <Button onClick={saveSignature} className="bg-green-500 hover:bg-green-600">
                  Save Signature
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}