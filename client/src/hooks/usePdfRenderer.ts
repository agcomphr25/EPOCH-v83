import { useRef, useState, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PdfRendererResult {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  canvasDims: { width: number; height: number };
  totalPages: number;
}

export function usePdfRenderer(pdfUrl: string | null, pageNum: number): PdfRendererResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderIdRef = useRef(0);

  const [canvasDims, setCanvasDims] = useState({ width: 0, height: 0 });
  const [totalPages, setTotalPages] = useState(1);

  const renderPage = useCallback(async (num: number, url: string) => {
    if (!canvasRef.current || !url) return;
    const renderId = ++renderIdRef.current;
    try {
      if (!pdfDocRef.current) {
        pdfDocRef.current = await pdfjsLib.getDocument(url).promise;
        setTotalPages(pdfDocRef.current.numPages);
      }
      if (renderId !== renderIdRef.current) return;
      const page = await pdfDocRef.current.getPage(num);
      if (renderId !== renderIdRef.current) return;

      const containerWidth = containerRef.current?.clientWidth ?? 700;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min((containerWidth - 32) / baseViewport.width, 2);
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setCanvasDims({ width: viewport.width, height: viewport.height });

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('cancel')) console.error('[usePdfRenderer] render error:', err);
    }
  }, []);

  // Reset cached doc only when the PDF source URL changes
  useEffect(() => {
    pdfDocRef.current = null;
  }, [pdfUrl]);

  // Re-render whenever source URL or page number changes
  useEffect(() => {
    if (pdfUrl) {
      renderPage(pageNum, pdfUrl);
    }
  }, [pdfUrl, pageNum, renderPage]);

  return { canvasRef, containerRef, canvasDims, totalPages };
}
