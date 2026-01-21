import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PdfCanvasProps {
  pdfUrl: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageDimensions: (dimensions: { width: number; height: number }) => void;
  children?: React.ReactNode;
}

export default function PdfCanvas({
  pdfUrl,
  currentPage,
  onPageChange,
  onPageDimensions,
  children,
}: PdfCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const loadPdf = useCallback(async () => {
    if (!pdfUrl) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
    } catch (err) {
      console.error('[PdfCanvas] Error loading PDF:', err);
      setError('Failed to load PDF');
    } finally {
      setLoading(false);
    }
  }, [pdfUrl]);

  useEffect(() => {
    loadPdf();
  }, [loadPdf]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

    try {
      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const containerWidth = containerRef.current.clientWidth - 40;
      const viewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      canvas.height = scaledViewport.height;
      canvas.width = scaledViewport.width;

      const newDimensions = {
        width: scaledViewport.width,
        height: scaledViewport.height,
      };
      setDimensions(newDimensions);
      onPageDimensions(newDimensions);

      await page.render({
        canvasContext: context,
        viewport: scaledViewport,
        canvas: canvas,
      } as any).promise;
    } catch (err) {
      console.error('[PdfCanvas] Error rendering page:', err);
    }
  }, [pdfDoc, currentPage, onPageDimensions]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  useEffect(() => {
    const handleResize = () => {
      renderPage();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading PDF...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col items-center">
      <div className="flex items-center gap-4 mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm">
          Page {currentPage} of {numPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= numPages}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      
      <div
        className="relative border rounded-lg shadow-lg bg-white"
        style={{ width: dimensions.width, height: dimensions.height }}
      >
        <canvas ref={canvasRef} className="block" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ pointerEvents: 'auto' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
