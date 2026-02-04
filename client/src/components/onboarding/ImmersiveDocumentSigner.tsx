import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  X, Loader2, Check, Pen, Type, ChevronDown, ChevronUp,
  FileText, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PageInitials {
  [pageNumber: number]: string;
}

interface ImmersiveDocumentSignerProps {
  pdfUrl: string;
  documentName: string;
  documentIndex: number;
  totalDocuments: number;
  pageCount: number;
  isReadOnly?: boolean;
  onSign: (signatureData: string, initials: PageInitials) => void;
  onSkip: () => void;
  onDefer: () => void;
  onClose: () => void;
}

type SignatureMode = 'draw' | 'type';

export default function ImmersiveDocumentSigner({
  pdfUrl,
  documentName,
  documentIndex,
  totalDocuments,
  pageCount,
  isReadOnly = false,
  onSign,
  onSkip,
  onDefer,
  onClose,
}: ImmersiveDocumentSignerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1);
  const [pageInitials, setPageInitials] = useState<PageInitials>({});
  const [initialsPromptPage, setInitialsPromptPage] = useState<number | null>(null);
  
  const [showSignaturePanel, setShowSignaturePanel] = useState(false);
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [agreedToSign, setAgreedToSign] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);

  const totalPages = pageCount || 1;
  const requiresInitials = totalPages > 1;
  const [containerWidth, setContainerWidth] = useState(800);

  const [pendingRerender, setPendingRerender] = useState(false);

  useEffect(() => {
    if (!pagesContainerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (Math.abs(newWidth - containerWidth) > 20) {
          setContainerWidth(newWidth);
          setRenderedPages(new Set());
          setPendingRerender(true);
        }
      }
    });
    
    observer.observe(pagesContainerRef.current);
    return () => observer.disconnect();
  }, [containerWidth]);

  const loadPdf = useCallback(async () => {
    if (!pdfUrl) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      canvasRefs.current = new Array(pdf.numPages).fill(null);
    } catch (err) {
      console.error('[ImmersiveDocumentSigner] Error loading PDF:', err);
      setError('Unable to load the document. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [pdfUrl]);

  useEffect(() => {
    loadPdf();
  }, [loadPdf]);

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || renderedPages.has(pageNum)) return;
    
    const canvas = canvasRefs.current[pageNum - 1];
    if (!canvas) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const context = canvas.getContext('2d');
      if (!context) return;

      const currentContainerWidth = containerWidth || 800;
      const maxWidth = Math.min(currentContainerWidth - 80, 900);
      const viewport = page.getViewport({ scale: 1 });
      const scale = maxWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;

      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
        canvas: canvas,
      } as any).promise;

      setRenderedPages(prev => {
        const newSet = new Set(prev);
        newSet.add(pageNum);
        return newSet;
      });
    } catch (err) {
      console.error(`[ImmersiveDocumentSigner] Error rendering page ${pageNum}:`, err);
    }
  }, [pdfDoc, renderedPages, containerWidth]);

  useEffect(() => {
    if (!pdfDoc) return;
    
    for (let i = 1; i <= Math.min(3, pdfDoc.numPages); i++) {
      renderPage(i);
    }
  }, [pdfDoc, renderPage]);

  useEffect(() => {
    if (!pendingRerender || !pdfDoc) return;
    
    const pagesToRender = [
      currentVisiblePage - 1,
      currentVisiblePage,
      currentVisiblePage + 1
    ].filter(p => p >= 1 && p <= pdfDoc.numPages);
    
    pagesToRender.forEach(p => renderPage(p));
    setPendingRerender(false);
  }, [pendingRerender, currentVisiblePage, pdfDoc, renderPage]);

  const handleScroll = useCallback(() => {
    if (!pagesContainerRef.current || !pdfDoc) return;

    const container = pagesContainerRef.current;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;

    let visiblePage = 1;
    let accumulatedHeight = 0;

    for (let i = 0; i < canvasRefs.current.length; i++) {
      const canvas = canvasRefs.current[i];
      if (!canvas) continue;

      const pageHeight = canvas.height + 24;
      if (scrollTop < accumulatedHeight + pageHeight * 0.5) {
        visiblePage = i + 1;
        break;
      }
      accumulatedHeight += pageHeight;
      visiblePage = i + 2;
    }

    visiblePage = Math.min(visiblePage, pdfDoc.numPages);
    setCurrentVisiblePage(visiblePage);

    for (let i = visiblePage - 1; i <= visiblePage + 2 && i <= pdfDoc.numPages; i++) {
      if (i > 0) renderPage(i);
    }
  }, [pdfDoc, renderPage]);

  useEffect(() => {
    const container = pagesContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleInitialsSubmit = (page: number, initials: string) => {
    if (initials.trim().length >= 2) {
      setPageInitials(prev => ({ ...prev, [page]: initials.toUpperCase() }));
      setInitialsPromptPage(null);
    }
  };

  const allPagesInitialed = () => {
    if (!requiresInitials) return true;
    for (let i = 1; i < totalPages; i++) {
      if (!pageInitials[i] || pageInitials[i].length < 2) return false;
    }
    return true;
  };

  const initializeSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  useEffect(() => {
    if (showSignaturePanel && signatureMode === 'draw') {
      initializeSignatureCanvas();
    }
  }, [showSignaturePanel, signatureMode, initializeSignatureCanvas]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.beginPath();
    ctx.moveTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;
    if ('touches' in e) {
      e.preventDefault();
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    ctx.lineTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    ctx.stroke();
    setHasDrawnSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    initializeSignatureCanvas();
    setHasDrawnSignature(false);
  };

  const getSignatureData = (): string | null => {
    if (signatureMode === 'type') {
      return typedSignature.trim() || null;
    } else {
      const canvas = signatureCanvasRef.current;
      if (!canvas || !hasDrawnSignature) return null;
      return canvas.toDataURL('image/png');
    }
  };

  const canSign = () => {
    if (!agreedToSign) return false;
    if (!allPagesInitialed()) return false;
    if (signatureMode === 'type') {
      return typedSignature.trim().length >= 2;
    } else {
      return hasDrawnSignature;
    }
  };

  const handleSign = () => {
    const signatureData = getSignatureData();
    if (signatureData) {
      onSign(signatureData, pageInitials);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSignaturePanel) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showSignaturePanel]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Unable to Load Document</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <Button variant="outline" onClick={onClose}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-slate-50 flex flex-col">
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close document"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
            <div>
              <h1 className="font-medium text-slate-900 text-sm sm:text-base truncate max-w-[200px] sm:max-w-none">
                {documentName}
              </h1>
              <p className="text-xs text-slate-500">
                Document {documentIndex + 1} of {totalDocuments}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500">
              <span>Page {currentVisiblePage} of {totalPages}</span>
              <div className="flex gap-0.5">
                {Array.from({ length: totalPages }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      i + 1 === currentVisiblePage ? "bg-blue-500" : 
                      i + 1 < currentVisiblePage ? "bg-green-400" : "bg-slate-200"
                    )}
                  />
                ))}
              </div>
            </div>

            {!isReadOnly && (
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDefer}
                  className="text-slate-500 text-xs"
                >
                  Defer
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSkip}
                  className="text-slate-500 text-xs"
                >
                  Skip
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div 
        ref={pagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-8"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="max-w-5xl mx-auto space-y-6">
          {pdfDoc && Array.from({ length: pdfDoc.numPages }, (_, i) => {
            const pageNum = i + 1;
            const isInitialed = pageInitials[pageNum];
            const showInitialsBadge = requiresInitials && pageNum < totalPages;
            
            return (
              <div key={pageNum} className="relative">
                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                  <canvas
                    ref={el => canvasRefs.current[i] = el}
                    className="block mx-auto"
                  />
                </div>
                
                {showInitialsBadge && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2">
                    {isInitialed ? (
                      <button
                        onClick={() => setInitialsPromptPage(pageNum)}
                        className="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 flex items-center gap-2 hover:bg-green-100 transition-colors"
                      >
                        <Check className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-700">
                          {pageInitials[pageNum]}
                        </span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setInitialsPromptPage(pageNum)}
                        className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100 transition-colors flex items-center gap-2"
                      >
                        <Pen className="w-3 h-3 text-amber-700" />
                        <span className="text-xs font-medium text-amber-700">Add Initials</span>
                      </button>
                    )}
                  </div>
                )}

                <div className="text-center mt-2 text-xs text-slate-400">
                  Page {pageNum} of {totalPages}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {initialsPromptPage !== null && !pageInitials[initialsPromptPage] && (
        <div className="fixed inset-x-0 bottom-24 flex justify-center z-40 px-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-4 max-w-sm w-full animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-slate-900">
                Initial Page {initialsPromptPage}
              </h3>
              <button
                onClick={() => setInitialsPromptPage(null)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              Please provide your initials to acknowledge you have reviewed this page.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="ABC"
                maxLength={4}
                className="flex-1 text-center font-semibold uppercase text-lg"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleInitialsSubmit(initialsPromptPage, (e.target as HTMLInputElement).value);
                  }
                }}
              />
              <Button
                onClick={(e) => {
                  const input = (e.currentTarget.previousSibling as HTMLInputElement);
                  handleInitialsSubmit(initialsPromptPage, input.value);
                }}
              >
                <Check className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <footer className="flex-shrink-0 bg-white border-t border-slate-200 shadow-lg">
        {!showSignaturePanel ? (
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-500">
                {requiresInitials && (
                  <span>
                    {Object.keys(pageInitials).length} of {totalPages - 1} pages initialed
                  </span>
                )}
              </div>
              <Button
                onClick={() => setShowSignaturePanel(true)}
                disabled={!allPagesInitialed() || isReadOnly}
                size="lg"
                className="px-8"
              >
                <Pen className="w-4 h-4 mr-2" />
                {allPagesInitialed() ? 'Sign Document' : 'Initial All Pages First'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-slate-900">Sign Document</h3>
              <button
                onClick={() => setShowSignaturePanel(false)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <ChevronDown className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
                <Checkbox
                  id="agree-sign"
                  checked={agreedToSign}
                  onCheckedChange={(checked) => setAgreedToSign(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="agree-sign" className="text-sm leading-relaxed cursor-pointer text-slate-700">
                  I acknowledge that I have reviewed this document in its entirety. I understand that 
                  my electronic signature is legally binding and has the same effect as a handwritten signature.
                </Label>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Label className="text-sm font-medium text-slate-700">Your Signature</Label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden ml-auto">
                    <button
                      type="button"
                      onClick={() => setSignatureMode('draw')}
                      className={cn(
                        "px-4 py-2 text-sm flex items-center gap-2 transition-colors",
                        signatureMode === 'draw' 
                          ? "bg-slate-900 text-white" 
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <Pen className="w-4 h-4" />
                      Draw
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignatureMode('type')}
                      className={cn(
                        "px-4 py-2 text-sm flex items-center gap-2 transition-colors",
                        signatureMode === 'type' 
                          ? "bg-slate-900 text-white" 
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <Type className="w-4 h-4" />
                      Type
                    </button>
                  </div>
                </div>

                {signatureMode === 'draw' ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <canvas
                        ref={signatureCanvasRef}
                        width={600}
                        height={120}
                        className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none cursor-crosshair"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                      />
                      {!hasDrawnSignature && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <p className="text-slate-400 text-sm">Sign here</p>
                        </div>
                      )}
                    </div>
                    {hasDrawnSignature && (
                      <Button variant="ghost" size="sm" onClick={clearSignature}>
                        Clear signature
                      </Button>
                    )}
                  </div>
                ) : (
                  <Input
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    placeholder="Type your full legal name"
                    className="text-lg h-14"
                    style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive" }}
                  />
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowSignaturePanel(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSign}
                  disabled={!canSign()}
                  size="lg"
                  className="px-8"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Apply Signature
                </Button>
              </div>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
