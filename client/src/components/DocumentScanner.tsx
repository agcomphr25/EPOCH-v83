import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, RotateCcw, Check, Wand2, FileText } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

declare global {
  interface Window {
    cv: any;
  }
}

interface DocumentScannerProps {
  imageData: string;
  onProcessed: (processedFile: File, preview: string) => void;
  onCancel: () => void;
}

type EnhancementMode = 'original' | 'enhanced' | 'grayscale' | 'bw';

export default function DocumentScanner({ imageData, onProcessed, onCancel }: DocumentScannerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cvReady, setCvReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [corners, setCorners] = useState<{ x: number; y: number }[]>([]);
  const [selectedCorner, setSelectedCorner] = useState<number | null>(null);
  const [enhancementMode, setEnhancementMode] = useState<EnhancementMode>('enhanced');
  const [contrast, setContrast] = useState(1.2);
  const [brightness, setBrightness] = useState(10);
  const [autoDetect, setAutoDetect] = useState(true);
  const [outputPdf, setOutputPdf] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadOpenCV();
  }, []);

  const loadOpenCV = async () => {
    if (window.cv && window.cv.Mat) {
      setCvReady(true);
      setIsLoading(false);
      return;
    }

    try {
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
      script.async = true;
      
      script.onload = () => {
        const checkReady = () => {
          if (window.cv && window.cv.Mat) {
            setCvReady(true);
            setIsLoading(false);
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      };
      
      script.onerror = () => {
        setError('Failed to load document scanner. Please try again.');
        setIsLoading(false);
      };
      
      document.head.appendChild(script);
    } catch (err) {
      setError('Failed to initialize document scanner.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (cvReady && imageData) {
      loadImage();
    }
  }, [cvReady, imageData]);

  const loadImage = () => {
    const img = new Image();
    img.onload = () => {
      originalImageRef.current = img;
      initializeCanvas(img);
      if (autoDetect) {
        detectDocumentEdges(img);
      } else {
        setDefaultCorners(img);
      }
    };
    img.src = imageData;
  };

  const initializeCanvas = (img: HTMLImageElement) => {
    if (!canvasRef.current || !overlayCanvasRef.current) return;
    
    const maxWidth = Math.min(500, window.innerWidth - 40);
    const scale = maxWidth / img.width;
    const width = img.width * scale;
    const height = img.height * scale;
    
    canvasRef.current.width = width;
    canvasRef.current.height = height;
    overlayCanvasRef.current.width = width;
    overlayCanvasRef.current.height = height;
    
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
    }
  };

  const setDefaultCorners = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const padding = 20;
    setCorners([
      { x: padding, y: padding },
      { x: canvas.width - padding, y: padding },
      { x: canvas.width - padding, y: canvas.height - padding },
      { x: padding, y: canvas.height - padding },
    ]);
    drawOverlay();
  };

  const detectDocumentEdges = (img: HTMLImageElement) => {
    const cv = window.cv;
    if (!cv || !canvasRef.current) {
      setDefaultCorners(img);
      return;
    }

    try {
      const src = cv.imread(canvasRef.current);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edges = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edges, 75, 200);
      
      const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
      cv.dilate(edges, edges, kernel);
      
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let bestContour: any = null;

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);
        if (area > maxArea) {
          maxArea = area;
          bestContour = contour;
        }
      }

      if (bestContour && maxArea > (canvasRef.current.width * canvasRef.current.height * 0.1)) {
        const peri = cv.arcLength(bestContour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(bestContour, approx, 0.02 * peri, true);

        if (approx.rows === 4) {
          const points: { x: number; y: number }[] = [];
          for (let i = 0; i < 4; i++) {
            points.push({
              x: approx.data32S[i * 2],
              y: approx.data32S[i * 2 + 1],
            });
          }
          
          const sortedPoints = orderPoints(points);
          setCorners(sortedPoints);
          approx.delete();
        } else {
          setDefaultCorners(img);
        }
      } else {
        setDefaultCorners(img);
      }

      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
      kernel.delete();
      
      drawOverlay();
    } catch (err) {
      console.error('Edge detection error:', err);
      setDefaultCorners(img);
    }
  };

  const orderPoints = (pts: { x: number; y: number }[]) => {
    const sorted = [...pts].sort((a, b) => a.y - b.y);
    const topTwo = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottomTwo = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
    
    return [topTwo[0], topTwo[1], bottomTwo[1], bottomTwo[0]];
  };

  const drawOverlay = useCallback(() => {
    const ctx = overlayCanvasRef.current?.getContext('2d');
    if (!ctx || !overlayCanvasRef.current || corners.length !== 4) return;

    ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    corners.forEach((corner, index) => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = selectedCorner === index ? '#3b82f6' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }, [corners, selectedCorner]);

  useEffect(() => {
    drawOverlay();
  }, [corners, drawOverlay]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!overlayCanvasRef.current) return;
    
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    for (let i = 0; i < corners.length; i++) {
      const dx = corners[i].x - x;
      const dy = corners[i].y - y;
      if (Math.sqrt(dx * dx + dy * dy) < 20) {
        setSelectedCorner(i);
        return;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (selectedCorner === null || !overlayCanvasRef.current) return;
    
    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(overlayCanvasRef.current.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(overlayCanvasRef.current.height, e.clientY - rect.top));
    
    const newCorners = [...corners];
    newCorners[selectedCorner] = { x, y };
    setCorners(newCorners);
  };

  const handlePointerUp = () => {
    setSelectedCorner(null);
  };

  const applyPerspectiveTransform = (): HTMLCanvasElement | null => {
    const cv = window.cv;
    if (!cv || !originalImageRef.current || corners.length !== 4) return null;

    const img = originalImageRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const scaleX = img.width / canvas.width;
    const scaleY = img.height / canvas.height;

    const srcCorners = corners.map(c => ({
      x: c.x * scaleX,
      y: c.y * scaleY,
    }));

    const width = Math.max(
      Math.hypot(srcCorners[1].x - srcCorners[0].x, srcCorners[1].y - srcCorners[0].y),
      Math.hypot(srcCorners[2].x - srcCorners[3].x, srcCorners[2].y - srcCorners[3].y)
    );
    const height = Math.max(
      Math.hypot(srcCorners[3].x - srcCorners[0].x, srcCorners[3].y - srcCorners[0].y),
      Math.hypot(srcCorners[2].x - srcCorners[1].x, srcCorners[2].y - srcCorners[1].y)
    );

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;
    tempCtx.drawImage(img, 0, 0);

    const src = cv.imread(tempCanvas);
    const dst = new cv.Mat();

    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      srcCorners[0].x, srcCorners[0].y,
      srcCorners[1].x, srcCorners[1].y,
      srcCorners[2].x, srcCorners[2].y,
      srcCorners[3].x, srcCorners[3].y,
    ]);

    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      width, 0,
      width, height,
      0, height,
    ]);

    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    cv.warpPerspective(src, dst, M, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    applyEnhancement(dst);

    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    cv.imshow(resultCanvas, dst);

    src.delete();
    dst.delete();
    srcPts.delete();
    dstPts.delete();
    M.delete();

    return resultCanvas;
  };

  const applyEnhancement = (mat: any) => {
    const cv = window.cv;
    if (!cv) return;

    switch (enhancementMode) {
      case 'enhanced':
        mat.convertTo(mat, -1, contrast, brightness);
        break;
      case 'grayscale':
        cv.cvtColor(mat, mat, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(mat, mat, cv.COLOR_GRAY2RGBA);
        break;
      case 'bw':
        cv.cvtColor(mat, mat, cv.COLOR_RGBA2GRAY);
        cv.adaptiveThreshold(mat, mat, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 10);
        cv.cvtColor(mat, mat, cv.COLOR_GRAY2RGBA);
        break;
    }
  };

  const updatePreview = useCallback(() => {
    if (!cvReady || corners.length !== 4) return;
    
    const resultCanvas = applyPerspectiveTransform();
    if (!resultCanvas || !previewCanvasRef.current) return;

    const ctx = previewCanvasRef.current.getContext('2d');
    if (!ctx) return;

    const maxHeight = 200;
    const scale = maxHeight / resultCanvas.height;
    const width = resultCanvas.width * scale;
    
    previewCanvasRef.current.width = width;
    previewCanvasRef.current.height = maxHeight;
    ctx.drawImage(resultCanvas, 0, 0, width, maxHeight);
  }, [cvReady, corners, enhancementMode, contrast, brightness]);

  useEffect(() => {
    if (corners.length === 4 && cvReady) {
      const timer = setTimeout(updatePreview, 100);
      return () => clearTimeout(timer);
    }
  }, [corners, enhancementMode, contrast, brightness, updatePreview]);

  const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Blob conversion timed out'));
      }, 10000);
      
      canvas.toBlob((blob) => {
        clearTimeout(timeout);
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      }, type, quality);
    });
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const resultCanvas = applyPerspectiveTransform();
      if (!resultCanvas) throw new Error('Failed to process document. Please adjust corners and try again.');

      let file: File;
      let preview: string;

      if (outputPdf) {
        const pdfDoc = await PDFDocument.create();
        const pngBlob = await canvasToBlob(resultCanvas, 'image/png', 1);
        const imageBytes = new Uint8Array(await pngBlob.arrayBuffer());

        const image = await pdfDoc.embedPng(imageBytes);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });

        const pdfBytes = await pdfDoc.save();
        file = new File([pdfBytes], `scanned-${Date.now()}.pdf`, { type: 'application/pdf' });
        preview = resultCanvas.toDataURL('image/jpeg', 0.8);
      } else {
        const blob = await canvasToBlob(resultCanvas, 'image/jpeg', 0.9);
        file = new File([blob], `scanned-${Date.now()}.jpg`, { type: 'image/jpeg' });
        preview = resultCanvas.toDataURL('image/jpeg', 0.8);
      }

      onProcessed(file, preview);
    } catch (err: any) {
      console.error('Document processing error:', err);
      setError(err.message || 'Failed to process document. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetCorners = () => {
    if (originalImageRef.current && autoDetect) {
      detectDocumentEdges(originalImageRef.current);
    } else if (originalImageRef.current) {
      setDefaultCorners(originalImageRef.current);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4" data-testid="scanner-loading">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-muted-foreground">Loading document scanner...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="document-scanner">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-center" data-testid="scanner-error">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      <div 
        ref={containerRef}
        className="relative mx-auto touch-none"
        style={{ maxWidth: '500px' }}
      >
        <canvas ref={canvasRef} className="w-full rounded-lg" />
        <canvas
          ref={overlayCanvasRef}
          className="absolute top-0 left-0 w-full h-full rounded-lg cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          data-testid="scanner-overlay"
        />
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Drag the corner handles to adjust document boundaries
      </p>

      <div className="bg-muted/50 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-2 justify-center">
          {(['original', 'enhanced', 'grayscale', 'bw'] as EnhancementMode[]).map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={enhancementMode === mode ? 'default' : 'outline'}
              onClick={() => setEnhancementMode(mode)}
              data-testid={`btn-mode-${mode}`}
            >
              {mode === 'original' && 'Original'}
              {mode === 'enhanced' && 'Enhanced'}
              {mode === 'grayscale' && 'Grayscale'}
              {mode === 'bw' && 'Black & White'}
            </Button>
          ))}
        </div>

        {enhancementMode === 'enhanced' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Contrast: {contrast.toFixed(1)}</Label>
              <Slider
                value={[contrast]}
                min={0.5}
                max={2}
                step={0.1}
                onValueChange={([v]) => setContrast(v)}
                data-testid="slider-contrast"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Brightness: {brightness}</Label>
              <Slider
                value={[brightness]}
                min={-50}
                max={50}
                step={5}
                onValueChange={([v]) => setBrightness(v)}
                data-testid="slider-brightness"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-detect"
              checked={autoDetect}
              onCheckedChange={setAutoDetect}
              data-testid="switch-auto-detect"
            />
            <Label htmlFor="auto-detect" className="text-sm">Auto-detect edges</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="output-pdf"
              checked={outputPdf}
              onCheckedChange={setOutputPdf}
              data-testid="switch-output-pdf"
            />
            <Label htmlFor="output-pdf" className="text-sm flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Save as PDF
            </Label>
          </div>
        </div>
      </div>

      {corners.length === 4 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Preview</Label>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2 flex justify-center">
            <canvas ref={previewCanvasRef} className="rounded max-h-[150px]" data-testid="scanner-preview" />
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} data-testid="btn-scanner-cancel">
          Cancel
        </Button>
        <Button variant="outline" onClick={resetCorners} data-testid="btn-scanner-reset">
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
        <Button 
          onClick={handleProcess} 
          disabled={isProcessing || corners.length !== 4} 
          data-testid="btn-scanner-process"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" />
              Apply
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
