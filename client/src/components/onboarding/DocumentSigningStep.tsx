import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, Check, ChevronLeft, ChevronRight, 
  Loader2, SkipForward, Clock, Pen, Type, 
  CheckCircle2, ArrowRight, X
} from 'lucide-react';

interface SessionDocument {
  id: string;
  templateId: string;
  templateName?: string;
  status: 'pending' | 'signed' | 'skipped' | 'deferred';
  signedAt?: string;
  isRequired?: boolean;
  sortOrder?: number;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(3);
  const [pageInitials, setPageInitials] = useState<PageInitials>({});
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [agreedToSign, setAgreedToSign] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasData, setCanvasData] = useState<string | null>(null);

  const pendingDocs = documents.filter(d => d.status === 'pending');
  const currentDoc = pendingDocs[currentDocIndex];
  const completedCount = documents.filter(d => d.status === 'signed').length;
  const skippedCount = documents.filter(d => d.status === 'skipped' || d.status === 'deferred').length;

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
    setCurrentPage(1);
    setPageInitials({});
    setTypedSignature('');
    setAgreedToSign(false);
    setCanvasData(null);
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
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
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
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    
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
    if (canvas && signatureMode === 'draw') {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [signatureMode]);

  const handleInitialsChange = (page: number, initials: string) => {
    setPageInitials(prev => ({ ...prev, [page]: initials.toUpperCase().slice(0, 3) }));
  };

  const isPageInitialed = (page: number) => {
    return pageInitials[page] && pageInitials[page].length >= 2;
  };

  const allPagesInitialed = () => {
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
        <p className="text-gray-600 mb-6">
          {completedCount} document{completedCount !== 1 ? 's' : ''} signed
          {skippedCount > 0 && `, ${skippedCount} skipped/deferred`}
        </p>
        <Button onClick={onAllDocumentsComplete} size="lg" className="h-14 px-8">
          Continue to Next Step
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
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

  const isFinalPage = currentPage === totalPages;

  return (
    <div className="flex flex-col h-full min-h-[70vh]">
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-600">
            Document {currentDocIndex + 1} of {pendingDocs.length}
          </span>
          <div className="flex gap-1">
            {pendingDocs.map((_, idx) => (
              <div
                key={idx}
                className={`w-8 h-2 rounded-full ${
                  idx < currentDocIndex ? 'bg-green-500' :
                  idx === currentDocIndex ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
        
        <h2 className="text-lg font-semibold hidden md:block">
          {currentDoc.templateName || `Document ${currentDocIndex + 1}`}
        </h2>

        {!isReadOnly && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => skipDocMutation.mutate({ docId: currentDoc.id, action: 'defer' })}
              disabled={skipDocMutation.isPending}
              className="text-gray-500"
            >
              <Clock className="h-4 w-4 mr-1" />
              Defer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => skipDocMutation.mutate({ docId: currentDoc.id, action: 'skip' })}
              disabled={skipDocMutation.isPending}
              className="text-gray-500"
            >
              <SkipForward className="h-4 w-4 mr-1" />
              Skip
            </Button>
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold px-4 py-2 md:hidden border-b">
        {currentDoc.templateName || `Document ${currentDocIndex + 1}`}
      </h2>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-20 md:w-24 bg-gray-50 border-r overflow-y-auto flex-shrink-0">
          <div className="p-2 space-y-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-full aspect-[3/4] rounded border-2 flex flex-col items-center justify-center text-xs transition-all ${
                  currentPage === page 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <span className="font-medium">{page}</span>
                {page < totalPages && isPageInitialed(page) && (
                  <Check className="h-3 w-3 text-green-500 mt-1" />
                )}
                {page === totalPages && hasValidSignature() && (
                  <Pen className="h-3 w-3 text-green-500 mt-1" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
          <Card className="max-w-3xl mx-auto shadow-lg">
            <CardContent className="p-6 md:p-8">
              <div className="bg-gray-50 border rounded-lg min-h-[400px] md:min-h-[500px] flex items-center justify-center mb-6">
                <div className="text-center text-gray-400">
                  <FileText className="h-16 w-16 mx-auto mb-4" />
                  <p className="text-lg">PDF Page {currentPage}</p>
                  <p className="text-sm mt-1">Document preview placeholder</p>
                </div>
              </div>

              {!isFinalPage ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <Label className="text-base font-medium text-amber-800 mb-3 block">
                    Initial this page to continue
                  </Label>
                  <div className="flex items-center gap-4">
                    <Input
                      value={pageInitials[currentPage] || ''}
                      onChange={(e) => handleInitialsChange(currentPage, e.target.value)}
                      placeholder="ABC"
                      maxLength={3}
                      className="w-24 h-14 text-center text-2xl font-bold uppercase bg-white"
                      disabled={isReadOnly}
                    />
                    {isPageInitialed(currentPage) && (
                      <div className="flex items-center gap-2 text-green-600">
                        <Check className="h-5 w-5" />
                        <span className="text-sm font-medium">Page initialed</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-between mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(prev => prev - 1)}
                      disabled={currentPage === 1}
                      className="h-12"
                    >
                      <ChevronLeft className="h-5 w-5 mr-1" />
                      Previous
                    </Button>
                    <Button
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      disabled={!isPageInitialed(currentPage)}
                      className="h-12"
                    >
                      Next Page
                      <ChevronRight className="h-5 w-5 ml-1" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {!allPagesInitialed() && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                      <p className="text-amber-800">
                        Please initial all previous pages before signing.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          for (let i = 1; i < totalPages; i++) {
                            if (!isPageInitialed(i)) {
                              setCurrentPage(i);
                              break;
                            }
                          }
                        }}
                      >
                        Go to first unsigned page
                      </Button>
                    </div>
                  )}

                  <div className="border-t pt-6">
                    <div className="flex items-start gap-3 mb-6">
                      <Checkbox
                        id="agree-sign"
                        checked={agreedToSign}
                        onCheckedChange={(checked) => setAgreedToSign(checked === true)}
                        disabled={isReadOnly}
                        className="mt-1 h-6 w-6"
                      />
                      <Label htmlFor="agree-sign" className="text-base leading-relaxed cursor-pointer">
                        I agree to sign this document electronically. I understand this signature 
                        is legally binding and has the same effect as a handwritten signature.
                      </Label>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Label className="text-base font-medium">Signature</Label>
                        <div className="flex rounded-lg border overflow-hidden ml-auto">
                          <button
                            onClick={() => setSignatureMode('draw')}
                            className={`px-4 py-2 text-sm flex items-center gap-1 ${
                              signatureMode === 'draw' 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-50 text-gray-600'
                            }`}
                          >
                            <Pen className="h-4 w-4" />
                            Draw
                          </button>
                          <button
                            onClick={() => setSignatureMode('type')}
                            className={`px-4 py-2 text-sm flex items-center gap-1 ${
                              signatureMode === 'type' 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-50 text-gray-600'
                            }`}
                          >
                            <Type className="h-4 w-4" />
                            Type
                          </button>
                        </div>
                      </div>

                      {signatureMode === 'draw' ? (
                        <div className="relative">
                          <canvas
                            ref={canvasRef}
                            width={600}
                            height={150}
                            className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-white touch-none"
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
                              className="absolute top-2 right-2"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Clear
                            </Button>
                          )}
                          {!canvasData && (
                            <p className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none">
                              Sign here with finger or stylus
                            </p>
                          )}
                        </div>
                      ) : (
                        <Input
                          value={typedSignature}
                          onChange={(e) => setTypedSignature(e.target.value)}
                          placeholder="Type your full name"
                          className="h-16 text-2xl italic font-serif"
                          disabled={isReadOnly}
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                      <div>
                        <Label className="text-sm text-gray-500">Date</Label>
                        <p className="text-lg font-medium">
                          {new Date().toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(totalPages - 1)}
                        className="h-14"
                      >
                        <ChevronLeft className="h-5 w-5 mr-1" />
                        Previous
                      </Button>
                      <Button
                        onClick={handleCompleteDocument}
                        disabled={!canCompleteDocument() || signDocMutation.isPending || isReadOnly}
                        className="flex-1 h-14 text-lg bg-green-600 hover:bg-green-700"
                      >
                        {signDocMutation.isPending ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Signing...
                          </>
                        ) : (
                          <>
                            <Check className="h-5 w-5 mr-2" />
                            Complete Document
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="bg-gray-50 border-t px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-gray-600">{completedCount} signed</span>
            </div>
            {skippedCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span className="text-sm text-gray-600">{skippedCount} skipped</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
