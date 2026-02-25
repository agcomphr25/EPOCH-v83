import { useState, useRef, useEffect, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, FileText, Eraser, Download, X, Move, ZoomIn, ZoomOut } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface NormalizedPosition {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

export default function PDFSignatureTool() {
  const { toast } = useToast();
  const signatureRef = useRef<SignatureCanvas>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const originalPdfBytesRef = useRef<Uint8Array | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfScale, setPdfScale] = useState(1);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const [normalizedPosition, setNormalizedPosition] = useState<NormalizedPosition>({
    xPercent: 0.1,
    yPercent: 0.7,
    widthPercent: 0.25,
    heightPercent: 0.1
  });
  
  const [signatureScale, setSignatureScale] = useState([100]);
  const [intrinsicDimensions, setIntrinsicDimensions] = useState({ width: 0, height: 0 });
  const [viewportDimensions, setViewportDimensions] = useState({ width: 0, height: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, xPercent: 0, yPercent: 0 });
  const renderIdRef = useRef(0);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const renderPdfPage = useCallback(async (pageNum: number) => {
    if (!pdfBytes || !canvasRef.current) return;
    
    const currentRenderId = ++renderIdRef.current;
    
    try {
      if (!pdfDocRef.current) {
        pdfDocRef.current = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
      }
      const pdf = pdfDocRef.current;
      
      if (currentRenderId !== renderIdRef.current) return;
      
      setTotalPages(pdf.numPages);
      
      const page = await pdf.getPage(pageNum);
      
      if (currentRenderId !== renderIdRef.current) return;
      
      const baseViewport = page.getViewport({ scale: 1 });
      setIntrinsicDimensions({ width: baseViewport.width, height: baseViewport.height });
      
      const viewport = page.getViewport({ scale: pdfScale });
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      setViewportDimensions({ width: viewport.width, height: viewport.height });
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
    } catch (error: unknown) {
      if (currentRenderId !== renderIdRef.current) return;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (!errorMessage.includes('cancelled')) {
        console.error('Error rendering PDF:', error);
        toast({
          title: 'Error',
          description: 'Failed to render PDF page',
          variant: 'destructive'
        });
      }
    }
  }, [pdfBytes, pdfScale, toast]);

  useEffect(() => {
    if (pdfBytes) {
      renderPdfPage(currentPage);
    }
  }, [pdfBytes, currentPage, pdfScale, renderPdfPage]);

  const getScreenPosition = useCallback(() => {
    return {
      x: normalizedPosition.xPercent * viewportDimensions.width,
      y: normalizedPosition.yPercent * viewportDimensions.height,
      width: normalizedPosition.widthPercent * viewportDimensions.width,
      height: normalizedPosition.heightPercent * viewportDimensions.height
    };
  }, [normalizedPosition, viewportDimensions]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setPdfFile(file);
    pdfDocRef.current = null;
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    originalPdfBytesRef.current = new Uint8Array(bytes);
    setPdfBytes(bytes);
    setCurrentPage(1);
    setSignatureImage(null);
    setSignatureEmpty(true);
    signatureRef.current?.clear();
    setNormalizedPosition({
      xPercent: 0.1,
      yPercent: 0.7,
      widthPercent: 0.25,
      heightPercent: 0.1
    });
  };

  const handleClearSignature = () => {
    signatureRef.current?.clear();
    setSignatureEmpty(true);
    setSignatureImage(null);
  };

  const handleSignatureEnd = () => {
    const isEmpty = signatureRef.current?.isEmpty() || false;
    setSignatureEmpty(isEmpty);
    if (!isEmpty) {
      const dataUrl = signatureRef.current?.toDataURL('image/png');
      setSignatureImage(dataUrl || null);
    }
  };

  const handleClearFile = () => {
    setPdfFile(null);
    setPdfBytes(null);
    pdfDocRef.current = null;
    originalPdfBytesRef.current = null;
    setTotalPages(0);
    setCurrentPage(1);
    setSignatureImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!signatureImage) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      xPercent: normalizedPosition.xPercent,
      yPercent: normalizedPosition.yPercent
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || viewportDimensions.width === 0) return;
    
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    
    const deltaXPercent = deltaX / viewportDimensions.width;
    const deltaYPercent = deltaY / viewportDimensions.height;
    
    const newXPercent = Math.max(0, Math.min(1 - normalizedPosition.widthPercent, dragStartRef.current.xPercent + deltaXPercent));
    const newYPercent = Math.max(0, Math.min(1 - normalizedPosition.heightPercent, dragStartRef.current.yPercent + deltaYPercent));
    
    setNormalizedPosition(prev => ({
      ...prev,
      xPercent: newXPercent,
      yPercent: newYPercent
    }));
  }, [isDragging, viewportDimensions, normalizedPosition.widthPercent, normalizedPosition.heightPercent]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const scale = signatureScale[0] / 100;
    const baseWidth = 0.25;
    const baseHeight = 0.1;
    setNormalizedPosition(prev => ({
      ...prev,
      widthPercent: Math.min(1, baseWidth * scale),
      heightPercent: Math.min(1, baseHeight * scale)
    }));
  }, [signatureScale]);

  const handleDownload = async () => {
    if (!originalPdfBytesRef.current || !signatureImage) {
      toast({
        title: 'Missing Requirements',
        description: 'Please upload a PDF and add your signature.',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const pdfDataCopy = new Uint8Array(originalPdfBytesRef.current);
      const pdfDoc = await PDFDocument.load(pdfDataCopy);
      const pages = pdfDoc.getPages();
      const page = pages[currentPage - 1];
      
      const base64Data = signatureImage.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pngImage = await pdfDoc.embedPng(bytes);
      
      const pageHeight = page.getHeight();
      const pageWidth = page.getWidth();
      
      const pdfX = normalizedPosition.xPercent * pageWidth;
      const pdfWidth = normalizedPosition.widthPercent * pageWidth;
      const pdfHeight = normalizedPosition.heightPercent * pageHeight;
      const pdfY = pageHeight - (normalizedPosition.yPercent * pageHeight) - pdfHeight;
      
      page.drawImage(pngImage, {
        x: pdfX,
        y: pdfY,
        width: pdfWidth,
        height: pdfHeight,
      });
      
      const signedPdfBytes = await pdfDoc.save();
      
      const blob = new Blob([signedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfFile?.name.replace('.pdf', '_signed.pdf') || 'signed_document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Success',
        description: 'Signed PDF downloaded successfully!'
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error creating signed PDF:', errorMessage, error);
      toast({
        title: 'Error',
        description: `Failed to create signed PDF: ${errorMessage}`,
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const screenPos = getScreenPosition();

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">PDF Signature Tool</h1>
        <p className="text-gray-500 dark:text-gray-400">Upload a PDF, position your signature, and download the signed document</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                PDF Preview
              </CardTitle>
              {pdfFile && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{pdfFile.name}</span>
                  <Button variant="ghost" size="sm" onClick={handleClearFile}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {!pdfFile ? (
                <div 
                  className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Click to upload PDF</p>
                  <p className="text-sm text-muted-foreground mt-1">or drag and drop</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm">Page {currentPage} of {totalPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                      >
                        Next
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <ZoomOut className="h-4 w-4 text-muted-foreground" />
                      <Slider
                        value={[pdfScale * 100]}
                        onValueChange={(v) => setPdfScale(v[0] / 100)}
                        min={50}
                        max={150}
                        step={10}
                        className="w-24"
                      />
                      <ZoomIn className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  
                  <div 
                    ref={containerRef}
                    className="relative border rounded-lg overflow-auto bg-gray-100 dark:bg-gray-800"
                    style={{ maxHeight: '600px' }}
                  >
                    <canvas ref={canvasRef} className="block" />
                    
                    {signatureImage && viewportDimensions.width > 0 && (
                      <div
                        className={`absolute cursor-move border-2 ${isDragging ? 'border-blue-500' : 'border-dashed border-blue-400'} bg-white/80 rounded flex items-center justify-center`}
                        style={{
                          left: screenPos.x,
                          top: screenPos.y,
                          width: screenPos.width,
                          height: screenPos.height,
                        }}
                        onMouseDown={handleMouseDown}
                      >
                        <img 
                          src={signatureImage} 
                          alt="Signature" 
                          className="max-w-full max-h-full object-contain pointer-events-none"
                          draggable={false}
                        />
                        <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                          <Move className="h-3 w-3" />
                          Drag to position
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Draw Signature</CardTitle>
              <CardDescription>Sign in the box below</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 rounded-lg bg-white overflow-hidden">
                <SignatureCanvas
                  ref={signatureRef}
                  penColor="black"
                  clearOnResize={false}
                  canvasProps={{
                    className: 'w-full',
                    style: { width: '100%', height: '120px', touchAction: 'none' }
                  }}
                  onEnd={handleSignatureEnd}
                />
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleClearSignature}
                className="w-full"
              >
                <Eraser className="h-4 w-4 mr-2" />
                Clear Signature
              </Button>
            </CardContent>
          </Card>

          {signatureImage && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Signature Size</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">Small</span>
                  <Slider
                    value={signatureScale}
                    onValueChange={setSignatureScale}
                    min={50}
                    max={200}
                    step={10}
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground">Large</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {signatureScale[0]}%
                </p>
              </CardContent>
            </Card>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleDownload}
            disabled={isProcessing || !pdfFile || signatureEmpty}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download Signed PDF
              </>
            )}
          </Button>
          
          {!pdfFile && (
            <p className="text-xs text-center text-muted-foreground">
              Upload a PDF to get started
            </p>
          )}
          {pdfFile && signatureEmpty && (
            <p className="text-xs text-center text-muted-foreground">
              Draw your signature above
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
