import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, Check, Loader2, Pen,
  CheckCircle2, ArrowRight, Clock, SkipForward, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ImmersiveDocumentSigner from './ImmersiveDocumentSigner';

interface SessionDocument {
  id: string;
  templateId: string | null;
  instanceId: string | null;
  mediaItemId: string | null;
  isFillable: boolean;
  templateName?: string;
  status: 'pending' | 'signed' | 'skipped' | 'deferred';
  signedAt?: string | null;
  isRequired?: boolean;
  sortOrder?: number;
  pageCount?: number;
}

interface DocumentSigningStepProps {
  sessionId: string;
  documents: SessionDocument[];
  isReadOnly?: boolean;
  onAllDocumentsComplete?: () => void;
}

interface PageInitials {
  [pageNumber: number]: string;
}

export default function DocumentSigningStep({
  sessionId,
  documents,
  isReadOnly = false,
  onAllDocumentsComplete,
}: DocumentSigningStepProps) {
  const { toast } = useToast();
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [justCompletedDocId, setJustCompletedDocId] = useState<string | null>(null);

  const pendingDocs = documents.filter(d => d.status === 'pending');
  const completedDocs = documents.filter(d => d.status === 'signed');
  const skippedDocs = documents.filter(d => d.status === 'skipped' || d.status === 'deferred');

  const activeDocIndex = pendingDocs.findIndex(d => d.id === activeDocId);
  const activeDoc = activeDocIndex >= 0 ? pendingDocs[activeDocIndex] : null;

  const pdfUrl = activeDoc 
    ? `/api/onboarding/sessions/${sessionId}/documents/${activeDoc.id}/pdf` 
    : null;

  const signDocMutation = useMutation({
    mutationFn: async ({ 
      docId, 
      signatureData, 
      initials 
    }: { 
      docId: string; 
      signatureData: string; 
      initials: PageInitials;
    }) => {
      return apiRequest(`/api/onboarding/sessions/${sessionId}/documents/${docId}/sign`, {
        method: 'POST',
        body: JSON.stringify({ 
          signatureData,
          initials,
          signedAt: new Date().toISOString(),
        }),
      });
    },
    onSuccess: (_, { docId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', sessionId] });
      setActiveDocId(null);
      setJustCompletedDocId(docId);
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to sign document',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const skipDocMutation = useMutation({
    mutationFn: async ({ docId, action }: { docId: string; action: 'skip' | 'defer' }) => {
      return apiRequest(`/api/onboarding/sessions/${sessionId}/documents/${docId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: action === 'skip' ? 'skipped' : 'deferred' }),
      });
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', sessionId] });
      setActiveDocId(null);
      toast({ 
        title: action === 'skip' ? 'Document skipped' : 'Document deferred',
        description: 'You can proceed with the remaining documents.'
      });
    },
  });

  useEffect(() => {
    if (pendingDocs.length === 0 && documents.length > 0 && completedDocs.length > 0) {
      onAllDocumentsComplete?.();
    }
  }, [pendingDocs.length, documents.length, completedDocs.length, onAllDocumentsComplete]);

  const handleSign = (signatureData: string, initials: PageInitials) => {
    if (!activeDoc) return;
    signDocMutation.mutate({ docId: activeDoc.id, signatureData, initials });
  };

  const handleSkip = () => {
    if (!activeDoc) return;
    skipDocMutation.mutate({ docId: activeDoc.id, action: 'skip' });
  };

  const handleDefer = () => {
    if (!activeDoc) return;
    skipDocMutation.mutate({ docId: activeDoc.id, action: 'defer' });
  };

  const handleCloseImmersive = () => {
    setActiveDocId(null);
  };

  const handleContinueToNext = () => {
    setJustCompletedDocId(null);
    if (pendingDocs.length > 0) {
      setActiveDocId(pendingDocs[0].id);
    }
  };

  const startSigningFlow = () => {
    if (pendingDocs.length > 0) {
      setActiveDocId(pendingDocs[0].id);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <p className="text-lg text-gray-500">No documents to sign for this session.</p>
      </div>
    );
  }

  if (justCompletedDocId) {
    const completedDoc = documents.find(d => d.id === justCompletedDocId);
    const hasMorePending = pendingDocs.length > 0;

    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <p className="text-xl font-medium text-green-800 mb-2">Document Signed</p>
        <p className="text-gray-600 mb-8">
          {completedDoc?.templateName || 'Document'} has been signed successfully.
        </p>
        {hasMorePending ? (
          <Button onClick={handleContinueToNext} size="lg" className="h-14 px-8">
            Continue to Next Document
            <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        ) : (
          <div>
            <p className="text-green-600 font-medium mb-4">All documents have been completed!</p>
            <Button onClick={() => setJustCompletedDocId(null)} variant="outline">
              View Summary
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (pendingDocs.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
        <p className="text-xl font-medium text-green-800 mb-2">All Documents Complete</p>
        <p className="text-gray-600 mb-6">
          {completedDocs.length} document{completedDocs.length !== 1 ? 's' : ''} signed
          {skippedDocs.length > 0 && `, ${skippedDocs.length} skipped/deferred`}
        </p>

        <div className="max-w-md mx-auto space-y-2">
          {documents.map((doc) => (
            <div 
              key={doc.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                doc.status === 'signed' ? "bg-green-50 border-green-200" :
                doc.status === 'skipped' ? "bg-gray-50 border-gray-200" :
                "bg-amber-50 border-amber-200"
              )}
            >
              <div className="flex items-center gap-3">
                {doc.status === 'signed' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : doc.status === 'skipped' ? (
                  <SkipForward className="w-5 h-5 text-gray-400" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-500" />
                )}
                <span className="text-sm font-medium">
                  {doc.templateName || 'Document'}
                </span>
              </div>
              <span className="text-xs text-gray-500 capitalize">
                {doc.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeDoc && pdfUrl) {
    return (
      <ImmersiveDocumentSigner
        pdfUrl={pdfUrl}
        documentName={activeDoc.templateName || `Document ${activeDocIndex + 1}`}
        documentIndex={activeDocIndex}
        totalDocuments={pendingDocs.length}
        pageCount={activeDoc.pageCount || 1}
        isReadOnly={isReadOnly}
        onSign={handleSign}
        onSkip={handleSkip}
        onDefer={handleDefer}
        onClose={handleCloseImmersive}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Documents Ready for Signing
        </h3>
        <p className="text-gray-600 text-sm">
          {pendingDocs.length} document{pendingDocs.length !== 1 ? 's' : ''} require your signature
          {completedDocs.length > 0 && ` (${completedDocs.length} already completed)`}
        </p>
      </div>

      <div className="space-y-3">
        {documents.map((doc, idx) => {
          const isPending = doc.status === 'pending';
          const isSigned = doc.status === 'signed';
          const isSkipped = doc.status === 'skipped' || doc.status === 'deferred';

          return (
            <div
              key={doc.id}
              className={cn(
                "flex items-center justify-between p-4 rounded-xl border transition-all",
                isPending ? "bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm" :
                isSigned ? "bg-green-50 border-green-200" :
                "bg-gray-50 border-gray-200"
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  isPending ? "bg-blue-100" :
                  isSigned ? "bg-green-100" :
                  "bg-gray-100"
                )}>
                  {isSigned ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : isSkipped ? (
                    <SkipForward className="w-5 h-5 text-gray-400" />
                  ) : (
                    <FileText className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <p className={cn(
                    "font-medium",
                    isPending ? "text-gray-900" : "text-gray-600"
                  )}>
                    {doc.templateName || `Document ${idx + 1}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {doc.pageCount && doc.pageCount > 1 
                      ? `${doc.pageCount} pages` 
                      : '1 page'}
                    {doc.isRequired && <span className="ml-2 text-red-500">Required</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isSigned && (
                  <span className="text-sm text-green-600 font-medium">Signed</span>
                )}
                {isSkipped && (
                  <span className="text-sm text-gray-500 capitalize">{doc.status}</span>
                )}
                {isPending && !isReadOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveDocId(doc.id)}
                  >
                    Review & Sign
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isReadOnly && pendingDocs.length > 0 && (
        <div className="pt-4 border-t">
          <Button
            onClick={startSigningFlow}
            size="lg"
            className="w-full h-14 text-lg"
          >
            <Pen className="w-5 h-5 mr-2" />
            Begin Signing ({pendingDocs.length} document{pendingDocs.length !== 1 ? 's' : ''})
          </Button>
        </div>
      )}

      {signDocMutation.isPending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 flex flex-col items-center">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
            <p className="text-gray-900 font-medium">Applying signature...</p>
          </div>
        </div>
      )}
    </div>
  );
}
