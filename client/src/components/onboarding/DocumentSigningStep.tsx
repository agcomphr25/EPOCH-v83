import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, Check, 
  Loader2, SkipForward, Clock, Pen, Type, 
  CheckCircle2, ArrowRight, X, AlertCircle
} from 'lucide-react';

interface SessionDocument {
  id: string;
  templateId: string;
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

type SignatureMode = 'draw' | 'type';

export default function DocumentSigningStep({
  sessionId,
  documents,
  isReadOnly = false,
  onAllDocumentsComplete,
}: DocumentSigningStepProps) {
  const { toast } = useToast();
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [pageInitials, setPageInitials] = useState<PageInitials>({});
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [agreedToSign, setAgreedToSign] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [showSigningPanel, setShowSigningPanel] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasData, setCanvasData] = useState<string | null>(null);

  const pendingDocs = documents.filter(d => d.status === 'pending');
  const currentDoc = pendingDocs[currentDocIndex];
  const completedCount = documents.filter(d => d.status === 'signed').length;
  const skippedCount = documents.filter(d => d.status === 'skipped' || d.status === 'deferred').length;
  
  const totalPages = currentDoc?.pageCount || 1;

  const pdfUrl = currentDoc?.templateId 
    ? `/api/fillable-pdf-templates/${currentDoc.templateId}/pdf` 
    : null;

  const signDocMutation = useMutation({
    mutationFn: async ({ docId, signatureData }: { docId: string; signatureData: string }) => {
      return apiRequest(`/api/onboarding/sessions/${sessionId}/documents/${docId}/sign`, {
        method: 'POST',
        body: JSON.stringify({ 
          signatureData,
          initials: pageInitials,
          signedAt: new Date().toISOString(),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/sessions', sessionId] });
      setJustCompleted(true);
      resetDocumentState();
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
      toast({ title: action === 'skip' ? 'Document skipped' : 'Document deferred' });
      handleNextDocument();
    },
  });

  const resetDocumentState = () => {
    setPageInitials({});
    setTypedSignature('');
    setAgreedToSign(false);
    setCanvasData(null);
    setShowSigningPanel(false);
    clearCanvas();
  };

  const handleNextDocument = () => {
    setJustCompleted(false);
    if (currentDocIndex < pendingDocs.length - 1) {
      setCurrentDocIndex(prev => prev + 1);
      resetDocumentState();
    } else {
      onAllDocumentsComplete?.();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    setCanvasData(null);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = 'touches' in e ? (e.touches[0].clientX - rect.left) * scaleX : (e.clientX - rect.left) * scaleX;
    const y = 'touches' in e ? (e.touches[0].clientY - rect.top) * scaleY : (e.clientY - rect.top) * scaleY;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = 'touches' in e ? (e.touches[0].clientX - rect.left) * scaleX : (e.clientX - rect.left) * scaleX;
    const y = 'touches' in e ? (e.touches[0].clientY - rect.top) * scaleY : (e.clientY - rect.top) * scaleY;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      const canvas = canvasRef.current;
      if (canvas) {
        setCanvasData(canvas.toDataURL());
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && signatureMode === 'draw' && showSigningPanel) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [signatureMode, showSigningPanel]);

  const handleInitialsChange = (page: number, initials: string) => {
    setPageInitials(prev => ({ ...prev, [page]: initials.toUpperCase().slice(0, 3) }));
  };

  const isPageInitialed = (page: number) => {
    return pageInitials[page] && pageInitials[page].length >= 2;
  };

  const allPagesInitialed = () => {
    if (totalPages <= 1) return true;
    for (let i = 1; i < totalPages; i++) {
      if (!isPageInitialed(i)) return false;
    }
    return true;
  };

  const hasValidSignature = () => {
    if (signatureMode === 'draw') {
      return canvasData !== null;
    }
    return typedSignature.trim().length >= 2;
  };

  const canCompleteDocument = () => {
    return allPagesInitialed() && hasValidSignature() && agreedToSign;
  };

  const handleCompleteDocument = () => {
    if (!currentDoc || !canCompleteDocument()) return;
    
    const signatureData = signatureMode === 'draw' 
      ? canvasData || '' 
      : `typed:${typedSignature}`;
    
    signDocMutation.mutate({ docId: currentDoc.id, signatureData });
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
        <p className="text-lg text-gray-500">No documents to sign for this session.</p>
      </div>
    );
  }

  if (pendingDocs.length === 0 || !currentDoc) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
        <p className="text-xl font-medium text-green-800 mb-2">All Documents Complete</p>
        <p className="text-gray-600">
          {completedCount} document{completedCount !== 1 ? 's' : ''} signed
          {skippedCount > 0 && `, ${skippedCount} skipped/deferred`}
        </p>
      </div>
    );
  }

  if (justCompleted) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <p className="text-xl font-medium text-green-800 mb-2">Document Completed</p>
        <p className="text-gray-600 mb-8">
          {currentDoc.templateName || `Document ${currentDocIndex + 1}`} has been signed.
        </p>
        <Button onClick={handleNextDocument} size="lg" className="h-14 px-8">
          Continue to Next Document
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 200px)' }}>
      <div className="absolute top-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-b shadow-sm px-4 py-3">
        <div className="flex items-center justify-between max-w-full">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
              {currentDocIndex + 1} / {pendingDocs.length}
            </span>
            <div className="flex gap-1">
              {pendingDocs.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-6 h-1.5 rounded-full transition-colors ${
                    idx < currentDocIndex ? 'bg-green-500' :
                    idx === currentDocIndex ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>
          
          <h2 className="text-base font-semibold truncate max-w-[40%] hidden sm:block">
            {currentDoc.templateName || `Document ${currentDocIndex + 1}`}
          </h2>

          {!isReadOnly && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => skipDocMutation.mutate({ docId: currentDoc.id, action: 'defer' })}
                disabled={skipDocMutation.isPending}
                className="text-gray-500 h-9 px-3"
              >
                <Clock className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Defer</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => skipDocMutation.mutate({ docId: currentDoc.id, action: 'skip' })}
                disabled={skipDocMutation.isPending}
                className="text-gray-500 h-9 px-3"
              >
                <SkipForward className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Skip</span>
              </Button>
            </div>
          )}
        </div>
        <h2 className="text-base font-semibold truncate sm:hidden mt-2">
          {currentDoc.templateName || `Document ${currentDocIndex + 1}`}
        </h2>
      </div>

      <div className="flex-1 pt-16 sm:pt-14 pb-0 bg-gray-50">
        {pdfUrl ? (
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            style={{ minHeight: 'calc(100vh - 350px)' }}
            title={currentDoc.templateName || 'Document'}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <div className="text-center text-gray-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-3" />
              <p className="text-lg font-medium">Document Not Available</p>
              <p className="text-sm mt-1">Unable to load the PDF document</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border-t shadow-lg">
        {!showSigningPanel ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-gray-600">
                {completedCount > 0 && (
                  <span className="inline-flex items-center gap-1 mr-4">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    {completedCount} signed
                  </span>
                )}
                {totalPages > 1 && (
                  <span className="text-gray-500">{totalPages} pages</span>
                )}
              </div>
            </div>
            
            {totalPages > 1 && !allPagesInitialed() && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                <p className="text-sm text-amber-800 font-medium mb-2">
                  Initial each page before signing
                </p>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: totalPages - 1 }, (_, i) => i + 1).map(page => (
                    <div key={page} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Page {page}:</span>
                      <Input
                        value={pageInitials[page] || ''}
                        onChange={(e) => handleInitialsChange(page, e.target.value)}
                        placeholder="ABC"
                        maxLength={3}
                        className="w-16 h-10 text-center text-sm font-bold uppercase"
                        disabled={isReadOnly}
                      />
                      {isPageInitialed(page) && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={() => setShowSigningPanel(true)}
              disabled={!allPagesInitialed()}
              size="lg"
              className="w-full h-14 text-lg"
            >
              <Pen className="h-5 w-5 mr-2" />
              {allPagesInitialed() ? 'Ready to Sign' : 'Initial All Pages First'}
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">Sign Document</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSigningPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-start gap-3 bg-gray-50 p-3 rounded-lg">
              <Checkbox
                id="agree-sign"
                checked={agreedToSign}
                onCheckedChange={(checked) => setAgreedToSign(checked === true)}
                disabled={isReadOnly}
                className="mt-0.5 h-5 w-5"
              />
              <Label htmlFor="agree-sign" className="text-sm leading-relaxed cursor-pointer">
                I agree to sign this document electronically. I understand this signature 
                is legally binding.
              </Label>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label className="text-sm font-medium">Signature</Label>
                <div className="flex rounded-md border overflow-hidden ml-auto">
                  <button
                    type="button"
                    onClick={() => setSignatureMode('draw')}
                    className={`px-3 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                      signatureMode === 'draw' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    <Pen className="h-3 w-3" />
                    Draw
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureMode('type')}
                    className={`px-3 py-1.5 text-xs flex items-center gap-1 transition-colors ${
                      signatureMode === 'type' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    <Type className="h-3 w-3" />
                    Type
                  </button>
                </div>
              </div>

              {signatureMode === 'draw' ? (
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={120}
                    className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-white touch-none"
                    style={{ height: '100px' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {canvasData && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCanvas}
                      className="absolute top-1 right-1 h-7 px-2"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  )}
                  {!canvasData && (
                    <p className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none text-sm">
                      Sign here with finger or stylus
                    </p>
                  )}
                </div>
              ) : (
                <Input
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  placeholder="Type your full name"
                  className="h-12 text-xl italic font-serif"
                  disabled={isReadOnly}
                />
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowSigningPanel(false)}
                className="h-12 flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCompleteDocument}
                disabled={!canCompleteDocument() || signDocMutation.isPending || isReadOnly}
                className="h-12 flex-[2] bg-green-600 hover:bg-green-700 text-base"
              >
                {signDocMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Complete & Sign
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
